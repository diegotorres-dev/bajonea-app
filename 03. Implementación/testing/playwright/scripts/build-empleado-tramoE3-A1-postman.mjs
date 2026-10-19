import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const collectionPath = path.resolve(__dirname, '../../../postman/Bajonea-MVP.postman_collection.json');
const environmentPath = path.resolve(__dirname, '../../../postman/Bajonea-Local.postman_environment.json');

const PREFIJO_CARPETA = '58 - ';
const NOMBRE_CARPETA = '58 - Pedidos y actividad E3 (A0: anular genera la nota de crédito, 409 por estado ya resuelto en todas las transiciones y fotos solo de su carpeta; A1: historial de ediciones y actividad del comercio)';
const MARCA = '[A1] ';

const a0 = (clave) => `a0_${clave}`;
const v = (clave) => `a1_${clave}`;

function req(method, urlPath, { body, rawBody, token, comercio, query } = {}) {
  const header = [];
  if (token) header.push({ key: 'Authorization', value: `Bearer {{${token}}}` });
  if (comercio !== undefined) header.push({ key: 'X-Comercio-Id', value: comercio });
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
  return { name: `${MARCA}${name}`, request, response: [], event };
}

const status = (codigo) => `pm.test('Status code es ${codigo}', () => pm.response.to.have.status(${codigo}));`;
const guardar = (variable, expr) => `pm.environment.set('${variable}', ${expr});`;
const entorno = (variable) => `pm.environment.get('${variable}')`;

const COM = `{{${a0('com')}}}`;
const TOKEN_DUENO = a0('d_token');
const TOKEN_CLIENTE = a0('c_token');
const PROD = `{{${a0('prod')}}}`;
const CAT = `{{${a0('cat')}}}`;
const ACTIVIDAD = '/comercios/equipo/actividad';

const actividad = (nombre, query, lineas, opciones = {}) =>
  item(nombre, req('GET', ACTIVIDAD, { token: opciones.token ?? TOKEN_DUENO, comercio: opciones.comercio ?? COM, query }), lineas);

const productoCuerpo = (nombre, precio, descripcion = 'Descripcion A1') =>
  `{"nombre": "${nombre}", "descripcion": "${descripcion}", "precio": ${precio}, "categoriaId": ${CAT}}`;

const buscarEnPagina = (condicion) => `const items = pm.response.json().data.items; const encontrado = items.find((i) => ${condicion});`;

const items = [];
const agregar = (...nuevos) => items.push(...nuevos);

