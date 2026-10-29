import { test, expect } from './helpers/prueba';
import type { APIRequestContext } from '@playwright/test';
import {
  apiConHeaders,
  crearCategoria,
  diaDeHoy,
  fijarPasswordAdminYLoguear,
  login,
  obtenerLocalidadRioGrande,
  registrarYVerificarCliente,
  sqlTest as sql,
  sufijoUnico,
} from './helpers/backend';
import { atajoEstadoRelacion, ponerEstadoComercio, sumarAlEquipo } from './helpers/empleado';
import type { Dueno } from './helpers/multicomercio';
import { prepararAprobado } from './helpers/multicomercio';

const HEADER = 'X-Comercio-Id';
const URL_IMAGEN = 'https://res.cloudinary.com/demo/image/upload/v1/orden.png';
const todoElDia = () => [{ diaSemana: diaDeHoy(), horaApertura: '00:00', horaCierre: '23:59' }];

test.describe('Rol Empleado, E3 bloque A5b (API): orden único de bloqueo del catálogo, imágenes y firmas', () => {
  test.describe.configure({ timeout: 300_000 });

  let adminToken: string;
  let dueno: Dueno;
  let comercioId: number;
  let categoriaId: number;
  let empleadoId: number;
  let empleadoToken: string;

  const cabecera = (): Record<string, string> => ({ [HEADER]: String(comercioId) });
  const como = (request: APIRequestContext, token: string, metodo: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', ruta: string, cuerpo?: unknown) =>
    apiConHeaders(request, metodo, ruta, token, cabecera(), cuerpo);

  async function productoNuevo(request: APIRequestContext, imagenes: number): Promise<{ productoId: number; imagenIds: number[] }> {
    const respuesta = await como(request, dueno.token, 'POST', '/productos', { nombre: `Producto orden ${sufijoUnico()}`, precio: 1800, categoriaId });
    expect(respuesta.status, JSON.stringify(respuesta.body)).toBe(201);
    const productoId = respuesta.body.data.id as number;
    const imagenIds: number[] = [];
    for (let i = 0; i < imagenes; i++) {
      sql(`INSERT INTO imagen_producto (producto_id, url, orden, es_principal) VALUES (${productoId}, '${URL_IMAGEN}', ${i}, ${i === 0 ? 1 : 0});`);
      imagenIds.push(Number(sql(`SELECT id FROM imagen_producto WHERE producto_id = ${productoId} ORDER BY id DESC LIMIT 1;`)));
    }
    return { productoId, imagenIds };
  }

  const filasDeEliminacion = (imagenId: number): number =>
    Number(sql(`SELECT COUNT(*) FROM historial_edicion_comercio WHERE entidad_tipo = 'IMAGEN_PRODUCTO' AND accion = 'ELIMINAR' AND entidad_id = ${imagenId};`));
  const imagenExiste = (imagenId: number): boolean => Number(sql(`SELECT COUNT(*) FROM imagen_producto WHERE id = ${imagenId};`)) === 1;

  test.beforeAll(async ({ request }) => {
    adminToken = (await fijarPasswordAdminYLoguear(request)).token;
    const localidadId = await obtenerLocalidadRioGrande(request);
    dueno = await prepararAprobado(request, adminToken, localidadId, true, todoElDia());
    comercioId = dueno.comercioId;
    categoriaId = await crearCategoria(request, adminToken, `Cat Orden ${sufijoUnico()}`);

    const empleado = await registrarYVerificarCliente(request, localidadId);
    await sumarAlEquipo(request, comercioId, empleado, dueno.token);
    const sesion = await login(request, empleado.nombreUsuario, empleado.password);
    empleadoToken = sesion.token;
    empleadoId = sesion.usuario.id;
  });

  test('las dos firmas de Cloudinary revalidan la relación del Empleado: activa 200, inactiva 404 y de nuevo activa 200', async ({ request }) => {
    const { productoId, imagenIds } = await productoNuevo(request, 1);
    const firmas = (token: string) => [
      como(request, token, 'POST', `/productos/${productoId}/cloudinary/firma`, {}),
      como(request, token, 'POST', `/productos/${productoId}/imagenes/${imagenIds[0]}/recorte/firma`, {}),
    ];

    for (const r of await Promise.all(firmas(empleadoToken))) {
      expect(r.status, JSON.stringify(r.body)).toBe(200);
    }

    expect((await atajoEstadoRelacion(request, comercioId, empleadoId, 'INACTIVO')).status).toBe(200);
    try {
      for (const r of await Promise.all(firmas(empleadoToken))) {
        expect(r.status).toBe(404);
        expect(r.body).toEqual({ mensaje: 'Comercio no encontrado', data: { codigo: 'COMERCIO_NO_DISPONIBLE' } });
      }
      for (const r of await Promise.all(firmas(dueno.token))) {
        expect(r.status, JSON.stringify(r.body)).toBe(200);
      }
    } finally {
      expect((await atajoEstadoRelacion(request, comercioId, empleadoId, 'ACTIVO')).status).toBe(200);
    }

    for (const r of await Promise.all(firmas(empleadoToken))) {
      expect(r.status, JSON.stringify(r.body)).toBe(200);
    }
  });

  test('con el comercio suspendido las firmas del Empleado y las del Dueño dan 409 COMERCIO_SUSPENDIDO', async ({ request }) => {
    const { productoId, imagenIds } = await productoNuevo(request, 1);
    ponerEstadoComercio(comercioId, 'SUSPENDIDO');
    try {
      const delEmpleado = await Promise.all([
        como(request, empleadoToken, 'POST', `/productos/${productoId}/cloudinary/firma`, {}),
        como(request, empleadoToken, 'POST', `/productos/${productoId}/imagenes/${imagenIds[0]}/recorte/firma`, {}),
      ]);
      for (const r of delEmpleado) {
        expect(r.status, JSON.stringify(r.body)).toBe(409);
        expect(r.body.data.codigo).toBe('COMERCIO_SUSPENDIDO');
      }
      const delDueno = await Promise.all([
        como(request, dueno.token, 'POST', `/productos/${productoId}/cloudinary/firma`, {}),
        como(request, dueno.token, 'POST', `/productos/${productoId}/imagenes/${imagenIds[0]}/recorte/firma`, {}),
      ]);
      for (const r of delDueno) {
        expect(r.status, JSON.stringify(r.body)).toBe(409);
        expect(r.body.data.codigo).toBe('COMERCIO_SUSPENDIDO');
      }
    } finally {
      ponerEstadoComercio(comercioId, 'APTO_VENTA');
    }
  });

  test('eliminar dos veces la misma imagen da 200 y después 404 con "Imagen no encontrada"', async ({ request }) => {
    const { productoId, imagenIds } = await productoNuevo(request, 2);
    const [, sobrante] = imagenIds;

    const primera = await como(request, empleadoToken, 'DELETE', `/productos/${productoId}/imagenes/${sobrante}`);
    expect(primera.status, JSON.stringify(primera.body)).toBe(200);
    const segunda = await como(request, dueno.token, 'DELETE', `/productos/${productoId}/imagenes/${sobrante}`);
    expect(segunda.status).toBe(404);
    expect(segunda.body.mensaje).toBe('Imagen no encontrada');
    expect(filasDeEliminacion(sobrante)).toBe(1);
  });

  test('eliminar la misma imagen a la vez: un solo 200, el resto 404, nunca 5xx y una sola fila de historial', async ({ request }) => {
    for (let ronda = 0; ronda < 6; ronda++) {
      const { productoId, imagenIds } = await productoNuevo(request, 2);
      const [principal, sobrante] = imagenIds;

      const respuestas = await Promise.all([
        como(request, dueno.token, 'DELETE', `/productos/${productoId}/imagenes/${sobrante}`),
        como(request, empleadoToken, 'DELETE', `/productos/${productoId}/imagenes/${sobrante}`),
        como(request, dueno.token, 'DELETE', `/productos/${productoId}/imagenes/${sobrante}`),
        como(request, empleadoToken, 'DELETE', `/productos/${productoId}/imagenes/${sobrante}`),
      ]);

      const estados = respuestas.map((r) => r.status).sort();
      expect(estados, `ronda ${ronda}: ${JSON.stringify(respuestas.map((r) => r.body))}`).toEqual([200, 404, 404, 404]);
      expect(filasDeEliminacion(sobrante)).toBe(1);
      expect(imagenExiste(sobrante)).toBe(false);
      expect(imagenExiste(principal)).toBe(true);
    }
  });

  test('reordenar o cambiar la URL de una imagen que otro elimina a la vez da 200 o 404, nunca 5xx, y queda una sola principal', async ({ request }) => {
    let cloudName = '';
    for (let ronda = 0; ronda < 6; ronda++) {
      const { productoId, imagenIds } = await productoNuevo(request, 3);
      const [a, b] = imagenIds;
      const base = `/productos/${productoId}/imagenes`;
      if (!cloudName) {
        const firma = await como(request, dueno.token, 'POST', `/productos/${productoId}/cloudinary/firma`, {});
        expect(firma.status, JSON.stringify(firma.body)).toBe(200);
        cloudName = firma.body.data.cloudName as string;
      }
      const urlDelProducto = `https://res.cloudinary.com/${cloudName}/image/upload/v1/productos/${comercioId}/${productoId}/orden-${sufijoUnico()}.png`;

      const respuestas = await Promise.all([
        como(request, dueno.token, 'DELETE', `${base}/${b}`),
        como(request, empleadoToken, 'PATCH', `${base}/${b}/orden`, { orden: 5 }),
        como(request, empleadoToken, 'PATCH', `${base}/${b}/url`, { url: urlDelProducto }),
        como(request, empleadoToken, 'DELETE', `${base}/${a}`),
        como(request, dueno.token, 'PATCH', `${base}/${a}/orden`, { orden: 4 }),
      ]);

      for (const r of respuestas) {
        expect([200, 404], `ronda ${ronda}: ${r.status} ${JSON.stringify(r.body)}`).toContain(r.status);
      }
      const restantes = Number(sql(`SELECT COUNT(*) FROM imagen_producto WHERE producto_id = ${productoId};`));
      const principales = Number(sql(`SELECT COUNT(*) FROM imagen_producto WHERE producto_id = ${productoId} AND es_principal = 1;`));
      expect(restantes).toBeGreaterThan(0);
      expect(principales, `ronda ${ronda}: ${principales} principales de ${restantes}`).toBe(1);
      expect(filasDeEliminacion(a)).toBeLessThanOrEqual(1);
      expect(filasDeEliminacion(b)).toBeLessThanOrEqual(1);
    }
  });

  test('escrituras de producto del Dueño y del Empleado contra cerrar, abrir y datos operativos a la vez: nunca 5xx', async ({ request }) => {
    for (let ronda = 0; ronda < 12; ronda++) {
      const { productoId, imagenIds } = await productoNuevo(request, 2);
      const [base, sobrante] = imagenIds;
      const edicion = () => ({ nombre: `Producto orden ${sufijoUnico()}`, precio: 1000 + Math.floor(Math.random() * 9000), categoriaId });
      const tareas = [dueno.token, empleadoToken].flatMap((token) => [
        ...[0, 1, 2].flatMap((i) => [
          como(request, token, 'PATCH', `/productos/${productoId}/estado`, { estado: i % 2 ? 'DISPONIBLE' : 'AGOTADO' }),
          como(request, token, 'PUT', `/productos/${productoId}`, edicion()),
          como(request, token, 'POST', `/productos/${productoId}/imagenes`, { url: URL_IMAGEN, orden: 2 + i, esPrincipal: false }),
        ]),
        como(request, token, 'POST', '/productos', { nombre: `Producto orden ${sufijoUnico()}`, precio: 900, categoriaId }),
        como(request, token, 'PATCH', `/productos/${productoId}/imagenes/${base}/orden`, { orden: Math.floor(Math.random() * 3) }),
        como(request, token, 'PATCH', `/productos/${productoId}/imagenes/${base}/url`, { url: URL_IMAGEN }),
        como(request, token, 'DELETE', `/productos/${productoId}/imagenes/${sobrante}`),
        como(request, token, 'PUT', '/comercios/cerrar', {}),
        como(request, token, 'PUT', '/comercios/abrir', {}),
        como(request, token, 'PUT', '/comercios/perfil/datos-operativos', { descripcion: `Orden ${sufijoUnico()}`, telefono: '+5492964111222' }),
        como(request, token, 'POST', `/productos/${productoId}/cloudinary/firma`, {}),
      ]);

      for (const r of await Promise.all(tareas)) {
        expect(r.status, `ronda ${ronda}: ${JSON.stringify(r.body)}`).toBeLessThan(500);
      }
    }
  });
});
