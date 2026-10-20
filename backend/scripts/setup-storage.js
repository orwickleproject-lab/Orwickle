import { readFileSync } from 'node:fs';
import { createDatabase } from '../src/db.js';
import { loadConfig } from '../src/config.js';

let database;
try {
  database = createDatabase(loadConfig());
  await database.check();
  await database.query(readFileSync(new URL('../sql/001_private_storage.sql', import.meta.url), 'utf8'));
  const result = await database.query(
    'SELECT id, public FROM storage.buckets WHERE id = $1', ['orwickle-confidential'],
  );
  if (result.rows.length !== 1 || result.rows[0].public !== false) {
    throw new Error('Bucket exists but is not private');
  }
  console.log('Verified private storage bucket: orwickle-confidential');
} catch {
  console.error('Private storage setup failed; verify project configuration and bucket privacy');
  process.exitCode = 1;
} finally {
  await database?.close();
}
