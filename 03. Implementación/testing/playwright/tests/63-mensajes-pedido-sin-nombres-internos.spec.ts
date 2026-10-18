import { test, expect } from './helpers/prueba';
import type { APIRequestContext, Page } from '@playwright/test';
import {
  agregarItemCarrito,
  apiConHeaders,
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
} from './helpers/backend';
import type { SesionApi } from './helpers/backend';
import { abrirComoUsuarioConComercio } from './helpers/selector';
import { prepararAprobado } from './helpers/multicomercio';
import type { Dueno } from './helpers/multicomercio';

const HEADER = 'X-Comercio-Id';
const RESUELTO = 'El pedido ya fue resuelto';
const PRIMERO_ACEPTAR = 'Primero tenés que aceptar el pedido';
const NO_SE_ANULA_SIN_ACEPTAR = 'Un pedido sin aceptar no se anula, se rechaza';
const NO_SE_PUEDE_ANULAR = 'El pedido ya no se puede anular';
const EN_PREPARACION = 'El pedido todavía está en preparación';
const EN_CAMINO = 'El pedido está en camino: lo confirma el cliente';
const CLIENTE_NO_EN_CAMINO = 'Tu pedido todavía no está en camino';
const YA_ENTREGADO = 'Este pedido ya figura como entregado';
const NOMBRE_INTERNO = /[A-Z]{3,}_[A-Z_]+|estado PENDIENTE/;

type EstadoDeseado = 'PENDIENTE' | 'PREPARACION' | 'LISTO';

test.use({ viewport: { width: 375, height: 812 } });

