import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const collectionPath = path.resolve(__dirname, '../../../postman/Bajonea-MVP.postman_collection.json');
const environmentPath = path.resolve(__dirname, '../../../postman/Bajonea-Local.postman_environment.json');

const PREFIJO_CARPETA = '86 - ';
const NOMBRE_CARPETA = '86 - Suspension de un Dueno S3 entrega B (el listado de comercios informa al Dueno y su suspension, el equipo informa las cuentas suspendidas)';

const v = (clave) => `sd3b_${clave}`;
const ADMIN = '/administrador';
const TOKEN_ADMIN = 'token_admin';
const MOTIVO = 'Documentacion vencida y quejas reiteradas de clientes';

function req(method, urlPath, { body, token, comercio, query } = {}) {
  const header = [];
  if (token) header.push({ key: 'Authorization', value: `Bearer {{${token}}}` });
  if (comercio !== undefined) header.push({ key: 'X-Comercio-Id', value: comercio });
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
    guardar(v(`${clave}_email`), `'sd3b.${clave}.' + s + '@bajonea.test'`),
    guardar(v(`${clave}_usuario`), `('sd3b${clave}' + s).slice(0, 20)`),
    guardar(v(`${clave}_password`), "'Pm9x' + Math.random().toString(36).slice(2, 12)"),
    guardar(v(`${clave}_dni`), 'String(30000000 + Math.floor(Math.random() * 60000000))'),
  ];
}

const datosDueno = (clave) => [
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
  guardar(v(`nombre_${clave}`), "'Local Suspension S3B ' + Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36)"),
];

const horariosTodosLosDias = ['LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO', 'DOMINGO'].map((diaSemana) => ({
  diaSemana,
  horaApertura: '00:00:00',
  horaCierre: '23:59:00',
}));

const COM = `{{${v('com')}}}`;
const TOKEN_DUENO = v('d_token');
const TOKEN_EMPLEADO = v('e_token');
const D = `{{${v('d_id')}}}`;
const E = `{{${v('e_id')}}}`;

const loginDe = (clave, nombre, tokenVar) =>
  item(`Login ${nombre}`, req('POST', '/auth/login', { body: { nombreUsuario: `{{${v(`${clave}_usuario`)}}}`, password: `{{${v(`${clave}_password`)}}}` } }), [
    status(200),
    guardar(tokenVar, 'pm.response.json().data.token'),
    guardar(v(`${clave}_id`), 'pm.response.json().data.usuario.id'),
  ]);

const comercioEnListado = (nombre, comprobaciones) =>
  item(nombre, req('GET', `${ADMIN}/comercios`, { token: TOKEN_ADMIN }), [
    status(200),
    `const c = pm.response.json().data.find((x) => String(x.id) === String(${entorno(v('com'))}));`,
    "pm.test('El comercio esta en el listado', () => pm.expect(c).to.exist);",
    ...comprobaciones,
  ]);

const miembroEn = (nombre, ruta, token, comercio, comprobaciones) =>
  item(nombre, req('GET', ruta, { token, comercio }), [
    status(200),
    `const m = pm.response.json().data.miembros.find((x) => String(x.empleadoId) === String(${entorno(v('e_id'))}));`,
    "pm.test('El Empleado esta en el equipo', () => pm.expect(m).to.exist);",
    ...comprobaciones,
  ]);

function clienteEmpleado() {
  return [
    item(
      'Registro de la persona que va a ser Empleada',
      req('POST', '/auth/registro/cliente', {
        body: {
          nombre: 'Empleada',
          apellido: 'Suspension',
          dni: `{{${v('e_dni')}}}`,
          fechaNacimiento: '1995-05-20',
          telefono: '+5492964551239',
          nombreUsuario: `{{${v('e_usuario')}}}`,
          email: `{{${v('e_email')}}}`,
          password: `{{${v('e_password')}}}`,
          aceptaTerminos: true,
          direccion: { calle: 'Calle Siempre Viva', numero: '123', pisoDepto: null, codigoPostal: '9420', localidadId: '{{localidad_id}}', principal: true },
        },
      }),
      [status(201)],
      identidad('e'),
    ),
    item('Bypass test - codigo de verificacion de la persona', req('GET', '/test/token-verificacion', { query: `email={{${v('e_email')}}}` }), [
      status(200),
      guardar(v('e_codigo'), 'pm.response.json().data'),
    ]),
    item('Verificar cuenta de la persona', req('POST', '/auth/verificar', { body: { email: `{{${v('e_email')}}}`, codigo: `{{${v('e_codigo')}}}` } }), [status(200)]),
    loginDe('e', 'de la persona', TOKEN_EMPLEADO),
  ];
}

