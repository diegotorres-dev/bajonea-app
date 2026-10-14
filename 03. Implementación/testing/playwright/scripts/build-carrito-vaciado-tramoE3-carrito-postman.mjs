import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const collectionPath = path.resolve(__dirname, '../../../postman/Bajonea-MVP.postman_collection.json');
const environmentPath = path.resolve(__dirname, '../../../postman/Bajonea-Local.postman_environment.json');

const PREFIJO_CARPETA = '63 - ';
const NOMBRE_CARPETA = '63 - Carrito sin fallos por filas ya borradas E3 carrito (vaciar, quitar y cambiar cantidad repetidos, pago aprobado con varios pedidos, carrito de otro comercio intacto, producto agotado)';

const v = (clave) => `cv_${clave}`;

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
  return { name, request, response: [], event };
}

const status = (codigo) => `pm.test('Status code es ${codigo}', () => pm.response.to.have.status(${codigo}));`;
const guardar = (variable, expr) => `pm.environment.set('${variable}', ${expr});`;

function identidad(clave) {
  return [
    `const s = Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36);`,
    guardar(v(`${clave}_email`), `'cv.${clave}.' + s + '@bajonea.test'`),
    guardar(v(`${clave}_usuario`), `('cv${clave}' + s).slice(0, 20)`),
    guardar(v(`${clave}_password`), "'Pm9x' + Math.random().toString(36).slice(2, 12)"),
    guardar(v(`${clave}_dni`), 'String(30000000 + Math.floor(Math.random() * 60000000))'),
  ];
}

const datosDueno = [
  'const mult = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];',
  'let cuit = null;',
  'while (cuit === null) {',
  "  const base = '30' + String(Math.floor(10000000 + Math.random() * 89999999));",
  '  let suma = 0;',
  '  for (let i = 0; i < 10; i += 1) suma += Number(base[i]) * mult[i];',
  '  let dv = 11 - (suma % 11);',
  '  if (dv === 11) dv = 0;',
  '  if (dv !== 10) cuit = base + dv;',
  '}',
  guardar(v('cuit_tmp'), 'cuit'),
  guardar(v('dni_rep_tmp'), 'String(30000000 + Math.floor(Math.random() * 60000000))'),
];

const horariosTodosLosDias = ['LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO', 'DOMINGO'].map((diaSemana) => ({
  diaSemana,
  horaApertura: '00:00:00',
  horaCierre: '23:59:00',
}));

const COM = `{{${v('com')}}}`;
const CLON = `{{${v('clon')}}}`;
const TOKEN_DUENO = v('d_token');
const TOKEN_CLIENTE = v('c_token');
const CAT = `{{${v('cat')}}}`;
const P = (clave) => `{{${v(`prod_${clave}`)}}}`;
const PED = (clave) => `{{${v(`ped_${clave}`)}}}`;

const items = [];
const agregar = (...nuevos) => items.push(...nuevos);

const productoCuerpo = (nombre) => `{"nombre": "${nombre}", "descripcion": "Producto del carrito", "precio": 1500, "categoriaId": ${CAT}}`;

const crearProductoDelDueno = (clave, nombre, comercio = COM) =>
  item(`El Dueño crea el producto ${nombre}`, req('POST', '/productos', { token: TOKEN_DUENO, comercio, rawBody: productoCuerpo(nombre) }), [
    status(201),
    guardar(v(`prod_${clave}`), 'pm.response.json().data.id'),
  ]);

const verCarrito = (nombre, comprobaciones = []) =>
  item(nombre, req('GET', '/carrito', { token: TOKEN_CLIENTE }), [status(200), 'const carrito = pm.response.json().data;', ...comprobaciones]);

const items_ = (cantidad) => `pm.test('El carrito tiene ${cantidad} items', () => pm.expect(carrito.items.length).to.eql(${cantidad}));`;
const sinComercio = "pm.test('El carrito no tiene comercio', () => pm.expect(carrito.comercioId).to.eql(null));";
const conComercio = (variable) => `pm.test('El carrito es del comercio esperado', () => pm.expect(carrito.comercioId).to.eql(Number(pm.environment.get('${variable}'))));`;

const agregarAlCarrito = (nombre, clave, codigo = 201, comprobaciones = []) =>
  item(nombre, req('POST', '/carrito/items', { token: TOKEN_CLIENTE, rawBody: `{"productoId": ${P(clave)}, "cantidad": 1}` }), [status(codigo), ...comprobaciones]);

