import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const collectionPath = path.resolve(__dirname, '../../../postman/Bajonea-MVP.postman_collection.json');
const environmentPath = path.resolve(__dirname, '../../../postman/Bajonea-Local.postman_environment.json');

const PREFIJO_CARPETA = '85 - ';
const NOMBRE_CARPETA = '85 - Suspension de la cuenta de un Dueno S3 (cascada a sus comercios, pedidos sin atencion, aprobaciones bloqueadas, un solo email, listado y vista previa)';

const v = (clave) => `sd3_${clave}`;
const ADMIN = '/administrador';
const TOKEN_ADMIN = 'token_admin';
const MOTIVO = 'Documentacion vencida y quejas reiteradas de clientes';

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
const prueba = (texto, cuerpo) => `pm.test(${JSON.stringify(texto)}, () => { ${cuerpo} });`;
const listadoAdmin = (nombre, comVar, esperado) => item(nombre, req('GET', `${ADMIN}/comercios`, { token: TOKEN_ADMIN }), [
  status(200),
  prueba(`ultimoEmailAvisoFallido es ${esperado}`, `const c = pm.response.json().data.find((x) => String(x.id) === String(${entorno(comVar)})); pm.expect(c).to.exist; pm.expect(c.ultimoEmailAvisoFallido).to.eql(${esperado});`),
]);
const codigoDe = (codigo) => prueba(`Trae el codigo ${codigo}`, `pm.expect(pm.response.json().data.codigo).to.eql('${codigo}');`);

