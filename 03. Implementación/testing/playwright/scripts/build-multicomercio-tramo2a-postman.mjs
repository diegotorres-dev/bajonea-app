import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const collectionPath = path.resolve(__dirname, '../../../postman/Bajonea-MVP.postman_collection.json');
const environmentPath = path.resolve(__dirname, '../../../postman/Bajonea-Local.postman_environment.json');

const NOMBRE_FOLDER = '50 - Multi-comercio Tramo 2A (alta adicional, elegibilidad, duplicados, aprobacion y bandeja)';
const HEADER = 'X-Comercio-Id';

function cuitValido(base10) {
  const mult = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  let suma = 0;
  for (let i = 0; i < 10; i += 1) suma += Number(base10[i]) * mult[i];
  let dv = 11 - (suma % 11);
  if (dv === 11) dv = 0;
  if (dv === 10) throw new Error(`CUIT base ${base10} sin digito verificador valido`);
  return `${base10}${dv}`;
}

const DUENOS = [
  { sufijo: 'P', cuit: cuitValido('3080040011'), dni: '30600300', descripcion: 'aprobado (Dueño principal de esta carpeta)' },
  { sufijo: 'Q', cuit: cuitValido('3080040021'), dni: '30600301', descripcion: 'solo pendiente' },
  { sufijo: 'R', cuit: cuitValido('3080040031'), dni: '30600302', descripcion: 'suspendido' },
  { sufijo: 'S', cuit: cuitValido('3080040041'), dni: '30600303', descripcion: 'rechazado' },
];

