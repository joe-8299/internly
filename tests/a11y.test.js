'use strict';
// Automated accessibility checks that need no browser: WCAG colour contrast computed from the
// real CSS variables, plus structural checks. This is NOT a replacement for a screen-reader
// pass or Lighthouse/axe; see docs/QA.md for the manual checklist.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (f) => fs.readFileSync(path.join(__dirname, '..', 'public', f), 'utf8');
const css = read('styles.css');
const html = read('index.html');

function vars(block) {
  const out = {};
  for (const m of block.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})/g)) out[m[1]] = m[2];
  return out;
}
const light = vars(css.slice(0, css.indexOf('@media (prefers-color-scheme: dark)')));
const darkBlock = css.slice(css.indexOf('@media (prefers-color-scheme: dark)'), css.indexOf('* { box-sizing'));
const dark = { ...light, ...vars(darkBlock) };

function lum(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function ratio(a, b) {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// [foreground var, background var, minimum ratio, description]
const PAIRS = [
  ['ink', 'paper', 4.5, 'body text on page'],
  ['ink', 'card', 4.5, 'body text on cards'],
  ['muted', 'paper', 4.5, 'secondary text on page'],
  ['muted', 'card', 4.5, 'secondary text on cards'],
  ['accent', 'card', 4.5, 'links and quiet buttons'],
  ['accent', 'paper', 4.5, 'links on page'],
  ['accent-ink', 'accent', 4.5, 'primary button text'],
  ['danger', 'danger-bg', 4.5, 'error text on error background'],
  ['danger', 'card', 4.5, 'error text on cards'],
  ['accent', 'line', 3, 'focus ring against borders (non-text, 3:1)'],
];

for (const [name, theme] of [['light', light], ['dark', dark]]) {
  for (const [fg, bg, min, what] of PAIRS) {
    test(`contrast (${name}): ${what} >= ${min}:1`, () => {
      const r = ratio(theme[fg], theme[bg]);
      assert.ok(r >= min, `${fg} ${theme[fg]} on ${bg} ${theme[bg]} = ${r.toFixed(2)}:1`);
    });
  }
}

test('contrast: closing-soon chip and deadline chip text', () => {
  assert.ok(ratio('#2b1d00', light.pin) >= 4.5);
  assert.ok(ratio(dark.danger, dark['danger-bg']) >= 4.5);
});

test('document language, title, viewport and landmarks are present', () => {
  assert.match(html, /<html lang="en">/);
  assert.match(html, /<title>[^<]{5,}<\/title>/);
  assert.match(html, /name="viewport" content="width=device-width, initial-scale=1"/);
  assert.doesNotMatch(html, /user-scalable=no|maximum-scale=1/, 'zoom must not be disabled');
  for (const tag of ['<header', '<main', '<footer', '<nav']) assert.ok(html.includes(tag), tag);
  assert.match(html, /class="skip" href="#results"/);
});

test('exactly one h1; headings do not skip levels', () => {
  assert.equal((html.match(/<h1[ >]/g) || []).length, 1);
  const levels = [...html.matchAll(/<h([1-6])[ >]/g)].map((m) => Number(m[1]));
  for (let i = 1; i < levels.length; i++) assert.ok(levels[i] - levels[i - 1] <= 1, `jump ${levels[i - 1]}->${levels[i]}`);
});

test('every form control has a visible label or aria-label', () => {
  const controls = [...html.matchAll(/<(input|select|textarea)\b[^>]*>/g)].map((m) => m[0]);
  assert.ok(controls.length >= 8);
  for (const c of controls) {
    const id = (/id="([^"]+)"/.exec(c) || [])[1];
    const labelled = (id && new RegExp(`for="${id}"`).test(html)) || /aria-label=/.test(c) || /<label[^>]*>[\s\S]*?<span>[\s\S]*?<\/span>[\s\S]*?\bid="/.test(html);
    assert.ok(labelled, `unlabelled control: ${c}`);
  }
});

test('buttons have accessible names and error regions are announced', () => {
  for (const m of html.matchAll(/<button\b[^>]*>([\s\S]*?)<\/button>/g)) {
    assert.ok(m[1].trim() || /aria-label=/.test(m[0]), `empty button ${m[0]}`);
  }
  assert.match(html, /id="form-banner"[^>]*role="alert"/);
  assert.match(html, /<dialog id="apply-dialog" aria-labelledby="dialog-title"/);
  const app = read('app.js');
  assert.match(app, /aria-invalid/);
  assert.match(app, /\.focus\(\)/, 'focus is moved on errors and dialog open');
});

test('CSS: visible focus, reduced-motion support, 44px touch targets, no zoom-trapping font sizes', () => {
  assert.match(css, /:focus-visible\s*{[^}]*outline/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /\.btn\s*{[^}]*min-height:\s*44px/);
  assert.match(css, /select, textarea\s*{\s*min-height:\s*44px/);
  // Only <main> (a programmatic focus target with tabindex=-1, never reached by Tab) may hide its outline.
  const removers = [...css.matchAll(/([^{}]+){[^}]*outline:\s*(?:none|0)\b/g)].map((m) => m[1].trim());
  assert.deepEqual(removers.filter((sel) => sel !== 'main'), [], 'outline must not be removed from interactive elements');
  assert.match(css, /@media \(max-width: 640px\)/, 'has a phone layout');
  assert.match(css, /@media \(prefers-color-scheme: dark\)/);
});

test('page uses relative font units for text (respects user font-size settings)', () => {
  assert.doesNotMatch(css, /font-size:\s*\d+px/);
});
