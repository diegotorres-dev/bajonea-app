import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const collectionPath = path.resolve(__dirname, '../../../postman/Bajonea-MVP.postman_collection.json');
const environmentPath = path.resolve(__dirname, '../../../postman/Bajonea-Local.postman_environment.json');

const FOLDER_TRAMO1 = '49 - Multi-comercio Tramo 1 (X-Comercio-Id, aislamiento y bloqueo con N comercios)';
const FOLDERS_QUE_MANEJAN_EL_HEADER = [
  FOLDER_TRAMO1,
  '50 - Multi-comercio Tramo 2A (alta adicional, elegibilidad, duplicados, aprobacion y bandeja)',
  '51 - Multi-comercio Tramo 3A (correccion y re-solicitud de comercios rechazados, rechazo definitivo y bandeja)',
];
const PREFIJO = '[T4A] ';
const HEADER = 'X-Comercio-Id';

const SCRIPT_PRE_REQUEST_COLECCION = [
  "const HEADER = 'X-Comercio-Id';",
  'const RUTAS_DEL_DUENO = /^\\/(comercios\\/(perfil|redes-sociales)|productos|pedidos\\/comercio|notificaciones)(\\/|$)/;',
  'const RUTAS_SIN_HEADER = /^\\/notificaciones\\/comercio\\//;',
  "pm.variables.unset('cab_comercio_inyectada');",
  "const autorizacion = pm.request.headers.get('Authorization');",
  'if (autorizacion && !pm.request.headers.has(HEADER)) {',
  "  const ruta = pm.request.url.getPath() || '';",
  '  if (RUTAS_DEL_DUENO.test(ruta) && !RUTAS_SIN_HEADER.test(ruta)) {',
  "    const token = pm.variables.replaceIn(autorizacion).replace(/^Bearer\\s+/i, '');",
  "    const mapa = JSON.parse(pm.collectionVariables.get('comercio_activo_por_token') || '{}');",
  '    const comercioId = mapa[token.slice(-40)];',
  '    if (comercioId) {',
  '      pm.request.headers.add({ key: HEADER, value: String(comercioId) });',
  "      pm.variables.set('cab_comercio_inyectada', '1');",
  '    }',
  '  }',
  '}',
];

const SCRIPT_TEST_COLECCION = [
  "const esLogin = pm.request.method === 'POST' && /\\/auth\\/login$/.test(pm.request.url.getPath() || '');",
  'if (esLogin && pm.response.code === 200) {',
  '  const sesion = (pm.response.json() || {}).data;',
  "  if (sesion && sesion.usuario && sesion.usuario.rol === 'DUENO') {",
  '    pm.sendRequest({',
  "      url: pm.variables.replaceIn('{{base_url}}') + '/comercios/mis-comercios',",
  "      method: 'GET',",
  "      header: { Authorization: 'Bearer ' + sesion.token },",
  '    }, (error, respuesta) => {',
  '      if (error || respuesta.code !== 200) return;',
  '      const comercios = respuesta.json().data || [];',
  '      if (comercios.length === 0) return;',
  "      const prioridad = [['APROBADO', 'APTO_VENTA'], ['RECHAZADO'], ['PENDIENTE']];",
  '      let elegido = comercios[0];',
  '      for (const estados of prioridad) {',
  '        const encontrado = comercios.find((c) => estados.includes(c.estado));',
  '        if (encontrado) { elegido = encontrado; break; }',
  '      }',
  "      const mapa = JSON.parse(pm.collectionVariables.get('comercio_activo_por_token') || '{}');",
  '      mapa[sesion.token.slice(-40)] = elegido.id;',
  "      pm.collectionVariables.set('comercio_activo_por_token', JSON.stringify(mapa));",
  '    });',
  '  }',
  '}',
];

const SCRIPT_PRE_REQUEST_FOLDER_SIN_HEADER_AUTOMATICO = [
  "if (pm.variables.get('cab_comercio_inyectada') === '1') {",
  "  pm.request.headers.remove('X-Comercio-Id');",
  '}',
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
    name: `${PREFIJO}${name}`,
    request,
    response: [],
    event: testLines.length ? [{ listen: 'test', script: { type: 'text/javascript', exec: testLines } }] : [],
  };
}

