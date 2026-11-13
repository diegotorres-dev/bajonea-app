import { test, expect } from './helpers/prueba';
import type { Page } from '@playwright/test';
import { abrirComoUsuario } from './helpers/multicomercio';
import { prepararEscenarioAdmin } from './helpers/admin-escritorio';
import type { EscenarioAdmin } from './helpers/admin-escritorio';
import { abrirComoDueno } from './helpers/escritorio-comercio';
import { abrirComoCliente } from './helpers/escritorio-cliente';
import { sinScrollHorizontal } from './helpers/layout';

test.use({ viewport: { width: 1440, height: 900 } });

async function redimensionar(page: Page, ancho: number) {
  await page.setViewportSize({ width: ancho, height: 900 });
  await page.waitForTimeout(400);
  await sinScrollHorizontal(page);
}

test.describe('Escritorio E4: redimensionar la ventana con la página abierta @escritorio', () => {
  test.describe.configure({ timeout: 300_000 });
  let esc: EscenarioAdmin;

  test.beforeAll(async ({ request }) => {
    test.setTimeout(300_000);
    esc = await prepararEscenarioAdmin(request);
  });

  test('Pedidos del comercio: de 1440 a 800 px y de vuelta conserva la lista, la barra y la navegación @escritorio', async ({ page, request }) => {
    const errores: string[] = [];
    page.on('pageerror', (error) => errores.push(error.message));
    await abrirComoDueno(page, request, esc.base);
    await page.goto('/comercio-pedidos.html');
    const fila = page.getByTestId(`pedido-item-${esc.base.pedidos.pendiente}`);
    await expect(fila).toBeVisible();
    await redimensionar(page, 800);
    await expect(fila).toBeVisible();
    await expect(page.getByTestId('btn-nav-pedidos')).toBeVisible();
    await redimensionar(page, 1440);
    await expect(page.locator('#bottom-nav-slot')).toBeVisible();
    await expect(fila).toBeVisible();
    await redimensionar(page, 800);
    await fila.click();
    await page.waitForURL(/comercio-pedido-detalle\.html\?id=\d+|comercio-pedidos\.html\?id=\d+/);
    await sinScrollHorizontal(page);
    expect(errores).toEqual([]);
  });

  test('Mis pedidos del Cliente: al pasar de 1440 a 800 px la página se recarga en modo móvil y el detalle se abre @escritorio', async ({ page, request }) => {
    const errores: string[] = [];
    page.on('pageerror', (error) => errores.push(error.message));
    await abrirComoCliente(page, request, esc.base);
    await page.goto('/pedidos.html');
    await expect(page.getByTestId('detalle-pedido-escritorio')).toBeVisible();
    const fila = page.getByTestId(`pedido-item-${esc.base.pedidos.entregado}`);
    await expect(fila).toBeVisible();
    await page.setViewportSize({ width: 800, height: 900 });
    await expect(page.getByTestId('detalle-pedido-escritorio')).toHaveCount(0);
    await expect(fila).toBeVisible();
    await sinScrollHorizontal(page);
    await fila.click();
    await page.waitForURL(/pedido-detalle\.html\?id=\d+/);
    await sinScrollHorizontal(page);
    await page.goBack();
    await expect(fila).toBeVisible();
    await page.setViewportSize({ width: 1440, height: 900 });
    await expect(page.getByTestId('detalle-pedido-escritorio')).toBeVisible();
    await expect(page.locator('.barra-cliente')).toBeVisible();
    expect(errores).toEqual([]);
  });

  test('Soporte del Administrador: de 1440 a 800 px elegir una consulta abre su detalle @escritorio', async ({ page }) => {
    const errores: string[] = [];
    page.on('pageerror', (error) => errores.push(error.message));
    await abrirComoUsuario(page, esc.admin);
    await page.goto('/admin-soporte.html');
    const fila = page.locator('[data-testid^="soporte-item-"]').first();
    await expect(fila).toBeVisible();
    await redimensionar(page, 800);
    await fila.click();
    await page.waitForTimeout(800);
    await sinScrollHorizontal(page);
    const navego = /admin-soporte\.html\?id=\d+|admin-soporte-detalle|id=\d+/.test(page.url());
    const panelVisible = await page.locator('.soporte-panel').isVisible().catch(() => false);
    expect(navego || panelVisible).toBe(true);
    await redimensionar(page, 1440);
    await expect(page.getByTestId('barra-admin')).toBeVisible();
    expect(errores).toEqual([]);
  });

  test('Perfil del Cliente: de 1440 a 800 px muestra una sola vista a la vez y vuelve al diseño de escritorio sin romperse @escritorio', async ({ page, request }) => {
    const errores: string[] = [];
    page.on('pageerror', (error) => errores.push(error.message));
    await abrirComoCliente(page, request, esc.base);
    await page.goto('/perfil.html');
    await expect(page.getByTestId('btn-mis-direcciones')).toBeVisible();
    await redimensionar(page, 800);
    const vistasVisibles = await page.locator('.perfil-view:not(.is-hidden)').count();
    expect(vistasVisibles).toBe(1);
    await redimensionar(page, 1440);
    await expect(page.getByTestId('btn-mis-direcciones')).toBeVisible();
    await expect(page.locator('.barra-cliente')).toBeVisible();
    expect(errores).toEqual([]);
  });

  test('Perfil del comercio: de 1440 a 800 px conserva el contenido y el menú lateral reaparece al volver @escritorio', async ({ page, request }) => {
    const errores: string[] = [];
    page.on('pageerror', (error) => errores.push(error.message));
    await abrirComoDueno(page, request, esc.base);
    await page.goto('/comercio-perfil.html?seccion=horarios');
    await expect(page.locator('#bottom-nav-slot')).toBeVisible();
    await redimensionar(page, 800);
    await expect(page.locator('main')).toBeVisible();
    await redimensionar(page, 1440);
    await expect(page.locator('#bottom-nav-slot')).toBeVisible();
    expect(errores).toEqual([]);
  });
});
