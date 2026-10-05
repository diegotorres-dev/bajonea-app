import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const collectionPath = path.resolve(__dirname, '../../../postman/Bajonea-MVP.postman_collection.json');
const environmentPath = path.resolve(__dirname, '../../../postman/Bajonea-Local.postman_environment.json');

const NOMBRE_FOLDER = '55 - Cierre manual C3 (bloqueo vigente al aprobar y al vincular Mercado Pago, restauracion al desbloquear)';
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
  { s: 'a', cuit: cuitValido('3092080011'), dni: '30920801', cuenta: 'c3-cuenta-a' },
  { s: 'b', cuit: cuitValido('3092080021'), dni: '30920802', cuenta: null },
  { s: 'c', cuit: cuitValido('3092080031'), dni: '30920803', cuenta: null },
];

const v = (s, sufijo) => `c3_u${s}_${sufijo}`;
const tok = (s) => `c3_token_u${s}`;

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

function item(name, request, testLines = []) {
  const event = [];
  if (testLines.length) event.push({ listen: 'test', script: { type: 'text/javascript', exec: testLines } });
  return { name, request, response: [], event };
}

const status = (codigo) => `pm.test('Status code es ${codigo}', () => pm.response.to.have.status(${codigo}));`;
const guardar = (variable, expr) => `pm.environment.set('${variable}', ${expr});`;

const horariosTodosLosDias = ['LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO', 'DOMINGO'].map((diaSemana) => ({
  diaSemana,
  horaApertura: '00:00:00',
  horaCierre: '23:59:00',
}));

function registroDueno({ s, cuit, dni }) {
  return {
    razonSocial: `Bloqueo Vigente Postman ${s} SRL`,
    cuit,
    condicionIva: 'RESPONSABLE_INSCRIPTO',
    tipoSociedad: 'SRL',
    domicilioFiscal: `Direccion fiscal C3 ${s} 100`,
    fechaInicioActividades: '2020-01-01',
    nombre: `Local Vigente ${s}`,
    descripcion: 'Comercio generado por la coleccion de Postman (bloqueo vigente)',
    telefono: '+5492964555444',
    emailContacto: `contacto.c3u${s}@bajonea.test`,
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
    fotoPerfilUrl: `https://res.cloudinary.com/demo/image/upload/postman-vigente-${s}.jpg`,
    redesSociales: [{ tipo: 'INSTAGRAM', url: `instagram.com/vigentec3${s}` }],
  };
}

const items = [];

items.push(
  item('Login Administrador (sesion propia de esta carpeta)', req('POST', '/auth/login', { body: { nombreUsuario: '{{admin_usuario}}', password: '{{admin_password}}' } }), [
    status(200),
    guardar('token_admin', 'pm.response.json().data.token'),
  ]),
);

