import React from 'react';
import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from './main.jsx';
import { ApiError } from './api.js';
afterEach(cleanup);
test('administrator login requires a code before opening the account', async () => {
  let authenticated = false;
  const api = {
    call: vi.fn(async (path) => {
      if (path === '/admin/account') {
        if (!authenticated) throw new ApiError('Sign in', 401);
        return {
          account: { fullName: 'Test Admin', email: 'admin@example.test', role: 'administrator' },
        };
      }
      if (path === '/admin/auth/login')
        return {
          challengeId: 'test',
          resendAt: new Date(Date.now() + 60000).toISOString(),
          resendsRemaining: 3,
        };
      if (path === '/admin/auth/login/verify') {
        authenticated = true;
        return {};
      }
      if (path === '/sessions') return { sessions: [] };
      throw new Error('Unexpected route');
    }),
  };
  render(<App api={api} />);
  await screen.findByRole('heading', { name: 'Welcome back.' });
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('Email address'), 'admin@example.test');
  await user.type(
    screen.getByLabelText('Password', { selector: 'input' }),
    'example-test-password',
  );
  await user.click(screen.getByRole('button', { name: /Continue with email code/ }));
  await screen.findByRole('heading', { name: 'Check your inbox.' });
  expect(screen.queryByText('Test Admin')).toBeNull();
  await user.type(screen.getByLabelText('Email verification code'), '123456');
  await user.click(screen.getByRole('button', { name: /Verify code/ }));
  await screen.findByText('Test Admin');
  expect(api.call.mock.calls.some(([path]) => path === '/admin/auth/login/verify')).toBe(true);
});
test('an ended session returns to login with a clear message', async () => {
  let expired = false;
  const api = {
    call: vi.fn(async (path) => {
      if (expired) throw new ApiError('Your session expired or was revoked.', 401);
      if (path === '/admin/account')
        return { account: { fullName: 'Test Admin', email: 'admin@example.test' } };
      if (path === '/sessions') return { sessions: [] };
    }),
  };
  render(<App api={api} />);
  await screen.findByText('Test Admin');
  expired = true;
  await userEvent.click(screen.getByRole('button', { name: 'Refresh' }));
  await screen.findByRole('heading', { name: 'Welcome back.' });
  expect(screen.getByRole('status').textContent).toContain('session expired');
});
