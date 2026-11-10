import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';

const file = process.argv[2];
if (!file) {
  console.error('Usage: node scripts/verify-registration-store.mjs <registrations.jsonl>');
  process.exit(2);
}

const statuses = new Set(['Pending review', 'Accepted', 'Waitlisted', 'Declined']);
const registrationIds = new Set();
const eventIds = new Set();
const currentStatuses = new Map();
let count = 0;
let lineNumber = 0;
let invalid = false;

try {
  const lines = createInterface({ input: createReadStream(file), crlfDelay: Infinity });
  for await (const line of lines) {
    lineNumber++;
    if (!line.trim()) continue;
    let record;
    try { record = JSON.parse(line); }
    catch {
      console.error(`Invalid JSON at line ${lineNumber}.`);
      invalid = true;
      continue;
    }
    if (!record || typeof record !== 'object' || Array.isArray(record)) {
      console.error(`Invalid record shape at line ${lineNumber}.`);
      invalid = true;
      continue;
    }

    if (record.type === 'status_change') {
      const validEvent = typeof record.id === 'string' && record.id.trim()
        && typeof record.registrationId === 'string' && record.registrationId.trim()
        && typeof record.changedAt === 'string' && Number.isFinite(Date.parse(record.changedAt))
        && typeof record.actor === 'string' && record.actor.trim()
        && statuses.has(record.fromStatus) && statuses.has(record.toStatus)
        && (record.note === undefined || typeof record.note === 'string');
      if (!validEvent || eventIds.has(record.id) || !registrationIds.has(record.registrationId)
        || currentStatuses.get(record.registrationId) !== record.fromStatus) {
        console.error(`Invalid or inconsistent status audit event at line ${lineNumber}.`);
        invalid = true;
        continue;
      }
      eventIds.add(record.id);
      currentStatuses.set(record.registrationId, record.toStatus);
      continue;
    }

    const requiredStrings = ['id', 'receivedAt', 'status', 'fullName', 'email', 'organisation',
      'country', 'category', 'attendance'];
    const missing = requiredStrings.filter(key => typeof record[key] !== 'string' || !record[key].trim());
    if (record.type !== undefined || missing.length || !/^\S+@\S+\.\S+$/.test(record.email || '')
      || !Number.isFinite(Date.parse(record.receivedAt)) || record.consent !== true
      || !statuses.has(record.status)) {
      console.error(`Invalid registration fields at line ${lineNumber}.`);
      invalid = true;
      continue;
    }
    if (registrationIds.has(record.id) || eventIds.has(record.id)) {
      console.error(`Duplicate record ID at line ${lineNumber}.`);
      invalid = true;
      continue;
    }
    registrationIds.add(record.id);
    currentStatuses.set(record.id, record.status);
    count++;
  }
} catch (error) {
  console.error('Could not read registration store:', error.message);
  process.exit(1);
}

if (invalid) process.exit(1);
console.log(`PASS: verified ${count} registration record(s) and ${eventIds.size} status audit event(s); no malformed, duplicate or inconsistent entries found.`);
