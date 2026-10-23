import { readFileSync } from 'node:fs';
import { loadConfig } from '../src/config.js';
import { createDatabase } from '../src/db.js';

const database = createDatabase(loadConfig());
try {
  await database.transaction((client) =>
    client.query(readFileSync(new URL('../sql/003_user_management.sql', import.meta.url), 'utf8')),
  );
  console.log('User-management migration applied. Existing accounts were preserved.');
} catch {
  console.error('User-management migration failed. Check the owner database connection.');
  process.exitCode = 1;
} finally {
  await database.close();
}
