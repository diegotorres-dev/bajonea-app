import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const collectionPath = path.resolve(__dirname, '../../../postman/Bajonea-MVP.postman_collection.json');
const environmentPath = path.resolve(__dirname, '../../../postman/Bajonea-Local.postman_environment.json');

const PREFIJO_CARPETA = '65 - ';
const NOMBRE_CARPETA = '65 - Aviso T30 al equipo cuando el sistema autoconfirma la entrega E3 A6 (Dueño y Empleados activos, no al Cliente del pedido, no al desactivado ni al que se suma despues, lectura individual, por comercio, sin duplicados, no antes de tiempo ni con confirmacion manual)';

const v = (clave) => `ac_${clave}`;

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
    guardar(v(`${clave}_email`), `'ab.${clave}.' + s + '@bajonea.test'`),
    guardar(v(`${clave}_usuario`), `('ab${clave}' + s).slice(0, 20)`),
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
const TOKEN_DUENO = v('d_token');
const TOKEN_EMPLEADO = v('e_token');
const TOKEN_COMPRADOR = v('c_token');
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
          apellido: 'Autoconfirmado',
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

const productoCuerpo = (nombre, precio) => `{"nombre": "${nombre}", "descripcion": "Descripcion A6", "precio": ${precio}, "categoriaId": ${CAT}}`;

function crearPedido(clave, tipo = 'RETIRO', comercioProducto = 'prodD') {
  const direccion = tipo === 'DOMICILIO' ? `{{${v('c_dir')}}}` : 'null';
  return [
    item(`[pedido ${clave}] El Cliente vacia el carrito`, req('DELETE', '/carrito', { token: TOKEN_COMPRADOR }), [`pm.test('Carrito vaciado o ya vacio', () => pm.expect([200, 404]).to.include(pm.response.code));`]),
    item(`[pedido ${clave}] El Cliente agrega el producto al carrito`, req('POST', '/carrito/items', { token: TOKEN_COMPRADOR, rawBody: `{"productoId": {{${v(comercioProducto)}}}, "cantidad": 1}` }), [status(201)]),
    item(
      `[pedido ${clave}] El Cliente confirma el pedido (${tipo === 'DOMICILIO' ? 'a domicilio' : 'retiro en el local'})`,
      req('POST', '/pedidos/cliente', { token: TOKEN_COMPRADOR, rawBody: `{"tipoEntrega": "${tipo}", "direccionId": ${direccion}}` }),
      [status(201), guardar(v(`ped_${clave}`), 'pm.response.json().data.id')],
    ),
  ];
}

const pagar = (clave) =>
  item(`[pedido ${clave}] Atajo de test: el pago queda aprobado y registrado`, req('PUT', `/test/pedidos/${P(clave)}/pago-aprobado`, { body: {}, query: 'registrarPago=true' }), [status(200)]);

const accionPedido = (nombre, token, clave, ruta, codigo = 200, cuerpo = {}) =>
  item(nombre, req('PUT', `/pedidos/comercio/${P(clave)}/${ruta}`, { token, comercio: COM, body: cuerpo }), [status(codigo)]);

const delPedido = `const mios = pm.response.json().data.items.filter((i) => i.entidadTipo === 'PEDIDO' && i.entidadId === Number(pm.environment.get('PEDIDO_VAR')));`;

function actividadDelPedido(nombre, clave, comprobaciones, { token = TOKEN_DUENO, comercio = COM, limite = 100 } = {}) {
  return item(nombre, req('GET', '/comercios/equipo/actividad', { token, comercio, query: `limite=${limite}` }), [
    status(200),
    delPedido.replace('PEDIDO_VAR', v(`ped_${clave}`)),
    ...comprobaciones,
  ]);
}

const textos = (...esperados) =>
  `pm.test('Los textos del pedido, del mas nuevo al mas viejo, son ${esperados.join(' / ')}', () => pm.expect(mios.map((i) => i.accionTexto)).to.eql(${JSON.stringify(esperados)}));`;
const roles = (...esperados) => `pm.test('Los roles son ${esperados.join(' / ')}', () => pm.expect(mios.map((i) => i.actorRol)).to.eql(${JSON.stringify(esperados)}));`;
const sinFilas = `pm.test('El pedido no tiene ninguna fila en la actividad', () => pm.expect(mios).to.have.length(0));`;
const sistemaSinNombre = (posicion) =>
  `pm.test('La fila ${posicion} es del sistema, sin nombre ni usuario', () => { const f = mios[${posicion}]; pm.expect(f.actorRol).to.eql('SISTEMA'); pm.expect(f.actorRolTexto).to.eql('Sistema'); pm.expect(f.actorNombre).to.eql(null); pm.expect(f.actorUsuarioId).to.eql(null); });`;

