# Test Report

- **Result:** PASS
- **Tests run:** 133  |  **Passed:** 133  |  **Failed:** 0
- **Generated:** 2026-10-27T12:22:23.368Z
- **Node:** v22.22.2
- **Command:** `npm run report` (runs the suite below). Performance numbers: `PERFORMANCE_REPORT.md`

## What is covered

| Area | Passing checks |
|---|---|
| Validation, client and server (incl. agreement fixtures) | 53 |
| API behaviour and contract (list, filter, paging, apply, errors, journey) | 21 |
| Security (headers, SQLi, traversal, limits, leaks, proxy) | 19 |
| Operations (health, readiness, request IDs, structured logs) | 9 |
| Performance (gzip, ETag, latency and weight budgets) | 4 |
| Accessibility (contrast, structure, labels, touch targets) | 27 |
| Frontend states and CSP-safety (static checks) | 5 |

> Rows can overlap because a test may match more than one area; the totals above are authoritative.

## Real-browser checks

Run once during development in headless Chromium (Playwright): 30 of 30 checks passed. They cover a CSP-enforced page load with zero
console errors, filters and URL state, pagination, form validation, success, duplicate handling, error / flaky / slow API states,
a 375 px phone layout with 44 px touch targets, dark mode and a keyboard-only flow. The script is `tests/e2e/browser_checks.py`
(optional, needs Python + Playwright) and the screenshots are in `docs/screenshots/`. See `docs/QA.md` for the full checklist,
including the manual screen-reader and Lighthouse steps.

## Raw output

