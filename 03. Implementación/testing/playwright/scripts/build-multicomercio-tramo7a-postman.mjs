import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const collectionPath = path.resolve(__dirname, '../../../postman/Bajonea-MVP.postman_collection.json');
const environmentPath = path.resolve(__dirname, '../../../postman/Bajonea-Local.postman_environment.json');

const NOMBRE_FOLDER = '54 - Cierre manual C2 (bloqueo del Dueño, catalogo con comercios cerrados temporalmente, 409 y restauracion)';
const HEADER = 'X-Comercio-Id';
const MENSAJE_CERRADO = 'Este comercio está cerrado en este momento';
const CUENTA_A = 'c2-cuenta-a';
const CUENTA_B = 'c2-cuenta-b';
const PASSWORD_NUEVA = 'Postman456';

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
  { s: 'a', cuit: cuitValido('3092070011'), dni: '30920401', cuenta: CUENTA_A },
  { s: 'b', cuit: cuitValido('3092070021'), dni: '30920402', cuenta: CUENTA_B },
];

const v = (s, sufijo) => `c2_u${s}_${sufijo}`;
const tok = (s) => `c2_token_u${s}`;
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

function registroDueno({ s, cuit, dni }) {
  return {
    razonSocial: `Bloqueo Dueño Postman ${s} SRL`,
    cuit,
    condicionIva: 'RESPONSABLE_INSCRIPTO',
    tipoSociedad: 'SRL',
    domicilioFiscal: `Direccion fiscal C2 ${s} 100`,
    fechaInicioActividades: '2020-01-01',
    nombre: `Local Bloqueo ${s}`,
    descripcion: 'Comercio generado por la coleccion de Postman (bloqueo del Dueño)',
    telefono: '+5492964555444',
    emailContacto: `contacto.c2u${s}@bajonea.test`,
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
    fotoPerfilUrl: `https://res.cloudinary.com/demo/image/upload/postman-bloqueo-${s}.jpg`,
    redesSociales: [{ tipo: 'INSTAGRAM', url: `instagram.com/bloqueoc2${s}` }],
  };
}

const items = [];

items.push(
  item('Login Administrador (sesion propia de esta carpeta)', req('POST', '/auth/login', { body: { nombreUsuario: '{{admin_usuario}}', password: '{{admin_password}}' } }), [
    status(200),
    guardar('token_admin', 'pm.response.json().data.token'),
  ]),
  item('Crear la categoria de los productos de esta carpeta', req('POST', '/categorias', { token: 'token_admin', body: { nombre: 'Categoria C2 Postman' } }), [
    status(201),
    guardar('c2_categoria_id', 'pm.response.json().data.id'),
  ]),
);

function altaDeDueno(dueno) {
  const { s, cuenta } = dueno;
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
    item(`Login Dueño ${s}`, req('POST', '/auth/login', { body: { nombreUsuario: `{{${v(s, 'usuario')}}}`, password: `{{${v(s, 'password')}}}` } }), [
      status(200),
      guardar(tok(s), 'pm.response.json().data.token'),
      guardar(v(s, 'dueno'), 'pm.response.json().data.usuario.id'),
    ]),
    item(`Dueño ${s} vincula Mercado Pago (simulada)`, req('POST', `/test/duenos/{{${v(s, 'dueno')}}}/mercadopago-simulada`, { body: {}, query: `mpUserId=${cuenta}` }), [status(200)]),
    item(`Administrador aprueba el comercio del Dueño ${s}`, req('PUT', `/administrador/comercios/{{${v(s, 'com')}}}/resolver`, { token: 'token_admin', body: { aprobar: true } }), [status(200)]),
  ];
}

for (const dueno of DUENOS) items.push(...altaDeDueno(dueno));

items.push(
  item('Producto del comercio A', req('POST', '/productos', {
    token: tok('a'),
    headers: conComercio(v('a', 'com')),
    body: { nombre: 'Producto C2 A', precio: 1500, categoriaId: '{{c2_categoria_id}}' },
  }), [status(201), guardar(v('a', 'prod'), 'pm.response.json().data.id')]),
  item('Clonar el comercio A como APROBADO sin cobro (fixture de test)', req('POST', `/test/comercios/{{${v('a', 'com')}}}/clonar`, {
    body: {},
    query: 'nombre=Sin-cobro-C2-Postman&estado=APROBADO',
  }), [status(201), guardar('c2_ua_sin_cobro', 'pm.response.json().data')]),
);