agregar(
  actividad('Antes de editar nada: la actividad ya trae lo que hicieron las carpetas anteriores (pedidos con sus acciones del Cliente y del sistema, fotos y cierres)', 'limite=100', [
    status(200),
    "const d = pm.response.json().data;",
    "pm.test('Trae lineas de pedidos del Dueño', () => pm.expect(d.items.some((i) => i.fuente === 'PEDIDO' && i.actorRol === 'DUENO')).to.eql(true));",
    "pm.test('Trae tambien acciones del Cliente y del sistema sobre los pedidos (Pedido recibido) desde el bloque A2b', () => { const pedidos = d.items.filter((i) => i.fuente === 'PEDIDO'); pm.expect(pedidos.some((i) => i.actorRol === 'SISTEMA' && i.accionTexto === 'Pedido recibido')).to.eql(true); pm.expect(pedidos.every((i) => ['DUENO', 'EMPLEADO', 'CLIENTE', 'SISTEMA'].includes(i.actorRol))).to.eql(true); });",
    "pm.test('No trae el nacimiento del pedido ni su vencimiento por falta de pago', () => pm.expect(d.items.filter((i) => i.fuente === 'PEDIDO').some((i) => i.accion === 'PENDIENTE_PAGO')).to.eql(false));",
    "pm.test('Trae el alta de la imagen y el cambio de la foto del comercio de la carpeta anterior', () => { pm.expect(d.items.some((i) => i.accionTexto === 'Agregó una imagen a un producto')).to.eql(true); pm.expect(d.items.some((i) => i.entidadTipo === 'COMERCIO' && i.detalle === 'Editó: foto de perfil')).to.eql(true); });",
    "pm.test('Esta ordenada de la mas nueva a la mas vieja', () => { const fechas = d.items.map((i) => i.fechaHora); pm.expect(fechas).to.eql([...fechas].sort().reverse()); });",
    guardar(v('antes'), 'd.items.length'),
  ]),
  item('El Dueño crea un producto', req('POST', '/productos', { token: TOKEN_DUENO, comercio: COM, rawBody: productoCuerpo('Producto Actividad A1', 12000) }), [
    status(201),
    guardar(v('prod'), 'pm.response.json().data.id'),
  ]),
  item('El Dueño agrega una imagen al producto nuevo', req('POST', `/productos/{{${v('prod')}}}/imagenes`, {
    token: TOKEN_DUENO,
    comercio: COM,
    rawBody: `{"url": "https://res.cloudinary.com/{{${a0('cloud')}}}/image/upload/v1/productos/${COM}/{{${v('prod')}}}/a1-{{${a0('archivo')}}}.png", "orden": 0, "esPrincipal": true}`,
  }), [status(201), guardar(v('img'), 'pm.response.json().data.id')]),
  item('El Dueño edita el nombre y el precio', req('PUT', `/productos/{{${v('prod')}}}`, { token: TOKEN_DUENO, comercio: COM, rawBody: productoCuerpo('Producto Actividad A1 Editado', 13500) }), [status(200)]),
  item('El Dueño guarda lo mismo otra vez (sin cambios)', req('PUT', `/productos/{{${v('prod')}}}`, { token: TOKEN_DUENO, comercio: COM, rawBody: productoCuerpo('Producto Actividad A1 Editado', 13500) }), [status(200)]),
  item('El Dueño marca el producto como agotado', req('PATCH', `/productos/{{${v('prod')}}}/estado`, { token: TOKEN_DUENO, comercio: COM, rawBody: '{"estado": "AGOTADO"}' }), [status(200)]),
  item('El Dueño reordena la imagen al mismo orden (sin cambios)', req('PATCH', `/productos/{{${v('prod')}}}/imagenes/{{${v('img')}}}/orden`, { token: TOKEN_DUENO, comercio: COM, rawBody: '{"orden": 0}' }), [status(200)]),
  item('El Dueño elimina la imagen', req('DELETE', `/productos/{{${v('prod')}}}/imagenes/{{${v('img')}}}`, { token: TOKEN_DUENO, comercio: COM }), [status(200)]),
  item('El Dueño edita el perfil del comercio (teléfono)', req('PUT', '/comercios/perfil', {
    token: TOKEN_DUENO,
    comercio: COM,
    rawBody: '{"nombre": "Local Pedidos A0", "descripcion": "Comercio generado por la coleccion de Postman (pedidos, E3 A0)", "telefono": "+5492964555999", "aceptaDelivery": false, "aceptaRetiro": true}',
  }), [status(200)]),
  item('El Dueño agrega una red social', req('POST', '/comercios/redes-sociales', { token: TOKEN_DUENO, comercio: COM, rawBody: '{"tipo": "TIKTOK", "url": "tiktok.com/a1-actividad"}' }), [
    status(201),
    guardar(v('red'), 'pm.response.json().data.id'),
  ]),
  item('El Dueño edita el enlace de la red social', req('PUT', `/comercios/redes-sociales/{{${v('red')}}}`, { token: TOKEN_DUENO, comercio: COM, rawBody: '{"tipo": "TIKTOK", "url": "tiktok.com/a1-actividad-2"}' }), [status(200)]),
  item('El Dueño da de baja la red social', req('DELETE', `/comercios/redes-sociales/{{${v('red')}}}`, { token: TOKEN_DUENO, comercio: COM }), [status(200)]),
  item('El Dueño cierra el comercio', req('PUT', '/comercios/cerrar', { token: TOKEN_DUENO, comercio: COM, body: {} }), [status(200)]),
  item('El Dueño reabre el comercio', req('PUT', '/comercios/abrir', { token: TOKEN_DUENO, comercio: COM, body: {} }), [status(200)]),
  actividad('La actividad muestra todo lo anterior, una linea por cambio efectivo y sin valores', 'limite=100', [
    status(200),
    "const d = pm.response.json().data;",
    `const producto = d.items.filter((i) => i.entidadTipo === 'PRODUCTO' && i.entidadId === Number(${entorno(v('prod'))}));`,
    "pm.test('El producto tiene alta, una sola edicion (nombre y precio) y el cambio de estado', () => { pm.expect(producto.map((i) => i.accion).sort()).to.eql(['CAMBIAR_ESTADO', 'CREAR', 'EDITAR']); pm.expect(producto.find((i) => i.accion === 'EDITAR').detalle).to.eql('Editó: nombre, precio'); pm.expect(producto.find((i) => i.accion === 'CAMBIAR_ESTADO').detalle).to.eql('Pasó a agotado'); });",
    "pm.test('Todas las lineas del producto son del Dueño y llevan el nombre del producto en ese momento', () => { pm.expect(producto.every((i) => i.actorRol === 'DUENO' && i.actorRolTexto === 'Dueño' && i.actorNombre === 'Carlos Sanchez')).to.eql(true); pm.expect(producto.find((i) => i.accion === 'EDITAR').entidadNombre).to.eql('Producto Actividad A1 Editado'); });",
    `const imagen = d.items.filter((i) => i.entidadTipo === 'IMAGEN_PRODUCTO' && i.entidadId === Number(${entorno(v('img'))}));`,
    "pm.test('La imagen tiene alta y baja y ningun cambio de orden (reordenar al mismo orden no registra)', () => pm.expect(imagen.map((i) => i.accion).sort()).to.eql(['CREAR', 'ELIMINAR']));",
    "pm.test('El perfil registra solo el campo que cambio', () => { const perfil = d.items.find((i) => i.entidadTipo === 'COMERCIO' && i.detalle === 'Editó: teléfono'); pm.expect(perfil).to.exist; pm.expect(perfil.accionTexto).to.eql('Editó los datos del comercio'); });",
    "pm.test('Las redes sociales registran alta, edicion y baja', () => { const redes = d.items.filter((i) => i.entidadTipo === 'RED_SOCIAL' && i.entidadNombre === 'TikTok'); pm.expect(redes.map((i) => i.accion).sort()).to.eql(['CREAR', 'EDITAR', 'ELIMINAR']); });",
    "pm.test('El cierre y la reapertura del comercio aparecen como lineas de cierre', () => { const cierres = d.items.filter((i) => i.fuente === 'CIERRE'); pm.expect(cierres.some((i) => i.accionTexto === 'Cerró el comercio' && i.actorRolTexto === 'Dueño')).to.eql(true); pm.expect(cierres.some((i) => i.accionTexto === 'Reabrió el comercio')).to.eql(true); });",
    "pm.test('Ningun detalle guarda valores', () => pm.expect(JSON.stringify(d.items.map((i) => i.detalle))).to.not.include('13500'));",
    "pm.test('Sigue ordenada de la mas nueva a la mas vieja', () => { const fechas = d.items.map((i) => i.fechaHora); pm.expect(fechas).to.eql([...fechas].sort().reverse()); });",
    "pm.test('Cada linea tiene un id unico', () => pm.expect(new Set(d.items.map((i) => i.id)).size).to.eql(d.items.length));",
    guardar(v('despues'), 'd.items.length'),
  ]),
  item('Guardar lo mismo no agrego lineas: solo se sumaron las lineas esperadas', req('GET', ACTIVIDAD, { token: TOKEN_DUENO, comercio: COM, query: 'limite=100' }), [
    status(200),
    `const sumadas = pm.response.json().data.items.length - Number(${entorno(v('antes'))});`,
    "pm.test('Se sumaron 11 lineas: 3 del producto, 2 de la imagen, 1 del perfil, 3 de redes y 2 de cierre; las 2 acciones sin cambio no suman', () => pm.expect(sumadas).to.eql(11));",
  ]),
  actividad('Primera pagina de 3 lineas con cursor para seguir', 'limite=3', [
    status(200),
    "const d = pm.response.json().data;",
    "pm.test('Trae 3 lineas y avisa que hay mas con un cursor', () => { pm.expect(d.items).to.have.length(3); pm.expect(d.hayMas).to.eql(true); pm.expect(d.siguienteCursor).to.be.a('string').and.not.empty; });",
    guardar(v('cursor'), 'd.siguienteCursor'),
    guardar(v('pagina1'), "d.items.map((i) => i.id).join(',')"),
  ]),
  item('Segunda pagina con el cursor: sigue donde terminó la primera sin repetir', req('GET', ACTIVIDAD, { token: TOKEN_DUENO, comercio: COM, query: `limite=3&cursor={{${v('cursor')}}}` }), [
    status(200),
    "const d = pm.response.json().data;",
    `const primera = ${entorno(v('pagina1'))}.split(',');`,
    "pm.test('Trae 3 lineas distintas de las de la primera pagina', () => { pm.expect(d.items).to.have.length(3); pm.expect(d.items.some((i) => primera.includes(i.id))).to.eql(false); });",
    "pm.test('Son las que siguen en el orden total', () => { const fechas = d.items.map((i) => i.fechaHora); pm.expect(fechas).to.eql([...fechas].sort().reverse()); });",
  ]),
  actividad('El limite tiene tope de 100 (pedir 1000 devuelve a lo sumo 100)', 'limite=1000', [
    status(200),
    "pm.test('A lo sumo 100 lineas', () => pm.expect(pm.response.json().data.items.length).to.be.at.most(100));",
  ]),
  actividad('Un limite de 0 es 400', 'limite=0', [status(400)]),
  actividad('Un cursor que no se entiende es 400', 'cursor=basura', [status(400)]),
  item('Sin el header del comercio es 400', req('GET', ACTIVIDAD, { token: TOKEN_DUENO }), [status(400)]),
  item('Un comercio que no existe es el mismo 404 de siempre', req('GET', ACTIVIDAD, { token: TOKEN_DUENO, comercio: '999999999' }), [
    status(404),
    "pm.test('Mismo mensaje y mismo codigo estable', () => { const b = pm.response.json(); pm.expect(b.mensaje).to.eql('Comercio no encontrado'); pm.expect(b.data.codigo).to.eql('COMERCIO_NO_DISPONIBLE'); });",
  ]),
  item('Sin token es 401', req('GET', ACTIVIDAD, { comercio: COM }), [status(401)]),
  actividad('Un Cliente (aunque mande el header) recibe 403: la actividad es del Dueño', 'limite=10', [status(403)], { token: TOKEN_CLIENTE }),
);

