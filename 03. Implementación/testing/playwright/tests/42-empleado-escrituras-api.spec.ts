import { test, expect } from '@playwright/test';
import type { APIRequestContext } from '@playwright/test';
import {
  aceptarInvitacion,
  agregarItemCarrito,
  apiConHeaders,
  apiPut,
  confirmarPagoTest,
  crearCategoria,
  crearPedido,
  crearProducto,
  diaDeHoy,
  diaDistintoDeHoy,
  fijarPasswordAdminYLoguear,
  invitarEmpleado,
  login,
  obtenerCodigoInvitacionTest,
  obtenerLocalidadRioGrande,
  registrarYVerificarCliente,
  sqlTest as sql,
  sufijoUnico,
} from './helpers/backend';
import type { ClienteRegistrado } from './helpers/backend';
import type { Dueno } from './helpers/multicomercio';
import { agregarComercioApto, prepararAprobado, reemplazarHorarios } from './helpers/multicomercio';

type Metodo = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

const HEADER = 'X-Comercio-Id';
const NO_DISPONIBLE = { mensaje: 'Comercio no encontrado', data: { codigo: 'COMERCIO_NO_DISPONIBLE' } };
const CAMPOS_PEDIDO_EXCLUIDOS = ['clienteId', 'pagoEstado', 'cargoServicioCliente', 'cargoServicioComercio'];
const CAMPOS_FISCALES = ['cuit', 'razonSocial', 'condicionIva', 'tipoSociedad', 'domicilioFiscal', 'fechaInicioActividades', 'representante', 'motivoRechazo'];
const todoElDia = () => [{ diaSemana: diaDeHoy(), horaApertura: '00:00', horaCierre: '23:59' }];
const conComercio = (comercioId: number | string): Record<string, string> => ({ [HEADER]: String(comercioId) });
const estadoDe = (comercioId: number, estado: string): string => sql(`UPDATE comercio SET estado = '${estado}' WHERE id = ${comercioId};`);

function escribir(request: APIRequestContext, metodo: Metodo, ruta: string, token: string | undefined, comercioId: number | string, data?: unknown) {
  return apiConHeaders(request, metodo, ruta, token, conComercio(comercioId), data);
}

