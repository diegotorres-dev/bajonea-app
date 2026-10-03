import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';

const PROJECT_ROOT = path.resolve(__dirname, '../..');
const FRONTEND_URL = process.env.E2E_FRONTEND_URL || 'http://localhost:5501';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: 'html',
  use: {
    baseURL: FRONTEND_URL,
    trace: 'on-first-retry',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: {
    command: 'python .claude/scripts/dev-server-no-cache.py 5501 frontend',
    cwd: PROJECT_ROOT,
    url: FRONTEND_URL,
    reuseExistingServer: true,
    timeout: 10_000,
  },
});
