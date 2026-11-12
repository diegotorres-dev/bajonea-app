import path from 'node:path';
import { readFileSync } from 'node:fs';
import { test, expect } from './helpers/prueba';
import type { Page } from '@playwright/test';
import { apiConHeaders, esperarImagenCargadaEnRecorte, invitarEmpleado, login, nombreArchivoFixture, sufijoUnico, clonarComercioTest, aTitleCase } from './helpers/backend';
import { abrirComoDueno, abrirComoEmpleado, prepararEscenarioComercio } from './helpers/escritorio-comercio';
import type { EscenarioComercio } from './helpers/escritorio-comercio';

test.use({ viewport: { width: 1440, height: 900 } });

const FIXTURE = readFileSync(path.resolve(__dirname, '../fixtures/bajonea-e2e-producto.png'));

test.describe('Escritorio E1: recorridos completos del Dueño y del Empleado @escritorio', () => {
  test.describe.configure({ timeout: 300_000 });
  let escenario: EscenarioComercio;

  test.beforeAll(async ({ request }) => {
    escenario = await prepararEscenarioComercio(request);
  });

  async function subirFoto(page: Page) {
    await page.getByTestId('input-foto-producto').setInputFiles({ name: nombreArchivoFixture(), mimeType: 'image/png', buffer: FIXTURE });
    await expect(page.getByTestId('modal-recorte-imagen')).toBeVisible();
    await esperarImagenCargadaEnRecorte(page);
    await page.getByTestId('btn-confirmar-recorte').click();
    await expect(page.getByTestId('modal-recorte-imagen')).toHaveCount(0);
  }

  test('Dueño: del panel al pedido pendiente, aceptarlo, despacharlo y volver al panel con la barra lateral @escritorio', async ({ page, request }) => {
    await abrirComoDueno(page, request, escenario);
    await page.goto('/comercio-dashboard.html');
    await page.getByTestId(`pedido-item-${escenario.pedidos.pendiente2}`).click();
    await page.waitForURL(`**/comercio-pedidos.html?id=${escenario.pedidos.pendiente2}`);
    await expect(page.getByTestId('btn-aceptar-pedido')).toBeVisible();
    await page.getByTestId('btn-aceptar-pedido').click();
    await expect(page.getByTestId('btn-despachar-pedido')).toBeVisible();
    await page.getByTestId('btn-despachar-pedido').click();
    await expect(page.getByTestId('btn-confirmar-retiro')).toBeVisible();
    await page.getByTestId('btn-nav-panel').click();
    await page.waitForURL('**/comercio-dashboard.html');
    await expect(page.getByTestId('btn-nav-panel')).toHaveAttribute('aria-current', 'page');
  });

  test('Dueño: crear un producto con foto real, verlo en la tabla y editarlo @escritorio', async ({ page, request }) => {
    await abrirComoDueno(page, request, escenario);
    await page.goto('/comercio-productos.html');
    await page.getByTestId('btn-nuevo-producto').click();
    await page.waitForURL('**/comercio-producto-form.html');
    const nombre = aTitleCase(`Producto Escritorio ${sufijoUnico()}`);
    await page.getByTestId('input-nombre-producto').fill(nombre);
    await page.getByTestId('input-descripcion-producto').fill('Creado desde el recorrido de escritorio.');
    await page.getByTestId('input-precio-producto').fill('4500');
    await page.getByTestId('select-categoria-producto').selectOption(String(escenario.categoriaId));
    await subirFoto(page);
    const creada = page.waitForResponse((r) => r.url().endsWith('/productos') && r.request().method() === 'POST');
    await page.getByTestId('btn-guardar-producto').click();
    const respuesta = await creada;
    expect(respuesta.status()).toBe(201);
    const id = (await respuesta.json()).data.id as number;
    await page.waitForURL('**/comercio-productos.html*');
    const fila = page.getByTestId(`producto-item-${id}`);
    await expect(fila).toContainText(nombre);
    await expect(fila).toContainText('$4.500');
    await page.getByTestId(`btn-editar-producto-${id}`).click();
    await page.waitForURL(`**/comercio-producto-form.html?id=${id}`);
    await page.getByTestId('input-descripcion-producto').fill('Descripción editada desde escritorio.');
    await page.getByTestId('btn-guardar-producto').click();
    await page.waitForURL('**/comercio-productos.html*');
    await expect(page.getByTestId(`producto-item-${id}`)).toBeVisible();
  });

  test('Dueño: cambiar los datos del comercio por sección y volver a Mi perfil sin recargar @escritorio', async ({ page, request }) => {
    await abrirComoDueno(page, request, escenario);
    await page.goto('/comercio-perfil.html');
    await page.evaluate(() => {
      (window as unknown as { __sinRecarga: boolean }).__sinRecarga = true;
    });
    await page.getByTestId('menu-perfil-datos').click();
    await page.getByTestId('input-descripcion').fill('Datos cambiados en el recorrido');
    await page.getByTestId('btn-guardar-perfil-comercio').click();
    await expect(page.locator('.toast').first()).toBeVisible();
    await page.getByTestId('menu-perfil-horarios').click();
    await expect(page.locator('#view-editar-horarios')).toBeVisible();
    await page.getByTestId('menu-perfil-perfil').click();
    await expect(page.locator('#view-principal')).toBeVisible();
    expect(await page.evaluate(() => (window as unknown as { __sinRecarga?: boolean }).__sinRecarga)).toBe(true);
  });

  test('Dueño: invitar a una persona del equipo desde la sección Equipo del perfil @escritorio', async ({ page, request }) => {
    await abrirComoDueno(page, request, escenario);
    await page.goto('/comercio-perfil.html?seccion=equipo');
    await page.getByTestId('btn-invitar-equipo').click();
    const correo = `invitado.${sufijoUnico()}@bajonea.test`;
    await page.getByTestId('input-email-invitar').fill(correo);
    await page.getByTestId('btn-enviar-invitacion').click();
    await expect(page.locator('.toast').first()).toBeVisible();
    await page.getByTestId('equipo-tabs').getByText('Solicitudes').click();
    await expect(page.getByTestId('equipo-lista')).toContainText(correo);
  });

  test('Dueño: cambiar de comercio desde la barra lateral y volver a cerrar sesión @escritorio', async ({ page, request }) => {
    const otro = `Otro comercio ${sufijoUnico()}`;
    await clonarComercioTest(request, escenario.dueno.comercioId, otro, 'APTO_VENTA');
    await abrirComoDueno(page, request, escenario);
    await page.goto('/comercio-dashboard.html');
    await page.getByTestId('franja-comercio').click();
    await expect(page.getByTestId('lista-comercios')).toBeVisible();
    await page.locator('[data-testid^="fila-comercio-"]', { hasText: otro.slice(0, 12) }).first().click();
    await expect(page.getByTestId('franja-comercio-nombre')).toContainText(otro.slice(0, 12));
    await page.getByTestId('btn-lateral-cerrar-sesion').click();
    await page.getByTestId('btn-confirmar-logout').click();
    await page.waitForURL('**/login.html');
  });

  test('Empleado: ver el panel, abrir un pedido de la lista, resolverlo y editar datos operativos @escritorio', async ({ page, request }) => {
    await abrirComoEmpleado(page, request, escenario);
    await page.goto('/comercio-dashboard.html');
    await expect(page.getByTestId('persona-lateral-rol')).toHaveText('Empleado');
    await page.getByTestId('btn-nav-pedidos').click();
    await page.waitForURL('**/comercio-pedidos.html');
    await page.getByTestId(`pedido-item-${escenario.pedidos.pendiente}`).click();
    await expect(page.getByTestId('btn-aceptar-pedido')).toBeVisible();
    await page.getByTestId('btn-aceptar-pedido').click();
    await expect(page.getByTestId('btn-despachar-pedido')).toBeVisible();
    await page.getByTestId('btn-nav-perfil').click();
    await page.getByTestId('menu-perfil-operativos').click();
    await expect(page.locator('#view-editar-datos-comercio')).toBeVisible();
    await page.getByTestId('btn-nav-productos').click();
    await expect(page.getByTestId('btn-nuevo-producto')).toBeVisible();
  });

  test('Dueño: una invitación pendiente aparece en la pestaña Solicitudes del equipo @escritorio', async ({ page, request }) => {
    const sesion = await login(request, escenario.dueno.nombreUsuario, escenario.dueno.password);
    const correo = `cancelar.${sufijoUnico()}@bajonea.test`;
    const invitacion = await invitarEmpleado(request, sesion.token, escenario.dueno.comercioId, correo);
    expect(invitacion.status).toBe(201);
    const verificacion = await apiConHeaders(request, 'GET', '/comercios/equipo', sesion.token, { 'X-Comercio-Id': String(escenario.dueno.comercioId) });
    expect(verificacion.status).toBe(200);
    await abrirComoDueno(page, request, escenario);
    await page.goto('/comercio-perfil.html?seccion=equipo');
    await page.getByTestId('equipo-tabs').getByText('Solicitudes').click();
    await expect(page.getByTestId('equipo-lista')).toContainText(correo);
  });
});
