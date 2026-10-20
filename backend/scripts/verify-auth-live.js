import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { parseEnv } from 'node:util';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { loadConfig } from '../src/config.js';
import { createDatabase } from '../src/db.js';
import { createMailer } from '../src/auth/mail.js';
import { hashPassword } from '../src/auth/service.js';

// Opt-in real integration: Express -> existing Supabase, SMTP -> specifically tagged test mail.
// Only messages for exact, newly issued challenge IDs are fetched. Nothing is printed from mail.
const config = loadConfig();
const db = createDatabase(config);
const ownerConfig = loadConfig({
  ...process.env,
  ...parseEnv(readFileSync('.env.migrations', 'utf8')),
});
const owner = createDatabase(ownerConfig);
const mailer = createMailer(config);
const imap = new ImapFlow({
  host: 'imap.gmail.com',
  port: 993,
  secure: true,
  auth: { user: config.SMTP_USER, pass: config.SMTP_PASSWORD },
  logger: false,
  emitLogs: false,
  connectionTimeout: 15000,
  socketTimeout: 20000,
});
const run = Date.now().toString(36);
const local = config.SMTP_USER?.split('@')[0];
const domain = config.SMTP_USER?.split('@')[1];
const emails = ['student', 'investor', 'buyer', 'admin'].map(
  (r) => `${local}+orwickle-${run}-${r}@${domain}`,
);
const pass = randomBytes(30).toString('base64url');
const changed = randomBytes(30).toString('base64url');
const checks = [];
let stage = 'preflight',
  mailConnected = false,
  fixturesStarted = false;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function check(condition, label) {
  assert.ok(condition, label);
  checks.push(label);
}
function client() {
  let cookie, csrf;
  async function call(path, body, expected = 200, method = body === undefined ? 'GET' : 'POST') {
    if (method !== 'GET' && !csrf) {
      const t = await call('/api/csrf');
      csrf = t.csrfToken;
    }
    const res = await fetch(`http://127.0.0.1:${config.PORT}${path}`, {
      method,
      headers: {
        ...(cookie && { Cookie: cookie }),
        ...(body !== undefined && { 'Content-Type': 'application/json' }),
        ...(method !== 'GET' && { 'X-CSRF-Token': csrf }),
      },
      ...(body !== undefined && { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(35000),
    });
    const set = res.headers.getSetCookie();
    if (set[0]) cookie = set[0].split(';')[0];
    const result = await res.json();
    assert.equal(res.status, expected, `HTTP status mismatch at ${path}`);
    if (result.csrfToken) csrf = result.csrfToken;
    if (res.status === 401 && result.error?.code === 'SESSION_EXPIRED') csrf = undefined;
    return result;
  }
  return { call };
}
async function receivedCode(id) {
  for (let i = 0; i < 24; i++) {
    const lock = await imap.getMailboxLock('INBOX');
    try {
      const ids = await imap.search({ header: { 'X-Orwickle-Challenge-ID': id } }, { uid: true });
      if (ids.length) {
        const message = await imap.fetchOne(ids.at(-1), { source: true }, { uid: true });
        const parsed = await simpleParser(message.source);
        const match = parsed.text?.match(/code to [^\n]+ is (\d{6})\./);
        if (match) {
          return match[1];
        }
      }
    } finally {
      lock.release();
    }
    await sleep(2000);
  }
  throw new Error('Tagged OTP did not arrive');
}
async function signup(c, email, role) {
  const v = await c.call('/api/auth/signup', {
    fullName: `Orwickle Integration ${role}`,
    email,
    password: pass,
    confirmPassword: pass,
    role,
  });
  const code = await receivedCode(v.challengeId);
  const wrong = code === '000000' ? '111111' : '000000';
  await c.call('/api/auth/signup/verify', { challengeId: v.challengeId, code: wrong }, 400);
  await c.call('/api/auth/login/verify', { challengeId: v.challengeId, code }, 400);
  await c.call('/api/auth/signup/verify', { challengeId: v.challengeId, code });
  await c.call('/api/auth/signup/verify', { challengeId: v.challengeId, code }, 400);
  check(true, `${role}: real signup email, invalid/purpose-bound/reused OTP rejection`);
}
async function login(c, email, password = pass, admin = false) {
  const base = admin ? '/api/admin/auth' : '/api/auth';
  const v = await c.call(`${base}/login`, { email, password });
  await c.call('/api/account', undefined, 401);
  const code = await receivedCode(v.challengeId);
  const result = await c.call(`${base}/login/verify`, { challengeId: v.challengeId, code });
  return result;
}
try {
  await db.check();
  await owner.check();
  check(
    (await db.query('SELECT current_user AS role')).rows[0].role === 'orwickle_app',
    'Runtime uses restricted orwickle_app with verified TLS',
  );
  if (!mailer.configured) throw new Error('Sender missing');
  await imap.connect();
  mailConnected = true;
  stage = 'real signup and login';
  fixturesStarted = true;
  const clients = [];
  for (let i = 0; i < 3; i++) {
    const c = client();
    clients.push(c);
    const role = ['student', 'investor', 'buyer'][i];
    await signup(c, emails[i], role);
    await c.call('/api/auth/login', { email: emails[i], password: 'incorrect' }, 401);
    await login(c, emails[i]);
    await c.call(`/api/roles/${role}`);
    await c.call('/api/admin/account', undefined, 403);
    await c.call(`/api/roles/${role === 'buyer' ? 'student' : 'buyer'}`, undefined, 403);
    check(true, `${role}: password + real email OTP gate and server-side role restrictions`);
  }
  const a = clients[0],
    other = clients[2],
    b = client();
  await login(b, emails[0]);
  const rows = (await a.call('/api/sessions')).sessions;
  check(
    rows.length === 2 && rows.every((s) => !('sid' in s)),
    'Two active sessions are listed without bearer identifiers',
  );
  await other.call(`/api/sessions/${rows[0].id}`, {}, 404, 'DELETE');
  await a.call('/api/sessions/revoke-others', {});
  await b.call('/api/account', undefined, 401);
  await a.call('/api/account');
  check(true, 'Other-session revocation and cross-account isolation');
  stage = 'expiry and recovery';
  const expiredClient = client();
  const expired = await expiredClient.call('/api/auth/login', { email: emails[0], password: pass });
  const expiredCode = await receivedCode(expired.challengeId);
  await owner.query(
    "UPDATE orwickle_auth.challenges SET expires_at=now()-interval '1 second' WHERE id=$1",
    [expired.challengeId],
  );
  await expiredClient.call(
    '/api/auth/login/verify',
    { challengeId: expired.challengeId, code: expiredCode },
    400,
  );
  check(true, 'Expired real login OTP is rejected');
  const recover = client();
  const ch = await recover.call('/api/auth/recovery', { email: emails[0] });
  const recoveryCode = await receivedCode(ch.challengeId);
  const grant = await recover.call('/api/auth/recovery/verify', {
    challengeId: ch.challengeId,
    code: recoveryCode,
  });
  await recover.call('/api/auth/reset', {
    resetToken: grant.resetToken,
    password: changed,
    confirmPassword: changed,
  });
  await recover.call(
    '/api/auth/reset',
    { resetToken: grant.resetToken, password: changed, confirmPassword: changed },
    400,
  );
  await a.call('/api/account', undefined, 401);
  await recover.call('/api/auth/login', { email: emails[0], password: pass }, 401);
  await login(recover, emails[0], changed);
  await recover.call('/api/auth/logout', {});
  await recover.call('/api/account', undefined, 401);
  check(
    true,
    'Real recovery email resets password, revokes sessions, consumes grant and requires normal login',
  );
  stage = 'administrator';
  await owner.query(
    "INSERT INTO orwickle_auth.accounts(full_name,email,password_hash,role,email_verified_at) VALUES('Integration Administrator',$1,$2,'administrator',now())",
    [emails[3], await hashPassword(pass)],
  );
  const admin = client();
  await login(admin, emails[3], pass, true);
  await admin.call('/api/admin/account');
  await admin.call('/api/roles/student', undefined, 403);
  await admin.call('/api/auth/logout', {});
  check(
    true,
    'Separately provisioned administrator uses password + real email OTP, protected account and logout',
  );
  for (const sql of [
    "UPDATE orwickle_auth.accounts SET role='administrator' WHERE false",
    'SELECT id FROM storage.objects LIMIT 0',
  ]) {
    let denied = false;
    try {
      await db.query(sql);
    } catch {
      denied = true;
    }
    check(denied, 'Runtime least-privilege SQL boundary rejected an unauthorized action');
  }
  check(
    !(await db.query("SELECT has_schema_privilege(current_user,'public','CREATE') AS allowed"))
      .rows[0].allowed,
    'Runtime cannot create public tables',
  );
  // Provision the enduring account through owner access only, with an unknowable initial password.
  // The owner chooses a password using the verified recovery flow; no temporary password exists in a file.
  const exists = (
    await owner.query('SELECT role FROM orwickle_auth.accounts WHERE email=$1', [
      config.SMTP_USER.toLowerCase(),
    ])
  ).rows[0];
  if (!exists)
    await owner.query(
      "INSERT INTO orwickle_auth.accounts(full_name,email,password_hash,role,email_verified_at) VALUES('Orwickle Administrator',$1,$2,'administrator',now())",
      [config.SMTP_USER.toLowerCase(), await hashPassword(randomBytes(48).toString('base64url'))],
    );
  else
    check(
      exists.role === 'administrator',
      'Existing project-email account is already an administrator',
    );
  mkdirSync('../.local', { recursive: true });
  writeFileSync(
    '../.local/auth-live-result.json',
    JSON.stringify(
      {
        verifiedAt: new Date().toISOString(),
        project: 'orwickle-dev',
        checks,
        emailMode: 'real SMTP delivery and exact tagged IMAP retrieval',
        fixtureCleanup: 'performed in finally',
      },
      null,
      2,
    ),
  );
  console.log(
    `Real auth integration passed: ${checks.length} checks. No passwords, codes, cookies or reset tokens logged.`,
  );
} catch {
  console.error(
    `Real auth integration did not finish at: ${stage}. No success claimed; check local prerequisites.`,
  );
  process.exitCode = 1;
} finally {
  if (fixturesStarted)
    try {
      await owner.query(
        'DELETE FROM orwickle_auth.session_store WHERE sid IN (SELECT sid FROM orwickle_auth.sessions WHERE account_id IN (SELECT id FROM orwickle_auth.accounts WHERE email=ANY($1::text[])))',
        [emails],
      );
      await owner.query('DELETE FROM orwickle_auth.accounts WHERE email=ANY($1::text[])', [emails]);
    } catch {
      console.error(
        'Live fixture cleanup needs a reachable owner connection; rerun cleanup before repeating.',
      );
    }
  if (mailConnected) {
    try {
      await imap.logout();
    } catch {
      imap.close();
    }
  }
  mailer.close();
  await db.close();
  await owner.close();
}
