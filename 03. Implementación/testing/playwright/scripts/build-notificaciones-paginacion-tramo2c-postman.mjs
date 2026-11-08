import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const collectionPath = path.resolve(__dirname, '../../../postman/Bajonea-MVP.postman_collection.json');
const environmentPath = path.resolve(__dirname, '../../../postman/Bajonea-Local.postman_environment.json');

const PREFIJO_CARPETA = '93 - ';
const NOMBRE_CARPETA = '93 - Notificaciones Tramo 2C (paginacion por cursor y marcar todas las personales)';

const v = (clave) => `np2c_${clave}`;

function req(method, urlPath, { body, token, query } = {}) {
  const header = [];
  if (token) header.push({ key: 'Authorization', value: `Bearer {{${token}}}` });
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
const entorno = (variable) => `pm.environment.get('${variable}')`;
const prueba = (texto, cuerpo) => `pm.test(${JSON.stringify(texto)}, () => { ${cuerpo} });`;

function identidad(clave) {
  return [
    `const s = Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36);`,
    guardar(v(`${clave}_email`), `'np2c.${clave}.' + s + '@bajonea.test'`),
    guardar(v(`${clave}_usuario`), `('np2c${clave}' + s).slice(0, 20)`),
    guardar(v(`${clave}_password`), "'Pm9x' + Math.random().toString(36).slice(2, 12)"),
    guardar(v(`${clave}_dni`), 'String(30000000 + Math.floor(Math.random() * 60000000))'),
  ];
}

function clienteNuevo(clave, nombre) {
  return [
    item(
      `Registro ${nombre}`,
      req('POST', '/auth/registro/cliente', {
        body: {
          nombre,
          apellido: 'Avisos',
          dni: `{{${v(`${clave}_dni`)}}}`,
          fechaNacimiento: '1995-05-20',
          telefono: '+5492964551240',
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

const sembrar = (nombre, clave, cantidad) =>
  item(nombre, req('POST', `/test/usuarios/{{${v(`${clave}_id`)}}}/avisos-personales`, { query: `cantidad=${cantidad}`, body: {} }), [
    status(201),
    prueba(`Se sembraron ${cantidad}`, `pm.expect(pm.response.json().data.length).to.eql(${cantidad});`),
  ]);

const items = [];
const agregar = (...nuevos) => items.push(...nuevos);

agregar(
  ...clienteNuevo('a', 'Avisos A'),
  ...clienteNuevo('b', 'Avisos B'),
  sembrar('Siembra 45 avisos personales para A', 'a', 45),
  sembrar('Siembra 3 avisos personales para B', 'b', 3),

  item('Primera pagina: 20 avisos, el arreglo sigue siendo data y la cabecera trae el cursor', req('GET', '/notificaciones', { token: v('a_token') }), [
    status(200),
    prueba('Son 20 y el arreglo esta en data', 'const d = pm.response.json().data; pm.expect(Array.isArray(d)).to.eql(true); pm.expect(d.length).to.eql(20);'),
    prueba('Viene de la mas nueva a la mas vieja', 'const ids = pm.response.json().data.map((n) => n.id); pm.expect(ids).to.eql([...ids].sort((a, b) => b - a));'),
    prueba('La cabecera X-Siguiente-Cursor trae un cursor', "pm.expect(pm.response.headers.get('X-Siguiente-Cursor')).to.match(/^[0-9T:.-]+_[0-9]+$/);"),
    guardar(v('cursor1'), "pm.response.headers.get('X-Siguiente-Cursor')"),
    guardar(v('primer_id'), 'pm.response.json().data[0].id'),
  ]),
  item('Segunda pagina con el cursor: otros 20, sin repetir', req('GET', '/notificaciones', { token: v('a_token'), query: `cursor={{${v('cursor1')}}}` }), [
    status(200),
    prueba('Son 20 y ninguno es de la primera pagina', `const d = pm.response.json().data; pm.expect(d.length).to.eql(20); pm.expect(d.every((n) => n.id < Number(${entorno(v('primer_id'))}) - 19)).to.eql(true);`),
    prueba('Hay otra pagina', "pm.expect(pm.response.headers.get('X-Siguiente-Cursor')).to.be.a('string');"),
    guardar(v('cursor2'), "pm.response.headers.get('X-Siguiente-Cursor')"),
  ]),
  item('Tercera pagina: los 5 que quedan y sin cabecera de cursor', req('GET', '/notificaciones', { token: v('a_token'), query: `cursor={{${v('cursor2')}}}` }), [
    status(200),
    prueba('Son 5', 'pm.expect(pm.response.json().data.length).to.eql(5);'),
    prueba('No hay cabecera de cursor', "pm.expect(pm.response.headers.has('X-Siguiente-Cursor')).to.eql(false);"),
  ]),
  item('Con limite=7 devuelve 7 y deja cursor', req('GET', '/notificaciones', { token: v('a_token'), query: 'limite=7' }), [
    status(200),
    prueba('Son 7', 'pm.expect(pm.response.json().data.length).to.eql(7);'),
    prueba('Hay cursor', "pm.expect(pm.response.headers.has('X-Siguiente-Cursor')).to.eql(true);"),
  ]),
  item('Con limite=500 el tope es 50 y los 45 entran en una pagina', req('GET', '/notificaciones', { token: v('a_token'), query: 'limite=500' }), [
    status(200),
    prueba('Son 45 y no hay cursor', "pm.expect(pm.response.json().data.length).to.eql(45); pm.expect(pm.response.headers.has('X-Siguiente-Cursor')).to.eql(false);"),
  ]),
  item('Un limite menor que 1: 400', req('GET', '/notificaciones', { token: v('a_token'), query: 'limite=0' }), [status(400)]),
  item('Un cursor roto: 400', req('GET', '/notificaciones', { token: v('a_token'), query: 'cursor=basura' }), [status(400)]),
  item('Un cursor con id que no es numero: 400', req('GET', '/notificaciones', { token: v('a_token'), query: 'cursor=2026-01-01T00:00:00_x' }), [status(400)]),
  item('El contador cuenta todas, no solo la pagina', req('GET', '/notificaciones/no-leidas/contador', { token: v('a_token') }), [
    status(200),
    prueba('Son 45', 'pm.expect(pm.response.json().data).to.eql(45);'),
  ]),

  item('Marcar todas las personales de A: devuelve 45', req('PUT', '/notificaciones/personales/leidas', { token: v('a_token'), body: {} }), [
    status(200),
    prueba('Marco 45', 'pm.expect(pm.response.json().data).to.eql(45);'),
  ]),
  item('Repetirlo es idempotente: 0', req('PUT', '/notificaciones/personales/leidas', { token: v('a_token'), body: {} }), [
    status(200),
    prueba('No marco ninguna', 'pm.expect(pm.response.json().data).to.eql(0);'),
  ]),
  item('El contador de A queda en 0', req('GET', '/notificaciones/no-leidas/contador', { token: v('a_token') }), [
    status(200),
    prueba('Es 0', 'pm.expect(pm.response.json().data).to.eql(0);'),
  ]),
  item('Los avisos de B no se vieron afectados', req('GET', '/notificaciones/no-leidas/contador', { token: v('b_token') }), [
    status(200),
    prueba('Siguen las 3 sin leer', 'pm.expect(pm.response.json().data).to.eql(3);'),
  ]),
  item('Sin sesion: 401', req('PUT', '/notificaciones/personales/leidas', { body: {} }), [status(401)]),
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
const claves = [...new Set(JSON.stringify(items).match(/np2c_[a-z0-9_]+/g))];
const existentes = new Set(environment.values.map((x) => x.key));
for (const key of claves) {
  if (!existentes.has(key)) environment.values.push({ key, value: '', type: 'default', enabled: true });
}
fs.writeFileSync(environmentPath, JSON.stringify(environment, null, 2) + '\n', 'utf8');

console.log(`OK: carpeta "${NOMBRE_CARPETA.slice(0, 40)}..." con ${items.length} requests.`);
