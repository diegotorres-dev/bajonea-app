import { test, expect } from '@playwright/test';
import type { APIRequestContext } from '@playwright/test';
import {
  agregarItemCarrito,
  apiConHeaders,
  apiGet,
  apiPost,
  apiPut,
  confirmarPagoTest,
  crearCategoria,
  crearPedido,
  crearProducto,
  fijarPasswordAdminYLoguear,
  login,
  marcarAptoVenta,
  obtenerLocalidadRioGrande,
  registrarYVerificarCliente,
  sqlTest as sql,
  sufijoUnico,
} from './helpers/backend';
import type { Dueno } from './helpers/multicomercio';
import { prepararAprobado } from './helpers/multicomercio';

const TOTAL_DEL_PEDIDO = 10200;

function haceMinutos(minutos: number): string {
  const momento = new Date(Date.now() - minutos * 60_000);
  const dos = (n: number) => String(n).padStart(2, '0');
  return `${momento.getFullYear()}-${dos(momento.getMonth() + 1)}-${dos(momento.getDate())} ${dos(momento.getHours())}:${dos(momento.getMinutes())}:${dos(momento.getSeconds())}`;
}

const estado = (pedidoId: number): string => sql(`SELECT estado FROM pedido WHERE id = ${pedidoId};`);
const notas = (pedidoId: number): number =>
  Number(sql(`SELECT COUNT(*) FROM nota_credito n JOIN pago p ON p.id = n.pago_id WHERE p.pedido_id = ${pedidoId};`));
const filas = (pedidoId: number, estadoFila: string): number =>
  Number(sql(`SELECT COUNT(*) FROM historial_estado_pedido WHERE pedido_id = ${pedidoId} AND estado = '${estadoFila}';`));
const ultimaFila = (pedidoId: number): string =>
  sql(`SELECT estado FROM historial_estado_pedido WHERE pedido_id = ${pedidoId} ORDER BY id DESC LIMIT 1;`);
const avisos = (pedidoId: number, tipo: string): number =>
  Number(sql(`SELECT COUNT(*) FROM notificacion WHERE entidad_tipo = 'PEDIDO' AND entidad_id = ${pedidoId} AND tipo = '${tipo}';`));
const totalAvisos = (pedidoId: number): number =>
  Number(sql(`SELECT COUNT(*) FROM notificacion WHERE entidad_tipo = 'PEDIDO' AND entidad_id = ${pedidoId};`));

