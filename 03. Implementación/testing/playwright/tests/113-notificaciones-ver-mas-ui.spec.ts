import { test, expect } from './helpers/prueba';
import type { Page } from '@playwright/test';
import { API_BASE_URL } from './helpers/backend';
import { abrirComoUsuario } from './helpers/multicomercio';
import { sinScrollHorizontal } from './helpers/layout';
import { borrarAvisos, prepararClienteDeAvisos, sembrarAvisos } from './helpers/avisos-cliente';
import type { ClienteDeAvisos } from './helpers/avisos-cliente';

test.use({ viewport: { width: 375, height: 812 } });

const ITEMS = '[data-testid^="notificacion-item-"]';

test.describe('Tramo 2C: paginación de la lista de avisos ("Ver más")', () => {
  test.describe.configure({ mode: 'serial', timeout: 120_000 });

  let cliente: ClienteDeAvisos;

  test.beforeAll(async ({ request }) => {
    cliente = await prepararClienteDeAvisos(request);
  });

  test.beforeEach(() => {
    borrarAvisos(cliente.usuarioId);
  });

  async function abrir(page: Page) {
    await abrirComoUsuario(page, cliente.sesion);
    await page.goto('/notificaciones.html');
    await expect(page.locator(ITEMS).first()).toBeVisible();
  }

  test('con pocos avisos no hay botón y con muchos la primera página trae 20', async ({ page }) => {
    sembrarAvisos(cliente.usuarioId, 20);
    await abrir(page);
    await expect(page.locator(ITEMS)).toHaveCount(20);
    await expect(page.getByTestId('btn-notificaciones-ver-mas')).toHaveCount(0);

    sembrarAvisos(cliente.usuarioId, 1, { prefijo: 'Uno más', desfaseSegundos: 0 });
    await page.reload();
    await expect(page.locator(ITEMS)).toHaveCount(20);
    await expect(page.getByTestId('btn-notificaciones-ver-mas')).toBeVisible();
  });

  test('"Ver más" carga la página siguiente sin repetir, mide 44 px y desaparece al llegar al final', async ({ page }) => {
    sembrarAvisos(cliente.usuarioId, 45);
    await abrir(page);
    await expect(page.locator(ITEMS)).toHaveCount(20);

    const boton = page.getByTestId('btn-notificaciones-ver-mas');
    await boton.scrollIntoViewIfNeeded();
    const caja = (await boton.boundingBox())!;
    expect(caja.height).toBeGreaterThanOrEqual(44);
    await expect(boton).toHaveText('Ver más');

    await boton.click();
    await expect(page.locator(ITEMS)).toHaveCount(40);
    await page.getByTestId('btn-notificaciones-ver-mas').click();
    await expect(page.locator(ITEMS)).toHaveCount(45);
    await expect(page.getByTestId('btn-notificaciones-ver-mas')).toHaveCount(0);

    const ids = await page.locator(ITEMS).evaluateAll((nodos) => nodos.map((nodo) => (nodo as HTMLElement).dataset.id));
    expect(new Set(ids).size).toBe(45);
    const ordenados = [...ids].sort((a, b) => Number(b) - Number(a));
    expect(ids).toEqual(ordenados);
    await sinScrollHorizontal(page);
  });

  test('al cargar más conserva el scroll y deja el foco en el primer aviso nuevo', async ({ page }) => {
    sembrarAvisos(cliente.usuarioId, 30);
    await abrir(page);
    const boton = page.getByTestId('btn-notificaciones-ver-mas');
    await boton.scrollIntoViewIfNeeded();
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const antes = await page.evaluate(() => window.scrollY);
    expect(antes).toBeGreaterThan(200);

    await boton.click();
    await expect(page.locator(ITEMS)).toHaveCount(30);
    const despues = await page.evaluate(() => window.scrollY);
    expect(Math.abs(despues - antes)).toBeLessThan(60);
    const primeraNueva = page.locator(ITEMS).nth(20);
    await expect(primeraNueva).toBeFocused();
  });

  test('mientras carga el botón dice "Cargando…" y no admite otro clic', async ({ page }) => {
    sembrarAvisos(cliente.usuarioId, 30);
    await abrir(page);
    let pedidos = 0;
    let liberar: () => void = () => {};
    const espera = new Promise<void>((resolver) => {
      liberar = resolver;
    });
    await page.route('**/api/v1/notificaciones?cursor=*', async (ruta) => {
      pedidos += 1;
      await espera;
      await ruta.continue();
    });
    const boton = page.getByTestId('btn-notificaciones-ver-mas');
    await boton.click();
    await expect(page.getByTestId('btn-notificaciones-ver-mas')).toHaveText('Cargando…');
    await expect(page.getByTestId('btn-notificaciones-ver-mas')).toBeDisabled();
    liberar();
    await expect(page.locator(ITEMS)).toHaveCount(30);
    expect(pedidos).toBe(1);
  });

  test('el contador de no leídas cuenta todas, no solo las de la página cargada', async ({ page, request }) => {
    sembrarAvisos(cliente.usuarioId, 45);
    await abrirComoUsuario(page, cliente.sesion);
    await page.goto('/index.html');
    await expect(page.getByTestId('contador-notificaciones')).toHaveText('9+');
    const respuesta = await request.get(`${API_BASE_URL}/notificaciones/no-leidas/contador`, {
      headers: { Authorization: `Bearer ${cliente.sesion.token}` },
    });
    expect((await respuesta.json()).data).toBe(45);
  });

  test('el sondeo refresca la primera página sin borrar las páginas que la persona abrió', async ({ page }) => {
    sembrarAvisos(cliente.usuarioId, 45, { desfaseSegundos: 5 });
    await page.clock.install();
    await abrirComoUsuario(page, cliente.sesion);
    await page.goto('/notificaciones.html');
    await expect(page.locator(ITEMS).first()).toBeVisible();
    await page.getByTestId('btn-notificaciones-ver-mas').click();
    await expect(page.locator(ITEMS)).toHaveCount(40);
    await page.waitForLoadState('networkidle');

    const nuevo = sembrarAvisos(cliente.usuarioId, 1, { prefijo: 'Recién llegado', desfaseSegundos: 0 })[0];
    await page.clock.fastForward(16_000);
    await expect(page.getByTestId(`notificacion-item-${nuevo}`)).toBeVisible();
    await expect(page.locator(ITEMS)).toHaveCount(41);
    await expect(page.locator(ITEMS).first()).toHaveAttribute('data-id', String(nuevo));
    await expect(page.getByTestId('btn-notificaciones-ver-mas')).toBeVisible();

    await page.getByTestId('btn-notificaciones-ver-mas').click();
    await expect(page.locator(ITEMS)).toHaveCount(46);
    await expect(page.getByTestId('btn-notificaciones-ver-mas')).toHaveCount(0);
    const ids = await page.locator(ITEMS).evaluateAll((nodos) => nodos.map((nodo) => (nodo as HTMLElement).dataset.id));
    expect(new Set(ids).size).toBe(46);
  });

  test('si falla "Ver más" se muestra el error en la lista con "Reintentar", sin redirigir', async ({ page }) => {
    sembrarAvisos(cliente.usuarioId, 30);
    await abrir(page);
    await page.route('**/api/v1/notificaciones?cursor=*', (ruta) => ruta.fulfill({ status: 503, contentType: 'application/json', body: '{"mensaje":"caído","data":null}' }));
    await page.getByTestId('btn-notificaciones-ver-mas').click();
    await expect(page.getByTestId('notificaciones-error-mas')).toHaveText('No pudimos cargar más avisos.');
    expect(page.url()).toContain('/notificaciones.html');
    await expect(page.locator(ITEMS)).toHaveCount(20);
    await expect(page.getByTestId('btn-reintentar-notificaciones-mas')).toBeFocused();

    await page.unroute('**/api/v1/notificaciones?cursor=*');
    await page.getByTestId('btn-reintentar-notificaciones-mas').click();
    await expect(page.locator(ITEMS)).toHaveCount(30);
    await expect(page.getByTestId('notificaciones-error-mas')).toHaveCount(0);
  });
});
