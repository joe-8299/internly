'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const zlib = require('node:zlib');
const http = require('node:http');
const { startServer, validApplication, postJson } = require('./helpers');
const { createLogger } = require('../src/logger');

function capture(level = 'debug') {
  const lines = [];
  return { lines, logger: createLogger({ level, write: (l) => lines.push(JSON.parse(l)) }) };
}
const BIG = { max: 10000, writeMax: 10000 };

test('health: liveness returns status, version and uptime', async () => {
  const s = await startServer({ limits: BIG });
  try {
    const r = await fetch(s.base + '/api/health');
    const b = await r.json();
    assert.equal(r.status, 200);
    assert.equal(b.status, 'ok');
    assert.match(b.version, /^\d+\.\d+\.\d+$/);
    assert.ok(b.uptimeSeconds >= 0);
  } finally { await s.close(); }
});

test('health: readiness proves the database answers and reports 503 when it does not', async () => {
  const { logger, lines } = capture();
  const s = await startServer({ limits: BIG, logger });
  try {
    const ok = await fetch(s.base + '/api/ready');
    assert.equal(ok.status, 200);
    assert.deepEqual((await ok.json()).checks, { database: 'ok', internships: 12 });
    s.db.exec('DROP TABLE applications; DROP TABLE internships;');
    const bad = await fetch(s.base + '/api/ready');
    assert.equal(bad.status, 503);
    const body = await bad.json();
    assert.equal(body.status, 'unavailable');
    assert.doesNotMatch(JSON.stringify(body), /no such table|sqlite/i);
    assert.ok(lines.some((l) => l.level === 'error' && l.msg === 'readiness check failed'));
  } finally { await s.close(); }
});

test('health probes are never rate limited', async () => {
  const s = await startServer({ limits: { max: 2 } });
  try {
    for (let i = 0; i < 10; i++) assert.equal((await fetch(s.base + '/api/health')).status, 200);
    for (let i = 0; i < 10; i++) assert.equal((await fetch(s.base + '/api/ready')).status, 200);
  } finally { await s.close(); }
});

test('every response carries an X-Request-Id; a sane inbound id is reused, a hostile one is replaced', async () => {
  const s = await startServer({ limits: BIG });
  try {
    const a = await fetch(s.base + '/api/health');
    assert.match(a.headers.get('x-request-id'), /^[0-9a-f-]{36}$/);
    const b = await fetch(s.base + '/api/health', { headers: { 'x-request-id': 'trace-abc-12345' } });
    assert.equal(b.headers.get('x-request-id'), 'trace-abc-12345');
    const c = await fetch(s.base + '/api/health', { headers: { 'x-request-id': 'bad id with spaces <script>' } });
    assert.match(c.headers.get('x-request-id'), /^[0-9a-f-]{36}$/);
  } finally { await s.close(); }
});

test('logging: one structured line per request with id, method, path, status and timing', async () => {
  const { logger, lines } = capture();
  const s = await startServer({ limits: BIG, logger });
  try {
    const r = await fetch(s.base + '/api/internships?q=secret-search-term');
    await r.text();
    await new Promise((x) => setTimeout(x, 20));
    const entry = lines.find((l) => l.event === 'request' && l.path === '/api/internships');
    assert.ok(entry, 'request line exists');
    assert.equal(entry.method, 'GET');
    assert.equal(entry.status, 200);
    assert.equal(entry.requestId, r.headers.get('x-request-id'));
    assert.equal(typeof entry.ms, 'number');
    assert.equal(entry.level, 'info');
    assert.ok(!JSON.stringify(lines).includes('secret-search-term'), 'query strings are not logged');
  } finally { await s.close(); }
});

test('logging: business events are logged without personal data', async () => {
  const { logger, lines } = capture();
  const s = await startServer({ limits: BIG, logger });
  try {
    const r = await postJson(s.base, validApplication({ email: 'private.person@example.com', fullName: 'Private Person' }));
    assert.equal(r.status, 201);
    await new Promise((x) => setTimeout(x, 20));
    const ev = lines.find((l) => l.event === 'application_created');
    assert.ok(ev && ev.applicationId > 0 && ev.internshipId === 1);
    const all = JSON.stringify(lines);
    for (const pii of ['private.person', 'Private Person', 'I enjoy building']) assert.ok(!all.includes(pii), `log leaked: ${pii}`);
  } finally { await s.close(); }
});

