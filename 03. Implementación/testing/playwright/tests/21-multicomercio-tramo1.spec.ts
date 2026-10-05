import { test, expect } from '@playwright/test';
import type { APIRequestContext } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import {
  apiConHeaders,
  agregarItemCarrito,
  buscarComercioPendientePorEmail,
  clonarComercioTest,
  confirmarPagoTest,
  crearCategoria,
  crearPedido,
  crearProducto,
  diaDeHoy,
  fijarPasswordAdminYLoguear,
  login,
  marcarAptoVenta,
  obtenerCodigoTest,
  obtenerLocalidadRioGrande,
  registrarYVerificarCliente,
  registrarYVerificarComercio,
  resolverComercio,
  sufijoUnico,
  vincularMercadoPagoSimuladoTest,
  apiPost,
} from './helpers/backend';

const MYSQL_EXE = 'C:/xampp/mysql/bin/mysql.exe';
const HEADER = 'X-Comercio-Id';

function sql(consulta: string): string {
  return execFileSync(MYSQL_EXE, ['-u', 'root', '--default-character-set=utf8mb4', '-N', '-B', 'bajonea_test', '-e', consulta]).toString().trim();
}

function estadosDelDueno(duenoId: number): string[] {
  return sql(`SELECT estado FROM comercio WHERE dueno_id = ${duenoId} ORDER BY id;`).split(/\r?\n/);
}

const MOTIVO_BLOQUEO = 'Bloqueo de cuenta por intentos fallidos';
const MOTIVO_RESTAURACION_RECUPERACION = 'Restauración por recuperación de contraseña';
const MOTIVO_RESTAURACION_REACTIVACION = 'Restauración por reactivación de cuenta';
const MOTIVO_MP = 'Vinculación automática de cuenta de Mercado Pago';

function historialDe(comercioId: number): string[] {
  const filas = sql(
    `SELECT CONCAT(estado_origen, '>', estado_destino, '|', IFNULL(administrador_id, 'sin-admin'), '|', IFNULL(motivo, '')) ` +
      `FROM historial_estado_comercio WHERE comercio_id = ${comercioId} ORDER BY id;`,
  );
  return filas ? filas.split(/\r?\n/) : [];
}

function fijarEstados(comercioIds: number[], estados: string[]) {
  comercioIds.forEach((id, indice) => {
    sql(`UPDATE comercio SET estado = '${estados[indice]}' WHERE id = ${id};`);
  });
}

interface DuenoPreparado {
  sesion: { token: string; usuario: { id: number; rol: string } };
  email: string;
  nombreUsuario: string;
  password: string;
  comercioIds: number[];
  nombres: string[];
}

async function prepararDueno(
  request: APIRequestContext,
  localidadId: string,
  adminToken: string,
  cantidadComercios: number,
  aptoVenta: boolean,
): Promise<DuenoPreparado> {
  const nombreBase = `Multi E2E ${sufijoUnico()}`;
  const comercio = await registrarYVerificarComercio(request, localidadId, {
    nombre: nombreBase,
    horarios: [{ diaSemana: diaDeHoy(), horaApertura: '00:00', horaCierre: '23:59' }],
    aceptaDelivery: false,
    aceptaRetiro: true,
  });
  const pendiente = await buscarComercioPendientePorEmail(request, adminToken, comercio.email);
  await resolverComercio(request, adminToken, pendiente.id, true);
  if (aptoVenta) {
    await marcarAptoVenta(request, pendiente.id);
  }
  const comercioIds = [pendiente.id];
  const nombres = [comercio.nombre];
  for (let i = 1; i < cantidadComercios; i += 1) {
    const nombreClon = `Multi E2E Clon ${sufijoUnico()}`;
    const id = await clonarComercioTest(request, pendiente.id, nombreClon, aptoVenta ? 'APTO_VENTA' : 'APROBADO');
    comercioIds.push(id);
    nombres.push(nombreClon.replace(/\b\w/g, (c) => c.toUpperCase()));
  }
  const sesion = await login(request, comercio.nombreUsuario, comercio.password);
  return { sesion, email: comercio.email, nombreUsuario: comercio.nombreUsuario, password: comercio.password, comercioIds, nombres };
}

