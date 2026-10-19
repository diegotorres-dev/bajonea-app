import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const collectionPath = path.resolve(__dirname, '../../../postman/Bajonea-MVP.postman_collection.json');
const environmentPath = path.resolve(__dirname, '../../../postman/Bajonea-Local.postman_environment.json');

const PREFIJO_CARPETA = '62 - ';
const NOMBRE_CARPETA = '62 - Avisos del comercio con fan-out al equipo E3 A4 (una copia por Dueño y Empleado activo, lectura individual, solo avisos posteriores a la alta, desactivado sin avisos ni acceso, administracion solo al Dueño, comercios separados, Empleado comprador)';

const v = (clave) => `na_${clave}`;

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
    guardar(v(`${clave}_email`), `'na.${clave}.' + s + '@bajonea.test'`),
    guardar(v(`${clave}_usuario`), `('na${clave}' + s).slice(0, 20)`),
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
const T_DUENO = v('d_token');
const T_ELENA = v('e_token');
const T_FABIANA = v('f_token');
const T_GINA = v('g_token');
const T_CARLA = v('c_token');
const T_HUGO = v('h_token');
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
          apellido: 'Avisos',
          dni: `{{${v(`${clave}_dni`)}}}`,
          fechaNacimiento: '1995-05-20',
          telefono: '+5492964551236',
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

function empleadoAlEquipo(clave, nombre, comercio = COM, sufijo = '') {
  return [
    item(`El Dueño invita a ${nombre} al comercio${sufijo}`, req('POST', '/comercios/equipo/invitaciones', { token: T_DUENO, comercio, body: { email: `{{${v(`${clave}_email`)}}}` } }), [status(201)]),
    item(`Bypass test - codigo de la invitacion de ${nombre}${sufijo}`, req('GET', '/test/invitaciones-empleado/codigo', { query: `email={{${v(`${clave}_email`)}}}&comercioId=${comercio}` }), [
      status(200),
      guardar(v(`${clave}_inv_codigo`), 'pm.response.json().data'),
    ]),
    item(`${nombre} acepta la invitacion${sufijo}`, req('POST', '/auth/invitaciones-empleado/aceptar', { body: { email: `{{${v(`${clave}_email`)}}}`, codigo: `{{${v(`${clave}_inv_codigo`)}}}` } }), [status(200)]),
  ];
}

const productoCuerpo = (nombre, precio) => `{"nombre": "${nombre}", "descripcion": "Descripcion A4", "precio": ${precio}, "categoriaId": ${CAT}}`;

function pedidoPagado(clave, comprador = T_CARLA, producto = 'prodD') {
  return [
    ...pedidoSinPagar(clave, comprador, producto),
    item(`[pedido ${clave}] Atajo de test: el pago queda aprobado y registrado (llega el aviso al equipo)`, req('PUT', `/test/pedidos/${P(clave)}/pago-aprobado`, { body: {}, query: 'registrarPago=true' }), [status(200)]),
  ];
}

function pedidoSinPagar(clave, comprador = T_CARLA, producto = 'prodD') {
  return [
    item(`[pedido ${clave}] El Cliente vacia el carrito`, req('DELETE', '/carrito', { token: comprador }), [`pm.test('Carrito vaciado o ya vacio', () => pm.expect([200, 404]).to.include(pm.response.code));`]),
    item(`[pedido ${clave}] El Cliente agrega el producto al carrito`, req('POST', '/carrito/items', { token: comprador, rawBody: `{"productoId": {{${v(producto)}}}, "cantidad": 1}` }), [status(201)]),
    item(
      `[pedido ${clave}] El Cliente confirma el pedido (retiro en el local)`,
      req('POST', '/pedidos/cliente', { token: comprador, rawBody: '{"tipoEntrega": "RETIRO", "direccionId": null}' }),
      [status(201), guardar(v(`ped_${clave}`), 'pm.response.json().data.id')],
    ),
  ];
}

const aviso = (clave, regex) => `d.find((a) => a.entidadId === Number(${entorno(v(`ped_${clave}`))}) && ${regex}.test(a.mensaje))`;
const conLosAvisos = (...lineas) => ['const d = pm.response.json().data;', ...lineas];
const tieneAviso = (clave, regex, descripcion) => `pm.test('Tiene el aviso ${descripcion} del pedido ${clave}', () => pm.expect(${aviso(clave, regex)}).to.exist);`;
const noTieneAviso = (clave, regex, descripcion) => `pm.test('No tiene el aviso ${descripcion} del pedido ${clave}', () => pm.expect(${aviso(clave, regex)}).to.not.exist);`;
const cantidadDe = (n) => `pm.test('La lista tiene ${n} avisos', () => pm.expect(d.length).to.eql(${n}));`;
const NUEVO = '/Nuevo pedido recibido/';
const CANCELO = '/cancel/';
const EXPIRO = '/expir/';

