import { test, expect } from '@playwright/test';
import type { APIRequestContext, Page, Request } from '@playwright/test';
import {
  agregarItemCarrito,
  aTitleCase,
  apiConHeaders,
  apiGet,
  apiPost,
  clonarComercioTest,
  confirmarPagoTest,
  crearCategoria,
  crearPedido,
  crearProducto,
  fijarPasswordAdminYLoguear,
  login,
  obtenerLocalidadRioGrande,
  registrarYVerificarCliente,
  sqlTest as sql,
  sufijoUnico,
} from './helpers/backend';
import { prepararAprobado } from './helpers/multicomercio';
import type { Dueno } from './helpers/multicomercio';
import { abrirComoUsuarioConComercio, abrirPanel } from './helpers/selector';

const VIEWPORT = { width: 390, height: 844 };
const HEADER = 'X-Comercio-Id';
const MENSAJE_DESVINCULADA = 'Cuenta de Mercado Pago desvinculada correctamente';
const TEXTO_ALCANCE_SIN_VINCULAR = 'Esta cuenta va a cobrar por todos tus comercios';
const TEXTO_ALCANCE_VINCULADA = 'Esta cuenta cobra por todos tus comercios';
const TEXTO_AVISO_PANEL = 'Vinculá Mercado Pago para empezar a vender';
const TEXTO_CONFIRMACION =
  'Tus comercios dejarán de recibir pedidos nuevos y saldrán del catálogo hasta que vuelvas a vincular una cuenta.';
const TEXTO_NOTA_REEMBOLSO = 'Si hay que devolver el dinero de alguno de estos pedidos, lo gestiona el equipo de Bajoneá de forma manual.';

let adminToken: string;
let localidadId: string;
let categoriaId: number;

const cuentaMp = (prefijo: string) => `${prefijo}-${sufijoUnico()}`;
const cabecera = (comercioId: number) => ({ [HEADER]: String(comercioId) });
const cuentaActivaDe = (duenoId: number): string =>
  sql(`SELECT IFNULL(MAX(mp_user_id), '') FROM cuenta_mercado_pago WHERE dueno_id = ${duenoId} AND activa = 1;`);
const estadoDe = (comercioId: number): string => sql(`SELECT estado FROM comercio WHERE id = ${comercioId};`);
const estadoPedido = (pedidoId: number): string => sql(`SELECT estado FROM pedido WHERE id = ${pedidoId};`);
const fijarEstadoPedido = (pedidoId: number, estado: string) => sql(`UPDATE pedido SET estado = '${estado}' WHERE id = ${pedidoId};`);

async function vincular(request: APIRequestContext, duenoId: number) {
  const respuesta = await apiPost(request, `/test/duenos/${duenoId}/mercadopago-simulada?mpUserId=${encodeURIComponent(cuentaMp('MP-UI'))}`, {});
  expect(respuesta.status).toBe(200);
}

async function prepararDueno(request: APIRequestContext, vinculada: boolean): Promise<Dueno> {
  const dueno = await prepararAprobado(request, adminToken, localidadId, false);
  if (vinculada) {
    await vincular(request, dueno.duenoId);
  }
  return dueno;
}

async function agregarClon(request: APIRequestContext, dueno: Dueno, etiqueta: string, estado: string): Promise<number> {
  return clonarComercioTest(request, dueno.comercioId, aTitleCase(`${etiqueta} ${sufijoUnico().slice(-6)}`), estado);
}

async function nombresDe(request: APIRequestContext, token: string): Promise<Record<number, string>> {
  const { body } = await apiGet(request, '/comercios/mis-comercios', token);
  return Object.fromEntries((body.data as any[]).map((comercio) => [comercio.id, comercio.nombre]));
}

async function productoEn(request: APIRequestContext, dueno: Dueno, comercioId: number): Promise<number> {
  const respuesta = await apiConHeaders(request, 'POST', '/productos', dueno.token, cabecera(comercioId), {
    nombre: `Producto Tramo5 UI ${sufijoUnico()}`,
    precio: 1500,
    categoriaId,
  });
  expect(respuesta.status).toBe(201);
  return respuesta.body.data.id as number;
}

