import { test, expect } from './helpers/prueba';
import type { Page } from '@playwright/test';
import { apiGet } from './helpers/backend';
import { abrirComoUsuario } from './helpers/multicomercio';
import { prepararEscenarioAdmin } from './helpers/admin-escritorio';
import type { EscenarioAdmin } from './helpers/admin-escritorio';
import { caja, sinScrollHorizontalEnAnchos } from './helpers/layout';
import { crearConsultaPublica } from './helpers/soporte';

const ORDEN_ITEMS = ['panel', 'pendientes', 'comercios', 'resolicitudes', 'documentos', 'soporte', 'reclamos', 'clientes', 'duenos', 'reembolsos', 'tarifas', 'categorias'];

const ACTIVO_POR_PAGINA: Record<string, string> = {
  'admin-dashboard.html': 'panel',
  'admin-comercios-pendientes.html': 'pendientes',
  'admin-comercios.html': 'comercios',
  'admin-resolicitudes.html': 'resolicitudes',
  'admin-documentos.html': 'documentos',
  'admin-soporte.html': 'soporte',
  'admin-reclamos.html': 'reclamos',
  'admin-clientes.html': 'clientes',
  'admin-duenos.html': 'duenos',
  'admin-reembolsos.html': 'reembolsos',
  'admin-tarifas.html': 'tarifas',
  'admin-categorias.html': 'categorias',
  'admin-tags.html': 'categorias',
};

