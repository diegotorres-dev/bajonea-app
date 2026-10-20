import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const collectionPath = path.resolve(__dirname, '../../../postman/Bajonea-MVP.postman_collection.json');
const environmentPath = path.resolve(__dirname, '../../../postman/Bajonea-Local.postman_environment.json');

const PREFIJO_CARPETA = '74 - ';
const NOMBRE_CARPETA = '74 - Pedido por turno y Vendido en el turno Fase 2 T2 (turno estampado al confirmar el pago, resumen-turno para el Dueño y el Empleado, pendientes de otro turno, la edicion de horarios no lo cambia, autorizacion, backfill)';

const v = (clave) => `tt_${clave}`;

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

const productoCuerpo = (nombre, precio) => `{"nombre": "${nombre}", "descripcion": "Descripcion T2", "precio": ${precio}, "categoriaId": ${CAT}}`;

function pedidoPagado(clave, { ahora } = {}) {
  const pre = ahora ? ahora : [];
  return [
    item(`[pedido ${clave}] El Cliente vacia el carrito`, req('DELETE', '/carrito', { token: TOKEN_COMPRADOR }), [`pm.test('Carrito vaciado o ya vacio', () => pm.expect([200, 404]).to.include(pm.response.code));`]),
    item(`[pedido ${clave}] El Cliente agrega el producto al carrito`, req('POST', '/carrito/items', { token: TOKEN_COMPRADOR, rawBody: `{"productoId": {{${v('prod')}}}, "cantidad": 1}` }), [status(201)]),
    item(
      `[pedido ${clave}] El Cliente confirma el pedido (retiro en el local)`,
      req('POST', '/pedidos/cliente', { token: TOKEN_COMPRADOR, rawBody: '{"tipoEntrega": "RETIRO", "direccionId": null}' }),
      [status(201), guardar(v(`ped_${clave}`), 'pm.response.json().data.id')],
    ),
    item(
      `[pedido ${clave}] Atajo de test: el pago queda aprobado${ahora ? ' a la hora elegida' : ''}`,
      req('PUT', `/test/pedidos/${P(clave)}/pago-aprobado`, { body: {}, query: ahora ? `registrarPago=true&ahora={{${v('ahora')}}}` : 'registrarPago=true' }),
      [status(200)],
      pre,
    ),
  ];
}

const resumen = (nombre, token, codigo, comprobaciones = [], comercio = COM) =>
  item(nombre, req('GET', '/pedidos/comercio/resumen-turno', { token, comercio: comercio === null ? undefined : comercio }), [status(codigo), ...comprobaciones]);

agregar(
  item('Login Administrador (sesion propia de esta carpeta)', req('POST', '/auth/login', { body: { nombreUsuario: '{{admin_usuario}}', password: '{{admin_password}}' } }), [
    status(200),
    guardar('token_admin', 'pm.response.json().data.token'),
  ]),
  item(
    'Registro Dueño (abierto los siete dias las 24 horas)',
    req('POST', '/auth/registro/comercio', {
      body: {
        aceptaTerminos: true,
        razonSocial: 'Turnos T2 SRL',
        cuit: `{{${v('cuit_tmp')}}}`,
        condicionIva: 'RESPONSABLE_INSCRIPTO',
        tipoSociedad: 'SRL',
        domicilioFiscal: 'Direccion fiscal T2 100',
        fechaInicioActividades: '2020-01-01',
        nombre: `{{${v('d_nombre')}}}`,
        descripcion: 'Comercio generado por la coleccion de Postman (pedido por turno, Fase 2 T2)',
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
        fotoPerfilUrl: 'https://res.cloudinary.com/demo/image/upload/postman-turnos-t2.jpg',
        redesSociales: [{ tipo: 'INSTAGRAM', url: 'instagram.com/turnost2' }],
      },
    }),
    [status(201)],
    [...identidad('d'), ...datosDueno, guardar(v('d_nombre'), "'Local Turnos T2 ' + Date.now().toString(36)")],
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
    [guardar(v('cat_nombre'), "'Cat Turnos T2 ' + Date.now().toString(36)")],
  ),
  item('El Dueño crea el producto con el que compran los Clientes', req('POST', '/productos', { token: TOKEN_DUENO, comercio: COM, rawBody: productoCuerpo('Producto Turnos T2', 10000) }), [
    status(201),
    guardar(v('prod'), 'pm.response.json().data.id'),
  ]),
  ...clienteNuevo('c', 'Carla'),
  loginDe('c', 'Carla (Compradora)', TOKEN_COMPRADOR),
  ...clienteNuevo('e', 'Elena'),
  ...empleadoAlEquipo('e', 'Elena'),
  loginDe('e', 'Elena (Empleada)', TOKEN_EMPLEADO),
  ...clienteNuevo('x', 'Ximena'),
  loginDe('x', 'Ximena (sin relacion con el comercio)', TOKEN_AJENO),
);