test.describe('Anulación con reembolso y carreras de estado del pedido (API), bloque A0 de E3', () => {
  test.describe.configure({ mode: 'serial', timeout: 240_000 });

  let adminToken: string;
  let dueno: Dueno;
  let productoId: number;
  let clienteToken: string;

  const aceptar = (request: APIRequestContext, id: number) => apiPut(request, `/pedidos/comercio/${id}/aceptar`, {}, dueno.token);
  const rechazar = (request: APIRequestContext, id: number) =>
    apiPut(request, `/pedidos/comercio/${id}/rechazar`, { motivo: 'SIN_STOCK' }, dueno.token);
  const despachar = (request: APIRequestContext, id: number) => apiPut(request, `/pedidos/comercio/${id}/despachar`, {}, dueno.token);
  const anular = (request: APIRequestContext, id: number, motivo: string | null = 'Se rompió el horno') =>
    apiPut(request, `/pedidos/comercio/${id}/anular`, motivo === null ? {} : { motivo }, dueno.token);
  const cancelarCliente = (request: APIRequestContext, id: number) => apiPut(request, `/pedidos/cliente/${id}/cancelar`, {}, clienteToken);
  const entregarCliente = (request: APIRequestContext, id: number) => apiPut(request, `/pedidos/cliente/${id}/entregar`, {}, clienteToken);
  const correrProceso = (request: APIRequestContext, nombre: string) => apiPost(request, `/test/jobs/pedidos/${nombre}`, {});

  test.beforeAll(async ({ request }) => {
    adminToken = (await fijarPasswordAdminYLoguear(request)).token;
    const localidadId = await obtenerLocalidadRioGrande(request);
    const categoriaId = await crearCategoria(request, adminToken, `Cat Pedidos A0 ${sufijoUnico()}`);
    dueno = await prepararAprobado(request, adminToken, localidadId, false);
    await marcarAptoVenta(request, dueno.comercioId);
    productoId = await crearProducto(request, dueno.token, { nombre: `Producto A0 ${sufijoUnico()}`, precio: 10000, categoriaId });
    const cliente = await registrarYVerificarCliente(request, localidadId);
    const sesion = await login(request, cliente.nombreUsuario, cliente.password);
    clienteToken = sesion.token;
  });

  async function pedidoPagado(request: APIRequestContext, registrarPago = true): Promise<number> {
    await agregarItemCarrito(request, clienteToken, productoId, 1);
    const pedidoId = await crearPedido(request, clienteToken, 'RETIRO');
    await confirmarPagoTest(request, pedidoId, registrarPago);
    return pedidoId;
  }

  async function pedidoEnPreparacion(request: APIRequestContext, registrarPago = true): Promise<number> {
    const pedidoId = await pedidoPagado(request, registrarPago);
    expect((await aceptar(request, pedidoId)).status).toBe(200);
    return pedidoId;
  }

  async function mensajesDelCliente(request: APIRequestContext, pedidoId: number): Promise<string[]> {
    const { body } = await apiGet(request, '/notificaciones', clienteToken);
    return (body.data as any[]).filter((n) => n.entidadTipo === 'PEDIDO' && n.entidadId === pedidoId).map((n) => n.mensaje as string);
  }

  test.describe('Anular genera siempre la nota de crédito', () => {
    test('anular un pedido pagado crea una nota por el total, el Cliente y el Administrador la ven y el aviso dice que la devolución está en gestión', async ({ request }) => {
      const pedidoId = await pedidoEnPreparacion(request);

      const respuesta = await anular(request, pedidoId, 'Se rompió el horno');

      expect(respuesta.status).toBe(200);
      expect(respuesta.body.data.estado).toBe('ANULADO');
      expect(respuesta.body.data.motivoAnulacion).toBe('Se rompió el horno');
      expect(respuesta.body.data.reembolsoEstado).toBe('PENDIENTE_REVISION_MANUAL');
      expect(Number(respuesta.body.data.reembolsoMonto)).toBe(TOTAL_DEL_PEDIDO);
      expect(estado(pedidoId)).toBe('ANULADO');
      expect(notas(pedidoId)).toBe(1);
      expect(sql(`SELECT n.motivo FROM nota_credito n JOIN pago p ON p.id = n.pago_id WHERE p.pedido_id = ${pedidoId};`)).toBe('ANULACION_COMERCIO');
      expect(filas(pedidoId, 'ANULADO')).toBe(1);
      expect(sql(`SELECT actor_rol FROM historial_estado_pedido WHERE pedido_id = ${pedidoId} AND estado = 'ANULADO';`)).toBe('DUENO');

      const pedidosCliente = await apiGet(request, '/pedidos/cliente', clienteToken);
      const delCliente = (pedidosCliente.body.data as any[]).find((p) => p.id === pedidoId);
      expect(delCliente.estado).toBe('ANULADO');
      expect(delCliente.reembolsoEstado).toBe('PENDIENTE_REVISION_MANUAL');

      const mensajes = await mensajesDelCliente(request, pedidoId);
      expect(mensajes).toHaveLength(2);
      const anulacion = mensajes.find((m) => m.includes('anulado'))!;
      expect(anulacion).toContain('gestionando la devolución de tu pago');
      expect(anulacion).toContain('Se rompió el horno');
      expect(avisos(pedidoId, 'PEDIDO_ANULADO_COMERCIO')).toBe(1);

      const reembolsos = await apiGet(request, '/administrador/reembolsos', adminToken);
      expect(reembolsos.status).toBe(200);
      const nota = (reembolsos.body.data as any[]).find((n) => n.pedidoId === pedidoId);
      expect(nota).toBeTruthy();
      expect(nota.motivo).toBe('ANULACION_COMERCIO');
      expect(nota.estado).toBe('PENDIENTE_REVISION_MANUAL');
      expect(Number(nota.monto)).toBe(TOTAL_DEL_PEDIDO);
    });

    test('el motivo es obligatorio, solo se anula desde EN_PREPARACION y una segunda anulación da 409 sin otra nota', async ({ request }) => {
      const pendiente = await pedidoPagado(request);
      expect((await anular(request, pendiente)).status).toBe(409);
      expect(estado(pendiente)).toBe('PENDIENTE_CONFIRMACION_COMERCIO');
      expect(notas(pendiente)).toBe(0);
      expect((await rechazar(request, pendiente)).status).toBe(200);

      const enPreparacion = await pedidoEnPreparacion(request);
      expect((await anular(request, enPreparacion, null)).status).toBe(400);
      expect((await anular(request, enPreparacion, '   ')).status).toBe(400);
      expect(estado(enPreparacion)).toBe('EN_PREPARACION');
      expect(notas(enPreparacion)).toBe(0);

      expect((await anular(request, enPreparacion, 'Cierre')).status).toBe(200);
      const segunda = await anular(request, enPreparacion, 'Cierre otra vez');
      expect(segunda.status).toBe(409);
      expect(notas(enPreparacion)).toBe(1);
      expect(filas(enPreparacion, 'ANULADO')).toBe(1);
      expect(avisos(enPreparacion, 'PEDIDO_ANULADO_COMERCIO')).toBe(1);

      const despachado = await pedidoEnPreparacion(request);
      expect((await despachar(request, despachado)).status).toBe(200);
      expect((await anular(request, despachado, 'Tarde')).status).toBe(409);
      expect(notas(despachado)).toBe(0);
    });

    test('un pedido sin pago registrado se anula igual, sin nota y sin prometer una devolución', async ({ request }) => {
      const pedidoId = await pedidoEnPreparacion(request, false);

      const respuesta = await anular(request, pedidoId, 'Sin insumos');

      expect(respuesta.status).toBe(200);
      expect(respuesta.body.data.reembolsoEstado).toBeNull();
      expect(notas(pedidoId)).toBe(0);
      const mensajes = await mensajesDelCliente(request, pedidoId);
      expect(mensajes.find((m) => m.includes('anulado'))).not.toContain('devolución');
    });

    test('seis anulaciones simultáneas del mismo pedido dejan una sola nota, un solo ANULADO en el historial y un solo aviso', async ({ request }) => {
      const pedidoId = await pedidoEnPreparacion(request);

      const respuestas = await Promise.all(Array.from({ length: 6 }, () => anular(request, pedidoId, 'Cierre simultáneo')));

      const estados = respuestas.map((r) => r.status).sort();
      expect(estados).toEqual([200, 409, 409, 409, 409, 409]);
      expect(estado(pedidoId)).toBe('ANULADO');
      expect(notas(pedidoId)).toBe(1);
      expect(filas(pedidoId, 'ANULADO')).toBe(1);
      expect(avisos(pedidoId, 'PEDIDO_ANULADO_COMERCIO')).toBe(1);
    });
  });

  test.describe('Un solo ganador cuando dos operadores se pisan', () => {
    test('aceptar contra rechazar: un 200, un 409, y el aviso, el historial y la nota son los del ganador', async ({ request }) => {
      for (let ronda = 0; ronda < 4; ronda += 1) {
        const pedidoId = await pedidoPagado(request);

        const [a, r] = await Promise.all([aceptar(request, pedidoId), rechazar(request, pedidoId)]);

        expect([a.status, r.status].sort()).toEqual([200, 409]);
        const final = estado(pedidoId);
        expect(ultimaFila(pedidoId)).toBe(final);
        expect(totalAvisos(pedidoId)).toBe(2);
        if (a.status === 200) {
          expect(final).toBe('EN_PREPARACION');
          expect(avisos(pedidoId, 'PEDIDO_ACEPTADO')).toBe(1);
          expect(notas(pedidoId)).toBe(0);
        } else {
          expect(final).toBe('RECHAZADO');
          expect(avisos(pedidoId, 'PEDIDO_RECHAZADO')).toBe(1);
          expect(notas(pedidoId)).toBe(1);
        }
      }
    });

    test('anular contra despachar: un 200, un 409; solo la anulación ganadora genera nota', async ({ request }) => {
      for (let ronda = 0; ronda < 4; ronda += 1) {
        const pedidoId = await pedidoEnPreparacion(request);

        const [an, de] = await Promise.all([anular(request, pedidoId), despachar(request, pedidoId)]);

        expect([an.status, de.status].sort()).toEqual([200, 409]);
        const final = estado(pedidoId);
        expect(ultimaFila(pedidoId)).toBe(final);
        if (an.status === 200) {
          expect(final).toBe('ANULADO');
          expect(notas(pedidoId)).toBe(1);
          expect(avisos(pedidoId, 'PEDIDO_LISTO_RETIRO')).toBe(0);
        } else {
          expect(final).toBe('LISTO_PARA_RETIRAR');
          expect(notas(pedidoId)).toBe(0);
          expect(avisos(pedidoId, 'PEDIDO_ANULADO_COMERCIO')).toBe(0);
        }
      }
    });

    test('cancelar del Cliente contra aceptar del comercio: el pedido termina cancelado y nunca queda un aviso de más', async ({ request }) => {
      for (let ronda = 0; ronda < 4; ronda += 1) {
        const pedidoId = await pedidoPagado(request);

        const [c, a] = await Promise.all([cancelarCliente(request, pedidoId), aceptar(request, pedidoId)]);

        expect(c.status).toBe(200);
        expect([200, 409]).toContain(a.status);
        expect(estado(pedidoId)).toBe('CANCELADO');
        expect(ultimaFila(pedidoId)).toBe('CANCELADO');
        expect(filas(pedidoId, 'CANCELADO')).toBe(1);
        expect(avisos(pedidoId, 'PEDIDO_CANCELADO_CLIENTE')).toBe(1);
        expect(avisos(pedidoId, 'PEDIDO_ACEPTADO')).toBe(filas(pedidoId, 'EN_PREPARACION'));
      }
    });

    test('el proceso de expiración contra aceptar: o expira (con su nota y sus dos avisos) o queda aceptado, nunca las dos cosas', async ({ request }) => {
      for (let ronda = 0; ronda < 3; ronda += 1) {
        const pedidoId = await pedidoPagado(request);
        sql(`UPDATE historial_estado_pedido SET fecha_hora = '${haceMinutos(45)}' WHERE pedido_id = ${pedidoId} AND estado = 'PENDIENTE_CONFIRMACION_COMERCIO';`);

        const [job, a] = await Promise.all([correrProceso(request, 'expirar-sin-respuesta'), aceptar(request, pedidoId)]);

        expect(job.status).toBe(200);
        expect([200, 409]).toContain(a.status);
        const final = estado(pedidoId);
        expect(ultimaFila(pedidoId)).toBe(final);
        if (final === 'EXPIRADO') {
          expect(a.status).toBe(409);
          expect(filas(pedidoId, 'EXPIRADO')).toBe(1);
          expect(filas(pedidoId, 'EN_PREPARACION')).toBe(0);
          expect(notas(pedidoId)).toBe(1);
          expect(avisos(pedidoId, 'PEDIDO_EXPIRADO_CLIENTE')).toBe(1);
          expect(avisos(pedidoId, 'PEDIDO_EXPIRADO_COMERCIO')).toBe(1);
          expect(avisos(pedidoId, 'PEDIDO_ACEPTADO')).toBe(0);
        } else {
          expect(final).toBe('EN_PREPARACION');
          expect(a.status).toBe(200);
          expect(notas(pedidoId)).toBe(0);
          expect(avisos(pedidoId, 'PEDIDO_ACEPTADO')).toBe(1);
          expect(avisos(pedidoId, 'PEDIDO_EXPIRADO_CLIENTE')).toBe(0);
        }
      }
    });

    test('el proceso de expiración corrido solo no toca los pedidos recientes ni los ya aceptados', async ({ request }) => {
      const reciente = await pedidoPagado(request);
      const aceptado = await pedidoEnPreparacion(request);
      sql(`UPDATE historial_estado_pedido SET fecha_hora = '${haceMinutos(45)}' WHERE pedido_id = ${aceptado} AND estado = 'PENDIENTE_CONFIRMACION_COMERCIO';`);

      expect((await correrProceso(request, 'expirar-sin-respuesta')).status).toBe(200);

      expect(estado(reciente)).toBe('PENDIENTE_CONFIRMACION_COMERCIO');
      expect(estado(aceptado)).toBe('EN_PREPARACION');
      expect(notas(aceptado)).toBe(0);
      expect((await rechazar(request, reciente)).status).toBe(200);
    });

    test('la autoconfirmación contra la confirmación del Cliente entrega una sola vez', async ({ request }) => {
      for (let ronda = 0; ronda < 3; ronda += 1) {
        const pedidoId = await pedidoEnPreparacion(request);
        sql(`UPDATE pedido SET estado = 'EN_CAMINO' WHERE id = ${pedidoId};`);
        sql(
          `INSERT INTO historial_estado_pedido (pedido_id, estado, actor_rol, actor_usuario_id, fecha_hora) ` +
            `VALUES (${pedidoId}, 'EN_CAMINO', 'DUENO', ${dueno.duenoId}, '${haceMinutos(100)}');`,
        );

        const [job, c] = await Promise.all([correrProceso(request, 'avisar-y-autoconfirmar'), entregarCliente(request, pedidoId)]);

        expect(job.status).toBe(200);
        expect([200, 409]).toContain(c.status);
        expect(estado(pedidoId)).toBe('ENTREGADO');
        expect(filas(pedidoId, 'ENTREGADO')).toBe(1);
        const fuente = sql(`SELECT fuente_entrega FROM pedido WHERE id = ${pedidoId};`);
        if (fuente === 'SISTEMA') {
          expect(c.status).toBe(409);
          expect(avisos(pedidoId, 'PEDIDO_AUTOCONFIRMADO')).toBe(1);
        } else {
          expect(fuente).toBe('CLIENTE');
          expect(c.status).toBe(200);
          expect(avisos(pedidoId, 'PEDIDO_AUTOCONFIRMADO')).toBe(0);
        }
      }
    });
  });

  test.describe('Fotos y imágenes solo de su propia carpeta (A0.3)', () => {
    let cloudName: string;

    test.beforeAll(async ({ request }) => {
      const firma = await apiPost(request, '/comercios/perfil/foto/firma', {}, dueno.token);
      expect(firma.status).toBe(200);
      cloudName = firma.body.data.cloudName;
    });

    const url = (carpeta: string) => `https://res.cloudinary.com/${cloudName}/image/upload/v1/${carpeta}/foto-${sufijoUnico()}.png`;

    test('la foto del comercio solo se acepta de comercios/{id}/perfil/ y se rechaza la de otro comercio, un producto o el pre-registro', async ({ request }) => {
      const propia = url(`comercios/${dueno.comercioId}/perfil`);
      for (const ajena of [
        url(`comercios/${dueno.comercioId + 1000}/perfil`),
        url(`productos/${dueno.comercioId}/${productoId}`),
        url('comercios/pre-registro'),
        `https://res.cloudinary.com/otra-cuenta-${sufijoUnico()}/image/upload/v1/comercios/${dueno.comercioId}/perfil/foto.png`,
      ]) {
        const rechazada = await apiPut(request, '/comercios/perfil/foto', { url: ajena }, dueno.token);
        expect(rechazada.status, ajena).toBe(400);
        expect(sql(`SELECT foto_perfil_url FROM comercio WHERE id = ${dueno.comercioId};`)).not.toBe(ajena);
      }

      const aceptada = await apiPut(request, '/comercios/perfil/foto', { url: propia }, dueno.token);
      expect(aceptada.status).toBe(200);
      expect(sql(`SELECT foto_perfil_url FROM comercio WHERE id = ${dueno.comercioId};`)).toBe(propia);
    });

    test('las imágenes de producto (alta, reemplazo y recorte) solo se aceptan de productos/{comercio}/{producto}/', async ({ request }) => {
      const propia = url(`productos/${dueno.comercioId}/${productoId}`);
      const ajenas = [
        url(`productos/${dueno.comercioId + 1000}/${productoId}`),
        url(`productos/${dueno.comercioId}/${productoId + 1000}`),
        url(`comercios/${dueno.comercioId}/perfil`),
      ];
      for (const ajena of ajenas) {
        const rechazada = await apiPost(request, `/productos/${productoId}/imagenes`, { url: ajena, orden: 0, esPrincipal: true }, dueno.token);
        expect(rechazada.status, ajena).toBe(400);
      }
      expect(Number(sql(`SELECT COUNT(*) FROM imagen_producto WHERE producto_id = ${productoId};`))).toBe(0);

      const creada = await apiPost(request, `/productos/${productoId}/imagenes`, { url: propia, orden: 0, esPrincipal: true }, dueno.token);
      expect(creada.status).toBe(201);
      const imagenId = creada.body.data.id as number;

      for (const ajena of ajenas) {
        const rechazada = await apiConPatch(request, `/productos/${productoId}/imagenes/${imagenId}/url`, { url: ajena }, dueno.token);
        expect(rechazada.status, ajena).toBe(400);
      }
      expect(sql(`SELECT url FROM imagen_producto WHERE id = ${imagenId};`)).toBe(propia);

      const recorte = url(`productos/${dueno.comercioId}/${productoId}`);
      const reemplazada = await apiConPatch(request, `/productos/${productoId}/imagenes/${imagenId}/url`, { url: recorte }, dueno.token);
      expect(reemplazada.status).toBe(200);
      expect(sql(`SELECT url FROM imagen_producto WHERE id = ${imagenId};`)).toBe(recorte);
    });
  });

  async function apiConPatch(request: APIRequestContext, path: string, data: unknown, token: string) {
    return apiConHeaders(request, 'PATCH', path, token, { 'X-Comercio-Id': String(dueno.comercioId) }, data);
  }
});
