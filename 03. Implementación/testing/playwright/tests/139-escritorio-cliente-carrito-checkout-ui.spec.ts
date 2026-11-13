import { test, expect } from './helpers/prueba';
import type { Page } from '@playwright/test';
import { ANCHOS_ESCRITORIO, caja, sinScrollHorizontalEnAnchos } from './helpers/layout';
import { abrirComoCliente, dejarCarritoConItems, prepararEscenarioCliente } from './helpers/escritorio-cliente';
import type { EscenarioCliente } from './helpers/escritorio-cliente';
import { apiDelete, apiGet, confirmarPagoTest, login } from './helpers/backend';

test.use({ viewport: { width: 1440, height: 900 } });

test.describe('Escritorio E3: carrito y checkout en dos columnas @escritorio', () => {
  test.describe.configure({ timeout: 240_000 });
  let e: EscenarioCliente;
  let token: string;

  test.beforeAll(async ({ request }) => {
    test.setTimeout(300_000);
    e = await prepararEscenarioCliente(request);
  });

  test.beforeEach(async ({ request }) => {
    token = (await login(request, e.cliente.nombreUsuario, e.cliente.password)).token;
    await apiDelete(request, '/carrito', token);
    await dejarCarritoConItems(request, e, token);
  });

  async function abrir(page: Page, request: any, ruta: string) {
    const sesion = await abrirComoCliente(page, request, e);
    await page.goto(`/${ruta}`);
    return sesion;
  }

  test('el carrito tiene la lista a la izquierda y el resumen fijo de 380 px a la derecha, sin pie de celular @escritorio', async ({ page, request }) => {
    await abrir(page, request, 'carrito.html');
    await expect(page.getByTestId('tarjeta-comercio-carrito')).toBeVisible();
    const lista = await caja(page.locator('.cart-list'));
    const resumen = await caja(page.locator('.cart-footer'));
    expect(resumen.x).toBeGreaterThan(lista.x + lista.width);
    expect(Math.round(resumen.width)).toBe(380);
    expect(Math.abs(resumen.y - (await caja(page.getByTestId('tarjeta-comercio-carrito'))).y)).toBeLessThan(4);
    expect(await page.locator('.cart-footer').evaluate((nodo) => getComputedStyle(nodo).position)).toBe('sticky');
    await expect(page.getByTestId('subtotal-carrito')).toBeVisible();
    await expect(page.getByTestId('total-carrito')).toBeVisible();
    await expect(page.getByTestId('btn-confirmar-pedido')).toBeVisible();
    const alturaFila = (await caja(page.locator('.cart-item').first())).height;
    expect(alturaFila).toBeLessThan(110);
  });

  test('cada fila del carrito pone foto, nombre, cantidad, subtotal y quitar en una sola línea @escritorio', async ({ page, request }) => {
    await abrir(page, request, 'carrito.html');
    const fila = page.locator('.cart-item').first();
    await expect(fila).toBeVisible();
    const items = await Promise.all([
      caja(fila.locator('.cart-item__thumb')),
      caja(fila.locator('.cart-item__info')),
      caja(fila.locator('.stepper')),
      caja(fila.locator('.cart-item__subtotal')),
      caja(fila.locator('.cart-item__remove')),
    ]);
    for (let i = 1; i < items.length; i += 1) {
      expect(items[i].x).toBeGreaterThan(items[i - 1].x);
    }
  });

  test('cambiar la cantidad actualiza el resumen y quitar un producto muestra el aviso @escritorio', async ({ page, request }) => {
    await abrir(page, request, 'carrito.html');
    const total = page.getByTestId('total-carrito');
    await expect(total).toHaveText('$16.400');
    await page.locator('[data-testid^="btn-sumar-cantidad-"]').first().click();
    await expect(total).toHaveText('$22.900');
    await page.locator('[data-testid^="btn-eliminar-item-carrito-"]').last().click();
    await expect(page.getByTestId('toast-exito')).toBeVisible();
    await expect(total).toHaveText('$19.700');
  });

  test('«Vaciar todo» vive en la cabecera de la página y pide confirmación @escritorio', async ({ page, request }) => {
    await abrir(page, request, 'carrito.html');
    const vaciar = page.getByTestId('btn-vaciar-carrito');
    await expect(vaciar).toBeVisible();
    const cabecera = await caja(page.getByTestId('tarjeta-comercio-carrito'));
    expect((await caja(vaciar)).y).toBeLessThan(cabecera.y);
    await vaciar.click();
    await expect(page.getByTestId('modal-vaciar-carrito')).toBeVisible();
    await page.getByTestId('btn-cancelar-vaciar-carrito').click();
    await expect(page.getByTestId('modal-vaciar-carrito')).toHaveCount(0);
    await vaciar.click();
    await page.getByTestId('btn-confirmar-vaciar-carrito').click();
    await expect(page.getByTestId('toast-exito')).toBeVisible();
    await expect(page.getByTestId('estado-vacio').or(page.getByText('Tu carrito está vacío'))).toBeVisible();
    await expect(page.locator('.cart-footer')).toHaveCount(0);
  });

  test('el diálogo de cambio de comercio es el diálogo centrado de siempre @escritorio', async ({ page, request }) => {
    await abrir(page, request, 'carrito.html');
    await expect(page.getByTestId('btn-vaciar-carrito')).toBeVisible();
    await page.getByTestId('btn-vaciar-carrito').click();
    const hoja = page.getByTestId('modal-vaciar-carrito');
    const medida = await caja(hoja.locator('.hoja, .modal-sheet').first());
    expect(medida.y).toBeGreaterThan(0);
    expect(medida.width).toBeLessThanOrEqual(640);
  });

  test('el checkout muestra el resumen fijo a la derecha en los cuatro pasos y recorre hasta el pago @escritorio', async ({ page, request }) => {
    await abrir(page, request, 'checkout.html');
    const resumen = page.getByTestId('checkout-resumen');
    await expect(resumen).toBeVisible();
    await expect(page.locator('.checkout-titulo')).toHaveText('Confirmá tu pedido');
    const medida = await caja(resumen);
    expect(Math.round(medida.width)).toBe(412 - 32);
    await expect(page.getByTestId('resumen-total')).toHaveText('$16.400');
    await expect(page.getByTestId('btn-resumen-accion')).toBeDisabled();

    await expect(page.getByTestId('btn-modalidad-retiro')).toBeVisible();
    const opciones = await Promise.all([caja(page.getByTestId('btn-modalidad-domicilio')), caja(page.getByTestId('btn-modalidad-retiro'))]);
    expect(opciones[1].x).toBeGreaterThan(opciones[0].x + opciones[0].width - 1);
    expect(Math.abs(opciones[0].y - opciones[1].y)).toBeLessThan(40);
    await page.getByTestId('btn-modalidad-retiro').click();
    await expect(page.getByTestId('btn-resumen-accion')).toBeEnabled();
    const volver = await caja(page.getByTestId('btn-checkout-volver'));
    const continuar = await caja(page.getByTestId('btn-continuar-modalidad'));
    expect(volver.x).toBeLessThan(continuar.x);
    expect(Math.abs(volver.y + volver.height / 2 - (continuar.y + continuar.height / 2))).toBeLessThan(6);
    await page.getByTestId('btn-resumen-accion').click();

    await expect(page.getByTestId('btn-confirmar-retiro')).toBeVisible();
    await expect(resumen).toBeVisible();
    await page.getByTestId('btn-confirmar-retiro').click();

    await expect(page.getByTestId('btn-confirmar-pedido')).toBeVisible();
    await expect(page.getByTestId('btn-resumen-accion')).toContainText('Ir a pagar');
    await expect(resumen).toBeVisible();
    await page.getByTestId('btn-resumen-accion').click();

    await expect(page.getByTestId('btn-ir-a-pagar')).toBeVisible();
    await expect(page.getByTestId('btn-resumen-accion')).toContainText('Ir a pagar con Mercado Pago');
    await expect(page.getByTestId('btn-checkout-volver')).toBeHidden();
    await expect(resumen).toBeVisible();
  });

  test('«Volver» retrocede de paso y desde el primero regresa al carrito @escritorio', async ({ page, request }) => {
    await abrir(page, request, 'checkout.html');
    await page.getByTestId('btn-modalidad-retiro').click();
    await page.getByTestId('btn-continuar-modalidad').click();
    await expect(page.getByTestId('btn-confirmar-retiro')).toBeVisible();
    await page.getByTestId('btn-checkout-volver').click();
    await expect(page.getByTestId('btn-modalidad-retiro')).toBeVisible();
    await page.getByTestId('btn-checkout-volver').click();
    await page.waitForURL('**/carrito.html');
  });

  test('el envío a domicilio muestra las direcciones en una grilla de dos columnas @escritorio', async ({ page, request }) => {
    await abrir(page, request, 'checkout.html');
    await page.getByTestId('btn-modalidad-domicilio').click();
    await page.getByTestId('btn-continuar-modalidad').click();
    const grupo = page.getByTestId('radiogroup-direcciones');
    await expect(grupo).toBeVisible();
    const tarjetas = grupo.locator('[role="radio"]');
    await expect(tarjetas).toHaveCount(3);
    const posiciones = await tarjetas.evaluateAll((nodos) => nodos.map((nodo) => Math.round(nodo.getBoundingClientRect().x)));
    expect(new Set(posiciones).size).toBe(2);
    await expect(page.getByTestId('btn-agregar-otra-direccion')).toBeVisible();
  });

  test('el recorrido completo crea el pedido y, tras el pago simulado, queda elegible en Mis pedidos @escritorio', async ({ page, request }) => {
    const sesion = await abrir(page, request, 'checkout.html');
    await page.getByTestId('btn-modalidad-retiro').click();
    await page.getByTestId('btn-resumen-accion').click();
    await page.getByTestId('btn-resumen-accion').click();
    await page.getByTestId('btn-resumen-accion').click();
    await expect(page.getByTestId('btn-ir-a-pagar')).toBeVisible();
    const lista = await apiGet(request, '/pedidos/cliente', sesion.token);
    const pedidos = lista.body.data as Array<{ id: number; estado: string }>;
    const nuevo = pedidos.filter((p) => p.estado === 'PENDIENTE_PAGO').sort((a, b) => b.id - a.id)[0];
    await confirmarPagoTest(request, nuevo.id);
    await page.goto(`/pedido-detalle.html?id=${nuevo.id}&pago=exito`);
    await expect(page).toHaveURL(new RegExp(`pedidos\\.html\\?id=${nuevo.id}`));
    await expect(page.getByTestId('detalle-pedido-escritorio')).toBeVisible();
    await expect(page.getByTestId('detalle-pedido-escritorio').getByTestId('numero-pedido')).toContainText(`#${nuevo.id}`);
  });

  test('carrito y checkout no tienen scroll horizontal entre 1024 y 1920 px @escritorio', async ({ page, request }) => {
    await abrir(page, request, 'carrito.html');
    await expect(page.getByTestId('tarjeta-comercio-carrito')).toBeVisible();
    await sinScrollHorizontalEnAnchos(page, ANCHOS_ESCRITORIO);
    await page.goto('/checkout.html');
    await expect(page.getByTestId('checkout-resumen')).toBeVisible();
    await sinScrollHorizontalEnAnchos(page, ANCHOS_ESCRITORIO);
  });
});
