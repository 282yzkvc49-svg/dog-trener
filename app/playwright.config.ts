import { defineConfig, devices } from 'playwright/test';

// Сценарии запускаются на собранной версии (dist/) — так проверяется и service worker.
// CHROME_PATH позволяет использовать установленный Chrome вместо `npx playwright install`.
const launchOptions = process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {};

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4173/',
    locale: 'ru-RU',
    timezoneId: 'Europe/Moscow',
    browserName: 'chromium',
    launchOptions,
    trace: 'off',
  },
  webServer: { command: 'node scripts/serve.mjs dist 4173', url: 'http://localhost:4173/', reuseExistingServer: true },
  projects: [
    { name: 'iphone', use: { ...devices['iPhone 13'], browserName: 'chromium', launchOptions } },
  ],
});