const status = (codigo) => `pm.test('Status code es ${codigo}', () => pm.response.to.have.status(${codigo}));`;
const guardar = (variable, expr) => `pm.environment.set('${variable}', ${expr});`;
const entero = (variable) => `Number(pm.environment.get('${variable}'))`;
const conComercio = (variable) => ({ [HEADER]: `{{${variable}}}` });

const misComercios = (nombre, token, testLines, headers = {}) =>
  item(nombre, req('GET', '/comercios/mis-comercios', { token, headers }), testLines);

const listarNotificaciones = (nombre, token, headers, testLines) => item(nombre, req('GET', '/notificaciones', { token, headers }), testLines);

const contador = (nombre, token, headers, testLines) =>
  item(nombre, req('GET', '/notificaciones/no-leidas/contador', { token, headers }), testLines);

const leidas = (nombre, comercioPath, token, headers, testLines) =>
  item(nombre, req('PUT', `/notificaciones/comercio/${comercioPath}/leidas`, { token, headers, body: undefined }), testLines);

const formaDeUnComercio = [
  "pm.test('Cada comercio trae sus 11 campos con el tipo correcto', () => {",
  '  pm.response.json().data.forEach((c) => {',
  "    pm.expect(Object.keys(c).sort()).to.eql(['abiertoAhora', 'cantidadNotificacionesNoLeidas', 'cerradoManualmente', 'estado', 'fechaRegistro', 'fotoPerfilUrl', 'id', 'nombre', 'operativo', 'puedeCambiarCierre', 'textoReapertura']);",
  "    pm.expect(c.id).to.be.a('number');",
  "    pm.expect(c.nombre).to.be.a('string');",
  "    pm.expect(c.estado).to.be.a('string');",
  "    pm.expect(c.fechaRegistro).to.be.a('string');",
  "    pm.expect(c.operativo).to.be.a('boolean');",
  "    pm.expect(c.cantidadNotificacionesNoLeidas).to.be.a('number');",
  '  });',
  '});',
];

const items = [];

items.push(
  misComercios('mis-comercios: el Dueño M ve sus 2 comercios en orden de alta, con forma y contadores', 'token_comercio_m', [
    status(200),
    ...formaDeUnComercio,
    "const d = pm.response.json().data;",
    "pm.test('Son A y B, en ese orden', () => pm.expect(d.map((c) => c.id)).to.eql([" + entero('comercio_m_a_id') + ', ' + entero('comercio_m_b_id') + ']));',
    "pm.test('Ambos APROBADOS y operativos', () => { pm.expect(d.map((c) => c.estado)).to.eql(['APROBADO', 'APROBADO']); pm.expect(d.map((c) => c.operativo)).to.eql([true, true]); });",
    "pm.test('A tiene su aviso de alta y B el aviso de su pedido, sin leer', () => { pm.expect(d[0].cantidadNotificacionesNoLeidas).to.be.above(0); pm.expect(d[1].cantidadNotificacionesNoLeidas).to.be.above(0); });",
    guardar('t4a_noleidas_a', 'd[0].cantidadNotificacionesNoLeidas'),
    guardar('t4a_noleidas_b', 'd[1].cantidadNotificacionesNoLeidas'),
  ]),
  ...[['con un header no numerico', 'abc'], ['con el header de un comercio de otro Dueño', '{{comercio_n_id}}'], ['con un header inexistente', '99999999']].map(
    ([descripcion, valor]) =>
      misComercios(`mis-comercios ignora el header ${descripcion}`, 'token_comercio_m', [
        status(200),
        "pm.test('Devuelve igual A y B', () => pm.expect(pm.response.json().data.map((c) => c.id)).to.eql([" + entero('comercio_m_a_id') + ', ' + entero('comercio_m_b_id') + ']));',
      ], { [HEADER]: valor }),
  ),
  misComercios('mis-comercios: el Dueño N ve solo su unico comercio', 'token_comercio_n', [
    status(200),
    ...formaDeUnComercio,
    "const d = pm.response.json().data;",
    "pm.test('Es el comercio N y no aparece ninguno de M', () => pm.expect(d.map((c) => c.id)).to.eql([" + entero('comercio_n_id') + ']));',
    guardar('t4a_noleidas_n', 'd[0].cantidadNotificacionesNoLeidas'),
  ]),
  misComercios('[negativo] mis-comercios con token de Cliente: 403', 'token_cliente', [status(403)]),
  misComercios('[negativo] mis-comercios con token de Administrador: 403', 'token_admin', [status(403)]),
  misComercios('[negativo] mis-comercios sin token: 401', undefined, [status(401)]),
);

