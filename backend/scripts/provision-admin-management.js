import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { hashPassword } from '../src/auth/service.js';
import { loadConfig } from '../src/config.js';
const owner = parseEnv(readFileSync('.env.migrations', 'utf8'));
const runtime = parseEnv(readFileSync('.env', 'utf8'));
const ref = decodeURIComponent(new URL(loadConfig(owner).DATABASE_URL).username)
  .split('.')
  .slice(1)
  .join('.');
async function query(sql, parameters) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: sql, parameters }),
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error('Owner query failed');
  return res.json();
}
try {
  const email = runtime.SMTP_USER.toLowerCase();
  const rows = await query('SELECT role FROM orwickle_auth.accounts WHERE email=$1', [email]);
  if (rows[0]) {
    if (rows[0].role !== 'administrator') throw new Error('Public account cannot be promoted');
    console.log('Existing project-email administrator preserved.');
  } else {
    const hash = await hashPassword(randomBytes(48).toString('base64url'));
    await query(
      "INSERT INTO orwickle_auth.accounts(full_name,email,password_hash,role,email_verified_at) VALUES('Orwickle Administrator',$1,$2,'administrator',now())",
      [email, hash],
    );
    console.log(
      'Project-email administrator provisioned separately. Use the verified Forgot password flow to choose a password once database connectivity is available. No initial password was saved or displayed.',
    );
  }
} catch {
  console.error('Owner-only administrator provisioning did not finish; no account was promoted.');
  process.exitCode = 1;
}
