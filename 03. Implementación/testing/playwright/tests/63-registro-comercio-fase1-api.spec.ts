import { test, expect } from './helpers/prueba';
import type { APIRequestContext } from '@playwright/test';
import {
  aceptarInvitacion,
  apiConHeaders,
  apiGet,
  apiPost,
  buscarComercioPendientePorEmail,
  cuentaNuevaInvitacion,
  diaDeHoy,
  fijarPasswordAdminYLoguear,
  generarCuit,
  generarDni,
  generarTelefono,
  invitarEmpleado,
  login,
  marcarAptoVenta,
  nombreUsuarioUnico,
  obtenerCodigoInvitacionTest,
  obtenerLocalidadRioGrande,
  payloadAltaAdicional,
  registrarYVerificarCliente,
  registrarYVerificarComercio,
  resolverComercio,
  sqlTest as sql,
  subirFotoNuevoComercio,
  subirFotoPreRegistro,
  sufijoUnico,
} from './helpers/backend';

const USHUAIA = '94015020';
const TOLHUIN = '94011010';
const LAGUNA_ESCONDIDA = '94015010';
const PUERTO_ARGENTINO = '94021010';
const CIUDAD_DE_BUENOS_AIRES = '02014010';
const INEXISTENTE = '99999999';
const MENSAJE_TERMINOS = 'Tenés que aceptar los Términos y Condiciones';
const MENSAJE_LOCALIDAD = 'Esa localidad todavía no está disponible';
const FUERA_DE_LA_LISTA = [LAGUNA_ESCONDIDA, PUERTO_ARGENTINO, CIUDAD_DE_BUENOS_AIRES];

interface DuenoPreparado {
  token: string;
  duenoId: number;
  comercioId: number;
  email: string;
}

let localidadRioGrande: string;
let adminToken: string;
let fotoRegistro: string;

async function cuerpoComercio(localidadId: string, extra: Record<string, unknown> = {}) {
  const suf = sufijoUnico();
  return {
    fotoPerfilUrl: fotoRegistro,
    aceptaTerminos: true,
    razonSocial: `Razon Fase Uno ${suf}`,
    cuit: generarCuit(),
    condicionIva: 'RESPONSABLE_INSCRIPTO',
    tipoSociedad: 'SRL',
    domicilioFiscal: 'Av. San Martín 100',
    fechaInicioActividades: '2020-01-01',
    nombre: `Fase Uno E2E ${suf}`,
    descripcion: 'Comercio generado por el spec de la Fase 1 del registro',
    telefono: `+549${generarTelefono()}`,
    tipoComercio: 'RESTAURANTE',
    aceptaDelivery: true,
    aceptaRetiro: false,
    nombreUsuario: nombreUsuarioUnico('fu'),
    email: `fase1.e2e.${suf}@bajonea.test`,
    password: 'Testing123',
    direccion: { calle: 'Av. San Martín', numero: '100', pisoDepto: null, codigoPostal: '9420', localidadId, principal: true },
    horarios: [{ diaSemana: diaDeHoy(), horaApertura: '00:00', horaCierre: '23:59' }],
    redesSociales: [{ tipo: 'INSTAGRAM', url: `https://instagram.com/fase1.e2e.${suf}` }],
    nombreRepresentante: 'Representante',
    apellidoRepresentante: 'Playwright',
    dniRepresentante: generarDni(),
    telefonoRepresentante: `+549${generarTelefono()}`,
    fechaNacimientoRepresentante: '1985-03-15',
    ...extra,
  };
}

function cuerpoCliente(localidadId: string) {
  const suf = sufijoUnico();
  return {
    nombre: 'Clienta',
    apellido: 'Fase Uno',
    dni: generarDni(),
    fechaNacimiento: '1995-05-20',
    telefono: `+549${generarTelefono()}`,
    nombreUsuario: nombreUsuarioUnico('cli'),
    email: `cliente.fase1.${suf}@bajonea.test`,
    password: 'Testing123',
    aceptaTerminos: true,
    direccion: { calle: 'Calle Siempre Viva', numero: '123', pisoDepto: null, codigoPostal: '9420', localidadId, principal: true },
  };
}

