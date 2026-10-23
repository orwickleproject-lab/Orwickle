import { test, expect } from '@playwright/test';
test('simple user management preserves the OTP gate and works on desktop and mobile', async ({
  page,
}) => {
  let signedIn = false;
  let users = [
    {
      id: 'student',
      fullName: 'Sample Student',
      email: 'student@example.test',
      role: 'student',
      emailVerified: true,
    },
    {
      id: 'investor',
      fullName: 'Sample Investor',
      email: 'investor@example.test',
      role: 'investor',
      emailVerified: true,
    },
    {
      id: 'buyer',
      fullName: 'Sample Buyer',
      email: 'buyer.with.a.long.address@example.test',
      role: 'buyer',
      emailVerified: false,
    },
  ];
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    let status = 200,
      body = {};
    if (path === '/api/admin/account') {
      if (!signedIn) {
        status = 401;
        body = { error: { code: 'SESSION_EXPIRED', message: 'Please sign in.' } };
      } else
        body = {
          account: {
            id: 'fixture',
            fullName: 'Orwickle Administrator',
            email: 'admin@example.test',
            role: 'administrator',
            emailVerified: true,
          },
        };
    } else if (path === '/api/csrf') body = { csrfToken: 'fixture-csrf' };
    else if (path === '/api/admin/auth/login')
      body = {
        challengeId: 'fixture',
        resendAt: new Date(Date.now() + 60000).toISOString(),
        resendsRemaining: 3,
      };
    else if (path === '/api/admin/auth/login/verify') {
      signedIn = true;
      body = { csrfToken: 'fixture-next' };
    } else if (path === '/api/admin/users' && signedIn) {
      const query = new URL(route.request().url()).searchParams.get('search')?.toLowerCase() || '';
      const matches = users.filter((user) =>
        `${user.fullName} ${user.email}`.toLowerCase().includes(query),
      );
      body = { users: matches, total: matches.length, page: 1, pageSize: 20 };
    } else if (
      path === '/api/admin/users/student' &&
      route.request().method() === 'PATCH' &&
      signedIn
    ) {
      const update = route.request().postDataJSON();
      users = users.map((user) => (user.id === 'student' ? { ...user, ...update } : user));
      body = { user: users[0] };
    } else if (path === '/api/auth/logout') signedIn = false;
    else status = 404;
    await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Admin sign in' })).toBeVisible();
  await page.screenshot({ path: '../.local/admin-login-desktop.png', fullPage: true });
  await page.getByLabel('Email address').fill('admin@example.test');
  await page.getByLabel('Password', { exact: true }).fill('fixture-only long password');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Verify email' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Users', exact: true })).toHaveCount(0);
  await page.getByLabel('Email verification code').fill('123456');
  await page.getByRole('button', { name: /Verify code/ }).click();
  await expect(page.getByRole('heading', { name: 'Users', exact: true })).toBeVisible();
  await expect(page.getByText('Sample Student', { exact: true })).toBeVisible();
  await expect(page.getByText('Active sessions')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible();
  await page.screenshot({ path: '../.local/admin-account-desktop.png', fullPage: true });
  await page.getByRole('searchbox').fill('not found');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page.getByText('No users found.')).toBeVisible();
  await page.getByRole('searchbox').fill('');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await page.getByRole('button', { name: 'Edit Sample Student' }).click();
  await page.getByLabel('Full name').fill('Updated Student');
  await page.getByLabel('Role', { exact: true }).selectOption('buyer');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('User updated.')).toBeVisible();
  await expect(page.getByRole('row').filter({ hasText: 'Updated Student' })).toContainText('Buyer');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: '../.local/admin-account-mobile.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Admin sign in' })).toBeVisible();
});