const registrarCliente = (n, dni) => [
  item(`Registro Cliente ${n}`, req('POST', '/auth/registro/cliente', {
    body: {
      nombre: 'Cliente',
      apellido: n === 1 ? 'BloqueoUno' : 'BloqueoDos',
      dni,
      fechaNacimiento: '1995-05-20',
      telefono: '+5492964555000',
      nombreUsuario: `{{c2_cliente${n}_usuario}}`,
      email: `{{c2_cliente${n}_email}}`,
      password: `{{c2_cliente${n}_password}}`,
      direccion: { calle: 'Calle Siempre Viva', numero: '123', pisoDepto: null, codigoPostal: '9420', localidadId: '{{localidad_id}}', principal: true },
    },
  }), [status(201)]),
  item(`Bypass test - codigo de verificacion Cliente ${n}`, req('GET', '/test/token-verificacion', { query: `email={{c2_cliente${n}_email}}` }), [
    status(200),
    guardar(`c2_cliente${n}_codigo`, 'pm.response.json().data'),
  ]),
  item(`Verificar cuenta Cliente ${n}`, req('POST', '/auth/verificar', { body: { email: `{{c2_cliente${n}_email}}`, codigo: `{{c2_cliente${n}_codigo}}` } }), [status(200)]),
  item(`Login Cliente ${n}`, req('POST', '/auth/login', { body: { nombreUsuario: `{{c2_cliente${n}_usuario}}`, password: `{{c2_cliente${n}_password}}` } }), [
    status(200),
    guardar(`c2_token_cliente${n}`, 'pm.response.json().data.token'),
  ]),
];

items.push(...registrarCliente(1, '30920410'), ...registrarCliente(2, '30920411'));

items.push(
  item('Cliente 1 agrega el producto de A al carrito antes del bloqueo', req('POST', '/carrito/items', {
    token: 'c2_token_cliente1',
    body: { productoId: `{{${v('a', 'prod')}}}`, cantidad: 1 },
  }), [status(201)]),
  item('Dueño B cierra su comercio a mano antes del bloqueo', req('PUT', '/comercios/cerrar', { token: tok('b'), headers: conComercio(v('b', 'com')) }), [
    status(200),
    "pm.test('Queda cerrado a mano', () => pm.expect(pm.response.json().data.cerradoManualmente).to.eql(true));",
  ]),
);

const publicoDe = (nombre, variableComercio, expresionesTest) =>
  item(nombre, req('GET', '/catalogo/comercios'), [
    status(200),
    `const c = pm.response.json().data.find((x) => x.id === Number(pm.environment.get('${variableComercio}')));`,
    ...expresionesTest,
  ]);

const ausenteDelCatalogo = (nombre, variableComercio) =>
  item(nombre, req('GET', '/catalogo/comercios'), [
    status(200),
    `pm.test('No esta en el catalogo', () => pm.expect(pm.response.json().data.map((x) => x.id)).to.not.include(Number(pm.environment.get('${variableComercio}'))));`,
  ]);

items.push(
  publicoDe('[antes] El comercio de A esta abierto en el catalogo con estado APTO_VENTA', v('a', 'com'), [
    "pm.test('Esta en el catalogo', () => pm.expect(c).to.exist);",
    "pm.test('Estado publico APTO_VENTA y abierto', () => { pm.expect(c.estado).to.eql('APTO_VENTA'); pm.expect(c.estadoApertura).to.eql('ABIERTO'); });",
  ]),
  ausenteDelCatalogo('[antes] El comercio APROBADO sin cobro del Dueño A no esta en el catalogo', 'c2_ua_sin_cobro'),
);

const loginFallido = (nombre, s, restantes) =>
  item(nombre, req('POST', '/auth/login', { body: { nombreUsuario: `{{${v(s, 'usuario')}}}`, password: 'PasswordMalaXX1' } }), [
    status(401),
    `pm.test('Quedan ${restantes} intentos', () => pm.expect(pm.response.json().data.intentosRestantes).to.eql(${restantes}));`,
  ]);

for (const s of ['a', 'b']) {
  items.push(
    loginFallido(`[bloqueo ${s}] Login del Dueño ${s} con password incorrecta (intento 1/3)`, s, 2),
    loginFallido(`[bloqueo ${s}] Login del Dueño ${s} con password incorrecta (intento 2/3)`, s, 1),
    loginFallido(`[bloqueo ${s}] Login del Dueño ${s} con password incorrecta (intento 3/3): bloquea`, s, 0),
    item(`[bloqueo ${s}] 4to intento con la password correcta: cuenta bloqueada`, req('POST', '/auth/login', {
      body: { nombreUsuario: `{{${v(s, 'usuario')}}}`, password: `{{${v(s, 'password')}}}` },
    }), [status(409)]),
  );
}

