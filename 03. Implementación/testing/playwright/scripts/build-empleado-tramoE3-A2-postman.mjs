import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const collectionPath = path.resolve(__dirname, '../../../postman/Bajonea-MVP.postman_collection.json');
const environmentPath = path.resolve(__dirname, '../../../postman/Bajonea-Local.postman_environment.json');

const PREFIJO_CARPETA = '59 - ';
const NOMBRE_CARPETA = '59 - Rol Empleado E3 A2 (escrituras delegadas: productos, datos operativos, cierre y pedidos; revalidacion de la relacion, guards por estado del comercio y notificaciones con header)';

const v = (clave) => `a2_${clave}`;

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
const codigoEs = (codigo) => `pm.test('El codigo estable es ${codigo}', () => pm.expect(pm.response.json().data.codigo).to.eql('${codigo}'));`;
const mensajeEs = (texto) => `pm.test('El mensaje es el esperado', () => pm.expect(pm.response.json().mensaje).to.eql(${JSON.stringify(texto)}));`;
const sinCampos = (...campos) => `pm.test('No trae ${campos.join(', ')}', () => { const d = pm.response.json().data; ${JSON.stringify(campos)}.forEach((c) => pm.expect(Object.keys(d)).to.not.include(c)); });`;
const conCampos = (...campos) => `pm.test('Trae ${campos.join(', ')}', () => { const d = pm.response.json().data; ${JSON.stringify(campos)}.forEach((c) => pm.expect(Object.keys(d)).to.include(c)); });`;
const NO_DISPONIBLE = [
  status(404),
  "pm.test('Mismo 404 de siempre: Comercio no encontrado y codigo COMERCIO_NO_DISPONIBLE', () => { const b = pm.response.json(); pm.expect(b.mensaje).to.eql('Comercio no encontrado'); pm.expect(b.data.codigo).to.eql('COMERCIO_NO_DISPONIBLE'); });",
];