async function prepararDueno(request: APIRequestContext, aprobar: boolean): Promise<DuenoPreparado> {
  const comercio = await registrarYVerificarComercio(request, localidadRioGrande, {
    nombre: `Dueno Fase Uno ${sufijoUnico()}`,
    horarios: [{ diaSemana: diaDeHoy(), horaApertura: '00:00', horaCierre: '23:59' }],
    aceptaDelivery: false,
    aceptaRetiro: true,
  });
  const pendiente = await buscarComercioPendientePorEmail(request, adminToken, comercio.email);
  if (aprobar) {
    await resolverComercio(request, adminToken, pendiente.id, true);
  } else {
    await resolverComercio(request, adminToken, pendiente.id, false, 'Rechazo de fixture de la Fase 1');
  }
  const sesion = await login(request, comercio.nombreUsuario, comercio.password);
  return { token: sesion.token, duenoId: sesion.usuario.id, comercioId: pendiente.id, email: comercio.email };
}

function payloadReSolicitud(correccion: any, cambios: Record<string, unknown> = {}) {
  return {
    nombre: correccion.nombre,
    descripcion: correccion.descripcion,
    telefono: correccion.telefono,
    tipoComercio: correccion.tipoComercio,
    aceptaDelivery: correccion.aceptaDelivery,
    aceptaRetiro: correccion.aceptaRetiro,
    fotoPerfilUrl: correccion.fotoPerfilUrl,
    direccion: {
      calle: correccion.direccion.calle,
      numero: correccion.direccion.numero,
      pisoDepto: correccion.direccion.pisoDepto,
      codigoPostal: correccion.direccion.codigoPostal,
      localidadId: correccion.direccion.localidadId,
      principal: false,
    },
    horarios: correccion.horarios.map((h: any) => ({ diaSemana: h.diaSemana, horaApertura: h.horaApertura, horaCierre: h.horaCierre })),
    redesSociales: correccion.redesSociales.map((r: any) => ({ tipo: r.tipo, url: r.url })),
    tokenVersion: correccion.tokenVersion,
    ...cambios,
  };
}

function reSolicitar(request: APIRequestContext, dueno: DuenoPreparado, cuerpo: unknown) {
  return apiConHeaders(request, 'PUT', `/comercios/${dueno.comercioId}/resolicitud`, dueno.token, {}, cuerpo);
}