items.push(
  publicoDe('[despues] El comercio bloqueado de A sigue en el catalogo: estado APTO_VENTA, CERRADO_TEMPORALMENTE y sin texto de reapertura', v('a', 'com'), [
    "pm.test('Esta en el catalogo', () => pm.expect(c).to.exist);",
    "pm.test('Estado publico APTO_VENTA', () => pm.expect(c.estado).to.eql('APTO_VENTA'));",
    "pm.test('Informa CERRADO_TEMPORALMENTE', () => pm.expect(c.estadoApertura).to.eql('CERRADO_TEMPORALMENTE'));",
    "pm.test('No promete reapertura', () => pm.expect(c.textoReapertura).to.eql(null));",
  ]),
  publicoDe('[despues] El comercio de B (cierre manual previo + bloqueo) tambien informa CERRADO_TEMPORALMENTE sin texto', v('b', 'com'), [
    "pm.test('Esta en el catalogo', () => pm.expect(c).to.exist);",
    "pm.test('Estado publico APTO_VENTA', () => pm.expect(c.estado).to.eql('APTO_VENTA'));",
    "pm.test('Informa CERRADO_TEMPORALMENTE sin texto', () => { pm.expect(c.estadoApertura).to.eql('CERRADO_TEMPORALMENTE'); pm.expect(c.textoReapertura).to.eql(null); });",
  ]),
  ausenteDelCatalogo('[despues] El comercio APROBADO sin cobro sigue sin estar en el catalogo', 'c2_ua_sin_cobro'),
  item('[despues] Ningun comercio del catalogo informa un estado distinto de APTO_VENTA', req('GET', '/catalogo/comercios'), [
    status(200),
    "pm.test('Todos APTO_VENTA', () => pm.response.json().data.forEach((x) => pm.expect(x.estado).to.eql('APTO_VENTA')));",
  ]),
  item('[despues] Los productos del comercio bloqueado se listan (200)', req('GET', `/catalogo/comercios/{{${v('a', 'com')}}}/productos`), [
    status(200),
    `pm.test('Incluye el producto', () => pm.expect(pm.response.json().data.map((p) => p.id)).to.include(Number(pm.environment.get('${v('a', 'prod')}'))));`,
  ]),
  item('[despues] Los productos del comercio APROBADO sin cobro dan 404', req('GET', '/catalogo/comercios/{{c2_ua_sin_cobro}}/productos'), [status(404)]),
  item('[despues] Cliente 2 intenta agregar un producto del comercio bloqueado: 409', req('POST', '/carrito/items', {
    token: 'c2_token_cliente2',
    body: { productoId: `{{${v('a', 'prod')}}}`, cantidad: 1 },
  }), [status(409), mensajeEs(MENSAJE_CERRADO)]),
  item('[despues] Cliente 1 intenta confirmar el pedido del comercio bloqueado: 409', req('POST', '/pedidos/cliente', {
    token: 'c2_token_cliente1',
    body: { tipoEntrega: 'RETIRO', direccionId: null },
  }), [status(409), mensajeEs(MENSAJE_CERRADO)]),
);

for (const s of ['a', 'b']) {
  items.push(
    item(`[recuperacion ${s}] Solicitar recuperacion de contraseña`, req('POST', '/auth/recuperar-password', { body: { email: `{{${v(s, 'email')}}}` } }), [status(200)]),
    item(`[recuperacion ${s}] Bypass test - codigo de recuperacion`, req('GET', '/test/token', { query: `email={{${v(s, 'email')}}}&tipo=RECUPERACION_PASSWORD` }), [
      status(200),
      guardar(v(s, 'codigo_rec'), 'pm.response.json().data'),
    ]),
    item(`[recuperacion ${s}] Confirmar la recuperacion`, req('POST', '/auth/recuperar-password/confirmar', {
      body: { email: `{{${v(s, 'email')}}}`, codigo: `{{${v(s, 'codigo_rec')}}}`, nuevaPassword: PASSWORD_NUEVA },
    }), [status(200)]),
    item(`[recuperacion ${s}] Login del Dueño ${s} con la contraseña nueva`, req('POST', '/auth/login', {
      body: { nombreUsuario: `{{${v(s, 'usuario')}}}`, password: PASSWORD_NUEVA },
    }), [status(200), guardar(tok(s), 'pm.response.json().data.token')]),
  );
}