const todasSonDelComercio = (tipo, idExpr) =>
  `pm.test('Todas pertenecen al comercio pedido', () => pm.response.json().data.forEach((n) => { pm.expect(n.entidadTipo).to.eql('${tipo}'); pm.expect(n.entidadId).to.eql(${idExpr}); }));`;

items.push(
  listarNotificaciones('notificaciones con header A: solo las del comercio A', 'token_comercio_m', conComercio('comercio_m_a_id'), [
    status(200),
    "const d = pm.response.json().data;",
    "pm.test('Hay al menos la de alta', () => pm.expect(d.length).to.be.above(0));",
    todasSonDelComercio('COMERCIO', entero('comercio_m_a_id')),
    "pm.test('Las no leidas coinciden con el contador de mis-comercios', () => pm.expect(d.filter((n) => !n.leida).length).to.eql(" + entero('t4a_noleidas_a') + '));',
    guardar('t4a_ids_a', 'JSON.stringify(d.map((n) => n.id))'),
  ]),
  listarNotificaciones('notificaciones con header B: solo las del pedido de B', 'token_comercio_m', conComercio('comercio_m_b_id'), [
    status(200),
    "const d = pm.response.json().data;",
    "pm.test('Hay al menos la del pedido', () => pm.expect(d.length).to.be.above(0));",
    todasSonDelComercio('PEDIDO', entero('pedido_m_b_id')),
    "pm.test('Las no leidas coinciden con el contador de mis-comercios', () => pm.expect(d.filter((n) => !n.leida).length).to.eql(" + entero('t4a_noleidas_b') + '));',
  ]),
  listarNotificaciones('[negativo] notificaciones sin header: 400', 'token_comercio_m', {}, [
    status(400),
    "pm.test('El mensaje nombra al header', () => pm.expect(pm.response.json().mensaje).to.include('X-Comercio-Id'));",
  ]),
  listarNotificaciones('[negativo] notificaciones con header vacio: 400', 'token_comercio_m', { [HEADER]: '' }, [status(400)]),
  contador('contador con header A', 'token_comercio_m', conComercio('comercio_m_a_id'), [
    status(200),
    "pm.test('Es el de A', () => pm.expect(pm.response.json().data).to.eql(" + entero('t4a_noleidas_a') + '));',
  ]),
  contador('contador con header B', 'token_comercio_m', conComercio('comercio_m_b_id'), [
    status(200),
    "pm.test('Es el de B', () => pm.expect(pm.response.json().data).to.eql(" + entero('t4a_noleidas_b') + '));',
  ]),
  contador('[negativo] contador sin header: 400', 'token_comercio_m', {}, [status(400)]),
  contador('[negativo] contador con header vacio: 400', 'token_comercio_m', { [HEADER]: '' }, [status(400)]),
  listarNotificaciones('[negativo] notificaciones con el header de OTRO Dueño: 404', 'token_comercio_m', conComercio('comercio_n_id'), [
    status(404),
    guardar('t4a_body_404', 'JSON.stringify(pm.response.json())'),
  ]),
  listarNotificaciones('[negativo] notificaciones con un id inexistente: mismo 404, mismo cuerpo', 'token_comercio_m', { [HEADER]: '99999999' }, [
    status(404),
    "pm.test('Cuerpo identico al del comercio ajeno', () => pm.expect(JSON.stringify(pm.response.json())).to.eql(pm.environment.get('t4a_body_404')));",
  ]),
  listarNotificaciones('[negativo] notificaciones con un header no numerico: 400', 'token_comercio_m', { [HEADER]: 'abc' }, [
    status(400),
    "pm.test('El mensaje nombra al header', () => pm.expect(pm.response.json().mensaje).to.include('X-Comercio-Id'));",
  ]),
  contador('[negativo] contador con el header de OTRO Dueño: 404', 'token_comercio_m', conComercio('comercio_n_id'), [status(404)]),
  contador('[negativo] contador con un header no numerico: 400', 'token_comercio_m', { [HEADER]: 'abc' }, [status(400)]),
  listarNotificaciones('[Cliente] notificaciones sin header: todas las suyas', 'token_cliente', {}, [
    status(200),
    guardar('t4a_cantidad_cliente', 'pm.response.json().data.length'),
  ]),
  listarNotificaciones('[Cliente] notificaciones con un header no numerico: mismas, sin error', 'token_cliente', { [HEADER]: 'abc' }, [
    status(200),
    "pm.test('Mismas que sin header', () => pm.expect(pm.response.json().data.length).to.eql(" + entero('t4a_cantidad_cliente') + '));',
  ]),
  listarNotificaciones('[Cliente] notificaciones con el header de un comercio: mismas', 'token_cliente', conComercio('comercio_m_a_id'), [
    status(200),
    "pm.test('Mismas que sin header', () => pm.expect(pm.response.json().data.length).to.eql(" + entero('t4a_cantidad_cliente') + '));',
  ]),
  contador('[Cliente] contador con header de un comercio: sin error', 'token_cliente', conComercio('comercio_m_a_id'), [
    status(200),
    "pm.test('Es un numero', () => pm.expect(pm.response.json().data).to.be.a('number'));",
  ]),
);

