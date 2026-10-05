import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const collectionPath = path.resolve(__dirname, '../../../postman/Bajonea-MVP.postman_collection.json');
const environmentPath = path.resolve(__dirname, '../../../postman/Bajonea-Local.postman_environment.json');

const NOMBRE_FOLDER = '53 - Cierre manual C1 (cerrar, abrir, fuera de horario, efecto en pedidos y reapertura automatica)';
const HEADER = 'X-Comercio-Id';
const MENSAJE_FUERA_DE_HORARIO = 'Solo podés abrir o cerrar dentro de tu horario';
const MENSAJE_NO_OPERATIVO = 'Este comercio no está operativo';
const MENSAJE_CERRADO_MANUAL = 'Este comercio está cerrado en este momento';
const TEXTO_REAPERTURA_MANANA = 'Reabre mañana a las 00:00';
const CUENTA_A = 'c1-cuenta-a';
const PLACEHOLDER_HORARIOS_FUERA = '__HORARIOS_FUERA__';

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
  { s: 'a', cuit: cuitValido('3091070011'), dni: '30910401', horarios: 'abierto' },
  { s: 'b', cuit: cuitValido('3091070021'), dni: '30910402', horarios: 'fuera' },
  { s: 'c', cuit: cuitValido('3091070061'), dni: '30910403', horarios: 'abierto' },
  { s: 'p', cuit: cuitValido('3091070071'), dni: '30910404', horarios: 'abierto' },
];

const v = (s, sufijo) => `c1_u${s}_${sufijo}`;
const tok = (s) => `c1_token_u${s}`;
const conComercio = (variable) => ({ [HEADER]: `{{${variable}}}` });

function req(method, urlPath, { body, token, headers = {}, query, rawBody } = {}) {
  const header = [];
  if (token) header.push({ key: 'Authorization', value: `Bearer {{${token}}}` });
  if (body !== undefined || rawBody !== undefined) header.push({ key: 'Content-Type', value: 'application/json' });
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
  if (rawBody !== undefined) {
    request.body = { mode: 'raw', raw: rawBody, options: { raw: { language: 'json' } } };
  } else if (body !== undefined) {
    request.body = { mode: 'raw', raw: JSON.stringify(body, null, 2), options: { raw: { language: 'json' } } };
  }
  return request;
}

function item(name, request, testLines = [], preRequestLines = []) {
  const event = [];
  if (preRequestLines.length) event.push({ listen: 'prerequest', script: { type: 'text/javascript', exec: preRequestLines } });
  if (testLines.length) event.push({ listen: 'test', script: { type: 'text/javascript', exec: testLines } });
  return { name, request, response: [], event };
}

const status = (codigo) => `pm.test('Status code es ${codigo}', () => pm.response.to.have.status(${codigo}));`;
const guardar = (variable, expr) => `pm.environment.set('${variable}', ${expr});`;
const mensajeEs = (texto) => `pm.test('El mensaje es "${texto}"', () => pm.expect(pm.response.json().mensaje).to.eql(${JSON.stringify(texto)}));`;

const horariosTodosLosDias = ['LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO', 'DOMINGO'].map((diaSemana) => ({
  diaSemana,
  horaApertura: '00:00:00',
  horaCierre: '23:59:00',
}));

const preRequestHorariosFuera = [
  "const dias = ['DOMINGO', 'LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO'];",
  'const hoy = new Date(Date.now() - 3 * 3600 * 1000).getUTCDay();',
  "const franjas = dias.filter((_, i) => i !== hoy).map((diaSemana) => ({ diaSemana, horaApertura: '00:00:00', horaCierre: '23:59:00' }));",
  "pm.environment.set('c1_horarios_fuera', JSON.stringify(franjas));",
];

