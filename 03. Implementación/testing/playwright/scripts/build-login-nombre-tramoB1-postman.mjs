import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const collectionPath = path.resolve(__dirname, '../../../postman/Bajonea-MVP.postman_collection.json');
const environmentPath = path.resolve(__dirname, '../../../postman/Bajonea-Local.postman_environment.json');

const PREFIJO_CARPETA = '94 - ';
const NOMBRE_CARPETA = '94 - Login con nombre de pila B1 (el nombre viaja en el usuario del login, de cada rol y de nadie mas, y nunca en una respuesta de error)';

const v = (clave) => `lb1_${clave}`;

function req(method, urlPath, { body, token } = {}) {
  const header = [];
  if (token) header.push({ key: 'Authorization', value: `Bearer {{${token}}}` });
  if (body !== undefined) header.push({ key: 'Content-Type', value: 'application/json' });
  const segments = urlPath.replace(/^\//, '').split('/');
  const url = { raw: `{{base_url}}/${segments.join('/')}`, host: ['{{base_url}}'], path: segments };
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
const prueba = (texto, cuerpo) => `pm.test(${JSON.stringify(texto)}, () => { ${cuerpo} });`;

function identidad(clave) {
  return [
    `const s = Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36);`,
    guardar(v(`${clave}_email`), `'lb1.${clave}.' + s + '@bajonea.test'`),
    guardar(v(`${clave}_usuario`), `('lb1${clave}' + s).slice(0, 20)`),
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
  guardar(v('cuit'), 'cuit'),
  guardar(v('dni_rep'), 'String(30000000 + Math.floor(Math.random() * 60000000))'),
  guardar(v('nombre_comercio'), "'Local Login B1 ' + Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36)"),
];

const horarios = ['LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO', 'DOMINGO'].map((diaSemana) => ({
  diaSemana,
  horaApertura: '00:00:00',
  horaCierre: '23:59:00',
}));

const loginReq = (clave, passwordExpr) => req('POST', '/auth/login', {
  body: { nombreUsuario: `{{${v(`${clave}_usuario`)}}}`, password: passwordExpr ?? `{{${v(`${clave}_password`)}}}` },
});

function pasosDeVerificacion(clave, nombre) {
  const bypass = req('GET', `/test/token-verificacion?email={{${v(`${clave}_email`)}}}`);
  bypass.url = { raw: `{{base_url}}/test/token-verificacion?email={{${v(`${clave}_email`)}}}`, host: ['{{base_url}}'], path: ['test', 'token-verificacion'], query: [{ key: 'email', value: `{{${v(`${clave}_email`)}}}` }] };
  return [
    item(`Bypass test - codigo de verificacion ${nombre}`, bypass, [status(200), guardar(v(`${clave}_codigo`), 'pm.response.json().data')]),
    item(`Verificar cuenta ${nombre}`, req('POST', '/auth/verificar', { body: { email: `{{${v(`${clave}_email`)}}}`, codigo: `{{${v(`${clave}_codigo`)}}}` } }), [status(200)]),
  ];
}

const items = [
  item(
    'Registro del Cliente con nombre en minusculas',
    req('POST', '/auth/registro/cliente', {
      body: {
        nombre: 'marina',
        apellido: 'Login',
        dni: `{{${v('c_dni')}}}`,
        fechaNacimiento: '1995-05-20',
        telefono: '+5492964551240',
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
  ...pasosDeVerificacion('c', 'Cliente'),
  item('Login del Cliente: trae su nombre de pila ya normalizado', loginReq('c'), [
    status(200),
    prueba('El usuario trae el nombre de pila', "const u = pm.response.json().data.usuario; pm.expect(u.nombre).to.eql('Marina');"),
    prueba('El usuario trae solo los seis campos esperados, sin apellido ni DNI', "const u = pm.response.json().data.usuario; pm.expect(Object.keys(u).sort()).to.eql(['email', 'estado', 'fotoPerfilUrl', 'id', 'nombre', 'rol']);"),
    prueba('El nombre no esta fuera del usuario ni dentro del token', "const d = pm.response.json().data; pm.expect(Object.keys(d).sort()).to.eql(['token', 'usuario']); const payload = JSON.parse(atob(d.token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))); pm.expect(JSON.stringify(payload)).to.not.include('Marina');"),
    guardar(v('c_token'), 'pm.response.json().data.token'),
  ]),
  item('Login del Cliente con contrasena incorrecta: 401 sin usuario ni nombre', loginReq('c', 'Incorrecta1'), [
    status(401),
    prueba('Ninguna parte de la respuesta lleva el nombre', "const d = pm.response.json().data; pm.expect(d === null || d === undefined || !Object.prototype.hasOwnProperty.call(d, 'usuario')).to.eql(true); pm.expect(JSON.stringify(pm.response.json())).to.not.include('Marina');"),
  ]),
  item('Login de una cuenta inexistente: 401 sin usuario', req('POST', '/auth/login', { body: { nombreUsuario: 'noexisteb1login', password: 'Incorrecta1' } }), [
    status(401),
    prueba('No hay usuario en la respuesta', "const d = pm.response.json().data; pm.expect(d === null || d === undefined || !Object.prototype.hasOwnProperty.call(d, 'usuario')).to.eql(true);"),
  ]),

  item(
    'Registro del Dueno con el representante en mayusculas',
    req('POST', '/auth/registro/comercio', {
      body: {
        aceptaTerminos: true,
        razonSocial: 'Login B1 SRL',
        cuit: `{{${v('cuit')}}}`,
        condicionIva: 'RESPONSABLE_INSCRIPTO',
        tipoSociedad: 'SRL',
        domicilioFiscal: 'Direccion fiscal B1 100',
        fechaInicioActividades: '2020-01-01',
        nombre: `{{${v('nombre_comercio')}}}`,
        descripcion: 'Comercio generado por la coleccion de Postman (login con nombre, B1)',
        telefono: '+5492964555448',
        tipoComercio: 'RESTAURANTE',
        aceptaDelivery: true,
        aceptaRetiro: true,
        nombreUsuario: `{{${v('d_usuario')}}}`,
        email: `{{${v('d_email')}}}`,
        password: `{{${v('d_password')}}}`,
        direccion: { calle: 'Belgrano', numero: '804', pisoDepto: null, codigoPostal: '9420', localidadId: '{{localidad_id}}', principal: false },
        horarios,
        nombreRepresentante: 'CARLOS',
        apellidoRepresentante: 'Sanchez',
        dniRepresentante: `{{${v('dni_rep')}}}`,
        telefonoRepresentante: '+5492964701107',
        fechaNacimientoRepresentante: '1988-04-04',
        fotoPerfilUrl: 'https://res.cloudinary.com/demo/image/upload/postman-login-b1.jpg',
        redesSociales: [{ tipo: 'INSTAGRAM', url: 'instagram.com/loginb1' }],
      },
    }),
    [status(201)],
    [...identidad('d'), ...datosDueno],
  ),
  ...pasosDeVerificacion('d', 'Dueno'),
  item('Login del Dueno: trae el nombre de pila del representante de su cuenta, no el del comercio', loginReq('d'), [
    status(200),
    prueba('El nombre es el del representante', `const u = pm.response.json().data.usuario; pm.expect(u.rol).to.eql('DUENO'); pm.expect(u.nombre).to.eql('Carlos'); pm.expect(u.nombre).to.not.eql(pm.environment.get('${v('nombre_comercio')}'));`),
  ]),

  item('El Cliente cambia su nombre desde el perfil', req('PUT', '/clientes/perfil', { token: v('c_token'), body: { nombre: 'Luciana', apellido: 'Login', telefono: '+5492964551240' } }), [status(200)]),
  item('Un nuevo login del Cliente trae el nombre actualizado', loginReq('c'), [
    status(200),
    prueba('El nombre refleja el cambio', "pm.expect(pm.response.json().data.usuario.nombre).to.eql('Luciana');"),
  ]),
];

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
const claves = [...new Set(JSON.stringify(items).match(/lb1_[a-z0-9_]+/g))];
const existentes = new Set(environment.values.map((x) => x.key));
for (const key of claves) {
  if (!existentes.has(key)) environment.values.push({ key, value: '', type: 'default', enabled: true });
}
fs.writeFileSync(environmentPath, JSON.stringify(environment, null, 2) + '\n', 'utf8');

console.log(`OK: carpeta "${NOMBRE_CARPETA.slice(0, 40)}..." con ${items.length} requests.`);