items.push(
  leidas('PUT leidas del comercio B (con header A: el header se ignora)', `{{comercio_m_b_id}}`, 'token_comercio_m', conComercio('comercio_m_a_id'), [
    status(200),
    "pm.test('Marco todas las de B', () => pm.expect(pm.response.json().data).to.eql(" + entero('t4a_noleidas_b') + '));',
  ]),
  contador('contador de B queda en 0', 'token_comercio_m', conComercio('comercio_m_b_id'), [
    status(200),
    "pm.test('B en 0', () => pm.expect(pm.response.json().data).to.eql(0));",
  ]),
  contador('contador de A no cambio', 'token_comercio_m', conComercio('comercio_m_a_id'), [
    status(200),
    "pm.test('A igual que antes', () => pm.expect(pm.response.json().data).to.eql(" + entero('t4a_noleidas_a') + '));',
  ]),
  misComercios('mis-comercios: B en 0 y A sin cambios', 'token_comercio_m', [
    status(200),
    "const d = pm.response.json().data;",
    "pm.test('A conserva su contador y B quedo en 0', () => { pm.expect(d[0].cantidadNotificacionesNoLeidas).to.eql(" + entero('t4a_noleidas_a') + '); pm.expect(d[1].cantidadNotificacionesNoLeidas).to.eql(0); });',
  ]),
  leidas('PUT leidas del comercio B otra vez: idempotente, 200 y 0 marcadas', `{{comercio_m_b_id}}`, 'token_comercio_m', {}, [
    status(200),
    "pm.test('Nada que marcar', () => pm.expect(pm.response.json().data).to.eql(0));",
  ]),
  listarNotificaciones('las notificaciones de B siguen listadas, ahora leidas', 'token_comercio_m', conComercio('comercio_m_b_id'), [
    status(200),
    "pm.test('Estan todas leidas y no se borro ninguna', () => { const d = pm.response.json().data; pm.expect(d.length).to.be.above(0); pm.expect(d.every((n) => n.leida)).to.eql(true); });",
  ]),
  misComercios('mis-comercios del Dueño N: sus notificaciones no se tocaron', 'token_comercio_n', [
    status(200),
    "pm.test('Mismo contador que antes', () => pm.expect(pm.response.json().data[0].cantidadNotificacionesNoLeidas).to.eql(" + entero('t4a_noleidas_n') + '));',
  ]),
  leidas('[negativo] PUT leidas de un comercio de OTRO Dueño: 404', `{{comercio_n_id}}`, 'token_comercio_m', {}, [status(404)]),
  leidas('[negativo] PUT leidas de un comercio inexistente: 404', '99999999', 'token_comercio_m', {}, [status(404)]),
  misComercios('el intento sobre el comercio ajeno no cambio nada en N', 'token_comercio_n', [
    status(200),
    "pm.test('Mismo contador que antes', () => pm.expect(pm.response.json().data[0].cantidadNotificacionesNoLeidas).to.eql(" + entero('t4a_noleidas_n') + '));',
  ]),
  leidas('[negativo] PUT leidas con token de Cliente: 403', `{{comercio_m_a_id}}`, 'token_cliente', {}, [status(403)]),
  leidas('[negativo] PUT leidas con token de Administrador: 403', `{{comercio_m_a_id}}`, 'token_admin', {}, [status(403)]),
  leidas('[negativo] PUT leidas sin token: 401', `{{comercio_m_a_id}}`, undefined, {}, [status(401)]),
  leidas('PUT leidas del comercio A sin header', `{{comercio_m_a_id}}`, 'token_comercio_m', {}, [
    status(200),
    "pm.test('Marco todas las de A', () => pm.expect(pm.response.json().data).to.eql(" + entero('t4a_noleidas_a') + '));',
  ]),
  misComercios('mis-comercios: A y B en 0', 'token_comercio_m', [
    status(200),
    "pm.test('Ambos en 0', () => pm.expect(pm.response.json().data.map((c) => c.cantidadNotificacionesNoLeidas)).to.eql([0, 0]));",
  ]),
);

