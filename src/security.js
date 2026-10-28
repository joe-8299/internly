'use strict';

// Applied to EVERY response (API and static files).
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

const HEADERS = {
  'Content-Security-Policy': CSP,
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
};

function applySecurityHeaders(req, res) {
  for (const [k, v] of Object.entries(HEADERS)) res.setHeader(k, v);
  // HSTS only makes sense when the request really came over HTTPS (e.g. behind a TLS proxy).
  if (req.headers['x-forwarded-proto'] === 'https') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
}

// Fixed-window, in-memory limiter keyed by client IP.
function createRateLimiter({ windowMs, max }) {
  const hits = new Map();
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of hits) if (entry.reset <= now) hits.delete(key);
  }, windowMs);
  timer.unref();

  return {
    check(key) {
      const now = Date.now();
      if (hits.size > 50000) hits.clear(); // hard cap so the map cannot grow forever
      let entry = hits.get(key);
      if (!entry || entry.reset <= now) {
        entry = { count: 0, reset: now + windowMs };
        hits.set(key, entry);
      }
      entry.count += 1;
      return {
        allowed: entry.count <= max,
        limit: max,
        remaining: Math.max(0, max - entry.count),
        retryAfter: Math.max(1, Math.ceil((entry.reset - now) / 1000)),
      };
    },
    close() { clearInterval(timer); },
  };
}

module.exports = { applySecurityHeaders, createRateLimiter, CSP };
