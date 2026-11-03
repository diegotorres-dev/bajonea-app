import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const collectionPath = path.resolve(__dirname, '../../../postman/Bajonea-MVP.postman_collection.json');
const environmentPath = path.resolve(__dirname, '../../../postman/Bajonea-Local.postman_environment.json');

const PREFIJO_CARPETA = '88 - ';
const NOMBRE_CARPETA = '88 - Soporte Fase 5 S4 (consultas con y sin sesion, turnos, tope de 20, limites, acceso con email y codigo, cuenta suspendida, Administrador, emails)';

const v = (clave) => `so_${clave}`;
const SOPORTE = '/soporte';
const PUBLICO = '/soporte/publico';
const ADMIN_SOPORTE = '/administrador/soporte';
const TOKEN_ADMIN = 'token_admin';
const MENSAJE_INICIAL = 'No puedo entrar a mi cuenta desde ayer';
const NO_ENCONTRADA = 'No encontramos una consulta con esos datos. Revisá el email y el código.';
const INTENTOS = 'Hiciste demasiados intentos. Probá de nuevo en una hora.';

function req(method, urlPath, { body, token, query, ip } = {}) {
  const header = [];
  if (token) header.push({ key: 'Authorization', value: `Bearer {{${token}}}` });
  if (ip) header.push({ key: 'X-Forwarded-For', value: `{{${v(`ip_${ip}`)}}}` });
  if (body !== undefined) header.push({ key: 'Content-Type', value: 'application/json' });
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

function item(name, request, testLines = [], preLines = []) {
  const event = [];
  if (preLines.length) event.push({ listen: 'prerequest', script: { type: 'text/javascript', exec: preLines } });
  if (testLines.length) event.push({ listen: 'test', script: { type: 'text/javascript', exec: testLines } });
  return { name, request, response: [], event };
}

const status = (codigo) => `pm.test('Status code es ${codigo}', () => pm.response.to.have.status(${codigo}));`;
const guardar = (variable, expr) => `pm.environment.set('${variable}', ${expr});`;
const prueba = (texto, cuerpo) => `pm.test(${JSON.stringify(texto)}, () => { ${cuerpo} });`;
const mensajeDe = (texto) => prueba('Mensaje exacto', `pm.expect(pm.response.json().mensaje).to.eql(${JSON.stringify(texto)});`);
const dato = (ruta, esperado) => prueba(`${ruta} es ${esperado}`, `pm.expect(pm.response.json().data.${ruta}).to.eql(${JSON.stringify(esperado)});`);

const items = [];
const agregar = (...nuevos) => items.push(...nuevos);

const E = (clave) => `{{${v(`${clave}_email`)}}}`;
const C = (clave) => `{{${v(`${clave}_codigo`)}}}`;
const I = (clave) => `{{${v(`${clave}_id`)}}}`;
const emailNuevo = (clave) => guardar(v(`${clave}_email`), `'soporte.${clave}.' + Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36) + '@bajonea.test'`);

const crearSinSesion = (nombre, clave, ip, { tipo = 'NO_PUEDO_ENTRAR', mensaje = MENSAJE_INICIAL, estado = 201, extra = [], emailExpr } = {}) =>
  item(nombre, req('POST', `${PUBLICO}/consultas`, { ip, body: { email: emailExpr ?? E(clave), tipo, mensaje } }), [
    status(estado),
    ...(estado === 201 ? [guardar(v(`${clave}_codigo`), 'pm.response.json().data.codigo'), guardar(v(`${clave}_id`), 'pm.response.json().data.id')] : []),
    ...extra,
  ]);
const ver = (nombre, emailExpr, codigoExpr, ip, estado, extra = []) =>
  item(nombre, req('POST', `${PUBLICO}/consultas/ver`, { ip, body: { email: emailExpr, codigo: codigoExpr } }), [status(estado), ...extra]);
const responderPersona = (nombre, clave, ip, texto, estado, extra = []) =>
  item(nombre, req('POST', `${PUBLICO}/consultas/responder`, { ip, body: { email: E(clave), codigo: C(clave), texto } }), [status(estado), ...extra]);
const responderSoporte = (nombre, clave, texto, estado, extra = []) =>
  item(nombre, req('POST', `${ADMIN_SOPORTE}/${I(clave)}/mensajes`, { token: TOKEN_ADMIN, body: { texto } }), [status(estado), ...extra]);

// ----------------------------------------------------------------------------- preparación
agregar(
  item('Prepara emails e IPs unicos de la corrida', req('GET', '/health'), [status(200)], [
    'const r = () => Math.floor(Math.random() * 250) + 1;',
    "for (const k of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n']) pm.environment.set('" + v('ip_') + "' + k, '172.' + r() + '.' + r() + '.' + r());",
    emailNuevo('p1'), emailNuevo('p2'), emailNuevo('lim'), emailNuevo('int'), emailNuevo('rep'), emailNuevo('vacio'), emailNuevo('tope'), emailNuevo('fall'),
    "const s = Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36);",
    guardar(v('cli_email'), "'soporte.cli.' + s + '@bajonea.test'"),
    guardar(v('cli_usuario'), "('so' + s).slice(0, 20)"),
    guardar(v('cli_password'), "'Pm9x' + Math.random().toString(36).slice(2, 12)"),
    guardar(v('cli_dni'), 'String(30000000 + Math.floor(Math.random() * 60000000))'),
    guardar(v('otro_email'), "'soporte.otro.' + s + '@bajonea.test'"),
    guardar(v('otro_usuario'), "('sx' + s).slice(0, 20)"),
    guardar(v('otro_password'), "'Pm9x' + Math.random().toString(36).slice(2, 12)"),
    guardar(v('otro_dni'), 'String(30000000 + Math.floor(Math.random() * 60000000))'),
  ]),
);

// ----------------------------------------------------------------------------- sin sesión: validaciones y circuito
agregar(
  crearSinSesion('Sin sesion - email invalido: 400', 'p1', 'a', { estado: 400, emailExpr: 'no-es-un-email' }),
  crearSinSesion('Sin sesion - mensaje de 9 caracteres: 400', 'p1', 'a', { estado: 400, mensaje: '123456789' }),
  crearSinSesion('Sin sesion - mensaje de 1001 caracteres: 400', 'p1', 'a', { estado: 400, mensaje: 'a'.repeat(1001) }),
  crearSinSesion('Sin sesion - tipo inexistente: 400', 'p1', 'a', { estado: 400, tipo: 'INVENTADO' }),
  item('Sin sesion - sin tipo: 400', req('POST', `${PUBLICO}/consultas`, { ip: 'a', body: { email: E('p1'), mensaje: MENSAJE_INICIAL } }), [status(400)]),
  crearSinSesion('Sin sesion - crea la consulta con el texto en HTML sin tocar', 'p1', 'a', {
    tipo: 'APELACION_COMERCIO',
    mensaje: '<b>Mi comercio</b> fue rechazado & no se por que',
    extra: [
      mensajeDe('Recibimos tu consulta'),
      dato('estado', 'ESPERA_SOPORTE'),
      prueba('El codigo tiene 8 caracteres legibles', "pm.expect(pm.response.json().data.codigo).to.match(/^[2-9A-HJKMNP-Z]{8}$/);"),
    ],
  }),
  ver('Sin sesion - ver con el email y el codigo', E('p1'), C('p1'), 'a', 200, [
    dato('estado', 'ESPERA_SOPORTE'),
    dato('puedeResponder', false),
    dato('maxMensajes', 20),
    dato('mensajes[0].texto', '<b>Mi comercio</b> fue rechazado & no se por que'),
    dato('aviso', 'Soporte todavía no respondió. Vas a poder escribir cuando lo haga.'),
  ]),
  item('Sin sesion - ver con el email en mayusculas y el codigo en minusculas con guion', req('POST', `${PUBLICO}/consultas/ver`, { ip: 'a', body: {} }), [status(200)], [
    "const c = pm.environment.get('" + v('p1_codigo') + "').toLowerCase();",
    "pm.request.body.raw = JSON.stringify({ email: pm.environment.get('" + v('p1_email') + "').toUpperCase(), codigo: c.slice(0, 4) + '-' + c.slice(4) });",
  ]),
  ver('Sin sesion - email inexistente: 404', E('p2'), C('p1'), 'b', 404, [
    mensajeDe(NO_ENCONTRADA),
    guardar(v('cuerpo_404'), 'pm.response.text()'),
  ]),
  ver('Sin sesion - codigo incorrecto: 404 y el mismo cuerpo', E('p1'), 'ZZZZZZZZ', 'b', 404, [
    mensajeDe(NO_ENCONTRADA),
    prueba('Cuerpo identico', `pm.expect(pm.response.text()).to.eql(pm.environment.get('${v('cuerpo_404')}'));`),
  ]),
  ver('Sin sesion - codigo mal formado: 404 y el mismo cuerpo', E('p1'), '123', 'b', 404, [
    prueba('Cuerpo identico', `pm.expect(pm.response.text()).to.eql(pm.environment.get('${v('cuerpo_404')}'));`),
  ]),
  item('Sin sesion - ver sin codigo: 400', req('POST', `${PUBLICO}/consultas/ver`, { ip: 'b', body: { email: E('p1') } }), [status(400)]),
  responderPersona('Sin sesion - la persona escribe fuera de turno: 409', 'p1', 'a', 'Otra vez yo', 409, [
    mensajeDe('Soporte todavía no respondió. Vas a poder escribir cuando lo haga.'),
  ]),
  responderPersona('Sin sesion - responder con texto vacio: 400', 'p1', 'a', '   ', 400),
  responderPersona('Sin sesion - responder con 1001 caracteres: 400', 'p1', 'a', 'a'.repeat(1001), 400),
  item('Sin sesion - responder con un codigo ajeno: 404 y el mismo cuerpo', req('POST', `${PUBLICO}/consultas/responder`, { ip: 'b', body: { email: E('p1'), codigo: 'ZZZZZZZZ', texto: 'Hola' } }), [
    status(404),
    prueba('Cuerpo identico', `pm.expect(pm.response.text()).to.eql(pm.environment.get('${v('cuerpo_404')}'));`),
  ]),
);

// ----------------------------------------------------------------------------- Administrador: bandeja y turnos
agregar(
  item('Admin - lista las que esperan e incluye la consulta', req('GET', ADMIN_SOPORTE, { token: TOKEN_ADMIN, query: `estado=ESPERAN&limite=200&email={{${v('p1_email')}}}` }), [
    status(200),
    prueba('Incluye la consulta de p1', `const f = pm.response.json().data.find((c) => c.id === Number(pm.environment.get('${v('p1_id')}'))); pm.expect(f).to.be.an('object'); pm.expect(f.estado).to.eql('ESPERA_SOPORTE'); pm.expect(f.email).to.eql(pm.environment.get('${v('p1_email')}')); pm.expect(f.cuentaSuspendida).to.eql(false); pm.expect(f.emailPendienteDeReenvio).to.eql(false);`),
  ]),
  item('Admin - filtro invalido: 400', req('GET', ADMIN_SOPORTE, { token: TOKEN_ADMIN, query: 'estado=INVENTADO' }), [status(400)]),
  item('Admin - detalle sin cuenta asociada', req('GET', `${ADMIN_SOPORTE}/${I('p1')}`, { token: TOKEN_ADMIN }), [
    status(200),
    dato('puedeResponder', true),
    prueba('Sin cuenta asociada', "pm.expect(pm.response.json().data.cuentaAsociada === undefined || pm.response.json().data.cuentaAsociada === null).to.eql(true);"),
    prueba('Trae la IP', "pm.expect(pm.response.json().data.ip).to.be.a('string');"),
  ]),
  item('Admin - detalle de una consulta inexistente: 404', req('GET', `${ADMIN_SOPORTE}/99999999`, { token: TOKEN_ADMIN }), [status(404)]),
  responderSoporte('Admin - responder con texto vacio: 400', 'p1', '', 400),
  responderSoporte('Admin - responde y pasa el turno a la persona', 'p1', 'Hola, ¿qué te dice la pantalla?', 200, [
    dato('estado', 'ESPERA_PERSONA'),
    dato('puedeResponder', false),
    prueba('Dos mensajes, el email salio', "const m = pm.response.json().data.mensajes; pm.expect(m.length).to.eql(2); pm.expect(m[1].autor).to.eql('SOPORTE'); pm.expect(m[1].emailEnviado).to.eql(true);"),
  ]),
  responderSoporte('Admin - responder otra vez fuera de turno: 409', 'p1', 'Sigo yo', 409, [
    mensajeDe('Todavía no respondió la persona. Podés escribir cuando lo haga.'),
  ]),
  item('Admin - reenviar el email cuando salio bien: 409', req('POST', `${ADMIN_SOPORTE}/${I('p1')}/reenviar-email`, { token: TOKEN_ADMIN }), [
    status(409),
    mensajeDe('No hay ningún email fallido para reenviar'),
  ]),
  ver('Sin sesion - ahora la persona puede responder', E('p1'), C('p1'), 'a', 200, [dato('puedeResponder', true), prueba('Sin aviso', "pm.expect(pm.response.json().data.aviso === undefined || pm.response.json().data.aviso === null).to.eql(true);")]),
  responderPersona('Sin sesion - la persona responde una sola letra', 'p1', 'a', 'k', 200, [
    dato('estado', 'ESPERA_SOPORTE'),
    prueba('Tres mensajes', "pm.expect(pm.response.json().data.mensajes.length).to.eql(3);"),
  ]),
  responderPersona('Sin sesion - la persona vuelve a escribir fuera de turno: 409', 'p1', 'a', 'Dos veces', 409),
  item('Admin - cierra la consulta', req('PUT', `${ADMIN_SOPORTE}/${I('p1')}/cerrar`, { token: TOKEN_ADMIN }), [status(200), dato('estado', 'CERRADO')]),
  item('Admin - cerrar otra vez: 409', req('PUT', `${ADMIN_SOPORTE}/${I('p1')}/cerrar`, { token: TOKEN_ADMIN }), [status(409), mensajeDe('Esta consulta ya está cerrada.')]),
  responderSoporte('Admin - responder una consulta cerrada: 409', 'p1', 'Reabro', 409, [
    mensajeDe('Esta consulta está cerrada. Si necesitás algo más, enviá una consulta nueva.'),
  ]),
  responderPersona('Sin sesion - la persona escribe en una consulta cerrada: 409', 'p1', 'a', 'Quiero seguir', 409, [
    mensajeDe('Esta consulta está cerrada. Si necesitás algo más, enviá una consulta nueva.'),
  ]),
  ver('Sin sesion - ver la consulta cerrada trae el aviso', E('p1'), C('p1'), 'a', 200, [
    dato('estado', 'CERRADO'),
    dato('aviso', 'Esta consulta está cerrada. Si necesitás algo más, enviá una consulta nueva.'),
  ]),
  item('Admin - lista las cerradas e incluye la consulta', req('GET', ADMIN_SOPORTE, { token: TOKEN_ADMIN, query: `estado=CERRADAS&limite=200&email={{${v('p1_email')}}}` }), [
    status(200),
    prueba('Incluye la consulta de p1', `pm.expect(pm.response.json().data.some((c) => c.id === Number(pm.environment.get('${v('p1_id')}')))).to.eql(true);`),
  ]),
  item('Admin - responder o cerrar una consulta inexistente: 404', req('PUT', `${ADMIN_SOPORTE}/99999999/cerrar`, { token: TOKEN_ADMIN }), [status(404)]),
);

// ----------------------------------------------------------------------------- tope de 20 mensajes
agregar(crearSinSesion('Tope - crea la consulta', 'tope', 'c', {}));
for (let n = 2; n <= 20; n += 1) {
  if (n % 2 === 0) {
    agregar(responderSoporte(`Tope - Soporte escribe el mensaje ${n}`, 'tope', `Respuesta de Soporte ${n}`, 200, n === 20 ? [dato('estado', 'CERRADO'), dato('cantidadMensajes', 20)] : [dato('estado', 'ESPERA_PERSONA')]));
  } else {
    agregar(responderPersona(`Tope - la persona escribe el mensaje ${n}`, 'tope', 'c', `Respuesta de la persona ${n}`, 200, [dato('estado', 'ESPERA_SOPORTE')]));
  }
}
agregar(
  ver('Tope - la consulta quedo cerrada con el aviso del maximo', E('tope'), C('tope'), 'c', 200, [
    dato('estado', 'CERRADO'),
    dato('cantidadMensajes', 20),
    dato('aviso', 'Llegamos al máximo de mensajes de esta consulta. Si necesitás algo más, enviá una consulta nueva.'),
  ]),
  responderPersona('Tope - la persona no puede escribir mas: 409', 'tope', 'c', 'Una mas', 409),
  responderSoporte('Tope - Soporte tampoco: 409', 'tope', 'Una mas', 409),
);

// ----------------------------------------------------------------------------- límites
agregar(
  crearSinSesion('Limite - consulta 1 del email', 'lim', 'd', {}),
  crearSinSesion('Limite - consulta 2 del email', 'lim', 'd', {}),
  crearSinSesion('Limite - consulta 3 del email', 'lim', 'd', {}),
  item('Limite - la cuarta consulta del dia: 429', req('POST', `${PUBLICO}/consultas`, { ip: 'd', body: { email: E('lim'), tipo: 'OTRA', mensaje: MENSAJE_INICIAL } }), [
    status(429),
    mensajeDe('Ya enviaste 3 consultas hoy. Probá de nuevo mañana o esperá la respuesta de Soporte.'),
  ]),
);
for (let n = 1; n <= 10; n += 1) {
  agregar(item(`Limite IP - consulta ${n} de 10 desde la misma IP`, req('POST', `${PUBLICO}/consultas`, { ip: 'e', body: { email: `{{${v('ipmail')}}}`, tipo: 'OTRA', mensaje: MENSAJE_INICIAL } }), [status(201)], [
    guardar(v('ipmail'), `'soporte.ip${n}.' + Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36) + '@bajonea.test'`),
  ]));
}
agregar(
  item('Limite IP - la consulta 11 desde la misma IP: 429', req('POST', `${PUBLICO}/consultas`, { ip: 'e', body: { email: `{{${v('ipmail')}}}x`, tipo: 'OTRA', mensaje: MENSAJE_INICIAL } }), [
    status(429),
    mensajeDe('Se enviaron demasiadas consultas desde tu conexión. Probá de nuevo más tarde.'),
  ]),
  crearSinSesion('Intentos - crea una consulta para probar el acceso', 'int', 'f', {}),
);
for (let n = 1; n <= 5; n += 1) {
  agregar(ver(`Intentos - codigo incorrecto ${n} de 5: 404`, E('int'), 'ZZZZZZZZ', 'g', 404, [mensajeDe(NO_ENCONTRADA)]));
}
agregar(
  ver('Intentos - el sexto intento: 429', E('int'), 'ZZZZZZZZ', 'g', 429, [mensajeDe(INTENTOS)]),
  ver('Intentos - ni el codigo correcto entra con el limite superado: 429', E('int'), C('int'), 'h', 429, [mensajeDe(INTENTOS)]),
  responderPersona('Intentos - tampoco se puede responder: 429', 'int', 'h', 'Hola', 429, [mensajeDe(INTENTOS)]),
  crearSinSesion('Reenvio - crea una consulta abierta', 'rep', 'i', {}),
  item('Reenvio - con consultas: respuesta uniforme', req('POST', `${PUBLICO}/codigos/reenviar`, { ip: 'j', body: { email: E('rep') } }), [
    status(200),
    mensajeDe('Si hay consultas con ese email, te mandamos los códigos. Revisá tu bandeja de entrada.'),
    guardar(v('cuerpo_reenvio'), 'pm.response.text()'),
  ]),
  item('Reenvio - sin consultas: misma respuesta', req('POST', `${PUBLICO}/codigos/reenviar`, { ip: 'k', body: { email: E('vacio') } }), [
    status(200),
    prueba('Cuerpo identico', `pm.expect(pm.response.text()).to.eql(pm.environment.get('${v('cuerpo_reenvio')}'));`),
  ]),
  item('Reenvio - email invalido: 400', req('POST', `${PUBLICO}/codigos/reenviar`, { ip: 'k', body: { email: 'no-es-un-email' } }), [status(400)]),
  item('Reenvio - segundo pedido del email', req('POST', `${PUBLICO}/codigos/reenviar`, { ip: 'l', body: { email: E('rep') } }), [status(200)]),
  item('Reenvio - tercer pedido del email', req('POST', `${PUBLICO}/codigos/reenviar`, { ip: 'm', body: { email: E('rep') } }), [status(200)]),
  item('Reenvio - el cuarto pedido del email: 429', req('POST', `${PUBLICO}/codigos/reenviar`, { ip: 'n', body: { email: E('rep') } }), [
    status(429),
    mensajeDe(INTENTOS),
  ]),
);

// ----------------------------------------------------------------------------- emails con falla
agregar(
  crearSinSesion('Email - crea una consulta', 'fall', 'a', {}),
  item('Email - se simula una falla del proximo email de Soporte', req('PUT', '/test/email-soporte/fallas', { query: 'cantidad=1' }), [status(200)]),
  responderSoporte('Email - Soporte responde y el email falla', 'fall', 'Respuesta cuyo email falla', 200, [
    dato('emailPendienteDeReenvio', true),
    prueba('El mensaje quedo marcado sin enviar', "const m = pm.response.json().data.mensajes; pm.expect(m[m.length - 1].emailEnviado).to.eql(false);"),
  ]),
  item('Email - la bandeja marca el email sin enviar', req('GET', ADMIN_SOPORTE, { token: TOKEN_ADMIN, query: `estado=RESPONDIDAS&limite=200&email={{${v('fall_email')}}}` }), [
    status(200),
    prueba('Marcado', `const f = pm.response.json().data.find((c) => c.id === Number(pm.environment.get('${v('fall_id')}'))); pm.expect(f.emailPendienteDeReenvio).to.eql(true);`),
  ]),
  item('Email - el Administrador reenvia el email', req('POST', `${ADMIN_SOPORTE}/${I('fall')}/reenviar-email`, { token: TOKEN_ADMIN }), [
    status(200),
    mensajeDe('Email reenviado'),
    dato('emailPendienteDeReenvio', false),
  ]),
  item('Email - ya no hay ningun email para reenviar: 409', req('POST', `${ADMIN_SOPORTE}/${I('fall')}/reenviar-email`, { token: TOKEN_ADMIN }), [status(409)]),
);

// ----------------------------------------------------------------------------- con sesión
function clienteNuevo(clave, nombre) {
  return [
    item(
      `Registro ${nombre}`,
      req('POST', '/auth/registro/cliente', {
        body: {
          nombre,
          apellido: 'Soporte',
          dni: `{{${v(`${clave}_dni`)}}}`,
          fechaNacimiento: '1995-05-20',
          telefono: '+5492964551238',
          nombreUsuario: `{{${v(`${clave}_usuario`)}}}`,
          email: `{{${v(`${clave}_email`)}}}`,
          password: `{{${v(`${clave}_password`)}}}`,
          aceptaTerminos: true,
          direccion: { calle: 'Calle Siempre Viva', numero: '123', pisoDepto: null, codigoPostal: '9420', localidadId: '{{localidad_id}}', principal: true },
        },
      }),
      [status(201)],
    ),
    item(`Bypass test - codigo de verificacion ${nombre}`, req('GET', '/test/token-verificacion', { query: `email={{${v(`${clave}_email`)}}}` }), [
      status(200),
      guardar(v(`${clave}_codigo_v`), 'pm.response.json().data'),
    ]),
    item(`Verificar cuenta ${nombre}`, req('POST', '/auth/verificar', { body: { email: `{{${v(`${clave}_email`)}}}`, codigo: `{{${v(`${clave}_codigo_v`)}}}` } }), [status(200)]),
    item(`Login ${nombre}`, req('POST', '/auth/login', { body: { nombreUsuario: `{{${v(`${clave}_usuario`)}}}`, password: `{{${v(`${clave}_password`)}}}` } }), [
      status(200),
      guardar(v(`${clave}_token`), 'pm.response.json().data.token'),
      guardar(v(`${clave}_uid`), 'pm.response.json().data.usuario.id'),
    ]),
  ];
}
const T = (clave) => v(`${clave}_token`);

agregar(
  ...clienteNuevo('cli', 'Cliente Soporte'),
  ...clienteNuevo('otro', 'Cliente Ajeno'),
  item('Sesion - sin token: 401', req('GET', `${SOPORTE}/mis-consultas`), [status(401)]),
  item('Sesion - crear sin token: 401', req('POST', `${SOPORTE}/consultas`, { ip: 'a', body: { tipo: 'OTRA', mensaje: MENSAJE_INICIAL } }), [status(401)]),
  item('Sesion - crear con mensaje corto: 400', req('POST', `${SOPORTE}/consultas`, { token: T('cli'), ip: 'a', body: { tipo: 'OTRA', mensaje: 'corto' } }), [status(400)]),
  item('Sesion - crear una consulta usa el email de la cuenta', req('POST', `${SOPORTE}/consultas`, { token: T('cli'), ip: 'a', body: { tipo: 'APELACION_CUENTA', mensaje: 'Quiero consultar por mi cuenta' } }), [
    status(201),
    guardar(v('s1_id'), 'pm.response.json().data.id'),
    guardar(v('s1_codigo'), 'pm.response.json().data.codigo'),
  ]),
  item('Sesion - la persona del otro usuario crea la suya', req('POST', `${SOPORTE}/consultas`, { token: T('otro'), ip: 'a', body: { tipo: 'OTRA', mensaje: 'Una consulta del otro usuario' } }), [
    status(201),
    guardar(v('s2_id'), 'pm.response.json().data.id'),
  ]),
  item('Sesion - Mis consultas trae solo las propias', req('GET', `${SOPORTE}/mis-consultas`, { token: T('cli') }), [
    status(200),
    prueba('Solo la propia', `const d = pm.response.json().data; pm.expect(d.length).to.eql(1); pm.expect(d[0].id).to.eql(Number(pm.environment.get('${v('s1_id')}')));`),
  ]),
  item('Sesion - el detalle propio sin codigo', req('GET', `${SOPORTE}/mis-consultas/{{${v('s1_id')}}}`, { token: T('cli') }), [
    status(200),
    dato('estado', 'ESPERA_SOPORTE'),
    dato('mensajes[0].texto', 'Quiero consultar por mi cuenta'),
  ]),
  item('Sesion - una consulta ajena: 404', req('GET', `${SOPORTE}/mis-consultas/{{${v('s2_id')}}}`, { token: T('cli') }), [status(404)]),
  item('Sesion - responder una consulta ajena: 404', req('POST', `${SOPORTE}/mis-consultas/{{${v('s2_id')}}}/mensajes`, { token: T('cli'), body: { texto: 'Hola' } }), [status(404)]),
  item('Sesion - una consulta inexistente: 404', req('GET', `${SOPORTE}/mis-consultas/99999999`, { token: T('cli') }), [status(404)]),
  item('Sesion - responder fuera de turno: 409', req('POST', `${SOPORTE}/mis-consultas/{{${v('s1_id')}}}/mensajes`, { token: T('cli'), body: { texto: 'Hola' } }), [
    status(409),
    mensajeDe('Soporte todavía no respondió. Vas a poder escribir cuando lo haga.'),
  ]),
  item('Sesion - el contador empieza en cero', req('GET', `${SOPORTE}/mis-consultas/contador`, { token: T('cli') }), [status(200), dato('esperandoTuRespuesta', 0)]),
  item('Admin - el detalle muestra la cuenta asociada', req('GET', `${ADMIN_SOPORTE}/{{${v('s1_id')}}}`, { token: TOKEN_ADMIN }), [
    status(200),
    prueba('Cuenta asociada del Cliente', `const c = pm.response.json().data.cuentaAsociada; pm.expect(c.usuarioId).to.eql(Number(pm.environment.get('${v('cli_uid')}'))); pm.expect(c.estado).to.eql('ACTIVO'); pm.expect(c.rol).to.eql('CLIENTE'); pm.expect(c.esEmpleado).to.eql(false);`),
  ]),
  item('Admin - responde la consulta con sesion', req('POST', `${ADMIN_SOPORTE}/{{${v('s1_id')}}}/mensajes`, { token: TOKEN_ADMIN, body: { texto: 'Estamos revisando tu caso' } }), [status(200), dato('estado', 'ESPERA_PERSONA')]),
  item('Sesion - el contador pasa a uno', req('GET', `${SOPORTE}/mis-consultas/contador`, { token: T('cli') }), [status(200), dato('esperandoTuRespuesta', 1)]),
  item('Sesion - la persona responde sin codigo', req('POST', `${SOPORTE}/mis-consultas/{{${v('s1_id')}}}/mensajes`, { token: T('cli'), body: { texto: 'Gracias, quedo atento' } }), [
    status(200),
    dato('estado', 'ESPERA_SOPORTE'),
    prueba('Tres mensajes', "pm.expect(pm.response.json().data.mensajes.length).to.eql(3);"),
  ]),
  item('Sesion - responder con texto vacio: 400', req('POST', `${SOPORTE}/mis-consultas/{{${v('s1_id')}}}/mensajes`, { token: T('cli'), body: { texto: '' } }), [status(400)]),
  item('Sesion - la consulta tambien se abre con email y codigo', req('POST', `${PUBLICO}/consultas/ver`, { ip: 'a', body: { email: E('cli'), codigo: C('s1') } }), [status(200), dato('estado', 'ESPERA_SOPORTE')]),
);

// ----------------------------------------------------------------------------- cuenta suspendida
agregar(
  item('Suspendida - el Administrador suspende al Cliente', req('PUT', `/administrador/clientes/{{${v('cli_uid')}}}/suspender`, { token: TOKEN_ADMIN, body: { motivo: 'Reiteradas quejas de comercios por pedidos falsos' } }), [status(200)]),
  item('Suspendida - el resto de la API le responde 401 CUENTA_SUSPENDIDA', req('GET', '/clientes/perfil', { token: T('cli') }), [
    status(401),
    dato('codigo', 'CUENTA_SUSPENDIDA'),
  ]),
  item('Suspendida - Soporte con sesion SI le responde: Mis consultas', req('GET', `${SOPORTE}/mis-consultas`, { token: T('cli') }), [status(200), prueba('Sigue viendo su consulta', "pm.expect(pm.response.json().data.length).to.be.at.least(1);")]),
  item('Suspendida - puede ver el detalle', req('GET', `${SOPORTE}/mis-consultas/{{${v('s1_id')}}}`, { token: T('cli') }), [status(200)]),
  item('Suspendida - puede crear una consulta nueva', req('POST', `${SOPORTE}/consultas`, { token: T('cli'), ip: 'a', body: { tipo: 'APELACION_CUENTA', mensaje: 'Mi cuenta fue suspendida y quiero apelar' } }), [
    status(201),
    guardar(v('s3_id'), 'pm.response.json().data.id'),
  ]),
  item('Suspendida - Admin responde la nueva', req('POST', `${ADMIN_SOPORTE}/{{${v('s3_id')}}}/mensajes`, { token: TOKEN_ADMIN, body: { texto: 'Contanos tu version' } }), [
    status(200),
    prueba('La cuenta asociada figura suspendida', "const c = pm.response.json().data.cuentaAsociada; pm.expect(c.estado).to.eql('SUSPENDIDO');"),
  ]),
  item('Suspendida - puede responder', req('POST', `${SOPORTE}/mis-consultas/{{${v('s3_id')}}}/mensajes`, { token: T('cli'), body: { texto: 'Fue un malentendido' } }), [status(200), dato('estado', 'ESPERA_SOPORTE')]),
  item('Suspendida - el contador responde', req('GET', `${SOPORTE}/mis-consultas/contador`, { token: T('cli') }), [status(200)]),
  item('Suspendida - otras rutas con sesion siguen cerradas', req('GET', '/notificaciones', { token: T('cli') }), [status(401), dato('codigo', 'CUENTA_SUSPENDIDA')]),
  item('Suspendida - el login revela la suspension', req('POST', '/auth/login', { body: { nombreUsuario: `{{${v('cli_usuario')}}}`, password: `{{${v('cli_password')}}}` } }), [status(409), dato('codigo', 'CUENTA_SUSPENDIDA')]),
  item('Suspendida - la bandeja marca la cuenta suspendida', req('GET', ADMIN_SOPORTE, { token: TOKEN_ADMIN, query: `estado=ESPERAN&limite=200&email={{${v('cli_email')}}}` }), [
    status(200),
    prueba('Marcada', `const f = pm.response.json().data.find((c) => c.id === Number(pm.environment.get('${v('s3_id')}'))); pm.expect(f.cuentaSuspendida).to.eql(true);`),
  ]),
  item('Suspendida - sin sesion tambien entra con email y codigo', req('POST', `${PUBLICO}/consultas/ver`, { ip: 'a', body: { email: E('cli'), codigo: C('s1') } }), [status(200)]),
  item('Suspendida - el Administrador levanta la suspension', req('PUT', `/administrador/clientes/{{${v('cli_uid')}}}/levantar-suspension`, { token: TOKEN_ADMIN }), [status(200)]),
);

// ----------------------------------------------------------------------------- permisos y panel
agregar(
  item('Permisos - la bandeja sin token: 401', req('GET', ADMIN_SOPORTE), [status(401)]),
  item('Permisos - un Cliente no ve la bandeja: 403', req('GET', ADMIN_SOPORTE, { token: T('otro') }), [status(403)]),
  item('Permisos - un Cliente no ve un detalle: 403', req('GET', `${ADMIN_SOPORTE}/{{${v('s2_id')}}}`, { token: T('otro') }), [status(403)]),
  item('Permisos - un Cliente no responde como Soporte: 403', req('POST', `${ADMIN_SOPORTE}/{{${v('s2_id')}}}/mensajes`, { token: T('otro'), body: { texto: 'Hola' } }), [status(403)]),
  item('Permisos - un Cliente no cierra: 403', req('PUT', `${ADMIN_SOPORTE}/{{${v('s2_id')}}}/cerrar`, { token: T('otro') }), [status(403)]),
  item('Permisos - un Cliente no reenvia emails: 403', req('POST', `${ADMIN_SOPORTE}/{{${v('s2_id')}}}/reenviar-email`, { token: T('otro') }), [status(403)]),
  item('Panel - las metricas traen las consultas que esperan', req('GET', '/administrador/metricas', { token: TOKEN_ADMIN }), [
    status(200),
    prueba('Es un numero', "pm.expect(pm.response.json().data.consultasSoporteEsperando).to.be.a('number'); pm.expect(pm.response.json().data.consultasSoporteEsperando).to.be.at.least(1);"),
  ]),
);

const carpeta = { name: NOMBRE_CARPETA, item: items };
const collection = JSON.parse(fs.readFileSync(collectionPath, 'utf8'));
const idx = collection.item.findIndex((f) => f.name.startsWith(PREFIJO_CARPETA));
if (idx >= 0) {
  collection.item.splice(idx, 1, carpeta);
} else {
  collection.item.push(carpeta);
}
fs.writeFileSync(collectionPath, JSON.stringify(collection, null, 2) + '\n', 'utf8');

const environment = JSON.parse(fs.readFileSync(environmentPath, 'utf8'));
const claves = [];
for (const k of 'abcdefghijklmn') claves.push(`ip_${k}`);
for (const k of ['p1', 'p2', 'lim', 'int', 'rep', 'vacio', 'tope', 'fall', 'cli', 'otro']) claves.push(`${k}_email`, `${k}_codigo`, `${k}_id`);
for (const k of ['cli', 'otro']) claves.push(`${k}_usuario`, `${k}_password`, `${k}_dni`, `${k}_codigo_v`, `${k}_token`, `${k}_uid`);
claves.push('s1_id', 's1_codigo', 's2_id', 's3_id', 'cuerpo_404', 'cuerpo_reenvio', 'ipmail');
const existentes = new Set(environment.values.map((x) => x.key));
for (const clave of claves.map(v)) {
  if (!existentes.has(clave)) environment.values.push({ key: clave, value: '', type: 'default', enabled: true });
}
fs.writeFileSync(environmentPath, JSON.stringify(environment, null, 2) + '\n', 'utf8');

console.log(`OK: carpeta "${NOMBRE_CARPETA.slice(0, 40)}..." con ${items.length} requests.`);
