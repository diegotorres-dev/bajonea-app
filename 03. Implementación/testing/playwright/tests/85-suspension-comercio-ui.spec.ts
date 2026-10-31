import { test, expect } from './helpers/prueba';
import type { APIRequestContext, Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import {
  agregarItemCarrito,
  apiConHeaders,
  apiPut,
  clonarComercioTest,
  confirmarPagoTest,
  crearCategoria,
  crearPedido,
  crearProducto,
  diaDeHoy,
  fijarPasswordAdminYLoguear,
  login,
  obtenerLocalidadRioGrande,
  registrarYVerificarCliente,
  sqlTest as sql,
  sufijoUnico,
  suspenderComercio,
} from './helpers/backend';
import type { SesionApi } from './helpers/backend';
import { abrirComoUsuario, prepararAprobado } from './helpers/multicomercio';
import type { Dueno } from './helpers/multicomercio';
import { sinScrollHorizontal } from './helpers/layout';

test.use({ viewport: { width: 375, height: 812 } });

const CARPETA_CAPTURAS = path.resolve(__dirname, '../../../docs/capturas-suspension-comercio');
const MOTIVO = 'Reiteradas quejas de clientes por demoras y pedidos incompletos';
const todoElDia = () => [{ diaSemana: diaDeHoy(), horaApertura: '00:00', horaCierre: '23:59' }];

async function captura(page: Page, nombre: string) {
  fs.mkdirSync(CARPETA_CAPTURAS, { recursive: true });
  await page.screenshot({ path: path.join(CARPETA_CAPTURAS, `${nombre}.png`) });
}

test.describe('Fase 5, S2 (UI): suspensión individual de un comercio', () => {
  test.describe.configure({ mode: 'serial', timeout: 240_000 });

  let adminSesion: SesionApi;
  let localidadId: string;
  let categoriaId: number;
  let conPedidos: Dueno;
  let productoId: number;
  let compradorToken: string;
  const notasSinteticas: number[] = [];

  const estadoDe = (comercioId: number): string => sql(`SELECT estado FROM comercio WHERE id = ${comercioId};`);
  const historialSuspendido = (comercioId: number): number =>
    Number(sql(`SELECT COUNT(*) FROM historial_estado_comercio WHERE comercio_id = ${comercioId} AND estado_destino = 'SUSPENDIDO';`));

  const nuevoComercio = (request: APIRequestContext, conCuentaDeCobro: boolean): Promise<Dueno> =>
    prepararAprobado(request, adminSesion.token, localidadId, conCuentaDeCobro, todoElDia());

  const operar = (request: APIRequestContext, dueno: Dueno, pedidoId: number, accion: string) =>
    apiConHeaders(request, 'PUT', `/pedidos/comercio/${pedidoId}/${accion}`, dueno.token, { 'X-Comercio-Id': String(dueno.comercioId) }, {});

  async function pedidoPagado(request: APIRequestContext, pagar = true): Promise<number> {
    await apiConHeaders(request, 'DELETE', '/carrito', compradorToken);
    await agregarItemCarrito(request, compradorToken, productoId, 1);
    const pedidoId = await crearPedido(request, compradorToken, 'RETIRO');
    if (pagar) {
      await confirmarPagoTest(request, pedidoId, true);
    }
    return pedidoId;
  }

  async function abrirDetalle(page: Page, comercioId: number) {
    await abrirComoUsuario(page, adminSesion);
    await page.goto('/admin-comercios.html');
    const verDetalle = page.getByTestId(`btn-ver-detalle-comercio-${comercioId}`);
    await expect(verDetalle).toBeVisible();
    await verDetalle.click();
    await expect(page.getByTestId('modal-detalle-comercio')).toBeVisible();
  }

  async function reabrirDetalle(page: Page, comercioId: number) {
    await page.getByTestId(`btn-ver-detalle-comercio-${comercioId}`).click();
    await expect(page.getByTestId('modal-detalle-comercio')).toBeVisible();
  }

  test.beforeAll(async ({ request }) => {
    adminSesion = await fijarPasswordAdminYLoguear(request);
    localidadId = await obtenerLocalidadRioGrande(request);
    categoriaId = await crearCategoria(request, adminSesion.token, `Cat Suspension Comercio ${sufijoUnico()}`);
    conPedidos = await nuevoComercio(request, true);
    productoId = await crearProducto(request, conPedidos.token, { nombre: `Producto susp ${sufijoUnico()}`, precio: 10000, categoriaId });
    const comprador = await registrarYVerificarCliente(request, localidadId);
    compradorToken = (await login(request, comprador.nombreUsuario, comprador.password)).token;
  });

  test.afterAll(() => {
    if (notasSinteticas.length > 0) {
      sql(`DELETE FROM nota_credito WHERE id IN (${notasSinteticas.join(',')});`);
    }
  });

  test('suspender sin pedidos: la hoja explica el efecto, valida el motivo, no duplica con doble clic y el detalle queda suspendido', async ({ page, request }) => {
    const dueno = await nuevoComercio(request, true);
    await abrirDetalle(page, dueno.comercioId);
    await expect(page.getByTestId('suspension-comercio')).toHaveCount(0);

    const suspender = page.getByTestId('btn-suspender-comercio');
    await suspender.click();
    const hoja = page.getByTestId('modal-suspender-comercio');
    await expect(hoja).toBeVisible();
    await expect(hoja).toHaveAttribute('role', 'alertdialog');
    await expect(page.getByTestId('modal-suspender-comercio-titulo')).toContainText('Suspender ');
    await expect(page.getByTestId('suspender-comercio-que-va-a-pasar').locator('li')).toHaveText([
      'Deja de aparecer en el catálogo.',
      'No tiene pedidos en curso.',
    ]);
    await expect(page.getByTestId('input-suspender-comercio-motivo')).toBeFocused();
    await expect(page.getByTestId('contador-suspender-comercio-motivo')).toHaveText('0 / 500 · mínimo 10');
    const confirmar = page.getByTestId('btn-confirmar-suspender-comercio');
    await expect(confirmar).toBeDisabled();

    await page.getByTestId('input-suspender-comercio-motivo').fill('123456789');
    await expect(page.getByTestId('contador-suspender-comercio-motivo')).toHaveText('9 / 500 · mínimo 10');
    await expect(confirmar).toBeDisabled();
    await page.getByTestId('input-suspender-comercio-motivo').fill('          corto ');
    await expect(confirmar).toBeDisabled();
    await page.getByTestId('input-suspender-comercio-motivo').fill(MOTIVO);
    await expect(confirmar).toBeEnabled();
    await captura(page, '01-hoja-suspender-sin-pedidos');
    await sinScrollHorizontal(page);

    await confirmar.dblclick();
    await expect(page.locator('.toast')).toContainText('Comercio suspendido');
    await expect(page.getByTestId('modal-detalle-comercio')).toHaveCount(0);
    await expect(hoja).toHaveCount(0);
    await expect(page.getByTestId(`estado-comercio-${dueno.comercioId}`)).toHaveText('Suspendido');
    await expect(page.getByTestId(`btn-ver-detalle-comercio-${dueno.comercioId}`)).toBeFocused();
    expect(estadoDe(dueno.comercioId)).toBe('SUSPENDIDO');
    expect(historialSuspendido(dueno.comercioId)).toBe(1);
    expect(sql(`SELECT CONCAT(suspension_origen, ':', motivo_suspension) FROM comercio WHERE id = ${dueno.comercioId};`)).toBe(`INDIVIDUAL:${MOTIVO}`);

    await reabrirDetalle(page, dueno.comercioId);
    await expect(page.getByTestId('suspension-comercio-estado')).toHaveText('Suspendido');
    await expect(page.getByTestId('suspension-comercio-desde')).toContainText('desde ');
    await expect(page.getByTestId('suspension-comercio-motivo')).toHaveText(MOTIVO);
    await expect(page.getByTestId('btn-levantar-suspension-comercio')).toBeEnabled();
    await expect(page.getByTestId('btn-suspender-comercio')).toHaveCount(0);
    await expect(page.getByTestId('suspension-comercio-explicacion')).toHaveCount(0);
    await captura(page, '03-detalle-suspendido');
    await sinScrollHorizontal(page);
  });

  test('suspender con pedidos de cada estado: la vista previa cuenta solo lo que hay y Cancelar no suspende', async ({ page, request }) => {
    const pendiente1 = await pedidoPagado(request);
    const pendiente2 = await pedidoPagado(request);
    expect([pendiente1, pendiente2].length).toBe(2);
    const enPreparacion = await pedidoPagado(request);
    expect((await operar(request, conPedidos, enPreparacion, 'aceptar')).status).toBe(200);
    const listo = await pedidoPagado(request);
    expect((await operar(request, conPedidos, listo, 'aceptar')).status).toBe(200);
    expect((await operar(request, conPedidos, listo, 'despachar')).status).toBe(200);
    const enCamino = await pedidoPagado(request);
    expect((await operar(request, conPedidos, enCamino, 'aceptar')).status).toBe(200);
    sql(`UPDATE pedido SET estado = 'EN_CAMINO' WHERE id = ${enCamino};`);
    await pedidoPagado(request, false);

    await abrirDetalle(page, conPedidos.comercioId);
    await page.getByTestId('btn-suspender-comercio').click();
    await expect(page.getByTestId('suspender-comercio-que-va-a-pasar').locator('li')).toHaveText([
      'Deja de aparecer en el catálogo.',
      '2 pedidos pendientes: se rechazan ahora y se reembolsan. No se puede deshacer.',
      '1 pedido en preparación: tiene 90 minutos para despacharlo o se cancela con reembolso.',
      '1 pedido listo para retirar: tiene 90 minutos para entregarlo o se cierra como no retirado.',
      '1 pedido en camino sigue igual.',
      '1 pedido sin pagar no se puede pagar.',
    ]);
    await captura(page, '02-hoja-suspender-con-pedidos');
    await sinScrollHorizontal(page);

    await page.getByTestId('btn-cancelar-suspender-comercio').click();
    await expect(page.getByTestId('modal-suspender-comercio')).toHaveCount(0);
    await expect(page.getByTestId('btn-suspender-comercio')).toBeFocused();
    expect(estadoDe(conPedidos.comercioId)).toBe('APTO_VENTA');
    expect(historialSuspendido(conPedidos.comercioId)).toBe(0);
  });

  test('Escape cierra la hoja, el foco vuelve a Suspender y no se suspende nada', async ({ page, request }) => {
    const dueno = await nuevoComercio(request, false);
    await abrirDetalle(page, dueno.comercioId);
    await page.getByTestId('btn-suspender-comercio').click();
    await expect(page.getByTestId('modal-suspender-comercio')).toBeVisible();
    await page.getByTestId('input-suspender-comercio-motivo').fill(MOTIVO);
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('modal-suspender-comercio')).toHaveCount(0);
    await expect(page.getByTestId('btn-suspender-comercio')).toBeFocused();
    await expect(page.getByTestId('modal-detalle-comercio')).toBeVisible();
    expect(estadoDe(dueno.comercioId)).toBe('APROBADO');
  });

  test('si otro Administrador ya lo suspendió, la hoja muestra el error con salida y no queda colgada', async ({ page, request }) => {
    const dueno = await nuevoComercio(request, true);
    await abrirDetalle(page, dueno.comercioId);
    await page.getByTestId('btn-suspender-comercio').click();
    await page.getByTestId('input-suspender-comercio-motivo').fill(MOTIVO);
    await suspenderComercio(request, adminSesion.token, dueno.comercioId, 'Suspendido por otro Administrador');

    await page.getByTestId('btn-confirmar-suspender-comercio').click();
    const aviso = page.getByTestId('aviso-suspender-comercio');
    await expect(aviso).toContainText('El comercio ya está suspendido');
    await expect(aviso).toContainText('Cerrá esta ventana');
    await expect(page.getByTestId('btn-confirmar-suspender-comercio')).toHaveText('Suspender comercio');
    await expect(page.getByTestId('btn-cancelar-suspender-comercio')).toBeEnabled();
    expect(historialSuspendido(dueno.comercioId)).toBe(1);
    await page.getByTestId('btn-cancelar-suspender-comercio').click();
    await expect(page.getByTestId('modal-suspender-comercio')).toHaveCount(0);
  });

  test('levantar con mensaje: un comercio con cuenta de cobro vuelve a vender', async ({ page, request }) => {
    const dueno = await nuevoComercio(request, true);
    await suspenderComercio(request, adminSesion.token, dueno.comercioId, MOTIVO);
    await abrirDetalle(page, dueno.comercioId);

    await page.getByTestId('btn-levantar-suspension-comercio').click();
    const hoja = page.getByTestId('modal-levantar-suspension-comercio');
    await expect(hoja).toBeVisible();
    await expect(page.getByTestId('modal-levantar-suspension-comercio-titulo')).toHaveText('Levantar suspensión');
    await expect(page.getByTestId('levantar-comercio-suspension-actual')).toContainText('Suspendido desde ');
    await expect(page.getByTestId('levantar-comercio-motivo-actual')).toHaveText(MOTIVO);
    await expect(page.getByTestId('levantar-comercio-que-va-a-pasar')).toContainText('Vuelve a vender si tiene cuenta de cobro activa y documentación aprobada. Si no, queda aprobado sin poder vender.');
    await expect(page.getByTestId('contador-levantar-comercio-mensaje')).toHaveText('0 / 500');
    await page.getByTestId('input-levantar-comercio-mensaje').fill('Ya resolvieron lo de las demoras');
    await expect(page.getByTestId('contador-levantar-comercio-mensaje')).toHaveText('32 / 500');
    await captura(page, '04-hoja-levantar-suspension');
    await sinScrollHorizontal(page);

    await page.getByTestId('btn-confirmar-levantar-comercio').dblclick();
    await expect(page.locator('.toast')).toContainText('Suspensión levantada');
    await expect(hoja).toHaveCount(0);
    await expect(page.getByTestId(`estado-comercio-${dueno.comercioId}`)).toHaveText('Listo para vender');
    await expect(page.getByTestId(`btn-ver-detalle-comercio-${dueno.comercioId}`)).toBeFocused();
    expect(estadoDe(dueno.comercioId)).toBe('APTO_VENTA');
    expect(sql(`SELECT COUNT(*) FROM historial_estado_comercio WHERE comercio_id = ${dueno.comercioId} AND estado_origen = 'SUSPENDIDO';`)).toBe('1');
    expect(sql(`SELECT CONCAT(IFNULL(suspension_origen, '-'), IFNULL(motivo_suspension, '-')) FROM comercio WHERE id = ${dueno.comercioId};`)).toBe('--');
  });

  test('levantar sin mensaje: un comercio sin cuenta de cobro queda aprobado sin poder vender', async ({ page, request }) => {
    const dueno = await nuevoComercio(request, false);
    await suspenderComercio(request, adminSesion.token, dueno.comercioId, MOTIVO);
    await abrirDetalle(page, dueno.comercioId);

    await page.getByTestId('btn-levantar-suspension-comercio').click();
    await page.getByTestId('btn-confirmar-levantar-comercio').click();
    await expect(page.locator('.toast')).toContainText('Suspensión levantada');
    await expect(page.getByTestId(`estado-comercio-${dueno.comercioId}`)).toHaveText('Aprobado');
    expect(estadoDe(dueno.comercioId)).toBe('APROBADO');
  });

  test('Cancelar y Escape en la hoja de levantar no cambian nada y devuelven el foco', async ({ page, request }) => {
    const dueno = await nuevoComercio(request, true);
    await suspenderComercio(request, adminSesion.token, dueno.comercioId, MOTIVO);
    await abrirDetalle(page, dueno.comercioId);

    await page.getByTestId('btn-levantar-suspension-comercio').click();
    await page.getByTestId('btn-cancelar-levantar-comercio').click();
    await expect(page.getByTestId('modal-levantar-suspension-comercio')).toHaveCount(0);
    await expect(page.getByTestId('btn-levantar-suspension-comercio')).toBeFocused();

    await page.getByTestId('btn-levantar-suspension-comercio').click();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('modal-levantar-suspension-comercio')).toHaveCount(0);
    await expect(page.getByTestId('btn-levantar-suspension-comercio')).toBeFocused();
    expect(estadoDe(dueno.comercioId)).toBe('SUSPENDIDO');
  });

  test('suspendido junto con el Dueño: no se puede levantar desde acá y la explicación está a la vista', async ({ page, request }) => {
    const dueno = await nuevoComercio(request, true);
    const forzada = await apiPut(request, `/test/comercios/${dueno.comercioId}/suspension?origen=DUENO&motivo=${encodeURIComponent('Se suspendió al Dueño')}`, {});
    expect(forzada.status).toBe(200);
    await abrirDetalle(page, dueno.comercioId);

    await expect(page.getByTestId('suspension-comercio-estado')).toHaveText('Suspendido');
    await expect(page.getByTestId('suspension-comercio-motivo')).toHaveText('Se suspendió al Dueño');
    await expect(page.getByTestId('suspension-comercio-junto-dueno')).toHaveText('Suspendido junto con el Dueño');
    await expect(page.getByTestId('suspension-comercio-explicacion')).toHaveText(
      'No se puede levantar solo este comercio. Para reactivarlo hay que levantar la suspensión del Dueño.',
    );
    await expect(page.getByTestId('enlace-ir-al-dueno')).toHaveAttribute('href', `admin-duenos.html?id=${dueno.duenoId}`);
    const levantar = page.getByTestId('btn-levantar-suspension-comercio');
    await expect(levantar).toBeDisabled();
    await expect(levantar).toHaveAttribute('aria-describedby', 'suspension-comercio-explicacion');
    await expect(page.getByTestId('btn-suspender-comercio')).toHaveCount(0);
    await expect(page.getByTestId('btn-suspender-solo-comercio')).toBeVisible();
    await captura(page, '05-detalle-suspendido-por-el-dueno');
    await sinScrollHorizontal(page);
    expect(estadoDe(dueno.comercioId)).toBe('SUSPENDIDO');
  });

  test('si el email del aviso falló: el detalle lo dice y "Reenviar" lo reenvía con un toast', async ({ page, request }) => {
    const dueno = await nuevoComercio(request, true);
    const fallas = await apiPut(request, '/test/email-aviso-cuenta/fallas?cantidad=1', {});
    expect(fallas.status).toBe(200);
    await suspenderComercio(request, adminSesion.token, dueno.comercioId, MOTIVO);

    await abrirDetalle(page, dueno.comercioId);
    await expect(page.getByTestId('email-fallido-comercio')).toHaveText('No se envió el email');
    await captura(page, '06-detalle-email-fallido');
    await sinScrollHorizontal(page);

    await page.getByTestId('btn-reenviar-email-comercio').click();
    await expect(page.locator('.toast')).toContainText('Email reenviado');
    await expect(page.getByTestId('email-fallido-comercio')).toHaveCount(0);
    await expect(page.getByTestId('suspension-comercio-estado')).toHaveText('Suspendido');
  });

  test('un comercio que no se puede suspender no muestra el botón', async ({ page, request }) => {
    const inactivo = await clonarComercioTest(request, conPedidos.comercioId, `Inactivo Susp ${sufijoUnico()}`, 'INACTIVO');
    await abrirDetalle(page, inactivo);
    await expect(page.getByTestId('btn-suspender-comercio')).toHaveCount(0);
    await expect(page.getByTestId('btn-levantar-suspension-comercio')).toHaveCount(0);
    await expect(page.getByTestId('suspension-comercio')).toHaveCount(0);
  });

  test('reembolsos: los motivos de suspensión de cuenta, pago tardío y reclamo tienen su etiqueta', async ({ page, request }) => {
    const pedidoId = await pedidoPagado(request);
    const notaPorMotivo: Record<string, number> = {};
    for (const motivo of ['SUSPENSION_CLIENTE', 'PAGO_TARDIO', 'RECLAMO']) {
      const salida = sql(
        `INSERT INTO nota_credito (pago_id, monto, motivo, estado, intentos, mp_payment_id, ultimo_error, fecha_emision) ` +
          `SELECT p.id, p.monto, '${motivo}', 'PENDIENTE_REVISION_MANUAL', 0, COALESCE(p.id_transaccion_mp, 'sintetico-85'), 'Dato sintetico del spec 85', NOW() ` +
          `FROM pago p WHERE p.pedido_id = ${pedidoId}; SELECT LAST_INSERT_ID();`,
      );
      const id = Number(salida.split('\n').pop());
      notaPorMotivo[motivo] = id;
      notasSinteticas.push(id);
    }

    await abrirComoUsuario(page, adminSesion);
    await page.goto('/admin-reembolsos.html');
    await expect(page.getByTestId(`reembolso-item-${notaPorMotivo.SUSPENSION_CLIENTE}`)).toContainText('Suspensión de cuenta');
    await expect(page.getByTestId(`reembolso-item-${notaPorMotivo.PAGO_TARDIO}`)).toContainText('Pago tardío');
    await expect(page.getByTestId(`reembolso-item-${notaPorMotivo.RECLAMO}`)).toContainText('Reclamo');
    for (const id of Object.values(notaPorMotivo)) {
      await expect(page.getByTestId(`reembolso-item-${id}`)).not.toContainText('—');
    }
    await page.getByTestId(`reembolso-item-${notaPorMotivo.PAGO_TARDIO}`).scrollIntoViewIfNeeded();
    await captura(page, '07-reembolsos-etiquetas');
    await sinScrollHorizontal(page);
  });
});
