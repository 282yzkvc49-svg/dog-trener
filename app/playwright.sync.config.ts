import { defineConfig, devices } from 'playwright/test';

// Общая собака: два «телефона» (два контекста браузера) и заглушка Supabase.
// Сборка для этих тестов — dist-e2e, указывает на заглушку и опрашивает облако каждые 1,5 с:
//   OUT_DIR=dist-e2e SUPABASE_URL=http://127.0.0.1:54400 SUPABASE_ANON_KEY=sb_publishable_e2e_key_000000 SYNC_POLL_MS=1500 node scripts/build.mjs
const launchOptions = process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {};

export default defineConfig({
  testDir: 'tests/sync',
  timeout: 120_000,
  workers: 1,
  reporter: [['list']],
  use: {
    ...devices['iPhone 13'],
    browserName: 'chromium',
    baseURL: 'http://localhost:4174/',
    locale: 'ru-RU',
    timezoneId: 'Europe/Moscow',
    launchOptions,
    trace: 'off',
  },
  webServer: { command: 'node scripts/serve.mjs dist-e2e 4174', url: 'http://localhost:4174/', reuseExistingServer: true },
});
