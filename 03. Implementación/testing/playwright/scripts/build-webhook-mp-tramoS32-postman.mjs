import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const collectionPath = path.resolve(__dirname, '../../../postman/Bajonea-MVP.postman_collection.json');
const environmentPath = path.resolve(__dirname, '../../../postman/Bajonea-Local.postman_environment.json');

const PREFIJO_CARPETA = '87 - ';
const NOMBRE_CARPETA = '87 - Webhook de Mercado Pago sin llamadas dentro de transacciones S3.2 (pago repetido, fuera de orden, de otro pedido, tardio con reembolso unico, sincronizacion; requiere el Mercado Pago simulado de scripts/mp-simulado.mjs y el backend con MERCADOPAGO_API_BASE_URL)';

const v = (clave) => `wh_${clave}`;

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
        aceptaTerminos: true,
        razonSocial: 'Webhook S32 SRL',
        cuit: `{{${v('cuit_tmp')}}}`,
        condicionIva: 'RESPONSABLE_INSCRIPTO',
        tipoSociedad: 'SRL',
        domicilioFiscal: 'Direccion fiscal webhook 100',
        fechaInicioActividades: '2020-01-01',
        nombre: 'Local Webhook S32',
        descripcion: 'Comercio generado por la coleccion de Postman (webhook de Mercado Pago sin llamadas en transacciones)',
        telefono: '+5492964555447',
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
        fotoPerfilUrl: 'https://res.cloudinary.com/demo/image/upload/postman-webhook-s32.jpg',
        redesSociales: [{ tipo: 'INSTAGRAM', url: 'instagram.com/webhooks32' }],
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
    guardar(v('d_id'), 'pm.response.json().data.usuario.id'),
  ]),
  item('Administrador busca el comercio pendiente del Dueño', req('GET', '/administrador/comercios/pendientes', { token: 'token_admin' }), [
    status(200),
    `const c = pm.response.json().data.find((x) => x.emailCuenta === pm.environment.get('${v('d_email')}').toLowerCase());`,
    "pm.test('El comercio del Dueño esta pendiente', () => pm.expect(c).to.exist);",
    guardar(v('com'), 'c.id'),
  ]),
  item('Administrador aprueba el comercio', req('PUT', `/administrador/comercios/${COM}/resolver`, { token: 'token_admin', body: { aprobar: true } }), [status(200)]),
  item('Atajo de test: el Dueño vincula una cuenta de Mercado Pago simulada y el comercio pasa a APTO_VENTA', req('POST', `/test/duenos/{{${v('d_id')}}}/mercadopago-simulada`, { body: {} }), [status(200)]),
  item(
    'Administrador crea la categoria del producto',
    req('POST', '/categorias', { token: 'token_admin', rawBody: `{"nombre": "{{${v('cat_nombre')}}}"}` }),
    [status(201), guardar(v('cat'), 'pm.response.json().data.id')],
    [guardar(v('cat_nombre'), "'Cat Carrito E3 ' + Date.now().toString(36)")],
  ),
  crearProductoDelDueno('a', 'Producto Carrito A'),
  item(
    'Registro Cliente',
    req('POST', '/auth/registro/cliente', {
      body: {
        nombre: 'Carla',
        apellido: 'Webhook',
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

);

const MP = '{{mp_simulado_url}}';

function reqMp(method, urlPath, query) {
  const segments = urlPath.replace(/^\//, '').split('/');
  const url = { raw: `${MP}/${segments.join('/')}${query ? `?${query}` : ''}`, host: [MP], path: segments };
  if (query) {
    url.query = query.split('&').map((par) => {
      const [key, ...resto] = par.split('=');
      return { key, value: resto.join('=') };
    });
  }
  return { method, header: [], url };
}

const IDP = (clave) => `{{${v(`idpago_${clave}`)}}}`;

const estadoDelMercadoPago = (nombre, variable) =>
  item(nombre, reqMp('GET', '/__control/estado'), [status(200), guardar(v(variable), 'pm.response.json().reembolsos')]);

const estadoDelPagoEnMercadoPago = (nombre, clave, estado) =>
  item(nombre, reqMp('PUT', `/__control/pago/${PED(clave)}`, `estado=${estado}`), [status(200)]);

const nuevoPedido = (clave) => [
  item(`Pedido ${clave}: el Cliente agrega el producto al carrito`, req('POST', '/carrito/items', { token: TOKEN_CLIENTE, rawBody: `{"productoId": ${P('a')}, "cantidad": 1}` }), [status(201)]),
  item(`Pedido ${clave}: el Cliente confirma el pedido (retiro en el local)`, req('POST', '/pedidos/cliente', { token: TOKEN_CLIENTE, rawBody: '{"tipoEntrega": "RETIRO", "direccionId": null}' }), [
    status(201),
    guardar(v(`ped_${clave}`), 'pm.response.json().data.id'),
    guardar(v(`idpago_${clave}`), '100000 + pm.response.json().data.id'),
  ]),
  item(`Pedido ${clave}: "Ir a pagar" crea la preferencia en Mercado Pago`, req('POST', `/pedidos/cliente/${PED(clave)}/pago`, { token: TOKEN_CLIENTE }), [status(200)]),
];

const webhook = (nombre, { pedido, pago, tipo = 'payment' }, comprobaciones = []) =>
  item(nombre, req('POST', '/webhooks/mercadopago', { query: `pedidoId=${pedido}&data.id=${pago}&type=${tipo}` }), [status(200), ...comprobaciones]);

const verPedido = (nombre, clave, comprobaciones = []) =>
  item(nombre, req('GET', '/pedidos/cliente', { token: TOKEN_CLIENTE }), [
    status(200),
    `const p = pm.response.json().data.find((x) => x.id === Number(pm.environment.get('${v(`ped_${clave}`)}')));`,
    "pm.test('Encuentra el pedido', () => pm.expect(p).to.exist);",
    ...comprobaciones,
  ]);

const estadoEs = (estado) => `pm.test('El pedido esta ${estado}', () => pm.expect(p.estado).to.eql('${estado}'));`;
const pagoEs = (estado) => `pm.test('El pago del pedido esta ${estado}', () => pm.expect(p.pagoEstado).to.eql('${estado}'));`;

const trazabilidad = (nombre, clave, pasosEsperados) =>
  item(nombre, req('GET', `/pedidos/comercio/${PED(clave)}/trazabilidad`, { token: TOKEN_DUENO, comercio: COM }), [
    status(200),
    `const pasos = pm.response.json().data.pasos.filter((x) => x.estado === 'PENDIENTE_CONFIRMACION_COMERCIO');`,
    `pm.test('El pedido llego al comercio ${pasosEsperados} vez', () => pm.expect(pasos.length).to.eql(${pasosEsperados}));`,
  ]);

const avisosDelDueno = (nombre, clave, cantidad) =>
  item(nombre, req('GET', '/notificaciones', { token: TOKEN_DUENO, comercio: COM }), [
    status(200),
    `const avisos = pm.response.json().data.filter((n) => n.tipo === 'NUEVO_PEDIDO' && n.entidadId === Number(pm.environment.get('${v(`ped_${clave}`)}')));`,
    `pm.test('El Dueño tiene ${cantidad} aviso de pedido nuevo', () => pm.expect(avisos.length).to.eql(${cantidad}));`,
  ]);

agregar(
  ...nuevoPedido('1'),
  item('Pago normal: el webhook confirma el pedido', req('POST', '/webhooks/mercadopago', { query: `pedidoId=${PED('1')}&data.id=${IDP('1')}&type=payment` }), [status(200)]),
  verPedido('Pago normal: el pedido llego al comercio y esta pagado', '1', [estadoEs('PENDIENTE_CONFIRMACION_COMERCIO'), pagoEs('PAGADO')]),
  trazabilidad('Pago normal: una sola transicion en el recorrido', '1', 1),
  avisosDelDueno('Pago normal: un solo aviso de pedido nuevo', '1', 1),

  webhook('Repetido: el mismo webhook otra vez no cambia nada', { pedido: PED('1'), pago: IDP('1') }),
  webhook('Repetido: y una tercera vez', { pedido: PED('1'), pago: IDP('1') }),
  verPedido('Repetido: el pedido sigue igual', '1', [estadoEs('PENDIENTE_CONFIRMACION_COMERCIO'), pagoEs('PAGADO')]),
  trazabilidad('Repetido: sigue habiendo una sola transicion', '1', 1),
  avisosDelDueno('Repetido: sigue habiendo un solo aviso', '1', 1),

  estadoDelPagoEnMercadoPago('Fuera de orden: Mercado Pago informa ahora el pago como rechazado', '1', 'rejected'),
  webhook('Fuera de orden: un webhook viejo de rechazo llega despues del aprobado', { pedido: PED('1'), pago: IDP('1') }),
  estadoDelPagoEnMercadoPago('Fuera de orden: Mercado Pago informa ahora el pago como pendiente', '1', 'pending'),
  webhook('Fuera de orden: un webhook viejo de pendiente llega despues del aprobado', { pedido: PED('1'), pago: IDP('1') }),
  verPedido('Fuera de orden: el pedido no retrocede', '1', [estadoEs('PENDIENTE_CONFIRMACION_COMERCIO'), pagoEs('PAGADO')]),
  trazabilidad('Fuera de orden: sigue habiendo una sola transicion', '1', 1),
  estadoDelPagoEnMercadoPago('Fuera de orden: Mercado Pago vuelve a informar el pago como aprobado', '1', 'approved'),

  item('Vacia el carrito del Cliente', req('DELETE', '/carrito', { token: TOKEN_CLIENTE }), [status(200)]),
  ...nuevoPedido('3'),
  webhook('De otro pedido: un webhook que dice ser del pedido 3 pero trae el pago del pedido 1 se ignora', { pedido: PED('3'), pago: IDP('1') }),
  verPedido('De otro pedido: el pedido 3 sigue esperando el pago', '3', [estadoEs('PENDIENTE_PAGO')]),
  verPedido('De otro pedido: el pedido 1 no cambio', '1', [estadoEs('PENDIENTE_CONFIRMACION_COMERCIO')]),

  webhook('Ignorado: un aviso que no es de un pago', { pedido: PED('3'), pago: IDP('3'), tipo: 'merchant_order' }),
  webhook('Ignorado: un pedido sin preferencia de pago', { pedido: '99999999', pago: '1' }),
  item('Ignorado: sin el id del pedido', req('POST', '/webhooks/mercadopago', { query: 'data.id=1&type=payment' }), [status(200)]),
  verPedido('Ignorado: el pedido 3 sigue esperando el pago', '3', [estadoEs('PENDIENTE_PAGO')]),

  item('Sincronizacion: el Cliente vuelve del checkout y el pago se aplica', req('POST', `/pedidos/cliente/${PED('3')}/pago/sincronizar`, { token: TOKEN_CLIENTE }), [
    status(200),
    "pm.test('El pedido llego al comercio', () => pm.expect(pm.response.json().data.estado).to.eql('PENDIENTE_CONFIRMACION_COMERCIO'));",
  ]),
  item('Sincronizacion: sincronizar otra vez no cambia nada', req('POST', `/pedidos/cliente/${PED('3')}/pago/sincronizar`, { token: TOKEN_CLIENTE }), [
    status(200),
    "pm.test('Sigue en el comercio', () => pm.expect(pm.response.json().data.estado).to.eql('PENDIENTE_CONFIRMACION_COMERCIO'));",
  ]),
  webhook('Sincronizacion: y el webhook del mismo pago llega despues', { pedido: PED('3'), pago: IDP('3') }),
  trazabilidad('Sincronizacion: una sola transicion en el recorrido', '3', 1),
  avisosDelDueno('Sincronizacion: un solo aviso de pedido nuevo', '3', 1),
  item('Vacia el carrito del Cliente', req('DELETE', '/carrito', { token: TOKEN_CLIENTE }), [status(200)]),

  ...nuevoPedido('2'),
  estadoDelMercadoPago('Tardio: se anota cuantos reembolsos pidio Bajonea hasta ahora', 'reembolsos_antes'),
  item('Tardio: el Cliente cancela el pedido antes de que llegue el pago', req('PUT', `/pedidos/cliente/${PED('2')}/cancelar`, { token: TOKEN_CLIENTE }), [
    status(200),
    "pm.test('Pedido cancelado', () => pm.expect(pm.response.json().data.estado).to.eql('CANCELADO'));",
  ]),
  webhook('Tardio: el pago aprobado llega con el pedido ya cancelado', { pedido: PED('2'), pago: IDP('2') }),
  verPedido('Tardio: el pedido sigue cancelado y tiene reembolso por pago tardio', '2', [
    estadoEs('CANCELADO'),
    "pm.test('Tiene reembolso', () => pm.expect(p.reembolsoEstado).to.not.eql(null));",
    "pm.test('El motivo es pago tardio', () => pm.expect(p.reembolsoMotivo).to.eql('PAGO_TARDIO'));",
  ]),
  webhook('Tardio: el mismo webhook otra vez', { pedido: PED('2'), pago: IDP('2') }),
  webhook('Tardio: y una tercera vez', { pedido: PED('2'), pago: IDP('2') }),
  item('Tardio: Mercado Pago recibio un solo pedido de reembolso', reqMp('GET', '/__control/estado'), [
    status(200),
    `pm.test('Un solo reembolso pedido', () => pm.expect(pm.response.json().reembolsos - Number(pm.environment.get('${v('reembolsos_antes')}'))).to.eql(1));`,
  ]),
  item('Tardio: el Dueño no recibio un aviso de pedido nuevo del pedido cancelado', req('GET', '/notificaciones', { token: TOKEN_DUENO, comercio: COM }), [
    status(200),
    `const avisos = pm.response.json().data.filter((n) => n.tipo === 'NUEVO_PEDIDO' && n.entidadId === Number(pm.environment.get('${v('ped_2')}')));`,
    "pm.test('Sin aviso', () => pm.expect(avisos.length).to.eql(0));",
  ]),
  item('Vacia el carrito del Cliente', req('DELETE', '/carrito', { token: TOKEN_CLIENTE }), [status(200)]),
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
const claves = ['com', 'cat', 'cat_nombre', 'cuit_tmp', 'dni_rep_tmp',
  'd_email', 'd_usuario', 'd_password', 'd_dni', 'd_codigo', 'd_token', 'd_id',
  'c_email', 'c_usuario', 'c_password', 'c_dni', 'c_codigo', 'c_token',
  'prod_a', 'ped_1', 'ped_2', 'ped_3', 'idpago_1', 'idpago_2', 'idpago_3', 'reembolsos_antes'].map(v);
const existentes = new Set(environment.values.map((x) => x.key));
for (const key of claves) {
  if (!existentes.has(key)) environment.values.push({ key, value: '', type: 'default', enabled: true });
}
if (!existentes.has('mp_simulado_url')) environment.values.push({ key: 'mp_simulado_url', value: 'http://localhost:9099', type: 'default', enabled: true });
fs.writeFileSync(environmentPath, JSON.stringify(environment, null, 2) + '\n', 'utf8');

console.log(`OK: carpeta "${NOMBRE_CARPETA.slice(0, 40)}..." con ${items.length} requests.`);
