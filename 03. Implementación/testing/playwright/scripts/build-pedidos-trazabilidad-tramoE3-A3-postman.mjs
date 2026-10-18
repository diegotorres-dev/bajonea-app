import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const collectionPath = path.resolve(__dirname, '../../../postman/Bajonea-MVP.postman_collection.json');
const environmentPath = path.resolve(__dirname, '../../../postman/Bajonea-Local.postman_environment.json');

const PREFIJO_CARPETA = '61 - ';
const NOMBRE_CARPETA = '61 - Pedido propio y trazabilidad E3 A3 (PEDIDO_PROPIO en las cinco acciones y la trazabilidad, marca esPedidoPropio solo para el Empleado, recorrido del pedido con actores y motivos, sin datos de mas)';

const v = (clave) => `tp_${clave}`;

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
    guardar(v(`${clave}_email`), `'tp.${clave}.' + s + '@bajonea.test'`),
    guardar(v(`${clave}_usuario`), `('tp${clave}' + s).slice(0, 20)`),
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

const MENSAJE_PROPIO = 'No podés gestionar tus propios pedidos';

const accion = (nombre, token, clave, ruta, codigo = 200, cuerpo = {}, comprobaciones = [], comercio = COM) =>
  item(nombre, req('PUT', `/pedidos/comercio/${P(clave)}/${ruta}`, { token, comercio, body: cuerpo }), [status(codigo), ...comprobaciones]);

const propio409 = (nombre, token, clave, ruta, cuerpo = {}) =>
  accion(nombre, token, clave, ruta, 409, cuerpo, [
    `pm.test('Es PEDIDO_PROPIO con su mensaje', () => { const r = pm.response.json(); pm.expect(r.data.codigo).to.eql('PEDIDO_PROPIO'); pm.expect(r.mensaje).to.eql('${MENSAJE_PROPIO}'); });`,
  ]);

const traza = (nombre, token, clave, codigo, comprobaciones = [], { comercio = COM } = {}) =>
  item(nombre, req('GET', `/pedidos/comercio/${P(clave)}/trazabilidad`, { token, comercio }), [status(codigo), ...comprobaciones]);

const estadoDelPedido = (nombre, token, clave, esperado) =>
  item(nombre, req('GET', '/pedidos/comercio', { token, comercio: COM }), [
    status(200),
    `const p = pm.response.json().data.find((x) => x.id === Number(${entorno(v(`ped_${clave}`))}));`,
    `pm.test('El pedido sigue en ${esperado}', () => pm.expect(p.estado).to.eql('${esperado}'));`,
  ]);

const pasosDe = "const pasos = pm.response.json().data.pasos;";
const textosDe = (...esperados) => `pm.test('Los textos son ${esperados.join(' / ')}', () => pm.expect(pasos.map((p) => p.accionTexto)).to.eql(${JSON.stringify(esperados)}));`;
const rolesDe = (...esperados) => `pm.test('Los roles son ${esperados.join(' / ')}', () => pm.expect(pasos.map((p) => p.actorRol)).to.eql(${JSON.stringify(esperados)}));`;
const CAMPOS_PASO = ['accionTexto', 'actorNombre', 'actorRol', 'actorRolTexto', 'estado', 'fechaHora', 'motivo'];
const sinDatosDeMas = `pm.test('Cada paso trae solo sus siete campos, sin ids de usuario ni datos personales', () => { pasos.forEach((p) => pm.expect(Object.keys(p).sort()).to.eql(${JSON.stringify(CAMPOS_PASO)})); pm.expect(JSON.stringify(pm.response.json())).to.not.match(/dni|telefono|email|clienteId|actorUsuarioId/i); });`;
const nombreEn = (posicion, nombreEsperadoVar) =>
  `pm.test('El paso ${posicion} lo hizo ' + pm.environment.get('${nombreEsperadoVar}'), () => pm.expect(pasos[${posicion}].actorNombre).to.eql(pm.environment.get('${nombreEsperadoVar}')));`;
const sistemaSinNombre = (posicion) =>
  `pm.test('El paso ${posicion} es del sistema, sin nombre', () => { pm.expect(pasos[${posicion}].actorRol).to.eql('SISTEMA'); pm.expect(pasos[${posicion}].actorNombre).to.eql(null); });`;

