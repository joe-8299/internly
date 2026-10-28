# Submission checklist

**One link to submit:** the GitHub repository URL (everything below lives inside it).

| Required | Where |
|---|---|
| Live application | `PASTE-YOUR-LIVE-URL-HERE`, also at the top of `README.md` (deploy steps: `docs/DEPLOYMENT.md`) |
| GitHub repository | this repo |
| Test evidence | `TEST_REPORT.md`, `PERFORMANCE_REPORT.md`, `docs/QA.md`, `SECURITY_CHECKLIST.md`, GitHub Actions run |
| Walkthrough video | `PASTE-YOUR-VIDEO-URL-HERE` (script: `docs/WALKTHROUGH_SCRIPT.md`) |

## Pass steps
- [x] **Polish the complete user journey and mobile experience:** URL-synced filters, closing-soon chips, applied state, bottom-sheet form, 44 px targets, dark mode, offline message. Screenshots in `docs/screenshots/`
- [x] **Meaningful logging:** structured JSON with request ids, no personal data (`src/logger.js`)
- [x] **Health checks:** `/api/health` and `/api/ready`, plus Docker and Render health checks
- [x] **Useful README:** run, configure, API, deploy, quality evidence, limits
- [x] **Accessibility checks:** automated contrast and structure tests, 30 browser checks; manual checklist in `docs/QA.md`
- [x] **Performance checks:** `PERFORMANCE_REPORT.md`, budgets enforced by tests
- [x] **Security checks:** `SECURITY_CHECKLIST.md` + 19 security tests
- [x] **Regression checks:** 133 tests incl. API contract, seed integrity and a full user journey; CI on every push

## Things only you can do
- [ ] Deploy (`docs/DEPLOYMENT.md`) and paste the live URL into `README.md` and this file
- [ ] Record the video (`docs/WALKTHROUGH_SCRIPT.md`) and paste the link in both files
- [ ] Run Lighthouse / axe once and fill the blanks in `docs/QA.md` (optional but impressive)
- [ ] Make sure the GitHub repo is **Public**
