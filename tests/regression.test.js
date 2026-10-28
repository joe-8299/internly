'use strict';
// Regression guards: API contract shape, seed-data integrity and one full user journey.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { startServer, validApplication, postJson } = require('./helpers');

const seed = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'internships.json'), 'utf8'));

test('seed data: unique ids, valid modes, non-empty fields, skills arrays', () => {
  assert.ok(seed.length >= 10);
  assert.equal(new Set(seed.map((r) => r.id)).size, seed.length);
  for (const r of seed) {
    assert.ok(['remote', 'hybrid', 'onsite'].includes(r.mode), `mode of ${r.id}`);
    for (const k of ['title', 'company', 'location', 'category', 'stipend', 'description']) assert.ok(String(r[k]).length > 0, `${k} of ${r.id}`);
    assert.ok(Array.isArray(r.skills) && r.skills.length > 0, `skills of ${r.id}`);
    assert.ok(Number.isInteger(r.durationWeeks) && r.durationWeeks > 0);
    assert.ok(Number.isInteger(r.closesInDays) && r.closesInDays > 0, 'relative deadlines keep a fresh deploy from looking stale');
  }
});

test('seed data: deadlines are generated in the future relative to first start', async () => {
  const s = await startServer({ limits: { max: 10000 } });
  try {
    const body = await (await fetch(s.base + '/api/internships?pageSize=50')).json();
    const today = new Date().toISOString().slice(0, 10);
    assert.ok(body.data.every((i) => /^\d{4}-\d{2}-\d{2}$/.test(i.deadline) && i.deadline > today));
    const dates = body.data.map((i) => i.deadline);
    assert.deepEqual(dates, [...dates].sort(), 'list is ordered by closing date');
  } finally { await s.close(); }
});

const TYPES = { id: 'number', title: 'string', company: 'string', location: 'string', mode: 'string', category: 'string', stipend: 'string', durationWeeks: 'number', deadline: 'string', description: 'string', skills: 'object' };

test('API contract: list item and meta shapes are stable (frontend depends on them)', async () => {
  const s = await startServer({ limits: { max: 10000 } });
  try {
    const body = await (await fetch(s.base + '/api/internships')).json();
    assert.deepEqual(Object.keys(body).sort(), ['data', 'meta']);
    assert.deepEqual(Object.keys(body.meta).sort(), ['page', 'pageSize', 'total', 'totalPages']);
    for (const item of body.data) {
      assert.deepEqual(Object.keys(item).sort(), Object.keys(TYPES).sort());
      for (const [k, t] of Object.entries(TYPES)) assert.equal(typeof item[k], t, k);
    }
    const one = await (await fetch(s.base + '/api/internships/1')).json();
    assert.deepEqual(Object.keys(one.data).sort(), Object.keys(TYPES).sort());
  } finally { await s.close(); }
});

test('API contract: error envelope is always { error: { code, message } }', async () => {
  const s = await startServer({ limits: { max: 10000, writeMax: 10000 } });
  try {
    const responses = [
      await fetch(s.base + '/api/nope'),
      await fetch(s.base + '/api/internships?page=0'),
      await postJson(s.base, { nope: true }),
      await postJson(s.base, '{bad'),
    ];
    for (const r of responses) {
      const b = await r.json();
      assert.ok(r.status >= 400);
      assert.deepEqual(Object.keys(b), ['error']);
      assert.equal(typeof b.error.code, 'string');
      assert.equal(typeof b.error.message, 'string');
    }
  } finally { await s.close(); }
});

test('USER JOURNEY: browse -> filter -> open listing -> apply -> duplicate blocked -> still browsable', async () => {
  const s = await startServer({ limits: { max: 10000, writeMax: 10000 } });
  try {
    const home = await fetch(s.base + '/');
    assert.equal(home.status, 200);
    const all = await (await fetch(s.base + '/api/internships?pageSize=6')).json();
    assert.equal(all.data.length, 6);

    const filtered = await (await fetch(s.base + '/api/internships?type=remote&q=node')).json();
    assert.ok(filtered.data.length >= 1);
    const target = filtered.data[0];

    const detail = await (await fetch(`${s.base}/api/internships/${target.id}`)).json();
    assert.equal(detail.data.title, target.title);

    const bad = await postJson(s.base, validApplication({ internshipId: target.id, email: 'journey', coverNote: 'short' }));
    assert.equal(bad.status, 422);
    const fields = (await bad.json()).error.fields;
    assert.ok(fields.email && fields.coverNote);

    const ok = await postJson(s.base, validApplication({ internshipId: target.id, email: 'journey@example.com' }));
    assert.equal(ok.status, 201);
    const dupe = await postJson(s.base, validApplication({ internshipId: target.id, email: 'journey@example.com' }));
    assert.equal(dupe.status, 409);
    assert.ok((await dupe.json()).error.fields.email);

    const after = await fetch(s.base + '/api/internships');
    assert.equal(after.status, 200);
    assert.equal(s.db.prepare('SELECT COUNT(*) AS n FROM applications').get().n, 1);
  } finally { await s.close(); }
});

test('repo hygiene: zero runtime dependencies and no secrets committed', () => {
  const pkg = require('../package.json');
  assert.equal(Object.keys(pkg.dependencies || {}).length, 0);
  assert.equal(Object.keys(pkg.devDependencies || {}).length, 0);
  const secretLike = /(api[_-]?key|secret|password|token)\s*[:=]\s*['"][A-Za-z0-9_\-]{16,}['"]|-----BEGIN [A-Z ]*PRIVATE KEY-----|AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{30,}/i;
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) =>
    ['node_modules', '.git'].includes(e.name) ? [] : e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
  for (const f of walk(path.join(__dirname, '..'))) {
    if (/\.(sqlite|zip|png|jpg)$/.test(f) || f.endsWith('regression.test.js')) continue;
    assert.doesNotMatch(fs.readFileSync(f, 'utf8'), secretLike, `possible secret in ${path.relative(path.join(__dirname, '..'), f)}`);
  }
});
