import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const collectionPath = path.resolve(__dirname, '../../../postman/Bajonea-MVP.postman_collection.json');
const environmentPath = path.resolve(__dirname, '../../../postman/Bajonea-Local.postman_environment.json');

const PREFIJO_CARPETA = '67 - ';
const NOMBRE_CARPETA = '67 - Orden unico de bloqueo del catalogo E3 A5b (firmas de Cloudinary con relacion inactiva y comercio suspendido, imagenes borradas dos veces)';

const v = (clave) => `a5b_${clave}`;

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
const codigoEs = (codigo) => `pm.test('El codigo estable es ${codigo}', () => pm.expect(pm.response.json().data.codigo).to.eql('${codigo}'));`;
const mensajeEs = (texto) => `pm.test('El mensaje es el esperado', () => pm.expect(pm.response.json().mensaje).to.eql(${JSON.stringify(texto)}));`;
const sinCampos = (...campos) => `pm.test('No trae ${campos.join(', ')}', () => { const d = pm.response.json().data; ${JSON.stringify(campos)}.forEach((c) => pm.expect(Object.keys(d)).to.not.include(c)); });`;
const conCampos = (...campos) => `pm.test('Trae ${campos.join(', ')}', () => { const d = pm.response.json().data; ${JSON.stringify(campos)}.forEach((c) => pm.expect(Object.keys(d)).to.include(c)); });`;
const NO_DISPONIBLE = [
  status(404),
  "pm.test('Mismo 404 de siempre: Comercio no encontrado y codigo COMERCIO_NO_DISPONIBLE', () => { const b = pm.response.json(); pm.expect(b.mensaje).to.eql('Comercio no encontrado'); pm.expect(b.data.codigo).to.eql('COMERCIO_NO_DISPONIBLE'); });",
];

