import { test, expect } from '@playwright/test';
import type { APIRequestContext } from '@playwright/test';
import {
  agregarItemCarrito,
  apiConHeaders,
  apiGet,
  apiPost,
  confirmarPagoTest,
  crearCategoria,
  crearPedido,
  crearProducto,
  diaDeHoy,
  diaDistintoDeHoy,
  fijarPasswordAdminYLoguear,
  login,
  obtenerLocalidadRioGrande,
  registrarYVerificarCliente,
  sqlTest as sql,
  sufijoUnico,
  aTitleCase,
} from './helpers/backend';
import type { Dueno } from './helpers/multicomercio';
import { agregarComercioApto, prepararAprobado, registrarPendiente } from './helpers/multicomercio';

const HEADER = 'X-Comercio-Id';
const MENSAJE_FUERA_DE_HORARIO = 'Solo podés abrir o cerrar dentro de tu horario';
const MENSAJE_NO_OPERATIVO = 'Este comercio no está operativo';
const MENSAJE_CERRADO_MANUAL = 'Este comercio está cerrado en este momento';
const NOMBRE_DIA: Record<string, string> = {
  LUNES: 'lunes',
  MARTES: 'martes',
  MIERCOLES: 'miércoles',
  JUEVES: 'jueves',
  VIERNES: 'viernes',
  SABADO: 'sábado',
  DOMINGO: 'domingo',
};

const todoElDia = (diaSemana: string) => ({ diaSemana, horaApertura: '00:00', horaCierre: '23:59' });
const cabecera = (comercioId: number) => ({ [HEADER]: String(comercioId) });

const cerrar = (request: APIRequestContext, token: string, headers: Record<string, string>) =>
  apiConHeaders(request, 'PUT', '/comercios/cerrar', token, headers);
const abrir = (request: APIRequestContext, token: string, headers: Record<string, string>) =>
  apiConHeaders(request, 'PUT', '/comercios/abrir', token, headers);

const bandera = (comercioId: number): number => Number(sql(`SELECT cerrado_manualmente FROM comercio WHERE id = ${comercioId};`));
const filas = (comercioId: number, accion?: string): number =>
  Number(sql(`SELECT COUNT(*) FROM historial_cierre_comercio WHERE comercio_id = ${comercioId}${accion ? ` AND accion = '${accion}'` : ''};`));
const momentoDelCierre = (comercioId: number): string =>
  sql(
    `SELECT DATE_FORMAT(fecha_hora, '%Y-%m-%dT%H:%i:%s') FROM historial_cierre_comercio ` +
      `WHERE comercio_id = ${comercioId} AND accion = 'CERRADO' ORDER BY id DESC LIMIT 1;`,
  );
const sumarSegundos = (momento: string, segundos: number): string =>
  sql(`SELECT DATE_FORMAT(DATE_ADD('${momento.replace('T', ' ')}', INTERVAL ${segundos} SECOND), '%Y-%m-%dT%H:%i:%s');`);
const estadoPedido = (pedidoId: number): string => sql(`SELECT estado FROM pedido WHERE id = ${pedidoId};`);

async function publicoDe(request: APIRequestContext, comercioId: number) {
  const listado = await apiGet(request, '/catalogo/comercios');
  expect(listado.status).toBe(200);
  const fila = listado.body.data.find((c: any) => c.id === comercioId);
  expect(fila).toBeTruthy();
  return fila;
}

async function correrJob(request: APIRequestContext, ahora?: string) {
  const query = ahora ? `?ahora=${encodeURIComponent(ahora)}` : '';
  return apiPost(request, `/test/jobs/reapertura-comercios${query}`, {});
}

