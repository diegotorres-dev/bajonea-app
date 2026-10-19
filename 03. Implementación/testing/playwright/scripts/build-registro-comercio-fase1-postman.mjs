import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const collectionPath = path.resolve(__dirname, '../../../postman/Bajonea-MVP.postman_collection.json');
const environmentPath = path.resolve(__dirname, '../../../postman/Bajonea-Local.postman_environment.json');

const NOMBRE_FOLDER = '70 - Registro de Comercio Fase 1 (datos legales opcionales, sin email de contacto, terminos y geografia de Tierra del Fuego)';
const HEADER = 'X-Comercio-Id';
const MENSAJE_TERMINOS = 'Tenés que aceptar los Términos y Condiciones';
const MENSAJE_LOCALIDAD = 'Esa localidad todavía no está disponible';
const USHUAIA = '94015020';
const TOLHUIN = '94011010';
const FUERA_DE_LA_LISTA = [
  ['Laguna Escondida', '94015010'],
  ['Puerto Argentino', '94021010'],
  ['Ciudad de Buenos Aires', '02014010'],
];
const INEXISTENTE = '99999999';

function cuitValido(base10) {
  const mult = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  let suma = 0;
  for (let i = 0; i < 10; i += 1) suma += Number(base10[i]) * mult[i];
  let dv = 11 - (suma % 11);
  if (dv === 11) dv = 0;
  return dv === 10 ? null : `${base10}${dv}`;
}

let contador = 0;
function identidad() {
  let cuit = null;
  while (cuit === null) {
    contador += 1;
    cuit = cuitValido(`3093${String(contador).padStart(6, '0')}`);
  }
  const n = String(contador).padStart(4, '0');
  return { n, cuit, dni: `3093${n}`, email: `fase1.postman.${n}@bajonea.test`, usuario: `fase1pm${n}` };
}

function req(method, urlPath, { body, token, query, headers } = {}) {
  const header = [];
  if (token) header.push({ key: 'Authorization', value: `Bearer {{${token}}}` });
  if (body !== undefined) header.push({ key: 'Content-Type', value: 'application/json' });
  for (const [key, value] of Object.entries(headers || {})) header.push({ key, value });
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
    const raw = typeof body === 'string' ? body : JSON.stringify(body, null, 2);
    request.body = { mode: 'raw', raw, options: { raw: { language: 'json' } } };
  }
  return request;
}

function item(name, request, testLines = []) {
  const event = [];
  if (testLines.length) event.push({ listen: 'test', script: { type: 'text/javascript', exec: testLines } });
  return { name, request, response: [], event };
}

const status = (codigo) => `pm.test('Status code es ${codigo}', () => pm.response.to.have.status(${codigo}));`;
const guardar = (variable, expr) => `pm.environment.set('${variable}', ${expr});`;
const campo = (clave, mensaje) =>
  `pm.test('El error de ${clave} es exacto', () => pm.expect(pm.response.json().data[${JSON.stringify(clave)}]).to.eql(${JSON.stringify(mensaje)}));`;
const sinCampo = (...claves) =>
  `pm.test('No trae ${claves.join(', ')}', () => { const d = pm.response.json().data; ${JSON.stringify(claves)}.forEach((c) => pm.expect(d).to.not.have.property(c)); });`;

const horarios = [{ diaSemana: 'LUNES', horaApertura: '09:00:00', horaCierre: '18:00:00' }];
const direccion = (localidadId) => ({ calle: 'Belgrano', numero: '800', pisoDepto: null, codigoPostal: '9420', localidadId, principal: true });

