import { readFileSync } from 'node:fs';
import pg from 'pg';

export function createDatabase(config) {
  if (!config.DATABASE_URL) {
    return {
      configured: false,
      async check() { throw new Error('Database not configured'); },
      async close() {},
    };
  }

  const url = new URL(config.DATABASE_URL);
  const pool = new pg.Pool({
    host: url.hostname,
    port: Number(url.port || 5432),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: decodeURIComponent(url.pathname.slice(1)),
    ssl: {
      rejectUnauthorized: true,
      ...(config.DATABASE_SSL_CA_FILE
        ? { ca: readFileSync(config.DATABASE_SSL_CA_FILE, 'utf8') }
        : {}),
    },
    max: config.DATABASE_POOL_MAX,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30000,
    statement_timeout: 5000,
    query_timeout: 6000,
    application_name: 'orwickle-backend',
  });

  // An idle connection failure must not crash the server or log credentials.
  pool.on('error', () => console.error('Idle database connection failed'));

  return {
    configured: true,
    pool,
    async check() {
      const client = await pool.connect();
      try {
        const result = await client.query('SELECT 1 AS ok, CURRENT_TIMESTAMP AS checked_at');
        const tls = client.connection.stream;
        if (result.rows[0]?.ok !== 1 || !tls.encrypted || !tls.authorized) {
          throw new Error('Database verification failed');
        }
        return { tls: true, checkedAt: result.rows[0].checked_at.toISOString() };
      } finally {
        client.release();
      }
    },
    // Used by trusted setup scripts only. Never expose arbitrary queries in an API.
    query(text, parameters) { return pool.query(text, parameters); },
    async transaction(work) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await work(client);
        await client.query('COMMIT');
        return result;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally { client.release(); }
    },
    close() { return pool.end(); },
  };
}
