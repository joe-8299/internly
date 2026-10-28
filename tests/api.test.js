'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer, validApplication, postJson } = require('./helpers');

let s;
test.before(async () => { s = await startServer({ limits: { max: 10000, writeMax: 10000 } }); });
test.after(async () => { await s.close(); });

const get = async (p) => { const r = await fetch(s.base + p); return { r, body: await r.json() }; };

test('GET /api/health returns ok', async () => {
  const { r, body } = await get('/api/health');
  assert.equal(r.status, 200);
  assert.equal(body.status, 'ok');
});

test('GET /api/internships returns the first page with metadata', async () => {
  const { r, body } = await get('/api/internships');
  assert.equal(r.status, 200);
  assert.equal(body.meta.total, 12);
  assert.equal(body.data.length, 9);
  assert.equal(body.meta.totalPages, 2);
  const item = body.data[0];
  for (const k of ['id', 'title', 'company', 'location', 'mode', 'category', 'stipend', 'durationWeeks', 'deadline', 'description', 'skills']) {
    assert.ok(k in item, `missing ${k}`);
  }
  assert.ok(Array.isArray(item.skills));
});

test('pagination returns the remaining items on page 2 and none past the end', async () => {
  const p2 = await get('/api/internships?page=2');
  assert.equal(p2.body.data.length, 3);
  const p9 = await get('/api/internships?page=9');
  assert.equal(p9.body.data.length, 0);
});

test('filters: mode, location and text search', async () => {
  const remote = await get('/api/internships?type=remote');
  assert.ok(remote.body.data.length > 0 && remote.body.data.every((i) => i.mode === 'remote'));
  const loc = await get('/api/internships?location=chennai');
  assert.ok(loc.body.data.length > 0 && loc.body.data.every((i) => i.location === 'Chennai'));
  const q = await get('/api/internships?q=figma');
  assert.ok(q.body.data.length >= 2);
  const combined = await get('/api/internships?q=figma&type=remote');
  assert.ok(combined.body.data.every((i) => i.mode === 'remote' && i.skills.includes('Figma')));
});

test('empty result is a normal 200 with total 0', async () => {
  const { r, body } = await get('/api/internships?q=zzzzzz');
  assert.equal(r.status, 200);
  assert.equal(body.meta.total, 0);
  assert.deepEqual(body.data, []);
});

test('invalid query parameters return 400 with field errors', async () => {
  const { r, body } = await get('/api/internships?page=abc&type=moon');
  assert.equal(r.status, 400);
  assert.equal(body.error.code, 'INVALID_QUERY');
  assert.ok(body.error.fields.page && body.error.fields.type);
});

test('GET /api/internships/:id works, unknown id is 404', async () => {
  const ok = await get('/api/internships/1');
  assert.equal(ok.r.status, 200);
  assert.equal(ok.body.data.id, 1);
  const missing = await get('/api/internships/9999');
  assert.equal(missing.r.status, 404);
  assert.equal(missing.body.error.code, 'NOT_FOUND');
});

test('POST valid application returns 201 and stores a row', async () => {
  const r = await postJson(s.base, validApplication({ email: 'ok1@example.com' }));
  assert.equal(r.status, 201);
  const body = await r.json();
  assert.ok(body.data.id > 0);
  const row = s.db.prepare('SELECT * FROM applications WHERE id = ?').get(body.data.id);
  assert.equal(row.email, 'ok1@example.com');
  assert.equal(row.internship_id, 1);
});

test('POST invalid application returns 422 with per-field errors (server-side validation)', async () => {
  const r = await postJson(s.base, { internshipId: 1, fullName: '', email: 'bad', coverNote: 'short', consent: false });
  assert.equal(r.status, 422);
  const body = await r.json();
  assert.equal(body.error.code, 'VALIDATION_FAILED');
  assert.deepEqual(Object.keys(body.error.fields).sort(), ['consent', 'coverNote', 'email', 'fullName']);
});

test('POST duplicate application returns 409', async () => {
  const first = await postJson(s.base, validApplication({ email: 'dupe@example.com' }));
  assert.equal(first.status, 201);
  const second = await postJson(s.base, validApplication({ email: 'dupe@example.com' }));
  assert.equal(second.status, 409);
  assert.equal((await second.json()).error.code, 'DUPLICATE_APPLICATION');
});

test('same email may apply to a different internship', async () => {
  const a = await postJson(s.base, validApplication({ email: 'multi@example.com', internshipId: 2 }));
  const b = await postJson(s.base, validApplication({ email: 'multi@example.com', internshipId: 3 }));
  assert.equal(a.status, 201);
  assert.equal(b.status, 201);
});

test('POST to a missing internship returns 404', async () => {
  const r = await postJson(s.base, validApplication({ internshipId: 9999, email: 'ghost@example.com' }));
  assert.equal(r.status, 404);
});

test('wrong methods return 405 with an Allow header', async () => {
  const r1 = await fetch(s.base + '/api/internships', { method: 'POST' });
  assert.equal(r1.status, 405);
  assert.equal(r1.headers.get('allow'), 'GET');
  const r2 = await fetch(s.base + '/api/applications');
  assert.equal(r2.status, 405);
  assert.equal(r2.headers.get('allow'), 'POST');
});

test('unknown API route returns JSON 404', async () => {
  const { r, body } = await get('/api/nope');
  assert.equal(r.status, 404);
  assert.equal(body.error.code, 'NOT_FOUND');
});

test('static: index page and assets are served with correct types', async () => {
  const html = await fetch(s.base + '/');
  assert.equal(html.status, 200);
  assert.match(html.headers.get('content-type'), /text\/html/);
  assert.match(await html.text(), /PinBoard/);
  for (const [p, type] of [['/app.js', /javascript/], ['/styles.css', /css/], ['/validation.js', /javascript/]]) {
    const r = await fetch(s.base + p);
    assert.equal(r.status, 200, p);
    assert.match(r.headers.get('content-type'), type);
  }
});