function cuerpoComercio(id, cambios = {}) {
  return {
    fotoPerfilUrl: `https://res.cloudinary.com/demo/image/upload/postman-fase1-${id.n}.jpg`,
    aceptaTerminos: true,
    razonSocial: `Fase Uno Postman ${id.n} SRL`,
    cuit: id.cuit,
    condicionIva: 'RESPONSABLE_INSCRIPTO',
    tipoSociedad: 'SRL',
    domicilioFiscal: `Direccion fiscal fase 1 ${id.n}`,
    fechaInicioActividades: '2020-01-01',
    nombre: `Local Fase Uno ${id.n}`,
    descripcion: 'Comercio generado por la coleccion de Postman (registro de la Fase 1)',
    telefono: '+5492964555444',
    tipoComercio: 'RESTAURANTE',
    aceptaDelivery: false,
    aceptaRetiro: true,
    nombreUsuario: id.usuario,
    email: id.email,
    password: 'Testing123',
    direccion: direccion('{{localidad_id}}'),
    horarios,
    redesSociales: [{ tipo: 'INSTAGRAM', url: `instagram.com/fase1pm${id.n}` }],
    nombreRepresentante: 'Carlos',
    apellidoRepresentante: 'Sanchez',
    dniRepresentante: id.dni,
    telefonoRepresentante: '+5492964701103',
    fechaNacimientoRepresentante: '1988-04-04',
    ...cambios,
  };
}

function cuerpoCliente(id, localidadId) {
  return {
    nombre: 'Clienta',
    apellido: 'Fase Uno',
    dni: id.dni,
    fechaNacimiento: '1995-05-20',
    telefono: '+5492964700100',
    nombreUsuario: id.usuario,
    email: id.email,
    password: 'Testing123',
    aceptaTerminos: true,
    direccion: direccion(localidadId),
  };
}

function sinClaves(objeto, ...claves) {
  const copia = { ...objeto };
  for (const clave of claves) delete copia[clave];
  return copia;
}

const items = [];
const registrar = (nombre, cambios, testLines, sinLasClaves = []) => {
  const id = identidad();
  const cuerpo = sinClaves(cuerpoComercio(id, cambios), ...sinLasClaves);
  items.push(item(nombre, req('POST', '/auth/registro/comercio', { body: cuerpo }), testLines));
  return id;
};

items.push(
  item('Login Administrador (sesion propia de esta carpeta)', req('POST', '/auth/login', { body: { nombreUsuario: '{{admin_usuario}}', password: '{{admin_password}}' } }), [
    status(200),
    guardar('token_admin', 'pm.response.json().data.token'),
  ]),
);

registrar('[legales] Sin razon social, tipo de sociedad, condicion IVA ni fecha de inicio: 201', {}, [status(201)], [
  'razonSocial',
  'tipoSociedad',
  'condicionIva',
  'fechaInicioActividades',
]);
registrar('[legales] Razon social vacia: 201', { razonSocial: '' }, [status(201)]);
registrar('[legales] Razon social en blanco: 201', { razonSocial: '    ' }, [status(201)]);
registrar('[legales] Condicion IVA y tipo de sociedad en null: 201', { condicionIva: null, tipoSociedad: null, fechaInicioActividades: null }, [status(201)]);
registrar('[legales] Con todos los datos legales: 201', { razonSocial: 'mi razon srl' }, [status(201)]);
registrar('[legales] Razon social solo con simbolos: 400', { razonSocial: '####' }, [status(400), campo('razonSocial', 'La razón social no puede contener solo caracteres especiales')]);
registrar('[legales] Razon social de 151 caracteres: 400', { razonSocial: 'R'.repeat(151) }, [status(400), campo('razonSocial', 'La razón social no puede superar los 150 caracteres')]);
registrar('[legales] Fecha de inicio futura: 400', { fechaInicioActividades: '2099-01-01' }, [status(400), campo('fechaInicioActividades', 'La fecha ingresada no es válida')]);
registrar('[legales] Sin CUIT: 400', {}, [status(400), campo('cuit', 'El CUIT es obligatorio')], ['cuit']);
registrar('[legales] Sin domicilio fiscal: 400', {}, [status(400), campo('domicilioFiscal', 'El domicilio fiscal es obligatorio')], ['domicilioFiscal']);
registrar('[legales] Sin nombre del representante: 400', {}, [status(400), campo('nombreRepresentante', 'El nombre es obligatorio')], ['nombreRepresentante']);
registrar('[legales] Sin apellido del representante: 400', {}, [status(400), campo('apellidoRepresentante', 'El apellido es obligatorio')], ['apellidoRepresentante']);
registrar('[legales] Sin DNI del representante: 400', {}, [status(400), campo('dniRepresentante', 'El DNI es obligatorio')], ['dniRepresentante']);
registrar('[legales] Sin telefono del representante: 400', {}, [status(400), campo('telefonoRepresentante', 'El teléfono es obligatorio')], ['telefonoRepresentante']);
registrar('[legales] Sin fecha de nacimiento del representante: 400', {}, [status(400), campo('fechaNacimientoRepresentante', 'La fecha de nacimiento es obligatoria')], ['fechaNacimientoRepresentante']);