function registroDueno({ s, cuit, dni, horarios }) {
  return {
    razonSocial: `Cierre Manual Postman ${s} SRL`,
    cuit,
    condicionIva: 'RESPONSABLE_INSCRIPTO',
    tipoSociedad: 'SRL',
    domicilioFiscal: `Direccion fiscal C1 ${s} 100`,
    fechaInicioActividades: '2020-01-01',
    nombre: `Local Cierre Manual ${s}`,
    descripcion: 'Comercio generado por la coleccion de Postman (cierre manual)',
    telefono: '+5492964555444',
    emailContacto: `contacto.c1u${s}@bajonea.test`,
    tipoComercio: 'RESTAURANTE',
    aceptaDelivery: false,
    aceptaRetiro: true,
    nombreUsuario: `{{${v(s, 'usuario')}}}`,
    email: `{{${v(s, 'email')}}}`,
    password: `{{${v(s, 'password')}}}`,
    direccion: { calle: 'Belgrano', numero: '800', pisoDepto: null, codigoPostal: '9420', localidadId: '{{localidad_id}}', principal: false },
    horarios: horarios === 'fuera' ? PLACEHOLDER_HORARIOS_FUERA : horariosTodosLosDias,
    nombreRepresentante: 'Carlos',
    apellidoRepresentante: 'Sanchez',
    dniRepresentante: dni,
    telefonoRepresentante: '+5492964701103',
    fechaNacimientoRepresentante: '1988-04-04',
    fotoPerfilUrl: `https://res.cloudinary.com/demo/image/upload/postman-cierre-${s}.jpg`,
    redesSociales: [{ tipo: 'INSTAGRAM', url: `instagram.com/cierremanual${s}` }],
  };
}

function cuerpoRegistro(dueno) {
  const raw = JSON.stringify(registroDueno(dueno), null, 2);
  return raw.replace(`"${PLACEHOLDER_HORARIOS_FUERA}"`, '{{c1_horarios_fuera}}');
}

const items = [];

items.push(
  item('Login Administrador (sesion propia de esta carpeta)', req('POST', '/auth/login', { body: { nombreUsuario: '{{admin_usuario}}', password: '{{admin_password}}' } }), [
    status(200),
    guardar('token_admin', 'pm.response.json().data.token'),
  ]),
  item('Crear la categoria de los productos de esta carpeta', req('POST', '/categorias', { token: 'token_admin', body: { nombre: 'Categoria C1 Postman' } }), [
    status(201),
    guardar('c1_categoria_id', 'pm.response.json().data.id'),
  ]),
);

function altaDeDueno(dueno) {
  const { s } = dueno;
  const registro = item(
    `Registro Dueño ${s}`,
    req('POST', '/auth/registro/comercio', { rawBody: cuerpoRegistro(dueno) }),
    [status(201)],
    dueno.horarios === 'fuera' ? preRequestHorariosFuera : [],
  );
  return [
    registro,
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
    item(`Login Dueño ${s}`, req('POST', '/auth/login', { body: { nombreUsuario: `{{${v(s, 'usuario')}}}`, password: `{{${v(s, 'password')}}}` } }), [
      status(200),
      guardar(tok(s), 'pm.response.json().data.token'),
      guardar(v(s, 'dueno'), 'pm.response.json().data.usuario.id'),
    ]),
  ];
}

const aprobar = (s) =>
  item(`Administrador aprueba el comercio del Dueño ${s}`, req('PUT', `/administrador/comercios/{{${v(s, 'com')}}}/resolver`, { token: 'token_admin', body: { aprobar: true } }), [status(200)]);

const vincular = (s, cuenta) =>
  item(`Dueño ${s} vincula Mercado Pago (simulada)`, req('POST', `/test/duenos/{{${v(s, 'dueno')}}}/mercadopago-simulada`, { body: {}, query: `mpUserId=${cuenta}` }), [status(200)]);

for (const dueno of DUENOS) {
  items.push(...altaDeDueno(dueno));
  if (dueno.s === 'a') items.push(vincular('a', CUENTA_A));
  if (dueno.s !== 'p') items.push(aprobar(dueno.s));
}

