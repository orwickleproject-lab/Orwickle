import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { hashPassword } from '../src/auth/service.js';

// Real PostgreSQL engine in WASM, isolated local state; email delivery is an in-memory double.
// These checks never stand in for Supabase + SMTP integration evidence.
const password = 'test-only sufficiently long password';
async function harness() {
  const pg = new PGlite();
  await pg.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE orwickle_app;');
  await pg.exec(readFileSync(new URL('../sql/002_auth.sql', import.meta.url), 'utf8'));
  await pg.exec(readFileSync(new URL('../sql/003_user_management.sql', import.meta.url), 'utf8'));
  const adapt = (result) => ({ ...result, rowCount: result.affectedRows || result.rows.length });
  const db = {
    configured: true,
    query: async (sql, params) => adapt(await pg.query(sql, params)),
    transaction: (work) =>
      pg.transaction((tx) =>
        work({ query: async (sql, params) => adapt(await tx.query(sql, params)) }),
      ),
  };
  db.pool = { query: db.query };
  const messages = [];
  const config = loadConfig({
    NODE_ENV: 'test',
    SESSION_SECRET: 's'.repeat(96),
    OTP_PEPPER: 'p'.repeat(96),
  });
  const mailer = {
    configured: true,
    async send(message) {
      messages.push(message);
    },
  };
  const app = createApp({ database: db, config, mailer });
  async function client() {
    const agent = request.agent(app);
    let csrf = (await agent.get('/api/csrf')).body.csrfToken;
    return {
      get: (path) => agent.get(`/api${path}`),
      async post(path, body, expected = 200) {
        const response = await agent.post(`/api${path}`).set('X-CSRF-Token', csrf).send(body);
        assert.equal(response.status, expected, `Unexpected HTTP status at ${path}`);
        if (response.body.csrfToken) csrf = response.body.csrfToken;
        return response.body;
      },
      async del(path, expected = 200) {
        const response = await agent.delete(`/api${path}`).set('X-CSRF-Token', csrf).send({});
        assert.equal(response.status, expected);
        return response.body;
      },
      async patch(path, body, expected = 200) {
        const response = await agent.patch(`/api${path}`).set('X-CSRF-Token', csrf).send(body);
        assert.equal(response.status, expected, `Unexpected HTTP status at ${path}`);
        return response.body;
      },
    };
  }
  const code = (id) => messages.findLast((m) => m.id === id)?.code;
  async function signup(c, email, role = 'student') {
    const challenge = await c.post('/auth/signup', {
      fullName: 'Example Account',
      email,
      password,
      confirmPassword: password,
      role,
    });
    await c.post('/auth/signup/verify', {
      challengeId: challenge.challengeId,
      code: code(challenge.challengeId),
    });
    return challenge;
  }
  async function login(c, email, pass = password, admin = false) {
    const base = admin ? '/admin/auth' : '/auth';
    const challenge = await c.post(`${base}/login`, { email, password: pass });
    assert.equal((await c.get('/account')).status, 401, 'Password alone must not grant access');
    const data = await c.post(`${base}/login/verify`, {
      challengeId: challenge.challengeId,
      code: code(challenge.challengeId),
    });
    return { challenge, data };
  }
  return { pg, db, app, client, messages, code, signup, login, config, mailer };
}