const idSinEmail = registrar('[email] Sin email de contacto: 201', {}, [status(201)]);
registrar('[email] Un emailContacto que llegue en el cuerpo se ignora: 201', { emailContacto: 'ignorado@bajonea.test' }, [status(201)]);
items.push(
  item('[email] El Administrador ve el email de contacto nulo del comercio nuevo', req('GET', '/administrador/comercios/pendientes', { token: 'token_admin' }), [
    status(200),
    `const c = pm.response.json().data.find((x) => x.emailCuenta === ${JSON.stringify(idSinEmail.email)});`,
    "pm.test('El comercio nuevo esta pendiente', () => pm.expect(c).to.exist);",
    "pm.test('emailContacto es null', () => { pm.expect(c).to.have.property('emailContacto'); pm.expect(c.emailContacto).to.eql(null); });",
  ]),
);

registrar('[terminos] Sin aceptaTerminos: 400', {}, [status(400), campo('aceptaTerminos', MENSAJE_TERMINOS)], ['aceptaTerminos']);
registrar('[terminos] aceptaTerminos en false: 400', { aceptaTerminos: false }, [status(400), campo('aceptaTerminos', MENSAJE_TERMINOS)]);
registrar('[terminos] aceptaTerminos en null: 400', { aceptaTerminos: null }, [status(400), campo('aceptaTerminos', MENSAJE_TERMINOS)]);
registrar('[terminos] aceptaTerminos en true: 201', { aceptaTerminos: true }, [status(201)]);

items.push(
  item('[geografia] Provincias: solo Tierra del Fuego', req('GET', '/geografia/provincias'), [
    status(200),
    "pm.test('Una sola provincia, la 94', () => pm.expect(pm.response.json().data.map((p) => p.id)).to.eql(['94']));",
  ]),
  item('[geografia] Localidades de Tierra del Fuego: Rio Grande, Tolhuin y Ushuaia', req('GET', '/geografia/localidades', { query: 'provinciaId=94' }), [
    status(200),
    `pm.test('Exactamente las tres localidades habilitadas', () => pm.expect(pm.response.json().data.map((l) => l.id + ':' + l.nombre)).to.eql(['94008010:Río Grande', '${TOLHUIN}:Tolhuin', '${USHUAIA}:Ushuaia']));`,
  ]),
);
for (const provincia of ['02', '06', '99']) {
  items.push(
    item(`[geografia] La provincia ${provincia} no ofrece localidades`, req('GET', '/geografia/localidades', { query: `provinciaId=${provincia}` }), [
      status(200),
      "pm.test('Lista vacia', () => pm.expect(pm.response.json().data).to.eql([]));",
    ]),
  );
}