test.describe('Escritorio E2: barra lateral y panel del Administrador @escritorio', () => {
  test.describe.configure({ timeout: 240_000 });
  let esc: EscenarioAdmin;

  test.beforeAll(async ({ request }) => {
    test.setTimeout(300_000);
    esc = await prepararEscenarioAdmin(request);
  });

  async function abrir(page: Page, ruta: string) {
    await abrirComoUsuario(page, esc.admin);
    await page.goto(`/${ruta}`);
    await expect(page.getByTestId('barra-admin')).toBeVisible();
  }

  function urlsDeTodasLasPaginas(): string[] {
    return [
      ...Object.keys(ACTIVO_POR_PAGINA),
      `admin-comercio-detalle.html?id=${esc.pendientes[0].comercioId}`,
      `admin-resolicitud-detalle.html?id=${esc.resolicitud.comercioId}`,
      `admin-documento-revision.html?comercioId=${esc.base.dueno.comercioId}&id=${esc.documentoIds[0]}`,
      `admin-soporte.html?id=${esc.consultas.esperando[0]}`,
      `admin-comercio-equipo.html?id=${esc.base.dueno.comercioId}`,
      `admin-comercio-actividad.html?id=${esc.base.dueno.comercioId}`,
    ];
  }

  test('la barra mide 264 px, es oscura, queda fija a alto completo y lleva la marca Bajoneá Admin', async ({ page }) => {
    await abrir(page, 'admin-dashboard.html');
    const barra = page.getByTestId('barra-admin');
    const medida = await caja(barra);
    expect(medida.width).toBe(264);
    expect(medida.x).toBe(0);
    expect(medida.height).toBeGreaterThanOrEqual(899);
    const estilo = await barra.evaluate((nodo) => {
      const calculado = getComputedStyle(nodo);
      return { fondo: calculado.backgroundColor, posicion: calculado.position };
    });
    expect(estilo.fondo).toBe('rgb(31, 26, 23)');
    expect(estilo.posicion).toBe('fixed');
    const logo = page.getByTestId('logo-barra-admin');
    await expect(logo).toContainText('Bajoneá');
    await expect(logo).toContainText('Admin');
    const colorMarca = await logo.locator('.barra-admin__marca').evaluate((nodo) => getComputedStyle(nodo).color);
    expect(colorMarca).toBe('rgb(255, 122, 61)');
    await page.goto('/admin-clientes.html');
    await page.evaluate(() => window.scrollTo(0, 800));
    expect((await caja(barra)).y).toBe(0);
  });

  test('los ítems van en el orden indicado, miden 44 px o más y el activo lleva el fondo #3a312b', async ({ page }) => {
    await abrir(page, 'admin-comercios.html');
    const testids = await page.locator('.barra-admin__item').evaluateAll((nodos) => nodos.map((nodo) => nodo.getAttribute('data-testid')));
    expect(testids).toEqual(ORDEN_ITEMS.map((clave) => `btn-nav-admin-${clave}`));
    for (const clave of ORDEN_ITEMS) {
      expect((await caja(page.getByTestId(`btn-nav-admin-${clave}`))).height).toBeGreaterThanOrEqual(44);
    }
    const activo = page.getByTestId('btn-nav-admin-comercios');
    await expect(activo).toHaveAttribute('aria-current', 'page');
    expect(await activo.evaluate((nodo) => getComputedStyle(nodo).backgroundColor)).toBe('rgb(58, 49, 43)');
    await expect(page.getByTestId('btn-nav-admin-panel')).not.toHaveAttribute('aria-current', 'page');
    const colorTexto = await page.getByTestId('btn-nav-admin-panel').evaluate((nodo) => getComputedStyle(nodo).color);
    expect(colorTexto).toBe('rgb(232, 223, 214)');
  });

  test('cada página marca su ítem y desde la barra se llega a todas las secciones', async ({ page }) => {
    await abrir(page, 'admin-dashboard.html');
    for (const [pagina, clave] of Object.entries(ACTIVO_POR_PAGINA)) {
      await page.goto(`/${pagina}`);
      await expect(page.getByTestId(`btn-nav-admin-${clave}`)).toHaveAttribute('aria-current', 'page');
      await expect(page.locator('.barra-admin__item[aria-current="page"]')).toHaveCount(1);
    }
    await page.goto('/admin-dashboard.html');
    for (const clave of ORDEN_ITEMS.slice(1)) {
      await page.getByTestId(`btn-nav-admin-${clave}`).click();
      await page.waitForURL(`**/${Object.entries(ACTIVO_POR_PAGINA).find(([, valor]) => valor === clave)![0]}`);
    }
  });

  test('las insignias coinciden con las métricas y se actualizan con el sondeo de 15 s', async ({ page, request }) => {
    const metricas = (await apiGet(request, '/administrador/metricas', esc.admin.token)).body.data;
    const reembolsos = (await apiGet(request, '/administrador/reembolsos', esc.admin.token)).body.data as unknown[];
    const texto = (cantidad: number) => (cantidad > 99 ? '99+' : String(cantidad));
    await abrirComoUsuario(page, esc.admin);
    await page.clock.install();
    await page.goto('/admin-dashboard.html');
    await expect(page.getByTestId('insignia-nav-admin-pendientes')).toHaveText(texto(metricas.comerciosPendientes));
    await expect(page.getByTestId('insignia-nav-admin-resolicitudes')).toHaveText(texto(metricas.resolicitudesPendientes));
    await expect(page.getByTestId('insignia-nav-admin-documentos')).toHaveText(texto(metricas.documentosPendientes));
    await expect(page.getByTestId('insignia-nav-admin-soporte')).toHaveText(texto(metricas.consultasSoporteEsperando));
    await expect(page.getByTestId('insignia-nav-admin-reclamos')).toHaveText(texto(metricas.reclamosPendientes));
    await expect(page.getByTestId('insignia-nav-admin-reembolsos')).toHaveText(texto(reembolsos.length));
    for (const clave of ['panel', 'comercios', 'clientes', 'duenos', 'tarifas', 'categorias']) {
      await expect(page.getByTestId(`btn-nav-admin-${clave}`).locator('.barra-admin__insignia')).toHaveCount(0);
    }
    const colorInsignia = await page.getByTestId('insignia-nav-admin-pendientes').evaluate((nodo) => getComputedStyle(nodo).backgroundColor);
    expect(colorInsignia).toBe('rgb(217, 48, 37)');
    await crearConsultaPublica(request, { mensaje: 'Consulta nueva para probar el sondeo de la barra.' });
    await page.clock.runFor(16_000);
    await expect(page.getByTestId('insignia-nav-admin-soporte')).toHaveText(texto(metricas.consultasSoporteEsperando + 1));
  });

  test('Cerrar sesión de la barra abre la confirmación, Cancelar la cierra y confirmar va al login', async ({ page }) => {
    await page.route('**/api/v1/auth/logout', (ruta) => ruta.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ mensaje: 'ok', data: null }) }));
    await abrir(page, 'admin-dashboard.html');
    await page.getByTestId('btn-lateral-admin-cerrar-sesion').click();
    await expect(page.getByTestId('modal-confirmar-logout')).toBeVisible();
    await page.getByTestId('btn-cancelar-logout').click();
    await expect(page.getByTestId('modal-confirmar-logout')).toHaveCount(0);
    await expect(page.getByTestId('btn-lateral-admin-cerrar-sesion')).toBeFocused();
    await page.getByTestId('btn-lateral-admin-cerrar-sesion').click();
    await page.getByTestId('btn-confirmar-logout').click();
    await page.waitForURL('**/login.html');
  });

  test('el panel pone las tarjetas de atención en una fila y la gestión en una grilla de tres columnas', async ({ page }) => {
    await abrir(page, 'admin-dashboard.html');
    await expect(page.getByTestId('titulo-panel-admin')).toHaveText('Panel');
    await expect(page.getByTestId('nombre-admin')).toContainText('Admin');
    const tarjetas = page.locator('#admin-alertas > .alert-card');
    expect(await tarjetas.count()).toBe(3);
    const cajas = [];
    for (let i = 0; i < 3; i += 1) cajas.push(await caja(tarjetas.nth(i)));
    expect(new Set(cajas.map((c) => Math.round(c.y))).size).toBe(1);
    cajas.forEach((c) => expect(c.width).toBeGreaterThanOrEqual(240));
    const tiles = page.locator('[data-testid^="tile-gestion-"]');
    expect(await tiles.count()).toBe(9);
    const posiciones = await tiles.evaluateAll((nodos) => nodos.map((nodo) => {
      const r = nodo.getBoundingClientRect();
      return { x: Math.round(r.x), y: Math.round(r.y) };
    }));
    expect(new Set(posiciones.map((p) => p.x)).size).toBe(3);
    expect(new Set(posiciones.map((p) => p.y)).size).toBe(3);
    await expect(page.getByTestId('btn-cerrar-sesion')).toBeHidden();
    await expect(page.getByTestId('btn-volver')).toHaveCount(0);
  });

  test('el contenido del Administrador no pasa de 1440 px de ancho ni genera scroll horizontal a 1024, 1280, 1440 y 1920 px', async ({ page }) => {
    await abrirComoUsuario(page, esc.admin);
    for (const ruta of urlsDeTodasLasPaginas()) {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(`/${ruta}`);
      await expect(page.getByTestId('barra-admin'), ruta).toBeVisible();
      await page.waitForLoadState('networkidle');
      await sinScrollHorizontalEnAnchos(page);
    }
    await page.setViewportSize({ width: 1920, height: 900 });
    await page.goto('/admin-clientes.html');
    await expect(page.getByTestId('barra-admin')).toBeVisible();
    const principal = await caja(page.locator('.app-main'));
    expect(principal.width).toBeLessThanOrEqual(1440);
  });

  test('en las páginas de detalle Volver lleva a su lista (no al historial) y en las de primer nivel no se muestra', async ({ page }) => {
    await abrirComoUsuario(page, esc.admin);
    const casos: Array<[string, string]> = [
      [`admin-comercio-detalle.html?id=${esc.pendientes[0].comercioId}`, '**/admin-comercios-pendientes.html'],
      [`admin-resolicitud-detalle.html?id=${esc.resolicitud.comercioId}`, '**/admin-resolicitudes.html'],
      [`admin-documento-revision.html?comercioId=${esc.base.dueno.comercioId}&id=${esc.documentoIds[0]}`, '**/admin-documentos.html'],
      [`admin-comercio-equipo.html?id=${esc.base.dueno.comercioId}`, '**/admin-comercios.html'],
    ];
    for (const [ruta, destino] of casos) {
      await page.goto('/admin-dashboard.html');
      await page.goto(`/${ruta}`);
      await expect(page.getByTestId('btn-volver')).toBeVisible();
      await page.getByTestId('btn-volver').click();
      await page.waitForURL(destino);
    }
    for (const ruta of ['admin-clientes.html', 'admin-tarifas.html', 'admin-categorias.html']) {
      await page.goto(`/${ruta}`);
      await expect(page.getByTestId('btn-volver')).toBeHidden();
    }
  });
});
