import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const collectionPath = path.resolve(__dirname, '../../../postman/Bajonea-MVP.postman_collection.json');
const environmentPath = path.resolve(__dirname, '../../../postman/Bajonea-Local.postman_environment.json');

const NOMBRE_FOLDER = '58 - Pedidos E3 A0 (anular genera la nota de crédito, 409 por estado ya resuelto en todas las transiciones y fotos solo de su carpeta)';

const v = (clave) => `a0_${clave}`;

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
const entorno = (variable) => `pm.environment.get('${variable}')`;
const mensajeEs = (texto) => `pm.test('El mensaje es el esperado', () => pm.expect(pm.response.json().mensaje).to.eql(${JSON.stringify(texto)}));`;

function identidad(clave) {
  return [
    `const s = Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36);`,
    guardar(v(`${clave}_email`), `'a0.${clave}.' + s + '@bajonea.test'`),
    guardar(v(`${clave}_usuario`), `('a0${clave}' + s).slice(0, 20)`),
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
const TOKEN_DUENO = v('d_token');
const TOKEN_CLIENTE = v('c_token');

const items = [];
const agregar = (...nuevos) => items.push(...nuevos);

agregar(
  item('Login Administrador (sesion propia de esta carpeta)', req('POST', '/auth/login', { body: { nombreUsuario: '{{admin_usuario}}', password: '{{admin_password}}' } }), [
    status(200),
    guardar('token_admin', 'pm.response.json().data.token'),
  ]),
  item(
    'Registro Dueño',
    req('POST', '/auth/registro/comercio', {
      body: {
        razonSocial: 'Pedidos A0 SRL',
        cuit: `{{${v('cuit_tmp')}}}`,
        condicionIva: 'RESPONSABLE_INSCRIPTO',
        tipoSociedad: 'SRL',
        domicilioFiscal: 'Direccion fiscal A0 100',
        fechaInicioActividades: '2020-01-01',
        nombre: 'Local Pedidos A0',
        descripcion: 'Comercio generado por la coleccion de Postman (pedidos, E3 A0)',
        telefono: '+5492964555444',
        emailContacto: `{{${v('d_email')}}}`,
        tipoComercio: 'RESTAURANTE',
        aceptaDelivery: false,
        aceptaRetiro: true,
        nombreUsuario: `{{${v('d_usuario')}}}`,
        email: `{{${v('d_email')}}}`,
        password: `{{${v('d_password')}}}`,
        direccion: { calle: 'Belgrano', numero: '800', pisoDepto: null, codigoPostal: '9420', localidadId: '{{localidad_id}}', principal: false },
        horarios: horariosTodosLosDias,
        nombreRepresentante: 'Carlos',
        apellidoRepresentante: 'Sanchez',
        dniRepresentante: `{{${v('dni_rep_tmp')}}}`,
        telefonoRepresentante: '+5492964701103',
        fechaNacimientoRepresentante: '1988-04-04',
        fotoPerfilUrl: 'https://res.cloudinary.com/demo/image/upload/postman-pedidos-a0.jpg',
        redesSociales: [{ tipo: 'INSTAGRAM', url: 'instagram.com/pedidosa0' }],
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
    `const c = pm.response.json().data.find((x) => x.emailCuenta === ${entorno(v('d_email'))}.toLowerCase());`,
    "pm.test('El comercio del Dueño esta pendiente', () => pm.expect(c).to.exist);",
    guardar(v('com'), 'c.id'),
  ]),
  item('Administrador aprueba el comercio', req('PUT', `/administrador/comercios/${COM}/resolver`, { token: 'token_admin', body: { aprobar: true } }), [status(200)]),
  item('Atajo de test: el comercio pasa a APTO_VENTA sin cuenta de Mercado Pago vinculada', req('PUT', `/test/comercios/${COM}/apto-venta`, { body: {} }), [status(200)]),
  item(
    'Administrador crea la categoria del producto',
    req('POST', '/categorias', { token: 'token_admin', rawBody: `{"nombre": "{{${v('cat_nombre')}}}"}` }),
    [status(201), guardar(v('cat'), 'pm.response.json().data.id')],
    [guardar(v('cat_nombre'), "'Cat Pedidos A0 ' + Date.now().toString(36)")],
  ),
  item(
    'Dueño crea el producto',
    req('POST', '/productos', { token: TOKEN_DUENO, comercio: COM, rawBody: `{"nombre": "Producto Pedidos A0", "precio": 10000, "categoriaId": {{${v('cat')}}}}` }),
    [status(201), guardar(v('prod'), 'pm.response.json().data.id')],
  ),
  item(
    'Registro Cliente',
    req('POST', '/auth/registro/cliente', {
      body: {
        nombre: 'Clienta',
        apellido: 'Pedidos',
        dni: `{{${v('c_dni')}}}`,
        fechaNacimiento: '1995-05-20',
        telefono: '+5492964551235',
        nombreUsuario: `{{${v('c_usuario')}}}`,
        email: `{{${v('c_email')}}}`,
        password: `{{${v('c_password')}}}`,
        aceptaTerminos: true,
        direccion: { calle: 'Calle Siempre Viva', numero: '123', pisoDepto: null, codigoPostal: '9420', localidadId: '{{localidad_id}}', principal: true },
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

const P = (clave) => `{{${v(`ped_${clave}`)}}}`;

function crearPedido(clave, { registrarPago = true } = {}) {
  return [
    item(`[pedido ${clave}] El Cliente agrega el producto al carrito`, req('POST', '/carrito/items', { token: TOKEN_CLIENTE, rawBody: `{"productoId": {{${v('prod')}}}, "cantidad": 1}` }), [status(201)]),
    item(`[pedido ${clave}] El Cliente confirma el pedido (retiro en el local)`, req('POST', '/pedidos/cliente', { token: TOKEN_CLIENTE, body: { tipoEntrega: 'RETIRO', direccionId: null } }), [
      status(201),
      guardar(v(`ped_${clave}`), 'pm.response.json().data.id'),
    ]),
    item(
      `[pedido ${clave}] Atajo de test: el pago ${registrarPago ? 'queda aprobado y registrado' : 'se confirma sin registrar el pago'}`,
      req('PUT', `/test/pedidos/${P(clave)}/pago-aprobado`, { body: {}, query: registrarPago ? 'registrarPago=true' : undefined }),
      [status(200)],
    ),
  ];
}

const accion = (nombre, clave, verbo, ruta, codigo, { body, extra = [] } = {}) =>
  item(nombre, req('PUT', `/pedidos/comercio/${P(clave)}/${ruta}`, { token: TOKEN_DUENO, comercio: COM, body: body ?? {} }), [status(codigo), ...extra]);
const aceptar = (nombre, clave, codigo, extra) => accion(nombre, clave, 'PUT', 'aceptar', codigo, { extra });
const rechazar = (nombre, clave, codigo, extra) => accion(nombre, clave, 'PUT', 'rechazar', codigo, { body: { motivo: 'SIN_STOCK' }, extra });
const despachar = (nombre, clave, codigo, extra) => accion(nombre, clave, 'PUT', 'despachar', codigo, { extra });
const entregar = (nombre, clave, codigo, extra) => accion(nombre, clave, 'PUT', 'entregar', codigo, { extra });
const MOTIVO_ANULACION = { motivo: 'OTRO', comentario: 'Se rompió el horno' };
const anular = (nombre, clave, codigo, motivo = MOTIVO_ANULACION, extra) => accion(nombre, clave, 'PUT', 'anular', codigo, { body: motivo === null ? {} : motivo, extra });
const cancelarCliente = (nombre, clave, codigo, extra) =>
  item(nombre, req('PUT', `/pedidos/cliente/${P(clave)}/cancelar`, { token: TOKEN_CLIENTE, body: {} }), [status(codigo), ...(extra || [])]);

const MENSAJE_RESUELTO = 'El pedido ya fue resuelto';
const MENSAJE_NO_ANULABLE = 'El pedido ya no se puede anular';
const MENSAJE_ANULAR_SIN_ACEPTAR = 'Un pedido sin aceptar no se anula, se rechaza';

const pedidoDelCliente = (clave, lineas) =>
  item(`[pedido ${clave}] El Cliente ve el pedido en su historial`, req('GET', '/pedidos/cliente', { token: TOKEN_CLIENTE }), [
    status(200),
    `const p = pm.response.json().data.find((x) => x.id === Number(${entorno(v(`ped_${clave}`))}));`,
    "pm.test('El pedido esta en el historial del Cliente', () => pm.expect(p).to.exist);",
    ...lineas,
  ]);

const reembolsosDelAdmin = (nombre, clave, lineas) =>
  item(nombre, req('GET', '/administrador/reembolsos', { token: 'token_admin' }), [
    status(200),
    `const notas = pm.response.json().data.filter((n) => n.pedidoId === Number(${entorno(v(`ped_${clave}`))}));`,
    ...lineas,
  ]);

const avisosDelCliente = (nombre, clave, lineas) =>
  item(nombre, req('GET', '/notificaciones', { token: TOKEN_CLIENTE }), [
    status(200),
    `const avisos = pm.response.json().data.filter((n) => n.entidadTipo === 'PEDIDO' && n.entidadId === Number(${entorno(v(`ped_${clave}`))}));`,
    ...lineas,
  ]);

agregar(
  ...crearPedido('a'),
  aceptar('[pedido a] El Dueño acepta el pedido', 'a', 200),
  anular('[pedido a] El Dueño anula el pedido en preparacion con motivo', 'a', 200, MOTIVO_ANULACION, [
    "const d = pm.response.json().data;",
    "pm.test('Queda ANULADO con el motivo', () => { pm.expect(d.estado).to.eql('ANULADO'); pm.expect(d.motivoAnulacion).to.eql('Otro. Se rompió el horno'); pm.expect(d.motivoRechazo).to.eql('OTRO'); });",
    "pm.test('La respuesta ya trae la nota de credito por el total, en revision manual (cuenta de cobro desvinculada)', () => { pm.expect(d.reembolsoEstado).to.eql('PENDIENTE_REVISION_MANUAL'); pm.expect(Number(d.reembolsoMonto)).to.eql(Number(d.total)); });",
  ]),
  pedidoDelCliente('a', [
    "pm.test('El Cliente ve el reembolso en gestion', () => { pm.expect(p.estado).to.eql('ANULADO'); pm.expect(p.reembolsoEstado).to.eql('PENDIENTE_REVISION_MANUAL'); });",
  ]),
  avisosDelCliente('[pedido a] El aviso de la anulacion dice que la devolucion esta en gestion', 'a', [
    "const anulacion = avisos.find((a) => a.mensaje.includes('anulado'));",
    "pm.test('Hay un solo aviso de anulacion', () => pm.expect(avisos.filter((a) => a.mensaje.includes('anulado'))).to.have.length(1));",
    "pm.test('El aviso promete la devolucion y repite el motivo', () => { pm.expect(anulacion.mensaje).to.include('gestionando la devolución de tu pago'); pm.expect(anulacion.mensaje).to.include('Se rompió el horno'); });",
  ]),
  reembolsosDelAdmin('[pedido a] El Administrador ve una sola nota de credito por anulacion en la pantalla de reembolsos', 'a', [
    "pm.test('Hay exactamente una nota para el pedido', () => pm.expect(notas).to.have.length(1));",
    "pm.test('Es por anulacion del comercio, pendiente de revision manual y por el total', () => { pm.expect(notas[0].motivo).to.eql('ANULACION_COMERCIO'); pm.expect(notas[0].estado).to.eql('PENDIENTE_REVISION_MANUAL'); });",
  ]),
  anular('[pedido a] Anular de nuevo es un 409 y no crea otra nota', 'a', 409, { motivo: 'CERRADO' }, [mensajeEs(MENSAJE_NO_ANULABLE)]),
  despachar('[pedido a] Despachar un pedido ya anulado es 409', 'a', 409, [mensajeEs(MENSAJE_RESUELTO)]),
  aceptar('[pedido a] Aceptar un pedido ya anulado es 409', 'a', 409, [mensajeEs(MENSAJE_RESUELTO)]),
  rechazar('[pedido a] Rechazar un pedido ya anulado es 409', 'a', 409, [mensajeEs(MENSAJE_RESUELTO)]),
  entregar('[pedido a] Entregar un pedido ya anulado es 409', 'a', 409, [mensajeEs(MENSAJE_RESUELTO)]),
  cancelarCliente('[pedido a] El Cliente no puede cancelar un pedido ya anulado (409)', 'a', 409, [mensajeEs('El pedido ya no se puede cancelar')]),
  reembolsosDelAdmin('[pedido a] Despues de los intentos repetidos sigue habiendo una sola nota', 'a', [
    "pm.test('Sigue habiendo exactamente una nota', () => pm.expect(notas).to.have.length(1));",
  ]),
  avisosDelCliente('[pedido a] Y un solo aviso de anulacion', 'a', [
    "pm.test('Un solo aviso de anulacion', () => pm.expect(avisos.filter((a) => a.mensaje.includes('anulado'))).to.have.length(1));",
  ]),
);

agregar(
  ...crearPedido('b'),
  anular('[pedido b] Anular un pedido que todavia espera la respuesta del comercio es 409', 'b', 409, { motivo: 'CERRADO' }, [mensajeEs(MENSAJE_ANULAR_SIN_ACEPTAR)]),
  aceptar('[pedido b] El Dueño acepta el pedido', 'b', 200),
  anular('[pedido b] Anular sin motivo es 400', 'b', 400, null),
  anular('[pedido b] Anular con motivo OTRO y comentario en blanco es 400', 'b', 400, { motivo: 'OTRO', comentario: '   ' }),
  anular('[pedido b] Anular con un motivo que no es de la lista es 400', 'b', 400, { motivo: 'Se rompió el horno' }),
  rechazar('[pedido b] Rechazar un pedido ya aceptado es 409 (el aceptar ya gano)', 'b', 409, [mensajeEs(MENSAJE_RESUELTO)]),
  aceptar('[pedido b] Aceptar dos veces es 409', 'b', 409, [mensajeEs(MENSAJE_RESUELTO)]),
  despachar('[pedido b] El Dueño despacha el pedido (queda listo para retirar)', 'b', 200),
  anular('[pedido b] Anular un pedido ya despachado es 409', 'b', 409, { motivo: 'CERRADO' }, [mensajeEs(MENSAJE_NO_ANULABLE)]),
  despachar('[pedido b] Despachar dos veces es 409', 'b', 409, [mensajeEs(MENSAJE_RESUELTO)]),
  entregar('[pedido b] El Dueño entrega el pedido', 'b', 200),
  entregar('[pedido b] Entregar dos veces es 409', 'b', 409, [mensajeEs(MENSAJE_RESUELTO)]),
  reembolsosDelAdmin('[pedido b] Un pedido entregado nunca tiene nota de credito', 'b', [
    "pm.test('Sin notas', () => pm.expect(notas).to.have.length(0));",
  ]),
);

agregar(
  ...crearPedido('c', { registrarPago: false }),
  aceptar('[pedido c] El Dueño acepta el pedido', 'c', 200),
  anular('[pedido c] Anular un pedido sin pago aprobado registrado es 200 y no trae reembolso', 'c', 200, { motivo: 'SIN_STOCK' }, [
    "const d = pm.response.json().data;",
    "pm.test('Queda ANULADO sin reembolso', () => { pm.expect(d.estado).to.eql('ANULADO'); pm.expect(d.reembolsoEstado).to.eql(null); });",
  ]),
  avisosDelCliente('[pedido c] El aviso de la anulacion no promete una devolucion que no existe', 'c', [
    "const anulacion = avisos.find((a) => a.mensaje.includes('anulado'));",
    "pm.test('Sin la frase de la devolucion', () => { pm.expect(anulacion).to.exist; pm.expect(anulacion.mensaje).to.not.include('devolución'); });",
  ]),
  reembolsosDelAdmin('[pedido c] El Administrador no ve ninguna nota', 'c', ["pm.test('Sin notas', () => pm.expect(notas).to.have.length(0));"]),
);

agregar(
  ...crearPedido('d'),
  rechazar('[pedido d] El Dueño rechaza el pedido pagado', 'd', 200, [
    "pm.test('Queda RECHAZADO', () => pm.expect(pm.response.json().data.estado).to.eql('RECHAZADO'));",
    "pm.test('La respuesta del rechazo ya trae la nota de credito por el total, en revision manual', () => { const d = pm.response.json().data; pm.expect(d.reembolsoEstado).to.eql('PENDIENTE_REVISION_MANUAL'); pm.expect(Number(d.reembolsoMonto)).to.eql(Number(d.total)); });",
  ]),
  avisosDelCliente('[pedido d] El aviso del rechazo dice que la devolucion esta en gestion', 'd', [
    "const rechazo = avisos.find((a) => a.mensaje.includes('rechazado'));",
    "pm.test('El aviso promete la devolucion', () => { pm.expect(rechazo).to.exist; pm.expect(rechazo.mensaje).to.include('gestionando la devolución de tu pago'); });",
  ]),
  pedidoDelCliente('d', ["pm.test('El Cliente ve el rechazo con el reembolso en gestion', () => { pm.expect(p.estado).to.eql('RECHAZADO'); pm.expect(p.reembolsoEstado).to.eql('PENDIENTE_REVISION_MANUAL'); });"]),
  aceptar('[pedido d] Aceptar un pedido ya rechazado es 409', 'd', 409, [mensajeEs(MENSAJE_RESUELTO)]),
  rechazar('[pedido d] Rechazar dos veces es 409', 'd', 409, [mensajeEs(MENSAJE_RESUELTO)]),
  anular('[pedido d] Anular un pedido rechazado es 409', 'd', 409, { motivo: 'CERRADO' }, [mensajeEs(MENSAJE_NO_ANULABLE)]),
  cancelarCliente('[pedido d] El Cliente no puede cancelar un pedido rechazado (409)', 'd', 409, [mensajeEs('El pedido ya no se puede cancelar')]),
  reembolsosDelAdmin('[pedido d] Una sola nota por rechazo', 'd', [
    "pm.test('Exactamente una nota por rechazo del comercio', () => { pm.expect(notas).to.have.length(1); pm.expect(notas[0].motivo).to.eql('RECHAZO_COMERCIO'); });",
  ]),
);

agregar(
  ...crearPedido('e'),
  cancelarCliente('[pedido e] El Cliente cancela el pedido', 'e', 200, [
    "pm.test('Queda CANCELADO', () => pm.expect(pm.response.json().data.estado).to.eql('CANCELADO'));",
    "pm.test('La respuesta de la cancelacion ya trae la nota de credito por el total, en revision manual', () => { const d = pm.response.json().data; pm.expect(d.reembolsoEstado).to.eql('PENDIENTE_REVISION_MANUAL'); pm.expect(Number(d.reembolsoMonto)).to.eql(Number(d.total)); });",
  ]),
  reembolsosDelAdmin('[pedido e] Una sola nota por cancelacion del Cliente', 'e', [
    "pm.test('Exactamente una nota por cancelacion del cliente', () => { pm.expect(notas).to.have.length(1); pm.expect(notas[0].motivo).to.eql('CANCELACION_CLIENTE'); });",
  ]),
  cancelarCliente('[pedido e] Cancelar dos veces es 409', 'e', 409, [mensajeEs('El pedido ya no se puede cancelar')]),
  aceptar('[pedido e] El Dueño no puede aceptar un pedido cancelado (409)', 'e', 409, [mensajeEs(MENSAJE_RESUELTO)]),
  rechazar('[pedido e] Ni rechazarlo (409)', 'e', 409, [mensajeEs(MENSAJE_RESUELTO)]),
  anular('[pedido e] Ni anularlo (409)', 'e', 409, { motivo: 'CERRADO' }, [mensajeEs(MENSAJE_NO_ANULABLE)]),
  reembolsosDelAdmin('[pedido e] Despues de los intentos repetidos sigue habiendo una sola nota', 'e', [
    "pm.test('Sigue habiendo una sola nota', () => pm.expect(notas).to.have.length(1));",
  ]),
);

agregar(
  ...crearPedido('f'),
  item(
    '[pedido f] El proceso de expiracion (corrido con una hora futura) expira el pedido sin respuesta',
    req('POST', '/test/jobs/pedidos/expirar-sin-respuesta', { body: {}, query: `ahora={{${v('ahora')}}}` }),
    [status(200)],
    [guardar(v('ahora'), "new Date(Date.now() + 5 * 60 * 60000).toISOString().slice(0, 19)")],
  ),
  pedidoDelCliente('f', ["pm.test('El pedido esta EXPIRADO con su reembolso en gestion', () => { pm.expect(p.estado).to.eql('EXPIRADO'); pm.expect(p.reembolsoEstado).to.eql('PENDIENTE_REVISION_MANUAL'); });"]),
  aceptar('[pedido f] Aceptar un pedido expirado es 409', 'f', 409, [mensajeEs(MENSAJE_RESUELTO)]),
  item('[pedido f] Correr el proceso otra vez no repite nada', req('POST', '/test/jobs/pedidos/expirar-sin-respuesta', { body: {}, query: `ahora={{${v('ahora')}}}` }), [status(200)]),
  reembolsosDelAdmin('[pedido f] Una sola nota por expiracion', 'f', [
    "pm.test('Exactamente una nota por expiracion', () => { pm.expect(notas).to.have.length(1); pm.expect(notas[0].motivo).to.eql('EXPIRACION_SIN_RESPUESTA'); });",
  ]),
  avisosDelCliente('[pedido f] El Cliente recibio un solo aviso de expiracion', 'f', [
    "pm.test('Un solo aviso', () => pm.expect(avisos.filter((a) => a.mensaje.includes('no respondió'))).to.have.length(1));",
  ]),
);

const URL_BASE = `https://res.cloudinary.com/{{${v('cloud')}}}/image/upload/v1`;
const fotoDelComercio = (nombre, carpeta, codigo, extra = []) =>
  item(nombre, req('PUT', '/comercios/perfil/foto', { token: TOKEN_DUENO, comercio: COM, rawBody: `{"url": "${URL_BASE}/${carpeta}/a0-{{${v('archivo')}}}.png"}` }), [status(codigo), ...extra]);
const imagenDeProducto = (nombre, carpeta, codigo, extra = []) =>
  item(nombre, req('POST', `/productos/{{${v('prod')}}}/imagenes`, { token: TOKEN_DUENO, comercio: COM, rawBody: `{"url": "${URL_BASE}/${carpeta}/a0-{{${v('archivo')}}}.png", "orden": 0, "esPrincipal": true}` }), [status(codigo), ...extra]);
const urlDeImagen = (nombre, carpeta, codigo, extra = []) =>
  item(nombre, req('PATCH', `/productos/{{${v('prod')}}}/imagenes/{{${v('img')}}}/url`, { token: TOKEN_DUENO, comercio: COM, rawBody: `{"url": "${URL_BASE}/${carpeta}/a0-{{${v('archivo')}}}.png"}` }), [status(codigo), ...extra]);

agregar(
  item(
    '[fotos] Se obtiene la cuenta de Cloudinary y el nombre de archivo de la corrida',
    req('POST', '/comercios/perfil/foto/firma', { token: TOKEN_DUENO, comercio: COM, body: {} }),
    [status(200), guardar(v('cloud'), 'pm.response.json().data.cloudName')],
    [guardar(v('archivo'), "Date.now().toString(36)")],
  ),
  fotoDelComercio('[fotos] La foto del comercio de la carpeta de otro comercio es 400', 'comercios/999999/perfil', 400),
  fotoDelComercio('[fotos] La foto del comercio de la carpeta del pre-registro es 400', 'comercios/pre-registro', 400),
  item('[fotos] La foto del comercio de la carpeta de un producto es 400', req('PUT', '/comercios/perfil/foto', {
    token: TOKEN_DUENO,
    comercio: COM,
    rawBody: `{"url": "${URL_BASE}/productos/${COM}/{{${v('prod')}}}/a0-{{${v('archivo')}}}.png"}`,
  }), [status(400)]),
  item('[fotos] La foto del comercio de otra cuenta de Cloudinary es 400', req('PUT', '/comercios/perfil/foto', {
    token: TOKEN_DUENO,
    comercio: COM,
    rawBody: `{"url": "https://res.cloudinary.com/otra-cuenta-a0/image/upload/v1/comercios/${COM}/perfil/a0.png"}`,
  }), [status(400)]),
  item('[fotos] La foto del comercio de su propia carpeta es 200', req('PUT', '/comercios/perfil/foto', {
    token: TOKEN_DUENO,
    comercio: COM,
    rawBody: `{"url": "${URL_BASE}/comercios/${COM}/perfil/a0-{{${v('archivo')}}}.png"}`,
  }), [status(200), "pm.test('Queda la foto nueva', () => pm.expect(pm.response.json().data.fotoPerfilUrl).to.include('/perfil/a0-'));"]),
  item('[fotos] La imagen de producto de otro comercio es 400', req('POST', `/productos/{{${v('prod')}}}/imagenes`, {
    token: TOKEN_DUENO,
    comercio: COM,
    rawBody: `{"url": "${URL_BASE}/productos/999999/{{${v('prod')}}}/a0-{{${v('archivo')}}}.png", "orden": 0, "esPrincipal": true}`,
  }), [status(400)]),
  item('[fotos] La imagen de producto de otro producto es 400', req('POST', `/productos/{{${v('prod')}}}/imagenes`, {
    token: TOKEN_DUENO,
    comercio: COM,
    rawBody: `{"url": "${URL_BASE}/productos/${COM}/999999/a0-{{${v('archivo')}}}.png", "orden": 0, "esPrincipal": true}`,
  }), [status(400)]),
  imagenDeProducto('[fotos] La imagen de producto de la carpeta de perfil del comercio es 400', 'comercios/999999/perfil', 400),
  item('[fotos] La imagen de producto de su carpeta es 201', req('POST', `/productos/{{${v('prod')}}}/imagenes`, {
    token: TOKEN_DUENO,
    comercio: COM,
    rawBody: `{"url": "${URL_BASE}/productos/${COM}/{{${v('prod')}}}/a0-{{${v('archivo')}}}.png", "orden": 0, "esPrincipal": true}`,
  }), [status(201), guardar(v('img'), 'pm.response.json().data.id')]),
  urlDeImagen('[fotos] Reemplazar la imagen por una de otra carpeta (recorte) es 400', 'comercios/999999/perfil', 400),
  item('[fotos] Reemplazar la imagen por otra de su carpeta (recorte) es 200', req('PATCH', `/productos/{{${v('prod')}}}/imagenes/{{${v('img')}}}/url`, {
    token: TOKEN_DUENO,
    comercio: COM,
    rawBody: `{"url": "${URL_BASE}/productos/${COM}/{{${v('prod')}}}/a0-recorte-{{${v('archivo')}}}.png"}`,
  }), [status(200), "pm.test('Queda la url nueva', () => pm.expect(pm.response.json().data.url).to.include('a0-recorte-'));"]),
);

const folder = { name: NOMBRE_FOLDER, item: items };

const collection = JSON.parse(fs.readFileSync(collectionPath, 'utf8'));
const idx = collection.item.findIndex((f) => f.name === NOMBRE_FOLDER);
if (idx >= 0) collection.item[idx] = folder;
else collection.item.push(folder);
fs.writeFileSync(collectionPath, JSON.stringify(collection, null, 2) + '\n', 'utf8');

const environment = JSON.parse(fs.readFileSync(environmentPath, 'utf8'));
const claves = [];
for (const c of ['d', 'c']) for (const s of ['email', 'usuario', 'password', 'dni', 'codigo']) claves.push(v(`${c}_${s}`));
claves.push(v('d_token'), v('c_token'), v('d_id'), v('com'), v('cat'), v('cat_nombre'), v('prod'), v('cuit_tmp'), v('dni_rep_tmp'), v('ahora'), v('cloud'), v('archivo'), v('img'));
for (const clave of ['a', 'b', 'c', 'd', 'e', 'f']) claves.push(v(`ped_${clave}`));
const existentes = new Set(environment.values.map((x) => x.key));
for (const key of claves) {
  if (!existentes.has(key)) environment.values.push({ key, value: '', type: 'default', enabled: true });
}
fs.writeFileSync(environmentPath, JSON.stringify(environment, null, 2) + '\n', 'utf8');

console.log(`OK: carpeta "${NOMBRE_FOLDER}" con ${folder.item.length} requests.`);