agregar(
  item('Login Administrador (sesion propia de esta carpeta)', req('POST', '/auth/login', { body: { nombreUsuario: '{{admin_usuario}}', password: '{{admin_password}}' } }), [
    status(200),
    guardar('token_admin', 'pm.response.json().data.token'),
  ]),
  item(
    'Registro Dueño (con retiro en el local)',
    req('POST', '/auth/registro/comercio', {
      body: {
        razonSocial: 'Trazabilidad A3 SRL',
        cuit: `{{${v('cuit_tmp')}}}`,
        condicionIva: 'RESPONSABLE_INSCRIPTO',
        tipoSociedad: 'SRL',
        domicilioFiscal: 'Direccion fiscal A3 100',
        fechaInicioActividades: '2020-01-01',
        nombre: 'Local Trazabilidad A3',
        descripcion: 'Comercio generado por la coleccion de Postman (pedido propio y trazabilidad, E3 A3)',
        telefono: '+5492964555446',
        emailContacto: `{{${v('d_email')}}}`,
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
        fotoPerfilUrl: 'https://res.cloudinary.com/demo/image/upload/postman-trazabilidad-a3.jpg',
        redesSociales: [{ tipo: 'INSTAGRAM', url: 'instagram.com/trazabilidada3' }],
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
    [guardar(v('cat_nombre'), "'Cat Trazabilidad A3 ' + Date.now().toString(36)")],
  ),
  item('El Dueño crea el producto con el que compran los Clientes', req('POST', '/productos', { token: TOKEN_DUENO, comercio: COM, rawBody: productoCuerpo('Producto Trazabilidad A3', 10000) }), [
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

agregar(
  ...crearPedido('propio', TOKEN_EMPLEADO),
  propio409('Propio: Elena no puede aceptar su propio pedido', TOKEN_EMPLEADO, 'propio', 'aceptar'),
  propio409('Propio: Elena no puede rechazar su propio pedido', TOKEN_EMPLEADO, 'propio', 'rechazar', { motivo: 'SIN_STOCK' }),
  propio409('Propio: Elena no puede despachar su propio pedido (aunque el estado tampoco corresponda)', TOKEN_EMPLEADO, 'propio', 'despachar'),
  propio409('Propio: Elena no puede entregar su propio pedido (aunque el estado tampoco corresponda)', TOKEN_EMPLEADO, 'propio', 'entregar'),
  propio409('Propio: Elena no puede anular su propio pedido (aunque el estado tampoco corresponda)', TOKEN_EMPLEADO, 'propio', 'anular', { motivo: 'SIN_STOCK' }),
  estadoDelPedido('Propio: los cinco intentos no cambiaron nada, el pedido sigue pendiente', TOKEN_DUENO, 'propio', 'PENDIENTE_CONFIRMACION_COMERCIO'),
  item('Propio: la lista de Elena marca su pedido y no lleva datos de mas', req('GET', '/pedidos/comercio', { token: TOKEN_EMPLEADO, comercio: COM }), [
    status(200),
    `const p = pm.response.json().data.find((x) => x.id === Number(${entorno(v('ped_propio'))}));`,
    "pm.test('esPedidoPropio es true en su pedido', () => pm.expect(p.esPedidoPropio).to.eql(true));",
    "pm.test('El DTO del Empleado lleva el cargo del cliente y no lleva clienteId, el cargo del comercio ni el estado de pago', () => { pm.expect(p).to.have.property('cargoServicioCliente'); ['clienteId', 'cargoServicioComercio', 'pagoEstado'].forEach((c) => pm.expect(p).to.not.have.property(c)); });",
  ]),
  item('Propio: la lista de Fabiana no lo marca como suyo', req('GET', '/pedidos/comercio', { token: TOKEN_EMPLEADO2, comercio: COM }), [
    status(200),
    `const p = pm.response.json().data.find((x) => x.id === Number(${entorno(v('ped_propio'))}));`,
    "pm.test('esPedidoPropio es false para otra persona del equipo', () => pm.expect(p.esPedidoPropio).to.eql(false));",
  ]),
  item('Propio: la lista del Dueño no trae la marca ni para el pedido de Elena', req('GET', '/pedidos/comercio', { token: TOKEN_DUENO, comercio: COM }), [
    status(200),
    "pm.test('Ningun pedido del Dueño trae esPedidoPropio', () => pm.response.json().data.forEach((p) => pm.expect(p).to.not.have.property('esPedidoPropio')));",
    "pm.test('El Dueño si ve el cliente y los cargos', () => pm.response.json().data.forEach((p) => { pm.expect(p).to.have.property('clienteId'); pm.expect(p).to.have.property('cargoServicioComercio'); }));",
  ]),
  accion('Propio: el Dueño acepta el pedido de Elena (sin restriccion) y no recibe la marca', TOKEN_DUENO, 'propio', 'aceptar', 200, {}, [
    "pm.test('La respuesta del Dueño no lleva esPedidoPropio', () => pm.expect(pm.response.json().data).to.not.have.property('esPedidoPropio'));",
  ]),
  propio409('Propio: Elena tampoco puede despacharlo cuando ya esta en preparacion', TOKEN_EMPLEADO, 'propio', 'despachar'),
  propio409('Propio: ni anularlo', TOKEN_EMPLEADO, 'propio', 'anular', { motivo: 'SIN_STOCK' }),
  traza('Propio: Elena recibe PEDIDO_PROPIO tambien en la trazabilidad de su pedido', TOKEN_EMPLEADO, 'propio', 409, [
    "pm.test('Es PEDIDO_PROPIO con su mensaje', () => { const r = pm.response.json(); pm.expect(r.data.codigo).to.eql('PEDIDO_PROPIO'); pm.expect(r.mensaje).to.eql('" + MENSAJE_PROPIO + "'); });",
  ]),
  accion('Propio: Fabiana (otra Empleada) despacha el pedido de Elena', TOKEN_EMPLEADO2, 'propio', 'despachar', 200, {}, [
    "pm.test('Fabiana ve el pedido como ajeno', () => pm.expect(pm.response.json().data.esPedidoPropio).to.eql(false));",
    "pm.test('El estado es LISTO_PARA_RETIRAR', () => pm.expect(pm.response.json().data.estado).to.eql('LISTO_PARA_RETIRAR'));",
  ]),
  propio409('Propio: Elena no puede entregar su pedido listo para retirar', TOKEN_EMPLEADO, 'propio', 'entregar'),
  accion('Propio: el Dueño lo entrega', TOKEN_DUENO, 'propio', 'entregar'),
  traza('Propio: Fabiana ve el recorrido completo del pedido de Elena', TOKEN_EMPLEADO2, 'propio', 200, [
    pasosDe,
    textosDe('Pedido recibido', 'Aceptó el pedido', 'Dejó el pedido listo para retirar', 'Marcó el pedido como entregado'),
    rolesDe('SISTEMA', 'DUENO', 'EMPLEADO', 'DUENO'),
    sistemaSinNombre(0),
    "pm.test('El Dueño figura con su nombre y apellido', () => pm.expect(pasos[1].actorNombre).to.eql('Carlos Sanchez'));",
    nombreEn(2, v('f_nombre')),
    "pm.test('Los pasos van de la hora mas vieja a la mas nueva', () => { for (let i = 1; i < pasos.length; i += 1) pm.expect(new Date(pasos[i - 1].fechaHora).getTime()).to.be.at.most(new Date(pasos[i].fechaHora).getTime()); });",
    sinDatosDeMas,
  ]),
  traza('Propio: el Dueño ve el mismo recorrido', TOKEN_DUENO, 'propio', 200, [pasosDe, textosDe('Pedido recibido', 'Aceptó el pedido', 'Dejó el pedido listo para retirar', 'Marcó el pedido como entregado')]),
);

agregar(
  ...crearPedido('ajeno'),
  accion('Ajeno: Elena acepta el pedido de Carla', TOKEN_EMPLEADO, 'ajeno', 'aceptar', 200, {}, [
    "pm.test('La respuesta es el DTO reducido con la marca en false', () => { const d = pm.response.json().data; pm.expect(d.esPedidoPropio).to.eql(false); pm.expect(d).to.not.have.property('clienteId'); pm.expect(d).to.not.have.property('cargoServicioComercio'); });",
  ]),
  accion('Ajeno: Fabiana, que no lo acepto, lo despacha', TOKEN_EMPLEADO2, 'ajeno', 'despachar'),
  accion('Ajeno: Elena lo entrega', TOKEN_EMPLEADO, 'ajeno', 'entregar', 200, {}, [
    "pm.test('Queda ENTREGADO', () => pm.expect(pm.response.json().data.estado).to.eql('ENTREGADO'));",
  ]),
  traza('Ajeno: la trazabilidad muestra quien hizo cada paso, con nombre completo', TOKEN_EMPLEADO2, 'ajeno', 200, [
    pasosDe,
    textosDe('Pedido recibido', 'Aceptó el pedido', 'Dejó el pedido listo para retirar', 'Marcó el pedido como entregado'),
    rolesDe('SISTEMA', 'EMPLEADO', 'EMPLEADO', 'EMPLEADO'),
    nombreEn(1, v('e_nombre')),
    nombreEn(2, v('f_nombre')),
    nombreEn(3, v('e_nombre')),
    sinDatosDeMas,
  ]),
  item('Ajeno: la lista de Carla (Cliente) no lleva la marca', req('GET', '/pedidos/cliente', { token: TOKEN_COMPRADOR }), [
    status(200),
    "pm.test('Ningun pedido de la Cliente trae esPedidoPropio', () => pm.response.json().data.forEach((p) => pm.expect(p).to.not.have.property('esPedidoPropio')));",
  ]),
  ...crearPedido('rechazado'),
  accion('Rechazo: Fabiana rechaza con motivo OTRO y comentario', TOKEN_EMPLEADO2, 'rechazado', 'rechazar', 200, { motivo: 'OTRO', comentario: 'Se cortó el gas' }),
  traza('Rechazo: la trazabilidad trae el motivo en el paso del rechazo y solo ahi', TOKEN_EMPLEADO, 'rechazado', 200, [
    pasosDe,
    textosDe('Pedido recibido', 'Rechazó el pedido'),
    rolesDe('SISTEMA', 'EMPLEADO'),
    "pm.test('El motivo es la etiqueta mas el comentario', () => { pm.expect(pasos[1].motivo).to.eql('Otro. Se cortó el gas'); pm.expect(pasos[0].motivo).to.eql(null); });",
  ]),
  ...crearPedido('anulado'),
  accion('Anulacion: Elena acepta el pedido', TOKEN_EMPLEADO, 'anulado', 'aceptar'),
  item('Anulacion: el Dueño lo anula con motivo', req('PUT', `/pedidos/comercio/${P('anulado')}/anular`, { token: TOKEN_DUENO, comercio: COM, body: { motivo: 'SIN_STOCK', comentario: 'Se acabó la masa' } }), [
    status(200),
    guardar(v('motivo_anulacion'), 'pm.response.json().data.motivoAnulacion'),
  ]),
  traza('Anulacion: el paso de la anulacion trae el mismo motivo que ve el Dueño', TOKEN_EMPLEADO2, 'anulado', 200, [
    pasosDe,
    textosDe('Pedido recibido', 'Aceptó el pedido', 'Anuló el pedido'),
    "pm.test('El motivo coincide con el de la anulacion', () => { pm.expect(pasos[2].motivo).to.eql(pm.environment.get('tp_motivo_anulacion')); pm.expect(pasos[2].motivo).to.not.eql(null); });",
  ]),
  ...crearPedido('cancelado'),
  item('Cancelacion: Carla cancela su pedido', req('PUT', `/pedidos/cliente/${P('cancelado')}/cancelar`, { token: TOKEN_COMPRADOR, body: {} }), [status(200)]),
  traza('Cancelacion: el paso del Cliente lleva su nombre completo y su rol, sin ids', TOKEN_EMPLEADO, 'cancelado', 200, [
    pasosDe,
    textosDe('Pedido recibido', 'Canceló el pedido'),
    rolesDe('SISTEMA', 'CLIENTE'),
    nombreEn(1, v('c_nombre')),
    "pm.test('El rol en texto es Cliente', () => pm.expect(pasos[1].actorRolTexto).to.eql('Cliente'));",
    sinDatosDeMas,
  ]),
);

const sinPagar = [
  item('[pedido sinpagar] La Compradora vacia el carrito', req('DELETE', '/carrito', { token: TOKEN_COMPRADOR }), [`pm.test('Carrito vaciado o ya vacio', () => pm.expect([200, 404]).to.include(pm.response.code));`]),
  item('[pedido sinpagar] La Compradora agrega el producto', req('POST', '/carrito/items', { token: TOKEN_COMPRADOR, rawBody: `{"productoId": {{${v('prodD')}}}, "cantidad": 1}` }), [status(201)]),
  item('[pedido sinpagar] La Compradora confirma el pedido y no lo paga', req('POST', '/pedidos/cliente', { token: TOKEN_COMPRADOR, rawBody: '{"tipoEntrega": "RETIRO", "direccionId": null}' }), [
    status(201),
    guardar(v('ped_sinpagar'), 'pm.response.json().data.id'),
  ]),
];
agregar(
  item('Autorizacion: Carla (Cliente sin relacion) sin header recibe 400', req('GET', `/pedidos/comercio/${P('ajeno')}/trazabilidad`, { token: TOKEN_COMPRADOR }), [status(400)]),
  traza('Autorizacion: Carla con el header del comercio recibe el 404 COMERCIO_NO_DISPONIBLE', TOKEN_COMPRADOR, 'ajeno', 404, [
    "pm.test('Codigo COMERCIO_NO_DISPONIBLE', () => pm.expect(pm.response.json().data.codigo).to.eql('COMERCIO_NO_DISPONIBLE'));",
  ]),
  item('Autorizacion: sin token es 401', req('GET', `/pedidos/comercio/${P('ajeno')}/trazabilidad`, { comercio: COM }), [status(401)]),
  item('Autorizacion: el Administrador recibe 403', req('GET', `/pedidos/comercio/${P('ajeno')}/trazabilidad`, { token: 'token_admin', comercio: COM }), [status(403)]),
  item('Segundo comercio del Dueño (clon en APTO_VENTA)', req('POST', `/test/comercios/${COM}/clonar`, { body: {}, query: 'nombre=Clon Trazabilidad A3&estado=APTO_VENTA' }), [
    status(201),
    guardar(v('clon'), 'pm.response.json().data'),
  ]),
  traza('Autorizacion: Elena no tiene relacion con el segundo comercio, 404 COMERCIO_NO_DISPONIBLE', TOKEN_EMPLEADO, 'ajeno', 404, [
    "pm.test('Codigo COMERCIO_NO_DISPONIBLE', () => pm.expect(pm.response.json().data.codigo).to.eql('COMERCIO_NO_DISPONIBLE'));",
  ], { comercio: CLON }),
  traza('Aislamiento: el Dueño pide con el segundo comercio un pedido del primero, 404', TOKEN_DUENO, 'ajeno', 404, [
    "pm.test('Pedido no encontrado', () => pm.expect(pm.response.json().mensaje).to.eql('Pedido no encontrado'));",
  ], { comercio: CLON }),
  item('Inexistente: un pedido que no existe es 404 para el Dueño', req('GET', '/pedidos/comercio/99999999/trazabilidad', { token: TOKEN_DUENO, comercio: COM }), [status(404)]),
  item('Inexistente: y tambien para la Empleada', req('GET', '/pedidos/comercio/99999999/trazabilidad', { token: TOKEN_EMPLEADO, comercio: COM }), [status(404)]),
  ...sinPagar,
  item('Sin pagar: un pedido que nunca se pago no tiene trazabilidad (404)', req('GET', `/pedidos/comercio/${P('sinpagar')}/trazabilidad`, { token: TOKEN_DUENO, comercio: COM }), [status(404)]),
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
const claves = ['com', 'clon', 'cat', 'cat_nombre', 'prodD', 'cuit_tmp', 'dni_rep_tmp', 'motivo_anulacion',
  'd_email', 'd_usuario', 'd_password', 'd_dni', 'd_codigo', 'd_token', 'd_id',
  'e_email', 'e_usuario', 'e_password', 'e_dni', 'e_codigo', 'e_token', 'e_id', 'e_inv_codigo', 'e_nombre',
  'f_email', 'f_usuario', 'f_password', 'f_dni', 'f_codigo', 'f_token', 'f_id', 'f_inv_codigo', 'f_nombre',
  'c_email', 'c_usuario', 'c_password', 'c_dni', 'c_codigo', 'c_token', 'c_id', 'c_nombre',
  'ped_propio', 'ped_ajeno', 'ped_rechazado', 'ped_anulado', 'ped_cancelado', 'ped_sinpagar'].map(v);
const existentes = new Set(environment.values.map((x) => x.key));
for (const key of claves) {
  if (!existentes.has(key)) environment.values.push({ key, value: '', type: 'default', enabled: true });
}
fs.writeFileSync(environmentPath, JSON.stringify(environment, null, 2) + '\n', 'utf8');

console.log(`OK: carpeta "${NOMBRE_CARPETA.slice(0, 40)}..." con ${items.length} requests.`);
