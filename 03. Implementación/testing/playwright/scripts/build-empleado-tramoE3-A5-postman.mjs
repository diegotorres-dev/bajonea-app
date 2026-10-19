import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const collectionPath = path.resolve(__dirname, '../../../postman/Bajonea-MVP.postman_collection.json');
const environmentPath = path.resolve(__dirname, '../../../postman/Bajonea-Local.postman_environment.json');

const PREFIJO_CARPETA = '66 - ';
const NOMBRE_CARPETA = '66 - Matriz de las 23 rutas delegables E3 A5 (pertenencia cruzada entre comercios, sin token, Administrador, Cliente sin relacion y relacion inactiva)';

const v = (clave) => `a5_${clave}`;

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
    guardar(v(`${clave}_usuario`), `('a5${clave}' + s).slice(0, 20)`),
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
const TOKEN_EMPLEADO = v('e_token');
const TOKEN_COMPRADOR = v('c_token');
const TOKEN_AJENO = v('x_token');
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
          apellido: 'Matriz',
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


const MOTIVO = '{"motivo": "SIN_STOCK"}';
const productoCuerpo = (nombre, precio) => `{"nombre": "${nombre}", "descripcion": "Descripcion A5", "precio": ${precio}, "categoriaId": ${CAT}}`;
const PA = `{{${v('prodA')}}}`;
const PB = `{{${v('prodB')}}}`;
const IMGB = `{{${v('imgB')}}}`;
const PEDB = `{{${v('pedB')}}}`;
const urlImagen = (sufijo) => `https://res.cloudinary.com/${NUBE}/image/upload/v1/productos/${CLON}/${PB}/a5-${sufijo}-{{${v('archivo')}}}.png`;
const URL_VALIDA = 'https://res.cloudinary.com/demo/image/upload/v1/matriz.png';

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
        razonSocial: 'Matriz A5 SRL',
        cuit: `{{${v('cuit_tmp')}}}`,
        condicionIva: 'RESPONSABLE_INSCRIPTO',
        tipoSociedad: 'SRL',
        domicilioFiscal: 'Direccion fiscal A5 100',
        fechaInicioActividades: '2020-01-01',
        nombre: 'Local Matriz A5',
        descripcion: 'Comercio generado por la coleccion de Postman (matriz de rutas delegables, E3 A5)',
        telefono: '+5492964555444',
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
        fotoPerfilUrl: 'https://res.cloudinary.com/demo/image/upload/postman-matriz-a5.jpg',
        redesSociales: [{ tipo: 'INSTAGRAM', url: 'instagram.com/matrizat5' }],
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
  item('Atajo de test: el comercio A pasa a APTO_VENTA', req('PUT', `/test/comercios/${COM}/apto-venta`, { body: {} }), [status(200)]),
  item('Atajo de test: el Dueño tiene un segundo comercio B (clon en APTO_VENTA)', req('POST', `/test/comercios/${COM}/clonar`, { body: {}, query: 'nombre=Clon Matriz A5&estado=APTO_VENTA' }), [
    status(201),
    guardar(v('clon'), 'pm.response.json().data'),
  ]),
  item(
    'Administrador crea la categoria de los productos',
    req('POST', '/categorias', { token: 'token_admin', rawBody: `{"nombre": "{{${v('cat_nombre')}}}"}` }),
    [status(201), guardar(v('cat'), 'pm.response.json().data.id')],
    [guardar(v('cat_nombre'), "'Cat Matriz A5 ' + Date.now().toString(36)")],
  ),
  item('El Dueño pide la firma de Cloudinary (para conocer el nombre de la nube)', req('POST', '/comercios/perfil/foto/firma', { token: TOKEN_DUENO, comercio: COM, body: {} }), [
    status(200),
    guardar(v('cloud'), 'pm.response.json().data.cloudName'),
  ]),
  item('El Dueño crea el producto del comercio A', req('POST', '/productos', { token: TOKEN_DUENO, comercio: COM, rawBody: productoCuerpo('Producto A5 de A', 2500) }), [
    status(201),
    guardar(v('prodA'), 'pm.response.json().data.id'),
  ]),
  item('El Dueño crea el producto del comercio B', req('POST', '/productos', { token: TOKEN_DUENO, comercio: CLON, rawBody: productoCuerpo('Producto A5 de B', 2500) }), [
    status(201),
    guardar(v('prodB'), 'pm.response.json().data.id'),
    guardar(v('archivo'), 'Date.now().toString(36)'),
  ]),
  item('El Dueño registra la imagen del producto B', req('POST', `/productos/${PB}/imagenes`, { token: TOKEN_DUENO, comercio: CLON, rawBody: `{"url": "${urlImagen('1')}", "orden": 0, "esPrincipal": true}` }), [
    status(201),
    guardar(v('imgB'), 'pm.response.json().data.id'),
  ]),
  ...clienteNuevo('e', 'Empleada'),
  ...sumarAlEquipo(COM, 'la Empleada'),
  loginDe('e', 'Empleada', TOKEN_EMPLEADO),
  ...clienteNuevo('c', 'Compradora'),
  loginDe('c', 'Compradora', TOKEN_COMPRADOR),
  ...clienteNuevo('x', 'Cliente sin relacion'),
  loginDe('x', 'Cliente sin relacion', TOKEN_AJENO),
  item('[pedido B] La Compradora agrega el producto B al carrito', req('POST', '/carrito/items', { token: TOKEN_COMPRADOR, rawBody: `{"productoId": ${PB}, "cantidad": 1}` }), [status(201)]),
  item('[pedido B] La Compradora confirma el pedido (retiro en el local)', req('POST', '/pedidos/cliente', { token: TOKEN_COMPRADOR, body: { tipoEntrega: 'RETIRO', direccionId: null } }), [
    status(201),
    guardar(v('pedB'), 'pm.response.json().data.id'),
  ]),
  item('[pedido B] Atajo de test: el pago queda aprobado y registrado', req('PUT', `/test/pedidos/${PEDB}/pago-aprobado`, { body: {}, query: 'registrarPago=true' }), [status(200)]),
);

