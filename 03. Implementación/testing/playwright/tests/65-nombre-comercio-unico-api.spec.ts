import { test, expect } from './helpers/prueba';
import type { APIRequestContext } from '@playwright/test';
import {
  apiConHeaders,
  apiPost,
  diaDeHoy,
  fijarPasswordAdminYLoguear,
  generarCuit,
  generarDni,
  generarTelefono,
  nombreUsuarioUnico,
  obtenerLocalidadRioGrande,
  registrarComercioAdicional,
  sqlTest as sql,
  subirFotoNuevoComercio,
  subirFotoPreRegistro,
  sufijoUnico,
} from './helpers/backend';
import { correccionDe, payloadDesde, prepararAprobado, prepararRechazado, reenviar, estadoDe } from './helpers/multicomercio';

const MENSAJE = 'Ya existe un comercio con ese nombre. Elegí otro.';

let localidadId: string;
let adminToken: string;
let fotoRegistro: string;

function cuerpoComercio(nombre: string, extra: Record<string, unknown> = {}) {
  const suf = sufijoUnico();
  return {
    fotoPerfilUrl: fotoRegistro,
    aceptaTerminos: true,
    cuit: generarCuit(),
    domicilioFiscal: 'Av. San Martín 100',
    nombre,
    descripcion: 'Comercio generado por el spec del nombre único',
    telefono: `+549${generarTelefono()}`,
    tipoComercio: 'RESTAURANTE',
    aceptaDelivery: true,
    aceptaRetiro: false,
    nombreUsuario: nombreUsuarioUnico('nu'),
    email: `nombre.unico.${suf}@bajonea.test`,
    password: 'Testing123',
    direccion: { calle: 'Av. San Martín', numero: '100', pisoDepto: null, codigoPostal: '9420', localidadId, principal: true },
    horarios: [{ diaSemana: diaDeHoy(), horaApertura: '00:00', horaCierre: '23:59' }],
    redesSociales: [{ tipo: 'INSTAGRAM', url: `https://instagram.com/nombre.unico.${suf}` }],
    nombreRepresentante: 'Representante',
    apellidoRepresentante: 'Playwright',
    dniRepresentante: generarDni(),
    telefonoRepresentante: `+549${generarTelefono()}`,
    fechaNacimientoRepresentante: '1985-03-15',
    ...extra,
  };
}

const registrar = (request: APIRequestContext, nombre: string, extra: Record<string, unknown> = {}) =>
  apiPost(request, '/auth/registro/comercio', cuerpoComercio(nombre, extra));

const perfil = (request: APIRequestContext, token: string, comercioId: number, nombre: string) =>
  apiConHeaders(request, 'PUT', '/comercios/perfil', token, { 'X-Comercio-Id': String(comercioId) }, {
    nombre,
    descripcion: 'Descripción de prueba',
    telefono: '+5492964123456',
    aceptaDelivery: true,
    aceptaRetiro: false,
  });

const nombreEnBase = (comercioId: number): string => sql(`SELECT nombre FROM comercio WHERE id = ${comercioId};`);

