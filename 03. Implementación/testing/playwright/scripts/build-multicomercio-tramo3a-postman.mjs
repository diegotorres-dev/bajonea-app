import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const collectionPath = path.resolve(__dirname, '../../../postman/Bajonea-MVP.postman_collection.json');
const environmentPath = path.resolve(__dirname, '../../../postman/Bajonea-Local.postman_environment.json');

const NOMBRE_FOLDER = '51 - Multi-comercio Tramo 3A (correccion y re-solicitud de comercios rechazados, rechazo definitivo y bandeja)';
const HEADER = 'X-Comercio-Id';
const MENSAJE_SIN_CAMBIOS = 'Modificá al menos un dato antes de volver a solicitar';

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
  { s: 'K', cuit: cuitValido('3080050011'), dni: '30800301' },
  { s: 'L', cuit: cuitValido('3080050021'), dni: '30800302' },
  { s: 'M', cuit: cuitValido('3080050031'), dni: '30800303' },
  { s: 'N', cuit: cuitValido('3080050041'), dni: '30800304' },
  { s: 'O', cuit: cuitValido('3080050051'), dni: '30800305' },
  { s: 'P', cuit: cuitValido('3080050071'), dni: '30800306' },
];
const porSufijo = Object.fromEntries(DUENOS.map((d) => [d.s, d]));

const v = (s, sufijo) => `r${s}_${sufijo}`;
const tok = (s) => `token_r_${s.toLowerCase()}`;

function req(method, urlPath, { body, rawBody, token, headers = {}, query } = {}) {
  const header = [];
  if (token) header.push({ key: 'Authorization', value: `Bearer {{${token}}}` });
  if (body !== undefined || rawBody !== undefined) header.push({ key: 'Content-Type', value: 'application/json' });
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
  if (rawBody !== undefined) {
    request.body = { mode: 'raw', raw: rawBody, options: { raw: { language: 'json' } } };
  } else if (body !== undefined) {
    request.body = { mode: 'raw', raw: JSON.stringify(body, null, 2), options: { raw: { language: 'json' } } };
  }
  return request;
}

function item(name, request, testLines = [], preLines = []) {
  const event = [];
  if (preLines.length) event.push({ listen: 'prerequest', script: { type: 'text/javascript', exec: preLines } });
  if (testLines.length) event.push({ listen: 'test', script: { type: 'text/javascript', exec: testLines } });
  return { name, request, response: [], event };
}

const status = (codigo) => `pm.test('Status code es ${codigo}', () => pm.response.to.have.status(${codigo}));`;
const guardar = (variable, expr) => `pm.environment.set('${variable}', ${expr});`;
const mensajeEs = (texto) => `pm.test('El mensaje es "${texto}"', () => pm.expect(pm.response.json().mensaje).to.eql(${JSON.stringify(texto)}));`;
const mensajeContiene = (texto) => `pm.test('El mensaje contiene "${texto}"', () => pm.expect(pm.response.json().mensaje).to.include(${JSON.stringify(texto)}));`;

const horariosTodosLosDias = ['LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO', 'DOMINGO'].map((diaSemana) => ({
  diaSemana,
  horaApertura: '00:00:00',
  horaCierre: '23:59:00',
}));

function registroDueno({ s, cuit, dni }) {
  return {
    razonSocial: `Correccion Postman ${s} SRL`,
    cuit,
    condicionIva: 'RESPONSABLE_INSCRIPTO',
    tipoSociedad: 'SRL',
    domicilioFiscal: `Direccion fiscal ${s} 100`,
    fechaInicioActividades: '2020-01-01',
    nombre: `Local Correccion ${s}`,
    descripcion: 'Comercio generado por la coleccion de Postman (correccion de rechazados)',
    telefono: '+5492964555444',
    emailContacto: `contacto.r${s}@bajonea.test`,
    tipoComercio: 'RESTAURANTE',
    aceptaDelivery: false,
    aceptaRetiro: true,
    nombreUsuario: `{{${v(s, 'usuario')}}}`,
    email: `{{${v(s, 'email')}}}`,
    password: `{{${v(s, 'password')}}}`,
    direccion: { calle: 'Belgrano', numero: '700', pisoDepto: null, codigoPostal: '9420', localidadId: '{{localidad_id}}', principal: false },
    horarios: horariosTodosLosDias,
    nombreRepresentante: 'Carlos',
    apellidoRepresentante: 'Sanchez',
    dniRepresentante: dni,
    telefonoRepresentante: '+5492964701103',
    fechaNacimientoRepresentante: '1988-04-04',
    fotoPerfilUrl: `https://res.cloudinary.com/demo/image/upload/postman-correccion-${s.toLowerCase()}.jpg`,
    redesSociales: [{ tipo: 'INSTAGRAM', url: `instagram.com/correccion${s.toLowerCase()}` }],
  };
}

const items = [];

items.push(
  item('Login Administrador (sesion propia de esta carpeta)', req('POST', '/auth/login', { body: { nombreUsuario: '{{admin_usuario}}', password: '{{admin_password}}' } }), [
    status(200),
    guardar('token_admin', 'pm.response.json().data.token'),
  ]),
  item('Registro Cliente (para probar el 403 por rol)', req('POST', '/auth/registro/cliente', {
    body: {
      nombre: 'Clienta',
      apellido: 'CorreccionPostman',
      dni: '30800310',
      fechaNacimiento: '1995-05-20',
      telefono: '+5492964555000',
      nombreUsuario: '{{rC_usuario}}',
      email: '{{rC_email}}',
      password: '{{rC_password}}',
      direccion: { calle: 'Calle Siempre Viva', numero: '123', pisoDepto: null, codigoPostal: '9420', localidadId: '{{localidad_id}}', principal: true },
    },
  }), [status(201)]),
  item('Bypass test - codigo de verificacion Cliente', req('GET', '/test/token-verificacion', { query: 'email={{rC_email}}' }), [
    status(200),
    guardar('rC_codigo', 'pm.response.json().data'),
  ]),
  item('Verificar cuenta Cliente', req('POST', '/auth/verificar', { body: { email: '{{rC_email}}', codigo: '{{rC_codigo}}' } }), [status(200)]),
  item('Login Cliente', req('POST', '/auth/login', { body: { nombreUsuario: '{{rC_usuario}}', password: '{{rC_password}}' } }), [
    status(200),
    guardar('token_r_cliente', 'pm.response.json().data.token'),
  ]),
);

