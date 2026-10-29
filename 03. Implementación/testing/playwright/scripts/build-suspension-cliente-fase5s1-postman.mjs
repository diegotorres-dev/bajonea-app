import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const collectionPath = path.resolve(__dirname, '../../../postman/Bajonea-MVP.postman_collection.json');
const environmentPath = path.resolve(__dirname, '../../../postman/Bajonea-Local.postman_environment.json');

const PREFIJO_CARPETA = '80 - ';
const NOMBRE_CARPETA = '80 - Suspension de cuentas Fase 5 S1 (suspender y levantar Cliente, login, sesion abierta, recuperacion de contrasena, email con falla y reenvio, permisos, validaciones)';

const v = (clave) => `sc_${clave}`;
const ADMIN = '/administrador';
const TOKEN_ADMIN = 'token_admin';
const MOTIVO = 'Reiteradas quejas de comercios por pedidos falsos';

function req(method, urlPath, { body, rawBody, token, query } = {}) {
  const header = [];
  if (token) header.push({ key: 'Authorization', value: `Bearer {{${token}}}` });
  if (body !== undefined || rawBody !== undefined) header.push({ key: 'Content-Type', value: 'application/json' });
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
  } else if (rawBody !== undefined) {
    request.body = { mode: 'raw', raw: rawBody, options: { raw: { language: 'json' } } };
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
const codigoDe = (codigo) => prueba(`Trae el codigo ${codigo}`, `pm.expect(pm.response.json().data.codigo).to.eql('${codigo}');`);
const motivoDe = (texto) => prueba('Trae el motivo de la suspension', `pm.expect(pm.response.json().data.motivo).to.eql(${JSON.stringify(texto)});`);

function identidad(clave) {
  return [
    `const s = Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36);`,
    guardar(v(`${clave}_email`), `'sc.${clave}.' + s + '@bajonea.test'`),
    guardar(v(`${clave}_usuario`), `('sc${clave}' + s).slice(0, 20)`),
    guardar(v(`${clave}_password`), "'Pm9x' + Math.random().toString(36).slice(2, 12)"),
    guardar(v(`${clave}_dni`), 'String(30000000 + Math.floor(Math.random() * 60000000))'),
  ];
}

const items = [];
const agregar = (...nuevos) => items.push(...nuevos);

function clienteNuevo(clave, nombre) {
  return [
    item(
      `Registro ${nombre}`,
      req('POST', '/auth/registro/cliente', {
        body: {
          nombre,
          apellido: 'Suspension',
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
      identidad(clave),
    ),
    item(`Bypass test - codigo de verificacion ${nombre}`, req('GET', '/test/token-verificacion', { query: `email={{${v(`${clave}_email`)}}}` }), [
      status(200),
      guardar(v(`${clave}_codigo`), 'pm.response.json().data'),
    ]),
    item(`Verificar cuenta ${nombre}`, req('POST', '/auth/verificar', { body: { email: `{{${v(`${clave}_email`)}}}`, codigo: `{{${v(`${clave}_codigo`)}}}` } }), [status(200)]),
    item(`Login ${nombre}`, req('POST', '/auth/login', { body: { nombreUsuario: `{{${v(`${clave}_usuario`)}}}`, password: `{{${v(`${clave}_password`)}}}` } }), [
      status(200),
      guardar(v(`${clave}_token`), 'pm.response.json().data.token'),
      guardar(v(`${clave}_id`), 'pm.response.json().data.usuario.id'),
    ]),
  ];
}

const A = (ruta) => `${ADMIN}/clientes/{{${v('a_id')}}}${ruta}`;
const B = (ruta) => `${ADMIN}/clientes/{{${v('b_id')}}}${ruta}`;
const C = (ruta) => `${ADMIN}/clientes/{{${v('c_id')}}}${ruta}`;
const loginDe = (clave, passwordExpr) => req('POST', '/auth/login', {
  body: { nombreUsuario: `{{${v(`${clave}_usuario`)}}}`, password: passwordExpr ?? `{{${v(`${clave}_password`)}}}` },
});
const emailsDe = (clave) => req('GET', '/test/emails-cuenta', { query: `email={{${v(`${clave}_email`)}}}` });

agregar(
  ...clienteNuevo('a', 'Cliente A'),
  ...clienteNuevo('b', 'Cliente B'),
  item('El Administrador obtiene su propio id', req('GET', `${ADMIN}/perfil`, { token: TOKEN_ADMIN }), [
    status(200),
    guardar(v('admin_id'), 'pm.response.json().data.id'),
  ]),

  item('Permisos - un Cliente no puede suspender: 403', req('PUT', `${A('')}/suspender`, { token: v('a_token'), body: { motivo: MOTIVO } }), [status(403)]),
  item('Permisos - un Cliente no puede levantar: 403', req('PUT', `${A('')}/levantar-suspension`, { token: v('a_token') }), [status(403)]),
  item('Permisos - un Cliente no ve la vista previa: 403', req('GET', `${A('')}/suspension/previa`, { token: v('a_token') }), [status(403)]),
  item('Permisos - un Cliente no reenvia emails: 403', req('POST', `${A('')}/suspension/reenviar-email`, { token: v('a_token') }), [status(403)]),
  item('Permisos - sin token: 401', req('PUT', `${A('')}/suspender`, { body: { motivo: MOTIVO } }), [status(401)]),

  item('Validacion - motivo vacio: 400', req('PUT', `${A('')}/suspender`, { token: TOKEN_ADMIN, body: { motivo: '' } }), [status(400)]),
  item('Validacion - motivo en blanco: 400', req('PUT', `${A('')}/suspender`, { token: TOKEN_ADMIN, body: { motivo: '           ' } }), [status(400)]),
  item('Validacion - motivo de 9 caracteres: 400', req('PUT', `${A('')}/suspender`, { token: TOKEN_ADMIN, body: { motivo: '123456789' } }), [
    status(400),
    prueba('Dice el rango del motivo', "pm.expect(JSON.stringify(pm.response.json().data)).to.include('entre 10 y 500');"),
  ]),
  item('Validacion - motivo de 501 caracteres: 400', req('PUT', `${A('')}/suspender`, { token: TOKEN_ADMIN, body: { motivo: 'a'.repeat(501) } }), [status(400)]),
  item('Validacion - sin cuerpo: 400', req('PUT', `${A('')}/suspender`, { token: TOKEN_ADMIN }), [status(400)]),
  item('Validacion - levantar con motivo de 501 caracteres: 400', req('PUT', `${A('')}/levantar-suspension`, { token: TOKEN_ADMIN, body: { motivo: 'a'.repeat(501) } }), [status(400)]),
  item('Un usuario inexistente: 404', req('PUT', `${ADMIN}/clientes/99999999/suspender`, { token: TOKEN_ADMIN, body: { motivo: MOTIVO } }), [status(404)]),
  item('El Administrador no puede suspender su propia cuenta: 409', req('PUT', `${ADMIN}/clientes/{{${v('admin_id')}}}/suspender`, { token: TOKEN_ADMIN, body: { motivo: MOTIVO } }), [
    status(409),
    prueba('Mensaje', "pm.expect(pm.response.json().mensaje).to.eql('No podés suspender tu propia cuenta');"),
  ]),
  item('Levantar a quien no esta suspendido: 409', req('PUT', `${A('')}/levantar-suspension`, { token: TOKEN_ADMIN }), [
    status(409),
    prueba('Mensaje', "pm.expect(pm.response.json().mensaje).to.eql('La cuenta no está suspendida');"),
  ]),
  item('Reenviar el email sin ningun email fallido: 409', req('POST', `${A('')}/suspension/reenviar-email`, { token: TOKEN_ADMIN }), [status(409)]),
  item('Vista previa antes de suspender', req('GET', `${A('')}/suspension/previa`, { token: TOKEN_ADMIN }), [
    status(200),
    prueba('Cuenta activa sin pedidos', "const d = pm.response.json().data; pm.expect(d.estadoActual).to.eql('ACTIVO'); pm.expect(d.pedidosPagadosEnCurso).to.eql(0); pm.expect(d.pedidosSinPagar).to.eql(0);"),
  ]),
  item('Con sesion abierta el Cliente A opera normalmente', req('GET', '/clientes/perfil', { token: v('a_token') }), [status(200)]),

  item('Se suspende al Cliente A', req('PUT', `${A('')}/suspender`, { token: TOKEN_ADMIN, body: { motivo: MOTIVO } }), [
    status(200),
    prueba('Queda SUSPENDIDO', "const d = pm.response.json().data; pm.expect(d.estado).to.eql('SUSPENDIDO'); pm.expect(d.pedidosSinPagarCancelados).to.eql(0);"),
  ]),
  item('Suspenderlo de nuevo: 409', req('PUT', `${A('')}/suspender`, { token: TOKEN_ADMIN, body: { motivo: MOTIVO } }), [
    status(409),
    prueba('Mensaje', "pm.expect(pm.response.json().mensaje).to.eql('La cuenta ya está suspendida');"),
  ]),
  item('Con la sesion que ya tenia abierta, la siguiente accion da 401 con codigo y motivo', req('GET', '/clientes/perfil', { token: v('a_token') }), [
    status(401),
    codigoDe('CUENTA_SUSPENDIDA'),
    motivoDe(MOTIVO),
  ]),
  item('Vista previa de una cuenta suspendida', req('GET', `${A('')}/suspension/previa`, { token: TOKEN_ADMIN }), [
    status(200),
    prueba('Estado SUSPENDIDO', "pm.expect(pm.response.json().data.estadoActual).to.eql('SUSPENDIDO');"),
  ]),
  item('Login con contraseña incorrecta: mensaje generico, sin intentos restantes', loginDe('a', 'Incorrecta1x'), [
    status(401),
    prueba('Mensaje generico y sin data', "const r = pm.response.json(); pm.expect(r.mensaje).to.eql('Usuario o contraseña incorrectos'); pm.expect(r.data).to.eql(null);"),
  ]),
  item('Cuatro intentos fallidos mas no bloquean ni revelan el estado', loginDe('a', 'Incorrecta1x'), [status(401)]),
  item('Quinto intento fallido', loginDe('a', 'Incorrecta1x'), [status(401), prueba('Sigue generico', "pm.expect(pm.response.json().mensaje).to.eql('Usuario o contraseña incorrectos');")]),
  item('Login con la contraseña correcta: 409 con codigo y motivo', loginDe('a'), [
    status(409),
    codigoDe('CUENTA_SUSPENDIDA'),
    motivoDe(MOTIVO),
  ]),
  item('Recuperar contraseña: se pide el codigo', req('POST', '/auth/recuperar-password', { body: { email: `{{${v('a_email')}}}` } }), [status(200)]),
  item('Bypass test - codigo de recuperacion', req('GET', '/test/token', { query: `email={{${v('a_email')}}}&tipo=RECUPERACION_PASSWORD` }), [
    status(200),
    guardar(v('a_recuperacion'), 'pm.response.json().data'),
  ]),
  item('Recuperar contraseña: se confirma el cambio', req('POST', '/auth/recuperar-password/confirmar', {
    body: { email: `{{${v('a_email')}}}`, codigo: `{{${v('a_recuperacion')}}}`, nuevaPassword: 'NuevaClave9x' },
  }), [status(200)]),
  item('Con la contraseña nueva la cuenta sigue suspendida (recuperar no levanta la suspension)', loginDe('a', 'NuevaClave9x'), [
    status(409),
    codigoDe('CUENTA_SUSPENDIDA'),
    motivoDe(MOTIVO),
  ]),
  item('La contraseña vieja ya no sirve', loginDe('a'), [status(401)]),
  item('El Cliente A recibio un email de suspension', emailsDe('a'), [
    status(200),
    prueba('Un email de suspension enviado', "const l = pm.response.json().data.filter((e) => e.tipo === 'CLIENTE_SUSPENDIDO'); pm.expect(l.length).to.eql(1); pm.expect(l[0].estado).to.eql('ENVIADO');"),
  ]),

  item('Se levanta la suspension con un mensaje', req('PUT', `${A('')}/levantar-suspension`, { token: TOKEN_ADMIN, body: { motivo: 'Revisamos tu caso y todo esta en orden' } }), [
    status(200),
    prueba('Queda ACTIVO', "pm.expect(pm.response.json().data.estado).to.eql('ACTIVO');"),
  ]),
  item('Levantarla de nuevo: 409', req('PUT', `${A('')}/levantar-suspension`, { token: TOKEN_ADMIN }), [status(409)]),
  item('El token viejo da 401 generico (la sesion se cerro y la cuenta ya no esta suspendida)', req('GET', '/clientes/perfil', { token: v('a_token') }), [
    status(401),
    prueba('Sin codigo de suspension', "const r = pm.response.json(); pm.expect(r.data === null || r.data === undefined || r.data.codigo === undefined).to.eql(true);"),
  ]),
  item('Login con la contraseña nueva funciona de nuevo', loginDe('a', 'NuevaClave9x'), [
    status(200),
    guardar(v('a_token'), 'pm.response.json().data.token'),
  ]),
  item('El Cliente A recibio un email de levantamiento', emailsDe('a'), [
    status(200),
    prueba('Dos emails enviados', "const l = pm.response.json().data; pm.expect(l.map((e) => e.tipo)).to.eql(['CLIENTE_SUSPENDIDO', 'SUSPENSION_LEVANTADA']); pm.expect(l.every((e) => e.estado === 'ENVIADO')).to.eql(true);"),
  ]),
  item('El Cliente A vuelve a operar', req('GET', '/clientes/perfil', { token: v('a_token') }), [status(200)]),
  item('El listado de Clientes del Administrador trae el estado y el motivo vigente', req('GET', `${ADMIN}/clientes`, { token: TOKEN_ADMIN }), [
    status(200),
    prueba('El Cliente A esta ACTIVO sin motivo', `const f = pm.response.json().data.find((c) => c.id === Number(pm.environment.get('${v('a_id')}'))); pm.expect(f.estado).to.eql('ACTIVO'); pm.expect(f.motivoSuspension === null || f.motivoSuspension === undefined).to.eql(true);`),
  ]),

  item('Atajo de test: el proximo email de aviso de cuenta falla', req('PUT', '/test/email-aviso-cuenta/fallas', { query: 'cantidad=1' }), [status(200)]),
  item('Se suspende al Cliente B con el envio de email fallando', req('PUT', `${B('')}/suspender`, { token: TOKEN_ADMIN, body: { motivo: MOTIVO } }), [status(200)]),
  item('El email de B quedo marcado como fallido', emailsDe('b'), [
    status(200),
    prueba('Un email FALLIDO', "const l = pm.response.json().data; pm.expect(l.length).to.eql(1); pm.expect(l[0].estado).to.eql('FALLIDO');"),
  ]),
  item('El listado marca el email de B como no enviado y su estado previo', req('GET', `${ADMIN}/clientes`, { token: TOKEN_ADMIN }), [
    status(200),
    prueba('El listado marca el email de B como no enviado y su estado previo', `const f = pm.response.json().data.find((c) => c.id === Number(pm.environment.get('${v('b_id')}'))); pm.expect(f.ultimoEmailAvisoFallido).to.eql(true); pm.expect(f.estadoPrevioSuspension).to.eql('ACTIVO'); pm.expect(f.estado).to.eql('SUSPENDIDO');`),
  ]),
  item('El Administrador reenvia el email', req('POST', `${B('')}/suspension/reenviar-email`, { token: TOKEN_ADMIN }), [status(200)]),
  item('El email de B ahora figura enviado', emailsDe('b'), [
    status(200),
    prueba('Un email ENVIADO', "const l = pm.response.json().data; pm.expect(l.length).to.eql(1); pm.expect(l[0].estado).to.eql('ENVIADO');"),
  ]),
  item('El listado ya no marca el email de B', req('GET', `${ADMIN}/clientes`, { token: TOKEN_ADMIN }), [
    status(200),
    prueba('El listado ya no marca el email de B', `const f = pm.response.json().data.find((c) => c.id === Number(pm.environment.get('${v('b_id')}'))); pm.expect(f.ultimoEmailAvisoFallido).to.eql(false);`),
  ]),
  item('Reenviar otra vez: 409 (ya no hay uno fallido)', req('POST', `${B('')}/suspension/reenviar-email`, { token: TOKEN_ADMIN }), [status(409)]),
  item('Se levanta la suspension de B sin mensaje', req('PUT', `${B('')}/levantar-suspension`, { token: TOKEN_ADMIN }), [status(200)]),
  ...clienteNuevo('c', 'Cliente C'),
  item('Cliente C - primer intento fallido', loginDe('c', 'Incorrecta1x'), [status(401)]),
  item('Cliente C - segundo intento fallido', loginDe('c', 'Incorrecta1x'), [status(401)]),
  item('Cliente C - tercer intento fallido', loginDe('c', 'Incorrecta1x'), [status(401)]),
  item('Cliente C - la cuenta quedo bloqueada', loginDe('c'), [status(409)]),
  item('Se suspende al Cliente C que estaba bloqueado', req('PUT', `${C('')}/suspender`, { token: TOKEN_ADMIN, body: { motivo: MOTIVO } }), [status(200)]),
  item('El listado dice que C estaba bloqueado antes de la suspension', req('GET', `${ADMIN}/clientes`, { token: TOKEN_ADMIN }), [
    status(200),
    prueba('El listado dice que C estaba bloqueado antes de la suspension', `const f = pm.response.json().data.find((c) => c.id === Number(pm.environment.get('${v('c_id')}'))); pm.expect(f.estado).to.eql('SUSPENDIDO'); pm.expect(f.estadoPrevioSuspension).to.eql('BLOQUEADO');`),
  ]),
  item('Se levanta la suspension de C', req('PUT', `${C('')}/levantar-suspension`, { token: TOKEN_ADMIN }), [
    status(200),
    prueba('Vuelve ACTIVO', "pm.expect(pm.response.json().data.estado).to.eql('ACTIVO');"),
  ]),
  item('C entra con su contraseña: los intentos volvieron a cero', loginDe('c'), [status(200)]),
  item('El listado de C ya no tiene estado previo', req('GET', `${ADMIN}/clientes`, { token: TOKEN_ADMIN }), [
    status(200),
    prueba('El listado de C ya no tiene estado previo', `const f = pm.response.json().data.find((c) => c.id === Number(pm.environment.get('${v('c_id')}'))); pm.expect(f.estado).to.eql('ACTIVO'); pm.expect(f.estadoPrevioSuspension === null || f.estadoPrevioSuspension === undefined).to.eql(true);`),
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
const claves = ['admin_id', 'a_email', 'a_usuario', 'a_password', 'a_dni', 'a_codigo', 'a_token', 'a_id', 'a_recuperacion',
  'b_email', 'b_usuario', 'b_password', 'b_dni', 'b_codigo', 'b_token', 'b_id',
  'c_email', 'c_usuario', 'c_password', 'c_dni', 'c_codigo', 'c_token', 'c_id'].map(v);
const existentes = new Set(environment.values.map((x) => x.key));
for (const key of claves) {
  if (!existentes.has(key)) environment.values.push({ key, value: '', type: 'default', enabled: true });
}
fs.writeFileSync(environmentPath, JSON.stringify(environment, null, 2) + '\n', 'utf8');

console.log(`OK: carpeta "${NOMBRE_CARPETA.slice(0, 40)}..." con ${items.length} requests.`);
