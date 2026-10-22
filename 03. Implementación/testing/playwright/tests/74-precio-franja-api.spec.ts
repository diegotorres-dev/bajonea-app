import { test, expect } from './helpers/prueba';
import type { APIRequestContext } from '@playwright/test';
import {
  apiConHeaders,
  apiPut,
  bloqueoDePrecioTest,
  conBloqueoDePrecio,
  crearCategoria,
  diaDeHoy,
  fijarPasswordAdminYLoguear,
  login,
  obtenerLocalidadRioGrande,
  registrarYVerificarCliente,
  sqlTest as sql,
  sufijoUnico,
} from './helpers/backend';
import type { ClienteRegistrado } from './helpers/backend';
import { ponerEstadoComercio, sumarAlEquipo } from './helpers/empleado';
import type { Dueno } from './helpers/multicomercio';
import { agregarComercioApto, prepararAprobado } from './helpers/multicomercio';
import { diaDeLaSemanaEnZona, fechaHoraSqlEnZona } from './helpers/zona';

const MINUTO = 60_000;
const DIAS = ['DOMINGO', 'LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO'];
const PRECIO = 10000;
const CODIGO_BLOQUEADO = 'PRECIO_BLOQUEADO_EN_FRANJA';
const MENSAJE_BLOQUEADO = 'No podés cambiar precios mientras tu comercio está en horario de atención. Hacelo fuera de ese horario.';
const horaEn = (desplazamientoMin: number): string => fechaHoraSqlEnZona(Date.now() + desplazamientoMin * MINUTO).slice(11, 16);
const diaEn = (desplazamientoMin: number): string => DIAS[diaDeLaSemanaEnZona(Date.now() + desplazamientoMin * MINUTO)];
const conComercio = (comercioId: number): Record<string, string> => ({ 'X-Comercio-Id': String(comercioId) });
const todoElDia = () => [{ diaSemana: diaDeHoy(), horaApertura: '00:00', horaCierre: '23:59' }];
const franjaQueContieneAhora = () => [{ diaSemana: diaEn(-30), horaApertura: horaEn(-30), horaCierre: horaEn(30) }];
const franjaQueNoContieneAhora = () => [{ diaSemana: diaEn(120), horaApertura: horaEn(120), horaCierre: horaEn(180) }];

interface Escena {
  comercioId: number;
  productoId: number;
}