test('signup/login codes are purpose-bound, single-use, expiring and attempt-limited; CSRF blocks unsafe requests', async () => {
  const h = await harness();
  try {
    const c = await h.client();
    await request(h.app).post('/api/auth/signup').send({}).expect(403);
    await c.post(
      '/auth/signup',
      {
        fullName: 'Example',
        email: 'student@example.test',
        password,
        confirmPassword: password,
        role: 'administrator',
      },
      400,
    );
    const ch = await c.post('/auth/signup', {
      fullName: 'Example',
      email: 'student@example.test',
      password,
      confirmPassword: password,
      role: 'student',
    });
    await c.post(
      '/auth/login/verify',
      { challengeId: ch.challengeId, code: h.code(ch.challengeId) },
      400,
    );
    const incorrect = h.code(ch.challengeId) === '000000' ? '111111' : '000000';
    await c.post('/auth/signup/verify', { challengeId: ch.challengeId, code: incorrect }, 400);
    await c.post('/auth/signup/verify', {
      challengeId: ch.challengeId,
      code: h.code(ch.challengeId),
    });
    await c.post(
      '/auth/signup/verify',
      { challengeId: ch.challengeId, code: h.code(ch.challengeId) },
      400,
    );
    assert.equal((await c.get('/account')).status, 401);
    const count = h.messages.length;
    await c.post('/auth/login', { email: 'student@example.test', password: 'wrong' }, 401);
    assert.equal(h.messages.length, count, 'Incorrect password must not trigger email');
    const expired = await c.post('/auth/login', { email: 'student@example.test', password });
    await h.db.query(
      "UPDATE orwickle_auth.challenges SET expires_at=now()-interval '1 second' WHERE id=$1",
      [expired.challengeId],
    );
    await c.post(
      '/auth/login/verify',
      { challengeId: expired.challengeId, code: h.code(expired.challengeId) },
      400,
    );
    const capped = await c.post('/auth/login', { email: 'student@example.test', password });
    const wrong = h.code(capped.challengeId) === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i++)
      await c.post('/auth/login/verify', { challengeId: capped.challengeId, code: wrong }, 400);
    await c.post(
      '/auth/login/verify',
      { challengeId: capped.challengeId, code: h.code(capped.challengeId) },
      400,
    );
    const valid = await h.login(c, 'student@example.test');
    assert.equal(valid.data.account.role, 'student');
    await c.post(
      '/auth/login/verify',
      { challengeId: valid.challenge.challengeId, code: h.code(valid.challenge.challengeId) },
      400,
    );
    assert.equal((await c.get('/roles/student')).status, 200);
    assert.equal((await c.get('/roles/buyer')).status, 403);
    assert.equal((await c.get('/admin/account')).status, 403);
  } finally {
    await h.pg.close();
  }
});

test('login persists, logout affects only this client, and password reset revokes account access', async () => {
  const h = await harness();
  try {
    const a = await h.client(),
      b = await h.client(),
      other = await h.client();
    await h.signup(a, 'student@example.test');
    await h.login(a, 'student@example.test');
    await h.login(b, 'student@example.test');
    assert.equal((await a.get('/account')).status, 200);
    assert.equal((await b.get('/account')).status, 200);
    assert.equal((await a.get('/sessions')).status, 404);
    await a.post('/sessions/revoke-others', {}, 404);
    await a.del('/sessions/00000000-0000-4000-8000-000000000000', 404);
    const response = await a.get('/account');
    const cookie = response.headers['set-cookie'][0].split(';')[0];
    const restarted = createApp({ database: h.db, config: h.config, mailer: h.mailer });
    await request(restarted).get('/api/account').set('Cookie', cookie).expect(200);
    await h.signup(other, 'buyer@example.test', 'buyer');
    await h.login(other, 'buyer@example.test');
    assert.equal((await other.get('/roles/buyer')).status, 200);
    await a.post('/auth/logout', {});
    assert.equal((await a.get('/account')).status, 401);
    await request(restarted).get('/api/account').set('Cookie', cookie).expect(401);
    assert.equal((await b.get('/account')).status, 200);
    assert.equal((await other.get('/account')).status, 200);
    const freshA = await h.client();
    await h.login(freshA, 'student@example.test');
    const recover = await h.client();
    const ch = await recover.post('/auth/recovery', { email: 'student@example.test' });
    await recover.post(
      '/auth/login/verify',
      { challengeId: ch.challengeId, code: h.code(ch.challengeId) },
      400,
    );
    const grant = await recover.post('/auth/recovery/verify', {
      challengeId: ch.challengeId,
      code: h.code(ch.challengeId),
    });
    await recover.post(
      '/auth/recovery/verify',
      { challengeId: ch.challengeId, code: h.code(ch.challengeId) },
      400,
    );
    const next = 'new test-only sufficiently long password';
    await recover.post('/auth/reset', {
      resetToken: grant.resetToken,
      password: next,
      confirmPassword: next,
    });
    assert.equal((await freshA.get('/account')).status, 401);
    assert.equal((await b.get('/account')).status, 401);
    assert.equal((await other.get('/account')).status, 200);
    await recover.post(
      '/auth/reset',
      { resetToken: grant.resetToken, password: next, confirmPassword: next },
      400,
    );
    await recover.post('/auth/login', { email: 'student@example.test', password }, 401);
    await h.login(recover, 'student@example.test', next);
    await recover.post('/auth/logout', {});
    assert.equal((await recover.get('/account')).status, 401);
  } finally {
    await h.pg.close();
  }
});