const ahoraMas = (minutos) => [
  `const ahora = new Date(Date.now() - 3 * 3600 * 1000 + ${minutos} * 60 * 1000);`,
  "pm.environment.set('ac_ahora', ahora.toISOString().slice(0, 19));",
];

agregar(
  item('Login Administrador (sesion propia de esta carpeta)', req('POST', '/auth/login', { body: { nombreUsuario: '{{admin_usuario}}', password: '{{admin_password}}' } }), [
    status(200),
    guardar('token_admin', 'pm.response.json().data.token'),
  ]),
  item(
    'Registro Dueño (con entrega a domicilio y retiro)',
    req('POST', '/auth/registro/comercio', {
      body: {
        razonSocial: 'Autoconfirmado A6 SRL',
        cuit: `{{${v('cuit_tmp')}}}`,
        condicionIva: 'RESPONSABLE_INSCRIPTO',
        tipoSociedad: 'SRL',
        domicilioFiscal: 'Direccion fiscal A6 100',
        fechaInicioActividades: '2020-01-01',
        nombre: 'Local Autoconfirmado A6',
        descripcion: 'Comercio generado por la coleccion de Postman (actividad con pedidos, E3 A6)',
        telefono: '+5492964555445',
        emailContacto: `{{${v('d_email')}}}`,
        tipoComercio: 'RESTAURANTE',
        aceptaDelivery: true,
        aceptaRetiro: true,
        nombreUsuario: `{{${v('d_usuario')}}}`,
        email: `{{${v('d_email')}}}`,
        password: `{{${v('d_password')}}}`,
        direccion: { calle: 'Belgrano', numero: '801', pisoDepto: null, codigoPostal: '9420', localidadId: '{{localidad_id}}', principal: false },
        horarios: horariosTodosLosDias,
        nombreRepresentante: 'Carlos',
        apellidoRepresentante: 'Sanchez',
        dniRepresentante: `{{${v('dni_rep_tmp')}}}`,
        telefonoRepresentante: '+5492964701104',
        fechaNacimientoRepresentante: '1988-04-04',
        fotoPerfilUrl: 'https://res.cloudinary.com/demo/image/upload/postman-actividad-a2b.jpg',
        redesSociales: [{ tipo: 'INSTAGRAM', url: 'instagram.com/autoconfirmadoa6' }],
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
    [guardar(v('cat_nombre'), "'Cat Autoconfirmado A6 ' + Date.now().toString(36)")],
  ),
  item('El Dueño crea el producto con el que compran los Clientes', req('POST', '/productos', { token: TOKEN_DUENO, comercio: COM, rawBody: productoCuerpo('Producto Autoconfirmado A6', 10000) }), [
    status(201),
    guardar(v('prodD'), 'pm.response.json().data.id'),
  ]),
  ...clienteNuevo('c', 'Compradora'),
  loginDe('c', 'Compradora', TOKEN_COMPRADOR),
  item('La Compradora lee su direccion para los pedidos a domicilio', req('GET', '/clientes/perfil', { token: TOKEN_COMPRADOR }), [
    status(200),
    guardar(v('c_dir'), 'pm.response.json().data.direccion.id'),
    guardar(v('c_nombre_completo'), "pm.response.json().data.nombre + ' ' + pm.response.json().data.apellido"),
  ]),
  ...clienteNuevo('e', 'Empleada'),
  item('El Dueño invita a la Empleada al comercio', req('POST', '/comercios/equipo/invitaciones', { token: TOKEN_DUENO, comercio: COM, body: { email: `{{${v('e_email')}}}` } }), [status(201)]),
  item('Bypass test - codigo de la invitacion', req('GET', '/test/invitaciones-empleado/codigo', { query: `email={{${v('e_email')}}}&comercioId=${COM}` }), [
    status(200),
    guardar(v('inv_codigo'), 'pm.response.json().data'),
  ]),
  item('La Empleada acepta la invitacion', req('POST', '/auth/invitaciones-empleado/aceptar', { body: { email: `{{${v('e_email')}}}`, codigo: `{{${v('inv_codigo')}}}` } }), [status(200)]),
  loginDe('e', 'Empleada', TOKEN_EMPLEADO),
);

const TOKEN_EMPLEADA2 = v('f_token');
const TOKEN_EMPLEADA3 = v('g_token');

function sumarEmpleada(clave, nombre, tokenVar) {
  return [
    ...clienteNuevo(clave, nombre),
    item(`El Dueño invita a ${nombre} al comercio`, req('POST', '/comercios/equipo/invitaciones', { token: TOKEN_DUENO, comercio: COM, body: { email: `{{${v(`${clave}_email`)}}}` } }), [status(201)]),
    item(`Bypass test - codigo de la invitacion de ${nombre}`, req('GET', '/test/invitaciones-empleado/codigo', { query: `email={{${v(`${clave}_email`)}}}&comercioId=${COM}` }), [
      status(200),
      guardar(v(`${clave}_inv_codigo`), 'pm.response.json().data'),
    ]),
    item(`${nombre} acepta la invitacion`, req('POST', '/auth/invitaciones-empleado/aceptar', { body: { email: `{{${v(`${clave}_email`)}}}`, codigo: `{{${v(`${clave}_inv_codigo`)}}}` } }), [status(200)]),
    loginDe(clave, nombre, tokenVar),
  ];
}

function crearPedidoDe(clave, token, dirVar) {
  return [
    item(`[pedido ${clave}] Vacia el carrito`, req('DELETE', '/carrito', { token }), [`pm.test('Carrito vaciado o ya vacio', () => pm.expect([200, 404]).to.include(pm.response.code));`]),
    item(`[pedido ${clave}] Agrega el producto al carrito`, req('POST', '/carrito/items', { token, rawBody: `{"productoId": {{${v('prodD')}}}, "cantidad": 1}` }), [status(201)]),
    item(
      `[pedido ${clave}] Confirma el pedido a domicilio`,
      req('POST', '/pedidos/cliente', { token, rawBody: `{"tipoEntrega": "DOMICILIO", "direccionId": {{${v(dirVar)}}}}` }),
      [status(201), guardar(v(`ped_${clave}`), 'pm.response.json().data.id')],
    ),
  ];
}

const T30_TEXTO = "/^El pedido #(\\d+) se confirmó automáticamente como entregado porque el cliente no respondió en (\\d+) minutos\\.$/";
const deLaClave = (clave) => `const mios = pm.response.json().data.filter((n) => n.entidadTipo === 'PEDIDO' && n.entidadId === Number(pm.environment.get('${v(`ped_${clave}`)}')));`;
const delEquipo = `const equipo = mios.filter((n) => ${T30_TEXTO}.test(n.mensaje));`;

function lecturaEquipo(nombre, token, clave, cantidad, { comercio = COM, extra = [] } = {}) {
  return item(nombre, req('GET', '/notificaciones', { token, comercio }), [
    status(200),
    deLaClave(clave),
    delEquipo,
    `pm.test('Hay ${cantidad} aviso(s) T30 del pedido', () => pm.expect(equipo).to.have.length(${cantidad}));`,
    ...extra,
  ]);
}

function lecturaPersonal(nombre, token, clave, cantidadT30, cantidadT8) {
  return item(nombre, req('GET', '/notificaciones', { token }), [
    status(200),
    deLaClave(clave),
    delEquipo,
    `pm.test('Hay ${cantidadT30} aviso(s) del equipo en los personales', () => pm.expect(equipo).to.have.length(${cantidadT30}));`,
    `pm.test('Hay ${cantidadT8} aviso(s) de comprador autoconfirmado', () => pm.expect(mios.filter((n) => /fue autoconfirmado como entregado/.test(n.mensaje))).to.have.length(${cantidadT8}));`,
  ]);
}

const estadoDelPedido = (nombre, clave, esperado) =>
  item(nombre, req('GET', '/pedidos/cliente', { token: TOKEN_COMPRADOR }), [
    status(200),
    `const p = pm.response.json().data.find((x) => x.id === Number(pm.environment.get('${v(`ped_${clave}`)}')));`,
    `pm.test('El pedido esta ${esperado}', () => pm.expect(p.estado).to.eql('${esperado}'));`,
  ]);

agregar(
  ...sumarEmpleada('f', 'Desactivada', TOKEN_EMPLEADA2),
  item('Atajo de test: la Desactivada pasa a INACTIVO antes del hecho', req('PUT', `/test/comercios/${COM}/empleados/{{${v('f_id')}}}/estado`, { body: {}, query: 'estado=INACTIVO' }), [status(200)]),
  item('El Dueño tiene un segundo comercio (clon en APTO_VENTA)', req('POST', `/test/comercios/${COM}/clonar`, { body: {}, query: 'nombre=Clon Autoconfirmado A6&estado=APTO_VENTA' }), [
    status(201),
    guardar(v('clon'), 'pm.response.json().data'),
  ]),
  item('La Empleada lee su direccion para sus pedidos a domicilio', req('GET', '/clientes/perfil', { token: TOKEN_EMPLEADO }), [
    status(200),
    guardar(v('e_dir'), 'pm.response.json().data.direccion.id'),
  ]),
);

agregar(
  ...crearPedido('auto', 'DOMICILIO'),
  pagar('auto'),
  accionPedido('El Dueño acepta el pedido a domicilio', TOKEN_DUENO, 'auto', 'aceptar'),
  accionPedido('El Dueño lo despacha', TOKEN_DUENO, 'auto', 'despachar'),
  ...crearPedidoDe('propio', TOKEN_EMPLEADO, 'e_dir'),
  pagar('propio'),
  accionPedido('El Dueño acepta el pedido de la Empleada', TOKEN_DUENO, 'propio', 'aceptar'),
  accionPedido('El Dueño despacha el pedido de la Empleada', TOKEN_DUENO, 'propio', 'despachar'),
  ...crearPedido('manual', 'DOMICILIO'),
  pagar('manual'),
  accionPedido('El Dueño acepta el pedido que va a confirmar el Cliente', TOKEN_DUENO, 'manual', 'aceptar'),
  accionPedido('El Dueño lo despacha tambien', TOKEN_DUENO, 'manual', 'despachar'),
  estadoDelPedido('Antes de tiempo: el pedido esta en camino', 'auto', 'EN_CAMINO'),
  item('Antes de tiempo: el proceso automatico, 40 minutos despues, no lo toca', req('POST', '/test/jobs/pedidos/avisar-y-autoconfirmar', { body: {}, query: 'ahora={{ac_ahora}}' }), [status(200)], ahoraMas(40)),
  estadoDelPedido('Antes de tiempo: sigue en camino', 'auto', 'EN_CAMINO'),
  lecturaEquipo('Antes de tiempo: el Dueño no tiene ningun aviso T30 del pedido', TOKEN_DUENO, 'auto', 0),
  item('La Compradora confirma la recepcion del pedido "manual"', req('PUT', `/pedidos/cliente/${P('manual')}/entregar`, { token: TOKEN_COMPRADOR, body: {} }), [status(200)]),
  item('El proceso automatico, dos horas despues, da por entregado el pedido que nadie confirmo', req('POST', '/test/jobs/pedidos/avisar-y-autoconfirmar', { body: {}, query: 'ahora={{ac_ahora}}' }), [status(200)], ahoraMas(120)),
  estadoDelPedido('El pedido "auto" quedo entregado', 'auto', 'ENTREGADO'),
  estadoDelPedido('El pedido "manual" sigue entregado por el Cliente', 'manual', 'ENTREGADO'),
);

agregar(
  lecturaEquipo('Dueño: tiene un aviso T30 del pedido "auto", con el texto de la configuracion', TOKEN_DUENO, 'auto', 1, {
    extra: [
      `pm.test('El texto lleva el numero del pedido', () => pm.expect(Number(equipo[0].mensaje.match(${T30_TEXTO})[1])).to.eql(Number(pm.environment.get('${v('ped_auto')}'))));`,
      "pm.test('Es un aviso sin leer', () => pm.expect(equipo[0].leida).to.eql(false));",
      guardar(v('aviso_dueno'), 'equipo[0].id'),
    ],
  }),
  lecturaEquipo('Empleada activa: tiene su propia copia del pedido "auto"', TOKEN_EMPLEADO, 'auto', 1, { extra: [guardar(v('aviso_e'), 'equipo[0].id')] }),
  lecturaEquipo('Empleada activa: no tiene el aviso del equipo de su propio pedido', TOKEN_EMPLEADO, 'propio', 0),
  lecturaEquipo('Dueño: si tiene el aviso del pedido de la Empleada', TOKEN_DUENO, 'propio', 1),
  lecturaPersonal('Empleada sin comercio abierto: recibe el aviso de comprador de su pedido y nada del equipo', TOKEN_EMPLEADO, 'propio', 0, 1),
  lecturaPersonal('Empleada sin comercio abierto: el pedido "auto" no esta entre sus personales', TOKEN_EMPLEADO, 'auto', 0, 0),
  lecturaPersonal('Compradora: recibe el aviso de comprador y ninguno del equipo', TOKEN_COMPRADOR, 'auto', 0, 1),
  item('Desactivada: el mismo 404 de siempre al leer los avisos del comercio', req('GET', '/notificaciones', { token: TOKEN_EMPLEADA2, comercio: COM }), [
    status(404),
    "pm.test('El codigo es COMERCIO_NO_DISPONIBLE', () => pm.expect(pm.response.json().data.codigo).to.eql('COMERCIO_NO_DISPONIBLE'));",
  ]),
  lecturaEquipo('El segundo comercio del Dueño no tiene ningun aviso del pedido "auto"', TOKEN_DUENO, 'auto', 0, { comercio: CLON }),
  lecturaEquipo('Pedido confirmado a mano: el Dueño no tiene aviso T30', TOKEN_DUENO, 'manual', 0),
  lecturaEquipo('Pedido confirmado a mano: la Empleada tampoco', TOKEN_EMPLEADO, 'manual', 0),
  item('Lectura individual: la Empleada marca como leida su copia', req('PUT', `/notificaciones/{{${v('aviso_e')}}}/leida`, { token: TOKEN_EMPLEADO, body: {} }), [
    status(200),
    "pm.test('Quedo leida', () => pm.expect(pm.response.json().data.leida).to.eql(true));",
  ]),
  lecturaEquipo('Lectura individual: la copia del Dueño sigue sin leer', TOKEN_DUENO, 'auto', 1, { extra: ["pm.test('Sigue sin leer', () => pm.expect(equipo[0].leida).to.eql(false));"] }),
  item('Lectura individual: la Empleada no puede marcar la copia del Dueño', req('PUT', `/notificaciones/{{${v('aviso_dueno')}}}/leida`, { token: TOKEN_EMPLEADO, body: {} }), [status(404)]),
  item('Repetir el proceso: otra pasada, dos horas despues, no duplica nada', req('POST', '/test/jobs/pedidos/avisar-y-autoconfirmar', { body: {}, query: 'ahora={{ac_ahora}}' }), [status(200)], ahoraMas(120)),
  lecturaEquipo('Repetir el proceso: el Dueño sigue con un solo aviso', TOKEN_DUENO, 'auto', 1),
  lecturaEquipo('Repetir el proceso: la Empleada sigue con un solo aviso', TOKEN_EMPLEADO, 'auto', 1),
  ...sumarEmpleada('g', 'Nueva', TOKEN_EMPLEADA3),
  lecturaEquipo('Empleada que se suma despues: no ve el aviso anterior a su alta', TOKEN_EMPLEADA3, 'auto', 0),
  item('Empleada que se suma despues: no tiene nada sin leer', req('GET', '/notificaciones/no-leidas/contador', { token: TOKEN_EMPLEADA3, comercio: COM }), [
    status(200),
    "pm.test('El contador es 0', () => pm.expect(pm.response.json().data).to.eql(0));",
  ]),
  item('Autorizacion: sin token es 401', req('GET', '/notificaciones', { comercio: COM }), [status(401)]),
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
const claves = ['com', 'clon', 'cat', 'cat_nombre', 'prodD', 'inv_codigo', 'cuit_tmp', 'dni_rep_tmp', 'ahora', 'e_dir', 'aviso_dueno', 'aviso_e',
  'd_email', 'd_usuario', 'd_password', 'd_dni', 'd_codigo', 'd_token', 'd_id',
  'e_email', 'e_usuario', 'e_password', 'e_dni', 'e_codigo', 'e_token', 'e_id',
  'f_email', 'f_usuario', 'f_password', 'f_dni', 'f_codigo', 'f_token', 'f_id', 'f_inv_codigo',
  'g_email', 'g_usuario', 'g_password', 'g_dni', 'g_codigo', 'g_token', 'g_id', 'g_inv_codigo',
  'c_email', 'c_usuario', 'c_password', 'c_dni', 'c_codigo', 'c_token', 'c_id', 'c_dir', 'c_nombre_completo',
  'ped_auto', 'ped_propio', 'ped_manual'].map(v);
const existentes = new Set(environment.values.map((x) => x.key));
for (const key of claves) {
  if (!existentes.has(key)) environment.values.push({ key, value: '', type: 'default', enabled: true });
}
fs.writeFileSync(environmentPath, JSON.stringify(environment, null, 2) + '\n', 'utf8');

console.log(`OK: carpeta "${NOMBRE_CARPETA.slice(0, 40)}..." con ${items.length} requests.`);