for (const [nombre, localidadId] of [['Ushuaia', USHUAIA], ['Tolhuin', TOLHUIN]]) {
  const idCliente = identidad();
  items.push(item(`[geografia] Registro de Cliente en ${nombre}: 201`, req('POST', '/auth/registro/cliente', { body: cuerpoCliente(idCliente, localidadId) }), [status(201)]));
  registrar(`[geografia] Registro de Comercio en ${nombre}: 201`, { direccion: direccion(localidadId) }, [status(201)]);
}
for (const [nombre, localidadId] of FUERA_DE_LA_LISTA) {
  items.push(
    item(`[geografia] Registro de Cliente en ${nombre}: 400 por campo`, req('POST', '/auth/registro/cliente', { body: cuerpoCliente(identidad(), localidadId) }), [
      status(400),
      campo('direccion.localidadId', MENSAJE_LOCALIDAD),
    ]),
  );
  registrar(`[geografia] Registro de Comercio en ${nombre}: 400 por campo`, { direccion: direccion(localidadId) }, [status(400), campo('direccion.localidadId', MENSAJE_LOCALIDAD)]);
}
items.push(item('[geografia] Registro de Cliente en una localidad inexistente: 404', req('POST', '/auth/registro/cliente', { body: cuerpoCliente(identidad(), INEXISTENTE) }), [status(404)]));
registrar('[geografia] Registro de Comercio en una localidad inexistente: 404', { direccion: direccion(INEXISTENTE) }, [status(404)]);

function duenoAprobadoORechazado(tag, aprobar) {
  const id = identidad();
  const v = (sufijo) => `f1_${tag}_${sufijo}`;
  items.push(
    item(`[${tag}] Registro del Dueño`, req('POST', '/auth/registro/comercio', { body: cuerpoComercio(id) }), [status(201)]),
    item(`[${tag}] Codigo de verificacion`, req('GET', '/test/token-verificacion', { query: `email=${id.email}` }), [status(200), guardar(v('codigo'), 'pm.response.json().data')]),
    item(`[${tag}] Verificar cuenta`, req('POST', '/auth/verificar', { body: { email: id.email, codigo: `{{${v('codigo')}}}` } }), [status(200)]),
    item(`[${tag}] El Administrador busca el comercio pendiente`, req('GET', '/administrador/comercios/pendientes', { token: 'token_admin' }), [
      status(200),
      `const c = pm.response.json().data.find((x) => x.emailCuenta === ${JSON.stringify(id.email)});`,
      "pm.test('El comercio esta pendiente', () => pm.expect(c).to.exist);",
      guardar(v('com'), 'c.id'),
    ]),
    item(
      `[${tag}] El Administrador ${aprobar ? 'aprueba' : 'rechaza'} el comercio`,
      req('PUT', `/administrador/comercios/{{${v('com')}}}/resolver`, {
        token: 'token_admin',
        body: aprobar ? { aprobar: true } : { aprobar: false, motivo: 'Rechazo de fixture de la Fase 1' },
      }),
      [status(200)],
    ),
    item(`[${tag}] Login del Dueño`, req('POST', '/auth/login', { body: { nombreUsuario: id.usuario, password: 'Testing123' } }), [
      status(200),
      guardar(v('token'), 'pm.response.json().data.token'),
    ]),
  );
  return v;
}

const vA = duenoAprobadoORechazado('alta', true);
const tokenA = vA('token');
const comA = `{{${vA('com')}}}`;

function cuerpoAlta(n, localidadId, cambios = {}) {
  return {
    nombre: `Alta Fase Uno ${n}`,
    descripcion: 'Comercio adicional generado por la coleccion de Postman (Fase 1)',
    telefono: '+5492964555444',
    aceptaTerminos: true,
    tipoComercio: 'RESTAURANTE',
    aceptaDelivery: false,
    aceptaRetiro: true,
    fotoPerfilUrl: '{{f1_foto_alta}}',
    direccion: direccion(localidadId),
    horarios,
    redesSociales: [{ tipo: 'INSTAGRAM', url: 'instagram.com/fase1alta' }],
    ...cambios,
  };
}

