import { test, expect } from './helpers/prueba';
import type { APIRequestContext } from '@playwright/test';
import {
  API_BASE_URL,
  apiConHeaders,
  apiGet,
  diaDeHoy,
  fijarPasswordAdminYLoguear,
  obtenerLocalidadRioGrande,
  registrarYVerificarCliente,
  registrarYVerificarComercio,
  login,
  sqlTest as sql,
  sufijoUnico,
} from './helpers/backend';
import { prepararAprobado, prepararRechazado } from './helpers/multicomercio';

const PUBLICO = '/auth/comercio-nombre/disponibilidad';
const DUENO = '/comercios/nombre/disponibilidad';

let localidadId: string;
let adminToken: string;

const publico = (request: APIRequestContext, nombre: string) => apiGet(request, `${PUBLICO}?nombre=${encodeURIComponent(nombre)}`);

const delDueno = (request: APIRequestContext, token: string | undefined, nombre: string, comercioId?: number | string, headers: Record<string, string> = {}) =>
  apiConHeaders(
    request,
    'GET',
    `${DUENO}?nombre=${encodeURIComponent(nombre)}${comercioId === undefined ? '' : `&comercioId=${comercioId}`}`,
    token,
    headers,
  );

test.describe('Disponibilidad en vivo del nombre de comercio (API)', () => {
  test.beforeAll(async ({ request }) => {
    localidadId = await obtenerLocalidadRioGrande(request);
    adminToken = (await fijarPasswordAdminYLoguear(request)).token;
  });

  test.describe('endpoint público del registro', () => {
    test('responde sin sesión y con un único campo booleano', async ({ request }) => {
      const libre = await publico(request, `Nombre Libre ${sufijoUnico()}`);
      expect(libre.status).toBe(200);
      expect(libre.body.data).toEqual({ disponible: true });
    });

    test('un nombre tomado responde no disponible, sin importar mayúsculas, tildes, la ñ ni los espacios', async ({ request }) => {
      const sufijo = sufijoUnico();
      await registrarYVerificarComercio(request, localidadId, {
        nombre: `Cafetería Ñandú ${sufijo}`,
        horarios: [{ diaSemana: diaDeHoy(), horaApertura: '00:00', horaCierre: '23:59' }],
      });

      for (const variante of [
        `Cafetería Ñandú ${sufijo}`,
        `CAFETERÍA ÑANDÚ ${sufijo}`,
        `cafeteria nandu ${sufijo}`,
        `  Cafetería    Ñandú   ${sufijo} `,
        `Cafetería\tÑandú\t${sufijo}`,
      ]) {
        const respuesta = await publico(request, variante);
        expect(respuesta.status, JSON.stringify(variante)).toBe(200);
        expect(respuesta.body.data, JSON.stringify(variante)).toEqual({ disponible: false });
      }
      expect((await publico(request, `Cafetería Ñandú ${sufijo} 2`)).body.data).toEqual({ disponible: true });
    });

    test('la respuesta no revela de quién es el nombre ni en qué estado está el comercio', async ({ request }) => {
      const pendiente = await prepararAprobado(request, adminToken, localidadId);
      sql(`UPDATE comercio SET estado = 'PENDIENTE' WHERE id = ${pendiente.comercioId};`);
      const aprobado = await prepararAprobado(request, adminToken, localidadId);

      const dePendiente = await publico(request, pendiente.nombre);
      const deAprobado = await publico(request, aprobado.nombre);
      expect(dePendiente.body).toEqual(deAprobado.body);
      expect(Object.keys(dePendiente.body.data)).toEqual(['disponible']);
    });

    test('un RECHAZADO retiene su nombre y un RECHAZO_DEFINITIVO lo libera', async ({ request }) => {
      const rechazado = await prepararRechazado(request, adminToken, localidadId);
      expect((await publico(request, rechazado.nombre)).body.data).toEqual({ disponible: false });

      sql(`UPDATE comercio SET estado = 'RECHAZO_DEFINITIVO' WHERE id = ${rechazado.comercioId};`);
      expect((await publico(request, rechazado.nombre)).body.data).toEqual({ disponible: true });
    });

    test('el formato inválido, vacío o demasiado largo da 400 y la falta del parámetro también', async ({ request }) => {
      for (const nombre of ['', '   ', '@@@ ---', 'x'.repeat(151)]) {
        const respuesta = await publico(request, nombre);
        expect(respuesta.status, JSON.stringify(nombre.slice(0, 10))).toBe(400);
      }
      expect((await apiGet(request, PUBLICO)).status).toBe(400);
      expect((await publico(request, 'x'.repeat(150))).status).toBe(200);
    });
  });

  test.describe('endpoint del Dueño', () => {
    test('sin token da 401', async ({ request }) => {
      expect((await delDueno(request, undefined, 'Cualquiera')).status).toBe(401);
    });

    test('un Cliente y el Administrador dan 403, con o sin X-Comercio-Id', async ({ request }) => {
      const dueno = await prepararAprobado(request, adminToken, localidadId);
      const cliente = await registrarYVerificarCliente(request, localidadId);
      const sesionCliente = await login(request, cliente.nombreUsuario, cliente.password);

      expect((await delDueno(request, sesionCliente.token, 'Cualquiera')).status).toBe(403);
      expect((await delDueno(request, sesionCliente.token, 'Cualquiera', undefined, { 'X-Comercio-Id': String(dueno.comercioId) })).status).toBe(403);
      expect((await delDueno(request, adminToken, 'Cualquiera')).status).toBe(403);
      expect((await delDueno(request, adminToken, 'Cualquiera', dueno.comercioId)).status).toBe(403);
    });

    test('responde lo mismo que el público y excluye al comercio propio', async ({ request }) => {
      const dueno = await prepararAprobado(request, adminToken, localidadId);
      const otro = await prepararAprobado(request, adminToken, localidadId);

      const sinExcluir = await delDueno(request, dueno.token, dueno.nombre);
      expect(sinExcluir.status).toBe(200);
      expect(sinExcluir.body.data).toEqual({ disponible: false });

      const excluyendo = await delDueno(request, dueno.token, dueno.nombre.toUpperCase(), dueno.comercioId);
      expect(excluyendo.status).toBe(200);
      expect(excluyendo.body.data).toEqual({ disponible: true });

      const ajeno = await delDueno(request, dueno.token, otro.nombre, dueno.comercioId);
      expect(ajeno.body.data).toEqual({ disponible: false });

      const libre = await delDueno(request, dueno.token, `Libre ${sufijoUnico()}`);
      expect(libre.body.data).toEqual({ disponible: true });
    });

    test('un comercioId de otro Dueño, inexistente o no numérico no revela nada: 404 o 400', async ({ request }) => {
      const dueno = await prepararAprobado(request, adminToken, localidadId);
      const otro = await prepararAprobado(request, adminToken, localidadId);

      const ajeno = await delDueno(request, dueno.token, otro.nombre, otro.comercioId);
      expect(ajeno.status).toBe(404);
      expect(ajeno.body.mensaje).toBe('Comercio no encontrado');
      expect(JSON.stringify(ajeno.body)).not.toContain(otro.nombre);

      const inexistente = await delDueno(request, dueno.token, otro.nombre, 99999999);
      expect(inexistente.status).toBe(404);
      expect(inexistente.body).toEqual(ajeno.body);

      expect((await delDueno(request, dueno.token, otro.nombre, 'abc')).status).toBe(400);
    });

    test('valida el formato igual que el público y no depende de X-Comercio-Id', async ({ request }) => {
      const dueno = await prepararAprobado(request, adminToken, localidadId);
      expect((await delDueno(request, dueno.token, '   ')).status).toBe(400);
      expect((await delDueno(request, dueno.token, 'x'.repeat(151))).status).toBe(400);
      expect((await delDueno(request, dueno.token, '@@@')).status).toBe(400);

      const conHeaderBasura = await delDueno(request, dueno.token, `Libre ${sufijoUnico()}`, undefined, { 'X-Comercio-Id': 'abc' });
      expect(conHeaderBasura.status).toBe(200);
    });

    test('el endpoint no figura bajo el prefijo público', async ({ request }) => {
      const respuesta = await request.get(`${API_BASE_URL}${DUENO}?nombre=Algo`);
      expect(respuesta.status()).toBe(401);
    });
  });
});
