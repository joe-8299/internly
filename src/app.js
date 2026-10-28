'use strict';
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const { applySecurityHeaders, createRateLimiter } = require('./security');
const { validateApplication, validateListQuery } = require('./validate');
const { createLogger } = require('./logger');
const repo = require('./db');
const { version } = require('../package.json');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};
const COMPRESSIBLE = /^(text\/|application\/json|image\/svg)/;
const PROBE_PATHS = new Set(['/api/health', '/api/ready']);

class HttpError extends Error {
  constructor(status, code, message, fields) {
    super(message);
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function readJson(req, limit) {
  return new Promise((resolve, reject) => {
    let size = 0;
    let done = false;
    const chunks = [];
    req.on('data', (chunk) => {
      if (done) return;
      size += chunk.length;
      if (size > limit) {
        done = true;
        req.resume();
        reject(new HttpError(413, 'PAYLOAD_TOO_LARGE', `Request body must be ${limit} bytes or fewer.`));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (done) return;
      done = true;
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(new HttpError(400, 'INVALID_JSON', 'Request body is not valid JSON.'));
      }
    });
    req.on('error', (e) => { if (!done) { done = true; reject(e); } });
  });
}

/**
 * createApp({ db, publicDir, chaos, limits, logger, trustProxy }) -> http.Server (not listening yet)
 *  - chaos:      enables ?simulate=slow|error|flaky on GET /api/internships (demo/testing only)
 *  - limits:     override rate-limit / body-size settings (used by tests)
 *  - logger:     { debug, info, warn, error }; defaults to silent
 *  - trustProxy: true when running behind ONE reverse proxy (Render, Heroku, nginx): the client IP
 *                is then the last entry of X-Forwarded-For instead of the socket address.
 */
function createApp({
  db,
  publicDir = path.join(__dirname, '..', 'public'),
  chaos = false,
  limits = {},
  logger = createLogger({ level: 'silent' }),
  trustProxy = false,
}) {
  const cfg = { windowMs: 60_000, max: 120, writeMax: 5, maxBodyBytes: 10 * 1024, ...limits };
  const root = path.resolve(publicDir);
  const general = createRateLimiter({ windowMs: cfg.windowMs, max: cfg.max });
  const writes = createRateLimiter({ windowMs: cfg.windowMs, max: cfg.writeMax });
  const startedAt = Date.now();
  const fileCache = new Map(); // path -> { mtimeMs, size, etag, raw, gz }
  let flakyCounter = 0;

  function clientIp(req) {
    if (trustProxy) {
      const xff = req.headers['x-forwarded-for'];
      if (typeof xff === 'string' && xff) return xff.split(',').pop().trim();
    }
    return req.socket.remoteAddress || 'unknown';
  }

  // One place that writes every response body: adds gzip when it helps.
  function send(req, res, status, body, headers) {
    let buf = Buffer.isBuffer(body) ? body : Buffer.from(body);
    const type = headers['Content-Type'] || '';
    const out = { ...headers, Vary: 'Accept-Encoding' };
    if (buf.length >= 1024 && COMPRESSIBLE.test(type) && /\bgzip\b/.test(req.headers['accept-encoding'] || '')) {
      buf = zlib.gzipSync(buf);
      out['Content-Encoding'] = 'gzip';
    }
    out['Content-Length'] = buf.length;
    res.writeHead(status, out);
    res.end(req.method === 'HEAD' ? undefined : buf);
  }
  const sendJson = (req, res, status, obj) =>
    send(req, res, status, JSON.stringify(obj), { 'Content-Type': 'application/json; charset=utf-8' });

  function setRateHeaders(res, rl) {
    res.setHeader('RateLimit-Limit', String(rl.limit));
    res.setHeader('RateLimit-Remaining', String(rl.remaining));
    if (!rl.allowed) res.setHeader('Retry-After', String(rl.retryAfter));
  }
  const tooMany = (rl) =>
    new HttpError(429, 'RATE_LIMITED', `Too many requests. Try again in ${rl.retryAfter} seconds.`);

  async function maybeChaos(url) {
    if (!chaos) return;
    const mode = url.searchParams.get('simulate');
    if (mode === 'slow') await sleep(2500);
    else if (mode === 'error') throw new HttpError(500, 'SIMULATED_ERROR', 'Simulated server error.');
    else if (mode === 'flaky') {
      flakyCounter += 1;
      if (flakyCounter % 3 !== 0) throw new HttpError(503, 'SIMULATED_UNAVAILABLE', 'Simulated temporary outage.');
    }
  }

  async function api(req, res, url, ip) {
    const p = url.pathname;
    const method = req.method;
    const only = (allowed) => {
      if (method !== allowed && !(allowed === 'GET' && method === 'HEAD')) {
        res.setHeader('Allow', allowed);
        throw new HttpError(405, 'METHOD_NOT_ALLOWED', `Use ${allowed} for this endpoint.`);
      }
    };

    // Liveness: "is the process up?" Cheap, never touches the database.
    if (p === '/api/health') {
      only('GET');
      return sendJson(req, res, 200, {
        status: 'ok', version, uptimeSeconds: Math.round((Date.now() - startedAt) / 1000), time: new Date().toISOString(),
      });
    }
    // Readiness: "can it actually serve traffic?" Runs a real query.
    if (p === '/api/ready') {
      only('GET');
      try {
        const n = repo.ping(db);
        return sendJson(req, res, 200, { status: 'ready', version, checks: { database: 'ok', internships: n } });
      } catch (err) {
        logger.error('readiness check failed', { requestId: res.getHeader('X-Request-Id'), err });
        return sendJson(req, res, 503, { status: 'unavailable', version, checks: { database: 'failing' } });
      }
    }

    if (p === '/api/internships') {
      only('GET');
      await maybeChaos(url);
      const v = validateListQuery(url.searchParams);
      if (!v.ok) throw new HttpError(400, 'INVALID_QUERY', 'One or more query parameters are invalid.', v.errors);
      return sendJson(req, res, 200, repo.listInternships(db, v.values));
    }

    const one = /^\/api\/internships\/(\d{1,9})$/.exec(p);
    if (one) {
      only('GET');
      const item = repo.getInternship(db, Number(one[1]));
      if (!item) throw new HttpError(404, 'NOT_FOUND', 'Internship not found.');
      return sendJson(req, res, 200, { data: item });
    }

    if (p === '/api/applications') {
      only('POST');
      const rl = writes.check(ip);
      setRateHeaders(res, rl);
      if (!rl.allowed) throw tooMany(rl);

      const type = (req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
      if (type !== 'application/json') {
        throw new HttpError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Content-Type must be application/json.');
      }
      const body = await readJson(req, cfg.maxBodyBytes);
      const v = validateApplication(body);
      if (!v.ok) throw new HttpError(422, 'VALIDATION_FAILED', 'Please fix the highlighted fields.', v.errors);
      if (!repo.getInternship(db, v.values.internshipId)) {
        throw new HttpError(404, 'NOT_FOUND', 'That internship no longer exists.');
      }
      const result = repo.createApplication(db, v.values);
      if (!result.ok) {
        throw new HttpError(409, 'DUPLICATE_APPLICATION', 'You have already applied to this internship with that email.',
          { email: 'You have already applied with this email.' });
      }
      // Business event. IDs only: no names, emails or note text in logs.
      logger.info('application created', {
        event: 'application_created', requestId: res.getHeader('X-Request-Id'),
        applicationId: result.id, internshipId: v.values.internshipId,
      });
      return sendJson(req, res, 201, { data: { id: result.id, internshipId: v.values.internshipId } });
    }

    throw new HttpError(404, 'NOT_FOUND', 'No such endpoint.');
  }

  async function loadFile(full) {
    const st = await fs.stat(full);
    if (!st.isFile()) throw new Error('not a file');
    const hit = fileCache.get(full);
    if (hit && hit.mtimeMs === st.mtimeMs && hit.size === st.size) return hit;
    const raw = await fs.readFile(full);
    const entry = {
      mtimeMs: st.mtimeMs, size: st.size, raw, gz: zlib.gzipSync(raw),
      etag: '"' + crypto.createHash('sha1').update(raw).digest('base64url').slice(0, 20) + '"',
    };
    fileCache.set(full, entry);
    return entry;
  }

  async function serveStatic(req, res, url) {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.setHeader('Allow', 'GET, HEAD');
      throw new HttpError(405, 'METHOD_NOT_ALLOWED', 'Only GET and HEAD are allowed.');
    }
    let rel;
    try { rel = decodeURIComponent(url.pathname); } catch { throw new HttpError(400, 'BAD_PATH', 'Malformed path.'); }
    if (rel.includes('\0')) throw new HttpError(400, 'BAD_PATH', 'Malformed path.');
    if (rel === '/') rel = '/index.html';

    // Path-traversal guard: resolved path must stay inside the public folder.
    const full = path.resolve(root, '.' + rel);
    if (!full.startsWith(root + path.sep)) throw new HttpError(404, 'NOT_FOUND', 'Not found.');
    const mime = MIME[path.extname(full).toLowerCase()];
    if (!mime) throw new HttpError(404, 'NOT_FOUND', 'Not found.');

    let f;
    try { f = await loadFile(full); } catch { throw new HttpError(404, 'NOT_FOUND', 'Not found.'); }
    const headers = { 'Content-Type': mime, ETag: f.etag, 'Cache-Control': 'public, max-age=0, must-revalidate', Vary: 'Accept-Encoding' };
    if (req.headers['if-none-match'] === f.etag) {
      res.writeHead(304, headers);
      return res.end();
    }
    const gzip = f.raw.length >= 1024 && COMPRESSIBLE.test(mime) && /\bgzip\b/.test(req.headers['accept-encoding'] || '');
    const body = gzip ? f.gz : f.raw;
    if (gzip) headers['Content-Encoding'] = 'gzip';
    headers['Content-Length'] = body.length;
    res.writeHead(200, headers);
    res.end(req.method === 'HEAD' ? undefined : body);
  }

  async function handle(req, res) {
    applySecurityHeaders(req, res);
    // Request ID: reuse a sane inbound one (so logs line up across proxies), else make one.
    const inbound = req.headers['x-request-id'];
    res.setHeader('X-Request-Id', typeof inbound === 'string' && /^[\w.-]{8,64}$/.test(inbound) ? inbound : crypto.randomUUID());

    if (req.url.length > 2048) throw new HttpError(414, 'URI_TOO_LONG', 'URL is too long.');
    let url;
    try { url = new URL(req.url, 'http://localhost'); } catch { throw new HttpError(400, 'BAD_URL', 'Malformed URL.'); }
    req.pathname = url.pathname;

    if (url.pathname.startsWith('/api/')) {
      res.setHeader('Cache-Control', 'no-store');
      const ip = clientIp(req);
      // Health probes are exempt so a platform's frequent checks can never be rate-limited into "unhealthy".
      if (!PROBE_PATHS.has(url.pathname)) {
        const rl = general.check(ip);
        setRateHeaders(res, rl);
        if (!rl.allowed) {
          logger.warn('rate limited', { event: 'rate_limited', requestId: res.getHeader('X-Request-Id'), path: url.pathname, scope: 'general' });
          throw tooMany(rl);
        }
      }
      return api(req, res, url, ip);
    }
    return serveStatic(req, res, url);
  }

  function fail(req, res, err) {
    let status = 500;
    let payload = { error: { code: 'INTERNAL_ERROR', message: 'Something went wrong on our side. Please try again.' } };
    if (err instanceof HttpError) {
      status = err.status;
      payload = { error: { code: err.code, message: err.message } };
      if (err.fields) payload.error.fields = err.fields;
      if (err.code === 'RATE_LIMITED' && req.pathname === '/api/applications') {
        logger.warn('rate limited', { event: 'rate_limited', requestId: res.getHeader('X-Request-Id'), path: req.pathname, scope: 'applications' });
      }
    } else {
      logger.error('unhandled error', { requestId: res.getHeader('X-Request-Id'), err }); // details stay in logs, never in the response
    }
    if (res.headersSent) { res.destroy(); return; }
    if (status === 413) res.setHeader('Connection', 'close');
    sendJson(req, res, status, payload);
  }

  const server = http.createServer((req, res) => {
    const t0 = process.hrtime.bigint();
    res.on('finish', () => {
      const ms = Number(process.hrtime.bigint() - t0) / 1e6;
      const probe = PROBE_PATHS.has(req.pathname);
      const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : probe ? 'debug' : 'info';
      logger[level]('request', {
        event: 'request', requestId: res.getHeader('X-Request-Id'), method: req.method,
        path: req.pathname || '(unparsed)', status: res.statusCode, ms: Math.round(ms * 10) / 10,
      });
    });
    handle(req, res).catch((err) => fail(req, res, err));
  });
  server.requestTimeout = 15_000;
  server.headersTimeout = 10_000;
  server.on('close', () => { general.close(); writes.close(); });
  return server;
}

module.exports = { createApp };
