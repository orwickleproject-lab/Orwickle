import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './e2e',
  outputDir: '../.local/admin-test-results',
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5173',
    channel: 'chrome',
    headless: true,
    trace: 'off',
    video: 'off',
  },
  webServer: {
    command: 'npm.cmd run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 30000,
  },
});
