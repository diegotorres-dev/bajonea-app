import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const collectionPath = path.resolve(__dirname, '../../../postman/Bajonea-MVP.postman_collection.json');
const environmentPath = path.resolve(__dirname, '../../../postman/Bajonea-Local.postman_environment.json');

const PREFIJO_CARPETA = '89 - ';
const NOMBRE_CARPETA = '89 - Reclamos Fase 5 S5 (elegibilidad y plazo de 7 dias, un reclamo por pedido, bloque por rol, bandeja y detalle del Administrador, reembolso total, parcial con tope por saldo y rechazo, falla del reembolso y reintento, avisos; requiere el Mercado Pago simulado de scripts/mp-simulado.mjs y el backend con MERCADOPAGO_API_BASE_URL)';

const v = (clave) => `rc_${clave}`;

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

const MP = '{{mp_simulado_url}}';

function reqMp(method, urlPath, query) {
  const segments = urlPath.replace(/^\//, '').split('/');
  const url = { raw: `${MP}/${segments.join('/')}${query ? `?${query}` : ''}`, host: [MP], path: segments };
  if (query) {
    url.query = query.split('&').map((par) => {
      const [key, ...resto] = par.split('=');
      return { key, value: resto.join('=') };
    });
  }
  return { method, header: [], url };
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
const mensajeDe = (texto) => prueba('Mensaje exacto', `pm.expect(pm.response.json().mensaje).to.eql(${JSON.stringify(texto)});`);
const dato = (ruta, esperado) => prueba(`${ruta} es ${esperado}`, `pm.expect(pm.response.json().data.${ruta}).to.eql(${JSON.stringify(esperado)});`);
const errorDeCampo = (campo, texto) => prueba(`Error en ${campo}: ${texto}`, `pm.expect(pm.response.json().data.${campo}).to.eql(${JSON.stringify(texto)});`);

function identidad(clave) {
  return [
    `const s = Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36);`,
    guardar(v(`${clave}_email`), `'rc.${clave}.' + s + '@bajonea.test'`),
    guardar(v(`${clave}_usuario`), `('rc${clave}' + s).slice(0, 20)`),
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
const TOKEN_CLIENTE = v('c_token');
const TOKEN_OTRO = v('o_token');
const TOKEN_EMPLEADO = v('e_token');
const TOKEN_ADMIN = 'token_admin';
const CAT = `{{${v('cat')}}}`;
const PED = (clave) => `{{${v(`ped_${clave}`)}}}`;
const REC = (clave) => `{{${v(`rec_${clave}`)}}}`;
const TOTAL = (clave) => `Number(${entorno(v(`tot_${clave}`))})`;

const items = [];
const agregar = (...nuevos) => items.push(...nuevos);

function clienteNuevo(clave, nombre, tokenVar, { conDireccion = false } = {}) {
  return [
    item(
      `Registro ${nombre}`,
      req('POST', '/auth/registro/cliente', {
        body: {
          nombre,
          apellido: 'Reclamos',
          dni: `{{${v(`${clave}_dni`)}}}`,
          fechaNacimiento: '1995-05-20',
          telefono: '+5492964551238',
          nombreUsuario: `{{${v(`${clave}_usuario`)}}}`,
          email: `{{${v(`${clave}_email`)}}}`,
          password: `{{${v(`${clave}_password`)}}}`,
          aceptaTerminos: true,
          direccion: { calle: 'Calle Siempre Viva', numero: '125', pisoDepto: null, codigoPostal: '9420', localidadId: '{{localidad_id}}', principal: true },
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
      guardar(tokenVar, 'pm.response.json().data.token'),
      guardar(v(`${clave}_id`), 'pm.response.json().data.usuario.id'),
    ]),
    ...(conDireccion
      ? [item(`Direccion de ${nombre}`, req('GET', '/clientes/perfil', { token: tokenVar }), [status(200), guardar(v('c_dir'), 'pm.response.json().data.direccion.id')])]
      : []),
  ];
}

agregar(
  item('Login Administrador (sesion propia de esta carpeta)', req('POST', '/auth/login', { body: { nombreUsuario: '{{admin_usuario}}', password: '{{admin_password}}' } }), [
    status(200),
    guardar(TOKEN_ADMIN, 'pm.response.json().data.token'),
    guardar(v('admin_id'), 'pm.response.json().data.usuario.id'),
  ]),
  item(
    'Registro Dueño',
    req('POST', '/auth/registro/comercio', {
      body: {
        aceptaTerminos: true,
        razonSocial: 'Reclamos S5 SRL',
        cuit: `{{${v('cuit_tmp')}}}`,
        condicionIva: 'RESPONSABLE_INSCRIPTO',
        tipoSociedad: 'SRL',
        domicilioFiscal: 'Direccion fiscal reclamos 100',
        fechaInicioActividades: '2020-01-01',
        nombre: 'Local Reclamos S5',
        descripcion: 'Comercio generado por la coleccion de Postman (reclamos, tramo S5)',
        telefono: '+5492964555448',
        tipoComercio: 'RESTAURANTE',
        aceptaDelivery: true,
        aceptaRetiro: true,
        nombreUsuario: `{{${v('d_usuario')}}}`,
        email: `{{${v('d_email')}}}`,
        password: `{{${v('d_password')}}}`,
        direccion: { calle: 'Belgrano', numero: '804', pisoDepto: null, codigoPostal: '9420', localidadId: '{{localidad_id}}', principal: false },
        horarios: horariosTodosLosDias,
        nombreRepresentante: 'Carlos',
        apellidoRepresentante: 'Sanchez',
        dniRepresentante: `{{${v('dni_rep_tmp')}}}`,
        telefonoRepresentante: '+5492964701107',
        fechaNacimientoRepresentante: '1988-04-04',
        fotoPerfilUrl: 'https://res.cloudinary.com/demo/image/upload/postman-reclamos-s5.jpg',
        redesSociales: [{ tipo: 'INSTAGRAM', url: 'instagram.com/reclamoss5' }],
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
  item('Login Dueño', req('POST', '/auth/login', { body: { nombreUsuario: `{{${v('d_usuario')}}}`, password: `{{${v('d_password')}}}` } }), [
    status(200),
    guardar(TOKEN_DUENO, 'pm.response.json().data.token'),
    guardar(v('d_id'), 'pm.response.json().data.usuario.id'),
  ]),
  item('Administrador busca el comercio pendiente del Dueño', req('GET', '/administrador/comercios/pendientes', { token: TOKEN_ADMIN }), [
    status(200),
    `const c = pm.response.json().data.find((x) => x.emailCuenta === ${entorno(v('d_email'))}.toLowerCase());`,
    "pm.test('El comercio del Dueño esta pendiente', () => pm.expect(c).to.exist);",
    guardar(v('com'), 'c.id'),
  ]),
  item('Administrador aprueba el comercio', req('PUT', `/administrador/comercios/${COM}/resolver`, { token: TOKEN_ADMIN, body: { aprobar: true } }), [status(200)]),
  item('Atajo de test: el Dueño vincula una cuenta de Mercado Pago simulada y el comercio pasa a APTO_VENTA', req('POST', `/test/duenos/{{${v('d_id')}}}/mercadopago-simulada`, { body: {} }), [status(200)]),
  item(
    'Administrador crea la categoria del producto',
    req('POST', '/categorias', { token: TOKEN_ADMIN, rawBody: `{"nombre": "{{${v('cat_nombre')}}}"}` }),
    [status(201), guardar(v('cat'), 'pm.response.json().data.id')],
    [guardar(v('cat_nombre'), "'Cat Reclamos S5 ' + Date.now().toString(36)")],
  ),
  item('El Dueño crea el producto', req('POST', '/productos', { token: TOKEN_DUENO, comercio: COM, rawBody: `{"nombre": "Producto Reclamos S5", "descripcion": "Producto de los reclamos", "precio": 1500, "categoriaId": ${CAT}}` }), [
    status(201),
    guardar(v('prod'), 'pm.response.json().data.id'),
  ]),
  ...clienteNuevo('c', 'Carla', TOKEN_CLIENTE, { conDireccion: true }),
  ...clienteNuevo('o', 'Olga', TOKEN_OTRO),
  ...clienteNuevo('e', 'Elena', TOKEN_EMPLEADO),
  item('El Dueño invita a Elena al equipo', req('POST', '/comercios/equipo/invitaciones', { token: TOKEN_DUENO, comercio: COM, body: { email: `{{${v('e_email')}}}` } }), [status(201)]),
  item('Bypass test - codigo de la invitacion de Elena', req('GET', '/test/invitaciones-empleado/codigo', { query: `email={{${v('e_email')}}}&comercioId=${COM}` }), [
    status(200),
    guardar(v('e_inv_codigo'), 'pm.response.json().data'),
  ]),
  item('Elena acepta la invitacion', req('POST', '/auth/invitaciones-empleado/aceptar', { body: { email: `{{${v('e_email')}}}`, codigo: `{{${v('e_inv_codigo')}}}` } }), [status(200)]),
);

const accion = (nombre, token, clave, ruta, codigo = 200, comprobaciones = []) =>
  item(nombre, req('PUT', `/pedidos/comercio/${PED(clave)}/${ruta}`, { token, comercio: COM, body: {} }), [status(codigo), ...comprobaciones]);

function pedidoEnCurso(clave, tipo) {
  const direccion = tipo === 'DOMICILIO' ? `{{${v('c_dir')}}}` : 'null';
  return [
    item(`[pedido ${clave}] El Cliente vacia el carrito`, req('DELETE', '/carrito', { token: TOKEN_CLIENTE }), [`pm.test('Carrito vaciado o ya vacio', () => pm.expect([200, 404]).to.include(pm.response.code));`]),
    item(`[pedido ${clave}] El Cliente agrega el producto al carrito`, req('POST', '/carrito/items', { token: TOKEN_CLIENTE, rawBody: `{"productoId": {{${v('prod')}}}, "cantidad": 1}` }), [status(201)]),
    item(
      `[pedido ${clave}] El Cliente confirma el pedido (${tipo === 'DOMICILIO' ? 'a domicilio' : 'retiro en el local'})`,
      req('POST', '/pedidos/cliente', { token: TOKEN_CLIENTE, rawBody: `{"tipoEntrega": "${tipo}", "direccionId": ${direccion}}` }),
      [status(201), guardar(v(`ped_${clave}`), 'pm.response.json().data.id'), guardar(v(`tot_${clave}`), 'pm.response.json().data.total')],
    ),
    item(`[pedido ${clave}] "Ir a pagar" crea la preferencia en Mercado Pago`, req('POST', `/pedidos/cliente/${PED(clave)}/pago`, { token: TOKEN_CLIENTE }), [status(200)]),
    item(`[pedido ${clave}] El webhook confirma el pago (id numerico del Mercado Pago simulado)`, req('POST', '/webhooks/mercadopago', { query: `pedidoId=${PED(clave)}&data.id={{${v(`idpago_${clave}`)}}}&type=payment` }), [status(200)], [
      guardar(v(`idpago_${clave}`), `100000 + Number(${entorno(v(`ped_${clave}`))})`),
    ]),
  ];
}

function pedidoEntregado(clave, tipo) {
  return [
    ...pedidoEnCurso(clave, tipo),
    accion(`[pedido ${clave}] El Dueño acepta el pedido`, TOKEN_DUENO, clave, 'aceptar'),
    accion(`[pedido ${clave}] El Dueño lo despacha`, TOKEN_DUENO, clave, 'despachar'),
    tipo === 'DOMICILIO'
      ? item(`[pedido ${clave}] El Cliente confirma que lo recibio`, req('PUT', `/pedidos/cliente/${PED(clave)}/entregar`, { token: TOKEN_CLIENTE, body: {} }), [status(200), dato('estado', 'ENTREGADO')])
      : accion(`[pedido ${clave}] El Dueño lo entrega en el local`, TOKEN_DUENO, clave, 'entregar', 200, [prueba('Queda ENTREGADO', "pm.expect(pm.response.json().data.estado).to.eql('ENTREGADO');")]),
  ];
}

const envejecerEntrega = (clave, dias) =>
  item(`[pedido ${clave}] Atajo de test: el pedido se entrego hace ${dias} dias mas`, req('PUT', `/test/pedidos/${PED(clave)}/envejecer-entrega`, { body: {}, query: `dias=${dias}` }), [status(200)]);

const reclamar = (nombre, clave, token, motivo, descripcion, codigo, comprobaciones = []) =>
  item(nombre, req('POST', `/pedidos/cliente/${PED(clave)}/reclamo`, { token, body: motivo === undefined ? { descripcion } : { motivo, descripcion } }), [status(codigo), ...comprobaciones]);

const DESCRIPCION = 'Faltó la bebida del combo y vino frío';

const bloqueDelCliente = (nombre, clave, comprobaciones) =>
  item(nombre, req('GET', '/pedidos/cliente', { token: TOKEN_CLIENTE }), [
    status(200),
    `const p = pm.response.json().data.find((x) => x.id === Number(${entorno(v(`ped_${clave}`))}));`,
    "pm.test('Encuentra el pedido', () => pm.expect(p).to.exist);",
    ...comprobaciones,
  ]);

const resolver = (nombre, clave, cuerpo, codigo, comprobaciones = [], token = TOKEN_ADMIN) =>
  item(nombre, req('PUT', `/administrador/reclamos/${REC(clave)}/resolver`, { token, body: cuerpo }), [status(codigo), ...comprobaciones]);

const detalle = (nombre, clave, comprobaciones, codigo = 200, token = TOKEN_ADMIN) =>
  item(nombre, req('GET', `/administrador/reclamos/${REC(clave)}`, { token }), [status(codigo), ...(codigo === 200 ? ['const d = pm.response.json().data;'] : []), ...comprobaciones]);

const ultimoReembolsoDelSimulado = (nombre, comprobaciones) =>
  item(nombre, reqMp('GET', '/__control/reembolsos'), [status(200), 'const lista = pm.response.json().reembolsos;', 'const ultimo = lista[lista.length - 1];', ...comprobaciones]);

const avisos = (nombre, token, comercio, tipo, clave, cantidad, texto) =>
  item(nombre, req('GET', '/notificaciones', { token, comercio }), [
    status(200),
    `const suyos = pm.response.json().data.filter((n) => n.tipo === '${tipo}' && n.entidadId === Number(${entorno(v(`ped_${clave}`))}));`,
    `pm.test('Hay ${cantidad} aviso(s) ${tipo} de este pedido', () => pm.expect(suyos.length).to.eql(${cantidad}));`,
    ...(texto ? [`pm.test('El texto es el aprobado', () => pm.expect(suyos[0].mensaje).to.eql(${texto}));`] : []),
  ]);

const tot = (clave) => `Number(${entorno(v(`tot_${clave}`))})`;

// ----------------------------------------------------------------------------- pedidos de la carpeta
agregar(
  ...pedidoEntregado('dom1', 'DOMICILIO'),
  ...pedidoEntregado('ret1', 'RETIRO'),
  ...pedidoEntregado('dom2', 'DOMICILIO'),
  ...pedidoEntregado('dom3', 'DOMICILIO'),
  ...pedidoEntregado('ret2', 'RETIRO'),
  ...pedidoEnCurso('curso', 'RETIRO'),
);

// ----------------------------------------------------------------------------- elegibilidad y creacion
agregar(
  bloqueDelCliente('Elegibilidad: el pedido a domicilio entregado trae el bloque con los seis motivos y el plazo', 'dom1', [
    prueba('Puede reclamar y trae los seis motivos y la fecha limite', "pm.expect(p.reclamo.puedeReclamar).to.eql(true); pm.expect(p.reclamo.motivosDisponibles.length).to.eql(6); pm.expect(p.reclamo.motivosDisponibles).to.include('NO_RECIBI_PEDIDO'); pm.expect(p.reclamo.fechaLimiteReclamo).to.be.a('string');"),
    prueba('Sin reclamo todavia', "pm.expect(p.reclamo.id === undefined).to.eql(true);"),
  ]),
  bloqueDelCliente('Elegibilidad: el pedido de retiro entregado no ofrece NO_RECIBI_PEDIDO', 'ret1', [
    prueba('Cinco motivos, sin NO_RECIBI_PEDIDO', "pm.expect(p.reclamo.puedeReclamar).to.eql(true); pm.expect(p.reclamo.motivosDisponibles.length).to.eql(5); pm.expect(p.reclamo.motivosDisponibles).to.not.include('NO_RECIBI_PEDIDO');"),
  ]),
  bloqueDelCliente('Elegibilidad: un pedido en curso no trae bloque', 'curso', [
    prueba('Sin bloque reclamo', "pm.expect(p.reclamo === undefined).to.eql(true);"),
  ]),
  reclamar('Un pedido en curso no se reclama: 409', 'curso', TOKEN_CLIENTE, 'OTRO', DESCRIPCION, 409, [mensajeDe('Solo podés reclamar un pedido que ya te entregaron.')]),
  reclamar('Sin motivo: 400', 'dom1', TOKEN_CLIENTE, undefined, DESCRIPCION, 400, [errorDeCampo('motivo', 'Elegí el motivo del reclamo')]),
  reclamar('Motivo inexistente: 400', 'dom1', TOKEN_CLIENTE, 'INVENTADO', DESCRIPCION, 400),
  reclamar('Descripcion de 9 caracteres: 400', 'dom1', TOKEN_CLIENTE, 'OTRO', '123456789', 400),
  reclamar('Descripcion de 1001 caracteres: 400', 'dom1', TOKEN_CLIENTE, 'OTRO', 'a'.repeat(1001), 400),
  reclamar('NO_RECIBI_PEDIDO en un pedido de retiro: 400', 'ret1', TOKEN_CLIENTE, 'NO_RECIBI_PEDIDO', DESCRIPCION, 400, [errorDeCampo('motivo', 'Este pedido era para retirar en el local. Elegí otro motivo.')]),
  reclamar('Otro Cliente reclamando un pedido ajeno: 404', 'dom1', TOKEN_OTRO, 'OTRO', DESCRIPCION, 404),
  reclamar('El Dueño no puede crear reclamos: 403', 'dom1', TOKEN_DUENO, 'OTRO', DESCRIPCION, 403),
  reclamar('El Administrador no puede crear reclamos: 403', 'dom1', TOKEN_ADMIN, 'OTRO', DESCRIPCION, 403),
  item('Sin token: 401', req('POST', `/pedidos/cliente/${PED('dom1')}/reclamo`, { body: { motivo: 'OTRO', descripcion: DESCRIPCION } }), [status(401)]),
  reclamar('Crear el reclamo de un pedido a domicilio: 201', 'dom1', TOKEN_CLIENTE, 'NO_RECIBI_PEDIDO', DESCRIPCION, 201, [
    mensajeDe('Recibimos tu reclamo'),
    dato('estado', 'PENDIENTE'),
    dato('motivo', 'NO_RECIBI_PEDIDO'),
    guardar(v('rec_dom1'), 'pm.response.json().data.id'),
  ]),
  reclamar('El segundo reclamo del mismo pedido: 409', 'dom1', TOKEN_CLIENTE, 'OTRO', DESCRIPCION, 409, [mensajeDe('Ya hiciste un reclamo por este pedido.')]),
  bloqueDelCliente('El Cliente ve su reclamo pendiente y ya no puede reclamar', 'dom1', [
    prueba('Reclamo PENDIENTE', "pm.expect(p.reclamo.estado).to.eql('PENDIENTE'); pm.expect(p.reclamo.puedeReclamar).to.eql(false); pm.expect(p.reclamo.motivo).to.eql('NO_RECIBI_PEDIDO');"),
    prueba('El pedido sigue ENTREGADO y sin campos de reembolso', "pm.expect(p.estado).to.eql('ENTREGADO'); pm.expect(p.reembolsoEstado === undefined || p.reembolsoEstado === null).to.eql(true);"),
  ]),
  item('El Dueño ve el reclamo de su pedido sin el mensaje del Cliente', req('GET', '/pedidos/comercio', { token: TOKEN_DUENO, comercio: COM }), [
    status(200),
    `const p = pm.response.json().data.find((x) => x.id === Number(${entorno(v('ped_dom1'))}));`,
    prueba('Estado y motivo, sin descripcion ni elegibilidad', "pm.expect(p.reclamo.estado).to.eql('PENDIENTE'); pm.expect(p.reclamo.motivo).to.eql('NO_RECIBI_PEDIDO'); pm.expect(p.reclamo.descripcion === undefined).to.eql(true); pm.expect(p.reclamo.puedeReclamar === undefined).to.eql(true); pm.expect(JSON.stringify(p.reclamo)).to.not.include('Faltó');"),
  ]),
  item('La Empleada ve el pedido sin ningun dato del reclamo', req('GET', '/pedidos/comercio', { token: TOKEN_EMPLEADO, comercio: COM }), [
    status(200),
    `const p = pm.response.json().data.find((x) => x.id === Number(${entorno(v('ped_dom1'))}));`,
    prueba('Sin bloque reclamo y sin reembolso', "pm.expect(p.reclamo === undefined).to.eql(true); pm.expect(p.reembolsoEstado).to.eql('SIN_REEMBOLSO'); pm.expect(JSON.stringify(p)).to.not.include('NO_RECIBI_PEDIDO');"),
  ]),
  envejecerEntrega('ret2', 8),
  reclamar('Fuera de plazo: 409 con el texto del plazo', 'ret2', TOKEN_CLIENTE, 'OTRO', DESCRIPCION, 409, [mensajeDe('Pasaron los 7 días para reclamar este pedido.')]),
  bloqueDelCliente('Fuera de plazo: el bloque ya no deja reclamar', 'ret2', [
    prueba('No puede reclamar y no ofrece motivos', "pm.expect(p.reclamo.puedeReclamar).to.eql(false); pm.expect(p.reclamo.motivosDisponibles === undefined).to.eql(true);"),
  ]),
);

// ----------------------------------------------------------------------------- bandeja y detalle
agregar(
  item('Metricas: el panel cuenta los reclamos pendientes', req('GET', '/administrador/metricas', { token: TOKEN_ADMIN }), [
    status(200),
    prueba('reclamosPendientes es un numero positivo', "pm.expect(pm.response.json().data.reclamosPendientes).to.be.a('number').and.to.be.at.least(1);"),
  ]),
  item('Bandeja: el Cliente no entra', req('GET', '/administrador/reclamos', { token: TOKEN_CLIENTE }), [status(403)]),
  item('Bandeja: el Dueño no entra', req('GET', '/administrador/reclamos', { token: TOKEN_DUENO }), [status(403)]),
  item('Bandeja: sin token no entra', req('GET', '/administrador/reclamos'), [status(401)]),
  item('Bandeja: filtro invalido: 400', req('GET', '/administrador/reclamos', { token: TOKEN_ADMIN, query: 'filtro=INVENTADO' }), [status(400)]),
  item('Bandeja: pendientes con contadores, los mas viejos primero', req('GET', '/administrador/reclamos', { token: TOKEN_ADMIN, query: 'filtro=PENDIENTES&limite=200' }), [
    status(200),
    'const b = pm.response.json().data;',
    prueba('Trae los tres contadores', "pm.expect(b.contadores.pendientes).to.be.at.least(1); pm.expect(b.contadores.reembolsoEnProceso).to.be.a('number'); pm.expect(b.contadores.resueltos).to.be.a('number');"),
    prueba('Todos pendientes y ordenados por antiguedad', "const f = b.reclamos; f.forEach((r) => pm.expect(r.estado).to.eql('PENDIENTE')); for (let i = 1; i < f.length; i += 1) pm.expect(f[i - 1].fechaCreacion <= f[i].fechaCreacion).to.eql(true);"),
    prueba('Cada fila trae pedido, motivo, comercio, total y fecha', "b.reclamos.forEach((r) => { pm.expect(r.pedidoId).to.be.a('number'); pm.expect(r.motivo).to.be.a('string'); pm.expect(r.comercioNombre).to.be.a('string'); pm.expect(r.total).to.be.a('number'); pm.expect(r.fechaCreacion).to.be.a('string'); });"),
  ]),
  item('Bandeja: el limite acota las filas', req('GET', '/administrador/reclamos', { token: TOKEN_ADMIN, query: 'filtro=PENDIENTES&limite=1' }), [
    status(200),
    prueba('Una sola fila', "pm.expect(pm.response.json().data.reclamos.length).to.eql(1);"),
  ]),
  detalle('Detalle: trae el mensaje, el pedido, el saldo y ningun reembolso todavia', 'dom1', [
    prueba('Mensaje y estado', `pm.expect(d.descripcion).to.eql(${JSON.stringify(DESCRIPCION)}); pm.expect(d.estado).to.eql('PENDIENTE'); pm.expect(d.motivo).to.eql('NO_RECIBI_PEDIDO');`),
    prueba('Pedido del reclamo', `pm.expect(d.pedido.id).to.eql(Number(${entorno(v('ped_dom1'))})); pm.expect(d.pedido.comercioId).to.eql(Number(${entorno(v('com'))})); pm.expect(d.pedido.tipoEntrega).to.eql('DOMICILIO'); pm.expect(d.pedido.detalles.length).to.eql(1);`),
    prueba('El saldo es el total pagado y no hay reembolso', `pm.expect(d.saldoReembolsable).to.eql(${tot('dom1')}); pm.expect(d.reembolso === undefined || d.reembolso === null).to.eql(true);`),
  ]),
  item('Detalle: un reclamo inexistente: 404', req('GET', '/administrador/reclamos/999999999', { token: TOKEN_ADMIN }), [status(404)]),
  item('Resolver: un reclamo inexistente: 404', req('PUT', '/administrador/reclamos/999999999/resolver', { token: TOKEN_ADMIN, body: { tipo: 'REEMBOLSO_TOTAL' } }), [status(404)]),
  resolver('Resolver: el Cliente no puede: 403', 'dom1', { tipo: 'REEMBOLSO_TOTAL' }, 403, [], TOKEN_CLIENTE),
  resolver('Resolver: la Empleada no puede: 403', 'dom1', { tipo: 'REEMBOLSO_TOTAL' }, 403, [], TOKEN_EMPLEADO),
);

// ----------------------------------------------------------------------------- resolver: parcial con tope
agregar(
  resolver('Parcial: sin tipo: 400', 'dom1', {}, 400),
  resolver('Parcial: sin monto: 400', 'dom1', { tipo: 'REEMBOLSO_PARCIAL' }, 400, [errorDeCampo('monto', 'Indicá cuánto devolver')]),
  resolver('Parcial: monto cero: 400', 'dom1', { tipo: 'REEMBOLSO_PARCIAL', monto: 0 }, 400, [errorDeCampo('monto', 'El monto tiene que ser mayor a cero.')]),
  resolver('Parcial: monto negativo: 400', 'dom1', { tipo: 'REEMBOLSO_PARCIAL', monto: -5 }, 400, [errorDeCampo('monto', 'El monto tiene que ser mayor a cero.')]),
  resolver('Parcial: tres decimales: 400', 'dom1', { tipo: 'REEMBOLSO_PARCIAL', monto: 10.123 }, 400),
  item('Parcial: monto igual al total pagado: 400 pide el reembolso total', req('PUT', `/administrador/reclamos/${REC('dom1')}/resolver`, { token: TOKEN_ADMIN, rawBody: `{"tipo": "REEMBOLSO_PARCIAL", "monto": {{${v('tot_dom1')}}}}` }), [
    status(400),
    errorDeCampo('monto', 'Para devolver todo, elegí reembolso total.'),
  ]),
  item('Parcial: monto mayor al total pagado: 400', req('PUT', `/administrador/reclamos/${REC('dom1')}/resolver`, { token: TOKEN_ADMIN, rawBody: '{"tipo": "REEMBOLSO_PARCIAL", "monto": 99999.99}' }), [
    status(400),
    prueba('El mensaje dice cuanto queda', "pm.expect(pm.response.json().data.monto).to.match(/^El monto supera lo que queda por reembolsar \\(\\$\\d+\\.\\d\\d\\)\\.$/);"),
  ]),
  detalle('Parcial: despues de los rechazos el reclamo sigue pendiente y sin nota', 'dom1', [
    prueba('Pendiente y sin reembolso', "pm.expect(d.estado).to.eql('PENDIENTE'); pm.expect(d.reembolso === undefined || d.reembolso === null).to.eql(true);"),
  ]),
  resolver('Parcial: se aprueba un reembolso de 500,50', 'dom1', { tipo: 'REEMBOLSO_PARCIAL', monto: 500.5 }, 200, [
    mensajeDe('Reclamo resuelto'),
    'const d = pm.response.json().data;',
    prueba('Aprobado por 500,50 con el reembolso procesado', "pm.expect(d.estado).to.eql('APROBADO'); pm.expect(d.tipoResolucion).to.eql('REEMBOLSO_PARCIAL'); pm.expect(d.montoAprobado).to.eql(500.5); pm.expect(d.reembolso.estado).to.eql('PROCESADO'); pm.expect(d.reembolso.monto).to.eql(500.5); pm.expect(d.reembolsoEnProceso).to.eql(false);"),
    guardar(v('nota_dom1'), 'd.reembolso.notaCreditoId'),
  ]),
  ultimoReembolsoDelSimulado('Parcial: Mercado Pago recibio el monto en el cuerpo y la clave de la nota', [
    prueba('amount 500.5 y clave nc-{nota}-1', `pm.expect(ultimo.amount).to.eql(500.5); pm.expect(ultimo.clave).to.eql('nc-' + ${entorno(v('nota_dom1'))} + '-1'); pm.expect(ultimo.pago).to.eql(100000 + Number(${entorno(v('ped_dom1'))}));`),
  ]),
  resolver('Parcial: resolver otra vez el mismo reclamo: 409', 'dom1', { tipo: 'REEMBOLSO_TOTAL' }, 409, [mensajeDe('Este reclamo ya fue resuelto.')]),
  resolver('Parcial: rechazar el reclamo ya aprobado: 409', 'dom1', { tipo: 'RECHAZO', motivo: 'Un motivo suficientemente largo' }, 409, [mensajeDe('Este reclamo ya fue resuelto.')]),
  detalle('Parcial: el detalle queda resuelto con el saldo descontado', 'dom1', [
    prueba('Saldo = total - 500,50', `pm.expect(d.saldoReembolsable).to.eql(Math.round((${tot('dom1')} - 500.5) * 100) / 100);`),
  ]),
  bloqueDelCliente('Parcial: el Cliente ve el reclamo aprobado sin mezclarlo con los reembolsos del pedido', 'dom1', [
    prueba('Aprobado, parcial, 500,50 y sin reembolso en proceso', "pm.expect(p.reclamo.estado).to.eql('APROBADO'); pm.expect(p.reclamo.tipoResolucion).to.eql('REEMBOLSO_PARCIAL'); pm.expect(p.reclamo.montoAprobado).to.eql(500.5); pm.expect(p.reclamo.reembolsoEnProceso).to.eql(false);"),
    prueba('Los campos de reembolso del pedido siguen vacios', "pm.expect(p.reembolsoEstado === undefined || p.reembolsoEstado === null).to.eql(true); pm.expect(p.reembolsoMonto === undefined || p.reembolsoMonto === null).to.eql(true);"),
  ]),
  item('Parcial: el Dueño ve el monto reembolsado', req('GET', '/pedidos/comercio', { token: TOKEN_DUENO, comercio: COM }), [
    status(200),
    `const p = pm.response.json().data.find((x) => x.id === Number(${entorno(v('ped_dom1'))}));`,
    prueba('Aprobado por 500,50 sin el mensaje', "pm.expect(p.reclamo.estado).to.eql('APROBADO'); pm.expect(p.reclamo.montoAprobado).to.eql(500.5); pm.expect(p.reclamo.descripcion === undefined).to.eql(true);"),
  ]),
  avisos('Parcial: el Cliente recibio el aviso de aprobacion con el monto', TOKEN_CLIENTE, undefined, 'RECLAMO_APROBADO', 'dom1', 1,
    `'Aprobamos tu reclamo del pedido #' + ${entorno(v('ped_dom1'))} + ' y te vamos a devolver $500,50. El reembolso puede tardar unos días en acreditarse.'`),
  avisos('Parcial: el Dueño recibio el aviso del reembolso, sin afirmar cuanto se le descuenta', TOKEN_DUENO, COM, 'RECLAMO_REEMBOLSO_DUENO', 'dom1', 1,
    `'Reembolsamos $500,50 al Cliente por un reclamo del pedido #' + ${entorno(v('ped_dom1'))} + '. Mercado Pago lo descuenta de tu cuenta en la parte que te corresponde.'`),
);

// ----------------------------------------------------------------------------- resolver: total y rechazo
agregar(
  reclamar('Total: se crea el reclamo de un pedido de retiro', 'ret1', TOKEN_CLIENTE, 'FALTAN_PRODUCTOS', DESCRIPCION, 201, [guardar(v('rec_ret1'), 'pm.response.json().data.id')]),
  resolver('Total: el rechazo sin motivo suficiente: 400', 'ret1', { tipo: 'RECHAZO', motivo: 'corto' }, 400, [errorDeCampo('motivo', 'Escribí el motivo del rechazo en entre 10 y 500 caracteres')]),
  resolver('Total: un reembolso total con monto: 400', 'ret1', { tipo: 'REEMBOLSO_TOTAL', monto: 10 }, 400, [errorDeCampo('monto', 'El reembolso total no lleva monto')]),
  resolver('Total: se aprueba el reembolso total', 'ret1', { tipo: 'REEMBOLSO_TOTAL' }, 200, [
    'const d = pm.response.json().data;',
    prueba('Aprobado por el total con el reembolso procesado', `pm.expect(d.estado).to.eql('APROBADO'); pm.expect(d.tipoResolucion).to.eql('REEMBOLSO_TOTAL'); pm.expect(d.montoAprobado).to.eql(${tot('ret1')}); pm.expect(d.reembolso.estado).to.eql('PROCESADO');`),
  ]),
  ultimoReembolsoDelSimulado('Total: Mercado Pago recibio el reembolso total sin monto en el cuerpo', [
    prueba('Sin amount', `pm.expect(ultimo.amount).to.eql(null); pm.expect(ultimo.pago).to.eql(100000 + Number(${entorno(v('ped_ret1'))}));`),
  ]),
  bloqueDelCliente('Total: el Cliente ve el reclamo aprobado por el total', 'ret1', [
    prueba('Aprobado total', `pm.expect(p.reclamo.estado).to.eql('APROBADO'); pm.expect(p.reclamo.tipoResolucion).to.eql('REEMBOLSO_TOTAL'); pm.expect(p.reclamo.montoAprobado).to.eql(${tot('ret1')});`),
  ]),
  reclamar('Rechazo: se crea el reclamo', 'dom2', TOKEN_CLIENTE, 'PRODUCTO_EN_MAL_ESTADO', DESCRIPCION, 201, [guardar(v('rec_dom2'), 'pm.response.json().data.id')]),
  resolver('Rechazo: se rechaza con motivo', 'dom2', { tipo: 'RECHAZO', motivo: '  El comercio demostró que entregó el pedido completo  ' }, 200, [
    'const d = pm.response.json().data;',
    prueba('Rechazado, con el motivo recortado y sin monto ni reembolso', "pm.expect(d.estado).to.eql('RECHAZADO'); pm.expect(d.tipoResolucion).to.eql('RECHAZO'); pm.expect(d.notaResolucion).to.eql('El comercio demostró que entregó el pedido completo'); pm.expect(d.montoAprobado === undefined || d.montoAprobado === null).to.eql(true); pm.expect(d.reembolso === undefined || d.reembolso === null).to.eql(true);"),
  ]),
  bloqueDelCliente('Rechazo: el Cliente ve el motivo del rechazo', 'dom2', [
    prueba('Rechazado con motivo', "pm.expect(p.reclamo.estado).to.eql('RECHAZADO'); pm.expect(p.reclamo.motivoRechazo).to.eql('El comercio demostró que entregó el pedido completo');"),
  ]),
  item('Rechazo: el Dueño no ve el motivo del rechazo', req('GET', '/pedidos/comercio', { token: TOKEN_DUENO, comercio: COM }), [
    status(200),
    `const p = pm.response.json().data.find((x) => x.id === Number(${entorno(v('ped_dom2'))}));`,
    prueba('Rechazado y sin motivo', "pm.expect(p.reclamo.estado).to.eql('RECHAZADO'); pm.expect(p.reclamo.motivoRechazo === undefined).to.eql(true);"),
  ]),
  avisos('Rechazo: el Cliente recibio el aviso con el motivo', TOKEN_CLIENTE, undefined, 'RECLAMO_RECHAZADO', 'dom2', 1,
    `'Revisamos tu reclamo del pedido #' + ${entorno(v('ped_dom2'))} + ' y no pudimos aprobarlo. Motivo: El comercio demostró que entregó el pedido completo'`),
  avisos('Rechazo: el Dueño no recibe ningun aviso de reembolso', TOKEN_DUENO, COM, 'RECLAMO_REEMBOLSO_DUENO', 'dom2', 0),
);

// ----------------------------------------------------------------------------- falla del reembolso y reintento
agregar(
  reclamar('Falla: se crea el reclamo', 'dom3', TOKEN_CLIENTE, 'COBRO_INCORRECTO', DESCRIPCION, 201, [guardar(v('rec_dom3'), 'pm.response.json().data.id')]),
  item('Falla: Mercado Pago simulado empieza a responder que no hay saldo', reqMp('PUT', '/__control/reembolsos/falla', 'mensaje=insufficient%20funds'), [status(200)]),
  resolver('Falla: el reclamo se aprueba igual', 'dom3', { tipo: 'REEMBOLSO_PARCIAL', monto: 300 }, 200, [
    'const d = pm.response.json().data;',
    prueba('Aprobado con el reembolso fallido y en proceso', "pm.expect(d.estado).to.eql('APROBADO'); pm.expect(d.reembolsoEnProceso).to.eql(true);"),
    guardar(v('nota_dom3'), 'pm.response.json().data.reembolso.notaCreditoId'),
  ]),
  detalle('Falla: el detalle muestra la nota fallida y el motivo del error', 'dom3', [
    prueba('Nota FALLIDO con el texto de saldo insuficiente', "pm.expect(d.reembolso.estado).to.eql('FALLIDO'); pm.expect(d.reembolso.ultimoError).to.match(/^El comercio no tiene saldo suficiente en Mercado Pago para este reembolso\\./); pm.expect(d.reembolsoEnProceso).to.eql(true);"),
  ]),
  bloqueDelCliente('Falla: el Cliente ve el reembolso en proceso', 'dom3', [
    prueba('Aprobado y en proceso', "pm.expect(p.reclamo.estado).to.eql('APROBADO'); pm.expect(p.reclamo.reembolsoEnProceso).to.eql(true);"),
  ]),
  item('Falla: la bandeja de reembolsos en proceso cuenta el reclamo', req('GET', '/administrador/reclamos', { token: TOKEN_ADMIN, query: 'filtro=REEMBOLSO_EN_PROCESO&limite=200' }), [
    status(200),
    prueba('Hay al menos uno en proceso y el reclamo esta en la lista', `const b = pm.response.json().data; pm.expect(b.contadores.reembolsoEnProceso).to.be.at.least(1); pm.expect(b.reclamos.map((r) => r.pedidoId)).to.include(Number(${entorno(v('ped_dom3'))}));`),
  ]),
  item('Falla: Mercado Pago simulado vuelve a funcionar', reqMp('PUT', '/__control/reembolsos/falla'), [status(200)]),
  item('Falla: el Administrador reintenta el reembolso de la nota', req('POST', `/administrador/reembolsos/{{${v('nota_dom3')}}}/reintentar`, { token: TOKEN_ADMIN, body: {} }), [status(200)]),
  ultimoReembolsoDelSimulado('Falla: el reintento mando el monto de la nota (300) y la clave del segundo intento', [
    prueba('amount 300 y clave nc-{nota}-2', `pm.expect(ultimo.amount).to.eql(300); pm.expect(ultimo.clave).to.eql('nc-' + ${entorno(v('nota_dom3'))} + '-2');`),
  ]),
  detalle('Falla: tras el reintento el reembolso queda procesado', 'dom3', [
    prueba('PROCESADO y ya no en proceso', "pm.expect(d.reembolso.estado).to.eql('PROCESADO'); pm.expect(d.reembolsoEnProceso).to.eql(false); pm.expect(d.reembolso.intentos).to.eql(2);"),
  ]),
  item('Bandeja: los resueltos incluyen los tres reclamos resueltos de esta carpeta', req('GET', '/administrador/reclamos', { token: TOKEN_ADMIN, query: 'filtro=RESUELTOS&limite=200' }), [
    status(200),
    prueba('Resueltos con los contadores', "const b = pm.response.json().data; pm.expect(b.contadores.resueltos).to.be.at.least(4); b.reclamos.forEach((r) => pm.expect(['APROBADO', 'RECHAZADO']).to.include(r.estado));"),
  ]),
  item('Metricas: los reclamos resueltos ya no cuentan como pendientes', req('GET', '/administrador/metricas', { token: TOKEN_ADMIN }), [
    status(200),
    prueba('reclamosPendientes es un numero', "pm.expect(pm.response.json().data.reclamosPendientes).to.be.a('number');"),
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
const claves = ['com', 'cat', 'cat_nombre', 'prod', 'cuit_tmp', 'dni_rep_tmp', 'admin_id',
  'd_email', 'd_usuario', 'd_password', 'd_dni', 'd_codigo', 'd_token', 'd_id',
  'c_email', 'c_usuario', 'c_password', 'c_dni', 'c_codigo', 'c_token', 'c_id', 'c_dir',
  'o_email', 'o_usuario', 'o_password', 'o_dni', 'o_codigo', 'o_token', 'o_id',
  'e_email', 'e_usuario', 'e_password', 'e_dni', 'e_codigo', 'e_token', 'e_id', 'e_inv_codigo',
  'nota_dom1', 'nota_dom3',
  ...['dom1', 'ret1', 'dom2', 'dom3', 'ret2', 'curso'].flatMap((p) => [`ped_${p}`, `tot_${p}`, `idpago_${p}`, `rec_${p}`])].map(v);
const existentes = new Set(environment.values.map((x) => x.key));
for (const key of claves) {
  if (!existentes.has(key)) environment.values.push({ key, value: '', type: 'default', enabled: true });
}
fs.writeFileSync(environmentPath, JSON.stringify(environment, null, 2) + '\n', 'utf8');

console.log(`OK: carpeta "${NOMBRE_CARPETA.slice(0, 40)}..." con ${items.length} requests.`);
