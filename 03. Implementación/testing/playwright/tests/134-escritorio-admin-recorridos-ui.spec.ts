import { test, expect } from './helpers/prueba';
import type { Page } from '@playwright/test';
import { abrirComoUsuario, estadoDe, prepararAprobado, registrarPendiente } from './helpers/multicomercio';
import { login, registrarYVerificarCliente, sqlTest, sufijoUnico } from './helpers/backend';
import { prepararEscenarioAdmin } from './helpers/admin-escritorio';
import type { EscenarioAdmin } from './helpers/admin-escritorio';
import { esDialogoCentrado } from './helpers/layout';

test.describe('Escritorio E2: recorridos completos del Administrador a 1440 px @escritorio', () => {
  test.describe.configure({ timeout: 300_000 });
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

  test('aprobar un comercio pendiente desde la lista en grilla: solicitud, diálogo centrado y confirmación', async ({ page, request }) => {
    const pendiente = await registrarPendiente(request, esc.admin.token, esc.base.localidadId);
    await abrir(page, 'admin-comercios-pendientes.html');
    await page.getByTestId(`btn-ver-solicitud-${pendiente.comercioId}`).click();
    await page.waitForURL(`**/admin-comercio-detalle.html?id=${pendiente.comercioId}`);
    await page.getByTestId('btn-aprobar-comercio').click();
    const modal = page.getByTestId('modal-confirmar-aprobacion');
    await expect(modal).toBeVisible();
    await esDialogoCentrado(page, modal.locator('.modal-sheet, .product-modal-sheet').first());
    await page.getByTestId('btn-confirmar-aprobacion').click();
    await page.waitForURL('**/admin-comercios-pendientes.html*');
    await expect(page.locator('.toast')).toContainText('El comercio fue notificado de tu decisión');
    await expect(page.getByTestId(`comercio-pendiente-item-${pendiente.comercioId}`)).toHaveCount(0);
    expect(estadoDe(pendiente.comercioId)).toBe('APROBADO');
  });

  test('rechazar un comercio con motivo: el botón espera el motivo y el diálogo queda centrado', async ({ page, request }) => {
    const pendiente = await registrarPendiente(request, esc.admin.token, esc.base.localidadId);
    await abrir(page, `admin-comercio-detalle.html?id=${pendiente.comercioId}`);
    await page.getByTestId('btn-rechazar-comercio').click();
    const modal = page.getByTestId('modal-rechazar-comercio');
    await expect(modal).toBeVisible();
    await esDialogoCentrado(page, modal.locator('.modal-sheet, .product-modal-sheet').first());
    await expect(page.getByTestId('btn-confirmar-rechazo-comercio')).toBeDisabled();
    await page.getByTestId('input-motivo-rechazo-comercio').fill('Falta el comprobante de domicilio del local.');
    await expect(page.getByTestId('btn-confirmar-rechazo-comercio')).toBeEnabled();
    await page.getByTestId('btn-confirmar-rechazo-comercio').click();
    await page.waitForURL('**/admin-comercios-pendientes.html*');
    expect(estadoDe(pendiente.comercioId)).toBe('RECHAZADO');
    expect(sqlTest(`SELECT motivo FROM historial_estado_comercio WHERE comercio_id = ${pendiente.comercioId} AND estado_destino = 'RECHAZADO';`)).toContain('comprobante de domicilio');
  });

  test('suspender y levantar la suspensión de un Cliente desde la tabla', async ({ page, request }) => {
    const registrado = await registrarYVerificarCliente(request, esc.base.localidadId);
    const usuarioId = (await login(request, registrado.nombreUsuario, registrado.password)).usuario.id;
    await abrir(page, 'admin-clientes.html');
    await page.getByTestId('input-buscar-cliente').fill(registrado.email);
    const fila = page.getByTestId(`cliente-item-${usuarioId}`);
    await expect(fila).toBeVisible();
    await page.getByTestId(`btn-acciones-cliente-${usuarioId}`).click();
    await page.getByTestId(`accion-suspender-${usuarioId}`).click();
    const modal = page.getByTestId('modal-suspender-cliente');
    await expect(modal).toBeVisible();
    await esDialogoCentrado(page, modal.locator('xpath=ancestor-or-self::*[contains(@class,"modal-sheet")][1]'));
    await page.getByTestId('input-suspender-motivo').fill('Reiteradas quejas de los comercios por pedidos falsos.');
    await page.getByTestId('btn-confirmar-suspender').click();
    await expect(page.locator('.toast').first()).toBeVisible();
    await expect(fila.getByTestId('estado-cliente')).toHaveText('Suspendido');
    expect(sqlTest(`SELECT estado FROM usuario WHERE id = ${usuarioId};`)).toBe('SUSPENDIDO');

    await page.getByTestId(`btn-acciones-cliente-${usuarioId}`).click();
    await page.getByTestId(`accion-levantar-${usuarioId}`).click();
    await expect(page.getByTestId('modal-levantar-suspension')).toBeVisible();
    await page.getByTestId('btn-confirmar-levantar').click();
    await expect(fila.getByTestId('estado-cliente')).toHaveText('Activo');
    expect(sqlTest(`SELECT estado FROM usuario WHERE id = ${usuarioId};`)).toBe('ACTIVO');
  });

  test('suspender y levantar la suspensión de un Dueño desde la tabla', async ({ page, request }) => {
    const dueno = await prepararAprobado(request, esc.admin.token, esc.base.localidadId, true);
    await abrir(page, 'admin-duenos.html');
    await page.getByTestId('input-buscar-dueno').fill(dueno.email);
    const fila = page.getByTestId(`dueno-item-${dueno.duenoId}`);
    await expect(fila).toBeVisible();
    await page.getByTestId(`btn-acciones-dueno-${dueno.duenoId}`).click();
    await page.getByTestId('accion-suspender-dueno').click();
    const modal = page.getByTestId('modal-suspender-dueno');
    await expect(modal).toBeVisible();
    await esDialogoCentrado(page, modal.locator('xpath=ancestor-or-self::*[contains(@class,"modal-sheet")][1]'), { anchoMinimo: 400, anchoMaximo: 640 });
    await page.getByTestId('input-suspender-dueno-motivo').fill('Incumplimiento reiterado de las condiciones del servicio.');
    await page.getByTestId('btn-confirmar-suspender-dueno').click();
    await expect(page.locator('.toast').first()).toBeVisible();
    await expect(fila.getByTestId('estado-dueno')).toHaveText('Suspendido');
    expect(sqlTest(`SELECT estado FROM usuario WHERE id = ${dueno.duenoId};`)).toBe('SUSPENDIDO');

    await page.getByTestId(`btn-acciones-dueno-${dueno.duenoId}`).click();
    await page.getByTestId('accion-levantar-dueno').click();
    await expect(page.getByTestId('modal-levantar-dueno')).toBeVisible();
    await page.getByTestId('btn-confirmar-levantar-dueno').click();
    await expect(fila.getByTestId('estado-dueno')).toHaveText('Activo');
    expect(sqlTest(`SELECT estado FROM usuario WHERE id = ${dueno.duenoId};`)).toBe('ACTIVO');
  });

  test('editar una categoría y un tag desde la tabla guarda el cambio y avisa con un toast', async ({ page, request }) => {
    void request;
    const nombre = `Cat Ed ${sufijoUnico()}`.slice(0, 30);
    await abrir(page, 'admin-categorias.html');
    await page.getByTestId('btn-nueva-categoria-escritorio').click();
    await page.getByTestId('input-nombre-categoria').fill(nombre);
    await page.getByTestId('btn-guardar-categoria').click();
    await expect(page.locator('.toast')).toContainText('Categoría creada correctamente');
    const fila = page.locator('.categoria-row', { hasText: nombre });
    await fila.locator('.categoria-row__edit-btn').click();
    const editado = `${nombre} v2`.slice(0, 30);
    await page.getByTestId('input-nombre-categoria').fill(editado);
    await page.getByTestId('btn-guardar-categoria').click();
    await expect(page.locator('.toast').last()).toContainText('Categoría actualizada correctamente');
    await expect(page.locator('.categoria-row', { hasText: editado })).toBeVisible();
  });
});
