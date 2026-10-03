import { test, expect } from '@playwright/test';
import type { APIRequestContext } from '@playwright/test';
import {
  apiConHeaders,
  aTitleCase,
  buscarComercioPendientePorEmail,
  diaDeHoy,
  fijarPasswordAdminYLoguear,
  login,
  obtenerLocalidadRioGrande,
  payloadAltaAdicional,
  registrarComercioAdicional,
  registrarYVerificarCliente,
  registrarYVerificarComercio,
  resolverComercio,
  sqlTest as sql,
  subirFotoNuevoComercio,
  subirFotoPreRegistro,
  suspenderComercio,
  sufijoUnico,
  vincularMercadoPagoSimuladoTest,
} from './helpers/backend';

const HEADER = 'X-Comercio-Id';
const MOTIVO_MP = 'Vinculación automática de cuenta de Mercado Pago';

interface DuenoPreparado {
  token: string;
  duenoId: number;
  email: string;
  nombreUsuario: string;
  password: string;
  comercioId: number;
  nombre: string;
  foto?: string;
}

type EstadoInicial = 'PENDIENTE' | 'APROBADO' | 'RECHAZADO' | 'SUSPENDIDO';

async function prepararDueno(
  request: APIRequestContext,
  localidadId: string,
  adminToken: string,
  opciones: { estado: EstadoInicial; mercadoPago?: boolean; conFoto?: boolean },
): Promise<DuenoPreparado> {
  const nombre = `Dueno Adic E2E ${sufijoUnico()}`;
  const comercio = await registrarYVerificarComercio(request, localidadId, {
    nombre,
    horarios: [{ diaSemana: diaDeHoy(), horaApertura: '00:00', horaCierre: '23:59' }],
    aceptaDelivery: false,
    aceptaRetiro: true,
  });
  const pendiente = await buscarComercioPendientePorEmail(request, adminToken, comercio.email);
  if (opciones.estado === 'RECHAZADO') {
    await resolverComercio(request, adminToken, pendiente.id, false, 'Rechazo inicial de fixture E2E');
  } else if (opciones.estado === 'APROBADO' || opciones.estado === 'SUSPENDIDO') {
    await resolverComercio(request, adminToken, pendiente.id, true);
  }
  const sesion = await login(request, comercio.nombreUsuario, comercio.password);
  if (opciones.estado === 'SUSPENDIDO') {
    await suspenderComercio(request, adminToken, pendiente.id, 'Suspensión de fixture E2E');
  }
  if (opciones.mercadoPago) {
    await vincularMercadoPagoSimuladoTest(request, sesion.usuario.id);
  }
  const dueno: DuenoPreparado = {
    token: sesion.token,
    duenoId: sesion.usuario.id,
    email: comercio.email,
    nombreUsuario: comercio.nombreUsuario,
    password: comercio.password,
    comercioId: pendiente.id,
    nombre: comercio.nombre,
  };
  if (opciones.conFoto) {
    dueno.foto = await subirFotoNuevoComercio(request, dueno.token);
  }
  return dueno;
}

function estadoDe(comercioId: number): string {
  return sql(`SELECT estado FROM comercio WHERE id = ${comercioId};`);
}

function estadosOtros(duenoId: number, excluirId: number): string {
  return sql(`SELECT GROUP_CONCAT(CONCAT(id, ':', estado) ORDER BY id) FROM comercio WHERE dueno_id = ${duenoId} AND id <> ${excluirId};`);
}

function cantidadComercios(duenoId: number): number {
  return Number(sql(`SELECT COUNT(*) FROM comercio WHERE dueno_id = ${duenoId};`));
}

function historialDe(comercioId: number): string[] {
  const filas = sql(
    `SELECT CONCAT(estado_origen, '>', estado_destino, '|', IFNULL(administrador_id, 'sin-admin'), '|', IFNULL(motivo, '')) ` +
      `FROM historial_estado_comercio WHERE comercio_id = ${comercioId} ORDER BY id;`,
  );
  return filas ? filas.split(/\r?\n/) : [];
}

async function pendientesDelAdmin(request: APIRequestContext, adminToken: string) {
  const { status, body } = await apiConHeaders(request, 'GET', '/administrador/comercios/pendientes', adminToken);
  expect(status).toBe(200);
  return body.data as any[];
}

async function notificacionesDelComercio(request: APIRequestContext, token: string, comercioId: number) {
  const { status, body } = await apiConHeaders(request, 'GET', '/notificaciones', token, { 'X-Comercio-Id': String(comercioId) });
  expect(status).toBe(200);
  return (body.data as any[]).filter((n) => n.entidadTipo === 'COMERCIO' && n.entidadId === comercioId);
}

