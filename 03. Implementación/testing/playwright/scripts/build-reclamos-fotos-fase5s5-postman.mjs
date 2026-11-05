import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const collectionPath = path.resolve(__dirname, '../../../postman/Bajonea-MVP.postman_collection.json');
const environmentPath = path.resolve(__dirname, '../../../postman/Bajonea-Local.postman_environment.json');

const PREFIJO_CARPETA = '90 - ';
const NOMBRE_CARPETA = '90 - Reclamos Fase 5 S5 fotos (hasta 3 fotos de 5 MB por reclamo, formato validado por el contenido, todo o nada, solo las ve el Administrador, descarga con encabezados seguros, el Cliente solo ve la cantidad; requiere el Mercado Pago simulado de scripts/mp-simulado.mjs y el backend con MERCADOPAGO_API_BASE_URL)';

const v = (clave) => `rf_${clave}`;

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

const MP = '{{mp_simulado_url}}';

function reqMp(method, urlPath, query) {
  const segments = urlPath.replace(/^\//, '').split('/');
  const url = { raw: `${MP}/${segments.join('/')}${query ? `?${query}` : ''}`, host: [MP], path: segments };
  if (query) {
    url.query = query.split('&').map((par) => {
      const [key, ...resto] = par.split('=');
      return { key, value: resto.join('=') };
    });
  }
  return { method, header: [], url };
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
const mensajeDe = (texto) => prueba('Mensaje exacto', `pm.expect(pm.response.json().mensaje).to.eql(${JSON.stringify(texto)});`);
const dato = (ruta, esperado) => prueba(`${ruta} es ${esperado}`, `pm.expect(pm.response.json().data.${ruta}).to.eql(${JSON.stringify(esperado)});`);
const errorDeCampo = (campo, texto) => prueba(`Error en ${campo}: ${texto}`, `pm.expect(pm.response.json().data.${campo}).to.eql(${JSON.stringify(texto)});`);

function identidad(clave) {
  return [
    `const s = Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36);`,
    guardar(v(`${clave}_email`), `'rf.${clave}.' + s + '@bajonea.test'`),
    guardar(v(`${clave}_usuario`), `('rf${clave}' + s).slice(0, 20)`),
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
const TOKEN_DUENO = v('d_token');
const TOKEN_CLIENTE = v('c_token');
const TOKEN_OTRO = v('o_token');
const TOKEN_EMPLEADO = v('e_token');
const TOKEN_ADMIN = 'token_admin';
const CAT = `{{${v('cat')}}}`;
const PED = (clave) => `{{${v(`ped_${clave}`)}}}`;
const REC = (clave) => `{{${v(`rec_${clave}`)}}}`;
const TOTAL = (clave) => `Number(${entorno(v(`tot_${clave}`))})`;

const items = [];
const agregar = (...nuevos) => items.push(...nuevos);

function clienteNuevo(clave, nombre, tokenVar, { conDireccion = false } = {}) {
  return [
    item(
      `Registro ${nombre}`,
      req('POST', '/auth/registro/cliente', {
        body: {
          nombre,
          apellido: 'Reclamos',
          dni: `{{${v(`${clave}_dni`)}}}`,
          fechaNacimiento: '1995-05-20',
          telefono: '+5492964551238',
          nombreUsuario: `{{${v(`${clave}_usuario`)}}}`,
          email: `{{${v(`${clave}_email`)}}}`,
          password: `{{${v(`${clave}_password`)}}}`,
          aceptaTerminos: true,
          direccion: { calle: 'Calle Siempre Viva', numero: '125', pisoDepto: null, codigoPostal: '9420', localidadId: '{{localidad_id}}', principal: true },
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
    item(`Login ${nombre}`, req('POST', '/auth/login', { body: { nombreUsuario: `{{${v(`${clave}_usuario`)}}}`, password: `{{${v(`${clave}_password`)}}}` } }), [
      status(200),
      guardar(tokenVar, 'pm.response.json().data.token'),
      guardar(v(`${clave}_id`), 'pm.response.json().data.usuario.id'),
    ]),
    ...(conDireccion
      ? [item(`Direccion de ${nombre}`, req('GET', '/clientes/perfil', { token: tokenVar }), [status(200), guardar(v('c_dir'), 'pm.response.json().data.direccion.id')])]
      : []),
  ];
}

agregar(
  item('Login Administrador (sesion propia de esta carpeta)', req('POST', '/auth/login', { body: { nombreUsuario: '{{admin_usuario}}', password: '{{admin_password}}' } }), [
    status(200),
    guardar(TOKEN_ADMIN, 'pm.response.json().data.token'),
    guardar(v('admin_id'), 'pm.response.json().data.usuario.id'),
  ]),
  item(
    'Registro Dueño',
    req('POST', '/auth/registro/comercio', {
      body: {
        aceptaTerminos: true,
        razonSocial: 'Reclamos Fotos SRL',
        cuit: `{{${v('cuit_tmp')}}}`,
        condicionIva: 'RESPONSABLE_INSCRIPTO',
        tipoSociedad: 'SRL',
        domicilioFiscal: 'Direccion fiscal reclamos 100',
        fechaInicioActividades: '2020-01-01',
        nombre: `Local Reclamos Fotos {{${v('d_usuario')}}}`,
        descripcion: 'Comercio generado por la coleccion de Postman (reclamos, tramo S5)',
        telefono: '+5492964555448',
        tipoComercio: 'RESTAURANTE',
        aceptaDelivery: true,
        aceptaRetiro: true,
        nombreUsuario: `{{${v('d_usuario')}}}`,
        email: `{{${v('d_email')}}}`,
        password: `{{${v('d_password')}}}`,
        direccion: { calle: 'Belgrano', numero: '804', pisoDepto: null, codigoPostal: '9420', localidadId: '{{localidad_id}}', principal: false },
        horarios: horariosTodosLosDias,
        nombreRepresentante: 'Carlos',
        apellidoRepresentante: 'Sanchez',
        dniRepresentante: `{{${v('dni_rep_tmp')}}}`,
        telefonoRepresentante: '+5492964701107',
        fechaNacimientoRepresentante: '1988-04-04',
        fotoPerfilUrl: 'https://res.cloudinary.com/demo/image/upload/postman-reclamos-fotos.jpg',
        redesSociales: [{ tipo: 'INSTAGRAM', url: 'instagram.com/reclamosfotos' }],
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
  item('Login Dueño', req('POST', '/auth/login', { body: { nombreUsuario: `{{${v('d_usuario')}}}`, password: `{{${v('d_password')}}}` } }), [
    status(200),
    guardar(TOKEN_DUENO, 'pm.response.json().data.token'),
    guardar(v('d_id'), 'pm.response.json().data.usuario.id'),
  ]),
  item('Administrador busca el comercio pendiente del Dueño', req('GET', '/administrador/comercios/pendientes', { token: TOKEN_ADMIN }), [
    status(200),
    `const c = pm.response.json().data.find((x) => x.emailCuenta === ${entorno(v('d_email'))}.toLowerCase());`,
    "pm.test('El comercio del Dueño esta pendiente', () => pm.expect(c).to.exist);",
    guardar(v('com'), 'c.id'),
  ]),
  item('Administrador aprueba el comercio', req('PUT', `/administrador/comercios/${COM}/resolver`, { token: TOKEN_ADMIN, body: { aprobar: true } }), [status(200)]),
  item('Atajo de test: el Dueño vincula una cuenta de Mercado Pago simulada y el comercio pasa a APTO_VENTA', req('POST', `/test/duenos/{{${v('d_id')}}}/mercadopago-simulada`, { body: {} }), [status(200)]),
  item(
    'Administrador crea la categoria del producto',
    req('POST', '/categorias', { token: TOKEN_ADMIN, rawBody: `{"nombre": "{{${v('cat_nombre')}}}"}` }),
    [status(201), guardar(v('cat'), 'pm.response.json().data.id')],
    [guardar(v('cat_nombre'), "'Cat Reclamos Fotos ' + Date.now().toString(36)")],
  ),
  item('El Dueño crea el producto', req('POST', '/productos', { token: TOKEN_DUENO, comercio: COM, rawBody: `{"nombre": "Producto Reclamos Fotos", "descripcion": "Producto de los reclamos", "precio": 1500, "categoriaId": ${CAT}}` }), [
    status(201),
    guardar(v('prod'), 'pm.response.json().data.id'),
  ]),
  ...clienteNuevo('c', 'Carla', TOKEN_CLIENTE, { conDireccion: true }),
  ...clienteNuevo('o', 'Olga', TOKEN_OTRO),
  ...clienteNuevo('e', 'Elena', TOKEN_EMPLEADO),
  item('El Dueño invita a Elena al equipo', req('POST', '/comercios/equipo/invitaciones', { token: TOKEN_DUENO, comercio: COM, body: { email: `{{${v('e_email')}}}` } }), [status(201)]),
  item('Bypass test - codigo de la invitacion de Elena', req('GET', '/test/invitaciones-empleado/codigo', { query: `email={{${v('e_email')}}}&comercioId=${COM}` }), [
    status(200),
    guardar(v('e_inv_codigo'), 'pm.response.json().data'),
  ]),
  item('Elena acepta la invitacion', req('POST', '/auth/invitaciones-empleado/aceptar', { body: { email: `{{${v('e_email')}}}`, codigo: `{{${v('e_inv_codigo')}}}` } }), [status(200)]),
);

const accion = (nombre, token, clave, ruta, codigo = 200, comprobaciones = []) =>
  item(nombre, req('PUT', `/pedidos/comercio/${PED(clave)}/${ruta}`, { token, comercio: COM, body: {} }), [status(codigo), ...comprobaciones]);

function pedidoEnCurso(clave, tipo) {
  const direccion = tipo === 'DOMICILIO' ? `{{${v('c_dir')}}}` : 'null';
  return [
    item(`[pedido ${clave}] El Cliente vacia el carrito`, req('DELETE', '/carrito', { token: TOKEN_CLIENTE }), [`pm.test('Carrito vaciado o ya vacio', () => pm.expect([200, 404]).to.include(pm.response.code));`]),
    item(`[pedido ${clave}] El Cliente agrega el producto al carrito`, req('POST', '/carrito/items', { token: TOKEN_CLIENTE, rawBody: `{"productoId": {{${v('prod')}}}, "cantidad": 1}` }), [status(201)]),
    item(
      `[pedido ${clave}] El Cliente confirma el pedido (${tipo === 'DOMICILIO' ? 'a domicilio' : 'retiro en el local'})`,
      req('POST', '/pedidos/cliente', { token: TOKEN_CLIENTE, rawBody: `{"tipoEntrega": "${tipo}", "direccionId": ${direccion}}` }),
      [status(201), guardar(v(`ped_${clave}`), 'pm.response.json().data.id'), guardar(v(`tot_${clave}`), 'pm.response.json().data.total')],
    ),
    item(`[pedido ${clave}] "Ir a pagar" crea la preferencia en Mercado Pago`, req('POST', `/pedidos/cliente/${PED(clave)}/pago`, { token: TOKEN_CLIENTE }), [status(200)]),
    item(`[pedido ${clave}] El webhook confirma el pago (id numerico del Mercado Pago simulado)`, req('POST', '/webhooks/mercadopago', { query: `pedidoId=${PED(clave)}&data.id={{${v(`idpago_${clave}`)}}}&type=payment` }), [status(200)], [
      guardar(v(`idpago_${clave}`), `100000 + Number(${entorno(v(`ped_${clave}`))})`),
    ]),
  ];
}

function pedidoEntregado(clave, tipo) {
  return [
    ...pedidoEnCurso(clave, tipo),
    accion(`[pedido ${clave}] El Dueño acepta el pedido`, TOKEN_DUENO, clave, 'aceptar'),
    accion(`[pedido ${clave}] El Dueño lo despacha`, TOKEN_DUENO, clave, 'despachar'),
    tipo === 'DOMICILIO'
      ? item(`[pedido ${clave}] El Cliente confirma que lo recibio`, req('PUT', `/pedidos/cliente/${PED(clave)}/entregar`, { token: TOKEN_CLIENTE, body: {} }), [status(200), dato('estado', 'ENTREGADO')])
      : accion(`[pedido ${clave}] El Dueño lo entrega en el local`, TOKEN_DUENO, clave, 'entregar', 200, [prueba('Queda ENTREGADO', "pm.expect(pm.response.json().data.estado).to.eql('ENTREGADO');")]),
  ];
}

const envejecerEntrega = (clave, dias) =>
  item(`[pedido ${clave}] Atajo de test: el pedido se entrego hace ${dias} dias mas`, req('PUT', `/test/pedidos/${PED(clave)}/envejecer-entrega`, { body: {}, query: `dias=${dias}` }), [status(200)]);

const reclamar = (nombre, clave, token, motivo, descripcion, codigo, comprobaciones = []) =>
  item(nombre, req('POST', `/pedidos/cliente/${PED(clave)}/reclamo`, { token, body: motivo === undefined ? { descripcion } : { motivo, descripcion } }), [status(codigo), ...comprobaciones]);

const DESCRIPCION = 'Faltó la bebida del combo y vino frío';

const bloqueDelCliente = (nombre, clave, comprobaciones) =>
  item(nombre, req('GET', '/pedidos/cliente', { token: TOKEN_CLIENTE }), [
    status(200),
    `const p = pm.response.json().data.find((x) => x.id === Number(${entorno(v(`ped_${clave}`))}));`,
    "pm.test('Encuentra el pedido', () => pm.expect(p).to.exist);",
    ...comprobaciones,
  ]);

const resolver = (nombre, clave, cuerpo, codigo, comprobaciones = [], token = TOKEN_ADMIN) =>
  item(nombre, req('PUT', `/administrador/reclamos/${REC(clave)}/resolver`, { token, body: cuerpo }), [status(codigo), ...comprobaciones]);

const detalle = (nombre, clave, comprobaciones, codigo = 200, token = TOKEN_ADMIN) =>
  item(nombre, req('GET', `/administrador/reclamos/${REC(clave)}`, { token }), [status(codigo), ...(codigo === 200 ? ['const d = pm.response.json().data;'] : []), ...comprobaciones]);

const ultimoReembolsoDelSimulado = (nombre, comprobaciones) =>
  item(nombre, reqMp('GET', '/__control/reembolsos'), [status(200), 'const lista = pm.response.json().reembolsos;', 'const ultimo = lista[lista.length - 1];', ...comprobaciones]);

const avisos = (nombre, token, comercio, tipo, clave, cantidad, texto) =>
  item(nombre, req('GET', '/notificaciones', { token, comercio }), [
    status(200),
    `const suyos = pm.response.json().data.filter((n) => n.tipo === '${tipo}' && n.entidadId === Number(${entorno(v(`ped_${clave}`))}));`,
    `pm.test('Hay ${cantidad} aviso(s) ${tipo} de este pedido', () => pm.expect(suyos.length).to.eql(${cantidad}));`,
    ...(texto ? [`pm.test('El texto es el aprobado', () => pm.expect(suyos[0].mensaje).to.eql(${texto}));`] : []),
  ]);

const tot = (clave) => `Number(${entorno(v(`tot_${clave}`))})`;

const FIXTURES = path.resolve(__dirname, '../fixtures');
const GENERADOS = path.join(FIXTURES, 'generados');
const CINCO_MB = 5 * 1024 * 1024;

function escribirFixture(destino, buffer) {
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  if (!fs.existsSync(destino) || fs.statSync(destino).size !== buffer.length) fs.writeFileSync(destino, buffer);
}

function jpegDe(tamano) {
  const b = Buffer.alloc(tamano, 7);
  b[0] = 0xff;
  b[1] = 0xd8;
  b[2] = 0xff;
  return b;
}

escribirFixture(path.join(FIXTURES, 'reclamo-foto.jpg'), jpegDe(1200));
const webp = Buffer.alloc(200, 0);
webp.write('RIFF', 0, 'ascii');
webp.write('WEBP', 8, 'ascii');
escribirFixture(path.join(FIXTURES, 'reclamo-foto.webp'), webp);
const heic = Buffer.alloc(64, 0);
heic.write('ftypheic', 4, 'ascii');
escribirFixture(path.join(FIXTURES, 'reclamo-foto.heic'), heic);
escribirFixture(path.join(FIXTURES, 'reclamo-texto-disfrazado.jpg'), Buffer.from('esto no es una imagen, solo texto con extension jpg', 'utf8'));
escribirFixture(path.join(GENERADOS, 'foto-5mb-justa.jpg'), jpegDe(CINCO_MB));
escribirFixture(path.join(GENERADOS, 'foto-5mb-mas-uno.jpg'), jpegDe(CINCO_MB + 1));

const F_JPG = 'fixtures/reclamo-foto.jpg';
const F_PNG = 'fixtures/bajonea-e2e-producto.png';
const F_WEBP = 'fixtures/reclamo-foto.webp';
const F_HEIC = 'fixtures/reclamo-foto.heic';
const F_TEXTO = 'fixtures/reclamo-texto-disfrazado.jpg';
const F_PDF = 'fixtures/documento-prueba.pdf';
const F_JUSTA = 'fixtures/generados/foto-5mb-justa.jpg';
const F_GRANDE = 'fixtures/generados/foto-5mb-mas-uno.jpg';

function reqMultipart(urlPath, { token, fotos = [], motivo = 'FALTAN_PRODUCTOS', descripcion = DESCRIPCION }) {
  const header = token ? [{ key: 'Authorization', value: `Bearer {{${token}}}` }] : [];
  const segments = urlPath.replace(/^\//, '').split('/');
  const formdata = [{ key: 'reclamo', type: 'text', value: JSON.stringify({ motivo, descripcion }), contentType: 'application/json' }];
  fotos.forEach((src) => formdata.push({ key: 'fotos', type: 'file', src }));
  return { method: 'POST', header, url: { raw: `{{base_url}}/${segments.join('/')}`, host: ['{{base_url}}'], path: segments }, body: { mode: 'formdata', formdata } };
}

const reclamarConFotos = (nombre, clave, token, fotos, codigo, comprobaciones = []) =>
  item(nombre, reqMultipart(`/pedidos/cliente/${PED(clave)}/reclamo`, { token, fotos }), [status(codigo), ...comprobaciones]);

const codigoDe = (codigo) => prueba(`data.codigo es ${codigo}`, `pm.expect(pm.response.json().data.codigo).to.eql(${JSON.stringify(codigo)});`);

const sinReclamo = (nombre, clave) =>
  bloqueDelCliente(nombre, clave, [
    prueba('Sigue sin reclamo y se puede reclamar', 'pm.expect(p.reclamo.id === undefined).to.eql(true); pm.expect(p.reclamo.puedeReclamar).to.eql(true);'),
  ]);

const descargar = (nombre, recClave, fotoVar, token, codigo, comprobaciones = []) =>
  item(nombre, req('GET', `/administrador/reclamos/${REC(recClave)}/fotos/{{${v(fotoVar)}}}`, { token }), [status(codigo), ...comprobaciones]);

agregar(
  ...pedidoEntregado('dom1', 'DOMICILIO'),
  ...pedidoEntregado('dom2', 'DOMICILIO'),
  ...pedidoEntregado('dom3', 'DOMICILIO'),
  ...pedidoEntregado('dom4', 'DOMICILIO'),
  ...pedidoEntregado('dom5', 'DOMICILIO'),
);

// ----------------------------------------------------------------------------- creacion con fotos
agregar(
  reclamarConFotos('Sin fotos (multipart con solo la parte del reclamo): 201 y cero fotos', 'dom1', TOKEN_CLIENTE, [], 201, [
    dato('cantidadFotos', 0),
    guardar(v('rec_dom1'), 'pm.response.json().data.id'),
  ]),
  reclamarConFotos('Una foto PNG: 201 y una foto', 'dom2', TOKEN_CLIENTE, [F_PNG], 201, [
    mensajeDe('Recibimos tu reclamo'),
    dato('cantidadFotos', 1),
    guardar(v('rec_dom2'), 'pm.response.json().data.id'),
  ]),
  reclamarConFotos('Tres fotos (JPG, PNG y WebP): 201 y tres fotos', 'dom3', TOKEN_CLIENTE, [F_JPG, F_PNG, F_WEBP], 201, [
    dato('cantidadFotos', 3),
    guardar(v('rec_dom3'), 'pm.response.json().data.id'),
  ]),
  item('Un envio JSON sin fotos sigue funcionando como antes', req('POST', `/pedidos/cliente/${PED('dom5')}/reclamo`, { token: TOKEN_CLIENTE, body: { motivo: 'OTRO', descripcion: DESCRIPCION } }), [
    status(201),
    dato('cantidadFotos', 0),
    guardar(v('rec_dom5'), 'pm.response.json().data.id'),
  ]),
  reclamarConFotos('La cuarta foto rechaza todo el envio: 400', 'dom4', TOKEN_CLIENTE, [F_JPG, F_PNG, F_WEBP, F_JPG], 400, [
    codigoDe('RECLAMO_FOTO_CANTIDAD_EXCEDIDA'),
    mensajeDe('Podés adjuntar hasta 3 fotos'),
  ]),
  sinReclamo('La cuarta foto no creo el reclamo', 'dom4'),
  reclamarConFotos('Un texto con extension .jpg no pasa (se valida el contenido): 400', 'dom4', TOKEN_CLIENTE, [F_TEXTO], 400, [
    codigoDe('RECLAMO_FOTO_FORMATO_NO_PERMITIDO'),
    mensajeDe('Solo se aceptan fotos en formato JPG, PNG o WebP'),
  ]),
  reclamarConFotos('Un PDF no es una foto: 400', 'dom4', TOKEN_CLIENTE, [F_PDF], 400, [codigoDe('RECLAMO_FOTO_FORMATO_NO_PERMITIDO')]),
  reclamarConFotos('Una foto HEIC de iPhone se rechaza con un mensaje claro: 400', 'dom4', TOKEN_CLIENTE, [F_HEIC], 400, [
    codigoDe('RECLAMO_FOTO_FORMATO_NO_PERMITIDO'),
    mensajeDe('Las fotos HEIC de iPhone no se pueden adjuntar. Usá una foto en formato JPG, PNG o WebP'),
  ]),
  reclamarConFotos('Una foto de 5 MB + 1 byte: 400 con el limite', 'dom4', TOKEN_CLIENTE, [F_GRANDE], 400, [
    codigoDe('RECLAMO_FOTO_TAMANO_EXCEDIDO'),
    mensajeDe('Una foto supera el máximo de 5 MB'),
  ]),
  reclamarConFotos('Una foto valida junto a una invalida rechaza todo: 400', 'dom4', TOKEN_CLIENTE, [F_PNG, F_TEXTO], 400, [codigoDe('RECLAMO_FOTO_FORMATO_NO_PERMITIDO')]),
  sinReclamo('Ningun envio invalido creo el reclamo', 'dom4'),
  reclamarConFotos('Otro Cliente reclamando un pedido ajeno con fotos: 404', 'dom4', TOKEN_OTRO, [F_PNG], 404),
  reclamarConFotos('El Dueño no puede crear reclamos: 403', 'dom4', TOKEN_DUENO, [F_PNG], 403),
  reclamarConFotos('Sin token: 401', 'dom4', undefined, [F_PNG], 401),
  reclamarConFotos('Una foto de exactamente 5 MB se acepta: 201', 'dom4', TOKEN_CLIENTE, [F_JUSTA], 201, [
    dato('cantidadFotos', 1),
    guardar(v('rec_dom4'), 'pm.response.json().data.id'),
  ]),
  reclamarConFotos('Un segundo envio del mismo pedido con fotos: 409', 'dom3', TOKEN_CLIENTE, [F_PNG, F_PNG], 409, [mensajeDe('Ya hiciste un reclamo por este pedido.')]),
);

// ----------------------------------------------------------------------------- lo que ve cada rol
agregar(
  detalle('El Administrador ve las tres fotos del reclamo en el orden de envio, sin el contenido', 'dom3', [
    prueba('Tres fotos con orden, nombre, tipo y tamaño', "pm.expect(d.fotos.length).to.eql(3); pm.expect(d.fotos.map((f) => f.orden)).to.eql([1, 2, 3]); pm.expect(d.fotos.map((f) => f.tipoContenido)).to.eql(['image/jpeg', 'image/png', 'image/webp']); pm.expect(d.fotos[0].nombre).to.eql('reclamo-foto.jpg'); pm.expect(d.fotos[0].tamanoBytes).to.eql(1200); d.fotos.forEach((f) => pm.expect(f.contenido === undefined).to.eql(true));"),
    guardar(v('foto_dom3_1'), 'd.fotos[0].id'),
    guardar(v('foto_dom3_2'), 'd.fotos[1].id'),
    guardar(v('foto_dom3_3'), 'd.fotos[2].id'),
  ]),
  detalle('El segundo envio rechazado no dejo fotos huerfanas: el reclamo de dom3 sigue con tres', 'dom3', [prueba('Siguen tres fotos', 'pm.expect(d.fotos.length).to.eql(3);')]),
  detalle('El reclamo sin fotos trae la lista vacia', 'dom1', [prueba('Lista vacia', 'pm.expect(d.fotos).to.eql([]);')]),
  detalle('El reclamo de una sola foto', 'dom2', [prueba('Una foto', 'pm.expect(d.fotos.length).to.eql(1);'), guardar(v('foto_dom2_1'), 'd.fotos[0].id')]),
  descargar('El Administrador descarga una foto: tipo real y encabezados seguros', 'dom3', 'foto_dom3_2', TOKEN_ADMIN, 200, [
    prueba('Content-Type, nosniff, inline y sin cache', "pm.expect(pm.response.headers.get('Content-Type')).to.eql('image/png'); pm.expect(pm.response.headers.get('X-Content-Type-Options')).to.eql('nosniff'); pm.expect(pm.response.headers.get('Content-Disposition')).to.match(/^inline/); pm.expect(pm.response.headers.get('Cache-Control')).to.include('no-store');"),
    prueba('El contenido es el PNG enviado', 'pm.expect(pm.response.stream.length).to.be.greaterThan(100);'),
  ]),
  descargar('Una foto de otro reclamo: 404', 'dom3', 'foto_dom2_1', TOKEN_ADMIN, 404),
  item('Una foto inexistente: 404', req('GET', `/administrador/reclamos/${REC('dom3')}/fotos/999999999`, { token: TOKEN_ADMIN }), [status(404)]),
  item('Un reclamo inexistente: 404', req('GET', `/administrador/reclamos/999999999/fotos/{{${v('foto_dom3_1')}}}`, { token: TOKEN_ADMIN }), [status(404)]),
  descargar('El Cliente no descarga las fotos: 403', 'dom3', 'foto_dom3_1', TOKEN_CLIENTE, 403),
  descargar('El Dueño no descarga las fotos: 403', 'dom3', 'foto_dom3_1', TOKEN_DUENO, 403),
  descargar('El Empleado no descarga las fotos: 403', 'dom3', 'foto_dom3_1', TOKEN_EMPLEADO, 403),
  descargar('Sin token: 401', 'dom3', 'foto_dom3_1', undefined, 401),
  bloqueDelCliente('El Cliente solo ve la cantidad de fotos, nunca las fotos', 'dom3', [
    prueba('cantidadFotos 3 y sin lista', "pm.expect(p.reclamo.cantidadFotos).to.eql(3); pm.expect(p.reclamo.fotos === undefined).to.eql(true); pm.expect(JSON.stringify(p.reclamo)).to.not.include('image/');"),
  ]),
  item('El Dueño no recibe rastro de las fotos en sus pedidos', req('GET', '/pedidos/comercio', { token: TOKEN_DUENO, comercio: COM }), [
    status(200),
    prueba('Sin cantidadFotos ni fotos', 'const texto = JSON.stringify(pm.response.json().data); pm.expect(texto).to.not.match(/cantidadFotos|"fotos"/);'),
  ]),
  item('El Empleado no recibe reclamo ni fotos en sus pedidos', req('GET', '/pedidos/comercio', { token: TOKEN_EMPLEADO, comercio: COM }), [
    status(200),
    prueba('Sin reclamo ni fotos', 'const texto = JSON.stringify(pm.response.json().data); pm.expect(texto).to.not.match(/"reclamo"|cantidadFotos|"fotos"/);'),
  ]),
  item('Resolver (rechazo) un reclamo con fotos', req('PUT', `/administrador/reclamos/${REC('dom3')}/resolver`, { token: TOKEN_ADMIN, body: { tipo: 'RECHAZO', motivo: 'Revisamos las fotos y el pedido salió completo' } }), [
    status(200),
    prueba('Rechazado y las fotos siguen ahi', "const d = pm.response.json().data; pm.expect(d.estado).to.eql('RECHAZADO'); pm.expect(d.fotos.length).to.eql(3);"),
  ]),
  descargar('Con el reclamo resuelto la foto sigue disponible', 'dom3', 'foto_dom3_1', TOKEN_ADMIN, 200, [
    prueba('image/jpeg', "pm.expect(pm.response.headers.get('Content-Type')).to.eql('image/jpeg');"),
  ]),
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
const claves = ['com', 'cat', 'cat_nombre', 'prod', 'cuit_tmp', 'dni_rep_tmp', 'admin_id',
  'd_email', 'd_usuario', 'd_password', 'd_dni', 'd_codigo', 'd_token', 'd_id',
  'c_email', 'c_usuario', 'c_password', 'c_dni', 'c_codigo', 'c_token', 'c_id', 'c_dir',
  'o_email', 'o_usuario', 'o_password', 'o_dni', 'o_codigo', 'o_token', 'o_id',
  'e_email', 'e_usuario', 'e_password', 'e_dni', 'e_codigo', 'e_token', 'e_id', 'e_inv_codigo',
  'foto_dom3_1', 'foto_dom3_2', 'foto_dom3_3', 'foto_dom2_1',
  ...['dom1', 'dom2', 'dom3', 'dom4', 'dom5'].flatMap((p) => [`ped_${p}`, `tot_${p}`, `idpago_${p}`, `rec_${p}`])].map(v);
const existentes = new Set(environment.values.map((x) => x.key));
for (const key of claves) {
  if (!existentes.has(key)) environment.values.push({ key, value: '', type: 'default', enabled: true });
}
fs.writeFileSync(environmentPath, JSON.stringify(environment, null, 2) + '\n', 'utf8');

console.log(`OK: carpeta "${NOMBRE_CARPETA.slice(0, 40)}..." con ${items.length} requests.`);