const confirmarPedido = (clave) =>
  item(`El Cliente confirma el pedido ${clave} (retiro en el local); el carrito no se vacia todavia`, req('POST', '/pedidos/cliente', { token: TOKEN_CLIENTE, rawBody: '{"tipoEntrega": "RETIRO", "direccionId": null}' }), [
    status(201),
    guardar(v(`ped_${clave}`), 'pm.response.json().data.id'),
  ]);

const pagar = (nombre, clave) =>
  item(nombre, req('PUT', `/test/pedidos/${PED(clave)}/pago-aprobado`, { body: {}, query: 'registrarPago=true' }), [status(200)]);

const vaciar = (nombre, codigo = 200) => item(nombre, req('DELETE', '/carrito', { token: TOKEN_CLIENTE }), [status(codigo)]);

agregar(
  item('Login Administrador (sesion propia de esta carpeta)', req('POST', '/auth/login', { body: { nombreUsuario: '{{admin_usuario}}', password: '{{admin_password}}' } }), [
    status(200),
    guardar('token_admin', 'pm.response.json().data.token'),
  ]),
  item(
    'Registro Dueño',
    req('POST', '/auth/registro/comercio', {
      body: {
        razonSocial: 'Carrito E3 SRL',
        cuit: `{{${v('cuit_tmp')}}}`,
        condicionIva: 'RESPONSABLE_INSCRIPTO',
        tipoSociedad: 'SRL',
        domicilioFiscal: 'Direccion fiscal carrito 100',
        fechaInicioActividades: '2020-01-01',
        nombre: 'Local Carrito E3',
        descripcion: 'Comercio generado por la coleccion de Postman (carrito sin fallos por filas ya borradas)',
        telefono: '+5492964555447',
        emailContacto: `{{${v('d_email')}}}`,
        tipoComercio: 'RESTAURANTE',
        aceptaDelivery: true,
        aceptaRetiro: true,
        nombreUsuario: `{{${v('d_usuario')}}}`,
        email: `{{${v('d_email')}}}`,
        password: `{{${v('d_password')}}}`,
        direccion: { calle: 'Belgrano', numero: '803', pisoDepto: null, codigoPostal: '9420', localidadId: '{{localidad_id}}', principal: false },
        horarios: horariosTodosLosDias,
        nombreRepresentante: 'Carlos',
        apellidoRepresentante: 'Sanchez',
        dniRepresentante: `{{${v('dni_rep_tmp')}}}`,
        telefonoRepresentante: '+5492964701106',
        fechaNacimientoRepresentante: '1988-04-04',
        fotoPerfilUrl: 'https://res.cloudinary.com/demo/image/upload/postman-carrito-e3.jpg',
        redesSociales: [{ tipo: 'INSTAGRAM', url: 'instagram.com/carritoe3' }],
      },
    }),
    [status(201)],
    [...identidad('d'), ...datosDueno],
  ),
  item('Bypass test - codigo de verificacion Dueño', req('GET', '/test/token-verificacion', { query: `email={{${v('d_email')}}}` }), [
    status(200),
    guardar(v('d_codigo'), 'pm.response.json().data'),
  ]),
  item('Verificar cuenta Dueño', req('POST', '/auth/verificar', { body: { email: `{{${v('d_email')}}}`, codigo: `{{${v('d_codigo')}}}` } }), [status(200)]),
  item('Login Dueño', req('POST', '/auth/login', { body: { nombreUsuario: `{{${v('d_usuario')}}}`, password: `{{${v('d_password')}}}` } }), [
    status(200),
    guardar(TOKEN_DUENO, 'pm.response.json().data.token'),
  ]),
  item('Administrador busca el comercio pendiente del Dueño', req('GET', '/administrador/comercios/pendientes', { token: 'token_admin' }), [
    status(200),
    `const c = pm.response.json().data.find((x) => x.emailCuenta === pm.environment.get('${v('d_email')}').toLowerCase());`,
    "pm.test('El comercio del Dueño esta pendiente', () => pm.expect(c).to.exist);",
    guardar(v('com'), 'c.id'),
  ]),
  item('Administrador aprueba el comercio', req('PUT', `/administrador/comercios/${COM}/resolver`, { token: 'token_admin', body: { aprobar: true } }), [status(200)]),
  item('Atajo de test: el comercio pasa a APTO_VENTA sin cuenta de Mercado Pago vinculada', req('PUT', `/test/comercios/${COM}/apto-venta`, { body: {} }), [status(200)]),
  item(
    'Administrador crea la categoria del producto',
    req('POST', '/categorias', { token: 'token_admin', rawBody: `{"nombre": "{{${v('cat_nombre')}}}"}` }),
    [status(201), guardar(v('cat'), 'pm.response.json().data.id')],
    [guardar(v('cat_nombre'), "'Cat Carrito E3 ' + Date.now().toString(36)")],
  ),
  crearProductoDelDueno('a', 'Producto Carrito A'),
  crearProductoDelDueno('b', 'Producto Carrito B'),
  crearProductoDelDueno('c', 'Producto Carrito C'),
  item('Segundo comercio del Dueño (clon en APTO_VENTA)', req('POST', `/test/comercios/${COM}/clonar`, { body: {}, query: 'nombre=Clon Carrito E3&estado=APTO_VENTA' }), [
    status(201),
    guardar(v('clon'), 'pm.response.json().data'),
  ]),
  crearProductoDelDueno('d', 'Producto Carrito del otro comercio', CLON),
  item(
    'Registro Cliente',
    req('POST', '/auth/registro/cliente', {
      body: {
        nombre: 'Carla',
        apellido: 'Carrito',
        dni: `{{${v('c_dni')}}}`,
        fechaNacimiento: '1995-05-20',
        telefono: '+5492964551237',
        nombreUsuario: `{{${v('c_usuario')}}}`,
        email: `{{${v('c_email')}}}`,
        password: `{{${v('c_password')}}}`,
        aceptaTerminos: true,
        direccion: { calle: 'Calle Siempre Viva', numero: '124', pisoDepto: null, codigoPostal: '9420', localidadId: '{{localidad_id}}', principal: true },
      },
    }),
    [status(201)],
    identidad('c'),
  ),
  item('Bypass test - codigo de verificacion Cliente', req('GET', '/test/token-verificacion', { query: `email={{${v('c_email')}}}` }), [
    status(200),
    guardar(v('c_codigo'), 'pm.response.json().data'),
  ]),
  item('Verificar cuenta Cliente', req('POST', '/auth/verificar', { body: { email: `{{${v('c_email')}}}`, codigo: `{{${v('c_codigo')}}}` } }), [status(200)]),
  item('Login Cliente', req('POST', '/auth/login', { body: { nombreUsuario: `{{${v('c_usuario')}}}`, password: `{{${v('c_password')}}}` } }), [
    status(200),
    guardar(TOKEN_CLIENTE, 'pm.response.json().data.token'),
  ]),

  verCarrito('Primer acceso: el carrito se crea vacio y sin comercio', [items_(0), sinComercio]),
  agregarAlCarrito('Agrega el producto A', 'a', 201, [
    "pm.test('Trae el item', () => pm.expect(pm.response.json().data.items.length).to.eql(1));",
    guardar(v('item_a'), 'pm.response.json().data.items[0].id'),
  ]),
  agregarAlCarrito('Agrega el producto B', 'b', 201, [
    guardar(v('item_b'), "pm.response.json().data.items.find((i) => i.productoId === Number(pm.environment.get('cv_prod_b'))).id"),
  ]),
  item('Cambia la cantidad del item A', req('PUT', `/carrito/items/{{${v('item_a')}}}`, { token: TOKEN_CLIENTE, rawBody: '{"cantidad": 3}' }), [
    status(200),
    "pm.test('La cantidad cambio', () => pm.expect(pm.response.json().data.items.find((i) => i.id === Number(pm.environment.get('cv_item_a'))).cantidad).to.eql(3));",
  ]),
  item('Cambiar la cantidad de un item que no existe es 404', req('PUT', '/carrito/items/99999999', { token: TOKEN_CLIENTE, rawBody: '{"cantidad": 2}' }), [
    status(404),
    "pm.test('Item no encontrado', () => pm.expect(pm.response.json().mensaje).to.eql('Ítem no encontrado'));",
  ]),
  item('Quita el item A', req('DELETE', `/carrito/items/{{${v('item_a')}}}`, { token: TOKEN_CLIENTE }), [
    status(200),
    "pm.test('Queda un item', () => pm.expect(pm.response.json().data.items.length).to.eql(1));",
  ]),
  item('Quitar otra vez el mismo item es 404 con su texto', req('DELETE', `/carrito/items/{{${v('item_a')}}}`, { token: TOKEN_CLIENTE }), [
    status(404),
    "pm.test('Item no encontrado', () => pm.expect(pm.response.json().mensaje).to.eql('Ítem no encontrado'));",
  ]),
  item('Cambiar la cantidad del item ya quitado es 404', req('PUT', `/carrito/items/{{${v('item_a')}}}`, { token: TOKEN_CLIENTE, rawBody: '{"cantidad": 2}' }), [status(404)]),
  item('Quita el ultimo item: el carrito queda vacio y sin comercio', req('DELETE', `/carrito/items/{{${v('item_b')}}}`, { token: TOKEN_CLIENTE }), [
    status(200),
    'const carrito = pm.response.json().data;',
    items_(0),
    sinComercio,
  ]),
  vaciar('Vaciar un carrito vacio es 200'),
  vaciar('Vaciar otra vez sigue siendo 200'),
  agregarAlCarrito('Agregar un producto que no existe es 404', 'inexistente', 404),
);

