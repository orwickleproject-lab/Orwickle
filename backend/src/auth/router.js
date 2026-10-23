import express from 'express';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import { csrfSync } from 'csrf-sync';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { HttpError } from '../middleware/errors.js';
import { accountView, createAuthService } from './service.js';

const email = z
  .email()
  .max(254)
  .transform((v) => v.toLowerCase());
const password = z.string().min(12).max(128);
const confirmed = { password, confirmPassword: password };
const matching = (v) => v.password === v.confirmPassword;
const signup = z
  .object({
    fullName: z.string().trim().min(2).max(100),
    email,
    ...confirmed,
    role: z.enum(['student', 'investor', 'buyer']),
  })
  .strict()
  .refine(matching);
const credentials = z.object({ email, password: z.string().min(1).max(128) }).strict();
const challenge = z.object({ challengeId: z.uuid(), code: z.string().regex(/^\d{6}$/) }).strict();
const resend = z
  .object({ challengeId: z.uuid(), purpose: z.enum(['signup', 'login', 'recovery']) })
  .strict();
const reset = z
  .object({ resetToken: z.string().regex(/^[A-Za-z0-9_-]{43}$/), ...confirmed })
  .strict()
  .refine(matching);
const empty = z.object({}).strict();
function body(
  schema,
  work,
  invalidMessage = 'Check the required fields. Passwords must match and contain 12–128 characters.',
) {
  return async (req, res) => {
    const value = schema.safeParse(req.body);
    if (!value.success) throw new HttpError(400, 'INVALID_INPUT', invalidMessage);
    res.json(await work(req, value.data, res));
  };
}
const regenerate = (req) =>
  new Promise((resolve, reject) =>
    req.session.regenerate((error) => (error ? reject(error) : resolve())),
  );
const save = (req) =>
  new Promise((resolve, reject) =>
    req.session.save((error) => (error ? reject(error) : resolve())),
  );
const destroy = (req) =>
  new Promise((resolve, reject) =>
    req.session.destroy((error) => (error ? reject(error) : resolve())),
  );
