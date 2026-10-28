'use strict';
// Simple, dependency-free load test against an in-process server. Writes PERFORMANCE_REPORT.md.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const zlib = require('node:zlib');
const { openDb } = require('../src/db');
const { createApp } = require('../src/app');

const TOTAL = 3000;
const CONCURRENCY = 25;

const agent = new http.Agent({ keepAlive: true, maxSockets: CONCURRENCY });
function get(port, p, gzip = true) {
  return new Promise((resolve, reject) => {
    const t0 = performance.now();
    http.get({ host: '127.0.0.1', port, path: p, headers: gzip ? { 'accept-encoding': 'gzip' } : {}, agent }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ ms: performance.now() - t0, status: res.statusCode, bytes: Buffer.concat(chunks).length }));
    }).on('error', reject);
  });
}
const pct = (arr, p) => arr[Math.min(arr.length - 1, Math.floor(arr.length * p))];

async function load(port, p) {
  const times = [];
  let bad = 0;
  let next = 0;
  const t0 = performance.now();
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    while (next++ < TOTAL) {
      const r = await get(port, p);
      if (r.status !== 200) bad++;
      times.push(r.ms);
    }
  }));
  const secs = (performance.now() - t0) / 1000;
  times.sort((a, b) => a - b);
  return { path: p, requests: times.length, failures: bad, rps: Math.round(times.length / secs), p50: pct(times, 0.5), p95: pct(times, 0.95), p99: pct(times, 0.99) };
}

(async () => {
  const db = openDb(':memory:');
  const server = createApp({ db, limits: { max: 1e9, writeMax: 1e9 } });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address();

  const rows = [];
  for (const p of ['/api/internships?pageSize=6', '/api/internships?q=sql&type=remote', '/api/ready', '/app.js']) rows.push(await load(port, p));

  const weights = [];
  for (const p of ['/', '/styles.css', '/validation.js', '/app.js', '/favicon.svg']) {
    const raw = await get(port, p, false);
    const gz = await get(port, p, true);
    weights.push({ path: p, raw: raw.bytes, gzip: gz.bytes });
  }
  const list = await get(port, '/api/internships?pageSize=6', true);
  agent.destroy();
  server.closeAllConnections?.();
  await new Promise((r) => server.close(r));
  db.close();

  const f = (n) => n.toFixed(1);
  const totRaw = weights.reduce((a, w) => a + w.raw, 0);
  const totGz = weights.reduce((a, w) => a + w.gzip, 0);
  const md = `# Performance Report

Generated ${new Date().toISOString()} on Node ${process.version}. Command: \`npm run perf\`.
Load: ${TOTAL} requests per endpoint, ${CONCURRENCY} concurrent connections, single Node process, in-memory SQLite, loopback network.
These numbers show the app has no accidental slow paths. They are **not** a prediction for your host: free hosting tiers are slower and add network latency.

## Throughput and latency

| Endpoint | Requests | Failures | Req/s | p50 (ms) | p95 (ms) | p99 (ms) |
|---|---|---|---|---|---|---|
${rows.map((r) => `| \`${r.path}\` | ${r.requests} | ${r.failures} | ${r.rps} | ${f(r.p50)} | ${f(r.p95)} | ${f(r.p99)} |`).join('\n')}

## First-load weight

| File | Raw (bytes) | Gzip (bytes) |
|---|---|---|
${weights.map((w) => `| \`${w.path}\` | ${w.raw} | ${w.gzip} |`).join('\n')}
| **Total** | **${totRaw}** | **${totGz}** |

- API list response (6 items, gzip): ${list.bytes} bytes
- Third-party requests: 0 (no fonts, CDNs or analytics)
- Caching: static files send an ETag and revalidate with 304; API responses are \`no-store\`
- Budget enforced by \`npm test\`: first load under 30 KB gzipped, list p95 under 100 ms

## Optimisations in place
- gzip for text responses over 1 KB (cached per file for static assets)
- ETag / 304 for static files
- SQLite indexes on \`mode\` and \`(deadline, id)\`; page size capped at 50; prepared statements
- No framework, no build step, no web fonts: nothing blocks first paint
- Skeleton placeholders reserve layout space, so the page does not jump when data arrives
`;
  fs.writeFileSync(path.join(__dirname, '..', 'PERFORMANCE_REPORT.md'), md);
  console.log(md.split('\n').slice(5, 14).join('\n'));
  console.log('PERFORMANCE_REPORT.md written.');
})();
