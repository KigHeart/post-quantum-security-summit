import http from 'node:http';
import { isIP } from 'node:net';
import { readFile, appendFile, mkdir, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { randomUUID, timingSafeEqual } from 'node:crypto';

const ROOT = resolve(process.env.SITE_DIR || process.cwd());
const DATA_DIR = resolve(process.env.DATA_DIR || './data');
const DATA_FILE = resolve(DATA_DIR, 'registrations.jsonl');
const PORT = Number(process.env.PORT || 8080);
const ADMIN_USER = process.env.ADMIN_USER || '';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const TRUST_PROXY = process.env.TRUST_PROXY === '1';
const MAX_BODY = 16 * 1024;
const MAX_RATE_KEYS = 5000;
const rate = new Map();
let rateChecks = 0;
const CATEGORIES = new Set([
  'Industry / datacentre professional', 'Government / public sector',
  'Academic / researcher', 'Student', 'Speaker / invited guest',
  'Technology partner / sponsor enquiry', 'Other'
]);
const ATTENDANCE = new Set(['In person', 'Remote participation interest', 'Not yet decided']);
const mime = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp'
};

function send(res, status, body, type = 'application/json; charset=utf-8') {
  res.writeHead(status, {
    'Content-Type': type, 'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-Frame-Options': 'DENY', 'Cache-Control': 'no-store',
    'Content-Security-Policy': "default-src 'self' https://fonts.googleapis.com https://fonts.gstatic.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; script-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'"
  });
  res.end(body);
}
function json(res, status, obj) { send(res, status, JSON.stringify(obj)); }
function clean(v, max) {
  return typeof v === 'string' ? v.trim().replace(/[\u0000-\u001f\u007f]/g, '').slice(0, max) : '';
}
function csv(v) {
  const value = String(v ?? '');
  // Spreadsheet programs may execute cells beginning with formula operators.
  // Prefix an apostrophe after any leading whitespace to force text treatment.
  const safe = /^[\s]*[=+\-@]/.test(value) ? "'" + value : value;
  return '"' + safe.replace(/"/g, '""') + '"';
}
function authorized(req) {
  if (!ADMIN_USER || !ADMIN_PASSWORD) return false;
  const h = req.headers.authorization || '';
  if (!h.startsWith('Basic ')) return false;
  let decoded;
  try { decoded = Buffer.from(h.slice(6), 'base64').toString(); } catch { return false; }
  const i = decoded.indexOf(':');
  if (i < 0) return false;
  const user = Buffer.from(decoded.slice(0, i)), pass = Buffer.from(decoded.slice(i + 1));
  const expectedUser = Buffer.from(ADMIN_USER), expectedPass = Buffer.from(ADMIN_PASSWORD);
  return user.length === expectedUser.length && pass.length === expectedPass.length
    && timingSafeEqual(user, expectedUser) && timingSafeEqual(pass, expectedPass);
}
async function body(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw Error('Request too large');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
function clientIp(req) {
  if (TRUST_PROXY) {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string') {
      const candidates = forwarded.split(',').map(x => x.trim()).reverse();
      const trustedHop = candidates.find(value => isIP(value));
      if (trustedHop) return trustedHop;
    }
  }
  return req.socket.remoteAddress || 'unknown';
}
function limited(req) {
  const ip = clientIp(req), now = Date.now();

  // Periodically discard expired clients so abandoned IPs cannot grow memory forever.
  if ((++rateChecks & 255) === 0) {
    for (const [key, timestamps] of rate) {
      const active = timestamps.filter(t => now - t < 3600000);
      if (active.length) rate.set(key, active);
      else rate.delete(key);
    }
  }

  const recent = (rate.get(ip) || []).filter(t => now - t < 3600000);
  if (recent.length >= 8) { rate.set(ip, recent); return true; }
  recent.push(now);

  // Keep the in-memory limiter bounded even during high-cardinality abuse.
  if (!rate.has(ip) && rate.size >= MAX_RATE_KEYS) {
    const oldest = rate.keys().next().value;
    if (oldest !== undefined) rate.delete(oldest);
  }
  rate.set(ip, recent);
  return false;
}

const server = http.createServer(async (req, res) => {
  let url;
  try { url = new URL(req.url, 'http://localhost'); }
  catch { return json(res, 400, { error: 'Invalid request URL.' }); }

  if (req.method === 'GET' && url.pathname === '/api/health') {
    return json(res, 200, { ok: true, service: 'summit-registration', storage: 'local' });
  }

  if (req.method === 'POST' && url.pathname === '/api/registrations') {
    if (limited(req)) {
      res.setHeader('Retry-After', '3600');
      return json(res, 429, { error: 'Too many attempts. Please try again later.' });
    }
    if (!req.headers['content-type']?.toLowerCase().includes('application/json')) {
      return json(res, 415, { error: 'Expected JSON submission.' });
    }
    let data;
    try { data = await body(req); }
    catch (error) {
      return json(res, 400, { error: error.message === 'Request too large' ? 'Request too large.' : 'Invalid submission.' });
    }
    if (!data || typeof data !== 'object' || Array.isArray(data)) return json(res, 400, { error: 'Invalid submission.' });
    if (clean(data.website, 200)) return json(res, 200, { ok: true });

    const record = {
      id: randomUUID(), receivedAt: new Date().toISOString(), status: 'Pending review',
      fullName: clean(data.fullName, 120), email: clean(data.email, 254),
      phone: clean(data.phone, 40), organisation: clean(data.organisation, 160),
      jobTitle: clean(data.jobTitle, 120), country: clean(data.country, 100),
      category: clean(data.category, 80), attendance: clean(data.attendance, 60),
      interests: clean(data.interests, 2000), accessibility: clean(data.accessibility, 1000),
      consent: data.consent === true
    };
    if (!record.fullName || !/^\S+@\S+\.\S+$/.test(record.email) || !record.organisation
      || !record.country || !CATEGORIES.has(record.category) || !ATTENDANCE.has(record.attendance)
      || !record.consent) {
      return json(res, 422, { error: 'Please complete all required fields and consent.' });
    }
    try {
      await mkdir(DATA_DIR, { recursive: true, mode: 0o700 });
      await appendFile(DATA_FILE, JSON.stringify(record) + '\n', { encoding: 'utf8', mode: 0o600 });
    } catch (error) {
      console.error('Storage error:', error.message);
      return json(res, 503, { error: 'Registration storage is temporarily unavailable. Please contact the organiser.' });
    }
    console.log('Registration received:', record.id);
    return json(res, 201, { ok: true, id: record.id, status: record.status });
  }

  if (req.method === 'GET' && url.pathname === '/admin/export.csv') {
    if (!authorized(req)) {
      res.setHeader('WWW-Authenticate', 'Basic realm="Summit organiser", charset="UTF-8"');
      return json(res, 401, { error: 'Organiser authentication required.' });
    }
    try {
      const raw = await readFile(DATA_FILE, 'utf8');
      const rows = raw.split('\n').filter(Boolean).map(line => JSON.parse(line));
      const keys = ['id', 'receivedAt', 'status', 'fullName', 'email', 'phone', 'organisation',
        'jobTitle', 'country', 'category', 'attendance', 'interests', 'accessibility', 'consent'];
      const output = [keys.join(','), ...rows.map(row => keys.map(key => csv(row[key])).join(','))].join('\r\n');
      res.writeHead(200, {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="summit-delegate-registrations.csv"',
        'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff'
      });
      return res.end(output);
    } catch (error) {
      if (error.code === 'ENOENT') {
        return send(res, 200, 'id,receivedAt,status,fullName,email,phone,organisation,jobTitle,country,category,attendance,interests,accessibility,consent\r\n', 'text/csv; charset=utf-8');
      }
      return json(res, 500, { error: 'Could not export registrations.' });
    }
  }

  if (req.method === 'GET') {
    let pathname;
    try { pathname = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname); }
    catch { return json(res, 400, { error: 'Invalid path encoding.' }); }
    const file = resolve(ROOT, '.' + pathname);
    if (file !== ROOT && !file.startsWith(ROOT + sep)) return json(res, 403, { error: 'Forbidden.' });
    try {
      const info = await stat(file);
      if (!info.isFile()) return json(res, 404, { error: 'Not found.' });
      return send(res, 200, await readFile(file), mime[extname(file)] || 'application/octet-stream');
    } catch { return json(res, 404, { error: 'Not found.' }); }
  }
  return json(res, 405, { error: 'Method not allowed.' });
});

server.requestTimeout = 15000;
server.headersTimeout = 10000;
server.keepAliveTimeout = 5000;
server.listen(PORT, '0.0.0.0', () => console.log('Summit registration server listening on ' + PORT));
