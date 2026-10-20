import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { parseEnv } from 'node:util';
import { loadConfig } from '../src/config.js';
import { createDatabase } from '../src/db.js';

// Run with .env.migrations, never with runtime credentials. No secret values are logged.
const config = loadConfig();
const db = createDatabase(config);
let stage = 'read-local-environment';
try {
  const runtimePath = '.env';
  const runtimeText = readFileSync(runtimePath, 'utf8');
  const ownerUrl = new URL(config.DATABASE_URL);
  const runtimeEnv = parseEnv(runtimeText);
  const existing = runtimeEnv.DATABASE_URL && new URL(runtimeEnv.DATABASE_URL);
  let password = existing?.username.startsWith('orwickle_app.')
    ? decodeURIComponent(existing.password)
    : undefined;
  stage = 'database-transaction';
  await db.transaction(async (client) => {
    const role = await client.query("SELECT 1 FROM pg_roles WHERE rolname='orwickle_app'");
    if (!role.rowCount || !password) {
      stage = 'role-password';
      await client.query(readFileSync('sql/runtime_role.sql', 'utf8'));
      password = (
        await client.query("SELECT current_setting('orwickle.runtime_password') AS value")
      ).rows[0].value;
    }
    stage = 'schema';
    await client.query(readFileSync('sql/002_auth.sql', 'utf8'));
  });
  stage = 'write-runtime-environment';
  const suffix = decodeURIComponent(ownerUrl.username).split('.').slice(1).join('.');
  if (!suffix) throw new Error('Session pooler project suffix required');
  ownerUrl.username = `orwickle_app.${suffix}`;
  ownerUrl.password = password;
  let next = runtimeText.replace(/^DATABASE_URL=.*$/m, `DATABASE_URL=${ownerUrl.href}`);
  for (const name of ['SESSION_SECRET', 'OTP_PEPPER']) {
    if (!runtimeEnv[name]) {
      next = next.replace(new RegExp(`^${name}=.*\\r?\\n?`, 'm'), '');
      next += `\n${name}=${randomBytes(48).toString('hex')}\n`;
    }
  }
  if (!runtimeEnv.ADMIN_ORIGIN) {
    next = next.replace(/^ADMIN_ORIGIN=.*\r?\n?/m, '');
    next += '\nADMIN_ORIGIN=http://localhost:5173\n';
  }
  if (!existsSync('.env.migrations')) throw new Error('Owner environment must be separate');
  writeFileSync(runtimePath, next);
  console.log(
    'Auth schema migrated; runtime credential separated with a restricted application role.',
  );
} catch (error) {
  console.error('Migration stage:', stage, 'Error class:', error.name);
  console.error(
    'Migration diagnostic code:',
    /^[A-Z0-9_]+$/.test(error.code || '') ? error.code : 'LOCAL_CONFIGURATION',
  );
  console.error('Auth migration failed. Check owner access and the local migration environment.');
  process.exitCode = 1;
} finally {
  await db.close();
}
