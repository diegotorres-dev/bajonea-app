import { test, expect } from '@playwright/test';
import type { APIRequestContext } from '@playwright/test';
import {
  apiConHeaders,
  apiGet,
  apiPost,
  clonarComercioTest,
  crearCategoria,
  crearProducto,
  diaDeHoy,
  fijarPasswordAdminYLoguear,
  login,
  obtenerCodigoTest,
  obtenerLocalidadRioGrande,
  registrarYVerificarCliente,
  sqlTest as sql,
  sufijoUnico,
} from './helpers/backend';
import type { Dueno } from './helpers/multicomercio';
import { prepararAprobado } from './helpers/multicomercio';

const MENSAJE_CERRADO = 'Este comercio está cerrado en este momento';
const MOTIVO_BLOQUEO = 'Bloqueo de cuenta por intentos fallidos';
const MOTIVO_RESTAURACION = 'Restauración por recuperación de contraseña';
const HEADER = 'X-Comercio-Id';

const todoElDia = (diaSemana: string) => ({ diaSemana, horaApertura: '00:00', horaCierre: '23:59' });

const estadoDe = (comercioId: number): string => sql(`SELECT estado FROM comercio WHERE id = ${comercioId};`);
const bandera = (comercioId: number): number => Number(sql(`SELECT cerrado_manualmente FROM comercio WHERE id = ${comercioId};`));
const historialDe = (comercioId: number): string[] => {
  const salida = sql(
    `SELECT CONCAT(estado_origen, '>', estado_destino, '|', IF(administrador_id IS NULL, 'sin-admin', 'con-admin'), '|', COALESCE(motivo, '')) ` +
      `FROM historial_estado_comercio WHERE comercio_id = ${comercioId} ORDER BY id;`,
  );
  return salida === '' ? [] : salida.split(/\r?\n/);
};
const delBloqueo = (filas: string[]): string[] => filas.filter((fila) => fila.includes('CERRADO_TEMPORALMENTE'));

async function bloquear(request: APIRequestContext, dueno: Dueno) {
  for (let intento = 1; intento <= 3; intento += 1) {
    const fallido = await apiPost(request, '/auth/login', { nombreUsuario: dueno.nombreUsuario, password: 'ClaveIncorrecta1' });
    expect(fallido.status, `intento ${intento}`).toBe(401);
  }
  expect(sql(`SELECT estado FROM usuario WHERE id = ${dueno.duenoId};`)).toBe('BLOQUEADO');
  const bloqueado = await apiPost(request, '/auth/login', { nombreUsuario: dueno.nombreUsuario, password: dueno.password });
  expect(bloqueado.status).toBe(409);
}

async function desbloquear(request: APIRequestContext, dueno: Dueno, nuevaPassword = 'Testing456') {
  const solicitud = await apiPost(request, '/auth/recuperar-password', { email: dueno.email });
  expect(solicitud.status).toBe(200);
  const codigo = await obtenerCodigoTest(request, dueno.email, 'RECUPERACION_PASSWORD');
  const confirmar = await apiPost(request, '/auth/recuperar-password/confirmar', { email: dueno.email, codigo, nuevaPassword });
  expect(confirmar.status).toBe(200);
  expect(sql(`SELECT estado FROM usuario WHERE id = ${dueno.duenoId};`)).toBe('ACTIVO');
  dueno.password = nuevaPassword;
}

async function publicoDe(request: APIRequestContext, comercioId: number) {
  const listado = await apiGet(request, '/catalogo/comercios');
  expect(listado.status).toBe(200);
  return (listado.body.data as any[]).find((c) => c.id === comercioId);
}

