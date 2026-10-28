'use strict';
const { openDb } = require('../src/db');
const { createApp } = require('../src/app');

async function startServer(opts = {}) {
  const db = openDb(':memory:');
  const server = createApp({ db, ...opts });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  return {
    base: `http://127.0.0.1:${port}`,
    port,
    db,
    async close() {
      server.closeAllConnections?.();
      await new Promise((resolve) => server.close(resolve));
      db.close();
    },
  };
}

const validApplication = (over = {}) => ({
  internshipId: 1,
  fullName: 'Asha Raman',
  email: 'asha@example.com',
  school: 'PSG College of Technology',
  coverNote: 'I enjoy building small web apps and would like to learn from your team.',
  consent: true,
  ...over,
});

const postJson = (base, body, headers = {}) =>
  fetch(`${base}/api/applications`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

module.exports = { startServer, validApplication, postJson };