```text
✔ contrast (light): body text on page >= 4.5:1 (4.310165ms)
✔ contrast (light): body text on cards >= 4.5:1 (0.320785ms)
✔ contrast (light): secondary text on page >= 4.5:1 (0.178503ms)
✔ contrast (light): secondary text on cards >= 4.5:1 (0.286142ms)
✔ contrast (light): links and quiet buttons >= 4.5:1 (0.246468ms)
✔ contrast (light): links on page >= 4.5:1 (0.176605ms)
✔ contrast (light): primary button text >= 4.5:1 (0.154656ms)
✔ contrast (light): error text on error background >= 4.5:1 (0.154711ms)
✔ contrast (light): error text on cards >= 4.5:1 (0.53932ms)
✔ contrast (light): focus ring against borders (non-text, 3:1) >= 3:1 (0.639891ms)
✔ contrast (dark): body text on page >= 4.5:1 (0.258276ms)
✔ contrast (dark): body text on cards >= 4.5:1 (0.158943ms)
✔ contrast (dark): secondary text on page >= 4.5:1 (0.171941ms)
✔ contrast (dark): secondary text on cards >= 4.5:1 (0.126192ms)
✔ contrast (dark): links and quiet buttons >= 4.5:1 (0.202884ms)
✔ contrast (dark): links on page >= 4.5:1 (0.112178ms)
✔ contrast (dark): primary button text >= 4.5:1 (0.125945ms)
✔ contrast (dark): error text on error background >= 4.5:1 (0.112604ms)
✔ contrast (dark): error text on cards >= 4.5:1 (2.476061ms)
✔ contrast (dark): focus ring against borders (non-text, 3:1) >= 3:1 (0.140857ms)
✔ contrast: closing-soon chip and deadline chip text (0.212377ms)
✔ document language, title, viewport and landmarks are present (0.614801ms)
✔ exactly one h1; headings do not skip levels (0.367652ms)
✔ every form control has a visible label or aria-label (0.480044ms)
✔ buttons have accessible names and error regions are announced (0.841038ms)
✔ CSS: visible focus, reduced-motion support, 44px touch targets, no zoom-trapping font sizes (3.164583ms)
✔ page uses relative font units for text (respects user font-size settings) (0.224216ms)
✔ GET /api/health returns ok (106.313924ms)
✔ GET /api/internships returns the first page with metadata (24.493299ms)
✔ pagination returns the remaining items on page 2 and none past the end (24.829044ms)
✔ filters: mode, location and text search (38.651885ms)
✔ empty result is a normal 200 with total 0 (14.513176ms)
✔ invalid query parameters return 400 with field errors (16.566308ms)
✔ GET /api/internships/:id works, unknown id is 404 (14.900668ms)
✔ POST valid application returns 201 and stores a row (16.052931ms)
✔ POST invalid application returns 422 with per-field errors (server-side validation) (7.078662ms)
✔ POST duplicate application returns 409 (9.100746ms)
✔ same email may apply to a different internship (21.491439ms)
✔ POST to a missing internship returns 404 (2.683557ms)
✔ wrong methods return 405 with an Allow header (5.753933ms)
✔ unknown API route returns JSON 404 (2.015935ms)
✔ static: index page and assets are served with correct types (24.876343ms)
✔ index.html has no inline scripts, inline styles or inline event handlers (CSP-safe) (1.259396ms)
✔ page has loading, error (with retry), empty and ready states (0.296629ms)
✔ application form has labelled fields, error slots and relies on JS validation (0.182547ms)
✔ app.js never writes HTML from data (XSS guard) (0.2793ms)
✔ app.js uses client validation, aborts stale requests, and never auto-retries POST (0.154492ms)
✔ health: liveness returns status, version and uptime (66.399482ms)
✔ health: readiness proves the database answers and reports 503 when it does not (22.934915ms)
✔ health probes are never rate limited (63.411398ms)
✔ every response carries an X-Request-Id; a sane inbound id is reused, a hostile one is replaced (20.827702ms)
✔ logging: one structured line per request with id, method, path, status and timing (33.000349ms)
✔ logging: business events are logged without personal data (31.602707ms)
✔ logging: 4xx are warnings, 5xx are errors with a stack, rate limits are logged (45.490416ms)
✔ logger respects LOG_LEVEL (0.374558ms)
✔ trust proxy: rate limit keys on the proxy-supplied client IP only when enabled (20.209911ms)
✔ performance: gzip is used for large text responses when the client accepts it (12.083581ms)
✔ performance: static files send an ETag and answer 304 when unchanged (4.950161ms)
✔ performance: list endpoint stays fast and small (45.982205ms)
✔ performance: total first-load weight (HTML+CSS+JS, gzipped) is under 30 KB with no third-party requests (21.146525ms)
✔ seed data: unique ids, valid modes, non-empty fields, skills arrays (2.063841ms)
✔ seed data: deadlines are generated in the future relative to first start (91.202955ms)
✔ API contract: list item and meta shapes are stable (frontend depends on them) (32.194425ms)
✔ API contract: error envelope is always { error: { code, message } } (57.144475ms)
✔ USER JOURNEY: browse -> filter -> open listing -> apply -> duplicate blocked -> still browsable (106.850153ms)
✔ repo hygiene: zero runtime dependencies and no secrets committed (26.622919ms)
✔ secure headers are present on API and static responses (159.029056ms)
✔ SQL injection in search/filter params is treated as plain text (81.263519ms)
✔ LIKE wildcards typed by the user are escaped (% and _ match literally) (24.171557ms)
✔ SQL text inside the free-text note is stored literally, not executed (42.659402ms)
✔ SQL injection via the id path segment returns 404 (17.494669ms)
✔ path traversal cannot read files outside /public (19.761436ms)
✔ malformed JSON returns 400 (14.811019ms)
✔ non-JSON content type returns 415 (10.834973ms)
✔ oversized request body returns 413 (7.243557ms)
✔ overlong URL returns 414 (4.351505ms)
✔ rate limit: submissions are capped and the 429 carries Retry-After (10.379257ms)
✔ rate limit: general API cap applies to reads (15.705019ms)
✔ rate limit window resets (416.379734ms)
✔ server errors do not leak internals (10.547068ms)
✔ failure-simulation switch only works when chaos mode is on (13.947845ms)
✔ server validation: valid application (2.720597ms)
✔ client validation: valid application (0.763358ms)
✔ client and server agree: valid application (0.258003ms)
✔ server validation: name too short (0.21107ms)
✔ client validation: name too short (0.170353ms)
✔ client and server agree: name too short (0.165674ms)
✔ server validation: name with digits and symbols (0.19208ms)
✔ client validation: name with digits and symbols (0.10325ms)
✔ client and server agree: name with digits and symbols (0.36109ms)
✔ server validation: accented name is fine (0.683284ms)
✔ client validation: accented name is fine (0.243463ms)
✔ client and server agree: accented name is fine (0.225723ms)
✔ server validation: email missing @ (0.139845ms)
✔ client validation: email missing @ (0.220733ms)
✔ client and server agree: email missing @ (0.132048ms)
✔ server validation: email with spaces (0.108782ms)
✔ client validation: email with spaces (0.144281ms)
✔ client and server agree: email with spaces (0.109268ms)
✔ server validation: empty email (0.099616ms)
✔ client validation: empty email (0.098651ms)
✔ client and server agree: empty email (0.106661ms)
✔ server validation: school optional and empty (0.105847ms)
✔ client validation: school optional and empty (0.099817ms)
✔ client and server agree: school optional and empty (1.768935ms)
✔ server validation: school too long (0.166805ms)
✔ client validation: school too long (0.166395ms)
✔ client and server agree: school too long (0.116769ms)
✔ server validation: cover note too short (0.136587ms)
✔ client validation: cover note too short (0.105511ms)
✔ client and server agree: cover note too short (0.105613ms)
✔ server validation: cover note too long (0.111553ms)
✔ client validation: cover note too long (0.098814ms)
✔ client and server agree: cover note too long (0.157326ms)
✔ server validation: consent not given (0.126478ms)
✔ client validation: consent not given (0.25271ms)
✔ client and server agree: consent not given (0.098564ms)
✔ server validation: consent as string is rejected (0.065375ms)
✔ client validation: consent as string is rejected (0.058014ms)
✔ client and server agree: consent as string is rejected (0.065864ms)
✔ server validation: internship id not an integer (0.101051ms)
✔ client validation: internship id not an integer (0.094085ms)
✔ client and server agree: internship id not an integer (0.146536ms)
✔ server validation: internship id zero (0.067475ms)
✔ client validation: internship id zero (0.064691ms)
✔ client and server agree: internship id zero (0.0644ms)
✔ server validation: several problems at once (0.075044ms)
✔ client validation: several problems at once (1.605782ms)
✔ client and server agree: several problems at once (0.126567ms)
✔ server rejects unknown fields (mass-assignment guard) (0.337665ms)
✔ server rejects non-object bodies (0.216596ms)
✔ server normalises email and whitespace (0.151954ms)
✔ list query validation (0.76945ms)
ℹ tests 133
ℹ suites 0
ℹ pass 133
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 2743.362944
```