test.describe('Multi-comercio, tramo 2A: alta adicional, aprobación y bandeja del Administrador', () => {
  test.describe.configure({ timeout: 180_000 });

  let adminToken: string;
  let localidadId: string;
  let otraLocalidadId: string;
  let base: DuenoPreparado;

  test.beforeAll(async ({ request }) => {
    localidadId = await obtenerLocalidadRioGrande(request);
    otraLocalidadId = await obtenerOtraLocalidad(request, localidadId);
    adminToken = (await fijarPasswordAdminYLoguear(request)).token;
    base = await prepararDueno(request, localidadId, adminToken, { estado: 'APROBADO', conFoto: true });
  });

  test.describe('elegibilidad y firma de foto', () => {
    test('un Dueño con un comercio APROBADO o APTO_VENTA es elegible', async ({ request }) => {
      const aprobado = await apiConHeaders(request, 'GET', '/comercios/alta-adicional/elegibilidad', base.token);
      expect(aprobado.status).toBe(200);
      expect(aprobado.body.data).toEqual({ elegible: true });

      const conMp = await prepararDueno(request, localidadId, adminToken, { estado: 'APROBADO', mercadoPago: true });
      expect(estadoDe(conMp.comercioId)).toBe('APTO_VENTA');
      const aptoVenta = await apiConHeaders(request, 'GET', '/comercios/alta-adicional/elegibilidad', conMp.token);
      expect(aptoVenta.body.data).toEqual({ elegible: true });
    });

    test('pendiente, rechazado, suspendido o cerrado temporalmente no habilitan', async ({ request }) => {
      const pendiente = await prepararDueno(request, localidadId, adminToken, { estado: 'PENDIENTE' });
      const rechazado = await prepararDueno(request, localidadId, adminToken, { estado: 'RECHAZADO' });
      const suspendido = await prepararDueno(request, localidadId, adminToken, { estado: 'SUSPENDIDO' });
      const cerrado = await prepararDueno(request, localidadId, adminToken, { estado: 'APROBADO' });
      sql(`UPDATE comercio SET estado = 'CERRADO_TEMPORALMENTE' WHERE id = ${cerrado.comercioId};`);

      expect(estadoDe(suspendido.comercioId)).toBe('SUSPENDIDO');
      for (const [nombre, dueno] of Object.entries({ pendiente, rechazado, suspendido, cerrado })) {
        const respuesta = await apiConHeaders(request, 'GET', '/comercios/alta-adicional/elegibilidad', dueno.token);
        expect(respuesta.status, nombre).toBe(200);
        expect(respuesta.body.data, nombre).toEqual({ elegible: false });
      }
    });

    test('sin token da 401 y con un rol distinto de DUENO da 403, en los 3 endpoints nuevos', async ({ request }) => {
      const cliente = await registrarYVerificarCliente(request, localidadId);
      const clienteSesion = await login(request, cliente.nombreUsuario, cliente.password);
      const rutas = [
        ['GET', '/comercios/alta-adicional/elegibilidad'],
        ['POST', '/comercios/nuevo/foto/firma'],
        ['POST', '/comercios'],
      ] as const;
      for (const [metodo, ruta] of rutas) {
        const sinToken = await apiConHeaders(request, metodo, ruta, undefined, {}, metodo === 'POST' ? {} : undefined);
        expect(sinToken.status, `${metodo} ${ruta} sin token`).toBe(401);
        const comoCliente = await apiConHeaders(request, metodo, ruta, clienteSesion.token, {}, metodo === 'POST' ? {} : undefined);
        expect(comoCliente.status, `${metodo} ${ruta} como cliente`).toBe(403);
        const comoAdmin = await apiConHeaders(request, metodo, ruta, adminToken, {}, metodo === 'POST' ? {} : undefined);
        expect(comoAdmin.status, `${metodo} ${ruta} como administrador`).toBe(403);
      }
    });

    test('la firma de foto del alta apunta a duenos/{duenoId}/comercios-nuevos/', async ({ request }) => {
      const respuesta = await apiConHeaders(request, 'POST', '/comercios/nuevo/foto/firma', base.token);
      expect(respuesta.status).toBe(200);
      expect(respuesta.body.data.folder).toBe(`duenos/${base.duenoId}/comercios-nuevos/`);
      expect(respuesta.body.data.signature).toBeTruthy();
      expect(respuesta.body.data.uploadPreset).toBeTruthy();
    });

    test('los 3 endpoints ignoran X-Comercio-Id aunque sea inválido, inexistente o de otro Dueño', async ({ request }) => {
      const otro = await prepararDueno(request, localidadId, adminToken, { estado: 'PENDIENTE' });
      for (const valor of ['abc', '99999999', String(otro.comercioId)]) {
        const elegibilidad = await apiConHeaders(request, 'GET', '/comercios/alta-adicional/elegibilidad', base.token, { [HEADER]: valor });
        expect(elegibilidad.status, `elegibilidad ${valor}`).toBe(200);
        const firma = await apiConHeaders(request, 'POST', '/comercios/nuevo/foto/firma', base.token, { [HEADER]: valor });
        expect(firma.status, `firma ${valor}`).toBe(200);
        const alta = await registrarComercioAdicional(request, base.token, localidadId, { fotoPerfilUrl: base.foto }, { [HEADER]: valor });
        expect(alta.status, `alta ${valor}`).toBe(201);
      }
    });
  });

  test.describe('alta', () => {
    test('un Dueño no elegible recibe 409 y no se crea ningún comercio', async ({ request }) => {
      const pendiente = await prepararDueno(request, localidadId, adminToken, { estado: 'PENDIENTE', conFoto: true });
      const suspendido = await prepararDueno(request, localidadId, adminToken, { estado: 'SUSPENDIDO', conFoto: true });
      for (const dueno of [pendiente, suspendido]) {
        const antes = cantidadComercios(dueno.duenoId);
        const respuesta = await registrarComercioAdicional(request, dueno.token, localidadId, { fotoPerfilUrl: dueno.foto });
        expect(respuesta.status).toBe(409);
        expect(respuesta.body.mensaje).toContain('al menos uno aprobado');
        expect(cantidadComercios(dueno.duenoId)).toBe(antes);
      }
    });

    test('el alta crea un comercio PENDIENTE sin historial, reutiliza los datos del Dueño y no toca su cuenta ni sus otros comercios', async ({ request }) => {
      const dueno = await prepararDueno(request, localidadId, adminToken, { estado: 'APROBADO', conFoto: true });
      const usuarioAntes = sql(`SELECT CONCAT(estado, '|', intentos_fallidos) FROM usuario WHERE id = ${dueno.duenoId};`);

      const nombre = `Sucursal Centro E2E ${sufijoUnico()}`;
      const alta = await registrarComercioAdicional(request, dueno.token, localidadId, {
        fotoPerfilUrl: dueno.foto,
        nombre,
        descripcion: 'Descripción propia de la sucursal',
      });
      expect(alta.status).toBe(201);
      const creado = alta.body.data;
      expect(creado.estado).toBe('PENDIENTE');
      expect(creado.nombre).toBe(aTitleCase(nombre));
      expect(creado.fotoPerfilUrl).toBe(dueno.foto);
      expect(creado.direccion.calle).toBe('Belgrano');
      expect(creado.horarios).toHaveLength(1);

      expect(historialDe(creado.id)).toEqual([]);
      expect(sql(`SELECT COUNT(*) FROM direccion WHERE comercio_id = ${creado.id};`)).toBe('1');
      expect(sql(`SELECT COUNT(*) FROM horario WHERE comercio_id = ${creado.id};`)).toBe('1');
      expect(sql(`SELECT COUNT(*) FROM red_social WHERE comercio_id = ${creado.id};`)).toBe('1');
      expect(sql(`SELECT dueno_id FROM comercio WHERE id = ${creado.id};`)).toBe(String(dueno.duenoId));
      expect(estadoDe(dueno.comercioId)).toBe('APROBADO');
      expect(sql(`SELECT CONCAT(estado, '|', intentos_fallidos) FROM usuario WHERE id = ${dueno.duenoId};`)).toBe(usuarioAntes);
      expect(estadosOtros(dueno.duenoId, creado.id)).toBe(`${dueno.comercioId}:APROBADO`);

      const perfilNuevo = await apiConHeaders(request, 'GET', '/comercios/perfil', dueno.token, { [HEADER]: String(creado.id) });
      const perfilPrimero = await apiConHeaders(request, 'GET', '/comercios/perfil', dueno.token, { [HEADER]: String(dueno.comercioId) });
      expect(perfilNuevo.status).toBe(200);
      expect(perfilNuevo.body.data.id).toBe(creado.id);
      expect(perfilNuevo.body.data.razonSocial).toBe(perfilPrimero.body.data.razonSocial);
      expect(perfilNuevo.body.data.cuit).toBe(perfilPrimero.body.data.cuit);
      expect(perfilNuevo.body.data.representante).toEqual(perfilPrimero.body.data.representante);

      const catalogo = await apiConHeaders(request, 'GET', '/catalogo/comercios', undefined);
      expect((catalogo.body.data as any[]).map((c) => c.id)).not.toContain(creado.id);
    });

    test('los datos fiscales y de cuenta que lleguen en el body se ignoran', async ({ request }) => {
      const dueno = await prepararDueno(request, localidadId, adminToken, { estado: 'APROBADO', conFoto: true });
      const cuitOriginal = sql(`SELECT pj.cuit FROM persona_juridica pj WHERE pj.id = ${dueno.duenoId};`);
      const payload = {
        ...payloadAltaAdicional(localidadId, dueno.foto as string),
        cuit: '20000000001',
        razonSocial: 'Otra Razon Social SA',
        email: 'otro.email@bajonea.test',
        password: 'OtraClave123',
        nombreUsuario: 'otronombreusuario',
        dniRepresentante: '11111111',
      };
      const respuesta = await apiConHeaders(request, 'POST', '/comercios', dueno.token, {}, payload);
      expect(respuesta.status).toBe(201);
      expect(respuesta.body.data.cuit).toBe(cuitOriginal);
      expect(respuesta.body.data.razonSocial).not.toBe('Otra Razon Social SA');
      expect(sql(`SELECT email FROM usuario WHERE id = ${dueno.duenoId};`)).toBe(dueno.email);
    });

    test('los campos obligatorios y los formatos inválidos dan 400 sin crear nada', async ({ request }) => {
      const antes = cantidadComercios(base.duenoId);
      const valido = payloadAltaAdicional(localidadId, base.foto as string);
      const casos: Array<[string, (p: any) => void]> = [
        ['body vacío', (p) => Object.keys(p).forEach((k) => delete p[k])],
        ['nombre vacío', (p) => (p.nombre = '')],
        ['nombre solo con símbolos', (p) => (p.nombre = '***')],
        ['nombre de más de 150 caracteres', (p) => (p.nombre = 'A'.repeat(151))],
        ['teléfono inválido', (p) => (p.telefono = 'abc')],
        ['email de contacto inválido', (p) => (p.emailContacto = 'no-es-un-email')],
        ['sin tipo de comercio', (p) => delete p.tipoComercio],
        ['tipo de comercio inexistente', (p) => (p.tipoComercio = 'INVENTADO')],
        ['sin dirección', (p) => delete p.direccion],
        ['calle vacía', (p) => (p.direccion.calle = '')],
        ['número no numérico', (p) => (p.direccion.numero = 'abc')],
        ['código postal inválido', (p) => (p.direccion.codigoPostal = '12')],
        ['localidad vacía', (p) => (p.direccion.localidadId = '')],
        ['sin horarios', (p) => delete p.horarios],
        ['horarios vacíos', (p) => (p.horarios = [])],
        ['cierre anterior a la apertura', (p) => (p.horarios = [{ diaSemana: 'LUNES', horaApertura: '20:00', horaCierre: '10:00' }])],
        [
          'horarios superpuestos el mismo día',
          (p) =>
            (p.horarios = [
              { diaSemana: 'LUNES', horaApertura: '10:00', horaCierre: '14:00' },
              { diaSemana: 'LUNES', horaApertura: '13:00', horaCierre: '18:00' },
            ]),
        ],
        ['sin redes sociales', (p) => (p.redesSociales = [])],
        [
          'más de 5 redes sociales',
          (p) => (p.redesSociales = Array.from({ length: 6 }, (_, i) => ({ tipo: 'INSTAGRAM', url: `https://instagram.com/r${i}` }))),
        ],
        [
          'dos redes del mismo tipo',
          (p) =>
            (p.redesSociales = [
              { tipo: 'INSTAGRAM', url: 'https://instagram.com/a' },
              { tipo: 'INSTAGRAM', url: 'https://instagram.com/b' },
            ]),
        ],
        ['ni delivery ni retiro', (p) => ((p.aceptaDelivery = false), (p.aceptaRetiro = false))],
        ['sin foto', (p) => delete p.fotoPerfilUrl],
        ['foto vacía', (p) => (p.fotoPerfilUrl = '')],
        ['foto por http', (p) => (p.fotoPerfilUrl = (base.foto as string).replace('https://', 'http://'))],
        ['foto de otro dominio', (p) => (p.fotoPerfilUrl = 'https://ejemplo.com/foto.png')],
      ];
      for (const [nombre, mutar] of casos) {
        const payload = JSON.parse(JSON.stringify(valido));
        mutar(payload);
        const respuesta = await apiConHeaders(request, 'POST', '/comercios', base.token, {}, payload);
        expect(respuesta.status, nombre).toBe(400);
      }
      expect(cantidadComercios(base.duenoId)).toBe(antes);
    });

    test('una localidad inexistente da 404 sin crear nada', async ({ request }) => {
      const antes = cantidadComercios(base.duenoId);
      const respuesta = await registrarComercioAdicional(request, base.token, localidadId, {
        fotoPerfilUrl: base.foto,
        direccion: { calle: 'Belgrano', numero: '250', pisoDepto: null, codigoPostal: '9420', localidadId: '0000000', principal: false },
      });
      expect(respuesta.status).toBe(404);
      expect(cantidadComercios(base.duenoId)).toBe(antes);
    });

    test('la foto tiene que ser de la carpeta del propio Dueño: la de otro Dueño, la de otra cuenta y la de otra carpeta dan 400', async ({ request }) => {
      const otro = await prepararDueno(request, localidadId, adminToken, { estado: 'APROBADO', conFoto: true });
      const preRegistro = await subirFotoPreRegistro(request, 'comercio');
      const deOtraCuenta = (base.foto as string).replace(/res\.cloudinary\.com\/[^/]+\//, 'res.cloudinary.com/otra-cuenta/');
      const casos: Array<[string, string]> = [
        ['foto de otro Dueño', otro.foto as string],
        ['foto del pre-registro', preRegistro],
        ['foto de otra cuenta de Cloudinary', deOtraCuenta],
        ['id de Dueño que solo es prefijo del propio', (base.foto as string).replace(`/duenos/${base.duenoId}/`, `/duenos/${base.duenoId}0/`)],
        ['carpeta propia pero de otro tipo', (base.foto as string).replace('/comercios-nuevos/', '/otra-carpeta/')],
      ];
      const antes = cantidadComercios(base.duenoId);
      for (const [nombre, url] of casos) {
        const respuesta = await registrarComercioAdicional(request, base.token, localidadId, { fotoPerfilUrl: url });
        expect(respuesta.status, nombre).toBe(400);
      }
      expect(cantidadComercios(base.duenoId)).toBe(antes);
    });

    test('teléfono y email de contacto pueden repetirse entre comercios del mismo Dueño y no hay tope de altas pendientes', async ({ request }) => {
      const dueno = await prepararDueno(request, localidadId, adminToken, { estado: 'APROBADO', conFoto: true });
      const contacto = { telefono: '+5492964111222', emailContacto: 'repetido.e2e@bajonea.test' };
      for (let i = 0; i < 4; i += 1) {
        const respuesta = await registrarComercioAdicional(request, dueno.token, localidadId, { fotoPerfilUrl: dueno.foto, ...contacto });
        expect(respuesta.status, `alta ${i + 1}`).toBe(201);
      }
      expect(cantidadComercios(dueno.duenoId)).toBe(5);
    });
  });

  test.describe('comercio duplicado', () => {
    let dueno: DuenoPreparado;
    let nombre: string;
    let direccion: { calle: string; numero: string; pisoDepto: string | null; codigoPostal: string; localidadId: string; principal: boolean };
    let adicionalId: number;

    test.beforeAll(async ({ request }) => {
      dueno = await prepararDueno(request, localidadId, adminToken, { estado: 'APROBADO', conFoto: true });
      const sufijo = sufijoUnico();
      nombre = `Cafetería Ñandú ${sufijo}`;
      direccion = { calle: 'Ushuaia', numero: '480', pisoDepto: '2B', codigoPostal: '9420', localidadId, principal: false };
      const alta = await registrarComercioAdicional(request, dueno.token, localidadId, { fotoPerfilUrl: dueno.foto, nombre, direccion });
      expect(alta.status).toBe(201);
      adicionalId = alta.body.data.id;
    });

    const intentar = (request: APIRequestContext, cambios: { nombre?: string; direccion?: Partial<typeof direccion> }) =>
      registrarComercioAdicional(request, dueno.token, localidadId, {
        fotoPerfilUrl: dueno.foto,
        nombre: cambios.nombre ?? nombre,
        direccion: { ...direccion, ...cambios.direccion },
      });

    test('el mismo nombre en la misma dirección da 409, con un mensaje distinto al de no elegible', async ({ request }) => {
      const respuesta = await intentar(request, {});
      expect(respuesta.status).toBe(409);
      expect(respuesta.body.mensaje).toContain('nombre en esa dirección');
      expect(respuesta.body.mensaje).not.toContain('al menos uno aprobado');
    });

    test('mayúsculas, tildes, espacios de más y código postal distinto no evitan el duplicado', async ({ request }) => {
      const sufijo = nombre.split(' ').pop();
      const variantes = [
        { nombre: `CAFETERIA NANDU ${sufijo}`, direccion: {} },
        { nombre: `  cafeteria   ñandú ${sufijo}  `, direccion: { calle: '  USHUAIA ' } },
        { nombre: nombre, direccion: { pisoDepto: ' 2b ' } },
        { nombre: nombre, direccion: { codigoPostal: 'V9420ABC' } },
      ];
      for (const variante of variantes) {
        const respuesta = await intentar(request, variante);
        expect(respuesta.status, JSON.stringify(variante)).toBe(409);
      }
    });

    test('el mismo nombre en otra dirección, con otro piso, sin piso o en otra localidad es un comercio distinto', async ({ request }) => {
      const casos: Array<[string, { direccion: Partial<typeof direccion> }]> = [
        ['otro número', { direccion: { numero: '481' } }],
        ['otra calle', { direccion: { calle: 'Perito Moreno' } }],
        ['otro piso', { direccion: { pisoDepto: '3C' } }],
        ['sin piso', { direccion: { pisoDepto: null } }],
        ['otra localidad', { direccion: { localidadId: otraLocalidadId } }],
      ];
      for (const [descripcion, cambios] of casos) {
        const respuesta = await intentar(request, cambios);
        expect(respuesta.status, descripcion).toBe(201);
      }
    });

    test('piso nulo y piso vacío o en blanco cuentan como lo mismo', async ({ request }) => {
      const sufijo = sufijoUnico();
      const sinPiso = { calle: 'Elcano', numero: '77', pisoDepto: null, codigoPostal: '9420', localidadId, principal: false };
      const primera = await registrarComercioAdicional(request, dueno.token, localidadId, {
        fotoPerfilUrl: dueno.foto,
        nombre: `Piso Nulo ${sufijo}`,
        direccion: sinPiso,
      });
      expect(primera.status).toBe(201);
      for (const pisoDepto of ['', '   ']) {
        const segunda = await registrarComercioAdicional(request, dueno.token, localidadId, {
          fotoPerfilUrl: dueno.foto,
          nombre: `Piso Nulo ${sufijo}`,
          direccion: { ...sinPiso, pisoDepto },
        });
        expect(segunda.status, `piso "${pisoDepto}"`).toBe(409);
      }
    });

    test('el duplicado se detecta también contra el comercio original ya aprobado', async ({ request }) => {
      const nombreOriginal = sql(`SELECT nombre FROM comercio WHERE id = ${dueno.comercioId};`);
      const direccionOriginal = sql(`SELECT CONCAT(calle, '|', numero) FROM direccion WHERE comercio_id = ${dueno.comercioId};`).split('|');
      const respuesta = await registrarComercioAdicional(request, dueno.token, localidadId, {
        fotoPerfilUrl: dueno.foto,
        nombre: nombreOriginal.toUpperCase(),
        direccion: { calle: direccionOriginal[0], numero: direccionOriginal[1], pisoDepto: null, codigoPostal: '9420', localidadId, principal: false },
      });
      expect(respuesta.status).toBe(409);
    });

    test('un comercio RECHAZADO no cuenta como duplicado: se puede volver a dar de alta el mismo', async ({ request }) => {
      const rechazo = await apiConHeaders(request, 'PUT', `/administrador/comercios/${adicionalId}/resolver`, adminToken, {}, {
        aprobar: false,
        motivo: 'Fotos poco claras (E2E)',
      });
      expect(rechazo.status).toBe(200);
      expect(estadoDe(adicionalId)).toBe('RECHAZADO');

      const otraVez = await intentar(request, {});
      expect(otraVez.status).toBe(201);
      const nuevoId = otraVez.body.data.id;
      expect(nuevoId).not.toBe(adicionalId);

      const tercera = await intentar(request, {});
      expect(tercera.status).toBe(409);
    });

    test('dos Dueños distintos pueden tener el mismo nombre en la misma dirección', async ({ request }) => {
      const otro = await prepararDueno(request, localidadId, adminToken, { estado: 'APROBADO', conFoto: true });
      const respuesta = await registrarComercioAdicional(request, otro.token, localidadId, { fotoPerfilUrl: otro.foto, nombre, direccion });
      expect(respuesta.status).toBe(201);
    });

    test('dos altas idénticas en paralelo: una se crea y la otra da 409', async ({ request }) => {
      const paralelo = await prepararDueno(request, localidadId, adminToken, { estado: 'APROBADO', conFoto: true });
      const payload = payloadAltaAdicional(localidadId, paralelo.foto as string, { nombre: `Paralelo E2E ${sufijoUnico()}` });
      const antes = cantidadComercios(paralelo.duenoId);
      const [a, b] = await Promise.all([
        apiConHeaders(request, 'POST', '/comercios', paralelo.token, {}, payload),
        apiConHeaders(request, 'POST', '/comercios', paralelo.token, {}, payload),
      ]);
      expect([a.status, b.status].sort()).toEqual([201, 409]);
      expect(cantidadComercios(paralelo.duenoId)).toBe(antes + 1);
    });
  });

  test.describe('aprobación y rechazo del comercio adicional', () => {
    async function altaPendiente(request: APIRequestContext, dueno: DuenoPreparado, nombre?: string) {
      const alta = await registrarComercioAdicional(request, dueno.token, localidadId, {
        fotoPerfilUrl: dueno.foto,
        nombre: nombre ?? `Adicional Aprobacion ${sufijoUnico()}`,
      });
      expect(alta.status).toBe(201);
      return alta.body.data as { id: number; nombre: string };
    }

    test('sin cuenta de Mercado Pago: nace APROBADO, con una fila de historial y el aviso simple', async ({ request }) => {
      const dueno = await prepararDueno(request, localidadId, adminToken, { estado: 'APROBADO', conFoto: true });
      const adicional = await altaPendiente(request, dueno);
      const otrosAntes = estadosOtros(dueno.duenoId, adicional.id);
      const historialOtroAntes = historialDe(dueno.comercioId);
      const usuarioAntes = sql(`SELECT estado FROM usuario WHERE id = ${dueno.duenoId};`);

      await resolverComercio(request, adminToken, adicional.id, true);

      expect(estadoDe(adicional.id)).toBe('APROBADO');
      const historial = historialDe(adicional.id);
      expect(historial).toHaveLength(1);
      expect(historial[0]).toMatch(/^PENDIENTE>APROBADO\|\d+\|$/);
      expect(sql(`SELECT fecha_modificacion IS NOT NULL FROM comercio WHERE id = ${adicional.id};`)).toBe('1');

      const notificaciones = await notificacionesDelComercio(request, dueno.token, adicional.id);
      expect(notificaciones).toHaveLength(1);
      expect(notificaciones[0].mensaje).toBe(`Tu comercio ${adicional.nombre} fue aprobado`);
      expect(sql(`SELECT tipo FROM notificacion WHERE id = ${notificaciones[0].id};`)).toBe('COMERCIO_APROBADO');

      expect(estadosOtros(dueno.duenoId, adicional.id)).toBe(otrosAntes);
      expect(historialDe(dueno.comercioId)).toEqual(historialOtroAntes);
      expect(sql(`SELECT estado FROM usuario WHERE id = ${dueno.duenoId};`)).toBe(usuarioAntes);
    });

    test('con cuenta de Mercado Pago activa: nace APTO_VENTA, con dos filas de historial y el aviso de que ya puede vender', async ({ request }) => {
      const dueno = await prepararDueno(request, localidadId, adminToken, { estado: 'APROBADO', mercadoPago: true, conFoto: true });
      expect(estadoDe(dueno.comercioId)).toBe('APTO_VENTA');
      const adicional = await altaPendiente(request, dueno);
      const otrosAntes = estadosOtros(dueno.duenoId, adicional.id);
      const usuarioAntes = sql(`SELECT estado FROM usuario WHERE id = ${dueno.duenoId};`);

      await resolverComercio(request, adminToken, adicional.id, true);

      expect(estadoDe(adicional.id)).toBe('APTO_VENTA');
      const historial = historialDe(adicional.id);
      expect(historial).toHaveLength(2);
      expect(historial[0]).toMatch(/^PENDIENTE>APROBADO\|\d+\|$/);
      expect(historial[1]).toBe(`APROBADO>APTO_VENTA|sin-admin|${MOTIVO_MP}`);

      const notificaciones = await notificacionesDelComercio(request, dueno.token, adicional.id);
      expect(notificaciones).toHaveLength(1);
      expect(notificaciones[0].mensaje).toBe(`Tu comercio ${adicional.nombre} fue aprobado y ya podés vender`);

      expect(estadosOtros(dueno.duenoId, adicional.id)).toBe(otrosAntes);
      expect(sql(`SELECT estado FROM usuario WHERE id = ${dueno.duenoId};`)).toBe(usuarioAntes);

      const catalogo = await apiConHeaders(request, 'GET', '/catalogo/comercios', undefined);
      expect((catalogo.body.data as any[]).map((c) => c.id)).toContain(adicional.id);
    });

    test('con la cuenta de Mercado Pago desvinculada: nace APROBADO', async ({ request }) => {
      const dueno = await prepararDueno(request, localidadId, adminToken, { estado: 'APROBADO', mercadoPago: true, conFoto: true });
      const adicional = await altaPendiente(request, dueno);
      const desvincular = await apiConHeaders(request, 'DELETE', '/oauth/mercadopago/desvincular', dueno.token);
      expect(desvincular.status).toBe(200);
      expect(estadoDe(dueno.comercioId)).toBe('APROBADO');

      await resolverComercio(request, adminToken, adicional.id, true);

      expect(estadoDe(adicional.id)).toBe('APROBADO');
      expect(historialDe(adicional.id)).toHaveLength(1);
      const notificaciones = await notificacionesDelComercio(request, dueno.token, adicional.id);
      expect(notificaciones[0].mensaje).toBe(`Tu comercio ${adicional.nombre} fue aprobado`);
    });

    test('la cuenta de Mercado Pago vinculada mientras el adicional estaba pendiente lo lleva a APTO_VENTA al aprobarlo', async ({ request }) => {
      const dueno = await prepararDueno(request, localidadId, adminToken, { estado: 'APROBADO', conFoto: true });
      const adicional = await altaPendiente(request, dueno);
      await vincularMercadoPagoSimuladoTest(request, dueno.duenoId);
      expect(estadoDe(dueno.comercioId)).toBe('APTO_VENTA');
      expect(estadoDe(adicional.id)).toBe('PENDIENTE');

      await resolverComercio(request, adminToken, adicional.id, true);
      expect(estadoDe(adicional.id)).toBe('APTO_VENTA');
      expect(historialDe(adicional.id)).toHaveLength(2);
    });

    test('el primer comercio de un Dueño que ya vinculó Mercado Pago también nace APTO_VENTA', async ({ request }) => {
      const dueno = await prepararDueno(request, localidadId, adminToken, { estado: 'PENDIENTE', mercadoPago: true });
      expect(estadoDe(dueno.comercioId)).toBe('PENDIENTE');
      await resolverComercio(request, adminToken, dueno.comercioId, true);
      expect(estadoDe(dueno.comercioId)).toBe('APTO_VENTA');
      const notificaciones = await notificacionesDelComercio(request, dueno.token, dueno.comercioId);
      expect(notificaciones[0].mensaje).toBe(`Tu comercio ${dueno.nombre} fue aprobado y ya podés vender`);
    });

    test('el rechazo del adicional no cambia: motivo en el historial y en el aviso, sin tocar la cuenta ni los otros comercios', async ({ request }) => {
      const dueno = await prepararDueno(request, localidadId, adminToken, { estado: 'APROBADO', mercadoPago: true, conFoto: true });
      const adicional = await altaPendiente(request, dueno);
      const otrosAntes = estadosOtros(dueno.duenoId, adicional.id);
      const usuarioAntes = sql(`SELECT estado FROM usuario WHERE id = ${dueno.duenoId};`);
      const motivo = `Documentación incompleta (E2E ${sufijoUnico()})`;

      await resolverComercio(request, adminToken, adicional.id, false, motivo);

      expect(estadoDe(adicional.id)).toBe('RECHAZADO');
      const historial = historialDe(adicional.id);
      expect(historial).toHaveLength(1);
      expect(historial[0]).toMatch(/^PENDIENTE>RECHAZADO\|\d+\|/);
      expect(historial[0].endsWith(`|${motivo}`)).toBe(true);
      const notificaciones = await notificacionesDelComercio(request, dueno.token, adicional.id);
      expect(notificaciones[0].mensaje).toBe(`Tu comercio ${adicional.nombre} fue rechazado. Motivo: ${motivo}`);
      expect(sql(`SELECT tipo FROM notificacion WHERE id = ${notificaciones[0].id};`)).toBe('COMERCIO_RECHAZADO');
      expect(estadosOtros(dueno.duenoId, adicional.id)).toBe(otrosAntes);
      expect(sql(`SELECT estado FROM usuario WHERE id = ${dueno.duenoId};`)).toBe(usuarioAntes);

      const perfil = await apiConHeaders(request, 'GET', '/comercios/perfil', dueno.token, { [HEADER]: String(adicional.id) });
      expect(perfil.body.data.motivoRechazo).toBe(motivo);
    });

    test('aprobar un adicional no resuelve las otras altas pendientes del mismo Dueño', async ({ request }) => {
      const dueno = await prepararDueno(request, localidadId, adminToken, { estado: 'APROBADO', conFoto: true });
      const a = await altaPendiente(request, dueno);
      const b = await altaPendiente(request, dueno);
      await resolverComercio(request, adminToken, a.id, true);
      expect(estadoDe(a.id)).toBe('APROBADO');
      expect(estadoDe(b.id)).toBe('PENDIENTE');
      await resolverComercio(request, adminToken, b.id, false, 'No corresponde (E2E)');
      expect(estadoDe(a.id)).toBe('APROBADO');
      expect(estadoDe(b.id)).toBe('RECHAZADO');
    });
  });

  test.describe('bandeja de pendientes del Administrador', () => {
    test('un adicional se marca esAdicional y lista los otros comercios del Dueño, incluidas otras altas pendientes', async ({ request }) => {
      const dueno = await prepararDueno(request, localidadId, adminToken, { estado: 'APROBADO', conFoto: true });
      const a1 = await registrarComercioAdicional(request, dueno.token, localidadId, { fotoPerfilUrl: dueno.foto });
      const a2 = await registrarComercioAdicional(request, dueno.token, localidadId, { fotoPerfilUrl: dueno.foto });
      const id1 = a1.body.data.id as number;
      const id2 = a2.body.data.id as number;

      const pendientes = await pendientesDelAdmin(request, adminToken);
      const p1 = pendientes.find((c) => c.id === id1);
      const p2 = pendientes.find((c) => c.id === id2);
      for (const pendiente of [p1, p2]) {
        expect(pendiente.esAdicional).toBe(true);
        expect(pendiente.duenoId).toBe(dueno.duenoId);
      }
      expect(p1.otrosComercios.map((o: any) => [o.id, o.estado])).toEqual([
        [dueno.comercioId, 'APROBADO'],
        [id2, 'PENDIENTE'],
      ]);
      expect(p2.otrosComercios.map((o: any) => [o.id, o.estado])).toEqual([
        [dueno.comercioId, 'APROBADO'],
        [id1, 'PENDIENTE'],
      ]);
      const referencia = p1.otrosComercios[0];
      expect(referencia.nombre).toBe(dueno.nombre);
      expect(referencia.fotoPerfilUrl).toContain('res.cloudinary.com');
    });

    test('el primer comercio de un Dueño, todavía pendiente, no lleva etiqueta ni otros comercios', async ({ request }) => {
      const dueno = await prepararDueno(request, localidadId, adminToken, { estado: 'PENDIENTE' });
      const pendiente = (await pendientesDelAdmin(request, adminToken)).find((c) => c.id === dueno.comercioId);
      expect(pendiente.esAdicional).toBe(false);
      expect(pendiente.otrosComercios).toEqual([]);
      expect(pendiente.duenoId).toBe(dueno.duenoId);
    });

    test('el comercio de referencia sigue contando como aprobado aunque después se suspenda', async ({ request }) => {
      const dueno = await prepararDueno(request, localidadId, adminToken, { estado: 'APROBADO', conFoto: true });
      const alta = await registrarComercioAdicional(request, dueno.token, localidadId, { fotoPerfilUrl: dueno.foto });
      const adicionalId = alta.body.data.id as number;
      await suspenderComercio(request, adminToken, dueno.comercioId, 'Suspensión posterior (E2E)');
      expect(estadoDe(dueno.comercioId)).toBe('SUSPENDIDO');

      const pendiente = (await pendientesDelAdmin(request, adminToken)).find((c) => c.id === adicionalId);
      expect(pendiente.esAdicional).toBe(true);
      expect(pendiente.otrosComercios.map((o: any) => [o.id, o.estado])).toEqual([[dueno.comercioId, 'SUSPENDIDO']]);
    });

    test('un comercio de referencia aprobado a mano, sin historial, se detecta por su estado actual', async ({ request }) => {
      const dueno = await prepararDueno(request, localidadId, adminToken, { estado: 'APROBADO', conFoto: true });
      const alta = await registrarComercioAdicional(request, dueno.token, localidadId, { fotoPerfilUrl: dueno.foto });
      const adicionalId = alta.body.data.id as number;
      sql(`DELETE FROM historial_estado_comercio WHERE comercio_id = ${dueno.comercioId};`);
      expect(historialDe(dueno.comercioId)).toEqual([]);

      const pendiente = (await pendientesDelAdmin(request, adminToken)).find((c) => c.id === adicionalId);
      expect(pendiente.esAdicional).toBe(true);
    });

    test('el historial de aprobación cuenta aunque hoy el otro comercio esté rechazado o pendiente de nuevo', async ({ request }) => {
      const dueno = await prepararDueno(request, localidadId, adminToken, { estado: 'APROBADO', conFoto: true });
      const alta = await registrarComercioAdicional(request, dueno.token, localidadId, { fotoPerfilUrl: dueno.foto });
      const adicionalId = alta.body.data.id as number;
      sql(`UPDATE comercio SET estado = 'PENDIENTE' WHERE id = ${dueno.comercioId};`);

      const pendientes = await pendientesDelAdmin(request, adminToken);
      const pendiente = pendientes.find((c) => c.id === adicionalId);
      expect(pendiente.esAdicional).toBe(true);
      const primero = pendientes.find((c) => c.id === dueno.comercioId);
      expect(primero.esAdicional).toBe(false);
    });

    test('otro comercio del Dueño que nunca fue aprobado (rechazado) no marca la solicitud como adicional', async ({ request }) => {
      const otro = await prepararDueno(request, localidadId, adminToken, { estado: 'PENDIENTE' });
      sql(
        `INSERT INTO comercio (dueno_id, nombre, foto_perfil_url, telefono, email, tipo_comercio, acepta_delivery, acepta_retiro, estado, fecha_registro) ` +
          `SELECT dueno_id, 'Clon Rechazado E2E', foto_perfil_url, telefono, email, tipo_comercio, acepta_delivery, acepta_retiro, 'RECHAZADO', NOW() FROM comercio WHERE id = ${otro.comercioId};`,
      );
      const pendiente = (await pendientesDelAdmin(request, adminToken)).find((c) => c.id === otro.comercioId);
      expect(pendiente.esAdicional).toBe(false);
      expect(pendiente.otrosComercios.map((o: any) => o.estado)).toEqual(['RECHAZADO']);
    });

    test('el listado de aprobados no trae datos de Dueño ni de otros comercios', async ({ request }) => {
      const { status, body } = await apiConHeaders(request, 'GET', '/administrador/comercios', adminToken);
      expect(status).toBe(200);
      const aprobado = (body.data as any[]).find((c) => c.id === base.comercioId);
      expect(aprobado).toBeTruthy();
      expect(aprobado.duenoId).toBeNull();
      expect(aprobado.esAdicional).toBe(false);
      expect(aprobado.otrosComercios).toEqual([]);
    });
  });
});

async function obtenerOtraLocalidad(request: APIRequestContext, distintaDe: string): Promise<string> {
  const provincias = await apiConHeaders(request, 'GET', '/geografia/provincias', undefined);
  const provincia = (provincias.body.data as any[]).find((p) => p.nombre.startsWith('Tierra del Fuego'));
  const localidades = await apiConHeaders(request, 'GET', `/geografia/localidades?provinciaId=${encodeURIComponent(provincia.id)}`, undefined);
  const otra = (localidades.body.data as any[]).find((l) => l.id !== distintaDe);
  if (!otra) {
    throw new Error('No hay una segunda localidad en Tierra del Fuego para el test de dirección distinta');
  }
  return otra.id as string;
}
