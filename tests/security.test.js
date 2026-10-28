'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { startServer, validApplication, postJson } = require('./helpers');

function rawGet(port, path) {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port, path }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    }).on('error', reject);
  });
}

test('secure headers are present on API and static responses', async () => {
  const s = await startServer();
  try {
    for (const path of ['/', '/api/health', '/api/nope']) {
      const r = await fetch(s.base + path);
      const h = r.headers;
      assert.match(h.get('content-security-policy'), /default-src 'self'/, path);
      assert.match(h.get('content-security-policy'), /frame-ancestors 'none'/, path);
      assert.match(h.get('content-security-policy'), /script-src 'self'/, path);
      assert.equal(h.get('x-content-type-options'), 'nosniff', path);
      assert.equal(h.get('x-frame-options'), 'DENY', path);
      assert.equal(h.get('referrer-policy'), 'no-referrer', path);
      assert.equal(h.get('cross-origin-opener-policy'), 'same-origin', path);
      assert.ok(h.get('permissions-policy'), path);
      assert.equal(h.get('x-powered-by'), null, path);
    }
    assert.equal((await fetch(s.base + '/api/health')).headers.get('cache-control'), 'no-store');
    const hsts = await fetch(s.base + '/', { headers: { 'x-forwarded-proto': 'https' } });
    assert.match(hsts.headers.get('strict-transport-security'), /max-age=/);
  } finally { await s.close(); }
});

