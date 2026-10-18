import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const collectionPath = path.resolve(__dirname, '../../../postman/Bajonea-MVP.postman_collection.json');
const environmentPath = path.resolve(__dirname, '../../../postman/Bajonea-Local.postman_environment.json');

const PREFIJO_CARPETA = '69 - ';
const NOMBRE_CARPETA = '69 - Listado general de comercios del Administrador (todos los estados, sin filtro, equipo de cada uno)';

const ESTADOS = [
  'PENDIENTE',
  'APROBADO',
  'APTO_VENTA',
  'RECHAZADO',
  'RECHAZO_DEFINITIVO',
  'SUSPENDIDO',
  'CERRADO_TEMPORALMENTE',
  'INACTIVO',
];
const idDe = (n) => `lc_${n}_id`;
const nombreDe = (n) => `lc_${n}_nombre`;

function req(method, urlPath, { token, query } = {}) {
  const header = [];
  if (token) header.push({ key: 'Authorization', value: `Bearer {{${token}}}` });
  const segments = urlPath.replace(/^\//, '').split('/');
  const raw = `{{base_url}}/${segments.join('/')}${query ? `?${query}` : ''}`;
  const url = { raw, host: ['{{base_url}}'], path: segments };
  if (query) {
    url.query = query.split('&').map((par) => {
      const [key, ...resto] = par.split('=');
      return { key, value: resto.join('=') };
    });
  }
  return { method, header, url };
}

function item(name, request, testLines = [], preLines = []) {
  const event = [];
  if (preLines.length) event.push({ listen: 'prerequest', script: { type: 'text/javascript', exec: preLines } });
  if (testLines.length) event.push({ listen: 'test', script: { type: 'text/javascript', exec: testLines } });
  return { name, request, response: [], event };
}

const status = (codigo) => `pm.test('Status code es ${codigo}', () => pm.response.to.have.status(${codigo}));`;
const items = [];

ESTADOS.forEach((estado, indice) => {
  const n = indice + 1;
  items.push(
    item(
      `Clonar un comercio en estado ${estado}`,
      req('POST', '/test/comercios/{{comercio_a_id}}/clonar', { query: `nombre={{${nombreDe(n)}}}&estado=${estado}` }),
      [status(201), `pm.environment.set('${idDe(n)}', pm.response.json().data);`],
      [`pm.environment.set('${nombreDe(n)}', 'Lista Newman ${n} ' + Date.now());`],
    ),
  );
});

const esperados = ESTADOS.map((estado, indice) => `[${JSON.stringify(estado)}, Number(pm.environment.get('${idDe(indice + 1)}'))]`).join(', ');

items.push(
  item('El listado general trae un comercio por cada estado, con su estado', req('GET', '/administrador/comercios', { token: 'token_admin' }), [
    status(200),
    'const lista = pm.response.json().data;',
    `const esperados = [${esperados}];`,
    "pm.test('Los ocho estados posibles estan cubiertos', () => pm.expect(esperados.length).to.eql(8));",
    "esperados.forEach(([estado, id]) => pm.test('Aparece el comercio ' + estado, () => { const c = lista.find((x) => x.id === id); pm.expect(c, 'falta ' + estado).to.exist; pm.expect(c.estado).to.eql(estado); }));",
    "pm.test('Viene ordenado por id ascendente', () => { const ids = lista.map((c) => c.id); pm.expect(ids).to.eql([...ids].sort((a, b) => a - b)); });",
    "pm.test('Sin datos de Dueño ni de otros comercios', () => esperados.forEach(([estado, id]) => { const c = lista.find((x) => x.id === id); pm.expect(c.duenoId).to.eql(null); pm.expect(c.esAdicional).to.eql(false); pm.expect(c.otrosComercios).to.eql([]); }));",
    "pm.test('Trae al menos tantos comercios como los de cada estado listado antes', () => pm.expect(lista.length).to.be.at.least(8));",
  ]),
  ...ESTADOS.map((estado, indice) =>
    item(
      `Ver equipo: el Administrador abre el equipo de un comercio ${estado}`,
      req('GET', `/administrador/comercios/{{${idDe(indice + 1)}}}/equipo`, { token: 'token_admin' }),
      [status(200), "pm.test('Trae la lista de miembros', () => pm.expect(pm.response.json().data.miembros).to.be.an('array'));"],
    ),
  ),
  item('Las solicitudes siguen mostrando solo los pendientes', req('GET', '/administrador/comercios/pendientes', { token: 'token_admin' }), [
    status(200),
    'const lista = pm.response.json().data;',
    `const otros = [${ESTADOS.slice(1).map((_, i) => `Number(pm.environment.get('${idDe(i + 2)}'))`).join(', ')}];`,
    "pm.test('Incluye al comercio PENDIENTE', () => pm.expect(lista.map((c) => c.id)).to.include(Number(pm.environment.get('lc_1_id'))));",
    "pm.test('No incluye a los de otro estado', () => otros.forEach((id) => pm.expect(lista.map((c) => c.id)).to.not.include(id)));",
    "pm.test('Todos estan en estado PENDIENTE', () => lista.forEach((c) => pm.expect(c.estado).to.eql('PENDIENTE')));",
  ]),
  item('Seguridad: sin sesion el listado general da 401', req('GET', '/administrador/comercios'), [status(401)]),
  item('Seguridad: un Cliente recibe 403 en el listado general', req('GET', '/administrador/comercios', { token: 'token_cliente' }), [status(403)]),
  item('Seguridad: un Comercio recibe 403 en el listado general', req('GET', '/administrador/comercios', { token: 'token_comercio' }), [status(403)]),
);

const carpeta = { name: NOMBRE_CARPETA, item: items };
const collection = JSON.parse(fs.readFileSync(collectionPath, 'utf8'));
const idx = collection.item.findIndex((f) => f.name.startsWith(PREFIJO_CARPETA));
if (idx >= 0) {
  collection.item.splice(idx, 1);
}
collection.item.push(carpeta);
fs.writeFileSync(collectionPath, JSON.stringify(collection, null, 2) + '\n', 'utf8');

const environment = JSON.parse(fs.readFileSync(environmentPath, 'utf8'));
const claves = ESTADOS.flatMap((_, i) => [idDe(i + 1), nombreDe(i + 1)]);
const existentes = new Set(environment.values.map((x) => x.key));
for (const key of claves) {
  if (!existentes.has(key)) environment.values.push({ key, value: '', type: 'default', enabled: true });
}
fs.writeFileSync(environmentPath, JSON.stringify(environment, null, 2) + '\n', 'utf8');

console.log(`OK: carpeta "${NOMBRE_CARPETA.slice(0, 40)}..." con ${items.length} requests.`);