test('resend cooldown, rotation, cap and database privileges protect public signup', async () => {
  const h = await harness();
  try {
    const c = await h.client();
    const ch = await c.post('/auth/signup', {
      fullName: 'Example',
      email: 'investor@example.test',
      password,
      confirmPassword: password,
      role: 'investor',
    });
    const old = h.code(ch.challengeId);
    await c.post('/auth/resend', { challengeId: ch.challengeId, purpose: 'signup' }, 429);
    for (let i = 0; i < 3; i++) {
      await h.db.query(
        "UPDATE orwickle_auth.challenges SET sent_at=now()-interval '61 seconds' WHERE id=$1",
        [ch.challengeId],
      );
      await c.post('/auth/resend', { challengeId: ch.challengeId, purpose: 'signup' });
    }
    await c.post('/auth/resend', { challengeId: ch.challengeId, purpose: 'signup' }, 429);
    if (old !== h.code(ch.challengeId))
      await c.post('/auth/signup/verify', { challengeId: ch.challengeId, code: old }, 400);
    await c.post('/auth/signup/verify', {
      challengeId: ch.challengeId,
      code: h.code(ch.challengeId),
    });
    await h.login(c, 'investor@example.test');
    assert.equal((await c.get('/roles/investor')).status, 200);
    // Exercise the SQL boundary under the actual restricted role, separate from HTTP validation.
    await h.pg.exec('SET ROLE orwickle_app');
    for (const sql of [
      "UPDATE orwickle_auth.accounts SET role='administrator'",
      "INSERT INTO orwickle_auth.accounts(full_name,email,password_hash,role) VALUES('Example','bad@example.test','hash','administrator')",
      "SELECT orwickle_auth.register_public_account('Example','bad@example.test','hash','administrator')",
    ]) {
      let rejected = false;
      try {
        await h.pg.exec(sql);
      } catch {
        rejected = true;
      }
      assert.equal(rejected, true, 'Runtime SQL must reject role escalation');
    }
    await h.pg.exec('RESET ROLE');
  } finally {
    await h.pg.close();
  }
});

test('separately provisioned administrators require password then OTP and cannot use public-role access', async () => {
  const h = await harness();
  try {
    await h.db.query(
      "INSERT INTO orwickle_auth.accounts(full_name,email,password_hash,role,email_verified_at) VALUES('Test Administrator','admin@example.test',$1,'administrator',now())",
      [await hashPassword(password)],
    );
    const c = await h.client();
    await c.post('/auth/login', { email: 'admin@example.test', password }, 401);
    const { data } = await h.login(c, 'admin@example.test', password, true);
    assert.equal(data.account.role, 'administrator');
    assert.equal((await c.get('/admin/account')).status, 200);
    assert.equal((await c.get('/roles/student')).status, 403);
    await h.db.query(
      "UPDATE orwickle_auth.sessions SET absolute_expires_at=now()-interval '1 second' WHERE account_id=$1",
      [data.account.id],
    );
    assert.equal((await c.get('/admin/account')).status, 401);
  } finally {
    await h.pg.close();
  }
});