const RUTA = (metodo, ruta, cuerpo) => ({ metodo, ruta, cuerpo });
const las23 = (prod, img, ped) => [
  RUTA('GET', '/comercios/perfil'),
  RUTA('GET', '/productos'),
  RUTA('GET', '/pedidos/comercio'),
  RUTA('GET', '/pedidos/comercio/resumen-hoy'),
  RUTA('GET', `/pedidos/comercio/${ped}/trazabilidad`),
  RUTA('POST', '/productos', productoCuerpo('Matriz', 1)),
  RUTA('PUT', `/productos/${prod}`, productoCuerpo('Matriz', 1)),
  RUTA('PATCH', `/productos/${prod}/estado`, '{"estado": "AGOTADO"}'),
  RUTA('POST', `/productos/${prod}/cloudinary/firma`, '{}'),
  RUTA('POST', `/productos/${prod}/imagenes`, `{"url": "${URL_VALIDA}", "orden": 1, "esPrincipal": false}`),
  RUTA('DELETE', `/productos/${prod}/imagenes/${img}`),
  RUTA('PATCH', `/productos/${prod}/imagenes/${img}/orden`, '{"orden": 2}'),
  RUTA('POST', `/productos/${prod}/imagenes/${img}/recorte/firma`, '{}'),
  RUTA('PATCH', `/productos/${prod}/imagenes/${img}/url`, `{"url": "${URL_VALIDA}"}`),
  RUTA('PUT', '/comercios/perfil/datos-operativos', '{"descripcion": "Matriz", "telefono": "+5492964111222"}'),
  RUTA('PUT', '/comercios/cerrar', '{}'),
  RUTA('PUT', '/comercios/abrir', '{}'),
  RUTA('PUT', `/pedidos/comercio/${ped}/aceptar`, '{}'),
  RUTA('PUT', `/pedidos/comercio/${ped}/rechazar`, MOTIVO),
  RUTA('PUT', `/pedidos/comercio/${ped}/despachar`, '{}'),
  RUTA('PUT', `/pedidos/comercio/${ped}/entregar`, '{}'),
  RUTA('PUT', `/pedidos/comercio/${ped}/no-retirado`, '{}'),
  RUTA('PUT', `/pedidos/comercio/${ped}/anular`, MOTIVO),
];
const reqRuta = (r, token, comercio) => req(r.metodo, r.ruta, { token, comercio, rawBody: r.cuerpo });
const corto = (r) => `${r.metodo} ${r.ruta.replace(/\{\{[^}]+\}\}/g, ':id')}`;
const conMensaje = (lista, mensaje) => lista.map((r) => ({ ...r, mensaje }));

