import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const collectionPath = path.resolve(__dirname, '../../../postman/Bajonea-MVP.postman_collection.json');
const environmentPath = path.resolve(__dirname, '../../../postman/Bajonea-Local.postman_environment.json');

const PREFIJO_CARPETA = '84 - ';
const NOMBRE_CARPETA = '84 - Suspension de comercio S2.1 (los pedidos pendientes se rechazan solos al suspender, con reembolso, aviso al Cliente y barrido de seguridad)';

const v = (clave) => `sc21_${clave}`;
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
    guardar(v(`${clave}_email`), `'sc21.${clave}.' + s + '@bajonea.test'`),
    guardar(v(`${clave}_usuario`), `('sc21${clave}' + s).slice(0, 20)`),
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
  guardar(v(`nombre_${clave}`), "'Local Suspension S21 ' + Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36)"),
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
  ...duenoNuevo('d', 'Dueño S21', v('com'), true),
  item(
    'Administrador crea la categoria del producto',
    req('POST', '/categorias', { token: TOKEN_ADMIN, rawBody: `{"nombre": "{{${v('cat_nombre')}}}"}` }),
    [status(201), guardar(v('cat'), 'pm.response.json().data.id')],
    [guardar(v('cat_nombre'), "'Cat Suspension S21 ' + Date.now().toString(36)")],
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
  ...crearPedido('pend_c', { delivery: true }),
  ...crearPedido('prep_a'),
  accion('[pedido prep_a] El Dueño lo acepta', TOKEN_DUENO, 'prep_a', 'aceptar'),
  ...crearPedido('listo_a'),
  accion('[pedido listo_a] El Dueño lo acepta', TOKEN_DUENO, 'listo_a', 'aceptar'),
  accion('[pedido listo_a] El Dueño lo despacha', TOKEN_DUENO, 'listo_a', 'despachar'),

  item('La vista previa cuenta tres pendientes', req('GET', ADM_COM(COM, '/suspension/previa'), { token: TOKEN_ADMIN }), [
    status(200),
    prueba('Cantidades', "const d = pm.response.json().data; pm.expect(d.pedidosPendientesDeConfirmacion).to.eql(3); pm.expect(d.pedidosEnPreparacion).to.eql(1); pm.expect(d.pedidosListosParaRetirar).to.eql(1);"),
  ]),
  item('El Administrador suspende el comercio', req('PUT', ADM_COM(COM, '/suspender'), { token: TOKEN_ADMIN, body: { motivo: MOTIVO } }), [status(200)]),
  item('La vista previa ya no tiene pendientes y los demas pedidos siguen igual', req('GET', ADM_COM(COM, '/suspension/previa'), { token: TOKEN_ADMIN }), [
    status(200),
    prueba('Cantidades', "const d = pm.response.json().data; pm.expect(d.estadoActual).to.eql('SUSPENDIDO'); pm.expect(d.pedidosPendientesDeConfirmacion).to.eql(0); pm.expect(d.pedidosEnPreparacion).to.eql(1); pm.expect(d.pedidosListosParaRetirar).to.eql(1);"),
  ]),
  item('El Cliente ve los tres pendientes rechazados con el reembolso de la suspension y los demas intactos', req('GET', '/pedidos/cliente', { token: TOKEN_COMPRADOR }), [
    status(200),
    prueba('Rechazados por la suspension', `const d = pm.response.json().data; for (const id of [${entorno(v('ped_pend_a'))}, ${entorno(v('ped_pend_b'))}, ${entorno(v('ped_pend_c'))}].map(Number)) { const p = d.find((x) => x.id === id); pm.expect(p.estado).to.eql('RECHAZADO'); pm.expect(p.reembolsoMotivo).to.eql('SUSPENSION_COMERCIO'); pm.expect(p.reembolsoEstado).to.not.eql(null); pm.expect(Number(p.reembolsoMonto)).to.be.above(0); }`),
    prueba('Los demas no se tocan', `const d = pm.response.json().data; const prep = d.find((x) => x.id === Number(${entorno(v('ped_prep_a'))})); const listo = d.find((x) => x.id === Number(${entorno(v('ped_listo_a'))})); pm.expect(prep.estado).to.eql('EN_PREPARACION'); pm.expect(listo.estado).to.eql('LISTO_PARA_RETIRAR'); pm.expect(prep.reembolsoEstado || null).to.eql(null);`),
  ]),
  item('El Cliente recibe un aviso de rechazo por cada pedido, con el texto claro', req('GET', '/notificaciones', { token: TOKEN_COMPRADOR }), [
    status(200),
    prueba('Tres avisos', "const n = pm.response.json().data.filter((x) => x.tipo === 'PEDIDO_RECHAZADO'); pm.expect(n.length).to.eql(3); n.forEach((x) => { pm.expect(x.mensaje).to.eql('Tu pedido se canceló porque el comercio no está disponible. Te devolvemos el dinero.'); pm.expect(x.mensaje).to.not.match(/SUSPENDIDO|RECHAZADO|PENDIENTE/); });"),
  ]),
  item('El Dueño no recibe un aviso por cada pedido rechazado', req('GET', '/notificaciones', { token: TOKEN_DUENO, comercio: COM }), [
    status(200),
    prueba('Sin avisos de rechazo', "pm.expect(pm.response.json().data.filter((x) => x.tipo === 'PEDIDO_RECHAZADO').length).to.eql(0);"),
  ]),
  item('La Empleada tampoco', req('GET', '/notificaciones', { token: TOKEN_EMPLEADO, comercio: COM }), [
    status(200),
    prueba('Sin avisos de rechazo', "pm.expect(pm.response.json().data.filter((x) => x.tipo === 'PEDIDO_RECHAZADO').length).to.eql(0);"),
  ]),
  item('El Dueño ve los tres pedidos rechazados en su lista', req('GET', '/pedidos/comercio', { token: TOKEN_DUENO, comercio: COM }), [
    status(200),
    prueba('Rechazados', `const d = pm.response.json().data; for (const id of [${entorno(v('ped_pend_a'))}, ${entorno(v('ped_pend_b'))}, ${entorno(v('ped_pend_c'))}].map(Number)) { pm.expect(d.find((x) => x.id === id).estado).to.eql('RECHAZADO'); }`),
  ]),
  item('El Dueño ve en la actividad la accion automatica del sistema', req('GET', '/comercios/equipo/actividad', { token: TOKEN_DUENO, comercio: COM, query: 'fuente=PEDIDO&limite=50' }), [
    status(200),
    prueba('Texto de la suspension', "const a = pm.response.json().data.items.filter((x) => x.accion === 'RECHAZADO'); pm.expect(a.length).to.eql(3); a.forEach((x) => { pm.expect(x.accionTexto).to.include('Rechazó automáticamente'); pm.expect(x.accionTexto).to.include('por la suspensión del comercio'); });"),
  ]),

  item('Ventana de prueba: el comercio se reanuda por atajo, sin procesar nada', req('PUT', `/test/comercios/${COM}/reanudar-sin-procesar`, { body: {} }), [status(200)]),
  ...crearPedido('pend_d'),
  ...crearPedido('pend_e'),
  item('Ventana de prueba: se vuelve a suspender por atajo, sin procesar los pendientes', req('PUT', `/test/comercios/${COM}/suspension`, { body: {}, query: 'origen=INDIVIDUAL&minutos=0' }), [status(200)]),
  estadoPedido('El pedido que entro en la ventana sigue pendiente', 'pend_d', 'PENDIENTE_CONFIRMACION_COMERCIO'),
  accion('El Dueño no puede aceptarlo: 409 COMERCIO_SIN_OPERACION', TOKEN_DUENO, 'pend_d', 'aceptar', 409, {}, [codigoDe('COMERCIO_SIN_OPERACION')]),
  accion('El Dueño rechaza a mano el segundo pedido de la ventana', TOKEN_DUENO, 'pend_e', 'rechazar', 200, { motivo: 'SIN_STOCK' }, [
    "pm.test('Queda RECHAZADO con reembolso', () => { const d = pm.response.json().data; pm.expect(d.estado).to.eql('RECHAZADO'); pm.expect(d.reembolsoEstado).to.not.eql(null); });",
  ]),
  item('El barrido de seguridad rechaza lo que quedo pendiente', req('POST', '/test/jobs/pedidos/rechazar-pendientes-suspension', { body: {} }), [status(200)]),
  estadoPedido('El pedido de la ventana quedo rechazado por el barrido', 'pend_d', 'RECHAZADO', [
    "pm.test('Con el reembolso de la suspension', () => pm.expect(p.reembolsoMotivo).to.eql('SUSPENSION_COMERCIO'));",
  ]),
  item('El barrido es idempotente: una segunda corrida no cambia nada', req('POST', '/test/jobs/pedidos/rechazar-pendientes-suspension', { body: {} }), [status(200)]),
  item('El Cliente tiene exactamente un aviso por pedido rechazado', req('GET', '/notificaciones', { token: TOKEN_COMPRADOR }), [
    status(200),
    prueba('Cinco avisos', "const n = pm.response.json().data.filter((x) => x.tipo === 'PEDIDO_RECHAZADO'); pm.expect(n.length).to.eql(5); pm.expect(n.filter((x) => x.mensaje === 'Tu pedido se canceló porque el comercio no está disponible. Te devolvemos el dinero.').length).to.eql(4);"),
  ]),
  item('El Administrador levanta la suspension', req('PUT', ADM_COM(COM, '/levantar-suspension'), { token: TOKEN_ADMIN }), [status(200)]),
  estadoPedido('Levantar no deshace el rechazo', 'pend_a', 'RECHAZADO'),
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
  'ped_pend_a', 'ped_pend_b', 'ped_pend_c', 'ped_pend_d', 'ped_pend_e', 'ped_pend_f', 'ped_prep_a', 'ped_prep_b', 'ped_prep_c', 'ped_listo_a', 'ped_listo_b', 'ped_listo_c', 'ped_camino', 'ped_sin_pagar'].map(v);
const existentes = new Set(environment.values.map((x) => x.key));
for (const key of claves) {
  if (!existentes.has(key)) environment.values.push({ key, value: '', type: 'default', enabled: true });
}
fs.writeFileSync(environmentPath, JSON.stringify(environment, null, 2) + '\n', 'utf8');

console.log(`OK: carpeta "${NOMBRE_CARPETA.slice(0, 40)}..." con ${items.length} requests.`);
