import { test, expect } from './helpers/prueba';
import type { Page } from '@playwright/test';
import { ANCHOS_ESCRITORIO, caja, sinScrollHorizontalEnAnchos } from './helpers/layout';
import { abrirComoCliente, prepararEscenarioCliente } from './helpers/escritorio-cliente';
import type { EscenarioCliente } from './helpers/escritorio-cliente';
import { apiConHeaders, login } from './helpers/backend';

test.use({ viewport: { width: 1440, height: 900 } });

test.describe('Escritorio E3: Mis pedidos con lista y detalle @escritorio', () => {
  test.describe.configure({ timeout: 240_000 });
  let e: EscenarioCliente;

  test.beforeAll(async ({ request }) => {
    test.setTimeout(300_000);
    e = await prepararEscenarioCliente(request);
  });

  async function abrir(page: Page, request: any, ruta = 'pedidos.html') {
    await abrirComoCliente(page, request, e);
    await page.goto(`/${ruta}`);
  }

  const tarjeta = (page: Page, id: number) => page.getByTestId(`pedido-item-${id}`);

  test('la lista mide 440 px, está a la izquierda y el panel vacío dice «Elegí un pedido» @escritorio', async ({ page, request }) => {
    await abrir(page, request);
    await expect(tarjeta(page, e.pedidos.pendiente)).toBeVisible();
    const lista = await caja(page.getByTestId('lista-pedidos-escritorio'));
    const panel = await caja(page.getByTestId('detalle-pedido-escritorio'));
    expect(Math.round(lista.width)).toBe(440);
    expect(panel.x).toBeGreaterThan(lista.x + lista.width);
    await expect(page.getByTestId('pedidos-elegi-uno')).toContainText('Elegí un pedido');
    await expect(page.getByTestId('barra-enlace-pedidos')).toHaveAttribute('aria-current', 'page');
  });

  test('elegir un pedido carga el detalle sin navegar, refleja ?id= sin # y marca la tarjeta @escritorio', async ({ page, request }) => {
    await abrir(page, request);
    await tarjeta(page, e.pedidos.preparacion).click();
    await expect(page).toHaveURL(new RegExp(`pedidos\\.html\\?id=${e.pedidos.preparacion}$`));
    expect(page.url()).not.toContain('#');
    await expect(tarjeta(page, e.pedidos.preparacion)).toHaveAttribute('aria-current', 'true');
    const detalle = page.getByTestId('detalle-pedido-escritorio');
    await expect(detalle.getByTestId('cabecera-estado-pedido')).toBeVisible();
    await expect(detalle.getByTestId('numero-pedido')).toContainText(`#${e.pedidos.preparacion}`);
    await tarjeta(page, e.pedidos.rechazado).click();
    await expect(page).toHaveURL(new RegExp(`id=${e.pedidos.rechazado}$`));
    await expect(detalle.getByTestId('numero-pedido')).toContainText(`#${e.pedidos.rechazado}`);
    await expect(detalle.getByTestId('motivo-rechazo-pedido')).toBeVisible();
    await expect(tarjeta(page, e.pedidos.preparacion)).not.toHaveAttribute('aria-current', 'true');
  });

  test('entrar con ?id= abre ese pedido y las flechas mueven el foco entre las tarjetas @escritorio', async ({ page, request }) => {
    await abrir(page, request, `pedidos.html?id=${e.pedidos.listo}`);
    await expect(page.getByTestId('detalle-pedido-escritorio').getByTestId('numero-pedido')).toContainText(`#${e.pedidos.listo}`);
    await expect(tarjeta(page, e.pedidos.listo)).toHaveAttribute('aria-current', 'true');
    await tarjeta(page, e.pedidos.listo).focus();
    await page.keyboard.press('ArrowDown');
    let enfocada = await page.evaluate(() => document.activeElement?.getAttribute('data-testid'));
    if (enfocada === `pedido-item-${e.pedidos.listo}`) {
      await page.keyboard.press('ArrowUp');
      enfocada = await page.evaluate(() => document.activeElement?.getAttribute('data-testid'));
    }
    expect(enfocada).toMatch(/^pedido-item-/);
    expect(enfocada).not.toBe(`pedido-item-${e.pedidos.listo}`);
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(new RegExp(`id=${enfocada!.replace('pedido-item-', '')}$`));
  });

  test('un pedido que no es de la persona muestra el aviso dentro del panel @escritorio', async ({ page, request }) => {
    await abrir(page, request, 'pedidos.html?id=99999999');
    await expect(page.getByTestId('pedidos-elegi-uno')).toContainText('No encontramos este pedido');
  });

  test('pedido-detalle.html redirige a la lista con el pedido elegido y conserva los parámetros @escritorio', async ({ page, request }) => {
    await abrir(page, request, `pedido-detalle.html?id=${e.pedidos.entregado}`);
    await expect(page).toHaveURL(new RegExp(`pedidos\\.html\\?id=${e.pedidos.entregado}`));
    await expect(page.getByTestId('detalle-pedido-escritorio').getByTestId('numero-pedido')).toContainText(`#${e.pedidos.entregado}`);
  });

  test('los filtros por estado achican la lista y se pueden combinar con la selección @escritorio', async ({ page, request }) => {
    await abrir(page, request);
    await expect(tarjeta(page, e.pedidos.pendiente)).toBeVisible();
    for (const clave of ['todos', 'en-curso', 'entregados', 'cancelados']) {
      expect((await caja(page.getByTestId(`filtro-pedidos-${clave}`))).height).toBe(44);
    }
    await page.getByTestId('filtro-pedidos-entregados').click();
    await expect(page.getByTestId('filtro-pedidos-entregados')).toHaveAttribute('aria-pressed', 'true');
    await expect(tarjeta(page, e.pedidos.entregado)).toBeVisible();
    await expect(tarjeta(page, e.pedidos.pendiente)).toHaveCount(0);
    await page.getByTestId('filtro-pedidos-cancelados').click();
    await expect(tarjeta(page, e.pedidos.rechazado)).toBeVisible();
    await expect(tarjeta(page, e.pedidos.entregado)).toHaveCount(0);
    await page.getByTestId('filtro-pedidos-en-curso').click();
    await expect(tarjeta(page, e.pedidos.pendiente)).toBeVisible();
  });

  test('cancelar un pedido usa el diálogo centrado, muestra el toast y actualiza lista y detalle @escritorio', async ({ page, request }) => {
    await abrir(page, request, `pedidos.html?id=${e.pedidos.pendiente2}`);
    const detalle = page.getByTestId('detalle-pedido-escritorio');
    await expect(detalle.getByTestId('btn-cancelar-pedido')).toBeVisible();
    await detalle.getByTestId('btn-cancelar-pedido').click();
    const hoja = page.getByTestId('hoja-cancelar-pedido');
    await expect(hoja).toBeVisible();
    await page.getByTestId('btn-volver-hoja').click();
    await expect(hoja).toHaveCount(0);
    await detalle.getByTestId('btn-cancelar-pedido').click();
    await page.getByTestId('btn-confirmar-cancelar-pedido').click();
    await expect(page.getByTestId('toast-exito')).toBeVisible();
    await expect(detalle.getByTestId('btn-cancelar-pedido')).toHaveCount(0);
    await expect(tarjeta(page, e.pedidos.pendiente2).getByTestId('estado-pedido')).toContainText(/Cancelado/);
    expect(page.url()).toContain(`id=${e.pedidos.pendiente2}`);
  });

  test('las acciones del detalle se alinean a la derecha y confirmar la recepción cierra el pedido en camino @escritorio', async ({ page, request }) => {
    await abrir(page, request, `pedidos.html?id=${e.pedidoEnCamino}`);
    const detalle = page.getByTestId('detalle-pedido-escritorio');
    const boton = detalle.getByTestId('btn-confirmar-entrega');
    await expect(boton).toBeVisible();
    const panel = await caja(detalle);
    const accion = await caja(boton);
    const verComercio = await caja(detalle.getByTestId('btn-ver-comercio'));
    expect(verComercio.x + verComercio.width).toBeGreaterThan(panel.x + panel.width - 60);
    expect(accion.x).toBeLessThan(verComercio.x);
    expect(Math.abs(accion.y - verComercio.y)).toBeLessThan(6);
    expect(accion.width).toBeLessThan(400);
    await boton.click();
    await page.getByTestId('btn-confirmar-confirmar-recepcion').click();
    await expect(page.getByTestId('toast-exito')).toBeVisible();
    await expect(detalle.getByTestId('btn-confirmar-entrega')).toHaveCount(0);
    await expect(tarjeta(page, e.pedidoEnCamino).getByTestId('estado-pedido')).toContainText('Entregado');
  });

  test('un pedido entregado ofrece reclamar y el pedido sin pagar ofrece ir a pagar @escritorio', async ({ page, request }) => {
    await abrir(page, request, `pedidos.html?id=${e.pedidoReclamable}`);
    const detalle = page.getByTestId('detalle-pedido-escritorio');
    await expect(detalle.getByTestId('seccion-reclamar')).toBeVisible();
    await expect(detalle.getByTestId('btn-reclamar-pedido')).toBeVisible();
    await tarjeta(page, e.pedidoSinPagar).click();
    await expect(detalle.getByTestId('btn-ir-a-pagar')).toBeVisible();
    await expect(detalle.getByTestId('btn-ver-comercio')).toBeVisible();
  });

  test('el sondeo conserva la selección cuando el comercio acepta un pedido @escritorio', async ({ page, request }) => {
    await abrir(page, request, `pedidos.html?id=${e.pedidos.pendiente}`);
    const detalle = page.getByTestId('detalle-pedido-escritorio');
    await expect(detalle.getByTestId('btn-cancelar-pedido')).toBeVisible();
    await expect(tarjeta(page, e.pedidos.pendiente).getByTestId('estado-pedido')).toContainText('Esperando al comercio');
    const dueno = await login(request, e.dueno.nombreUsuario, e.dueno.password);
    const respuesta = await apiConHeaders(request, 'PUT', `/pedidos/comercio/${e.pedidos.pendiente}/aceptar`, dueno.token, { 'X-Comercio-Id': String(e.dueno.comercioId) });
    expect(respuesta.status).toBe(200);
    await expect(tarjeta(page, e.pedidos.pendiente).getByTestId('estado-pedido')).toContainText('En preparación', { timeout: 30_000 });
    await expect(tarjeta(page, e.pedidos.pendiente)).toHaveAttribute('aria-current', 'true');
    expect(page.url()).toContain(`id=${e.pedidos.pendiente}`);
    await expect(detalle.getByTestId('numero-pedido')).toContainText(`#${e.pedidos.pendiente}`);
  });

  test('los avisos de la campana apuntan a pedido-detalle.html y terminan en la lista con el detalle @escritorio', async ({ page, request }) => {
    await abrir(page, request, 'notificaciones.html');
    const enlace = page.locator('a.notification-item').first();
    await expect(enlace).toBeVisible();
    await enlace.click();
    await expect(page).toHaveURL(/pedidos\.html\?id=\d+/);
    await expect(page.getByTestId('detalle-pedido-escritorio').getByTestId('cabecera-estado-pedido')).toBeVisible();
  });

  test('Mis pedidos no tiene scroll horizontal entre 1024 y 1920 px @escritorio', async ({ page, request }) => {
    await abrir(page, request, `pedidos.html?id=${e.pedidos.preparacion}`);
    await expect(page.getByTestId('detalle-pedido-escritorio').getByTestId('cabecera-estado-pedido')).toBeVisible();
    await sinScrollHorizontalEnAnchos(page, ANCHOS_ESCRITORIO);
  });
});