const registrarCliente = (n, dni) => [
  item(`Registro Cliente ${n}`, req('POST', '/auth/registro/cliente', {
    body: {
      nombre: 'Cliente',
      apellido: n === 1 ? 'CierreUno' : 'CierreDos',
      dni,
      fechaNacimiento: '1995-05-20',
      telefono: '+5492964555000',
      nombreUsuario: `{{c1_cliente${n}_usuario}}`,
      email: `{{c1_cliente${n}_email}}`,
      password: `{{c1_cliente${n}_password}}`,
      direccion: { calle: 'Calle Siempre Viva', numero: '123', pisoDepto: null, codigoPostal: '9420', localidadId: '{{localidad_id}}', principal: true },
    },
  }), [status(201)]),
  item(`Bypass test - codigo de verificacion Cliente ${n}`, req('GET', '/test/token-verificacion', { query: `email={{c1_cliente${n}_email}}` }), [
    status(200),
    guardar(`c1_cliente${n}_codigo`, 'pm.response.json().data'),
  ]),
  item(`Verificar cuenta Cliente ${n}`, req('POST', '/auth/verificar', { body: { email: `{{c1_cliente${n}_email}}`, codigo: `{{c1_cliente${n}_codigo}}` } }), [status(200)]),
  item(`Login Cliente ${n}`, req('POST', '/auth/login', { body: { nombreUsuario: `{{c1_cliente${n}_usuario}}`, password: `{{c1_cliente${n}_password}}` } }), [
    status(200),
    guardar(`c1_token_cliente${n}`, 'pm.response.json().data.token'),
  ]),
];

items.push(...registrarCliente(1, '30910410'), ...registrarCliente(2, '30910411'));

items.push(
  item('Producto del comercio A', req('POST', '/productos', {
    token: tok('a'),
    headers: conComercio(v('a', 'com')),
    body: { nombre: 'Producto C1 A', precio: 1500, categoriaId: '{{c1_categoria_id}}' },
  }), [status(201), guardar(v('a', 'prod'), 'pm.response.json().data.id')]),
);

const cerrar = (nombre, token, headers, esperado, testLines = []) =>
  item(nombre, req('PUT', '/comercios/cerrar', { token, headers }), [status(esperado), ...testLines]);

const abrir = (nombre, token, headers, esperado, testLines = []) =>
  item(nombre, req('PUT', '/comercios/abrir', { token, headers }), [status(esperado), ...testLines]);

const estadoDeApertura = (cerradoManualmente, abiertoAhora, puedeCambiarCierre) =>
  `pm.test('cerradoManualmente=${cerradoManualmente}, abiertoAhora=${abiertoAhora}, puedeCambiarCierre=${puedeCambiarCierre}', () => { const d = pm.response.json().data; pm.expect(d.cerradoManualmente).to.eql(${cerradoManualmente}); pm.expect(d.abiertoAhora).to.eql(${abiertoAhora}); pm.expect(d.puedeCambiarCierre).to.eql(${puedeCambiarCierre}); });`;

const perfil = (nombre, s, cerradoManualmente, abiertoAhora, puedeCambiarCierre, texto) =>
  item(nombre, req('GET', '/comercios/perfil', { token: tok(s), headers: conComercio(v(s, 'com')) }), [
    status(200),
    estadoDeApertura(cerradoManualmente, abiertoAhora, puedeCambiarCierre),
    `pm.test('textoReapertura', () => pm.expect(pm.response.json().data.textoReapertura).to.eql(${JSON.stringify(texto)}));`,
  ]);

const publicoDe = (nombre, s, estadoApertura, texto) =>
  item(nombre, req('GET', '/catalogo/comercios'), [
    status(200),
    `const c = pm.response.json().data.find((x) => x.id === Number(pm.environment.get('${v(s, 'com')}')));`,
    `pm.test('El comercio esta en el catalogo con estadoApertura ${estadoApertura}', () => { pm.expect(c).to.exist; pm.expect(c.estadoApertura).to.eql('${estadoApertura}'); pm.expect(c.textoReapertura).to.eql(${JSON.stringify(texto)}); pm.expect(c.estado).to.eql('APTO_VENTA'); });`,
  ]);

