import { test as base, expect } from '@playwright/test';
import type { BrowserContext } from '@playwright/test';

const DEBE_BLOQUEAR = process.env.BLOQUEAR_FUENTES !== '0';
const BLOQUEADOS = new WeakSet<BrowserContext>();

export async function bloquearFuentes(contexto: BrowserContext): Promise<void> {
  if (!DEBE_BLOQUEAR || BLOQUEADOS.has(contexto)) {
    return;
  }
  BLOQUEADOS.add(contexto);
  await contexto.route(/^https:\/\/fonts\.googleapis\.com\//, (ruta) =>
    ruta.fulfill({ status: 200, contentType: 'text/css', body: '' }),
  );
  await contexto.route(/^https:\/\/fonts\.gstatic\.com\//, (ruta) => ruta.abort());
}

export const test = base.extend({
  browser: [
    async ({ browser }, use) => {
      const crearContexto = browser.newContext.bind(browser);
      browser.newContext = async (opciones) => {
        const contexto = await crearContexto(opciones);
        await bloquearFuentes(contexto);
        return contexto;
      };
      await use(browser);
    },
    { scope: 'worker' },
  ],
  context: async ({ context }, use) => {
    await bloquearFuentes(context);
    await use(context);
  },
});

export { expect };
