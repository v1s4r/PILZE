import { defineConfig } from '@playwright/test';

const PORT = 8765;

export default defineConfig({
  testDir: '.',
  testMatch: /.*\.spec\.mjs/,
  timeout: 60_000,
  retries: 0,
  outputDir: './test-results',
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    viewport: { width: 1280, height: 800 },
    locale: 'de-CH',
    timezoneId: 'Europe/Zurich',
    // Lokaler Chromium-Pfad, falls Playwright den eigenen Browser nicht findet (z. B. PW_CHROMIUM=/opt/pw-browsers/chromium)
    launchOptions: process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {},
  },
  webServer: {
    command: `python3 -m http.server ${PORT} --bind 127.0.0.1`,
    cwd: '..',
    port: PORT,
    reuseExistingServer: true,
    timeout: 15_000,
  },
});