function altaDeDueno(dueno) {
  const { s } = dueno;
  return [
    item(`Registro Dueño ${s}`, req('POST', '/auth/registro/comercio', { body: registroDueno(dueno) }), [status(201)]),
    item(`Bypass test - codigo de verificacion Dueño ${s}`, req('GET', '/test/token-verificacion', { query: `email={{${v(s, 'email')}}}` }), [
      status(200),
      guardar(v(s, 'codigo'), 'pm.response.json().data'),
    ]),
    item(`Verificar cuenta Dueño ${s}`, req('POST', '/auth/verificar', { body: { email: `{{${v(s, 'email')}}}`, codigo: `{{${v(s, 'codigo')}}}` } }), [status(200)]),
    item(`Login Dueño ${s}`, req('POST', '/auth/login', { body: { nombreUsuario: `{{${v(s, 'usuario')}}}`, password: `{{${v(s, 'password')}}}` } }), [
      status(200),
      guardar(tok(s), 'pm.response.json().data.token'),
      guardar(v(s, 'dueno'), 'pm.response.json().data.usuario.id'),
    ]),
    item(`Administrador busca el comercio pendiente del Dueño ${s}`, req('GET', '/administrador/comercios/pendientes', { token: 'token_admin' }), [
      status(200),
      `const c = pm.response.json().data.find((x) => x.emailCuenta === pm.environment.get('${v(s, 'email')}').toLowerCase());`,
      `pm.test('El comercio del Dueño ${s} esta pendiente', () => pm.expect(c).to.exist);`,
      guardar(v(s, 'com'), 'c.id'),
      guardar(v(s, 'nombre'), 'c.nombre'),
    ]),
  ];
}

const resolver = (nombre, comVar, cuerpo, esperado = 200) =>
  item(nombre, req('PUT', `/administrador/comercios/{{${comVar}}}/resolver`, { token: 'token_admin', body: cuerpo }), [status(esperado)]);

const rechazar = (s, motivo, definitivo) =>
  resolver(`Administrador rechaza el comercio del Dueño ${s}: "${motivo}"${definitivo ? ' (definitivo)' : ''}`, v(s, 'com'),
    definitivo === undefined ? { aprobar: false, motivo } : { aprobar: false, motivo, definitivo });

const perfil = (nombre, s, comVar, testLines) =>
  item(nombre, req('GET', '/comercios/perfil', { token: tok(s), headers: { [HEADER]: `{{${comVar}}}` } }), [status(200), ...testLines]);

const correccion = (nombre, s, comVar, esperado, testLines = []) =>
  item(nombre, req('GET', `/comercios/{{${comVar}}}/correccion`, { token: tok(s) }), [status(esperado), ...testLines]);

function correccionYGuardar(nombre, s, comVar, testLines = []) {
  const b = v(s, 'base');
  const l = v(s, 'legales');
  return correccion(nombre, s, comVar, 200, [
    'const d = pm.response.json().data;',
    `const base = { nombre: d.nombre, descripcion: d.descripcion, telefono: d.telefono, emailContacto: d.emailContacto, tipoComercio: d.tipoComercio, aceptaDelivery: d.aceptaDelivery, aceptaRetiro: d.aceptaRetiro, fotoPerfilUrl: d.fotoPerfilUrl, direccion: { calle: d.direccion.calle, numero: d.direccion.numero, pisoDepto: d.direccion.pisoDepto, codigoPostal: d.direccion.codigoPostal, localidadId: d.direccion.localidadId, principal: false }, horarios: d.horarios.map((h) => ({ diaSemana: h.diaSemana, horaApertura: h.horaApertura, horaCierre: h.horaCierre })), redesSociales: d.redesSociales.map((r) => ({ tipo: r.tipo, url: r.url })), tokenVersion: d.tokenVersion };`,
    `pm.environment.set('${b}', JSON.stringify(base));`,
    `if (d.legales) { const g = d.legales; pm.environment.set('${l}', JSON.stringify({ razonSocial: g.razonSocial, cuit: g.cuit, condicionIva: g.condicionIva, tipoSociedad: g.tipoSociedad, domicilioFiscal: g.domicilioFiscal, fechaInicioActividades: g.fechaInicioActividades, nombreRepresentante: g.representante.nombre, apellidoRepresentante: g.representante.apellido, dniRepresentante: g.representante.dni, telefonoRepresentante: g.representante.telefono, fechaNacimientoRepresentante: g.representante.fechaNacimiento })); } else { pm.environment.set('${l}', ''); }`,
    ...testLines,
  ]);
}

function reenviar(nombre, s, comVar, mutador, testLines, { token = tok(s), base = v(s, 'base'), legales = v(s, 'legales') } = {}) {
  return item(
    nombre,
    req('PUT', `/comercios/{{${comVar}}}/resolicitud`, { token, rawBody: '{{cuerpo}}' }),
    testLines,
    [
      `const b = JSON.parse(pm.environment.get('${base}'));`,
      `const lRaw = pm.environment.get('${legales}'); const l = lRaw ? JSON.parse(lRaw) : null;`,
      mutador,
      "pm.variables.set('cuerpo', JSON.stringify(b));",
    ],
  );
}

const cambiarDescripcion = (texto) => `b.descripcion = ${JSON.stringify(texto)};`;

