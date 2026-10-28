# QA Evidence: accessibility, performance, security, regression

Everything marked **Automated** is re-run by `npm test` / `npm run qa`. Items marked **Manual** are for you to do once and tick
(I could not do them for you: they need a screen reader or your deployed URL).

## 1. Regression
| Check | Type | Result |
|---|---|---|
| 133 unit/API/security/a11y tests (`npm test`) | Automated | Pass (see `TEST_REPORT.md`) |
| API contract: list/detail/error shapes are locked by tests, so UI and API cannot drift | Automated | Pass |
| Seed-data integrity (unique ids, valid modes, relative deadlines) | Automated | Pass |
| Full user journey over HTTP: browse, filter, detail, invalid apply, apply, duplicate | Automated | Pass |
| Client and server validation agree on 16 shared fixtures | Automated | Pass |
| GitHub Actions runs the suite on every push and pull request | Automated | `.github/workflows/ci.yml` |
| 30 real-browser checks (headless Chromium): filters, URL state, paging, form, errors, failures, mobile, keyboard | Automated, optional | 30/30 at build time (`tests/e2e/browser_checks.py`) |

## 2. Accessibility
Automated (no browser needed, `tests/a11y.test.js`):

| Pair | Light | Dark | Requirement |
|---|---|---|---|
| Body text on page | 16.0:1 | 16.3:1 | 4.5:1 |
| Secondary text on cards | 6.0:1 | 6.7:1 | 4.5:1 |
| Links / quiet buttons | 7.3:1 | 8.1:1 | 4.5:1 |
| Primary button text | 7.3:1 | 8.0:1 | 4.5:1 |
| Error text | 5.7:1 | 7.6:1 | 4.5:1 |

Also checked automatically: `lang`, page title, zoom not disabled, one `h1` and no skipped heading levels, landmarks (header, main, nav, footer),
a skip link, every control labelled, no empty buttons, `aria-live` status, `role="alert"` errors, `aria-invalid` on bad fields, focus moved to the first
error and into the dialog, visible focus ring, reduced-motion support, 44 px touch targets, relative font sizes.

Real browser (30 checks): first Tab stop is the skip link; Apply buttons reachable by keyboard; Enter opens the dialog; Escape closes it;
no horizontal scroll at 375 px; inputs are 16 px; zero console errors with the strict Content-Security-Policy enforced.

**Manual: do once (about 15 minutes)** and tick:
- [ ] Chrome DevTools > Lighthouse > Accessibility on the live URL (mobile and desktop). Score: ____ / ____
- [ ] Install the free **axe DevTools** extension, scan the home page and the open dialog. Serious/critical issues: ____
- [ ] Screen reader pass (NVDA on Windows, free; or TalkBack on Android): listings are announced, the form fields have names, errors are read aloud
- [ ] Zoom to 200% and 400%: nothing is cut off or overlaps
- [ ] Tab through the whole page with the mouse unplugged: order is logical, focus is always visible
- [ ] Windows High Contrast / forced colours: text and buttons remain visible

Known gap: no full audit with real assistive-technology users yet.

## 3. Performance
Full numbers in `PERFORMANCE_REPORT.md` (`npm run perf`). Highlights from the build run, single Node process on loopback:
the list endpoint handles over 1,000 requests/s with p95 around 35 ms; `/api/ready` and static files p95 under 10 ms. Numbers vary a little between runs. First load is under 30 KB gzipped
with zero third-party requests, so there are no render-blocking fonts or scripts.

Tests enforce the budgets: first load < 30 KB gzipped, list p95 < 100 ms, list payload < 4 KB gzipped, gzip and 304 caching work.

**Manual:**
- [ ] Lighthouse > Performance on the live URL (mobile). Score: ____ ; LCP: ____ s ; CLS: ____ (expect about 0)
- [ ] Throttle to "Fast 4G" in DevTools > Network and reload: listings appear while skeletons keep the layout stable

Free hosting note: the first request after idle can take 30-50 s while the service wakes. That is the host, not the app.

## 4. Security
Full checklist in `SECURITY_CHECKLIST.md`. Automated tests cover: secure headers on every response, SQL injection through every input
(query, path, body), LIKE-wildcard escaping, path traversal, malformed JSON, wrong content type, oversized body and URL, rate limits (general, submissions,
window reset), proxy-IP spoofing, no leaked internals on 500, no personal data in logs, no committed secrets, zero third-party dependencies.

**Manual:**
- [ ] Paste your live URL into https://securityheaders.com and https://observatory.mozilla.org. Grades: ____ / ____ (HSTS shows once the host serves HTTPS)

## 5. Operations
- [x] Structured JSON logs with request ids, no PII (tested)
- [x] `/api/health` (liveness) and `/api/ready` (readiness, 503 when the database fails): tested
- [x] Graceful shutdown on SIGINT/SIGTERM; unhandled errors are logged with stack traces
- [x] Docker `HEALTHCHECK`, Render `healthCheckPath`
