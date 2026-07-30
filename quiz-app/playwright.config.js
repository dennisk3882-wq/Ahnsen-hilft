'use strict';

const { defineConfig } = require('@playwright/test');

const productionSmoke = process.env.QUIZTIME_PRODUCTION_SMOKE === '1';
const baseURL = String(process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');

module.exports = defineConfig({
  testDir: './e2e',
  testIgnore: productionSmoke ? [] : ['**/production-smoke.spec.js'],
  testMatch: productionSmoke ? ['**/production-smoke.spec.js'] : ['**/*.spec.js'],
  fullyParallel: false,
  workers: 1,
  retries: productionSmoke ? 2 : 1,
  timeout: 60_000,
  expect: { timeout: 12_000 },
  reporter: [
    ['line'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
  ],
  use: {
    baseURL,
    locale: 'de-DE',
    timezoneId: 'Europe/Berlin',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 12_000,
    navigationTimeout: 30_000,
  },
  outputDir: 'test-results',
  webServer: productionSmoke ? undefined : {
    command: 'node start.js',
    url: `${baseURL}/health`,
    timeout: 120_000,
    reuseExistingServer: false,
    env: {
      ...process.env,
      NODE_ENV: 'test',
      APP_BASE_URL: baseURL,
      QUIZTIME_E2E_BROWSER_STATUS: 'success',
    },
  },
});