function identidad(clave) {
  return [
    `const s = Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36);`,
    guardar(v(`${clave}_email`), `'a2.${clave}.' + s + '@bajonea.test'`),
    guardar(v(`${clave}_usuario`), `('a2${clave}' + s).slice(0, 20)`),
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
const TOKEN_AJENO = v('x_token');
const CAT = `{{${v('cat')}}}`;
const NUBE = `{{${v('cloud')}}}`;

const items = [];
const agregar = (...nuevos) => items.push(...nuevos);

function clienteNuevo(clave, nombre) {
  return [
    item(
      `Registro ${nombre}`,
      req('POST', '/auth/registro/cliente', {
        body: {
          nombre,
          apellido: 'Escrituras',
          dni: `{{${v(`${clave}_dni`)}}}`,
          fechaNacimiento: '1995-05-20',
          telefono: '+5492964551235',
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

function sumarAlEquipo(comercioVar, nombre) {
  return [
    item(`El Dueño invita a ${nombre} al comercio`, req('POST', '/comercios/equipo/invitaciones', { token: TOKEN_DUENO, comercio: comercioVar, body: { email: `{{${v('e_email')}}}` } }), [status(201)]),
    item(`Bypass test - codigo de la invitacion`, req('GET', '/test/invitaciones-empleado/codigo', { query: `email={{${v('e_email')}}}&comercioId=${comercioVar}` }), [
      status(200),
      guardar(v('inv_codigo'), 'pm.response.json().data'),
    ]),
    item(`${nombre} acepta la invitacion`, req('POST', '/auth/invitaciones-empleado/aceptar', { body: { email: `{{${v('e_email')}}}`, codigo: `{{${v('inv_codigo')}}}` } }), [status(200)]),
  ];
}

const P = (clave) => `{{${v(`ped_${clave}`)}}}`;

function crearPedido(clave) {
  return [
    item(`[pedido ${clave}] El Cliente agrega el producto al carrito`, req('POST', '/carrito/items', { token: TOKEN_COMPRADOR, rawBody: `{"productoId": {{${v('prodD')}}}, "cantidad": 1}` }), [status(201)]),
    item(`[pedido ${clave}] El Cliente confirma el pedido (retiro en el local)`, req('POST', '/pedidos/cliente', { token: TOKEN_COMPRADOR, body: { tipoEntrega: 'RETIRO', direccionId: null } }), [
      status(201),
      guardar(v(`ped_${clave}`), 'pm.response.json().data.id'),
    ]),
    item(`[pedido ${clave}] Atajo de test: el pago queda aprobado y registrado`, req('PUT', `/test/pedidos/${P(clave)}/pago-aprobado`, { body: {}, query: 'registrarPago=true' }), [status(200)]),
  ];
}

const accionPedido = (nombre, token, clave, ruta, codigo, { cuerpo, extra = [], comercio = COM } = {}) =>
  item(nombre, req('PUT', `/pedidos/comercio/${P(clave)}/${ruta}`, { token, comercio, body: cuerpo ?? {} }), [status(codigo), ...extra]);
const MOTIVO = { motivo: 'SIN_STOCK' };
const PEDIDO_REDUCIDO = [sinCampos('clienteId', 'pagoEstado', 'cargoServicioComercio'), conCampos('cargoServicioCliente')];
const PEDIDO_COMPLETO = [conCampos('clienteId', 'pagoEstado', 'cargoServicioCliente', 'cargoServicioComercio')];

const productoCuerpo = (nombre, precio) => `{"nombre": "${nombre}", "descripcion": "Descripcion A2", "precio": ${precio}, "categoriaId": ${CAT}}`;

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
        razonSocial: 'Escrituras A2 SRL',
        cuit: `{{${v('cuit_tmp')}}}`,
        condicionIva: 'RESPONSABLE_INSCRIPTO',
        tipoSociedad: 'SRL',
        domicilioFiscal: 'Direccion fiscal A2 100',
        fechaInicioActividades: '2020-01-01',
        nombre: 'Local Escrituras A2',
        descripcion: 'Comercio generado por la coleccion de Postman (escrituras delegadas, E3 A2)',
        telefono: '+5492964555444',
        tipoComercio: 'RESTAURANTE',
        aceptaDelivery: false,
        aceptaRetiro: true,
        nombreUsuario: `{{${v('d_usuario')}}}`,
        email: `{{${v('d_email')}}}`,
        password: `{{${v('d_password')}}}`,
        direccion: { calle: 'Belgrano', numero: '800', pisoDepto: null, codigoPostal: '9420', localidadId: '{{localidad_id}}', principal: false },
        horarios: horariosTodosLosDias,
        nombreRepresentante: 'Carlos',
        apellidoRepresentante: 'Sanchez',
        dniRepresentante: `{{${v('dni_rep_tmp')}}}`,
        telefonoRepresentante: '+5492964701103',
        fechaNacimientoRepresentante: '1988-04-04',
        fotoPerfilUrl: 'https://res.cloudinary.com/demo/image/upload/postman-escrituras-a2.jpg',
        redesSociales: [{ tipo: 'INSTAGRAM', url: 'instagram.com/escriturasa2' }],
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
    [guardar(v('cat_nombre'), "'Cat Escrituras A2 ' + Date.now().toString(36)")],
  ),
  item('El Dueño pide la firma de Cloudinary (para conocer el nombre de la nube)', req('POST', '/comercios/perfil/foto/firma', { token: TOKEN_DUENO, comercio: COM, body: {} }), [
    status(200),
    guardar(v('cloud'), 'pm.response.json().data.cloudName'),
  ]),
  item('El Dueño crea el producto con el que compran los Clientes', req('POST', '/productos', { token: TOKEN_DUENO, comercio: COM, rawBody: productoCuerpo('Producto Escrituras A2', 10000) }), [
    status(201),
    guardar(v('prodD'), 'pm.response.json().data.id'),
  ]),
  ...clienteNuevo('e', 'Empleada'),
  ...sumarAlEquipo(COM, 'la Empleada'),
  loginDe('e', 'Empleada', TOKEN_EMPLEADO),
  ...clienteNuevo('c', 'Compradora'),
  loginDe('c', 'Compradora', TOKEN_COMPRADOR),
  ...clienteNuevo('x', 'Cliente sin relacion'),
  loginDe('x', 'Cliente sin relacion', TOKEN_AJENO),
);

const PROD = `{{${v('prod')}}}`;
const IMG1 = `{{${v('img1')}}}`;
const IMG2 = `{{${v('img2')}}}`;
const urlImagen = (sufijo) => `https://res.cloudinary.com/${NUBE}/image/upload/v1/productos/${COM}/${PROD}/a2-${sufijo}-{{${v('archivo')}}}.png`;

agregar(
  item('Productos: la Empleada crea un producto', req('POST', '/productos', { token: TOKEN_EMPLEADO, comercio: COM, rawBody: productoCuerpo('Empanada A2', 1800) }), [
    status(201),
    guardar(v('prod'), 'pm.response.json().data.id'),
    guardar(v('archivo'), "Date.now().toString(36)"),
    "pm.test('Queda en el comercio del header', () => pm.expect(Number(pm.response.json().data.comercioId)).to.eql(Number(pm.environment.get('a2_com'))));",
  ]),
  item('Productos: la Empleada pide la firma de subida de una imagen', req('POST', `/productos/${PROD}/cloudinary/firma`, { token: TOKEN_EMPLEADO, comercio: COM, body: {} }), [status(200)]),
  item('Productos: la Empleada registra la imagen principal', req('POST', `/productos/${PROD}/imagenes`, { token: TOKEN_EMPLEADO, comercio: COM, rawBody: `{"url": "${urlImagen('1')}", "orden": 0, "esPrincipal": true}` }), [
    status(201),
    guardar(v('img1'), 'pm.response.json().data.id'),
  ]),
  item('Productos: la Empleada registra una segunda imagen', req('POST', `/productos/${PROD}/imagenes`, { token: TOKEN_EMPLEADO, comercio: COM, rawBody: `{"url": "${urlImagen('2')}", "orden": 1, "esPrincipal": false}` }), [
    status(201),
    guardar(v('img2'), 'pm.response.json().data.id'),
  ]),
  item('Productos: la Empleada edita el producto', req('PUT', `/productos/${PROD}`, { token: TOKEN_EMPLEADO, comercio: COM, rawBody: productoCuerpo('Empanada A2 Editada', 2100) }), [
    status(200),
    "pm.test('El precio cambio', () => pm.expect(Number(pm.response.json().data.precio)).to.eql(2100));",
  ]),
  item('Productos: la Empleada reordena la segunda imagen', req('PATCH', `/productos/${PROD}/imagenes/${IMG2}/orden`, { token: TOKEN_EMPLEADO, comercio: COM, rawBody: '{"orden": 4}' }), [status(200)]),
  item('Productos: la Empleada pide la firma de recorte', req('POST', `/productos/${PROD}/imagenes/${IMG2}/recorte/firma`, { token: TOKEN_EMPLEADO, comercio: COM, body: {} }), [status(200)]),
  item('Productos: la Empleada reemplaza la URL recortada', req('PATCH', `/productos/${PROD}/imagenes/${IMG2}/url`, { token: TOKEN_EMPLEADO, comercio: COM, rawBody: `{"url": "${urlImagen('recorte')}"}` }), [status(200)]),
  item('Productos: la Empleada elimina la segunda imagen', req('DELETE', `/productos/${PROD}/imagenes/${IMG2}`, { token: TOKEN_EMPLEADO, comercio: COM }), [status(200)]),
  item('Productos: la Empleada marca el producto como agotado', req('PATCH', `/productos/${PROD}/estado`, { token: TOKEN_EMPLEADO, comercio: COM, rawBody: '{"estado": "AGOTADO"}' }), [
    status(200),
    "pm.test('Agotado', () => pm.expect(pm.response.json().data.estado).to.eql('AGOTADO'));",
  ]),
  item('Productos: el Dueño lo vuelve a disponible (mismo servicio, mismos codigos)', req('PATCH', `/productos/${PROD}/estado`, { token: TOKEN_DUENO, comercio: COM, rawBody: '{"estado": "DISPONIBLE"}' }), [status(200)]),
  item('Productos: la Empleada no toca un producto que no es de este comercio', req('PATCH', `/productos/999999999/estado`, { token: TOKEN_EMPLEADO, comercio: COM, rawBody: '{"estado": "AGOTADO"}' }), [
    status(404),
    mensajeEs('Producto no encontrado'),
  ]),
);

const DATOS = '/comercios/perfil/datos-operativos';
const datosOk = (descripcion, telefono) => `{"descripcion": "${descripcion}", "telefono": "${telefono}"}`;

agregar(
  item('Perfil: la Empleada edita descripcion y telefono y recibe el perfil reducido', req('PUT', DATOS, { token: TOKEN_EMPLEADO, comercio: COM, rawBody: datosOk('Descripcion A2 nueva', '+5492964111222') }), [
    status(200),
    "pm.test('Cambiaron los dos campos', () => { const d = pm.response.json().data; pm.expect(d.descripcion).to.eql('Descripcion A2 nueva'); pm.expect(d.telefono).to.eql('+5492964111222'); });",
    sinCampos('emailContacto', 'cuit', 'razonSocial', 'condicionIva', 'tipoSociedad', 'domicilioFiscal', 'fechaInicioActividades', 'representante', 'motivoRechazo'),
  ]),
  item('Perfil: la Empleada ve el perfil sin email de contacto', req('GET', '/comercios/perfil', { token: TOKEN_EMPLEADO, comercio: COM }), [
    status(200),
    sinCampos('emailContacto', 'cuit', 'representante'),
  ]),
  ...[['nombre', '"nombre": "Hackeado"'], ['emailContacto', '"emailContacto": "otro@bajonea.test"'], ['aceptaDelivery', '"aceptaDelivery": true'], ['aceptaRetiro', '"aceptaRetiro": false'], ['fotoPerfilUrl', '"fotoPerfilUrl": "https://res.cloudinary.com/demo/image/upload/x.png"'], ['cuit', '"cuit": "20111111112"']].map(([campo, fragmento]) =>
    item(`Perfil: un cuerpo con "${campo}" es 400 y no cambia nada`, req('PUT', DATOS, { token: TOKEN_EMPLEADO, comercio: COM, rawBody: `{"descripcion": "x", "telefono": "+5492964111222", ${fragmento}}` }), [status(400)]),
  ),
  item('Perfil: telefono vacio es 400', req('PUT', DATOS, { token: TOKEN_EMPLEADO, comercio: COM, rawBody: '{"descripcion": "x", "telefono": ""}' }), [status(400)]),
  item('Perfil: telefono invalido es 400', req('PUT', DATOS, { token: TOKEN_EMPLEADO, comercio: COM, rawBody: '{"descripcion": "x", "telefono": "123"}' }), [status(400)]),
  item('Perfil: sin telefono es 400', req('PUT', DATOS, { token: TOKEN_EMPLEADO, comercio: COM, rawBody: '{"descripcion": "x"}' }), [status(400)]),
  item('Perfil: descripcion de mas de 2000 caracteres es 400', req('PUT', DATOS, { token: TOKEN_EMPLEADO, comercio: COM, rawBody: '{"descripcion": "' + 'x'.repeat(2001) + '", "telefono": "+5492964111222"}' }), [status(400)]),
  item('Perfil: el nombre y las modalidades siguen como estaban', req('GET', '/comercios/perfil', { token: TOKEN_DUENO, comercio: COM }), [
    status(200),
    "pm.test('Nombre y modalidades intactos', () => { const d = pm.response.json().data; pm.expect(d.nombre).to.eql('Local Escrituras A2'); pm.expect(d).to.not.have.property('emailContacto'); pm.expect(d.aceptaDelivery).to.eql(false); pm.expect(d.aceptaRetiro).to.eql(true); });",
  ]),
  item('Perfil: el Dueño tambien puede usar la ruta y recibe su perfil completo', req('PUT', DATOS, { token: TOKEN_DUENO, comercio: COM, rawBody: datosOk('Descripcion del Dueño', '+5492964333444') }), [status(200), conCampos('cuit', 'representante')]),
  item('Perfil: PUT /comercios/perfil sigue siendo exclusivo del Dueño (403 para la Empleada)', req('PUT', '/comercios/perfil', { token: TOKEN_EMPLEADO, comercio: COM, body: {} }), [status(403)]),
  item('Perfil: la foto del comercio es exclusiva del Dueño (403)', req('PUT', '/comercios/perfil/foto', { token: TOKEN_EMPLEADO, comercio: COM, body: { url: 'https://res.cloudinary.com/demo/image/upload/x.png' } }), [status(403)]),
  item('Perfil: la firma de la foto del comercio es exclusiva del Dueño (403)', req('POST', '/comercios/perfil/foto/firma', { token: TOKEN_EMPLEADO, comercio: COM, body: {} }), [status(403)]),
  item('Exclusivos del Dueño: ver el equipo es 403 para la Empleada', req('GET', '/comercios/equipo', { token: TOKEN_EMPLEADO, comercio: COM }), [status(403)]),
  item('Exclusivos del Dueño: la actividad es 403 para la Empleada', req('GET', '/comercios/equipo/actividad', { token: TOKEN_EMPLEADO, comercio: COM }), [status(403)]),
  item('Exclusivos del Dueño: las redes sociales son 403 para la Empleada', req('GET', '/comercios/redes-sociales', { token: TOKEN_EMPLEADO, comercio: COM }), [status(403)]),
  item('Exclusivos del Dueño: Mercado Pago es 403 para la Empleada', req('GET', '/oauth/mercadopago/cuenta', { token: TOKEN_EMPLEADO, comercio: COM }), [status(403)]),
);

agregar(
  item('Suspendido: el Dueño tiene un segundo comercio (clon en APTO_VENTA)', req('POST', `/test/comercios/${COM}/clonar`, { body: {}, query: 'nombre=Clon Escrituras A2&estado=APTO_VENTA' }), [
    status(201),
    guardar(v('clon'), 'pm.response.json().data'),
  ]),
  ...sumarAlEquipo(CLON, 'la Empleada (segundo comercio)'),
  item('Suspendido: el Administrador suspende el clon', req('PUT', `/administrador/comercios/${CLON}/suspender`, { token: 'token_admin', body: { motivo: 'Suspension de la coleccion A2' } }), [status(200)]),
  item('Suspendido: la Empleada ve el comercio con su estado', req('GET', '/comercios/perfil', { token: TOKEN_EMPLEADO, comercio: CLON }), [
    status(200),
    "pm.test('Estado SUSPENDIDO', () => pm.expect(pm.response.json().data.estado).to.eql('SUSPENDIDO'));",
  ]),
  ...[
    ['crear un producto', 'POST', '/productos', productoCuerpo('Nuevo', 10)],
    ['editar los datos operativos', 'PUT', DATOS, datosOk('x', '+5492964111222')],
    ['pedir la firma de una imagen', 'POST', `/productos/${PROD}/cloudinary/firma`, '{}'],
    ['cambiar el estado de un producto', 'PATCH', `/productos/${PROD}/estado`, '{"estado": "AGOTADO"}'],
  ].map(([texto, metodo, ruta, cuerpo]) =>
    item(`Suspendido: la Empleada no puede ${texto} (409 COMERCIO_SUSPENDIDO)`, req(metodo, ruta, { token: TOKEN_EMPLEADO, comercio: CLON, rawBody: cuerpo }), [
      status(409),
      codigoEs('COMERCIO_SUSPENDIDO'),
      mensajeEs('El comercio está suspendido: por ahora no se puede modificar.'),
    ]),
  ),
  item('Suspendido: el Dueño tampoco puede editar (409 COMERCIO_SUSPENDIDO)', req('PUT', DATOS, { token: TOKEN_DUENO, comercio: CLON, rawBody: datosOk('Dueño con comercio suspendido', '+5492964333444') }), [status(409), codigoEs('COMERCIO_SUSPENDIDO')]),
  ...['cerrar', 'abrir'].flatMap((accion) => [
    item(`Suspendido: la Empleada no puede ${accion} el comercio (409 COMERCIO_NO_OPERATIVO)`, req('PUT', `/comercios/${accion}`, { token: TOKEN_EMPLEADO, comercio: CLON, body: {} }), [
      status(409),
      codigoEs('COMERCIO_NO_OPERATIVO'),
      mensajeEs('Este comercio no está operativo'),
    ]),
    item(`Suspendido: el Dueño tampoco puede ${accion} el comercio (409 COMERCIO_NO_OPERATIVO)`, req('PUT', `/comercios/${accion}`, { token: TOKEN_DUENO, comercio: CLON, body: {} }), [status(409), codigoEs('COMERCIO_NO_OPERATIVO')]),
  ]),
);

agregar(
  ...crearPedido('flujo'),
  ...crearPedido('rechazo'),
  ...crearPedido('anula'),
  ...crearPedido('manual'),
  ...crearPedido('pendiente'),
  ...crearPedido('preparacion'),
  ...crearPedido('anular2'),
  accionPedido('Pedidos: la Empleada acepta', TOKEN_EMPLEADO, 'flujo', 'aceptar', 200, {
    extra: [...PEDIDO_REDUCIDO, "pm.test('En preparacion', () => pm.expect(pm.response.json().data.estado).to.eql('EN_PREPARACION'));"],
  }),
  accionPedido('Pedidos: la Empleada despacha (retiro en el local)', TOKEN_EMPLEADO, 'flujo', 'despachar', 200, {
    extra: [...PEDIDO_REDUCIDO, "pm.test('Listo para retirar', () => pm.expect(pm.response.json().data.estado).to.eql('LISTO_PARA_RETIRAR'));"],
  }),
  accionPedido('Pedidos: la Empleada entrega', TOKEN_EMPLEADO, 'flujo', 'entregar', 200, {
    extra: [...PEDIDO_REDUCIDO, "pm.test('Entregado', () => pm.expect(pm.response.json().data.estado).to.eql('ENTREGADO'));"],
  }),
  accionPedido('Pedidos: la Empleada rechaza con reembolso (respuesta reducida)', TOKEN_EMPLEADO, 'rechazo', 'rechazar', 200, {
    cuerpo: MOTIVO,
    extra: [...PEDIDO_REDUCIDO, "pm.test('Rechazado y reembolso en terminos simples', () => { const d = pm.response.json().data; pm.expect(d.estado).to.eql('RECHAZADO'); pm.expect(['EN_PROCESO', 'REEMBOLSADO', 'EN_REVISION']).to.include(d.reembolsoEstado); });"],
  }),
  accionPedido('Pedidos: el Dueño acepta otro pedido y recibe el DTO completo', TOKEN_DUENO, 'anula', 'aceptar', 200, { extra: PEDIDO_COMPLETO }),
  accionPedido('Pedidos: la Empleada anula con motivo libre (respuesta reducida)', TOKEN_EMPLEADO, 'anula', 'anular', 200, {
    cuerpo: { motivo: 'OTRO', comentario: 'Se rompio el horno' },
    extra: [...PEDIDO_REDUCIDO, "pm.test('Anulado con su motivo', () => { const d = pm.response.json().data; pm.expect(d.estado).to.eql('ANULADO'); pm.expect(d.motivoAnulacion).to.include('Se rompio el horno'); });"],
  }),
  accionPedido('Pedidos: la Empleada no puede aceptar un pedido ya aceptado (409 por estado, sin codigo)', TOKEN_EMPLEADO, 'flujo', 'aceptar', 409),
  item('Pedidos: la Empleada ve la lista reducida y el resumen del dia', req('GET', '/pedidos/comercio', { token: TOKEN_EMPLEADO, comercio: COM }), [
    status(200),
    "pm.test('Sin campos del Dueño', () => pm.response.json().data.forEach((p) => ['clienteId', 'pagoEstado', 'cargoServicioComercio'].forEach((c) => pm.expect(Object.keys(p)).to.not.include(c))));",
  ]),
  item('Cierre: la Empleada cierra el comercio', req('PUT', '/comercios/cerrar', { token: TOKEN_EMPLEADO, comercio: COM, body: {} }), [
    status(200),
    "pm.test('Cerrado a mano', () => pm.expect(pm.response.json().data.cerradoManualmente).to.eql(true));",
  ]),
  accionPedido('Cierre: con cierre manual la Empleada igual acepta pedidos pendientes', TOKEN_EMPLEADO, 'manual', 'aceptar', 200, { extra: PEDIDO_REDUCIDO }),
  item('Cierre: la Empleada abre el comercio', req('PUT', '/comercios/abrir', { token: TOKEN_EMPLEADO, comercio: COM, body: {} }), [
    status(200),
    "pm.test('Abierto', () => pm.expect(pm.response.json().data.cerradoManualmente).to.eql(false));",
  ]),
  item('Cierre: abrir un comercio ya abierto es idempotente', req('PUT', '/comercios/abrir', { token: TOKEN_EMPLEADO, comercio: COM, body: {} }), [status(200)]),
  item('Cierre: el Dueño cierra el comercio', req('PUT', '/comercios/cerrar', { token: TOKEN_DUENO, comercio: COM, body: {} }), [status(200)]),
  item('Cierre: la Empleada puede abrir el cierre manual que hizo el Dueño', req('PUT', '/comercios/abrir', { token: TOKEN_EMPLEADO, comercio: COM, body: {} }), [
    status(200),
    "pm.test('Abierto', () => pm.expect(pm.response.json().data.cerradoManualmente).to.eql(false));",
  ]),
  accionPedido('Pedidos: el Dueño acepta el pedido que queda en preparacion', TOKEN_DUENO, 'preparacion', 'aceptar', 200),
  accionPedido('Pedidos: el Dueño acepta el pedido que se anulara despues', TOKEN_DUENO, 'anular2', 'aceptar', 200),
  item('Actividad: el Dueño ve las acciones de la Empleada con su rol sobre productos, pedidos y cierres', req('GET', '/comercios/equipo/actividad', { token: TOKEN_DUENO, comercio: COM, query: 'limite=100' }), [
    status(200),
    "const items = pm.response.json().data.items;",
    "pm.test('Productos editados por la Empleada', () => pm.expect(items.some((i) => i.fuente === 'EDICION' && i.entidadTipo === 'PRODUCTO' && i.actorRol === 'EMPLEADO')).to.eql(true));",
    "pm.test('Datos del comercio editados por la Empleada', () => pm.expect(items.some((i) => i.entidadTipo === 'COMERCIO' && i.actorRol === 'EMPLEADO' && i.detalle === 'Editó: descripción, teléfono')).to.eql(true));",
    "pm.test('Pedidos resueltos por la Empleada', () => pm.expect(items.some((i) => i.fuente === 'PEDIDO' && i.actorRol === 'EMPLEADO')).to.eql(true));",
    "pm.test('Cierres hechos por la Empleada', () => pm.expect(items.some((i) => i.fuente === 'CIERRE' && i.actorRol === 'EMPLEADO')).to.eql(true));",
    "pm.test('Tambien hay lineas del Dueño', () => pm.expect(items.some((i) => i.actorRol === 'DUENO')).to.eql(true));",
  ]),
);

const loginFallido = (n) =>
  item(`Cierre temporal: intento fallido ${n} de login del Dueño`, req('POST', '/auth/login', { body: { nombreUsuario: `{{${v('d_usuario')}}}`, password: 'ClaveIncorrecta1' } }), [
    "pm.test('401 o 409 (cuenta bloqueada)', () => pm.expect([401, 409]).to.include(pm.response.code));",
  ]);

agregar(
  loginFallido(1),
  loginFallido(2),
  loginFallido(3),
  item('Cierre temporal: la Empleada ve el comercio CERRADO_TEMPORALMENTE (el bloqueo de la cuenta del Dueño lo cerro)', req('GET', '/comercios/perfil', { token: TOKEN_EMPLEADO, comercio: COM }), [
    status(200),
    "pm.test('Estado CERRADO_TEMPORALMENTE', () => pm.expect(pm.response.json().data.estado).to.eql('CERRADO_TEMPORALMENTE'));",
  ]),
  accionPedido('Cierre temporal: la Empleada no puede aceptar un pedido nuevo (409 COMERCIO_SIN_OPERACION)', TOKEN_EMPLEADO, 'pendiente', 'aceptar', 409, {
    extra: [codigoEs('COMERCIO_SIN_OPERACION'), mensajeEs('El comercio no está operativo: no podés aceptar pedidos nuevos. Sí podés rechazarlos.')],
  }),
  accionPedido('Cierre temporal: la Empleada si puede rechazarlo (con reembolso)', TOKEN_EMPLEADO, 'pendiente', 'rechazar', 200, { cuerpo: MOTIVO, extra: PEDIDO_REDUCIDO }),
  accionPedido('Cierre temporal: la Empleada despacha un pedido en preparacion', TOKEN_EMPLEADO, 'preparacion', 'despachar', 200),
  accionPedido('Cierre temporal: la Empleada entrega el pedido listo para retirar', TOKEN_EMPLEADO, 'preparacion', 'entregar', 200),
  accionPedido('Cierre temporal: la Empleada anula un pedido en preparacion', TOKEN_EMPLEADO, 'anular2', 'anular', 200, { cuerpo: MOTIVO }),
  item('Cierre temporal: la Empleada si puede editar productos', req('PATCH', `/productos/${PROD}/estado`, { token: TOKEN_EMPLEADO, comercio: COM, rawBody: '{"estado": "AGOTADO"}' }), [status(200)]),
  item('Cierre temporal: la Empleada si puede editar descripcion y telefono', req('PUT', DATOS, { token: TOKEN_EMPLEADO, comercio: COM, rawBody: datosOk('Con cierre temporal', '+5492964111222') }), [
    status(200),
    "pm.test('Estado CERRADO_TEMPORALMENTE', () => pm.expect(pm.response.json().data.estado).to.eql('CERRADO_TEMPORALMENTE'));",
  ]),
  item('Cierre temporal: la Empleada no puede cerrar (409 COMERCIO_NO_OPERATIVO)', req('PUT', '/comercios/cerrar', { token: TOKEN_EMPLEADO, comercio: COM, body: {} }), [status(409), codigoEs('COMERCIO_NO_OPERATIVO')]),
  item('Cierre temporal: la Empleada no puede abrir (409 COMERCIO_NO_OPERATIVO)', req('PUT', '/comercios/abrir', { token: TOKEN_EMPLEADO, comercio: COM, body: {} }), [status(409), codigoEs('COMERCIO_NO_OPERATIVO')]),
);

const diecisiete = [
  ['POST', '/productos', productoCuerpo('X', 1)],
  ['PUT', `/productos/${PROD}`, productoCuerpo('X', 1)],
  ['PATCH', `/productos/${PROD}/estado`, '{"estado": "AGOTADO"}'],
  ['POST', `/productos/${PROD}/cloudinary/firma`, '{}'],
  ['POST', `/productos/${PROD}/imagenes`, `{"url": "${urlImagen('x')}", "orden": 0, "esPrincipal": true}`],
  ['DELETE', `/productos/${PROD}/imagenes/${IMG1}`, undefined],
  ['PATCH', `/productos/${PROD}/imagenes/${IMG1}/orden`, '{"orden": 1}'],
  ['POST', `/productos/${PROD}/imagenes/${IMG1}/recorte/firma`, '{}'],
  ['PATCH', `/productos/${PROD}/imagenes/${IMG1}/url`, `{"url": "${urlImagen('y')}"}`],
  ['PUT', DATOS, datosOk('x', '+5492964111222')],
  ['PUT', '/comercios/cerrar', '{}'],
  ['PUT', '/comercios/abrir', '{}'],
  ['PUT', `/pedidos/comercio/${P('flujo')}/aceptar`, '{}'],
  ['PUT', `/pedidos/comercio/${P('flujo')}/rechazar`, '{"motivo": "SIN_STOCK"}'],
  ['PUT', `/pedidos/comercio/${P('flujo')}/despachar`, '{}'],
  ['PUT', `/pedidos/comercio/${P('flujo')}/entregar`, '{}'],
  ['PUT', `/pedidos/comercio/${P('flujo')}/anular`, '{"motivo": "SIN_STOCK"}'],
];

agregar(
  item('Relacion inactiva: se desactiva a la Empleada (atajo de test)', req('PUT', `/test/comercios/${COM}/empleados/{{${v('e_id')}}}/estado`, { body: {}, query: 'estado=INACTIVO' }), [status(200)]),
  ...diecisiete.map(([metodo, ruta, cuerpo]) =>
    item(`Relacion inactiva: ${metodo} ${ruta.replace(/\{\{[^}]+\}\}/g, ':id')} da el mismo 404`, req(metodo, ruta, { token: TOKEN_EMPLEADO, comercio: COM, rawBody: cuerpo }), NO_DISPONIBLE),
  ),
  item('Relacion inactiva: un cuerpo invalido tambien da 404 (el resolver corre antes de validar)', req('PUT', DATOS, { token: TOKEN_EMPLEADO, comercio: COM, rawBody: '{"telefono": ""}' }), NO_DISPONIBLE),
  item('Relacion inactiva: las notificaciones con el header dan el mismo 404', req('GET', '/notificaciones', { token: TOKEN_EMPLEADO, comercio: COM }), NO_DISPONIBLE),
  item('Relacion inactiva: el contador de notificaciones con el header da el mismo 404', req('GET', '/notificaciones/no-leidas/contador', { token: TOKEN_EMPLEADO, comercio: COM }), NO_DISPONIBLE),
  item('Relacion inactiva: sin header ve sus notificaciones de Cliente', req('GET', '/notificaciones', { token: TOKEN_EMPLEADO }), [status(200)]),
  item('Relacion inactiva: se reactiva a la Empleada (atajo de test)', req('PUT', `/test/comercios/${COM}/empleados/{{${v('e_id')}}}/estado`, { body: {}, query: 'estado=ACTIVO' }), [status(200)]),
  item('Relacion inactiva: reactivada vuelve a operar', req('PUT', DATOS, { token: TOKEN_EMPLEADO, comercio: COM, rawBody: datosOk('Reactivada', '+5492964111222') }), [status(200)]),
  ...diecisiete.slice(0, 6).map(([metodo, ruta, cuerpo]) =>
    item(`Cliente sin relacion: ${metodo} ${ruta.replace(/\{\{[^}]+\}\}/g, ':id')} con header da el mismo 404`, req(metodo, ruta, { token: TOKEN_AJENO, comercio: COM, rawBody: cuerpo }), NO_DISPONIBLE),
  ),
  ...diecisiete.slice(10, 13).map(([metodo, ruta, cuerpo]) =>
    item(`Cliente sin relacion: ${metodo} ${ruta.replace(/\{\{[^}]+\}\}/g, ':id')} con header da el mismo 404`, req(metodo, ruta, { token: TOKEN_AJENO, comercio: COM, rawBody: cuerpo }), NO_DISPONIBLE),
  ),
  item('Cliente sin relacion: sin header es 400', req('PUT', DATOS, { token: TOKEN_AJENO, rawBody: datosOk('x', '+5492964111222') }), [status(400)]),
  item('Administrador: las escrituras delegables son 403', req('PUT', DATOS, { token: 'token_admin', comercio: COM, rawBody: datosOk('x', '+5492964111222') }), [status(403)]),
  item('Notificaciones: un Cliente con el header de un comercio donde no es Empleado recibe el mismo 404', req('GET', '/notificaciones', { token: TOKEN_AJENO, comercio: COM }), NO_DISPONIBLE),
  item('Notificaciones: el contador con el header ajeno recibe el mismo 404', req('GET', '/notificaciones/no-leidas/contador', { token: TOKEN_AJENO, comercio: COM }), NO_DISPONIBLE),
  item('Notificaciones: un header no numerico es 400', req('GET', '/notificaciones', { token: TOKEN_AJENO, comercio: 'abc' }), [status(400)]),
  item('Notificaciones: sin header el Cliente ve las suyas', req('GET', '/notificaciones', { token: TOKEN_AJENO }), [status(200)]),
  item('Notificaciones: la Empleada activa con el header de su comercio recibe 200', req('GET', '/notificaciones', { token: TOKEN_EMPLEADO, comercio: COM }), [status(200)]),
  item('Notificaciones: el Administrador sigue ignorando el header', req('GET', '/notificaciones', { token: 'token_admin', comercio: 'abc' }), [status(200)]),
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
const claves = ['com', 'clon', 'cat', 'cat_nombre', 'cloud', 'prod', 'prodD', 'img1', 'img2', 'archivo', 'inv_codigo', 'cuit_tmp', 'dni_rep_tmp',
  'd_email', 'd_usuario', 'd_password', 'd_dni', 'd_codigo', 'd_token', 'd_id',
  'e_email', 'e_usuario', 'e_password', 'e_dni', 'e_codigo', 'e_token', 'e_id',
  'c_email', 'c_usuario', 'c_password', 'c_dni', 'c_codigo', 'c_token', 'c_id',
  'x_email', 'x_usuario', 'x_password', 'x_dni', 'x_codigo', 'x_token', 'x_id',
  'ped_flujo', 'ped_rechazo', 'ped_anula', 'ped_manual', 'ped_pendiente', 'ped_preparacion', 'ped_anular2'].map(v);
const existentes = new Set(environment.values.map((x) => x.key));
for (const key of claves) {
  if (!existentes.has(key)) environment.values.push({ key, value: '', type: 'default', enabled: true });
}
fs.writeFileSync(environmentPath, JSON.stringify(environment, null, 2) + '\n', 'utf8');

console.log(`OK: carpeta "${NOMBRE_CARPETA.slice(0, 40)}..." con ${items.length} requests.`);
