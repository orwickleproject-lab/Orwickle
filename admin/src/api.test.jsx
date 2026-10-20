import { expect, test, vi } from 'vitest';
import { createApi } from './api.js';
test('a failed session bootstrap shows the service error and never submits credentials', async () => {
  const fetcher = vi.fn(async () => ({
    ok: false,
    status: 503,
    json: async () => ({
      error: { code: 'SERVICE_UNAVAILABLE', message: 'The service is temporarily unavailable.' },
    }),
  }));
  const api = createApi(fetcher);
  await expect(
    api.call('/admin/auth/login', {
      email: 'admin@example.test',
      password: 'fixture-only password',
    }),
  ).rejects.toMatchObject({
    status: 503,
    code: 'SERVICE_UNAVAILABLE',
    message: 'The service is temporarily unavailable.',
  });
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(fetcher.mock.calls[0][0]).toBe('/api/csrf');
});