test.describe('Cierre manual del comercio (API), tramo C1', () => {
  test.describe.configure({ mode: 'serial', timeout: 240_000 });

  let adminToken: string;
  let localidadId: string;
  let categoriaId: number;

  test.beforeAll(async ({ request }) => {
    adminToken = (await fijarPasswordAdminYLoguear(request)).token;
    localidadId = await obtenerLocalidadRioGrande(request);
    categoriaId = await crearCategoria(request, adminToken, `Cat Cierre ${sufijoUnico()}`);
  });

  async function duenoAbierto(request: APIRequestContext, horarios = [todoElDia(diaDeHoy())]) {
    const dueno = await prepararAprobado(request, adminToken, localidadId, true, horarios);
    const productoId = await crearProducto(request, dueno.token, {
      nombre: `Producto Cierre ${sufijoUnico()}`,
      precio: 1500,
      categoriaId,
    });
    return { dueno, productoId };
  }

  async function clienteLogueado(request: APIRequestContext) {
    const cliente = await registrarYVerificarCliente(request, localidadId);
    return (await login(request, cliente.nombreUsuario, cliente.password)).token;
  }

  test.describe('Cerrar y abrir', () => {
    test('cerrar dentro de la franja prende la bandera, escribe una fila de historial y la respuesta, el perfil, el listado y el catálogo lo reflejan', async ({ request }) => {
      const { dueno } = await duenoAbierto(request);
      const antes = await apiGet(request, '/comercios/perfil', dueno.token);
      expect(antes.body.data.cerradoManualmente).toBe(false);
      expect(antes.body.data.abiertoAhora).toBe(true);
      expect(antes.body.data.puedeCambiarCierre).toBe(true);
      expect(antes.body.data.textoReapertura).toBeNull();

      const cerrado = await cerrar(request, dueno.token, cabecera(dueno.comercioId));
      expect(cerrado.status).toBe(200);
      expect(cerrado.body.data.cerradoManualmente).toBe(true);
      expect(cerrado.body.data.abiertoAhora).toBe(false);
      expect(cerrado.body.data.puedeCambiarCierre).toBe(true);
      expect(cerrado.body.data.textoReapertura).toBe(`Reabre el ${NOMBRE_DIA[diaDeHoy()]} a las 00:00`);

      expect(bandera(dueno.comercioId)).toBe(1);
      expect(filas(dueno.comercioId)).toBe(1);
      expect(sql(`SELECT CONCAT(accion, '/', actor_rol, '/', actor_usuario_id) FROM historial_cierre_comercio WHERE comercio_id = ${dueno.comercioId};`))
        .toBe(`CERRADO/DUENO/${dueno.duenoId}`);

      const perfil = await apiGet(request, '/comercios/perfil', dueno.token);
      expect(perfil.body.data.cerradoManualmente).toBe(true);
      expect(perfil.body.data.abiertoAhora).toBe(false);
      expect(perfil.body.data.textoReapertura).toBe(cerrado.body.data.textoReapertura);
      expect(perfil.body.data.estado).toBe('APTO_VENTA');

      const listado = await apiConHeaders(request, 'GET', '/comercios/mis-comercios', dueno.token);
      const fila = listado.body.data.find((c: any) => c.id === dueno.comercioId);
      expect(fila.cerradoManualmente).toBe(true);
      expect(fila.abiertoAhora).toBe(false);
      expect(fila.puedeCambiarCierre).toBe(true);
      expect(fila.textoReapertura).toBe(cerrado.body.data.textoReapertura);

      const publico = await publicoDe(request, dueno.comercioId);
      expect(publico.estadoApertura).toBe('CERRADO_TEMPORALMENTE');
      expect(publico.textoReapertura).toBe(cerrado.body.data.textoReapertura);
      expect(publico.estado).toBe('APTO_VENTA');

      const abierto = await abrir(request, dueno.token, cabecera(dueno.comercioId));
      expect(abierto.status).toBe(200);
      expect(abierto.body.data.cerradoManualmente).toBe(false);
      expect(abierto.body.data.abiertoAhora).toBe(true);
      expect(abierto.body.data.textoReapertura).toBeNull();
      expect(bandera(dueno.comercioId)).toBe(0);
      expect(filas(dueno.comercioId)).toBe(2);
      expect(filas(dueno.comercioId, 'REABIERTO')).toBe(1);

      const despues = await publicoDe(request, dueno.comercioId);
      expect(despues.estadoApertura).toBe('ABIERTO');
      expect(despues.textoReapertura).toBeNull();
    });

    test('con un comercio que abre mañana el texto dice "Reabre mañana a las 00:00"', async ({ request }) => {
      const { dueno } = await duenoAbierto(request, [todoElDia(diaDeHoy()), todoElDia(diaDistintoDeHoy())]);

      const cerrado = await cerrar(request, dueno.token, cabecera(dueno.comercioId));

      expect(cerrado.status).toBe(200);
      expect(cerrado.body.data.textoReapertura).toBe('Reabre mañana a las 00:00');
    });

    test('doble cierre y doble apertura responden 200 con el estado actual y no duplican filas de historial', async ({ request }) => {
      const { dueno } = await duenoAbierto(request);

      expect((await cerrar(request, dueno.token, cabecera(dueno.comercioId))).status).toBe(200);
      const segundoCierre = await cerrar(request, dueno.token, cabecera(dueno.comercioId));
      expect(segundoCierre.status).toBe(200);
      expect(segundoCierre.body.data.cerradoManualmente).toBe(true);
      expect(filas(dueno.comercioId, 'CERRADO')).toBe(1);

      expect((await abrir(request, dueno.token, cabecera(dueno.comercioId))).status).toBe(200);
      const segundaApertura = await abrir(request, dueno.token, cabecera(dueno.comercioId));
      expect(segundaApertura.status).toBe(200);
      expect(segundaApertura.body.data.cerradoManualmente).toBe(false);
      expect(filas(dueno.comercioId, 'REABIERTO')).toBe(1);
      expect(filas(dueno.comercioId)).toBe(2);
    });

    test('cerrar varias veces a la vez deja una sola fila CERRADO y todas las respuestas son 200', async ({ request }) => {
      const { dueno } = await duenoAbierto(request);

      const respuestas = await Promise.all(Array.from({ length: 8 }, () => cerrar(request, dueno.token, cabecera(dueno.comercioId))));

      expect(respuestas.every((r) => r.status === 200)).toBe(true);
      expect(filas(dueno.comercioId, 'CERRADO')).toBe(1);
      expect(bandera(dueno.comercioId)).toBe(1);
    });

    test('el header de otro Dueño da 404 y no cambia nada; sin header o no numérico da 400; sin token 401', async ({ request }) => {
      const { dueno } = await duenoAbierto(request);
      const ajeno = await prepararAprobado(request, adminToken, localidadId, false);

      for (const operacion of [cerrar, abrir]) {
        const respuesta = await operacion(request, ajeno.token, cabecera(dueno.comercioId));
        expect(respuesta.status).toBe(404);
        expect((await operacion(request, ajeno.token, {})).status).toBe(400);
        expect((await operacion(request, dueno.token, { [HEADER]: 'abc' })).status).toBe(400);
        expect((await operacion(request, dueno.token, { [HEADER]: '' })).status).toBe(400);
        expect((await operacion(request, undefined as unknown as string, cabecera(dueno.comercioId))).status).toBe(401);
      }
      expect(bandera(dueno.comercioId)).toBe(0);
      expect(filas(dueno.comercioId)).toBe(0);
    });

    test('un Cliente recibe 403 en cerrar y abrir', async ({ request }) => {
      const { dueno } = await duenoAbierto(request);
      const clienteToken = await clienteLogueado(request);

      expect((await cerrar(request, clienteToken, cabecera(dueno.comercioId))).status).toBe(403);
      expect((await abrir(request, clienteToken, cabecera(dueno.comercioId))).status).toBe(403);
      expect(bandera(dueno.comercioId)).toBe(0);
    });

    test('fuera de la franja horaria cerrar y abrir dan 409 y el perfil informa que no se puede cambiar', async ({ request }) => {
      const { dueno } = await duenoAbierto(request, [todoElDia(diaDistintoDeHoy())]);

      const cierre = await cerrar(request, dueno.token, cabecera(dueno.comercioId));
      const apertura = await abrir(request, dueno.token, cabecera(dueno.comercioId));

      expect(cierre.status).toBe(409);
      expect(cierre.body.mensaje).toBe(MENSAJE_FUERA_DE_HORARIO);
      expect(apertura.status).toBe(409);
      expect(apertura.body.mensaje).toBe(MENSAJE_FUERA_DE_HORARIO);
      expect(bandera(dueno.comercioId)).toBe(0);
      expect(filas(dueno.comercioId)).toBe(0);

      const perfil = await apiGet(request, '/comercios/perfil', dueno.token);
      expect(perfil.body.data.puedeCambiarCierre).toBe(false);
      expect(perfil.body.data.abiertoAhora).toBe(false);
      expect(perfil.body.data.textoReapertura).toBe('Reabre mañana a las 00:00');

      const publico = await publicoDe(request, dueno.comercioId);
      expect(publico.estadoApertura).toBe('CERRADO_HORARIO');
      expect(publico.textoReapertura).toBe('Reabre mañana a las 00:00');
    });

    test('un comercio que no es APROBADO ni APTO_VENTA da 409 "no está operativo"', async ({ request }) => {
      const pendiente = await registrarPendiente(request, adminToken, localidadId);

      const cierre = await cerrar(request, pendiente.token, cabecera(pendiente.comercioId));
      const apertura = await abrir(request, pendiente.token, cabecera(pendiente.comercioId));

      expect(cierre.status).toBe(409);
      expect(cierre.body.mensaje).toBe(MENSAJE_NO_OPERATIVO);
      expect(apertura.status).toBe(409);
      expect(apertura.body.mensaje).toBe(MENSAJE_NO_OPERATIVO);
      expect(bandera(pendiente.comercioId)).toBe(0);
      expect(filas(pendiente.comercioId)).toBe(0);
    });

    test('un comercio aprobado sin Mercado Pago también puede cerrar y abrir', async ({ request }) => {
      const aprobado = await prepararAprobado(request, adminToken, localidadId, false);
      expect(sql(`SELECT estado FROM comercio WHERE id = ${aprobado.comercioId};`)).toBe('APROBADO');

      expect((await cerrar(request, aprobado.token, cabecera(aprobado.comercioId))).status).toBe(200);
      expect(bandera(aprobado.comercioId)).toBe(1);
      expect((await abrir(request, aprobado.token, cabecera(aprobado.comercioId))).status).toBe(200);
      expect(bandera(aprobado.comercioId)).toBe(0);
    });
  });

  test.describe('Cierre masivo de un Dueño con varios comercios', () => {
    test('con tres comercios (abierto en franja, fuera de su horario, ya cerrado a mano) cada cierre responde lo que corresponde y el estado final es coherente', async ({ request }) => {
      const { dueno } = await duenoAbierto(request);
      const fueraDeFranja = await agregarComercioApto(request, dueno, aTitleCase(`Masivo Fuera ${sufijoUnico().slice(-6)}`), [todoElDia(diaDistintoDeHoy())]);
      const yaCerrado = await agregarComercioApto(request, dueno, aTitleCase(`Masivo Cerrado ${sufijoUnico().slice(-6)}`));
      expect((await cerrar(request, dueno.token, cabecera(yaCerrado))).status).toBe(200);
      expect(filas(yaCerrado, 'CERRADO')).toBe(1);

      const abierto = await cerrar(request, dueno.token, cabecera(dueno.comercioId));
      const sinFranja = await cerrar(request, dueno.token, cabecera(fueraDeFranja));
      const idempotente = await cerrar(request, dueno.token, cabecera(yaCerrado));

      expect(abierto.status).toBe(200);
      expect(abierto.body.data.cerradoManualmente).toBe(true);
      expect(sinFranja.status).toBe(409);
      expect(sinFranja.body.mensaje).toBe(MENSAJE_FUERA_DE_HORARIO);
      expect(idempotente.status).toBe(200);
      expect(idempotente.body.data.cerradoManualmente).toBe(true);

      expect(filas(dueno.comercioId, 'CERRADO')).toBe(1);
      expect(filas(fueraDeFranja)).toBe(0);
      expect(filas(yaCerrado, 'CERRADO')).toBe(1);
      expect(filas(yaCerrado)).toBe(1);

      const listado = await apiConHeaders(request, 'GET', '/comercios/mis-comercios', dueno.token);
      const porId = (id: number) => listado.body.data.find((comercio: any) => comercio.id === id);
      expect(porId(dueno.comercioId)).toMatchObject({ cerradoManualmente: true, abiertoAhora: false, puedeCambiarCierre: true });
      expect(porId(fueraDeFranja)).toMatchObject({ cerradoManualmente: false, abiertoAhora: false, puedeCambiarCierre: false });
      expect(porId(yaCerrado)).toMatchObject({ cerradoManualmente: true, abiertoAhora: false, puedeCambiarCierre: true });
    });
  });

  test.describe('Efecto sobre los pedidos', () => {
    test('el Cliente recibe 409 al agregar al carrito y al confirmar el pedido mientras el comercio está cerrado, y vuelve a poder al abrir', async ({ request }) => {
      const { dueno, productoId } = await duenoAbierto(request);
      const clienteToken = await clienteLogueado(request);
      await agregarItemCarrito(request, clienteToken, productoId, 1);

      expect((await cerrar(request, dueno.token, cabecera(dueno.comercioId))).status).toBe(200);

      const alCarrito = await apiPost(request, '/carrito/items', { productoId, cantidad: 1 }, clienteToken);
      expect(alCarrito.status).toBe(409);
      expect(alCarrito.body.mensaje).toBe(MENSAJE_CERRADO_MANUAL);

      const alPedido = await apiPost(request, '/pedidos/cliente', { tipoEntrega: 'RETIRO', direccionId: null }, clienteToken);
      expect(alPedido.status).toBe(409);
      expect(alPedido.body.mensaje).toBe(MENSAJE_CERRADO_MANUAL);
      expect(Number(sql(`SELECT COUNT(*) FROM pedido WHERE comercio_id = ${dueno.comercioId};`))).toBe(0);

      expect((await abrir(request, dueno.token, cabecera(dueno.comercioId))).status).toBe(200);

      const pedidoId = await crearPedido(request, clienteToken, 'RETIRO');
      expect(estadoPedido(pedidoId)).toBe('PENDIENTE_PAGO');
    });

    test('un pedido en curso sigue su camino al cerrar: el pago llega, el comercio acepta y rechaza, y los productos siguen editables', async ({ request }) => {
      const { dueno, productoId } = await duenoAbierto(request);
      const clienteA = await clienteLogueado(request);
      const clienteB = await clienteLogueado(request);
      const clienteC = await clienteLogueado(request);

      await agregarItemCarrito(request, clienteA, productoId, 1);
      const sinPagar = await crearPedido(request, clienteA, 'RETIRO');
      await agregarItemCarrito(request, clienteB, productoId, 1);
      const pagadoParaAceptar = await crearPedido(request, clienteB, 'RETIRO');
      await confirmarPagoTest(request, pagadoParaAceptar);
      await agregarItemCarrito(request, clienteC, productoId, 1);
      const pagadoParaRechazar = await crearPedido(request, clienteC, 'RETIRO');
      await confirmarPagoTest(request, pagadoParaRechazar);
      expect(estadoPedido(pagadoParaAceptar)).toBe('PENDIENTE_CONFIRMACION_COMERCIO');

      expect((await cerrar(request, dueno.token, cabecera(dueno.comercioId))).status).toBe(200);

      await confirmarPagoTest(request, sinPagar);
      expect(estadoPedido(sinPagar)).toBe('PENDIENTE_CONFIRMACION_COMERCIO');

      const aceptado = await apiConHeaders(request, 'PUT', `/pedidos/comercio/${pagadoParaAceptar}/aceptar`, dueno.token, cabecera(dueno.comercioId));
      expect(aceptado.status).toBe(200);
      expect(estadoPedido(pagadoParaAceptar)).toBe('EN_PREPARACION');

      const rechazado = await apiConHeaders(request, 'PUT', `/pedidos/comercio/${pagadoParaRechazar}/rechazar`, dueno.token, cabecera(dueno.comercioId), { motivo: 'SIN_STOCK' });
      expect(rechazado.status).toBe(200);
      expect(estadoPedido(pagadoParaRechazar)).toBe('RECHAZADO');

      const pedidos = await apiConHeaders(request, 'GET', '/pedidos/comercio', dueno.token, cabecera(dueno.comercioId));
      expect(pedidos.status).toBe(200);
      const productos = await apiConHeaders(request, 'GET', '/productos', dueno.token, cabecera(dueno.comercioId));
      expect(productos.status).toBe(200);
      expect(bandera(dueno.comercioId)).toBe(1);
    });
  });

  test.describe('Reapertura automática (job de test)', () => {
    test('no reabre dentro de la franja del cierre y reabre cuando empieza la próxima, con actor SISTEMA y la hora indicada', async ({ request }) => {
      const { dueno } = await duenoAbierto(request, [todoElDia(diaDeHoy()), todoElDia(diaDistintoDeHoy())]);
      expect((await cerrar(request, dueno.token, cabecera(dueno.comercioId))).status).toBe(200);
      const cierre = momentoDelCierre(dueno.comercioId);
      const mananaALas0 = sql(`SELECT DATE_FORMAT(DATE_ADD(DATE('${cierre.replace('T', ' ')}'), INTERVAL 1 DAY), '%Y-%m-%dT00:00:00');`);

      const mismoDia = await correrJob(request, sumarSegundos(cierre, 5));
      expect(mismoDia.status).toBe(200);
      expect(bandera(dueno.comercioId)).toBe(1);

      const justoAntes = await correrJob(request, sumarSegundos(mananaALas0, -1));
      expect(justoAntes.status).toBe(200);
      expect(bandera(dueno.comercioId)).toBe(1);
      expect(filas(dueno.comercioId, 'REABIERTO')).toBe(0);

      const corrida = sumarSegundos(mananaALas0, 30);
      const reabierto = await correrJob(request, corrida);
      expect(reabierto.status).toBe(200);
      expect(reabierto.body.data).toBeGreaterThanOrEqual(1);
      expect(bandera(dueno.comercioId)).toBe(0);
      expect(
        sql(
          `SELECT CONCAT(accion, '/', actor_rol, '/', IFNULL(actor_usuario_id, 'NULL'), '/', DATE_FORMAT(fecha_hora, '%Y-%m-%dT%H:%i:%s')) ` +
            `FROM historial_cierre_comercio WHERE comercio_id = ${dueno.comercioId} AND accion = 'REABIERTO';`,
        ),
      ).toBe(`REABIERTO/SISTEMA/NULL/${corrida}`);

      const otraVez = await correrJob(request, sumarSegundos(corrida, 60));
      expect(otraVez.status).toBe(200);
      expect(filas(dueno.comercioId, 'REABIERTO')).toBe(1);
    });

    test('se pone al día tras días sin correr y reabre a varios comercios en una sola pasada', async ({ request }) => {
      const uno = await duenoAbierto(request);
      const dos = await duenoAbierto(request);
      expect((await cerrar(request, uno.dueno.token, cabecera(uno.dueno.comercioId))).status).toBe(200);
      expect((await cerrar(request, dos.dueno.token, cabecera(dos.dueno.comercioId))).status).toBe(200);
      const cierre = momentoDelCierre(uno.dueno.comercioId);

      const sinVencer = await correrJob(request, sumarSegundos(cierre, 3 * 24 * 3600));
      expect(sinVencer.status).toBe(200);
      expect(bandera(uno.dueno.comercioId)).toBe(1);
      expect(bandera(dos.dueno.comercioId)).toBe(1);

      const alDia = await correrJob(request, sumarSegundos(cierre, 9 * 24 * 3600));
      expect(alDia.status).toBe(200);
      expect(alDia.body.data).toBeGreaterThanOrEqual(2);
      expect(bandera(uno.dueno.comercioId)).toBe(0);
      expect(bandera(dos.dueno.comercioId)).toBe(0);
      expect(filas(uno.dueno.comercioId, 'REABIERTO')).toBe(1);
      expect(filas(dos.dueno.comercioId, 'REABIERTO')).toBe(1);
    });

    test('con el reloj real el job no toca un comercio recién cerrado', async ({ request }) => {
      const { dueno } = await duenoAbierto(request);
      expect((await cerrar(request, dueno.token, cabecera(dueno.comercioId))).status).toBe(200);

      const corrida = await correrJob(request);

      expect(corrida.status).toBe(200);
      expect(bandera(dueno.comercioId)).toBe(1);
      expect(filas(dueno.comercioId, 'REABIERTO')).toBe(0);
    });
  });
});
