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
  conDocumentacionRequerida,
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
} from './helpers/backend';
import type { SesionApi } from './helpers/backend';
import { abrirComoUsuario, agregarComercioApto, loginUi, prepararAprobado } from './helpers/multicomercio';
import type { Dueno } from './helpers/multicomercio';
import { sumarAlEquipo } from './helpers/empleado';
import { sinScrollHorizontal } from './helpers/layout';

test.use({ viewport: { width: 375, height: 812 } });

const CARPETA_CAPTURAS = path.resolve(__dirname, '../../../docs/capturas-suspension-dueno');
const MOTIVO = 'Reiteradas quejas de clientes por demoras y pedidos incompletos';
const TEXTO_CLIENTE = 'El comercio no estaba disponible. Te devolvemos el dinero.';
const todoElDia = () => [{ diaSemana: diaDeHoy(), horaApertura: '00:00', horaCierre: '23:59' }];

async function captura(page: Page, nombre: string) {
  fs.mkdirSync(CARPETA_CAPTURAS, { recursive: true });
  await page.screenshot({ path: path.join(CARPETA_CAPTURAS, `${nombre}.png`) });
}

test.describe('Fase 5, S3 (UI B): lista de Dueños y hojas de suspender y levantar', () => {
  test.describe.configure({ mode: 'serial', timeout: 240_000 });

  let adminSesion: SesionApi;
  let localidadId: string;
  let categoriaId: number;
  let comprador: SesionApi;

  const estadoUsuario = (id: number): string => sql(`SELECT estado FROM usuario WHERE id = ${id};`);
  const estadoComercio = (id: number): string => sql(`SELECT estado FROM comercio WHERE id = ${id};`);
  const estadoPedido = (id: number): string => sql(`SELECT estado FROM pedido WHERE id = ${id};`);
  const nombreDe = (id: number): string => sql(`SELECT CONCAT(nombre, ' ', apellido) FROM persona_fisica WHERE id = ${id};`);

  const nuevoDueno = (request: APIRequestContext, conMercadoPago = true): Promise<Dueno> =>
    prepararAprobado(request, adminSesion.token, localidadId, conMercadoPago, todoElDia());

  async function conProducto(request: APIRequestContext, dueno: Dueno): Promise<number> {
    return crearProducto(request, dueno.token, { nombre: `Producto dueno ${sufijoUnico()}`, precio: 4200, categoriaId });
  }

  async function pedido(request: APIRequestContext, dueno: Dueno, productoId: number, hasta: 'PENDIENTE' | 'PREPARACION' | 'LISTO'): Promise<number> {
    await apiConHeaders(request, 'DELETE', '/carrito', comprador.token);
    await agregarItemCarrito(request, comprador.token, productoId, 1);
    const pedidoId = await crearPedido(request, comprador.token, 'RETIRO', null);
    await confirmarPagoTest(request, pedidoId, true);
    const cabecera = { 'X-Comercio-Id': String(dueno.comercioId) };
    if (hasta !== 'PENDIENTE') {
      expect((await apiConHeaders(request, 'PUT', `/pedidos/comercio/${pedidoId}/aceptar`, dueno.token, cabecera, {})).status).toBe(200);
    }
    if (hasta === 'LISTO') {
      expect((await apiConHeaders(request, 'PUT', `/pedidos/comercio/${pedidoId}/despachar`, dueno.token, cabecera, {})).status).toBe(200);
    }
    return pedidoId;
  }

  async function suspenderPorApi(request: APIRequestContext, dueno: Dueno, motivo = MOTIVO) {
    const { status, body } = await apiPut(request, `/administrador/duenos/${dueno.duenoId}/suspender`, { motivo }, adminSesion.token);
    expect(status, JSON.stringify(body)).toBe(200);
  }

  async function abrirLista(page: Page, parametros = '') {
    await abrirComoUsuario(page, adminSesion);
    await page.goto(`/admin-duenos.html${parametros}`);
    await expect(page.getByTestId('duenos-lista')).toBeVisible();
    await expect(page.getByTestId('contador-duenos')).toContainText('Mostrando');
  }

  async function buscar(page: Page, texto: string) {
    await page.getByTestId('input-buscar-dueno').fill(texto);
  }

  async function abrirAcciones(page: Page, dueno: Dueno) {
    await buscar(page, dueno.email);
    await page.getByTestId(`btn-acciones-dueno-${dueno.duenoId}`).click();
    await expect(page.getByTestId('hoja-acciones-dueno')).toBeVisible();
  }

  test.beforeAll(async ({ request }) => {
    adminSesion = await fijarPasswordAdminYLoguear(request);
    localidadId = await obtenerLocalidadRioGrande(request);
    categoriaId = await crearCategoria(request, adminSesion.token, `Cat Suspension Dueno ${sufijoUnico()}`);
    const registro = await registrarYVerificarCliente(request, localidadId);
    comprador = await login(request, registro.nombreUsuario, registro.password);
  });

  test('el panel del Administrador tiene la entrada "Dueños" y la pantalla carga con su contador', async ({ page }) => {
    await abrirComoUsuario(page, adminSesion);
    await page.goto('/admin-dashboard.html');
    await page.getByTestId('tile-gestion-duenos').click();
    await page.waitForURL('**/admin-duenos.html');
    await expect(page.locator('.app-header__title')).toHaveText('Dueños');
    await expect(page.getByTestId('contador-duenos')).toContainText(/Mostrando \d+ dueños?/);
    await expect(page.getByTestId('filtros-duenos').getByRole('button')).toHaveText(['Todos', 'Suspendidos', 'Bloqueados']);
    await sinScrollHorizontal(page);
  });

  test('la lista muestra nombre, email y cantidad de comercios; filtra por estado, busca y no incluye Administradores', async ({ page, request }) => {
    const activo = await nuevoDueno(request);
    await agregarComercioApto(request, activo, `Segundo ${sufijoUnico()}`);
    const suspendido = await nuevoDueno(request);
    await suspenderPorApi(request, suspendido);
    const bloqueado = await nuevoDueno(request);
    sql(`UPDATE usuario SET estado = 'BLOQUEADO' WHERE id = ${bloqueado.duenoId};`);

    await abrirLista(page);
    await buscar(page, activo.email);
    const filaActivo = page.getByTestId(`dueno-item-${activo.duenoId}`);
    await expect(filaActivo).toBeVisible();
    await expect(filaActivo.locator('h3')).toHaveText(new RegExp(nombreDe(activo.duenoId).split(' ')[0], 'i'));
    await expect(filaActivo.getByTestId('dueno-contacto')).toContainText(`${activo.email} · 2 comercios`);
    await expect(filaActivo.getByTestId('estado-dueno')).toHaveText('Activo');
    await expect(filaActivo.getByTestId(`dueno-suspension-${activo.duenoId}`)).toHaveCount(0);

    await buscar(page, suspendido.email);
    const filaSuspendido = page.getByTestId(`dueno-item-${suspendido.duenoId}`);
    await expect(filaSuspendido.getByTestId('dueno-contacto')).toContainText(`${suspendido.email} · 1 comercio`);
    await expect(filaSuspendido.getByTestId('dueno-contacto')).not.toContainText('1 comercios');
    await expect(filaSuspendido.getByTestId('estado-dueno')).toHaveText('Suspendido');
    await expect(filaSuspendido.getByTestId(`dueno-suspension-${suspendido.duenoId}`)).toHaveText(/^Desde el \d{2}\/\d{2}\/\d{4} · Reiteradas quejas/);
    await expect(page.getByTestId('contador-duenos')).toHaveText('Mostrando 1 dueño');

    await buscar(page, '');
    await page.getByTestId('filtro-duenos-suspendidos').click();
    await expect(page.getByTestId(`dueno-item-${suspendido.duenoId}`)).toBeVisible();
    await expect(page.getByTestId(`dueno-item-${activo.duenoId}`)).toHaveCount(0);
    await expect(page.getByTestId(`dueno-item-${bloqueado.duenoId}`)).toHaveCount(0);
    await page.getByTestId('filtro-duenos-bloqueados').click();
    await expect(page.getByTestId(`dueno-item-${bloqueado.duenoId}`).getByTestId('estado-dueno')).toHaveText('Bloqueado');
    await expect(page.getByTestId(`dueno-item-${suspendido.duenoId}`)).toHaveCount(0);
    await page.getByTestId('filtro-duenos-todos').click();
    await expect(page.getByTestId(`dueno-item-${activo.duenoId}`)).toBeVisible();

    await buscar(page, 'admin@bajonea.ar');
    await expect(page.getByTestId('duenos-vacio')).toHaveText('No hay dueños con esos filtros.');
    await buscar(page, 'zzzz-no-existe');
    await expect(page.getByTestId('duenos-vacio')).toBeVisible();
    await page.getByTestId('btn-limpiar-busqueda').click();
    await expect(page.getByTestId('input-buscar-dueno')).toHaveValue('');
    await buscar(page, activo.email);
    await captura(page, '01-lista-de-duenos');
    await sinScrollHorizontal(page);
  });

  test('el menú "⋯" abre una hoja con el nombre y la acción según el estado, y se cierra con Cancelar y con Escape devolviendo el foco', async ({ page, request }) => {
    const activo = await nuevoDueno(request);
    const suspendido = await nuevoDueno(request);
    await suspenderPorApi(request, suspendido);

    await abrirLista(page);
    await abrirAcciones(page, activo);
    await expect(page.getByTestId('hoja-acciones-dueno')).toHaveAttribute('role', 'alertdialog');
    await expect(page.getByTestId('hoja-acciones-dueno-titulo')).toHaveText(new RegExp(nombreDe(activo.duenoId).split(' ')[0], 'i'));
    await expect(page.getByTestId('accion-suspender-dueno')).toBeVisible();
    await expect(page.getByTestId('accion-levantar-dueno')).toHaveCount(0);
    await page.getByTestId('btn-cancelar-acciones-dueno').click();
    await expect(page.getByTestId('hoja-acciones-dueno')).toHaveCount(0);
    await expect(page.getByTestId(`btn-acciones-dueno-${activo.duenoId}`)).toBeFocused();

    await page.getByTestId(`btn-acciones-dueno-${activo.duenoId}`).click();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('hoja-acciones-dueno')).toHaveCount(0);
    await expect(page.getByTestId(`btn-acciones-dueno-${activo.duenoId}`)).toBeFocused();

    await abrirAcciones(page, suspendido);
    await expect(page.getByTestId('accion-levantar-dueno')).toBeVisible();
    await expect(page.getByTestId('accion-suspender-dueno')).toHaveCount(0);
    await sinScrollHorizontal(page);
  });

  test('si el email del aviso falló, la fila lo dice y "Reenviar" lo reenvía con un toast', async ({ page, request }) => {
    const dueno = await nuevoDueno(request);
    expect((await apiPut(request, '/test/email-aviso-cuenta/fallas?cantidad=1', {})).status).toBe(200);
    try {
      await suspenderPorApi(request, dueno);
    } finally {
      await apiPut(request, '/test/email-aviso-cuenta/fallas?cantidad=0', {});
    }

    await abrirLista(page);
    await buscar(page, dueno.email);
    await expect(page.getByTestId(`email-fallido-${dueno.duenoId}`)).toContainText('No se envió el email');
    await page.getByTestId(`btn-reenviar-email-dueno-${dueno.duenoId}`).click();
    await expect(page.locator('.toast')).toContainText('Email reenviado');
    await expect(page.getByTestId(`email-fallido-${dueno.duenoId}`)).toHaveCount(0);
  });

  test('la hoja de suspender con Empleados activos explica que los resuelven ellos, y sin ellos que se anula y reembolsa ahora', async ({ page, request }) => {
    const conEmpleados = await nuevoDueno(request);
    const productoConEmpleados = await conProducto(request, conEmpleados);
    const registro = await registrarYVerificarCliente(request, localidadId);
    await sumarAlEquipo(request, conEmpleados.comercioId, registro, conEmpleados.token);
    await pedido(request, conEmpleados, productoConEmpleados, 'PREPARACION');
    await pedido(request, conEmpleados, productoConEmpleados, 'LISTO');
    await pedido(request, conEmpleados, productoConEmpleados, 'PENDIENTE');

    const sinEmpleados = await nuevoDueno(request);
    const productoSin = await conProducto(request, sinEmpleados);
    await pedido(request, sinEmpleados, productoSin, 'PENDIENTE');
    await pedido(request, sinEmpleados, productoSin, 'PREPARACION');
    await pedido(request, sinEmpleados, productoSin, 'LISTO');
    const pendienteAparte = await clonarComercioTest(request, sinEmpleados.comercioId, `Pendiente ${sufijoUnico()}`, 'PENDIENTE');

    await abrirLista(page);
    await abrirAcciones(page, conEmpleados);
    await page.getByTestId('accion-suspender-dueno').click();
    const hoja = page.getByTestId('modal-suspender-dueno');
    await expect(hoja).toBeVisible();
    await expect(hoja).toHaveAttribute('role', 'alertdialog');
    await expect(page.getByTestId('modal-suspender-dueno-titulo')).toHaveText(/^Suspender a /);
    await expect(page.getByTestId('modal-suspender-dueno-subtitulo')).toHaveText('No va a poder ingresar. Su comercio se suspende.');
    const previa = page.getByTestId(`previa-comercio-${conEmpleados.comercioId}`);
    await expect(previa.getByTestId('chip-se-suspende')).toHaveText('Se suspende');
    await expect(previa.locator('li')).toHaveText([
      '1 pendiente: se rechaza y se reembolsa ahora.',
      /^1 en preparación y 1 listo: los resuelven su Empleado en hasta \d+ min\.$/,
    ]);
    await captura(page, '02-hoja-suspender-con-empleados');
    await sinScrollHorizontal(page);
    await page.getByTestId('btn-cancelar-suspender-dueno').click();
    await expect(page.getByTestId('modal-suspender-dueno')).toHaveCount(0);
    await expect(page.getByTestId(`btn-acciones-dueno-${conEmpleados.duenoId}`)).toBeFocused();

    await abrirAcciones(page, sinEmpleados);
    await page.getByTestId('accion-suspender-dueno').click();
    await expect(page.getByTestId('modal-suspender-dueno-subtitulo')).toHaveText('No va a poder ingresar. 1 de sus 2 comercios se suspende.');
    const previaSin = page.getByTestId(`previa-comercio-${sinEmpleados.comercioId}`);
    await expect(previaSin.locator('li')).toHaveText([
      '1 pendiente: se rechaza y se reembolsa ahora.',
      '1 en preparación: se anula y se reembolsa ahora, porque no tiene Empleados activos.',
      '1 listo para retirar: se cancela y se reembolsa ahora, porque no tiene Empleados activos.',
    ]);
    const queda = page.getByTestId(`previa-comercio-${pendienteAparte}`);
    await expect(queda.getByTestId('chip-queda-como-esta')).toHaveText('Queda como está');
    await expect(queda.locator('li')).toHaveText(['Todavía no está aprobado.']);
    await expect(page.getByText(/SUSPENDIDO|PENDIENTE|SE_SUSPENDE|QUEDA_COMO_ESTA/)).toHaveCount(0);
    await captura(page, '03-hoja-suspender-sin-empleados');
    await sinScrollHorizontal(page);
  });

  test('las hojas se arman bien sin comercios, con varios y con un solo comercio', async ({ page }) => {
    await abrirComoUsuario(page, adminSesion);
    await page.goto('/admin-duenos.html');
    const textos = await page.evaluate(async () => {
      const modulo = await import('/js/admin-dueno-suspension.js');
      const comercio = (efecto: string) => ({ efecto });
      return [
        modulo.subtituloDeSuspender({ comercios: [] }),
        modulo.subtituloDeSuspender({ comercios: [comercio('SE_SUSPENDE'), comercio('SE_SUSPENDE'), comercio('SE_SUSPENDE')] }),
        modulo.subtituloDeSuspender({ comercios: [comercio('QUEDA_COMO_ESTA'), comercio('QUEDA_COMO_ESTA')] }),
        modulo.subtituloDeSuspender({ comercios: [comercio('SE_SUSPENDE'), comercio('SE_SUSPENDE'), comercio('QUEDA_COMO_ESTA')] }),
        modulo.lineasDePedidos({ pedidosPendientesDeConfirmacion: 0, pedidosEnPreparacion: 0, pedidosListosParaRetirar: 0, pedidosEnCamino: 0, pedidosSinPagar: 0, empleadosActivos: 0, atencionDePedidos: 'SIN_PEDIDOS_EN_PREPARACION' }, { topePreparacionMinutos: 90, topeRetiroMinutos: 90 }),
        modulo.lineasDePedidos({ pedidosPendientesDeConfirmacion: 2, pedidosEnPreparacion: 3, pedidosListosParaRetirar: 2, pedidosEnCamino: 4, pedidosSinPagar: 0, empleadosActivos: 3, atencionDePedidos: 'ATENDIDOS_POR_EMPLEADOS' }, { topePreparacionMinutos: 90, topeRetiroMinutos: 60 }),
        modulo.lineasDePedidos({ pedidosPendientesDeConfirmacion: 0, pedidosEnPreparacion: 2, pedidosListosParaRetirar: 2, pedidosEnCamino: 1, pedidosSinPagar: 0, empleadosActivos: 0, atencionDePedidos: 'SE_ANULAN_AL_INSTANTE' }, { topePreparacionMinutos: 90, topeRetiroMinutos: 90 }),
      ];
    });
    expect(textos[0]).toBe('No va a poder ingresar. No tiene comercios.');
    expect(textos[1]).toBe('No va a poder ingresar. Sus 3 comercios se suspenden.');
    expect(textos[2]).toBe('No va a poder ingresar. Sus comercios siguen como están.');
    expect(textos[3]).toBe('No va a poder ingresar. 2 de sus 3 comercios se suspenden.');
    expect(textos[4]).toEqual(['Sin pedidos en curso.']);
    expect(textos[5]).toEqual([
      '2 pendientes: se rechazan y se reembolsan ahora.',
      '3 en preparación: los resuelven sus 3 Empleados en hasta 90 min.',
      '2 listos para retirar: los resuelven sus 3 Empleados en hasta 60 min.',
      '4 en camino siguen igual.',
    ]);
    expect(textos[6]).toEqual([
      '2 en preparación: se anulan y se reembolsan ahora, porque no tiene Empleados activos.',
      '2 listos para retirar: se cancelan y se reembolsan ahora, porque no tiene Empleados activos.',
      '1 en camino sigue igual.',
    ]);
  });

  test('suspender: valida el motivo con contador, Escape cancela, un doble clic suspende una sola vez y la cascada procesa los pedidos', async ({ page, request }) => {
    const dueno = await nuevoDueno(request);
    const producto = await conProducto(request, dueno);
    const pendiente = await pedido(request, dueno, producto, 'PENDIENTE');
    const preparacion = await pedido(request, dueno, producto, 'PREPARACION');
    const listo = await pedido(request, dueno, producto, 'LISTO');

    await abrirLista(page);
    await abrirAcciones(page, dueno);
    await page.getByTestId('accion-suspender-dueno').click();
    await expect(page.getByTestId('modal-suspender-dueno')).toBeVisible();
    const confirmar = page.getByTestId('btn-confirmar-suspender-dueno');
    await expect(confirmar).toBeDisabled();
    await expect(page.getByTestId('contador-suspender-dueno-motivo')).toHaveText('0 / 500 · mínimo 10');
    await page.getByTestId('input-suspender-dueno-motivo').fill('corto');
    await expect(page.getByTestId('contador-suspender-dueno-motivo')).toHaveText('5 / 500 · mínimo 10');
    await expect(confirmar).toBeDisabled();

    await page.keyboard.press('Escape');
    await expect(page.getByTestId('modal-suspender-dueno')).toHaveCount(0);
    expect(estadoUsuario(dueno.duenoId)).toBe('ACTIVO');
    await expect(page.getByTestId(`btn-acciones-dueno-${dueno.duenoId}`)).toBeFocused();

    await page.getByTestId(`btn-acciones-dueno-${dueno.duenoId}`).click();
    await page.getByTestId('accion-suspender-dueno').click();
    await page.getByTestId('input-suspender-dueno-motivo').fill(MOTIVO);
    await expect(confirmar).toBeEnabled();
    await confirmar.dblclick();
    await expect(page.locator('.toast')).toContainText('Dueño suspendido');
    await expect(page.getByTestId('modal-suspender-dueno')).toHaveCount(0);

    const fila = page.getByTestId(`dueno-item-${dueno.duenoId}`);
    await expect(fila.getByTestId('estado-dueno')).toHaveText('Suspendido');
    await expect(fila.getByTestId(`dueno-suspension-${dueno.duenoId}`)).toContainText(MOTIVO);
    await expect(page.getByTestId(`btn-acciones-dueno-${dueno.duenoId}`)).toBeFocused();

    expect(estadoUsuario(dueno.duenoId)).toBe('SUSPENDIDO');
    expect(Number(sql(`SELECT COUNT(*) FROM historial_estado_usuario WHERE usuario_id = ${dueno.duenoId} AND estado_destino = 'SUSPENDIDO';`))).toBe(1);
    expect(estadoComercio(dueno.comercioId)).toBe('SUSPENDIDO');
    expect(estadoPedido(pendiente)).toBe('RECHAZADO');
    expect(estadoPedido(preparacion)).toBe('ANULADO');
    expect(estadoPedido(listo)).toBe('CANCELADO_POR_SISTEMA');
    expect(Number(sql(`SELECT COUNT(*) FROM nota_credito nc JOIN pago pg ON pg.id = nc.pago_id WHERE pg.pedido_id IN (${pendiente}, ${preparacion}, ${listo});`))).toBe(3);

    await abrirComoUsuario(page, comprador);
    await page.goto('/pedidos.html');
    for (const [id, aviso] of [[preparacion, true], [listo, true]] as const) {
      const tarjeta = page.getByTestId(`pedido-item-${id}`);
      await expect(tarjeta.getByTestId('estado-pedido')).toHaveText('Cancelado');
      await expect(tarjeta.getByTestId('aviso-cancelado-por-suspension-pedido')).toHaveText(TEXTO_CLIENTE);
      expect(aviso).toBe(true);
    }
    await captura(page, '07-cliente-pedidos-cancelados-por-falta-de-atencion');
    await page.getByTestId(`pedido-item-${preparacion}`).click();
    await expect(page.getByText(TEXTO_CLIENTE).first()).toBeVisible();
    await expect(page.getByText(/Anulado|anuló tu pedido|ANULADO|SUSPENSION_COMERCIO|CANCELADO_POR_SISTEMA/)).toHaveCount(0);
    await captura(page, '08-cliente-detalle-cancelado-por-falta-de-atencion');
    await sinScrollHorizontal(page);
  });

  test('si el servidor rechaza la suspensión, la hoja muestra el error claro, sigue abierta y los botones vuelven a funcionar', async ({ page, request }) => {
    const dueno = await nuevoDueno(request);
    await abrirLista(page);
    await abrirAcciones(page, dueno);
    await page.getByTestId('accion-suspender-dueno').click();
    await page.route('**/administrador/duenos/*/suspender', (ruta) =>
      ruta.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ mensaje: 'No pudimos procesar la suspensión en este momento', data: null }) }));
    await page.getByTestId('input-suspender-dueno-motivo').fill(MOTIVO);
    await page.getByTestId('btn-confirmar-suspender-dueno').click();
    await expect(page.getByTestId('aviso-suspender-dueno')).toContainText('No pudimos procesar la suspensión en este momento');
    await expect(page.getByTestId('modal-suspender-dueno')).toBeVisible();
    await expect(page.getByTestId('btn-confirmar-suspender-dueno')).toBeEnabled();
    await expect(page.getByTestId('btn-cancelar-suspender-dueno')).toBeEnabled();
    expect(estadoUsuario(dueno.duenoId)).toBe('ACTIVO');

    await page.unroute('**/administrador/duenos/*/suspender');
    await page.getByTestId('btn-confirmar-suspender-dueno').click();
    await expect(page.locator('.toast')).toContainText('Dueño suspendido');
    expect(estadoUsuario(dueno.duenoId)).toBe('SUSPENDIDO');
  });

  test('levantar: muestra desde cuándo y por qué, qué comercios vuelven, acepta un mensaje opcional y restablece la cuenta', async ({ page, request }) => {
    const dueno = await nuevoDueno(request);
    await suspenderPorApi(request, dueno);
    expect(estadoComercio(dueno.comercioId)).toBe('SUSPENDIDO');

    await abrirLista(page);
    await abrirAcciones(page, dueno);
    await page.getByTestId('accion-levantar-dueno').click();
    const hoja = page.getByTestId('modal-levantar-dueno');
    await expect(hoja).toBeVisible();
    await expect(hoja).toHaveAttribute('role', 'alertdialog');
    await expect(page.getByTestId('modal-levantar-dueno-titulo')).toHaveText(/^Levantar a /);
    await expect(page.getByTestId('levantar-dueno-suspension-actual')).toContainText(/Suspendido desde \d{2}\/\d{2}\/\d{4}/);
    await expect(page.getByTestId('levantar-dueno-motivo-actual')).toHaveText(MOTIVO);
    const vuelven = page.getByTestId('levantar-dueno-vuelven');
    await expect(vuelven).toContainText('Se restablece 1 comercio');
    await expect(page.getByTestId(`vuelve-comercio-${dueno.comercioId}`)).toContainText('Vuelve');
    await expect(page.getByTestId('levantar-dueno-nota')).toHaveText('Los pedidos que se rechazaron o anularon al suspender no vuelven.');
    await expect(page.getByTestId('contador-levantar-dueno-mensaje')).toHaveText('0 / 500');
    await captura(page, '04-hoja-levantar');
    await sinScrollHorizontal(page);

    await page.getByTestId('input-levantar-dueno-mensaje').fill('Ya hablamos con el titular');
    await page.getByTestId('btn-confirmar-levantar-dueno').dblclick();
    await expect(page.locator('.toast')).toContainText('Suspensión levantada');
    await expect(page.getByTestId('modal-levantar-dueno')).toHaveCount(0);
    await expect(page.getByTestId(`dueno-item-${dueno.duenoId}`).getByTestId('estado-dueno')).toHaveText('Activo');
    await expect(page.getByTestId(`btn-acciones-dueno-${dueno.duenoId}`)).toBeFocused();
    expect(estadoUsuario(dueno.duenoId)).toBe('ACTIVO');
    expect(estadoComercio(dueno.comercioId)).toBe('APTO_VENTA');
    expect(Number(sql(`SELECT COUNT(*) FROM historial_estado_usuario WHERE usuario_id = ${dueno.duenoId} AND estado_destino = 'ACTIVO' AND motivo = 'Ya hablamos con el titular';`))).toBe(1);
  });

  test('al levantar, el comercio vuelve a vender solo si tiene cuenta de cobro y documentación aprobada; si no, queda aprobado', async ({ page, request }) => {
    const sinDocumentos = await nuevoDueno(request, true);
    const sinCuenta = await nuevoDueno(request, false);
    await conDocumentacionRequerida(request, async () => {
      await suspenderPorApi(request, sinDocumentos);
      await suspenderPorApi(request, sinCuenta);
      await abrirLista(page);
      for (const dueno of [sinDocumentos, sinCuenta]) {
        await abrirAcciones(page, dueno);
        await page.getByTestId('accion-levantar-dueno').click();
        await expect(page.getByTestId(`vuelve-comercio-${dueno.comercioId}`)).toBeVisible();
        await page.getByTestId('btn-confirmar-levantar-dueno').click();
        await expect(page.locator('.toast').last()).toContainText('Suspensión levantada');
        await expect(page.getByTestId('modal-levantar-dueno')).toHaveCount(0);
      }
    });
    expect(estadoComercio(sinDocumentos.comercioId)).toBe('APROBADO');
    expect(estadoComercio(sinCuenta.comercioId)).toBe('APROBADO');
    expect(estadoUsuario(sinDocumentos.duenoId)).toBe('ACTIVO');
  });

  test('un Dueño suspendido que intenta ingresar ve la hoja de cuenta suspendida con el motivo y sin botón de Soporte', async ({ page, request }) => {
    const dueno = await nuevoDueno(request);
    await suspenderPorApi(request, dueno);
    await loginUi(page, dueno.nombreUsuario, dueno.password);
    await expect(page.getByTestId('titulo-cuenta-suspendida')).toHaveText('Cuenta suspendida');
    await expect(page.getByTestId('motivo-cuenta-suspendida')).toContainText(MOTIVO);
    await expect(page.getByText(/soporte/i)).toHaveCount(0);
    await captura(page, '09-login-dueno-suspendido');
    await sinScrollHorizontal(page);
  });
});
