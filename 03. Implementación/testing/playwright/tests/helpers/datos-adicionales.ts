import type { Page } from '@playwright/test';

export async function abrirDatosAdicionales(page: Page): Promise<void> {
  const abierta = await page.getByTestId('seccion-datos-adicionales').evaluate((el) => (el as HTMLDetailsElement).open);
  if (!abierta) {
    await page.getByTestId('resumen-datos-adicionales').click();
  }
}
