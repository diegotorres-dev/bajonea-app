import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const collectionPath = path.resolve(__dirname, '../../../postman/Bajonea-MVP.postman_collection.json');

const PREFIJO_CARPETA = '77 - ';
const NOMBRE_CARPETA = '77 - Estadísticas del Dueño Fase 2 T5 (por día y por turno, siete categorías, coincidencia con el panel, parámetros inválidos y acceso exclusivo del Dueño)';

const v = (clave) => `es_${clave}`;

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
    guardar(v(`${clave}_email`), `'es.${clave}.' + s + '@bajonea.test'`),
    guardar(v(`${clave}_usuario`), `('es${clave}' + s).slice(0, 20)`),
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

const COM = `{{${v('com')}}}`;
const TOKEN_DUENO = v('d_token');
const TOKEN_EMPLEADO = v('e_token');
const TOKEN_COMPRADOR = v('c_token');
const CAT = `{{${v('cat')}}}`;
const P = (clave) => `{{${v(`ped_${clave}`)}}}`;
const HOY = `{{${v('hoy')}}}`;
const AYER = `{{${v('ayer')}}}`;
const ANTEAYER = `{{${v('anteayer')}}}`;

const items = [];
const agregar = (...nuevos) => items.push(...nuevos);

function clienteNuevo(clave, nombre) {
  return [
    item(
      `Registro ${nombre}`,
      req('POST', '/auth/registro/cliente', {
        body: {
          nombre,
          apellido: 'Estadisticas',
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

const productoCuerpo = (nombre, precio) => `{"nombre": "${nombre}", "descripcion": "Descripcion T5", "precio": ${precio}, "categoriaId": ${CAT}}`;

function pedidoPagado(clave, momento) {
  const query = momento ? `registrarPago=true&ahora=${momento}` : 'registrarPago=true';
  return [
    item(`[pedido ${clave}] El Cliente vacia el carrito`, req('DELETE', '/carrito', { token: TOKEN_COMPRADOR }), [`pm.test('Carrito vaciado o ya vacio', () => pm.expect([200, 404]).to.include(pm.response.code));`]),
    item(`[pedido ${clave}] El Cliente agrega el producto al carrito`, req('POST', '/carrito/items', { token: TOKEN_COMPRADOR, rawBody: `{"productoId": {{${v('prod')}}}, "cantidad": 1}` }), [status(201)]),
    item(
      `[pedido ${clave}] El Cliente confirma el pedido (retiro en el local)`,
      req('POST', '/pedidos/cliente', { token: TOKEN_COMPRADOR, rawBody: '{"tipoEntrega": "RETIRO", "direccionId": null}' }),
      [status(201), guardar(v(`ped_${clave}`), 'pm.response.json().data.id')],
    ),
    item(`[pedido ${clave}] Atajo de test: el pago queda aprobado`, req('PUT', `/test/pedidos/${P(clave)}/pago-aprobado`, { body: {}, query }), [status(200)]),
  ];
}

const aceptar = (clave, nombre) =>
  item(`El Dueño acepta el pedido ${nombre}`, req('PUT', `/pedidos/comercio/${P(clave)}/aceptar`, { token: TOKEN_DUENO, comercio: COM, body: {} }), [status(200)]);

const consulta = (nombre, query, { token = TOKEN_DUENO, comercio = COM, comprobaciones = [] } = {}) =>
  item(nombre, req('GET', '/comercios/estadisticas', { token: token === null ? undefined : token, comercio: comercio === null ? undefined : comercio, query }), [...comprobaciones]);

const rechazo = (nombre, query, mensaje) =>
  consulta(nombre, query, {
    comprobaciones: [status(400), `pm.test('Mensaje: ${mensaje}', () => pm.expect(pm.response.json().mensaje).to.eql('${mensaje}'));`],
  });

const datos = "const d = pm.response.json().data;";

agregar(
  item('Login Administrador (sesion propia de esta carpeta)', req('POST', '/auth/login', { body: { nombreUsuario: '{{admin_usuario}}', password: '{{admin_password}}' } }), [
    status(200),
    guardar('token_admin', 'pm.response.json().data.token'),
  ], [
    guardar(v('hoy'), `${enZona('Date.now()')}.slice(0, 10)`),
    guardar(v('ayer'), `${enZona('Date.now() - 86400000')}.slice(0, 10)`),
    guardar(v('anteayer'), `${enZona('Date.now() - 2 * 86400000')}.slice(0, 10)`),
    guardar(v('ayer_13'), `${enZona('Date.now() - 86400000')}.slice(0, 10) + 'T13:00:00'`),
    guardar(v('ayer_14'), `${enZona('Date.now() - 86400000')}.slice(0, 10) + 'T14:00:00'`),
    guardar(v('anteayer_13'), `${enZona('Date.now() - 2 * 86400000')}.slice(0, 10) + 'T13:00:00'`),
  ]),
  item(
    'Registro Dueño (abierto los siete dias las 24 horas)',
    req('POST', '/auth/registro/comercio', {
      body: {
        aceptaTerminos: true,
        razonSocial: 'Estadisticas T5 SRL',
        cuit: `{{${v('cuit_tmp')}}}`,
        condicionIva: 'RESPONSABLE_INSCRIPTO',
        tipoSociedad: 'SRL',
        domicilioFiscal: 'Direccion fiscal T5 100',
        fechaInicioActividades: '2020-01-01',
        nombre: `{{${v('d_nombre')}}}`,
        descripcion: 'Comercio generado por la coleccion de Postman (estadisticas, Fase 2 T5)',
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
        fotoPerfilUrl: 'https://res.cloudinary.com/demo/image/upload/postman-estadisticas-t5.jpg',
        redesSociales: [{ tipo: 'INSTAGRAM', url: 'instagram.com/estadisticast5' }],
      },
    }),
    [status(201)],
    [...identidad('d'), ...datosDueno, guardar(v('d_nombre'), "'Local Estadisticas T5 ' + Date.now().toString(36)")],
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
    [guardar(v('cat_nombre'), "'Cat Estadisticas T5 ' + Date.now().toString(36)")],
  ),
  item('El Dueño crea el producto con el que compran los Clientes', req('POST', '/productos', { token: TOKEN_DUENO, comercio: COM, rawBody: productoCuerpo('Producto Estadisticas T5', 10000) }), [
    status(201),
    guardar(v('prod'), 'pm.response.json().data.id'),
  ]),
  ...clienteNuevo('c', 'Carla'),
  loginDe('c', 'Carla (Compradora)', TOKEN_COMPRADOR),
  ...clienteNuevo('e', 'Elena'),
  loginDe('e', 'Elena (futura Empleada)', TOKEN_EMPLEADO),
  ...empleadoAlEquipo('e', 'Elena'),
  ...pedidoPagado('a', '{{es_anteayer_13}}'),
  ...pedidoPagado('b', '{{es_ayer_13}}'),
  ...pedidoPagado('c', '{{es_ayer_14}}'),
  ...pedidoPagado('d'),
  ...pedidoPagado('e'),
  ...pedidoPagado('f'),
  aceptar('a', 'de anteayer'),
  aceptar('b', 'de ayer (1)'),
  aceptar('c', 'de ayer (2)'),
  aceptar('d', 'de hoy (1)'),
  item('El Dueño rechaza el pedido de hoy (2)', req('PUT', `/pedidos/comercio/${P('e')}/rechazar`, { token: TOKEN_DUENO, comercio: COM, body: { motivo: 'SIN_STOCK' } }), [status(200)]),
  consulta('Por día: tres días con sus cifras y los totales', `desde=${ANTEAYER}&hasta=${HOY}&agrupar=DIA`, {
    comprobaciones: [
      status(200),
      datos,
      "pm.test('Tres periodos, uno por dia, sin turno', () => { pm.expect(d.agrupar).to.eql('DIA'); pm.expect(d.periodos).to.have.lengthOf(3); pm.expect(d.periodos.map((p) => p.fecha)).to.eql([pm.environment.get('es_anteayer'), pm.environment.get('es_ayer'), pm.environment.get('es_hoy')]); pm.expect(d.periodos.every((p) => p.turno === null)).to.eql(true); });",
      "pm.test('Pedidos por dia: 1, 2 y 3', () => pm.expect(d.periodos.map((p) => p.pedidos)).to.eql([1, 2, 3]));",
      "pm.test('Facturados por dia: 1, 2 y 1', () => pm.expect(d.periodos.map((p) => p.facturados)).to.eql([1, 2, 1]));",
      "pm.test('Vendido por dia: 10000, 20000 y 10000', () => pm.expect(d.periodos.map((p) => p.vendido)).to.eql([10000, 20000, 10000]));",
      "pm.test('Ticket promedio de ayer es 10000', () => pm.expect(d.periodos[1].ticketPromedio).to.eql(10000));",
      "pm.test('Totales: 6 pedidos, 4 facturados, 40000 vendido', () => { pm.expect(d.totales.pedidos).to.eql(6); pm.expect(d.totales.facturados).to.eql(4); pm.expect(d.totales.vendido).to.eql(40000); });",
      "pm.test('El neto es vendido menos comision y la comision es positiva', () => { pm.expect(d.totales.comision).to.be.above(0); pm.expect(d.totales.neto).to.be.closeTo(d.totales.vendido - d.totales.comision, 0.001); });",
      "pm.test('La suma de los periodos es el total', () => pm.expect(d.periodos.reduce((s, p) => s + p.pedidos, 0)).to.eql(d.totales.pedidos));",
      "pm.test('Resultados: siete categorias, cinco en curso y un rechazado', () => { pm.expect(Object.keys(d.totales.resultados).sort()).to.eql(['ANULADO', 'CANCELADO', 'ENTREGADO', 'EN_CURSO', 'EXPIRADO', 'NO_RETIRADO', 'RECHAZADO']); pm.expect(d.totales.resultados.EN_CURSO).to.eql(5); pm.expect(d.totales.resultados.RECHAZADO).to.eql(1); });",
    ],
  }),
  consulta('Por turno: un turno por dia con su horario', `desde=${ANTEAYER}&hasta=${HOY}&agrupar=TURNO`, {
    comprobaciones: [
      status(200),
      datos,
      "pm.test('Tres turnos con horario de 24 horas que no cruza la medianoche', () => { pm.expect(d.periodos).to.have.lengthOf(3); d.periodos.forEach((p) => { pm.expect(p.turno).to.not.eql(null); pm.expect(p.turno.cruzaMedianoche).to.eql(false); pm.expect(p.turno.inicio.slice(11, 16)).to.eql('00:00'); }); });",
      "pm.test('Las cifras por turno son las del dia', () => pm.expect(d.periodos.map((p) => p.pedidos)).to.eql([1, 2, 3]));",
    ],
  }),
  item('Resumen del turno de hoy (panel)', req('GET', '/pedidos/comercio/resumen-turno', { token: TOKEN_DUENO, comercio: COM }), [
    status(200),
    guardar(v('panel_vendido'), 'pm.response.json().data.vendido'),
    guardar(v('panel_comision'), 'pm.response.json().data.comision'),
    guardar(v('panel_neto'), 'pm.response.json().data.neto'),
    guardar(v('panel_cantidad'), 'pm.response.json().data.cantidadPedidos'),
  ]),
  consulta('Las estadisticas de hoy coinciden con el panel', `desde=${HOY}&hasta=${HOY}&agrupar=TURNO`, {
    comprobaciones: [
      status(200),
      datos,
      "pm.test('Mismo vendido, comision, neto y cantidad que el panel', () => { const p = d.periodos[0]; const n = (k) => Number(pm.environment.get('es_' + k)); pm.expect(p.vendido).to.be.closeTo(n('panel_vendido'), 0.001); pm.expect(p.comision).to.be.closeTo(n('panel_comision'), 0.001); pm.expect(p.neto).to.be.closeTo(n('panel_neto'), 0.001); pm.expect(p.pedidos).to.eql(n('panel_cantidad')); });",
    ],
  }),
  consulta('Sin agrupar se agrupa por dia', `desde=${HOY}&hasta=${HOY}`, { comprobaciones: [status(200), datos, "pm.test('Agrupado por dia', () => pm.expect(d.agrupar).to.eql('DIA'));"] }),
  consulta('Un rango de 92 dias es valido', `desde=2020-01-01&hasta=2020-04-01&agrupar=DIA`, {
    comprobaciones: [status(200), datos, "pm.test('92 periodos en cero', () => { pm.expect(d.periodos).to.have.lengthOf(92); pm.expect(d.totales.pedidos).to.eql(0); pm.expect(d.totales.ticketPromedio).to.eql(null); });"],
  }),
  rechazo('Un rango de 93 dias da 400', `desde=2020-01-01&hasta=2020-04-02&agrupar=DIA`, 'El rango no puede superar los 92 días'),
  rechazo('Sin fechas da 400', `agrupar=DIA`, 'Indicá las fechas desde y hasta'),
  rechazo('Fecha con formato incorrecto da 400', `desde=05-10-2026&hasta=${HOY}`, 'La fecha desde tiene que tener el formato AAAA-MM-DD'),
  rechazo('Desde posterior a hasta da 400', `desde=${HOY}&hasta=${AYER}`, 'La fecha desde no puede ser posterior a la fecha hasta'),
  rechazo('Agrupacion invalida da 400', `desde=${HOY}&hasta=${HOY}&agrupar=MES`, 'La agrupación tiene que ser DIA o TURNO'),
  consulta('La Empleada del comercio recibe 403', `desde=${HOY}&hasta=${HOY}`, { token: TOKEN_EMPLEADO, comprobaciones: [status(403)] }),
  consulta('La Empleada sin header recibe 403', `desde=${HOY}&hasta=${HOY}`, { token: TOKEN_EMPLEADO, comercio: null, comprobaciones: [status(403)] }),
  consulta('Una Cliente sin relacion recibe 403', `desde=${HOY}&hasta=${HOY}`, { token: TOKEN_COMPRADOR, comprobaciones: [status(403)] }),
  consulta('El Administrador recibe 403', `desde=${HOY}&hasta=${HOY}`, { token: 'token_admin', comprobaciones: [status(403)] }),
  consulta('Sin token recibe 401', `desde=${HOY}&hasta=${HOY}`, { token: null, comprobaciones: [status(401)] }),
  consulta('El Dueño sin X-Comercio-Id recibe 400', `desde=${HOY}&hasta=${HOY}`, { comercio: null, comprobaciones: [status(400)] }),
  consulta('El Dueño con X-Comercio-Id no numerico recibe 400', `desde=${HOY}&hasta=${HOY}`, { comercio: 'abc', comprobaciones: [status(400)] }),
  consulta('El Dueño con un comercio que no existe recibe 404', `desde=${HOY}&hasta=${HOY}`, { comercio: '999999999', comprobaciones: [status(404)] }),
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
