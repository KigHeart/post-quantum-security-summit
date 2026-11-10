import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';

const file = process.argv[2];
if (!file) {
  console.error('Usage: node scripts/verify-registration-store.mjs <registrations.jsonl>');
  process.exit(2);
}

const requiredStrings = ['id', 'receivedAt', 'status', 'fullName', 'email', 'organisation',
  'country', 'category', 'attendance'];
const ids = new Set();
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
    const missing = requiredStrings.filter(key => typeof record[key] !== 'string' || !record[key].trim());
    if (missing.length || !/^\S+@\S+\.\S+$/.test(record.email || '')
      || !Number.isFinite(Date.parse(record.receivedAt)) || record.consent !== true) {
      console.error(`Invalid required fields at line ${lineNumber}.`);
      invalid = true;
      continue;
    }
    if (ids.has(record.id)) {
      console.error(`Duplicate submission ID at line ${lineNumber}.`);
      invalid = true;
      continue;
    }
    ids.add(record.id);
    count++;
  }
} catch (error) {
  console.error('Could not read registration store:', error.message);
  process.exit(1);
}

if (invalid) process.exit(1);
console.log(`PASS: verified ${count} registration record(s); no malformed or duplicate records found.`);