test.describe('Nombre único de comercio (API)', () => {
  test.beforeAll(async ({ request }) => {
    localidadId = await obtenerLocalidadRioGrande(request);
    adminToken = (await fijarPasswordAdminYLoguear(request)).token;
    fotoRegistro = await subirFotoPreRegistro(request, 'comercio');
  });

  test.describe('registro', () => {
    test('un nombre ya tomado da 409 con el mensaje y no deja ni usuario ni comercio; reintentar con otro nombre da 201', async ({ request }) => {
      const nombre = `Cafetería Ñandú ${sufijoUnico()}`;
      expect((await registrar(request, nombre)).status).toBe(201);

      const segundo = cuerpoComercio(nombre);
      const rechazado = await apiPost(request, '/auth/registro/comercio', segundo);
      expect(rechazado.status).toBe(409);
      expect(rechazado.body.mensaje).toBe(MENSAJE);
      expect(sql(`SELECT COUNT(*) FROM usuario WHERE email = '${segundo.email}';`)).toBe('0');
      expect(sql(`SELECT COUNT(*) FROM usuario WHERE nombre_usuario = '${segundo.nombreUsuario}';`)).toBe('0');

      const conOtroNombre = await apiPost(request, '/auth/registro/comercio', { ...segundo, nombre: `${nombre} Dos` });
      expect(conOtroNombre.status).toBe(201);
    });

    test('mayúsculas, tildes, la ñ como n, espacios de más y tabulaciones no evitan el duplicado', async ({ request }) => {
      const sufijo = sufijoUnico();
      expect((await registrar(request, `Cafetería Ñandú ${sufijo}`)).status).toBe(201);
      const variantes = [
        `CAFETERÍA ÑANDÚ ${sufijo}`,
        `cafeteria nandu ${sufijo}`,
        `  Cafetería    Ñandú   ${sufijo}  `,
        `Cafetería\tÑandú\t${sufijo}`,
        `CAFETERIA NANDU ${sufijo}`,
      ];
      for (const variante of variantes) {
        const respuesta = await registrar(request, variante);
        expect(respuesta.status, JSON.stringify(variante)).toBe(409);
        expect(respuesta.body.mensaje).toBe(MENSAJE);
      }
    });

    test('un nombre distinto no choca aunque se parezca', async ({ request }) => {
      const sufijo = sufijoUnico();
      expect((await registrar(request, `Panadería Sol ${sufijo}`)).status).toBe(201);
      expect((await registrar(request, `Panadería Sol ${sufijo} Norte`)).status).toBe(201);
    });

    test('un error de validación gana al conflicto de nombre y el email repetido conserva su mensaje', async ({ request }) => {
      const nombre = `Local Orden ${sufijoUnico()}`;
      const primero = cuerpoComercio(nombre);
      expect((await apiPost(request, '/auth/registro/comercio', primero)).status).toBe(201);

      const sinHorarios = await registrar(request, nombre, { horarios: [] });
      expect(sinHorarios.status).toBe(400);

      const mismoEmail = await registrar(request, nombre, { email: primero.email });
      expect(mismoEmail.status).toBe(409);
      expect(mismoEmail.body.mensaje).not.toBe(MENSAJE);
    });

    test('un RECHAZADO retiene su nombre para cualquier registro nuevo', async ({ request }) => {
      const nombre = `Retenido ${sufijoUnico()}`;
      const rechazado = await prepararRechazado(request, adminToken, localidadId, undefined, nombre);
      expect(estadoDe(rechazado.comercioId)).toBe('RECHAZADO');

      const respuesta = await registrar(request, nombre);
      expect(respuesta.status).toBe(409);
      expect(respuesta.body.mensaje).toBe(MENSAJE);
    });

    test('un RECHAZO_DEFINITIVO libera el nombre y ya no se puede volver a tomar', async ({ request }) => {
      const nombre = `Liberado ${sufijoUnico()}`;
      const rechazado = await prepararRechazado(request, adminToken, localidadId, undefined, nombre);
      sql(`UPDATE comercio SET estado = 'RECHAZO_DEFINITIVO' WHERE id = ${rechazado.comercioId};`);

      expect((await registrar(request, nombre)).status).toBe(201);
      expect((await registrar(request, nombre)).status).toBe(409);
    });

    for (const cantidad of [2, 3, 6]) {
      test(`${cantidad} registros simultáneos del mismo nombre: uno gana, el resto da 409 y nadie queda a medias`, async ({ request }) => {
        const nombre = `Carrera ${cantidad} ${sufijoUnico()}`;
        const cuerpos = Array.from({ length: cantidad }, (_, i) =>
          cuerpoComercio(i % 2 === 0 ? nombre : nombre.toUpperCase()),
        );
        const respuestas = await Promise.all(cuerpos.map((cuerpo) => apiPost(request, '/auth/registro/comercio', cuerpo)));

        const estados = respuestas.map((r) => r.status).sort();
        expect(estados.filter((s) => s === 201), JSON.stringify(estados)).toHaveLength(1);
        expect(estados.filter((s) => s === 409), JSON.stringify(estados)).toHaveLength(cantidad - 1);
        for (const perdedora of respuestas.filter((r) => r.status === 409)) {
          expect(perdedora.body.mensaje).toBe(MENSAJE);
        }
        const ganadora = cuerpos[respuestas.findIndex((r) => r.status === 201)];
        for (const [i, cuerpo] of cuerpos.entries()) {
          const existe = sql(`SELECT COUNT(*) FROM usuario WHERE email = '${cuerpo.email}';`);
          expect(existe, `cuerpo ${i}`).toBe(cuerpo === ganadora ? '1' : '0');
        }
      });
    }
  });

  test.describe('alta adicional', () => {
    test('el nombre de un comercio de otro Dueño da 409, en cualquier dirección y sin importar las mayúsculas', async ({ request }) => {
      const ajeno = await prepararAprobado(request, adminToken, localidadId);
      const dueno = await prepararAprobado(request, adminToken, localidadId);
      const foto = await subirFotoNuevoComercio(request, dueno.token);

      const igual = await registrarComercioAdicional(request, dueno.token, localidadId, { fotoPerfilUrl: foto, nombre: ajeno.nombre });
      expect(igual.status).toBe(409);
      expect(igual.body.mensaje).toBe(MENSAJE);

      const otraDireccion = await registrarComercioAdicional(request, dueno.token, localidadId, {
        fotoPerfilUrl: foto,
        nombre: ajeno.nombre.toUpperCase(),
        direccion: { calle: 'Otra Calle', numero: '4321', pisoDepto: '5A', codigoPostal: '9420', localidadId, principal: false },
      });
      expect(otraDireccion.status).toBe(409);
    });

    test('un nombre libre se acepta, aunque ya tenga un comercio en la misma dirección', async ({ request }) => {
      const dueno = await prepararAprobado(request, adminToken, localidadId);
      const foto = await subirFotoNuevoComercio(request, dueno.token);
      const respuesta = await registrarComercioAdicional(request, dueno.token, localidadId, {
        fotoPerfilUrl: foto,
        nombre: `Sucursal Libre ${sufijoUnico()}`,
      });
      expect(respuesta.status).toBe(201);
    });
  });

  test.describe('corrección de un rechazado', () => {
    test('conservar el propio nombre no es un duplicado; tomar el de otro comercio da 409', async ({ request }) => {
      const dueno = await prepararRechazado(request, adminToken, localidadId);
      const ajeno = await prepararAprobado(request, adminToken, localidadId);

      const { body } = await correccionDe(request, dueno.token, dueno.comercioId);
      const choque = await reenviar(request, dueno.token, dueno.comercioId, payloadDesde(body.data, { nombre: ajeno.nombre.toUpperCase() }));
      expect(choque.status).toBe(409);
      expect(choque.body.mensaje).toBe(MENSAJE);
      expect(estadoDe(dueno.comercioId)).toBe('RECHAZADO');

      const propio = await correccionDe(request, dueno.token, dueno.comercioId);
      const exito = await reenviar(request, dueno.token, dueno.comercioId, payloadDesde(propio.body.data, { descripcion: 'Mismo nombre, otra descripción' }));
      expect(exito.status).toBe(200);
      expect(estadoDe(dueno.comercioId)).toBe('PENDIENTE');
    });
  });

  test.describe('edición del perfil', () => {
    test('renombrar a un nombre ajeno da 409 y no cambia nada', async ({ request }) => {
      const ajeno = await prepararAprobado(request, adminToken, localidadId);
      const dueno = await prepararAprobado(request, adminToken, localidadId);
      const antes = nombreEnBase(dueno.comercioId);

      const respuesta = await perfil(request, dueno.token, dueno.comercioId, ajeno.nombre.toLowerCase());
      expect(respuesta.status).toBe(409);
      expect(respuesta.body.mensaje).toBe(MENSAJE);
      expect(nombreEnBase(dueno.comercioId)).toBe(antes);
    });

    test('cambiar solo las mayúsculas del propio nombre y renombrar a uno libre se aceptan', async ({ request }) => {
      const dueno = await prepararAprobado(request, adminToken, localidadId);
      const propio = nombreEnBase(dueno.comercioId);

      expect((await perfil(request, dueno.token, dueno.comercioId, propio.toUpperCase())).status).toBe(200);

      const libre = `Nombre Libre ${sufijoUnico()}`;
      expect((await perfil(request, dueno.token, dueno.comercioId, libre)).status).toBe(200);
      expect(nombreEnBase(dueno.comercioId)).toBe(libre);

      const otro = await prepararAprobado(request, adminToken, localidadId);
      expect((await perfil(request, otro.token, otro.comercioId, propio)).status).toBe(200);
    });

    test('dos renombres simultáneos al mismo nombre: uno gana y el otro da 409', async ({ request }) => {
      const a = await prepararAprobado(request, adminToken, localidadId);
      const b = await prepararAprobado(request, adminToken, localidadId);
      const nombre = `Renombre Carrera ${sufijoUnico()}`;

      const [ra, rb] = await Promise.all([
        perfil(request, a.token, a.comercioId, nombre),
        perfil(request, b.token, b.comercioId, nombre.toUpperCase()),
      ]);
      expect([ra.status, rb.status].sort()).toEqual([200, 409]);
      const perdedora = ra.status === 409 ? ra : rb;
      expect(perdedora.body.mensaje).toBe(MENSAJE);
    });
  });
});