items.push(
  perfil('[perfil] A abierto: no esta cerrado, se puede cambiar y no hay texto', 'a', false, true, true, null),
  publicoDe('[catalogo] A figura ABIERTO', 'a', 'ABIERTO', null),

  cerrar('[validaciones] Cerrar sin X-Comercio-Id: 400', tok('a'), {}, 400),
  cerrar('[validaciones] Cerrar con X-Comercio-Id no numerico: 400', tok('a'), { [HEADER]: 'abc' }, 400),
  cerrar('[validaciones] Cerrar con el comercio de otro Dueño: 404', tok('c'), conComercio(v('a', 'com')), 404),
  abrir('[validaciones] Abrir sin X-Comercio-Id: 400', tok('a'), {}, 400),
  abrir('[validaciones] Abrir con el comercio de otro Dueño: 404', tok('c'), conComercio(v('a', 'com')), 404),
  cerrar('[validaciones] Cerrar sin token: 401', undefined, conComercio(v('a', 'com')), 401),
  cerrar('[validaciones] Cerrar siendo Cliente: 403', 'c1_token_cliente1', conComercio(v('a', 'com')), 403),
  abrir('[validaciones] Abrir siendo Administrador: 403', 'token_admin', conComercio(v('a', 'com')), 403),
  perfil('[validaciones] Los rechazos no cambiaron nada en A', 'a', false, true, true, null),

  item('[pedidos] Cliente 1 agrega un producto de A (A abierto)', req('POST', '/carrito/items', { token: 'c1_token_cliente1', body: { productoId: `{{${v('a', 'prod')}}}`, cantidad: 1 } }), [status(201)]),
  item('[pedidos] Cliente 2 agrega un producto de A (A abierto)', req('POST', '/carrito/items', { token: 'c1_token_cliente2', body: { productoId: `{{${v('a', 'prod')}}}`, cantidad: 1 } }), [status(201)]),
  item('[pedidos] Pedido del Cliente 2, A abierto', req('POST', '/pedidos/cliente', { token: 'c1_token_cliente2', body: { tipoEntrega: 'RETIRO', direccionId: null } }), [
    status(201),
    guardar('c1_ped2', 'pm.response.json().data.id'),
  ]),
  item('[pedidos] Se confirma el pago del pedido del Cliente 2', req('PUT', '/test/pedidos/{{c1_ped2}}/pago-aprobado', { body: {} }), [status(200)]),

  cerrar('[cerrar] A cierra su comercio dentro de la franja', tok('a'), conComercio(v('a', 'com')), 200, [
    estadoDeApertura(true, false, true),
    `pm.test('Texto de reapertura de mañana', () => pm.expect(pm.response.json().data.textoReapertura).to.eql(${JSON.stringify(TEXTO_REAPERTURA_MANANA)}));`,
  ]),
  cerrar('[cerrar] Cerrar de nuevo es idempotente: 200 con el mismo estado', tok('a'), conComercio(v('a', 'com')), 200, [
    estadoDeApertura(true, false, true),
  ]),
  perfil('[cerrar] El perfil de A refleja el cierre', 'a', true, false, true, TEXTO_REAPERTURA_MANANA),
  item('[cerrar] mis-comercios refleja el cierre', req('GET', '/comercios/mis-comercios', { token: tok('a') }), [
    status(200),
    `const c = pm.response.json().data.find((x) => x.id === Number(pm.environment.get('${v('a', 'com')}')));`,
    `pm.test('La fila trae los cuatro campos de apertura', () => { pm.expect(c.cerradoManualmente).to.eql(true); pm.expect(c.abiertoAhora).to.eql(false); pm.expect(c.puedeCambiarCierre).to.eql(true); pm.expect(c.textoReapertura).to.eql(${JSON.stringify(TEXTO_REAPERTURA_MANANA)}); });`,
  ]),
  publicoDe('[cerrar] El catalogo informa CERRADO_TEMPORALMENTE con el texto', 'a', 'CERRADO_TEMPORALMENTE', TEXTO_REAPERTURA_MANANA),

  item('[efecto] Cliente 1 no puede crear el pedido: 409 de cierre manual', req('POST', '/pedidos/cliente', { token: 'c1_token_cliente1', body: { tipoEntrega: 'RETIRO', direccionId: null } }), [
    status(409),
    mensajeEs(MENSAJE_CERRADO_MANUAL),
  ]),
  item('[efecto] Cliente 1 no puede agregar al carrito: 409 de cierre manual', req('POST', '/carrito/items', { token: 'c1_token_cliente1', body: { productoId: `{{${v('a', 'prod')}}}`, cantidad: 1 } }), [
    status(409),
    mensajeEs(MENSAJE_CERRADO_MANUAL),
  ]),
  item('[efecto] El pedido en curso sigue: A acepta el pedido del Cliente 2 estando cerrado', req('PUT', '/pedidos/comercio/{{c1_ped2}}/aceptar', { token: tok('a'), headers: conComercio(v('a', 'com')) }), [status(200)]),
  item('[efecto] A sigue pudiendo listar sus productos estando cerrado', req('GET', '/productos', { token: tok('a'), headers: conComercio(v('a', 'com')) }), [status(200)]),

  abrir('[abrir] A abre su comercio', tok('a'), conComercio(v('a', 'com')), 200, [estadoDeApertura(false, true, true), "pm.test('Sin texto de reapertura', () => pm.expect(pm.response.json().data.textoReapertura).to.eql(null));"]),
  abrir('[abrir] Abrir de nuevo es idempotente: 200 con el mismo estado', tok('a'), conComercio(v('a', 'com')), 200, [estadoDeApertura(false, true, true)]),
  item('[abrir] Cliente 1 ya puede crear el pedido', req('POST', '/pedidos/cliente', { token: 'c1_token_cliente1', body: { tipoEntrega: 'RETIRO', direccionId: null } }), [
    status(201),
    "pm.test('Nace PENDIENTE_PAGO', () => pm.expect(pm.response.json().data.estado).to.eql('PENDIENTE_PAGO'));",
  ]),
  publicoDe('[abrir] El catalogo vuelve a ABIERTO', 'a', 'ABIERTO', null),

  cerrar('[horario] B esta fuera de su franja: cerrar da 409', tok('b'), conComercio(v('b', 'com')), 409, [mensajeEs(MENSAJE_FUERA_DE_HORARIO)]),
  abrir('[horario] B esta fuera de su franja: abrir da 409', tok('b'), conComercio(v('b', 'com')), 409, [mensajeEs(MENSAJE_FUERA_DE_HORARIO)]),
  item('[horario] B sin vincular Mercado Pago queda APROBADO y fuera de horario', req('GET', '/comercios/perfil', { token: tok('b'), headers: conComercio(v('b', 'com')) }), [
    status(200),
    estadoDeApertura(false, false, false),
    `pm.test('Texto de reapertura de mañana', () => pm.expect(pm.response.json().data.textoReapertura).to.eql(${JSON.stringify(TEXTO_REAPERTURA_MANANA)}));`,
  ]),

  cerrar('[no operativo] P, con el comercio pendiente: cerrar da 409', tok('p'), conComercio(v('p', 'com')), 409, [mensajeEs(MENSAJE_NO_OPERATIVO)]),
  abrir('[no operativo] P, con el comercio pendiente: abrir da 409', tok('p'), conComercio(v('p', 'com')), 409, [mensajeEs(MENSAJE_NO_OPERATIVO)]),

  cerrar('[job] A vuelve a cerrar para probar la reapertura', tok('a'), conComercio(v('a', 'com')), 200, [estadoDeApertura(true, false, true)]),
  item('[job] Con el reloj real el job no reabre a A', req('POST', '/test/jobs/reapertura-comercios', { body: {} }), [
    status(200),
  ]),
  perfil('[job] A sigue cerrado', 'a', true, false, true, TEXTO_REAPERTURA_MANANA),
  item(
    '[job] Con la hora de pasado manana el job reabre a A',
    req('POST', '/test/jobs/reapertura-comercios', { body: {}, query: 'ahora={{c1_ahora_pasado_manana}}' }),
    [
      status(200),
      "pm.test('Reabrio al menos un comercio', () => pm.expect(pm.response.json().data).to.be.at.least(1));",
    ],
    [
      'const m = new Date(Date.now() - 3 * 3600 * 1000 + 2 * 24 * 3600 * 1000);',
      "pm.environment.set('c1_ahora_pasado_manana', m.toISOString().slice(0, 19));",
    ],
  ),
  perfil('[job] A quedo abierto otra vez', 'a', false, true, true, null),
  item('[job] Abrir tras la reapertura automatica es idempotente', req('PUT', '/comercios/abrir', { token: tok('a'), headers: conComercio(v('a', 'com')) }), [
    status(200),
    estadoDeApertura(false, true, true),
  ]),
);

