import { createHmac, randomInt, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import argon2 from 'argon2';
import { HttpError } from '../middleware/errors.js';

export const passwordOptions = {
  type: argon2.argon2id,
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 1,
};
export const hashPassword = (password) => argon2.hash(password, passwordOptions);
const failure = () =>
  new HttpError(400, 'INVALID_CODE', 'This code is incorrect, expired, or already used.');
export function accountView(row) {
  return {
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    role: row.role,
    emailVerified: Boolean(row.email_verified_at),
  };
}

export function createAuthService({ database: db, mailer, pepper }) {
  const digest = (...values) => createHmac('sha256', pepper).update(values.join(':')).digest('hex');
  const codeHash = (row, code) =>
    digest(row.id, row.purpose, row.audience, row.account_id || 'decoy', code);
  let dummyHash;
  const dummy = async () => (dummyHash ||= await hashPassword(randomBytes(32).toString('hex')));
  async function limit(email, action, max) {
    const key = digest('limit', action, email);
    const { rows } = await db.query(
      `INSERT INTO orwickle_auth.rate_buckets(key,count,expires_at)
      VALUES ($1,1,now()+interval '1 hour') ON CONFLICT(key) DO UPDATE SET
      count=CASE WHEN rate_buckets.expires_at<now() THEN 1 ELSE rate_buckets.count+1 END,
      expires_at=CASE WHEN rate_buckets.expires_at<now() THEN now()+interval '1 hour' ELSE rate_buckets.expires_at END
      RETURNING count`,
      [key],
    );
    if (rows[0].count > max)
      throw new HttpError(429, 'RATE_LIMITED', 'Too many attempts. Please try again in an hour.');
  }
  const find = async (email) =>
    (await db.query('SELECT * FROM orwickle_auth.accounts WHERE email=$1', [email])).rows[0];
  function challengeView(row) {
    return {
      challengeId: row.id,
      purpose: row.purpose,
      expiresAt: row.expires_at,
      resendAt: new Date(new Date(row.sent_at).getTime() + 60000).toISOString(),
      resendsRemaining: 3 - row.resends,
    };
  }
  async function issue(account, purpose, audience, expectedHash) {
    if (!mailer.configured)
      throw new HttpError(
        503,
        'EMAIL_UNAVAILABLE',
        'Email delivery needs local sender configuration.',
      );
    const code = String(randomInt(1000000)).padStart(6, '0');
    const row = await db.transaction(async (client) => {
      if (account) {
        const fresh = (
          await client.query('SELECT * FROM orwickle_auth.accounts WHERE id=$1 FOR UPDATE', [
            account.id,
          ])
        ).rows[0];
        if (!fresh || (expectedHash && fresh.password_hash !== expectedHash))
          throw new HttpError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.');
      }
      const item = { id: randomUUID(), purpose, audience, account_id: account?.id || null };
      const { rows } = await client.query(
        `INSERT INTO orwickle_auth.challenges(id,account_id,purpose,audience,code_hash,expires_at)
        VALUES($1,$2,$3,$4,$5,now()+interval '10 minutes') RETURNING *`,
        [item.id, item.account_id, purpose, audience, codeHash(item, code)],
      );
      return rows[0];
    });
    try {
      if (account) await mailer.send({ email: account.email, code, purpose, id: row.id });
    } catch (error) {
      await db.query('UPDATE orwickle_auth.challenges SET consumed_at=now() WHERE id=$1', [row.id]);
      throw error;
    }
    return challengeView(row);
  }
  async function consume(id, purpose, audience, code, onValid) {
    const result = await db.transaction(async (client) => {
      const row = (
        await client.query('SELECT * FROM orwickle_auth.challenges WHERE id=$1 FOR UPDATE', [id])
      ).rows[0];
      if (
        !row ||
        row.purpose !== purpose ||
        row.audience !== audience ||
        row.consumed_at ||
        row.attempts >= 5 ||
        new Date(row.expires_at) <= new Date()
      )
        return null;
      await client.query('UPDATE orwickle_auth.challenges SET attempts=attempts+1 WHERE id=$1', [
        id,
      ]);
      const actual = Buffer.from(codeHash(row, code), 'hex');
      const expected = Buffer.from(row.code_hash, 'hex');
      if (!timingSafeEqual(actual, expected) || !row.account_id) return null;
      const account = (
        await client.query('SELECT * FROM orwickle_auth.accounts WHERE id=$1 FOR UPDATE', [
          row.account_id,
        ])
      ).rows[0];
      if (
        !account ||
        (audience === 'admin' ? account.role !== 'administrator' : account.role === 'administrator')
      )
        return null;
      await client.query('UPDATE orwickle_auth.challenges SET consumed_at=now() WHERE id=$1', [id]);
      return onValid(client, account);
    });
    if (!result) throw failure();
    return result;
  }
  return {
    async signup(input) {
      await limit(input.email, 'signup', 5);
      if (!mailer.configured)
        throw new HttpError(
          503,
          'EMAIL_UNAVAILABLE',
          'Email delivery needs local sender configuration.',
        );
      let account = await find(input.email);
      if (account) {
        if (account.email_verified_at || account.role === 'administrator')
          throw new HttpError(
            409,
            'ACCOUNT_EXISTS',
            'This email is already registered. Sign in or reset your password.',
          );
        // A repeated signup never changes a pending account's password or selected role.
        const valid = await argon2.verify(account.password_hash, input.password);
        if (!valid || account.role !== input.role)
          throw new HttpError(
            409,
            'ACCOUNT_EXISTS',
            'This signup is already pending. Use the original password or reset it after verification.',
          );
      } else {
        const hash = await hashPassword(input.password);
        try {
          const { rows } = await db.query(
            'SELECT orwickle_auth.register_public_account($1,$2,$3,$4) AS id',
            [input.fullName, input.email, hash, input.role],
          );
          account = await find(input.email);
          if (account.id !== rows[0].id) throw new Error('Account mismatch');
        } catch (error) {
          if (error.code === '23505')
            throw new HttpError(409, 'ACCOUNT_EXISTS', 'This email is already registered.');
          throw error;
        }
      }
      return issue(account, 'signup', 'mobile');
    },
    async login(input, audience) {
      await limit(input.email, 'login', 12);
      const account = await find(input.email);
      const valid = await argon2.verify(account?.password_hash || (await dummy()), input.password);
      if (
        !account ||
        !valid ||
        !account.email_verified_at ||
        (audience === 'admin' ? account.role !== 'administrator' : account.role === 'administrator')
      ) {
        throw new HttpError(
          401,
          'INVALID_CREDENTIALS',
          'Email or password is incorrect, or the account is not verified for this sign-in.',
        );
      }
      return issue(account, 'login', audience, account.password_hash);
    },
    async recovery(email, audience) {
      await limit(email, 'recovery', 5);
      const account = await find(email);
      const eligible =
        account?.email_verified_at &&
        (audience === 'admin'
          ? account.role === 'administrator'
          : account.role !== 'administrator');
      return issue(eligible ? account : null, 'recovery', audience);
    },
    async resend(id, purpose, audience) {
      const result = await db.transaction(async (client) => {
        const row = (
          await client.query('SELECT * FROM orwickle_auth.challenges WHERE id=$1 FOR UPDATE', [id])
        ).rows[0];
        if (
          !row ||
          row.purpose !== purpose ||
          row.audience !== audience ||
          row.consumed_at ||
          row.attempts >= 5 ||
          new Date(row.created_at).getTime() + 1800000 <= Date.now()
        )
          throw failure();
        if (row.resends >= 3 || new Date(row.sent_at).getTime() + 60000 > Date.now())
          throw new HttpError(
            429,
            'RESEND_LIMITED',
            'Please wait before resending. A request allows three resends.',
          );
        const account =
          row.account_id &&
          (
            await client.query('SELECT email FROM orwickle_auth.accounts WHERE id=$1', [
              row.account_id,
            ])
          ).rows[0];
        const code = String(randomInt(1000000)).padStart(6, '0');
        // Reserve this resend before delivery; failures also count toward the cap.
        const updated = (
          await client.query(
            `UPDATE orwickle_auth.challenges SET code_hash=$2,
          resends=resends+1,sent_at=now(),expires_at=LEAST(now()+interval '10 minutes',created_at+interval '30 minutes') WHERE id=$1 RETURNING *`,
            [id, codeHash(row, code)],
          )
        ).rows[0];
        return { account, code, updated };
      });
      if (result.account)
        await mailer.send({ email: result.account.email, code: result.code, purpose, id });
      return challengeView(result.updated);
    },
    verifySignup: (id, code) =>
      consume(id, 'signup', 'mobile', code, async (client, account) => {
        await client.query(
          'UPDATE orwickle_auth.accounts SET email_verified_at=COALESCE(email_verified_at,now()),updated_at=now() WHERE id=$1',
          [account.id],
        );
        return { message: 'Email verified. Sign in with your password to continue.' };
      }),
    verifyLogin: (id, code, audience) =>
      consume(id, 'login', audience, code, async (_client, account) => account),
    verifyRecovery: (id, code, audience) =>
      consume(id, 'recovery', audience, code, async (client, account) => {
        const token = randomBytes(32).toString('base64url');
        await client.query(
          `INSERT INTO orwickle_auth.reset_grants(token_hash,account_id,expires_at) VALUES($1,$2,now()+interval '5 minutes')`,
          [digest('reset', token), account.id],
        );
        return { resetToken: token, expiresInSeconds: 300 };
      }),
    async reset(token, password, audience) {
      const hash = await hashPassword(password);
      const ok = await db.transaction(async (client) => {
        const grant = (
          await client.query(
            `SELECT g.*,a.role FROM orwickle_auth.reset_grants g JOIN orwickle_auth.accounts a ON a.id=g.account_id
          WHERE token_hash=$1 FOR UPDATE OF g`,
            [digest('reset', token)],
          )
        ).rows[0];
        if (
          !grant ||
          grant.consumed_at ||
          new Date(grant.expires_at) <= new Date() ||
          (audience === 'admin' ? grant.role !== 'administrator' : grant.role === 'administrator')
        )
          return false;
        await client.query(
          'UPDATE orwickle_auth.accounts SET password_hash=$2,auth_version=auth_version+1,updated_at=now() WHERE id=$1',
          [grant.account_id, hash],
        );
        await client.query(
          'UPDATE orwickle_auth.reset_grants SET consumed_at=now() WHERE account_id=$1',
          [grant.account_id],
        );
        await client.query(
          'UPDATE orwickle_auth.challenges SET consumed_at=now() WHERE account_id=$1',
          [grant.account_id],
        );
        await client.query(
          'DELETE FROM orwickle_auth.session_store WHERE sid IN (SELECT sid FROM orwickle_auth.sessions WHERE account_id=$1)',
          [grant.account_id],
        );
        await client.query(
          'UPDATE orwickle_auth.sessions SET revoked_at=now() WHERE account_id=$1 AND revoked_at IS NULL',
          [grant.account_id],
        );
        return true;
      });
      if (!ok)
        throw new HttpError(
          400,
          'RESET_EXPIRED',
          'Password reset has expired or already been used. Request a new recovery code.',
        );
      return { message: 'Password updated. Sign in again.' };
    },
  };
}
