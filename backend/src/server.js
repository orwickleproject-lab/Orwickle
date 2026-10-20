import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { createDatabase } from './db.js';

try {
  const config = loadConfig();
  const database = createDatabase(config);
  const server = createApp({ database }).listen(config.PORT, config.HOST, () => {
    console.log(`Orwickle backend listening at http://${config.HOST}:${config.PORT}`);
    if (!database.configured) console.log('Database pending configuration; readiness returns 503');
  });
  server.on('error', () => {
    console.error('Backend could not start; check the host and port');
    process.exitCode = 1;
    void database.close();
  });
  let stopping = false;
  function shutdown() {
    if (stopping) return;
    stopping = true;
    const deadline = setTimeout(() => process.exit(1), 10_000);
    deadline.unref();
    server.close(async () => {
      try { await database.close(); } finally { clearTimeout(deadline); }
    });
  }
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
} catch {
  console.error('Backend configuration failed; check .env values and the CA file');
  process.exitCode = 1;
}
