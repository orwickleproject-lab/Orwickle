import assert from 'node:assert/strict';
import { test } from 'node:test';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { createDatabase } from '../src/db.js';

const unconfigured = { configured: false, async check() { throw new Error('Do not call'); } };

test('liveness is independent of PostgreSQL and sends security headers', async () => {
  const response = await request(createApp({ database: unconfigured })).get('/health/live');
  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { status: 'ok', service: 'orwickle-backend' });
  assert.ok(response.headers['x-request-id']);
  assert.equal(response.headers['x-powered-by'], undefined);
  assert.equal(response.headers['cache-control'], 'no-store');
  assert.equal(response.headers['x-content-type-options'], 'nosniff');
});

test('readiness honestly reports missing database configuration', async () => {
  const response = await request(createApp({ database: unconfigured })).get('/health/ready');
  assert.equal(response.status, 503);
  assert.equal(response.body.error.code, 'DATABASE_NOT_CONFIGURED');
});

test('readiness runs the database check before returning success', async () => {
  let checks = 0;
  const database = { configured: true, async check() {
    checks += 1;
    return { tls: true, checkedAt: '2026-10-20T00:00:00.000Z' };
  } };
  const response = await request(createApp({ database })).get('/health/ready');
  assert.equal(checks, 1);
  assert.equal(response.status, 200);
  assert.equal(response.body.database, 'ok');
  assert.equal(response.body.tls, true);
});

test('database errors never expose secrets, hosts, SQL, or stack traces', async () => {
  const database = { configured: true, async check() {
    throw new Error('postgresql://admin:secret@private-db:5432/postgres');
  } };
  const response = await request(createApp({ database })).get('/health/ready');
  assert.equal(response.status, 503);
  assert.equal(response.body.error.code, 'DATABASE_UNAVAILABLE');
  assert.doesNotMatch(response.text, /secret|private-db|postgresql|stack/);
});

test('unknown routes and unexpected inputs have structured errors', async () => {
  const app = createApp({ database: unconfigured });
  const missing = await request(app).get('/missing');
  assert.equal(missing.status, 404);
  assert.equal(missing.body.error.code, 'NOT_FOUND');
  const invalid = await request(app).get('/health/live?sql=SELECT%201');
  assert.equal(invalid.status, 400);
  assert.equal(invalid.body.error.code, 'INVALID_INPUT');
});

test('malformed and oversized JSON are rejected without echoing bodies', async () => {
  const app = createApp({ database: unconfigured });
  const malformed = await request(app).post('/missing').set('Content-Type', 'application/json').send('{secret');
  assert.equal(malformed.status, 400);
  assert.equal(malformed.body.error.code, 'INVALID_JSON');
  assert.doesNotMatch(malformed.text, /secret/);
  const large = await request(app).post('/missing').send({ data: 'x'.repeat(17000) });
  assert.equal(large.status, 413);
  assert.equal(large.body.error.code, 'BODY_TOO_LARGE');
});

test('rate limiting bounds public health endpoint traffic', async () => {
  const app = createApp({ database: unconfigured });
  for (let i = 0; i < 120; i += 1) await request(app).get('/health/live').expect(200);
  const response = await request(app).get('/health/live');
  assert.equal(response.status, 429);
  assert.equal(response.body.error.code, 'RATE_LIMITED');
});

test('environment validation rejects malformed values without leaking them', () => {
  assert.equal(loadConfig({}).PORT, 3000);
  assert.equal(loadConfig({ DATABASE_URL: '' }).DATABASE_URL, undefined);
  for (const environment of [
    { PORT: '0' }, { PORT: '3000.5' }, { DATABASE_POOL_MAX: '999' },
    { NODE_ENV: 'production' }, { DATABASE_URL: 'https://admin:secret@host/db' },
    { DATABASE_URL: 'postgresql://admin:secret@host/db?sslmode=disable' },
  ]) {
    assert.throws(() => loadConfig(environment), (error) => {
      assert.match(error.message, /Invalid environment configuration/);
      assert.doesNotMatch(error.message, /secret|postgresql|https/);
      return true;
    });
  }
});

test('unconfigured database never returns fake query results', async () => {
  const database = createDatabase(loadConfig({}));
  assert.equal(database.configured, false);
  await assert.rejects(database.check(), /not configured/);
  await database.close();
});