const notificacionContiene = (nombre, s, comVar, mensajeExpr) =>
  item(nombre, req('GET', '/notificaciones', { token: tok(s), headers: { [HEADER]: `{{${comVar}}}` } }), [
    status(200),
    `const n = pm.response.json().data.filter((x) => x.entidadTipo === 'COMERCIO' && x.entidadId === Number(pm.environment.get('${comVar}'))).map((x) => x.mensaje);`,
    `pm.test('Hay una notificacion con el texto esperado', () => pm.expect(n).to.include(${mensajeExpr}));`,
  ]);

const K = porSufijo.K;
items.push(...altaDeDueno(K), ...altaDeDueno(porSufijo.L));
items.push(rechazar('K', 'Motivo de rechazo K'), rechazar('L', 'Motivo de rechazo L'));

items.push(
  item('[GET] Sin token: 401', req('GET', '/comercios/{{rK_com}}/correccion'), [status(401)]),
  item('[GET] Con rol Cliente: 403', req('GET', '/comercios/{{rK_com}}/correccion', { token: 'token_r_cliente' }), [status(403)]),
  item('[GET] Con rol Administrador: 403', req('GET', '/comercios/{{rK_com}}/correccion', { token: 'token_admin' }), [status(403)]),
  correccion('[GET] Comercio de otro Dueño: 404', 'L', 'rK_com', 404, [guardar('r_404_body', 'JSON.stringify(pm.response.json())'), mensajeEs('Comercio no encontrado')]),
  correccion('[GET] Comercio inexistente: 404 idéntico', 'K', 'r_inexistente', 404, [
    "pm.test('Mismo cuerpo que el de otro Dueño', () => pm.expect(JSON.stringify(pm.response.json())).to.eql(pm.environment.get('r_404_body')));",
  ]),
  correccionYGuardar('[GET] Precarga completa del comercio rechazado de un Dueño sin aprobados', 'K', 'rK_com', [
    "pm.test('Datos del comercio y del trámite', () => { pm.expect(d.comercioId).to.eql(Number(pm.environment.get('rK_com'))); pm.expect(d.nombre).to.eql(pm.environment.get('rK_nombre')); pm.expect(d.motivoRechazo).to.eql('Motivo de rechazo K'); pm.expect(d.intentoActual).to.eql(1); pm.expect(d.maximoResolicitudes).to.eql(3); pm.expect(d.intentosRestantes).to.eql(3); pm.expect(d.tokenVersion).to.be.above(0); });",
    "pm.test('Direccion con provincia, horarios y redes', () => { pm.expect(d.direccion.provinciaId).to.be.a('string').and.not.empty; pm.expect(d.direccion.localidadId).to.be.a('string'); pm.expect(d.horarios).to.have.length(7); pm.expect(d.redesSociales).to.have.length(1); });",
    "pm.test('Puede corregir los datos legales y los trae', () => { pm.expect(d.puedeCorregirDatosLegales).to.eql(true); pm.expect(d.legales.cuit).to.eql('" + K.cuit + "'); pm.expect(d.legales.representante.dni).to.eql('" + K.dni + "'); pm.expect(d.legales.tipoSociedad).to.eql('SRL'); });",
  ]),
  item('[firma] Sin token: 401', req('POST', '/comercios/{{rK_com}}/correccion/foto/firma'), [status(401)]),
  item('[firma] Comercio de otro Dueño: 404', req('POST', '/comercios/{{rK_com}}/correccion/foto/firma', { token: 'token_r_l' }), [status(404)]),
  item('[firma] Dueño K: firma a comercios/{id}/perfil/', req('POST', '/comercios/{{rK_com}}/correccion/foto/firma', { token: 'token_r_k' }), [
    status(200),
    'const f = pm.response.json().data;',
    "pm.test('La carpeta es la del comercio', () => pm.expect(f.folder).to.eql('comercios/' + pm.environment.get('rK_com') + '/perfil/'));",
    "pm.test('Trae firma y preset', () => { pm.expect(f.signature).to.be.a('string').and.not.empty; pm.expect(f.uploadPreset).to.be.a('string').and.not.empty; });",
    guardar('r_foto_valida', "'https://res.cloudinary.com/' + f.cloudName + '/image/upload/v1/' + f.folder + 'postman-correccion.png'"),
    guardar('r_foto_pre_registro', "'https://res.cloudinary.com/' + f.cloudName + '/image/upload/v1/comercios/pre-registro/postman-correccion.png'"),
    guardar('r_foto_otra_cuenta', "'https://res.cloudinary.com/otra-cuenta-inexistente/image/upload/v1/' + f.folder + 'postman-correccion.png'"),
  ]),
);

const invalidosK = [
  ['sin ningun cambio', '', 409, MENSAJE_SIN_CAMBIOS],
  ['sin el token de version', 'delete b.tokenVersion;', 400],
  ['con un token de version negativo', 'b.tokenVersion = -1;', 400],
  ['nombre vacio', "b.descripcion = 'x'; b.nombre = '';", 400],
  ['sin redes sociales', "b.descripcion = 'x'; b.redesSociales = [];", 400],
  ['dos redes del mismo tipo', "b.redesSociales = [{ tipo: 'INSTAGRAM', url: 'instagram.com/a' }, { tipo: 'INSTAGRAM', url: 'instagram.com/b' }];", 400, 'mismo tipo'],
  ['ni delivery ni retiro', 'b.aceptaDelivery = false; b.aceptaRetiro = false;', 400, 'al menos una modalidad'],
  ['horarios superpuestos', "b.horarios = [{ diaSemana: 'LUNES', horaApertura: '10:00:00', horaCierre: '14:00:00' }, { diaSemana: 'LUNES', horaApertura: '13:00:00', horaCierre: '18:00:00' }];", 400, 'se superpone'],
  ['cierre anterior a la apertura', "b.horarios = [{ diaSemana: 'LUNES', horaApertura: '20:00:00', horaCierre: '10:00:00' }];", 400, 'posterior'],
  ['localidad inexistente', "b.direccion.localidadId = '0000000';", 404, 'localidad'],
  ['foto del pre-registro', "b.fotoPerfilUrl = pm.environment.get('r_foto_pre_registro');", 400, 'La foto de perfil no es válida'],
  ['foto de otra cuenta de Cloudinary', "b.fotoPerfilUrl = pm.environment.get('r_foto_otra_cuenta');", 400, 'La foto de perfil no es válida'],
  ['foto de otro dominio', "b.fotoPerfilUrl = 'https://ejemplo.com/foto.png';", 400],
];
for (const [descripcion, mutador, esperado, texto] of invalidosK) {
  items.push(
    reenviar(`[PUT invalido] ${descripcion}: ${esperado}`, 'K', 'rK_com', mutador, [
      status(esperado),
      ...(texto === MENSAJE_SIN_CAMBIOS ? [mensajeEs(texto)] : texto ? [`pm.test('El mensaje menciona el problema', () => pm.expect(pm.response.json().mensaje.toLowerCase()).to.include(${JSON.stringify(texto.toLowerCase())}));`] : []),
    ]),
  );
}