const DEL_OTRO = [
  ...conMensaje(
    [
      RUTA('PUT', `/productos/${PB}`, productoCuerpo('Cambiado', 1)),
      RUTA('PATCH', `/productos/${PB}/estado`, '{"estado": "AGOTADO"}'),
      RUTA('POST', `/productos/${PB}/cloudinary/firma`, '{}'),
      RUTA('POST', `/productos/${PB}/imagenes`, `{"url": "${URL_VALIDA}", "orden": 1, "esPrincipal": false}`),
      RUTA('DELETE', `/productos/${PB}/imagenes/${IMGB}`),
      RUTA('PATCH', `/productos/${PB}/imagenes/${IMGB}/orden`, '{"orden": 2}'),
      RUTA('POST', `/productos/${PB}/imagenes/${IMGB}/recorte/firma`, '{}'),
      RUTA('PATCH', `/productos/${PB}/imagenes/${IMGB}/url`, `{"url": "${URL_VALIDA}"}`),
    ],
    'Producto no encontrado',
  ),
  ...conMensaje(
    [
      RUTA('DELETE', `/productos/${PA}/imagenes/${IMGB}`),
      RUTA('PATCH', `/productos/${PA}/imagenes/${IMGB}/orden`, '{"orden": 2}'),
      RUTA('POST', `/productos/${PA}/imagenes/${IMGB}/recorte/firma`, '{}'),
      RUTA('PATCH', `/productos/${PA}/imagenes/${IMGB}/url`, `{"url": "${URL_VALIDA}"}`),
    ],
    'Imagen no encontrada',
  ),
  ...conMensaje(
    [
      RUTA('GET', `/pedidos/comercio/${PEDB}/trazabilidad`),
      RUTA('PUT', `/pedidos/comercio/${PEDB}/aceptar`, '{}'),
      RUTA('PUT', `/pedidos/comercio/${PEDB}/rechazar`, MOTIVO),
      RUTA('PUT', `/pedidos/comercio/${PEDB}/despachar`, '{}'),
      RUTA('PUT', `/pedidos/comercio/${PEDB}/entregar`, '{}'),
      RUTA('PUT', `/pedidos/comercio/${PEDB}/no-retirado`, '{}'),
      RUTA('PUT', `/pedidos/comercio/${PEDB}/anular`, MOTIVO),
    ],
    'Pedido no encontrado',
  ),
];