items.push(
  item('[alta] Firma de la foto del alta adicional', req('POST', '/comercios/nuevo/foto/firma', { token: tokenA, headers: { [HEADER]: comA } }), [
    status(200),
    'const d = pm.response.json().data;',
    guardar('f1_foto_alta', "'https://res.cloudinary.com/' + d.cloudName + '/image/upload/v1/' + d.folder + 'postman-fase1.png'"),
  ]),
  item('[alta] Sin aceptaTerminos: 400', req('POST', '/comercios', { token: tokenA, body: sinClaves(cuerpoAlta('t1', '{{localidad_id}}'), 'aceptaTerminos') }), [
    status(400),
    campo('aceptaTerminos', MENSAJE_TERMINOS),
  ]),
  item('[alta] aceptaTerminos en false: 400', req('POST', '/comercios', { token: tokenA, body: cuerpoAlta('t2', '{{localidad_id}}', { aceptaTerminos: false }) }), [
    status(400),
    campo('aceptaTerminos', MENSAJE_TERMINOS),
  ]),
);
for (const [nombre, localidadId] of FUERA_DE_LA_LISTA) {
  items.push(
    item(`[alta] Alta adicional en ${nombre}: 400 por campo`, req('POST', '/comercios', { token: tokenA, body: cuerpoAlta(`g-${localidadId}`, localidadId) }), [
      status(400),
      campo('direccion.localidadId', MENSAJE_LOCALIDAD),
    ]),
  );
}
items.push(
  item('[alta] Alta adicional en una localidad inexistente: 404', req('POST', '/comercios', { token: tokenA, body: cuerpoAlta('g-inexistente', INEXISTENTE) }), [status(404)]),
  item('[alta] Alta adicional en Tolhuin: 201', req('POST', '/comercios', { token: tokenA, body: cuerpoAlta('g-tolhuin', TOLHUIN) }), [status(201), sinCampo('emailContacto')]),
);

const emailInvitada = `fase1.invitada.${String(contador).padStart(4, '0')}@bajonea.test`;
const cuentaNueva = (n, localidadId) => ({
  nombre: 'Empleada',
  apellido: 'Invitada',
  dni: `3094${n}`,
  fechaNacimiento: '1996-08-14',
  telefono: '+5492964700200',
  nombreUsuario: `fase1emp${n}`,
  password: 'Testing123',
  direccion: direccion(localidadId),
});
items.push(
  item('[invitacion] El Dueño invita a una cuenta nueva', req('POST', '/comercios/equipo/invitaciones', { token: tokenA, headers: { [HEADER]: comA }, body: { email: emailInvitada } }), [status(201)]),
  item('[invitacion] Codigo de la invitacion', req('GET', '/test/invitaciones-empleado/codigo', { query: `email=${emailInvitada}&comercioId=${comA}` }), [
    status(200),
    guardar('f1_codigo_invitacion', 'pm.response.json().data'),
  ]),
);
for (const [nombre, localidadId] of FUERA_DE_LA_LISTA) {
  items.push(
    item(
      `[invitacion] Aceptar con una cuenta nueva en ${nombre}: 400 con el prefijo cuentaNueva`,
      req('POST', '/auth/invitaciones-empleado/aceptar', {
        body: { email: emailInvitada, codigo: '{{f1_codigo_invitacion}}', aceptaTerminos: true, cuentaNueva: cuentaNueva('0001', localidadId) },
      }),
      [status(400), campo('cuentaNueva.direccion.localidadId', MENSAJE_LOCALIDAD)],
    ),
  );
}
items.push(
  item(
    '[invitacion] Aceptar con una cuenta nueva en Tolhuin: 200 (los rechazos no gastaron la invitacion)',
    req('POST', '/auth/invitaciones-empleado/aceptar', {
      body: { email: emailInvitada, codigo: '{{f1_codigo_invitacion}}', aceptaTerminos: true, cuentaNueva: cuentaNueva('0002', TOLHUIN) },
    }),
    [status(200)],
  ),
);

const vR = duenoAprobadoORechazado('corr', false);
const tokenR = vR('token');
const comR = `{{${vR('com')}}}`;
const variableCorreccion = (localidadId) => `f1_corr_${localidadId}`;
const localidadesDeCorreccion = [...FUERA_DE_LA_LISTA.map(([, id]) => id), INEXISTENTE, TOLHUIN];

