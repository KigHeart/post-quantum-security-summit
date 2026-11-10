import { spawn, spawnSync } from 'node:child_process';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const dataDir = await mkdtemp(join(tmpdir(), 'summit-reg-'));
const port = 18000 + Math.floor(Math.random() * 10000);
const password = 'ci-test-password-that-is-long-enough';
const env = { ...process.env, PORT: String(port), DATA_DIR: dataDir, TRUST_PROXY: '1',
  ADMIN_USER: 'ci-admin', ADMIN_PASSWORD: password, REGISTRATION_OPEN: '1' };
const child = spawn(process.execPath, ['app/server.mjs'], { env, stdio: ['ignore', 'pipe', 'pipe'] });
let logs = '';
child.stdout.on('data', chunk => logs += chunk);
child.stderr.on('data', chunk => logs += chunk);
const base = 'http://127.0.0.1:' + port;
const proxy = ip => ({ 'x-forwarded-for': ip });
const valid = (name = 'CI Test Delegate', email = 'ci@example.test') => ({
  fullName: name, email, organisation: 'Test Organisation', country: 'Kenya',
  category: 'Academic / researcher', attendance: 'In person', consent: true, website: '',
  accessibility: 'Sensitive accessibility detail must not be persisted'
});
async function wait() {
  for (let i = 0; i < 60; i++) {
    if (child.exitCode !== null) throw Error('Server exited: ' + logs);
    try { if ((await fetch(base + '/api/health')).ok) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  throw Error('Server did not become ready: ' + logs);
}
async function post(data, headers = {}) {
  return fetch(base + '/api/registrations', {
    method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(data)
  });
}

// Startup must fail closed on weak/default credentials or unauthenticated public collection.
const weakCredentials = spawnSync(process.execPath, ['app/server.mjs'], {
  env: { ...env, PORT: String(port + 1), ADMIN_USER: 'ci-admin', ADMIN_PASSWORD: 'short', REGISTRATION_OPEN: '0' },
  encoding: 'utf8'
});
assert.equal(weakCredentials.status, 1);
assert.match(weakCredentials.stderr, /at least 32 UTF-8 bytes/);

const exampleCredentials = spawnSync(process.execPath, ['app/server.mjs'], {
  env: { ...env, PORT: String(port + 2), ADMIN_USER: 'summit-admin', ADMIN_PASSWORD: password, REGISTRATION_OPEN: '0' },
  encoding: 'utf8'
});
assert.equal(exampleCredentials.status, 1);
assert.match(exampleCredentials.stderr, /example organiser username/);

const noOrganiserAuth = spawnSync(process.execPath, ['app/server.mjs'], {
  env: { ...env, PORT: String(port + 3), ADMIN_USER: '', ADMIN_PASSWORD: '', REGISTRATION_OPEN: '1' },
  encoding: 'utf8'
});
assert.equal(noOrganiserAuth.status, 1);
assert.match(noOrganiserAuth.stderr, /without organiser authentication/);

try {
  await wait();
  const health = await (await fetch(base + '/api/health')).json();
  assert.equal(health.ok, true);
  assert.equal(health.storage, 'ready');
  assert.equal(health.registrationOpen, true);

  assert.equal((await fetch(base + '/api/registrations', { method: 'POST', body: 'x' })).status, 415);
  assert.equal((await fetch(base + '/api/registrations', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: '{'
  })).status, 400);
  assert.equal((await post({ ...valid(), consent: false }, proxy('203.0.113.1'))).status, 422);
  assert.equal((await post({ ...valid(), category: 'Forged category' }, proxy('203.0.113.2'))).status, 422);

  const honeypot = await post({ ...valid(), website: 'spam bot' }, proxy('203.0.113.3'));
  assert.equal(honeypot.status, 200);

  for (let i = 0; i < 8; i++) {
    const response = await post(valid('Rate Test ' + i, 'rate' + i + '@example.test'), proxy('203.0.113.10'));
    assert.equal(response.status, 201);
  }
  const limited = await post(valid(), proxy('203.0.113.10'));
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get('retry-after'), '3600');
  assert.equal((await post(valid('Second IP', 'second@example.test'), proxy('203.0.113.11'))).status, 201);

  const formulaName = '=HYPERLINK("https://attacker.invalid","open")';
  assert.equal((await post(valid(formulaName, 'formula@example.test'), proxy('203.0.113.13'))).status, 201);

  const oversized = JSON.stringify({ ...valid(), interests: 'x'.repeat(17000) });
  assert.equal((await fetch(base + '/api/registrations', {
    method: 'POST', headers: { 'content-type': 'application/json', ...proxy('203.0.113.12') }, body: oversized
  })).status, 400);

  const auth = 'Basic ' + Buffer.from('ci-admin:' + password).toString('base64');
  assert.equal((await fetch(base + '/admin')).status, 401);
  assert.equal((await fetch(base + '/admin/registrations.json')).status, 401);
  assert.equal((await fetch(base + '/admin.html')).status, 404);

  const dashboard = await fetch(base + '/admin', { headers: { authorization: auth } });
  assert.equal(dashboard.status, 200);
  assert.match(await dashboard.text(), /Delegate dashboard/);

  const listResponse = await fetch(base + '/admin/registrations.json?limit=3', { headers: { authorization: auth } });
  assert.equal(listResponse.status, 200);
  const listing = await listResponse.json();
  assert.equal(listing.total, 10);
  assert.equal(listing.allCount, 10);
  assert.equal(listing.registrations.length, 3);

  const filteredResponse = await fetch(base + '/admin/registrations.json?q=Second%20IP', { headers: { authorization: auth } });
  const filtered = await filteredResponse.json();
  assert.equal(filtered.total, 1);
  assert.equal(filtered.registrations[0].fullName, 'Second IP');

  const badFilter = await fetch(base + '/admin/registrations.json?category=forged', { headers: { authorization: auth } });
  assert.equal(badFilter.status, 400);

  const targetId = filtered.registrations[0].id;
  const statusUrl = base + '/admin/registrations/' + targetId + '/status';
  const statusBody = status => JSON.stringify({ status, note: 'Reviewed by CI test' });
  const noOrigin = await fetch(statusUrl, {
    method: 'POST', headers: { authorization: auth, 'content-type': 'application/json', 'x-admin-action': '1' },
    body: statusBody('Accepted')
  });
  assert.equal(noOrigin.status, 403);
  const foreignOrigin = await fetch(statusUrl, {
    method: 'POST', headers: { authorization: auth, origin: 'https://evil.invalid',
      'content-type': 'application/json', 'x-admin-action': '1' }, body: statusBody('Accepted')
  });
  assert.equal(foreignOrigin.status, 403);
  const invalidStatus = await fetch(statusUrl, {
    method: 'POST', headers: { authorization: auth, origin: base,
      'content-type': 'application/json', 'x-admin-action': '1' }, body: statusBody('Paid')
  });
  assert.equal(invalidStatus.status, 422);

  const accepted = await fetch(statusUrl, {
    method: 'POST', headers: { authorization: auth, origin: base,
      'content-type': 'application/json', 'x-admin-action': '1' }, body: statusBody('Accepted')
  });
  assert.equal(accepted.status, 200);
  assert.equal((await accepted.json()).status, 'Accepted');

  const unchanged = await fetch(statusUrl, {
    method: 'POST', headers: { authorization: auth, origin: base,
      'content-type': 'application/json', 'x-admin-action': '1' }, body: statusBody('Accepted')
  });
  assert.equal((await unchanged.json()).unchanged, true);

  const waitlisted = await fetch(statusUrl, {
    method: 'POST', headers: { authorization: auth, origin: base,
      'content-type': 'application/json', 'x-admin-action': '1' }, body: statusBody('Waitlisted')
  });
  assert.equal((await waitlisted.json()).status, 'Waitlisted');

  const updatedResponse = await fetch(base + '/admin/registrations.json?q=Second%20IP', { headers: { authorization: auth } });
  const updated = await updatedResponse.json();
  assert.equal(updated.registrations[0].status, 'Waitlisted');
  assert.equal(updated.registrations[0].statusHistory.length, 2);
  assert.equal(updated.registrations[0].statusHistory[0].actor, 'ci-admin');
  assert.equal(updated.registrations[0].statusHistory[0].note, 'Reviewed by CI test');

  const exported = await fetch(base + '/admin/export.csv', { headers: { authorization: auth } });
  assert.equal(exported.status, 200);
  const csv = await exported.text();
  assert.match(csv, /Rate Test 0/);
  assert.match(csv, /Second IP/);
  assert.match(csv, /Waitlisted/);
  assert.match(csv, /'=HYPERLINK/);
  assert.doesNotMatch(csv, /spam bot/);
  assert.doesNotMatch(csv, /accessibility/);

  const stored = await readFile(join(dataDir, 'registrations.jsonl'), 'utf8');
  assert.equal(stored.trim().split('\n').length, 12);
  const storedEntries = stored.trim().split('\n').map(line => JSON.parse(line));
  const auditEntries = storedEntries.filter(entry => entry.type === 'status_change');
  assert.equal(auditEntries.length, 2);
  assert.equal(auditEntries[0].fromStatus, 'Pending review');
  assert.equal(auditEntries[1].fromStatus, 'Accepted');
  assert.doesNotMatch(stored, /Sensitive accessibility detail/);


  // A deployed server must remain closed unless the organiser explicitly opens it.
  const closedDataDir = await mkdtemp(join(tmpdir(), 'summit-reg-closed-'));
  const closedPort = 18000 + Math.floor(Math.random() * 10000);
  const closedBase = 'http://127.0.0.1:' + closedPort;
  const closedChild = spawn(process.execPath, ['app/server.mjs'], {
    env: { ...env, PORT: String(closedPort), DATA_DIR: closedDataDir, REGISTRATION_OPEN: '0' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let closedLogs = '';
  closedChild.stdout.on('data', chunk => closedLogs += chunk);
  closedChild.stderr.on('data', chunk => closedLogs += chunk);
  try {
    let ready = false;
    for (let i = 0; i < 60; i++) {
      if (closedChild.exitCode !== null) throw Error('Closed server exited: ' + closedLogs);
      try {
        const response = await fetch(closedBase + '/api/health');
        if (response.ok) { ready = true; break; }
      } catch {}
      await new Promise(resolve => setTimeout(resolve, 150));
    }
    assert.equal(ready, true, 'Closed server did not become ready: ' + closedLogs);
    const closedHealth = await (await fetch(closedBase + '/api/health')).json();
    assert.equal(closedHealth.registrationOpen, false);
    assert.equal(closedHealth.storage, 'ready');
    const rejected = await fetch(closedBase + '/api/registrations', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(valid())
    });
    assert.equal(rejected.status, 503);
    await assert.rejects(readFile(join(closedDataDir, 'registrations.jsonl')), { code: 'ENOENT' });
  } finally {
    closedChild.kill('SIGTERM');
    await rm(closedDataDir, { recursive: true, force: true });
  }


  // A healthy process must not advertise readiness when its data path is not writable.
  const blockedRoot = await mkdtemp(join(tmpdir(), 'summit-reg-storage-'));
  const blockedPath = join(blockedRoot, 'not-a-directory');
  await writeFile(blockedPath, 'file blocks directory creation');
  const blockedPort = 18000 + Math.floor(Math.random() * 10000);
  const blockedBase = 'http://127.0.0.1:' + blockedPort;
  const blockedChild = spawn(process.execPath, ['app/server.mjs'], {
    env: { ...env, PORT: String(blockedPort), DATA_DIR: blockedPath, REGISTRATION_OPEN: '0' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let blockedLogs = '';
  blockedChild.stdout.on('data', chunk => blockedLogs += chunk);
  blockedChild.stderr.on('data', chunk => blockedLogs += chunk);
  try {
    let unavailable = false;
    for (let i = 0; i < 60; i++) {
      if (blockedChild.exitCode !== null) throw Error('Storage-probe server exited: ' + blockedLogs);
      try {
        const response = await fetch(blockedBase + '/api/health');
        if (response.status === 503) {
          const result = await response.json();
          assert.equal(result.ok, false);
          assert.equal(result.storage, 'unavailable');
          unavailable = true;
          break;
        }
      } catch {}
      await new Promise(resolve => setTimeout(resolve, 150));
    }
    assert.equal(unavailable, true, 'Server did not report unavailable storage.');
  } finally {
    blockedChild.kill('SIGTERM');
    await rm(blockedRoot, { recursive: true, force: true });
  }

  console.log('PASS: storage readiness, release gate, authenticated dashboard, same-origin audited status changes, validation, CSV safety, backups and data minimisation.');
} finally {
  child.kill('SIGTERM');
  await rm(dataDir, { recursive: true, force: true });
}