items[items.length - 1].request.body.raw = '{"productoId": 99999999, "cantidad": 1}';

agregar(
  item('Rol: el Dueño no puede ver el carrito (403)', req('GET', '/carrito', { token: TOKEN_DUENO }), [status(403)]),

  agregarAlCarrito('Pago: agrega A al carrito', 'a'),
  agregarAlCarrito('Pago: agrega B al carrito', 'b'),
  confirmarPedido('1'),
  confirmarPedido('2'),
  verCarrito('Pago: los dos pedidos pendientes no vacian el carrito', [items_(2), conComercio(v('com'))]),
  pagar('Pago: el primer pedido se paga y se confirma', '1'),
  verCarrito('Pago: el carrito queda vacio y sin comercio', [items_(0), sinComercio]),
  pagar('Pago: el segundo pedido se paga igual, sin fallar con el carrito ya vacio', '2'),
  verCarrito('Pago: el carrito sigue vacio', [items_(0), sinComercio]),

  agregarAlCarrito('Otro comercio: agrega A al carrito', 'a'),
  confirmarPedido('3'),
  vaciar('Otro comercio: el Cliente vacia el carrito'),
  agregarAlCarrito('Otro comercio: agrega un producto del segundo comercio', 'd', 201, [conComercio(v('clon')).replace('carrito.comercioId', 'pm.response.json().data.comercioId')]),
  pagar('Otro comercio: el pedido del primer comercio se paga', '3'),
  verCarrito('Otro comercio: el carrito del segundo comercio sigue intacto', [items_(1), conComercio(v('clon'))]),
  vaciar('Otro comercio: limpia el carrito'),

  agregarAlCarrito('Agotado: agrega A', 'a'),
  agregarAlCarrito('Agotado: agrega C', 'c'),
  item('Agotado: el Dueño marca C como agotado', req('PATCH', `/productos/${P('c')}/estado`, { token: TOKEN_DUENO, comercio: COM, rawBody: '{"estado": "AGOTADO"}' }), [status(200)]),
  verCarrito('Agotado: el producto salio del carrito y el otro sigue', [
    items_(1),
    conComercio(v('com')),
    "pm.test('Quedo A', () => pm.expect(carrito.items[0].productoId).to.eql(Number(pm.environment.get('cv_prod_a'))));",
  ]),
  item('Agotado: el Cliente recibio el aviso de producto removido', req('GET', '/notificaciones', { token: TOKEN_CLIENTE }), [
    status(200),
    "const avisos = pm.response.json().data.filter((n) => n.mensaje.includes('fue eliminado de tu carrito'));",
    "pm.test('Hay un solo aviso', () => pm.expect(avisos.length).to.eql(1));",
  ]),
  agregarAlCarrito('Agotado: agregar el producto agotado es 409', 'c', 409, [
    "pm.test('Mensaje', () => pm.expect(pm.response.json().mensaje).to.eql('El producto no está disponible'));",
  ]),
  vaciar('Agotado: limpia el carrito'),

  agregarAlCarrito('Agotado de uno solo: agrega B', 'b'),
  item('Agotado de uno solo: el Dueño marca B como agotado', req('PATCH', `/productos/${P('b')}/estado`, { token: TOKEN_DUENO, comercio: COM, rawBody: '{"estado": "AGOTADO"}' }), [status(200)]),
  verCarrito('Agotado de uno solo: el carrito queda vacio y sin comercio', [items_(0), sinComercio]),
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
const claves = ['com', 'clon', 'cat', 'cat_nombre', 'cuit_tmp', 'dni_rep_tmp',
  'd_email', 'd_usuario', 'd_password', 'd_dni', 'd_codigo', 'd_token',
  'c_email', 'c_usuario', 'c_password', 'c_dni', 'c_codigo', 'c_token',
  'prod_a', 'prod_b', 'prod_c', 'prod_d', 'item_a', 'item_b', 'ped_1', 'ped_2', 'ped_3'].map(v);
const existentes = new Set(environment.values.map((x) => x.key));
for (const key of claves) {
  if (!existentes.has(key)) environment.values.push({ key, value: '', type: 'default', enabled: true });
}
fs.writeFileSync(environmentPath, JSON.stringify(environment, null, 2) + '\n', 'utf8');

console.log(`OK: carpeta "${NOMBRE_CARPETA.slice(0, 40)}..." con ${items.length} requests.`);