test('logging: 4xx are warnings, 5xx are errors with a stack, rate limits are logged', async () => {
  const { logger, lines } = capture();
  const s = await startServer({ limits: { max: 10000, writeMax: 1 }, logger });
  try {
    await fetch(s.base + '/api/nope');
    await postJson(s.base, validApplication({ email: 'l1@example.com' }));
    await postJson(s.base, validApplication({ email: 'l2@example.com' }));
    s.db.exec('DROP TABLE applications; DROP TABLE internships;');
    await fetch(s.base + '/api/internships');
    await new Promise((x) => setTimeout(x, 30));
    assert.ok(lines.some((l) => l.event === 'request' && l.status === 404 && l.level === 'warn'));
    assert.ok(lines.some((l) => l.event === 'rate_limited' && l.scope === 'applications'));
    const err = lines.find((l) => l.msg === 'unhandled error');
    assert.ok(err && err.err.stack && err.requestId);
  } finally { await s.close(); }
});

test('logger respects LOG_LEVEL', () => {
  const out = [];
  const log = createLogger({ level: 'warn', write: (l) => out.push(l) });
  log.debug('d'); log.info('i'); log.warn('w'); log.error('e');
  assert.equal(out.length, 2);
});

test('trust proxy: rate limit keys on the proxy-supplied client IP only when enabled', async () => {
  const trusted = await startServer({ limits: { max: 1 }, trustProxy: true });
  const untrusted = await startServer({ limits: { max: 1 } });
  try {
    const hit = (base, ip) => fetch(base + '/api/internships?pageSize=1', { headers: { 'x-forwarded-for': `1.1.1.1, ${ip}` } }).then((r) => r.status);
    assert.equal(await hit(trusted.base, '9.9.9.1'), 200);
    assert.equal(await hit(trusted.base, '9.9.9.2'), 200, 'different client IP gets its own bucket');
    assert.equal(await hit(trusted.base, '9.9.9.1'), 429);
    assert.equal(await hit(untrusted.base, '9.9.9.1'), 200);
    assert.equal(await hit(untrusted.base, '9.9.9.2'), 429, 'spoofed header is ignored when proxy is not trusted');
  } finally { await trusted.close(); await untrusted.close(); }
});

// ---- performance-related behaviour ----
function rawRequest(port, path, headers = {}) {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port, path, headers }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    }).on('error', reject);
  });
}

test('performance: gzip is used for large text responses when the client accepts it', async () => {
  const s = await startServer({ limits: BIG });
  try {
    const plain = await rawRequest(s.port, '/app.js');
    const gz = await rawRequest(s.port, '/app.js', { 'accept-encoding': 'gzip' });
    assert.equal(plain.headers['content-encoding'], undefined);
    assert.equal(gz.headers['content-encoding'], 'gzip');
    assert.ok(gz.body.length < plain.body.length * 0.6, 'gzip should shrink the script substantially');
    assert.equal(zlib.gunzipSync(gz.body).toString(), plain.body.toString());
    const json = await rawRequest(s.port, '/api/internships', { 'accept-encoding': 'gzip' });
    assert.equal(json.headers['content-encoding'], 'gzip');
    assert.equal(JSON.parse(zlib.gunzipSync(json.body)).meta.total, 12);
  } finally { await s.close(); }
});

test('performance: static files send an ETag and answer 304 when unchanged', async () => {
  const s = await startServer({ limits: BIG });
  try {
    const first = await rawRequest(s.port, '/styles.css');
    assert.ok(first.headers.etag);
    const second = await rawRequest(s.port, '/styles.css', { 'if-none-match': first.headers.etag });
    assert.equal(second.status, 304);
    assert.equal(second.body.length, 0);
  } finally { await s.close(); }
});

test('performance: list endpoint stays fast and small', async () => {
  const s = await startServer({ limits: BIG });
  try {
    const times = [];
    for (let i = 0; i < 40; i++) {
      const t0 = performance.now();
      const r = await rawRequest(s.port, '/api/internships?pageSize=6', { 'accept-encoding': 'gzip' });
      times.push(performance.now() - t0);
      assert.equal(r.status, 200);
      assert.ok(r.body.length < 4096, `gzipped list payload is ${r.body.length} bytes`);
    }
    times.sort((a, b) => a - b);
    assert.ok(times[Math.floor(times.length * 0.95)] < 100, `p95 ${times[Math.floor(times.length * 0.95)].toFixed(1)}ms should be under 100ms`);
  } finally { await s.close(); }
});

test('performance: total first-load weight (HTML+CSS+JS, gzipped) is under 30 KB with no third-party requests', async () => {
  const s = await startServer({ limits: BIG });
  try {
    let total = 0;
    for (const p of ['/', '/styles.css', '/validation.js', '/app.js', '/favicon.svg']) {
      const r = await rawRequest(s.port, p, { 'accept-encoding': 'gzip' });
      total += r.body.length;
    }
    assert.ok(total < 30 * 1024, `first-load weight is ${total} bytes`);
    const html = (await rawRequest(s.port, '/')).body.toString();
    assert.doesNotMatch(html, /(src|href)="https?:\/\//i, 'no external resources');
  } finally { await s.close(); }
});