test.describe('Registro de Comercio, Fase 1: datos legales, email, términos y geografía (API)', () => {
  test.beforeAll(async ({ request }) => {
    localidadRioGrande = await obtenerLocalidadRioGrande(request);
    adminToken = (await fijarPasswordAdminYLoguear(request)).token;
    fotoRegistro = await subirFotoPreRegistro(request, 'comercio');
  });

  test.describe('datos legales opcionales', () => {
    test('se registra sin razón social, tipo de sociedad, condición ante el IVA ni fecha de inicio', async ({ request }) => {
      const cuerpo = await cuerpoComercio(localidadRioGrande, {
        razonSocial: undefined,
        tipoSociedad: undefined,
        condicionIva: undefined,
        fechaInicioActividades: undefined,
      });
      const respuesta = await apiPost(request, '/auth/registro/comercio', cuerpo);
      expect(respuesta.status, JSON.stringify(respuesta.body)).toBe(201);
      const usuarioId = respuesta.body.data.id;
      expect(
        sql(`SELECT CONCAT(razon_social IS NULL, condicion_iva IS NULL, tipo_sociedad IS NULL, fecha_inicio_actividades IS NULL) FROM persona_juridica WHERE id = ${usuarioId};`),
      ).toBe('1111');
      expect(sql(`SELECT CONCAT(cuit, '|', domicilio_fiscal) FROM persona_juridica WHERE id = ${usuarioId};`)).toBe(`${cuerpo.cuit}|Av. San Martín 100`);
    });

    test('una razón social vacía o en blanco se guarda como nula', async ({ request }) => {
      for (const razonSocial of ['', '    ']) {
        const respuesta = await apiPost(request, '/auth/registro/comercio', await cuerpoComercio(localidadRioGrande, { razonSocial }));
        expect(respuesta.status, JSON.stringify(respuesta.body)).toBe(201);
        expect(sql(`SELECT razon_social IS NULL FROM persona_juridica WHERE id = ${respuesta.body.data.id};`)).toBe('1');
      }
    });

    test('con los datos legales completos se siguen guardando', async ({ request }) => {
      const respuesta = await apiPost(request, '/auth/registro/comercio', await cuerpoComercio(localidadRioGrande, { razonSocial: 'mi razon srl' }));
      expect(respuesta.status, JSON.stringify(respuesta.body)).toBe(201);
      expect(sql(`SELECT CONCAT(razon_social, '|', condicion_iva, '|', tipo_sociedad, '|', fecha_inicio_actividades) FROM persona_juridica WHERE id = ${respuesta.body.data.id};`)).toBe(
        'Mi Razon Srl|RESPONSABLE_INSCRIPTO|SRL|2020-01-01',
      );
    });

    test('si vienen se validan; el CUIT, el domicilio fiscal y el representante siguen siendo obligatorios', async ({ request }) => {
      const invalidos: Array<[Record<string, unknown>, string, string]> = [
        [{ razonSocial: '####' }, 'razonSocial', 'La razón social no puede contener solo caracteres especiales'],
        [{ razonSocial: 'R'.repeat(151) }, 'razonSocial', 'La razón social no puede superar los 150 caracteres'],
        [{ fechaInicioActividades: '2099-01-01' }, 'fechaInicioActividades', 'La fecha ingresada no es válida'],
        [{ cuit: undefined }, 'cuit', 'El CUIT es obligatorio'],
        [{ domicilioFiscal: undefined }, 'domicilioFiscal', 'El domicilio fiscal es obligatorio'],
        [{ nombreRepresentante: undefined }, 'nombreRepresentante', 'El nombre es obligatorio'],
        [{ apellidoRepresentante: undefined }, 'apellidoRepresentante', 'El apellido es obligatorio'],
        [{ dniRepresentante: undefined }, 'dniRepresentante', 'El DNI es obligatorio'],
        [{ telefonoRepresentante: undefined }, 'telefonoRepresentante', 'El teléfono es obligatorio'],
        [{ fechaNacimientoRepresentante: undefined }, 'fechaNacimientoRepresentante', 'La fecha de nacimiento es obligatoria'],
      ];
      for (const [cambios, campo, mensaje] of invalidos) {
        const respuesta = await apiPost(request, '/auth/registro/comercio', await cuerpoComercio(localidadRioGrande, cambios));
        expect(respuesta.status, campo).toBe(400);
        expect(respuesta.body.data[campo], campo).toBe(mensaje);
      }
    });
  });

  test.describe('email del comercio', () => {
    test('se registra sin email de contacto y la columna queda nula', async ({ request }) => {
      const respuesta = await apiPost(request, '/auth/registro/comercio', await cuerpoComercio(localidadRioGrande));
      expect(respuesta.status, JSON.stringify(respuesta.body)).toBe(201);
      expect(sql(`SELECT email IS NULL FROM comercio WHERE dueno_id = ${respuesta.body.data.id};`)).toBe('1');
    });

    test('un emailContacto que llegue en el cuerpo se ignora', async ({ request }) => {
      const respuesta = await apiPost(request, '/auth/registro/comercio', await cuerpoComercio(localidadRioGrande, { emailContacto: 'ignorado@bajonea.test' }));
      expect(respuesta.status, JSON.stringify(respuesta.body)).toBe(201);
      expect(sql(`SELECT email IS NULL FROM comercio WHERE dueno_id = ${respuesta.body.data.id};`)).toBe('1');
    });

    test('el perfil del Dueño, el catálogo público y el Administrador no traen el email; el público tampoco la razón social', async ({ request }) => {
      const dueno = await prepararDueno(request, true);
      await marcarAptoVenta(request, dueno.comercioId);

      const perfil = await apiConHeaders(request, 'GET', '/comercios/perfil', dueno.token, { 'X-Comercio-Id': String(dueno.comercioId) });
      expect(perfil.status).toBe(200);
      expect(Object.keys(perfil.body.data)).not.toContain('emailContacto');

      const catalogo = await apiGet(request, '/catalogo/comercios');
      expect(catalogo.status).toBe(200);
      const publico = (catalogo.body.data as any[]).find((c) => c.id === dueno.comercioId);
      expect(publico).toBeTruthy();
      expect(Object.keys(publico)).not.toContain('emailContacto');
      expect(Object.keys(publico)).not.toContain('razonSocial');
      expect(Object.keys(publico)).not.toContain('cuit');

      const nuevo = await apiPost(request, '/auth/registro/comercio', await cuerpoComercio(localidadRioGrande));
      const pendiente = await buscarComercioPendientePorEmail(request, adminToken, nuevo.body.data.email);
      const detalle = (await apiGet(request, '/administrador/comercios/pendientes', adminToken)).body.data.find((c: any) => c.id === pendiente.id);
      expect(Object.keys(detalle)).toContain('emailContacto');
      expect(detalle.emailContacto).toBeNull();
    });

    test('PUT /comercios/perfil no pide el email y no toca el que había', async ({ request }) => {
      const dueno = await prepararDueno(request, true);
      sql(`UPDATE comercio SET email = 'viejo.contacto@bajonea.test' WHERE id = ${dueno.comercioId};`);

      const editado = await apiConHeaders(
        request,
        'PUT',
        '/comercios/perfil',
        dueno.token,
        { 'X-Comercio-Id': String(dueno.comercioId) },
        { nombre: `Dueno Fase Uno Editado ${sufijoUnico()}`, descripcion: 'Descripción nueva', telefono: `+549${generarTelefono()}`, aceptaDelivery: false, aceptaRetiro: true },
      );
      expect(editado.status, JSON.stringify(editado.body)).toBe(200);
      expect(Object.keys(editado.body.data)).not.toContain('emailContacto');
      expect(sql(`SELECT email FROM comercio WHERE id = ${dueno.comercioId};`)).toBe('viejo.contacto@bajonea.test');
    });
  });

  test.describe('Términos y Condiciones', () => {
    test('el registro de Comercio sin aceptaTerminos, con false o con null da 400 con el error por campo', async ({ request }) => {
      for (const aceptaTerminos of [undefined, false, null]) {
        const respuesta = await apiPost(request, '/auth/registro/comercio', await cuerpoComercio(localidadRioGrande, { aceptaTerminos }));
        expect(respuesta.status, String(aceptaTerminos)).toBe(400);
        expect(respuesta.body.data.aceptaTerminos).toBe(MENSAJE_TERMINOS);
      }
    });

    test('con aceptaTerminos en true el registro da 201', async ({ request }) => {
      const respuesta = await apiPost(request, '/auth/registro/comercio', await cuerpoComercio(localidadRioGrande, { aceptaTerminos: true }));
      expect(respuesta.status, JSON.stringify(respuesta.body)).toBe(201);
    });

    test('el alta adicional pide los términos; la corrección de un rechazado no', async ({ request }) => {
      const aprobado = await prepararDueno(request, true);
      const foto = await subirFotoNuevoComercio(request, aprobado.token);
      for (const aceptaTerminos of [undefined, false]) {
        const rechazada = await apiPost(request, '/comercios', { ...payloadAltaAdicional(localidadRioGrande, foto), aceptaTerminos }, aprobado.token);
        expect(rechazada.status, String(aceptaTerminos)).toBe(400);
        expect(rechazada.body.data.aceptaTerminos).toBe(MENSAJE_TERMINOS);
      }
      const creada = await apiPost(request, '/comercios', payloadAltaAdicional(localidadRioGrande, foto), aprobado.token);
      expect(creada.status, JSON.stringify(creada.body)).toBe(201);

      const rechazado = await prepararDueno(request, false);
      const correccion = await apiConHeaders(request, 'GET', `/comercios/${rechazado.comercioId}/correccion`, rechazado.token);
      expect(correccion.status).toBe(200);
      const reenvio = await reSolicitar(request, rechazado, payloadReSolicitud(correccion.body.data, { descripcion: 'Corregido sin pedir términos' }));
      expect(reenvio.status, JSON.stringify(reenvio.body)).toBe(200);
      expect(sql(`SELECT estado FROM comercio WHERE id = ${rechazado.comercioId};`)).toBe('PENDIENTE');
    });
  });

  test.describe('geografía', () => {
    test('solo se ofrece Tierra del Fuego, con Río Grande, Tolhuin y Ushuaia', async ({ request }) => {
      const provincias = await apiGet(request, '/geografia/provincias');
      expect(provincias.status).toBe(200);
      expect((provincias.body.data as any[]).map((p) => p.id)).toEqual(['94']);

      const localidades = await apiGet(request, '/geografia/localidades?provinciaId=94');
      expect(localidades.status).toBe(200);
      expect((localidades.body.data as any[]).map((l) => `${l.id}:${l.nombre}`)).toEqual([`${localidadRioGrande}:Río Grande`, `${TOLHUIN}:Tolhuin`, `${USHUAIA}:Ushuaia`]);
    });

    test('las demás provincias, y una que no existe, no ofrecen localidades', async ({ request }) => {
      for (const provinciaId of ['02', '06', '99']) {
        const respuesta = await apiGet(request, `/geografia/localidades?provinciaId=${provinciaId}`);
        expect(respuesta.status, provinciaId).toBe(200);
        expect(respuesta.body.data, provinciaId).toEqual([]);
      }
    });

    test('se puede registrar un Cliente y un Comercio en Ushuaia y en Tolhuin', async ({ request }) => {
      for (const localidadId of [USHUAIA, TOLHUIN]) {
        const cliente = await apiPost(request, '/auth/registro/cliente', cuerpoCliente(localidadId));
        expect(cliente.status, `cliente ${localidadId}: ${JSON.stringify(cliente.body)}`).toBe(201);
        const comercio = await apiPost(request, '/auth/registro/comercio', await cuerpoComercio(localidadId));
        expect(comercio.status, `comercio ${localidadId}: ${JSON.stringify(comercio.body)}`).toBe(201);
      }
    });

    test('el registro de Cliente rechaza una localidad fuera de la lista con el error por campo y una inexistente con 404', async ({ request }) => {
      for (const localidadId of FUERA_DE_LA_LISTA) {
        const cuerpo = cuerpoCliente(localidadId);
        const respuesta = await apiPost(request, '/auth/registro/cliente', cuerpo);
        expect(respuesta.status, localidadId).toBe(400);
        expect(respuesta.body.data['direccion.localidadId'], localidadId).toBe(MENSAJE_LOCALIDAD);
        expect(sql(`SELECT COUNT(*) FROM usuario WHERE email = '${cuerpo.email}';`)).toBe('0');
      }
      const inexistente = await apiPost(request, '/auth/registro/cliente', cuerpoCliente(INEXISTENTE));
      expect(inexistente.status).toBe(404);
    });

    test('el registro de Comercio rechaza una localidad fuera de la lista y una inexistente', async ({ request }) => {
      for (const localidadId of FUERA_DE_LA_LISTA) {
        const cuerpo = await cuerpoComercio(localidadId);
        const respuesta = await apiPost(request, '/auth/registro/comercio', cuerpo);
        expect(respuesta.status, localidadId).toBe(400);
        expect(respuesta.body.data['direccion.localidadId'], localidadId).toBe(MENSAJE_LOCALIDAD);
        expect(sql(`SELECT COUNT(*) FROM usuario WHERE email = '${cuerpo.email}';`)).toBe('0');
      }
      const inexistente = await apiPost(request, '/auth/registro/comercio', await cuerpoComercio(INEXISTENTE));
      expect(inexistente.status).toBe(404);
    });

    test('el alta adicional rechaza una localidad fuera de la lista y acepta Tolhuin', async ({ request }) => {
      const dueno = await prepararDueno(request, true);
      const foto = await subirFotoNuevoComercio(request, dueno.token);
      for (const localidadId of FUERA_DE_LA_LISTA) {
        const respuesta = await apiPost(request, '/comercios', payloadAltaAdicional(localidadId, foto), dueno.token);
        expect(respuesta.status, localidadId).toBe(400);
        expect(respuesta.body.data['direccion.localidadId'], localidadId).toBe(MENSAJE_LOCALIDAD);
      }
      const inexistente = await apiPost(request, '/comercios', payloadAltaAdicional(INEXISTENTE, foto), dueno.token);
      expect(inexistente.status).toBe(404);
      const tolhuin = await apiPost(request, '/comercios', payloadAltaAdicional(TOLHUIN, foto), dueno.token);
      expect(tolhuin.status, JSON.stringify(tolhuin.body)).toBe(201);
    });

    test('la corrección de un rechazado rechaza una localidad fuera de la lista y no gasta un intento', async ({ request }) => {
      const dueno = await prepararDueno(request, false);
      const correccion = await apiConHeaders(request, 'GET', `/comercios/${dueno.comercioId}/correccion`, dueno.token);
      expect(correccion.status).toBe(200);
      const intentosAntes = sql(`SELECT cantidad_resolicitudes FROM comercio WHERE id = ${dueno.comercioId};`);
      for (const localidadId of FUERA_DE_LA_LISTA) {
        const cuerpo = payloadReSolicitud(correccion.body.data, { descripcion: 'Con otra localidad' });
        (cuerpo.direccion as any).localidadId = localidadId;
        const respuesta = await reSolicitar(request, dueno, cuerpo);
        expect(respuesta.status, localidadId).toBe(400);
        expect(respuesta.body.data['direccion.localidadId'], localidadId).toBe(MENSAJE_LOCALIDAD);
      }
      expect(sql(`SELECT cantidad_resolicitudes FROM comercio WHERE id = ${dueno.comercioId};`)).toBe(intentosAntes);
      expect(sql(`SELECT estado FROM comercio WHERE id = ${dueno.comercioId};`)).toBe('RECHAZADO');
    });

    test('el alta por invitación rechaza una localidad fuera de la lista con el prefijo cuentaNueva y no gasta la invitación', async ({ request }) => {
      const dueno = await prepararDueno(request, true);
      const email = `invitada.fase1.${sufijoUnico()}@bajonea.test`;
      const invitacion = await invitarEmpleado(request, dueno.token, dueno.comercioId, email);
      expect(invitacion.status, JSON.stringify(invitacion.body)).toBe(201);
      const codigo = await obtenerCodigoInvitacionTest(request, email, dueno.comercioId);

      for (const localidadId of FUERA_DE_LA_LISTA) {
        const respuesta = await aceptarInvitacion(request, { email, codigo, aceptaTerminos: true, cuentaNueva: cuentaNuevaInvitacion(localidadId) });
        expect(respuesta.status, localidadId).toBe(400);
        expect(respuesta.body.data['cuentaNueva.direccion.localidadId'], localidadId).toBe(MENSAJE_LOCALIDAD);
      }
      const nombreUsuario = nombreUsuarioUnico('emp');
      const aceptada = await aceptarInvitacion(request, {
        email,
        codigo,
        aceptaTerminos: true,
        cuentaNueva: cuentaNuevaInvitacion(TOLHUIN, { nombreUsuario }),
      });
      expect(aceptada.status, JSON.stringify(aceptada.body)).toBe(200);
      expect(sql(`SELECT COUNT(*) FROM usuario WHERE nombre_usuario = '${nombreUsuario}';`)).toBe('1');
    });

    test('las direcciones ya guardadas fuera de la lista se siguen leyendo', async ({ request }) => {
      const cliente = await registrarYVerificarCliente(request, localidadRioGrande);
      sql(
        `UPDATE direccion d JOIN usuario u ON u.id = d.cliente_id SET d.localidad_id = '${LAGUNA_ESCONDIDA}' WHERE u.email = '${cliente.email}';`,
      );
      const sesion = await login(request, cliente.nombreUsuario, cliente.password);
      const perfil = await apiGet(request, '/clientes/perfil', sesion.token);
      expect(perfil.status).toBe(200);
      expect(JSON.stringify(perfil.body.data.direccion)).toContain('Laguna Escondida');
    });
  });
});