const preRequestHorariosFueraAdicional = [
  "const dias = ['DOMINGO', 'LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO'];",
  'const hoy = new Date(Date.now() - 3 * 3600 * 1000).getUTCDay();',
  "const franjas = dias.filter((_, i) => i !== hoy).map((diaSemana) => ({ diaSemana, horaApertura: '00:00:00', horaCierre: '23:59:00' }));",
  "pm.environment.set('c1_horarios_fuera_adicional', JSON.stringify(franjas));",
];

function cuerpoAdicional(nombre, horarios, instagram) {
  const raw = JSON.stringify({
    nombre,
    descripcion: 'Comercio adicional del cierre masivo generado por la coleccion de Postman',
    telefono: '+5492964555444',
    emailContacto: `contacto.${instagram}@bajonea.test`,
    tipoComercio: 'RESTAURANTE',
    aceptaDelivery: false,
    aceptaRetiro: true,
    fotoPerfilUrl: '{{c1_foto_adicional_url}}',
    direccion: { calle: 'Elcano', numero: '950', pisoDepto: null, codigoPostal: '9420', localidadId: '{{localidad_id}}', principal: false },
    horarios,
    redesSociales: [{ tipo: 'INSTAGRAM', url: `instagram.com/${instagram}` }],
  }, null, 2);
  return raw.replace('"__HORARIOS_ADICIONAL__"', '{{c1_horarios_fuera_adicional}}');
}

