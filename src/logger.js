'use strict';
// Structured (one JSON object per line) logging. Easy to read locally, easy to search in
// Render/Docker/any log tool. PRIVACY: never pass names, emails or note text to the logger.
const LEVELS = { debug: 10, info: 20, warn: 30, error: 40, silent: 100 };

function createLogger({ level = 'info', write = (line) => process.stdout.write(line + '\n') } = {}) {
  const threshold = LEVELS[level] ?? LEVELS.info;
  function log(lvl, msg, fields) {
    if (LEVELS[lvl] < threshold) return;
    const entry = { time: new Date().toISOString(), level: lvl, msg, ...fields };
    if (entry.err instanceof Error) entry.err = { name: entry.err.name, message: entry.err.message, stack: entry.err.stack };
    write(JSON.stringify(entry));
  }
  return {
    debug: (m, f) => log('debug', m, f),
    info: (m, f) => log('info', m, f),
    warn: (m, f) => log('warn', m, f),
    error: (m, f) => log('error', m, f),
  };
}

module.exports = { createLogger, LEVELS };
