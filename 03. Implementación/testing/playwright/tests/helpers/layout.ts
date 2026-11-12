import { expect } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

export async function sinScrollHorizontal(page: Page): Promise<void> {
  await page.evaluate(() => document.fonts.ready);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
}

export const ANCHOS_ESCRITORIO = [1024, 1280, 1440, 1920] as const;

export async function sinScrollHorizontalEnAnchos(page: Page, anchos: readonly number[] = ANCHOS_ESCRITORIO, alto = 900): Promise<void> {
  for (const ancho of anchos) {
    await page.setViewportSize({ width: ancho, height: alto });
    await sinScrollHorizontal(page);
  }
}

export async function caja(locator: Locator): Promise<{ x: number; y: number; width: number; height: number }> {
  const box = await locator.boundingBox();
  expect(box, 'el elemento tiene que estar visible para medirlo').not.toBeNull();
  return box as { x: number; y: number; width: number; height: number };
}

export async function esDialogoCentrado(page: Page, hoja: Locator, { anchoMinimo = 400, anchoMaximo = 640 } = {}): Promise<void> {
  const ventana = page.viewportSize();
  expect(ventana).not.toBeNull();
  const { width: anchoVentana, height: altoVentana } = ventana as { width: number; height: number };
  const box = await caja(hoja);
  expect(box.width).toBeGreaterThanOrEqual(anchoMinimo);
  expect(box.width).toBeLessThanOrEqual(anchoMaximo);
  expect(Math.abs(box.x + box.width / 2 - anchoVentana / 2)).toBeLessThanOrEqual(2);
  expect(box.y).toBeGreaterThan(0);
  expect(box.y + box.height).toBeLessThan(altoVentana);
  expect(Math.abs(box.y + box.height / 2 - altoVentana / 2)).toBeLessThanOrEqual(Math.max(40, altoVentana * 0.12));
}

export async function toastAbajoADerecha(page: Page, toast: Locator): Promise<void> {
  const ventana = page.viewportSize() as { width: number; height: number };
  const box = await caja(toast);
  expect(box.x + box.width).toBeGreaterThan(ventana.width - 60);
  expect(box.x + box.width).toBeLessThanOrEqual(ventana.width);
  expect(box.y + box.height).toBeGreaterThan(ventana.height - 60);
  expect(box.y + box.height).toBeLessThanOrEqual(ventana.height);
  expect(box.x).toBeGreaterThan(ventana.width / 2);
}

export async function barraInferiorOculta(page: Page, selector = '.bottom-nav'): Promise<void> {
  const visibles = await page.locator(selector).evaluateAll((nodos) => nodos.filter((nodo) => getComputedStyle(nodo).display !== 'none').length);
  expect(visibles).toBe(0);
}

export async function focoDevueltoA(disparador: Locator): Promise<void> {
  await expect(disparador).toBeFocused();
}

export async function tieneAnilloDeFoco(elemento: Locator): Promise<void> {
  await elemento.focus();
  const estilo = await elemento.evaluate((nodo) => {
    const calculado = getComputedStyle(nodo);
    return { estilo: calculado.outlineStyle, ancho: parseFloat(calculado.outlineWidth), sombra: calculado.boxShadow };
  });
  const hayAnillo = (estilo.estilo !== 'none' && estilo.ancho > 0) || (estilo.sombra !== 'none' && estilo.sombra !== '');
  expect(hayAnillo, 'el elemento enfocado muestra un anillo de foco visible').toBe(true);
}