items.push(
  item('[masivo] A firma la foto de sus comercios adicionales', req('POST', '/comercios/nuevo/foto/firma', { token: tok('a') }), [
    status(200),
    "const d = pm.response.json().data;",
    guardar('c1_foto_adicional_url', "'https://res.cloudinary.com/' + d.cloudName + '/image/upload/v1/' + d.folder + 'postman-cierre-masivo.png'"),
  ]),
  item('[masivo] A da de alta un comercio adicional con horario que no cubre el momento actual', req('POST', '/comercios', {
    token: tok('a'),
    rawBody: cuerpoAdicional('Masivo Fuera de Horario', '__HORARIOS_ADICIONAL__', 'masivofuera'),
  }), [status(201), guardar('c1_masivo_fuera_com', 'pm.response.json().data.id')], preRequestHorariosFueraAdicional),
  item('[masivo] A da de alta un comercio adicional con horario de todos los dias', req('POST', '/comercios', {
    token: tok('a'),
    rawBody: cuerpoAdicional('Masivo Ya Cerrado', horariosTodosLosDias, 'masivocerrado'),
  }), [status(201), guardar('c1_masivo_cerrado_com', 'pm.response.json().data.id')]),
  item('[masivo] Administrador aprueba el adicional fuera de horario: nace APTO_VENTA por la cuenta de A', req('PUT', '/administrador/comercios/{{c1_masivo_fuera_com}}/resolver', { token: 'token_admin', body: { aprobar: true } }), [status(200)]),
  item('[masivo] Administrador aprueba el adicional de todos los dias: nace APTO_VENTA por la cuenta de A', req('PUT', '/administrador/comercios/{{c1_masivo_cerrado_com}}/resolver', { token: 'token_admin', body: { aprobar: true } }), [status(200)]),
  cerrar('[masivo] El tercer comercio se cierra a mano antes del cierre masivo', tok('a'), conComercio('c1_masivo_cerrado_com'), 200, [estadoDeApertura(true, false, true)]),

  cerrar('[masivo] Cierre masivo 1/3: el comercio abierto en franja responde 200', tok('a'), conComercio(v('a', 'com')), 200, [estadoDeApertura(true, false, true)]),
  cerrar('[masivo] Cierre masivo 2/3: el comercio fuera de horario responde 409', tok('a'), conComercio('c1_masivo_fuera_com'), 409, [mensajeEs(MENSAJE_FUERA_DE_HORARIO)]),
  cerrar('[masivo] Cierre masivo 3/3: el comercio ya cerrado responde 200 idempotente', tok('a'), conComercio('c1_masivo_cerrado_com'), 200, [estadoDeApertura(true, false, true)]),
  item('[masivo] mis-comercios deja el estado final de los tres', req('GET', '/comercios/mis-comercios', { token: tok('a') }), [
    status(200),
    "const lista = pm.response.json().data;",
    `const por = (variable) => lista.find((x) => x.id === Number(pm.environment.get(variable)));`,
    "pm.test('El abierto en franja quedo cerrado a mano', () => { const c = por('c1_ua_com'); pm.expect(c.cerradoManualmente).to.eql(true); pm.expect(c.abiertoAhora).to.eql(false); pm.expect(c.puedeCambiarCierre).to.eql(true); });",
    "pm.test('El fuera de horario no cambio y no se puede cambiar', () => { const c = por('c1_masivo_fuera_com'); pm.expect(c.cerradoManualmente).to.eql(false); pm.expect(c.abiertoAhora).to.eql(false); pm.expect(c.puedeCambiarCierre).to.eql(false); });",
    "pm.test('El ya cerrado sigue cerrado', () => { const c = por('c1_masivo_cerrado_com'); pm.expect(c.cerradoManualmente).to.eql(true); pm.expect(c.abiertoAhora).to.eql(false); pm.expect(c.puedeCambiarCierre).to.eql(true); });",
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
  c1_categoria_id: '',
  c1_horarios_fuera: '',
  c1_ahora_pasado_manana: '',
  c1_ped2: '',
  c1_foto_adicional_url: '',
  c1_horarios_fuera_adicional: '',
  c1_masivo_fuera_com: '',
  c1_masivo_cerrado_com: '',
};
for (const n of [1, 2]) {
  variables[`c1_cliente${n}_email`] = `postman.c1cliente${n}@bajonea.test`;
  variables[`c1_cliente${n}_usuario`] = `postmanc1cliente${n}`;
  variables[`c1_cliente${n}_password`] = 'Postman123';
  variables[`c1_cliente${n}_codigo`] = '';
  variables[`c1_token_cliente${n}`] = '';
}
for (const { s } of DUENOS) {
  variables[v(s, 'email')] = `postman.c1u${s}@bajonea.test`;
  variables[v(s, 'usuario')] = `postmanc1u${s}`;
  variables[v(s, 'password')] = 'Postman123';
  for (const sufijo of ['codigo', 'dueno', 'com', 'prod']) variables[v(s, sufijo)] = '';
  variables[tok(s)] = '';
}
const existentes = new Set(environment.values.map((x) => x.key));
for (const [key, value] of Object.entries(variables)) {
  if (!existentes.has(key)) environment.values.push({ key, value, type: 'default', enabled: true });
}
fs.writeFileSync(environmentPath, JSON.stringify(environment, null, 2) + '\n', 'utf8');

console.log(`OK: carpeta "${NOMBRE_FOLDER}" con ${items.length} requests.`);
