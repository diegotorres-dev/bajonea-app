import { test, expect } from './helpers/prueba';
import type { APIRequestContext } from '@playwright/test';
import {
  agregarItemCarrito,
  apiConHeaders,
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
import type { ClienteRegistrado } from './helpers/backend';
import { atajoEstadoRelacion, sumarAlEquipo } from './helpers/empleado';
import type { Dueno } from './helpers/multicomercio';
import { agregarComercioApto, prepararAprobado } from './helpers/multicomercio';

type Metodo = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
type Ruta = { metodo: Metodo; ruta: string; cuerpo?: unknown };

const HEADER = 'X-Comercio-Id';
const NO_DISPONIBLE = { mensaje: 'Comercio no encontrado', data: { codigo: 'COMERCIO_NO_DISPONIBLE' } };
const URL_IMAGEN = 'https://res.cloudinary.com/demo/image/upload/v1/matriz.png';
const todoElDia = () => [{ diaSemana: diaDeHoy(), horaApertura: '00:00', horaCierre: '23:59' }];
const conComercio = (comercioId: number | string): Record<string, string> => ({ [HEADER]: String(comercioId) });

test.describe('Rol Empleado, E3 bloque A5 (API): matriz de las 24 rutas delegables', () => {
  test.describe.configure({ timeout: 300_000 });

  let adminToken: string;
  let dueno: Dueno;
  let comercioA: number;
  let comercioB: number;
  let categoriaId: number;
  let productoA: number;
  let productoB: number;
  let imagenB: number;
  let pedidoB: number;
  let empleado: ClienteRegistrado;
  let empleadoId: number;
  let empleadoToken: string;
  let sinRelacionToken: string;
  let compradorToken: string;

  const nombreProducto = (id: number): string => sql(`SELECT nombre FROM producto WHERE id = ${id};`);
  const imagenesDe = (id: number): number => Number(sql(`SELECT COUNT(*) FROM imagen_producto WHERE producto_id = ${id};`));
  const estadoPedido = (id: number): string => sql(`SELECT estado FROM pedido WHERE id = ${id};`);
  const filasHistorialPedido = (id: number): number => Number(sql(`SELECT COUNT(*) FROM historial_estado_pedido WHERE pedido_id = ${id};`));

  function las24(productoId: number, imagenId: number, pedidoId: number): Ruta[] {
    return [
      { metodo: 'GET', ruta: '/comercios/perfil' },
      { metodo: 'GET', ruta: '/productos' },
      { metodo: 'GET', ruta: '/pedidos/comercio' },
      { metodo: 'GET', ruta: '/pedidos/comercio/resumen-hoy' },
      { metodo: 'GET', ruta: `/pedidos/comercio/${pedidoId}/trazabilidad` },
      { metodo: 'POST', ruta: '/productos', cuerpo: { nombre: 'Matriz', precio: 1, categoriaId } },
      { metodo: 'PUT', ruta: `/productos/${productoId}`, cuerpo: { nombre: 'Matriz', precio: 1, categoriaId } },
      { metodo: 'PATCH', ruta: `/productos/${productoId}/estado`, cuerpo: { estado: 'AGOTADO' } },
      { metodo: 'POST', ruta: `/productos/${productoId}/cloudinary/firma` },
      { metodo: 'POST', ruta: `/productos/${productoId}/imagenes`, cuerpo: { url: URL_IMAGEN, orden: 1, esPrincipal: false } },
      { metodo: 'DELETE', ruta: `/productos/${productoId}/imagenes/${imagenId}` },
      { metodo: 'PATCH', ruta: `/productos/${productoId}/imagenes/${imagenId}/orden`, cuerpo: { orden: 2 } },
      { metodo: 'POST', ruta: `/productos/${productoId}/imagenes/${imagenId}/recorte/firma` },
      { metodo: 'PATCH', ruta: `/productos/${productoId}/imagenes/${imagenId}/url`, cuerpo: { url: URL_IMAGEN } },
      { metodo: 'PUT', ruta: '/comercios/perfil/datos-operativos', cuerpo: { descripcion: 'Matriz', telefono: '+5492964111222' } },
      { metodo: 'PUT', ruta: '/comercios/perfil/horarios', cuerpo: { horarios: [{ diaSemana: 'LUNES', horaApertura: '09:00', horaCierre: '18:00' }] } },
      { metodo: 'PUT', ruta: '/comercios/cerrar' },
      { metodo: 'PUT', ruta: '/comercios/abrir' },
      { metodo: 'PUT', ruta: `/pedidos/comercio/${pedidoId}/aceptar` },
      { metodo: 'PUT', ruta: `/pedidos/comercio/${pedidoId}/rechazar`, cuerpo: { motivo: 'SIN_STOCK' } },
      { metodo: 'PUT', ruta: `/pedidos/comercio/${pedidoId}/despachar` },
      { metodo: 'PUT', ruta: `/pedidos/comercio/${pedidoId}/entregar` },
      { metodo: 'PUT', ruta: `/pedidos/comercio/${pedidoId}/no-retirado` },
      { metodo: 'PUT', ruta: `/pedidos/comercio/${pedidoId}/anular`, cuerpo: { motivo: 'SIN_STOCK' } },
    ];
  }

  const llamar = (request: APIRequestContext, r: Ruta, token: string | undefined, comercioId?: number) =>
    apiConHeaders(request, r.metodo, r.ruta, token, comercioId === undefined ? {} : conComercio(comercioId), r.cuerpo);

  test.beforeAll(async ({ request }) => {
    adminToken = (await fijarPasswordAdminYLoguear(request)).token;
    const localidadId = await obtenerLocalidadRioGrande(request);
    dueno = await prepararAprobado(request, adminToken, localidadId, true, todoElDia());
    comercioA = dueno.comercioId;
    comercioB = await agregarComercioApto(request, dueno, `Matriz B ${sufijoUnico()}`, todoElDia());
    categoriaId = await crearCategoria(request, adminToken, `Cat Matriz ${sufijoUnico()}`);

    const crear = async (comercioId: number) => {
      const respuesta = await apiConHeaders(request, 'POST', '/productos', dueno.token, conComercio(comercioId), {
        nombre: `Producto matriz ${sufijoUnico()}`,
        precio: 2500,
        categoriaId,
      });
      expect(respuesta.status, JSON.stringify(respuesta.body)).toBe(201);
      return respuesta.body.data.id as number;
    };
    productoA = await crear(comercioA);
    productoB = await crear(comercioB);
    sql(`INSERT INTO imagen_producto (producto_id, url, orden, es_principal) VALUES (${productoB}, '${URL_IMAGEN}', 0, 1);`);
    imagenB = Number(sql(`SELECT id FROM imagen_producto WHERE producto_id = ${productoB} LIMIT 1;`));

    const comprador = await registrarYVerificarCliente(request, localidadId);
    compradorToken = (await login(request, comprador.nombreUsuario, comprador.password)).token;
    await agregarItemCarrito(request, compradorToken, productoB, 1);
    pedidoB = await crearPedido(request, compradorToken, 'RETIRO');
    await confirmarPagoTest(request, pedidoB, true);

    empleado = await registrarYVerificarCliente(request, localidadId);
    await sumarAlEquipo(request, comercioA, empleado, dueno.token);
    const sesion = await login(request, empleado.nombreUsuario, empleado.password);
    empleadoToken = sesion.token;
    empleadoId = sesion.usuario.id;

    const sinRelacion = await registrarYVerificarCliente(request, localidadId);
    sinRelacionToken = (await login(request, sinRelacion.nombreUsuario, sinRelacion.password)).token;
  });

  const DEL_OTRO_COMERCIO = (): Array<Ruta & { mensaje: string }> => [
    { metodo: 'PUT', ruta: `/productos/${productoB}`, cuerpo: { nombre: 'Cambiado', precio: 1, categoriaId }, mensaje: 'Producto no encontrado' },
    { metodo: 'PATCH', ruta: `/productos/${productoB}/estado`, cuerpo: { estado: 'AGOTADO' }, mensaje: 'Producto no encontrado' },
    { metodo: 'POST', ruta: `/productos/${productoB}/cloudinary/firma`, mensaje: 'Producto no encontrado' },
    { metodo: 'POST', ruta: `/productos/${productoB}/imagenes`, cuerpo: { url: URL_IMAGEN, orden: 1, esPrincipal: false }, mensaje: 'Producto no encontrado' },
    { metodo: 'DELETE', ruta: `/productos/${productoB}/imagenes/${imagenB}`, mensaje: 'Producto no encontrado' },
    { metodo: 'PATCH', ruta: `/productos/${productoB}/imagenes/${imagenB}/orden`, cuerpo: { orden: 2 }, mensaje: 'Producto no encontrado' },
    { metodo: 'POST', ruta: `/productos/${productoB}/imagenes/${imagenB}/recorte/firma`, mensaje: 'Producto no encontrado' },
    { metodo: 'PATCH', ruta: `/productos/${productoB}/imagenes/${imagenB}/url`, cuerpo: { url: URL_IMAGEN }, mensaje: 'Producto no encontrado' },
    { metodo: 'DELETE', ruta: `/productos/${productoA}/imagenes/${imagenB}`, mensaje: 'Imagen no encontrada' },
    { metodo: 'PATCH', ruta: `/productos/${productoA}/imagenes/${imagenB}/orden`, cuerpo: { orden: 2 }, mensaje: 'Imagen no encontrada' },
    { metodo: 'POST', ruta: `/productos/${productoA}/imagenes/${imagenB}/recorte/firma`, mensaje: 'Imagen no encontrada' },
    { metodo: 'PATCH', ruta: `/productos/${productoA}/imagenes/${imagenB}/url`, cuerpo: { url: URL_IMAGEN }, mensaje: 'Imagen no encontrada' },
    { metodo: 'GET', ruta: `/pedidos/comercio/${pedidoB}/trazabilidad`, mensaje: 'Pedido no encontrado' },
    { metodo: 'PUT', ruta: `/pedidos/comercio/${pedidoB}/aceptar`, mensaje: 'Pedido no encontrado' },
    { metodo: 'PUT', ruta: `/pedidos/comercio/${pedidoB}/rechazar`, cuerpo: { motivo: 'SIN_STOCK' }, mensaje: 'Pedido no encontrado' },
    { metodo: 'PUT', ruta: `/pedidos/comercio/${pedidoB}/despachar`, mensaje: 'Pedido no encontrado' },
    { metodo: 'PUT', ruta: `/pedidos/comercio/${pedidoB}/entregar`, mensaje: 'Pedido no encontrado' },
    { metodo: 'PUT', ruta: `/pedidos/comercio/${pedidoB}/no-retirado`, mensaje: 'Pedido no encontrado' },
    { metodo: 'PUT', ruta: `/pedidos/comercio/${pedidoB}/anular`, cuerpo: { motivo: 'SIN_STOCK' }, mensaje: 'Pedido no encontrado' },
  ];

  async function verificarPertenencia(request: APIRequestContext, token: string, etiqueta: string) {
    const nombreAntes = nombreProducto(productoB);
    const historialAntes = filasHistorialPedido(pedidoB);
    for (const r of DEL_OTRO_COMERCIO()) {
      const respuesta = await llamar(request, r, token, comercioA);
      expect(respuesta.status, `${etiqueta} ${r.metodo} ${r.ruta}: ${JSON.stringify(respuesta.body)}`).toBe(404);
      expect(respuesta.body.mensaje, `${etiqueta} ${r.metodo} ${r.ruta}`).toBe(r.mensaje);
    }
    expect(nombreProducto(productoB)).toBe(nombreAntes);
    expect(imagenesDe(productoB)).toBe(1);
    expect(estadoPedido(pedidoB)).toBe('PENDIENTE_CONFIRMACION_COMERCIO');
    expect(filasHistorialPedido(pedidoB)).toBe(historialAntes);
  }

  test('un Empleado activo de un comercio no toca productos, imágenes ni pedidos de otro comercio: 404 con el mensaje del recurso y nada cambia', async ({ request }) => {
    await verificarPertenencia(request, empleadoToken, 'Empleado');
  });

  test('el Dueño con el header de uno de sus comercios tampoco cruza al otro: mismo 404 y nada cambia', async ({ request }) => {
    await verificarPertenencia(request, dueno.token, 'Dueño');
  });

  test('sin token las 24 rutas dan 401, con y sin header de comercio', async ({ request }) => {
    const lista = las24(productoA, 1, pedidoB);
    expect(lista.length).toBe(24);
    for (const r of lista) {
      const sinHeader = await llamar(request, r, undefined);
      expect(sinHeader.status, `${r.metodo} ${r.ruta} sin header`).toBe(401);
      const conHeader = await llamar(request, r, undefined, comercioA);
      expect(conHeader.status, `${r.metodo} ${r.ruta} con header`).toBe(401);
    }
  });

  test('el Administrador recibe 403 en las 24 rutas y no cambia nada', async ({ request }) => {
    const historialAntes = filasHistorialPedido(pedidoB);
    for (const r of las24(productoB, imagenB, pedidoB)) {
      const respuesta = await llamar(request, r, adminToken, comercioB);
      expect(respuesta.status, `${r.metodo} ${r.ruta}`).toBe(403);
    }
    expect(estadoPedido(pedidoB)).toBe('PENDIENTE_CONFIRMACION_COMERCIO');
    expect(filasHistorialPedido(pedidoB)).toBe(historialAntes);
    expect(imagenesDe(productoB)).toBe(1);
  });

  test('un Cliente sin relación recibe 404 con header y 400 sin header en las 24 rutas', async ({ request }) => {
    for (const r of las24(productoA, 1, pedidoB)) {
      const conHeader = await llamar(request, r, sinRelacionToken, comercioA);
      expect(conHeader.status, `${r.metodo} ${r.ruta} con header`).toBe(404);
      expect({ mensaje: conHeader.body.mensaje, data: conHeader.body.data }, `${r.metodo} ${r.ruta}`).toEqual(NO_DISPONIBLE);
      const sinHeader = await llamar(request, r, sinRelacionToken);
      expect(sinHeader.status, `${r.metodo} ${r.ruta} sin header`).toBe(400);
    }
  });

  test('con la relación INACTIVA las 24 rutas dan el mismo 404, aun con cuerpo inválido, y al reactivarla vuelve el acceso', async ({ request }) => {
    expect((await atajoEstadoRelacion(request, comercioA, empleadoId, 'INACTIVO')).status).toBe(200);
    try {
      for (const r of las24(productoA, 1, pedidoB)) {
        const respuesta = await llamar(request, r, empleadoToken, comercioA);
        expect(respuesta.status, `${r.metodo} ${r.ruta}`).toBe(404);
        expect({ mensaje: respuesta.body.mensaje, data: respuesta.body.data }, `${r.metodo} ${r.ruta}`).toEqual(NO_DISPONIBLE);
      }
      const invalido = await apiConHeaders(request, 'PUT', '/comercios/perfil/datos-operativos', empleadoToken, conComercio(comercioA), { telefono: '' });
      expect(invalido.status, 'el resolver corre antes de validar el cuerpo').toBe(404);
      expect(estadoPedido(pedidoB)).toBe('PENDIENTE_CONFIRMACION_COMERCIO');
    } finally {
      expect((await atajoEstadoRelacion(request, comercioA, empleadoId, 'ACTIVO')).status).toBe(200);
    }
    const lectura = await llamar(request, { metodo: 'GET', ruta: '/comercios/perfil' }, empleadoToken, comercioA);
    expect(lectura.status).toBe(200);
  });
});