const lista = (nombre, token, comercio, lineas, codigo = 200) =>
  item(nombre, req('GET', '/notificaciones', { token, comercio }), [status(codigo), ...(codigo === 200 ? conLosAvisos(...lineas) : lineas)]);

const contador = (nombre, token, comercio, esperado) =>
  item(nombre, req('GET', '/notificaciones/no-leidas/contador', { token, comercio }), [
    status(200),
    `pm.test('El contador es ${esperado}', () => pm.expect(pm.response.json().data).to.eql(${esperado}));`,
  ]);

const marcarTodas = (nombre, token, comercio, esperado) =>
  item(nombre, req('PUT', '/notificaciones/leidas', { token, comercio, body: {} }), [
    status(200),
    `pm.test('Marcó ${esperado}', () => pm.expect(pm.response.json().data).to.eql(${esperado}));`,
  ]);

const guardarAviso = (variable, clave, regex) => guardar(variable, `${aviso(clave, regex)}.id`);

const NO_DISPONIBLE = "pm.test('Codigo COMERCIO_NO_DISPONIBLE', () => pm.expect(pm.response.json().data.codigo).to.eql('COMERCIO_NO_DISPONIBLE'));";

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
        razonSocial: 'Avisos A4 SRL',
        cuit: `{{${v('cuit_tmp')}}}`,
        condicionIva: 'RESPONSABLE_INSCRIPTO',
        tipoSociedad: 'SRL',
        domicilioFiscal: 'Direccion fiscal A4 100',
        fechaInicioActividades: '2020-01-01',
        nombre: 'Local Avisos A4',
        descripcion: 'Comercio generado por la coleccion de Postman (avisos al equipo, E3 A4)',
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
        fotoPerfilUrl: 'https://res.cloudinary.com/demo/image/upload/postman-avisos-a4.jpg',
        redesSociales: [{ tipo: 'INSTAGRAM', url: 'instagram.com/avisosa4' }],
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
  loginDe('d', 'Dueño', T_DUENO),
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
    [guardar(v('cat_nombre'), "'Cat Avisos A4 ' + Date.now().toString(36)")],
  ),
  item('El Dueño crea el producto con el que compran los Clientes', req('POST', '/productos', { token: T_DUENO, comercio: COM, rawBody: productoCuerpo('Producto Avisos A4', 10000) }), [
    status(201),
    guardar(v('prodD'), 'pm.response.json().data.id'),
  ]),
  ...clienteNuevo('c', 'Carla'),
  loginDe('c', 'Carla (Compradora)', T_CARLA),
  ...clienteNuevo('e', 'Elena'),
  ...empleadoAlEquipo('e', 'Elena'),
  loginDe('e', 'Elena (Empleada)', T_ELENA),
  ...clienteNuevo('f', 'Fabiana'),
  ...empleadoAlEquipo('f', 'Fabiana'),
  loginDe('f', 'Fabiana (Empleada)', T_FABIANA),
  ...clienteNuevo('h', 'Hugo'),
  loginDe('h', 'Hugo (Cliente sin relacion con el comercio)', T_HUGO),
);