test('only verified administrators can search and edit public users without promoting or changing administrators', async () => {
  const h = await harness();
  try {
    const hash = await hashPassword(password);
    const administrator = (
      await h.db.query(
        "INSERT INTO orwickle_auth.accounts(full_name,email,password_hash,role,email_verified_at) VALUES('Admin','admin@example.test',$1,'administrator',now()) RETURNING id",
        [hash],
      )
    ).rows[0];
    const admin = await h.client(),
      user = await h.client(),
      other = await h.client(),
      anonymous = await h.client();
    await h.signup(user, 'user@example.test');
    const { data } = await h.login(user, 'user@example.test');
    await h.signup(other, 'buyer@example.test', 'buyer');
    await h.login(other, 'buyer@example.test');
    const input = { fullName: 'Updated User', role: 'student' };
    assert.equal((await anonymous.get('/admin/users')).status, 401);
    await anonymous.patch(`/admin/users/${data.account.id}`, input, 401);
    assert.equal((await other.get('/admin/users')).status, 403);
    await other.patch(`/admin/users/${data.account.id}`, input, 403);
    await admin.post('/admin/auth/login', { email: 'admin@example.test', password });
    assert.equal((await admin.get('/admin/users')).status, 401);
    await h.login(admin, 'admin@example.test', password, true);
    await request(h.app).patch(`/api/admin/users/${data.account.id}`).send(input).expect(403);
    await h.db.query(
      `INSERT INTO orwickle_auth.accounts(full_name,email,password_hash,role)
      SELECT 'Sample '||n,'sample'||n||'@example.test',$1,'student' FROM generate_series(1,21) AS n`,
      [hash],
    );
    const list = (await admin.get('/admin/users')).body;
    assert.equal(list.total, 23);
    assert.equal(list.users.length, 20);
    assert.ok(list.users.every((item) => item.role !== 'administrator'));
    assert.ok(
      list.users.every(
        (item) => Object.keys(item).sort().join(',') === 'email,emailVerified,fullName,id,role',
      ),
    );
    const next = (await admin.get('/admin/users?page=2')).body;
    assert.equal(next.users.length, 3);
    assert.ok(next.users.every((item) => !list.users.some((first) => first.id === item.id)));
    const search = (await admin.get('/admin/users?search=USER%40EXAMPLE.TEST')).body;
    assert.deepEqual(
      search.users.map((item) => item.id),
      [data.account.id],
    );
    assert.equal((await admin.get('/admin/users?search=%25')).body.total, 0);
    for (const query of [
      'page=0',
      'page=1.5',
      'page[]=1',
      'role=administrator',
      'search=' + 'x'.repeat(101),
    ])
      assert.equal((await admin.get(`/admin/users?${query}`)).status, 400);
    await admin.patch(`/admin/users/${data.account.id}`, { ...input, role: 'administrator' }, 400);
    await admin.patch(
      `/admin/users/${data.account.id}`,
      { ...input, email: 'changed@example.test' },
      400,
    );
    await admin.patch('/admin/users/invalid', input, 400);
    await admin.patch(`/admin/users/${administrator.id}`, input, 404);
    await admin.patch('/admin/users/00000000-0000-4000-8000-000000000000', input, 404);
    const saved = await admin.patch(`/admin/users/${data.account.id}`, input);
    assert.equal(saved.user.fullName, 'Updated User');
    assert.equal((await user.get('/account')).body.account.fullName, 'Updated User');
    const pending = await h.client();
    const challenge = await pending.post('/auth/login', { email: 'user@example.test', password });
    await admin.patch(`/admin/users/${data.account.id}`, { ...input, role: 'buyer' });
    assert.equal((await user.get('/account')).status, 401);
    await pending.post(
      '/auth/login/verify',
      { challengeId: challenge.challengeId, code: h.code(challenge.challengeId) },
      400,
    );
    assert.equal((await other.get('/account')).status, 200);
    assert.equal((await admin.get('/admin/account')).status, 200);
    await h.pg.exec('SET ROLE orwickle_app');
    await h.pg.query('SELECT orwickle_auth.update_public_user($1,$2,$3)', [
      data.account.id,
      'Valid User',
      'buyer',
    ]);
    await assert.rejects(
      h.pg.query('SELECT orwickle_auth.update_public_user($1,$2,$3)', [
        data.account.id,
        'Invalid',
        'administrator',
      ]),
    );
    const protectedAdmin = await h.pg.query(
      'SELECT orwickle_auth.update_public_user($1,$2,$3) AS id',
      [administrator.id, 'Invalid', 'student'],
    );
    assert.equal(protectedAdmin.rows[0].id, null);
    await assert.rejects(
      h.pg.exec("UPDATE orwickle_auth.accounts SET role='administrator' WHERE false"),
    );
    await h.pg.exec('RESET ROLE');
  } finally {
    await h.pg.close();
  }
});
