import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const collectionPath = path.resolve(__dirname, '../../../postman/Bajonea-MVP.postman_collection.json');

const PREFIJO_CARPETA = '75 - ';
const NOMBRE_CARPETA = '75 - Precio no modificable en franja y total esperado del pedido Fase 2 T3 (409 PRECIO_BLOQUEADO_EN_FRANJA para Dueño y Empleada, campos precioBloqueado en la lista, alta libre, aviso precioCambio en el carrito, 409 PRECIO_CAMBIO con los montos nuevos)';

const v = (clave) => `tp_${clave}`;
const CODIGO_BLOQUEADO = 'PRECIO_BLOQUEADO_EN_FRANJA';
const MENSAJE_BLOQUEADO = 'No podés cambiar precios mientras tu comercio está en horario de atención. Hacelo fuera de ese horario.';

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
const codigoEs = (codigo) => `pm.test('Codigo ${codigo}', () => pm.expect(pm.response.json().data.codigo).to.eql('${codigo}'));`;

function identidad(clave) {
  return [
    `const s = Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36);`,
    guardar(v(`${clave}_email`), `'tp.${clave}.' + s + '@bajonea.test'`),
    guardar(v(`${clave}_usuario`), `('tp${clave}' + s).slice(0, 20)`),
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

const horariosFueraDeAhora = [
  'const ushuaia = (desplazamientoMin) => new Date(Date.now() - 3 * 3600000 + desplazamientoMin * 60000);',
  "const dias = ['DOMINGO', 'LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO'];",
  "const hora = (d) => String(d.getUTCHours()).padStart(2, '0') + ':' + String(d.getUTCMinutes()).padStart(2, '0') + ':00';",
  'const inicio = ushuaia(120);',
  'const fin = ushuaia(180);',
  guardar(v('b_horarios'), 'JSON.stringify({ diaSemana: dias[inicio.getUTCDay()], horaApertura: hora(inicio), horaCierre: hora(fin) })'),
];

const items = [];
const agregar = (...nuevos) => items.push(...nuevos);

const TOKEN_ADMIN = 'token_admin';
const CAT = `{{${v('cat')}}}`;
const TOKEN_A = v('a_token');
const TOKEN_B = v('b_token');
const TOKEN_ELENA = v('e_token');
const TOKEN_CARLA = v('c_token');
const COM_A = `{{${v('a_com')}}}`;
const COM_B = `{{${v('b_com')}}}`;
const PROD_A = `{{${v('a_prod')}}}`;
const PROD_B = `{{${v('b_prod')}}}`;

function registroDueno(clave, nombre, horarios, pre) {
  const cuerpo = {
    aceptaTerminos: true,
    razonSocial: `Precio T3 ${nombre} SRL`,
    cuit: `{{${v('cuit_tmp')}}}`,
    condicionIva: 'RESPONSABLE_INSCRIPTO',
    tipoSociedad: 'SRL',
    domicilioFiscal: 'Direccion fiscal T3 100',
    fechaInicioActividades: '2020-01-01',
    nombre: `{{${v(`${clave}_nombre`)}}}`,
    descripcion: 'Comercio generado por la coleccion de Postman (precio en franja, Fase 2 T3)',
    telefono: '+5492964555447',
    tipoComercio: 'RESTAURANTE',
    aceptaDelivery: true,
    aceptaRetiro: true,
    nombreUsuario: `{{${v(`${clave}_usuario`)}}}`,
    email: `{{${v(`${clave}_email`)}}}`,
    password: `{{${v(`${clave}_password`)}}}`,
    direccion: { calle: 'Belgrano', numero: '803', pisoDepto: null, codigoPostal: '9420', localidadId: '{{localidad_id}}', principal: false },
    horarios,
    nombreRepresentante: 'Carlos',
    apellidoRepresentante: 'Sanchez',
    dniRepresentante: `{{${v('dni_rep_tmp')}}}`,
    telefonoRepresentante: '+5492964701106',
    fechaNacimientoRepresentante: '1988-04-04',
    fotoPerfilUrl: 'https://res.cloudinary.com/demo/image/upload/postman-precio-t3.jpg',
    redesSociales: [{ tipo: 'INSTAGRAM', url: 'instagram.com/preciot3' }],
  };
  const raw = JSON.stringify(cuerpo, null, 2).replace('"__HORARIOS__"', `{{${v('b_horarios')}}}`);
  return item(`Registro Dueño ${nombre}`, req('POST', '/auth/registro/comercio', { rawBody: raw }), [status(201)], [
    ...identidad(clave),
    ...datosDueno,
    guardar(v(`${clave}_nombre`), `'Local Precio T3 ${nombre} ' + Date.now().toString(36)`),
    ...pre,
  ]);
}

function duenoAprobado(clave, nombre, horarios, pre = []) {
  const token = v(`${clave}_token`);
  const com = `{{${v(`${clave}_com`)}}}`;
  return [
    registroDueno(clave, nombre, horarios, pre),
    item(`Bypass test - codigo de verificacion Dueño ${nombre}`, req('GET', '/test/token-verificacion', { query: `email={{${v(`${clave}_email`)}}}` }), [
      status(200),
      guardar(v(`${clave}_codigo`), 'pm.response.json().data'),
    ]),
    item(`Verificar cuenta Dueño ${nombre}`, req('POST', '/auth/verificar', { body: { email: `{{${v(`${clave}_email`)}}}`, codigo: `{{${v(`${clave}_codigo`)}}}` } }), [status(200)]),
    item(`Login Dueño ${nombre}`, req('POST', '/auth/login', { body: { nombreUsuario: `{{${v(`${clave}_usuario`)}}}`, password: `{{${v(`${clave}_password`)}}}` } }), [
      status(200),
      guardar(token, 'pm.response.json().data.token'),
    ]),
    item(`Administrador busca el comercio pendiente de ${nombre}`, req('GET', '/administrador/comercios/pendientes', { token: TOKEN_ADMIN }), [
      status(200),
      `const c = pm.response.json().data.find((x) => x.emailCuenta === ${entorno(v(`${clave}_email`))}.toLowerCase());`,
      `pm.test('El comercio de ${nombre} esta pendiente', () => pm.expect(c).to.exist);`,
      guardar(v(`${clave}_com`), 'c.id'),
    ]),
    item(`Administrador aprueba el comercio de ${nombre}`, req('PUT', `/administrador/comercios/${com}/resolver`, { token: TOKEN_ADMIN, body: { aprobar: true } }), [status(200)]),
    item(`Atajo de test: el comercio de ${nombre} pasa a APTO_VENTA`, req('PUT', `/test/comercios/${com}/apto-venta`, { body: {} }), [status(200)]),
  ];
}

function productoConImagen(clave, nombre) {
  const token = v(`${clave}_token`);
  const com = `{{${v(`${clave}_com`)}}}`;
  const prod = `{{${v(`${clave}_prod`)}}}`;
  return [
    item(`El Dueño de ${nombre} crea el producto`, req('POST', '/productos', { token, comercio: com, rawBody: `{"nombre": "Producto T3 ${nombre}", "descripcion": "d", "precio": 10000, "categoriaId": ${CAT}}` }), [
      status(201),
      guardar(v(`${clave}_prod`), 'pm.response.json().data.id'),
      "pm.test('La alta no lleva los campos de bloqueo', () => pm.expect(pm.response.json().data).to.not.have.property('precioBloqueado'));",
    ]),
    item(`El Dueño de ${nombre} pide la firma de subida`, req('POST', `/productos/${prod}/cloudinary/firma`, { token, comercio: com, body: {} }), [
      status(200),
      guardar(v(`${clave}_nube`), 'pm.response.json().data.cloudName'),
    ]),
    item(
      `El Dueño de ${nombre} registra la imagen principal`,
      req('POST', `/productos/${prod}/imagenes`, {
        token,
        comercio: com,
        rawBody: `{"url": "https://res.cloudinary.com/{{${v(`${clave}_nube`)}}}/image/upload/v1/productos/${com}/${prod}/t3-{{${v(`${clave}_archivo`)}}}.png", "orden": 0, "esPrincipal": true}`,
      }),
      [status(201)],
      [guardar(v(`${clave}_archivo`), 'Date.now().toString(36)')],
    ),
  ];
}

const cuerpoProducto = (nombre, precio) => `{"nombre": "${nombre}", "descripcion": "d", "precio": ${precio}, "categoriaId": ${CAT}}`;
const editarPrecio = (nombre, token, com, prod, nombreProducto, precio, comprobaciones) =>
  item(nombre, req('PUT', `/productos/${prod}`, { token, comercio: com, rawBody: cuerpoProducto(nombreProducto, precio) }), comprobaciones);
const bloqueo = (habilitado) =>
  item(`Atajo de test: bloqueo de precio ${habilitado ? 'encendido' : 'apagado'}`, req('PUT', '/test/precio-bloqueo', { body: {}, query: `habilitado=${habilitado}` }), [
    status(200),
    `pm.test('El atajo devuelve ${habilitado}', () => pm.expect(pm.response.json().data).to.eql(${habilitado}));`,
  ]);

function clienteNuevo(clave, nombre) {
  return [
    item(
      `Registro ${nombre}`,
      req('POST', '/auth/registro/cliente', {
        body: {
          nombre,
          apellido: 'Precios',
          dni: `{{${v(`${clave}_dni`)}}}`,
          fechaNacimiento: '1995-05-20',
          telefono: '+5492964551237',
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
    item(`Login ${nombre}`, req('POST', '/auth/login', { body: { nombreUsuario: `{{${v(`${clave}_usuario`)}}}`, password: `{{${v(`${clave}_password`)}}}` } }), [
      status(200),
      guardar(v(`${clave}_token`), 'pm.response.json().data.token'),
    ]),
  ];
}

agregar(
  item('Login Administrador (sesion propia de esta carpeta)', req('POST', '/auth/login', { body: { nombreUsuario: '{{admin_usuario}}', password: '{{admin_password}}' } }), [
    status(200),
    guardar(TOKEN_ADMIN, 'pm.response.json().data.token'),
  ]),
  bloqueo(false),
  item(
    'Administrador crea la categoria del producto',
    req('POST', '/categorias', { token: TOKEN_ADMIN, rawBody: `{"nombre": "{{${v('cat_nombre')}}}"}` }),
    [status(201), guardar(v('cat'), 'pm.response.json().data.id')],
    [guardar(v('cat_nombre'), "'Cat Precio T3 ' + Date.now().toString(36)")],
  ),
  ...duenoAprobado('a', 'A', horariosTodosLosDias),
  ...productoConImagen('a', 'A'),
  ...duenoAprobado('b', 'B', ['__HORARIOS__'], horariosFueraDeAhora),
  ...productoConImagen('b', 'B'),
  ...clienteNuevo('e', 'Elena'),
  item('El Dueño A invita a Elena', req('POST', '/comercios/equipo/invitaciones', { token: TOKEN_A, comercio: COM_A, body: { email: `{{${v('e_email')}}}` } }), [status(201)]),
  item('Bypass test - codigo de la invitacion de Elena', req('GET', '/test/invitaciones-empleado/codigo', { query: `email={{${v('e_email')}}}&comercioId=${COM_A}` }), [
    status(200),
    guardar(v('e_inv_codigo'), 'pm.response.json().data'),
  ]),
  item('Elena acepta la invitacion', req('POST', '/auth/invitaciones-empleado/aceptar', { body: { email: `{{${v('e_email')}}}`, codigo: `{{${v('e_inv_codigo')}}}` } }), [status(200)]),
  ...clienteNuevo('c', 'Carla'),
);

const arreglarB = items.find((i) => i.name === 'Registro Dueño B');
if (arreglarB) {
  const horariosBPlaceholder = `{{${v('b_horarios')}}}`;
  if (!arreglarB.request.body.raw.includes(horariosBPlaceholder)) {
    throw new Error('El registro del Dueño B no lleva el marcador de horarios calculados');
  }
}

agregar(
  editarPrecio('Con el bloqueo apagado (estado del perfil de test) un cambio de precio dentro de la franja se guarda', TOKEN_A, COM_A, PROD_A, 'Producto T3 A', 12000, [
    status(200),
    "pm.test('Precio guardado y sin bloqueo informado', () => { const d = pm.response.json().data; pm.expect(Number(d.precio)).to.eql(12000); pm.expect(d.precioBloqueado).to.eql(false); });",
  ]),
  item('Carla vacia el carrito', req('DELETE', '/carrito', { token: TOKEN_CARLA }), ["pm.test('Carrito vaciado o ya vacio', () => pm.expect([200, 404]).to.include(pm.response.code));"]),
  item('Carla agrega el producto de A al carrito', req('POST', '/carrito/items', { token: TOKEN_CARLA, rawBody: `{"productoId": ${PROD_A}, "cantidad": 1}` }), [status(201)]),
  item('Carla ve el carrito sin cambios de precio', req('GET', '/carrito', { token: TOKEN_CARLA }), [
    status(200),
    "pm.test('Sin aviso y con total', () => { const d = pm.response.json().data; pm.expect(d.hayCambioDePrecio).to.eql(false); pm.expect(d.items[0].precioCambio).to.eql(false); pm.expect(d.total).to.eql(d.subtotal + d.cargoServicioCliente); });",
    guardar(v('total_viejo'), 'pm.response.json().data.total'),
  ]),
  editarPrecio('El Dueño A cambia el precio (el bloqueo sigue apagado)', TOKEN_A, COM_A, PROD_A, 'Producto T3 A', 14000, [status(200)]),
  item('Carla ve el aviso de precio cambiado y el total nuevo', req('GET', '/carrito', { token: TOKEN_CARLA }), [
    status(200),
    "pm.test('Aviso con precio visto y vigente', () => { const d = pm.response.json().data; pm.expect(d.hayCambioDePrecio).to.eql(true); pm.expect(d.items[0].precioCambio).to.eql(true); pm.expect(Number(d.items[0].precioVisto)).to.eql(12000); pm.expect(Number(d.items[0].precioUnitario)).to.eql(14000); });",
    guardar(v('total_nuevo'), 'pm.response.json().data.total'),
  ]),
  item('Carla confirma con el total viejo: 409 PRECIO_CAMBIO con los montos nuevos', req('POST', '/pedidos/cliente', { token: TOKEN_CARLA, rawBody: `{"tipoEntrega": "RETIRO", "direccionId": null, "totalEsperado": {{${v('total_viejo')}}}}` }), [
    status(409),
    codigoEs('PRECIO_CAMBIO'),
    "pm.test('Mensaje y montos nuevos', () => { const r = pm.response.json(); pm.expect(r.mensaje).to.eql('Los montos de tu pedido cambiaron. Revisá el nuevo total antes de pagar.'); pm.expect(Number(r.data.total)).to.eql(Number(pm.environment.get('tp_total_nuevo'))); pm.expect(Number(r.data.subtotal)).to.eql(14000); pm.expect(r.data.items).to.have.length(1); pm.expect(r.data.items[0].precioCambio).to.eql(true); });",
  ]),
  item('Carla confirma con el total nuevo: se crea el pedido', req('POST', '/pedidos/cliente', { token: TOKEN_CARLA, rawBody: `{"tipoEntrega": "RETIRO", "direccionId": null, "totalEsperado": {{${v('total_nuevo')}}}}` }), [
    status(201),
    "pm.test('El pedido cobra el total esperado', () => pm.expect(Number(pm.response.json().data.total)).to.eql(Number(pm.environment.get('tp_total_nuevo'))));",
  ]),
  item('Un total esperado negativo es 400', req('POST', '/pedidos/cliente', { token: TOKEN_CARLA, rawBody: '{"tipoEntrega": "RETIRO", "direccionId": null, "totalEsperado": -1}' }), [status(400)]),
  bloqueo(true),
  editarPrecio('Bloqueo encendido: un precio distinto dentro de la franja es 409 para el Dueño', TOKEN_A, COM_A, PROD_A, 'Producto T3 A', 15000, [
    status(409),
    codigoEs(CODIGO_BLOQUEADO),
    `pm.test('Mensaje de bloqueo', () => pm.expect(pm.response.json().mensaje).to.eql(${JSON.stringify(MENSAJE_BLOQUEADO)}));`,
  ]),
  item('La lista del comercio A conserva el precio y informa el bloqueo', req('GET', '/productos', { token: TOKEN_A, comercio: COM_A }), [
    status(200),
    `const p = pm.response.json().data.find((x) => x.id === Number(${entorno(v('a_prod'))}));`,
    "pm.test('Precio sin cambios y bloqueado', () => { pm.expect(Number(p.precio)).to.eql(14000); pm.expect(p.precioBloqueado).to.eql(true); });",
  ]),
  editarPrecio('El mismo precio con otro nombre se guarda en franja', TOKEN_A, COM_A, PROD_A, 'Producto T3 A renombrado', 14000, [
    status(200),
    "pm.test('Informa el bloqueo', () => pm.expect(pm.response.json().data.precioBloqueado).to.eql(true));",
  ]),
  editarPrecio('Elena (Empleada) tambien recibe el 409 por un precio distinto en franja', TOKEN_ELENA, COM_A, PROD_A, 'Producto T3 A', 16000, [status(409), codigoEs(CODIGO_BLOQUEADO)]),
  item('El Dueño A da de alta otro producto en franja: permitido', req('POST', '/productos', { token: TOKEN_A, comercio: COM_A, rawBody: cuerpoProducto('Alta en franja T3', 9000) }), [
    status(201),
    "pm.test('La alta no lleva los campos de bloqueo', () => pm.expect(pm.response.json().data).to.not.have.property('precioBloqueado'));",
  ]),
  item('El catalogo publico del comercio A no lleva los campos de bloqueo', req('GET', `/catalogo/comercios/${COM_A}/productos`), [
    status(200),
    `const p = pm.response.json().data.find((x) => x.id === Number(${entorno(v('a_prod'))}));`,
    "pm.test('Sin campos de bloqueo', () => { pm.expect(p).to.exist; pm.expect(p).to.not.have.property('precioBloqueado'); pm.expect(p).to.not.have.property('precioBloqueadoHasta'); });",
  ]),
  editarPrecio('Comercio B con la franja fuera de este momento: el precio se guarda con el bloqueo encendido', TOKEN_B, COM_B, PROD_B, 'Producto T3 B', 13000, [
    status(200),
    "pm.test('No esta bloqueado', () => { const d = pm.response.json().data; pm.expect(Number(d.precio)).to.eql(13000); pm.expect(d.precioBloqueado).to.eql(false); pm.expect(d).to.not.have.property('precioBloqueadoHasta'); });",
  ]),
  bloqueo(false),
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

console.log(`OK: carpeta "${NOMBRE_CARPETA.slice(0, 40)}..." con ${items.length} requests.`);
