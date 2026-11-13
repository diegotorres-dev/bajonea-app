import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './capturas',
  fullyParallel: false,
  workers: 1,
  timeout: 1_800_000,
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_FRONTEND_URL || 'http://localhost:5501',
    ...devices['Desktop Chrome'],
  },
});
