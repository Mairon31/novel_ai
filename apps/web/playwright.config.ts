import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 25000,
  expect: { timeout: 12000 },
  retries: 0,
  workers: 1,
  reporter: 'list',
  use: { baseURL: process.env.NOBLE_E2E_BASE_URL || 'http://127.0.0.1:5173', screenshot: 'on', trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'mobile', use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  ],
});