function altaDeDueno({ s, cuenta }) {
  const pasos = [
    item(`Registro Dueño ${s}`, req('POST', '/auth/registro/comercio', { body: registroDueno(DUENOS.find((d) => d.s === s)) }), [status(201)]),
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
  if (cuenta) {
    pasos.push(item(`Dueño ${s} vincula Mercado Pago (simulada)`, req('POST', `/test/duenos/{{${v(s, 'dueno')}}}/mercadopago-simulada`, { body: {}, query: `mpUserId=${cuenta}` }), [status(200)]));
  }
  pasos.push(
    item(`Administrador aprueba el comercio del Dueño ${s}`, req('PUT', `/administrador/comercios/{{${v(s, 'com')}}}/resolver`, { token: 'token_admin', body: { aprobar: true } }), [status(200)]),
    item(`Clonar el comercio de ${s} como PENDIENTE (fixture de test)`, req('POST', `/test/comercios/{{${v(s, 'com')}}}/clonar`, {
      body: {},
      query: `nombre=Pendiente-C3-Postman-${s}&estado=PENDIENTE`,
    }), [status(201), guardar(v(s, 'pend'), 'pm.response.json().data')]),
  );
  return pasos;
}

for (const dueno of DUENOS) items.push(...altaDeDueno(dueno));

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

const cerradoPorBloqueo = (nombre, variableComercio) =>
  publicoDe(nombre, variableComercio, [
    "pm.test('Esta en el catalogo', () => pm.expect(c).to.exist);",
    "pm.test('Estado publico APTO_VENTA', () => pm.expect(c.estado).to.eql('APTO_VENTA'));",
    "pm.test('Informa CERRADO_TEMPORALMENTE', () => pm.expect(c.estadoApertura).to.eql('CERRADO_TEMPORALMENTE'));",
    "pm.test('No promete reapertura', () => pm.expect(c.textoReapertura).to.eql(null));",
  ]);

const loginFallido = (nombre, s, restantes) =>
  item(nombre, req('POST', '/auth/login', { body: { nombreUsuario: `{{${v(s, 'usuario')}}}`, password: 'PasswordMalaXX1' } }), [
    status(401),
    `pm.test('Quedan ${restantes} intentos', () => pm.expect(pm.response.json().data.intentosRestantes).to.eql(${restantes}));`,
  ]);

const bloquear = (s) => [
  loginFallido(`[bloqueo ${s}] Login del Dueño ${s} con password incorrecta (intento 1/3)`, s, 2),
  loginFallido(`[bloqueo ${s}] Login del Dueño ${s} con password incorrecta (intento 2/3)`, s, 1),
  loginFallido(`[bloqueo ${s}] Login del Dueño ${s} con password incorrecta (intento 3/3): bloquea`, s, 0),
  item(`[bloqueo ${s}] 4to intento con la password correcta: cuenta bloqueada`, req('POST', '/auth/login', {
    body: { nombreUsuario: `{{${v(s, 'usuario')}}}`, password: `{{${v(s, 'password')}}}` },
  }), [status(409)]),
];

const aprobarPendiente = (nombre, s) =>
  item(nombre, req('PUT', `/administrador/comercios/{{${v(s, 'pend')}}}/resolver`, { token: 'token_admin', body: { aprobar: true } }), [status(200)]);

const recuperar = (s) => [
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
];

const misComerciosEstado = (nombre, s, esperados) =>
  item(nombre, req('GET', '/comercios/mis-comercios', { token: tok(s) }), [
    status(200),
    "const estados = (variable) => pm.response.json().data.find((x) => x.id === Number(pm.environment.get(variable))).estado;",
    ...esperados.map(([variable, estado]) => `pm.test('${variable} queda ${estado}', () => pm.expect(estados('${variable}')).to.eql('${estado}'));`),
  ]);

items.push(
  publicoDe('[antes] El comercio de A esta a la venta (APTO_VENTA, abierto)', v('a', 'com'), [
    "pm.test('Esta en el catalogo y abierto', () => { pm.expect(c).to.exist; pm.expect(c.estadoApertura).to.eql('ABIERTO'); });",
  ]),
  ...bloquear('a'),
  aprobarPendiente('[bloqueo a] El Administrador aprueba un comercio pendiente de A con la cuenta bloqueada y Mercado Pago activo', 'a'),
  cerradoPorBloqueo('[bloqueo a] El comercio recien aprobado queda CERRADO_TEMPORALMENTE, no a la venta', v('a', 'pend')),
  cerradoPorBloqueo('[bloqueo a] El comercio que ya vendia tambien queda CERRADO_TEMPORALMENTE', v('a', 'com')),
  ...recuperar('a'),
  misComerciosEstado('[restaurado a] Los dos comercios de A vuelven a APTO_VENTA', 'a', [[v('a', 'com'), 'APTO_VENTA'], [v('a', 'pend'), 'APTO_VENTA']]),
  publicoDe('[restaurado a] El comercio recien aprobado queda abierto en el catalogo', v('a', 'pend'), [
    "pm.test('Abierto otra vez', () => { pm.expect(c).to.exist; pm.expect(c.estadoApertura).to.eql('ABIERTO'); });",
  ]),
);

items.push(
  ...bloquear('b'),
  item('[bloqueo b] Dueño B (bloqueado) vincula Mercado Pago (simulada)', req('POST', `/test/duenos/{{${v('b', 'dueno')}}}/mercadopago-simulada`, { body: {}, query: 'mpUserId=c3-cuenta-b' }), [status(200)]),
  cerradoPorBloqueo('[bloqueo b] Vincular con la cuenta bloqueada deja al comercio de B CERRADO_TEMPORALMENTE, no a la venta', v('b', 'com')),
  aprobarPendiente('[bloqueo b] El Administrador aprueba un comercio pendiente de B con la cuenta bloqueada y la cuenta de cobro vinculada', 'b'),
  cerradoPorBloqueo('[bloqueo b] El comercio recien aprobado de B queda CERRADO_TEMPORALMENTE', v('b', 'pend')),
  ...recuperar('b'),
  misComerciosEstado('[restaurado b] Los dos comercios de B vuelven a APTO_VENTA por la cuenta de cobro vinculada', 'b', [[v('b', 'com'), 'APTO_VENTA'], [v('b', 'pend'), 'APTO_VENTA']]),
);

items.push(
  ...bloquear('c'),
  aprobarPendiente('[bloqueo c] El Administrador aprueba un comercio pendiente de C (sin cuenta de cobro) con la cuenta bloqueada', 'c'),
  ausenteDelCatalogo('[bloqueo c] El comercio recien aprobado de C queda APROBADO: no esta en el catalogo', v('c', 'pend')),
  ...recuperar('c'),
  misComerciosEstado('[restaurado c] Los dos comercios de C siguen APROBADO (sin cuenta de cobro no hay nada que restaurar)', 'c', [[v('c', 'com'), 'APROBADO'], [v('c', 'pend'), 'APROBADO']]),
);

const folder = { name: NOMBRE_FOLDER, item: items };

const collection = JSON.parse(fs.readFileSync(collectionPath, 'utf8'));
const idx = collection.item.findIndex((f) => f.name === NOMBRE_FOLDER);
if (idx >= 0) collection.item[idx] = folder;
else collection.item.push(folder);
fs.writeFileSync(collectionPath, JSON.stringify(collection, null, 2) + '\n', 'utf8');

const environment = JSON.parse(fs.readFileSync(environmentPath, 'utf8'));
const variables = {};
for (const { s } of DUENOS) {
  variables[v(s, 'email')] = `postman.c3u${s}@bajonea.test`;
  variables[v(s, 'usuario')] = `postmanc3u${s}`;
  variables[v(s, 'password')] = 'Postman123';
  for (const sufijo of ['codigo', 'dueno', 'com', 'pend', 'codigo_rec']) variables[v(s, sufijo)] = '';
  variables[tok(s)] = '';
}
const existentes = new Set(environment.values.map((x) => x.key));
for (const [key, value] of Object.entries(variables)) {
  if (!existentes.has(key)) environment.values.push({ key, value, type: 'default', enabled: true });
}
fs.writeFileSync(environmentPath, JSON.stringify(environment, null, 2) + '\n', 'utf8');

console.log(`OK: carpeta "${NOMBRE_FOLDER}" con ${folder.item.length} requests.`);