items.push(
  item('Clonar el comercio A como PENDIENTE (utilidad de test)', req('POST', '/test/comercios/{{comercio_m_a_id}}/clonar', {
    body: {},
    query: 'nombre=Multi Postman M Rechazado T4A&estado=PENDIENTE',
  }), [
    status(201),
    guardar('t4a_comercio_rech_id', 'pm.response.json().data'),
  ]),
  item('El Administrador rechaza el comercio clonado: el Dueño recibe su aviso', req('PUT', '/administrador/comercios/{{t4a_comercio_rech_id}}/resolver', {
    token: 'token_admin',
    body: { aprobar: false, motivo: 'Rechazo de prueba del tramo 4A' },
  }), [status(200)]),
  misComercios('mis-comercios con un comercio RECHAZADO: 3, el tercero no operativo y con 1 sin leer', 'token_comercio_m', [
    status(200),
    "const d = pm.response.json().data;",
    "pm.test('Son 3 y el tercero es el clon', () => { pm.expect(d.length).to.eql(3); pm.expect(d[2].id).to.eql(" + entero('t4a_comercio_rech_id') + '); });',
    "pm.test('RECHAZADO, no operativo y con su aviso sin leer', () => { pm.expect(d[2].estado).to.eql('RECHAZADO'); pm.expect(d[2].operativo).to.eql(false); pm.expect(d[2].cantidadNotificacionesNoLeidas).to.eql(1); });",
    "pm.test('A y B siguen operativos', () => pm.expect(d.slice(0, 2).map((c) => c.operativo)).to.eql([true, true]));",
  ]),
  listarNotificaciones('notificaciones con header del comercio RECHAZADO: su aviso de rechazo', 'token_comercio_m', conComercio('t4a_comercio_rech_id'), [
    status(200),
    todasSonDelComercio('COMERCIO', entero('t4a_comercio_rech_id')),
    "pm.test('Es el aviso de rechazo con el motivo', () => { const d = pm.response.json().data; pm.expect(d.length).to.eql(1); pm.expect(d[0].mensaje).to.include('Rechazo de prueba del tramo 4A'); });",
  ]),
  leidas('PUT leidas de un comercio RECHAZADO (no operativo): funciona', `{{t4a_comercio_rech_id}}`, 'token_comercio_m', {}, [
    status(200),
    "pm.test('Marco su unico aviso', () => pm.expect(pm.response.json().data).to.eql(1));",
  ]),
  leidas('PUT leidas del comercio RECHAZADO otra vez: idempotente', `{{t4a_comercio_rech_id}}`, 'token_comercio_m', {}, [
    status(200),
    "pm.test('Nada que marcar', () => pm.expect(pm.response.json().data).to.eql(0));",
  ]),
  misComercios('mis-comercios: los 3 en 0', 'token_comercio_m', [
    status(200),
    "pm.test('Todos en 0', () => pm.expect(pm.response.json().data.map((c) => c.cantidadNotificacionesNoLeidas)).to.eql([0, 0, 0]));",
  ]),
);

