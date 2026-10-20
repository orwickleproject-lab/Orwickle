import { test, expect } from '@playwright/test';
test('responsive administrator screens validate and preserve the OTP gate', async ({ page }) => {
  let signedIn = false;
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
    } else if (path === '/api/sessions')
      body = {
        sessions: [
          {
            id: 'fixture-session',
            deviceLabel: 'Chrome · This computer',
            isCurrent: true,
            lastSeenAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 86400000).toISOString(),
          },
        ],
      };
    await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Welcome back.' })).toBeVisible();
  await page.screenshot({ path: '../.local/admin-login-desktop.png', fullPage: true });
  await page.getByLabel('Email address').fill('admin@example.test');
  await page.getByLabel('Password', { exact: true }).fill('fixture-only long password');
  await page.getByRole('button', { name: /Continue with email code/ }).click();
  await expect(page.getByRole('heading', { name: 'Check your inbox.' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Your account.' })).toHaveCount(0);
  await page.getByLabel('Email verification code').fill('123456');
  await page.getByRole('button', { name: /Verify code/ }).click();
  await expect(page.getByRole('heading', { name: 'Your account.' })).toBeVisible();
  await page.screenshot({ path: '../.local/admin-account-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: '../.local/admin-account-mobile.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});
