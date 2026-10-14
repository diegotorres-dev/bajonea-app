import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';

const PROJECT_ROOT = path.resolve(__dirname, '../..');
const FRONTEND_URL = process.env.E2E_FRONTEND_URL || 'http://localhost:5501';
const PUERTO_FRONTEND_POR_DEFECTO = '5501';
const usaFrontendPorDefecto = new URL(FRONTEND_URL).port === PUERTO_FRONTEND_POR_DEFECTO;

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [
    ['list'],
    ['html', { open: 'never' }],
    ['json', { outputFile: process.env.PW_JSON_OUTPUT || 'reportes/resultados.json' }],
  ],
  use: {
    baseURL: FRONTEND_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: usaFrontendPorDefecto
    ? {
        command: `python .claude/scripts/dev-server-no-cache.py ${PUERTO_FRONTEND_POR_DEFECTO} frontend`,
        cwd: PROJECT_ROOT,
        url: FRONTEND_URL,
        reuseExistingServer: true,
        timeout: 10_000,
      }
    : undefined,
});
