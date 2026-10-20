import { createDatabase } from '../src/db.js';
import { loadConfig } from '../src/config.js';

let database;
try {
  database = createDatabase(loadConfig());
  const result = await database.check();
  console.log(JSON.stringify({ query: 'SELECT 1', ok: true, ...result }));
} catch {
  console.error('Database verification failed; check credentials, network, and trusted CA');
  process.exitCode = 1;
} finally {
  await database?.close();
}
