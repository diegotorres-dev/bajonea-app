import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const collectionPath = path.resolve(__dirname, '../../../postman/Bajonea-MVP.postman_collection.json');
const environmentPath = path.resolve(__dirname, '../../../postman/Bajonea-Local.postman_environment.json');

const PREFIJO_CARPETA = '60 - ';
const NOMBRE_CARPETA = '60 - Actividad del comercio E3 A2b (pedidos del Cliente y del sistema, "Pedido recibido", sistema sin nombre, lo que el comercio nunca vio y paginacion)';

const v = (clave) => `ab_${clave}`;

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
          apellido: 'Actividad',
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

const productoCuerpo = (nombre, precio) => `{"nombre": "${nombre}", "descripcion": "Descripcion A2b", "precio": ${precio}, "categoriaId": ${CAT}}`;

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
  "pm.environment.set('ab_ahora', ahora.toISOString().slice(0, 19));",
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
        razonSocial: 'Actividad A2b SRL',
        cuit: `{{${v('cuit_tmp')}}}`,
        condicionIva: 'RESPONSABLE_INSCRIPTO',
        tipoSociedad: 'SRL',
        domicilioFiscal: 'Direccion fiscal A2b 100',
        fechaInicioActividades: '2020-01-01',
        nombre: 'Local Actividad A2b',
        descripcion: 'Comercio generado por la coleccion de Postman (actividad con pedidos, E3 A2b)',
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
        redesSociales: [{ tipo: 'INSTAGRAM', url: 'instagram.com/actividada2b' }],
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
    [guardar(v('cat_nombre'), "'Cat Actividad A2b ' + Date.now().toString(36)")],
  ),
  item('El Dueño crea el producto con el que compran los Clientes', req('POST', '/productos', { token: TOKEN_DUENO, comercio: COM, rawBody: productoCuerpo('Producto Actividad A2b', 10000) }), [
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

agregar(
  ...crearPedido('sinpagar'),
  actividadDelPedido('Sin pagar: el pedido todavia no aparece en la actividad (el comercio no lo vio)', 'sinpagar', [sinFilas]),
  pagar('sinpagar'),
  actividadDelPedido('Pagado: aparece "Pedido recibido" del sistema, sin nombre ni usuario', 'sinpagar', [
    textos('Pedido recibido'),
    roles('SISTEMA'),
    sistemaSinNombre(0),
    "pm.test('El codigo estable es el estado destino y la entidad es el pedido', () => { pm.expect(mios[0].accion).to.eql('PENDIENTE_CONFIRMACION_COMERCIO'); pm.expect(mios[0].entidadNombre).to.eql('Pedido #' + pm.environment.get('ab_ped_sinpagar')); pm.expect(mios[0].fuente).to.eql('PEDIDO'); });",
  ]),
  ...crearPedido('ciclo'),
  pagar('ciclo'),
  accionPedido('Ciclo: la Empleada acepta el pedido', TOKEN_EMPLEADO, 'ciclo', 'aceptar'),
  accionPedido('Ciclo: el Dueño lo deja listo para retirar', TOKEN_DUENO, 'ciclo', 'despachar'),
  accionPedido('Ciclo: la Empleada lo marca como entregado', TOKEN_EMPLEADO, 'ciclo', 'entregar'),
  actividadDelPedido('Ciclo: aparece completo, del mas nuevo al mas viejo, con el rol de cada actor', 'ciclo', [
    textos('Marcó un pedido como entregado', 'Dejó un pedido listo para retirar', 'Aceptó un pedido', 'Pedido recibido'),
    roles('EMPLEADO', 'DUENO', 'EMPLEADO', 'SISTEMA'),
    "pm.test('Las filas de personas traen su nombre completo y su usuario', () => { mios.slice(0, 3).forEach((f) => { pm.expect(f.actorNombre).to.be.a('string').and.not.empty; pm.expect(f.actorUsuarioId).to.be.a('number'); }); pm.expect(mios[0].actorUsuarioId).to.eql(Number(pm.environment.get('ab_e_id'))); pm.expect(mios[1].actorUsuarioId).to.eql(Number(pm.environment.get('ab_d_id'))); });",
    sistemaSinNombre(3),
  ]),
  ...crearPedido('cancela'),
  pagar('cancela'),
  item('Cancelacion: la Compradora cancela el pedido', req('PUT', `/pedidos/cliente/${P('cancela')}/cancelar`, { token: TOKEN_COMPRADOR, body: {} }), [status(200)]),
  actividadDelPedido('Cancelacion: aparece como accion del Cliente con su nombre completo', 'cancela', [
    textos('Canceló un pedido', 'Pedido recibido'),
    roles('CLIENTE', 'SISTEMA'),
    "pm.test('La fila del Cliente trae su nombre completo, su usuario y el rol en texto', () => { const f = mios[0]; pm.expect(f.actorNombre).to.eql(pm.environment.get('ab_c_nombre_completo')); pm.expect(f.actorUsuarioId).to.eql(Number(pm.environment.get('ab_c_id'))); pm.expect(f.actorRolTexto).to.eql('Cliente'); });",
  ]),
  ...crearPedido('domicilio', 'DOMICILIO'),
  pagar('domicilio'),
  accionPedido('Entrega: el Dueño acepta el pedido a domicilio', TOKEN_DUENO, 'domicilio', 'aceptar'),
  accionPedido('Entrega: el Dueño lo despacha', TOKEN_DUENO, 'domicilio', 'despachar'),
  item('Entrega: la Compradora confirma la recepcion', req('PUT', `/pedidos/cliente/${P('domicilio')}/entregar`, { token: TOKEN_COMPRADOR, body: {} }), [status(200)]),
  actividadDelPedido('Entrega: la confirmacion del Cliente aparece con su nombre', 'domicilio', [
    textos('Confirmó la recepción de un pedido', 'Despachó un pedido', 'Aceptó un pedido', 'Pedido recibido'),
    roles('CLIENTE', 'DUENO', 'DUENO', 'SISTEMA'),
  ]),
  ...crearPedido('auto', 'DOMICILIO'),
  pagar('auto'),
  accionPedido('Autoconfirmacion: el Dueño acepta el pedido a domicilio', TOKEN_DUENO, 'auto', 'aceptar'),
  accionPedido('Autoconfirmacion: el Dueño lo despacha', TOKEN_DUENO, 'auto', 'despachar'),
  item('Autoconfirmacion: el proceso automatico, dos horas despues, lo da por entregado', req('POST', '/test/jobs/pedidos/avisar-y-autoconfirmar', { body: {}, query: 'ahora={{ab_ahora}}' }), [status(200)], ahoraMas(120)),
  actividadDelPedido('Autoconfirmacion: aparece como accion del sistema, sin nombre', 'auto', [
    textos('Confirmó automáticamente la entrega de un pedido', 'Despachó un pedido', 'Aceptó un pedido', 'Pedido recibido'),
    roles('SISTEMA', 'DUENO', 'DUENO', 'SISTEMA'),
    sistemaSinNombre(0),
  ]),
  ...crearPedido('vence'),
  pagar('vence'),
  item('Vencimiento: el proceso automatico, 45 minutos despues, lo da por vencido', req('POST', '/test/jobs/pedidos/expirar-sin-respuesta', { body: {}, query: 'ahora={{ab_ahora}}' }), [status(200)], ahoraMas(45)),
  actividadDelPedido('Vencimiento: aparece como accion del sistema', 'vence', [
    textos('Venció un pedido sin respuesta del comercio', 'Pedido recibido'),
    roles('SISTEMA', 'SISTEMA'),
    sistemaSinNombre(0),
  ]),
  ...crearPedido('nopago'),
  item('Falta de pago: el proceso automatico, 45 minutos despues, cancela el pedido que nunca se pago', req('POST', '/test/jobs/pedidos/expirar-pagos', { body: {}, query: 'ahora={{ab_ahora}}' }), [status(200)], ahoraMas(45)),
  item('Falta de pago: el pedido figura cancelado por el sistema para su Cliente', req('GET', '/pedidos/cliente', { token: TOKEN_COMPRADOR }), [
    status(200),
    "const p = pm.response.json().data.find((x) => x.id === Number(pm.environment.get('ab_ped_nopago')));",
    "pm.test('Cancelado por el sistema', () => pm.expect(p.estado).to.eql('CANCELADO_POR_SISTEMA'));",
  ]),
  actividadDelPedido('Falta de pago: el comercio nunca lo vio, no hay ninguna fila en la actividad', 'nopago', [sinFilas]),
);

agregar(
  item('Suspension: el Dueño tiene un segundo comercio (clon en APTO_VENTA)', req('POST', `/test/comercios/${COM}/clonar`, { body: {}, query: 'nombre=Clon Actividad A2b&estado=APTO_VENTA' }), [
    status(201),
    guardar(v('clon'), 'pm.response.json().data'),
  ]),
  item('Suspension: el Dueño crea el producto del segundo comercio', req('POST', '/productos', { token: TOKEN_DUENO, comercio: CLON, rawBody: productoCuerpo('Producto Clon A2b', 9000) }), [
    status(201),
    guardar(v('prodClon'), 'pm.response.json().data.id'),
  ]),
  ...crearPedido('suspendido', 'RETIRO', 'prodClon'),
  pagar('suspendido'),
  item('Suspension: el Dueño acepta el pedido del segundo comercio', req('PUT', `/pedidos/comercio/${P('suspendido')}/aceptar`, { token: TOKEN_DUENO, comercio: CLON, body: {} }), [status(200)]),
  item('Suspension: el Administrador suspende el segundo comercio', req('PUT', `/administrador/comercios/${CLON}/suspender`, { token: 'token_admin', body: { motivo: 'Prueba de la actividad A2b' } }), [status(200)]),
  actividadDelPedido('Suspension: el segundo comercio ve la cancelacion como accion del sistema', 'suspendido', [
    textos('Canceló un pedido por la suspensión del comercio', 'Aceptó un pedido', 'Pedido recibido'),
    roles('SISTEMA', 'DUENO', 'SISTEMA'),
    sistemaSinNombre(0),
  ], { comercio: CLON }),
  actividadDelPedido('Suspension: el primer comercio no ve nada de ese pedido', 'suspendido', [sinFilas]),
);

agregar(
  item('Cierre: el Dueño cierra el comercio a mano (aparece una fila de cierre en la actividad)', req('PUT', '/comercios/cerrar', { token: TOKEN_DUENO, comercio: COM, body: {} }), [status(200)]),
  item('Cierre: el Dueño vuelve a abrir el comercio', req('PUT', '/comercios/abrir', { token: TOKEN_DUENO, comercio: COM, body: {} }), [status(200)]),
  item('Orden: la lista completa viene del mas nuevo al mas viejo, sin repetidos', req('GET', '/comercios/equipo/actividad', { token: TOKEN_DUENO, comercio: COM, query: 'limite=100' }), [
    status(200),
    "const items = pm.response.json().data.items;",
    "pm.test('Hay filas de las tres fuentes', () => { const fuentes = new Set(items.map((i) => i.fuente)); pm.expect(fuentes.has('PEDIDO')).to.eql(true); pm.expect(fuentes.has('EDICION')).to.eql(true); });",
    "pm.test('Las horas no suben nunca', () => { for (let i = 1; i < items.length; i += 1) pm.expect(new Date(items[i - 1].fechaHora).getTime()).to.be.at.least(new Date(items[i].fechaHora).getTime()); });",
    "pm.test('Ningun identificador se repite', () => pm.expect(new Set(items.map((i) => i.id)).size).to.eql(items.length));",
    guardar(v('total'), 'items.length'),
    guardar(v('ids'), "JSON.stringify(items.map((i) => i.id))"),
  ]),
  item('Paginacion: la primera pagina de 4 trae el cursor', req('GET', '/comercios/equipo/actividad', { token: TOKEN_DUENO, comercio: COM, query: 'limite=4' }), [
    status(200),
    "pm.test('Trae 4 filas y hay mas', () => { const d = pm.response.json().data; pm.expect(d.items).to.have.length(4); pm.expect(d.hayMas).to.eql(true); pm.expect(d.siguienteCursor).to.be.a('string'); });",
    guardar(v('cursor'), 'pm.response.json().data.siguienteCursor'),
    guardar(v('pag'), 'JSON.stringify(pm.response.json().data.items.map((i) => i.id))'),
  ]),
  item('Paginacion: la segunda pagina sigue donde terminó la primera, sin repetir', req('GET', '/comercios/equipo/actividad', { token: TOKEN_DUENO, comercio: COM, query: 'limite=4&cursor={{ab_cursor}}' }), [
    status(200),
    "const primera = JSON.parse(pm.environment.get('ab_pag'));",
    "const segunda = pm.response.json().data.items.map((i) => i.id);",
    "const completa = JSON.parse(pm.environment.get('ab_ids'));",
    "pm.test('Primera y segunda pagina son las primeras 8 de la lista completa', () => pm.expect(primera.concat(segunda)).to.eql(completa.slice(0, primera.length + segunda.length)));",
  ]),
  item('Paginacion: un cursor que no se entiende es 400', req('GET', '/comercios/equipo/actividad', { token: TOKEN_DUENO, comercio: COM, query: 'limite=4&cursor=basura' }), [status(400)]),
  ...['PEDIDO', 'EDICION', 'CIERRE'].map((fuente) =>
    item(`Filtro: fuente=${fuente} devuelve solo esa fuente, en el mismo orden que la lista completa`, req('GET', '/comercios/equipo/actividad', { token: TOKEN_DUENO, comercio: COM, query: `limite=100&fuente=${fuente}` }), [
      status(200),
      "const items = pm.response.json().data.items;",
      `const completa = JSON.parse(pm.environment.get('ab_ids')).filter((id) => id.startsWith('${fuente}-'));`,
      `pm.test('Todas son ${fuente}', () => pm.expect(items.every((i) => i.fuente === '${fuente}')).to.eql(true));`,
      "pm.test('Mismos identificadores y mismo orden que la lista completa filtrada', () => pm.expect(items.map((i) => i.id)).to.eql(completa));",
      `pm.test('Hay al menos una fila de ${fuente}', () => pm.expect(items.length).to.be.above(0));`,
      "pm.test('No hay mas paginas', () => pm.expect(pm.response.json().data.hayMas).to.eql(false));",
    ]),
  ),
  item('Filtro: fuente vacia equivale a no filtrar', req('GET', '/comercios/equipo/actividad', { token: TOKEN_DUENO, comercio: COM, query: 'limite=100&fuente=' }), [
    status(200),
    "pm.test('Misma lista que sin filtro', () => pm.expect(pm.response.json().data.items.map((i) => i.id)).to.eql(JSON.parse(pm.environment.get('ab_ids'))));",
  ]),
  item('Filtro: una fuente que no es de la lista es 400', req('GET', '/comercios/equipo/actividad', { token: TOKEN_DUENO, comercio: COM, query: 'limite=10&fuente=basura' }), [
    status(400),
    "pm.test('Dice cuales son las fuentes validas', () => pm.expect(pm.response.json().mensaje).to.eql('La fuente tiene que ser PEDIDO, EDICION, CIERRE o EQUIPO'));",
  ]),
  item('Filtro: paginacion con fuente, primera pagina de 2', req('GET', '/comercios/equipo/actividad', { token: TOKEN_DUENO, comercio: COM, query: 'limite=2&fuente=PEDIDO' }), [
    status(200),
    "const d = pm.response.json().data;",
    "pm.test('Trae 2 pedidos y hay mas', () => { pm.expect(d.items).to.have.length(2); pm.expect(d.hayMas).to.eql(true); pm.expect(d.items.every((i) => i.fuente === 'PEDIDO')).to.eql(true); });",
    guardar(v('cursorF'), 'd.siguienteCursor'),
    guardar(v('pagF'), 'JSON.stringify(d.items.map((i) => i.id))'),
  ]),
  item('Filtro: la segunda pagina con fuente sigue donde terminó la primera, sin repetir ni mezclar fuentes', req('GET', '/comercios/equipo/actividad', { token: TOKEN_DUENO, comercio: COM, query: 'limite=2&fuente=PEDIDO&cursor={{ab_cursorF}}' }), [
    status(200),
    "const primera = JSON.parse(pm.environment.get('ab_pagF'));",
    "const items = pm.response.json().data.items;",
    "const completa = JSON.parse(pm.environment.get('ab_ids')).filter((id) => id.startsWith('PEDIDO-'));",
    "pm.test('Todas son PEDIDO', () => pm.expect(items.every((i) => i.fuente === 'PEDIDO')).to.eql(true));",
    "pm.test('Continua la lista filtrada', () => pm.expect(primera.concat(items.map((i) => i.id))).to.eql(completa.slice(0, primera.length + items.length)));",
  ]),
  item('Filtro: un cursor tomado sin filtro tambien sirve con filtro (no se repite ni se salta ningun pedido)', req('GET', '/comercios/equipo/actividad', { token: TOKEN_DUENO, comercio: COM, query: 'limite=100&fuente=PEDIDO&cursor={{ab_cursor}}' }), [
    status(200),
    "const completa = JSON.parse(pm.environment.get('ab_ids'));",
    "const primera = JSON.parse(pm.environment.get('ab_pag'));",
    "const ultimo = primera[primera.length - 1];",
    "const esperado = completa.slice(completa.indexOf(ultimo) + 1).filter((id) => id.startsWith('PEDIDO-'));",
    "pm.test('Son los pedidos que vienen despues de la primera pagina', () => pm.expect(pm.response.json().data.items.map((i) => i.id)).to.eql(esperado));",
  ]),
  item('Autorizacion: la Empleada sigue sin ver la actividad', req('GET', '/comercios/equipo/actividad', { token: TOKEN_EMPLEADO, comercio: COM, query: 'limite=10' }), [status(403)]),
  item('Autorizacion: la Compradora tampoco', req('GET', '/comercios/equipo/actividad', { token: TOKEN_COMPRADOR, comercio: COM, query: 'limite=10' }), [status(403)]),
  item('Autorizacion: sin token es 401', req('GET', '/comercios/equipo/actividad', { comercio: COM, query: 'limite=10' }), [status(401)]),
);

const carpeta = { name: NOMBRE_CARPETA, item: items };
const collection = JSON.parse(fs.readFileSync(collectionPath, 'utf8'));
const idx = collection.item.findIndex((f) => f.name.startsWith(PREFIJO_CARPETA));
if (idx >= 0) {
  collection.item[idx] = carpeta;
} else {
  collection.item.push(carpeta);
}
fs.writeFileSync(collectionPath, JSON.stringify(collection, null, 2) + '\n', 'utf8');

const environment = JSON.parse(fs.readFileSync(environmentPath, 'utf8'));
const claves = ['com', 'clon', 'cat', 'cat_nombre', 'prodD', 'prodClon', 'inv_codigo', 'cuit_tmp', 'dni_rep_tmp', 'ahora', 'total', 'ids', 'cursor', 'pag', 'cursorF', 'pagF',
  'd_email', 'd_usuario', 'd_password', 'd_dni', 'd_codigo', 'd_token', 'd_id',
  'e_email', 'e_usuario', 'e_password', 'e_dni', 'e_codigo', 'e_token', 'e_id',
  'c_email', 'c_usuario', 'c_password', 'c_dni', 'c_codigo', 'c_token', 'c_id', 'c_dir', 'c_nombre_completo',
  'ped_sinpagar', 'ped_ciclo', 'ped_cancela', 'ped_domicilio', 'ped_auto', 'ped_vence', 'ped_nopago', 'ped_suspendido'].map(v);
const existentes = new Set(environment.values.map((x) => x.key));
for (const key of claves) {
  if (!existentes.has(key)) environment.values.push({ key, value: '', type: 'default', enabled: true });
}
fs.writeFileSync(environmentPath, JSON.stringify(environment, null, 2) + '\n', 'utf8');

console.log(`OK: carpeta "${NOMBRE_CARPETA.slice(0, 40)}..." con ${items.length} requests.`);
