import { test, expect } from '@playwright/test';
import type { APIRequestContext } from '@playwright/test';
import {
  aTitleCase,
  apiConHeaders,
  buscarComercioPendientePorEmail,
  clonarComercioTest,
  crearCategoria,
  diaDeHoy,
  diaDistintoDeHoy,
  fijarPasswordAdminYLoguear,
  generarCuit,
  generarDni,
  login,
  marcarAptoVenta,
  obtenerCodigoTest,
  obtenerLocalidadRioGrande,
  payloadAltaAdicional,
  registrarComercioAdicional,
  registrarYVerificarCliente,
  registrarYVerificarComercio,
  resolverComercio,
  sqlTest as sql,
  subirFotoCorreccionComercio,
  subirFotoNuevoComercio,
  subirFotoPreRegistro,
  sufijoUnico,
  vincularMercadoPagoSimuladoTest,
} from './helpers/backend';

const HEADER = 'X-Comercio-Id';
const MOTIVO_RECHAZO = 'Falta información del local';
const MOTIVO_RESOLICITUD = 'Nueva solicitud del Dueño';
const MOTIVO_MP = 'Vinculación automática de cuenta de Mercado Pago';
const MENSAJE_SIN_CAMBIOS = 'Modificá al menos un dato antes de volver a solicitar';
const MENSAJE_VERSION = 'La solicitud cambió desde que abriste la corrección. Volvé a abrirla para continuar';
const MENSAJE_YA_ENVIADO = 'Este comercio ya fue enviado nuevamente a revisión';
const MENSAJE_LEGALES = 'No podés modificar los datos fiscales ni del representante';
const MENSAJE_DUPLICADO =
  'Ya tenés un comercio con ese nombre en esa dirección. Si es otro local del mismo edificio, agregá el piso o número de local.';
const MENSAJE_NO_ELEGIBLE = 'Para agregar un nuevo comercio, necesitás tener al menos uno aprobado previamente';
const DIAS = ['LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO', 'DOMINGO'];
const ETIQUETA_DIA: Record<string, string> = {
  LUNES: 'Lunes',
  MARTES: 'Martes',
  MIERCOLES: 'Miércoles',
  JUEVES: 'Jueves',
  VIERNES: 'Viernes',
  SABADO: 'Sábado',
  DOMINGO: 'Domingo',
};

interface Dueno {
  token: string;
  duenoId: number;
  email: string;
  nombreUsuario: string;
  password: string;
  comercioId: number;
  nombre: string;
}

interface Franja {
  diaSemana: string;
  horaApertura: string;
  horaCierre: string;
}

let adminToken: string;
let localidadId: string;
let adminId: number;

async function registrarPendiente(request: APIRequestContext): Promise<Dueno> {
  const comercio = await registrarYVerificarComercio(request, localidadId, {
    horarios: [{ diaSemana: diaDeHoy(), horaApertura: '00:00', horaCierre: '23:59' }],
    aceptaDelivery: false,
    aceptaRetiro: true,
  });
  const pendiente = await buscarComercioPendientePorEmail(request, adminToken, comercio.email);
  const sesion = await login(request, comercio.nombreUsuario, comercio.password);
  return {
    token: sesion.token,
    duenoId: sesion.usuario.id,
    email: comercio.email,
    nombreUsuario: comercio.nombreUsuario,
    password: comercio.password,
    comercioId: pendiente.id,
    nombre: comercio.nombre,
  };
}

async function prepararRechazado(request: APIRequestContext, motivo = MOTIVO_RECHAZO): Promise<Dueno> {
  const dueno = await registrarPendiente(request);
  await resolverComercio(request, adminToken, dueno.comercioId, false, motivo);
  return dueno;
}

async function prepararAprobado(request: APIRequestContext, conMercadoPago = false): Promise<Dueno> {
  const dueno = await registrarPendiente(request);
  if (conMercadoPago) {
    await vincularMercadoPagoSimuladoTest(request, dueno.duenoId);
  }
  await resolverComercio(request, adminToken, dueno.comercioId, true);
  return dueno;
}

async function clonarConRedes(request: APIRequestContext, comercioId: number, nombre: string, estado: string): Promise<number> {
  const clonId = await clonarComercioTest(request, comercioId, nombre, estado);
  sql(
    `INSERT INTO red_social (comercio_id, tipo, url, fecha_creacion) ` +
      `SELECT ${clonId}, tipo, url, NOW() FROM red_social WHERE comercio_id = ${comercioId} AND fecha_baja IS NULL;`,
  );
  return clonId;
}

const estadoDe = (comercioId: number): string => sql(`SELECT estado FROM comercio WHERE id = ${comercioId};`);
const cantidadResolicitudesDe = (comercioId: number): number =>
  Number(sql(`SELECT cantidad_resolicitudes FROM comercio WHERE id = ${comercioId};`));

function historialDe(comercioId: number): string[] {
  const filas = sql(
    `SELECT CONCAT(estado_origen, '>', estado_destino, '|', IFNULL(administrador_id, 'sin-admin'), '|', IFNULL(motivo, '')) ` +
      `FROM historial_estado_comercio WHERE comercio_id = ${comercioId} ORDER BY id;`,
  );
  return filas ? filas.split(/\r?\n/) : [];
}

function cambiosDeLaUltimaResolicitud(comercioId: number): string[] {
  const filas = sql(
    `SELECT CONCAT(campo, '|', IFNULL(valor_anterior, '<null>'), '|', IFNULL(valor_nuevo, '<null>')) FROM historial_cambio_comercio ` +
      `WHERE historial_estado_comercio_id = (SELECT MAX(id) FROM historial_estado_comercio WHERE comercio_id = ${comercioId} AND estado_destino = 'PENDIENTE') ` +
      `ORDER BY campo;`,
  );
  return filas ? filas.split(/\r?\n/) : [];
}

const camposDeLosCambios = (comercioId: number): string[] => cambiosDeLaUltimaResolicitud(comercioId).map((fila) => fila.split('|')[0]);

function textoHorarios(franjas: Franja[]): string {
  return [...franjas]
    .sort((a, b) => DIAS.indexOf(a.diaSemana) - DIAS.indexOf(b.diaSemana) || a.horaApertura.localeCompare(b.horaApertura))
    .map((f) => `${ETIQUETA_DIA[f.diaSemana]} ${f.horaApertura.slice(0, 5)}-${f.horaCierre.slice(0, 5)}`)
    .join('; ');
}

const correccionDe = (request: APIRequestContext, token: string, comercioId: number) =>
  apiConHeaders(request, 'GET', `/comercios/${comercioId}/correccion`, token);

const reenviar = (request: APIRequestContext, token: string, comercioId: number, body: unknown) =>
  apiConHeaders(request, 'PUT', `/comercios/${comercioId}/resolicitud`, token, {}, body);

const resolverCrudo = (request: APIRequestContext, comercioId: number, cuerpo: Record<string, unknown>) =>
  apiConHeaders(request, 'PUT', `/administrador/comercios/${comercioId}/resolver`, adminToken, {}, cuerpo);

