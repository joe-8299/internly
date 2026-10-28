'use strict';
// Static checks on the browser code. These do not run a browser; they guard the
// properties that the Content-Security-Policy and the task requirements depend on.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (f) => fs.readFileSync(path.join(__dirname, '..', 'public', f), 'utf8');
const html = read('index.html');
const js = read('app.js');

test('index.html has no inline scripts, inline styles or inline event handlers (CSP-safe)', () => {
  assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)[^>]*>/i);
  assert.doesNotMatch(html, /\sstyle\s*=/i);
  assert.doesNotMatch(html, /\son[a-z]+\s*=/i);
});

test('page has loading, error (with retry), empty and ready states', () => {
  for (const id of ['loading', 'error', 'error-message', 'retry', 'empty', 'grid']) {
    assert.match(html, new RegExp(`id="${id}"`), id);
  }
  assert.match(html, /id="status"[^>]*aria-live="polite"/);
  assert.match(html, /id="error"[^>]*role="alert"/);
});

test('application form has labelled fields, error slots and relies on JS validation', () => {
  assert.match(html, /<form id="apply-form" novalidate>/);
  for (const f of ['fullName', 'email', 'school', 'coverNote', 'consent']) {
    assert.match(html, new RegExp(`for="a-${f}"`), `label for ${f}`);
    assert.match(html, new RegExp(`id="err-${f}"`), `error slot for ${f}`);
  }
});

test('app.js never writes HTML from data (XSS guard)', () => {
  for (const bad of ['innerHTML', 'outerHTML', 'insertAdjacentHTML', 'document.write', 'eval(', 'new Function']) {
    assert.ok(!js.includes(bad), `found ${bad}`);
  }
});

test('app.js uses client validation, aborts stale requests, and never auto-retries POST', () => {
  assert.match(js, /Validation\.validateApplication/);
  assert.match(js, /listCtrl\.abort\(\)/);
  assert.match(js, /method === 'GET' \? 2 : 0/);
});
