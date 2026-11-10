import { mkdtemp, rm, writeFile, readFile, mkdir, readdir, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';

const dir = await mkdtemp(join(tmpdir(), 'summit-store-check-'));
const verifier = new URL('./verify-registration-store.mjs', import.meta.url);
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const valid = {
  id: '11111111-1111-4111-8111-111111111111',
  receivedAt: '2026-11-10T12:00:00.000Z',
  status: 'Pending review',
  fullName: 'Test Delegate',
  email: 'delegate@example.test',
  organisation: 'Example Organisation',
  country: 'Kenya',
  category: 'Academic / researcher',
  attendance: 'In person',
  consent: true
};
function run(file) { return spawnSync(process.execPath, [verifier.pathname, file], { encoding: 'utf8' }); }
const auditEvent = {
  type: 'status_change', id: '33333333-3333-4333-8333-333333333333',
  registrationId: valid.id, changedAt: '2026-11-10T12:30:00.000Z',
  actor: 'ci-admin', fromStatus: 'Pending review', toStatus: 'Accepted', note: 'Approved in test'
};
const originalStore = JSON.stringify(valid) + '\n' + JSON.stringify(auditEvent) + '\n';

try {
  const good = join(dir, 'good.jsonl');
  await writeFile(good, JSON.stringify(valid) + '\n', { mode: 0o600 });
  const goodResult = run(good);
  assert.equal(goodResult.status, 0, goodResult.stderr);
  assert.match(goodResult.stdout, /verified 1 registration record/);

  const empty = join(dir, 'empty.jsonl');
  await writeFile(empty, '');
  assert.equal(run(empty).status, 0);

  const malformed = join(dir, 'malformed.jsonl');
  await writeFile(malformed, JSON.stringify(valid) + '\nnot-json\n');
  assert.notEqual(run(malformed).status, 0);

  const duplicate = join(dir, 'duplicate.jsonl');
  await writeFile(duplicate, JSON.stringify(valid) + '\n' + JSON.stringify(valid) + '\n');
  assert.notEqual(run(duplicate).status, 0);

  const orphanEvent = join(dir, 'orphan-event.jsonl');
  await writeFile(orphanEvent, JSON.stringify({ ...auditEvent, registrationId: '99999999-9999-4999-8999-999999999999' }) + '\\n');
  assert.notEqual(run(orphanEvent).status, 0);

  const invalidRecord = join(dir, 'invalid.jsonl');
  await writeFile(invalidRecord, JSON.stringify({ ...valid, consent: false }) + '\n');
  assert.notEqual(run(invalidRecord).status, 0);

  // Exercise the real backup and restore scripts against a fake Compose adapter.
  const bin = join(dir, 'bin');
  await mkdir(bin);
  const fakeStore = join(dir, 'volume-store.jsonl');
  await writeFile(fakeStore, JSON.stringify(valid) + '\n', { mode: 0o600 });
  const fakeDocker = join(bin, 'docker');
  const fakeDockerScript = `#!/usr/bin/env bash
set -euo pipefail
[[ "$1" == "compose" ]] || exit 90
shift
case "$1" in
  ps) printf 'summit\\n' ;;
  stop|start) exit 0 ;;
  run)
    shift
    case "$*" in
      *"cat > /data/registrations.jsonl.restore.tmp"*)
        cat > "$FAKE_STORE.restore.tmp"
        mv "$FAKE_STORE.restore.tmp" "$FAKE_STORE"
        ;;
      *"cat /data/registrations.jsonl"*)
        cat "$FAKE_STORE"
        ;;
      *) echo "Unexpected fake compose run command" >&2; exit 91 ;;
    esac
    ;;
  *) echo "Unexpected fake compose action" >&2; exit 92 ;;
esac
`;
  await writeFile(fakeDocker, fakeDockerScript, { mode: 0o700 });
  const fakeEnv = {
    ...process.env,
    PATH: bin + ':' + process.env.PATH,
    FAKE_STORE: fakeStore,
    PRE_RESTORE_BACKUP_DIR: join(dir, 'pre-restore')
  };

  const backupDir = join(dir, 'backups');
  const backupRun = spawnSync('bash', [join(repoRoot, 'scripts/backup-registrations.sh'), backupDir],
    { env: fakeEnv, encoding: 'utf8' });
  assert.equal(backupRun.status, 0, backupRun.stderr + backupRun.stdout);
  const backupFiles = (await readdir(backupDir)).filter(name => name.endsWith('.jsonl'));
  assert.equal(backupFiles.length, 1);
  const backupPath = join(backupDir, backupFiles[0]);
  assert.equal(await readFile(backupPath, 'utf8'), JSON.stringify(valid) + '\n');
  assert.equal((await stat(backupPath)).mode & 0o777, 0o600);

  const restoreRecord = { ...valid, id: '22222222-2222-4222-8222-222222222222', fullName: 'Restored Delegate', email: 'restored@example.test' };
  const restoreSource = join(dir, 'restore-source.jsonl');
  await writeFile(restoreSource, JSON.stringify(restoreRecord) + '\n', { mode: 0o600 });

  const refused = spawnSync('bash', [join(repoRoot, 'scripts/restore-registrations.sh'), restoreSource],
    { env: fakeEnv, encoding: 'utf8' });
  assert.equal(refused.status, 2);
  assert.equal(await readFile(fakeStore, 'utf8'), JSON.stringify(valid) + '\n');

  const restoreRun = spawnSync('bash', [join(repoRoot, 'scripts/restore-registrations.sh'), restoreSource],
    { env: { ...fakeEnv, CONFIRM_RESTORE: 'YES' }, encoding: 'utf8' });
  assert.equal(restoreRun.status, 0, restoreRun.stderr + restoreRun.stdout);
  assert.equal(await readFile(fakeStore, 'utf8'), JSON.stringify(restoreRecord) + '\n');
  const preRestoreFiles = await readdir(join(dir, 'pre-restore'));
  assert.equal(preRestoreFiles.length, 1);
  assert.equal(await readFile(join(dir, 'pre-restore', preRestoreFiles[0]), 'utf8'), JSON.stringify(valid) + '\n');

  console.log('PASS: JSONL integrity checks plus end-to-end backup, explicit restore confirmation, pre-restore snapshot, permissions and byte-for-byte restore verification.');
} finally {
  await rm(dir, { recursive: true, force: true });
}