items.push(
  reenviar('[PUT] Con un Cliente: 403', 'K', 'rK_com', cambiarDescripcion('x'), [status(403)], { token: 'token_r_cliente' }),
  reenviar('[PUT] Comercio de otro Dueño: 404', 'K', 'rK_com', cambiarDescripcion('x'), [status(404)], { token: 'token_r_l' }),
  reenviar('[PUT datos legales] CUIT de otro Dueño: 409 con el mensaje del alta', 'K', 'rK_com', `b.descripcion = 'x'; b.legales = Object.assign({}, l, { cuit: '${porSufijo.L.cuit}' });`, [
    status(409),
    mensajeEs('Ya existe una cuenta registrada con ese CUIT'),
    "pm.test('No revela de quien es', () => pm.expect(JSON.stringify(pm.response.json())).to.not.include(pm.environment.get('rL_email')));",
  ]),
  reenviar('[PUT datos legales] DNI de otro Dueño: 409 con el mensaje del alta', 'K', 'rK_com', `b.descripcion = 'x'; b.legales = Object.assign({}, l, { dniRepresentante: '${porSufijo.L.dni}' });`, [
    status(409),
    mensajeEs('Ya existe una cuenta registrada con ese DNI'),
  ]),
  reenviar('[PUT datos legales] Datos fiscales con formato invalido: 400', 'K', 'rK_com', "b.legales = Object.assign({}, l, { cuit: '12345' });", [status(400)]),
  reenviar('[PUT datos legales] Los mismos datos legales sin otro cambio: 409 sin cambios', 'K', 'rK_com', 'b.legales = l;', [status(409), mensajeEs(MENSAJE_SIN_CAMBIOS)]),
  correccion('[GET] Los rechazos fallidos no gastaron ningun intento', 'K', 'rK_com', 200, [
    "pm.test('Sigue en el primer intento', () => { const d = pm.response.json().data; pm.expect(d.intentoActual).to.eql(1); pm.expect(d.intentosRestantes).to.eql(3); });",
  ]),
  reenviar(
    '[PUT] Reenvio con cambios de negocio y de datos legales: 200 y pasa a PENDIENTE',
    'K',
    'rK_com',
    [
      "b.nombre = 'nombre corregido postman'; b.descripcion = 'Descripción corregida por Postman';",
      "b.horarios = b.horarios.filter((h) => h.diaSemana !== 'DOMINGO');",
      "b.redesSociales = [{ tipo: 'INSTAGRAM', url: 'instagram.com/correccionk2' }, { tipo: 'FACEBOOK', url: 'facebook.com/correccionk' }];",
      "b.fotoPerfilUrl = pm.environment.get('r_foto_valida');",
      "b.legales = Object.assign({}, l, { razonSocial: 'razon social corregida srl', domicilioFiscal: 'Domicilio fiscal corregido 200', nombreRepresentante: 'maria' });",
    ].join(' '),
    [
      status(200),
      "const d = pm.response.json().data;",
      "pm.test('Queda PENDIENTE con los datos nuevos', () => { pm.expect(d.estado).to.eql('PENDIENTE'); pm.expect(d.nombre).to.eql('Nombre Corregido Postman'); pm.expect(d.razonSocial).to.eql('Razon Social Corregida Srl'); pm.expect(d.representante.nombre).to.eql('Maria'); pm.expect(d.motivoRechazo).to.eql(null); });",
      guardar('rK_nombre_nuevo', 'd.nombre'),
    ],
  ),
  reenviar('[PUT] Reenviar de nuevo el mismo comercio ya PENDIENTE: 409', 'K', 'rK_com', cambiarDescripcion('otra'), [status(409), mensajeEs('Este comercio ya fue enviado nuevamente a revisión')]),
  correccion('[GET] Ya no es corregible mientras esta PENDIENTE: 404', 'K', 'rK_com', 404),
  perfil('[perfil] El comercio figura PENDIENTE', 'K', 'rK_com', ["pm.test('PENDIENTE', () => pm.expect(pm.response.json().data.estado).to.eql('PENDIENTE'));"]),
);

