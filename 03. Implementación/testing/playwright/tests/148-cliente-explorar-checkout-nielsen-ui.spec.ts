import { test, expect } from './helpers/prueba';
import type { Page } from '@playwright/test';
import { abrirComoCliente, dejarCarritoConItems } from './helpers/escritorio-cliente';
import { prepararEscenarioComercio } from './helpers/escritorio-comercio';
import type { EscenarioComercio } from './helpers/escritorio-comercio';
import { apiDelete, login, sqlTest } from './helpers/backend';
import { caja } from './helpers/layout';

test.describe('Cliente: Explorar con búsqueda clara y filtros que se limpian (C04)', () => {
  test.describe.configure({ timeout: 240_000 });
  let e: EscenarioComercio;

  test.beforeAll(async ({ request }) => {
    test.setTimeout(300_000);
    e = await prepararEscenarioComercio(request);
  });

  async function abrirExplorar(page: Page, request: any, consulta = '') {
    await abrirComoCliente(page, request, e);
    await page.goto(`/explorar.html${consulta}`);
    await expect(page.getByTestId('contador-resultados-explorar')).toHaveText(/^\d+ resultados?$/);
  }

  test('el buscador tiene nombre accesible y no muestra el botón de borrar mientras está vacío', async ({ page, request }) => {
    await abrirExplorar(page, request);
    await expect(page.getByRole('textbox', { name: 'Buscar producto por nombre' })).toBeVisible();
    await expect(page.getByTestId('btn-limpiar-busqueda-explorar')).toBeHidden();
    await expect(page.getByTestId('btn-limpiar-filtros-explorar')).toBeHidden();
  });

  test('el contador dice cuántos resultados hay y se actualiza al filtrar', async ({ page, request }) => {
    await abrirExplorar(page, request);
    const contador = page.getByTestId('contador-resultados-explorar');
    const total = Number((await contador.innerText()).split(' ')[0]);
    expect(total).toBeGreaterThanOrEqual(3);

    await page.getByTestId(`chip-categoria-${e.categoriaId}`).click();
    await expect(contador).toHaveText('3 resultados');
    await expect(page.getByTestId('btn-limpiar-filtros-explorar')).toBeVisible();
  });

  test('escribir muestra el botón de borrar; borrar vacía el campo, devuelve el foco y recarga la lista', async ({ page, request }) => {
    await abrirExplorar(page, request);
    const contador = page.getByTestId('contador-resultados-explorar');
    const total = await contador.innerText();
    const entrada = page.getByTestId('input-buscar-producto-explorar');
    const borrar = page.getByTestId('btn-limpiar-busqueda-explorar');

    await entrada.fill('zzzzzz-no-existe');
    await expect(borrar).toBeVisible();
    await expect(contador).toHaveText('0 resultados');
    await expect(page.getByText('Sin resultados')).toBeVisible();
    await expect(page.getByTestId('btn-limpiar-filtros-explorar')).toBeVisible();

    await borrar.click();
    await expect(entrada).toHaveValue('');
    await expect(entrada).toBeFocused();
    await expect(borrar).toBeHidden();
    await expect(contador).toHaveText(total);
    await expect(page.getByTestId('btn-limpiar-filtros-explorar')).toBeHidden();
  });

  test('«Limpiar filtros» saca búsqueda, categoría y tags de una vez', async ({ page, request }) => {
    await abrirExplorar(page, request);
    const contador = page.getByTestId('contador-resultados-explorar');
    const total = await contador.innerText();

    await page.getByTestId(`chip-categoria-${e.categoriaId}`).click();
    await expect(contador).toHaveText('3 resultados');
    await page.getByTestId('input-buscar-producto-explorar').fill('papas');
    await expect(contador).toHaveText('1 resultado');
    await expect(page.getByTestId(`chip-categoria-${e.categoriaId}`)).toHaveAttribute('aria-pressed', 'true');

    await page.getByTestId('btn-limpiar-filtros-explorar').click();
    await expect(page.getByTestId('input-buscar-producto-explorar')).toHaveValue('');
    await expect(page.getByTestId('chip-categoria-todas')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId(`chip-categoria-${e.categoriaId}`)).toHaveAttribute('aria-pressed', 'false');
    await expect(contador).toHaveText(total);
    await expect(page.getByTestId('btn-limpiar-filtros-explorar')).toBeHidden();
    await expect(page.getByTestId('btn-limpiar-busqueda-explorar')).toBeHidden();
  });

  test('si se llega con una búsqueda en la URL, el botón de borrar y «Limpiar filtros» ya están a la vista', async ({ page, request }) => {
    await abrirExplorar(page, request, '?q=papas');
    await expect(page.getByTestId('input-buscar-producto-explorar')).toHaveValue('papas');
    await expect(page.getByTestId('btn-limpiar-busqueda-explorar')).toBeVisible();
    await expect(page.getByTestId('btn-limpiar-filtros-explorar')).toBeVisible();
    await page.getByTestId('btn-limpiar-filtros-explorar').click();
    await expect(page.getByTestId('input-buscar-producto-explorar')).toHaveValue('');
  });

  test('el botón de borrar y «Limpiar filtros» se pueden tocar con el pulgar (44 px)', async ({ page, request }) => {
    await abrirExplorar(page, request, '?q=papas');
    const borrar = await caja(page.getByTestId('btn-limpiar-busqueda-explorar'));
    const limpiar = await caja(page.getByTestId('btn-limpiar-filtros-explorar'));
    expect(borrar.width).toBeGreaterThanOrEqual(44);
    expect(borrar.height).toBeGreaterThanOrEqual(44);
    expect(limpiar.height).toBeGreaterThanOrEqual(44);
    const ancho = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(ancho).toBeLessThanOrEqual(0);
  });

  test('en escritorio el contador y «Limpiar filtros» conviven con la grilla @escritorio', async ({ page, request }) => {
    await abrirExplorar(page, request);
    await page.getByTestId(`chip-categoria-${e.categoriaId}`).click();
    await expect(page.getByTestId('contador-resultados-explorar')).toHaveText('3 resultados');
    const limpiar = await caja(page.getByTestId('btn-limpiar-filtros-explorar'));
    const primerProducto = await caja(page.locator('[data-testid^="producto-item-"]').first());
    expect(limpiar.y + limpiar.height).toBeLessThanOrEqual(primerProducto.y + 1);
    await page.getByTestId('btn-limpiar-filtros-explorar').click();
    await expect(page.getByTestId('btn-limpiar-filtros-explorar')).toBeHidden();
  });
});

