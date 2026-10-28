# Deployment

PinBoard has no build step and no dependencies, so deployment is just "run `npm start` on Node 22.13+".

## Option A: Render (recommended, free, about 5 minutes)

1. Push this repo to GitHub.
2. Go to https://render.com, sign in with GitHub.
3. **New + > Blueprint**, choose your `pinboard` repo. Render reads `render.yaml` and fills everything in.
   (Prefer manual setup? **New + > Web Service**, runtime **Node**, build command `echo ok`, start command
   `node --disable-warning=ExperimentalWarning src/server.js`, health check path `/api/ready`, and set env vars
   `NODE_VERSION=22`, `HOST=0.0.0.0`, `TRUST_PROXY=1`, `DB_FILE=/tmp/board.sqlite`.)
4. Click **Apply** / **Create**. When the deploy turns green, open the `https://pinboard-xxxx.onrender.com` URL.
5. Check it: open `/api/ready` (should say `"status":"ready"`) and the home page. Paste the URL into `README.md` as the live link.

Notes
- Free services sleep after ~15 minutes idle; the first visit afterwards takes about 30-50 seconds. Open the link yourself before showing anyone.
- The free disk is temporary: restarts wipe applications and re-seed the listings. That is fine for a demo; see "Persistence" below for real use.
- Watch logs live in the Render dashboard (**Logs** tab). Search for a request id to trace one request.

## Option B: Docker (any host)

```bash
docker build -t pinboard .
docker run -p 3000:3000 -v pinboard-data:/data pinboard
```
Open http://localhost:3000. The image runs as a non-root user and has a built-in `HEALTHCHECK` on `/api/health`.
The `-v` volume keeps the database across restarts.

## Option C: Any VPS / PaaS
Install Node 22.13+, copy the repo, then `HOST=0.0.0.0 PORT=3000 TRUST_PROXY=1 npm start` behind a TLS-terminating proxy
(nginx, Caddy, a platform router). Use `/api/ready` as the health check.

## Persistence
SQLite needs a disk that survives restarts. On Render that means a paid plan with a persistent disk mounted at e.g. `/data`
and `DB_FILE=/data/board.sqlite`. To outgrow SQLite, replace `src/db.js` (it is the only file that talks to the database).

## After deploying: smoke test (2 minutes)
- [ ] Home page loads, six listings appear
- [ ] `/api/health` and `/api/ready` return 200
- [ ] Search "sql" narrows the list; refresh keeps the filter
- [ ] Apply works end to end; applying again with the same email shows the duplicate message
- [ ] Response headers include `Content-Security-Policy` and `X-Request-Id` (browser devtools > Network)
- [ ] Phone check: open the URL on a phone, tap Apply, the form slides up as a sheet
