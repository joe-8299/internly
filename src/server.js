'use strict';
const path = require('node:path');
const { openDb } = require('./db');
const { createApp } = require('./app');
const { createLogger } = require('./logger');
const { version } = require('../package.json');

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '127.0.0.1';
const DB_FILE = process.env.DB_FILE || path.join(__dirname, '..', 'data', 'board.sqlite');
const LOG_LEVEL = process.env.LOG_LEVEL || 'info';
const TRUST_PROXY = process.env.TRUST_PROXY === '1';
const chaos = process.argv.includes('--chaos');

const logger = createLogger({ level: LOG_LEVEL });

let db;
try {
  db = openDb(DB_FILE);
} catch (err) {
  logger.error('could not open database', { err, dbFile: DB_FILE });
  process.exit(1);
}
const server = createApp({ db, chaos, logger, trustProxy: TRUST_PROXY });

server.on('error', (err) => {
  logger.error(err.code === 'EADDRINUSE' ? `port ${PORT} is already in use` : 'server error', { err });
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  logger.info('server started', {
    event: 'startup', version, node: process.version, port: PORT, host: HOST,
    url: `http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`,
    logLevel: LOG_LEVEL, trustProxy: TRUST_PROXY, chaos, dbFile: DB_FILE === ':memory:' ? DB_FILE : path.basename(DB_FILE),
  });
  if (chaos) logger.warn('FAILURE-DEMO MODE: ?simulate=slow|error|flaky is enabled. Do not use in production.');
});

let closing = false;
function shutdown(signal) {
  if (closing) return;
  closing = true;
  logger.info('shutting down', { event: 'shutdown', signal });
  server.close(() => { db.close(); process.exit(0); });
  server.closeIdleConnections?.();
  setTimeout(() => process.exit(1), 5000).unref();
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('unhandledRejection', (err) => logger.error('unhandled promise rejection', { err: err instanceof Error ? err : new Error(String(err)) }));
process.on('uncaughtException', (err) => { logger.error('uncaught exception', { err }); process.exit(1); });