function identidad(clave) {
  return [
    `const s = Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36);`,
    guardar(v(`${clave}_email`), `'a5.${clave}.' + s + '@bajonea.test'`),
    guardar(v(`${clave}_usuario`), `('a5b${clave}' + s).slice(0, 20)`),
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
const TOKEN_EMPLEADO = v('e_token');
const TOKEN_COMPRADOR = v('c_token');
const CAT = `{{${v('cat')}}}`;
const NUBE = `{{${v('cloud')}}}`;

const items = [];
const agregar = (...nuevos) => items.push(...nuevos);

function clienteNuevo(clave, nombre) {
  return [
    item(
      `Registro ${nombre}`,
      req('POST', '/auth/registro/cliente', {
        body: {
          nombre,
          apellido: 'Orden',
          dni: `{{${v(`${clave}_dni`)}}}`,
          fechaNacimiento: '1995-05-20',
          telefono: '+5492964551235',
          nombreUsuario: `{{${v(`${clave}_usuario`)}}}`,
          email: `{{${v(`${clave}_email`)}}}`,
          password: `{{${v(`${clave}_password`)}}}`,
          aceptaTerminos: true,
          direccion: { calle: 'Calle Siempre Viva', numero: '123', pisoDepto: null, codigoPostal: '9420', localidadId: '{{localidad_id}}', principal: true },
        },
      }),
      [status(201)],
      identidad(clave),
    ),
    item(`Bypass test - codigo de verificacion ${nombre}`, req('GET', '/test/token-verificacion', { query: `email={{${v(`${clave}_email`)}}}` }), [
      status(200),
      guardar(v(`${clave}_codigo`), 'pm.response.json().data'),
    ]),
    item(`Verificar cuenta ${nombre}`, req('POST', '/auth/verificar', { body: { email: `{{${v(`${clave}_email`)}}}`, codigo: `{{${v(`${clave}_codigo`)}}}` } }), [status(200)]),
  ];
}

const loginDe = (clave, nombre, tokenVar) =>
  item(`Login ${nombre}`, req('POST', '/auth/login', { body: { nombreUsuario: `{{${v(`${clave}_usuario`)}}}`, password: `{{${v(`${clave}_password`)}}}` } }), [
    status(200),
    guardar(tokenVar, 'pm.response.json().data.token'),
    guardar(v(`${clave}_id`), 'pm.response.json().data.usuario.id'),
  ]);

function sumarAlEquipo(comercioVar, nombre) {
  return [
    item(`El Dueño invita a ${nombre} al comercio`, req('POST', '/comercios/equipo/invitaciones', { token: TOKEN_DUENO, comercio: comercioVar, body: { email: `{{${v('e_email')}}}` } }), [status(201)]),
    item(`Bypass test - codigo de la invitacion`, req('GET', '/test/invitaciones-empleado/codigo', { query: `email={{${v('e_email')}}}&comercioId=${comercioVar}` }), [
      status(200),
      guardar(v('inv_codigo'), 'pm.response.json().data'),
    ]),
    item(`${nombre} acepta la invitacion`, req('POST', '/auth/invitaciones-empleado/aceptar', { body: { email: `{{${v('e_email')}}}`, codigo: `{{${v('inv_codigo')}}}` } }), [status(200)]),
  ];
}


const PROD = `{{${v('prod')}}}`;
const IMG1 = `{{${v('img1')}}}`;
const IMG2 = `{{${v('img2')}}}`;
const productoCuerpo = (nombre, precio) => `{"nombre": "${nombre}", "descripcion": "Descripcion A5b", "precio": ${precio}, "categoriaId": ${CAT}}`;
const urlImagen = (sufijo) => `https://res.cloudinary.com/${NUBE}/image/upload/v1/productos/${COM}/${PROD}/a5b-${sufijo}-{{${v('archivo')}}}.png`;
const imagenesDelProducto = (esperadas) => [
  status(200),
  `const p = pm.response.json().data.find((x) => x.id === Number(${entorno(v('prod'))}));`,
  `pm.test('El producto tiene ${esperadas} imagen(es)', () => pm.expect(p.imagenes.length).to.eql(${esperadas}));`,
  "pm.test('Tiene una sola imagen principal', () => pm.expect(p.imagenes.filter((i) => i.esPrincipal).length).to.eql(1));",
];
const NO_DISPONIBLE_UNO = NO_DISPONIBLE;
const SUSPENDIDO = [
  status(409),
  "pm.test('El codigo estable es COMERCIO_SUSPENDIDO', () => pm.expect(pm.response.json().data.codigo).to.eql('COMERCIO_SUSPENDIDO'));",
];
const IMAGEN_NO_ENCONTRADA = [status(404), mensajeEs('Imagen no encontrada')];

const firmaProducto = (token, nombre) => item(nombre, req('POST', `/productos/${PROD}/cloudinary/firma`, { token, comercio: COM, body: {} }), [status(200)]);
const firmaRecorte = (token, imagen, nombre) => item(nombre, req('POST', `/productos/${PROD}/imagenes/${imagen}/recorte/firma`, { token, comercio: COM, body: {} }), [status(200)]);

agregar(
  item('Login Administrador (sesion propia de esta carpeta)', req('POST', '/auth/login', { body: { nombreUsuario: '{{admin_usuario}}', password: '{{admin_password}}' } }), [
    status(200),
    guardar('token_admin', 'pm.response.json().data.token'),
  ]),
  item(
    'Registro Dueño',
    req('POST', '/auth/registro/comercio', {
      body: {
        razonSocial: 'Orden A5b SRL',
        cuit: `{{${v('cuit_tmp')}}}`,
        condicionIva: 'RESPONSABLE_INSCRIPTO',
        tipoSociedad: 'SRL',
        domicilioFiscal: 'Direccion fiscal A5b 100',
        fechaInicioActividades: '2020-01-01',
        nombre: 'Local Orden A5b',
        descripcion: 'Comercio generado por la coleccion de Postman (orden unico de bloqueo, E3 A5b)',
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
        fotoPerfilUrl: 'https://res.cloudinary.com/demo/image/upload/postman-orden-a5b.jpg',
        redesSociales: [{ tipo: 'INSTAGRAM', url: 'instagram.com/ordena5b' }],
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
  loginDe('d', 'Dueño', TOKEN_DUENO),
  item('Administrador busca el comercio pendiente del Dueño', req('GET', '/administrador/comercios/pendientes', { token: 'token_admin' }), [
    status(200),
    `const c = pm.response.json().data.find((x) => x.emailCuenta === ${entorno(v('d_email'))}.toLowerCase());`,
    "pm.test('El comercio del Dueño esta pendiente', () => pm.expect(c).to.exist);",
    guardar(v('com'), 'c.id'),
  ]),
  item('Administrador aprueba el comercio', req('PUT', `/administrador/comercios/${COM}/resolver`, { token: 'token_admin', body: { aprobar: true } }), [status(200)]),
  item('Atajo de test: el comercio pasa a APTO_VENTA', req('PUT', `/test/comercios/${COM}/apto-venta`, { body: {} }), [status(200)]),
  item(
    'Administrador crea la categoria de los productos',
    req('POST', '/categorias', { token: 'token_admin', rawBody: `{"nombre": "{{${v('cat_nombre')}}}"}` }),
    [status(201), guardar(v('cat'), 'pm.response.json().data.id')],
    [guardar(v('cat_nombre'), "'Cat Orden A5b ' + Date.now().toString(36)")],
  ),
  item('El Dueño pide la firma de Cloudinary (para conocer el nombre de la nube)', req('POST', '/comercios/perfil/foto/firma', { token: TOKEN_DUENO, comercio: COM, body: {} }), [
    status(200),
    guardar(v('cloud'), 'pm.response.json().data.cloudName'),
  ]),
  ...clienteNuevo('e', 'Empleada'),
  ...sumarAlEquipo(COM, 'la Empleada'),
  loginDe('e', 'Empleada', TOKEN_EMPLEADO),
  item('El Dueño crea el producto', req('POST', '/productos', { token: TOKEN_DUENO, comercio: COM, rawBody: productoCuerpo('Producto A5b', 2500) }), [
    status(201),
    guardar(v('prod'), 'pm.response.json().data.id'),
    guardar(v('archivo'), 'Date.now().toString(36)'),
  ]),
  item('El Dueño registra la primera imagen (principal)', req('POST', `/productos/${PROD}/imagenes`, { token: TOKEN_DUENO, comercio: COM, rawBody: `{"url": "${urlImagen('1')}", "orden": 0, "esPrincipal": true}` }), [
    status(201),
    guardar(v('img1'), 'pm.response.json().data.id'),
  ]),
  item('La Empleada registra la segunda imagen', req('POST', `/productos/${PROD}/imagenes`, { token: TOKEN_EMPLEADO, comercio: COM, rawBody: `{"url": "${urlImagen('2')}", "orden": 1, "esPrincipal": false}` }), [
    status(201),
    guardar(v('img2'), 'pm.response.json().data.id'),
  ]),

  firmaProducto(TOKEN_EMPLEADO, 'Relacion activa: la Empleada obtiene la firma de subida'),
  firmaRecorte(TOKEN_EMPLEADO, IMG1, 'Relacion activa: la Empleada obtiene la firma de recorte'),
  item('Atajo de test: se desactiva a la Empleada', req('PUT', `/test/comercios/${COM}/empleados/{{${v('e_id')}}}/estado`, { body: {}, query: 'estado=INACTIVO' }), [status(200)]),
  item('Relacion inactiva: la firma de subida da el mismo 404', req('POST', `/productos/${PROD}/cloudinary/firma`, { token: TOKEN_EMPLEADO, comercio: COM, body: {} }), NO_DISPONIBLE_UNO),
  item('Relacion inactiva: la firma de recorte da el mismo 404', req('POST', `/productos/${PROD}/imagenes/${IMG1}/recorte/firma`, { token: TOKEN_EMPLEADO, comercio: COM, body: {} }), NO_DISPONIBLE_UNO),
  firmaProducto(TOKEN_DUENO, 'Relacion inactiva: el Dueño sigue obteniendo la firma de subida'),
  item('Atajo de test: se reactiva a la Empleada', req('PUT', `/test/comercios/${COM}/empleados/{{${v('e_id')}}}/estado`, { body: {}, query: 'estado=ACTIVO' }), [status(200)]),
  firmaProducto(TOKEN_EMPLEADO, 'Relacion reactivada: la Empleada vuelve a obtener la firma de subida'),

  item('La Empleada elimina la segunda imagen', req('DELETE', `/productos/${PROD}/imagenes/${IMG2}`, { token: TOKEN_EMPLEADO, comercio: COM }), [status(200)]),
  item('El Dueño elimina la misma imagen: 404 "Imagen no encontrada"', req('DELETE', `/productos/${PROD}/imagenes/${IMG2}`, { token: TOKEN_DUENO, comercio: COM }), IMAGEN_NO_ENCONTRADA),
  item('La Empleada la elimina otra vez: el mismo 404', req('DELETE', `/productos/${PROD}/imagenes/${IMG2}`, { token: TOKEN_EMPLEADO, comercio: COM }), IMAGEN_NO_ENCONTRADA),
  item('Reordenar la imagen eliminada da 404', req('PATCH', `/productos/${PROD}/imagenes/${IMG2}/orden`, { token: TOKEN_DUENO, comercio: COM, rawBody: '{"orden": 3}' }), IMAGEN_NO_ENCONTRADA),
  item('Cambiar la URL de la imagen eliminada da 404', req('PATCH', `/productos/${PROD}/imagenes/${IMG2}/url`, { token: TOKEN_EMPLEADO, comercio: COM, rawBody: `{"url": "${urlImagen('3')}"}` }), IMAGEN_NO_ENCONTRADA),
  item('La firma de recorte de la imagen eliminada da 404', req('POST', `/productos/${PROD}/imagenes/${IMG2}/recorte/firma`, { token: TOKEN_EMPLEADO, comercio: COM, body: {} }), IMAGEN_NO_ENCONTRADA),
  item('El producto queda con una sola imagen, y principal', req('GET', '/productos', { token: TOKEN_DUENO, comercio: COM }), imagenesDelProducto(1)),
  item('Las ediciones siguen funcionando: la Empleada edita el producto', req('PUT', `/productos/${PROD}`, { token: TOKEN_EMPLEADO, comercio: COM, rawBody: productoCuerpo('Producto A5b editado', 2700) }), [status(200)]),
  item('Las ediciones siguen funcionando: el Dueño lo pasa a agotado', req('PATCH', `/productos/${PROD}/estado`, { token: TOKEN_DUENO, comercio: COM, rawBody: '{"estado": "AGOTADO"}' }), [status(200)]),
  item('La Empleada lo vuelve a disponible', req('PATCH', `/productos/${PROD}/estado`, { token: TOKEN_EMPLEADO, comercio: COM, rawBody: '{"estado": "DISPONIBLE"}' }), [status(200)]),
  item('Cerrar y abrir siguen funcionando: la Empleada cierra el comercio', req('PUT', '/comercios/cerrar', { token: TOKEN_EMPLEADO, comercio: COM }), [status(200)]),
  item('El Dueño lo vuelve a abrir', req('PUT', '/comercios/abrir', { token: TOKEN_DUENO, comercio: COM }), [status(200)]),

  item('Administrador suspende el comercio', req('PUT', `/administrador/comercios/${COM}/suspender`, { token: 'token_admin', body: { motivo: 'Suspension de la coleccion A5b' } }), [status(200)]),
  item('Comercio suspendido: la firma de subida de la Empleada da 409 COMERCIO_SUSPENDIDO', req('POST', `/productos/${PROD}/cloudinary/firma`, { token: TOKEN_EMPLEADO, comercio: COM, body: {} }), SUSPENDIDO),
  item('Comercio suspendido: la firma de recorte de la Empleada da 409 COMERCIO_SUSPENDIDO', req('POST', `/productos/${PROD}/imagenes/${IMG1}/recorte/firma`, { token: TOKEN_EMPLEADO, comercio: COM, body: {} }), SUSPENDIDO),
  item('Comercio suspendido: la firma de subida del Dueño sigue dando 200', req('POST', `/productos/${PROD}/cloudinary/firma`, { token: TOKEN_DUENO, comercio: COM, body: {} }), [status(200)]),
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
const claves = ['com', 'cat', 'cat_nombre', 'cloud', 'prod', 'img1', 'img2', 'archivo', 'inv_codigo', 'cuit_tmp', 'dni_rep_tmp',
  'd_email', 'd_usuario', 'd_password', 'd_dni', 'd_codigo', 'd_token', 'd_id',
  'e_email', 'e_usuario', 'e_password', 'e_dni', 'e_codigo', 'e_token', 'e_id'].map(v);
const existentes = new Set(environment.values.map((x) => x.key));
for (const key of claves) {
  if (!existentes.has(key)) environment.values.push({ key, value: '', type: 'default', enabled: true });
}
fs.writeFileSync(environmentPath, JSON.stringify(environment, null, 2) + '\n', 'utf8');

console.log(`OK: carpeta "${NOMBRE_CARPETA.slice(0, 40)}..." con ${items.length} requests.`);
