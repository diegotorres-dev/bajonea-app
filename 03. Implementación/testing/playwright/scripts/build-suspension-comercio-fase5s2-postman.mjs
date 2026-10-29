import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const collectionPath = path.resolve(__dirname, '../../../postman/Bajonea-MVP.postman_collection.json');
const environmentPath = path.resolve(__dirname, '../../../postman/Bajonea-Local.postman_environment.json');

const PREFIJO_CARPETA = '81 - ';
const NOMBRE_CARPETA = '81 - Suspension de comercio Fase 5 S2 (suspender y levantar, origen, restricciones del Dueño y del equipo, pedidos con tope de 90 minutos, pagos, avisos con y sin motivo, email con falla y reenvio, permisos, validaciones)';

const v = (clave) => `sc2_${clave}`;
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
    guardar(v(`${clave}_email`), `'sc2.${clave}.' + s + '@bajonea.test'`),
    guardar(v(`${clave}_usuario`), `('sc2${clave}' + s).slice(0, 20)`),
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
  guardar(v(`nombre_${clave}`), "'Local Suspension S2 ' + Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36)"),
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

agregar(
  item('Login Administrador (sesion propia de esta carpeta)', req('POST', '/auth/login', { body: { nombreUsuario: '{{admin_usuario}}', password: '{{admin_password}}' } }), [
    status(200),
    guardar(TOKEN_ADMIN, 'pm.response.json().data.token'),
  ]),
  ...duenoNuevo('d', 'Dueño S2', v('com'), true),
  item(
    'Administrador crea la categoria del producto',
    req('POST', '/categorias', { token: TOKEN_ADMIN, rawBody: `{"nombre": "{{${v('cat_nombre')}}}"}` }),
    [status(201), guardar(v('cat'), 'pm.response.json().data.id')],
    [guardar(v('cat_nombre'), "'Cat Suspension S2 ' + Date.now().toString(36)")],
  ),
  item('El Dueño crea el producto con el que compran los Clientes', req('POST', '/productos', { token: TOKEN_DUENO, comercio: COM, rawBody: productoCuerpo('Producto Suspension S2', 10000) }), [
    status(201),
    guardar(v('prod'), 'pm.response.json().data.id'),
  ]),
  ...clienteNuevo('c', 'Carla'),
  loginDe('c', 'Carla (Compradora)', TOKEN_COMPRADOR),
  item('La Compradora obtiene su direccion para pedir a domicilio', req('GET', '/clientes/direcciones', { token: TOKEN_COMPRADOR }), [
    status(200),
    guardar(v('c_dir'), 'pm.response.json().data[0].id'),
  ]),
  ...clienteNuevo('e', 'Elena'),
  item('El Dueño invita a Elena al comercio', req('POST', '/comercios/equipo/invitaciones', { token: TOKEN_DUENO, comercio: COM, body: { email: `{{${v('e_email')}}}` } }), [status(201)]),
  item('Bypass test - codigo de la invitacion de Elena', req('GET', '/test/invitaciones-empleado/codigo', { query: `email={{${v('e_email')}}}&comercioId=${COM}` }), [
    status(200),
    guardar(v('e_inv_codigo'), 'pm.response.json().data'),
  ]),
  item('Elena acepta la invitacion', req('POST', '/auth/invitaciones-empleado/aceptar', { body: { email: `{{${v('e_email')}}}`, codigo: `{{${v('e_inv_codigo')}}}` } }), [status(200)]),
  loginDe('e', 'Elena (Empleada)', TOKEN_EMPLEADO),

  ...crearPedido('pend_a'),
  ...crearPedido('pend_b'),
  ...crearPedido('pend_c'),
  ...crearPedido('prep_a'),
  accion('[pedido prep_a] El Dueño lo acepta', TOKEN_DUENO, 'prep_a', 'aceptar'),
  ...crearPedido('prep_b'),
  accion('[pedido prep_b] El Dueño lo acepta', TOKEN_DUENO, 'prep_b', 'aceptar'),
  ...crearPedido('prep_c'),
  accion('[pedido prep_c] El Dueño lo acepta', TOKEN_DUENO, 'prep_c', 'aceptar'),
  ...crearPedido('listo_a'),
  accion('[pedido listo_a] El Dueño lo acepta', TOKEN_DUENO, 'listo_a', 'aceptar'),
  accion('[pedido listo_a] El Dueño lo deja listo para retirar', TOKEN_DUENO, 'listo_a', 'despachar'),
  ...crearPedido('listo_b'),
  accion('[pedido listo_b] El Dueño lo acepta', TOKEN_DUENO, 'listo_b', 'aceptar'),
  accion('[pedido listo_b] El Dueño lo deja listo para retirar', TOKEN_DUENO, 'listo_b', 'despachar'),
  ...crearPedido('listo_c'),
  accion('[pedido listo_c] El Dueño lo acepta', TOKEN_DUENO, 'listo_c', 'aceptar'),
  accion('[pedido listo_c] El Dueño lo deja listo para retirar', TOKEN_DUENO, 'listo_c', 'despachar'),
  ...crearPedido('camino', { delivery: true }),
  accion('[pedido camino] El Dueño lo acepta', TOKEN_DUENO, 'camino', 'aceptar'),
  accion('[pedido camino] El Dueño lo despacha', TOKEN_DUENO, 'camino', 'despachar', 200, {}, [
    "pm.test('Queda EN_CAMINO', () => pm.expect(pm.response.json().data.estado).to.eql('EN_CAMINO'));",
  ]),
  ...crearPedido('sin_pagar', { pagado: false }),
  ...duenoNuevo('d2', 'Dueño S2 sin Mercado Pago', v('com2'), false),
);

