import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const collectionPath = path.resolve(__dirname, '../../../postman/Bajonea-MVP.postman_collection.json');
const environmentPath = path.resolve(__dirname, '../../../postman/Bajonea-Local.postman_environment.json');

const PREFIJO_CARPETA = '76 - ';
const NOMBRE_CARPETA = '76 - Cierre de turno y email al Dueño Fase 2 T4 (el cierre guarda las cifras del panel, un solo mail por Dueño, la segunda corrida no repite nada, falla simulada con reintento a los 10 minutos)';

const v = (clave) => `ct_${clave}`;

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

function identidad(clave) {
  return [
    `const s = Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36);`,
    guardar(v(`${clave}_email`), `'tt.${clave}.' + s + '@bajonea.test'`),
    guardar(v(`${clave}_usuario`), `('tt${clave}' + s).slice(0, 20)`),
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

const ZONA = 'America/Argentina/Ushuaia';
const enZona = (expresionMs) => `new Date(${expresionMs}).toLocaleString('sv-SE', { timeZone: '${ZONA}' }).replace(' ', 'T')`;
const instanteDelDia = (variable, desplazamientoDias, hora) => [
  `const dia = ${enZona(`Date.now() + (${desplazamientoDias}) * 86400000`)}.slice(0, 10);`,
  guardar(v(variable), `dia + 'T${hora}'`),
];

const COM = `{{${v('com')}}}`;
const TOKEN_DUENO = v('d_token');
const TOKEN_EMPLEADO = v('e_token');
const TOKEN_COMPRADOR = v('c_token');
const TOKEN_AJENO = v('x_token');
const CAT = `{{${v('cat')}}}`;
const P = (clave) => `{{${v(`ped_${clave}`)}}}`;

const items = [];
const agregar = (...nuevos) => items.push(...nuevos);

function clienteNuevo(clave, nombre) {
  return [
    item(
      `Registro ${nombre}`,
      req('POST', '/auth/registro/cliente', {
        body: {
          nombre,
          apellido: 'Turnos',
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
  ];
}

const loginDe = (clave, nombre, tokenVar) =>
  item(`Login ${nombre}`, req('POST', '/auth/login', { body: { nombreUsuario: `{{${v(`${clave}_usuario`)}}}`, password: `{{${v(`${clave}_password`)}}}` } }), [
    status(200),
    guardar(tokenVar, 'pm.response.json().data.token'),
    guardar(v(`${clave}_id`), 'pm.response.json().data.usuario.id'),
  ]);

function empleadoAlEquipo(clave, nombre) {
  return [
    item(`El Dueño invita a ${nombre} al comercio`, req('POST', '/comercios/equipo/invitaciones', { token: TOKEN_DUENO, comercio: COM, body: { email: `{{${v(`${clave}_email`)}}}` } }), [status(201)]),
    item(`Bypass test - codigo de la invitacion de ${nombre}`, req('GET', '/test/invitaciones-empleado/codigo', { query: `email={{${v(`${clave}_email`)}}}&comercioId=${COM}` }), [
      status(200),
      guardar(v(`${clave}_inv_codigo`), 'pm.response.json().data'),
    ]),
    item(`${nombre} acepta la invitacion`, req('POST', '/auth/invitaciones-empleado/aceptar', { body: { email: `{{${v(`${clave}_email`)}}}`, codigo: `{{${v(`${clave}_inv_codigo`)}}}` } }), [status(200)]),
  ];
}

const productoCuerpo = (nombre, precio) => `{"nombre": "${nombre}", "descripcion": "Descripcion T4", "precio": ${precio}, "categoriaId": ${CAT}}`;

function pedidoPagado(clave) {
  return [
    item(`[pedido ${clave}] El Cliente vacia el carrito`, req('DELETE', '/carrito', { token: TOKEN_COMPRADOR }), [`pm.test('Carrito vaciado o ya vacio', () => pm.expect([200, 404]).to.include(pm.response.code));`]),
    item(`[pedido ${clave}] El Cliente agrega el producto al carrito`, req('POST', '/carrito/items', { token: TOKEN_COMPRADOR, rawBody: `{"productoId": {{${v('prod')}}}, "cantidad": 1}` }), [status(201)]),
    item(
      `[pedido ${clave}] El Cliente confirma el pedido (retiro en el local)`,
      req('POST', '/pedidos/cliente', { token: TOKEN_COMPRADOR, rawBody: '{"tipoEntrega": "RETIRO", "direccionId": null}' }),
      [status(201), guardar(v(`ped_${clave}`), 'pm.response.json().data.id')],
    ),
    item(`[pedido ${clave}] Atajo de test: el pago queda aprobado`, req('PUT', `/test/pedidos/${P(clave)}/pago-aprobado`, { body: {}, query: 'registrarPago=true' }), [status(200)]),
  ];
}

const AHORA1 = `{{${v('ahora1')}}}`;
const AHORA2 = `{{${v('ahora2')}}}`;
const AHORA2_9 = `{{${v('ahora2_9')}}}`;
const AHORA2_10 = `{{${v('ahora2_10')}}}`;

const prepararInstantes = [
  `const manana = ${enZona('Date.now() + 86400000')}.slice(0, 10);`,
  `const pasado = ${enZona('Date.now() + 2 * 86400000')}.slice(0, 10);`,
  guardar(v('ahora1'), "manana + 'T00:30:00'"),
  guardar(v('ahora2'), "pasado + 'T00:30:00'"),
  guardar(v('ahora2_9'), "pasado + 'T00:39:00'"),
  guardar(v('ahora2_10'), "pasado + 'T00:40:00'"),
];

const correrCierre = (nombre, ahora, comprobaciones = [], pre = []) =>
  item(nombre, req('POST', '/test/jobs/cierre-turnos', { body: {}, query: `ahora=${ahora}` }), [status(200), ...comprobaciones], pre);

const cierresDelComercio = (nombre, comprobaciones = []) =>
  item(nombre, req('GET', '/test/cierres-turno', { query: `comercioId=${COM}` }), [status(200), ...comprobaciones]);

const corrida = (campo, valor) => `pm.test('${campo} = ${valor}', () => pm.expect(pm.response.json().data.${campo}).to.eql(${valor}));`;

agregar(
  item('Login Administrador (sesion propia de esta carpeta)', req('POST', '/auth/login', { body: { nombreUsuario: '{{admin_usuario}}', password: '{{admin_password}}' } }), [
    status(200),
    guardar('token_admin', 'pm.response.json().data.token'),
  ]),
  item('Atajo de test: sin fallas simuladas al empezar', req('PUT', '/test/email-resumen-turno/fallas', { body: {}, query: 'cantidad=0' }), [status(200)]),
  correrCierre('Barrido previo 1: se cierran los turnos de los demas comercios de la base (mañana 00:30)', AHORA1, [], prepararInstantes),
  correrCierre('Barrido previo 2: ya no queda nada por cerrar de mañana', AHORA1, [corrida('cierresCreados', 0), corrida('mailsEnviados', 0)]),
  correrCierre('Barrido previo 3: se cierran los turnos de los demas comercios de pasado mañana', AHORA2),
  correrCierre('Barrido previo 4: ya no queda nada por cerrar de pasado mañana', AHORA2, [corrida('cierresCreados', 0), corrida('mailsEnviados', 0)]),
  item(
    'Registro Dueño (abierto los siete dias las 24 horas)',
    req('POST', '/auth/registro/comercio', {
      body: {
        aceptaTerminos: true,
        razonSocial: 'Cierres T4 SRL',
        cuit: `{{${v('cuit_tmp')}}}`,
        condicionIva: 'RESPONSABLE_INSCRIPTO',
        tipoSociedad: 'SRL',
        domicilioFiscal: 'Direccion fiscal T4 100',
        fechaInicioActividades: '2020-01-01',
        nombre: `{{${v('d_nombre')}}}`,
        descripcion: 'Comercio generado por la coleccion de Postman (cierre de turno, Fase 2 T4)',
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
        fotoPerfilUrl: 'https://res.cloudinary.com/demo/image/upload/postman-cierres-t4.jpg',
        redesSociales: [{ tipo: 'INSTAGRAM', url: 'instagram.com/cierrest4' }],
      },
    }),
    [status(201)],
    [...identidad('d'), ...datosDueno, guardar(v('d_nombre'), "'Local Cierres T4 ' + Date.now().toString(36)")],
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
  item('Atajo de test: el comercio pasa a APTO_VENTA sin cuenta de Mercado Pago vinculada', req('PUT', `/test/comercios/${COM}/apto-venta`, { body: {} }), [status(200)]),
  item(
    'Administrador crea la categoria del producto',
    req('POST', '/categorias', { token: 'token_admin', rawBody: `{"nombre": "{{${v('cat_nombre')}}}"}` }),
    [status(201), guardar(v('cat'), 'pm.response.json().data.id')],
    [guardar(v('cat_nombre'), "'Cat Cierres T4 ' + Date.now().toString(36)")],
  ),
  item('El Dueño crea el producto con el que compran los Clientes', req('POST', '/productos', { token: TOKEN_DUENO, comercio: COM, rawBody: productoCuerpo('Producto Cierres T4', 10000) }), [
    status(201),
    guardar(v('prod'), 'pm.response.json().data.id'),
  ]),
  ...clienteNuevo('c', 'Carla'),
  loginDe('c', 'Carla (Compradora)', TOKEN_COMPRADOR),
  ...pedidoPagado('aceptado'),
  ...pedidoPagado('pendiente'),
  item('El Dueño acepta el primer pedido', req('PUT', `/pedidos/comercio/${P('aceptado')}/aceptar`, { token: TOKEN_DUENO, comercio: COM, body: {} }), [status(200)]),
  item('Resumen del turno antes de cerrar: se guardan las cifras del panel', req('GET', '/pedidos/comercio/resumen-turno', { token: TOKEN_DUENO, comercio: COM }), [
    status(200),
    "pm.test('Turno en curso con un pedido facturado, dos del turno y uno pendiente', () => { const d = pm.response.json().data; pm.expect(d.estado).to.eql('EN_CURSO'); pm.expect(d.vendido).to.eql(10000); pm.expect(d.cantidadPedidos).to.eql(2); pm.expect(d.cantidadPendientes).to.eql(1); });",
    guardar(v('panel_vendido'), 'pm.response.json().data.vendido'),
    guardar(v('panel_comision'), 'pm.response.json().data.comision'),
    guardar(v('panel_neto'), 'pm.response.json().data.neto'),
    guardar(v('panel_cantidad'), 'pm.response.json().data.cantidadPedidos'),
    guardar(v('panel_pendientes'), 'pm.response.json().data.cantidadPendientes'),
  ]),
  correrCierre('Mañana 00:30 (fin del turno + 30 minutos de gracia): se cierra el turno de hoy y sale un solo mail', AHORA1, [
    corrida('cierresCreados', 1),
    corrida('mailsEnviados', 1),
    corrida('cierresEnviados', 1),
    corrida('cierresConFalla', 0),
  ]),
  cierresDelComercio('El cierre guardado tiene las mismas cifras que mostraba el panel', [
    "pm.test('Un solo cierre y enviado', () => { const d = pm.response.json().data; pm.expect(d).to.have.lengthOf(1); pm.expect(d[0].emailEstado).to.eql('ENVIADO'); pm.expect(d[0].emailIntentos).to.eql(0); });",
    "pm.test('Cifras iguales al resumen del turno', () => { const f = pm.response.json().data[0]; const n = (k) => Number(pm.environment.get('ct_' + k)); pm.expect(f.vendido).to.be.closeTo(n('panel_vendido'), 0.001); pm.expect(f.comision).to.be.closeTo(n('panel_comision'), 0.001); pm.expect(f.neto).to.be.closeTo(n('panel_neto'), 0.001); pm.expect(f.cantidadPedidos).to.eql(n('panel_cantidad')); pm.expect(f.pendientesAlCierre).to.eql(n('panel_pendientes')); });",
    "pm.test('El neto no incluye el pedido pendiente', () => { const f = pm.response.json().data[0]; pm.expect(f.vendido).to.eql(10000); pm.expect(f.pendientesAlCierre).to.eql(1); pm.expect(f.neto).to.be.closeTo(f.vendido - f.comision, 0.001); });",
  ]),
  correrCierre('Segunda corrida igual: no se crea ni se envia nada', AHORA1, [corrida('cierresCreados', 0), corrida('mailsEnviados', 0), corrida('cierresEnviados', 0)]),
  item('Atajo de test: el proximo envio falla una vez', req('PUT', '/test/email-resumen-turno/fallas', { body: {}, query: 'cantidad=1' }), [status(200), "pm.test('Queda una falla pendiente', () => pm.expect(pm.response.json().data).to.eql(1));"]),
  correrCierre('Pasado mañana 00:30: se cierra el turno de mañana y el envio falla', AHORA2, [
    corrida('cierresCreados', 1),
    corrida('mailsEnviados', 0),
    corrida('cierresConFalla', 1),
  ]),
  cierresDelComercio('El segundo cierre queda pendiente con un intento y el proximo a los 10 minutos', [
    "pm.test('Dos cierres: el primero enviado y el segundo pendiente', () => { const d = pm.response.json().data; pm.expect(d).to.have.lengthOf(2); pm.expect(d[0].emailEstado).to.eql('ENVIADO'); pm.expect(d[1].emailEstado).to.eql('PENDIENTE'); pm.expect(d[1].emailIntentos).to.eql(1); });",
    "pm.test('Proximo intento a los 10 minutos', () => { const p = pm.response.json().data[1].emailProximoIntento; pm.expect(p.slice(0, 16)).to.eql(pm.environment.get('ct_ahora2').slice(0, 14) + '40'); });",
  ]),
  correrCierre('A los 9 minutos todavia no se reintenta', AHORA2_9, [corrida('mailsEnviados', 0)]),
  correrCierre('A los 10 minutos se reintenta y esta vez sale', AHORA2_10, [corrida('mailsEnviados', 1), corrida('cierresEnviados', 1), corrida('cierresConFalla', 0)]),
  cierresDelComercio('Los dos cierres quedaron enviados', [
    "pm.test('Ambos enviados y el segundo con un intento', () => { const d = pm.response.json().data; pm.expect(d.map((x) => x.emailEstado)).to.eql(['ENVIADO', 'ENVIADO']); pm.expect(d[1].emailIntentos).to.eql(1); pm.expect(d[1].emailProximoIntento).to.eql(null); });",
  ]),
  item('Atajo de test: se apagan las fallas simuladas', req('PUT', '/test/email-resumen-turno/fallas', { body: {}, query: 'cantidad=0' }), [status(200), "pm.test('Sin fallas pendientes', () => pm.expect(pm.response.json().data).to.eql(0));"]),
  item('Atajo de test: los cierres exigen el comercio', req('GET', '/test/cierres-turno'), [status(400)]),
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