export function createAuthRouter({ database: db, config, mailer }) {
  const router = express.Router();
  const store = new (connectPgSimple(session))({
    pool: db.pool,
    schemaName: 'orwickle_auth',
    tableName: 'session_store',
    pruneSessionInterval: false,
    errorLog: () => console.error('Session store operation failed'),
  });
  const cookieName = config.NODE_ENV === 'production' ? '__Host-orwickle.sid' : 'orwickle.sid';
  const cookieOptions = {
    httpOnly: true,
    sameSite: 'strict',
    secure: config.NODE_ENV === 'production',
    path: '/',
  };
  router.use(
    session({
      store,
      name: cookieName,
      secret: config.SESSION_SECRET,
      resave: false,
      saveUninitialized: false,
      rolling: true,
      cookie: { ...cookieOptions, maxAge: 7 * 86400000 },
    }),
  );
  router.use((req, _res, next) => {
    if (req.get('origin') && req.get('origin') !== config.ADMIN_ORIGIN)
      return next(new HttpError(403, 'ACCESS_DENIED', 'This origin is not allowed.'));
    if (Object.keys(req.query).length && !(req.method === 'GET' && req.path === '/admin/users'))
      return next(new HttpError(400, 'INVALID_INPUT', 'Query parameters are not supported.'));
    next();
  });
  const { generateToken, csrfSynchronisedProtection } = csrfSync();
  router.get('/csrf', async (req, res) => {
    req.session.cookie.maxAge = req.session.userId ? 7 * 86400000 : 30 * 60000;
    const csrfToken = generateToken(req);
    try {
      await save(req);
    } catch (error) {
      req.session = null;
      throw error;
    }
    res.json({ csrfToken });
  });
  router.use((req, res, next) =>
    csrfSynchronisedProtection(req, res, (error) =>
      next(
        error
          ? new HttpError(403, 'CSRF_INVALID', 'This form expired. Reload and try again.')
          : undefined,
      ),
    ),
  );
  const auth = createAuthService({ database: db, mailer, pepper: config.OTP_PEPPER });
  const limiter = rateLimit({
    windowMs: 15 * 60000,
    limit: 40,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, _res, next) =>
      next(
        new HttpError(429, 'RATE_LIMITED', 'Too many attempts. Please try again in 15 minutes.'),
      ),
  });
  router.use(['/auth', '/admin/auth'], limiter);
  router.post(
    '/auth/signup',
    body(signup, (_req, input) => auth.signup(input)),
  );
  router.post(
    '/auth/signup/verify',
    body(challenge, (_req, v) => auth.verifySignup(v.challengeId, v.code)),
  );
  for (const audience of ['mobile', 'admin']) {
    const base = audience === 'admin' ? '/admin/auth' : '/auth';
    router.post(
      `${base}/login`,
      body(credentials, (_req, v) => auth.login(v, audience)),
    );
    router.post(
      `${base}/login/verify`,
      body(challenge, async (req, v) => {
        const account = await auth.verifyLogin(v.challengeId, v.code, audience);
        if (req.session.userId)
          await db.query('UPDATE orwickle_auth.sessions SET revoked_at=now() WHERE sid=$1', [
            req.sessionID,
          ]);
        await regenerate(req);
        req.session.userId = account.id;
        req.session.authVersion = account.auth_version;
        req.session.cookie.maxAge = 7 * 86400000;
        await db.query(
          'INSERT INTO orwickle_auth.sessions(account_id,sid,device_label) VALUES($1,$2,$3)',
          [account.id, req.sessionID, (req.get('user-agent') || 'Unknown device').slice(0, 180)],
        );
        const csrfToken = generateToken(req);
        await save(req);
        return { account: accountView(account), csrfToken };
      }),
    );
    router.post(
      `${base}/recovery`,
      body(z.object({ email }).strict(), (_req, v) => auth.recovery(v.email, audience)),
    );
    router.post(
      `${base}/recovery/verify`,
      body(challenge, (_req, v) => auth.verifyRecovery(v.challengeId, v.code, audience)),
    );
    router.post(
      `${base}/reset`,
      body(reset, (_req, v) => auth.reset(v.resetToken, v.password, audience)),
    );
    router.post(
      `${base}/resend`,
      body(resend, (_req, v) => {
        if (audience === 'admin' && v.purpose === 'signup')
          throw new HttpError(
            403,
            'ACCESS_DENIED',
            'Administrator accounts are provisioned separately.',
          );
        return auth.resend(v.challengeId, v.purpose, audience);
      }),
    );
  }
  async function requireAccount(req, res, next) {
    if (!req.session.userId)
      return next(
        new HttpError(
          401,
          req.get('cookie')?.includes(`${cookieName}=`) ? 'SESSION_EXPIRED' : 'AUTH_REQUIRED',
          'Please sign in to continue.',
        ),
      );
    try {
      const { rows } = await db.query(
        `SELECT a.* FROM orwickle_auth.accounts a JOIN orwickle_auth.sessions s ON s.account_id=a.id
        WHERE s.sid=$1 AND a.id=$2 AND s.revoked_at IS NULL AND s.expires_at>now() AND s.absolute_expires_at>now()
        AND a.auth_version=$3 AND a.email_verified_at IS NOT NULL`,
        [req.sessionID, req.session.userId, req.session.authVersion],
      );
      if (!rows[0]) {
        await destroy(req);
        res.clearCookie(cookieName, cookieOptions);
        return next(
          new HttpError(
            401,
            'SESSION_EXPIRED',
            'Your session expired or was revoked. Please sign in again.',
          ),
        );
      }
      req.account = rows[0];
      const { rows: touched } = await db.query(
        `UPDATE orwickle_auth.sessions SET last_seen_at=now(),
        expires_at=LEAST(now()+interval '7 days',absolute_expires_at) WHERE sid=$1 RETURNING expires_at`,
        [req.sessionID],
      );
      req.session.cookie.maxAge = Math.max(
        0,
        new Date(touched[0].expires_at).getTime() - Date.now(),
      );
      next();
    } catch (error) {
      next(error);
    }
  }
  const role = (expected) => (req, _res, next) =>
    next(
      req.account.role === expected
        ? undefined
        : new HttpError(
            403,
            'ACCESS_DENIED',
            'This account does not have permission to access this page.',
          ),
    );
  router.get('/account', requireAccount, (req, res) =>
    res.json({ account: accountView(req.account) }),
  );
  router.get('/admin/account', requireAccount, role('administrator'), (req, res) =>
    res.json({ account: accountView(req.account) }),
  );
  router.get('/admin/users', requireAccount, role('administrator'), async (req, res) => {
    const parsed = z
      .object({
        search: z.string().trim().max(100).default(''),
        page: z.coerce.number().int().min(1).max(1000000).default(1),
      })
      .strict()
      .safeParse(req.query);
    if (!parsed.success)
      throw new HttpError(400, 'INVALID_INPUT', 'Check the search text and page number.');
    const { search, page } = parsed.data;
    const filter = `role <> 'administrator' AND (strpos(lower(full_name),$1)>0 OR strpos(email,$1)>0)`;
    const [count, result] = await Promise.all([
      db.query(`SELECT count(*)::integer AS total FROM orwickle_auth.accounts WHERE ${filter}`, [
        search.toLowerCase(),
      ]),
      db.query(
        `SELECT id,full_name,email,role,email_verified_at FROM orwickle_auth.accounts
        WHERE ${filter} ORDER BY created_at DESC,id DESC LIMIT 20 OFFSET $2`,
        [search.toLowerCase(), (page - 1) * 20],
      ),
    ]);
    res.json({
      users: result.rows.map(accountView),
      total: count.rows[0].total,
      page,
      pageSize: 20,
    });
  });
  router.patch(
    '/admin/users/:id',
    requireAccount,
    role('administrator'),
    body(
      z
        .object({
          fullName: z.string().trim().min(2).max(100),
          role: z.enum(['student', 'investor', 'buyer']),
        })
        .strict(),
      async (req, input) => {
        if (!z.uuid().safeParse(req.params.id).success)
          throw new HttpError(400, 'INVALID_INPUT', 'Invalid user.');
        const user = await db.transaction(async (client) => {
          const result = await client.query(
            'SELECT orwickle_auth.update_public_user($1,$2,$3) AS id',
            [req.params.id, input.fullName, input.role],
          );
          if (!result.rows[0].id) throw new HttpError(404, 'NOT_FOUND', 'User not found.');
          const { rows } = await client.query(
            'SELECT id,full_name,email,role,email_verified_at FROM orwickle_auth.accounts WHERE id=$1',
            [result.rows[0].id],
          );
          return accountView(rows[0]);
        });
        return { user };
      },
      'Enter a name with 2–100 characters and select a public role.',
    ),
  );
  for (const name of ['student', 'investor', 'buyer'])
    router.get(`/roles/${name}`, requireAccount, role(name), (req, res) =>
      res.json({ account: accountView(req.account) }),
    );
  router.post(
    '/auth/logout',
    requireAccount,
    body(empty, async (req, _v, res) => {
      await db.transaction(async (client) => {
        await client.query(
          'UPDATE orwickle_auth.sessions SET revoked_at=now() WHERE account_id=$1 AND sid=$2 AND revoked_at IS NULL',
          [req.account.id, req.sessionID],
        );
        await client.query('DELETE FROM orwickle_auth.session_store WHERE sid=$1', [req.sessionID]);
      });
      await destroy(req);
      res.clearCookie(cookieName, cookieOptions);
      return { message: 'Signed out.' };
    }),
  );
  return router;
}