agregar(
  resumen('Antes de cualquier pedido: el turno esta en curso y todo en cero', TOKEN_DUENO, 200, [
    "pm.test('Estado EN_CURSO y turno de hoy', () => { const d = pm.response.json().data; pm.expect(d.estado).to.eql('EN_CURSO'); pm.expect(d.turno.inicio).to.be.a('string'); pm.expect(d.turno.fin).to.be.a('string'); });",
    "pm.test('Todo en cero', () => { const d = pm.response.json().data; pm.expect(d.vendido).to.eql(0); pm.expect(d.comision).to.eql(0); pm.expect(d.neto).to.eql(0); pm.expect(d.cantidadPedidos).to.eql(0); pm.expect(d.cantidadPendientes).to.eql(0); });",
  ]),
  ...pedidoPagado('aceptado'),
  ...pedidoPagado('pendiente'),
  item('El Dueño acepta el primer pedido', req('PUT', `/pedidos/comercio/${P('aceptado')}/aceptar`, { token: TOKEN_DUENO, comercio: COM, body: {} }), [status(200)]),
  item('El Dueño lee la lista del comercio para conocer el cargo del pedido aceptado', req('GET', '/pedidos/comercio', { token: TOKEN_DUENO, comercio: COM }), [
    status(200),
    `const p = pm.response.json().data.find((x) => x.id === Number(${entorno(v('ped_aceptado'))}));`,
    guardar(v('cargo'), 'p.cargoServicioComercio'),
    guardar(v('subtotal'), 'p.subtotal'),
  ]),
  resumen('Dueño: vendido bruto, comision y neto del turno, dos pedidos y uno pendiente', TOKEN_DUENO, 200, [
    "pm.test('Vendido bruto = subtotal del pedido aceptado', () => pm.expect(pm.response.json().data.vendido).to.eql(Number(pm.environment.get('tt_subtotal'))));",
    "pm.test('Comision = cargo del comercio y neto = vendido - comision', () => { const d = pm.response.json().data; pm.expect(d.comision).to.be.closeTo(Number(pm.environment.get('tt_cargo')), 0.001); pm.expect(d.neto).to.be.closeTo(d.vendido - d.comision, 0.001); });",
    "pm.test('Dos pedidos del turno y uno pendiente', () => { const d = pm.response.json().data; pm.expect(d.estado).to.eql('EN_CURSO'); pm.expect(d.cantidadPedidos).to.eql(2); pm.expect(d.cantidadPendientes).to.eql(1); });",
    "pm.test('Los siete campos del Dueño', () => pm.expect(Object.keys(pm.response.json().data).sort()).to.eql(['cantidadPedidos', 'cantidadPendientes', 'comision', 'estado', 'neto', 'turno', 'vendido']));",
  ]),
  ...pedidoPagado('ayer', { ahora: instanteDelDia('ahora', -1, '10:00:00') }),
  resumen('Un pedido pagado ayer pertenece al turno de ayer: suma un pendiente pero no entra en el turno de hoy', TOKEN_DUENO, 200, [
    "pm.test('Pedidos del turno sin cambios y un pendiente mas', () => { const d = pm.response.json().data; pm.expect(d.cantidadPedidos).to.eql(2); pm.expect(d.cantidadPendientes).to.eql(2); pm.expect(d.vendido).to.eql(Number(pm.environment.get('tt_subtotal'))); });",
  ]),
  ...pedidoPagado('madrugada', { ahora: instanteDelDia('ahora', 0, '00:00:30') }),
  resumen('Un pedido pagado hoy a las 00:00:30 entra en el turno de hoy (la franja es de 00:00 a 23:59)', TOKEN_DUENO, 200, [
    "pm.test('Tres pedidos del turno y tres pendientes', () => { const d = pm.response.json().data; pm.expect(d.cantidadPedidos).to.eql(3); pm.expect(d.cantidadPendientes).to.eql(3); });",
  ]),
  resumen('Empleada: el mismo vendido y los mismos contadores, sin comision ni neto', TOKEN_EMPLEADO, 200, [
    "pm.test('Cinco campos, sin comision ni neto', () => pm.expect(Object.keys(pm.response.json().data).sort()).to.eql(['cantidadPedidos', 'cantidadPendientes', 'estado', 'turno', 'vendido']));",
    "pm.test('Mismo vendido bruto y mismos contadores', () => { const d = pm.response.json().data; pm.expect(d.vendido).to.eql(Number(pm.environment.get('tt_subtotal'))); pm.expect(d.cantidadPedidos).to.eql(3); pm.expect(d.cantidadPendientes).to.eql(3); });",
    "pm.test('Ni el texto de la respuesta nombra la comision', () => pm.expect(pm.response.text()).to.not.include('comision'));",
  ]),
  item(
    'El Dueño edita los horarios (rige desde mañana)',
    req('PUT', '/comercios/perfil/horarios', {
      token: TOKEN_DUENO,
      comercio: COM,
      body: { horarios: horariosTodosLosDias.map((h) => ({ ...h, horaCierre: '22:00:00' })) },
    }),
    [status(200)],
  ),
  resumen('Editar los horarios no cambia el turno de hoy ni sus cifras', TOKEN_DUENO, 200, [
    "pm.test('Mismo turno, mismas cifras', () => { const d = pm.response.json().data; pm.expect(d.estado).to.eql('EN_CURSO'); pm.expect(d.cantidadPedidos).to.eql(3); pm.expect(d.vendido).to.eql(Number(pm.environment.get('tt_subtotal'))); });",
  ]),
  resumen('Sin token: 401', undefined, 401),
  resumen('Administrador: 403', 'token_admin', 403),
  resumen('Cliente sin relacion y con header: el mismo 404 de siempre', TOKEN_AJENO, 404, [
    "pm.test('Mensaje de comercio no encontrado', () => pm.expect(pm.response.json().mensaje).to.eql('Comercio no encontrado'));",
  ]),
  resumen('Cliente sin relacion y sin header: 400', TOKEN_AJENO, 400, [], null),
  item('La ruta vieja resumen-hoy ya no existe', req('GET', '/pedidos/comercio/resumen-hoy', { token: TOKEN_DUENO, comercio: COM }), [
    "pm.test('Responde un error de cliente y no 200', () => { pm.expect(pm.response.code).to.be.at.least(400); pm.expect(pm.response.code).to.be.below(500); });",
  ]),
  item('Atajo de test: el proceso de asignacion de turnos responde con sus contadores', req('POST', '/test/jobs/backfill-turnos', { body: {} }), [
    status(200),
    "pm.test('Trae asignados y sin turno', () => { const d = pm.response.json().data; pm.expect(d.asignados).to.be.a('number'); pm.expect(d.sinTurno).to.be.a('number'); });",
  ]),
  item('Atajo de test: repetir el proceso no asigna nada nuevo', req('POST', '/test/jobs/backfill-turnos', { body: {} }), [
    status(200),
    "pm.test('Nada nuevo para asignar', () => pm.expect(pm.response.json().data.asignados).to.eql(0));",
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
const claves = ['com', 'cat', 'cat_nombre', 'prod', 'cuit_tmp', 'dni_rep_tmp', 'ahora', 'cargo', 'subtotal',
  'd_nombre', 'd_email', 'd_usuario', 'd_password', 'd_dni', 'd_codigo', 'd_token', 'd_id',
  'e_email', 'e_usuario', 'e_password', 'e_dni', 'e_codigo', 'e_token', 'e_id', 'e_inv_codigo',
  'c_email', 'c_usuario', 'c_password', 'c_dni', 'c_codigo', 'c_token', 'c_id',
  'x_email', 'x_usuario', 'x_password', 'x_dni', 'x_codigo', 'x_token', 'x_id',
  'ped_aceptado', 'ped_pendiente', 'ped_ayer', 'ped_madrugada'].map(v);
const existentes = new Set(environment.values.map((x) => x.key));
for (const key of claves) {
  if (!existentes.has(key)) environment.values.push({ key, value: '', type: 'default', enabled: true });
}
fs.writeFileSync(environmentPath, JSON.stringify(environment, null, 2) + '\n', 'utf8');

console.log(`OK: carpeta "${NOMBRE_CARPETA.slice(0, 40)}..." con ${items.length} requests.`);
