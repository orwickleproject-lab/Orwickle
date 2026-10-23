import { readFileSync, writeFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { randomBytes } from 'node:crypto';
import { loadConfig } from '../src/config.js';
// Owner-only setup over Supabase HTTPS. Never imported by the runtime backend.
// The database generates its runtime password, so no plaintext password occurs in SQL text.
const text = readFileSync('.env', 'utf8'),
  values = parseEnv(text),
  owner = parseEnv(readFileSync('.env.migrations', 'utf8'));
const uri = new URL(loadConfig(owner).DATABASE_URL);
const ref = decodeURIComponent(uri.username).split('.').slice(1).join('.');
let stage = 'project metadata';
async function api(path, body) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: {
      Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`,
      ...(body && { 'Content-Type': 'application/json' }),
    },
    ...(body && { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(45000),
  });
  if (!res.ok) throw new Error('Management request failed');
  return res.json();
}
try {
  if (!/^[a-z]{20}$/.test(ref) || !process.env.SUPABASE_ACCESS_TOKEN)
    throw new Error('Setup credential missing');
  const poolers = await api('/config/database/pooler');
  const primary = poolers.find((v) => v.database_type === 'PRIMARY');
  const canonical = new URL(primary.connection_string || primary.connectionString);
  if (!canonical.hostname.endsWith('.pooler.supabase.com')) throw new Error('Unexpected endpoint');
  const existing = new URL(values.DATABASE_URL);
  const reuse = decodeURIComponent(existing.username) === `orwickle_app.${ref}`;
  const roleSetup = readFileSync('sql/runtime_role.sql', 'utf8');
  stage = 'schema migration';
  const query =
    (reuse ? '' : roleSetup) +
    '\n' +
    readFileSync('sql/002_auth.sql', 'utf8') +
    '\n' +
    readFileSync('sql/003_user_management.sql', 'utf8') +
    (reuse
      ? '\nSELECT 1 AS ok;'
      : "\nSELECT current_setting('orwickle.runtime_password') AS generated_password;");
  const result = await api('/database/query', { query });
  const password = reuse ? decodeURIComponent(existing.password) : result[0]?.generated_password;
  if (typeof password !== 'string' || password.length < 40)
    throw new Error('No runtime credential returned');
  stage = 'save restricted runtime environment';
  uri.hostname = canonical.hostname;
  uri.port = '5432';
  uri.username = `orwickle_app.${ref}`;
  uri.password = password;
  let next = text.replace(/^DATABASE_URL=.*$/m, `DATABASE_URL=${uri.href}`);
  for (const key of ['SESSION_SECRET', 'OTP_PEPPER'])
    if (!values[key]) {
      next = next.replace(new RegExp(`^${key}=.*\\r?\\n?`, 'm'), '');
      next += `\n${key}=${randomBytes(48).toString('hex')}\n`;
    }
  if (!values.ADMIN_ORIGIN) next += '\nADMIN_ORIGIN=http://localhost:5173\n';
  writeFileSync('.env', next);
  const metadata = await api('/database/query', {
    query: `SELECT rolname,rolsuper,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls FROM pg_roles WHERE rolname='orwickle_app'`,
    read_only: true,
  });
  if (
    metadata.length !== 1 ||
    Object.entries(metadata[0]).some(([k, v]) => k !== 'rolname' && v !== false)
  )
    throw new Error('Role metadata verification failed');
  console.log(
    'Actual Supabase auth schema and restricted runtime role configured over HTTPS management access. Runtime PostgreSQL/TLS and auth-flow verification remain separate.',
  );
} catch {
  console.error(
    `Management auth migration stopped at: ${stage}. No credential or SQL values displayed.`,
  );
  process.exitCode = 1;
}
