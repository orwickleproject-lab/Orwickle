import React from 'react';
import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from './main.jsx';
import { ApiError } from './api.js';
afterEach(cleanup);
test('administrator login requires a code before user management; normal sign out remains', async () => {
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
      if (path === '/auth/logout') {
        authenticated = false;
        return {};
      }
      if (path.startsWith('/admin/users?')) return { users: [], total: 0, page: 1, pageSize: 20 };
      throw new Error('Unexpected route');
    }),
  };
  render(<App api={api} />);
  await screen.findByRole('heading', { name: 'Admin sign in' });
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('Email address'), 'admin@example.test');
  await user.type(
    screen.getByLabelText('Password', { selector: 'input' }),
    'example-test-password',
  );
  await user.click(screen.getByRole('button', { name: 'Continue', exact: true }));
  await screen.findByRole('heading', { name: 'Verify email' });
  expect(screen.queryByRole('heading', { name: 'Users' })).toBeNull();
  expect(api.call.mock.calls.some(([path]) => path.startsWith('/admin/users'))).toBe(false);
  await user.type(screen.getByLabelText('Email verification code'), '123456');
  await user.click(screen.getByRole('button', { name: /Verify code/ }));
  await screen.findByText('No users found.');
  expect(api.call.mock.calls.some(([path]) => path === '/admin/auth/login/verify')).toBe(true);
  expect(screen.queryByText('Active sessions')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Refresh' })).toBeNull();
  expect(screen.queryByText('Sign out other sessions')).toBeNull();
  expect(api.call.mock.calls.some(([path]) => path.startsWith('/sessions'))).toBe(false);
  await user.click(screen.getByRole('button', { name: 'Sign out', exact: true }));
  await screen.findByRole('heading', { name: 'Admin sign in' });
  expect(authenticated).toBe(false);
  expect(api.call).toHaveBeenCalledWith('/auth/logout', {});
});
test('an ended session returns to login with a clear message', async () => {
  let expired = false;
  const api = {
    call: vi.fn(async (path) => {
      if (expired) throw new ApiError('Your session expired or was revoked.', 401);
      if (path === '/admin/account')
        return { account: { fullName: 'Test Admin', email: 'admin@example.test' } };
      if (path.startsWith('/admin/users?')) return { users: [], total: 0, page: 1, pageSize: 20 };
    }),
  };
  render(<App api={api} />);
  await screen.findByText('No users found.');
  expired = true;
  await userEvent.click(screen.getByRole('button', { name: 'Sign out', exact: true }));
  await screen.findByRole('heading', { name: 'Admin sign in' });
  expect(screen.getByRole('status').textContent).toContain('session expired');
});

test('users can be searched and edited; a failed save keeps the draft available', async () => {
  let entry = {
    id: 'user-id',
    fullName: 'Sample User',
    email: 'user@example.test',
    role: 'student',
    emailVerified: true,
  };
  let failSave = true;
  const api = {
    call: vi.fn(async (path, body, method) => {
      if (path === '/admin/account')
        return { account: { fullName: 'Admin', email: 'admin@example.test' } };
      if (path.startsWith('/admin/users?')) {
        const params = new URLSearchParams(path.split('?')[1]);
        const users = entry.email.includes(params.get('search')) ? [entry] : [];
        return { users, total: users.length, page: 1, pageSize: 20 };
      }
      if (path === '/admin/users/user-id' && method === 'PATCH') {
        if (failSave) throw new ApiError('Could not save. Try again.', 503);
        entry = { ...entry, ...body };
        return { user: entry };
      }
      throw new Error('Unexpected route');
    }),
  };
  render(<App api={api} />);
  const user = userEvent.setup();
  await screen.findByText('Sample User');
  await user.type(screen.getByRole('searchbox'), 'missing');
  await user.click(screen.getByRole('button', { name: 'Search', exact: true }));
  await screen.findByText('No users found.');
  await user.clear(screen.getByRole('searchbox'));
  await user.type(screen.getByRole('searchbox'), 'user@example.test');
  await user.click(screen.getByRole('button', { name: 'Search', exact: true }));
  await screen.findByText('Sample User');
  await user.click(screen.getByRole('button', { name: 'Edit Sample User' }));
  expect(screen.getAllByRole('option').map((option) => option.value)).toEqual([
    'student',
    'investor',
    'buyer',
  ]);
  await user.clear(screen.getByLabelText('Full name'));
  await user.type(screen.getByLabelText('Full name'), 'Changed User');
  await user.selectOptions(screen.getByLabelText('Role'), 'buyer');
  await user.click(screen.getByRole('button', { name: 'Save changes' }));
  expect((await screen.findByRole('alert')).textContent).toContain('Could not save');
  expect(screen.getByLabelText('Full name').value).toBe('Changed User');
  failSave = false;
  await user.click(screen.getByRole('button', { name: 'Save changes' }));
  await screen.findByText('User updated.');
  expect(screen.queryByRole('form', { name: 'Edit user' })).toBeNull();
  expect(screen.getByText('Changed User')).toBeTruthy();
  expect(screen.getByText('Buyer')).toBeTruthy();
  expect(api.call).toHaveBeenCalledWith(
    '/admin/users/user-id',
    { fullName: 'Changed User', role: 'buyer' },
    'PATCH',
  );
});
