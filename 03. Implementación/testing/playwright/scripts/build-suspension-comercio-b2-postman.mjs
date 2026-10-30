import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const collectionPath = path.resolve(__dirname, '../../../postman/Bajonea-MVP.postman_collection.json');
const environmentPath = path.resolve(__dirname, '../../../postman/Bajonea-Local.postman_environment.json');

const PREFIJO_CARPETA = '82 - ';
const NOMBRE_CARPETA = '82 - Suspension de comercio Fase 5 S2 entrega B2 (topes en la vista previa, hora limite de cada pedido para el Dueño y el Empleado, motivo solo para el Dueño, pedido sin pagar con comercio suspendido, cancelar sin pagar, mensajes con salida)';

const v = (clave) => `sb2_${clave}`;
const ADMIN = '/administrador';
const TOKEN_ADMIN = 'token_admin';
const MOTIVO = 'Documentacion vencida y quejas reiteradas de clientes';
const TEXTO_SIN_PEDIDOS = 'Este comercio no está recibiendo pedidos por ahora. Probá con otro comercio.';

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

function identidad(clave) {
  return [
    `const s = Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36);`,
    guardar(v(`${clave}_email`), `'sb2.${clave}.' + s + '@bajonea.test'`),
    guardar(v(`${clave}_usuario`), `('sb2${clave}' + s).slice(0, 20)`),
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
  guardar(v('nombre_d'), "'Local Suspension B2 ' + Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36)"),
];

const horariosTodosLosDias = ['LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO', 'DOMINGO'].map((diaSemana) => ({
  diaSemana,
  horaApertura: '00:00:00',
  horaCierre: '23:59:00',
}));

const COM = `{{${v('com')}}}`;
const TOKEN_DUENO = v('d_token');
const TOKEN_EMPLEADO = v('e_token');
const TOKEN_COMPRADOR = v('c_token');
const CAT = `{{${v('cat')}}}`;
const P = (clave) => `{{${v(`ped_${clave}`)}}}`;
const ADM_COM = (ruta) => `${ADMIN}/comercios/${COM}${ruta}`;

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

function duenoNuevo() {
  return [
    item(
      'Registro Dueño B2',
      req('POST', '/auth/registro/comercio', {
        body: {
          aceptaTerminos: true,
          razonSocial: 'Suspension B2 SRL',
          cuit: `{{${v('cuit_tmp')}}}`,
          condicionIva: 'RESPONSABLE_INSCRIPTO',
          tipoSociedad: 'SRL',
          domicilioFiscal: 'Direccion fiscal B2 100',
          fechaInicioActividades: '2020-01-01',
          nombre: `{{${v('nombre_d')}}}`,
          descripcion: 'Comercio generado por la coleccion de Postman (suspension de comercio, S2 entrega B2)',
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
          fotoPerfilUrl: 'https://res.cloudinary.com/demo/image/upload/postman-suspension-b2.jpg',
          redesSociales: [{ tipo: 'INSTAGRAM', url: 'instagram.com/suspensionb2' }],
        },
      }),
      [status(201)],
      [...identidad('d'), ...datosDueno],
    ),
    item('Bypass test - codigo de verificacion Dueño B2', req('GET', '/test/token-verificacion', { query: `email={{${v('d_email')}}}` }), [
      status(200),
      guardar(v('d_codigo'), 'pm.response.json().data'),
    ]),
    item('Verificar cuenta Dueño B2', req('POST', '/auth/verificar', { body: { email: `{{${v('d_email')}}}`, codigo: `{{${v('d_codigo')}}}` } }), [status(200)]),
    loginDe('d', 'Dueño B2', TOKEN_DUENO),
    item('Administrador busca el comercio pendiente de Dueño B2', req('GET', `${ADMIN}/comercios/pendientes`, { token: TOKEN_ADMIN }), [
      status(200),
      `const c = pm.response.json().data.find((x) => x.emailCuenta === ${entorno(v('d_email'))}.toLowerCase());`,
      "pm.test('El comercio esta pendiente', () => pm.expect(c).to.exist);",
      guardar(v('com'), 'c.id'),
    ]),
    item('Administrador aprueba el comercio', req('PUT', `${ADMIN}/comercios/{{${v('com')}}}/resolver`, { token: TOKEN_ADMIN, body: { aprobar: true } }), [status(200)]),
    item('Atajo de test: cuenta de Mercado Pago simulada', req('POST', `/test/duenos/{{${v('d_id')}}}/mercadopago-simulada`, { body: {} }), [status(200)]),
  ];
}

function crearPedido(clave, { pagado = true } = {}) {
  return [
    item(`[pedido ${clave}] El Cliente vacia el carrito`, req('DELETE', '/carrito', { token: TOKEN_COMPRADOR }), [`pm.test('Carrito vaciado o ya vacio', () => pm.expect([200, 404]).to.include(pm.response.code));`]),
    item(`[pedido ${clave}] El Cliente agrega el producto al carrito`, req('POST', '/carrito/items', { token: TOKEN_COMPRADOR, rawBody: `{"productoId": {{${v('prod')}}}, "cantidad": 1}` }), [status(201)]),
    item(`[pedido ${clave}] El Cliente confirma el pedido`, req('POST', '/pedidos/cliente', { token: TOKEN_COMPRADOR, rawBody: '{"tipoEntrega": "RETIRO", "direccionId": null}' }), [
      status(201),
      guardar(v(`ped_${clave}`), 'pm.response.json().data.id'),
    ]),
    ...(pagado
      ? [item(`[pedido ${clave}] Atajo de test: el pago queda aprobado y registrado`, req('PUT', `/test/pedidos/${P(clave)}/pago-aprobado`, { body: {}, query: 'registrarPago=true' }), [status(200)])]
      : []),
  ];
}

const accion = (nombre, token, clave, ruta, codigo = 200) =>
  item(nombre, req('PUT', `/pedidos/comercio/${P(clave)}/${ruta}`, { token, comercio: COM, body: {} }), [status(codigo)]);

const pedidoDelComercio = (nombre, token, clave, comprobaciones) =>
  item(nombre, req('GET', '/pedidos/comercio', { token, comercio: COM }), [
    status(200),
    `const p = pm.response.json().data.find((x) => x.id === Number(${entorno(v(`ped_${clave}`))}));`,
    "pm.test('El pedido esta en la lista', () => pm.expect(p).to.exist);",
    ...comprobaciones,
  ]);

const pedidoDelCliente = (nombre, clave, comprobaciones) =>
  item(nombre, req('GET', '/pedidos/cliente', { token: TOKEN_COMPRADOR }), [
    status(200),
    `const p = pm.response.json().data.find((x) => x.id === Number(${entorno(v(`ped_${clave}`))}));`,
    "pm.test('El pedido esta en la lista', () => pm.expect(p).to.exist);",
    ...comprobaciones,
  ]);

const minutosEntre = (limite, desde) => `(new Date(${limite}).getTime() - new Date(${desde}).getTime()) / 60000`;

agregar(
  item('Login Administrador (sesion propia de esta carpeta)', req('POST', '/auth/login', { body: { nombreUsuario: '{{admin_usuario}}', password: '{{admin_password}}' } }), [
    status(200),
    guardar(TOKEN_ADMIN, 'pm.response.json().data.token'),
  ]),
  ...duenoNuevo(),
  item(
    'Administrador crea la categoria del producto',
    req('POST', '/categorias', { token: TOKEN_ADMIN, rawBody: `{"nombre": "{{${v('cat_nombre')}}}"}` }),
    [status(201), guardar(v('cat'), 'pm.response.json().data.id')],
    [guardar(v('cat_nombre'), "'Cat Suspension B2 ' + Date.now().toString(36)")],
  ),
  item('El Dueño crea el producto con el que compran los Clientes', req('POST', '/productos', { token: TOKEN_DUENO, comercio: COM, rawBody: `{"nombre": "Producto Suspension B2", "descripcion": "Descripcion B2", "precio": 10000, "categoriaId": ${CAT}}` }), [
    status(201),
    guardar(v('prod'), 'pm.response.json().data.id'),
  ]),
  ...clienteNuevo('c', 'Carla'),
  loginDe('c', 'Carla (Compradora)', TOKEN_COMPRADOR),
  ...clienteNuevo('e', 'Elena'),
  item('El Dueño invita a Elena al comercio', req('POST', '/comercios/equipo/invitaciones', { token: TOKEN_DUENO, comercio: COM, body: { email: `{{${v('e_email')}}}` } }), [status(201)]),
  item('Bypass test - codigo de la invitacion de Elena', req('GET', '/test/invitaciones-empleado/codigo', { query: `email={{${v('e_email')}}}&comercioId=${COM}` }), [
    status(200),
    guardar(v('e_inv_codigo'), 'pm.response.json().data'),
  ]),
  item('Elena acepta la invitacion', req('POST', '/auth/invitaciones-empleado/aceptar', { body: { email: `{{${v('e_email')}}}`, codigo: `{{${v('e_inv_codigo')}}}` } }), [status(200)]),
  loginDe('e', 'Elena (Empleada)', TOKEN_EMPLEADO),

  ...crearPedido('pend'),
  ...crearPedido('prep'),
  accion('[pedido prep] El Dueño lo acepta', TOKEN_DUENO, 'prep', 'aceptar'),
  ...crearPedido('listo'),
  accion('[pedido listo] El Dueño lo acepta', TOKEN_DUENO, 'listo', 'aceptar'),
  accion('[pedido listo] El Dueño lo deja listo para retirar', TOKEN_DUENO, 'listo', 'despachar'),
  ...crearPedido('sin_a', { pagado: false }),
  ...crearPedido('sin_b', { pagado: false }),

  item('Vista previa: trae los topes configurados en minutos y no un numero fijo', req('GET', ADM_COM('/suspension/previa'), { token: TOKEN_ADMIN }), [
    status(200),
    prueba('Topes de 90 minutos', "const d = pm.response.json().data; pm.expect(d.topePreparacionMinutos).to.eql(90); pm.expect(d.topeRetiroMinutos).to.eql(90);"),
    prueba('Los conteos siguen igual', "const d = pm.response.json().data; pm.expect(d.pedidosPendientesDeConfirmacion).to.eql(1); pm.expect(d.pedidosEnPreparacion).to.eql(1); pm.expect(d.pedidosListosParaRetirar).to.eql(1); pm.expect(d.pedidosSinPagar).to.eql(2);"),
  ]),
  item('Antes de suspender, ningun pedido lleva hora limite ni esta marcado como no disponible', req('GET', '/pedidos/comercio', { token: TOKEN_DUENO, comercio: COM }), [
    status(200),
    prueba('Sin limite', 'pm.response.json().data.forEach((p) => pm.expect(p.limiteResolucionSuspension).to.eql(null));'),
  ]),
  item('Se suspende el comercio', req('PUT', ADM_COM('/suspender'), { token: TOKEN_ADMIN, body: { motivo: MOTIVO } }), [
    status(200),
    guardar(v('desde'), 'pm.response.json().data.suspendidoDesde'),
  ]),

  item('El Dueño ve estado, fecha y motivo de la suspension de su comercio', req('GET', '/comercios/mis-comercios', { token: TOKEN_DUENO }), [
    status(200),
    "const c = pm.response.json().data.find((x) => String(x.id) === String(" + entorno(v('com')) + "));",
    prueba('Estado, fecha y motivo', `pm.expect(c.estado).to.eql('SUSPENDIDO'); pm.expect(c.suspendidoDesde).to.exist; pm.expect(c.motivoSuspension).to.eql(${JSON.stringify(MOTIVO)});`),
  ]),
  item('El Empleado ve el estado pero nunca el motivo ni la fecha', req('GET', '/empleados/mis-comercios', { token: TOKEN_EMPLEADO }), [
    status(200),
    "const c = pm.response.json().data.find((x) => String(x.id) === String(" + entorno(v('com')) + "));",
    prueba('Solo el estado', "pm.expect(c.estado).to.eql('SUSPENDIDO'); pm.expect(Object.keys(c)).to.not.include('motivoSuspension'); pm.expect(Object.keys(c)).to.not.include('suspendidoDesde'); pm.expect(JSON.stringify(c)).to.not.include('Documentacion vencida');"),
  ]),
  pedidoDelComercio('Dueño: el pedido pendiente no tiene hora limite', TOKEN_DUENO, 'pend', [
    prueba('Sin limite', 'pm.expect(p.limiteResolucionSuspension).to.eql(null);'),
  ]),
  pedidoDelComercio('Dueño: el pedido en preparacion vence a los 90 minutos de la suspension', TOKEN_DUENO, 'prep', [
    prueba('90 minutos', `pm.expect(${minutosEntre('p.limiteResolucionSuspension', entorno(v('desde')))}).to.eql(90);`),
  ]),
  pedidoDelComercio('Dueño: el pedido listo para retirar vence a los 90 minutos del posterior entre que quedo listo y la suspension', TOKEN_DUENO, 'listo', [
    prueba('90 minutos desde la suspension (ya estaba listo)', `pm.expect(${minutosEntre('p.limiteResolucionSuspension', entorno(v('desde')))}).to.eql(90);`),
  ]),
  pedidoDelComercio('Empleado: ve la misma hora limite y ningun dato de la suspension', TOKEN_EMPLEADO, 'prep', [
    prueba('90 minutos', `pm.expect(${minutosEntre('p.limiteResolucionSuspension', entorno(v('desde')))}).to.eql(90);`),
    prueba('Sin motivo ni cargos del comercio', "const claves = Object.keys(p); pm.expect(claves).to.not.include('motivoSuspension'); pm.expect(claves).to.not.include('comercioNoDisponible'); pm.expect(claves).to.not.include('cargoServicioComercio');"),
  ]),
  pedidoDelCliente('El Cliente ve el pedido sin pagar marcado como comercio no disponible', 'sin_a', [
    prueba('Marcado', `pm.expect(p.comercioNoDisponible).to.eql(true); pm.expect(p.estado).to.eql('PENDIENTE_PAGO'); pm.expect(p.comercioNombre.toLowerCase()).to.eql(${entorno(v('nombre_d'))}.toLowerCase()); pm.expect(p.limiteResolucionSuspension).to.eql(null);`),
  ]),
  pedidoDelCliente('El Cliente ve los pedidos ya pagados sin la marca y con el nombre del comercio', 'pend', [
    prueba('Sin marca', `pm.expect(p.comercioNoDisponible).to.eql(false); pm.expect(p.comercioNombre.toLowerCase()).to.eql(${entorno(v('nombre_d'))}.toLowerCase()); pm.expect(p.limiteResolucionSuspension).to.eql(null);`),
  ]),
  item('Ir a pagar con el comercio suspendido: 409 con un mensaje claro y sin nombres internos', req('POST', `/pedidos/cliente/${P('sin_a')}/pago`, { token: TOKEN_COMPRADOR }), [
    status(409),
    prueba('Mensaje', "const m = pm.response.json().mensaje; pm.expect(m).to.eql('Este comercio no está disponible en este momento'); pm.expect(m).to.not.match(/SUSPENDIDO|PENDIENTE_PAGO/);"),
  ]),
  item('Confirmar un pedido nuevo con el comercio suspendido: 409 con la salida y un codigo estable', req('POST', '/pedidos/cliente', { token: TOKEN_COMPRADOR, rawBody: '{"tipoEntrega": "RETIRO", "direccionId": null}' }), [
    status(409),
    prueba('Codigo y texto', `const r = pm.response.json(); pm.expect(r.data.codigo).to.eql('COMERCIO_SIN_PEDIDOS'); pm.expect(r.mensaje).to.eql(${JSON.stringify(TEXTO_SIN_PEDIDOS)});`),
  ]),
  item('Agregar al carrito con el comercio suspendido: el mismo 409', req('POST', '/carrito/items', { token: TOKEN_COMPRADOR, rawBody: `{"productoId": {{${v('prod')}}}, "cantidad": 1}` }), [
    status(409),
    prueba('Codigo y texto', `const r = pm.response.json(); pm.expect(r.data.codigo).to.eql('COMERCIO_SIN_PEDIDOS'); pm.expect(r.mensaje).to.eql(${JSON.stringify(TEXTO_SIN_PEDIDOS)});`),
  ]),
  item('El carrito se conserva despues del rechazo', req('GET', '/carrito', { token: TOKEN_COMPRADOR }), [
    status(200),
    prueba('Un item', 'pm.expect(pm.response.json().data.items.length).to.eql(1);'),
  ]),
  item('El Cliente cancela el pedido sin pagar del comercio suspendido', req('PUT', `/pedidos/cliente/${P('sin_a')}/cancelar`, { token: TOKEN_COMPRADOR, body: {} }), [
    status(200),
    prueba('Cancelado y sin devolucion', "const d = pm.response.json().data; pm.expect(d.estado).to.eql('CANCELADO'); pm.expect(d.reembolsoEstado).to.eql(null); pm.expect(d.canceladoPor).to.eql('CLIENTE');"),
  ]),
  item('Cancelar otra vez: 409', req('PUT', `/pedidos/cliente/${P('sin_a')}/cancelar`, { token: TOKEN_COMPRADOR, body: {} }), [
    status(409),
    prueba('Mensaje', "pm.expect(pm.response.json().mensaje).to.eql('El pedido ya no se puede cancelar');"),
  ]),
  item('El comercio nunca vio ese pedido: no aparece en su lista', req('GET', '/pedidos/comercio', { token: TOKEN_DUENO, comercio: COM }), [
    status(200),
    prueba('No esta', `pm.expect(pm.response.json().data.some((p) => p.id === Number(${entorno(v('ped_sin_a'))}))).to.eql(false);`),
  ]),
  item('Ni en su actividad', req('GET', '/comercios/equipo/actividad', { token: TOKEN_DUENO, comercio: COM, query: 'fuente=PEDIDO&limite=100' }), [
    status(200),
    prueba('No esta', `const lista = pm.response.json().data.items; pm.expect(lista.length).to.be.above(0); pm.expect(lista.some((i) => i.entidadId === Number(${entorno(v('ped_sin_a'))}))).to.eql(false);`),
  ]),

  item('Se levanta la suspension', req('PUT', ADM_COM('/levantar-suspension'), { token: TOKEN_ADMIN, body: {} }), [status(200)]),
  pedidoDelCliente('Levantada: el pedido sin pagar deja de estar marcado y "Ir a pagar" vuelve a ser posible', 'sin_b', [
    prueba('Sin marca', "pm.expect(p.comercioNoDisponible).to.eql(false); pm.expect(p.estado).to.eql('PENDIENTE_PAGO');"),
  ]),
  pedidoDelComercio('Levantada: el pedido en preparacion ya no tiene hora limite', TOKEN_DUENO, 'prep', [
    prueba('Sin limite', 'pm.expect(p.limiteResolucionSuspension).to.eql(null);'),
  ]),

  item('Se suspende de nuevo para probar el tope', req('PUT', ADM_COM('/suspender'), { token: TOKEN_ADMIN, body: { motivo: MOTIVO } }), [status(200)]),
  item('Atajo de test: la suspension se adelanta 120 minutos', req('PUT', `/test/comercios/${COM}/envejecer-suspension`, { body: {}, query: 'minutos=120' }), [status(200)]),
  item('Atajo de test: corre el proceso del tope de preparacion', req('POST', '/test/jobs/pedidos/cancelar-preparacion-suspension', { body: {} }), [status(200)]),
  pedidoDelCliente('El Cliente ve el pedido cancelado por la suspension con el motivo del reembolso', 'prep', [
    prueba('Cancelado por el sistema y por suspension', "pm.expect(p.estado).to.eql('CANCELADO_POR_SISTEMA'); pm.expect(p.reembolsoMotivo).to.eql('SUSPENSION_COMERCIO'); pm.expect(p.reembolsoEstado).to.exist;"),
  ]),
  pedidoDelComercio('El Dueño ve el pedido ya cerrado sin hora limite', TOKEN_DUENO, 'prep', [
    prueba('Sin limite', "pm.expect(p.estado).to.eql('CANCELADO_POR_SISTEMA'); pm.expect(p.limiteResolucionSuspension).to.eql(null);"),
  ]),
  item('Permisos: el Cliente no ve la vista previa del Administrador (403)', req('GET', ADM_COM('/suspension/previa'), { token: TOKEN_COMPRADOR }), [status(403)]),
  item('Se levanta la suspension al terminar', req('PUT', ADM_COM('/levantar-suspension'), { token: TOKEN_ADMIN, body: {} }), [status(200)]),
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
const claves = ['com', 'cat', 'cat_nombre', 'prod', 'cuit_tmp', 'dni_rep_tmp', 'nombre_d', 'desde',
  'd_email', 'd_usuario', 'd_password', 'd_dni', 'd_codigo', 'd_token', 'd_id',
  'e_email', 'e_usuario', 'e_password', 'e_dni', 'e_codigo', 'e_token', 'e_id', 'e_inv_codigo',
  'c_email', 'c_usuario', 'c_password', 'c_dni', 'c_codigo', 'c_token', 'c_id',
  'ped_pend', 'ped_prep', 'ped_listo', 'ped_sin_a', 'ped_sin_b'].map(v);
const existentes = new Set(environment.values.map((x) => x.key));
for (const key of claves) {
  if (!existentes.has(key)) environment.values.push({ key, value: '', type: 'default', enabled: true });
}
fs.writeFileSync(environmentPath, JSON.stringify(environment, null, 2) + '\n', 'utf8');

console.log(`OK: carpeta "${NOMBRE_CARPETA.slice(0, 40)}..." con ${items.length} requests.`);