items.push(
  item('[correccion] Precarga del comercio rechazado', req('GET', `/comercios/${comR}/correccion`, { token: tokenR }), [
    status(200),
    'const d = pm.response.json().data;',
    "const base = { nombre: d.nombre, descripcion: 'Corregido en la Fase 1', telefono: d.telefono, tipoComercio: d.tipoComercio, aceptaDelivery: d.aceptaDelivery, aceptaRetiro: d.aceptaRetiro, fotoPerfilUrl: d.fotoPerfilUrl, horarios: d.horarios.map((h) => ({ diaSemana: h.diaSemana, horaApertura: h.horaApertura, horaCierre: h.horaCierre })), redesSociales: d.redesSociales.map((r) => ({ tipo: r.tipo, url: r.url })), tokenVersion: d.tokenVersion };",
    `${JSON.stringify(localidadesDeCorreccion)}.forEach((localidadId) => { const cuerpo = Object.assign({}, base, { direccion: { calle: d.direccion.calle, numero: d.direccion.numero, pisoDepto: d.direccion.pisoDepto, codigoPostal: d.direccion.codigoPostal, localidadId: localidadId, principal: false } }); pm.environment.set('f1_corr_' + localidadId, JSON.stringify(cuerpo)); });`,
    "pm.test('La precarga no trae el email de contacto', () => pm.expect(d).to.not.have.property('emailContacto'));",
  ]),
);
for (const [nombre, localidadId] of FUERA_DE_LA_LISTA) {
  items.push(
    item(`[correccion] Reenviar con la direccion en ${nombre}: 400 por campo`, req('PUT', `/comercios/${comR}/resolicitud`, { token: tokenR, body: `{{${variableCorreccion(localidadId)}}}` }), [
      status(400),
      campo('direccion.localidadId', MENSAJE_LOCALIDAD),
    ]),
  );
}
items.push(
  item('[correccion] Reenviar con una localidad inexistente: 404', req('PUT', `/comercios/${comR}/resolicitud`, { token: tokenR, body: `{{${variableCorreccion(INEXISTENTE)}}}` }), [status(404)]),
  item('[correccion] Los rechazos no gastaron un intento: el comercio sigue RECHAZADO con la misma version', req('GET', `/comercios/${comR}/correccion`, { token: tokenR }), [
    status(200),
    "pm.test('Intento 1 de 3', () => { const d = pm.response.json().data; pm.expect(d.intentoActual).to.eql(1); pm.expect(d.intentosRestantes).to.eql(3); });",
  ]),
  item('[correccion] Reenviar en Tolhuin sin aceptaTerminos: 200 (la correccion no los pide)', req('PUT', `/comercios/${comR}/resolicitud`, { token: tokenR, body: `{{${variableCorreccion(TOLHUIN)}}}` }), [
    status(200),
    "pm.test('Queda PENDIENTE', () => pm.expect(pm.response.json().data.estado).to.eql('PENDIENTE'));",
  ]),
);

const folder = { name: NOMBRE_FOLDER, item: items };

const collection = JSON.parse(fs.readFileSync(collectionPath, 'utf8'));
const idx = collection.item.findIndex((f) => f.name === NOMBRE_FOLDER);
if (idx >= 0) collection.item[idx] = folder;
else collection.item.push(folder);
fs.writeFileSync(collectionPath, JSON.stringify(collection, null, 2) + '\n', 'utf8');

const environment = JSON.parse(fs.readFileSync(environmentPath, 'utf8'));
const claves = ['f1_foto_alta', 'f1_codigo_invitacion'];
for (const tag of ['alta', 'corr']) for (const sufijo of ['codigo', 'com', 'token']) claves.push(`f1_${tag}_${sufijo}`);
for (const localidadId of localidadesDeCorreccion) claves.push(variableCorreccion(localidadId));
const existentes = new Set(environment.values.map((x) => x.key));
for (const key of claves) {
  if (!existentes.has(key)) environment.values.push({ key, value: '', type: 'default', enabled: true });
}
fs.writeFileSync(environmentPath, JSON.stringify(environment, null, 2) + '\n', 'utf8');

console.log(`OK: carpeta "${NOMBRE_FOLDER}" con ${folder.item.length} requests.`);
