# Performance Report

Generated 2026-10-27T12:22:28.293Z on Node v22.22.2. Command: `npm run perf`.
Load: 3000 requests per endpoint, 25 concurrent connections, single Node process, in-memory SQLite, loopback network.
These numbers show the app has no accidental slow paths. They are **not** a prediction for your host: free hosting tiers are slower and add network latency.

## Throughput and latency

| Endpoint | Requests | Failures | Req/s | p50 (ms) | p95 (ms) | p99 (ms) |
|---|---|---|---|---|---|---|
| `/api/internships?pageSize=6` | 3000 | 0 | 1352 | 15.1 | 35.3 | 68.6 |
| `/api/internships?q=sql&type=remote` | 3000 | 0 | 2233 | 8.6 | 24.4 | 64.9 |
| `/api/ready` | 3000 | 0 | 4761 | 4.7 | 8.4 | 10.0 |
| `/app.js` | 3000 | 0 | 5668 | 3.1 | 7.3 | 18.3 |

## First-load weight

| File | Raw (bytes) | Gzip (bytes) |
|---|---|---|
| `/` | 5617 | 1809 |
| `/styles.css` | 6740 | 2194 |
| `/validation.js` | 2594 | 1028 |
| `/app.js` | 15274 | 5002 |
| `/favicon.svg` | 241 | 241 |
| **Total** | **30466** | **10274** |

- API list response (6 items, gzip): 998 bytes
- Third-party requests: 0 (no fonts, CDNs or analytics)
- Caching: static files send an ETag and revalidate with 304; API responses are `no-store`
- Budget enforced by `npm test`: first load under 30 KB gzipped, list p95 under 100 ms

## Optimisations in place
- gzip for text responses over 1 KB (cached per file for static assets)
- ETag / 304 for static files
- SQLite indexes on `mode` and `(deadline, id)`; page size capped at 50; prepared statements
- No framework, no build step, no web fonts: nothing blocks first paint
- Skeleton placeholders reserve layout space, so the page does not jump when data arrives