agregar(
  ...pedidoPagado('uno'),
  lista('Una copia por persona: el Dueño ve el aviso del pedido nuevo (y sus avisos de administracion: aprobacion y dos altas del equipo)', T_DUENO, COM, [
    tieneAviso('uno', NUEVO, 'de pedido nuevo'),
    "pm.test('Tiene una sola copia del pedido nuevo', () => pm.expect(d.filter((a) => /Nuevo pedido recibido/.test(a.mensaje)).length).to.eql(1));",
    "pm.test('Tiene ademas los tres avisos de administracion del comercio', () => pm.expect(d.filter((a) => a.entidadTipo === 'COMERCIO').length).to.eql(3));",
    guardarAviso(v('d_aviso'), 'uno', NUEVO),
  ]),
  lista('Una copia por persona: Elena ve el suyo', T_ELENA, COM, [tieneAviso('uno', NUEVO, 'de pedido nuevo'), cantidadDe(1), guardarAviso(v('e_aviso'), 'uno', NUEVO)]),
  lista('Una copia por persona: Fabiana ve el suyo', T_FABIANA, COM, [tieneAviso('uno', NUEVO, 'de pedido nuevo'), cantidadDe(1), guardarAviso(v('f_aviso'), 'uno', NUEVO)]),
  item('Las tres copias son filas distintas', req('GET', '/notificaciones', { token: T_ELENA, comercio: COM }), [
    status(200),
    `pm.test('Los ids de las tres copias son distintos', () => pm.expect(new Set([${entorno(v('d_aviso'))}, ${entorno(v('e_aviso'))}, ${entorno(v('f_aviso'))}]).size).to.eql(3));`,
  ]),
  lista('La Compradora, sin header, no ve el aviso del equipo', T_CARLA, undefined, [noTieneAviso('uno', NUEVO, 'de pedido nuevo'), cantidadDe(0)]),
  contador('Contador del Dueño: 4 (el pedido y sus tres avisos de administracion)', T_DUENO, COM, 4),
  contador('Contador de Elena: 1', T_ELENA, COM, 1),
  contador('Contador de Fabiana: 1', T_FABIANA, COM, 1),
  contador('Contador personal de la Compradora: 0', T_CARLA, undefined, 0),
  item('Lectura individual: Elena marca su aviso como leido', req('PUT', `/notificaciones/{{${v('e_aviso')}}}/leida`, { token: T_ELENA, body: {} }), [status(200)]),
);

agregar(
  contador('Lectura individual: el contador de Elena baja a 0', T_ELENA, COM, 0),
  contador('Lectura individual: el de Fabiana sigue en 1', T_FABIANA, COM, 1),
  contador('Lectura individual: el del Dueño sigue en 4', T_DUENO, COM, 4),
  item('Endurecimiento: Elena no puede marcar el aviso del Dueño (404)', req('PUT', `/notificaciones/{{${v('d_aviso')}}}/leida`, { token: T_ELENA, body: {} }), [status(404)]),
  marcarTodas('Marcar todas: Fabiana marca su unico aviso', T_FABIANA, COM, 1),
  marcarTodas('Marcar todas: repetirlo es idempotente (0)', T_FABIANA, COM, 0),
  contador('Marcar todas: Fabiana queda en 0', T_FABIANA, COM, 0),
  contador('Marcar todas: el Dueño sigue en 4', T_DUENO, COM, 4),
  lista('Las leidas siguen en la lista de Fabiana', T_FABIANA, COM, [tieneAviso('uno', NUEVO, 'de pedido nuevo'), cantidadDe(1)]),
  item('Marcar todas con el header en blanco es 400', req('PUT', '/notificaciones/leidas', { token: T_DUENO, comercio: '', body: {} }), [status(400)]),
  item('Listar con el header en blanco es 400 para el Dueño', req('GET', '/notificaciones', { token: T_DUENO, comercio: '' }), [status(400)]),
  item('El Dueño acepta el pedido uno (para que el proceso de expiracion no lo toque despues)', req('PUT', `/pedidos/comercio/${P('uno')}/aceptar`, { token: T_DUENO, comercio: COM, body: {} }), [status(200)]),
);

agregar(
  ...clienteNuevo('g', 'Gina'),
  ...empleadoAlEquipo('g', 'Gina'),
  loginDe('g', 'Gina (Empleada nueva)', T_GINA),
  lista('Quien se suma no ve avisos anteriores: Gina empieza con la lista vacia', T_GINA, COM, [cantidadDe(0)]),
  contador('Quien se suma no ve avisos anteriores: contador en 0', T_GINA, COM, 0),
  ...pedidoPagado('dos'),
  lista('Quien se suma ve los posteriores: Gina ve solo el segundo', T_GINA, COM, [tieneAviso('dos', NUEVO, 'de pedido nuevo'), noTieneAviso('uno', NUEVO, 'de pedido nuevo'), cantidadDe(1)]),
  lista('Elena ve los dos', T_ELENA, COM, [tieneAviso('uno', NUEVO, 'de pedido nuevo'), tieneAviso('dos', NUEVO, 'de pedido nuevo'), cantidadDe(2)]),
  item('Contador de la Empleada en el listado de sus comercios es el real', req('GET', '/empleados/mis-comercios', { token: T_GINA }), [
    status(200),
    "pm.test('Tiene un comercio con un aviso sin leer', () => { const c = pm.response.json().data; pm.expect(c.length).to.eql(1); pm.expect(c[0].cantidadNotificacionesNoLeidas).to.eql(1); });",
  ]),
  item('El Dueño acepta el pedido dos', req('PUT', `/pedidos/comercio/${P('dos')}/aceptar`, { token: T_DUENO, comercio: COM, body: {} }), [status(200)]),
);