function req(method, urlPath, { body, token, headers = {}, query } = {}) {
  const header = [];
  if (token) header.push({ key: 'Authorization', value: `Bearer {{${token}}}` });
  if (body !== undefined) header.push({ key: 'Content-Type', value: 'application/json' });
  for (const [key, value] of Object.entries(headers)) header.push({ key, value });
  const segments = urlPath.replace(/^\//, '').split('/');
  const raw = `{{base_url}}/${segments.join('/')}${query ? `?${query}` : ''}`;
  const url = { raw, host: ['{{base_url}}'], path: segments };
  if (query) {
    url.query = query.split('&').map((par) => {
      const [key, ...resto] = par.split('=');
      return { key, value: resto.join('=') };
    });
  }
  const request = { method, header, url };
  if (body !== undefined) {
    request.body = { mode: 'raw', raw: JSON.stringify(body, null, 2), options: { raw: { language: 'json' } } };
  }
  return request;
}

function item(name, request, testLines = []) {
  return {
    name,
    request,
    response: [],
    event: testLines.length ? [{ listen: 'test', script: { type: 'text/javascript', exec: testLines } }] : [],
  };
}

const status = (codigo) => `pm.test('Status code es ${codigo}', () => pm.response.to.have.status(${codigo}));`;
const guardar = (variable, expr) => `pm.environment.set('${variable}', ${expr});`;
const mensajeContiene = (texto) => `pm.test('El mensaje contiene "${texto}"', () => pm.expect(pm.response.json().mensaje).to.include(${JSON.stringify(texto)}));`;

const horariosTodosLosDias = ['LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO', 'DOMINGO'].map((diaSemana) => ({
  diaSemana,
  horaApertura: '00:00:00',
  horaCierre: '23:59:00',
}));

function registroDueno({ sufijo, cuit, dni }) {
  return {
    razonSocial: `Alta Postman ${sufijo} SRL`,
    cuit,
    condicionIva: 'RESPONSABLE_INSCRIPTO',
    tipoSociedad: 'SRL',
    domicilioFiscal: `Direccion alta ${sufijo}`,
    fechaInicioActividades: '2020-01-01',
    nombre: `Alta Postman ${sufijo}`,
    telefono: '+5492964555444',
    emailContacto: `contacto.alta${sufijo}@bajonea.test`,
    tipoComercio: 'RESTAURANTE',
    aceptaDelivery: false,
    aceptaRetiro: true,
    nombreUsuario: `{{alta${sufijo}_usuario}}`,
    email: `{{alta${sufijo}_email}}`,
    password: `{{alta${sufijo}_password}}`,
    direccion: { calle: 'Belgrano', numero: '700', pisoDepto: null, codigoPostal: '9420', localidadId: '{{localidad_id}}', principal: false },
    horarios: horariosTodosLosDias,
    nombreRepresentante: 'Carlos',
    apellidoRepresentante: 'Sanchez',
    dniRepresentante: dni,
    telefonoRepresentante: '+5492964701103',
    fechaNacimientoRepresentante: '1988-04-04',
    fotoPerfilUrl: `https://res.cloudinary.com/demo/image/upload/postman-alta-${sufijo.toLowerCase()}.jpg`,
    redesSociales: [{ tipo: 'INSTAGRAM', url: `instagram.com/alta${sufijo.toLowerCase()}` }],
  };
}

function cuerpoAlta(mutar) {
  const cuerpo = {
    nombre: 'Sucursal Postman Base',
    descripcion: 'Comercio adicional generado por la coleccion de Postman',
    telefono: '+5492964555444',
    emailContacto: 'contacto.adicional@bajonea.test',
    tipoComercio: 'RESTAURANTE',
    aceptaDelivery: false,
    aceptaRetiro: true,
    fotoPerfilUrl: '{{alta_foto_url}}',
    direccion: { calle: 'Elcano', numero: '900', pisoDepto: null, codigoPostal: '9420', localidadId: '{{localidad_id}}', principal: false },
    horarios: [{ diaSemana: 'LUNES', horaApertura: '09:00:00', horaCierre: '18:00:00' }],
    redesSociales: [{ tipo: 'INSTAGRAM', url: 'instagram.com/sucursalpostman' }],
  };
  if (mutar) mutar(cuerpo);
  return cuerpo;
}

const altaP = (nombre, request, testLines, mutar, headers) =>
  item(nombre, req('POST', '/comercios', { token: 'token_alta_p', body: cuerpoAlta(mutar), headers }), testLines);

const items = [];

items.push(
  item('Login Administrador (sesion propia de esta carpeta)', req('POST', '/auth/login', { body: { nombreUsuario: '{{admin_usuario}}', password: '{{admin_password}}' } }), [
    status(200),
    guardar('token_admin', 'pm.response.json().data.token'),
  ]),
);

items.push(
  item('Registro Cliente (para probar el 403 por rol)', req('POST', '/auth/registro/cliente', {
    body: {
      nombre: 'Clienta',
      apellido: 'AltaPostman',
      dni: '30600310',
      fechaNacimiento: '1995-05-20',
      telefono: '+5492964555000',
      nombreUsuario: '{{altaC_usuario}}',
      email: '{{altaC_email}}',
      password: '{{altaC_password}}',
      aceptaTerminos: true,
      direccion: { calle: 'Calle Siempre Viva', numero: '123', pisoDepto: null, codigoPostal: '9420', localidadId: '{{localidad_id}}', principal: true },
    },
  }), [status(201)]),
  item('Bypass test - codigo de verificacion Cliente', req('GET', '/test/token-verificacion', { query: 'email={{altaC_email}}' }), [
    status(200),
    guardar('altaC_codigo', 'pm.response.json().data'),
  ]),
  item('Verificar cuenta Cliente', req('POST', '/auth/verificar', { body: { email: '{{altaC_email}}', codigo: '{{altaC_codigo}}' } }), [status(200)]),
  item('Login Cliente', req('POST', '/auth/login', { body: { nombreUsuario: '{{altaC_usuario}}', password: '{{altaC_password}}' } }), [
    status(200),
    guardar('token_alta_cliente', 'pm.response.json().data.token'),
  ]),
);

const varComercio = { P: 'alta_p_a_id', Q: 'alta_q_a_id', R: 'alta_r_a_id', S: 'alta_s_a_id' };

for (const dueno of DUENOS) {
  const { sufijo } = dueno;
  const tokenVar = `token_alta_${sufijo.toLowerCase()}`;
  items.push(
    item(`Registro Dueño ${sufijo} (${dueno.descripcion})`, req('POST', '/auth/registro/comercio', { body: registroDueno(dueno) }), [status(201)]),
    item(`Bypass test - codigo de verificacion Dueño ${sufijo}`, req('GET', '/test/token-verificacion', { query: `email={{alta${sufijo}_email}}` }), [
      status(200),
      guardar(`alta${sufijo}_codigo`, 'pm.response.json().data'),
    ]),
    item(`Verificar cuenta Dueño ${sufijo}`, req('POST', '/auth/verificar', { body: { email: `{{alta${sufijo}_email}}`, codigo: `{{alta${sufijo}_codigo}}` } }), [status(200)]),
    item(`Login Dueño ${sufijo}`, req('POST', '/auth/login', { body: { nombreUsuario: `{{alta${sufijo}_usuario}}`, password: `{{alta${sufijo}_password}}` } }), [
      status(200),
      guardar(tokenVar, 'pm.response.json().data.token'),
      ...(sufijo === 'P' ? [guardar('alta_p_dueno_id', 'pm.response.json().data.usuario.id')] : []),
    ]),
    item(`Administrador busca el comercio pendiente del Dueño ${sufijo}`, req('GET', '/administrador/comercios/pendientes', { token: 'token_admin' }), [
      status(200),
      `const c = pm.response.json().data.find((x) => x.emailCuenta === pm.environment.get('alta${sufijo}_email').toLowerCase());`,
      `pm.test('El comercio del Dueño ${sufijo} esta pendiente', () => pm.expect(c).to.exist);`,
      guardar(varComercio[sufijo], 'c.id'),
      ...(sufijo === 'Q'
        ? [
            "pm.test('El primer comercio de un Dueño, pendiente, no es adicional y no lista otros comercios', () => { pm.expect(c.esAdicional).to.eql(false); pm.expect(c.otrosComercios).to.eql([]); pm.expect(c.duenoId).to.be.a('number'); });",
          ]
        : []),
    ]),
  );
  if (sufijo === 'P' || sufijo === 'R') {
    items.push(item(`Administrador aprueba el comercio del Dueño ${sufijo}`, req('PUT', `/administrador/comercios/{{${varComercio[sufijo]}}}/resolver`, { token: 'token_admin', body: { aprobar: true } }), [status(200)]));
  }
  if (sufijo === 'R') {
    items.push(
      item('Administrador suspende el comercio del Dueño R', req('PUT', `/administrador/comercios/{{${varComercio.R}}}/suspender`, { token: 'token_admin', body: { motivo: 'Suspension de prueba de Postman' } }), [status(200)]),
    );
  }
  if (sufijo === 'S') {
    items.push(
      item('Administrador rechaza el comercio del Dueño S', req('PUT', `/administrador/comercios/{{${varComercio.S}}}/resolver`, { token: 'token_admin', body: { aprobar: false, motivo: 'Rechazo de prueba de Postman' } }), [status(200)]),
    );
  }
}

const elegibilidad = (nombre, tokenVar, esperado, headers) =>
  item(nombre, req('GET', '/comercios/alta-adicional/elegibilidad', { token: tokenVar, headers }), [
    status(200),
    `pm.test('elegible es ${esperado}', () => pm.expect(pm.response.json().data).to.eql({ elegible: ${esperado} }));`,
  ]);

items.push(
  item('[elegibilidad] Sin token: 401', req('GET', '/comercios/alta-adicional/elegibilidad'), [status(401)]),
  item('[elegibilidad] Con rol Administrador: 403', req('GET', '/comercios/alta-adicional/elegibilidad', { token: 'token_admin' }), [status(403)]),
  item('[elegibilidad] Con rol Cliente: 403', req('GET', '/comercios/alta-adicional/elegibilidad', { token: 'token_alta_cliente' }), [status(403)]),
  elegibilidad('[elegibilidad] Dueño P con comercio aprobado: elegible', 'token_alta_p', true),
  elegibilidad('[elegibilidad] Dueño Q con solo un comercio pendiente: no elegible', 'token_alta_q', false),
  elegibilidad('[elegibilidad] Dueño R con su comercio suspendido: no elegible', 'token_alta_r', false),
  elegibilidad('[elegibilidad] Dueño S con su comercio rechazado: no elegible', 'token_alta_s', false),
  elegibilidad('[elegibilidad] El header X-Comercio-Id no numerico se ignora', 'token_alta_p', true, { [HEADER]: 'abc' }),
  elegibilidad('[elegibilidad] El header X-Comercio-Id de otro Dueño se ignora', 'token_alta_p', true, { [HEADER]: '{{alta_q_a_id}}' }),
);

items.push(
  item('[firma] Sin token: 401', req('POST', '/comercios/nuevo/foto/firma'), [status(401)]),
  item('[firma] Con rol Administrador: 403', req('POST', '/comercios/nuevo/foto/firma', { token: 'token_admin' }), [status(403)]),
  item('[firma] Dueño P: firma a duenos/{id}/comercios-nuevos/', req('POST', '/comercios/nuevo/foto/firma', { token: 'token_alta_p' }), [
    status(200),
    "const d = pm.response.json().data;",
    "pm.test('La carpeta es la del Dueño', () => pm.expect(d.folder).to.eql('duenos/' + pm.environment.get('alta_p_dueno_id') + '/comercios-nuevos/'));",
    "pm.test('Trae firma y preset', () => { pm.expect(d.signature).to.be.a('string').and.not.empty; pm.expect(d.uploadPreset).to.be.a('string').and.not.empty; });",
    guardar('alta_foto_url', "'https://res.cloudinary.com/' + d.cloudName + '/image/upload/v1/' + d.folder + 'postman-alta.png'"),
    guardar('alta_foto_pre_registro_url', "'https://res.cloudinary.com/' + d.cloudName + '/image/upload/v1/comercios/pre-registro/postman-alta.png'"),
    guardar('alta_foto_otro_dueno_url', "'https://res.cloudinary.com/' + d.cloudName + '/image/upload/v1/duenos/999999/comercios-nuevos/postman-alta.png'"),
    guardar('alta_foto_otra_cuenta_url', "'https://res.cloudinary.com/otra-cuenta-inexistente/image/upload/v1/' + d.folder + 'postman-alta.png'"),
  ]),
  item('[firma] El header X-Comercio-Id invalido se ignora', req('POST', '/comercios/nuevo/foto/firma', { token: 'token_alta_p', headers: { [HEADER]: 'abc' } }), [status(200)]),
);

items.push(
  item('[alta] Sin token: 401', req('POST', '/comercios', { body: cuerpoAlta() }), [status(401)]),
  item('[alta] Con rol Administrador: 403', req('POST', '/comercios', { token: 'token_admin', body: cuerpoAlta() }), [status(403)]),
  item('[alta] Con rol Cliente: 403', req('POST', '/comercios', { token: 'token_alta_cliente', body: cuerpoAlta() }), [status(403)]),
  item('[alta] Dueño Q (solo pendiente): 409 no elegible', req('POST', '/comercios', { token: 'token_alta_q', body: cuerpoAlta() }), [status(409), mensajeContiene('al menos uno aprobado')]),
  item('[alta] Dueño R (suspendido): 409 no elegible', req('POST', '/comercios', { token: 'token_alta_r', body: cuerpoAlta() }), [status(409), mensajeContiene('al menos uno aprobado')]),
  item('[alta] Dueño S (rechazado): 409 no elegible', req('POST', '/comercios', { token: 'token_alta_s', body: cuerpoAlta() }), [status(409), mensajeContiene('al menos uno aprobado')]),
);

const invalidos = [
  ['body vacio', (c) => Object.keys(c).forEach((k) => delete c[k])],
  ['sin nombre', (c) => delete c.nombre],
  ['nombre vacio', (c) => (c.nombre = '')],
  ['nombre solo con simbolos', (c) => (c.nombre = '***')],
  ['nombre de 151 caracteres', (c) => (c.nombre = 'A'.repeat(151))],
  ['descripcion de mas de 2000 caracteres', (c) => (c.descripcion = 'D'.repeat(2001))],
  ['sin telefono', (c) => delete c.telefono],
  ['telefono con formato invalido', (c) => (c.telefono = 'abc')],
  ['sin email de contacto', (c) => delete c.emailContacto],
  ['email de contacto con formato invalido', (c) => (c.emailContacto = 'no-es-un-email')],
  ['sin tipo de comercio', (c) => delete c.tipoComercio],
  ['tipo de comercio inexistente', (c) => (c.tipoComercio = 'INVENTADO')],
  ['sin direccion', (c) => delete c.direccion],
  ['calle vacia', (c) => (c.direccion.calle = '')],
  ['numero no numerico', (c) => (c.direccion.numero = 'abc')],
  ['codigo postal invalido', (c) => (c.direccion.codigoPostal = '12')],
  ['localidad vacia', (c) => (c.direccion.localidadId = '')],
  ['sin horarios', (c) => delete c.horarios],
  ['horarios vacios', (c) => (c.horarios = [])],
  ['cierre anterior a la apertura', (c) => (c.horarios = [{ diaSemana: 'LUNES', horaApertura: '20:00:00', horaCierre: '10:00:00' }])],
  [
    'horarios superpuestos el mismo dia',
    (c) =>
      (c.horarios = [
        { diaSemana: 'LUNES', horaApertura: '10:00:00', horaCierre: '14:00:00' },
        { diaSemana: 'LUNES', horaApertura: '13:00:00', horaCierre: '18:00:00' },
      ]),
  ],
  ['sin redes sociales', (c) => (c.redesSociales = [])],
  ['6 redes sociales', (c) => (c.redesSociales = Array.from({ length: 6 }, (_, i) => ({ tipo: 'INSTAGRAM', url: `instagram.com/r${i}` })))],
  [
    'dos redes del mismo tipo',
    (c) =>
      (c.redesSociales = [
        { tipo: 'INSTAGRAM', url: 'instagram.com/a' },
        { tipo: 'INSTAGRAM', url: 'instagram.com/b' },
      ]),
  ],
  ['ni delivery ni retiro', (c) => ((c.aceptaDelivery = false), (c.aceptaRetiro = false))],
  ['sin foto', (c) => delete c.fotoPerfilUrl],
  ['foto vacia', (c) => (c.fotoPerfilUrl = '')],
  ['foto de otro dominio', (c) => (c.fotoPerfilUrl = 'https://ejemplo.com/foto.png')],
  ['foto por http', (c) => (c.fotoPerfilUrl = 'http://res.cloudinary.com/demo/image/upload/v1/foto.png')],
  ['foto de la carpeta del pre-registro', (c) => (c.fotoPerfilUrl = '{{alta_foto_pre_registro_url}}')],
  ['foto de la carpeta de otro Dueño', (c) => (c.fotoPerfilUrl = '{{alta_foto_otro_dueno_url}}')],
  ['foto de otra cuenta de Cloudinary', (c) => (c.fotoPerfilUrl = '{{alta_foto_otra_cuenta_url}}')],
];
for (const [descripcion, mutar] of invalidos) {
  items.push(altaP(`[alta invalida] ${descripcion}: 400`, null, [status(400)], mutar));
}

items.push(
  altaP('[alta invalida] Localidad inexistente: 404', null, [status(404)], (c) => (c.direccion.localidadId = '0000000')),
  altaP(
    '[alta] Ok: comercio adicional del Dueño P nace PENDIENTE',
    null,
    [
      status(201),
      "const d = pm.response.json().data;",
      "pm.test('Nace PENDIENTE', () => pm.expect(d.estado).to.eql('PENDIENTE'));",
      "pm.test('Reutiliza los datos fiscales del Dueño', () => { pm.expect(d.razonSocial).to.include('Alta Postman P'); pm.expect(d.representante.nombre).to.eql('Carlos'); });",
      guardar('alta_p_b_id', 'd.id'),
    ],
    (c) => (c.nombre = 'Cafetería Ñandú Postman'),
  ),
  item('[alta] El comercio adicional pendiente es accesible con X-Comercio-Id', req('GET', '/comercios/perfil', { token: 'token_alta_p', headers: { [HEADER]: '{{alta_p_b_id}}' } }), [
    status(200),
    "pm.test('Es el adicional y esta pendiente', () => { const d = pm.response.json().data; pm.expect(d.id).to.eql(Number(pm.environment.get('alta_p_b_id'))); pm.expect(d.estado).to.eql('PENDIENTE'); });",
  ]),
  item('[alta] El adicional pendiente no aparece en el catalogo publico', req('GET', '/catalogo/comercios'), [
    status(200),
    "pm.test('No esta en el catalogo', () => pm.expect(pm.response.json().data.map((c) => c.id)).to.not.include(Number(pm.environment.get('alta_p_b_id'))));",
  ]),
  altaP('[alta] Ok: el header X-Comercio-Id invalido se ignora', null, [status(201)], (c) => (c.nombre = 'Sucursal Postman Header'), { [HEADER]: 'abc' }),
  altaP('[alta] Ok: telefono y email de contacto repetidos entre comercios del mismo Dueño', null, [status(201)], (c) => {
    c.nombre = 'Sucursal Postman Contacto Repetido';
    c.telefono = '+5492964555444';
    c.emailContacto = 'contacto.altaP@bajonea.test';
  }),
);

const dir = (cambios) => (c) => Object.assign(c.direccion, cambios);
const duplicado = (nombre, mutar) => altaP(nombre, null, [status(409), mensajeContiene('nombre en esa dirección')], mutar);
const baseDuplicada = (c) => {
  c.nombre = 'Cafetería Ñandú Postman';
};

items.push(
  duplicado('[duplicado] Mismo nombre y misma direccion contra un comercio PENDIENTE: 409', baseDuplicada),
  duplicado('[duplicado] Con mayusculas y sin tildes: 409', (c) => (c.nombre = 'CAFETERIA NANDU POSTMAN')),
  duplicado('[duplicado] Con espacios de mas en nombre y calle: 409', (c) => {
    c.nombre = '  cafeteria   ñandú   postman  ';
    c.direccion.calle = '  ELCANO ';
  }),
  duplicado('[duplicado] Con otro codigo postal (no cuenta): 409', (c) => {
    baseDuplicada(c);
    c.direccion.codigoPostal = 'V9420ABC';
  }),
  altaP('[duplicado] Mismo nombre en otra direccion (otro numero): 201', null, [status(201)], (c) => {
    baseDuplicada(c);
    c.direccion.numero = '901';
  }),
  altaP('[duplicado] Mismo nombre y direccion con otro piso: 201', null, [status(201)], (c) => {
    baseDuplicada(c);
    c.direccion.pisoDepto = '3C';
  }),
  altaP('[duplicado] Piso con otras mayusculas y espacios equivale al 3C ya cargado: 409', null, [status(409)], (c) => {
    baseDuplicada(c);
    c.direccion.pisoDepto = ' 3c ';
  }),
  altaP('[duplicado] Piso vacio equivale a sin piso: 409 contra la base', null, [status(409)], (c) => {
    baseDuplicada(c);
    c.direccion.pisoDepto = '   ';
  }),
  altaP('[duplicado] Contra el comercio original APROBADO del Dueño: 409', null, [status(409), mensajeContiene('nombre en esa dirección')], (c) => {
    c.nombre = 'ALTA POSTMAN P';
    Object.assign(c.direccion, { calle: 'Belgrano', numero: '700' });
  }),
  item('[duplicado] Administrador rechaza el adicional base (RECHAZADO no cuenta como duplicado)', req('PUT', '/administrador/comercios/{{alta_p_b_id}}/resolver', { token: 'token_admin', body: { aprobar: false, motivo: 'Fotos poco claras (Postman)' } }), [
    status(200),
  ]),
  altaP('[duplicado] Tras el rechazo se puede dar de alta el mismo comercio otra vez: 201', null, [status(201), guardar('alta_p_c_id', 'pm.response.json().data.id')], baseDuplicada),
  duplicado('[duplicado] Y un tercer intento igual ya es duplicado: 409', baseDuplicada),
);

const enBandeja = (nombre, comercioVar, chequeo) =>
  item(nombre, req('GET', '/administrador/comercios/pendientes', { token: 'token_admin' }), [
    status(200),
    `const c = pm.response.json().data.find((x) => x.id === Number(pm.environment.get('${comercioVar}')));`,
    "pm.test('La solicitud esta en la bandeja', () => pm.expect(c).to.exist);",
    chequeo,
  ]);

items.push(
  enBandeja('[bandeja] El adicional pendiente se marca esAdicional y lista los otros comercios del Dueño', 'alta_p_c_id',
    "pm.test('esAdicional y otros comercios', () => { pm.expect(c.esAdicional).to.eql(true); pm.expect(c.duenoId).to.eql(Number(pm.environment.get('alta_p_dueno_id'))); const ids = c.otrosComercios.map((o) => o.id); pm.expect(ids).to.include(Number(pm.environment.get('alta_p_a_id'))); pm.expect(ids).to.include(Number(pm.environment.get('alta_p_b_id'))); pm.expect(ids).to.not.include(c.id); const primero = c.otrosComercios.find((o) => o.id === Number(pm.environment.get('alta_p_a_id'))); pm.expect(primero.estado).to.eql('APROBADO'); pm.expect(primero.nombre).to.eql('Alta Postman P'); pm.expect(primero.fotoPerfilUrl).to.be.a('string'); const rechazado = c.otrosComercios.find((o) => o.id === Number(pm.environment.get('alta_p_b_id'))); pm.expect(rechazado.estado).to.eql('RECHAZADO'); });"),
  item('[bandeja] El listado de aprobados no trae datos de Dueño ni de otros comercios', req('GET', '/administrador/comercios', { token: 'token_admin' }), [
    status(200),
    "const c = pm.response.json().data.find((x) => x.id === Number(pm.environment.get('alta_p_a_id')));",
    "pm.test('Valores neutros', () => { pm.expect(c).to.exist; pm.expect(c.duenoId).to.eql(null); pm.expect(c.esAdicional).to.eql(false); pm.expect(c.otrosComercios).to.eql([]); });",
  ]),
);

const notificacionDe = (nombre, comercioVar, mensajeEsperado) =>
  item(nombre, req('GET', '/notificaciones', { token: 'token_alta_p', headers: { [HEADER]: `{{${comercioVar}}}` } }), [
    status(200),
    `const n = pm.response.json().data.filter((x) => x.entidadTipo === 'COMERCIO' && x.entidadId === Number(pm.environment.get('${comercioVar}')));`,
    `pm.test('Hay una notificacion con el texto esperado', () => { pm.expect(n).to.have.length(1); pm.expect(n[0].mensaje).to.eql(${mensajeEsperado}); });`,
  ]);

items.push(
  item('[aprobacion] Estado del comercio original antes de aprobar el adicional', req('GET', '/comercios/perfil', { token: 'token_alta_p', headers: { [HEADER]: '{{alta_p_a_id}}' } }), [
    status(200),
    "pm.test('APROBADO', () => pm.expect(pm.response.json().data.estado).to.eql('APROBADO'));",
  ]),
  item('[aprobacion] Administrador aprueba el adicional sin cuenta de Mercado Pago: queda APROBADO', req('PUT', '/administrador/comercios/{{alta_p_c_id}}/resolver', { token: 'token_admin', body: { aprobar: true } }), [status(200)]),
  item('[aprobacion] El adicional quedo APROBADO', req('GET', '/comercios/perfil', { token: 'token_alta_p', headers: { [HEADER]: '{{alta_p_c_id}}' } }), [
    status(200),
    "pm.test('APROBADO', () => pm.expect(pm.response.json().data.estado).to.eql('APROBADO'));",
    guardar('alta_p_c_nombre', 'pm.response.json().data.nombre'),
  ]),
  notificacionDe('[aprobacion] Aviso simple al Dueño', 'alta_p_c_id', "'Tu comercio ' + pm.environment.get('alta_p_c_nombre') + ' fue aprobado'"),
  item('[aprobacion] El comercio original sigue APROBADO (aprobar el adicional no lo toca)', req('GET', '/comercios/perfil', { token: 'token_alta_p', headers: { [HEADER]: '{{alta_p_a_id}}' } }), [
    status(200),
    "pm.test('APROBADO', () => pm.expect(pm.response.json().data.estado).to.eql('APROBADO'));",
  ]),
  item('[aprobacion] El Dueño sigue pudiendo iniciar sesion (su cuenta no cambio)', req('GET', '/comercios/alta-adicional/elegibilidad', { token: 'token_alta_p' }), [
    status(200),
    "pm.test('elegible', () => pm.expect(pm.response.json().data.elegible).to.eql(true));",
  ]),
  item('[aprobacion mp] Vincular cuenta simulada de Mercado Pago al Dueño P', req('POST', '/test/duenos/{{alta_p_dueno_id}}/mercadopago-simulada', { body: {} }), [status(200)]),
  item('[aprobacion mp] Los dos comercios aprobados pasan a APTO_VENTA', req('GET', '/comercios/perfil', { token: 'token_alta_p', headers: { [HEADER]: '{{alta_p_c_id}}' } }), [
    status(200),
    "pm.test('APTO_VENTA', () => pm.expect(pm.response.json().data.estado).to.eql('APTO_VENTA'));",
  ]),
  altaP('[aprobacion mp] Nueva alta adicional del Dueño P con cuenta vinculada', null, [status(201), guardar('alta_p_d_id', 'pm.response.json().data.id')], (c) => (c.nombre = 'Sucursal Postman Con MP')),
  item('[aprobacion mp] Administrador aprueba: el adicional nace APTO_VENTA', req('PUT', '/administrador/comercios/{{alta_p_d_id}}/resolver', { token: 'token_admin', body: { aprobar: true } }), [status(200)]),
  item('[aprobacion mp] El adicional quedo APTO_VENTA', req('GET', '/comercios/perfil', { token: 'token_alta_p', headers: { [HEADER]: '{{alta_p_d_id}}' } }), [
    status(200),
    "pm.test('APTO_VENTA', () => pm.expect(pm.response.json().data.estado).to.eql('APTO_VENTA'));",
    guardar('alta_p_d_nombre', 'pm.response.json().data.nombre'),
  ]),
  notificacionDe('[aprobacion mp] Aviso de que ya puede vender', 'alta_p_d_id', "'Tu comercio ' + pm.environment.get('alta_p_d_nombre') + ' fue aprobado y ya podés vender'"),
  item('[aprobacion mp] El adicional aprobado esta en el catalogo publico', req('GET', '/catalogo/comercios'), [
    status(200),
    "pm.test('Esta en el catalogo', () => pm.expect(pm.response.json().data.map((c) => c.id)).to.include(Number(pm.environment.get('alta_p_d_id'))));",
  ]),
  altaP('[rechazo] Alta adicional para rechazar', null, [status(201), guardar('alta_p_e_id', 'pm.response.json().data.id'), guardar('alta_p_e_nombre', 'pm.response.json().data.nombre')], (c) => (c.nombre = 'Sucursal Postman Rechazada')),
  item('[rechazo] Administrador rechaza el adicional con motivo', req('PUT', '/administrador/comercios/{{alta_p_e_id}}/resolver', { token: 'token_admin', body: { aprobar: false, motivo: 'Motivo de rechazo de Postman' } }), [status(200)]),
  notificacionDe('[rechazo] Aviso de rechazo con nombre y motivo (sin cambios)', 'alta_p_e_id', "'Tu comercio ' + pm.environment.get('alta_p_e_nombre') + ' fue rechazado. Motivo: Motivo de rechazo de Postman'"),
  item('[rechazo] El perfil del rechazado trae el motivo', req('GET', '/comercios/perfil', { token: 'token_alta_p', headers: { [HEADER]: '{{alta_p_e_id}}' } }), [
    status(200),
    "pm.test('RECHAZADO con motivo', () => { const d = pm.response.json().data; pm.expect(d.estado).to.eql('RECHAZADO'); pm.expect(d.motivoRechazo).to.eql('Motivo de rechazo de Postman'); });",
  ]),
  item('[rechazo] Los comercios aprobados del Dueño siguen como estaban', req('GET', '/comercios/perfil', { token: 'token_alta_p', headers: { [HEADER]: '{{alta_p_c_id}}' } }), [
    status(200),
    "pm.test('APTO_VENTA', () => pm.expect(pm.response.json().data.estado).to.eql('APTO_VENTA'));",
  ]),
);

const folder = { name: NOMBRE_FOLDER, item: items };

const collection = JSON.parse(fs.readFileSync(collectionPath, 'utf8'));
const idx = collection.item.findIndex((f) => f.name === NOMBRE_FOLDER);
if (idx >= 0) collection.item[idx] = folder;
else collection.item.push(folder);
fs.writeFileSync(collectionPath, JSON.stringify(collection, null, 2) + '\n', 'utf8');

const environment = JSON.parse(fs.readFileSync(environmentPath, 'utf8'));
const variables = {};
Object.assign(variables, {
  altaC_email: 'postman.altaC@bajonea.test',
  altaC_usuario: 'postmanaltac',
  altaC_password: 'Postman123',
  altaC_codigo: '',
  token_alta_cliente: '',
});
for (const { sufijo } of DUENOS) {
  variables[`alta${sufijo}_email`] = `postman.alta${sufijo}@bajonea.test`;
  variables[`alta${sufijo}_usuario`] = `postmanalta${sufijo.toLowerCase()}`;
  variables[`alta${sufijo}_password`] = 'Postman123';
  variables[`alta${sufijo}_codigo`] = '';
  variables[`token_alta_${sufijo.toLowerCase()}`] = '';
}
Object.assign(variables, {
  alta_p_dueno_id: '',
  alta_p_a_id: '',
  alta_p_b_id: '',
  alta_p_c_id: '',
  alta_p_c_nombre: '',
  alta_p_d_id: '',
  alta_p_d_nombre: '',
  alta_p_e_id: '',
  alta_p_e_nombre: '',
  alta_q_a_id: '',
  alta_r_a_id: '',
  alta_s_a_id: '',
  alta_foto_url: '',
  alta_foto_pre_registro_url: '',
  alta_foto_otro_dueno_url: '',
  alta_foto_otra_cuenta_url: '',
});
const existentes = new Set(environment.values.map((v) => v.key));
for (const [key, value] of Object.entries(variables)) {
  if (!existentes.has(key)) environment.values.push({ key, value, type: 'default', enabled: true });
}
fs.writeFileSync(environmentPath, JSON.stringify(environment, null, 2) + '\n', 'utf8');

console.log(`OK: carpeta "${NOMBRE_FOLDER}" con ${items.length} requests.`);
