import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';

const dir = await mkdtemp(join(tmpdir(), 'summit-store-check-'));
const verifier = new URL('./verify-registration-store.mjs', import.meta.url);
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

  const invalidRecord = join(dir, 'invalid.jsonl');
  await writeFile(invalidRecord, JSON.stringify({ ...valid, consent: false }) + '\n');
  assert.notEqual(run(invalidRecord).status, 0);

  console.log('PASS: registration-store verifier accepts valid/empty stores and rejects malformed, duplicate-ID and invalid-consent records.');
} finally {
  await rm(dir, { recursive: true, force: true });
}
