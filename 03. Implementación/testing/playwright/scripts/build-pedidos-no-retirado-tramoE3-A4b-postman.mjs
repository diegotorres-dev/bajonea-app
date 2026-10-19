import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const collectionPath = path.resolve(__dirname, '../../../postman/Bajonea-MVP.postman_collection.json');
const environmentPath = path.resolve(__dirname, '../../../postman/Bajonea-Local.postman_environment.json');

const PREFIJO_CARPETA = '64 - ';
const NOMBRE_CARPETA = '64 - Cerrar un retiro como no retirado E3 A4b (espera minima de 60 minutos, solo desde listo para retirar, Dueño y Empleado, pedido propio, aviso T36 solo al Cliente, sin reembolso, comercio suspendido y proceso automatico, facturado hoy, autorizacion)';

const v = (clave) => `nr_${clave}`;

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
    guardar(v(`${clave}_email`), `'nr.${clave}.' + s + '@bajonea.test'`),
    guardar(v(`${clave}_usuario`), `('nr${clave}' + s).slice(0, 20)`),
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
const TOKEN_EMPLEADO2 = v('f_token');
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
          apellido: 'Trazabilidad',
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

const productoCuerpo = (nombre, precio) => `{"nombre": "${nombre}", "descripcion": "Descripcion A3", "precio": ${precio}, "categoriaId": ${CAT}}`;

function crearPedido(clave, comprador = TOKEN_COMPRADOR, producto = 'prodD') {
  return [
    item(`[pedido ${clave}] El Cliente vacia el carrito`, req('DELETE', '/carrito', { token: comprador }), [`pm.test('Carrito vaciado o ya vacio', () => pm.expect([200, 404]).to.include(pm.response.code));`]),
    item(`[pedido ${clave}] El Cliente agrega el producto al carrito`, req('POST', '/carrito/items', { token: comprador, rawBody: `{"productoId": {{${v(producto)}}}, "cantidad": 1}` }), [status(201)]),
    item(
      `[pedido ${clave}] El Cliente confirma el pedido (retiro en el local)`,
      req('POST', '/pedidos/cliente', { token: comprador, rawBody: '{"tipoEntrega": "RETIRO", "direccionId": null}' }),
      [status(201), guardar(v(`ped_${clave}`), 'pm.response.json().data.id')],
    ),
    item(`[pedido ${clave}] Atajo de test: el pago queda aprobado y registrado`, req('PUT', `/test/pedidos/${P(clave)}/pago-aprobado`, { body: {}, query: 'registrarPago=true' }), [status(200)]),
  ];
}

