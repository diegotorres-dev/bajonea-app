import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';

// Raíz del subproyecto "03. Implementación" (dos niveles arriba de testing/playwright/),
// donde viven frontend/ y .claude/scripts/dev-server-no-cache.py.
const PROJECT_ROOT = path.resolve(__dirname, '../..');
const FRONTEND_URL = 'http://localhost:5501';

// El backend NO se levanta acá vía webServer: tiene que estar corriendo a mano contra
// bajonea_test (perfil "test", puerto 8080 -- mismo puerto que el backend de desarrollo
// contra bajonea, así que solo uno de los dos puede estar levantado a la vez). Ver
// testing/playwright/README.md y docs/DECISIONES.md para el comando exacto y el reset previo.

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
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

  // Levanta el mismo servidor estático sin caché que ya usa .claude/launch.json (config
  // "frontend") si todavía no está corriendo -- reuseExistingServer evita duplicarlo si
  // Diego ya lo tiene abierto por su cuenta (Browser pane de Claude Code u otra terminal).
  webServer: {
    command: 'python .claude/scripts/dev-server-no-cache.py 5501 frontend',
    cwd: PROJECT_ROOT,
    url: FRONTEND_URL,
    reuseExistingServer: true,
    timeout: 10_000,
  },
});