const items = [];
const agregar = (...nuevos) => items.push(...nuevos);

agregar(
  item('Login Administrador (sesion propia de esta carpeta)', req('POST', '/auth/login', { body: { nombreUsuario: '{{admin_usuario}}', password: '{{admin_password}}' } }), [
    status(200),
    guardar(TOKEN_ADMIN, 'pm.response.json().data.token'),
  ]),
  item(
    'Registro del Dueño',
    req('POST', '/auth/registro/comercio', {
      body: {
        aceptaTerminos: true,
        razonSocial: 'Suspension S3B SRL',
        cuit: `{{${v('cuit_tmp')}}}`,
        condicionIva: 'RESPONSABLE_INSCRIPTO',
        tipoSociedad: 'SRL',
        domicilioFiscal: 'Direccion fiscal S3B 100',
        fechaInicioActividades: '2020-01-01',
        nombre: `{{${v('nombre_com')}}}`,
        descripcion: 'Comercio generado por la coleccion de Postman (suspension de Dueño, S3 entrega B)',
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
        fotoPerfilUrl: 'https://res.cloudinary.com/demo/image/upload/postman-suspension-s3b.jpg',
        redesSociales: [{ tipo: 'INSTAGRAM', url: 'instagram.com/suspensions3b' }],
      },
    }),
    [status(201)],
    [...identidad('d'), ...datosDueno('com')],
  ),
  item('Bypass test - codigo de verificacion del Dueño', req('GET', '/test/token-verificacion', { query: `email={{${v('d_email')}}}` }), [
    status(200),
    guardar(v('d_codigo'), 'pm.response.json().data'),
  ]),
  item('Verificar cuenta del Dueño', req('POST', '/auth/verificar', { body: { email: `{{${v('d_email')}}}`, codigo: `{{${v('d_codigo')}}}` } }), [status(200)]),
  loginDe('d', 'del Dueño', TOKEN_DUENO),
  item('El Administrador busca el comercio pendiente', req('GET', `${ADMIN}/comercios/pendientes`, { token: TOKEN_ADMIN }), [
    status(200),
    `const c = pm.response.json().data.find((x) => x.emailCuenta === ${entorno(v('d_email'))}.toLowerCase());`,
    "pm.test('El comercio esta pendiente', () => pm.expect(c).to.exist);",
    guardar(v('com'), 'c.id'),
  ]),
  item('El Administrador aprueba el comercio', req('PUT', `${ADMIN}/comercios/${COM}/resolver`, { token: TOKEN_ADMIN, body: { aprobar: true } }), [status(200)]),
  item('Atajo de test: el comercio pasa a APTO_VENTA', req('PUT', `/test/comercios/${COM}/apto-venta`, { body: {} }), [status(200)]),

  comercioEnListado('El listado de comercios informa al Dueño y que su cuenta no esta suspendida', [
    prueba('Dueño', `pm.expect(c.duenoSuspendido).to.eql(false); pm.expect(c.duenoUsuarioId).to.eql(Number(${entorno(v('d_id'))})); pm.expect(c.duenoNombre).to.eql('Carlos Sanchez'); pm.expect(c.duenoId).to.eql(null);`),
  ]),

  ...clienteEmpleado(),
  item('El Dueño invita a la persona al equipo', req('POST', '/comercios/equipo/invitaciones', { token: TOKEN_DUENO, comercio: COM, body: { email: `{{${v('e_email')}}}` } }), [status(201)]),
  item('Atajo de test: codigo de la invitacion', req('GET', '/test/invitaciones-empleado/codigo', { query: `email={{${v('e_email')}}}&comercioId=${COM}` }), [
    status(200),
    guardar(v('inv_codigo'), 'pm.response.json().data'),
  ]),
  item('La persona acepta la invitacion', req('POST', '/auth/invitaciones-empleado/aceptar', { body: { email: `{{${v('e_email')}}}`, codigo: `{{${v('inv_codigo')}}}` } }), [status(200)]),

  miembroEn('Antes de suspender, el equipo no marca la cuenta como suspendida', '/comercios/equipo', TOKEN_DUENO, COM, [
    prueba('Sin suspension', "pm.expect(m.cuentaSuspendida).to.eql(false); pm.expect(m.estado).to.eql('ACTIVO');"),
  ]),
  item('El Administrador suspende la cuenta del Empleado (es un Cliente)', req('PUT', `${ADMIN}/clientes/${E}/suspender`, { token: TOKEN_ADMIN, body: { motivo: 'Uso indebido de la cuenta del comercio' } }), [status(200)]),
  miembroEn('El Dueño ve la cuenta suspendida sin el motivo', '/comercios/equipo', TOKEN_DUENO, COM, [
    prueba('Suspendida sin motivo', "pm.expect(m.cuentaSuspendida).to.eql(true); pm.expect(m.estado).to.eql('ACTIVO'); pm.expect(JSON.stringify(m)).to.not.include('Uso indebido'); pm.expect(m).to.not.have.property('motivoSuspension');"),
  ]),
  miembroEn('El Administrador ve lo mismo en el equipo del comercio', `${ADMIN}/comercios/${COM}/equipo`, TOKEN_ADMIN, undefined, [
    prueba('Suspendida', 'pm.expect(m.cuentaSuspendida).to.eql(true);'),
  ]),
  item('El Administrador levanta la suspension del Empleado', req('PUT', `${ADMIN}/clientes/${E}/levantar-suspension`, { token: TOKEN_ADMIN, body: {} }), [status(200)]),
  miembroEn('Levantada la suspension, el equipo ya no la marca', '/comercios/equipo', TOKEN_DUENO, COM, [
    prueba('Normal', 'pm.expect(m.cuentaSuspendida).to.eql(false);'),
  ]),

  item('El Administrador suspende la cuenta del Dueño', req('PUT', `${ADMIN}/duenos/${D}/suspender`, { token: TOKEN_ADMIN, body: { motivo: MOTIVO } }), [status(200)]),
  comercioEnListado('El listado de comercios marca al Dueño suspendido y el comercio suspendido por el Dueño', [
    prueba('Dueño suspendido', "pm.expect(c.duenoSuspendido).to.eql(true); pm.expect(c.estado).to.eql('SUSPENDIDO'); pm.expect(c.suspensionOrigen).to.eql('DUENO'); pm.expect(c.duenoNombre).to.eql('Carlos Sanchez');"),
  ]),
  item('La vista previa de un Dueño suspendido muestra el comercio con su origen', req('GET', `${ADMIN}/duenos/${D}/suspension/previa`, { token: TOKEN_ADMIN }), [
    status(200),
    prueba('Origen', "const c = pm.response.json().data.comercios[0]; pm.expect(c.estadoActual).to.eql('SUSPENDIDO'); pm.expect(c.suspensionOrigen).to.eql('DUENO');"),
  ]),
  item('El Administrador levanta la suspension del Dueño', req('PUT', `${ADMIN}/duenos/${D}/levantar-suspension`, { token: TOKEN_ADMIN, body: {} }), [status(200)]),
  comercioEnListado('Levantada la suspension, el listado ya no marca al Dueño', [
    prueba('Dueño activo y, sin cuenta de cobro, el comercio vuelve aprobado', "pm.expect(c.duenoSuspendido).to.eql(false); pm.expect(c.estado).to.eql('APROBADO'); pm.expect(c.suspensionOrigen).to.eql(null);"),
  ]),
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
const claves = [...new Set(JSON.stringify(items).match(/sd3b_[a-z0-9_]+/g))];
const existentes = new Set(environment.values.map((x) => x.key));
for (const key of claves) {
  if (!existentes.has(key)) environment.values.push({ key, value: '', type: 'default', enabled: true });
}
fs.writeFileSync(environmentPath, JSON.stringify(environment, null, 2) + '\n', 'utf8');

console.log(`OK: carpeta "${NOMBRE_CARPETA.slice(0, 40)}..." con ${items.length} requests.`);