agregar(
  item('Permisos - un Cliente no puede suspender: 403', req('PUT', ADM_COM(COM, '/suspender'), { token: TOKEN_COMPRADOR, body: { motivo: MOTIVO } }), [status(403)]),
  item('Permisos - el Dueño no puede suspender su propio comercio: 403', req('PUT', ADM_COM(COM, '/suspender'), { token: TOKEN_DUENO, body: { motivo: MOTIVO } }), [status(403)]),
  item('Permisos - un Cliente no puede levantar: 403', req('PUT', ADM_COM(COM, '/levantar-suspension'), { token: TOKEN_COMPRADOR }), [status(403)]),
  item('Permisos - un Cliente no ve la vista previa: 403', req('GET', ADM_COM(COM, '/suspension/previa'), { token: TOKEN_COMPRADOR }), [status(403)]),
  item('Permisos - un Cliente no reenvia emails: 403', req('POST', ADM_COM(COM, '/suspension/reenviar-email'), { token: TOKEN_COMPRADOR }), [status(403)]),
  item('Permisos - sin token: 401', req('PUT', ADM_COM(COM, '/suspender'), { body: { motivo: MOTIVO } }), [status(401)]),

  item('Validacion - motivo vacio: 400', req('PUT', ADM_COM(COM, '/suspender'), { token: TOKEN_ADMIN, body: { motivo: '' } }), [status(400)]),
  item('Validacion - motivo en blanco: 400', req('PUT', ADM_COM(COM, '/suspender'), { token: TOKEN_ADMIN, body: { motivo: '           ' } }), [status(400)]),
  item('Validacion - motivo de 9 caracteres: 400', req('PUT', ADM_COM(COM, '/suspender'), { token: TOKEN_ADMIN, body: { motivo: '123456789' } }), [
    status(400),
    prueba('Dice el rango del motivo', "pm.expect(JSON.stringify(pm.response.json().data)).to.include('entre 10 y 500');"),
  ]),
  item('Validacion - motivo de 501 caracteres: 400', req('PUT', ADM_COM(COM, '/suspender'), { token: TOKEN_ADMIN, body: { motivo: 'a'.repeat(501) } }), [status(400)]),
  item('Validacion - sin cuerpo: 400', req('PUT', ADM_COM(COM, '/suspender'), { token: TOKEN_ADMIN }), [status(400)]),
  item('Validacion - levantar con motivo de 501 caracteres: 400', req('PUT', ADM_COM(COM, '/levantar-suspension'), { token: TOKEN_ADMIN, body: { motivo: 'a'.repeat(501) } }), [status(400)]),
  item('Un comercio inexistente al suspender: 404', req('PUT', ADM_COM('99999999', '/suspender'), { token: TOKEN_ADMIN, body: { motivo: MOTIVO } }), [status(404)]),
  item('Un comercio inexistente al levantar: 404', req('PUT', ADM_COM('99999999', '/levantar-suspension'), { token: TOKEN_ADMIN }), [status(404)]),
  item('Un comercio inexistente en la vista previa: 404', req('GET', ADM_COM('99999999', '/suspension/previa'), { token: TOKEN_ADMIN }), [status(404)]),
  item('Un comercio inexistente al reenviar el email: 404', req('POST', ADM_COM('99999999', '/suspension/reenviar-email'), { token: TOKEN_ADMIN }), [status(404)]),
  item('Levantar un comercio que no esta suspendido: 409', req('PUT', ADM_COM(COM, '/levantar-suspension'), { token: TOKEN_ADMIN }), [
    status(409),
    prueba('Mensaje', "pm.expect(pm.response.json().mensaje).to.eql('El comercio no está suspendido');"),
  ]),
  item('Reenviar el email sin ningun email fallido: 409', req('POST', ADM_COM(COM, '/suspension/reenviar-email'), { token: TOKEN_ADMIN }), [status(409)]),

  item('Antes de suspender el comercio figura en el catalogo publico', req('GET', '/catalogo/comercios'), [
    status(200),
    prueba('Esta el comercio', `pm.expect(pm.response.json().data.some((c) => c.id === Number(${entorno(v('com'))}))).to.eql(true);`),
  ]),
  item('Vista previa antes de suspender: cuenta los pedidos por estado', req('GET', ADM_COM(COM, '/suspension/previa'), { token: TOKEN_ADMIN }), [
    status(200),
    prueba('Cantidades', "const d = pm.response.json().data; pm.expect(d.estadoActual).to.eql('APTO_VENTA'); pm.expect(d.pedidosPendientesDeConfirmacion).to.eql(3); pm.expect(d.pedidosEnPreparacion).to.eql(3); pm.expect(d.pedidosListosParaRetirar).to.eql(3); pm.expect(d.pedidosEnCamino).to.eql(1); pm.expect(d.pedidosSinPagar).to.eql(1);"),
  ]),
  item('Antes de suspender el Dueño ve el comercio sin motivo de suspension', req('GET', '/comercios/mis-comercios', { token: TOKEN_DUENO }), [
    status(200),
    prueba('Sin motivo', `const c = pm.response.json().data.find((x) => x.id === Number(${entorno(v('com'))})); pm.expect(c.estado).to.eql('APTO_VENTA'); pm.expect(c.motivoSuspension === undefined || c.motivoSuspension === null).to.eql(true);`),
  ]),

  item('Se suspende el comercio', req('PUT', ADM_COM(COM, '/suspender'), { token: TOKEN_ADMIN, body: { motivo: MOTIVO } }), [
    status(200),
    prueba('Queda SUSPENDIDO de origen INDIVIDUAL con motivo y fecha', `const d = pm.response.json().data; pm.expect(d.estado).to.eql('SUSPENDIDO'); pm.expect(d.suspensionOrigen).to.eql('INDIVIDUAL'); pm.expect(d.motivoSuspension).to.eql(${JSON.stringify(MOTIVO)}); pm.expect(d.suspendidoDesde).to.be.a('string'); pm.environment.set('${v('desde_original')}', d.suspendidoDesde);`),
  ]),
  item('Suspenderlo de nuevo: 409', req('PUT', ADM_COM(COM, '/suspender'), { token: TOKEN_ADMIN, body: { motivo: 'Otro motivo diferente del anterior' } }), [
    status(409),
    prueba('Mensaje', "pm.expect(pm.response.json().mensaje).to.eql('El comercio ya está suspendido');"),
  ]),
  item('El listado del Administrador trae el estado, el origen, la fecha y el motivo', req('GET', `${ADMIN}/comercios`, { token: TOKEN_ADMIN }), [
    status(200),
    prueba('Datos de la suspension', `const c = pm.response.json().data.find((x) => x.id === Number(${entorno(v('com'))})); pm.expect(c.estado).to.eql('SUSPENDIDO'); pm.expect(c.suspensionOrigen).to.eql('INDIVIDUAL'); pm.expect(c.motivoSuspension).to.eql(${JSON.stringify(MOTIVO)}); pm.expect(c.suspendidoDesde).to.be.a('string');`),
  ]),
  item('El comercio suspendido ya no figura en el catalogo publico', req('GET', '/catalogo/comercios'), [
    status(200),
    prueba('No esta el comercio', `pm.expect(pm.response.json().data.some((c) => c.id === Number(${entorno(v('com'))}))).to.eql(false);`),
  ]),
  item('Suspender no tocó ningun pedido: la vista previa sigue igual', req('GET', ADM_COM(COM, '/suspension/previa'), { token: TOKEN_ADMIN }), [
    status(200),
    prueba('Mismas cantidades', "const d = pm.response.json().data; pm.expect(d.estadoActual).to.eql('SUSPENDIDO'); pm.expect(d.pedidosPendientesDeConfirmacion).to.eql(3); pm.expect(d.pedidosEnPreparacion).to.eql(3); pm.expect(d.pedidosListosParaRetirar).to.eql(3); pm.expect(d.pedidosEnCamino).to.eql(1); pm.expect(d.pedidosSinPagar).to.eql(1);"),
  ]),

  item('El Dueño ve el estado, el motivo y la fecha en sus comercios', req('GET', '/comercios/mis-comercios', { token: TOKEN_DUENO }), [
    status(200),
    prueba('Motivo visible', `const c = pm.response.json().data.find((x) => x.id === Number(${entorno(v('com'))})); pm.expect(c.estado).to.eql('SUSPENDIDO'); pm.expect(c.motivoSuspension).to.eql(${JSON.stringify(MOTIVO)}); pm.expect(c.suspendidoDesde).to.be.a('string');`),
  ]),
  item('El Dueño ve el motivo en su perfil', req('GET', '/comercios/perfil', { token: TOKEN_DUENO, comercio: COM }), [
    status(200),
    prueba('Motivo visible', `const d = pm.response.json().data; pm.expect(d.estado).to.eql('SUSPENDIDO'); pm.expect(d.motivoSuspension).to.eql(${JSON.stringify(MOTIVO)});`),
  ]),
  item('La Empleada ve el estado suspendido pero nunca el motivo en sus comercios', req('GET', '/empleados/mis-comercios', { token: TOKEN_EMPLEADO }), [
    status(200),
    prueba('Sin motivo ni fecha', `const c = pm.response.json().data.find((x) => x.id === Number(${entorno(v('com'))})); pm.expect(c.estado).to.eql('SUSPENDIDO'); pm.expect(c).to.not.have.property('motivoSuspension'); pm.expect(c).to.not.have.property('suspendidoDesde');`),
  ]),
  item('La Empleada ve el perfil reducido sin motivo', req('GET', '/comercios/perfil', { token: TOKEN_EMPLEADO, comercio: COM }), [
    status(200),
    prueba('Sin motivo', "const d = pm.response.json().data; pm.expect(d.estado).to.eql('SUSPENDIDO'); pm.expect(JSON.stringify(d)).to.not.include('motivoSuspension');"),
  ]),
  item('El Dueño recibio el aviso con el motivo', req('GET', '/notificaciones', { token: TOKEN_DUENO, comercio: COM }), [
    status(200),
    prueba('Aviso con motivo', `const n = pm.response.json().data.filter((x) => x.tipo === 'COMERCIO_SUSPENDIDO'); pm.expect(n.length).to.eql(1); pm.expect(n[0].mensaje).to.include(${JSON.stringify(MOTIVO)});`),
  ]),
  item('La Empleada recibio el aviso del equipo, sin el motivo', req('GET', '/notificaciones', { token: TOKEN_EMPLEADO, comercio: COM }), [
    status(200),
    prueba('Aviso sin motivo', `const n = pm.response.json().data.filter((x) => x.tipo === 'COMERCIO_SUSPENDIDO_EQUIPO'); pm.expect(n.length).to.eql(1); pm.expect(n[0].mensaje).to.not.include(${JSON.stringify(MOTIVO)}); pm.expect(pm.response.json().data.filter((x) => x.tipo === 'COMERCIO_SUSPENDIDO').length).to.eql(0);`),
  ]),
  item('El email del Dueño salio', req('GET', '/test/emails-cuenta', { query: `email={{${v('d_email')}}}` }), [
    status(200),
    prueba('Un email de suspension enviado', "const l = pm.response.json().data.filter((e) => e.tipo === 'COMERCIO_SUSPENDIDO'); pm.expect(l.length).to.eql(1); pm.expect(l[0].estado).to.eql('ENVIADO');"),
  ]),
  listadoAdmin('Listado de comercios: con el email enviado no figura como fallido', v('com'), false),
  item('La Empleada no recibio ningun email', req('GET', '/test/emails-cuenta', { query: `email={{${v('e_email')}}}` }), [
    status(200),
    prueba('Sin emails', "pm.expect(pm.response.json().data.filter((e) => e.tipo === 'COMERCIO_SUSPENDIDO').length).to.eql(0);"),
  ]),

  item('Restriccion - el Dueño no edita el perfil: 409 COMERCIO_SUSPENDIDO', req('PUT', '/comercios/perfil', { token: TOKEN_DUENO, comercio: COM, rawBody: '{"nombre": "Otro nombre", "descripcion": "x", "telefono": "+5492964555447", "aceptaDelivery": true, "aceptaRetiro": true}' }), [status(409), codigoDe('COMERCIO_SUSPENDIDO')]),
  item('Restriccion - el Dueño no edita descripcion y telefono: 409', req('PUT', '/comercios/perfil/datos-operativos', { token: TOKEN_DUENO, comercio: COM, body: { descripcion: 'x', telefono: '+5492964555447' } }), [status(409), codigoDe('COMERCIO_SUSPENDIDO')]),
  item('Restriccion - el Dueño no pide la firma de la foto: 409', req('POST', '/comercios/perfil/foto/firma', { token: TOKEN_DUENO, comercio: COM, body: {} }), [status(409), codigoDe('COMERCIO_SUSPENDIDO')]),
  item('Restriccion - el Dueño no crea productos: 409', req('POST', '/productos', { token: TOKEN_DUENO, comercio: COM, rawBody: productoCuerpo('Nuevo bloqueado', 500) }), [status(409), codigoDe('COMERCIO_SUSPENDIDO')]),
  item('Restriccion - el Dueño no edita productos ni precios: 409', req('PUT', `/productos/{{${v('prod')}}}`, { token: TOKEN_DUENO, comercio: COM, rawBody: productoCuerpo('Producto editado', 12000) }), [status(409), codigoDe('COMERCIO_SUSPENDIDO')]),
  item('Restriccion - el Dueño no cambia los horarios: 409', req('PUT', '/comercios/perfil/horarios', { token: TOKEN_DUENO, comercio: COM, body: { horarios: [{ diaSemana: 'LUNES', horaApertura: '09:00:00', horaCierre: '12:00:00' }] } }), [status(409), codigoDe('COMERCIO_SUSPENDIDO')]),
  item('Restriccion - el Dueño no agrega redes: 409', req('POST', '/comercios/redes-sociales', { token: TOKEN_DUENO, comercio: COM, body: { tipo: 'FACEBOOK', url: 'facebook.com/suspensions2' } }), [status(409), codigoDe('COMERCIO_SUSPENDIDO')]),
  item('Restriccion - abrir: 409 COMERCIO_NO_OPERATIVO', req('PUT', '/comercios/abrir', { token: TOKEN_DUENO, comercio: COM, body: {} }), [status(409), codigoDe('COMERCIO_NO_OPERATIVO')]),
  item('Restriccion - cerrar: 409 COMERCIO_NO_OPERATIVO', req('PUT', '/comercios/cerrar', { token: TOKEN_DUENO, comercio: COM, body: {} }), [status(409), codigoDe('COMERCIO_NO_OPERATIVO')]),
  item('Restriccion - la Empleada tampoco edita: 409', req('PUT', '/comercios/perfil/datos-operativos', { token: TOKEN_EMPLEADO, comercio: COM, body: { descripcion: 'x', telefono: '+5492964555447' } }), [status(409), codigoDe('COMERCIO_SUSPENDIDO')]),
  item('Restriccion - el equipo no invita: 409', req('POST', '/comercios/equipo/invitaciones', { token: TOKEN_DUENO, comercio: COM, body: { email: 'nuevo.integrante@bajonea.test' } }), [status(409)]),
  item('Restriccion - el equipo no da de baja: 409 COMERCIO_SUSPENDIDO', req('PUT', `/comercios/equipo/miembros/{{${v('e_id')}}}/desactivar`, { token: TOKEN_DUENO, comercio: COM, body: {} }), [status(409), codigoDe('COMERCIO_SUSPENDIDO')]),
  item('Restriccion - no se desvincula Mercado Pago: 409 COMERCIO_SUSPENDIDO', req('DELETE', '/oauth/mercadopago/desvincular', { token: TOKEN_DUENO }), [status(409), codigoDe('COMERCIO_SUSPENDIDO')]),

  item('Permitido - el Dueño ve sus pedidos', req('GET', '/pedidos/comercio', { token: TOKEN_DUENO, comercio: COM }), [status(200)]),
  item('Permitido - el Dueño ve sus estadisticas', req('GET', '/comercios/estadisticas', { token: TOKEN_DUENO, comercio: COM, query: `desde={{${v('hoy')}}}&hasta={{${v('hoy')}}}&agrupar=DIA` }), [status(200)], [guardar(v('hoy'), 'new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10)')]),
  item('Permitido - el Dueño ve sus documentos', req('GET', '/comercios/documentos', { token: TOKEN_DUENO, comercio: COM }), [status(200)]),
  item('Permitido - el Dueño ve el estado de su cuenta de Mercado Pago', req('GET', '/oauth/mercadopago/cuenta', { token: TOKEN_DUENO }), [status(200)]),
  item('Permitido - vincular Mercado Pago no saca al comercio de la suspension', req('POST', `/test/duenos/{{${v('d_id')}}}/mercadopago-simulada`, { body: {} }), [status(200)]),
  item('El comercio sigue suspendido tras vincular Mercado Pago', req('GET', `${ADMIN}/comercios`, { token: TOKEN_ADMIN }), [
    status(200),
    prueba('Sigue SUSPENDIDO', `const c = pm.response.json().data.find((x) => x.id === Number(${entorno(v('com'))})); pm.expect(c.estado).to.eql('SUSPENDIDO');`),
  ]),

  accion('Pedidos - el Dueño no puede aceptar un pedido nuevo: 409 COMERCIO_SIN_OPERACION', TOKEN_DUENO, 'pend_a', 'aceptar', 409, {}, [codigoDe('COMERCIO_SIN_OPERACION')]),
  accion('Pedidos - la Empleada tampoco: 409 COMERCIO_SIN_OPERACION', TOKEN_EMPLEADO, 'pend_b', 'aceptar', 409, {}, [codigoDe('COMERCIO_SIN_OPERACION')]),
  estadoPedido('Pedidos - el pedido sigue pendiente de confirmacion', 'pend_a', 'PENDIENTE_CONFIRMACION_COMERCIO'),
  accion('Pedidos - el Dueño rechaza un pedido nuevo', TOKEN_DUENO, 'pend_c', 'rechazar', 200, { motivo: 'SIN_STOCK' }, [
    "pm.test('Queda RECHAZADO con reembolso', () => { const d = pm.response.json().data; pm.expect(d.estado).to.eql('RECHAZADO'); pm.expect(d.reembolsoEstado).to.not.eql(null); });",
  ]),
  accion('Pedidos - el Dueño despacha un pedido en preparacion', TOKEN_DUENO, 'prep_a', 'despachar', 200, {}, [
    "pm.test('Queda LISTO_PARA_RETIRAR', () => pm.expect(pm.response.json().data.estado).to.eql('LISTO_PARA_RETIRAR'));",
  ]),
  accion('Pedidos - la Empleada anula un pedido en preparacion', TOKEN_EMPLEADO, 'prep_b', 'anular', 200, { motivo: 'SIN_STOCK' }, [
    "pm.test('Queda ANULADO', () => pm.expect(pm.response.json().data.estado).to.eql('ANULADO'));",
  ]),
  accion('Pedidos - el Dueño entrega un pedido listo para retirar', TOKEN_DUENO, 'listo_a', 'entregar', 200, {}, [
    "pm.test('Queda ENTREGADO', () => pm.expect(pm.response.json().data.estado).to.eql('ENTREGADO'));",
  ]),
  item('Pedidos - el pedido de listo_b queda listo hace mas de una hora', req('PUT', `/test/pedidos/${P('listo_b')}/envejecer-listo`, { body: {}, query: 'minutos=70' }), [status(200)]),
  accion('Pedidos - el Dueño cierra como no retirado', TOKEN_DUENO, 'listo_b', 'no-retirado', 200, {}, [
    "pm.test('Queda NO_RETIRADO', () => pm.expect(pm.response.json().data.estado).to.eql('NO_RETIRADO'));",
  ]),
  item('Pedidos - "Ir a pagar" con el comercio suspendido: 409', req('POST', `/pedidos/cliente/${P('sin_pagar')}/pago`, { token: TOKEN_COMPRADOR, body: {} }), [
    status(409),
    prueba('Mensaje claro', "pm.expect(pm.response.json().mensaje).to.eql('Este comercio no está disponible en este momento');"),
  ]),
  item('Pedidos - el Cliente sigue viendo el nombre y la foto del comercio en un pedido viejo', req('GET', '/pedidos/cliente', { token: TOKEN_COMPRADOR }), [
    status(200),
    prueba('Nombre y foto', `const p = pm.response.json().data.find((x) => x.id === Number(${entorno(v('ped_listo_a'))})); pm.expect(p.comercioNombre.toLowerCase()).to.eql(${entorno(v('nombre_d'))}.toLowerCase()); pm.expect(p.comercioFotoUrl).to.be.a('string');`),
  ]),
  item('Pedidos - la Empleada recibe el pedido sin el nombre del comercio ni datos de la suspension', req('GET', '/pedidos/comercio', { token: TOKEN_EMPLEADO, comercio: COM }), [
    status(200),
    prueba('Lista blanca', "const t = JSON.stringify(pm.response.json().data); pm.expect(t).to.not.include('comercioNombre'); pm.expect(t).to.not.include('motivoSuspension');"),
  ]),

  item('Tope de 90 minutos - listo_c quedo listo hace mucho, antes de la suspension', req('PUT', `/test/pedidos/${P('listo_c')}/envejecer-listo`, { body: {}, query: 'minutos=300' }), [status(200)]),
  item('Tope de 90 minutos - la suspension se adelanta 80 minutos', req('PUT', `/test/comercios/${COM}/envejecer-suspension`, { body: {}, query: 'minutos=80' }), [status(200)]),
  item('Tope de 90 minutos - el proceso de preparacion a los 80 minutos no cancela nada', req('POST', '/test/jobs/pedidos/cancelar-preparacion-suspension', { body: {} }), [status(200)]),
  item('Tope de 90 minutos - el proceso de retiros a los 80 minutos no cierra nada', req('POST', '/test/jobs/pedidos/autoconfirmar-retiros', { body: {} }), [status(200)]),
  estadoPedido('Tope de 90 minutos - el pedido en preparacion sigue igual', 'prep_c', 'EN_PREPARACION'),
  estadoPedido('Tope de 90 minutos - el retiro sigue listo para retirar', 'listo_c', 'LISTO_PARA_RETIRAR'),
  item('Tope de 90 minutos - la suspension se adelanta 15 minutos mas', req('PUT', `/test/comercios/${COM}/envejecer-suspension`, { body: {}, query: 'minutos=15' }), [status(200)]),
  item('Tope de 90 minutos - el proceso de retiros a los 95 minutos cierra el retiro', req('POST', '/test/jobs/pedidos/autoconfirmar-retiros', { body: {} }), [status(200)]),
  estadoPedido('Tope de 90 minutos - listo_c se cerro como no retirado y sin reembolso', 'listo_c', 'NO_RETIRADO', [
    "pm.test('Sin reembolso', () => pm.expect(p.reembolsoEstado === undefined || p.reembolsoEstado === null).to.eql(true));",
  ]),
  item('Tope de 90 minutos - el proceso de preparacion a los 95 minutos cancela con reembolso', req('POST', '/test/jobs/pedidos/cancelar-preparacion-suspension', { body: {} }), [status(200)]),
  estadoPedido('Tope de 90 minutos - el pedido en preparacion quedo cancelado por el sistema con reembolso', 'prep_c', 'CANCELADO_POR_SISTEMA', [
    "pm.test('Con reembolso', () => pm.expect(p.reembolsoEstado).to.not.eql(null));",
  ]),
  estadoPedido('Tope de 90 minutos - el pedido en camino no se toca', 'camino', 'EN_CAMINO'),
  estadoPedido('Tope de 90 minutos - el pedido pendiente de confirmacion no se toca', 'pend_a', 'PENDIENTE_CONFIRMACION_COMERCIO'),
  estadoPedido('Tope de 90 minutos - el pedido sin pagar no se toca', 'sin_pagar', 'PENDIENTE_PAGO'),
  item('Tope de 90 minutos - repetir los procesos no escribe nada nuevo', req('POST', '/test/jobs/pedidos/cancelar-preparacion-suspension', { body: {} }), [status(200)]),
  item('Tope de 90 minutos - el Cliente recibio un solo aviso de cancelacion del pedido en preparacion', req('GET', '/notificaciones', { token: TOKEN_COMPRADOR }), [
    status(200),
    prueba('Un aviso', `const id = Number(${entorno(v('ped_prep_c'))}); pm.expect(pm.response.json().data.filter((n) => n.entidadId === id && n.tipo === 'PEDIDO_CANCELADO_SISTEMA').length).to.eql(1);`),
  ]),

  item('Se levanta la suspension con un mensaje', req('PUT', ADM_COM(COM, '/levantar-suspension'), { token: TOKEN_ADMIN, body: { motivo: 'Revisamos todo y esta en orden' } }), [
    status(200),
    prueba('Vuelve a APTO_VENTA y se limpian los datos', "const d = pm.response.json().data; pm.expect(d.estado).to.eql('APTO_VENTA'); pm.expect(d.suspensionOrigen === undefined || d.suspensionOrigen === null).to.eql(true); pm.expect(d.motivoSuspension === undefined || d.motivoSuspension === null).to.eql(true);"),
  ]),
  item('Levantarla de nuevo: 409', req('PUT', ADM_COM(COM, '/levantar-suspension'), { token: TOKEN_ADMIN }), [status(409)]),
  item('El comercio vuelve al catalogo publico', req('GET', '/catalogo/comercios'), [
    status(200),
    prueba('Esta el comercio', `pm.expect(pm.response.json().data.some((c) => c.id === Number(${entorno(v('com'))}))).to.eql(true);`),
  ]),
  item('El Dueño recibio el aviso del levantamiento con el mensaje', req('GET', '/notificaciones', { token: TOKEN_DUENO, comercio: COM }), [
    status(200),
    prueba('Aviso con mensaje', "const n = pm.response.json().data.filter((x) => x.tipo === 'SUSPENSION_LEVANTADA'); pm.expect(n.length).to.eql(1); pm.expect(n[0].mensaje).to.include('Revisamos todo y esta en orden');"),
  ]),
  item('La Empleada recibio el aviso del levantamiento sin el mensaje', req('GET', '/notificaciones', { token: TOKEN_EMPLEADO, comercio: COM }), [
    status(200),
    prueba('Aviso sin mensaje', "const n = pm.response.json().data.filter((x) => x.tipo === 'COMERCIO_SUSPENSION_LEVANTADA_EQUIPO'); pm.expect(n.length).to.eql(1); pm.expect(n[0].mensaje).to.not.include('Revisamos');"),
  ]),
  item('El Dueño vuelve a poder editar', req('PUT', '/comercios/perfil/datos-operativos', { token: TOKEN_DUENO, comercio: COM, body: { descripcion: 'Descripcion despues de levantar', telefono: '+5492964555447' } }), [status(200)]),
  accion('Con el comercio operativo el Dueño vuelve a aceptar pedidos', TOKEN_DUENO, 'pend_a', 'aceptar', 200, {}, [
    "pm.test('Queda EN_PREPARACION', () => pm.expect(pm.response.json().data.estado).to.eql('EN_PREPARACION'));",
  ]),
  item('Levantar detiene el tope: la suspension vuelve a tener fecha nueva en una nueva suspension', req('PUT', `/test/comercios/${COM}/suspension`, { body: {}, query: 'origen=DUENO&minutos=200' }), [status(200)]),
  item('Un comercio suspendido por el Dueño no se levanta individualmente: 409', req('PUT', ADM_COM(COM, '/levantar-suspension'), { token: TOKEN_ADMIN }), [
    status(409),
    prueba('El mensaje habla del Dueño', "pm.expect(pm.response.json().mensaje).to.include('Dueño');"),
  ]),
  item('Pero si se puede suspender individualmente: pasa a INDIVIDUAL y conserva la fecha', req('PUT', ADM_COM(COM, '/suspender'), { token: TOKEN_ADMIN, body: { motivo: 'Ahora es una suspension individual' } }), [
    status(200),
    prueba('Origen INDIVIDUAL y fecha original de hace mas de 3 horas', "const d = pm.response.json().data; pm.expect(d.suspensionOrigen).to.eql('INDIVIDUAL'); pm.expect(d.motivoSuspension).to.eql('Ahora es una suspension individual'); pm.expect(Date.now() - new Date(d.suspendidoDesde + '-03:00').getTime()).to.be.above(3 * 60 * 60 * 1000);"),
  ]),
  item('Y ahora si se levanta', req('PUT', ADM_COM(COM, '/levantar-suspension'), { token: TOKEN_ADMIN }), [status(200)]),

  item('El segundo Dueño: el comercio sin cuenta de Mercado Pago se suspende', req('PUT', ADM_COM(COM2, '/suspender'), { token: TOKEN_ADMIN, body: { motivo: MOTIVO } }), [status(200)]),
  item('Al levantarla sin cuenta de Mercado Pago el comercio vuelve a APROBADO', req('PUT', ADM_COM(COM2, '/levantar-suspension'), { token: TOKEN_ADMIN }), [
    status(200),
    prueba('Queda APROBADO', "pm.expect(pm.response.json().data.estado).to.eql('APROBADO');"),
  ]),

  item('Atajo de test: el proximo email de aviso falla', req('PUT', '/test/email-aviso-cuenta/fallas', { query: 'cantidad=1' }), [status(200)]),
  item('Se suspende el comercio del segundo Dueño con el envio de email fallando', req('PUT', ADM_COM(COM2, '/suspender'), { token: TOKEN_ADMIN, body: { motivo: MOTIVO } }), [status(200)]),
  item('El email quedo marcado como fallido', req('GET', '/test/emails-cuenta', { query: `email={{${v('d2_email')}}}` }), [
    status(200),
    prueba('Un email FALLIDO', "const l = pm.response.json().data.filter((e) => e.tipo === 'COMERCIO_SUSPENDIDO'); pm.expect(l.length).to.eql(2); pm.expect(l[0].estado).to.eql('ENVIADO'); pm.expect(l[1].estado).to.eql('FALLIDO');"),
  ]),
  listadoAdmin('Listado de comercios: con el email fallido figura como fallido', v('com2'), true),
  item('El Administrador reenvia el email', req('POST', ADM_COM(COM2, '/suspension/reenviar-email'), { token: TOKEN_ADMIN }), [status(200)]),
  listadoAdmin('Listado de comercios: tras el reenvio ya no figura como fallido', v('com2'), false),
  item('El email ahora figura enviado', req('GET', '/test/emails-cuenta', { query: `email={{${v('d2_email')}}}` }), [
    status(200),
    prueba('Los dos emails ENVIADOS', "const l = pm.response.json().data.filter((e) => e.tipo === 'COMERCIO_SUSPENDIDO'); pm.expect(l.length).to.eql(2); pm.expect(l.every((e) => e.estado === 'ENVIADO')).to.eql(true);"),
  ]),
  item('Reenviar otra vez: 409 (ya no hay uno fallido)', req('POST', ADM_COM(COM2, '/suspension/reenviar-email'), { token: TOKEN_ADMIN }), [status(409)]),
  item('Se levanta la suspension del segundo comercio', req('PUT', ADM_COM(COM2, '/levantar-suspension'), { token: TOKEN_ADMIN }), [status(200)]),
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
const claves = ['com', 'com2', 'cat', 'cat_nombre', 'prod', 'cuit_tmp', 'dni_rep_tmp', 'nombre_d', 'nombre_d2', 'desde_original', 'hoy',
  'd_email', 'd_usuario', 'd_password', 'd_dni', 'd_codigo', 'd_token', 'd_id',
  'd2_email', 'd2_usuario', 'd2_password', 'd2_dni', 'd2_codigo', 'd2_token', 'd2_id',
  'e_email', 'e_usuario', 'e_password', 'e_dni', 'e_codigo', 'e_token', 'e_id', 'e_inv_codigo',
  'c_email', 'c_usuario', 'c_password', 'c_dni', 'c_codigo', 'c_token', 'c_id', 'c_dir',
  'ped_pend_a', 'ped_pend_b', 'ped_pend_c', 'ped_prep_a', 'ped_prep_b', 'ped_prep_c', 'ped_listo_a', 'ped_listo_b', 'ped_listo_c', 'ped_camino', 'ped_sin_pagar'].map(v);
const existentes = new Set(environment.values.map((x) => x.key));
for (const key of claves) {
  if (!existentes.has(key)) environment.values.push({ key, value: '', type: 'default', enabled: true });
}
fs.writeFileSync(environmentPath, JSON.stringify(environment, null, 2) + '\n', 'utf8');

console.log(`OK: carpeta "${NOMBRE_CARPETA.slice(0, 40)}..." con ${items.length} requests.`);
