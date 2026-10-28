'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const server = require('../src/validate');
const client = require('../public/validation.js');
const cases = require('./fixtures/application-cases.json');
const { validApplication } = require('./helpers');

function build(c) {
  const input = validApplication(c.input);
  if (c.schoolLength) input.school = 'x'.repeat(c.schoolLength);
  if (c.coverNoteLength) input.coverNote = 'y'.repeat(c.coverNoteLength);
  return input;
}
const expected = (c) => (c.expectInvalid || c.invalid).slice().sort();

for (const c of cases) {
  test(`server validation: ${c.name}`, () => {
    const r = server.validateApplication(build(c));
    assert.deepEqual(Object.keys(r.errors || {}).sort(), expected(c));
    assert.equal(r.ok, expected(c).length === 0);
  });

  test(`client validation: ${c.name}`, () => {
    const r = client.validateApplication(build(c));
    assert.deepEqual(Object.keys(r.errors).sort(), expected(c));
    assert.equal(r.ok, expected(c).length === 0);
  });

  test(`client and server agree: ${c.name}`, () => {
    const s = server.validateApplication(build(c));
    const k = client.validateApplication(build(c));
    assert.deepEqual(Object.keys(s.errors || {}).sort(), Object.keys(k.errors).sort());
  });
}

test('server rejects unknown fields (mass-assignment guard)', () => {
  const r = server.validateApplication(validApplication({ role: 'admin' }));
  assert.equal(r.ok, false);
  assert.ok(r.errors.role);
});

test('server rejects non-object bodies', () => {
  for (const body of [null, 'text', 42, [1, 2]]) {
    assert.equal(server.validateApplication(body).ok, false);
  }
});

test('server normalises email and whitespace', () => {
  const r = server.validateApplication(validApplication({ email: '  ASHA@Example.COM ', fullName: '  Asha    Raman ' }));
  assert.equal(r.values.email, 'asha@example.com');
  assert.equal(r.values.fullName, 'Asha Raman');
});

test('list query validation', () => {
  const ok = server.validateListQuery(new URLSearchParams('q=sql&type=remote&page=2&pageSize=5'));
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.values, { q: 'sql', type: 'remote', location: '', page: 2, pageSize: 5 });
  for (const bad of ['page=0', 'page=abc', 'page=-1', 'pageSize=500', 'type=moon', `q=${'a'.repeat(81)}`]) {
    assert.equal(server.validateListQuery(new URLSearchParams(bad)).ok, false, bad);
  }
});