test.describe('Fase 2, T3 (API): el precio de un producto no se puede cambiar dentro de una franja', () => {
  test.describe.configure({ mode: 'serial', timeout: 240_000 });

  let adminToken: string;
  let localidadId: string;
  let categoriaId: number;
  let dueno: Dueno;
  let empleado: ClienteRegistrado;
  let empleadoToken: string;

  const precioEnLaBase = (productoId: number): number => Number(sql(`SELECT precio FROM producto WHERE id = ${productoId};`));
  const filasDeHistorial = (productoId: number): number =>
    Number(sql(`SELECT COUNT(*) FROM historial_edicion_comercio WHERE entidad_tipo = 'PRODUCTO' AND accion = 'EDITAR' AND entidad_id = ${productoId};`));

  async function crearEscena(
    request: APIRequestContext,
    horarios: Array<{ diaSemana: string; horaApertura: string; horaCierre: string }> | undefined,
    conImagen = true,
  ): Promise<Escena> {
    const comercioId = await agregarComercioApto(request, dueno, `Precio T3 ${sufijoUnico()}`, horarios);
    const producto = await apiConHeaders(request, 'POST', '/productos', dueno.token, conComercio(comercioId), {
      nombre: `Producto T3 ${sufijoUnico()}`,
      precio: PRECIO,
      categoriaId,
    });
    expect(producto.status, JSON.stringify(producto.body)).toBe(201);
    const productoId = producto.body.data.id as number;
    if (conImagen) {
      sql(
        `INSERT INTO imagen_producto (producto_id, url, orden, es_principal) VALUES ` +
          `(${productoId}, 'https://res.cloudinary.com/demo/image/upload/productos/${comercioId}/${productoId}/foto.png', 0, 1);`,
      );
    }
    return { comercioId, productoId };
  }

  const editar = (request: APIRequestContext, token: string, escena: Escena, cuerpo: Record<string, unknown>) =>
    apiConHeaders(request, 'PUT', `/productos/${escena.productoId}`, token, conComercio(escena.comercioId), {
      nombre: `Producto T3 editado ${sufijoUnico()}`,
      precio: PRECIO,
      categoriaId,
      ...cuerpo,
    });

  const listaDelComercio = async (request: APIRequestContext, token: string, comercioId: number) => {
    const respuesta = await apiConHeaders(request, 'GET', '/productos', token, conComercio(comercioId));
    expect(respuesta.status, JSON.stringify(respuesta.body)).toBe(200);
    return respuesta.body.data as Array<Record<string, unknown>>;
  };

  test.beforeAll(async ({ request }) => {
    await bloqueoDePrecioTest(request, false);
    adminToken = (await fijarPasswordAdminYLoguear(request)).token;
    localidadId = await obtenerLocalidadRioGrande(request);
    categoriaId = await crearCategoria(request, adminToken, `Cat Precio T3 ${sufijoUnico()}`);
    dueno = await prepararAprobado(request, adminToken, localidadId, true, todoElDia());
    empleado = await registrarYVerificarCliente(request, localidadId);
    empleadoToken = (await login(request, empleado.nombreUsuario, empleado.password)).token;
  });

  test.afterAll(async ({ request }) => {
    await bloqueoDePrecioTest(request, false);
  });

  test('el perfil de test arranca con el bloqueo apagado: un cambio de precio dentro de la franja se guarda', async ({ request }) => {
    const escena = await crearEscena(request, franjaQueContieneAhora());

    const respuesta = await editar(request, dueno.token, escena, { precio: 11000 });

    expect(respuesta.status, JSON.stringify(respuesta.body)).toBe(200);
    expect(precioEnLaBase(escena.productoId)).toBe(11000);
    expect(respuesta.body.data.precioBloqueado).toBe(false);
  });

  test('el atajo enciende y apaga el bloqueo, devuelve el valor y exige el parámetro', async ({ request }) => {
    const encendido = await apiPut(request, '/test/precio-bloqueo?habilitado=true', {});
    expect(encendido.status).toBe(200);
    expect(encendido.body.data).toBe(true);
    const apagado = await apiPut(request, '/test/precio-bloqueo?habilitado=false', {});
    expect(apagado.status).toBe(200);
    expect(apagado.body.data).toBe(false);
    const sinParametro = await apiPut(request, '/test/precio-bloqueo', {});
    expect(sinParametro.status).toBe(400);
  });

  test('un precio distinto dentro de la franja es 409 para el Dueño, con código y mensaje, y no cambia nada', async ({ request }) => {
    const escena = await crearEscena(request, franjaQueContieneAhora());

    await conBloqueoDePrecio(request, async () => {
      const respuesta = await editar(request, dueno.token, escena, { precio: 12000 });

      expect(respuesta.status, JSON.stringify(respuesta.body)).toBe(409);
      expect(respuesta.body.data.codigo).toBe(CODIGO_BLOQUEADO);
      expect(respuesta.body.mensaje).toBe(MENSAJE_BLOQUEADO);
    });

    expect(precioEnLaBase(escena.productoId)).toBe(PRECIO);
    expect(filasDeHistorial(escena.productoId)).toBe(0);
  });

  test('el Empleado recibe el mismo 409 por un precio distinto dentro de la franja', async ({ request }) => {
    const escena = await crearEscena(request, franjaQueContieneAhora());
    await sumarAlEquipo(request, escena.comercioId, empleado, dueno.token);

    await conBloqueoDePrecio(request, async () => {
      const respuesta = await editar(request, empleadoToken, escena, { precio: 12000 });

      expect(respuesta.status, JSON.stringify(respuesta.body)).toBe(409);
      expect(respuesta.body.data.codigo).toBe(CODIGO_BLOQUEADO);
    });

    expect(precioEnLaBase(escena.productoId)).toBe(PRECIO);
  });

  test('el mismo precio guarda los demás campos en franja', async ({ request }) => {
    const escena = await crearEscena(request, franjaQueContieneAhora());

    await conBloqueoDePrecio(request, async () => {
      const mismoPrecio = await editar(request, dueno.token, escena, { nombre: 'Nombre nuevo T3' });
      expect(mismoPrecio.status, JSON.stringify(mismoPrecio.body)).toBe(200);
      expect(mismoPrecio.body.data.nombre).toBe('Nombre Nuevo T3');
      expect(mismoPrecio.body.data.precioBloqueado).toBe(true);

      const otraDescripcion = await editar(request, dueno.token, escena, { descripcion: 'otra descripción' });
      expect(otraDescripcion.status, JSON.stringify(otraDescripcion.body)).toBe(200);
    });
  });

  test('fuera de la franja el cambio de precio se guarda y la lista informa que no está bloqueado', async ({ request }) => {
    const escena = await crearEscena(request, franjaQueNoContieneAhora());

    await conBloqueoDePrecio(request, async () => {
      const respuesta = await editar(request, dueno.token, escena, { precio: 13000 });
      expect(respuesta.status, JSON.stringify(respuesta.body)).toBe(200);
      expect(Number(respuesta.body.data.precio)).toBe(13000);
      expect(respuesta.body.data.precioBloqueado).toBe(false);
      expect(respuesta.body.data.precioBloqueadoHasta).toBeUndefined();

      const fila = (await listaDelComercio(request, dueno.token, escena.comercioId)).find((p) => p.id === escena.productoId);
      expect(fila?.precioBloqueado).toBe(false);
      expect(fila?.precioBloqueadoHasta).toBeUndefined();
    });
    expect(precioEnLaBase(escena.productoId)).toBe(13000);
    expect(filasDeHistorial(escena.productoId)).toBe(1);
  });

  test('la lista del comercio informa el bloqueo y la hora en que termina la franja, y el catálogo público no lleva los campos', async ({ request }) => {
    const escena = await crearEscena(request, franjaQueContieneAhora());

    await conBloqueoDePrecio(request, async () => {
      const fila = (await listaDelComercio(request, dueno.token, escena.comercioId)).find((p) => p.id === escena.productoId);
      expect(fila?.precioBloqueado).toBe(true);
      expect(String(fila?.precioBloqueadoHasta)).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/);
      const hasta = Date.parse(`${String(fila?.precioBloqueadoHasta).slice(0, 16)}:00Z`);
      const esperado = Date.parse(`${fechaHoraSqlEnZona(Date.now() + 30 * MINUTO).replace(' ', 'T').slice(0, 16)}:00Z`);
      expect(Math.abs(hasta - esperado)).toBeLessThanOrEqual(2 * MINUTO);

      const publico = await apiConHeaders(request, 'GET', `/catalogo/comercios/${escena.comercioId}/productos`, undefined);
      expect(publico.status).toBe(200);
      const filaPublica = (publico.body.data as Array<Record<string, unknown>>).find((p) => p.id === escena.productoId);
      expect(filaPublica).toBeDefined();
      expect(filaPublica).not.toHaveProperty('precioBloqueado');
      expect(filaPublica).not.toHaveProperty('precioBloqueadoHasta');
    });
  });

  test('un comercio abierto todo el día queda bloqueado todo el día y sin hora de liberación en esa jornada continua', async ({ request }) => {
    const escena = await crearEscena(request, todoElDia());

    await conBloqueoDePrecio(request, async () => {
      const respuesta = await editar(request, dueno.token, escena, { precio: 12000 });
      expect(respuesta.status, JSON.stringify(respuesta.body)).toBe(409);
      expect(respuesta.body.data.codigo).toBe(CODIGO_BLOQUEADO);
    });
  });

  test('el cierre manual dentro de la franja no levanta el bloqueo', async ({ request }) => {
    const escena = await crearEscena(request, franjaQueContieneAhora());
    sql(`UPDATE comercio SET cerrado_manualmente = 1 WHERE id = ${escena.comercioId};`);

    await conBloqueoDePrecio(request, async () => {
      const respuesta = await editar(request, dueno.token, escena, { precio: 12000 });
      expect(respuesta.status, JSON.stringify(respuesta.body)).toBe(409);
      expect(respuesta.body.data.codigo).toBe(CODIGO_BLOQUEADO);
    });
  });

  test('un comercio sin franjas nunca se bloquea', async ({ request }) => {
    const escena = await crearEscena(request, []);

    await conBloqueoDePrecio(request, async () => {
      const respuesta = await editar(request, dueno.token, escena, { precio: 12000 });
      expect(respuesta.status, JSON.stringify(respuesta.body)).toBe(200);
      const fila = (await listaDelComercio(request, dueno.token, escena.comercioId)).find((p) => p.id === escena.productoId);
      expect(fila?.precioBloqueado).toBe(false);
    });
  });

  test('dar de alta un producto dentro de la franja está permitido y su respuesta no lleva los campos de bloqueo', async ({ request }) => {
    const escena = await crearEscena(request, franjaQueContieneAhora());

    await conBloqueoDePrecio(request, async () => {
      const alta = await apiConHeaders(request, 'POST', '/productos', dueno.token, conComercio(escena.comercioId), {
        nombre: `Alta en franja ${sufijoUnico()}`,
        precio: 9000,
        categoriaId,
      });
      expect(alta.status, JSON.stringify(alta.body)).toBe(201);
      expect(alta.body.data).not.toHaveProperty('precioBloqueado');
    });
  });

  test('el orden de los guards no cambia: suspensión, pertenencia, descontinuado y fotos van antes que el bloqueo', async ({ request }) => {
    const suspendido = await crearEscena(request, franjaQueContieneAhora());
    await sumarAlEquipo(request, suspendido.comercioId, empleado, dueno.token);
    ponerEstadoComercio(suspendido.comercioId, 'SUSPENDIDO');
    const ajeno = await crearEscena(request, franjaQueContieneAhora());
    const propio = await crearEscena(request, franjaQueContieneAhora());
    const descontinuado = await crearEscena(request, franjaQueContieneAhora());
    const sinFotos = await crearEscena(request, franjaQueContieneAhora(), false);
    const baja = await apiConHeaders(request, 'PATCH', `/productos/${descontinuado.productoId}/estado`, dueno.token, conComercio(descontinuado.comercioId), {
      estado: 'DESCONTINUADO',
    });
    expect(baja.status, JSON.stringify(baja.body)).toBe(200);

    await conBloqueoDePrecio(request, async () => {
      const deEmpleado = await editar(request, empleadoToken, suspendido, { precio: 12000 });
      expect(deEmpleado.status, JSON.stringify(deEmpleado.body)).toBe(409);
      expect(deEmpleado.body.data.codigo).toBe('COMERCIO_SUSPENDIDO');

      const deOtroComercio = await apiConHeaders(request, 'PUT', `/productos/${ajeno.productoId}`, dueno.token, conComercio(propio.comercioId), {
        nombre: 'Cualquiera',
        precio: 12000,
        categoriaId,
      });
      expect(deOtroComercio.status).toBe(404);
      expect(deOtroComercio.body.mensaje).toBe('Producto no encontrado');

      const deDescontinuado = await editar(request, dueno.token, descontinuado, { precio: 12000 });
      expect(deDescontinuado.status).toBe(409);
      expect(deDescontinuado.body.mensaje).toBe('No se puede editar un producto descontinuado');
      expect(deDescontinuado.body.data?.codigo).toBeUndefined();

      const sinFoto = await editar(request, dueno.token, sinFotos, { precio: 12000 });
      expect(sinFoto.status).toBe(409);
      expect(sinFoto.body.data?.codigo).toBeUndefined();

      const categoriaInexistente = await editar(request, dueno.token, propio, { precio: 12000, categoriaId: 99999999 });
      expect(categoriaInexistente.status).toBe(404);
    });
  });
});