async function clienteLogueado(request: APIRequestContext): Promise<string> {
  const cliente = await registrarYVerificarCliente(request, localidadId);
  return (await login(request, cliente.nombreUsuario, cliente.password)).token;
}

async function pedidoNuevo(request: APIRequestContext, clienteToken: string, productoId: number, pagado: boolean): Promise<number> {
  await agregarItemCarrito(request, clienteToken, productoId, 1);
  const pedidoId = await crearPedido(request, clienteToken, 'RETIRO');
  if (pagado) {
    await confirmarPagoTest(request, pedidoId);
  }
  return pedidoId;
}

async function transicion(request: APIRequestContext, dueno: Dueno, comercioId: number, pedidoId: number, accion: 'aceptar' | 'despachar') {
  const respuesta = await apiConHeaders(request, 'PUT', `/pedidos/comercio/${pedidoId}/${accion}`, dueno.token, cabecera(comercioId));
  expect(respuesta.status).toBe(200);
}

async function pedidoEnPreparacion(request: APIRequestContext, cliente: string, dueno: Dueno, comercioId: number, productoId: number) {
  const pedidoId = await pedidoNuevo(request, cliente, productoId, true);
  await transicion(request, dueno, comercioId, pedidoId, 'aceptar');
  return pedidoId;
}

async function pedidoListoParaRetirar(request: APIRequestContext, cliente: string, dueno: Dueno, comercioId: number, productoId: number) {
  const pedidoId = await pedidoEnPreparacion(request, cliente, dueno, comercioId, productoId);
  await transicion(request, dueno, comercioId, pedidoId, 'despachar');
  return pedidoId;
}

async function abrirPerfil(page: Page, dueno: Dueno) {
  await abrirComoUsuarioConComercio(page, dueno.sesion, { comercioActivoId: dueno.comercioId });
  await page.goto('/comercio-perfil.html');
  await expect(page.getByTestId('franja-comercio')).toBeVisible();
}

async function abrirCuentaDeCobro(page: Page, dueno: Dueno) {
  await abrirPerfil(page, dueno);
  await page.getByTestId('btn-ir-mercadopago').click();
}

async function abrirModalDesvincular(page: Page) {
  await page.getByTestId('btn-desvincular-mercadopago').click();
  await expect(page.getByTestId('modal-desvincular-mp')).toBeVisible();
}

function registrarDesvinculaciones(page: Page): Request[] {
  const peticiones: Request[] = [];
  page.on('request', (peticion) => {
    if (peticion.method() === 'DELETE' && peticion.url().endsWith('/oauth/mercadopago/desvincular')) {
      peticiones.push(peticion);
    }
  });
  return peticiones;
}

async function retrasar(page: Page, patron: string, milisegundos: number) {
  await page.route(patron, async (ruta) => {
    await new Promise((resolver) => setTimeout(resolver, milisegundos));
    await ruta.continue();
  });
}

