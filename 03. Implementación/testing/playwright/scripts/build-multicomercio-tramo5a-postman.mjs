import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const collectionPath = path.resolve(__dirname, '../../../postman/Bajonea-MVP.postman_collection.json');
const environmentPath = path.resolve(__dirname, '../../../postman/Bajonea-Local.postman_environment.json');

const NOMBRE_FOLDER = '52 - Multi-comercio Tramo 5A (cuenta de Mercado Pago unica, previa y desvinculacion con varios comercios)';
const HEADER = 'X-Comercio-Id';
const MENSAJE_YA_VINCULADA = 'Ya tenés una cuenta de Mercado Pago vinculada. Desvinculala antes de vincular otra.';
const MENSAJE_EN_USO = 'Esa cuenta de Mercado Pago ya está en uso por otro Dueño. Usá otra cuenta, o pedí que la desvinculen primero.';
const MENSAJE_SIN_CUENTA = 'El Dueño no tiene ninguna cuenta de Mercado Pago vinculada';
const MENSAJE_SIN_ACEPTAR_PEDIDOS = 'Este comercio no está aceptando pedidos en este momento';
const ESTADOS_EN_CURSO = ['PENDIENTE_CONFIRMACION_COMERCIO', 'EN_PREPARACION', 'EN_CAMINO', 'LISTO_PARA_RETIRAR'];
const CUENTA_UNO = 't5-cuenta-uno';
const CUENTA_DOS = 't5-cuenta-dos';
const CUENTA_CUATRO = 't5-cuenta-cuatro';

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
  { s: '1', cuit: cuitValido('3090060011'), dni: '30900401' },
  { s: '2', cuit: cuitValido('3090060021'), dni: '30900402' },
  { s: '3', cuit: cuitValido('3090060051'), dni: '30900403' },
  { s: '4', cuit: cuitValido('3090060041'), dni: '30900404' },
];

const v = (s, sufijo) => `t5_u${s}_${sufijo}`;
const tok = (s) => `t5_token_u${s}`;
const conComercio = (variable) => ({ [HEADER]: `{{${variable}}}` });

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
    name,
    request,
    response: [],
    event: testLines.length ? [{ listen: 'test', script: { type: 'text/javascript', exec: testLines } }] : [],
  };
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
    razonSocial: `Cuenta Unica Postman ${s} SRL`,
    cuit,
    condicionIva: 'RESPONSABLE_INSCRIPTO',
    tipoSociedad: 'SRL',
    domicilioFiscal: `Direccion fiscal T5 ${s} 100`,
    fechaInicioActividades: '2020-01-01',
    nombre: `Local Cuenta Unica ${s}`,
    descripcion: 'Comercio generado por la coleccion de Postman (cuenta de Mercado Pago unica)',
    telefono: '+5492964555444',
    emailContacto: `contacto.t5u${s}@bajonea.test`,
    tipoComercio: 'RESTAURANTE',
    aceptaDelivery: false,
    aceptaRetiro: true,
    nombreUsuario: `{{${v(s, 'usuario')}}}`,
    email: `{{${v(s, 'email')}}}`,
    password: `{{${v(s, 'password')}}}`,
    direccion: { calle: 'Belgrano', numero: '800', pisoDepto: null, codigoPostal: '9420', localidadId: '{{localidad_id}}', principal: false },
    horarios: horariosTodosLosDias,
    nombreRepresentante: 'Carlos',
    apellidoRepresentante: 'Sanchez',
    dniRepresentante: dni,
    telefonoRepresentante: '+5492964701103',
    fechaNacimientoRepresentante: '1988-04-04',
    fotoPerfilUrl: `https://res.cloudinary.com/demo/image/upload/postman-cuenta-unica-${s}.jpg`,
    redesSociales: [{ tipo: 'INSTAGRAM', url: `instagram.com/cuentaunica${s}` }],
  };
}

const items = [];

