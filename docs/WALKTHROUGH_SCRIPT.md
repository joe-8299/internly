# Walkthrough video: script (about 4 minutes)

Record with Loom, OBS, Zoom or your phone's screen recorder. Upload to YouTube (Unlisted) or Loom, and paste the link in
`README.md` and `SUBMISSION.md`. Open the live site once beforehand so it is awake.

| Time | Show | Say (in your own words) |
|---|---|---|
| 0:00 | Live URL in the browser | "This is PinBoard, an internship board. I built the frontend, backend, tests and deployment." |
| 0:20 | Scroll the list; type `sql`; show the URL changing; refresh | "Search and filters live in the URL, so a view can be shared. Closing-soon badges help students prioritise." |
| 0:50 | Resize to phone width or open on a phone; tap Apply | "On a phone the form is a bottom sheet with large touch targets." |
| 1:20 | Submit the empty form, then fill and submit | "Validation runs in the browser for speed and again on the server for safety. Success shows a confirmation and the card says Applied." |
| 1:50 | Apply again with the same email | "The server rejects duplicates and the message appears on the right field." |
| 2:10 | Local terminal: `npm run demo:failures`, open `?simulate=error` then `?simulate=flaky` | "If the API fails, users see a clear message and a retry button. A flaky API recovers automatically." |
| 2:40 | `/api/ready`, then the terminal log lines | "Health and readiness endpoints for the host, and structured logs with a request id. No personal data in logs." |
| 3:10 | `npm test` output; open `TEST_REPORT.md`, `PERFORMANCE_REPORT.md`, `SECURITY_CHECKLIST.md` | "133 tests: validation, security, accessibility, performance. CI runs them on every push." |
| 3:40 | `docs/PRODUCT_NOTES.md` roadmap | "Next I would add employer accounts, email confirmation and a persistent database." |
| 3:55 | End | Thank the viewer. |

Tips: zoom the browser to 125%, close other tabs, keep your voice steady, and do not read the script word for word.