test.describe('Bloqueo de la cuenta del Dueño y catálogo (API), tramo C2', () => {
  test.describe.configure({ mode: 'serial', timeout: 240_000 });

  let adminToken: string;
  let localidadId: string;
  let categoriaId: number;

  test.beforeAll(async ({ request }) => {
    adminToken = (await fijarPasswordAdminYLoguear(request)).token;
    localidadId = await obtenerLocalidadRioGrande(request);
    categoriaId = await crearCategoria(request, adminToken, `Cat Bloqueo ${sufijoUnico()}`);
  });

  async function duenoConProducto(request: APIRequestContext, conMercadoPago = true) {
    const dueno = await prepararAprobado(request, adminToken, localidadId, conMercadoPago, [todoElDia(diaDeHoy())]);
    const productoId = await crearProducto(request, dueno.token, {
      nombre: `Producto Bloqueo ${sufijoUnico()}`,
      precio: 1500,
      categoriaId,
    });
    return { dueno, productoId };
  }

  async function clienteConCarrito(request: APIRequestContext, productoId: number) {
    const cliente = await registrarYVerificarCliente(request, localidadId);
    const token = (await login(request, cliente.nombreUsuario, cliente.password)).token;
    const agregado = await apiPost(request, '/carrito/items', { productoId, cantidad: 1 }, token);
    expect(agregado.status).toBe(201);
    return token;
  }

  test.describe('Un Dueño con un comercio que vende y otro sin cobro', () => {
    let dueno: Dueno;
    let aptoVenta: number;
    let aprobadoSinCobro: number;
    let suspendido: number;
    let productoId: number;
    let clienteConItem: string;

    test.beforeAll(async ({ request }) => {
      const preparado = await duenoConProducto(request);
      dueno = preparado.dueno;
      productoId = preparado.productoId;
      aptoVenta = dueno.comercioId;
      aprobadoSinCobro = await clonarComercioTest(request, aptoVenta, `Sin cobro ${sufijoUnico()}`, 'APROBADO');
      suspendido = await clonarComercioTest(request, aptoVenta, `Suspendido ${sufijoUnico()}`, 'SUSPENDIDO');
      expect(estadoDe(aptoVenta)).toBe('APTO_VENTA');
      clienteConItem = await clienteConCarrito(request, productoId);
    });

    test('antes del bloqueo el comercio que vende está abierto en el catálogo y el que no cobra no aparece', async ({ request }) => {
      const publico = await publicoDe(request, aptoVenta);
      expect(publico.estado).toBe('APTO_VENTA');
      expect(publico.estadoApertura).toBe('ABIERTO');
      expect(await publicoDe(request, aprobadoSinCobro)).toBeUndefined();
      expect(await publicoDe(request, suspendido)).toBeUndefined();
    });

    test('tres intentos fallidos cierran solo el APTO_VENTA y dejan su fila de historial; los demás estados no cambian', async ({ request }) => {
      const historialSinCobro = historialDe(aprobadoSinCobro);
      const historialSuspendido = historialDe(suspendido);

      await bloquear(request, dueno);

      expect(estadoDe(aptoVenta)).toBe('CERRADO_TEMPORALMENTE');
      expect(estadoDe(aprobadoSinCobro)).toBe('APROBADO');
      expect(estadoDe(suspendido)).toBe('SUSPENDIDO');
      expect(delBloqueo(historialDe(aptoVenta))).toEqual([`APTO_VENTA>CERRADO_TEMPORALMENTE|sin-admin|${MOTIVO_BLOQUEO}`]);
      expect(historialDe(aprobadoSinCobro)).toEqual(historialSinCobro);
      expect(historialDe(suspendido)).toEqual(historialSuspendido);
    });

    test('el catálogo lista el comercio bloqueado con estado APTO_VENTA, estadoApertura CERRADO_TEMPORALMENTE y sin textoReapertura', async ({ request }) => {
      const publico = await publicoDe(request, aptoVenta);
      expect(publico).toBeTruthy();
      expect(publico.estado).toBe('APTO_VENTA');
      expect(publico.estadoApertura).toBe('CERRADO_TEMPORALMENTE');
      expect(publico.textoReapertura).toBeNull();
      expect(await publicoDe(request, aprobadoSinCobro)).toBeUndefined();
      expect(await publicoDe(request, suspendido)).toBeUndefined();
    });

    test('ningún comercio del catálogo informa un estado distinto de APTO_VENTA', async ({ request }) => {
      const listado = await apiGet(request, '/catalogo/comercios');
      const estados = new Set((listado.body.data as any[]).map((c) => c.estado));
      expect([...estados]).toEqual(['APTO_VENTA']);
      expect(JSON.stringify(listado.body)).not.toContain('"estado":"CERRADO_TEMPORALMENTE"');
    });

    test('los productos del comercio bloqueado responden 200 y los de los otros dos estados dan 404', async ({ request }) => {
      const productos = await apiGet(request, `/catalogo/comercios/${aptoVenta}/productos`);
      expect(productos.status).toBe(200);
      expect((productos.body.data as any[]).map((p) => p.id)).toContain(productoId);

      expect((await apiGet(request, `/catalogo/comercios/${aprobadoSinCobro}/productos`)).status).toBe(404);
      expect((await apiGet(request, `/catalogo/comercios/${suspendido}/productos`)).status).toBe(404);
    });

    test('agregar al carrito y confirmar un pedido dan 409 con el texto del cierre, sin crear nada', async ({ request }) => {
      const otroCliente = await registrarYVerificarCliente(request, localidadId);
      const tokenNuevo = (await login(request, otroCliente.nombreUsuario, otroCliente.password)).token;
      const agregar = await apiPost(request, '/carrito/items', { productoId, cantidad: 1 }, tokenNuevo);
      expect(agregar.status).toBe(409);
      expect(agregar.body.mensaje).toBe(MENSAJE_CERRADO);

      const pedido = await apiPost(request, '/pedidos/cliente', { tipoEntrega: 'RETIRO', direccionId: null }, clienteConItem);
      expect(pedido.status).toBe(409);
      expect(pedido.body.mensaje).toBe(MENSAJE_CERRADO);
      expect(Number(sql(`SELECT COUNT(*) FROM pedido WHERE comercio_id = ${aptoVenta};`))).toBe(0);
    });

    test('la recuperación de contraseña devuelve el comercio a vender y el sin cobro y el suspendido siguen igual', async ({ request }) => {
      await desbloquear(request, dueno);

      expect(estadoDe(aptoVenta)).toBe('APTO_VENTA');
      expect(estadoDe(aprobadoSinCobro)).toBe('APROBADO');
      expect(estadoDe(suspendido)).toBe('SUSPENDIDO');
      expect(delBloqueo(historialDe(aptoVenta))).toEqual([
        `APTO_VENTA>CERRADO_TEMPORALMENTE|sin-admin|${MOTIVO_BLOQUEO}`,
        `CERRADO_TEMPORALMENTE>APTO_VENTA|sin-admin|${MOTIVO_RESTAURACION}`,
      ]);

      const publico = await publicoDe(request, aptoVenta);
      expect(publico.estadoApertura).toBe('ABIERTO');
      expect(publico.textoReapertura).toBeNull();
      expect(await publicoDe(request, aprobadoSinCobro)).toBeUndefined();
    });

    test('con el comercio otra vez operativo el pedido que antes dio 409 se crea', async ({ request }) => {
      const pedido = await apiPost(request, '/pedidos/cliente', { tipoEntrega: 'RETIRO', direccionId: null }, clienteConItem);
      expect(pedido.status).toBe(201);
      expect(pedido.body.data.estado).toBe('PENDIENTE_PAGO');
    });

    test('el Dueño puede volver a iniciar sesión con la contraseña nueva y ve sus comercios', async ({ request }) => {
      const sesion = await login(request, dueno.nombreUsuario, dueno.password);
      const misComercios = await apiConHeaders(request, 'GET', '/comercios/mis-comercios', sesion.token);
      expect(misComercios.status).toBe(200);
      const porId = new Map<number, any>((misComercios.body.data as any[]).map((c) => [c.id, c]));
      expect(porId.get(aptoVenta).estado).toBe('APTO_VENTA');
      expect(porId.get(aptoVenta).operativo).toBe(true);
      expect(porId.get(aprobadoSinCobro).estado).toBe('APROBADO');
      expect(porId.get(suspendido).operativo).toBe(false);
    });
  });

  test('un cierre manual hecho antes del bloqueo sigue vigente después del desbloqueo', async ({ request }) => {
    const { dueno } = await duenoConProducto(request);
    const cierre = await apiConHeaders(request, 'PUT', '/comercios/cerrar', dueno.token, { [HEADER]: String(dueno.comercioId) });
    expect(cierre.status).toBe(200);
    expect(bandera(dueno.comercioId)).toBe(1);
    const filasDeCierre = Number(sql(`SELECT COUNT(*) FROM historial_cierre_comercio WHERE comercio_id = ${dueno.comercioId};`));
    expect(filasDeCierre).toBe(1);

    await bloquear(request, dueno);

    expect(estadoDe(dueno.comercioId)).toBe('CERRADO_TEMPORALMENTE');
    expect(bandera(dueno.comercioId)).toBe(1);
    const durante = await publicoDe(request, dueno.comercioId);
    expect(durante.estadoApertura).toBe('CERRADO_TEMPORALMENTE');
    expect(durante.textoReapertura).toBeNull();

    await desbloquear(request, dueno);

    expect(estadoDe(dueno.comercioId)).toBe('APTO_VENTA');
    expect(bandera(dueno.comercioId)).toBe(1);
    expect(Number(sql(`SELECT COUNT(*) FROM historial_cierre_comercio WHERE comercio_id = ${dueno.comercioId};`))).toBe(filasDeCierre);
    const despues = await publicoDe(request, dueno.comercioId);
    expect(despues.estadoApertura).toBe('CERRADO_TEMPORALMENTE');
    expect(despues.textoReapertura).toMatch(/^Reabre /);
  });

  test('si la cuenta de Mercado Pago se desvincula mientras el Dueño está bloqueado, el comercio vuelve a APROBADO y no al catálogo', async ({ request }) => {
    const { dueno } = await duenoConProducto(request);
    await bloquear(request, dueno);
    expect(estadoDe(dueno.comercioId)).toBe('CERRADO_TEMPORALMENTE');

    sql(`UPDATE cuenta_mercado_pago SET activa = 0 WHERE dueno_id = ${dueno.duenoId};`);
    await desbloquear(request, dueno);

    expect(estadoDe(dueno.comercioId)).toBe('APROBADO');
    expect(delBloqueo(historialDe(dueno.comercioId)).map((fila) => fila.split('|')[0])).toEqual([
      'APTO_VENTA>CERRADO_TEMPORALMENTE',
      'CERRADO_TEMPORALMENTE>APROBADO',
    ]);
    expect(await publicoDe(request, dueno.comercioId)).toBeUndefined();
    expect((await apiGet(request, `/catalogo/comercios/${dueno.comercioId}/productos`)).status).toBe(404);
  });

  test('un Dueño con un solo comercio APROBADO sin cobro: el bloqueo no lo toca, no escribe historial y nunca está en el catálogo', async ({ request }) => {
    const { dueno } = await duenoConProducto(request, false);
    expect(estadoDe(dueno.comercioId)).toBe('APROBADO');
    const historialAntes = historialDe(dueno.comercioId);
    expect(await publicoDe(request, dueno.comercioId)).toBeUndefined();

    await bloquear(request, dueno);

    expect(estadoDe(dueno.comercioId)).toBe('APROBADO');
    expect(historialDe(dueno.comercioId)).toEqual(historialAntes);
    expect(await publicoDe(request, dueno.comercioId)).toBeUndefined();

    await desbloquear(request, dueno);

    expect(estadoDe(dueno.comercioId)).toBe('APROBADO');
    expect(historialDe(dueno.comercioId)).toEqual(historialAntes);
  });

  test('un bloqueo repetido sobre varios comercios del mismo Dueño deja una fila por comercio y por bloqueo', async ({ request }) => {
    const { dueno } = await duenoConProducto(request);
    const segundo = await clonarComercioTest(request, dueno.comercioId, `Segundo ${sufijoUnico()}`, 'APTO_VENTA');
    const tercero = await clonarComercioTest(request, dueno.comercioId, `Tercero ${sufijoUnico()}`, 'APTO_VENTA');

    for (let ciclo = 1; ciclo <= 2; ciclo += 1) {
      await bloquear(request, dueno);
      for (const id of [dueno.comercioId, segundo, tercero]) {
        expect(estadoDe(id), `ciclo ${ciclo} comercio ${id}`).toBe('CERRADO_TEMPORALMENTE');
      }
      await desbloquear(request, dueno, `Testing4${ciclo}6`);
      for (const id of [dueno.comercioId, segundo, tercero]) {
        expect(estadoDe(id), `ciclo ${ciclo} comercio ${id}`).toBe('APTO_VENTA');
        const filas = historialDe(id).filter((fila) => fila.includes('CERRADO_TEMPORALMENTE'));
        expect(filas, `ciclo ${ciclo} comercio ${id}`).toHaveLength(ciclo * 2);
      }
    }
  });
});