agregar(
  item('Atajo de test: Fabiana queda desactivada', req('PUT', `/test/comercios/${COM}/empleados/{{${v('f_id')}}}/estado`, { body: {}, query: 'estado=INACTIVO' }), [status(200)]),
  ...pedidoPagado('tres'),
  lista('Desactivada: Fabiana recibe el 404 al listar', T_FABIANA, COM, [NO_DISPONIBLE], 404),
  item('Desactivada: el contador es 404', req('GET', '/notificaciones/no-leidas/contador', { token: T_FABIANA, comercio: COM }), [status(404), NO_DISPONIBLE]),
  item('Desactivada: marcar todas es 404', req('PUT', '/notificaciones/leidas', { token: T_FABIANA, comercio: COM, body: {} }), [status(404), NO_DISPONIBLE]),
  item('Desactivada: tampoco puede marcar uno de sus avisos viejos (404)', req('PUT', `/notificaciones/{{${v('f_aviso')}}}/leida`, { token: T_FABIANA, body: {} }), [status(404)]),
  lista('Desactivada: sus compañeros siguen recibiendo (Elena ve el tercero)', T_ELENA, COM, [tieneAviso('tres', NUEVO, 'de pedido nuevo')]),
  item('Desactivada: Gina, que sigue activa, tambien recibe el tercero', req('GET', '/notificaciones', { token: T_GINA, comercio: COM }), [
    status(200),
    ...conLosAvisos(tieneAviso('tres', NUEVO, 'de pedido nuevo')),
  ]),
  item('El Dueño acepta el pedido tres', req('PUT', `/pedidos/comercio/${P('tres')}/aceptar`, { token: T_DUENO, comercio: COM, body: {} }), [status(200)]),
  ...empleadoAlEquipo('f', 'Fabiana', COM, ' (reactivacion)'),
  loginDe('f', 'Fabiana (reactivada)', T_FABIANA),
  lista('Reactivada: no ve ninguno de los avisos anteriores a su reactivacion', T_FABIANA, COM, [cantidadDe(0)]),
  contador('Reactivada: su contador esta en 0', T_FABIANA, COM, 0),
  ...pedidoPagado('cuatro'),
  lista('Reactivada: ve los posteriores', T_FABIANA, COM, [tieneAviso('cuatro', NUEVO, 'de pedido nuevo'), noTieneAviso('uno', NUEVO, 'de pedido nuevo'), noTieneAviso('tres', NUEVO, 'de pedido nuevo'), cantidadDe(1)]),
  item('El Dueño acepta el pedido cuatro', req('PUT', `/pedidos/comercio/${P('cuatro')}/aceptar`, { token: T_DUENO, comercio: COM, body: {} }), [status(200)]),
);

agregar(
  ...pedidoPagado('cancela'),
  item('La Compradora cancela el pedido', req('PUT', `/pedidos/cliente/${P('cancela')}/cancelar`, { token: T_CARLA, body: {} }), [status(200)]),
  lista('Cancelacion: el Dueño recibe el aviso', T_DUENO, COM, [tieneAviso('cancela', CANCELO, 'de cancelacion del Cliente')]),
  lista('Cancelacion: Elena lo recibe', T_ELENA, COM, [tieneAviso('cancela', CANCELO, 'de cancelacion del Cliente')]),
  lista('Cancelacion: Fabiana lo recibe', T_FABIANA, COM, [tieneAviso('cancela', CANCELO, 'de cancelacion del Cliente')]),
  lista('Cancelacion: Gina lo recibe', T_GINA, COM, [tieneAviso('cancela', CANCELO, 'de cancelacion del Cliente')]),
  lista('Cancelacion: la Compradora no recibe aviso de su propia cancelacion', T_CARLA, undefined, [noTieneAviso('cancela', CANCELO, 'de cancelacion del Cliente')]),
  ...pedidoPagado('expira'),
  item('El proceso de expiracion corre 45 minutos despues', req('POST', '/test/jobs/pedidos/expirar-sin-respuesta', { body: {}, query: 'ahora={{na_ahora}}' }), [status(200)], [
    'const ahora = new Date(Date.now() - 3 * 3600 * 1000 + 45 * 60 * 1000);',
    "pm.environment.set('na_ahora', ahora.toISOString().slice(0, 19));",
  ]),
  lista('Expiracion: el Dueño recibe el aviso', T_DUENO, COM, [tieneAviso('expira', EXPIRO, 'de expiracion')]),
  lista('Expiracion: Elena lo recibe', T_ELENA, COM, [tieneAviso('expira', EXPIRO, 'de expiracion')]),
  lista('Expiracion: Gina lo recibe', T_GINA, COM, [tieneAviso('expira', EXPIRO, 'de expiracion')]),
  lista('Expiracion: la Compradora recibe su propio aviso, sin header, y no el del equipo', T_CARLA, undefined, [
    tieneAviso('expira', "/no respondi/", 'personal de expiracion'),
    `pm.test('Ningun aviso personal es del equipo', () => pm.expect(d.some((a) => /Nuevo pedido recibido|expiró por falta de respuesta|canceló el pedido/.test(a.mensaje))).to.be.false);`,
  ]),
);