items.push(
  item('[restaurado] Mis comercios del Dueño A: el que vendia vuelve a APTO_VENTA y el sin cobro sigue APROBADO', req('GET', '/comercios/mis-comercios', { token: tok('a') }), [
    status(200),
    `const por = (variable) => pm.response.json().data.find((x) => x.id === Number(pm.environment.get(variable)));`,
    `pm.test('El comercio vuelve a APTO_VENTA y operativo', () => { pm.expect(por('${v('a', 'com')}').estado).to.eql('APTO_VENTA'); pm.expect(por('${v('a', 'com')}').operativo).to.eql(true); });`,
    "pm.test('El sin cobro sigue APROBADO', () => pm.expect(por('c2_ua_sin_cobro').estado).to.eql('APROBADO'));",
  ]),
  publicoDe('[restaurado] El comercio de A vuelve abierto al catalogo, sin texto de reapertura', v('a', 'com'), [
    "pm.test('Abierto otra vez', () => { pm.expect(c.estadoApertura).to.eql('ABIERTO'); pm.expect(c.textoReapertura).to.eql(null); });",
  ]),
  ausenteDelCatalogo('[restaurado] El comercio APROBADO sin cobro sigue sin estar en el catalogo', 'c2_ua_sin_cobro'),
  item('[restaurado] Cliente 1 confirma ahora el pedido del carrito que antes dio 409: 201', req('POST', '/pedidos/cliente', {
    token: 'c2_token_cliente1',
    body: { tipoEntrega: 'RETIRO', direccionId: null },
  }), [status(201), "pm.test('Nace pendiente de pago', () => pm.expect(pm.response.json().data.estado).to.eql('PENDIENTE_PAGO'));"]),
  item('[restaurado] Perfil del comercio de B: APTO_VENTA y el cierre manual previo sigue vigente', req('GET', '/comercios/perfil', { token: tok('b'), headers: conComercio(v('b', 'com')) }), [
    status(200),
    "pm.test('APTO_VENTA y cerrado a mano', () => { const d = pm.response.json().data; pm.expect(d.estado).to.eql('APTO_VENTA'); pm.expect(d.cerradoManualmente).to.eql(true); pm.expect(d.abiertoAhora).to.eql(false); });",
  ]),
  publicoDe('[restaurado] El comercio de B sigue cerrado a mano en el catalogo, ahora con texto de reapertura', v('b', 'com'), [
    "pm.test('Cerrado a mano y con texto', () => { pm.expect(c.estadoApertura).to.eql('CERRADO_TEMPORALMENTE'); pm.expect(c.textoReapertura).to.match(/^Reabre /); });",
  ]),
);

const folder = { name: NOMBRE_FOLDER, item: items };

const collection = JSON.parse(fs.readFileSync(collectionPath, 'utf8'));
const idx = collection.item.findIndex((f) => f.name === NOMBRE_FOLDER);
if (idx >= 0) collection.item[idx] = folder;
else collection.item.push(folder);
fs.writeFileSync(collectionPath, JSON.stringify(collection, null, 2) + '\n', 'utf8');

const environment = JSON.parse(fs.readFileSync(environmentPath, 'utf8'));
const variables = { c2_categoria_id: '', c2_ua_sin_cobro: '' };
for (const n of [1, 2]) {
  variables[`c2_cliente${n}_email`] = `postman.c2cliente${n}@bajonea.test`;
  variables[`c2_cliente${n}_usuario`] = `postmanc2cliente${n}`;
  variables[`c2_cliente${n}_password`] = 'Postman123';
  variables[`c2_cliente${n}_codigo`] = '';
  variables[`c2_token_cliente${n}`] = '';
}
for (const { s } of DUENOS) {
  variables[v(s, 'email')] = `postman.c2u${s}@bajonea.test`;
  variables[v(s, 'usuario')] = `postmanc2u${s}`;
  variables[v(s, 'password')] = 'Postman123';
  for (const sufijo of ['codigo', 'dueno', 'com', 'prod', 'codigo_rec']) variables[v(s, sufijo)] = '';
  variables[tok(s)] = '';
}
const existentes = new Set(environment.values.map((x) => x.key));
for (const [key, value] of Object.entries(variables)) {
  if (!existentes.has(key)) environment.values.push({ key, value, type: 'default', enabled: true });
}
fs.writeFileSync(environmentPath, JSON.stringify(environment, null, 2) + '\n', 'utf8');

console.log(`OK: carpeta "${NOMBRE_FOLDER}" con ${items.length} requests.`);