items.push(
  item('[bandeja] La re-solicitud ya no esta entre las solicitudes nuevas', req('GET', '/administrador/comercios/pendientes', { token: 'token_admin' }), [
    status(200),
    "pm.test('K no esta en pendientes', () => pm.expect(pm.response.json().data.map((c) => c.id)).to.not.include(Number(pm.environment.get('rK_com'))));",
    "pm.test('Las solicitudes nuevas traen los datos fiscales completos', () => { const c = pm.response.json().data[0]; if (c) { pm.expect(c.tipoSociedad).to.be.a('string'); pm.expect(c.domicilioFiscal).to.be.a('string'); pm.expect(c.fechaInicioActividades).to.be.a('string'); } });",
  ]),
  item('[bandeja] La re-solicitud esta en su propia bandeja con intento, motivo anterior y cambios', req('GET', '/administrador/comercios/resolicitudes', { token: 'token_admin' }), [
    status(200),
    "const r = pm.response.json().data.find((x) => x.comercio.id === Number(pm.environment.get('rK_com')));",
    "pm.test('Esta la re-solicitud de K', () => pm.expect(r).to.exist);",
    "pm.test('Intento 1 de 3, no es el ultimo', () => { pm.expect(r.intento).to.eql(1); pm.expect(r.maximoResolicitudes).to.eql(3); pm.expect(r.esUltimoIntento).to.eql(false); pm.expect(r.fechaResolicitud).to.be.a('string'); });",
    "pm.test('Trae el motivo del rechazo anterior', () => pm.expect(r.motivoRechazoAnterior).to.eql('Motivo de rechazo K'));",
    "pm.test('Lista los campos que cambiaron con su valor anterior y nuevo', () => { const campos = r.cambios.map((c) => c.campo).sort(); pm.expect(campos).to.eql(['DESCRIPCION', 'DOMICILIO_FISCAL', 'FOTO_PERFIL', 'HORARIOS', 'NOMBRE', 'RAZON_SOCIAL', 'REDES_SOCIALES', 'REPRESENTANTE_NOMBRE']); const nombre = r.cambios.find((c) => c.campo === 'NOMBRE'); pm.expect(nombre.valorNuevo).to.eql('Nombre Corregido Postman'); pm.expect(nombre.valorAnterior).to.eql('Local Correccion K'); const nombreRep = r.cambios.find((c) => c.campo === 'REPRESENTANTE_NOMBRE'); pm.expect(nombreRep.valorAnterior).to.eql('Carlos'); pm.expect(nombreRep.valorNuevo).to.eql('Maria'); });",
    "pm.test('El comercio trae los datos fiscales completos y no es adicional', () => { pm.expect(r.comercio.razonSocial).to.eql('Razon Social Corregida Srl'); pm.expect(r.comercio.cuit).to.eql('" + K.cuit + "'); pm.expect(r.comercio.tipoSociedad).to.eql('SRL'); pm.expect(r.comercio.domicilioFiscal).to.eql('Domicilio fiscal corregido 200'); pm.expect(r.comercio.fechaInicioActividades).to.eql('2020-01-01'); pm.expect(r.comercio.esAdicional).to.eql(false); pm.expect(r.comercio.estado).to.eql('PENDIENTE'); });",
  ]),
  item('[bandeja] Las metricas separan solicitudes nuevas de re-solicitudes', req('GET', '/administrador/metricas', { token: 'token_admin' }), [
    status(200),
    "pm.test('Hay al menos una re-solicitud pendiente', () => { const m = pm.response.json().data; pm.expect(m.resolicitudesPendientes).to.be.at.least(1); pm.expect(m.comerciosPendientes).to.be.a('number'); });",
  ]),
  item('[bandeja] La re-solicitud no genero ningun aviso al Administrador', req('GET', '/notificaciones', { token: 'token_admin' }), [
    status(200),
    "pm.test('Ninguna notificacion del comercio K para el Administrador', () => pm.expect(pm.response.json().data.filter((n) => n.entidadId === Number(pm.environment.get('rK_com')))).to.have.length(0));",
  ]),
  rechazar('K', 'Segundo rechazo K'),
  notificacionContiene('[aviso] El rechazo llega sin comillas', 'K', 'rK_com', "'Tu comercio ' + pm.environment.get('rK_nombre_nuevo') + ' fue rechazado. Motivo: Segundo rechazo K'"),
  perfil('[perfil] Rechazado de nuevo con el motivo del segundo rechazo', 'K', 'rK_com', [
    "pm.test('RECHAZADO con el motivo nuevo', () => { const d = pm.response.json().data; pm.expect(d.estado).to.eql('RECHAZADO'); pm.expect(d.motivoRechazo).to.eql('Segundo rechazo K'); });",
  ]),
  reenviar('[PUT] Con el token de version del primer rechazo (pestaña vieja): 409', 'K', 'rK_com', cambiarDescripcion('Con token viejo'), [status(409), mensajeEs('La solicitud cambió desde que abriste la corrección. Volvé a abrirla para continuar')]),
  correccionYGuardar('[GET] Segundo intento: 2 de 3, sin datos legales de antes', 'K', 'rK_com', [
    "pm.test('Segundo intento con el motivo nuevo', () => { pm.expect(d.intentoActual).to.eql(2); pm.expect(d.intentosRestantes).to.eql(2); pm.expect(d.motivoRechazo).to.eql('Segundo rechazo K'); pm.expect(d.nombre).to.eql('Nombre Corregido Postman'); pm.expect(d.legales.razonSocial).to.eql('Razon Social Corregida Srl'); });",
  ]),
  reenviar('[PUT] Segundo reenvio con el token nuevo: 200', 'K', 'rK_com', cambiarDescripcion('Segunda corrección'), [status(200), "pm.test('PENDIENTE', () => pm.expect(pm.response.json().data.estado).to.eql('PENDIENTE'));"]),
  item('[bandeja] Segunda re-solicitud: intento 2', req('GET', '/administrador/comercios/resolicitudes', { token: 'token_admin' }), [
    status(200),
    "const r = pm.response.json().data.find((x) => x.comercio.id === Number(pm.environment.get('rK_com')));",
    "pm.test('Intento 2 de 3', () => { pm.expect(r.intento).to.eql(2); pm.expect(r.esUltimoIntento).to.eql(false); pm.expect(r.motivoRechazoAnterior).to.eql('Segundo rechazo K'); pm.expect(r.cambios.map((c) => c.campo)).to.eql(['DESCRIPCION']); });",
  ]),
  resolver('Administrador aprueba la re-solicitud de K (sin cuenta de Mercado Pago)', 'rK_com', { aprobar: true }),
  perfil('[perfil] Aprobado: queda APROBADO', 'K', 'rK_com', ["pm.test('APROBADO', () => pm.expect(pm.response.json().data.estado).to.eql('APROBADO'));"]),
  notificacionContiene('[aviso] Aviso de aprobacion de siempre', 'K', 'rK_com', "'Tu comercio ' + pm.environment.get('rK_nombre_nuevo') + ' fue aprobado'"),
  resolver('Resolver un comercio que ya no esta pendiente: 409', 'rK_com', { aprobar: false, motivo: 'Otra vez' }, 409),
  resolver('El motivo es obligatorio al rechazar: 400', 'rK_com', { aprobar: false }, 400),
  resolver('El flag definitivo con aprobar=true: 400', 'rK_com', { aprobar: true, definitivo: true }, 400),
);