test.describe('Multi-comercio, tramo 1: resolución del comercio activo y aislamiento por comercio', () => {
  let adminToken: string;
  let localidadId: string;
  let categoriaId: number;
  let dueno: DuenoPreparado;
  let duenoUnico: DuenoPreparado;
  let comercioA: number;
  let comercioB: number;
  let comercioAjeno: number;
  let productoA: number;
  let productoB: number;
  let redSocialA: number;
  let pedidoB: number;

  test.beforeAll(async ({ request }) => {
    localidadId = await obtenerLocalidadRioGrande(request);
    const admin = await fijarPasswordAdminYLoguear(request);
    adminToken = admin.token;
    categoriaId = await crearCategoria(request, adminToken, `Categoría Multi E2E ${sufijoUnico()}`);

    dueno = await prepararDueno(request, localidadId, adminToken, 2, true);
    [comercioA, comercioB] = dueno.comercioIds;
    duenoUnico = await prepararDueno(request, localidadId, adminToken, 1, true);
    comercioAjeno = duenoUnico.comercioIds[0];
  });

  test('un Dueño con un solo comercio recibe 400 sin header en todos los endpoints de operación y opera con su header', async ({ request }) => {
    const token = duenoUnico.sesion.token;

    for (const [metodo, ruta] of [
      ['GET', '/comercios/perfil'],
      ['GET', '/productos'],
      ['GET', '/comercios/redes-sociales'],
      ['GET', '/pedidos/comercio'],
      ['GET', '/pedidos/comercio/resumen-hoy'],
    ] as const) {
      const respuesta = await apiConHeaders(request, metodo, ruta, token);
      expect(respuesta.status, `${metodo} ${ruta}`).toBe(400);
      expect(respuesta.body.mensaje, `${metodo} ${ruta}`).toContain(HEADER);
    }
    const crearSinHeader = await apiConHeaders(request, 'POST', '/productos', token, {}, { nombre: 'Sin Header', precio: 1500, categoriaId });
    expect(crearSinHeader.status).toBe(400);

    const propio = { [HEADER]: String(comercioAjeno) };
    const perfilConHeader = await apiConHeaders(request, 'GET', '/comercios/perfil', token, propio);
    expect(perfilConHeader.status).toBe(200);
    expect(perfilConHeader.body.data.id).toBe(comercioAjeno);

    const productoId = await crearProducto(request, token, { nombre: `Producto Unico ${sufijoUnico()}`, precio: 1500, categoriaId });
    const productos = await apiConHeaders(request, 'GET', '/productos', token, propio);
    expect(productos.status).toBe(200);
    expect(productos.body.data.map((p: any) => p.id)).toContain(productoId);

    const redes = await apiConHeaders(request, 'GET', '/comercios/redes-sociales', token, propio);
    expect(redes.status).toBe(200);
    expect(redes.body.data.length).toBeGreaterThan(0);

    const pedidos = await apiConHeaders(request, 'GET', '/pedidos/comercio', token, propio);
    expect(pedidos.status).toBe(200);
    expect(Array.isArray(pedidos.body.data)).toBe(true);

    const resumen = await apiConHeaders(request, 'GET', '/pedidos/comercio/resumen-hoy', token, propio);
    expect(resumen.status).toBe(200);
    expect(resumen.body.data.cantidadPedidosHoy).toBe(0);

    const editar = await apiConHeaders(request, 'PUT', '/comercios/perfil', token, propio, {
      nombre: 'Comercio Unico Editado',
      descripcion: 'Descripción de prueba',
      telefono: '+5492964123456',
      emailContacto: 'unico.editado@bajonea.test',
      aceptaDelivery: false,
      aceptaRetiro: true,
    });
    expect(editar.status).toBe(200);
    expect(editar.body.data.nombre).toBe('Comercio Unico Editado');
  });

  test('un Dueño con dos comercios recibe 400 sin header, vacío o en blanco: no elige ninguno por su cuenta', async ({ request }) => {
    for (const cabeceras of [{}, { [HEADER]: '' }, { [HEADER]: '   ' }]) {
      const perfil = await apiConHeaders(request, 'GET', '/comercios/perfil', dueno.sesion.token, cabeceras);
      expect(perfil.status, JSON.stringify(cabeceras)).toBe(400);
      expect(perfil.body.mensaje).toContain(HEADER);
    }
  });

  test('con header propio cada comercio del mismo Dueño opera sobre el suyo', async ({ request }) => {
    const token = dueno.sesion.token;
    const enA = await apiConHeaders(request, 'GET', '/comercios/perfil', token, { [HEADER]: String(comercioA) });
    const enB = await apiConHeaders(request, 'GET', '/comercios/perfil', token, { [HEADER]: String(comercioB) });
    expect(enA.status).toBe(200);
    expect(enB.status).toBe(200);
    expect(enA.body.data.id).toBe(comercioA);
    expect(enB.body.data.id).toBe(comercioB);
    expect(enA.body.data.nombre).not.toBe(enB.body.data.nombre);
    expect(enB.body.data.nombre).toBe(dueno.nombres[1]);
  });

  test('un header con un comercio de otro Dueño o inexistente da el mismo 404, sin revelar cuál de los dos casos es', async ({ request }) => {
    const token = dueno.sesion.token;
    const ajeno = await apiConHeaders(request, 'GET', '/comercios/perfil', token, { [HEADER]: String(comercioAjeno) });
    const inexistente = await apiConHeaders(request, 'GET', '/comercios/perfil', token, { [HEADER]: '99999999' });
    expect(ajeno.status).toBe(404);
    expect(inexistente.status).toBe(404);
    expect(JSON.stringify(ajeno.body)).toBe(JSON.stringify(inexistente.body));

    for (const [metodo, ruta] of [
      ['GET', '/productos'],
      ['GET', '/comercios/redes-sociales'],
      ['GET', '/pedidos/comercio'],
      ['GET', '/pedidos/comercio/resumen-hoy'],
    ] as const) {
      const respuesta = await apiConHeaders(request, metodo, ruta, token, { [HEADER]: String(comercioAjeno) });
      expect(respuesta.status, `${metodo} ${ruta}`).toBe(404);
    }
  });

  test('un header no numérico da 400 y nombra al header', async ({ request }) => {
    const token = dueno.sesion.token;
    for (const valor of ['abc', '12.5', '1e3', '99999999999999999999']) {
      const respuesta = await apiConHeaders(request, 'GET', '/comercios/perfil', token, { [HEADER]: valor });
      expect(respuesta.status, `valor ${valor}`).toBe(400);
      expect(respuesta.body.mensaje).toContain(HEADER);
    }
  });

  test('aislamiento entre comercios del mismo Dueño: productos', async ({ request }) => {
    const token = dueno.sesion.token;
    const creadoA = await apiConHeaders(request, 'POST', '/productos', token, { [HEADER]: String(comercioA) }, {
      nombre: `Producto A ${sufijoUnico()}`,
      precio: 2500,
      categoriaId,
    });
    const creadoB = await apiConHeaders(request, 'POST', '/productos', token, { [HEADER]: String(comercioB) }, {
      nombre: `Producto B ${sufijoUnico()}`,
      precio: 3500,
      categoriaId,
    });
    expect(creadoA.status).toBe(201);
    expect(creadoB.status).toBe(201);
    productoA = creadoA.body.data.id;
    productoB = creadoB.body.data.id;

    const listaA = await apiConHeaders(request, 'GET', '/productos', token, { [HEADER]: String(comercioA) });
    const listaB = await apiConHeaders(request, 'GET', '/productos', token, { [HEADER]: String(comercioB) });
    const idsA = listaA.body.data.map((p: any) => p.id);
    const idsB = listaB.body.data.map((p: any) => p.id);
    expect(idsA).toContain(productoA);
    expect(idsA).not.toContain(productoB);
    expect(idsB).toContain(productoB);
    expect(idsB).not.toContain(productoA);

    const editarCruzado = await apiConHeaders(request, 'PUT', `/productos/${productoA}`, token, { [HEADER]: String(comercioB) }, {
      nombre: 'Intento Cruzado',
      precio: 100,
      categoriaId,
    });
    expect(editarCruzado.status).toBe(404);

    const estadoCruzado = await apiConHeaders(request, 'PATCH', `/productos/${productoA}/estado`, token, { [HEADER]: String(comercioB) }, {
      estado: 'AGOTADO',
    });
    expect(estadoCruzado.status).toBe(404);

    const firmaCruzada = await apiConHeaders(request, 'POST', `/productos/${productoA}/cloudinary/firma`, token, { [HEADER]: String(comercioB) });
    expect(firmaCruzada.status).toBe(404);

    const imagenCruzada = await apiConHeaders(request, 'DELETE', `/productos/${productoA}/imagenes/1`, token, { [HEADER]: String(comercioB) });
    expect(imagenCruzada.status).toBe(404);

    const estadoPropio = await apiConHeaders(request, 'PATCH', `/productos/${productoA}/estado`, token, { [HEADER]: String(comercioA) }, {
      estado: 'AGOTADO',
    });
    expect(estadoPropio.status).toBe(200);
    expect(estadoPropio.body.data.estado).toBe('AGOTADO');
  });

  test('aislamiento entre comercios del mismo Dueño: redes sociales y perfil', async ({ request }) => {
    const token = dueno.sesion.token;
    const listaA = await apiConHeaders(request, 'GET', '/comercios/redes-sociales', token, { [HEADER]: String(comercioA) });
    const listaB = await apiConHeaders(request, 'GET', '/comercios/redes-sociales', token, { [HEADER]: String(comercioB) });
    expect(listaA.status).toBe(200);
    expect(listaA.body.data.length).toBeGreaterThan(0);
    redSocialA = listaA.body.data[0].id;
    expect(listaB.body.data.map((r: any) => r.id)).not.toContain(redSocialA);

    const editarCruzada = await apiConHeaders(request, 'PUT', `/comercios/redes-sociales/${redSocialA}`, token, { [HEADER]: String(comercioB) }, {
      tipo: 'INSTAGRAM',
      url: 'https://instagram.com/intento.cruzado',
    });
    expect(editarCruzada.status).toBe(404);

    const bajaCruzada = await apiConHeaders(request, 'DELETE', `/comercios/redes-sociales/${redSocialA}`, token, { [HEADER]: String(comercioB) });
    expect(bajaCruzada.status).toBe(404);

    const agregarB = await apiConHeaders(request, 'POST', '/comercios/redes-sociales', token, { [HEADER]: String(comercioB) }, {
      tipo: 'FACEBOOK',
      url: 'https://facebook.com/comercio.b',
    });
    expect(agregarB.status).toBe(201);

    const listaAFinal = await apiConHeaders(request, 'GET', '/comercios/redes-sociales', token, { [HEADER]: String(comercioA) });
    expect(listaAFinal.body.data.map((r: any) => r.tipo)).not.toContain('FACEBOOK');

    const nombreAntesA = (await apiConHeaders(request, 'GET', '/comercios/perfil', token, { [HEADER]: String(comercioA) })).body.data.nombre;
    const editarPerfilB = await apiConHeaders(request, 'PUT', '/comercios/perfil', token, { [HEADER]: String(comercioB) }, {
      nombre: 'Comercio B Editado',
      descripcion: 'Solo cambia B',
      telefono: '+5492964654321',
      emailContacto: 'b.editado@bajonea.test',
      aceptaDelivery: false,
      aceptaRetiro: true,
    });
    expect(editarPerfilB.status).toBe(200);
    expect(editarPerfilB.body.data.id).toBe(comercioB);
    const perfilA = await apiConHeaders(request, 'GET', '/comercios/perfil', token, { [HEADER]: String(comercioA) });
    expect(perfilA.body.data.nombre).toBe(nombreAntesA);
    expect(perfilA.body.data.descripcion).not.toBe('Solo cambia B');
  });

  test('aislamiento entre comercios del mismo Dueño: pedidos', async ({ request }) => {
    const token = dueno.sesion.token;
    const cliente = await registrarYVerificarCliente(request, localidadId);
    const clienteSesion = await login(request, cliente.nombreUsuario, cliente.password);
    await agregarItemCarrito(request, clienteSesion.token, productoB, 1);
    pedidoB = await crearPedido(request, clienteSesion.token, 'RETIRO');
    await confirmarPagoTest(request, pedidoB);

    const listaB = await apiConHeaders(request, 'GET', '/pedidos/comercio', token, { [HEADER]: String(comercioB) });
    const listaA = await apiConHeaders(request, 'GET', '/pedidos/comercio', token, { [HEADER]: String(comercioA) });
    expect(listaB.body.data.map((p: any) => p.id)).toContain(pedidoB);
    expect(listaA.body.data.map((p: any) => p.id)).not.toContain(pedidoB);

    const resumenB = await apiConHeaders(request, 'GET', '/pedidos/comercio/resumen-hoy', token, { [HEADER]: String(comercioB) });
    const resumenA = await apiConHeaders(request, 'GET', '/pedidos/comercio/resumen-hoy', token, { [HEADER]: String(comercioA) });
    expect(resumenB.body.data.cantidadPedidosHoy).toBe(1);
    expect(resumenA.body.data.cantidadPedidosHoy).toBe(0);

    const pagoCruzado = await apiConHeaders(request, 'GET', `/pedidos/comercio/${pedidoB}/pago`, token, { [HEADER]: String(comercioA) });
    expect(pagoCruzado.status).toBe(404);

    for (const accion of ['aceptar', 'despachar', 'entregar']) {
      const cruzada = await apiConHeaders(request, 'PUT', `/pedidos/comercio/${pedidoB}/${accion}`, token, { [HEADER]: String(comercioA) });
      expect(cruzada.status, accion).toBe(404);
    }
    const rechazoCruzado = await apiConHeaders(request, 'PUT', `/pedidos/comercio/${pedidoB}/rechazar`, token, { [HEADER]: String(comercioA) }, {
      motivo: 'SIN_STOCK',
    });
    expect(rechazoCruzado.status).toBe(404);
    const anulacionCruzada = await apiConHeaders(request, 'PUT', `/pedidos/comercio/${pedidoB}/anular`, token, { [HEADER]: String(comercioA) }, {
      motivo: 'Intento cruzado',
    });
    expect(anulacionCruzada.status).toBe(404);

    const aceptar = await apiConHeaders(request, 'PUT', `/pedidos/comercio/${pedidoB}/aceptar`, token, { [HEADER]: String(comercioB) });
    expect(aceptar.status).toBe(200);
    expect(aceptar.body.data.estado).toBe('EN_PREPARACION');
    const historial = sql(`SELECT actor_usuario_id FROM historial_estado_pedido WHERE pedido_id = ${pedidoB} AND estado = 'EN_PREPARACION';`);
    expect(Number(historial)).toBe(dueno.sesion.usuario.id);
  });

  test('los endpoints exentos ignoran el header aunque sea inválido o de otro Dueño; las notificaciones del Dueño sí lo validan', async ({ request }) => {
    const token = dueno.sesion.token;
    for (const [valor, esperado] of [['abc', 400], [String(comercioAjeno), 404], ['99999999', 404]] as const) {
      const notificaciones = await apiConHeaders(request, 'GET', '/notificaciones', token, { [HEADER]: valor });
      expect(notificaciones.status, `notificaciones ${valor}`).toBe(esperado);
      const contador = await apiConHeaders(request, 'GET', '/notificaciones/no-leidas/contador', token, { [HEADER]: valor });
      expect(contador.status, `contador ${valor}`).toBe(esperado);
      const cuenta = await apiConHeaders(request, 'GET', '/oauth/mercadopago/cuenta', token, { [HEADER]: valor });
      expect(cuenta.status, `cuenta MP ${valor}`).toBe(200);
    }
    const logout = await apiConHeaders(request, 'POST', '/auth/logout', token, { [HEADER]: 'abc' });
    expect(logout.status).toBe(200);
    const relogin = await login(request, dueno.nombreUsuario, dueno.password);
    dueno.sesion = relogin;
  });

  test('sin header responde 400 sea cual sea la combinación de estados de los comercios del Dueño', async ({ request }) => {
    const v = await prepararDueno(request, localidadId, adminToken, 2, false);
    const [v1, v2] = v.comercioIds;
    const combinaciones: Array<[string, string]> = [
      ['PENDIENTE', 'APROBADO'],
      ['PENDIENTE', 'RECHAZADO'],
      ['SUSPENDIDO', 'PENDIENTE'],
      ['SUSPENDIDO', 'CERRADO_TEMPORALMENTE'],
      ['APROBADO', 'APTO_VENTA'],
      ['RECHAZADO', 'APTO_VENTA'],
    ];
    for (const estados of combinaciones) {
      fijarEstados([v1, v2], estados);
      const sinHeader = await apiConHeaders(request, 'GET', '/comercios/perfil', v.sesion.token);
      expect(sinHeader.status, estados.join('/')).toBe(400);
      for (const id of [v1, v2]) {
        const conHeader = await apiConHeaders(request, 'GET', '/comercios/perfil', v.sesion.token, { [HEADER]: String(id) });
        expect(conHeader.status, `${estados.join('/')} comercio ${id}`).toBe(200);
        expect(conHeader.body.data.id).toBe(id);
      }
    }
  });

  test('bloqueo y restauración de cuenta con dos comercios: sin 500, sin perder el contador, sin tocar los APROBADO sin cobro y respetando la cuenta de Mercado Pago', async ({ request }) => {
    const w = await prepararDueno(request, localidadId, adminToken, 2, false);
    const duenoId = w.sesion.usuario.id;
    const [primero, clon] = w.comercioIds;
    expect(estadosDelDueno(duenoId)).toEqual(['APROBADO', 'APROBADO']);
    const historialPrimeroInicial = historialDe(primero);
    expect(historialPrimeroInicial).toHaveLength(1);
    expect(historialPrimeroInicial[0]).toMatch(/^PENDIENTE>APROBADO\|\d+\|$/);
    expect(historialDe(clon)).toEqual([]);

    for (let intento = 1; intento <= 3; intento += 1) {
      const fallido = await apiPost(request, '/auth/login', { nombreUsuario: w.nombreUsuario, password: 'ClaveIncorrecta1' });
      expect(fallido.status, `intento ${intento}`).toBe(401);
    }
    expect(sql(`SELECT estado FROM usuario WHERE id = ${duenoId};`)).toBe('BLOQUEADO');
    expect(sql(`SELECT intentos_fallidos FROM usuario WHERE id = ${duenoId};`)).toBe('3');
    expect(estadosDelDueno(duenoId)).toEqual(['APROBADO', 'APROBADO']);
    expect(historialDe(primero)).toEqual(historialPrimeroInicial);
    expect(historialDe(clon)).toEqual([]);

    const bloqueado = await apiPost(request, '/auth/login', { nombreUsuario: w.nombreUsuario, password: w.password });
    expect(bloqueado.status).toBe(409);

    const recuperar = async (nuevaPassword: string) => {
      await apiPost(request, '/auth/recuperar-password', { email: w.email });
      const codigo = await obtenerCodigoTest(request, w.email, 'RECUPERACION_PASSWORD');
      const confirmar = await apiPost(request, '/auth/recuperar-password/confirmar', { email: w.email, codigo, nuevaPassword });
      expect(confirmar.status).toBe(200);
    };

    await recuperar('Testing456');
    expect(sql(`SELECT estado FROM usuario WHERE id = ${duenoId};`)).toBe('ACTIVO');
    expect(estadosDelDueno(duenoId)).toEqual(['APROBADO', 'APROBADO']);
    expect(historialDe(primero)).toEqual(historialPrimeroInicial);
    expect(historialDe(clon)).toEqual([]);

    await vincularMercadoPagoSimuladoTest(request, duenoId);
    expect(estadosDelDueno(duenoId)).toEqual(['APTO_VENTA', 'APTO_VENTA']);

    for (let intento = 1; intento <= 3; intento += 1) {
      const fallido = await apiPost(request, '/auth/login', { nombreUsuario: w.nombreUsuario, password: 'ClaveIncorrecta1' });
      expect(fallido.status, `segundo bloqueo, intento ${intento}`).toBe(401);
    }
    expect(estadosDelDueno(duenoId)).toEqual(['CERRADO_TEMPORALMENTE', 'CERRADO_TEMPORALMENTE']);
    expect(historialDe(clon)).toEqual([
      `APROBADO>APTO_VENTA|sin-admin|${MOTIVO_MP}`,
      `APTO_VENTA>CERRADO_TEMPORALMENTE|sin-admin|${MOTIVO_BLOQUEO}`,
    ]);
    expect(historialDe(primero).slice(historialPrimeroInicial.length)).toEqual(historialDe(clon));

    await recuperar('Testing789');
    expect(estadosDelDueno(duenoId)).toEqual(['APTO_VENTA', 'APTO_VENTA']);
    expect(historialDe(clon)).toEqual([
      `APROBADO>APTO_VENTA|sin-admin|${MOTIVO_MP}`,
      `APTO_VENTA>CERRADO_TEMPORALMENTE|sin-admin|${MOTIVO_BLOQUEO}`,
      `CERRADO_TEMPORALMENTE>APTO_VENTA|sin-admin|${MOTIVO_RESTAURACION_RECUPERACION}`,
    ]);
    expect(historialDe(primero).slice(historialPrimeroInicial.length)).toEqual(historialDe(clon));
  });

  test('reactivación de cuenta con dos comercios inactivos: los restaura y deja el historial con su motivo', async ({ request }) => {
    const w = await prepararDueno(request, localidadId, adminToken, 2, false);
    const duenoId = w.sesion.usuario.id;
    const [primero, clon] = w.comercioIds;
    sql(`UPDATE usuario SET estado = 'INACTIVO' WHERE id = ${duenoId};`);
    sql(`UPDATE comercio SET estado = 'INACTIVO' WHERE dueno_id = ${duenoId};`);

    const solicitud = await apiPost(request, '/auth/reactivar-cuenta', { email: w.email });
    expect(solicitud.status).toBe(200);
    const codigo = await obtenerCodigoTest(request, w.email, 'REACTIVACION_CUENTA');
    const confirmar = await apiPost(request, '/auth/reactivar-cuenta/confirmar', { email: w.email, codigo });
    expect(confirmar.status).toBe(200);

    expect(sql(`SELECT estado FROM usuario WHERE id = ${duenoId};`)).toBe('ACTIVO');
    expect(estadosDelDueno(duenoId)).toEqual(['APROBADO', 'APROBADO']);
    expect(historialDe(clon)).toEqual([`INACTIVO>APROBADO|sin-admin|${MOTIVO_RESTAURACION_REACTIVACION}`]);
    expect(historialDe(primero).slice(1)).toEqual([`INACTIVO>APROBADO|sin-admin|${MOTIVO_RESTAURACION_REACTIVACION}`]);
  });

  test('vincular y desvincular Mercado Pago con dos comercios cambia a ambos sin error', async ({ request }) => {
    const w = await prepararDueno(request, localidadId, adminToken, 2, false);
    const duenoId = w.sesion.usuario.id;
    expect(estadosDelDueno(duenoId)).toEqual(['APROBADO', 'APROBADO']);

    await vincularMercadoPagoSimuladoTest(request, duenoId);
    expect(estadosDelDueno(duenoId)).toEqual(['APTO_VENTA', 'APTO_VENTA']);

    await vincularMercadoPagoSimuladoTest(request, duenoId);
    expect(estadosDelDueno(duenoId)).toEqual(['APTO_VENTA', 'APTO_VENTA']);

    const desvincular = await apiConHeaders(request, 'DELETE', '/oauth/mercadopago/desvincular', w.sesion.token);
    expect(desvincular.status).toBe(200);
    expect(estadosDelDueno(duenoId)).toEqual(['APROBADO', 'APROBADO']);

    const cuenta = await apiConHeaders(request, 'GET', '/oauth/mercadopago/cuenta', w.sesion.token);
    expect(cuenta.status).toBe(200);
    expect(cuenta.body.data.vinculada).toBe(false);
  });
});