function identidad(clave) {
  return [
    `const s = Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36);`,
    guardar(v(`${clave}_email`), `'sd3.${clave}.' + s + '@bajonea.test'`),
    guardar(v(`${clave}_usuario`), `('sd3${clave}' + s).slice(0, 20)`),
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
  guardar(v(`nombre_${clave}`), "'Local Suspension S3 ' + Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36)"),
];

const horariosTodosLosDias = ['LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO', 'DOMINGO'].map((diaSemana) => ({
  diaSemana,
  horaApertura: '00:00:00',
  horaCierre: '23:59:00',
}));

const COM = `{{${v('com')}}}`;
const COM2 = `{{${v('com2')}}}`;
const TOKEN_DUENO = v('d_token');
const TOKEN_DUENO2 = v('d2_token');
const TOKEN_EMPLEADO = v('e_token');
const TOKEN_COMPRADOR = v('c_token');
const CAT = `{{${v('cat')}}}`;
const P = (clave) => `{{${v(`ped_${clave}`)}}}`;
const ADM_COM = (id, ruta) => `${ADMIN}/comercios/${id}${ruta}`;

const items = [];
const agregar = (...nuevos) => items.push(...nuevos);

function clienteNuevo(clave, nombre) {
  return [
    item(
      `Registro ${nombre}`,
      req('POST', '/auth/registro/cliente', {
        body: {
          nombre,
          apellido: 'Suspension',
          dni: `{{${v(`${clave}_dni`)}}}`,
          fechaNacimiento: '1995-05-20',
          telefono: '+5492964551239',
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

function duenoNuevo(clave, nombre, comVar, conMercadoPago) {
  const tokenVar = v(`${clave}_token`);
  return [
    item(
      `Registro ${nombre}`,
      req('POST', '/auth/registro/comercio', {
        body: {
          aceptaTerminos: true,
          razonSocial: 'Suspension S2 SRL',
          cuit: `{{${v('cuit_tmp')}}}`,
          condicionIva: 'RESPONSABLE_INSCRIPTO',
          tipoSociedad: 'SRL',
          domicilioFiscal: 'Direccion fiscal S2 100',
          fechaInicioActividades: '2020-01-01',
          nombre: `{{${v(`nombre_${clave}`)}}}`,
          descripcion: 'Comercio generado por la coleccion de Postman (suspension de comercio, S2)',
          telefono: '+5492964555447',
          tipoComercio: 'RESTAURANTE',
          aceptaDelivery: true,
          aceptaRetiro: true,
          nombreUsuario: `{{${v(`${clave}_usuario`)}}}`,
          email: `{{${v(`${clave}_email`)}}}`,
          password: `{{${v(`${clave}_password`)}}}`,
          direccion: { calle: 'Belgrano', numero: '803', pisoDepto: null, codigoPostal: '9420', localidadId: '{{localidad_id}}', principal: false },
          horarios: horariosTodosLosDias,
          nombreRepresentante: 'Carlos',
          apellidoRepresentante: 'Sanchez',
          dniRepresentante: `{{${v('dni_rep_tmp')}}}`,
          telefonoRepresentante: '+5492964701106',
          fechaNacimientoRepresentante: '1988-04-04',
          fotoPerfilUrl: 'https://res.cloudinary.com/demo/image/upload/postman-suspension-s2.jpg',
          redesSociales: [{ tipo: 'INSTAGRAM', url: 'instagram.com/suspensions2' }],
        },
      }),
      [status(201)],
      [...identidad(clave), ...datosDueno(clave)],
    ),
    item(`Bypass test - codigo de verificacion ${nombre}`, req('GET', '/test/token-verificacion', { query: `email={{${v(`${clave}_email`)}}}` }), [
      status(200),
      guardar(v(`${clave}_codigo`), 'pm.response.json().data'),
    ]),
    item(`Verificar cuenta ${nombre}`, req('POST', '/auth/verificar', { body: { email: `{{${v(`${clave}_email`)}}}`, codigo: `{{${v(`${clave}_codigo`)}}}` } }), [status(200)]),
    loginDe(clave, nombre, tokenVar),
    item(`Administrador busca el comercio pendiente de ${nombre}`, req('GET', `${ADMIN}/comercios/pendientes`, { token: TOKEN_ADMIN }), [
      status(200),
      `const c = pm.response.json().data.find((x) => x.emailCuenta === ${entorno(v(`${clave}_email`))}.toLowerCase());`,
      "pm.test('El comercio esta pendiente', () => pm.expect(c).to.exist);",
      guardar(comVar, 'c.id'),
    ]),
    item(`Administrador aprueba el comercio de ${nombre}`, req('PUT', `${ADMIN}/comercios/{{${comVar}}}/resolver`, { token: TOKEN_ADMIN, body: { aprobar: true } }), [status(200)]),
    ...(conMercadoPago
      ? [item(`Atajo de test: cuenta de Mercado Pago simulada de ${nombre}`, req('POST', `/test/duenos/{{${v(`${clave}_id`)}}}/mercadopago-simulada`, { body: {} }), [status(200)])]
      : [item(`Atajo de test: el comercio de ${nombre} pasa a APTO_VENTA sin cuenta de Mercado Pago`, req('PUT', `/test/comercios/{{${comVar}}}/apto-venta`, { body: {} }), [status(200)])]),
  ];
}

const productoCuerpo = (nombre, precio) => `{"nombre": "${nombre}", "descripcion": "Descripcion S2", "precio": ${precio}, "categoriaId": ${CAT}}`;

function crearPedido(clave, { delivery = false, pagado = true } = {}) {
  const cuerpo = delivery ? '{"tipoEntrega": "DOMICILIO", "direccionId": {{' + v('c_dir') + '}}}' : '{"tipoEntrega": "RETIRO", "direccionId": null}';
  return [
    item(`[pedido ${clave}] El Cliente vacia el carrito`, req('DELETE', '/carrito', { token: TOKEN_COMPRADOR }), [`pm.test('Carrito vaciado o ya vacio', () => pm.expect([200, 404]).to.include(pm.response.code));`]),
    item(`[pedido ${clave}] El Cliente agrega el producto al carrito`, req('POST', '/carrito/items', { token: TOKEN_COMPRADOR, rawBody: `{"productoId": {{${v('prod')}}}, "cantidad": 1}` }), [status(201)]),
    item(`[pedido ${clave}] El Cliente confirma el pedido`, req('POST', '/pedidos/cliente', { token: TOKEN_COMPRADOR, rawBody: cuerpo }), [
      status(201),
      guardar(v(`ped_${clave}`), 'pm.response.json().data.id'),
    ]),
    ...(pagado
      ? [item(`[pedido ${clave}] Atajo de test: el pago queda aprobado y registrado`, req('PUT', `/test/pedidos/${P(clave)}/pago-aprobado`, { body: {}, query: 'registrarPago=true' }), [status(200)])]
      : []),
  ];
}

const accion = (nombre, token, clave, ruta, codigo = 200, cuerpo = {}, comprobaciones = [], comercio = COM) =>
  item(nombre, req('PUT', `/pedidos/comercio/${P(clave)}/${ruta}`, { token, comercio, body: cuerpo }), [status(codigo), ...comprobaciones]);

const estadoPedido = (nombre, clave, esperado, extra = []) =>
  item(nombre, req('GET', '/pedidos/cliente', { token: TOKEN_COMPRADOR }), [
    status(200),
    `const p = pm.response.json().data.find((x) => x.id === Number(${entorno(v(`ped_${clave}`))}));`,
    `pm.test('El Cliente ve el pedido en ${esperado}', () => pm.expect(p.estado).to.eql('${esperado}'));`,
    ...extra,
  ]);

const COM3 = `{{${v('com3')}}}`;
const COM4 = `{{${v('com4')}}}`;
const COM5 = `{{${v('com5')}}}`;
const COM6 = `{{${v('com6')}}}`;
const D = `{{${v('d_id')}}}`;
const ADM_DUENO = (ruta) => `${ADMIN}/duenos/${D}${ruta}`;
const MOTIVO_CORTO = 'corto';

const productoDe = (comercio, prodVar, nombre) =>
  item(`El Dueño crea el producto de ${nombre}`, req('POST', '/productos', { token: TOKEN_DUENO, comercio, rawBody: productoCuerpo(`Producto ${nombre}`, 10000) }), [
    status(201),
    guardar(prodVar, 'pm.response.json().data.id'),
  ]);

const clonar = (nombre, comVar, estado) =>
  item(`Atajo de test: clona un comercio del Dueño (${nombre})`, req('POST', `/test/comercios/${COM}/clonar`, { body: {}, query: `nombre=${encodeURIComponent(nombre)}%20{{${v('sufijo')}}}&estado=${estado}` }), [
    status(201),
    guardar(comVar, 'pm.response.json().data'),
  ]);

function pedidoEn(clave, prodVar, comercio, { delivery = false, pagado = true } = {}) {
  const cuerpo = delivery ? '{"tipoEntrega": "DOMICILIO", "direccionId": {{' + v('c_dir') + '}}}' : '{"tipoEntrega": "RETIRO", "direccionId": null}';
  return [
    item(`[pedido ${clave}] El Cliente vacia el carrito`, req('DELETE', '/carrito', { token: TOKEN_COMPRADOR }), [`pm.test('Carrito vaciado o ya vacio', () => pm.expect([200, 404]).to.include(pm.response.code));`]),
    item(`[pedido ${clave}] El Cliente agrega el producto al carrito`, req('POST', '/carrito/items', { token: TOKEN_COMPRADOR, rawBody: `{"productoId": {{${prodVar}}}, "cantidad": 1}` }), [status(201)]),
    item(`[pedido ${clave}] El Cliente confirma el pedido`, req('POST', '/pedidos/cliente', { token: TOKEN_COMPRADOR, rawBody: cuerpo }), [
      status(201),
      guardar(v(`ped_${clave}`), 'pm.response.json().data.id'),
    ]),
    ...(pagado
      ? [item(`[pedido ${clave}] Atajo de test: el pago queda aprobado y registrado`, req('PUT', `/test/pedidos/${P(clave)}/pago-aprobado`, { body: {}, query: 'registrarPago=true' }), [status(200)])]
      : []),
  ];
}

const estadoDelPedido = (nombre, clave, esperado, extra = []) => estadoPedido(nombre, clave, esperado, extra);

const comercioEnListado = (nombre, comVar, comprobaciones) =>
  item(nombre, req('GET', `${ADMIN}/comercios`, { token: TOKEN_ADMIN }), [
    status(200),
    `const c = pm.response.json().data.find((x) => String(x.id) === String(${entorno(comVar)}));`,
    "pm.test('El comercio esta en el listado', () => pm.expect(c).to.exist);",
    ...comprobaciones,
  ]);

const duenoEnListado = (nombre, comprobaciones) =>
  item(nombre, req('GET', `${ADMIN}/duenos`, { token: TOKEN_ADMIN }), [
    status(200),
    `const d = pm.response.json().data.find((x) => String(x.id) === String(${entorno(v('d_id'))}));`,
    "pm.test('El Dueño esta en el listado', () => pm.expect(d).to.exist);",
    ...comprobaciones,
  ]);

const aceptaYDespacha = (clave, comercio) => [
  accion(`[pedido ${clave}] El Dueño lo acepta`, TOKEN_DUENO, clave, 'aceptar', 200, {}, [], comercio),
  accion(`[pedido ${clave}] El Dueño lo despacha`, TOKEN_DUENO, clave, 'despachar', 200, {}, [], comercio),
];

agregar(
  item('Login Administrador (sesion propia de esta carpeta)', req('POST', '/auth/login', { body: { nombreUsuario: '{{admin_usuario}}', password: '{{admin_password}}' } }), [
    status(200),
    guardar(TOKEN_ADMIN, 'pm.response.json().data.token'),
  ]),
  item('El Administrador consulta su perfil', req('GET', `${ADMIN}/perfil`, { token: TOKEN_ADMIN }), [status(200), guardar(v('adm_id'), 'pm.response.json().data.id')]),
  item('Prefijo unico de los nombres de comercio', req('GET', '/health'), [status(200)], [guardar(v('sufijo'), "Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36)")]),
  ...duenoNuevo('d', 'Dueño S3', v('com'), true),
  item(
    'Administrador crea la categoria del producto',
    req('POST', '/categorias', { token: TOKEN_ADMIN, rawBody: `{"nombre": "{{${v('cat_nombre')}}}"}` }),
    [status(201), guardar(v('cat'), 'pm.response.json().data.id')],
    [guardar(v('cat_nombre'), "'Cat Suspension S3 ' + Date.now().toString(36)")],
  ),
  clonar('Sin equipo', v('com2'), 'APROBADO'),
  item('Atajo de test: el comercio sin equipo queda a la venta', req('PUT', `/test/comercios/${COM2}/apto-venta`, { body: {} }), [status(200)]),
  clonar('Pendiente uno', v('com3'), 'PENDIENTE'),
  clonar('Pendiente dos', v('com4'), 'PENDIENTE'),
  clonar('Suspendido aparte', v('com5'), 'SUSPENDIDO'),
  clonar('Rechazado', v('com6'), 'RECHAZADO'),
  productoDe(COM, v('prod'), 'con equipo'),
  productoDe(COM2, v('prod2'), 'sin equipo'),
  ...clienteNuevo('c', 'Carla'),
  loginDe('c', 'Carla (Compradora)', TOKEN_COMPRADOR),
  item('La Compradora obtiene su direccion para pedir a domicilio', req('GET', '/clientes/direcciones', { token: TOKEN_COMPRADOR }), [
    status(200),
    guardar(v('c_dir'), 'pm.response.json().data[0].id'),
  ]),
  ...clienteNuevo('e', 'Elena'),
  item('El Dueño invita a Elena al comercio con equipo', req('POST', '/comercios/equipo/invitaciones', { token: TOKEN_DUENO, comercio: COM, body: { email: `{{${v('e_email')}}}` } }), [status(201)]),
  item('Bypass test - codigo de la invitacion de Elena', req('GET', '/test/invitaciones-empleado/codigo', { query: `email={{${v('e_email')}}}&comercioId=${COM}` }), [
    status(200),
    guardar(v('e_inv_codigo'), 'pm.response.json().data'),
  ]),
  item('Elena acepta la invitacion', req('POST', '/auth/invitaciones-empleado/aceptar', { body: { email: `{{${v('e_email')}}}`, codigo: `{{${v('e_inv_codigo')}}}` } }), [status(200)]),
  loginDe('e', 'Elena (Empleada)', TOKEN_EMPLEADO),

  ...pedidoEn('a_pend', v('prod'), COM),
  ...pedidoEn('a_prep', v('prod'), COM),
  accion('[pedido a_prep] El Dueño lo acepta', TOKEN_DUENO, 'a_prep', 'aceptar', 200, {}, [], COM),
  ...pedidoEn('b_pend', v('prod2'), COM2),
  ...pedidoEn('b_prep', v('prod2'), COM2),
  accion('[pedido b_prep] El Dueño lo acepta', TOKEN_DUENO, 'b_prep', 'aceptar', 200, {}, [], COM2),
  ...pedidoEn('b_listo', v('prod2'), COM2),
  ...aceptaYDespacha('b_listo', COM2),
  ...pedidoEn('b_camino', v('prod2'), COM2, { delivery: true }),
  ...aceptaYDespacha('b_camino', COM2),
  ...pedidoEn('b_sinpagar', v('prod2'), COM2, { pagado: false }),

  duenoEnListado('El listado de Dueños muestra al Dueño activo con sus comercios, sin suspensión', [
    prueba('Activo y sin suspension', "pm.expect(d.estado).to.eql('ACTIVO'); pm.expect(d.motivoSuspension).to.eql(null); pm.expect(d.suspendidoDesde).to.eql(null); pm.expect(d.ultimoEmailAvisoFallido).to.eql(false); pm.expect(d.cantidadComercios).to.eql(6); pm.expect(d.email).to.be.a('string'); pm.expect(d.dni).to.be.a('string');"),
  ]),
  item('La vista previa describe el efecto en cada comercio y quien atiende los pedidos', req('GET', ADM_DUENO('/suspension/previa'), { token: TOKEN_ADMIN }), [
    status(200),
    prueba('Contenido', `const d = pm.response.json().data; pm.expect(d.estadoActual).to.eql('ACTIVO'); pm.expect(d.comercios.length).to.eql(6); pm.expect(d.topePreparacionMinutos).to.be.above(0); pm.expect(d.topeRetiroMinutos).to.be.above(0);
      const por = (id) => d.comercios.find((c) => String(c.comercioId) === String(id));
      const con = por(${entorno(v('com'))}); pm.expect(con.efecto).to.eql('SE_SUSPENDE'); pm.expect(con.empleadosActivos).to.eql(1); pm.expect(con.pedidosEnPreparacion).to.eql(1); pm.expect(con.pedidosPendientesDeConfirmacion).to.eql(1); pm.expect(con.atencionDePedidos).to.eql('ATENDIDOS_POR_EMPLEADOS');
      const sin = por(${entorno(v('com2'))}); pm.expect(sin.efecto).to.eql('SE_SUSPENDE'); pm.expect(sin.empleadosActivos).to.eql(0); pm.expect(sin.pedidosEnPreparacion).to.eql(1); pm.expect(sin.pedidosListosParaRetirar).to.eql(1); pm.expect(sin.pedidosEnCamino).to.eql(1); pm.expect(sin.pedidosSinPagar).to.eql(1); pm.expect(sin.atencionDePedidos).to.eql('SE_ANULAN_AL_INSTANTE');
      ['com3', 'com4', 'com6'].forEach((k) => { const c = por(pm.environment.get('sd3_' + k)); pm.expect(c.efecto).to.eql('QUEDA_COMO_ESTA'); pm.expect(c.motivoDelEfecto).to.be.a('string'); });
      const aparte = por(${entorno(v('com5'))}); pm.expect(aparte.efecto).to.eql('QUEDA_COMO_ESTA'); pm.expect(aparte.suspensionOrigen).to.eql('INDIVIDUAL');`),
  ]),

  item('Un motivo demasiado corto es 400', req('PUT', ADM_DUENO('/suspender'), { token: TOKEN_ADMIN, body: { motivo: MOTIVO_CORTO } }), [status(400)]),
  item('Sin motivo es 400', req('PUT', ADM_DUENO('/suspender'), { token: TOKEN_ADMIN, body: { motivo: '          ' } }), [status(400)]),
  item('Un Cliente no es un Dueño: 404 por la ruta de Dueños', req('PUT', `${ADMIN}/duenos/{{${v('c_id')}}}/suspender`, { token: TOKEN_ADMIN, body: { motivo: MOTIVO } }), [status(404)]),
  item('Un Dueño inexistente es 404', req('PUT', `${ADMIN}/duenos/2000000000/suspender`, { token: TOKEN_ADMIN, body: { motivo: MOTIVO } }), [status(404)]),
  item('No se suspende a un Administrador', req('PUT', `${ADMIN}/duenos/{{${v('adm_id')}}}/suspender`, { token: TOKEN_ADMIN, body: { motivo: MOTIVO } }), [
    prueba('Es 409', "pm.expect(pm.response.code).to.eql(409);"),
  ]),
  item('Un Cliente no puede suspender Dueños: 403', req('PUT', ADM_DUENO('/suspender'), { token: TOKEN_COMPRADOR, body: { motivo: MOTIVO } }), [status(403)]),
  item('Sin token es 401', req('PUT', ADM_DUENO('/suspender'), { body: { motivo: MOTIVO } }), [status(401)]),
  item('Levantar una cuenta que no esta suspendida es 409', req('PUT', ADM_DUENO('/levantar-suspension'), { token: TOKEN_ADMIN }), [status(409)]),
  item('La ruta de Clientes rechaza a un Dueño con un mensaje claro', req('PUT', `${ADMIN}/clientes/${D}/suspender`, { token: TOKEN_ADMIN, body: { motivo: MOTIVO } }), [
    status(409),
    prueba('Mensaje', "pm.expect(pm.response.json().mensaje).to.eql('Un Dueño se suspende desde la lista de Dueños');"),
  ]),

  item('Atajo de test: el proximo aviso de cuenta falla', req('PUT', '/test/email-aviso-cuenta/fallas', { query: 'cantidad=1', body: {} }), [status(200)]),
  item('El Administrador suspende la cuenta del Dueño', req('PUT', ADM_DUENO('/suspender'), { token: TOKEN_ADMIN, body: { motivo: MOTIVO } }), [
    status(200),
    prueba('Cascada y pedidos', `const d = pm.response.json().data; pm.expect(d.estado).to.eql('SUSPENDIDO');
      const ids = d.comerciosSuspendidos.map(String).sort(); pm.expect(ids).to.eql([String(${entorno(v('com'))}), String(${entorno(v('com2'))})].sort());
      pm.expect(d.pedidosPendientesRechazados).to.eql(2); pm.expect(d.pedidosSinAtencionProcesados).to.eql(2);`),
  ]),
  item('Suspender de nuevo es 409', req('PUT', ADM_DUENO('/suspender'), { token: TOKEN_ADMIN, body: { motivo: MOTIVO } }), [status(409)]),

  comercioEnListado('Los dos comercios operativos quedaron suspendidos con origen Dueño y el mismo motivo', v('com'), [
    prueba('Suspendido', `pm.expect(c.estado).to.eql('SUSPENDIDO'); pm.expect(c.suspensionOrigen).to.eql('DUENO'); pm.expect(c.motivoSuspension).to.eql(${JSON.stringify(MOTIVO)}); pm.expect(c.suspendidoDesde).to.be.a('string');`),
    prueba('El otro tambien', `const o = pm.response.json().data.find((x) => String(x.id) === String(${entorno(v('com2'))})); pm.expect(o.estado).to.eql('SUSPENDIDO'); pm.expect(o.suspensionOrigen).to.eql('DUENO');`),
    prueba('Los demas no cambian', `const por = (k) => pm.response.json().data.find((x) => String(x.id) === String(pm.environment.get('sd3_' + k)));
      pm.expect(por('com3').estado).to.eql('PENDIENTE'); pm.expect(por('com4').estado).to.eql('PENDIENTE'); pm.expect(por('com6').estado).to.eql('RECHAZADO');
      pm.expect(por('com5').estado).to.eql('SUSPENDIDO'); pm.expect(por('com5').suspensionOrigen).to.eql('INDIVIDUAL');`),
  ]),
  duenoEnListado('El listado de Dueños muestra la suspension, el motivo, el estado previo y que el email fallo', [
    prueba('Suspendido', `pm.expect(d.estado).to.eql('SUSPENDIDO'); pm.expect(d.motivoSuspension).to.eql(${JSON.stringify(MOTIVO)}); pm.expect(d.suspendidoDesde).to.be.a('string'); pm.expect(d.estadoPrevioSuspension).to.eql('ACTIVO'); pm.expect(d.ultimoEmailAvisoFallido).to.eql(true);`),
  ]),
  item('Hay un solo email de suspension, y fallo', req('GET', '/test/emails-cuenta', { query: `email={{${v('d_email')}}}` }), [
    status(200),
    prueba('Un email', "const e = pm.response.json().data.filter((x) => x.tipo === 'DUENO_SUSPENDIDO'); pm.expect(e.length).to.eql(1); pm.expect(e[0].estado).to.eql('FALLIDO'); pm.expect(pm.response.json().data.filter((x) => x.tipo === 'COMERCIO_SUSPENDIDO').length).to.eql(0);"),
  ]),
  item('El Administrador reenvia el email', req('POST', ADM_DUENO('/suspension/reenviar-email'), { token: TOKEN_ADMIN, body: {} }), [status(200)]),
  duenoEnListado('Ahora el listado ya no marca el email como fallido', [prueba('Sin falla', 'pm.expect(d.ultimoEmailAvisoFallido).to.eql(false);')]),
  item('Reenviar otra vez, sin nada fallido, es 409', req('POST', ADM_DUENO('/suspension/reenviar-email'), { token: TOKEN_ADMIN, body: {} }), [status(409)]),

  estadoDelPedido('El pendiente del comercio con equipo se rechazo', 'a_pend', 'RECHAZADO', ["pm.test('Con reembolso de la suspension', () => pm.expect(p.reembolsoMotivo).to.eql('SUSPENSION_COMERCIO'));"]),
  estadoDelPedido('El pedido en preparacion del comercio con equipo sigue su curso', 'a_prep', 'EN_PREPARACION'),
  estadoDelPedido('El pendiente del comercio sin equipo se rechazo', 'b_pend', 'RECHAZADO'),
  estadoDelPedido('El pedido en preparacion del comercio sin equipo se anulo', 'b_prep', 'ANULADO', [
    "pm.test('Con reembolso de la suspension', () => { pm.expect(p.reembolsoMotivo).to.eql('SUSPENSION_COMERCIO'); pm.expect(Number(p.reembolsoMonto)).to.be.above(0); });",
  ]),
  estadoDelPedido('El pedido listo para retirar del comercio sin equipo se cancelo', 'b_listo', 'CANCELADO_POR_SISTEMA', [
    "pm.test('Con reembolso de la suspension', () => pm.expect(p.reembolsoMotivo).to.eql('SUSPENSION_COMERCIO'));",
  ]),
  estadoDelPedido('El pedido en camino no cambia', 'b_camino', 'EN_CAMINO'),
  estadoDelPedido('El pedido sin pagar no cambia', 'b_sinpagar', 'PENDIENTE_PAGO'),
  item('El Cliente recibe un aviso por cada pedido devuelto, con el texto claro y sin nombres internos', req('GET', '/notificaciones', { token: TOKEN_COMPRADOR }), [
    status(200),
    prueba('Cuatro avisos', "const t = 'Tu pedido se canceló porque el comercio no está disponible. Te devolvemos el dinero.'; const n = pm.response.json().data.filter((x) => x.mensaje === t); pm.expect(n.length).to.eql(4); n.forEach((x) => pm.expect(x.mensaje).to.not.match(/SUSPENDIDO|RECHAZADO|PENDIENTE|ANULADO/));"),
  ]),
  item('La Empleada recibe el aviso del comercio sin el motivo y sin email', req('GET', '/notificaciones', { token: TOKEN_EMPLEADO, comercio: COM }), [
    status(200),
    prueba('Aviso de equipo', `const n = pm.response.json().data.filter((x) => x.tipo === 'COMERCIO_SUSPENDIDO_EQUIPO'); pm.expect(n.length).to.eql(1); pm.expect(n[0].mensaje).to.not.include(${JSON.stringify(MOTIVO)});`),
  ]),
  item('El barrido de pedidos sin atencion corre y no cambia nada', req('POST', '/test/jobs/pedidos/procesar-sin-atencion-suspension-dueno', { body: {} }), [status(200)]),
  item('Una segunda corrida del barrido tampoco', req('POST', '/test/jobs/pedidos/procesar-sin-atencion-suspension-dueno', { body: {} }), [status(200)]),
  item('El Cliente sigue con cuatro avisos exactos', req('GET', '/notificaciones', { token: TOKEN_COMPRADOR }), [
    status(200),
    prueba('Cuatro avisos', "const t = 'Tu pedido se canceló porque el comercio no está disponible. Te devolvemos el dinero.'; pm.expect(pm.response.json().data.filter((x) => x.mensaje === t).length).to.eql(4);"),
  ]),
  item('La Empleada sigue pudiendo despachar el pedido en preparacion (lo atiende el equipo)', req('PUT', `/pedidos/comercio/${P('a_prep')}/despachar`, { token: TOKEN_EMPLEADO, comercio: COM, body: {} }), [status(200)]),

  item('El Dueño no puede iniciar sesion: 409 CUENTA_SUSPENDIDA con el motivo', req('POST', '/auth/login', { body: { nombreUsuario: `{{${v('d_usuario')}}}`, password: `{{${v('d_password')}}}` } }), [
    status(409),
    codigoDe('CUENTA_SUSPENDIDA'),
    prueba('Con el motivo', `pm.expect(pm.response.json().data.motivo).to.eql(${JSON.stringify(MOTIVO)});`),
  ]),
  item('Con la contraseña incorrecta no se revela la suspension', req('POST', '/auth/login', { body: { nombreUsuario: `{{${v('d_usuario')}}}`, password: 'Incorrecta1' } }), [
    status(401),
    prueba('Sin codigo', "pm.expect((pm.response.json().data || {}).codigo).to.eql(undefined);"),
  ]),
  item('La sesion abierta del Dueño ya no sirve: 401 CUENTA_SUSPENDIDA', req('GET', '/comercios/perfil', { token: TOKEN_DUENO, comercio: COM }), [status(401), codigoDe('CUENTA_SUSPENDIDA')]),

  item('No se aprueba un comercio pendiente con el Dueño suspendido', req('PUT', ADM_COM(COM3, '/resolver'), { token: TOKEN_ADMIN, body: { aprobar: true } }), [
    status(409),
    prueba('Mensaje', "pm.expect(pm.response.json().mensaje).to.eql('El Dueño tiene la cuenta suspendida. Levantá la suspensión primero.');"),
  ]),
  item('Rechazar un comercio pendiente si se puede', req('PUT', ADM_COM(COM4, '/resolver'), { token: TOKEN_ADMIN, body: { aprobar: false, motivo: 'No cumple los requisitos de la plataforma' } }), [status(200)]),
  item('Un comercio suspendido aparte no se levanta con el Dueño suspendido', req('PUT', ADM_COM(COM5, '/levantar-suspension'), { token: TOKEN_ADMIN }), [
    status(409),
    prueba('Mensaje', "pm.expect(pm.response.json().mensaje).to.eql('El Dueño tiene la cuenta suspendida. Levantá la suspensión primero.');"),
  ]),
  item('Un comercio suspendido por el Dueño no se levanta por separado', req('PUT', ADM_COM(COM, '/levantar-suspension'), { token: TOKEN_ADMIN }), [status(409)]),

  item('Atajo de test: el proximo aviso de cuenta falla (levantamiento)', req('PUT', '/test/email-aviso-cuenta/fallas', { query: 'cantidad=1', body: {} }), [status(200)]),
  item('El Administrador levanta la suspension con un mensaje', req('PUT', ADM_DUENO('/levantar-suspension'), { token: TOKEN_ADMIN, body: { motivo: 'Regularizaste toda la documentacion' } }), [
    status(200),
    prueba('Restaura solo lo suyo', `const d = pm.response.json().data; pm.expect(d.estado).to.eql('ACTIVO');
      pm.expect(d.comerciosRestaurados.map(String).sort()).to.eql([String(${entorno(v('com'))}), String(${entorno(v('com2'))})].sort());
      pm.expect(d.comerciosQueSiguenSuspendidos.map(String)).to.eql([String(${entorno(v('com5'))})]);`),
  ]),
  comercioEnListado('Los comercios del Dueño volvieron a vender y el suspendido aparte sigue suspendido', v('com'), [
    prueba('Vuelven', `const por = (k) => pm.response.json().data.find((x) => String(x.id) === String(pm.environment.get('sd3_' + k)));
      pm.expect(por('com').estado).to.eql('APTO_VENTA'); pm.expect(por('com2').estado).to.eql('APTO_VENTA');
      pm.expect(por('com').suspensionOrigen).to.eql(null); pm.expect(por('com').motivoSuspension).to.eql(null);
      pm.expect(por('com5').estado).to.eql('SUSPENDIDO'); pm.expect(por('com5').suspensionOrigen).to.eql('INDIVIDUAL');
      pm.expect(por('com3').estado).to.eql('PENDIENTE'); pm.expect(por('com4').estado).to.eql('RECHAZADO');`),
  ]),
  duenoEnListado('El listado de Dueños ya no muestra suspension y marca el email del levantamiento como fallido', [
    prueba('Activo', "pm.expect(d.estado).to.eql('ACTIVO'); pm.expect(d.motivoSuspension).to.eql(null); pm.expect(d.suspendidoDesde).to.eql(null); pm.expect(d.ultimoEmailAvisoFallido).to.eql(true);"),
  ]),
  item('El Administrador reenvia el email del levantamiento', req('POST', ADM_DUENO('/suspension/reenviar-email'), { token: TOKEN_ADMIN, body: {} }), [status(200)]),
  item('Hay un solo email de levantamiento', req('GET', '/test/emails-cuenta', { query: `email={{${v('d_email')}}}` }), [
    status(200),
    prueba('Un email', "const e = pm.response.json().data.filter((x) => x.tipo === 'DUENO_SUSPENSION_LEVANTADA'); pm.expect(e.length).to.eql(1); pm.expect(e[0].estado).to.eql('ENVIADO');"),
  ]),
  estadoDelPedido('Levantar no restaura el pedido anulado', 'b_prep', 'ANULADO'),
  estadoDelPedido('Ni el pedido cancelado', 'b_listo', 'CANCELADO_POR_SISTEMA'),
  item('El Dueño vuelve a iniciar sesion', req('POST', '/auth/login', { body: { nombreUsuario: `{{${v('d_usuario')}}}`, password: `{{${v('d_password')}}}` } }), [
    status(200),
    guardar(TOKEN_DUENO, 'pm.response.json().data.token'),
  ]),
  item('El Dueño ve el aviso de que su comercio volvio a operar', req('GET', '/notificaciones', { token: TOKEN_DUENO, comercio: COM }), [
    status(200),
    prueba('Avisos', "const t = pm.response.json().data.map((x) => x.tipo); pm.expect(t).to.include('COMERCIO_SUSPENDIDO'); pm.expect(t).to.include('SUSPENSION_LEVANTADA');"),
  ]),
  item('El barrido ya no actua sobre los comercios del Dueño', req('POST', '/test/jobs/pedidos/procesar-sin-atencion-suspension-dueno', { body: {} }), [status(200)]),
  estadoDelPedido('El pedido en preparacion con equipo sigue en pie (la Empleada lo despacho)', 'a_prep', 'LISTO_PARA_RETIRAR'),
  item('Ahora se aprueba el comercio pendiente que antes estaba bloqueado', req('PUT', ADM_COM(COM3, '/resolver'), { token: TOKEN_ADMIN, body: { aprobar: true } }), [status(200)]),
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
const claves = [...new Set(JSON.stringify(items).match(/sd3_[a-z0-9_]+/g))];
const existentes = new Set(environment.values.map((x) => x.key));
for (const key of claves) {
  if (!existentes.has(key)) environment.values.push({ key, value: '', type: 'default', enabled: true });
}
fs.writeFileSync(environmentPath, JSON.stringify(environment, null, 2) + '\n', 'utf8');

console.log(`OK: carpeta "${NOMBRE_CARPETA.slice(0, 40)}..." con ${items.length} requests.`);
