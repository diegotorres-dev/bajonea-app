import { test, expect } from './helpers/prueba';
import type { APIRequestContext, Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import {
  aTitleCase,
  apiPost,
  apiPut,
  clonarComercioTest,
  fijarPasswordAdminYLoguear,
  login,
  obtenerLocalidadRioGrande,
  registrarYVerificarCliente,
  sqlTest as sql,
  sufijoUnico,
} from './helpers/backend';
import type { ClienteRegistrado, SesionApi } from './helpers/backend';
import { abrirComoUsuario, prepararAprobado } from './helpers/multicomercio';
import type { Dueno } from './helpers/multicomercio';
import { sinScrollHorizontal } from './helpers/layout';

test.use({ viewport: { width: 375, height: 812 } });

const CARPETA_CAPTURAS = path.resolve(__dirname, '../../../docs/capturas-inactividad');

async function captura(page: Page, nombre: string) {
  fs.mkdirSync(CARPETA_CAPTURAS, { recursive: true });
  await page.screenshot({ path: path.join(CARPETA_CAPTURAS, `${nombre}.png`) });
}

async function inactivar(request: APIRequestContext, ...usuarioIds: number[]) {
  for (const id of usuarioIds) {
    const { status } = await apiPut(request, `/test/usuarios/${id}/ultimo-acceso?meses=4`, {});
    expect(status).toBe(200);
  }
  const corrida = await apiPost(request, '/test/jobs/inactivacion-cuentas', {});
  expect(corrida.status, JSON.stringify(corrida.body)).toBe(200);
  for (const id of usuarioIds) {
    expect(estadoUsuario(id)).toBe('INACTIVO');
  }
}

const estadoUsuario = (id: number): string => sql(`SELECT estado FROM usuario WHERE id = ${id};`);
const estadoComercio = (id: number): string => sql(`SELECT estado FROM comercio WHERE id = ${id};`);
const nombreDe = (id: number): string => sql(`SELECT CONCAT(nombre, ' ', apellido) FROM persona_fisica WHERE id = ${id};`);

test.describe('Fase 5, S6 (UI B): el Administrador reactiva cuentas inactivas', () => {
  test.describe.configure({ mode: 'serial', timeout: 240_000 });

  let adminSesion: SesionApi;
  let localidadId: string;

  async function clienteInactivo(request: APIRequestContext): Promise<ClienteRegistrado & { id: number }> {
    const cuenta = await registrarYVerificarCliente(request, localidadId);
    const sesion = await login(request, cuenta.nombreUsuario, cuenta.password);
    await inactivar(request, sesion.usuario.id);
    return { ...cuenta, id: sesion.usuario.id };
  }

  async function duenoInactivo(request: APIRequestContext, conSuspendido: boolean): Promise<{ dueno: Dueno; suspendidoId: number | null }> {
    const dueno = await prepararAprobado(request, adminSesion.token, localidadId, true);
    let suspendidoId: number | null = null;
    if (conSuspendido) {
      const nombre = `Anexo ${sufijoUnico().replace(/[0-9]/g, (digito) => 'abcdefghij'[Number(digito)])} Sur`;
      suspendidoId = await clonarComercioTest(request, dueno.comercioId, nombre, 'SUSPENDIDO');
    }
    await inactivar(request, dueno.duenoId);
    return { dueno, suspendidoId };
  }

  async function abrirClientes(page: Page) {
    await abrirComoUsuario(page, adminSesion);
    await page.goto('/admin-clientes.html');
    await expect(page.getByTestId('clientes-lista')).toBeVisible();
    await expect(page.getByTestId('contador-clientes')).toContainText('Mostrando');
  }

  async function abrirDuenos(page: Page) {
    await abrirComoUsuario(page, adminSesion);
    await page.goto('/admin-duenos.html');
    await expect(page.getByTestId('duenos-lista')).toBeVisible();
    await expect(page.getByTestId('contador-duenos')).toContainText('Mostrando');
  }

  async function menuDelCliente(page: Page, cliente: { email: string; id: number }) {
    await page.getByTestId('input-buscar-cliente').fill(cliente.email);
    await page.getByTestId(`btn-acciones-cliente-${cliente.id}`).click();
    await expect(page.getByTestId(`menu-acciones-cliente-${cliente.id}`)).toBeVisible();
  }

  async function hojaDelDueno(page: Page, dueno: Dueno) {
    await page.getByTestId('input-buscar-dueno').fill(dueno.email);
    await page.getByTestId(`btn-acciones-dueno-${dueno.duenoId}`).click();
    await expect(page.getByTestId('hoja-acciones-dueno')).toBeVisible();
  }

  test.beforeAll(async ({ request }) => {
    adminSesion = await fijarPasswordAdminYLoguear(request);
    localidadId = await obtenerLocalidadRioGrande(request);
  });

  test('en Clientes, una cuenta inactiva ofrece "Reactivar cuenta" junto a "Suspender cuenta" y el filtro "Inactivos" la muestra', async ({ page, request }) => {
    const inactivo = await clienteInactivo(request);
    const activo = await registrarYVerificarCliente(request, localidadId);
    const sesionActivo = await login(request, activo.nombreUsuario, activo.password);
    await abrirClientes(page);

    await page.getByTestId('filtro-clientes-inactivos').click();
    await page.getByTestId('input-buscar-cliente').fill(inactivo.email);
    await expect(page.getByTestId(`cliente-item-${inactivo.id}`)).toBeVisible();
    await expect(page.getByTestId(`cliente-item-${inactivo.id}`).getByTestId('estado-cliente')).toHaveText('Inactivo');
    await page.getByTestId(`btn-acciones-cliente-${inactivo.id}`).click();
    const menu = page.getByTestId(`menu-acciones-cliente-${inactivo.id}`);
    await expect(menu.getByRole('menuitem')).toHaveText(['Reactivar cuenta', 'Suspender cuenta']);
    await sinScrollHorizontal(page);
    await captura(page, '06-clientes-menu-con-reactivar-cuenta');

    await page.keyboard.press('Escape');
    await page.getByTestId('filtro-clientes-todos').click();
    await menuDelCliente(page, { email: activo.email, id: sesionActivo.usuario.id });
    await expect(page.getByTestId(`accion-reactivar-${sesionActivo.usuario.id}`)).toHaveCount(0);
    await expect(page.getByTestId(`menu-acciones-cliente-${sesionActivo.usuario.id}`).getByRole('menuitem')).toHaveText(['Suspender cuenta']);
  });

  test('reactivar a un Cliente: hoja con "Qué va a pasar", sin comercios; Cancelar no cambia nada; confirmar reactiva con toast', async ({ page, request }) => {
    const cliente = await clienteInactivo(request);
    await abrirClientes(page);
    await menuDelCliente(page, cliente);

    await page.getByTestId(`accion-reactivar-${cliente.id}`).click();

    const hoja = page.getByTestId('modal-reactivar-cuenta');
    await expect(hoja).toBeVisible();
    await expect(page.getByTestId('modal-reactivar-cuenta-titulo')).toHaveText(`Reactivar a ${aTitleCase(nombreDe(cliente.id))}`);
    const queVaAPasar = page.getByTestId('reactivar-que-va-a-pasar');
    await expect(queVaAPasar).toContainText('Qué va a pasar');
    await expect(queVaAPasar.getByRole('listitem')).toHaveText([
      'Podrá ingresar y comprar de nuevo.',
      'Se anota en su historial que la reactivaste vos.',
    ]);
    await expect(page.getByTestId('reactivar-previa-cargando')).toHaveCount(0);
    await expect(page.getByTestId('reactivar-comercios').locator('> *')).toHaveCount(0);
    await expect(page.getByTestId('btn-confirmar-reactivar')).toBeFocused();
    await sinScrollHorizontal(page);
    await captura(page, '07-hoja-reactivar-cliente');

    await page.getByTestId('btn-cancelar-reactivar').click();
    await expect(hoja).toHaveCount(0);
    expect(estadoUsuario(cliente.id)).toBe('INACTIVO');

    await menuDelCliente(page, cliente);
    await page.getByTestId(`accion-reactivar-${cliente.id}`).click();
    await page.getByTestId('btn-confirmar-reactivar').click();
    await expect(hoja).toHaveCount(0);
    await expect(page.locator('.toast')).toContainText('Cuenta reactivada');
    await captura(page, '08-toast-cuenta-reactivada-administrador');
    await expect(page.getByTestId(`cliente-item-${cliente.id}`).getByTestId('estado-cliente')).toHaveText('Activo');
    expect(estadoUsuario(cliente.id)).toBe('ACTIVO');
    const fila = sql(`SELECT estado_destino, administrador_id FROM historial_estado_usuario WHERE usuario_id = ${cliente.id} ORDER BY id DESC LIMIT 1;`);
    expect(fila).toContain('ACTIVO');
  });

  test('en Dueños hay filtro "Inactivos" y la hoja de acciones ofrece "Reactivar cuenta" solo a las inactivas', async ({ page, request }) => {
    const { dueno } = await duenoInactivo(request, false);
    const activo = await prepararAprobado(request, adminSesion.token, localidadId, true);
    await abrirDuenos(page);

    await page.getByTestId('filtro-duenos-inactivos').click();
    await expect(page.getByTestId('filtros-duenos').getByRole('button')).toHaveText(['Todos', 'Suspendidos', 'Bloqueados', 'Inactivos']);
    await hojaDelDueno(page, dueno);
    await expect(page.getByTestId('accion-reactivar-dueno')).toBeVisible();
    await expect(page.getByTestId('accion-suspender-dueno')).toBeVisible();
    await page.getByTestId('btn-cancelar-acciones-dueno').click();

    await page.getByTestId('filtro-duenos-todos').click();
    await hojaDelDueno(page, activo);
    await expect(page.getByTestId('accion-reactivar-dueno')).toHaveCount(0);
    await expect(page.getByTestId('accion-suspender-dueno')).toBeVisible();
  });

  test('reactivar a un Dueño con un comercio suspendido aparte: "Se restablecen 1 de 2", "Vuelve", "Sigue suspendido" y confirmar los devuelve', async ({ page, request }) => {
    const { dueno, suspendidoId } = await duenoInactivo(request, true);
    expect(estadoComercio(dueno.comercioId)).toBe('INACTIVO');
    await abrirDuenos(page);
    await hojaDelDueno(page, dueno);
    await page.getByTestId('accion-reactivar-dueno').click();

    await expect(page.getByTestId('modal-reactivar-cuenta-titulo')).toHaveText(`Reactivar a ${aTitleCase(nombreDe(dueno.duenoId))}`);
    await expect(page.getByTestId('reactivar-vuelven')).toContainText('Se restablecen 1 de 2 comercios');
    await expect(page.getByTestId(`reactivar-vuelve-${dueno.comercioId}`)).toContainText('Vuelve');
    await expect(page.getByTestId(`reactivar-vuelve-${dueno.comercioId}`)).toContainText(aTitleCase(dueno.nombre));
    const sigue = page.getByTestId(`reactivar-sigue-${suspendidoId}`);
    await expect(sigue).toContainText('Sigue suspendido');
    await expect(sigue).toContainText('Se suspendió aparte. Hay que levantarlo desde su ficha.');
    await expect(page.getByTestId('btn-confirmar-reactivar')).toBeEnabled();
    await sinScrollHorizontal(page);
    await captura(page, '09-hoja-reactivar-dueno-con-comercios');

    await page.getByTestId('btn-confirmar-reactivar').click();
    await expect(page.getByTestId('modal-reactivar-cuenta')).toHaveCount(0);
    await expect(page.locator('.toast')).toContainText('Cuenta reactivada');
    await expect(page.getByTestId(`dueno-item-${dueno.duenoId}`).getByTestId('estado-dueno')).toHaveText('Activo');
    expect(estadoUsuario(dueno.duenoId)).toBe('ACTIVO');
    expect(estadoComercio(dueno.comercioId)).toBe('APTO_VENTA');
    expect(estadoComercio(suspendidoId as number)).toBe('SUSPENDIDO');
  });

  test('si todos los comercios del Dueño vuelven, el título lo dice sin "de"', async ({ page, request }) => {
    const { dueno } = await duenoInactivo(request, false);
    await abrirDuenos(page);
    await hojaDelDueno(page, dueno);
    await page.getByTestId('accion-reactivar-dueno').click();

    await expect(page.getByTestId('reactivar-vuelven')).toContainText('Se restablece 1 comercio');
    await expect(page.getByTestId('reactivar-vuelven')).not.toContainText(' de ');
    await expect(page.locator('[data-testid^="reactivar-sigue-"]')).toHaveCount(0);
    await page.getByTestId('btn-cancelar-reactivar').click();
    expect(estadoUsuario(dueno.duenoId)).toBe('INACTIVO');
  });

  test('el error de la API se muestra en la hoja con su mensaje exacto y con foco, y la lista se actualiza', async ({ page, request }) => {
    const cliente = await clienteInactivo(request);
    await abrirClientes(page);
    await menuDelCliente(page, cliente);
    await page.getByTestId(`accion-reactivar-${cliente.id}`).click();
    await expect(page.getByTestId('modal-reactivar-cuenta')).toBeVisible();
    const otraPestana = await apiPut(request, `/administrador/cuentas/${cliente.id}/reactivar`, {}, adminSesion.token);
    expect(otraPestana.status).toBe(200);

    await page.getByTestId('btn-confirmar-reactivar').click();

    const aviso = page.getByTestId('aviso-reactivar-cuenta').getByTestId('aviso-fijo');
    await expect(aviso).toBeVisible();
    await expect(page.getByTestId('aviso-reactivar-cuenta').getByTestId('aviso-fijo-texto')).toHaveText('La cuenta no está inactiva');
    await expect(aviso).toBeFocused();
    await expect(page.getByTestId('btn-confirmar-reactivar')).toBeEnabled();
    await expect(page.getByTestId('btn-confirmar-reactivar')).toHaveText('Reactivar cuenta');
    await expect(page.locator('.toast')).toHaveCount(0);
    await sinScrollHorizontal(page);
    await captura(page, '10-hoja-reactivar-error');

    await page.getByTestId('btn-cancelar-reactivar').click();
    await expect(page.getByTestId(`cliente-item-${cliente.id}`).getByTestId('estado-cliente')).toHaveText('Activo');
  });

  test('si no se puede calcular el detalle, la hoja avisa y deja reactivar igual', async ({ page, request }) => {
    const { dueno } = await duenoInactivo(request, false);
    await page.route('**/administrador/cuentas/*/reactivar/previa', (ruta) => ruta.fulfill({
      status: 400,
      contentType: 'application/json',
      body: JSON.stringify({ mensaje: 'No pudimos calcular el detalle.', data: null }),
    }));
    await abrirDuenos(page);
    await hojaDelDueno(page, dueno);
    await page.getByTestId('accion-reactivar-dueno').click();

    await expect(page.getByTestId('aviso-reactivar-cuenta').getByTestId('aviso-fijo-texto')).toHaveText('No pudimos calcular el detalle. Igual podés reactivar la cuenta.');
    await expect(page.getByTestId('btn-confirmar-reactivar')).toBeEnabled();
    await page.getByTestId('btn-confirmar-reactivar').click();
    await expect(page.locator('.toast')).toContainText('Cuenta reactivada');
    expect(estadoUsuario(dueno.duenoId)).toBe('ACTIVO');
  });

  test('el botón de confirmar muestra "Reactivando…" y no admite un segundo envío mientras la petición está en curso', async ({ page, request }) => {
    const cliente = await clienteInactivo(request);
    await abrirClientes(page);
    await menuDelCliente(page, cliente);
    await page.getByTestId(`accion-reactivar-${cliente.id}`).click();
    let envios = 0;
    let liberar: () => void = () => {};
    const retenida = new Promise<void>((resolver) => {
      liberar = resolver;
    });
    await page.route(`**/administrador/cuentas/${cliente.id}/reactivar`, async (ruta) => {
      if (ruta.request().method() === 'PUT') {
        envios += 1;
        await retenida;
      }
      await ruta.continue();
    });

    await page.getByTestId('btn-confirmar-reactivar').click();
    await expect(page.getByTestId('btn-confirmar-reactivar')).toHaveText('Reactivando…');
    await expect(page.getByTestId('btn-confirmar-reactivar')).toBeDisabled();
    await expect(page.getByTestId('btn-cancelar-reactivar')).toBeDisabled();
    liberar();

    await expect(page.getByTestId('modal-reactivar-cuenta')).toHaveCount(0);
    expect(envios).toBe(1);
    expect(estadoUsuario(cliente.id)).toBe('ACTIVO');
  });
});
