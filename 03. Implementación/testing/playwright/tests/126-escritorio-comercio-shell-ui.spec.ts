import { test, expect } from './helpers/prueba';
import type { Page } from '@playwright/test';
import { clonarComercioTest, sufijoUnico } from './helpers/backend';
import { ANCHOS_ESCRITORIO, barraInferiorOculta, caja, sinScrollHorizontalEnAnchos, tieneAnilloDeFoco } from './helpers/layout';
import { abrirComoDueno, abrirComoEmpleado, prepararEscenarioComercio } from './helpers/escritorio-comercio';
import type { EscenarioComercio } from './helpers/escritorio-comercio';

test.use({ viewport: { width: 1440, height: 900 } });

const PAGINAS = ['comercio-dashboard.html', 'comercio-pedidos.html', 'comercio-productos.html', 'comercio-perfil.html', 'comercio-estadisticas.html', 'comercio-documentacion.html', 'comercio-producto-form.html', 'notificaciones.html', 'mis-consultas.html'];
const ITEMS_DUENO = ['panel', 'productos', 'pedidos', 'estadisticas', 'documentacion', 'equipo', 'avisos', 'perfil'];
const ITEMS_EMPLEADO = ['panel', 'productos', 'pedidos', 'avisos', 'perfil'];

test.describe('Escritorio E1: shell lateral y panel del comercio @escritorio', () => {
  test.describe.configure({ timeout: 240_000 });
  let escenario: EscenarioComercio;

  test.beforeAll(async ({ request }) => {
    escenario = await prepararEscenarioComercio(request);
  });

  async function esperarPanel(page: Page) {
    await page.goto('/comercio-dashboard.html');
    await expect(page.getByTestId('metrica-vendido')).toBeVisible();
    await expect(page.getByTestId('pedido-item-' + escenario.pedidos.pendiente)).toBeVisible();
  }

  test('la barra lateral mide 264 px, está pegada a la izquierda a alto completo y reemplaza a la barra inferior @escritorio', async ({ page, request }) => {
    await abrirComoDueno(page, request, escenario);
    await esperarPanel(page);
    const lateral = page.locator('#bottom-nav-slot');
    const box = await caja(lateral);
    expect(box.x).toBe(0);
    expect(box.y).toBe(0);
    expect(box.width).toBe(264);
    expect(box.height).toBe(900);
    const items = await Promise.all(ITEMS_DUENO.map((clave) => caja(page.getByTestId(`btn-nav-${clave}`))));
    items.forEach((item) => {
      expect(item.x).toBeGreaterThanOrEqual(0);
      expect(item.height).toBeGreaterThanOrEqual(44);
    });
    for (let i = 1; i < items.length; i += 1) {
      expect(items[i].y).toBeGreaterThan(items[i - 1].y);
    }
    const posicion = await lateral.evaluate((nodo) => getComputedStyle(nodo).position);
    expect(posicion).toBe('fixed');
    const borde = await lateral.evaluate((nodo) => getComputedStyle(nodo).borderRightColor);
    expect(borde).toBe('rgb(227, 218, 210)');
    await page.mouse.wheel(0, 2000);
    expect((await caja(lateral)).y).toBe(0);
  });

  test('el Dueño ve los ocho ítems, el activo marcado y las insignias de pedidos y avisos @escritorio', async ({ page, request }) => {
    await abrirComoDueno(page, request, escenario);
    await esperarPanel(page);
    for (const clave of ITEMS_DUENO) {
      await expect(page.getByTestId(`btn-nav-${clave}`)).toBeVisible();
    }
    await expect(page.getByTestId('btn-nav-panel')).toHaveAttribute('aria-current', 'page');
    await expect(page.getByTestId('btn-nav-pedidos')).not.toHaveAttribute('aria-current', 'page');
    await expect(page.getByTestId('btn-nav-perfil')).toContainText('Perfil del comercio');
    await expect(page.getByTestId('insignia-nav-pedidos')).toHaveText('2');
    await expect(page.getByTestId('insignia-nav-avisos')).toBeVisible();
    const activo = page.getByTestId('btn-nav-panel');
    const estilo = await activo.evaluate((nodo) => ({ fondo: getComputedStyle(nodo).backgroundColor, color: getComputedStyle(nodo).color }));
    expect(estilo.fondo).toBe('rgb(255, 241, 234)');
    expect(estilo.color).toBe('rgb(168, 49, 0)');
    await barraInferiorOculta(page, '.bottom-nav:not(#bottom-nav-slot .bottom-nav)');
    const nav = page.locator('#bottom-nav-slot .bottom-nav');
    expect(await nav.evaluate((nodo) => getComputedStyle(nodo).flexDirection)).toBe('column');
  });

  test('cada ítem de la barra lleva a su página y marca el ítem activo @escritorio', async ({ page, request }) => {
    await abrirComoDueno(page, request, escenario);
    await esperarPanel(page);
    const destinos: Array<[string, string]> = [
      ['productos', 'comercio-productos.html'],
      ['pedidos', 'comercio-pedidos.html'],
      ['estadisticas', 'comercio-estadisticas.html'],
      ['documentacion', 'comercio-documentacion.html'],
      ['avisos', 'notificaciones.html'],
      ['perfil', 'comercio-perfil.html'],
      ['panel', 'comercio-dashboard.html'],
    ];
    for (const [clave, archivo] of destinos) {
      await page.getByTestId(`btn-nav-${clave}`).click();
      await page.waitForURL(`**/${archivo}**`);
      await expect(page.getByTestId(`btn-nav-${clave}`)).toHaveAttribute('aria-current', 'page');
    }
  });

  test('el pie muestra a la persona con su rol y "Cerrar sesión" pide confirmación @escritorio', async ({ page, request }) => {
    await abrirComoDueno(page, request, escenario);
    await esperarPanel(page);
    await expect(page.getByTestId('persona-lateral-rol')).toHaveText('Dueño');
    await expect(page.getByTestId('persona-lateral-nombre')).toHaveText('Representante');
    const salir = page.getByTestId('btn-lateral-cerrar-sesion');
    expect((await caja(salir)).height).toBeGreaterThanOrEqual(44);
    await salir.click();
    await expect(page.getByTestId('modal-confirmar-logout')).toBeVisible();
    await page.getByTestId('btn-cancelar-logout').click();
    await expect(page.getByTestId('modal-confirmar-logout')).toHaveCount(0);
    await salir.click();
    await page.getByTestId('btn-confirmar-logout').click();
    await page.waitForURL('**/login.html');
  });

  test('el selector de comercio vive en la barra, mide 56 px o más y abre el panel de comercios @escritorio', async ({ page, request }) => {
    await abrirComoDueno(page, request, escenario);
    await esperarPanel(page);
    const franja = page.getByTestId('franja-comercio');
    await expect(franja).toBeVisible();
    const dentro = await franja.evaluate((nodo) => Boolean(nodo.closest('[data-testid="selector-lateral"]')));
    expect(dentro).toBe(true);
    expect((await caja(franja)).height).toBeGreaterThanOrEqual(56);
    await expect(franja).toHaveAttribute('aria-label', /Cambiar de comercio/);
    await expect(page.getByTestId('franja-comercio-nombre')).toContainText(escenario.dueno.nombre.slice(0, 10));
    await franja.click();
    await expect(page.getByTestId('panel-comercios')).toBeVisible();
  });

  test('con dos comercios el selector lista ambos y permite cambiar sin recargar la barra @escritorio', async ({ page, request }) => {
    const segundo = `Segundo ${sufijoUnico()}`;
    await clonarComercioTest(request, escenario.dueno.comercioId, segundo, 'APROBADO');
    await abrirComoDueno(page, request, escenario);
    await esperarPanel(page);
    await page.getByTestId('franja-comercio').click();
    await expect(page.getByTestId('lista-comercios')).toContainText(segundo.slice(0, 8));
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('panel-comercios')).toHaveCount(0);
  });

  test('el Empleado ve solo los ítems de su rol, la insignia de Empleado y el rol en el pie @escritorio', async ({ page, request }) => {
    await abrirComoEmpleado(page, request, escenario);
    await page.goto('/comercio-dashboard.html');
    await expect(page.getByTestId('metrica-vendido')).toBeVisible();
    for (const clave of ITEMS_EMPLEADO) {
      await expect(page.getByTestId(`btn-nav-${clave}`)).toBeVisible();
    }
    for (const clave of ['estadisticas', 'documentacion', 'equipo']) {
      await expect(page.getByTestId(`btn-nav-${clave}`)).toHaveCount(0);
    }
    await expect(page.getByTestId('franja-comercio-insignia-empleado')).toBeVisible();
    await expect(page.getByTestId('persona-lateral-rol')).toHaveText('Empleado');
    await expect(page.getByTestId('persona-lateral-nombre')).toHaveText('Clienta');
    await expect(page.getByTestId('btn-estadisticas')).toHaveCount(0);
  });

  test('el panel muestra cuatro cifras en una fila y dos columnas debajo @escritorio', async ({ page, request }) => {
    await abrirComoDueno(page, request, escenario);
    await esperarPanel(page);
    const claves = ['metrica-vendido', 'metrica-pedidos', 'metrica-pendientes', 'metrica-en-preparacion'];
    const cajas = await Promise.all(claves.map((clave) => caja(page.getByTestId(clave))));
    cajas.forEach((c) => {
      expect(c.y).toBe(cajas[0].y);
      expect(c.width).toBeGreaterThan(200);
      expect(c.height).toBeGreaterThanOrEqual(100);
    });
    for (let i = 1; i < cajas.length; i += 1) {
      expect(cajas[i].x).toBeGreaterThan(cajas[i - 1].x);
    }
    await expect(page.getByTestId('metrica-pendientes')).toContainText('2');
    await expect(page.getByTestId('metrica-en-preparacion')).toContainText('1');
    const radio = await page.getByTestId('metrica-vendido').evaluate((nodo) => getComputedStyle(nodo).borderTopLeftRadius);
    expect(radio).toBe('20px');
    const fila = await caja(page.getByTestId(`pedido-item-${escenario.pedidos.pendiente}`));
    expect(fila.height).toBeGreaterThanOrEqual(64);
    const titulo = await page.getByTestId('mensaje-saludo').evaluate((nodo) => getComputedStyle(nodo).fontSize);
    expect(titulo).toBe('34px');
    await expect(page.getByTestId('saludo-comercio')).toContainText(escenario.dueno.nombre.slice(0, 10));
    await expect(page.getByTestId('btn-estadisticas')).toBeHidden();
  });

  test('el interruptor de cierre y el de sonido quedan arriba a la derecha y "Ver todos" lleva a Pedidos @escritorio', async ({ page, request }) => {
    await abrirComoDueno(page, request, escenario);
    await esperarPanel(page);
    const saludo = await caja(page.getByTestId('mensaje-saludo'));
    const sonido = await caja(page.getByTestId('sonido-slot'));
    expect(sonido.x).toBeGreaterThan(saludo.x + saludo.width);
    expect(sonido.y).toBeLessThan(saludo.y + 120);
    await expect(page.getByTestId('enlace-ver-todos-pedidos')).toBeVisible();
    await page.getByTestId('enlace-ver-todos-pedidos').click();
    await page.waitForURL('**/comercio-pedidos.html');
  });

  test('la campana y el encabezado de celular no aparecen en el panel @escritorio', async ({ page, request }) => {
    await abrirComoDueno(page, request, escenario);
    await esperarPanel(page);
    await expect(page.getByTestId('btn-notificaciones')).toBeHidden();
    const alto = await page.locator('#top-bar-slot').evaluate((nodo) => nodo.getBoundingClientRect().height);
    expect(alto).toBe(0);
  });

  test('hover y foco visibles en la barra lateral y todo se completa con teclado @escritorio', async ({ page, request }) => {
    await abrirComoDueno(page, request, escenario);
    await esperarPanel(page);
    const productos = page.getByTestId('btn-nav-productos');
    const fondoAntes = await productos.evaluate((nodo) => getComputedStyle(nodo).backgroundColor);
    await productos.hover();
    await expect.poll(() => productos.evaluate((nodo) => getComputedStyle(nodo).backgroundColor)).not.toBe(fondoAntes);
    await tieneAnilloDeFoco(page.getByTestId('btn-nav-estadisticas'));
    await tieneAnilloDeFoco(page.getByTestId('btn-lateral-cerrar-sesion'));
    await page.getByTestId('btn-nav-productos').focus();
    await page.keyboard.press('Enter');
    await page.waitForURL('**/comercio-productos.html');
  });

  for (const pagina of PAGINAS) {
    test(`${pagina}: sin scroll horizontal a 1024, 1280, 1440 y 1920 px @escritorio`, async ({ page, request }) => {
      await abrirComoDueno(page, request, escenario);
      await page.goto(`/${pagina}`);
      await page.waitForLoadState('load');
      await page.waitForTimeout(800);
      await sinScrollHorizontalEnAnchos(page, ANCHOS_ESCRITORIO);
    });
  }
});