test.describe('Mensajes de pedido sin nombres internos de estado', () => {
  test.describe.configure({ mode: 'serial', timeout: 240_000 });

  let adminToken: string;
  let localidadId: string;
  let categoriaId: number;
  let dueno: Dueno;
  let productoId: number;
  let comprador: SesionApi;

  const conComercio = (): Record<string, string> => ({ [HEADER]: String(dueno.comercioId) });
  const accion = (request: APIRequestContext, pedidoId: number, ruta: string, cuerpo: unknown = {}) =>
    apiConHeaders(request, 'PUT', `/pedidos/comercio/${pedidoId}/${ruta}`, dueno.token, conComercio(), cuerpo);
  const entregaDelCliente = (request: APIRequestContext, pedidoId: number) =>
    apiConHeaders(request, 'PUT', `/pedidos/cliente/${pedidoId}/entregar`, comprador.token, {}, {});

  async function nuevoPedido(request: APIRequestContext, hasta: EstadoDeseado): Promise<number> {
    await apiConHeaders(request, 'DELETE', '/carrito', comprador.token);
    await agregarItemCarrito(request, comprador.token, productoId, 1);
    const pedidoId = await crearPedido(request, comprador.token, 'RETIRO', null);
    await confirmarPagoTest(request, pedidoId, true);
    if (hasta !== 'PENDIENTE') {
      expect((await accion(request, pedidoId, 'aceptar')).status).toBe(200);
    }
    if (hasta === 'LISTO') {
      expect((await accion(request, pedidoId, 'despachar')).status).toBe(200);
    }
    return pedidoId;
  }

  async function mensajeDe(respuesta: Promise<{ status: number; body: any }>, estado: number): Promise<string> {
    const resultado = await respuesta;
    expect(resultado.status).toBe(estado);
    expect(resultado.body.mensaje).not.toMatch(NOMBRE_INTERNO);
    return resultado.body.mensaje as string;
  }

  async function abrirComoDueno(page: Page) {
    await abrirComoUsuarioConComercio(page, dueno.sesion, { comercioActivoId: dueno.comercioId, ultimoComercioId: dueno.comercioId });
  }

  test.beforeAll(async ({ request }) => {
    adminToken = (await fijarPasswordAdminYLoguear(request)).token;
    localidadId = await obtenerLocalidadRioGrande(request);
    categoriaId = await crearCategoria(request, adminToken, `Cat Mensajes ${sufijoUnico()}`);
    const horarios = [{ diaSemana: diaDeHoy(), horaApertura: '00:00', horaCierre: '23:59' }];
    dueno = await prepararAprobado(request, adminToken, localidadId, true, horarios);
    productoId = await crearProducto(request, dueno.token, { nombre: `Producto Mensajes ${sufijoUnico()}`, precio: 3100, categoriaId });
    const registro = await registrarYVerificarCliente(request, localidadId);
    comprador = await login(request, registro.nombreUsuario, registro.password);
  });

  test.describe('API: el texto depende del estado en que está el pedido', () => {
    test('aceptar y rechazar un pedido que ya avanzó dicen "El pedido ya fue resuelto"', async ({ request }) => {
      const pedidoId = await nuevoPedido(request, 'PREPARACION');

      expect(await mensajeDe(accion(request, pedidoId, 'aceptar'), 409)).toBe(RESUELTO);
      expect(await mensajeDe(accion(request, pedidoId, 'rechazar', { motivo: 'SIN_STOCK', comentario: null }), 409)).toBe(RESUELTO);
      expect(sql(`SELECT estado FROM pedido WHERE id = ${pedidoId};`)).toBe('EN_PREPARACION');
    });

    test('despachar: un pedido sin aceptar pide aceptarlo primero y uno que ya salió está resuelto', async ({ request }) => {
      const pendiente = await nuevoPedido(request, 'PENDIENTE');
      expect(await mensajeDe(accion(request, pendiente, 'despachar'), 409)).toBe(PRIMERO_ACEPTAR);

      const listo = await nuevoPedido(request, 'LISTO');
      expect(await mensajeDe(accion(request, listo, 'despachar'), 409)).toBe(RESUELTO);
    });

    test('anular: un pedido sin aceptar se rechaza y uno que ya salió no se puede anular', async ({ request }) => {
      const pendiente = await nuevoPedido(request, 'PENDIENTE');
      expect(await mensajeDe(accion(request, pendiente, 'anular', { motivo: 'CERRADO' }), 409)).toBe(NO_SE_ANULA_SIN_ACEPTAR);

      const listo = await nuevoPedido(request, 'LISTO');
      expect(await mensajeDe(accion(request, listo, 'anular', { motivo: 'CERRADO' }), 409)).toBe(NO_SE_PUEDE_ANULAR);
    });

    test('entregar y cerrar como no retirado: el texto sigue al estado real del pedido', async ({ request }) => {
      const pendiente = await nuevoPedido(request, 'PENDIENTE');
      const enPreparacion = await nuevoPedido(request, 'PREPARACION');
      const enCamino = await nuevoPedido(request, 'PREPARACION');
      sql(`UPDATE pedido SET estado = 'EN_CAMINO' WHERE id = ${enCamino};`);
      const entregado = await nuevoPedido(request, 'LISTO');
      expect((await accion(request, entregado, 'entregar')).status).toBe(200);

      for (const ruta of ['entregar', 'no-retirado']) {
        expect(await mensajeDe(accion(request, pendiente, ruta), 409), `${ruta} sin aceptar`).toBe(PRIMERO_ACEPTAR);
        expect(await mensajeDe(accion(request, enPreparacion, ruta), 409), `${ruta} en preparación`).toBe(EN_PREPARACION);
        expect(await mensajeDe(accion(request, enCamino, ruta), 409), `${ruta} en camino`).toBe(EN_CAMINO);
        expect(await mensajeDe(accion(request, entregado, ruta), 409), `${ruta} entregado`).toBe(RESUELTO);
      }
    });

    test('el Cliente que confirma una entrega fuera de lugar recibe un texto verdadero para cada estado', async ({ request }) => {
      const enPreparacion = await nuevoPedido(request, 'PREPARACION');
      expect(await mensajeDe(entregaDelCliente(request, enPreparacion), 409)).toBe(CLIENTE_NO_EN_CAMINO);

      const entregado = await nuevoPedido(request, 'LISTO');
      expect((await accion(request, entregado, 'entregar')).status).toBe(200);
      expect(await mensajeDe(entregaDelCliente(request, entregado), 409)).toBe(YA_ENTREGADO);

      const rechazado = await nuevoPedido(request, 'PENDIENTE');
      expect((await accion(request, rechazado, 'rechazar', { motivo: 'SIN_STOCK', comentario: null })).status).toBe(200);
      expect(await mensajeDe(entregaDelCliente(request, rechazado), 409)).toBe(RESUELTO);
    });
  });

  test.describe('UI: el aviso fijo del Dueño', () => {
    test('si otro ya aceptó el pedido, "Aceptar pedido" muestra "El pedido ya fue resuelto" y ningún nombre interno', async ({ page, request }) => {
      const pedidoId = await nuevoPedido(request, 'PENDIENTE');
      await abrirComoDueno(page);
      await page.goto(`/comercio-pedido-detalle.html?id=${pedidoId}`);
      await expect(page.getByTestId('btn-aceptar-pedido')).toBeEnabled();
      expect((await accion(request, pedidoId, 'aceptar')).status).toBe(200);

      await page.getByTestId('btn-aceptar-pedido').click();

      const texto = page.getByTestId('aviso-fijo-texto');
      await expect(texto).toHaveText(RESUELTO);
      await expect(texto).not.toContainText('PENDIENTE');
      expect(await texto.innerText()).not.toMatch(NOMBRE_INTERNO);
      await expect(page.getByTestId('cabecera-estado-pedido')).toContainText('En preparación');
    });

    test('si otro ya rechazó el pedido, "Rechazar pedido" muestra el mismo aviso', async ({ page, request }) => {
      const pedidoId = await nuevoPedido(request, 'PENDIENTE');
      await abrirComoDueno(page);
      await page.goto(`/comercio-pedido-detalle.html?id=${pedidoId}`);
      await expect(page.getByTestId('btn-rechazar-pedido')).toBeEnabled();
      expect((await accion(request, pedidoId, 'rechazar', { motivo: 'SIN_STOCK', comentario: null })).status).toBe(200);

      await page.getByTestId('btn-rechazar-pedido').click();
      await page.getByTestId('select-motivo-rechazo').selectOption('SIN_STOCK');
      await page.getByTestId('btn-confirmar-rechazo').click();

      await expect(page.getByTestId('aviso-fijo-texto')).toHaveText(RESUELTO);
      await expect(page.getByTestId('cabecera-estado-pedido')).toContainText('Rechazado');
    });
  });
});