const collection = JSON.parse(fs.readFileSync(collectionPath, 'utf8'));

const evento = (listen, exec) => ({ listen, script: { type: 'text/javascript', exec } });
collection.event = [evento('prerequest', SCRIPT_PRE_REQUEST_COLECCION), evento('test', SCRIPT_TEST_COLECCION)];

for (const nombre of FOLDERS_QUE_MANEJAN_EL_HEADER) {
  const carpeta = collection.item.find((f) => f.name === nombre);
  if (!carpeta) throw new Error(`No existe la carpeta "${nombre}"`);
  carpeta.event = [evento('prerequest', SCRIPT_PRE_REQUEST_FOLDER_SIN_HEADER_AUTOMATICO)];
}

const folder = collection.item.find((f) => f.name === FOLDER_TRAMO1);
folder.item = folder.item.filter((i) => !i.name.startsWith(PREFIJO));

const EXENTOS_ACTUALIZADOS = [
  {
    original: '[exentos] Notificaciones ignora un header no numerico',
    nombre: '[exentos] Notificaciones del Dueño con un header no numerico: 400 (ya no es exento)',
    codigo: 400,
  },
  {
    original: '[exentos] Notificaciones ignora el header de otro Dueño',
    nombre: '[exentos] Notificaciones del Dueño con el header de otro Dueño: 404 (ya no es exento)',
    codigo: 404,
  },
  {
    original: '[exentos] Contador de notificaciones ignora un id inexistente',
    nombre: '[exentos] Contador de notificaciones del Dueño con un id inexistente: 404 (ya no es exento)',
    codigo: 404,
  },
];
let actualizados = 0;
for (const hijo of folder.item) {
  const regla = EXENTOS_ACTUALIZADOS.find((r) => r.original === hijo.name || r.nombre === hijo.name);
  if (!regla) continue;
  hijo.name = regla.nombre;
  hijo.event = [evento('test', [status(regla.codigo)])];
  actualizados += 1;
}
if (actualizados !== EXENTOS_ACTUALIZADOS.length) {
  throw new Error(`Se esperaban ${EXENTOS_ACTUALIZADOS.length} requests de notificaciones exentas y se actualizaron ${actualizados}`);
}

folder.item.push(...items);
fs.writeFileSync(collectionPath, JSON.stringify(collection, null, 2) + '\n', 'utf8');

const environment = JSON.parse(fs.readFileSync(environmentPath, 'utf8'));
const variables = ['t4a_noleidas_a', 't4a_noleidas_b', 't4a_noleidas_n', 't4a_ids_a', 't4a_body_404', 't4a_cantidad_cliente', 't4a_comercio_rech_id'];
const existentes = new Set(environment.values.map((v) => v.key));
for (const key of variables) {
  if (!existentes.has(key)) environment.values.push({ key, value: '', type: 'default', enabled: true });
}
fs.writeFileSync(environmentPath, JSON.stringify(environment, null, 2) + '\n', 'utf8');

console.log(`OK: ${items.length} requests [T4A] en la carpeta 49, 3 exentos actualizados, scripts centrales de coleccion y de las carpetas 49-51.`);
