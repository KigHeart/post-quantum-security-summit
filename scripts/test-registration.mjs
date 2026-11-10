import { spawn } from 'node:child_process';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const dataDir = await mkdtemp(join(tmpdir(), 'summit-reg-'));
const port = 18000 + Math.floor(Math.random() * 10000);
const password = 'ci-test-password-that-is-long-enough';
const env = { ...process.env, PORT: String(port), DATA_DIR: dataDir, TRUST_PROXY: '1',
  ADMIN_USER: 'ci-admin', ADMIN_PASSWORD: password };
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

try {
  await wait();
  const health = await (await fetch(base + '/api/health')).json();
  assert.equal(health.ok, true);

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

  const exported = await fetch(base + '/admin/export.csv', { headers: { authorization: auth } });
  assert.equal(exported.status, 200);
  const csv = await exported.text();
  assert.match(csv, /Rate Test 0/);
  assert.match(csv, /Second IP/);
  assert.match(csv, /'=HYPERLINK/);
  assert.doesNotMatch(csv, /spam bot/);
  assert.doesNotMatch(csv, /accessibility/);

  const stored = await readFile(join(dataDir, 'registrations.jsonl'), 'utf8');
  assert.equal(stored.trim().split('\n').length, 10);
  assert.doesNotMatch(stored, /Sensitive accessibility detail/);

  console.log('PASS: validation, bounded abuse controls, CSV safety, authenticated organiser dashboard/list/export, pagination, filters and data minimisation.');
} finally {
  child.kill('SIGTERM');
  await rm(dataDir, { recursive: true, force: true });
}