test.describe('Multi-comercio, tramo 5B: Mercado Pago con varios comercios (UI)', () => {
  test.describe.configure({ timeout: 240_000 });
  test.use({ viewport: VIEWPORT });

  test.beforeAll(async ({ request }) => {
    localidadId = await obtenerLocalidadRioGrande(request);
    adminToken = (await fijarPasswordAdminYLoguear(request)).token;
    categoriaId = await crearCategoria(request, adminToken, `Cat Tramo5 UI ${sufijoUnico()}`);
  });

  test('aviso del panel: aparece con un comercio APROBADO sin cuenta, el enlace abre la cuenta de cobro y desaparece al vincular sin esperar el polling', async ({ page, request }) => {
    const dueno = await prepararDueno(request, false);
    const beta = await agregarClon(request, dueno, 'Beta', 'APROBADO');
    await agregarClon(request, dueno, 'Pendiente', 'PENDIENTE');
    await abrirComoUsuarioConComercio(page, dueno.sesion, { comercioActivoId: dueno.comercioId });
    await page.goto('/comercio-dashboard.html');
    await expect(page.getByTestId('franja-comercio')).toBeVisible();

    await abrirPanel(page);
    const aviso = page.getByTestId('aviso-vincular-mercadopago');
    await expect(aviso).toBeVisible();
    await expect(aviso).toContainText(TEXTO_AVISO_PANEL);
    await expect(page.getByTestId('btn-aviso-vincular-mercadopago')).toHaveText('Vincular cuenta');
    await expect(page.getByTestId(`etiqueta-estado-comercio-${dueno.comercioId}`)).toHaveCount(0);
    await expect(page.getByTestId(`etiqueta-estado-comercio-${beta}`)).toHaveCount(0);
    await expect(page.getByTestId('franja-comercio').getByTestId('aviso-vincular-mercadopago')).toHaveCount(0);
    await expect(page.getByTestId('btn-cerrar-aviso-vincular-mercadopago')).toHaveCount(0);

    await page.getByTestId('btn-aviso-vincular-mercadopago').click();
    await page.waitForURL('**/comercio-perfil.html**');
    await expect(page.getByTestId('mp-estado-pendiente')).toBeVisible();
    expect(new URL(page.url()).search).toBe('');

    await vincular(request, dueno.duenoId);
    const inicio = Date.now();
    await page.goto('/comercio-perfil.html?vinculacionMp=exito');
    await expect(page.getByTestId('mp-estado-vinculado')).toBeVisible();
    await abrirPanel(page);
    await expect(aviso).toBeHidden();
    expect(Date.now() - inicio).toBeLessThan(12_000);
    expect(estadoDe(dueno.comercioId)).toBe('APTO_VENTA');
    expect(estadoDe(beta)).toBe('APTO_VENTA');
  });

  test('el aviso del panel no aparece cuando todos los comercios operativos ya cobran', async ({ page, request }) => {
    const dueno = await prepararDueno(request, true);
    await agregarClon(request, dueno, 'Beta', 'APTO_VENTA');
    await abrirComoUsuarioConComercio(page, dueno.sesion, { comercioActivoId: dueno.comercioId });
    await page.goto('/comercio-dashboard.html');
    await abrirPanel(page);
    await expect(page.getByTestId('fila-comercio-' + dueno.comercioId)).toBeVisible();
    await expect(page.getByTestId('aviso-vincular-mercadopago')).toBeHidden();
  });

  test('la cuenta de cobro lista solo los comercios operativos, sin etiquetas, con el texto de cada estado', async ({ page, request }) => {
    const dueno = await prepararDueno(request, false);
    const beta = await agregarClon(request, dueno, 'Beta', 'APROBADO');
    await agregarClon(request, dueno, 'Pendiente', 'PENDIENTE');
    await agregarClon(request, dueno, 'Rechazado', 'RECHAZADO');
    const nombres = await nombresDe(request, dueno.token);

    await retrasar(page, '**/oauth/mercadopago/cuenta', 700);
    await abrirPerfil(page, dueno);
    await page.getByTestId('btn-ir-mercadopago').click();
    await expect(page.getByTestId('mp-estado-cargando')).toBeVisible();
    await expect(page.getByTestId('mp-estado-pendiente')).toBeVisible();
    await expect(page.getByTestId('mp-estado-cargando')).toBeHidden();
    await expect(page.getByTestId('mp-texto-alcance-sin-vincular')).toHaveText(TEXTO_ALCANCE_SIN_VINCULAR);
    await expect(page.getByTestId('mp-lista-comercios-sin-vincular').getByTestId('mp-comercio-operativo')).toHaveText([
      nombres[dueno.comercioId],
      nombres[beta],
    ]);

    await vincular(request, dueno.duenoId);
    await page.reload();
    await page.getByTestId('btn-ir-mercadopago').click();
    await expect(page.getByTestId('mp-estado-vinculado')).toBeVisible();
    await expect(page.getByTestId('mp-texto-alcance-vinculada')).toHaveText(TEXTO_ALCANCE_VINCULADA);
    await expect(page.getByTestId('mp-lista-comercios-vinculada').getByTestId('mp-comercio-operativo')).toHaveText([
      nombres[dueno.comercioId],
      nombres[beta],
    ]);
  });

  test('modal con pedidos en curso en varios comercios: líneas, cantidades y singular o plural; Cancelar no llama al DELETE', async ({ page, request }) => {
    const dueno = await prepararDueno(request, true);
    const beta = await agregarClon(request, dueno, 'Beta', 'APTO_VENTA');
    const productoA = await productoEn(request, dueno, dueno.comercioId);
    const productoB = await productoEn(request, dueno, beta);
    const cliente = await clienteLogueado(request);
    await pedidoNuevo(request, cliente, productoA, true);
    await pedidoEnPreparacion(request, cliente, dueno, dueno.comercioId, productoA);
    await pedidoEnPreparacion(request, cliente, dueno, dueno.comercioId, productoA);
    await pedidoListoParaRetirar(request, cliente, dueno, dueno.comercioId, productoA);
    await pedidoListoParaRetirar(request, cliente, dueno, beta, productoB);
    await pedidoListoParaRetirar(request, cliente, dueno, beta, productoB);
    fijarEstadoPedido(await pedidoNuevo(request, cliente, productoB, true), 'EN_CAMINO');
    const nombres = await nombresDe(request, dueno.token);

    const desvinculaciones = registrarDesvinculaciones(page);
    await abrirCuentaDeCobro(page, dueno);
    await abrirModalDesvincular(page);

    await expect(page.getByTestId('titulo-desvincular-mp')).toHaveText('¿Desvincular Mercado Pago?');
    await expect(page.getByTestId('texto-desvincular-mp')).toHaveText(TEXTO_CONFIRMACION);
    await expect(page.getByTestId('bloque-pedidos-en-curso-desvincular-mp')).toContainText('Pedidos en curso, siguen su camino');
    await expect(page.getByTestId('linea-pedidos-en-curso-desvincular-mp')).toHaveText([
      `${nombres[dueno.comercioId]}: 1 esperando tu confirmación, 2 en preparación, 1 listo para retirar`,
      `${nombres[beta]}: 1 en camino, 2 listos para retirar`,
    ]);
    await expect(page.getByTestId('nota-desvincular-mp')).toHaveText(TEXTO_NOTA_REEMBOLSO);
    await expect(page.getByTestId('btn-confirmar-desvincular-mp')).toHaveText('Desvincular');
    await expect(page.getByTestId('btn-cancelar-desvincular-mp')).toHaveText('Cancelar');

    await page.getByTestId('btn-cancelar-desvincular-mp').click();
    await expect(page.getByTestId('modal-desvincular-mp')).toHaveCount(0);
    expect(desvinculaciones).toHaveLength(0);
    expect(cuentaActivaDe(dueno.duenoId)).not.toBe('');
    expect(estadoDe(dueno.comercioId)).toBe('APTO_VENTA');
    expect(estadoDe(beta)).toBe('APTO_VENTA');
    await expect(page.getByTestId('mp-estado-vinculado')).toBeVisible();
  });

  test('sin pedidos en curso el modal lo dice, con skeleton mientras carga', async ({ page, request }) => {
    const dueno = await prepararDueno(request, true);
    await abrirCuentaDeCobro(page, dueno);
    await expect(page.getByTestId('mp-estado-vinculado')).toBeVisible();
    await retrasar(page, '**/oauth/mercadopago/desvinculacion/previa', 700);

    await page.getByTestId('btn-desvincular-mercadopago').click();
    await expect(page.getByTestId('esqueleto-desvincular-mp')).toBeVisible();
    await expect(page.getByTestId('titulo-desvincular-mp')).toHaveText('¿Desvincular Mercado Pago?');
    await expect(page.getByTestId('esqueleto-desvincular-mp')).toHaveCount(0);
    await expect(page.getByTestId('sin-pedidos-en-curso-desvincular-mp')).toHaveText('No tenés pedidos en curso');
    await expect(page.getByTestId('bloque-pedidos-en-curso-desvincular-mp')).toHaveCount(0);
    await expect(page.getByTestId('nota-desvincular-mp')).toHaveText(TEXTO_NOTA_REEMBOLSO);
  });

  test('con pagos pendientes se muestra el bloqueo con la hora HH:mm y Entendido; cuando vencen se puede desvincular', async ({ page, request }) => {
    const dueno = await prepararDueno(request, true);
    const beta = await agregarClon(request, dueno, 'Beta', 'APTO_VENTA');
    const productoA = await productoEn(request, dueno, dueno.comercioId);
    const productoB = await productoEn(request, dueno, beta);
    const nombres = await nombresDe(request, dueno.token);
    const clienteUno = await clienteLogueado(request);
    const clienteDos = await clienteLogueado(request);
    const pedidoUno = await pedidoNuevo(request, clienteUno, productoA, false);

    const desvinculaciones = registrarDesvinculaciones(page);
    await abrirCuentaDeCobro(page, dueno);
    await page.getByTestId('btn-desvincular-mercadopago').click();
    await expect(page.getByTestId('titulo-desvincular-mp')).toHaveText('Todavía no se puede desvincular');
    const previaUno = await apiGet(request, '/oauth/mercadopago/desvinculacion/previa', dueno.token);
    const horaUno = (previaUno.body.data.pagosPendientes.puedeReintentarDesde as string).slice(11, 16);
    expect(horaUno).toMatch(/^\d{2}:\d{2}$/);
    await expect(page.getByTestId('texto-bloqueo-desvincular-mp')).toHaveText(
      `Hay 1 cliente pagando un pedido en Mercado Pago (${nombres[dueno.comercioId]}: 1). Si desvinculás ahora, ese pago no se podría confirmar.`,
    );
    await expect(page.getByTestId('pie-bloqueo-desvincular-mp')).toHaveText(
      `Probá de nuevo alrededor de las ${horaUno}. Un pedido sin pagar vence a los 30 minutos.`,
    );
    await expect(page.getByTestId('btn-confirmar-desvincular-mp')).toHaveCount(0);
    await page.getByTestId('btn-entendido-desvincular-mp').click();
    await expect(page.getByTestId('modal-desvincular-mp')).toHaveCount(0);

    const pedidoDos = await pedidoNuevo(request, clienteDos, productoB, false);
    await page.getByTestId('btn-desvincular-mercadopago').click();
    await expect(page.getByTestId('texto-bloqueo-desvincular-mp')).toHaveText(
      `Hay 2 clientes pagando un pedido en Mercado Pago (${nombres[dueno.comercioId]}: 1, ${nombres[beta]}: 1). Si desvinculás ahora, esos pagos no se podrían confirmar.`,
    );
    await page.getByTestId('btn-entendido-desvincular-mp').click();
    expect(desvinculaciones).toHaveLength(0);
    expect(cuentaActivaDe(dueno.duenoId)).not.toBe('');

    fijarEstadoPedido(pedidoUno, 'EXPIRADO');
    fijarEstadoPedido(pedidoDos, 'CANCELADO');
    await page.getByTestId('btn-desvincular-mercadopago').click();
    await expect(page.getByTestId('titulo-desvincular-mp')).toHaveText('¿Desvincular Mercado Pago?');
    await expect(page.getByTestId('btn-confirmar-desvincular-mp')).toBeVisible();
    await page.getByTestId('btn-cancelar-desvincular-mp').click();
    expect(desvinculaciones).toHaveLength(0);
  });

  test('confirmar la desvinculación actualiza la pantalla, el panel y el aviso al instante', async ({ page, request }) => {
    const dueno = await prepararDueno(request, true);
    const beta = await agregarClon(request, dueno, 'Beta', 'APTO_VENTA');
    const nombres = await nombresDe(request, dueno.token);
    await abrirCuentaDeCobro(page, dueno);
    await expect(page.getByTestId('mp-estado-vinculado')).toBeVisible();
    await abrirPanel(page);
    await expect(page.getByTestId('aviso-vincular-mercadopago')).toBeHidden();
    await page.getByTestId('btn-cerrar-panel-comercios').click();
    await expect(page.getByTestId('panel-comercios')).toHaveCount(0);

    await abrirModalDesvincular(page);
    const respuesta = page.waitForResponse((r) => r.url().endsWith('/oauth/mercadopago/desvincular') && r.request().method() === 'DELETE');
    const inicio = Date.now();
    await page.getByTestId('btn-confirmar-desvincular-mp').click();
    expect((await respuesta).status()).toBe(200);

    await expect(page.locator('.toast')).toContainText(MENSAJE_DESVINCULADA);
    await expect(page.getByTestId('modal-desvincular-mp')).toHaveCount(0);
    await expect(page.getByTestId('mp-estado-pendiente')).toBeVisible();
    await expect(page.getByTestId('mp-estado-vinculado')).toBeHidden();
    await expect(page.getByTestId('mp-texto-alcance-sin-vincular')).toHaveText(TEXTO_ALCANCE_SIN_VINCULAR);
    await expect(page.getByTestId('mp-lista-comercios-sin-vincular').getByTestId('mp-comercio-operativo')).toHaveText([
      nombres[dueno.comercioId],
      nombres[beta],
    ]);
    await expect(page.getByTestId('franja-comercio-nombre')).toHaveText(nombres[dueno.comercioId]);
    await abrirPanel(page);
    await expect(page.getByTestId('aviso-vincular-mercadopago')).toBeVisible();
    await expect(page.getByTestId(`etiqueta-estado-comercio-${dueno.comercioId}`)).toHaveCount(0);
    expect(Date.now() - inicio).toBeLessThan(12_000);
    expect(cuentaActivaDe(dueno.duenoId)).toBe('');
    expect(estadoDe(dueno.comercioId)).toBe('APROBADO');
    expect(estadoDe(beta)).toBe('APROBADO');
  });

  test('carrera: aparece un pedido sin pagar entre la previa y el DELETE y se muestra el bloqueo', async ({ page, request }) => {
    const dueno = await prepararDueno(request, true);
    const producto = await productoEn(request, dueno, dueno.comercioId);
    const cliente = await clienteLogueado(request);
    const nombres = await nombresDe(request, dueno.token);

    await abrirCuentaDeCobro(page, dueno);
    await abrirModalDesvincular(page);
    await expect(page.getByTestId('btn-confirmar-desvincular-mp')).toBeVisible();

    const pedidoId = await pedidoNuevo(request, cliente, producto, false);
    const respuesta = page.waitForResponse((r) => r.url().endsWith('/oauth/mercadopago/desvincular') && r.request().method() === 'DELETE');
    await page.getByTestId('btn-confirmar-desvincular-mp').click();
    expect((await respuesta).status()).toBe(409);

    await expect(page.getByTestId('titulo-desvincular-mp')).toHaveText('Todavía no se puede desvincular');
    await expect(page.getByTestId('texto-bloqueo-desvincular-mp')).toHaveText(
      `Hay 1 cliente pagando un pedido en Mercado Pago (${nombres[dueno.comercioId]}: 1). Si desvinculás ahora, ese pago no se podría confirmar.`,
    );
    await expect(page.getByTestId('pie-bloqueo-desvincular-mp')).toContainText('Un pedido sin pagar vence a los 30 minutos.');
    expect(estadoPedido(pedidoId)).toBe('PENDIENTE_PAGO');
    expect(cuentaActivaDe(dueno.duenoId)).not.toBe('');
    expect(estadoDe(dueno.comercioId)).toBe('APTO_VENTA');
    await page.getByTestId('btn-entendido-desvincular-mp').click();
    await expect(page.getByTestId('modal-desvincular-mp')).toHaveCount(0);
    await expect(page.getByTestId('mp-estado-vinculado')).toBeVisible();
  });

  test('si la cuenta ya no existe al abrir el modal, se avisa con el mensaje del servidor y se refresca la pantalla', async ({ page, request }) => {
    const dueno = await prepararDueno(request, true);
    await abrirCuentaDeCobro(page, dueno);
    await expect(page.getByTestId('mp-estado-vinculado')).toBeVisible();
    const baja = await apiConHeaders(request, 'DELETE', '/oauth/mercadopago/desvincular', dueno.token);
    expect(baja.status).toBe(200);

    await page.getByTestId('btn-desvincular-mercadopago').click();

    await expect(page.locator('.toast')).toContainText('El Dueño no tiene ninguna cuenta de Mercado Pago vinculada');
    await expect(page.getByTestId('modal-desvincular-mp')).toHaveCount(0);
    await expect(page.getByTestId('mp-estado-pendiente')).toBeVisible();
    await expect(page.getByTestId('mp-estado-vinculado')).toBeHidden();
  });

  test.describe('resultado del callback (vinculacionMp)', () => {
    const casos = [
      { valor: 'exito', texto: 'Tu cuenta de Mercado Pago quedó vinculada' },
      { valor: 'error', texto: 'No pudimos vincular tu cuenta de Mercado Pago. Probá de nuevo.' },
      { valor: 'cuenta-en-uso', texto: 'Esa cuenta de Mercado Pago ya está en uso por otro Dueño. Usá otra cuenta, o pedí que la desvinculen primero.' },
      { valor: 'cuenta-ya-vinculada', texto: 'Ya tenés una cuenta de Mercado Pago vinculada. Desvinculala antes de vincular otra.' },
    ];

    for (const caso of casos) {
      test(`vinculacionMp=${caso.valor} muestra el mensaje, abre la cuenta de cobro y limpia el parámetro`, async ({ page, request }) => {
        const dueno = await prepararDueno(request, false);
        await abrirComoUsuarioConComercio(page, dueno.sesion, { comercioActivoId: dueno.comercioId });

        await page.goto(`/comercio-perfil.html?vinculacionMp=${caso.valor}&otro=1`);

        await expect(page.locator('.toast')).toContainText(caso.texto);
        await expect(page.getByTestId('mp-estado-pendiente')).toBeVisible();
        expect(new URL(page.url()).search).toBe('?otro=1');
      });
    }

    test('un valor desconocido no muestra ningún aviso, queda en el perfil y limpia el parámetro', async ({ page, request }) => {
      const dueno = await prepararDueno(request, false);
      await abrirComoUsuarioConComercio(page, dueno.sesion, { comercioActivoId: dueno.comercioId });

      await page.goto('/comercio-perfil.html?vinculacionMp=inventado');

      await expect(page.getByTestId('btn-ir-mercadopago')).toBeVisible();
      await expect(page.locator('.toast')).toHaveCount(0);
      await expect(page.getByTestId('mp-estado-pendiente')).toBeHidden();
      expect(new URL(page.url()).search).toBe('');
    });
  });

  test('los pedidos en curso siguen su flujo después de desvincular: se puede aceptar y avanzar uno', async ({ page, request }) => {
    const dueno = await prepararDueno(request, true);
    const producto = await productoEn(request, dueno, dueno.comercioId);
    const cliente = await clienteLogueado(request);
    const pedidoId = await pedidoNuevo(request, cliente, producto, true);

    await abrirCuentaDeCobro(page, dueno);
    await abrirModalDesvincular(page);
    await expect(page.getByTestId('linea-pedidos-en-curso-desvincular-mp')).toHaveCount(1);
    await page.getByTestId('btn-confirmar-desvincular-mp').click();
    await expect(page.getByTestId('mp-estado-pendiente')).toBeVisible();
    expect(estadoDe(dueno.comercioId)).toBe('APROBADO');
    expect(estadoPedido(pedidoId)).toBe('PENDIENTE_CONFIRMACION_COMERCIO');

    await page.goto(`/comercio-pedido-detalle.html?id=${pedidoId}`);
    await expect(page.getByTestId('estado-pedido')).toContainText('esperando tu confirmación');
    const aceptar = page.waitForResponse((r) => r.url().endsWith(`/pedidos/comercio/${pedidoId}/aceptar`) && r.request().method() === 'PUT');
    await page.getByTestId('btn-aceptar-pedido').click();
    expect((await aceptar).status()).toBe(200);
    await expect(page.getByTestId('estado-pedido')).toContainText('en preparación');
    expect(estadoPedido(pedidoId)).toBe('EN_PREPARACION');

    await transicion(request, dueno, dueno.comercioId, pedidoId, 'despachar');
    expect(estadoPedido(pedidoId)).toBe('LISTO_PARA_RETIRAR');
  });
});