items.push(
  item('Login Administrador (sesion propia de esta carpeta)', req('POST', '/auth/login', { body: { nombreUsuario: '{{admin_usuario}}', password: '{{admin_password}}' } }), [
    status(200),
    guardar('token_admin', 'pm.response.json().data.token'),
  ]),
  item('Crear la categoria de los productos de esta carpeta', req('POST', '/categorias', { token: 'token_admin', body: { nombre: 'Categoria Tramo5 Postman' } }), [
    status(201),
    guardar('t5_categoria_id', 'pm.response.json().data.id'),
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
    item(`Administrador busca el comercio pendiente del Dueño ${s}`, req('GET', '/administrador/comercios/pendientes', { token: 'token_admin' }), [
      status(200),
      `const c = pm.response.json().data.find((x) => x.emailCuenta === pm.environment.get('${v(s, 'email')}').toLowerCase());`,
      `pm.test('El comercio del Dueño ${s} esta pendiente', () => pm.expect(c).to.exist);`,
      guardar(v(s, 'com'), 'c.id'),
    ]),
    item(`Administrador aprueba el comercio del Dueño ${s}`, req('PUT', `/administrador/comercios/{{${v(s, 'com')}}}/resolver`, { token: 'token_admin', body: { aprobar: true } }), [status(200)]),
    item(`Login Dueño ${s}`, req('POST', '/auth/login', { body: { nombreUsuario: `{{${v(s, 'usuario')}}}`, password: `{{${v(s, 'password')}}}` } }), [
      status(200),
      guardar(tok(s), 'pm.response.json().data.token'),
      guardar(v(s, 'dueno'), 'pm.response.json().data.usuario.id'),
    ]),
  ];
}

for (const dueno of DUENOS) items.push(...altaDeDueno(dueno));

items.push(
  item('Registro Cliente', req('POST', '/auth/registro/cliente', {
    body: {
      nombre: 'Clienta',
      apellido: 'CuentaUnicaPostman',
      dni: '30900410',
      fechaNacimiento: '1995-05-20',
      telefono: '+5492964555000',
      nombreUsuario: '{{t5_cliente_usuario}}',
      email: '{{t5_cliente_email}}',
      password: '{{t5_cliente_password}}',
      direccion: { calle: 'Calle Siempre Viva', numero: '123', pisoDepto: null, codigoPostal: '9420', localidadId: '{{localidad_id}}', principal: true },
    },
  }), [status(201)]),
  item('Bypass test - codigo de verificacion Cliente', req('GET', '/test/token-verificacion', { query: 'email={{t5_cliente_email}}' }), [
    status(200),
    guardar('t5_cliente_codigo', 'pm.response.json().data'),
  ]),
  item('Verificar cuenta Cliente', req('POST', '/auth/verificar', { body: { email: '{{t5_cliente_email}}', codigo: '{{t5_cliente_codigo}}' } }), [status(200)]),
  item('Login Cliente', req('POST', '/auth/login', { body: { nombreUsuario: '{{t5_cliente_usuario}}', password: '{{t5_cliente_password}}' } }), [
    status(200),
    guardar('t5_token_cliente', 'pm.response.json().data.token'),
  ]),
);

const vincular = (nombre, s, cuenta, esperado, testLines = []) =>
  item(nombre, req('POST', `/test/duenos/{{${v(s, 'dueno')}}}/mercadopago-simulada`, { body: {}, query: cuenta ? `mpUserId=${cuenta}` : undefined }), [status(esperado), ...testLines]);

const desvincular = (nombre, s, esperado, testLines = []) =>
  item(nombre, req('DELETE', '/oauth/mercadopago/desvincular', { token: tok(s) }), [status(esperado), ...testLines]);

const previa = (nombre, token, esperado, testLines = [], headers = {}) =>
  item(nombre, req('GET', '/oauth/mercadopago/desvinculacion/previa', { token, headers }), [status(esperado), ...testLines]);

const estadoComercio = (nombre, s, comVar, estado) =>
  item(nombre, req('GET', '/comercios/perfil', { token: tok(s), headers: conComercio(comVar) }), [
    status(200),
    `pm.test('El comercio esta ${estado}', () => pm.expect(pm.response.json().data.estado).to.eql('${estado}'));`,
  ]);

const cuentaDe = (nombre, s, vinculada, mpUserId) =>
  item(nombre, req('GET', '/oauth/mercadopago/cuenta', { token: tok(s) }), [
    status(200),
    `pm.test('vinculada = ${vinculada}', () => pm.expect(pm.response.json().data.vinculada).to.eql(${vinculada}));`,
    ...(mpUserId ? [`pm.test('mpUserId = ${mpUserId}', () => pm.expect(pm.response.json().data.mpUserId).to.eql('${mpUserId}'));`] : []),
  ]);

items.push(
  vincular('[unica] Dueño 1 vincula la cuenta', '1', CUENTA_UNO, 200),
  estadoComercio('[unica] El comercio del Dueño 1 pasa a APTO_VENTA', '1', v('1', 'com'), 'APTO_VENTA'),
  vincular('[unica] Dueño 2 intenta vincular la misma cuenta: 409', '2', CUENTA_UNO, 409, [mensajeEs(MENSAJE_EN_USO)]),
  estadoComercio('[unica] El comercio del Dueño 2 sigue APROBADO', '2', v('2', 'com'), 'APROBADO'),
  cuentaDe('[unica] El Dueño 2 no quedo vinculado', '2', false),
  desvincular('[unica] Dueño 1 desvincula', '1', 200),
  estadoComercio('[unica] El comercio del Dueño 1 vuelve a APROBADO', '1', v('1', 'com'), 'APROBADO'),
  vincular('[unica] Dueño 2 vincula la cuenta que quedo libre', '2', CUENTA_UNO, 200),
  estadoComercio('[unica] El comercio del Dueño 2 pasa a APTO_VENTA', '2', v('2', 'com'), 'APTO_VENTA'),
  cuentaDe('[unica] La cuenta del Dueño 2 es la liberada por el Dueño 1', '2', true, CUENTA_UNO),
  cuentaDe('[unica] El Dueño 1 sigue desvinculado', '1', false),

  vincular('[mismo dueño] Volver a vincular la misma cuenta es idempotente', '2', CUENTA_UNO, 200),
  estadoComercio('[mismo dueño] El comercio sigue APTO_VENTA', '2', v('2', 'com'), 'APTO_VENTA'),
  vincular('[mismo dueño] Vincular otra cuenta distinta: 409', '2', CUENTA_DOS, 409, [mensajeEs(MENSAJE_YA_VINCULADA)]),
  cuentaDe('[mismo dueño] La cuenta vinculada sigue siendo la primera', '2', true, CUENTA_UNO),

  item('[iniciar] Con una cuenta activa: 409', req('GET', '/oauth/mercadopago/iniciar', { token: tok('2') }), [status(409), mensajeEs(MENSAJE_YA_VINCULADA)]),
  item('[iniciar] Sin cuenta activa: 200 con la URL de autorizacion', req('GET', '/oauth/mercadopago/iniciar', { token: tok('3') }), [
    status(200),
    "pm.test('Trae una url de Mercado Pago con state', () => { const url = pm.response.json().data.url; pm.expect(url).to.include('mercadopago.com'); pm.expect(url).to.include('state='); });",
  ]),

  previa('[previa] Sin cuenta activa: 404 con el texto de cuenta', tok('3'), 404, [mensajeEs(MENSAJE_SIN_CUENTA)]),
  previa('[previa] Un Cliente: 403', 't5_token_cliente', 403),
  previa('[previa] Un Administrador: 403', 'token_admin', 403),
  previa('[previa] Sin token: 401', undefined, 401),
  previa('[previa] Dueño 2 sin pedidos: forma y puede desvincular', tok('2'), 200, [
    'const d = pm.response.json().data;',
    "pm.test('Las claves del nivel superior', () => pm.expect(Object.keys(d).sort()).to.eql(['comercios', 'pagosPendientes', 'puedeDesvincular']));",
    "pm.test('Puede desvincular y no hay pagos pendientes', () => { pm.expect(d.puedeDesvincular).to.eql(true); pm.expect(d.pagosPendientes).to.eql({ cantidadTotal: 0, puedeReintentarDesde: null }); });",
    `pm.test('Su unico comercio con los cuatro estados en curso, en ceros', () => { pm.expect(d.comercios.length).to.eql(1); pm.expect(d.comercios[0].id).to.eql(Number(pm.environment.get('${v('2', 'com')}'))); pm.expect(Object.keys(d.comercios[0]).sort()).to.eql(['cantidadPagosPendientes', 'id', 'nombre', 'pedidosEnCurso']); pm.expect(d.comercios[0].pedidosEnCurso.map((p) => p.estado)).to.eql(${JSON.stringify(ESTADOS_EN_CURSO)}); pm.expect(d.comercios[0].pedidosEnCurso.every((p) => p.cantidad === 0)).to.eql(true); });`,
    "pm.environment.set('t5_previa_u2', JSON.stringify(d));",
  ]),
  previa('[previa] Ignora un X-Comercio-Id no numerico', tok('2'), 200, [
    "pm.test('Mismo contenido que sin header', () => pm.expect(JSON.stringify(pm.response.json().data)).to.eql(pm.environment.get('t5_previa_u2')));",
  ], { [HEADER]: 'abc' }),
  previa('[previa] Ignora el X-Comercio-Id de otro Dueño y no filtra sus comercios', tok('2'), 200, [
    "pm.test('Mismo contenido que sin header', () => pm.expect(JSON.stringify(pm.response.json().data)).to.eql(pm.environment.get('t5_previa_u2')));",
  ], conComercio(v('1', 'com'))),

  item('[desvincular] Un Cliente: 403', req('DELETE', '/oauth/mercadopago/desvincular', { token: 't5_token_cliente' }), [status(403)]),
  item('[desvincular] Un Administrador: 403', req('DELETE', '/oauth/mercadopago/desvincular', { token: 'token_admin' }), [status(403)]),
);

items.push(
  vincular('[pedidos] Dueño 4 vincula su cuenta', '4', CUENTA_CUATRO, 200),
  item('[pedidos] Se clona el comercio del Dueño 4 (segundo comercio, APTO_VENTA)', req('POST', `/test/comercios/{{${v('4', 'com')}}}/clonar`, { body: {}, query: 'nombre=Local%20Cuenta%20Unica%204%20B&estado=APTO_VENTA' }), [
    status(201),
    guardar(v('4', 'com2'), 'pm.response.json().data'),
  ]),
  item('[pedidos] Producto del comercio 1 del Dueño 4', req('POST', '/productos', {
    token: tok('4'),
    headers: conComercio(v('4', 'com')),
    body: { nombre: 'Producto T5 Uno', precio: 1500, categoriaId: '{{t5_categoria_id}}' },
  }), [status(201), guardar(v('4', 'prod1'), 'pm.response.json().data.id')]),
  item('[pedidos] Producto del comercio 2 del Dueño 4', req('POST', '/productos', {
    token: tok('4'),
    headers: conComercio(v('4', 'com2')),
    body: { nombre: 'Producto T5 Dos', precio: 900, categoriaId: '{{t5_categoria_id}}' },
  }), [status(201), guardar(v('4', 'prod2'), 'pm.response.json().data.id')]),
);

const agregarAlCarrito = (nombre, prodVar) =>
  item(nombre, req('POST', '/carrito/items', { token: 't5_token_cliente', body: { productoId: `{{${prodVar}}}`, cantidad: 1 } }), [status(201)]);

const crearPedido = (nombre, pedVar) =>
  item(nombre, req('POST', '/pedidos/cliente', { token: 't5_token_cliente', body: { tipoEntrega: 'RETIRO', direccionId: null } }), [
    status(201),
    guardar(pedVar, 'pm.response.json().data.id'),
    "pm.test('Nace PENDIENTE_PAGO', () => pm.expect(pm.response.json().data.estado).to.eql('PENDIENTE_PAGO'));",
  ]);

const pagar = (nombre, pedVar) => item(nombre, req('PUT', `/test/pedidos/{{${pedVar}}}/pago-aprobado`, { body: {} }), [status(200)]);

const accionComercio = (nombre, accion, pedVar, comVar, s, esperado, body) =>
  item(nombre, req('PUT', `/pedidos/comercio/{{${pedVar}}}/${accion}`, { token: tok(s), headers: conComercio(comVar), body }), [status(esperado)]);

const estadoDelPedido = (nombre, pedVar, estado) =>
  item(nombre, req('GET', '/pedidos/cliente', { token: 't5_token_cliente' }), [
    status(200),
    `const p = pm.response.json().data.find((x) => x.id === Number(pm.environment.get('${pedVar}')));`,
    `pm.test('El pedido esta ${estado}', () => { pm.expect(p).to.exist; pm.expect(p.estado).to.eql('${estado}'); });`,
  ]);

items.push(
  agregarAlCarrito('[pedidos] Cliente agrega un producto del comercio 1', v('4', 'prod1')),
  crearPedido('[pedidos] Pedido 1 (comercio 1)', 't5_ped1'),
  pagar('[pedidos] Se confirma el pago del pedido 1', 't5_ped1'),
  accionComercio('[pedidos] El comercio 1 acepta el pedido 1', 'aceptar', 't5_ped1', v('4', 'com'), '4', 200),
  agregarAlCarrito('[pedidos] Cliente agrega otro producto del comercio 1', v('4', 'prod1')),
  crearPedido('[pedidos] Pedido 2 (comercio 1)', 't5_ped2'),
  pagar('[pedidos] Se confirma el pago del pedido 2 (queda esperando al comercio)', 't5_ped2'),
  agregarAlCarrito('[pedidos] Cliente agrega un producto del comercio 2', v('4', 'prod2')),
  crearPedido('[pedidos] Pedido 3 (comercio 2), sin pagar', 't5_ped3'),

  previa('[previa] Dueño 4 con pedidos en curso y un pago pendiente', tok('4'), 200, [
    'const d = pm.response.json().data;',
    "pm.test('No puede desvincular', () => pm.expect(d.puedeDesvincular).to.eql(false));",
    `const c1 = d.comercios.find((c) => c.id === Number(pm.environment.get('${v('4', 'com')}')));`,
    `const c2 = d.comercios.find((c) => c.id === Number(pm.environment.get('${v('4', 'com2')}')));`,
    "const cant = (c, estado) => c.pedidosEnCurso.find((p) => p.estado === estado).cantidad;",
    "pm.test('Comercio 1: 1 en preparacion, 1 esperando al comercio, sin pagos pendientes', () => { pm.expect(cant(c1, 'EN_PREPARACION')).to.eql(1); pm.expect(cant(c1, 'PENDIENTE_CONFIRMACION_COMERCIO')).to.eql(1); pm.expect(c1.cantidadPagosPendientes).to.eql(0); });",
    "pm.test('Comercio 2: 1 pago pendiente', () => pm.expect(c2.cantidadPagosPendientes).to.eql(1));",
    "pm.test('Pagos pendientes: total 1 y hora de reintento', () => { pm.expect(d.pagosPendientes.cantidadTotal).to.eql(1); pm.expect(d.pagosPendientes.puedeReintentarDesde).to.be.a('string'); });",
  ]),
  desvincular('[desvincular] Con un pedido pagando en el comercio 2: 409 con la hora', '4', 409, [
    mensajeContiene('Hay 1 pedido de un cliente que todavía está pagando. Probá de nuevo alrededor de las '),
    "pm.test('data trae la cantidad y la hora', () => { const d = pm.response.json().data; pm.expect(d.cantidadPagosPendientes).to.eql(1); pm.expect(d.puedeReintentarDesde).to.be.a('string'); });",
  ]),
  estadoComercio('[desvincular] El comercio 1 sigue APTO_VENTA tras el rechazo', '4', v('4', 'com'), 'APTO_VENTA'),
  estadoComercio('[desvincular] El comercio 2 sigue APTO_VENTA tras el rechazo', '4', v('4', 'com2'), 'APTO_VENTA'),
  cuentaDe('[desvincular] La cuenta sigue vinculada tras el rechazo', '4', true, CUENTA_CUATRO),
  pagar('[desvincular] Se confirma el pago del pedido 3', 't5_ped3'),
  agregarAlCarrito('[desvincular] Cliente deja un producto del comercio 2 en el carrito', v('4', 'prod2')),
  desvincular('[desvincular] Sin pagos pendientes: desvincula (con pedidos en curso en ambos comercios)', '4', 200),
  estadoComercio('[desvincular] El comercio 1 vuelve a APROBADO', '4', v('4', 'com'), 'APROBADO'),
  estadoComercio('[desvincular] El comercio 2 vuelve a APROBADO', '4', v('4', 'com2'), 'APROBADO'),
  cuentaDe('[desvincular] La cuenta ya no esta vinculada', '4', false),
  previa('[previa] Despues de desvincular: 404', tok('4'), 404, [mensajeEs(MENSAJE_SIN_CUENTA)]),
  desvincular('[desvincular] Una segunda desvinculacion: 404 con el texto de cuenta', '4', 404, [mensajeEs(MENSAJE_SIN_CUENTA)]),

  estadoDelPedido('[flujo] El pedido 1 sigue EN_PREPARACION', 't5_ped1', 'EN_PREPARACION'),
  estadoDelPedido('[flujo] El pedido 2 sigue esperando al comercio', 't5_ped2', 'PENDIENTE_CONFIRMACION_COMERCIO'),
  accionComercio('[flujo] El comercio 1 despacha el pedido 1 aunque ya no tenga la cuenta', 'despachar', 't5_ped1', v('4', 'com'), '4', 200),
  estadoDelPedido('[flujo] El pedido 1 queda LISTO_PARA_RETIRAR', 't5_ped1', 'LISTO_PARA_RETIRAR'),
  accionComercio('[flujo] El comercio 1 rechaza el pedido 2 aunque ya no tenga la cuenta', 'rechazar', 't5_ped2', v('4', 'com'), '4', 200, { motivo: 'SIN_STOCK' }),
  estadoDelPedido('[flujo] El pedido 2 queda RECHAZADO', 't5_ped2', 'RECHAZADO'),
  accionComercio('[flujo] El comercio 2 acepta el pedido 3 aunque ya no tenga la cuenta', 'aceptar', 't5_ped3', v('4', 'com2'), '4', 200),

  item('[crear pedido] Con el comercio ya en APROBADO, el pedido del carrito se rechaza: 409', req('POST', '/pedidos/cliente', { token: 't5_token_cliente', body: { tipoEntrega: 'RETIRO', direccionId: null } }), [
    status(409),
    mensajeEs(MENSAJE_SIN_ACEPTAR_PEDIDOS),
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
  t5_cliente_email: 'postman.t5cliente@bajonea.test',
  t5_cliente_usuario: 'postmant5cliente',
  t5_cliente_password: 'Postman123',
  t5_cliente_codigo: '',
  t5_token_cliente: '',
  t5_categoria_id: '',
  t5_previa_u2: '',
  t5_ped1: '',
  t5_ped2: '',
  t5_ped3: '',
};
for (const { s } of DUENOS) {
  variables[v(s, 'email')] = `postman.t5u${s}@bajonea.test`;
  variables[v(s, 'usuario')] = `postmant5u${s}`;
  variables[v(s, 'password')] = 'Postman123';
  for (const sufijo of ['codigo', 'dueno', 'com', 'com2', 'prod1', 'prod2']) variables[v(s, sufijo)] = '';
  variables[tok(s)] = '';
}
const existentes = new Set(environment.values.map((x) => x.key));
for (const [key, value] of Object.entries(variables)) {
  if (!existentes.has(key)) environment.values.push({ key, value, type: 'default', enabled: true });
}
fs.writeFileSync(environmentPath, JSON.stringify(environment, null, 2) + '\n', 'utf8');

console.log(`OK: carpeta "${NOMBRE_FOLDER}" con ${items.length} requests.`);