test.describe('Cliente: el checkout avanza al elegir la modalidad (C05)', () => {
  test.describe.configure({ timeout: 240_000 });
  let e: EscenarioComercio;
  let token: string;

  function modalidades(delivery: number, retiro: number) {
    sqlTest(`UPDATE comercio SET acepta_delivery = ${delivery}, acepta_retiro = ${retiro} WHERE id = ${e.dueno.comercioId};`);
  }

  test.beforeAll(async ({ request }) => {
    test.setTimeout(300_000);
    e = await prepararEscenarioComercio(request);
  });

  test.beforeEach(async ({ request }) => {
    token = (await login(request, e.cliente.nombreUsuario, e.cliente.password)).token;
    await apiDelete(request, '/carrito', token);
    await dejarCarritoConItems(request, e, token);
    modalidades(1, 1);
  });

  test.afterAll(() => {
    modalidades(0, 1);
  });

  async function abrirCheckout(page: Page, request: any) {
    await abrirComoCliente(page, request, e);
    await page.goto('/checkout.html');
  }

  test('con dos modalidades, tocar una pasa directo al paso siguiente y el botón «Continuar» no está', async ({ page, request }) => {
    await abrirCheckout(page, request);
    await expect(page.getByTestId('btn-modalidad-retiro')).toBeVisible();
    await expect(page.getByTestId('btn-modalidad-domicilio')).toBeVisible();
    await expect(page.getByTestId('btn-continuar-modalidad')).toBeHidden();

    await page.getByTestId('btn-modalidad-retiro').click();
    await expect(page.getByTestId('btn-confirmar-retiro')).toBeVisible();
    await expect(page.locator('#step-1')).toBeHidden();
    await expect(page.locator('.step-progress__labels span.is-active')).toHaveText('Dirección / Retiro');
  });

  test('tocar «Envío a domicilio» pasa a elegir la dirección', async ({ page, request }) => {
    await abrirCheckout(page, request);
    await page.getByTestId('btn-modalidad-domicilio').click();
    await expect(page.getByTestId('radiogroup-direcciones')).toBeVisible();
    await expect(page.locator('#step-1')).toBeHidden();
  });

  test('al volver al primer paso la elección sigue marcada, aparece «Continuar» y cambiar de modalidad también avanza', async ({ page, request }) => {
    await abrirCheckout(page, request);
    await page.getByTestId('btn-modalidad-retiro').click();
    await expect(page.getByTestId('btn-confirmar-retiro')).toBeVisible();

    await page.getByTestId('btn-volver').click();
    await expect(page.locator('#step-1')).toBeVisible();
    await expect(page.getByTestId('btn-modalidad-retiro')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('btn-modalidad-domicilio')).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByTestId('btn-continuar-modalidad')).toBeVisible();
    await expect(page.getByTestId('btn-continuar-modalidad')).toBeEnabled();

    await page.getByTestId('btn-continuar-modalidad').click();
    await expect(page.getByTestId('btn-confirmar-retiro')).toBeVisible();

    await page.getByTestId('btn-volver').click();
    await page.getByTestId('btn-modalidad-domicilio').click();
    await expect(page.getByTestId('radiogroup-direcciones')).toBeVisible();
  });

  test('desde el resumen, «Editar» la modalidad vuelve al primer paso sin perder la elección', async ({ page, request }) => {
    await abrirCheckout(page, request);
    await page.getByTestId('btn-modalidad-retiro').click();
    await page.getByTestId('btn-confirmar-retiro').click();
    await expect(page.getByTestId('btn-confirmar-pedido')).toBeVisible();
    await page.getByTestId('btn-editar-modalidad').click();
    await expect(page.locator('#step-1')).toBeVisible();
    await expect(page.getByTestId('btn-modalidad-retiro')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('btn-continuar-modalidad')).toBeVisible();
  });

  test('desde el primer paso, «Volver» lleva al carrito', async ({ page, request }) => {
    await abrirCheckout(page, request);
    await expect(page.getByTestId('btn-modalidad-retiro')).toBeVisible();
    await page.getByTestId('btn-volver').click();
    await page.waitForURL('**/carrito.html');
  });

  test('con una sola modalidad se saltea el primer paso', async ({ page, request }) => {
    modalidades(0, 1);
    await abrirCheckout(page, request);
    await expect(page.getByTestId('btn-confirmar-retiro')).toBeVisible();
    await expect(page.locator('#step-1')).toBeHidden();
    await expect(page.getByTestId('btn-continuar-modalidad')).toBeHidden();
    await expect(page.locator('.step-progress__labels span.is-active')).toHaveText('Dirección / Retiro');
  });

  test('con una sola modalidad «Volver» desde el segundo paso lleva al carrito y el resumen no ofrece cambiar la modalidad', async ({ page, request }) => {
    modalidades(0, 1);
    await abrirCheckout(page, request);
    await page.getByTestId('btn-confirmar-retiro').click();
    await expect(page.getByTestId('btn-confirmar-pedido')).toBeVisible();
    await expect(page.getByTestId('btn-editar-modalidad')).toHaveCount(0);
    await page.getByTestId('btn-volver').click();
    await expect(page.getByTestId('btn-confirmar-retiro')).toBeVisible();
    await page.getByTestId('btn-volver').click();
    await page.waitForURL('**/carrito.html');
  });

  test('con solo envío a domicilio también se saltea y muestra las direcciones', async ({ page, request }) => {
    modalidades(1, 0);
    await abrirCheckout(page, request);
    await expect(page.getByTestId('radiogroup-direcciones')).toBeVisible();
    await expect(page.locator('#step-1')).toBeHidden();
  });

  test('en escritorio no hay acción principal en el resumen hasta que se elige y elegir avanza @escritorio', async ({ page, request }) => {
    await abrirCheckout(page, request);
    await expect(page.getByTestId('checkout-resumen')).toBeVisible();
    await expect(page.getByTestId('btn-resumen-accion')).toBeHidden();
    await page.getByTestId('btn-modalidad-retiro').click();
    await expect(page.getByTestId('btn-confirmar-retiro')).toBeAttached();
    await expect(page.getByTestId('btn-resumen-accion')).toBeVisible();
    await page.getByTestId('btn-checkout-volver').click();
    await expect(page.getByTestId('btn-modalidad-retiro')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('btn-resumen-accion')).toBeVisible();
    await expect(page.getByTestId('btn-resumen-accion')).toBeEnabled();
  });
});
