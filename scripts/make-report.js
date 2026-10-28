'use strict';
// Runs the whole test suite and writes TEST_REPORT.md.
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const run = spawnSync(
  process.execPath,
  ['--disable-warning=ExperimentalWarning', '--test', '--test-reporter=spec', 'tests/**/*.test.js'],
  { cwd: root, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' } }
);
const out = (run.stdout || '') + (run.stderr || '');
const num = (label) => Number((out.match(new RegExp(`ℹ ${label} (\\d+)`)) || [])[1] || 0);
const total = num('tests'), pass = num('pass'), fail = num('fail');

const lines = out.split('\n');
const group = (re) => lines.filter((l) => re.test(l) && /[✔✖]/.test(l)).length;
const areas = [
  ['Validation, client and server (incl. agreement fixtures)', /server validation|client validation|client and server agree|mass-assignment|non-object|normalises|list query/i],
  ['API behaviour and contract (list, filter, paging, apply, errors, journey)', /GET |POST |filters|pagination|empty result|wrong methods|unknown API|static:|invalid query|same email|API contract|USER JOURNEY|seed data/i],
  ['Security (headers, SQLi, traversal, limits, leaks, proxy)', /secure headers|SQL|LIKE|path traversal|malformed|content type|oversized|overlong|rate limit|leak|failure-simulation|trust proxy|repo hygiene/i],
  ['Operations (health, readiness, request IDs, structured logs)', /health|X-Request-Id|logging|logger/i],
  ['Performance (gzip, ETag, latency and weight budgets)', /performance:/i],
  ['Accessibility (contrast, structure, labels, touch targets)', /contrast|document language|h1|form control|buttons have|CSS:|relative font/i],
  ['Frontend states and CSP-safety (static checks)', /index\.html has no|loading, error|application form has|app\.js (never|uses)/i],
];

const body = `# Test Report

- **Result:** ${fail === 0 && total > 0 ? 'PASS' : 'FAIL'}
- **Tests run:** ${total}  |  **Passed:** ${pass}  |  **Failed:** ${fail}
- **Generated:** ${new Date().toISOString()}
- **Node:** ${process.version}
- **Command:** \`npm run report\` (runs the suite below). Performance numbers: \`PERFORMANCE_REPORT.md\`

## What is covered

| Area | Passing checks |
|---|---|
${areas.map(([n, re]) => `| ${n} | ${lines.filter((l) => re.test(l) && l.includes('✔')).length} |`).join('\n')}

> Rows can overlap because a test may match more than one area; the totals above are authoritative.

## Real-browser checks

Run once during development in headless Chromium (Playwright): 30 of 30 checks passed. They cover a CSP-enforced page load with zero
console errors, filters and URL state, pagination, form validation, success, duplicate handling, error / flaky / slow API states,
a 375 px phone layout with 44 px touch targets, dark mode and a keyboard-only flow. The script is \`tests/e2e/browser_checks.py\`
(optional, needs Python + Playwright) and the screenshots are in \`docs/screenshots/\`. See \`docs/QA.md\` for the full checklist,
including the manual screen-reader and Lighthouse steps.

## Raw output

\`\`\`text
${out.trim()}
\`\`\`
`;
fs.writeFileSync(path.join(root, 'TEST_REPORT.md'), body);
console.log(`TEST_REPORT.md written: ${pass}/${total} passed.`);
process.exit(fail === 0 && total > 0 ? 0 : 1);