const M = porSufijo.M;
items.push(...altaDeDueno(M));
items.push(
  resolver('Administrador aprueba el comercio del Dueño M', 'rM_com', { aprobar: true }),
  item('[firma alta] Dueño M firma la foto del comercio adicional', req('POST', '/comercios/nuevo/foto/firma', { token: 'token_r_m' }), [
    status(200),
    guardar('rM_foto_adicional', "'https://res.cloudinary.com/' + pm.response.json().data.cloudName + '/image/upload/v1/' + pm.response.json().data.folder + 'postman-adicional.png'"),
  ]),
  item('[alta] Dueño M da de alta un comercio adicional', req('POST', '/comercios', {
    token: 'token_r_m',
    body: {
      nombre: 'Adicional Correccion M',
      descripcion: 'Adicional que despues se rechaza',
      telefono: '+5492964555444',
      emailContacto: 'adicional.rm@bajonea.test',
      tipoComercio: 'RESTAURANTE',
      aceptaDelivery: false,
      aceptaRetiro: true,
      fotoPerfilUrl: '{{rM_foto_adicional}}',
      direccion: { calle: 'Elcano', numero: '900', pisoDepto: null, codigoPostal: '9420', localidadId: '{{localidad_id}}', principal: false },
      horarios: [{ diaSemana: 'LUNES', horaApertura: '09:00:00', horaCierre: '18:00:00' }],
      redesSociales: [{ tipo: 'INSTAGRAM', url: 'instagram.com/adicionalrm' }],
    },
  }), [status(201), guardar('rM_adic', 'pm.response.json().data.id')]),
  resolver('Administrador rechaza el adicional del Dueño M', 'rM_adic', { aprobar: false, motivo: 'Motivo de rechazo del adicional' }),
  correccionYGuardar('[GET] Un adicional de un Dueño que ya tuvo uno aprobado no corrige datos legales', 'M', 'rM_adic', [
    "pm.test('Sin datos legales', () => { pm.expect(d.puedeCorregirDatosLegales).to.eql(false); pm.expect(d.legales).to.eql(null); pm.expect(d.motivoRechazo).to.eql('Motivo de rechazo del adicional'); });",
  ]),
  reenviar('[PUT] Mandar datos legales: 409', 'M', 'rM_adic', "b.descripcion = 'x'; b.legales = { razonSocial: 'Intento', cuit: '" + M.cuit + "', condicionIva: 'RESPONSABLE_INSCRIPTO', tipoSociedad: 'SRL', domicilioFiscal: 'Otro 1', fechaInicioActividades: '2020-01-01', nombreRepresentante: 'Carlos', apellidoRepresentante: 'Sanchez', dniRepresentante: '" + M.dni + "', telefonoRepresentante: '+5492964701103', fechaNacimientoRepresentante: '1988-04-04' };", [
    status(409),
    mensajeEs('No podés modificar los datos fiscales ni del representante'),
  ]),
  reenviar('[PUT] Mismo nombre y direccion que el comercio principal del Dueño: 409 duplicado', 'M', 'rM_adic', "b.nombre = pm.environment.get('rM_nombre'); b.direccion = { calle: 'Belgrano', numero: '700', pisoDepto: null, codigoPostal: '9420', localidadId: pm.environment.get('localidad_id'), principal: false };", [
    status(409),
    mensajeContiene('nombre en esa dirección'),
  ]),
  reenviar('[PUT] Corrigiendo solo datos del negocio: 200', 'M', 'rM_adic', cambiarDescripcion('Adicional corregido'), [status(200)]),
  item('[bandeja] El adicional reenviado se ve como adicional y lista los demas comercios del Dueño', req('GET', '/administrador/comercios/resolicitudes', { token: 'token_admin' }), [
    status(200),
    "const r = pm.response.json().data.find((x) => x.comercio.id === Number(pm.environment.get('rM_adic')));",
    "pm.test('Es adicional y lista el comercio principal', () => { pm.expect(r.comercio.esAdicional).to.eql(true); pm.expect(r.comercio.otrosComercios.map((o) => o.id)).to.eql([Number(pm.environment.get('rM_com'))]); pm.expect(r.motivoRechazoAnterior).to.eql('Motivo de rechazo del adicional'); });",
  ]),
  resolver('Administrador aprueba el adicional reenviado', 'rM_adic', { aprobar: true }),
  perfil('[perfil] El adicional quedo APROBADO', 'M', 'rM_adic', ["pm.test('APROBADO', () => pm.expect(pm.response.json().data.estado).to.eql('APROBADO'));"]),
);

const N = porSufijo.N;
const altaN = (nombre, testLines, nombreComercio = 'Alta Posterior N') =>
  item(nombre, req('POST', '/comercios', {
    token: 'token_r_n',
    body: {
      nombre: nombreComercio,
      descripcion: 'Comercio dado de alta despues de un rechazo definitivo',
      telefono: '+5492964555444',
      emailContacto: 'alta.rn@bajonea.test',
      tipoComercio: 'RESTAURANTE',
      aceptaDelivery: false,
      aceptaRetiro: true,
      fotoPerfilUrl: '{{rN_foto}}',
      direccion: { calle: 'Elcano', numero: '950', pisoDepto: null, codigoPostal: '9420', localidadId: '{{localidad_id}}', principal: false },
      horarios: [{ diaSemana: 'LUNES', horaApertura: '09:00:00', horaCierre: '18:00:00' }],
      redesSociales: [{ tipo: 'INSTAGRAM', url: 'instagram.com/altarn' }],
    },
  }), testLines);