agregar(
  item('Se crea el segundo comercio del Dueño (clon en APTO_VENTA)', req('POST', `/test/comercios/${COM}/clonar`, { body: {}, query: 'nombre=Clon Avisos A4&estado=APTO_VENTA' }), [
    status(201),
    guardar(v('clon'), 'pm.response.json().data'),
  ]),
  item('El Dueño crea un producto en el segundo comercio', req('POST', '/productos', { token: T_DUENO, comercio: CLON, rawBody: productoCuerpo('Producto clon Avisos A4', 9000) }), [
    status(201),
    guardar(v('prodClon'), 'pm.response.json().data.id'),
  ]),
  ...pedidoPagado('clon', T_CARLA, 'prodClon'),
  lista('Dos comercios: el Dueño ve en el segundo solo el pedido del segundo', T_DUENO, CLON, [tieneAviso('clon', NUEVO, 'de pedido nuevo'), noTieneAviso('dos', NUEVO, 'de pedido nuevo'), cantidadDe(1)]),
  lista('Dos comercios: en el primero no esta el pedido del segundo', T_DUENO, COM, [noTieneAviso('clon', NUEVO, 'de pedido nuevo')]),
  item('Dos comercios: Elena no tiene relacion con el segundo y recibe el 404', req('GET', '/notificaciones', { token: T_ELENA, comercio: CLON }), [status(404), NO_DISPONIBLE]),
  item('Dos comercios: el Dueño marca todas las del segundo', req('PUT', '/notificaciones/leidas', { token: T_DUENO, comercio: CLON, body: {} }), [
    status(200),
    "pm.test('Marcó un aviso', () => pm.expect(pm.response.json().data).to.eql(1));",
  ]),
  item('Dos comercios: marcar las del segundo no toca las del primero', req('GET', '/notificaciones/no-leidas/contador', { token: T_DUENO, comercio: COM }), [
    status(200),
    "pm.test('El primero conserva sus avisos sin leer', () => pm.expect(pm.response.json().data).to.be.above(0));",
  ]),
  item('Administracion: el Administrador suspende el segundo comercio', req('PUT', `/administrador/comercios/${CLON}/suspender`, { token: 'token_admin', body: { motivo: 'Suspension de la prueba de avisos A4' } }), [status(200)]),
  lista('Administracion: el Dueño recibe el aviso de suspension en el comercio suspendido', T_DUENO, CLON, [
    "pm.test('Tiene el aviso de suspension con su motivo', () => pm.expect(d.some((a) => a.entidadTipo === 'COMERCIO' && /fue suspendido/.test(a.mensaje))).to.be.true);",
  ]),
  lista('Administracion: en el primer comercio no aparece', T_DUENO, COM, [
    "pm.test('No hay aviso de suspension en el primero', () => pm.expect(d.some((a) => /fue suspendido/.test(a.mensaje))).to.be.false);",
  ]),
  lista('Administracion: Elena, Empleada del primero, no recibe avisos de administracion', T_ELENA, COM, [
    "pm.test('Ninguno es de administracion', () => pm.expect(d.some((a) => a.entidadTipo === 'COMERCIO')).to.be.false);",
  ]),
);