function payloadDesde(correccion: any, cambios: Record<string, unknown> = {}) {
  return {
    nombre: correccion.nombre,
    descripcion: correccion.descripcion,
    telefono: correccion.telefono,
    emailContacto: correccion.emailContacto,
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

function legalesDesde(correccion: any, cambios: Record<string, unknown> = {}) {
  const l = correccion.legales;
  return {
    razonSocial: l.razonSocial,
    cuit: l.cuit,
    condicionIva: l.condicionIva,
    tipoSociedad: l.tipoSociedad,
    domicilioFiscal: l.domicilioFiscal,
    fechaInicioActividades: l.fechaInicioActividades,
    nombreRepresentante: l.representante.nombre,
    apellidoRepresentante: l.representante.apellido,
    dniRepresentante: l.representante.dni,
    telefonoRepresentante: l.representante.telefono,
    fechaNacimientoRepresentante: l.representante.fechaNacimiento,
    ...cambios,
  };
}

async function reenviarConCambioSimple(request: APIRequestContext, dueno: Dueno, texto = `Descripción ${sufijoUnico()}`) {
  const correccion = await correccionDe(request, dueno.token, dueno.comercioId);
  expect(correccion.status).toBe(200);
  const respuesta = await reenviar(request, dueno.token, dueno.comercioId, payloadDesde(correccion.body.data, { descripcion: texto }));
  return { respuesta, correccion: correccion.body.data };
}

async function notificacionesDelComercio(request: APIRequestContext, token: string, comercioId: number) {
  const { status, body } = await apiConHeaders(request, 'GET', '/notificaciones', token, { 'X-Comercio-Id': String(comercioId) });
  expect(status).toBe(200);
  return (body.data as any[]).filter((n) => n.entidadTipo === 'COMERCIO' && n.entidadId === comercioId);
}

async function resolicitudesDelAdmin(request: APIRequestContext) {
  const { status, body } = await apiConHeaders(request, 'GET', '/administrador/comercios/resolicitudes', adminToken);
  expect(status).toBe(200);
  return body.data as any[];
}

async function pendientesDelAdmin(request: APIRequestContext) {
  const { status, body } = await apiConHeaders(request, 'GET', '/administrador/comercios/pendientes', adminToken);
  expect(status).toBe(200);
  return body.data as any[];
}

async function metricas(request: APIRequestContext) {
  const { status, body } = await apiConHeaders(request, 'GET', '/administrador/metricas', adminToken);
  expect(status).toBe(200);
  return body.data as { comerciosPendientes: number; resolicitudesPendientes: number };
}

test.describe('Multi-comercio, tramo 3A: corrección y re-solicitud de comercios rechazados (API)', () => {
  test.describe.configure({ timeout: 240_000 });

  test.beforeAll(async ({ request }) => {
    localidadId = await obtenerLocalidadRioGrande(request);
    const sesion = await fijarPasswordAdminYLoguear(request);
    adminToken = sesion.token;
    adminId = sesion.usuario.id;
  });

  test.describe('GET /comercios/{id}/correccion', () => {
    test('precarga completa de un comercio rechazado de un Dueño que nunca tuvo uno aprobado', async ({ request }) => {
      const dueno = await prepararRechazado(request);

      const { status, body } = await correccionDe(request, dueno.token, dueno.comercioId);

      expect(status).toBe(200);
      const c = body.data;
      expect(c.comercioId).toBe(dueno.comercioId);
      expect(c.nombre).toBe(dueno.nombre);
      expect(c.tipoComercio).toBe('RESTAURANTE');
      expect(c.aceptaDelivery).toBe(false);
      expect(c.aceptaRetiro).toBe(true);
      expect(c.fotoPerfilUrl).toMatch(/^https:\/\/res\.cloudinary\.com\//);
      expect(c.direccion).toMatchObject({ calle: 'Av. San Martín', numero: '100', codigoPostal: '9420', localidadId });
      expect(typeof c.direccion.provinciaId).toBe('string');
      expect(c.direccion.nombreProvincia).toContain('Tierra del Fuego');
      expect(c.horarios).toHaveLength(1);
      expect(c.redesSociales).toHaveLength(1);
      expect(c.redesSociales[0].tipo).toBe('INSTAGRAM');
      expect(c.motivoRechazo).toBe(MOTIVO_RECHAZO);
      expect(c.intentoActual).toBe(1);
      expect(c.maximoResolicitudes).toBe(3);
      expect(c.intentosRestantes).toBe(3);
      expect(c.puedeCorregirDatosLegales).toBe(true);
      expect(c.legales.cuit).toMatch(/^\d{11}$/);
      expect(c.legales.razonSocial).toContain('Razon Social E2e');
      expect(c.legales.condicionIva).toBe('RESPONSABLE_INSCRIPTO');
      expect(c.legales.tipoSociedad).toBe('SRL');
      expect(c.legales.representante).toMatchObject({ nombre: 'Representante', apellido: 'Playwright' });
      expect(c.tokenVersion).toBe(
        Number(sql(`SELECT MAX(id) FROM historial_estado_comercio WHERE comercio_id = ${dueno.comercioId} AND estado_destino = 'RECHAZADO';`)),
      );
    });

    test('404 idéntico para un comercio de otro Dueño, uno no rechazado y uno inexistente', async ({ request }) => {
      const propio = await prepararRechazado(request);
      const otro = await prepararRechazado(request);
      const pendiente = await registrarPendiente(request);
      const aprobado = await prepararAprobado(request);

      const deOtroDueno = await correccionDe(request, propio.token, otro.comercioId);
      const noRechazadoPendiente = await correccionDe(request, pendiente.token, pendiente.comercioId);
      const noRechazadoAprobado = await correccionDe(request, aprobado.token, aprobado.comercioId);
      const inexistente = await correccionDe(request, propio.token, 999_999_999);

      expect(deOtroDueno.status).toBe(404);
      expect(noRechazadoPendiente).toEqual(deOtroDueno);
      expect(noRechazadoAprobado).toEqual(deOtroDueno);
      expect(inexistente).toEqual(deOtroDueno);
    });

    test('sin token da 401 y con un Cliente da 403', async ({ request }) => {
      const dueno = await prepararRechazado(request);
      const cliente = await registrarYVerificarCliente(request, localidadId);
      const sesionCliente = await login(request, cliente.nombreUsuario, cliente.password);

      expect((await apiConHeaders(request, 'GET', `/comercios/${dueno.comercioId}/correccion`, undefined)).status).toBe(401);
      expect((await correccionDe(request, sesionCliente.token, dueno.comercioId)).status).toBe(403);
      expect((await apiConHeaders(request, 'PUT', `/comercios/${dueno.comercioId}/resolicitud`, sesionCliente.token, {}, {})).status).toBe(403);
    });

    test('un adicional rechazado de un Dueño que ya tuvo uno aprobado no puede corregir los datos legales', async ({ request }) => {
      const base = await prepararAprobado(request);
      const clonId = await clonarConRedes(request, base.comercioId, `Adicional Rechazado ${sufijoUnico()}`, 'RECHAZADO');

      const { status, body } = await correccionDe(request, base.token, clonId);

      expect(status).toBe(200);
      expect(body.data.puedeCorregirDatosLegales).toBe(false);
      expect(body.data.legales).toBeNull();
      expect(body.data.motivoRechazo).toBeNull();
      expect(body.data.tokenVersion).toBe(0);
    });

    test('la firma de la foto se genera solo para un comercio propio y rechazado, en su carpeta', async ({ request }) => {
      const dueno = await prepararRechazado(request);
      const otro = await prepararRechazado(request);
      const aprobado = await prepararAprobado(request);

      const propia = await apiConHeaders(request, 'POST', `/comercios/${dueno.comercioId}/correccion/foto/firma`, dueno.token);
      expect(propia.status).toBe(200);
      expect(propia.body.data.folder).toBe(`comercios/${dueno.comercioId}/perfil/`);

      const ajena = await apiConHeaders(request, 'POST', `/comercios/${otro.comercioId}/correccion/foto/firma`, dueno.token);
      const noRechazado = await apiConHeaders(request, 'POST', `/comercios/${aprobado.comercioId}/correccion/foto/firma`, aprobado.token);
      expect(ajena.status).toBe(404);
      expect(noRechazado).toEqual(ajena);
    });
  });

  test.describe('PUT /comercios/{id}/resolicitud', () => {
    test('un reenvío sin ningún cambio da 409 y no toca nada', async ({ request }) => {
      const dueno = await prepararRechazado(request);
      const { body } = await correccionDe(request, dueno.token, dueno.comercioId);
      const historialAntes = historialDe(dueno.comercioId);

      const respuesta = await reenviar(request, dueno.token, dueno.comercioId, payloadDesde(body.data));

      expect(respuesta.status).toBe(409);
      expect(respuesta.body.mensaje).toBe(MENSAJE_SIN_CAMBIOS);
      expect(estadoDe(dueno.comercioId)).toBe('RECHAZADO');
      expect(cantidadResolicitudesDe(dueno.comercioId)).toBe(0);
      expect(historialDe(dueno.comercioId)).toEqual(historialAntes);
    });

    test('lo que no cambia después de normalizar no cuenta: mayúsculas del nombre, espacios y descripción en blanco', async ({ request }) => {
      const dueno = await prepararRechazado(request);
      const { body } = await correccionDe(request, dueno.token, dueno.comercioId);

      const respuesta = await reenviar(
        request,
        dueno.token,
        dueno.comercioId,
        payloadDesde(body.data, {
          nombre: `  ${body.data.nombre.toUpperCase()}  `,
          telefono: ` ${body.data.telefono} `,
          direccion: { ...payloadDesde(body.data).direccion, calle: ` ${body.data.direccion.calle.toLowerCase()} `, pisoDepto: '   ' },
        }),
      );

      expect(respuesta.status).toBe(409);
      expect(respuesta.body.mensaje).toBe(MENSAJE_SIN_CAMBIOS);
    });

    test('con cambios pasa a PENDIENTE, sube el contador, deja el historial y solo los campos que cambiaron', async ({ request }) => {
      const dueno = await prepararRechazado(request);
      const { body } = await correccionDe(request, dueno.token, dueno.comercioId);
      const c = body.data;
      const otroDia = diaDistintoDeHoy();
      const horariosNuevos: Franja[] = [...c.horarios.map((h: any) => ({ diaSemana: h.diaSemana, horaApertura: h.horaApertura, horaCierre: h.horaCierre })),
        { diaSemana: otroDia, horaApertura: '10:00:00', horaCierre: '14:00:00' }];

      const respuesta = await reenviar(
        request,
        dueno.token,
        dueno.comercioId,
        payloadDesde(c, { nombre: 'nombre corregido e2e', descripcion: 'Descripción corregida', horarios: horariosNuevos }),
      );

      expect(respuesta.status).toBe(200);
      expect(respuesta.body.data.estado).toBe('PENDIENTE');
      expect(estadoDe(dueno.comercioId)).toBe('PENDIENTE');
      expect(cantidadResolicitudesDe(dueno.comercioId)).toBe(1);
      expect(sql(`SELECT fecha_resolicitud IS NOT NULL FROM comercio WHERE id = ${dueno.comercioId};`)).toBe('1');
      expect(sql(`SELECT nombre FROM comercio WHERE id = ${dueno.comercioId};`)).toBe('Nombre Corregido E2e');

      const historial = historialDe(dueno.comercioId);
      expect(historial).toHaveLength(2);
      expect(historial[0]).toBe(`PENDIENTE>RECHAZADO|${adminId}|${MOTIVO_RECHAZO}`);
      expect(historial[1]).toBe(`RECHAZADO>PENDIENTE|sin-admin|${MOTIVO_RESOLICITUD}`);

      expect(camposDeLosCambios(dueno.comercioId)).toEqual(['DESCRIPCION', 'HORARIOS', 'NOMBRE']);
      const cambios = cambiosDeLaUltimaResolicitud(dueno.comercioId);
      expect(cambios).toContain(`NOMBRE|${dueno.nombre}|Nombre Corregido E2e`);
      expect(cambios).toContain('DESCRIPCION|Comercio de prueba generado por Playwright (Fase 17)|Descripción corregida');
      expect(cambios).toContain(`HORARIOS|${textoHorarios(c.horarios)}|${textoHorarios(horariosNuevos)}`);

      const perfil = await apiConHeaders(request, 'GET', '/comercios/perfil', dueno.token, { [HEADER]: String(dueno.comercioId) });
      expect(perfil.body.data.estado).toBe('PENDIENTE');
      expect(perfil.body.data.horarios).toHaveLength(2);
    });

    test('tipo, modalidades, dirección, redes y foto: cada uno deja su cambio, la dirección se actualiza en el lugar y las redes se revisan una por una', async ({ request }) => {
      const dueno = await prepararRechazado(request);
      const { body } = await correccionDe(request, dueno.token, dueno.comercioId);
      const c = body.data;
      const direccionId = c.direccion.id;
      const foto = await subirFotoCorreccionComercio(request, dueno.token, dueno.comercioId);
      const urlInstagram = 'https://instagram.com/corregido.e2e';
      const urlFacebook = 'https://facebook.com/corregido.e2e';

      const respuesta = await reenviar(
        request,
        dueno.token,
        dueno.comercioId,
        payloadDesde(c, {
          tipoComercio: 'EMPRENDIMIENTO',
          aceptaDelivery: true,
          aceptaRetiro: true,
          fotoPerfilUrl: foto,
          telefono: '+5492964000111',
          emailContacto: 'otro.contacto.e2e@bajonea.test',
          direccion: { calle: 'Belgrano', numero: '250', pisoDepto: '2B', codigoPostal: '9420', localidadId, principal: false },
          redesSociales: [
            { tipo: 'INSTAGRAM', url: urlInstagram },
            { tipo: 'FACEBOOK', url: urlFacebook },
          ],
        }),
      );

      expect(respuesta.status).toBe(200);
      expect(camposDeLosCambios(dueno.comercioId)).toEqual([
        'DIRECCION',
        'EMAIL_CONTACTO',
        'FOTO_PERFIL',
        'MODALIDADES',
        'REDES_SOCIALES',
        'TELEFONO',
        'TIPO_COMERCIO',
      ]);
      const cambios = cambiosDeLaUltimaResolicitud(dueno.comercioId);
      expect(cambios).toContain('MODALIDADES|Solo retiro|Delivery y retiro');
      expect(cambios).toContain('TIPO_COMERCIO|RESTAURANTE|EMPRENDIMIENTO');
      expect(cambios).toContain(`FOTO_PERFIL|${c.fotoPerfilUrl}|${foto}`);
      expect(cambios.find((f) => f.startsWith('DIRECCION|'))).toMatch(/^DIRECCION\|Av\. San Martín 100, .+ \(9420\)\|Belgrano 250, 2B, .+ \(9420\)$/);
      expect(cambios.find((f) => f.startsWith('REDES_SOCIALES|'))).toBe(
        `REDES_SOCIALES|INSTAGRAM: ${c.redesSociales[0].url}|INSTAGRAM: ${urlInstagram}; FACEBOOK: ${urlFacebook}`,
      );

      expect(sql(`SELECT COUNT(*) FROM direccion WHERE comercio_id = ${dueno.comercioId};`)).toBe('1');
      expect(sql(`SELECT id FROM direccion WHERE comercio_id = ${dueno.comercioId};`)).toBe(String(direccionId));
      expect(sql(`SELECT CONCAT(calle, ' ', numero, ' ', piso_depto) FROM direccion WHERE comercio_id = ${dueno.comercioId};`)).toBe('Belgrano 250 2B');
      expect(sql(`SELECT url FROM red_social WHERE comercio_id = ${dueno.comercioId} AND tipo = 'INSTAGRAM' AND fecha_baja IS NULL;`)).toBe(urlInstagram);
      expect(sql(`SELECT COUNT(*) FROM red_social WHERE comercio_id = ${dueno.comercioId} AND fecha_baja IS NULL;`)).toBe('2');

      await resolverComercio(request, adminToken, dueno.comercioId, false, 'Segundo rechazo');
      const segunda = await correccionDe(request, dueno.token, dueno.comercioId);
      expect(segunda.body.data.redesSociales).toHaveLength(2);
      const sinFacebook = await reenviar(
        request,
        dueno.token,
        dueno.comercioId,
        payloadDesde(segunda.body.data, { redesSociales: [{ tipo: 'INSTAGRAM', url: urlInstagram }] }),
      );
      expect(sinFacebook.status).toBe(200);
      expect(camposDeLosCambios(dueno.comercioId)).toEqual(['REDES_SOCIALES']);
      expect(sql(`SELECT COUNT(*) FROM red_social WHERE comercio_id = ${dueno.comercioId} AND tipo = 'FACEBOOK';`)).toBe('1');
      expect(sql(`SELECT fecha_baja IS NOT NULL FROM red_social WHERE comercio_id = ${dueno.comercioId} AND tipo = 'FACEBOOK';`)).toBe('1');

      await resolverComercio(request, adminToken, dueno.comercioId, false, 'Tercer rechazo');
      const tercera = await correccionDe(request, dueno.token, dueno.comercioId);
      expect(tercera.body.data.redesSociales).toHaveLength(1);
      const filaFacebook = sql(`SELECT id FROM red_social WHERE comercio_id = ${dueno.comercioId} AND tipo = 'FACEBOOK';`);
      const conFacebook = await reenviar(
        request,
        dueno.token,
        dueno.comercioId,
        payloadDesde(tercera.body.data, {
          redesSociales: [
            { tipo: 'INSTAGRAM', url: urlInstagram },
            { tipo: 'FACEBOOK', url: 'https://facebook.com/revivida.e2e' },
          ],
        }),
      );
      expect(conFacebook.status).toBe(200);
      expect(sql(`SELECT COUNT(*) FROM red_social WHERE comercio_id = ${dueno.comercioId} AND tipo = 'FACEBOOK';`)).toBe('1');
      expect(sql(`SELECT id FROM red_social WHERE comercio_id = ${dueno.comercioId} AND tipo = 'FACEBOOK' AND fecha_baja IS NULL;`)).toBe(filaFacebook);
      expect(sql(`SELECT url FROM red_social WHERE id = ${filaFacebook};`)).toBe('https://facebook.com/revivida.e2e');
      expect(cantidadResolicitudesDe(dueno.comercioId)).toBe(3);
    });

    test('una foto fuera de la carpeta del comercio, del pre-registro o de otro Dueño da 400 y no gasta un intento', async ({ request }) => {
      const dueno = await prepararRechazado(request);
      const otro = await prepararRechazado(request);
      const { body } = await correccionDe(request, dueno.token, dueno.comercioId);
      const fotoPreRegistro = await subirFotoPreRegistro(request, 'comercio');
      const fotoDeOtroDueno = await subirFotoNuevoComercio(request, otro.token);

      for (const url of [fotoPreRegistro, fotoDeOtroDueno, 'https://res.cloudinary.com/otra-cuenta/image/upload/comercios/x/perfil/f.png']) {
        const respuesta = await reenviar(request, dueno.token, dueno.comercioId, payloadDesde(body.data, { fotoPerfilUrl: url }));
        expect(respuesta.status, url).toBe(400);
        expect(respuesta.body.mensaje).toContain('La foto de perfil no es válida');
      }
      const noCloudinary = await reenviar(request, dueno.token, dueno.comercioId, payloadDesde(body.data, { fotoPerfilUrl: 'https://ejemplo.com/f.png' }));
      expect(noCloudinary.status).toBe(400);

      expect(estadoDe(dueno.comercioId)).toBe('RECHAZADO');
      expect(cantidadResolicitudesDe(dueno.comercioId)).toBe(0);
    });

    test('mantiene las validaciones del alta: horarios superpuestos, sin redes, sin modalidad, localidad inexistente y nombre vacío', async ({ request }) => {
      const dueno = await prepararRechazado(request);
      const { body } = await correccionDe(request, dueno.token, dueno.comercioId);
      const c = body.data;
      const dia = c.horarios[0].diaSemana;

      const casos: Array<{ cambios: Record<string, unknown>; status: number; mensaje?: string }> = [
        {
          cambios: {
            horarios: [
              { diaSemana: dia, horaApertura: '09:00', horaCierre: '13:00' },
              { diaSemana: dia, horaApertura: '12:00', horaCierre: '16:00' },
            ],
          },
          status: 400,
          mensaje: 'se superpone',
        },
        { cambios: { horarios: [{ diaSemana: dia, horaApertura: '13:00', horaCierre: '09:00' }] }, status: 400, mensaje: 'posterior' },
        { cambios: { redesSociales: [] }, status: 400 },
        { cambios: { aceptaDelivery: false, aceptaRetiro: false }, status: 400, mensaje: 'al menos una modalidad' },
        { cambios: { nombre: '   ' }, status: 400 },
        {
          cambios: { direccion: { ...payloadDesde(c).direccion, localidadId: '99999999' } },
          status: 404,
          mensaje: 'localidad',
        },
        {
          cambios: {
            redesSociales: [
              { tipo: 'INSTAGRAM', url: 'https://instagram.com/a' },
              { tipo: 'INSTAGRAM', url: 'https://instagram.com/b' },
            ],
          },
          status: 400,
          mensaje: 'mismo tipo',
        },
      ];
      for (const caso of casos) {
        const respuesta = await reenviar(request, dueno.token, dueno.comercioId, payloadDesde(c, { descripcion: 'Con cambio', ...caso.cambios }));
        expect(respuesta.status, JSON.stringify(caso.cambios)).toBe(caso.status);
        if (caso.mensaje) {
          expect(respuesta.body.mensaje.toLowerCase()).toContain(caso.mensaje.toLowerCase());
        }
      }
      expect((await reenviar(request, dueno.token, dueno.comercioId, { ...payloadDesde(c), tokenVersion: undefined })).status).toBe(400);
      expect(estadoDe(dueno.comercioId)).toBe('RECHAZADO');
      expect(cantidadResolicitudesDe(dueno.comercioId)).toBe(0);
      expect(historialDe(dueno.comercioId)).toHaveLength(1);
    });

    test('un comercio de otro Dueño, inexistente o no rechazado da 404; uno ya PENDIENTE da 409', async ({ request }) => {
      const dueno = await prepararRechazado(request);
      const otro = await prepararRechazado(request);
      const aprobado = await prepararAprobado(request);
      const { body } = await correccionDe(request, dueno.token, dueno.comercioId);
      const payload = payloadDesde(body.data, { descripcion: 'Cambio para el 404' });

      const ajeno = await reenviar(request, dueno.token, otro.comercioId, payload);
      expect(ajeno.status).toBe(404);
      expect((await reenviar(request, dueno.token, 999_999_999, payload)).status).toBe(404);
      expect(await reenviar(request, aprobado.token, aprobado.comercioId, payload)).toEqual(ajeno);
      expect(estadoDe(otro.comercioId)).toBe('RECHAZADO');

      const primero = await reenviar(request, dueno.token, dueno.comercioId, payload);
      expect(primero.status).toBe(200);
      const segundo = await reenviar(request, dueno.token, dueno.comercioId, payload);
      expect(segundo.status).toBe(409);
      expect(segundo.body.mensaje).toBe(MENSAJE_YA_ENVIADO);
      expect(cantidadResolicitudesDe(dueno.comercioId)).toBe(1);
      expect(historialDe(dueno.comercioId)).toHaveLength(2);
    });

    test('el token de versión viejo da 409 sin gastar un intento y el nuevo permite reenviar', async ({ request }) => {
      const dueno = await prepararRechazado(request, 'Primer rechazo');
      const primera = await reenviarConCambioSimple(request, dueno);
      expect(primera.respuesta.status).toBe(200);
      const tokenViejo = primera.correccion.tokenVersion;

      await resolverComercio(request, adminToken, dueno.comercioId, false, 'Segundo rechazo');
      const segunda = await correccionDe(request, dueno.token, dueno.comercioId);
      expect(segunda.body.data.tokenVersion).toBeGreaterThan(tokenViejo);
      expect(segunda.body.data.motivoRechazo).toBe('Segundo rechazo');
      expect(segunda.body.data.intentoActual).toBe(2);
      expect(segunda.body.data.intentosRestantes).toBe(2);

      const conTokenViejo = await reenviar(
        request,
        dueno.token,
        dueno.comercioId,
        payloadDesde(segunda.body.data, { descripcion: 'Segundo cambio', tokenVersion: tokenViejo }),
      );
      expect(conTokenViejo.status).toBe(409);
      expect(conTokenViejo.body.mensaje).toBe(MENSAJE_VERSION);
      expect(cantidadResolicitudesDe(dueno.comercioId)).toBe(1);
      expect(estadoDe(dueno.comercioId)).toBe('RECHAZADO');

      const conTokenNuevo = await reenviar(
        request,
        dueno.token,
        dueno.comercioId,
        payloadDesde(segunda.body.data, { descripcion: 'Segundo cambio' }),
      );
      expect(conTokenNuevo.status).toBe(200);
      expect(cantidadResolicitudesDe(dueno.comercioId)).toBe(2);
    });

    test('dos reenvíos simultáneos del mismo comercio: uno pasa y el otro da 409', async ({ request }) => {
      const dueno = await prepararRechazado(request);
      const { body } = await correccionDe(request, dueno.token, dueno.comercioId);
      const payload = payloadDesde(body.data, { descripcion: 'Reenvío simultáneo' });

      const respuestas = await Promise.all([
        reenviar(request, dueno.token, dueno.comercioId, payload),
        reenviar(request, dueno.token, dueno.comercioId, payload),
      ]);

      expect(respuestas.map((r) => r.status).sort()).toEqual([200, 409]);
      expect(cantidadResolicitudesDe(dueno.comercioId)).toBe(1);
      expect(historialDe(dueno.comercioId)).toHaveLength(2);
    });

    test('un comercio sin fila de rechazo (armado a mano) se puede reenviar con versión 0', async ({ request }) => {
      const base = await prepararAprobado(request);
      const clonId = await clonarConRedes(request, base.comercioId, `Adicional Rechazado ${sufijoUnico()}`, 'RECHAZADO');
      const { body } = await correccionDe(request, base.token, clonId);

      const respuesta = await reenviar(request, base.token, clonId, payloadDesde(body.data, { descripcion: 'Corrección del adicional' }));

      expect(respuesta.status).toBe(200);
      expect(estadoDe(clonId)).toBe('PENDIENTE');
      expect(historialDe(clonId)).toEqual([`RECHAZADO>PENDIENTE|sin-admin|${MOTIVO_RESOLICITUD}`]);
    });

    test('usuario, email de la cuenta y contraseña no se tocan aunque vengan en el body', async ({ request }) => {
      const dueno = await prepararRechazado(request);
      const { body } = await correccionDe(request, dueno.token, dueno.comercioId);
      const antes = sql(`SELECT CONCAT(nombre_usuario, '|', email, '|', password_hash) FROM usuario WHERE id = ${dueno.duenoId};`);

      const respuesta = await reenviar(
        request,
        dueno.token,
        dueno.comercioId,
        payloadDesde(body.data, {
          descripcion: 'Con campos de más',
          email: 'otro.email@bajonea.test',
          nombreUsuario: 'otronombreusuario',
          password: 'OtraClave123',
        }),
      );

      expect(respuesta.status).toBe(200);
      expect(sql(`SELECT CONCAT(nombre_usuario, '|', email, '|', password_hash) FROM usuario WHERE id = ${dueno.duenoId};`)).toBe(antes);
      expect((await login(request, dueno.nombreUsuario, dueno.password)).usuario.id).toBe(dueno.duenoId);
    });
  });

  test.describe('datos fiscales y del representante', () => {
    test('un Dueño sin comercio aprobado los puede corregir: se guardan y quedan en el historial en texto plano', async ({ request }) => {
      const dueno = await prepararRechazado(request);
      const { body } = await correccionDe(request, dueno.token, dueno.comercioId);
      const c = body.data;
      const cuitNuevo = generarCuit();
      const dniNuevo = generarDni();

      const respuesta = await reenviar(
        request,
        dueno.token,
        dueno.comercioId,
        payloadDesde(c, {
          legales: legalesDesde(c, {
            razonSocial: 'razon social corregida srl',
            cuit: cuitNuevo,
            tipoSociedad: 'SA',
            domicilioFiscal: 'Domicilio fiscal corregido 200',
            nombreRepresentante: 'maria',
            dniRepresentante: dniNuevo,
            telefonoRepresentante: '+5492964777888',
          }),
        }),
      );

      expect(respuesta.status).toBe(200);
      expect(sql(`SELECT CONCAT(razon_social, '|', cuit, '|', tipo_sociedad, '|', domicilio_fiscal) FROM persona_juridica WHERE id = ${dueno.duenoId};`)).toBe(
        `Razon Social Corregida Srl|${cuitNuevo}|SA|Domicilio fiscal corregido 200`,
      );
      expect(sql(`SELECT CONCAT(nombre, '|', dni, '|', telefono) FROM persona_fisica WHERE id = ${dueno.duenoId};`)).toBe(`Maria|${dniNuevo}|+5492964777888`);
      expect(camposDeLosCambios(dueno.comercioId)).toEqual([
        'CUIT',
        'DOMICILIO_FISCAL',
        'RAZON_SOCIAL',
        'REPRESENTANTE_DNI',
        'REPRESENTANTE_NOMBRE',
        'REPRESENTANTE_TELEFONO',
        'TIPO_SOCIEDAD',
      ]);
      const cambios = cambiosDeLaUltimaResolicitud(dueno.comercioId);
      expect(cambios).toContain(`CUIT|${c.legales.cuit}|${cuitNuevo}`);
      expect(cambios).toContain(`REPRESENTANTE_DNI|${c.legales.representante.dni}|${dniNuevo}`);
      expect(cambios).toContain('TIPO_SOCIEDAD|SRL|SA');
    });

    test('mandar los datos legales iguales no cuenta como cambio', async ({ request }) => {
      const dueno = await prepararRechazado(request);
      const { body } = await correccionDe(request, dueno.token, dueno.comercioId);

      const respuesta = await reenviar(request, dueno.token, dueno.comercioId, payloadDesde(body.data, { legales: legalesDesde(body.data) }));

      expect(respuesta.status).toBe(409);
      expect(respuesta.body.mensaje).toBe(MENSAJE_SIN_CAMBIOS);
    });

    test('un Dueño que ya tuvo un comercio aprobado no los puede tocar: 409 y no cambia nada', async ({ request }) => {
      const base = await prepararAprobado(request);
      const clonId = await clonarConRedes(request, base.comercioId, `Adicional Rechazado ${sufijoUnico()}`, 'RECHAZADO');
      const propios = await prepararRechazado(request);
      const datosPropios = (await correccionDe(request, propios.token, propios.comercioId)).body.data;
      const razonAntes = sql(`SELECT razon_social FROM persona_juridica WHERE id = ${base.duenoId};`);
      const { body } = await correccionDe(request, base.token, clonId);

      const respuesta = await reenviar(
        request,
        base.token,
        clonId,
        payloadDesde(body.data, { descripcion: 'Cambio válido', legales: legalesDesde(datosPropios, { razonSocial: 'Intento de cambio' }) }),
      );

      expect(respuesta.status).toBe(409);
      expect(respuesta.body.mensaje).toBe(MENSAJE_LEGALES);
      expect(sql(`SELECT razon_social FROM persona_juridica WHERE id = ${base.duenoId};`)).toBe(razonAntes);
      expect(estadoDe(clonId)).toBe('RECHAZADO');
      expect(cantidadResolicitudesDe(clonId)).toBe(0);
    });

    test('un CUIT o un DNI que ya es de otra cuenta da 409 con el mismo mensaje del alta, sin revelar de quién, y no cambia nada', async ({ request }) => {
      const dueno = await prepararRechazado(request);
      const otro = await prepararRechazado(request);
      const { body } = await correccionDe(request, dueno.token, dueno.comercioId);
      const c = body.data;
      const cuitAjeno = sql(`SELECT cuit FROM persona_juridica WHERE id = ${otro.duenoId};`);
      const dniAjeno = sql(`SELECT dni FROM persona_fisica WHERE id = ${otro.duenoId};`);
      const razonAntes = sql(`SELECT razon_social FROM persona_juridica WHERE id = ${dueno.duenoId};`);

      const conCuit = await reenviar(
        request,
        dueno.token,
        dueno.comercioId,
        payloadDesde(c, { descripcion: 'Cambio', legales: legalesDesde(c, { razonSocial: 'No debe guardarse', cuit: cuitAjeno }) }),
      );
      const conDni = await reenviar(
        request,
        dueno.token,
        dueno.comercioId,
        payloadDesde(c, { descripcion: 'Cambio', legales: legalesDesde(c, { razonSocial: 'No debe guardarse', dniRepresentante: dniAjeno }) }),
      );

      expect(conCuit.status).toBe(409);
      expect(conCuit.body.mensaje).toBe('Ya existe una cuenta registrada con ese CUIT');
      expect(conDni.status).toBe(409);
      expect(conDni.body.mensaje).toBe('Ya existe una cuenta registrada con ese DNI');
      expect(JSON.stringify([conCuit.body, conDni.body])).not.toContain(otro.email);
      expect(sql(`SELECT razon_social FROM persona_juridica WHERE id = ${dueno.duenoId};`)).toBe(razonAntes);
      expect(estadoDe(dueno.comercioId)).toBe('RECHAZADO');
      expect(cantidadResolicitudesDe(dueno.comercioId)).toBe(0);
      expect(sql(`SELECT descripcion FROM comercio WHERE id = ${dueno.comercioId};`)).not.toBe('Cambio');
    });

    test('dos Dueños que se corrigen al mismo tiempo hacia el mismo CUIT: uno gana y el otro recibe 409', async ({ request }) => {
      const uno = await prepararRechazado(request);
      const dos = await prepararRechazado(request);
      const cuitCompartido = generarCuit();
      const cuerpo = async (dueno: Dueno) => {
        const { body } = await correccionDe(request, dueno.token, dueno.comercioId);
        return payloadDesde(body.data, { legales: legalesDesde(body.data, { cuit: cuitCompartido }) });
      };
      const [bodyUno, bodyDos] = [await cuerpo(uno), await cuerpo(dos)];

      const respuestas = await Promise.all([
        reenviar(request, uno.token, uno.comercioId, bodyUno),
        reenviar(request, dos.token, dos.comercioId, bodyDos),
      ]);

      expect(respuestas.map((r) => r.status).sort()).toEqual([200, 409]);
      expect(sql(`SELECT COUNT(*) FROM persona_juridica WHERE cuit = '${cuitCompartido}';`)).toBe('1');
    });
  });

  test.describe('comercios duplicados', () => {
    test('la corrección no se cuenta a sí misma pero sí a los demás comercios del Dueño, salvo los rechazados', async ({ request }) => {
      const base = await prepararAprobado(request);
      const nombre = `Local Duplicado ${sufijoUnico()}`;
      const rechazadoId = await clonarConRedes(request, base.comercioId, nombre, 'RECHAZADO');
      const otroId = await clonarConRedes(request, base.comercioId, nombre.toUpperCase(), 'PENDIENTE');

      for (const estadoDelOtro of ['PENDIENTE', 'APROBADO', 'SUSPENDIDO', 'RECHAZO_DEFINITIVO']) {
        sql(`UPDATE comercio SET estado = '${estadoDelOtro}' WHERE id = ${otroId};`);
        const { body } = await correccionDe(request, base.token, rechazadoId);
        const respuesta = await reenviar(request, base.token, rechazadoId, payloadDesde(body.data, { descripcion: `Cambio ${estadoDelOtro}` }));
        expect(respuesta.status, estadoDelOtro).toBe(409);
        expect(respuesta.body.mensaje).toBe(MENSAJE_DUPLICADO);
      }

      sql(`UPDATE comercio SET estado = 'RECHAZADO' WHERE id = ${otroId};`);
      const { body } = await correccionDe(request, base.token, rechazadoId);
      const respuesta = await reenviar(request, base.token, rechazadoId, payloadDesde(body.data, { descripcion: 'Sin duplicado vivo' }));
      expect(respuesta.status).toBe(200);
      expect(estadoDe(rechazadoId)).toBe('PENDIENTE');
    });

    test('un RECHAZO_DEFINITIVO cuenta como duplicado al agregar un comercio; un RECHAZADO no', async ({ request }) => {
      const base = await prepararAprobado(request);
      const nombre = `Alta Duplicada ${sufijoUnico()}`;
      const clonId = await clonarConRedes(request, base.comercioId, nombre, 'RECHAZO_DEFINITIVO');
      const foto = await subirFotoNuevoComercio(request, base.token);
      const direccionDelClon = { calle: 'Av. San Martín', numero: '100', pisoDepto: null, codigoPostal: '9420', localidadId, principal: false };

      const contraDefinitivo = await registrarComercioAdicional(request, base.token, localidadId, { nombre, fotoPerfilUrl: foto, direccion: direccionDelClon });
      expect(contraDefinitivo.status).toBe(409);
      expect(contraDefinitivo.body.mensaje).toBe(MENSAJE_DUPLICADO);

      sql(`UPDATE comercio SET estado = 'RECHAZADO' WHERE id = ${clonId};`);
      const contraRechazado = await registrarComercioAdicional(request, base.token, localidadId, { nombre, fotoPerfilUrl: foto, direccion: direccionDelClon });
      expect(contraRechazado.status).toBe(201);
    });
  });

  test.describe('límite de re-solicitudes y rechazo definitivo', () => {
    test('la tercera re-solicitud rechazada pasa a RECHAZO_DEFINITIVO por decisión del servidor y no tiene salida', async ({ request }) => {
      const dueno = await prepararRechazado(request, 'Rechazo 0');

      let ultimaCorreccion: any;
      for (let intento = 1; intento <= 3; intento += 1) {
        const { respuesta, correccion } = await reenviarConCambioSimple(request, dueno, `Corrección número ${intento}`);
        ultimaCorreccion = correccion;
        expect(respuesta.status, `reenvío ${intento}`).toBe(200);
        expect(cantidadResolicitudesDe(dueno.comercioId)).toBe(intento);

        const delAdmin = (await resolicitudesDelAdmin(request)).find((r) => r.comercio.id === dueno.comercioId);
        expect(delAdmin.intento).toBe(intento);
        expect(delAdmin.maximoResolicitudes).toBe(3);
        expect(delAdmin.esUltimoIntento).toBe(intento === 3);
        expect(delAdmin.motivoRechazoAnterior).toBe(`Rechazo ${intento - 1}`);

        await resolverComercio(request, adminToken, dueno.comercioId, false, `Rechazo ${intento}`);
        expect(estadoDe(dueno.comercioId)).toBe(intento < 3 ? 'RECHAZADO' : 'RECHAZO_DEFINITIVO');
      }

      expect(Number(sql(`SELECT COUNT(*) FROM historial_estado_comercio WHERE comercio_id = ${dueno.comercioId} AND estado_origen = 'RECHAZADO' AND estado_destino = 'PENDIENTE';`))).toBe(
        cantidadResolicitudesDe(dueno.comercioId),
      );
      const historial = historialDe(dueno.comercioId);
      expect(historial[historial.length - 1]).toBe(`PENDIENTE>RECHAZO_DEFINITIVO|${adminId}|Rechazo 3`);

      const notificaciones = (await notificacionesDelComercio(request, dueno.token, dueno.comercioId)).map((n) => n.mensaje);
      expect(notificaciones).toContain(`Tu comercio ${dueno.nombre} fue rechazado. Motivo: Rechazo 2`);
      expect(notificaciones).toContain(`Tu comercio ${dueno.nombre} fue rechazado de forma definitiva. Motivo: Rechazo 3`);
      expect(sql(`SELECT tipo FROM notificacion WHERE mensaje LIKE '%de forma definitiva. Motivo: Rechazo 3' AND entidad_id = ${dueno.comercioId};`)).toBe('COMERCIO_RECHAZADO');

      const firma = await apiConHeaders(request, 'POST', `/comercios/${dueno.comercioId}/correccion/foto/firma`, dueno.token);
      expect((await correccionDe(request, dueno.token, dueno.comercioId)).status).toBe(404);
      expect(firma.status).toBe(404);
      const intentoDeReenvio = await reenviar(
        request,
        dueno.token,
        dueno.comercioId,
        payloadDesde(ultimaCorreccion, { descripcion: 'Intento después del definitivo' }),
      );
      expect(intentoDeReenvio.status).toBe(404);
      expect(estadoDe(dueno.comercioId)).toBe('RECHAZO_DEFINITIVO');
      const perfil = await apiConHeaders(request, 'GET', '/comercios/perfil', dueno.token, { [HEADER]: String(dueno.comercioId) });
      expect(perfil.body.data.estado).toBe('RECHAZO_DEFINITIVO');
      expect(perfil.body.data.motivoRechazo).toBe('Rechazo 3');
    });

    test('receta de reapertura manual: estado RECHAZADO, contador en 2 y una fila de historial', async ({ request }) => {
      const dueno = await prepararRechazado(request, 'Rechazo definitivo previo');
      sql(`UPDATE comercio SET estado = 'RECHAZO_DEFINITIVO', cantidad_resolicitudes = 3 WHERE id = ${dueno.comercioId};`);
      expect((await correccionDe(request, dueno.token, dueno.comercioId)).status).toBe(404);

      sql(`UPDATE comercio SET estado = 'RECHAZADO', cantidad_resolicitudes = 2 WHERE id = ${dueno.comercioId};`);
      sql(
        `INSERT INTO historial_estado_comercio (comercio_id, administrador_id, estado_origen, estado_destino, motivo) ` +
          `VALUES (${dueno.comercioId}, NULL, 'RECHAZO_DEFINITIVO', 'RECHAZADO', 'Reabierto manualmente');`,
      );

      const { status, body } = await correccionDe(request, dueno.token, dueno.comercioId);
      expect(status).toBe(200);
      expect(body.data.motivoRechazo).toBe('Reabierto manualmente');
      expect(body.data.intentoActual).toBe(3);
      expect(body.data.intentosRestantes).toBe(1);
      const respuesta = await reenviar(request, dueno.token, dueno.comercioId, payloadDesde(body.data, { descripcion: 'Última oportunidad' }));
      expect(respuesta.status).toBe(200);
      expect(cantidadResolicitudesDe(dueno.comercioId)).toBe(3);
    });

    test('con el tope ya usado un reenvío da 409 (por si el tope se baja o el estado se reabre mal)', async ({ request }) => {
      const dueno = await prepararRechazado(request);
      sql(`UPDATE comercio SET cantidad_resolicitudes = 3 WHERE id = ${dueno.comercioId};`);
      const { body } = await correccionDe(request, dueno.token, dueno.comercioId);
      expect(body.data.intentosRestantes).toBe(0);

      const respuesta = await reenviar(request, dueno.token, dueno.comercioId, payloadDesde(body.data, { descripcion: 'Sin intentos' }));

      expect(respuesta.status).toBe(409);
      expect(respuesta.body.mensaje).toBe('Ya usaste todas las re-solicitudes disponibles para este comercio');
    });

    test('el Administrador puede pedir el rechazo definitivo del alta original o de una re-solicitud antes del último intento', async ({ request }) => {
      const original = await registrarPendiente(request);
      const rechazo = await resolverCrudo(request, original.comercioId, { aprobar: false, motivo: 'Documentación falsa', definitivo: true });
      expect(rechazo.status).toBe(200);
      expect(estadoDe(original.comercioId)).toBe('RECHAZO_DEFINITIVO');
      expect(historialDe(original.comercioId)).toEqual([`PENDIENTE>RECHAZO_DEFINITIVO|${adminId}|Documentación falsa`]);
      expect((await notificacionesDelComercio(request, original.token, original.comercioId)).map((n) => n.mensaje)).toContain(
        `Tu comercio ${original.nombre} fue rechazado de forma definitiva. Motivo: Documentación falsa`,
      );
      expect((await correccionDe(request, original.token, original.comercioId)).status).toBe(404);

      const reenviado = await prepararRechazado(request);
      expect((await reenviarConCambioSimple(request, reenviado)).respuesta.status).toBe(200);
      expect(cantidadResolicitudesDe(reenviado.comercioId)).toBe(1);
      await resolverComercio(request, adminToken, reenviado.comercioId, false, 'No hay más oportunidades', true);
      expect(estadoDe(reenviado.comercioId)).toBe('RECHAZO_DEFINITIVO');
    });

    test('el flag definitivo es opcional, falso se comporta como siempre y con aprobar=true da 400', async ({ request }) => {
      const sinFlag = await registrarPendiente(request);
      await resolverComercio(request, adminToken, sinFlag.comercioId, false, 'Sin flag');
      expect(estadoDe(sinFlag.comercioId)).toBe('RECHAZADO');

      const conFalso = await registrarPendiente(request);
      await resolverComercio(request, adminToken, conFalso.comercioId, false, 'Flag falso', false);
      expect(estadoDe(conFalso.comercioId)).toBe('RECHAZADO');

      const aprobarDefinitivo = await registrarPendiente(request);
      const respuesta = await resolverCrudo(request, aprobarDefinitivo.comercioId, { aprobar: true, definitivo: true });
      expect(respuesta.status).toBe(400);
      expect(estadoDe(aprobarDefinitivo.comercioId)).toBe('PENDIENTE');

      const sinMotivo = await resolverCrudo(request, aprobarDefinitivo.comercioId, { aprobar: false, definitivo: true });
      expect(sinMotivo.status).toBe(400);
    });

    test('aprobar una re-solicitud sigue las reglas de siempre: APROBADO sin cuenta de Mercado Pago, APTO_VENTA con ella', async ({ request }) => {
      const sinCuenta = await prepararRechazado(request);
      expect((await reenviarConCambioSimple(request, sinCuenta)).respuesta.status).toBe(200);
      await resolverComercio(request, adminToken, sinCuenta.comercioId, true);
      expect(estadoDe(sinCuenta.comercioId)).toBe('APROBADO');
      expect(historialDe(sinCuenta.comercioId)).toEqual([
        `PENDIENTE>RECHAZADO|${adminId}|${MOTIVO_RECHAZO}`,
        `RECHAZADO>PENDIENTE|sin-admin|${MOTIVO_RESOLICITUD}`,
        `PENDIENTE>APROBADO|${adminId}|`,
      ]);
      expect((await notificacionesDelComercio(request, sinCuenta.token, sinCuenta.comercioId)).map((n) => n.mensaje)).toContain(
        `Tu comercio ${sinCuenta.nombre} fue aprobado`,
      );

      const conCuenta = await prepararRechazado(request);
      await vincularMercadoPagoSimuladoTest(request, conCuenta.duenoId);
      expect((await reenviarConCambioSimple(request, conCuenta)).respuesta.status).toBe(200);
      await resolverComercio(request, adminToken, conCuenta.comercioId, true);
      expect(estadoDe(conCuenta.comercioId)).toBe('APTO_VENTA');
      expect(historialDe(conCuenta.comercioId).slice(2)).toEqual([`PENDIENTE>APROBADO|${adminId}|`, `APROBADO>APTO_VENTA|sin-admin|${MOTIVO_MP}`]);
      expect((await notificacionesDelComercio(request, conCuenta.token, conCuenta.comercioId)).map((n) => n.mensaje)).toContain(
        `Tu comercio ${conCuenta.nombre} fue aprobado y ya podés vender`,
      );
    });

    test('dos resoluciones simultáneas del mismo comercio: una gana y la otra recibe 409', async ({ request }) => {
      const base = await prepararAprobado(request);
      for (let ronda = 0; ronda < 4; ronda += 1) {
        const clonId = await clonarConRedes(request, base.comercioId, `Carrera ${ronda} ${sufijoUnico()}`, 'PENDIENTE');
        const respuestas = await Promise.all([
          resolverCrudo(request, clonId, { aprobar: true }),
          resolverCrudo(request, clonId, { aprobar: false, motivo: 'Rechazo concurrente' }),
        ]);
        expect(respuestas.map((r) => r.status).sort(), `ronda ${ronda}`).toEqual([200, 409]);
        const estado = estadoDe(clonId);
        expect(['APROBADO', 'RECHAZADO']).toContain(estado);
        const resolvio = respuestas[0].status === 200 ? 'aprobar' : 'rechazar';
        expect(estado).toBe(resolvio === 'aprobar' ? 'APROBADO' : 'RECHAZADO');
        expect(Number(sql(`SELECT COUNT(*) FROM historial_estado_comercio WHERE comercio_id = ${clonId} AND estado_origen = 'PENDIENTE';`))).toBe(1);
      }
    });

    test('resolver un comercio que ya no está pendiente da 409', async ({ request }) => {
      const dueno = await prepararRechazado(request);
      const aprobar = await resolverCrudo(request, dueno.comercioId, { aprobar: true });
      const rechazar = await resolverCrudo(request, dueno.comercioId, { aprobar: false, motivo: 'Otra vez' });
      expect(aprobar.status).toBe(409);
      expect(rechazar.status).toBe(409);
      expect(estadoDe(dueno.comercioId)).toBe('RECHAZADO');
    });
  });

  test.describe('bandeja del Administrador', () => {
    test('las re-solicitudes tienen su propia bandeja: salen de pendientes, traen los cambios y los datos fiscales completos', async ({ request }) => {
      const reenviado = await prepararRechazado(request, 'Motivo de la bandeja');
      const nuevo = await registrarPendiente(request);
      const { body } = await correccionDe(request, reenviado.token, reenviado.comercioId);
      const c = body.data;
      await reenviar(request, reenviado.token, reenviado.comercioId, payloadDesde(c, { nombre: 'Nombre De La Bandeja', descripcion: 'Descripción de la bandeja' }));

      const pendientes = await pendientesDelAdmin(request);
      const resolicitudes = await resolicitudesDelAdmin(request);

      expect(pendientes.map((p) => p.id)).toContain(nuevo.comercioId);
      expect(pendientes.map((p) => p.id)).not.toContain(reenviado.comercioId);
      expect(resolicitudes.map((r) => r.comercio.id)).toContain(reenviado.comercioId);
      expect(resolicitudes.map((r) => r.comercio.id)).not.toContain(nuevo.comercioId);

      const r = resolicitudes.find((x) => x.comercio.id === reenviado.comercioId);
      expect(r).toMatchObject({ intento: 1, maximoResolicitudes: 3, esUltimoIntento: false, motivoRechazoAnterior: 'Motivo de la bandeja' });
      expect(r.fechaResolicitud).toBeTruthy();
      expect(r.cambios.map((x: any) => x.campo).sort()).toEqual(['DESCRIPCION', 'NOMBRE']);
      expect(r.cambios.find((x: any) => x.campo === 'NOMBRE')).toEqual({ campo: 'NOMBRE', valorAnterior: reenviado.nombre, valorNuevo: 'Nombre De La Bandeja' });
      expect(r.comercio).toMatchObject({
        estado: 'PENDIENTE',
        nombre: 'Nombre De La Bandeja',
        razonSocial: c.legales.razonSocial,
        cuit: c.legales.cuit,
        condicionIva: 'RESPONSABLE_INSCRIPTO',
        tipoSociedad: 'SRL',
        domicilioFiscal: c.legales.domicilioFiscal,
        fechaInicioActividades: c.legales.fechaInicioActividades,
        esAdicional: false,
      });
      expect(r.comercio.representante.dni).toBe(c.legales.representante.dni);
      expect(r.comercio.otrosComercios).toEqual([]);

      const nuevoEnPendientes = pendientes.find((p) => p.id === nuevo.comercioId);
      expect(nuevoEnPendientes.tipoSociedad).toBe('SRL');
      expect(nuevoEnPendientes.domicilioFiscal).toBeTruthy();
      expect(nuevoEnPendientes.fechaInicioActividades).toBe('2020-01-01');
    });

    test('un adicional rechazado y reenviado se ve como "adicional" y lista los demás comercios del Dueño', async ({ request }) => {
      const base = await prepararAprobado(request);
      const clonId = await clonarConRedes(request, base.comercioId, `Adicional Reenviado ${sufijoUnico()}`, 'RECHAZADO');
      const { body } = await correccionDe(request, base.token, clonId);
      await reenviar(request, base.token, clonId, payloadDesde(body.data, { descripcion: 'Adicional corregido' }));

      const r = (await resolicitudesDelAdmin(request)).find((x) => x.comercio.id === clonId);

      expect(r.comercio.esAdicional).toBe(true);
      expect(r.comercio.duenoId).toBe(base.duenoId);
      expect(r.comercio.otrosComercios.map((o: any) => o.id)).toEqual([base.comercioId]);
      expect(r.motivoRechazoAnterior).toBeNull();
    });

    test('las métricas separan solicitudes nuevas de re-solicitudes', async ({ request }) => {
      const dueno = await prepararRechazado(request);
      const antes = await metricas(request);

      const { respuesta } = await reenviarConCambioSimple(request, dueno);
      expect(respuesta.status).toBe(200);
      const despuesDeReenviar = await metricas(request);
      expect(despuesDeReenviar.resolicitudesPendientes).toBe(antes.resolicitudesPendientes + 1);
      expect(despuesDeReenviar.comerciosPendientes).toBe(antes.comerciosPendientes);

      const nuevo = await registrarPendiente(request);
      const conNuevo = await metricas(request);
      expect(conNuevo.comerciosPendientes).toBe(antes.comerciosPendientes + 1);
      expect(conNuevo.resolicitudesPendientes).toBe(despuesDeReenviar.resolicitudesPendientes);
      await resolverComercio(request, adminToken, nuevo.comercioId, false, 'Limpieza de la métrica');

      await resolverComercio(request, adminToken, dueno.comercioId, false, 'Segundo rechazo');
      const despuesDeResolver = await metricas(request);
      expect(despuesDeResolver.resolicitudesPendientes).toBe(antes.resolicitudesPendientes);
      expect(despuesDeResolver.comerciosPendientes).toBe(antes.comerciosPendientes);
    });

    test('una re-solicitud no avisa al Administrador', async ({ request }) => {
      const dueno = await prepararRechazado(request);
      const contar = async () => ((await apiConHeaders(request, 'GET', '/notificaciones', adminToken)).body.data as any[]).length;
      const antes = await contar();

      expect((await reenviarConCambioSimple(request, dueno)).respuesta.status).toBe(200);

      expect(await contar()).toBe(antes);
    });
  });

  test.describe('elegibilidad para agregar comercios', () => {
    test('con todos los comercios en RECHAZO_DEFINITIVO el Dueño puede agregar otro; con cualquier otra combinación sin aprobados no', async ({ request }) => {
      const dueno = await prepararRechazado(request);
      const clonId = await clonarConRedes(request, dueno.comercioId, `Segundo ${sufijoUnico()}`, 'PENDIENTE');
      const elegible = async () => (await apiConHeaders(request, 'GET', '/comercios/alta-adicional/elegibilidad', dueno.token)).body.data.elegible;
      const fijar = (estadoUno: string, estadoDos: string) => {
        sql(`UPDATE comercio SET estado = '${estadoUno}' WHERE id = ${dueno.comercioId};`);
        sql(`UPDATE comercio SET estado = '${estadoDos}' WHERE id = ${clonId};`);
      };

      const combinaciones: Array<[string, string, boolean]> = [
        ['RECHAZO_DEFINITIVO', 'RECHAZO_DEFINITIVO', true],
        ['RECHAZO_DEFINITIVO', 'APROBADO', true],
        ['RECHAZO_DEFINITIVO', 'APTO_VENTA', true],
        ['PENDIENTE', 'APROBADO', true],
        ['RECHAZO_DEFINITIVO', 'RECHAZADO', false],
        ['RECHAZO_DEFINITIVO', 'PENDIENTE', false],
        ['RECHAZO_DEFINITIVO', 'SUSPENDIDO', false],
        ['RECHAZO_DEFINITIVO', 'CERRADO_TEMPORALMENTE', false],
        ['RECHAZO_DEFINITIVO', 'INACTIVO', false],
        ['RECHAZADO', 'RECHAZADO', false],
        ['PENDIENTE', 'PENDIENTE', false],
        ['SUSPENDIDO', 'SUSPENDIDO', false],
      ];
      for (const [uno, dos, esperado] of combinaciones) {
        fijar(uno, dos);
        expect(await elegible(), `${uno} + ${dos}`).toBe(esperado);
      }

      sql(`DELETE FROM red_social WHERE comercio_id = ${clonId}; DELETE FROM horario WHERE comercio_id = ${clonId}; DELETE FROM direccion WHERE comercio_id = ${clonId}; DELETE FROM comercio WHERE id = ${clonId};`);
      for (const [estado, esperado] of [['RECHAZO_DEFINITIVO', true], ['RECHAZADO', false], ['PENDIENTE', false]] as const) {
        sql(`UPDATE comercio SET estado = '${estado}' WHERE id = ${dueno.comercioId};`);
        expect(await elegible(), `solo ${estado}`).toBe(esperado);
      }
    });

    test('POST /comercios sigue la misma regla: 201 con todos en RECHAZO_DEFINITIVO, 409 con el mensaje de siempre en el resto', async ({ request }) => {
      const dueno = await prepararRechazado(request);
      const foto = await subirFotoNuevoComercio(request, dueno.token);

      const conRechazado = await registrarComercioAdicional(request, dueno.token, localidadId, { fotoPerfilUrl: foto });
      expect(conRechazado.status).toBe(409);
      expect(conRechazado.body.mensaje).toBe(MENSAJE_NO_ELEGIBLE);

      sql(`UPDATE comercio SET estado = 'RECHAZO_DEFINITIVO' WHERE id = ${dueno.comercioId};`);
      const conDefinitivo = await registrarComercioAdicional(request, dueno.token, localidadId, { fotoPerfilUrl: foto });
      expect(conDefinitivo.status).toBe(201);
      expect(conDefinitivo.body.data.estado).toBe('PENDIENTE');

      const otraVez = await registrarComercioAdicional(request, dueno.token, localidadId, { fotoPerfilUrl: foto });
      expect(otraVez.status).toBe(409);
      expect(otraVez.body.mensaje).toBe(MENSAJE_NO_ELEGIBLE);
    });

    test('el aviso al Dueño cuando se aprueba el comercio nuevo de un Dueño con todo rechazado definitivamente es el de siempre', async ({ request }) => {
      const dueno = await prepararRechazado(request);
      sql(`UPDATE comercio SET estado = 'RECHAZO_DEFINITIVO' WHERE id = ${dueno.comercioId};`);
      const foto = await subirFotoNuevoComercio(request, dueno.token);
      const alta = await registrarComercioAdicional(request, dueno.token, localidadId, { fotoPerfilUrl: foto });
      expect(alta.status).toBe(201);

      await resolverComercio(request, adminToken, alta.body.data.id, true);

      expect(estadoDe(alta.body.data.id)).toBe('APROBADO');
      const pendientes = await pendientesDelAdmin(request);
      expect(pendientes.map((p) => p.id)).not.toContain(alta.body.data.id);
      expect((await notificacionesDelComercio(request, dueno.token, alta.body.data.id)).map((n) => n.mensaje)).toContain(
        `Tu comercio ${alta.body.data.nombre} fue aprobado`,
      );
    });
  });

  test.describe('el estado RECHAZO_DEFINITIVO no se cuela en otros flujos', () => {
    test('no se puede suspender', async ({ request }) => {
      const base = await prepararAprobado(request);
      const clonId = await clonarConRedes(request, base.comercioId, `Definitivo ${sufijoUnico()}`, 'RECHAZO_DEFINITIVO');

      const respuesta = await apiConHeaders(request, 'PUT', `/administrador/comercios/${clonId}/suspender`, adminToken, {}, { motivo: 'No corresponde' });

      expect(respuesta.status).toBe(409);
      expect(estadoDe(clonId)).toBe('RECHAZO_DEFINITIVO');
    });

    test('el bloqueo y la restauración de cuenta no lo mueven ni le agregan historial', async ({ request }) => {
      const base = await prepararAprobado(request);
      const clonId = await clonarConRedes(request, base.comercioId, `Definitivo ${sufijoUnico()}`, 'RECHAZO_DEFINITIVO');
      const rechazadoId = await clonarConRedes(request, base.comercioId, `Rechazado ${sufijoUnico()}`, 'RECHAZADO');

      for (let intento = 1; intento <= 3; intento += 1) {
        const fallido = await apiConHeaders(request, 'POST', '/auth/login', undefined, {}, { nombreUsuario: base.nombreUsuario, password: 'ClaveIncorrecta1' });
        expect(fallido.status).toBe(401);
      }
      expect(estadoDe(base.comercioId)).toBe('CERRADO_TEMPORALMENTE');
      expect(estadoDe(clonId)).toBe('RECHAZO_DEFINITIVO');
      expect(estadoDe(rechazadoId)).toBe('RECHAZADO');
      expect(historialDe(clonId)).toEqual([]);

      await apiConHeaders(request, 'POST', '/auth/recuperar-password', undefined, {}, { email: base.email });
      const codigo = await obtenerCodigoTest(request, base.email, 'RECUPERACION_PASSWORD');
      const confirmar = await apiConHeaders(request, 'POST', '/auth/recuperar-password/confirmar', undefined, {}, { email: base.email, codigo, nuevaPassword: 'Testing456' });
      expect(confirmar.status).toBe(200);

      expect(estadoDe(base.comercioId)).toBe('APROBADO');
      expect(estadoDe(clonId)).toBe('RECHAZO_DEFINITIVO');
      expect(estadoDe(rechazadoId)).toBe('RECHAZADO');
      expect(historialDe(clonId)).toEqual([]);
    });

    test('no aparece en el catálogo público y no recibe pedidos', async ({ request }) => {
      const base = await prepararAprobado(request);
      await marcarAptoVenta(request, base.comercioId);
      const clonId = await clonarConRedes(request, base.comercioId, `Definitivo Catalogo ${sufijoUnico()}`, 'RECHAZO_DEFINITIVO');

      const listado = await apiConHeaders(request, 'GET', '/catalogo/comercios', undefined);
      const ids = (listado.body.data as any[]).map((c) => c.id);
      expect(ids).toContain(base.comercioId);
      expect(ids).not.toContain(clonId);
      expect((await apiConHeaders(request, 'GET', `/catalogo/comercios/${clonId}`, undefined)).status).toBe(404);

      const categoriaId = await crearCategoria(request, adminToken, `Cat Def ${sufijoUnico()}`);
      const producto = await apiConHeaders(request, 'POST', '/productos', base.token, { [HEADER]: String(clonId) }, {
        nombre: 'Producto del definitivo',
        descripcion: 'No se puede pedir',
        precio: 1500,
        categoriaId,
      });
      expect(producto.status).toBe(201);
      const cliente = await registrarYVerificarCliente(request, localidadId);
      const sesionCliente = await login(request, cliente.nombreUsuario, cliente.password);
      const carrito = await apiConHeaders(request, 'POST', '/carrito/items', sesionCliente.token, {}, { productoId: producto.body.data.id, cantidad: 1 });

      expect(carrito.status).toBe(409);
      expect(carrito.body.mensaje).toBe('Este comercio no está aceptando pedidos en este momento');
    });
  });
});
