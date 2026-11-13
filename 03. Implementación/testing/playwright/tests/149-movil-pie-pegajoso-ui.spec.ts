import { test, expect } from './helpers/prueba';
import type { Page } from '@playwright/test';
import { abrirComoCliente, dejarCarritoConItems } from './helpers/escritorio-cliente';
import { prepararEscenarioComercio } from './helpers/escritorio-comercio';
import type { EscenarioComercio } from './helpers/escritorio-comercio';
import { apiDelete, login, ADMIN_USUARIO, ADMIN_PASSWORD_CONOCIDA } from './helpers/backend';
import { abrirComoUsuario } from './helpers/multicomercio';

test.describe('Móvil y tablet: el recorte del contenedor no hace pegajoso el pie de acciones (E5)', () => {
  test.describe.configure({ timeout: 240_000 });
  let e: EscenarioComercio;
  let token: string;

  test.beforeAll(async ({ request }) => {
    test.setTimeout(300_000);
    e = await prepararEscenarioComercio(request);
  });

  test.beforeEach(async ({ request }) => {
    token = (await login(request, e.cliente.nombreUsuario, e.cliente.password)).token;
    await apiDelete(request, '/carrito', token);
    await dejarCarritoConItems(request, e, token);
  });

  async function overflowDelContenedor(page: Page) {
    return page.locator('.app-shell').first().evaluate((nodo) => getComputedStyle(nodo).overflow);
  }

  async function posicionDelPie(page: Page) {
    return page.locator('.cart-footer').evaluate((nodo) => {
      const caja = nodo.getBoundingClientRect();
      return { arriba: caja.top, abajo: caja.bottom, alto: window.innerHeight, scroll: window.scrollY };
    });
  }

  async function abrirCarrito(page: Page, request: any, ancho: number, alto: number) {
    await abrirComoCliente(page, request, e);
    await page.setViewportSize({ width: ancho, height: alto });
    await page.goto('/carrito.html');
    await expect(page.getByTestId('btn-confirmar-pedido')).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, 0));
  }

  test('por debajo de 640 px el contenedor no recorta', async ({ page, request }) => {
    await abrirCarrito(page, request, 390, 380);
    expect(await overflowDelContenedor(page)).toBe('visible');
  });

  test('entre 640 y 1023 px el contenedor recorta con hidden y el pie del carrito sigue al contenido, como antes del escritorio', async ({ page, request }) => {
    await abrirCarrito(page, request, 700, 380);
    expect(await overflowDelContenedor(page)).toBe('hidden');
    const pie = await posicionDelPie(page);
    expect(pie.scroll).toBe(0);
    expect(pie.abajo).toBeGreaterThan(pie.alto + 1);
  });

  test('la regla de recorte pasa de hidden a clip recién a los 1024 px (sobre el contenedor sin variante de escritorio)', async ({ page }) => {
    await page.goto('/login.html');
    await page.evaluate(() => {
      document.querySelector('.app-shell')!.className = 'app-shell';
    });
    await page.setViewportSize({ width: 1023, height: 700 });
    expect(await overflowDelContenedor(page)).toBe('hidden');
    await page.setViewportSize({ width: 1024, height: 700 });
    expect(await overflowDelContenedor(page)).toBe('clip');
    await page.setViewportSize({ width: 639, height: 700 });
    expect(await overflowDelContenedor(page)).toBe('visible');
  });

  test('el detalle de comercio del Administrador a 700 px también recorta con hidden', async ({ page, request }) => {
    const admin = await login(request, ADMIN_USUARIO, ADMIN_PASSWORD_CONOCIDA);
    await abrirComoUsuario(page, admin);
    await page.setViewportSize({ width: 700, height: 600 });
    await page.goto('/admin-dashboard.html');
    await expect(page.locator('.app-shell').first()).toBeVisible();
    expect(await overflowDelContenedor(page)).toBe('hidden');
  });

  test('en escritorio las columnas fijas siguen pegadas @escritorio', async ({ page, request }) => {
    await abrirCarrito(page, request, 1440, 900);
    expect(await page.locator('.cart-footer').evaluate((nodo) => getComputedStyle(nodo).position)).toBe('sticky');
    await page.evaluate(() => window.scrollTo(0, 400));
    const resumen = await page.locator('.cart-footer').boundingBox();
    expect(resumen).not.toBeNull();
    expect(resumen!.y).toBeGreaterThanOrEqual(0);
    expect(resumen!.y + resumen!.height).toBeLessThanOrEqual(900 + 1);
  });
});