agregar(
  item('Cliente ajeno: Hugo recibe el 404 al listar con el header del comercio', req('GET', '/notificaciones', { token: T_HUGO, comercio: COM }), [status(404), NO_DISPONIBLE]),
  item('Cliente ajeno: y al pedir el contador', req('GET', '/notificaciones/no-leidas/contador', { token: T_HUGO, comercio: COM }), [status(404), NO_DISPONIBLE]),
  item('Cliente ajeno: y al marcar todas', req('PUT', '/notificaciones/leidas', { token: T_HUGO, comercio: COM, body: {} }), [status(404), NO_DISPONIBLE]),
  item('Cliente ajeno: sin header, marcar todas es 400', req('PUT', '/notificaciones/leidas', { token: T_HUGO, body: {} }), [status(400)]),
  item('Cliente ajeno: sin token es 401', req('PUT', '/notificaciones/leidas', { comercio: COM, body: {} }), [status(401)]),
  item('Cliente ajeno: el Administrador ignora el header y recibe 404 al marcar todas', req('PUT', '/notificaciones/leidas', { token: 'token_admin', comercio: COM, body: {} }), [status(404)]),
  lista('Cliente ajeno: sin header ve su lista personal vacia', T_HUGO, undefined, [cantidadDe(0)]),
);

agregar(
  ...pedidoPagado('propio', T_ELENA),
  lista('Empleado comprador: Elena no recibe el aviso del equipo de su propio pedido', T_ELENA, COM, [noTieneAviso('propio', NUEVO, 'de pedido nuevo')]),
  lista('Empleado comprador: Fabiana si lo recibe', T_FABIANA, COM, [tieneAviso('propio', NUEVO, 'de pedido nuevo')]),
  lista('Empleado comprador: el Dueño tambien', T_DUENO, COM, [tieneAviso('propio', NUEVO, 'de pedido nuevo')]),
  item('Empleado comprador: el Dueño acepta el pedido de Elena', req('PUT', `/pedidos/comercio/${P('propio')}/aceptar`, { token: T_DUENO, comercio: COM, body: {} }), [status(200)]),
  lista('Empleado comprador: su campana de Cliente (sin header) trae el aviso de comprador', T_ELENA, undefined, [
    "pm.test('Tiene el aviso de aceptacion de su pedido', () => pm.expect(d.some((a) => a.entidadId === Number(pm.environment.get('na_ped_propio')) && /fue aceptado/.test(a.mensaje))).to.be.true);",
    `pm.test('No mezcla ningun aviso del equipo', () => pm.expect(d.some((a) => /Nuevo pedido recibido|expiró por falta de respuesta|canceló el pedido|fue suspendido/.test(a.mensaje))).to.be.false);`,
  ]),
  lista('Empleado comprador: con el comercio abierto no aparece el aviso de comprador', T_ELENA, COM, [
    "pm.test('Ninguno es de aceptacion de su pedido', () => pm.expect(d.some((a) => /fue aceptado/.test(a.mensaje))).to.be.false);",
  ]),
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
const claves = ['com', 'clon', 'cat', 'cat_nombre', 'prodD', 'prodClon', 'cuit_tmp', 'dni_rep_tmp', 'ahora',
  'd_email', 'd_usuario', 'd_password', 'd_dni', 'd_codigo', 'd_token', 'd_id', 'd_aviso',
  'e_email', 'e_usuario', 'e_password', 'e_dni', 'e_codigo', 'e_token', 'e_id', 'e_inv_codigo', 'e_aviso',
  'f_email', 'f_usuario', 'f_password', 'f_dni', 'f_codigo', 'f_token', 'f_id', 'f_inv_codigo', 'f_aviso',
  'g_email', 'g_usuario', 'g_password', 'g_dni', 'g_codigo', 'g_token', 'g_id', 'g_inv_codigo',
  'c_email', 'c_usuario', 'c_password', 'c_dni', 'c_codigo', 'c_token', 'c_id',
  'h_email', 'h_usuario', 'h_password', 'h_dni', 'h_codigo', 'h_token', 'h_id',
  'ped_uno', 'ped_dos', 'ped_tres', 'ped_cuatro', 'ped_cancela', 'ped_expira', 'ped_clon', 'ped_propio'].map(v);
const existentes = new Set(environment.values.map((x) => x.key));
for (const key of claves) {
  if (!existentes.has(key)) environment.values.push({ key, value: '', type: 'default', enabled: true });
}
fs.writeFileSync(environmentPath, JSON.stringify(environment, null, 2) + '\n', 'utf8');

console.log(`OK: carpeta "${NOMBRE_CARPETA.slice(0, 40)}..." con ${items.length} requests.`);