for (const [token, quien] of [[TOKEN_EMPLEADO, 'La Empleada'], [TOKEN_DUENO, 'El Dueño']]) {
  for (const r of DEL_OTRO) {
    agregar(item(`Pertenencia cruzada: ${quien} con el header de A, ${corto(r)} sobre un recurso de B da 404 "${r.mensaje}"`, reqRuta(r, token, COM), [status(404), mensajeEs(r.mensaje)]));
  }
}
agregar(
  item('Pertenencia cruzada: el pedido de B sigue pendiente de confirmacion', req('GET', '/pedidos/comercio', { token: TOKEN_DUENO, comercio: CLON }), [
    status(200),
    `const p = pm.response.json().data.find((x) => Number(x.id) === Number(${entorno(v('pedB'))}));`,
    "pm.test('El pedido de B sigue pendiente de confirmacion', () => { pm.expect(p).to.exist; pm.expect(p.estado).to.eql('PENDIENTE_CONFIRMACION_COMERCIO'); });",
  ]),
  item('Pertenencia cruzada: el producto B conserva nombre e imagen', req('GET', '/productos', { token: TOKEN_DUENO, comercio: CLON }), [
    status(200),
    `const p = pm.response.json().data.find((x) => Number(x.id) === Number(${entorno(v('prodB'))}));`,
    "pm.test('El producto B conserva su nombre y su unica imagen', () => { pm.expect(p).to.exist; pm.expect(p.nombre.toLowerCase()).to.eql('producto a5 de b'); pm.expect(p.imagenes.length).to.eql(1); });",
  ]),
);

const LISTA = las23(PA, '1', PEDB);
for (const r of LISTA) {
  agregar(item(`Sin token: ${corto(r)} da 401`, reqRuta(r, undefined, COM), [status(401)]));
}
for (const r of LISTA) {
  agregar(item(`Administrador: ${corto(r)} da 403`, reqRuta(r, 'token_admin', CLON), [status(403)]));
}
for (const r of LISTA) {
  agregar(item(`Cliente sin relacion con header: ${corto(r)} da el mismo 404`, reqRuta(r, TOKEN_AJENO, COM), NO_DISPONIBLE));
}
for (const r of LISTA) {
  agregar(item(`Cliente sin relacion sin header: ${corto(r)} da 400`, reqRuta(r, TOKEN_AJENO, undefined), [status(400)]));
}
agregar(item('Atajo de test: se desactiva a la Empleada', req('PUT', `/test/comercios/${COM}/empleados/{{${v('e_id')}}}/estado`, { body: {}, query: 'estado=INACTIVO' }), [status(200)]));
for (const r of LISTA) {
  agregar(item(`Relacion inactiva: ${corto(r)} da el mismo 404`, reqRuta(r, TOKEN_EMPLEADO, COM), NO_DISPONIBLE));
}
agregar(
  item('Relacion inactiva: un cuerpo invalido tambien da 404 (el resolver corre antes de validar)', req('PUT', '/comercios/perfil/datos-operativos', { token: TOKEN_EMPLEADO, comercio: COM, rawBody: '{"telefono": ""}' }), NO_DISPONIBLE),
  item('Atajo de test: se reactiva a la Empleada', req('PUT', `/test/comercios/${COM}/empleados/{{${v('e_id')}}}/estado`, { body: {}, query: 'estado=ACTIVO' }), [status(200)]),
  item('Relacion reactivada: la Empleada vuelve a ver el perfil', req('GET', '/comercios/perfil', { token: TOKEN_EMPLEADO, comercio: COM }), [status(200)]),
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
const claves = ['com', 'clon', 'cat', 'cat_nombre', 'cloud', 'prodA', 'prodB', 'imgB', 'pedB', 'archivo', 'inv_codigo', 'cuit_tmp', 'dni_rep_tmp',
  'd_email', 'd_usuario', 'd_password', 'd_dni', 'd_codigo', 'd_token', 'd_id',
  'e_email', 'e_usuario', 'e_password', 'e_dni', 'e_codigo', 'e_token', 'e_id',
  'c_email', 'c_usuario', 'c_password', 'c_dni', 'c_codigo', 'c_token', 'c_id',
  'x_email', 'x_usuario', 'x_password', 'x_dni', 'x_codigo', 'x_token', 'x_id'].map(v);
const existentes = new Set(environment.values.map((x) => x.key));
for (const key of claves) {
  if (!existentes.has(key)) environment.values.push({ key, value: '', type: 'default', enabled: true });
}
fs.writeFileSync(environmentPath, JSON.stringify(environment, null, 2) + '\n', 'utf8');

console.log(`OK: carpeta "${NOMBRE_CARPETA.slice(0, 40)}..." con ${items.length} requests.`);
