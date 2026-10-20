import { test, expect } from './helpers/prueba';
import type { APIRequestContext } from '@playwright/test';
import {
  agregarItemCarrito,
  apiConHeaders,
  apiPost,
  confirmarPagoTest,
  crearCategoria,
  crearPedido,
  diaDeHoy,
  fijarPasswordAdminYLoguear,
  login,
  obtenerLocalidadRioGrande,
  registrarYVerificarCliente,
  sqlTest as sql,
  sufijoUnico,
} from './helpers/backend';
import type { Dueno } from './helpers/multicomercio';
import { agregarComercioApto, prepararAprobado, reemplazarHorarios } from './helpers/multicomercio';
import { hoyEnZona } from './helpers/zona';

const HEADER = 'X-Comercio-Id';
const conComercio = (comercioId: number): Record<string, string> => ({ [HEADER]: String(comercioId) });
const todoElDia = () => [{ diaSemana: diaDeHoy(), horaApertura: '00:00', horaCierre: '23:59' }];

test.describe('Fase 2, T2 (API): asignación de turnos a pedidos anteriores (backfill)', () => {
  test.describe.configure({ mode: 'serial', timeout: 300_000 });

  let dueno: Dueno;
  let clienteToken: string;
  let categoriaId: number;

  const fila = (pedidoId: number) => {
    const [fecha, horarioId] = sql(`SELECT IFNULL(turno_fecha,'NULL'), IFNULL(turno_horario_id,'NULL') FROM pedido WHERE id = ${pedidoId};`).split('\t');
    return { fecha, horarioId };
  };
  const backfill = (request: APIRequestContext) => apiPost(request, '/test/jobs/backfill-turnos', {});

  async function pedidoPagado(request: APIRequestContext, comercioId: number, productoId: number, ahora: string): Promise<number> {
    await apiConHeaders(request, 'DELETE', '/carrito', clienteToken);
    await agregarItemCarrito(request, clienteToken, productoId, 1);
    const pedidoId = await crearPedido(request, clienteToken, 'RETIRO', null);
    await confirmarPagoTest(request, pedidoId, false, ahora);
    expect(comercioId).toBeGreaterThan(0);
    return pedidoId;
  }

  async function comercioConProducto(request: APIRequestContext): Promise<{ comercioId: number; productoId: number }> {
    const comercioId = await agregarComercioApto(request, dueno, `Backfill T2 ${sufijoUnico()}`);
    const producto = await apiConHeaders(request, 'POST', '/productos', dueno.token, conComercio(comercioId), {
      nombre: `Producto Backfill ${sufijoUnico()}`,
      precio: 5000,
      categoriaId,
    });
    expect(producto.status, JSON.stringify(producto.body)).toBe(201);
    return { comercioId, productoId: producto.body.data.id as number };
  }

  test.beforeAll(async ({ request }) => {
    const adminToken = (await fijarPasswordAdminYLoguear(request)).token;
    const localidadId = await obtenerLocalidadRioGrande(request);
    categoriaId = await crearCategoria(request, adminToken, `Cat Backfill T2 ${sufijoUnico()}`);
    dueno = await prepararAprobado(request, adminToken, localidadId, true, todoElDia());
    const cliente = await registrarYVerificarCliente(request, localidadId);
    clienteToken = (await login(request, cliente.nombreUsuario, cliente.password)).token;
  });

  test('asigna el turno a los pedidos pagados sin turno, no pisa los ya asignados y una segunda corrida no cambia nada', async ({ request }) => {
    const { comercioId, productoId } = await comercioConProducto(request);
    const dentro = await pedidoPagado(request, comercioId, productoId, `${hoyEnZona()}T13:00:00`);
    const otro = await pedidoPagado(request, comercioId, productoId, `${hoyEnZona()}T14:00:00`);
    const yaAsignado = await pedidoPagado(request, comercioId, productoId, `${hoyEnZona()}T15:00:00`);
    const originalDentro = fila(dentro);
    expect(originalDentro.fecha).toBe(hoyEnZona());
    sql(`UPDATE pedido SET turno_fecha = NULL, turno_horario_id = NULL WHERE id IN (${dentro}, ${otro});`);
    sql(`UPDATE pedido SET turno_fecha = DATE_SUB(turno_fecha, INTERVAL 1 DAY) WHERE id = ${yaAsignado};`);
    const previo = fila(yaAsignado);

    const primera = await backfill(request);

    expect(primera.status, JSON.stringify(primera.body)).toBe(200);
    expect(primera.body.data.asignados).toBeGreaterThanOrEqual(2);
    expect(fila(dentro)).toEqual(originalDentro);
    expect(fila(otro)).toEqual(originalDentro);
    expect(fila(yaAsignado)).toEqual(previo);

    const segunda = await backfill(request);

    expect(segunda.status).toBe(200);
    expect(segunda.body.data.asignados).toBe(0);
    expect(fila(dentro)).toEqual(originalDentro);
    expect(fila(yaAsignado)).toEqual(previo);
  });

  test('un pedido de un comercio sin franjas queda sin turno y se cuenta aparte', async ({ request }) => {
    const { comercioId, productoId } = await comercioConProducto(request);
    const pedidoId = await pedidoPagado(request, comercioId, productoId, `${hoyEnZona()}T13:00:00`);
    sql(`UPDATE pedido SET turno_fecha = NULL, turno_horario_id = NULL WHERE id = ${pedidoId};`);
    sql(`UPDATE pedido SET turno_fecha = NULL, turno_horario_id = NULL WHERE comercio_id = ${comercioId};`);
    reemplazarHorarios(comercioId, []);

    const resultado = await backfill(request);

    expect(resultado.status).toBe(200);
    expect(resultado.body.data.sinTurno).toBeGreaterThanOrEqual(1);
    expect(fila(pedidoId)).toEqual({ fecha: 'NULL', horarioId: 'NULL' });
  });

  test('el proceso se dispara a pedido y responde con los contadores', async ({ request }) => {
    const respuesta = await backfill(request);

    expect(respuesta.status).toBe(200);
    expect(typeof respuesta.body.data.asignados).toBe('number');
    expect(typeof respuesta.body.data.sinTurno).toBe('number');
  });
});