items.push(...altaDeDueno(N));
items.push(
  item('[elegibilidad] Con solo un comercio pendiente no es elegible', req('GET', '/comercios/alta-adicional/elegibilidad', { token: 'token_r_n' }), [
    status(200),
    "pm.test('No elegible', () => pm.expect(pm.response.json().data).to.eql({ elegible: false }));",
  ]),
  resolver('El flag definitivo sin motivo: 400', 'rN_com', { aprobar: false, definitivo: true }, 400),
  resolver('Administrador rechaza de forma definitiva el alta original de N', 'rN_com', { aprobar: false, motivo: 'Documentación falsa', definitivo: true }),
  perfil('[perfil] RECHAZO_DEFINITIVO con el motivo', 'N', 'rN_com', [
    "pm.test('RECHAZO_DEFINITIVO con motivo', () => { const d = pm.response.json().data; pm.expect(d.estado).to.eql('RECHAZO_DEFINITIVO'); pm.expect(d.motivoRechazo).to.eql('Documentación falsa'); });",
  ]),
  notificacionContiene('[aviso] Aviso de rechazo definitivo', 'N', 'rN_com', "'Tu comercio ' + pm.environment.get('rN_nombre') + ' fue rechazado de forma definitiva. Motivo: Documentación falsa'"),
  correccion('[GET] Sin salida: la corrección de un RECHAZO_DEFINITIVO da 404', 'N', 'rN_com', 404),
  item('[firma] Sin salida: la firma de un RECHAZO_DEFINITIVO da 404', req('POST', '/comercios/{{rN_com}}/correccion/foto/firma', { token: 'token_r_n' }), [status(404)]),
  reenviar('[PUT] Sin salida: el reenvio de un RECHAZO_DEFINITIVO da 404', 'N', 'rN_com', cambiarDescripcion('Intento'), [status(404)], { base: 'rK_base', legales: 'rK_legales' }),
  resolver('Resolver un RECHAZO_DEFINITIVO: 409', 'rN_com', { aprobar: true }, 409),
  item('[suspension] No se puede suspender un RECHAZO_DEFINITIVO: 409', req('PUT', '/administrador/comercios/{{rN_com}}/suspender', { token: 'token_admin', body: { motivo: 'No corresponde' } }), [status(409)]),
  item('[catalogo] No aparece en el catalogo publico', req('GET', '/catalogo/comercios'), [
    status(200),
    "pm.test('No esta', () => pm.expect(pm.response.json().data.map((c) => c.id)).to.not.include(Number(pm.environment.get('rN_com'))));",
  ]),
  item('[elegibilidad] Con todos sus comercios en RECHAZO_DEFINITIVO es elegible', req('GET', '/comercios/alta-adicional/elegibilidad', { token: 'token_r_n' }), [
    status(200),
    "pm.test('Elegible', () => pm.expect(pm.response.json().data).to.eql({ elegible: true }));",
  ]),
  item('[firma alta] Dueño N firma la foto del nuevo comercio', req('POST', '/comercios/nuevo/foto/firma', { token: 'token_r_n' }), [
    status(200),
    guardar('rN_foto', "'https://res.cloudinary.com/' + pm.response.json().data.cloudName + '/image/upload/v1/' + pm.response.json().data.folder + 'postman-alta.png'"),
  ]),
  item('[duplicado] Un RECHAZO_DEFINITIVO cuenta como duplicado al agregar otro comercio igual', req('POST', '/comercios', {
    token: 'token_r_n',
    body: {
      nombre: '{{rN_nombre}}',
      descripcion: 'Igual al rechazado definitivamente',
      telefono: '+5492964555444',
      emailContacto: 'alta.rn@bajonea.test',
      tipoComercio: 'RESTAURANTE',
      aceptaDelivery: false,
      aceptaRetiro: true,
      fotoPerfilUrl: '{{rN_foto}}',
      direccion: { calle: 'Belgrano', numero: '700', pisoDepto: null, codigoPostal: '9420', localidadId: '{{localidad_id}}', principal: false },
      horarios: [{ diaSemana: 'LUNES', horaApertura: '09:00:00', horaCierre: '18:00:00' }],
      redesSociales: [{ tipo: 'INSTAGRAM', url: 'instagram.com/altarn' }],
    },
  }), [status(409), mensajeContiene('nombre en esa dirección')]),
  altaN('[alta] Con todo en RECHAZO_DEFINITIVO puede agregar otro comercio: 201 y nace PENDIENTE', [
    status(201),
    "pm.test('Nace PENDIENTE', () => pm.expect(pm.response.json().data.estado).to.eql('PENDIENTE'));",
    guardar('rN_alta', 'pm.response.json().data.id'),
  ]),
  item('[elegibilidad] Con el nuevo comercio pendiente ya no es elegible', req('GET', '/comercios/alta-adicional/elegibilidad', { token: 'token_r_n' }), [
    status(200),
    "pm.test('No elegible', () => pm.expect(pm.response.json().data).to.eql({ elegible: false }));",
  ]),
  altaN('[alta] Con un comercio pendiente: 409 con el mensaje de siempre', [status(409), mensajeContiene('al menos uno aprobado')], 'Otra Alta N'),
);