test.describe('Rol Empleado, E3 bloque A2 (API): escrituras delegadas', () => {
  test.describe.configure({ timeout: 300_000 });

  let adminToken: string;
  let localidadId: string;
  let dueno: Dueno;
  let categoriaId: number;
  let empleado: ClienteRegistrado;
  let empleadoId: number;
  let empleadoToken: string;
  let sinRelacion: ClienteRegistrado;
  let sinRelacionToken: string;
  let comprador: ClienteRegistrado;
  let compradorToken: string;

  async function sumarAlEquipo(request: APIRequestContext, comercioId: number, cuenta: ClienteRegistrado): Promise<void> {
    const invitacion = await invitarEmpleado(request, dueno.token, comercioId, cuenta.email);
    expect(invitacion.status, JSON.stringify(invitacion.body)).toBe(201);
    const codigo = await obtenerCodigoInvitacionTest(request, cuenta.email, comercioId);
    const aceptada = await aceptarInvitacion(request, { email: cuenta.email, codigo });
    expect(aceptada.status, JSON.stringify(aceptada.body)).toBe(200);
  }

  async function comercioDelEquipo(request: APIRequestContext, horarios = todoElDia()): Promise<number> {
    const comercioId = await agregarComercioApto(request, dueno, `Escrituras A2 ${sufijoUnico()}`, horarios);
    await sumarAlEquipo(request, comercioId, empleado);
    return comercioId;
  }

  async function productoDelDueno(request: APIRequestContext, comercioId: number, precio = 2500): Promise<number> {
    const respuesta = await escribir(request, 'POST', '/productos', dueno.token, comercioId, {
      nombre: `Producto A2 ${sufijoUnico()}`,
      precio,
      categoriaId,
    });
    expect(respuesta.status, JSON.stringify(respuesta.body)).toBe(201);
    return respuesta.body.data.id as number;
  }

  async function pedido(request: APIRequestContext, productoId: number, registrarPago = true): Promise<number> {
    await agregarItemCarrito(request, compradorToken, productoId, 1);
    const pedidoId = await crearPedido(request, compradorToken, 'RETIRO');
    await confirmarPagoTest(request, pedidoId, registrarPago);
    return pedidoId;
  }

  const estadoPedido = (pedidoId: number): string => sql(`SELECT estado FROM pedido WHERE id = ${pedidoId};`);
  const ultimoActor = (pedidoId: number): string =>
    sql(`SELECT CONCAT(actor_rol, ':', actor_usuario_id) FROM historial_estado_pedido WHERE pedido_id = ${pedidoId} ORDER BY id DESC LIMIT 1;`);
  const notasDe = (pedidoId: number): number =>
    Number(sql(`SELECT COUNT(*) FROM nota_credito nc JOIN pago p ON p.id = nc.pago_id WHERE p.pedido_id = ${pedidoId};`));

  test.beforeAll(async ({ request }) => {
    adminToken = (await fijarPasswordAdminYLoguear(request)).token;
    localidadId = await obtenerLocalidadRioGrande(request);
    dueno = await prepararAprobado(request, adminToken, localidadId, true, todoElDia());
    categoriaId = await crearCategoria(request, adminToken, `Cat A2 ${sufijoUnico()}`);

    empleado = await registrarYVerificarCliente(request, localidadId);
    await sumarAlEquipo(request, dueno.comercioId, empleado);
    const sesion = await login(request, empleado.nombreUsuario, empleado.password);
    empleadoToken = sesion.token;
    empleadoId = sesion.usuario.id;

    sinRelacion = await registrarYVerificarCliente(request, localidadId);
    sinRelacionToken = (await login(request, sinRelacion.nombreUsuario, sinRelacion.password)).token;

    comprador = await registrarYVerificarCliente(request, localidadId);
    compradorToken = (await login(request, comprador.nombreUsuario, comprador.password)).token;
  });

  test.describe('Productos e imágenes', () => {
    test('el Empleado hace las nueve escrituras del catálogo y todas quedan en el historial con su rol y su usuario', async ({ request }) => {
      const comercioId = await comercioDelEquipo(request);

      const creado = await escribir(request, 'POST', '/productos', empleadoToken, comercioId, { nombre: `Empanada A2 ${sufijoUnico()}`, precio: 1800, categoriaId });
      expect(creado.status, JSON.stringify(creado.body)).toBe(201);
      const productoId = creado.body.data.id as number;
      expect(creado.body.data.comercioId).toBe(comercioId);

      const firma = await escribir(request, 'POST', `/productos/${productoId}/cloudinary/firma`, empleadoToken, comercioId);
      expect(firma.status, JSON.stringify(firma.body)).toBe(200);
      const prefijo = `https://res.cloudinary.com/${firma.body.data.cloudName}/image/upload/productos/${comercioId}/${productoId}`;

      const imagen1 = await escribir(request, 'POST', `/productos/${productoId}/imagenes`, empleadoToken, comercioId, { url: `${prefijo}/a2-${sufijoUnico()}.png`, orden: 0, esPrincipal: true });
      expect(imagen1.status, JSON.stringify(imagen1.body)).toBe(201);
      const imagen2 = await escribir(request, 'POST', `/productos/${productoId}/imagenes`, empleadoToken, comercioId, { url: `${prefijo}/a2-${sufijoUnico()}.png`, orden: 1, esPrincipal: false });
      expect(imagen2.status, JSON.stringify(imagen2.body)).toBe(201);
      const imagenId = imagen2.body.data.id as number;

      const editado = await escribir(request, 'PUT', `/productos/${productoId}`, empleadoToken, comercioId, { nombre: `Empanada A2 editada ${sufijoUnico()}`, precio: 2100, categoriaId });
      expect(editado.status, JSON.stringify(editado.body)).toBe(200);
      expect(Number(editado.body.data.precio)).toBe(2100);

      const orden = await escribir(request, 'PATCH', `/productos/${productoId}/imagenes/${imagenId}/orden`, empleadoToken, comercioId, { orden: 4 });
      expect(orden.status, JSON.stringify(orden.body)).toBe(200);
      const recorte = await escribir(request, 'POST', `/productos/${productoId}/imagenes/${imagenId}/recorte/firma`, empleadoToken, comercioId);
      expect(recorte.status, JSON.stringify(recorte.body)).toBe(200);
      const url = await escribir(request, 'PATCH', `/productos/${productoId}/imagenes/${imagenId}/url`, empleadoToken, comercioId, { url: `${prefijo}/a2-recorte-${sufijoUnico()}.png` });
      expect(url.status, JSON.stringify(url.body)).toBe(200);
      const eliminada = await escribir(request, 'DELETE', `/productos/${productoId}/imagenes/${imagenId}`, empleadoToken, comercioId);
      expect(eliminada.status, JSON.stringify(eliminada.body)).toBe(200);
      const estado = await escribir(request, 'PATCH', `/productos/${productoId}/estado`, empleadoToken, comercioId, { estado: 'AGOTADO' });
      expect(estado.status, JSON.stringify(estado.body)).toBe(200);
      expect(estado.body.data.estado).toBe('AGOTADO');

      const filas = sql(
        `SELECT CONCAT(actor_rol, ':', usuario_id, ':', entidad_tipo, ':', accion) FROM historial_edicion_comercio WHERE comercio_id = ${comercioId} ORDER BY id;`,
      ).split('\n');
      expect(filas.length).toBeGreaterThanOrEqual(7);
      for (const fila of filas) {
        expect(fila.startsWith(`EMPLEADO:${empleadoId}:`), fila).toBe(true);
      }
    });

    test('el Dueño sigue haciendo las mismas escrituras y queda registrado como Dueño', async ({ request }) => {
      const comercioId = await comercioDelEquipo(request);
      const productoId = await productoDelDueno(request, comercioId);
      const estado = await escribir(request, 'PATCH', `/productos/${productoId}/estado`, dueno.token, comercioId, { estado: 'AGOTADO' });
      expect(estado.status).toBe(200);
      const filas = sql(`SELECT DISTINCT CONCAT(actor_rol, ':', usuario_id) FROM historial_edicion_comercio WHERE comercio_id = ${comercioId};`);
      expect(filas).toBe(`DUENO:${dueno.duenoId}`);
    });

    test('un Empleado no toca un producto de otro comercio del mismo Dueño: 404 de producto', async ({ request }) => {
      const comercioA = await comercioDelEquipo(request);
      const comercioB = await agregarComercioApto(request, dueno, `Otro A2 ${sufijoUnico()}`, todoElDia());
      const productoDeB = await productoDelDueno(request, comercioB);
      const respuesta = await escribir(request, 'PATCH', `/productos/${productoDeB}/estado`, empleadoToken, comercioA, { estado: 'AGOTADO' });
      expect(respuesta.status).toBe(404);
      expect(respuesta.body.mensaje).toBe('Producto no encontrado');
    });
  });

  test.describe('Datos operativos del perfil', () => {
    test('el Empleado edita descripción y teléfono, recibe el perfil reducido con el email de contacto y queda registrado', async ({ request }) => {
      const comercioId = await comercioDelEquipo(request);
      const nombreAntes = sql(`SELECT nombre FROM comercio WHERE id = ${comercioId};`);
      const emailAntes = sql(`SELECT email FROM comercio WHERE id = ${comercioId};`);

      const respuesta = await escribir(request, 'PUT', '/comercios/perfil/datos-operativos', empleadoToken, comercioId, { descripcion: 'Descripción A2 nueva', telefono: '+5492964111222' });
      expect(respuesta.status, JSON.stringify(respuesta.body)).toBe(200);
      expect(respuesta.body.data.descripcion).toBe('Descripción A2 nueva');
      expect(respuesta.body.data.telefono).toBe('+5492964111222');
      expect(respuesta.body.data.emailContacto).toBe(emailAntes);
      for (const campo of CAMPOS_FISCALES) {
        expect(Object.keys(respuesta.body.data), campo).not.toContain(campo);
      }
      expect(sql(`SELECT nombre FROM comercio WHERE id = ${comercioId};`)).toBe(nombreAntes);
      expect(sql(`SELECT CONCAT(actor_rol, ':', usuario_id, ':', detalle) FROM historial_edicion_comercio WHERE comercio_id = ${comercioId} ORDER BY id DESC LIMIT 1;`)).toBe(
        `EMPLEADO:${empleadoId}:Editó: descripción, teléfono`,
      );
    });

    test('el perfil que ve el Empleado ahora incluye el email de contacto, solo lectura', async ({ request }) => {
      const comercioId = await comercioDelEquipo(request);
      const perfil = await escribir(request, 'GET', '/comercios/perfil', empleadoToken, comercioId);
      expect(perfil.status).toBe(200);
      expect(perfil.body.data.emailContacto).toBe(sql(`SELECT email FROM comercio WHERE id = ${comercioId};`));
    });

    test('un cuerpo con cualquier campo exclusivo del Dueño da 400 y no cambia nada', async ({ request }) => {
      const comercioId = await comercioDelEquipo(request);
      const antes = sql(`SELECT CONCAT(nombre, '|', IFNULL(descripcion, ''), '|', telefono, '|', email, '|', acepta_delivery, '|', acepta_retiro) FROM comercio WHERE id = ${comercioId};`);
      const intrusos: Array<Record<string, unknown>> = [
        { nombre: 'Hackeado' },
        { emailContacto: 'otro@bajonea.test' },
        { aceptaDelivery: false },
        { aceptaRetiro: false },
        { fotoPerfilUrl: 'https://res.cloudinary.com/demo/image/upload/x.png' },
        { cuit: '20111111112' },
      ];
      for (const intruso of intrusos) {
        const respuesta = await escribir(request, 'PUT', '/comercios/perfil/datos-operativos', empleadoToken, comercioId, { descripcion: 'x', telefono: '+5492964111222', ...intruso });
        expect(respuesta.status, JSON.stringify(intruso)).toBe(400);
      }
      expect(sql(`SELECT CONCAT(nombre, '|', IFNULL(descripcion, ''), '|', telefono, '|', email, '|', acepta_delivery, '|', acepta_retiro) FROM comercio WHERE id = ${comercioId};`)).toBe(antes);
    });

    test('teléfono vacío o inválido y descripción demasiado larga dan 400', async ({ request }) => {
      const comercioId = await comercioDelEquipo(request);
      for (const cuerpo of [
        { descripcion: 'ok', telefono: '' },
        { descripcion: 'ok', telefono: '123' },
        { descripcion: 'ok' },
        { descripcion: 'x'.repeat(2001), telefono: '+5492964111222' },
      ]) {
        const respuesta = await escribir(request, 'PUT', '/comercios/perfil/datos-operativos', empleadoToken, comercioId, cuerpo);
        expect(respuesta.status, JSON.stringify(cuerpo).slice(0, 60)).toBe(400);
      }
    });

    test('el Dueño también puede usar la ruta y recibe su perfil completo; PUT /comercios/perfil sigue siendo exclusivo suyo', async ({ request }) => {
      const comercioId = await comercioDelEquipo(request);
      const delDueno = await escribir(request, 'PUT', '/comercios/perfil/datos-operativos', dueno.token, comercioId, { descripcion: 'Del Dueño', telefono: '+5492964333444' });
      expect(delDueno.status).toBe(200);
      expect(delDueno.body.data.cuit).toBeTruthy();

      const completoEmpleado = await escribir(request, 'PUT', '/comercios/perfil', empleadoToken, comercioId, { nombre: 'X' });
      expect(completoEmpleado.status).toBe(403);
      for (const [metodo, ruta] of [['PUT', '/comercios/perfil/foto'], ['POST', '/comercios/perfil/foto/firma']] as Array<[Metodo, string]>) {
        expect((await escribir(request, metodo, ruta, empleadoToken, comercioId, {})).status, ruta).toBe(403);
      }
    });
  });

  test.describe('Estado del comercio', () => {
    test('con el comercio SUSPENDIDO el Empleado recibe 409 COMERCIO_SUSPENDIDO en productos, imágenes, firmas y datos operativos', async ({ request }) => {
      const comercioId = await comercioDelEquipo(request);
      const productoId = await productoDelDueno(request, comercioId);
      estadoDe(comercioId, 'SUSPENDIDO');
      const intentos: Array<[Metodo, string, unknown?]> = [
        ['POST', '/productos', { nombre: 'Nuevo', precio: 10, categoriaId }],
        ['PUT', `/productos/${productoId}`, { nombre: 'Otro', precio: 10, categoriaId }],
        ['PATCH', `/productos/${productoId}/estado`, { estado: 'AGOTADO' }],
        ['POST', `/productos/${productoId}/cloudinary/firma`],
        ['POST', `/productos/${productoId}/imagenes`, { url: 'https://res.cloudinary.com/demo/image/upload/x.png', orden: 0, esPrincipal: true }],
        ['DELETE', `/productos/${productoId}/imagenes/1`],
        ['PATCH', `/productos/${productoId}/imagenes/1/orden`, { orden: 2 }],
        ['POST', `/productos/${productoId}/imagenes/1/recorte/firma`],
        ['PATCH', `/productos/${productoId}/imagenes/1/url`, { url: 'https://res.cloudinary.com/demo/image/upload/y.png' }],
        ['PUT', '/comercios/perfil/datos-operativos', { descripcion: 'x', telefono: '+5492964111222' }],
      ];
      for (const [metodo, ruta, cuerpo] of intentos) {
        const respuesta = await escribir(request, metodo, ruta, empleadoToken, comercioId, cuerpo);
        expect(respuesta.status, `${metodo} ${ruta}`).toBe(409);
        expect(respuesta.body.data, `${metodo} ${ruta}`).toEqual({ codigo: 'COMERCIO_SUSPENDIDO' });
        expect(respuesta.body.mensaje).toBe('El comercio está suspendido: por ahora no se puede modificar.');
      }
      expect(sql(`SELECT estado FROM producto WHERE id = ${productoId};`)).toBe('DISPONIBLE');
    });

    test('con el comercio CERRADO_TEMPORALMENTE el Empleado puede editar productos y datos operativos', async ({ request }) => {
      const comercioId = await comercioDelEquipo(request);
      const productoId = await productoDelDueno(request, comercioId);
      estadoDe(comercioId, 'CERRADO_TEMPORALMENTE');
      const estado = await escribir(request, 'PATCH', `/productos/${productoId}/estado`, empleadoToken, comercioId, { estado: 'AGOTADO' });
      expect(estado.status, JSON.stringify(estado.body)).toBe(200);
      const perfil = await escribir(request, 'PUT', '/comercios/perfil/datos-operativos', empleadoToken, comercioId, { descripcion: 'Con cierre temporal', telefono: '+5492964111222' });
      expect(perfil.status, JSON.stringify(perfil.body)).toBe(200);
      expect(perfil.body.data.estado).toBe('CERRADO_TEMPORALMENTE');
    });

    test('el Dueño sigue pudiendo editar con el comercio SUSPENDIDO (hueco conocido, pendiente del rediseño de la suspensión)', async ({ request }) => {
      const comercioId = await comercioDelEquipo(request);
      estadoDe(comercioId, 'SUSPENDIDO');
      const respuesta = await escribir(request, 'PUT', '/comercios/perfil/datos-operativos', dueno.token, comercioId, { descripcion: 'Dueño suspendido', telefono: '+5492964111222' });
      expect(respuesta.status).toBe(200);
    });
  });

  test.describe('Pedidos', () => {
    test('el Empleado acepta, despacha y entrega; las respuestas son el DTO reducido y el historial guarda al Empleado', async ({ request }) => {
      const comercioId = await comercioDelEquipo(request);
      const productoId = await productoDelDueno(request, comercioId);
      const pedidoId = await pedido(request, productoId);

      const aceptado = await escribir(request, 'PUT', `/pedidos/comercio/${pedidoId}/aceptar`, empleadoToken, comercioId);
      expect(aceptado.status, JSON.stringify(aceptado.body)).toBe(200);
      expect(aceptado.body.data.estado).toBe('EN_PREPARACION');
      for (const campo of CAMPOS_PEDIDO_EXCLUIDOS) {
        expect(Object.keys(aceptado.body.data), campo).not.toContain(campo);
      }
      expect(ultimoActor(pedidoId)).toBe(`EMPLEADO:${empleadoId}`);

      const despachado = await escribir(request, 'PUT', `/pedidos/comercio/${pedidoId}/despachar`, empleadoToken, comercioId);
      expect(despachado.status, JSON.stringify(despachado.body)).toBe(200);
      expect(despachado.body.data.estado).toBe('LISTO_PARA_RETIRAR');
      expect(Object.keys(despachado.body.data)).not.toContain('pagoEstado');

      const entregado = await escribir(request, 'PUT', `/pedidos/comercio/${pedidoId}/entregar`, empleadoToken, comercioId);
      expect(entregado.status, JSON.stringify(entregado.body)).toBe(200);
      expect(entregado.body.data.estado).toBe('ENTREGADO');
      expect(Object.keys(entregado.body.data)).not.toContain('cargoServicioCliente');
      expect(ultimoActor(pedidoId)).toBe(`EMPLEADO:${empleadoId}`);
    });

    test('el Empleado rechaza y anula con reembolso; las respuestas son reducidas y el reembolso viene en términos simples', async ({ request }) => {
      const comercioId = await comercioDelEquipo(request);
      const productoId = await productoDelDueno(request, comercioId);
      const aRechazar = await pedido(request, productoId);
      const aAnular = await pedido(request, productoId);

      const rechazado = await escribir(request, 'PUT', `/pedidos/comercio/${aRechazar}/rechazar`, empleadoToken, comercioId, { motivo: 'SIN_STOCK' });
      expect(rechazado.status, JSON.stringify(rechazado.body)).toBe(200);
      expect(rechazado.body.data.estado).toBe('RECHAZADO');
      expect(['EN_PROCESO', 'REEMBOLSADO', 'EN_REVISION']).toContain(rechazado.body.data.reembolsoEstado);
      for (const campo of CAMPOS_PEDIDO_EXCLUIDOS) {
        expect(Object.keys(rechazado.body.data), campo).not.toContain(campo);
      }
      expect(ultimoActor(aRechazar)).toBe(`EMPLEADO:${empleadoId}`);
      expect(notasDe(aRechazar)).toBe(1);

      await escribir(request, 'PUT', `/pedidos/comercio/${aAnular}/aceptar`, empleadoToken, comercioId);
      const anulado = await escribir(request, 'PUT', `/pedidos/comercio/${aAnular}/anular`, empleadoToken, comercioId, { motivo: 'OTRO', comentario: 'Se rompió el horno' });
      expect(anulado.status, JSON.stringify(anulado.body)).toBe(200);
      expect(anulado.body.data.estado).toBe('ANULADO');
      expect(anulado.body.data.motivoAnulacion).toContain('Se rompió el horno');
      expect(Object.keys(anulado.body.data)).not.toContain('pagoEstado');
      expect(ultimoActor(aAnular)).toBe(`EMPLEADO:${empleadoId}`);
      expect(notasDe(aAnular)).toBe(1);
    });

    test('el Dueño recibe el DTO completo y queda como Dueño en el historial', async ({ request }) => {
      const comercioId = await comercioDelEquipo(request);
      const productoId = await productoDelDueno(request, comercioId);
      const pedidoId = await pedido(request, productoId);
      const aceptado = await escribir(request, 'PUT', `/pedidos/comercio/${pedidoId}/aceptar`, dueno.token, comercioId);
      expect(aceptado.status).toBe(200);
      for (const campo of CAMPOS_PEDIDO_EXCLUIDOS) {
        expect(Object.keys(aceptado.body.data), campo).toContain(campo);
      }
      expect(ultimoActor(pedidoId)).toBe(`DUENO:${dueno.duenoId}`);
    });

    for (const estadoComercio of ['SUSPENDIDO', 'CERRADO_TEMPORALMENTE']) {
      test(`con el comercio ${estadoComercio}: aceptar da 409 COMERCIO_SIN_OPERACION; rechazar, despachar, entregar y anular se permiten; con el pedido en camino no hay acción`, async ({ request }) => {
        const comercioId = await comercioDelEquipo(request);
        const productoId = await productoDelDueno(request, comercioId);
        const pendiente = await pedido(request, productoId);
        const aDespachar = await pedido(request, productoId);
        const aAnular = await pedido(request, productoId);
        const enCamino = await pedido(request, productoId);
        for (const id of [aDespachar, aAnular, enCamino]) {
          expect((await escribir(request, 'PUT', `/pedidos/comercio/${id}/aceptar`, dueno.token, comercioId)).status).toBe(200);
        }
        sql(`UPDATE pedido SET estado = 'EN_CAMINO' WHERE id = ${enCamino};`);
        estadoDe(comercioId, estadoComercio);

        const aceptar = await escribir(request, 'PUT', `/pedidos/comercio/${pendiente}/aceptar`, empleadoToken, comercioId);
        expect(aceptar.status, JSON.stringify(aceptar.body)).toBe(409);
        expect(aceptar.body.data).toEqual({ codigo: 'COMERCIO_SIN_OPERACION' });
        expect(aceptar.body.mensaje).toBe('El comercio no está operativo: no podés aceptar pedidos nuevos. Sí podés rechazarlos.');
        expect(estadoPedido(pendiente)).toBe('PENDIENTE_CONFIRMACION_COMERCIO');

        const rechazar = await escribir(request, 'PUT', `/pedidos/comercio/${pendiente}/rechazar`, empleadoToken, comercioId, { motivo: 'SIN_STOCK' });
        expect(rechazar.status, JSON.stringify(rechazar.body)).toBe(200);
        expect(notasDe(pendiente)).toBe(1);

        const despachar = await escribir(request, 'PUT', `/pedidos/comercio/${aDespachar}/despachar`, empleadoToken, comercioId);
        expect(despachar.status, JSON.stringify(despachar.body)).toBe(200);
        const entregar = await escribir(request, 'PUT', `/pedidos/comercio/${aDespachar}/entregar`, empleadoToken, comercioId);
        expect(entregar.status, JSON.stringify(entregar.body)).toBe(200);
        const anular = await escribir(request, 'PUT', `/pedidos/comercio/${aAnular}/anular`, empleadoToken, comercioId, { motivo: 'SIN_STOCK' });
        expect(anular.status, JSON.stringify(anular.body)).toBe(200);

        for (const [metodo, ruta, cuerpo] of [
          ['PUT', `/pedidos/comercio/${enCamino}/despachar`],
          ['PUT', `/pedidos/comercio/${enCamino}/entregar`],
          ['PUT', `/pedidos/comercio/${enCamino}/anular`, { motivo: 'SIN_STOCK' }],
          ['PUT', `/pedidos/comercio/${enCamino}/aceptar`],
        ] as Array<[Metodo, string, unknown?]>) {
          const respuesta = await escribir(request, metodo, ruta, empleadoToken, comercioId, cuerpo);
          expect(respuesta.status, ruta).toBe(409);
        }
        expect(estadoPedido(enCamino)).toBe('EN_CAMINO');
      });
    }

    test('con cierre manual (comercio operativo con la bandera encendida) el Empleado sí acepta pedidos pendientes', async ({ request }) => {
      const comercioId = await comercioDelEquipo(request);
      const productoId = await productoDelDueno(request, comercioId);
      const pedidoId = await pedido(request, productoId);
      const cerrar = await escribir(request, 'PUT', '/comercios/cerrar', empleadoToken, comercioId);
      expect(cerrar.status, JSON.stringify(cerrar.body)).toBe(200);
      expect(cerrar.body.data.cerradoManualmente).toBe(true);

      const aceptar = await escribir(request, 'PUT', `/pedidos/comercio/${pedidoId}/aceptar`, empleadoToken, comercioId);
      expect(aceptar.status, JSON.stringify(aceptar.body)).toBe(200);
    });

    test('con el comercio APROBADO, sin cuenta de cobro, el Empleado acepta', async ({ request }) => {
      const comercioId = await comercioDelEquipo(request);
      const productoId = await productoDelDueno(request, comercioId);
      const pedidoId = await pedido(request, productoId);
      estadoDe(comercioId, 'APROBADO');
      const aceptar = await escribir(request, 'PUT', `/pedidos/comercio/${pedidoId}/aceptar`, empleadoToken, comercioId);
      expect(aceptar.status, JSON.stringify(aceptar.body)).toBe(200);
    });

    test('un pedido de otro comercio del mismo Dueño es 404 de pedido, nunca se opera', async ({ request }) => {
      const comercioA = await comercioDelEquipo(request);
      const comercioB = await agregarComercioApto(request, dueno, `Otro pedido A2 ${sufijoUnico()}`, todoElDia());
      const productoDeB = await productoDelDueno(request, comercioB);
      const pedidoDeB = await pedido(request, productoDeB);
      const respuesta = await escribir(request, 'PUT', `/pedidos/comercio/${pedidoDeB}/aceptar`, empleadoToken, comercioA);
      expect(respuesta.status).toBe(404);
      expect(respuesta.body.mensaje).toBe('Pedido no encontrado');
      expect(estadoPedido(pedidoDeB)).toBe('PENDIENTE_CONFIRMACION_COMERCIO');
    });
  });

  test.describe('Cerrar y abrir', () => {
    test('el Empleado cierra y abre, y el historial de cierres guarda su rol y su usuario', async ({ request }) => {
      const comercioId = await comercioDelEquipo(request);
      const cerrar = await escribir(request, 'PUT', '/comercios/cerrar', empleadoToken, comercioId);
      expect(cerrar.status, JSON.stringify(cerrar.body)).toBe(200);
      expect(cerrar.body.data.cerradoManualmente).toBe(true);
      const abrir = await escribir(request, 'PUT', '/comercios/abrir', empleadoToken, comercioId);
      expect(abrir.status, JSON.stringify(abrir.body)).toBe(200);
      expect(abrir.body.data.cerradoManualmente).toBe(false);
      expect(sql(`SELECT GROUP_CONCAT(CONCAT(accion, ':', actor_rol, ':', actor_usuario_id) ORDER BY id SEPARATOR ',') FROM historial_cierre_comercio WHERE comercio_id = ${comercioId};`)).toBe(
        `CERRADO:EMPLEADO:${empleadoId},REABIERTO:EMPLEADO:${empleadoId}`,
      );
    });

    test('el Empleado puede abrir un cierre manual que hizo el Dueño; abrir un comercio ya abierto es idempotente', async ({ request }) => {
      const comercioId = await comercioDelEquipo(request);
      expect((await escribir(request, 'PUT', '/comercios/cerrar', dueno.token, comercioId)).status).toBe(200);
      const abrir = await escribir(request, 'PUT', '/comercios/abrir', empleadoToken, comercioId);
      expect(abrir.status, JSON.stringify(abrir.body)).toBe(200);
      expect(abrir.body.data.cerradoManualmente).toBe(false);
      const otraVez = await escribir(request, 'PUT', '/comercios/abrir', empleadoToken, comercioId);
      expect(otraVez.status).toBe(200);
      expect(sql(`SELECT COUNT(*) FROM historial_cierre_comercio WHERE comercio_id = ${comercioId};`)).toBe('2');
    });

    for (const estadoComercio of ['SUSPENDIDO', 'CERRADO_TEMPORALMENTE']) {
      test(`con el comercio ${estadoComercio}, cerrar y abrir dan 409 COMERCIO_NO_OPERATIVO, para el Empleado y para el Dueño`, async ({ request }) => {
        const comercioId = await comercioDelEquipo(request);
        estadoDe(comercioId, estadoComercio);
        for (const token of [empleadoToken, dueno.token]) {
          for (const ruta of ['/comercios/cerrar', '/comercios/abrir']) {
            const respuesta = await escribir(request, 'PUT', ruta, token, comercioId);
            expect(respuesta.status, `${ruta} ${estadoComercio}`).toBe(409);
            expect(respuesta.body.data).toEqual({ codigo: 'COMERCIO_NO_OPERATIVO' });
            expect(respuesta.body.mensaje).toBe('Este comercio no está operativo');
          }
        }
      });
    }

    test('fuera de la franja horaria cerrar y abrir dan 409 FUERA_DE_HORARIO', async ({ request }) => {
      const comercioId = await comercioDelEquipo(request);
      reemplazarHorarios(comercioId, [{ diaSemana: diaDistintoDeHoy(), horaApertura: '09:00', horaCierre: '10:00' }]);
      for (const token of [empleadoToken, dueno.token]) {
        for (const ruta of ['/comercios/cerrar', '/comercios/abrir']) {
          const respuesta = await escribir(request, 'PUT', ruta, token, comercioId);
          expect(respuesta.status, ruta).toBe(409);
          expect(respuesta.body.data).toEqual({ codigo: 'FUERA_DE_HORARIO' });
          expect(respuesta.body.mensaje).toBe('Solo podés abrir o cerrar dentro de tu horario');
        }
      }
    });
  });

  test.describe('Relación inactiva y acceso', () => {
    const rutas = (productoId: number, pedidoId: number): Array<[Metodo, string, unknown?]> => [
      ['POST', '/productos', { nombre: 'X', precio: 1, categoriaId }],
      ['PUT', `/productos/${productoId}`, { nombre: 'X', precio: 1, categoriaId }],
      ['PATCH', `/productos/${productoId}/estado`, { estado: 'AGOTADO' }],
      ['POST', `/productos/${productoId}/cloudinary/firma`],
      ['POST', `/productos/${productoId}/imagenes`, { url: 'https://res.cloudinary.com/demo/image/upload/x.png', orden: 0, esPrincipal: true }],
      ['DELETE', `/productos/${productoId}/imagenes/1`],
      ['PATCH', `/productos/${productoId}/imagenes/1/orden`, { orden: 1 }],
      ['POST', `/productos/${productoId}/imagenes/1/recorte/firma`],
      ['PATCH', `/productos/${productoId}/imagenes/1/url`, { url: 'https://res.cloudinary.com/demo/image/upload/x.png' }],
      ['PUT', '/comercios/perfil/datos-operativos', { descripcion: 'x', telefono: '+5492964111222' }],
      ['PUT', '/comercios/cerrar'],
      ['PUT', '/comercios/abrir'],
      ['PUT', `/pedidos/comercio/${pedidoId}/aceptar`],
      ['PUT', `/pedidos/comercio/${pedidoId}/rechazar`, { motivo: 'SIN_STOCK' }],
      ['PUT', `/pedidos/comercio/${pedidoId}/despachar`],
      ['PUT', `/pedidos/comercio/${pedidoId}/entregar`],
      ['PUT', `/pedidos/comercio/${pedidoId}/anular`, { motivo: 'SIN_STOCK' }],
    ];

    test('con la relación INACTIVA las diecisiete escrituras dan el mismo 404, aun con un cuerpo inválido, y reactivarla las devuelve', async ({ request }) => {
      const comercioId = await comercioDelEquipo(request);
      const productoId = await productoDelDueno(request, comercioId);
      const pedidoId = await pedido(request, productoId);
      const lista = rutas(productoId, pedidoId);
      expect(lista.length).toBe(17);

      expect((await apiPut(request, `/test/comercios/${comercioId}/empleados/${empleadoId}/estado?estado=INACTIVO`, {})).status).toBe(200);
      for (const [metodo, ruta, cuerpo] of lista) {
        const respuesta = await escribir(request, metodo, ruta, empleadoToken, comercioId, cuerpo);
        expect(respuesta.status, `${metodo} ${ruta}`).toBe(404);
        expect({ mensaje: respuesta.body.mensaje, data: respuesta.body.data }, `${metodo} ${ruta}`).toEqual(NO_DISPONIBLE);
      }
      const invalido = await escribir(request, 'PUT', '/comercios/perfil/datos-operativos', empleadoToken, comercioId, { telefono: '' });
      expect(invalido.status, 'el resolver corre antes de validar el cuerpo').toBe(404);
      expect(estadoPedido(pedidoId)).toBe('PENDIENTE_CONFIRMACION_COMERCIO');

      expect((await apiPut(request, `/test/comercios/${comercioId}/empleados/${empleadoId}/estado?estado=ACTIVO`, {})).status).toBe(200);
      const reactivado = await escribir(request, 'PUT', '/comercios/perfil/datos-operativos', empleadoToken, comercioId, { descripcion: 'Reactivado', telefono: '+5492964111222' });
      expect(reactivado.status, JSON.stringify(reactivado.body)).toBe(200);
    });

    test('un Cliente sin relación recibe 404 con header y 400 sin header en las diecisiete; el Administrador recibe 403', async ({ request }) => {
      const comercioId = await comercioDelEquipo(request);
      const productoId = await productoDelDueno(request, comercioId);
      const pedidoId = await pedido(request, productoId);
      for (const [metodo, ruta, cuerpo] of rutas(productoId, pedidoId)) {
        const conHeader = await escribir(request, metodo, ruta, sinRelacionToken, comercioId, cuerpo);
        expect(conHeader.status, `${metodo} ${ruta}`).toBe(404);
        expect(conHeader.body.data).toEqual(NO_DISPONIBLE.data);
        const sinHeader = await apiConHeaders(request, metodo, ruta, sinRelacionToken, {}, cuerpo);
        expect(sinHeader.status, `${metodo} ${ruta} sin header`).toBe(400);
        const admin = await escribir(request, metodo, ruta, adminToken, comercioId, cuerpo);
        expect(admin.status, `${metodo} ${ruta} admin`).toBe(403);
      }
      expect(estadoPedido(pedidoId)).toBe('PENDIENTE_CONFIRMACION_COMERCIO');
    });

    test('un Empleado activo de un comercio no opera el comercio de otro Dueño con el header ajeno: 404 idéntico', async ({ request }) => {
      const ajeno = await prepararAprobado(request, adminToken, localidadId, true, todoElDia());
      const respuesta = await escribir(request, 'PUT', '/comercios/cerrar', empleadoToken, ajeno.comercioId);
      expect(respuesta.status).toBe(404);
      expect({ mensaje: respuesta.body.mensaje, data: respuesta.body.data }).toEqual(NO_DISPONIBLE);
    });

    test('el 403 de Actividad para el Empleado y el 404 para un Dueño ajeno se mantienen distintos', async ({ request }) => {
      const comercioId = await comercioDelEquipo(request);
      const ajeno = await prepararAprobado(request, adminToken, localidadId, true, todoElDia());
      const delEmpleado = await escribir(request, 'GET', '/comercios/equipo/actividad', empleadoToken, comercioId);
      expect(delEmpleado.status).toBe(403);
      const delAjeno = await escribir(request, 'GET', '/comercios/equipo/actividad', ajeno.token, comercioId);
      expect(delAjeno.status).toBe(404);
    });
  });

  test.describe('Notificaciones con el header', () => {
    test('un Cliente que manda X-Comercio-Id sin ser Empleado activo de ese comercio recibe 404; con un valor no numérico, 400; sin header ve las suyas', async ({ request }) => {
      const comercioId = await comercioDelEquipo(request);
      for (const ruta of ['/notificaciones', '/notificaciones/no-leidas/contador']) {
        const ajeno = await apiConHeaders(request, 'GET', ruta, sinRelacionToken, conComercio(comercioId));
        expect(ajeno.status, ruta).toBe(404);
        expect(ajeno.body.data).toEqual(NO_DISPONIBLE.data);
        expect((await apiConHeaders(request, 'GET', ruta, sinRelacionToken, conComercio('abc'))).status, ruta).toBe(400);
        expect((await apiConHeaders(request, 'GET', ruta, sinRelacionToken, conComercio(99999999))).status, ruta).toBe(404);
        expect((await apiConHeaders(request, 'GET', ruta, sinRelacionToken, {})).status, ruta).toBe(200);
        expect((await apiConHeaders(request, 'GET', ruta, sinRelacionToken, { [HEADER]: '' })).status, ruta).toBe(200);
      }
    });

    test('el Empleado activo con el header de su comercio recibe 200 y, al perder la relación, el mismo 404', async ({ request }) => {
      const comercioId = await comercioDelEquipo(request);
      for (const ruta of ['/notificaciones', '/notificaciones/no-leidas/contador']) {
        expect((await apiConHeaders(request, 'GET', ruta, empleadoToken, conComercio(comercioId))).status, ruta).toBe(200);
      }
      await apiPut(request, `/test/comercios/${comercioId}/empleados/${empleadoId}/estado?estado=INACTIVO`, {});
      for (const ruta of ['/notificaciones', '/notificaciones/no-leidas/contador']) {
        const respuesta = await apiConHeaders(request, 'GET', ruta, empleadoToken, conComercio(comercioId));
        expect(respuesta.status, ruta).toBe(404);
        expect(respuesta.body.data).toEqual(NO_DISPONIBLE.data);
      }
      expect((await apiConHeaders(request, 'GET', '/notificaciones', empleadoToken, {})).status).toBe(200);
    });

    test('el Administrador sigue ignorando el header por completo', async ({ request }) => {
      for (const ruta of ['/notificaciones', '/notificaciones/no-leidas/contador']) {
        for (const valor of ['abc', '99999999']) {
          expect((await apiConHeaders(request, 'GET', ruta, adminToken, { [HEADER]: valor })).status, `${ruta} ${valor}`).toBe(200);
        }
      }
    });
  });
});