test('SQL injection in search/filter params is treated as plain text', async () => {
  const s = await startServer({ limits: { max: 10000 } });
  try {
    const payloads = ["' OR '1'='1", "'; DROP TABLE internships; --", '" OR 1=1 --', "x' UNION SELECT * FROM applications --"];
    for (const p of payloads) {
      for (const field of ['q', 'location']) {
        const r = await fetch(`${s.base}/api/internships?${field}=${encodeURIComponent(p)}`);
        assert.equal(r.status, 200, `${field}: ${p}`);
        assert.equal((await r.json()).meta.total, 0, `${field}: ${p}`);
      }
    }
    const after = await (await fetch(`${s.base}/api/internships`)).json();
    assert.equal(after.meta.total, 12, 'table must be untouched');
    assert.equal(s.db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name='applications'").get().n, 1);
  } finally { await s.close(); }
});

test('LIKE wildcards typed by the user are escaped (% and _ match literally)', async () => {
  const s = await startServer({ limits: { max: 10000 } });
  try {
    for (const w of ['%', '_', '%%']) {
      const body = await (await fetch(`${s.base}/api/internships?q=${encodeURIComponent(w)}`)).json();
      assert.equal(body.meta.total, 0, `wildcard ${w}`);
    }
  } finally { await s.close(); }
});

test('SQL text inside the free-text note is stored literally, not executed', async () => {
  const s = await startServer({ limits: { max: 10000, writeMax: 10000 } });
  try {
    const note = "'); DROP TABLE applications; -- please consider my application";
    const r = await postJson(s.base, validApplication({ email: 'sqli@example.com', coverNote: note }));
    assert.equal(r.status, 201);
    const row = s.db.prepare('SELECT cover_note FROM applications WHERE email = ?').get('sqli@example.com');
    assert.equal(row.cover_note, note);
  } finally { await s.close(); }
});

test('SQL injection via the id path segment returns 404', async () => {
  const s = await startServer({ limits: { max: 10000 } });
  try {
    for (const p of ['/api/internships/1%20OR%201=1', '/api/internships/1;DROP%20TABLE%20internships', '/api/internships/abc']) {
      const r = await fetch(s.base + p);
      assert.equal(r.status, 404, p);
    }
  } finally { await s.close(); }
});

test('path traversal cannot read files outside /public', async () => {
  const s = await startServer({ limits: { max: 10000 } });
  try {
    for (const path of ['/..%2f..%2fpackage.json', '/%2e%2e/%2e%2e/package.json', '/../package.json', '/..%2fsrc%2fdb.js', '/%00.html']) {
      const r = await rawGet(s.port, path);
      assert.ok([400, 404].includes(r.status), `${path} -> ${r.status}`);
      assert.doesNotMatch(r.body, /"name": "internship-board"|DatabaseSync/, path);
    }
    const dbFile = await fetch(s.base + '/data/internships.json');
    assert.equal(dbFile.status, 404);
  } finally { await s.close(); }
});

test('malformed JSON returns 400', async () => {
  const s = await startServer({ limits: { max: 10000, writeMax: 10000 } });
  try {
    const r = await postJson(s.base, '{not json');
    assert.equal(r.status, 400);
    assert.equal((await r.json()).error.code, 'INVALID_JSON');
  } finally { await s.close(); }
});

test('non-JSON content type returns 415', async () => {
  const s = await startServer({ limits: { max: 10000, writeMax: 10000 } });
  try {
    const r = await postJson(s.base, 'name=asha', { 'Content-Type': 'text/plain' });
    assert.equal(r.status, 415);
  } finally { await s.close(); }
});

test('oversized request body returns 413', async () => {
  const s = await startServer({ limits: { max: 10000, writeMax: 10000 } });
  try {
    const r = await postJson(s.base, validApplication({ coverNote: 'z'.repeat(11 * 1024) }));
    assert.equal(r.status, 413);
  } finally { await s.close(); }
});

test('overlong URL returns 414', async () => {
  const s = await startServer({ limits: { max: 10000 } });
  try {
    const r = await rawGet(s.port, '/api/internships?q=' + 'a'.repeat(3000));
    assert.equal(r.status, 414);
  } finally { await s.close(); }
});

test('rate limit: submissions are capped and the 429 carries Retry-After', async () => {
  const s = await startServer({ limits: { max: 10000, writeMax: 2, windowMs: 60000 } });
  try {
    assert.equal((await postJson(s.base, validApplication({ email: 'r1@example.com' }))).status, 201);
    assert.equal((await postJson(s.base, validApplication({ email: 'r2@example.com' }))).status, 201);
    const blocked = await postJson(s.base, validApplication({ email: 'r3@example.com' }));
    assert.equal(blocked.status, 429);
    assert.ok(Number(blocked.headers.get('retry-after')) >= 1);
    assert.equal((await blocked.json()).error.code, 'RATE_LIMITED');
  } finally { await s.close(); }
});

test('rate limit: general API cap applies to reads', async () => {
  const s = await startServer({ limits: { max: 3, writeMax: 100 } });
  try {
    const statuses = [];
    for (let i = 0; i < 5; i++) statuses.push((await fetch(s.base + '/api/internships?pageSize=1')).status);
    assert.deepEqual(statuses, [200, 200, 200, 429, 429]);
    const r = await fetch(s.base + '/api/internships?pageSize=1');
    assert.equal(r.headers.get('ratelimit-remaining'), '0');
  } finally { await s.close(); }
});

test('rate limit window resets', async () => {
  const s = await startServer({ limits: { max: 1, windowMs: 300 } });
  try {
    const url = s.base + '/api/internships?pageSize=1';
    assert.equal((await fetch(url)).status, 200);
    assert.equal((await fetch(url)).status, 429);
    await new Promise((r) => setTimeout(r, 400));
    assert.equal((await fetch(url)).status, 200);
  } finally { await s.close(); }
});

test('server errors do not leak internals', async () => {
  const s = await startServer({ limits: { max: 10000 }, logger: { debug() {}, info() {}, warn() {}, error() {} } });
  try {
    s.db.exec('DROP TABLE internships'); // force an unexpected failure
    const r = await fetch(s.base + '/api/internships');
    assert.equal(r.status, 500);
    const text = JSON.stringify(await r.json());
    assert.match(text, /INTERNAL_ERROR/);
    assert.doesNotMatch(text, /sqlite|no such table|internships|at .*\.js/i);
  } finally { await s.close(); }
});

test('failure-simulation switch only works when chaos mode is on', async () => {
  const off = await startServer({ limits: { max: 10000 } });
  const on = await startServer({ chaos: true, limits: { max: 10000 } });
  try {
    assert.equal((await fetch(off.base + '/api/internships?simulate=error')).status, 200);
    assert.equal((await fetch(on.base + '/api/internships?simulate=error')).status, 500);
    const flaky = [];
    for (let i = 0; i < 3; i++) flaky.push((await fetch(on.base + '/api/internships?simulate=flaky')).status);
    assert.deepEqual(flaky, [503, 503, 200]);
  } finally { await off.close(); await on.close(); }
});