agregar(
  item('Login Administrador (sesion propia de esta carpeta)', req('POST', '/auth/login', { body: { nombreUsuario: '{{admin_usuario}}', password: '{{admin_password}}' } }), [
    status(200),
    guardar('token_admin', 'pm.response.json().data.token'),
  ]),
  item(
    'Registro Dueño (con retiro en el local)',
    req('POST', '/auth/registro/comercio', {
      body: {
        aceptaTerminos: true,
        razonSocial: 'No Retirado A4b SRL',
        cuit: `{{${v('cuit_tmp')}}}`,
        condicionIva: 'RESPONSABLE_INSCRIPTO',
        tipoSociedad: 'SRL',
        domicilioFiscal: 'Direccion fiscal A4b 100',
        fechaInicioActividades: '2020-01-01',
        nombre: 'Local No Retirado A4b',
        descripcion: 'Comercio generado por la coleccion de Postman (cierre como no retirado, E3 A4b)',
        telefono: '+5492964555446',
        tipoComercio: 'RESTAURANTE',
        aceptaDelivery: true,
        aceptaRetiro: true,
        nombreUsuario: `{{${v('d_usuario')}}}`,
        email: `{{${v('d_email')}}}`,
        password: `{{${v('d_password')}}}`,
        direccion: { calle: 'Belgrano', numero: '802', pisoDepto: null, codigoPostal: '9420', localidadId: '{{localidad_id}}', principal: false },
        horarios: horariosTodosLosDias,
        nombreRepresentante: 'Carlos',
        apellidoRepresentante: 'Sanchez',
        dniRepresentante: `{{${v('dni_rep_tmp')}}}`,
        telefonoRepresentante: '+5492964701105',
        fechaNacimientoRepresentante: '1988-04-04',
        fotoPerfilUrl: 'https://res.cloudinary.com/demo/image/upload/postman-no-retirado-a4b.jpg',
        redesSociales: [{ tipo: 'INSTAGRAM', url: 'instagram.com/noretiradoa4b' }],
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
    [guardar(v('cat_nombre'), "'Cat No Retirado A4b ' + Date.now().toString(36)")],
  ),
  item('El Dueño crea el producto con el que compran los Clientes', req('POST', '/productos', { token: TOKEN_DUENO, comercio: COM, rawBody: productoCuerpo('Producto No Retirado A4b', 10000) }), [
    status(201),
    guardar(v('prodD'), 'pm.response.json().data.id'),
  ]),
  ...clienteNuevo('c', 'Carla'),
  loginDe('c', 'Carla (Compradora)', TOKEN_COMPRADOR),
  ...clienteNuevo('e', 'Elena'),
  ...empleadoAlEquipo('e', 'Elena'),
  loginDe('e', 'Elena (Empleada)', TOKEN_EMPLEADO),
  ...clienteNuevo('f', 'Fabiana'),
  ...empleadoAlEquipo('f', 'Fabiana'),
  loginDe('f', 'Fabiana (Empleada)', TOKEN_EMPLEADO2),
  item('Se arman los nombres completos de las personas', req('GET', '/clientes/perfil', { token: TOKEN_EMPLEADO }), [
    status(200),
    guardar(v('e_nombre'), "pm.response.json().data.nombre + ' ' + pm.response.json().data.apellido"),
  ]),
  item('Nombre completo de Fabiana', req('GET', '/clientes/perfil', { token: TOKEN_EMPLEADO2 }), [
    status(200),
    guardar(v('f_nombre'), "pm.response.json().data.nombre + ' ' + pm.response.json().data.apellido"),
  ]),
  item('Nombre completo de Carla', req('GET', '/clientes/perfil', { token: TOKEN_COMPRADOR }), [
    status(200),
    guardar(v('c_nombre'), "pm.response.json().data.nombre + ' ' + pm.response.json().data.apellido"),
  ]),
);

const MENSAJE_PROPIO = 'No podés gestionar tus propios pedidos';
const T36 = (id) => `'Tu pedido #' + ${id} + ' no fue retirado y el comercio lo cerró. Como ya estaba preparado, no hay devolución del pago.'`;

const accion = (nombre, token, clave, ruta, codigo = 200, cuerpo = {}, comprobaciones = [], comercio = COM) =>
  item(nombre, req('PUT', `/pedidos/comercio/${P(clave)}/${ruta}`, { token, comercio, body: cuerpo }), [status(codigo), ...comprobaciones]);

const cerrar = (nombre, token, clave, codigo = 200, comprobaciones = [], comercio = COM) =>
  accion(nombre, token, clave, 'no-retirado', codigo, {}, comprobaciones, comercio);

const envejecer = (clave, minutos) =>
  item(`[pedido ${clave}] Atajo de test: el pedido quedo listo hace ${minutos} minutos mas`, req('PUT', `/test/pedidos/${P(clave)}/envejecer-listo`, { body: {}, query: `minutos=${minutos}` }), [status(200)]);

function pedidoListo(clave, comprador, minutos) {
  return [
    ...crearPedido(clave, comprador),
    accion(`[pedido ${clave}] El Dueño acepta el pedido`, TOKEN_DUENO, clave, 'aceptar'),
    accion(`[pedido ${clave}] El Dueño lo deja listo para retirar`, TOKEN_DUENO, clave, 'despachar', 200, {}, [
      "pm.test('Queda LISTO_PARA_RETIRAR', () => pm.expect(pm.response.json().data.estado).to.eql('LISTO_PARA_RETIRAR'));",
    ]),
    envejecer(clave, minutos),
  ];
}

const estadoDelCliente = (nombre, clave, esperado, token = TOKEN_COMPRADOR) =>
  item(nombre, req('GET', '/pedidos/cliente', { token }), [
    status(200),
    `const p = pm.response.json().data.find((x) => x.id === Number(${entorno(v(`ped_${clave}`))}));`,
    `pm.test('El Cliente ve el pedido en ${esperado}', () => pm.expect(p.estado).to.eql('${esperado}'));`,
    "pm.test('Sin reembolso para el Cliente', () => pm.expect(p.reembolsoEstado === undefined || p.reembolsoEstado === null).to.eql(true));",
    "pm.test('Sin fuente de entrega ni fecha de entrega', () => { pm.expect(p.fuenteEntrega === undefined || p.fuenteEntrega === null).to.eql(true); pm.expect(p.fechaEntrega === undefined || p.fechaEntrega === null).to.eql(true); });",
  ]);

const avisosDelCliente = (nombre, clave, cantidadT36, token = TOKEN_COMPRADOR) =>
  item(nombre, req('GET', '/notificaciones', { token }), [
    status(200),
    `const id = Number(${entorno(v(`ped_${clave}`))});`,
    'const suyos = pm.response.json().data.filter((n) => n.entidadId === id);',
    `pm.test('Hay ${cantidadT36} aviso(s) T36 con el texto aprobado', () => pm.expect(suyos.filter((n) => n.mensaje === ${T36('id')}).length).to.eql(${cantidadT36}));`,
    "pm.test('No hay aviso del viejo cierre por timer de suspension', () => pm.expect(suyos.filter((n) => n.mensaje.indexOf('se cerró automáticamente') >= 0).length).to.eql(0));",
  ]);

const traza = (nombre, token, clave, codigo, comprobaciones = []) =>
  item(nombre, req('GET', `/pedidos/comercio/${P(clave)}/trazabilidad`, { token, comercio: COM }), [status(codigo), ...comprobaciones]);

const resumen = (nombre, token, variable) =>
  item(nombre, req('GET', '/pedidos/comercio/resumen-hoy', { token, comercio: COM }), [
    status(200),
    guardar(v(variable), 'pm.response.json().data.totalFacturadoHoy'),
  ]);

agregar(
  ...pedidoListo('espera', TOKEN_COMPRADOR, 45),
  cerrar('Espera: el Dueño intenta cerrar a los 45 minutos y recibe 409 RETIRO_EN_ESPERA', TOKEN_DUENO, 'espera', 409, [
    "pm.test('Trae el codigo, los minutos que faltan y desde cuando', () => { const r = pm.response.json(); pm.expect(r.data.codigo).to.eql('RETIRO_EN_ESPERA'); pm.expect(r.data.minutosRestantes).to.be.within(14, 15); pm.expect(r.data.disponibleDesde).to.be.a('string'); });",
    "pm.test('El mensaje dice cuantos minutos faltan', () => pm.expect(pm.response.json().mensaje).to.match(/^Todavía no podés cerrar este pedido como no retirado\\. Esperá 1[45] minutos más \\(desde las \\d\\d:\\d\\d\\)\\.$/));",
  ]),
  cerrar('Espera: la Empleada tampoco puede antes de tiempo', TOKEN_EMPLEADO, 'espera', 409, [
    "pm.test('Es RETIRO_EN_ESPERA', () => pm.expect(pm.response.json().data.codigo).to.eql('RETIRO_EN_ESPERA'));",
  ]),
  item('Espera: el pedido sigue listo para retirar', req('GET', '/pedidos/comercio', { token: TOKEN_DUENO, comercio: COM }), [
    status(200),
    `const p = pm.response.json().data.find((x) => x.id === Number(${entorno(v('ped_espera'))}));`,
    "pm.test('Sigue en LISTO_PARA_RETIRAR', () => pm.expect(p.estado).to.eql('LISTO_PARA_RETIRAR'));",
    "pm.test('Informa cuando se habilita el cierre: 14 o 15 minutos y la hora', () => { pm.expect(p.noRetiradoMinutosRestantes).to.be.within(14, 15); pm.expect(p.noRetiradoDisponibleDesde).to.be.a('string'); });",
  ]),
  item('Espera: la lista de la Empleada trae la misma espera', req('GET', '/pedidos/comercio', { token: TOKEN_EMPLEADO, comercio: COM }), [
    status(200),
    `const p = pm.response.json().data.find((x) => x.id === Number(${entorno(v('ped_espera'))}));`,
    "pm.test('La Empleada ve 14 o 15 minutos y la hora', () => { pm.expect(p.noRetiradoMinutosRestantes).to.be.within(14, 15); pm.expect(p.noRetiradoDisponibleDesde).to.be.a('string'); });",
  ]),
  item('Espera: el Cliente nunca recibe los campos de la espera', req('GET', '/pedidos/cliente', { token: TOKEN_COMPRADOR }), [
    status(200),
    `const p = pm.response.json().data.find((x) => x.id === Number(${entorno(v('ped_espera'))}));`,
    "pm.test('Los campos de la espera vienen en null para el Cliente', () => { pm.expect(p.noRetiradoMinutosRestantes === undefined || p.noRetiradoMinutosRestantes === null).to.eql(true); pm.expect(p.noRetiradoDisponibleDesde === undefined || p.noRetiradoDisponibleDesde === null).to.eql(true); });",
  ]),
  avisosDelCliente('Espera: el Cliente no recibio ningun aviso de no retirado', 'espera', 0),
  resumen('Facturado: lo que ve el Dueño antes de cerrar', TOKEN_DUENO, 'fact_dueno_antes'),
  resumen('Facturado: lo que ve la Empleada antes de cerrar', TOKEN_EMPLEADO, 'fact_emp_antes'),
  envejecer('espera', 20),
  item('Espera cumplida: la lista informa 0 minutos', req('GET', '/pedidos/comercio', { token: TOKEN_DUENO, comercio: COM }), [
    status(200),
    `const p = pm.response.json().data.find((x) => x.id === Number(${entorno(v('ped_espera'))}));`,
    "pm.test('Faltan 0 minutos y sigue la hora de habilitacion', () => { pm.expect(p.noRetiradoMinutosRestantes).to.eql(0); pm.expect(p.noRetiradoDisponibleDesde).to.be.a('string'); });",
  ]),
  cerrar('Cierre del Dueño: pasados los 60 minutos cierra el pedido como no retirado', TOKEN_DUENO, 'espera', 200, [
    "pm.test('Mensaje y estado', () => { const r = pm.response.json(); pm.expect(r.mensaje).to.eql('Pedido cerrado como no retirado'); pm.expect(r.data.estado).to.eql('NO_RETIRADO'); });",
    "pm.test('Sin fuente de entrega ni fecha de entrega', () => { const d = pm.response.json().data; pm.expect(d.fuenteEntrega === undefined || d.fuenteEntrega === null).to.eql(true); pm.expect(d.fechaEntrega === undefined || d.fechaEntrega === null).to.eql(true); });",
    "pm.test('El Dueño recibe el pedido completo, sin la marca de pedido propio', () => { const d = pm.response.json().data; pm.expect(d).to.have.property('cargoServicioComercio'); pm.expect(d).to.not.have.property('esPedidoPropio'); });",
  ]),
  cerrar('Cierre doble: cerrar de nuevo da 409', TOKEN_EMPLEADO, 'espera', 409),
  accion('Cierre doble: entregar un pedido ya no retirado da 409', TOKEN_DUENO, 'espera', 'entregar', 409, {}, [
    "pm.test('El pedido ya fue resuelto', () => pm.expect(pm.response.json().mensaje).to.eql('El pedido ya fue resuelto'));",
  ]),
  estadoDelCliente('Cliente: ve el pedido como NO_RETIRADO, sin reembolso', 'espera', 'NO_RETIRADO'),
  avisosDelCliente('Cliente: recibio un solo aviso T36 con el texto aprobado', 'espera', 1),
  item('Cliente: el aviso no dice quien lo cerro', req('GET', '/notificaciones', { token: TOKEN_COMPRADOR }), [
    status(200),
    "pm.test('Ni el nombre del Dueño aparece', () => pm.expect(JSON.stringify(pm.response.json())).to.not.match(/Carlos Sanchez/));",
  ]),
  item('Equipo: el Dueño no recibe copias del aviso T36', req('GET', '/notificaciones', { token: TOKEN_DUENO, comercio: COM }), [
    status(200),
    "pm.test('Ningun aviso del Dueño habla de un pedido no retirado', () => pm.expect(JSON.stringify(pm.response.json())).to.not.match(/no fue retirado/));",
  ]),
  resumen('Facturado: el Dueño despues de cerrar', TOKEN_DUENO, 'fact_dueno_despues'),
  resumen('Facturado: la Empleada despues de cerrar', TOKEN_EMPLEADO, 'fact_emp_despues'),
  item('Facturado: la cifra no cambia al pasar de listo a no retirado (neto para el Dueño, bruto para la Empleada)', req('GET', '/pedidos/comercio/resumen-hoy', { token: TOKEN_DUENO, comercio: COM }), [
    status(200),
    "pm.test('Dueño: misma cifra antes y despues', () => pm.expect(Number(pm.environment.get('nr_fact_dueno_despues'))).to.eql(Number(pm.environment.get('nr_fact_dueno_antes'))));",
    "pm.test('Empleada: misma cifra antes y despues', () => pm.expect(Number(pm.environment.get('nr_fact_emp_despues'))).to.eql(Number(pm.environment.get('nr_fact_emp_antes'))));",
    "pm.test('La cifra de la Empleada (bruta) supera a la del Dueño (neta)', () => pm.expect(Number(pm.environment.get('nr_fact_emp_despues'))).to.be.above(Number(pm.environment.get('nr_fact_dueno_despues'))));",
  ]),
  traza('Trazabilidad: el ultimo paso es el cierre como no retirado, del Dueño', TOKEN_EMPLEADO2, 'espera', 200, [
    'const pasos = pm.response.json().data.pasos;',
    "pm.test('El ultimo paso es NO_RETIRADO con su texto y su rol', () => { const u = pasos[pasos.length - 1]; pm.expect(u.estado).to.eql('NO_RETIRADO'); pm.expect(u.accionTexto).to.eql('Cerró el pedido como no retirado'); pm.expect(u.actorRolTexto).to.eql('Dueño'); });",
  ]),
  item('Actividad: la lista del Dueño muestra el cierre', req('GET', '/comercios/equipo/actividad', { token: TOKEN_DUENO, comercio: COM }), [
    status(200),
    "pm.test('El primer item es el cierre como no retirado', () => pm.expect(pm.response.json().data.items[0].accionTexto).to.eql('Cerró un pedido como no retirado'));",
  ]),
);

agregar(
  ...pedidoListo('emp', TOKEN_COMPRADOR, 90),
  cerrar('Empleada: Elena cierra y recibe el DTO reducido', TOKEN_EMPLEADO, 'emp', 200, [
    "pm.test('Estado y marca en false', () => { const d = pm.response.json().data; pm.expect(d.estado).to.eql('NO_RETIRADO'); pm.expect(d.esPedidoPropio).to.eql(false); });",
    "pm.test('Con el cargo del cliente y sin el del comercio, ni cliente ni estado de pago', () => { const d = pm.response.json().data; pm.expect(d).to.have.property('cargoServicioCliente'); ['clienteId', 'cargoServicioComercio', 'pagoEstado'].forEach((c) => pm.expect(d).to.not.have.property(c)); });",
  ]),
  traza('Empleada: la trazabilidad la muestra como actora del cierre', TOKEN_DUENO, 'emp', 200, [
    'const pasos = pm.response.json().data.pasos;',
    "pm.test('Rol Empleado y su nombre', () => { const u = pasos[pasos.length - 1]; pm.expect(u.actorRol).to.eql('EMPLEADO'); pm.expect(u.actorNombre).to.eql(pm.environment.get('nr_e_nombre')); });",
  ]),
  ...pedidoListo('propio', TOKEN_EMPLEADO, 90),
  cerrar('Propio: Elena no puede cerrar su propio pedido', TOKEN_EMPLEADO, 'propio', 409, [
    `pm.test('Es PEDIDO_PROPIO con su mensaje', () => { const r = pm.response.json(); pm.expect(r.data.codigo).to.eql('PEDIDO_PROPIO'); pm.expect(r.mensaje).to.eql('${MENSAJE_PROPIO}'); });`,
  ]),
  cerrar('Propio: Fabiana (otra Empleada) si puede cerrarlo', TOKEN_EMPLEADO2, 'propio', 200, [
    "pm.test('Queda NO_RETIRADO', () => pm.expect(pm.response.json().data.estado).to.eql('NO_RETIRADO'));",
  ]),
  estadoDelCliente('Propio: Elena, como Cliente, ve su pedido NO_RETIRADO', 'propio', 'NO_RETIRADO', TOKEN_EMPLEADO),
);

agregar(
  ...crearPedido('entregado'),
  cerrar('Estados: en PENDIENTE_CONFIRMACION_COMERCIO no se puede cerrar como no retirado', TOKEN_DUENO, 'entregado', 409, [
    "pm.test('Primero hay que aceptar el pedido', () => pm.expect(pm.response.json().mensaje).to.eql('Primero tenés que aceptar el pedido'));",
  ]),
  accion('Estados: se acepta el pedido', TOKEN_DUENO, 'entregado', 'aceptar'),
  cerrar('Estados: en EN_PREPARACION tampoco', TOKEN_DUENO, 'entregado', 409),
  accion('Estados: se lo deja listo para retirar', TOKEN_DUENO, 'entregado', 'despachar'),
  envejecer('entregado', 90),
  accion('Estados: el Dueño lo entrega', TOKEN_DUENO, 'entregado', 'entregar'),
  cerrar('Estados: un pedido entregado no se puede cerrar como no retirado', TOKEN_DUENO, 'entregado', 409),
  item('Estados: sigue ENTREGADO', req('GET', '/pedidos/comercio', { token: TOKEN_DUENO, comercio: COM }), [
    status(200),
    `const p = pm.response.json().data.find((x) => x.id === Number(${entorno(v('ped_entregado'))}));`,
    "pm.test('Sigue en ENTREGADO', () => pm.expect(p.estado).to.eql('ENTREGADO'));",
  ]),
  avisosDelCliente('Estados: el Cliente no recibio el aviso T36', 'entregado', 0),
  item('Atajo: un pedido inexistente responde 404', req('PUT', '/test/pedidos/99999999/envejecer-listo', { body: {}, query: 'minutos=5' }), [status(404)]),
);

agregar(
  ...pedidoListo('auth', TOKEN_COMPRADOR, 90),
  ...clienteNuevo('g', 'Gabriela'),
  loginDe('g', 'Gabriela (Cliente sin relacion)', v('g_token')),
  item('Autorizacion: Gabriela sin header recibe 400', req('PUT', `/pedidos/comercio/${P('auth')}/no-retirado`, { token: v('g_token'), body: {} }), [status(400)]),
  cerrar('Autorizacion: Gabriela con el header del comercio recibe el 404 COMERCIO_NO_DISPONIBLE', v('g_token'), 'auth', 404, [
    "pm.test('Codigo COMERCIO_NO_DISPONIBLE', () => pm.expect(pm.response.json().data.codigo).to.eql('COMERCIO_NO_DISPONIBLE'));",
  ]),
  item('Autorizacion: sin token es 401', req('PUT', `/pedidos/comercio/${P('auth')}/no-retirado`, { comercio: COM, body: {} }), [status(401)]),
  item('Autorizacion: el Administrador recibe 403', req('PUT', `/pedidos/comercio/${P('auth')}/no-retirado`, { token: 'token_admin', comercio: COM, body: {} }), [status(403)]),
  item('Segundo comercio del Dueño (clon en APTO_VENTA)', req('POST', `/test/comercios/${COM}/clonar`, { body: {}, query: 'nombre=Clon No Retirado A4b&estado=APTO_VENTA' }), [
    status(201),
    guardar(v('clon'), 'pm.response.json().data'),
  ]),
  cerrar('Autorizacion: Elena no tiene relacion con el segundo comercio, 404', TOKEN_EMPLEADO, 'auth', 404, [
    "pm.test('Codigo COMERCIO_NO_DISPONIBLE', () => pm.expect(pm.response.json().data.codigo).to.eql('COMERCIO_NO_DISPONIBLE'));",
  ], CLON),
  cerrar('Aislamiento: el Dueño usa el segundo comercio con un pedido del primero, 404', TOKEN_DUENO, 'auth', 404, [
    "pm.test('Pedido no encontrado', () => pm.expect(pm.response.json().mensaje).to.eql('Pedido no encontrado'));",
  ], CLON),
  item('Autorizacion: el pedido sigue listo para retirar despues de todos los intentos', req('GET', '/pedidos/comercio', { token: TOKEN_DUENO, comercio: COM }), [
    status(200),
    `const p = pm.response.json().data.find((x) => x.id === Number(${entorno(v('ped_auth'))}));`,
    "pm.test('Sigue en LISTO_PARA_RETIRAR', () => pm.expect(p.estado).to.eql('LISTO_PARA_RETIRAR'));",
  ]),
);

const calcularAhoraDelProceso = [
  'const local = new Date(Date.now() + 3 * 3600 * 1000 - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 19);',
  guardar(v('ahora_job'), 'local'),
];

agregar(
  ...pedidoListo('susp_manual', TOKEN_COMPRADOR, 90),
  ...pedidoListo('susp_auto', TOKEN_COMPRADOR, 1),
  item('Suspension: el Administrador suspende el comercio', req('PUT', `/administrador/comercios/${COM}/suspender`, { token: 'token_admin', body: { motivo: 'Suspension de prueba A4b' } }), [status(200)]),
  item('Suspension: los dos pedidos listos siguen en LISTO_PARA_RETIRAR (no se cancelan)', req('GET', '/pedidos/comercio', { token: TOKEN_DUENO, comercio: COM }), [
    status(200),
    `const a = pm.response.json().data.find((x) => x.id === Number(${entorno(v('ped_susp_manual'))}));`,
    `const b = pm.response.json().data.find((x) => x.id === Number(${entorno(v('ped_susp_auto'))}));`,
    "pm.test('Ninguno se cancelo', () => { pm.expect(a.estado).to.eql('LISTO_PARA_RETIRAR'); pm.expect(b.estado).to.eql('LISTO_PARA_RETIRAR'); });",
  ]),
  cerrar('Suspension: la Empleada cierra como no retirado con el comercio suspendido', TOKEN_EMPLEADO, 'susp_manual', 200, [
    "pm.test('Queda NO_RETIRADO', () => pm.expect(pm.response.json().data.estado).to.eql('NO_RETIRADO'));",
  ]),
  cerrar('Suspension: el pedido de hace 1 minuto todavia esta en espera para el cierre manual', TOKEN_EMPLEADO, 'susp_auto', 409, [
    "pm.test('Es RETIRO_EN_ESPERA', () => pm.expect(pm.response.json().data.codigo).to.eql('RETIRO_EN_ESPERA'));",
  ]),
  item('Proceso automatico: se dispara con una hora pasado el plazo del comercio suspendido', req('POST', '/test/jobs/pedidos/autoconfirmar-retiros', { body: {}, query: `ahora={{${v('ahora_job')}}}` }), [status(200)], calcularAhoraDelProceso),
  estadoDelCliente('Proceso automatico: el Cliente ve el pedido NO_RETIRADO (no ENTREGADO), sin reembolso', 'susp_auto', 'NO_RETIRADO'),
  avisosDelCliente('Proceso automatico: el Cliente recibio el mismo aviso T36 y no el viejo aviso del cierre por timer', 'susp_auto', 1),
  traza('Proceso automatico: la trazabilidad muestra al sistema, sin nombre', TOKEN_DUENO, 'susp_auto', 200, [
    'const pasos = pm.response.json().data.pasos;',
    "pm.test('Ultimo paso del sistema, sin nombre, con su texto', () => { const u = pasos[pasos.length - 1]; pm.expect(u.estado).to.eql('NO_RETIRADO'); pm.expect(u.actorRol).to.eql('SISTEMA'); pm.expect(u.actorNombre).to.eql(null); pm.expect(u.accionTexto).to.eql('Cerró automáticamente el pedido como no retirado (comercio suspendido)'); });",
  ]),
  item('Proceso automatico: repetirlo no escribe nada nuevo', req('POST', '/test/jobs/pedidos/autoconfirmar-retiros', { body: {}, query: `ahora={{${v('ahora_job')}}}` }), [status(200)]),
  avisosDelCliente('Proceso automatico: sigue habiendo un solo aviso T36', 'susp_auto', 1),
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
const claves = ['com', 'clon', 'cat', 'cat_nombre', 'prodD', 'cuit_tmp', 'dni_rep_tmp', 'ahora_job',
  'fact_dueno_antes', 'fact_emp_antes', 'fact_dueno_despues', 'fact_emp_despues',
  'd_email', 'd_usuario', 'd_password', 'd_dni', 'd_codigo', 'd_token', 'd_id',
  'e_email', 'e_usuario', 'e_password', 'e_dni', 'e_codigo', 'e_token', 'e_id', 'e_inv_codigo', 'e_nombre',
  'f_email', 'f_usuario', 'f_password', 'f_dni', 'f_codigo', 'f_token', 'f_id', 'f_inv_codigo', 'f_nombre',
  'c_email', 'c_usuario', 'c_password', 'c_dni', 'c_codigo', 'c_token', 'c_id', 'c_nombre',
  'g_email', 'g_usuario', 'g_password', 'g_dni', 'g_codigo', 'g_token', 'g_id',
  'ped_espera', 'ped_emp', 'ped_propio', 'ped_entregado', 'ped_auth', 'ped_susp_manual', 'ped_susp_auto'].map(v);
const existentes = new Set(environment.values.map((x) => x.key));
for (const key of claves) {
  if (!existentes.has(key)) environment.values.push({ key, value: '', type: 'default', enabled: true });
}
fs.writeFileSync(environmentPath, JSON.stringify(environment, null, 2) + '\n', 'utf8');

console.log(`OK: carpeta "${NOMBRE_CARPETA.slice(0, 40)}..." con ${items.length} requests.`);
