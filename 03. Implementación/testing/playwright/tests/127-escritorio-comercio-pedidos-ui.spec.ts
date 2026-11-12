import { test, expect } from './helpers/prueba';
import type { APIRequestContext, Page } from '@playwright/test';
import { agregarItemCarrito, apiConHeaders, confirmarPagoTest, crearPedido, login } from './helpers/backend';
import { ANCHOS_ESCRITORIO, caja, esDialogoCentrado, sinScrollHorizontalEnAnchos, tieneAnilloDeFoco } from './helpers/layout';
import { abrirComoDueno, abrirComoEmpleado, prepararEscenarioComercio } from './helpers/escritorio-comercio';
import type { EscenarioComercio } from './helpers/escritorio-comercio';

test.use({ viewport: { width: 1440, height: 900 } });

test.describe('Escritorio E1: pedidos con lista y detalle @escritorio', () => {
  test.describe.configure({ timeout: 240_000 });
  let escenario: EscenarioComercio;

  test.beforeAll(async ({ request }) => {
    escenario = await prepararEscenarioComercio(request);
  });

  async function pedidoNuevo(request: APIRequestContext): Promise<number> {
    const sesion = await login(request, escenario.cliente.nombreUsuario, escenario.cliente.password);
    await agregarItemCarrito(request, sesion.token, escenario.productoIds[0], 1);
    const id = await crearPedido(request, sesion.token, 'RETIRO');
    await confirmarPagoTest(request, id);
    return id;
  }

  async function abrirPedidos(page: Page, request: APIRequestContext, consulta = '') {
    await abrirComoDueno(page, request, escenario);
    await page.goto(`/comercio-pedidos.html${consulta}`);
    await expect(page.getByTestId(`pedido-item-${escenario.pedidos.pendiente}`)).toBeVisible();
  }

  test('la lista mide 440 px a la izquierda y el detalle ocupa el resto a la derecha @escritorio', async ({ page, request }) => {
    await abrirPedidos(page, request);
    const lista = await caja(page.getByTestId('lista-pedidos'));
    const panel = await caja(page.getByTestId('pedido-detalle-panel'));
    expect(lista.width).toBe(440);
    expect(panel.x).toBeGreaterThan(lista.x + lista.width);
    expect(panel.width).toBeGreaterThan(600);
    expect(Math.abs(panel.y - lista.y)).toBeLessThanOrEqual(24);
    const chips = await caja(page.getByTestId('fila-chips-filtro'));
    expect(chips.y).toBeLessThan(lista.y);
    await expect(page.getByTestId('pedido-detalle-vacio')).toContainText('Elegí un pedido');
  });

  test('elegir un pedido carga el detalle a la derecha sin navegar y deja el id en la URL, sin anchors @escritorio', async ({ page, request }) => {
    await abrirPedidos(page, request);
    await page.evaluate(() => {
      (window as unknown as { __sinRecarga: boolean }).__sinRecarga = true;
    });
    const tarjeta = page.getByTestId(`pedido-item-${escenario.pedidos.preparacion}`);
    await tarjeta.click();
    await expect(page.getByTestId('pedido-detalle-panel-contenido').getByTestId('numero-pedido')).toContainText(`Pedido #${escenario.pedidos.preparacion}`);
    expect(await page.evaluate(() => (window as unknown as { __sinRecarga?: boolean }).__sinRecarga)).toBe(true);
    expect(page.url()).toContain(`comercio-pedidos.html?id=${escenario.pedidos.preparacion}`);
    expect(page.url()).not.toContain('#');
    await expect(tarjeta).toHaveAttribute('aria-current', 'true');
    const estilo = await tarjeta.evaluate((nodo) => ({ borde: getComputedStyle(nodo).borderTopColor, fondo: getComputedStyle(nodo).backgroundColor }));
    expect(estilo.borde).toBe('rgb(255, 71, 0)');
    expect(estilo.fondo).toBe('rgb(255, 247, 242)');
    await page.getByTestId(`pedido-item-${escenario.pedidos.listo}`).click();
    await expect(page.getByTestId('pedido-detalle-panel-contenido').getByTestId('numero-pedido')).toContainText(`Pedido #${escenario.pedidos.listo}`);
    await expect(tarjeta).not.toHaveAttribute('aria-current', 'true');
  });

  test('abrir con ?id= deja ese pedido seleccionado y uno inexistente muestra el estado vacío útil @escritorio', async ({ page, request }) => {
    await abrirPedidos(page, request, `?id=${escenario.pedidos.listo}`);
    await expect(page.getByTestId('pedido-detalle-panel-contenido').getByTestId('numero-pedido')).toContainText(`Pedido #${escenario.pedidos.listo}`);
    await expect(page.getByTestId(`pedido-item-${escenario.pedidos.listo}`)).toHaveAttribute('aria-current', 'true');
    await page.goto('/comercio-pedidos.html?id=99999999');
    await expect(page.getByTestId('pedido-detalle-vacio')).toContainText('No encontramos este pedido');
  });

  test('la página de detalle redirige al maestro-detalle con el mismo id @escritorio', async ({ page, request }) => {
    await abrirComoDueno(page, request, escenario);
    await page.goto(`/comercio-pedido-detalle.html?id=${escenario.pedidos.rechazado}`);
    await page.waitForURL(`**/comercio-pedidos.html?id=${escenario.pedidos.rechazado}`);
    await expect(page.getByTestId('pedido-detalle-panel-contenido').getByTestId('numero-pedido')).toContainText(`Pedido #${escenario.pedidos.rechazado}`);
    await expect(page.getByTestId('motivo-rechazo-pedido')).toBeVisible();
  });

  test('las flechas recorren la lista, Enter abre el detalle y el foco es visible @escritorio', async ({ page, request }) => {
    await abrirPedidos(page, request);
    const primera = page.locator('[data-testid^="pedido-item-"]').first();
    await tieneAnilloDeFoco(primera);
    const idDeLaSegunda = await page.locator('[data-testid^="pedido-item-"]').nth(1).getAttribute('data-testid');
    await page.keyboard.press('ArrowDown');
    await expect(page.getByTestId(idDeLaSegunda as string)).toBeFocused();
    await page.keyboard.press('ArrowUp');
    await expect(primera).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    const numero = (idDeLaSegunda as string).replace('pedido-item-', '');
    await expect(page.getByTestId('pedido-detalle-panel-contenido').getByTestId('numero-pedido')).toContainText(`Pedido #${numero}`);
    await expect(page.getByTestId(idDeLaSegunda as string)).toBeFocused();
  });

  test('la selección se conserva al cambiar de filtro y no se pierde con el sondeo @escritorio', async ({ page, request }) => {
    await abrirPedidos(page, request, `?id=${escenario.pedidos.preparacion}`);
    await expect(page.getByTestId('pedido-detalle-panel-contenido')).toBeVisible();
    await page.getByTestId('chip-filtro-rechazado').click();
    await expect(page.getByTestId(`pedido-item-${escenario.pedidos.preparacion}`)).toHaveCount(0);
    await expect(page.getByTestId('pedido-detalle-panel-contenido').getByTestId('numero-pedido')).toContainText(`Pedido #${escenario.pedidos.preparacion}`);
    await page.getByTestId('chip-filtro-todos').click();
    const otro = await pedidoNuevo(request);
    await expect(page.getByTestId(`pedido-item-${otro}`)).toBeVisible({ timeout: 40_000 });
    await expect(page.getByTestId('pedido-detalle-panel-contenido').getByTestId('numero-pedido')).toContainText(`Pedido #${escenario.pedidos.preparacion}`);
  });

  test('aceptar un pedido desde el panel lo pasa a preparación y actualiza la lista @escritorio', async ({ page, request }) => {
    await abrirPedidos(page, request);
    await page.getByTestId(`pedido-item-${escenario.pedidos.pendiente}`).click();
    const aceptar = page.getByTestId('btn-aceptar-pedido');
    await expect(aceptar).toBeVisible();
    const cajaAceptar = await caja(aceptar);
    const cajaRechazar = await caja(page.getByTestId('btn-rechazar-pedido'));
    expect(cajaAceptar.x).toBeGreaterThan(cajaRechazar.x);
    expect(cajaAceptar.width).toBeLessThan(400);
    await aceptar.click();
    await expect(page.getByTestId('toast').or(page.locator('.toast')).first()).toContainText('Pedido aceptado');
    await expect(page.getByTestId('btn-despachar-pedido')).toBeVisible();
    await expect(page.getByTestId(`pedido-item-${escenario.pedidos.pendiente}`).getByTestId('estado-pedido')).toContainText('En preparación');
  });

  test('anular desde el panel abre un diálogo centrado de 480 px con el título del pedido y completa la acción @escritorio', async ({ page, request }) => {
    await abrirPedidos(page, request);
    await page.getByTestId(`pedido-item-${escenario.pedidos.preparacion}`).click();
    const anular = page.getByTestId('btn-anular-pedido');
    await anular.click();
    const hoja = page.locator('.hoja').first();
    await expect(hoja).toBeVisible();
    await esDialogoCentrado(page, hoja, { anchoMinimo: 440, anchoMaximo: 520 });
    await expect(hoja).toContainText(`¿Anular el pedido #${escenario.pedidos.preparacion}?`);
    await page.getByTestId('select-motivo-anulacion').selectOption('SIN_STOCK');
    await page.getByTestId('btn-confirmar-anulacion').click();
    await expect(page.locator('.toast').first()).toContainText('Pedido anulado');
    await expect(page.getByTestId(`pedido-item-${escenario.pedidos.preparacion}`).getByTestId('estado-pedido')).toContainText('Anulado');
    await expect(page.getByTestId('pedido-detalle-panel-contenido').getByTestId('estado-pedido')).toBeVisible();
  });

  test('rechazar desde el panel pide motivo y deja el pedido rechazado @escritorio', async ({ page, request }) => {
    const nuevo = await pedidoNuevo(request);
    await abrirPedidos(page, request, `?id=${nuevo}`);
    await expect(page.getByTestId('btn-rechazar-pedido')).toBeVisible();
    await page.getByTestId('btn-rechazar-pedido').click();
    await page.getByTestId('select-motivo-rechazo').selectOption('SIN_STOCK');
    await page.getByTestId('btn-confirmar-rechazo').click();
    await expect(page.locator('.toast').first()).toContainText('Pedido rechazado');
    await expect(page.getByTestId('pedido-detalle-panel-contenido').getByTestId('motivo-rechazo-pedido')).toBeVisible();
  });

  test('entregar un pedido listo para retirar y cerrar otro como no retirado respetan la espera @escritorio', async ({ page, request }) => {
    await abrirPedidos(page, request, `?id=${escenario.pedidos.listo}`);
    await expect(page.getByTestId('btn-confirmar-retiro')).toBeVisible();
    await expect(page.getByTestId('btn-cerrar-no-retirado')).toBeDisabled();
    await expect(page.getByTestId('ayuda-no-retirado')).toContainText('Disponible en');
    await page.getByTestId('btn-confirmar-retiro').click();
    await expect(page.locator('.toast').first()).toContainText('Pedido entregado');
  });

  test('el Empleado también usa la lista con detalle y ve el chip del estado @escritorio', async ({ page, request }) => {
    await abrirComoEmpleado(page, request, escenario);
    await page.goto(`/comercio-pedidos.html?id=${escenario.pedidos.entregado}`);
    await expect(page.getByTestId('pedido-detalle-panel-contenido').getByTestId('numero-pedido')).toContainText(`Pedido #${escenario.pedidos.entregado}`);
    await expect(page.getByTestId('persona-lateral-rol')).toHaveText('Empleado');
    await expect(page.getByTestId('recorrido-pedido')).toBeVisible();
  });

  test('pedidos con un pedido elegido no produce scroll horizontal a ningún ancho @escritorio', async ({ page, request }) => {
    await abrirPedidos(page, request, `?id=${escenario.pedidos.entregado}`);
    await expect(page.getByTestId('pedido-detalle-panel-contenido')).toBeVisible();
    await sinScrollHorizontalEnAnchos(page, ANCHOS_ESCRITORIO);
  });

  test('no hay efectos en el backend al elegir pedidos: solo lecturas @escritorio', async ({ page, request }) => {
    const metodos: string[] = [];
    page.on('request', (peticion) => {
      if (peticion.url().includes('/api/v1/pedidos/comercio') && peticion.method() !== 'GET') {
        metodos.push(peticion.method());
      }
    });
    await abrirPedidos(page, request);
    await page.getByTestId(`pedido-item-${escenario.pedidos.entregado}`).click();
    await expect(page.getByTestId('pedido-detalle-panel-contenido')).toBeVisible();
    expect(metodos).toEqual([]);
    const verificacion = await apiConHeaders(request, 'GET', '/pedidos/comercio', (await login(request, escenario.dueno.nombreUsuario, escenario.dueno.password)).token, { 'X-Comercio-Id': String(escenario.dueno.comercioId) });
    expect(verificacion.status).toBe(200);
  });
});