const carpetaNueva = { name: NOMBRE_CARPETA, item: [] };
const collection = JSON.parse(fs.readFileSync(collectionPath, 'utf8'));
let idx = collection.item.findIndex((f) => f.name.startsWith(PREFIJO_CARPETA));
if (idx < 0) {
  console.error(`No existe la carpeta "${PREFIJO_CARPETA}...": correr antes build-pedidos-tramoE3-A0-postman.mjs`);
  process.exit(1);
}
const carpeta = collection.item[idx];
carpeta.name = carpetaNueva.name;
carpeta.item = carpeta.item.filter((x) => !x.name.startsWith(MARCA)).concat(items);
if (idx !== collection.item.length - 1) {
  collection.item.splice(idx, 1);
  collection.item.push(carpeta);
}
fs.writeFileSync(collectionPath, JSON.stringify(collection, null, 2) + '\n', 'utf8');

const environment = JSON.parse(fs.readFileSync(environmentPath, 'utf8'));
const claves = ['antes', 'despues', 'prod', 'img', 'red', 'cursor', 'pagina1'].map(v);
const existentes = new Set(environment.values.map((x) => x.key));
for (const key of claves) {
  if (!existentes.has(key)) environment.values.push({ key, value: '', type: 'default', enabled: true });
}
fs.writeFileSync(environmentPath, JSON.stringify(environment, null, 2) + '\n', 'utf8');

console.log(`OK: carpeta "${carpeta.name}" con ${carpeta.item.length} requests (${items.length} de A1).`);