const O = porSufijo.O;
items.push(...altaDeDueno(O));
items.push(rechazar('O', 'Rechazo 0'));
for (let intento = 1; intento <= 3; intento += 1) {
  items.push(
    correccionYGuardar(`[ciclo ${intento}] Precarga: intento ${intento} de 3`, 'O', 'rO_com', [
      `pm.test('Intento ${intento}, quedan ${4 - intento}', () => { pm.expect(d.intentoActual).to.eql(${intento}); pm.expect(d.intentosRestantes).to.eql(${4 - intento}); pm.expect(d.motivoRechazo).to.eql('Rechazo ${intento - 1}'); });`,
    ]),
    reenviar(`[ciclo ${intento}] Reenvio con un cambio: 200`, 'O', 'rO_com', cambiarDescripcion(`Corrección número ${intento}`), [status(200)]),
    item(`[ciclo ${intento}] La bandeja marca el intento ${intento}${intento === 3 ? ' como el ultimo' : ''}`, req('GET', '/administrador/comercios/resolicitudes', { token: 'token_admin' }), [
      status(200),
      "const r = pm.response.json().data.find((x) => x.comercio.id === Number(pm.environment.get('rO_com')));",
      `pm.test('Intento ${intento}, esUltimoIntento ${intento === 3}', () => { pm.expect(r.intento).to.eql(${intento}); pm.expect(r.esUltimoIntento).to.eql(${intento === 3}); });`,
    ]),
    rechazar('O', `Rechazo ${intento}`),
    perfil(`[ciclo ${intento}] Estado despues del rechazo ${intento}`, 'O', 'rO_com', [
      `pm.test('${intento < 3 ? 'RECHAZADO (todavia corregible)' : 'RECHAZO_DEFINITIVO decidido por el servidor'}', () => pm.expect(pm.response.json().data.estado).to.eql('${intento < 3 ? 'RECHAZADO' : 'RECHAZO_DEFINITIVO'}'));`,
    ]),
  );
}
items.push(
  notificacionContiene('[aviso] El rechazo 2 es un rechazo comun', 'O', 'rO_com', "'Tu comercio ' + pm.environment.get('rO_nombre') + ' fue rechazado. Motivo: Rechazo 2'"),
  notificacionContiene('[aviso] El rechazo 3 es definitivo', 'O', 'rO_com', "'Tu comercio ' + pm.environment.get('rO_nombre') + ' fue rechazado de forma definitiva. Motivo: Rechazo 3'"),
  correccion('[GET] Sin intentos: 404', 'O', 'rO_com', 404),
  item('[elegibilidad] Con su unico comercio en RECHAZO_DEFINITIVO es elegible', req('GET', '/comercios/alta-adicional/elegibilidad', { token: 'token_r_o' }), [
    status(200),
    "pm.test('Elegible', () => pm.expect(pm.response.json().data).to.eql({ elegible: true }));",
  ]),
);

const P = porSufijo.P;
items.push(...altaDeDueno(P));
items.push(
  rechazar('P', 'Motivo de rechazo P'),
  item('Vincular cuenta simulada de Mercado Pago al Dueño P', req('POST', '/test/duenos/{{rP_dueno}}/mercadopago-simulada', { body: {} }), [status(200)]),
  perfil('[perfil] Con el comercio rechazado la vinculacion no lo toca', 'P', 'rP_com', ["pm.test('RECHAZADO', () => pm.expect(pm.response.json().data.estado).to.eql('RECHAZADO'));"]),
  correccionYGuardar('[GET] Precarga de P', 'P', 'rP_com'),
  reenviar('[PUT] Reenvio de P con un cambio: 200', 'P', 'rP_com', cambiarDescripcion('Corrección de P'), [status(200)]),
  resolver('Administrador aprueba la re-solicitud de P', 'rP_com', { aprobar: true }),
  perfil('[perfil] Con la cuenta vinculada nace APTO_VENTA', 'P', 'rP_com', ["pm.test('APTO_VENTA', () => pm.expect(pm.response.json().data.estado).to.eql('APTO_VENTA'));"]),
  notificacionContiene('[aviso] Aviso de que ya puede vender', 'P', 'rP_com', "'Tu comercio ' + pm.environment.get('rP_nombre') + ' fue aprobado y ya podés vender'"),
  item('[catalogo] El comercio aprobado esta en el catalogo publico', req('GET', '/catalogo/comercios'), [
    status(200),
    "pm.test('Esta', () => pm.expect(pm.response.json().data.map((c) => c.id)).to.include(Number(pm.environment.get('rP_com'))));",
  ]),
);

const folder = { name: NOMBRE_FOLDER, item: items };

const collection = JSON.parse(fs.readFileSync(collectionPath, 'utf8'));
const idx = collection.item.findIndex((f) => f.name === NOMBRE_FOLDER);
if (idx >= 0) collection.item[idx] = folder;
else collection.item.push(folder);
fs.writeFileSync(collectionPath, JSON.stringify(collection, null, 2) + '\n', 'utf8');

const environment = JSON.parse(fs.readFileSync(environmentPath, 'utf8'));
const variables = {
  rC_email: 'postman.rC@bajonea.test',
  rC_usuario: 'postmanrc',
  rC_password: 'Postman123',
  rC_codigo: '',
  token_r_cliente: '',
  r_404_body: '',
  r_inexistente: '999999999',
  r_foto_valida: '',
  r_foto_pre_registro: '',
  r_foto_otra_cuenta: '',
  rM_foto_adicional: '',
  rN_foto: '',
  rK_nombre_nuevo: '',
  rM_adic: '',
  rN_alta: '',
};
for (const { s } of DUENOS) {
  variables[v(s, 'email')] = `postman.r${s}@bajonea.test`;
  variables[v(s, 'usuario')] = `postmanr${s.toLowerCase()}`;
  variables[v(s, 'password')] = 'Postman123';
  for (const sufijo of ['codigo', 'dueno', 'com', 'nombre', 'base', 'legales']) variables[v(s, sufijo)] = '';
  variables[tok(s)] = '';
}
const existentes = new Set(environment.values.map((x) => x.key));
for (const [key, value] of Object.entries(variables)) {
  if (!existentes.has(key)) environment.values.push({ key, value, type: 'default', enabled: true });
}
fs.writeFileSync(environmentPath, JSON.stringify(environment, null, 2) + '\n', 'utf8');

console.log(`OK: carpeta "${NOMBRE_FOLDER}" con ${items.length} requests.`);
