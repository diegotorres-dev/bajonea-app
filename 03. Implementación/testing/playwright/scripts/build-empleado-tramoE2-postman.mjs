import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const collectionPath = path.resolve(__dirname, '../../../postman/Bajonea-MVP.postman_collection.json');
const environmentPath = path.resolve(__dirname, '../../../postman/Bajonea-Local.postman_environment.json');

const NOMBRE_FOLDER = '57 - Rol Empleado E2 (acceso: resolver de actor, lista blanca de lecturas, perfil reducido, 404 idéntico y mis-comercios del Empleado)';

const v = (clave) => `e2_${clave}`;

function req(method, urlPath, { body, token, comercio, query } = {}) {
  const header = [];
  if (token) header.push({ key: 'Authorization', value: `Bearer {{${token}}}` });
  if (comercio !== undefined) header.push({ key: 'X-Comercio-Id', value: comercio });
  if (body !== undefined) header.push({ key: 'Content-Type', value: 'application/json' });
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
const mensajeEs = (texto) => `pm.test('El mensaje es el esperado', () => pm.expect(pm.response.json().mensaje).to.eql(${JSON.stringify(texto)}));`;

function identidad(clave) {
  return [
    `const s = Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36);`,
    guardar(v(`${clave}_email`), `'e2.${clave}.' + s + '@bajonea.test'`),
    guardar(v(`${clave}_usuario`), `('e2${clave}' + s).slice(0, 20)`),
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

const registroComercio = (cuit, dniRep, usuario, email, password, nombre) => ({
  razonSocial: `${nombre} SRL`,
  cuit,
  condicionIva: 'RESPONSABLE_INSCRIPTO',
  tipoSociedad: 'SRL',
  domicilioFiscal: 'Direccion fiscal E2 100',
  fechaInicioActividades: '2020-01-01',
  nombre,
  descripcion: 'Comercio generado por la coleccion de Postman (rol Empleado, E2)',
  telefono: '+5492964555444',
  emailContacto: email,
  tipoComercio: 'RESTAURANTE',
  aceptaDelivery: false,
  aceptaRetiro: true,
  nombreUsuario: usuario,
  email,
  password,
  direccion: { calle: 'Belgrano', numero: '800', pisoDepto: null, codigoPostal: '9420', localidadId: '{{localidad_id}}', principal: false },
  horarios: horariosTodosLosDias,
  nombreRepresentante: 'Carlos',
  apellidoRepresentante: 'Sanchez',
  dniRepresentante: dniRep,
  telefonoRepresentante: '+5492964701103',
  fechaNacimientoRepresentante: '1988-04-04',
  fotoPerfilUrl: 'https://res.cloudinary.com/demo/image/upload/postman-empleado-e2.jpg',
  redesSociales: [{ tipo: 'INSTAGRAM', url: 'instagram.com/empleadoe2' }],
});

const items = [];
const agregar = (...nuevos) => items.push(...nuevos);

agregar(
  item('Login Administrador (sesion propia de esta carpeta)', req('POST', '/auth/login', { body: { nombreUsuario: '{{admin_usuario}}', password: '{{admin_password}}' } }), [
    status(200),
    guardar('token_admin', 'pm.response.json().data.token'),
  ]),
);

function altaDueno(clave, nombre) {
  const email = `{{${v(`${clave}_email`)}}}`;
  return [
    item(
      `Registro Dueño ${clave}`,
      req('POST', '/auth/registro/comercio', {
        body: registroComercio(`{{${v('cuit_tmp')}}}`, `{{${v('dni_rep_tmp')}}}`, `{{${v(`${clave}_usuario`)}}}`, email, `{{${v(`${clave}_password`)}}}`, nombre),
      }),
      [status(201)],
      [...identidad(clave), ...datosDueno],
    ),
    item(`Bypass test - codigo de verificacion Dueño ${clave}`, req('GET', '/test/token-verificacion', { query: `email=${email}` }), [
      status(200),
      guardar(v(`${clave}_codigo_verif`), 'pm.response.json().data'),
    ]),
    item(`Verificar cuenta Dueño ${clave}`, req('POST', '/auth/verificar', { body: { email, codigo: `{{${v(`${clave}_codigo_verif`)}}}` } }), [status(200)]),
    item(`Administrador busca el comercio pendiente del Dueño ${clave}`, req('GET', '/administrador/comercios/pendientes', { token: 'token_admin' }), [
      status(200),
      `const c = pm.response.json().data.find((x) => x.emailCuenta === ${entorno(v(`${clave}_email`))}.toLowerCase());`,
      `pm.test('El comercio del Dueño ${clave} esta pendiente', () => pm.expect(c).to.exist);`,
      guardar(v(`com_${clave}`), 'c.id'),
    ]),
  ];
}

function altaCliente(clave, { login = false } = {}) {
  const email = `{{${v(`${clave}_email`)}}}`;
  const pasos = [
    item(
      `Registro Cliente ${clave}`,
      req('POST', '/auth/registro/cliente', {
        body: {
          nombre: 'Clienta',
          apellido: 'Acceso',
          dni: `{{${v(`${clave}_dni`)}}}`,
          fechaNacimiento: '1995-05-20',
          telefono: '+5492964551235',
          nombreUsuario: `{{${v(`${clave}_usuario`)}}}`,
          email,
          password: `{{${v(`${clave}_password`)}}}`,
          aceptaTerminos: true,
          direccion: { calle: 'Calle Siempre Viva', numero: '123', pisoDepto: null, codigoPostal: '9420', localidadId: '{{localidad_id}}', principal: true },
        },
      }),
      [status(201)],
      identidad(clave),
    ),
    item(`Bypass test - codigo de verificacion Cliente ${clave}`, req('GET', '/test/token-verificacion', { query: `email=${email}` }), [
      status(200),
      guardar(v(`${clave}_codigo_verif`), 'pm.response.json().data'),
    ]),
    item(`Verificar cuenta Cliente ${clave}`, req('POST', '/auth/verificar', { body: { email, codigo: `{{${v(`${clave}_codigo_verif`)}}}` } }), [status(200)]),
  ];
  if (login) {
    pasos.push(
      item(`Login Cliente ${clave}`, req('POST', '/auth/login', { body: { nombreUsuario: `{{${v(`${clave}_usuario`)}}}`, password: `{{${v(`${clave}_password`)}}}` } }), [
        status(200),
        guardar(v(`${clave}_token`), 'pm.response.json().data.token'),
        guardar(v(`${clave}_id`), 'pm.response.json().data.usuario.id'),
      ]),
    );
  }
  return pasos;
}

agregar(...altaDueno('d1', 'Local Acceso Uno'));
agregar(
  item('Login Dueño d1', req('POST', '/auth/login', { body: { nombreUsuario: `{{${v('d1_usuario')}}}`, password: `{{${v('d1_password')}}}` } }), [
    status(200),
    guardar(v('d1_token'), 'pm.response.json().data.token'),
  ]),
  item('Administrador aprueba el comercio del Dueño d1', req('PUT', `/administrador/comercios/{{${v('com_d1')}}}/resolver`, { token: 'token_admin', body: { aprobar: true } }), [status(200)]),
);
agregar(...altaDueno('d2', 'Local Acceso Dos'));
agregar(
  item('Login Dueño d2', req('POST', '/auth/login', { body: { nombreUsuario: `{{${v('d2_usuario')}}}`, password: `{{${v('d2_password')}}}` } }), [
    status(200),
    guardar(v('d2_token'), 'pm.response.json().data.token'),
  ]),
  item('Administrador aprueba el comercio del Dueño d2', req('PUT', `/administrador/comercios/{{${v('com_d2')}}}/resolver`, { token: 'token_admin', body: { aprobar: true } }), [status(200)]),
);

const COM_A = `{{${v('com_d1')}}}`;
const COM_AJENO = `{{${v('com_d2')}}}`;
const TOKEN_D1 = v('d1_token');
const TOKEN_D2 = v('d2_token');
const TOKEN_EMP = v('emp_token');
const TOKEN_SR = v('sr_token');

agregar(
  item('Crear la categoria de los productos de esta carpeta', req('POST', '/categorias', { token: 'token_admin', body: { nombre: 'Categoria Acceso E2 {{$timestamp}}' } }), [
    status(201),
    guardar(v('categoria_id'), 'pm.response.json().data.id'),
  ]),
  item('El Dueño d1 crea un producto', req('POST', '/productos', { token: TOKEN_D1, comercio: COM_A, body: { nombre: 'Producto Acceso E2', precio: 1500, categoriaId: `{{${v('categoria_id')}}}` } }), [
    status(201),
  ]),
);

const clonar = (clave, estado) =>
  item(`Clonar el comercio de d1 como ${estado} (${clave})`, req('POST', `/test/comercios/${COM_A}/clonar`, { body: {}, query: `nombre=Acceso-E2-Postman-${clave}&estado=${estado}` }), [
    status(201),
    guardar(v(`com_${clave}`), 'pm.response.json().data'),
  ]);

agregar(clonar('b', 'APROBADO'), clonar('s', 'APROBADO'), clonar('i', 'APROBADO'), clonar('sr', 'APROBADO'));
const COM_B = `{{${v('com_b')}}}`;
const COM_S = `{{${v('com_s')}}}`;
const COM_I = `{{${v('com_i')}}}`;
const COM_SIN_RELACION = `{{${v('com_sr')}}}`;

agregar(...altaCliente('emp'), ...altaCliente('sr', { login: true }));

function sumarAlEquipo(comercio, etiqueta) {
  return [
    item(`Invitar al Empleado a ${etiqueta}`, req('POST', '/comercios/equipo/invitaciones', { token: TOKEN_D1, comercio, body: { email: `{{${v('emp_email')}}}` } }), [status(201)]),
    item(`Atajo de test: código de la invitación a ${etiqueta}`, req('GET', '/test/invitaciones-empleado/codigo', { query: `email={{${v('emp_email')}}}&comercioId=${comercio}` }), [
      status(200),
      guardar(v('codigo_actual'), 'pm.response.json().data'),
    ]),
    item(`El Empleado acepta la invitación a ${etiqueta}`, req('POST', '/auth/invitaciones-empleado/aceptar', { body: { email: `{{${v('emp_email')}}}`, codigo: `{{${v('codigo_actual')}}}` } }), [status(200)]),
  ];
}

agregar(...sumarAlEquipo(COM_A, 'A'));
agregar(
  item('Login del Empleado', req('POST', '/auth/login', { body: { nombreUsuario: `{{${v('emp_usuario')}}}`, password: `{{${v('emp_password')}}}` } }), [
    status(200),
    guardar(v('emp_token'), 'pm.response.json().data.token'),
    guardar(v('emp_id'), 'pm.response.json().data.usuario.id'),
    "pm.test('El Empleado sigue siendo un Cliente', () => pm.expect(pm.response.json().data.usuario.rol).to.eql('CLIENTE'));",
  ]),
);
agregar(...sumarAlEquipo(COM_B, 'B'), ...sumarAlEquipo(COM_S, 'S'), ...sumarAlEquipo(COM_I, 'I'));

const CAMPOS_PERFIL = ['abiertoAhora', 'cerradoManualmente', 'descripcion', 'direccion', 'estado', 'fotoPerfilUrl', 'horarios', 'id', 'nombre', 'telefono'];
const CAMPOS_EXCLUIDOS = [
  'cuit',
  'razonSocial',
  'condicionIva',
  'tipoSociedad',
  'domicilioFiscal',
  'fechaInicioActividades',
  'representante',
  'emailContacto',
  'motivoRechazo',
  'tipoComercio',
  'aceptaDelivery',
  'aceptaRetiro',
  'puedeCambiarCierre',
  'textoReapertura',
];
const CAMPOS_MIS_COMERCIOS = [
  'abiertoAhora',
  'cantidadNotificacionesNoLeidas',
  'cerradoManualmente',
  'estado',
  'fechaAlta',
  'fechaRegistro',
  'fotoPerfilUrl',
  'id',
  'nombre',
  'operativo',
  'puedeCambiarCierre',
  'textoReapertura',
];

const get = (nombre, ruta, token, comercio, testLines, pre = []) => item(nombre, req('GET', ruta, { token, comercio }), testLines, pre);

agregar(
  get('Dueño: perfil completo de A (referencia de los datos fiscales)', '/comercios/perfil', TOKEN_D1, COM_A, [
    status(200),
    `pm.test('El Dueño recibe el DTO completo', () => ${JSON.stringify(['cuit', 'razonSocial', 'condicionIva', 'tipoSociedad', 'domicilioFiscal', 'fechaInicioActividades', 'representante', 'emailContacto', 'puedeCambiarCierre'])}.forEach((c) => pm.expect(pm.response.json().data).to.have.property(c)));`,
    guardar(v('cuit_a'), 'pm.response.json().data.cuit'),
    guardar(v('razon_a'), 'pm.response.json().data.razonSocial'),
    guardar(v('nombre_a'), 'pm.response.json().data.nombre'),
  ]),
  get('Empleado: perfil de A con el DTO reducido', '/comercios/perfil', TOKEN_EMP, COM_A, [
    status(200),
    mensajeEs('Perfil obtenido correctamente'),
    `pm.test('Solo los campos de la lista blanca', () => pm.expect(Object.keys(pm.response.json().data).sort()).to.eql(${JSON.stringify(CAMPOS_PERFIL)}));`,
    `pm.test('Ninguno de los campos excluidos', () => ${JSON.stringify(CAMPOS_EXCLUIDOS)}.forEach((c) => pm.expect(pm.response.json().data).to.not.have.property(c)));`,
    "pm.test('Sin el CUIT, la razón social ni el email del Dueño', () => { const t = pm.response.text(); pm.expect(t).to.not.include(pm.environment.get('e2_cuit_a')); pm.expect(t).to.not.include(pm.environment.get('e2_razon_a')); pm.expect(t).to.not.include(pm.environment.get('e2_d1_email')); });",
    "pm.test('Sin nada de Mercado Pago', () => pm.expect(pm.response.text().toLowerCase()).to.not.include('mercadopago'));",
    "pm.test('El nombre es el del comercio', () => pm.expect(pm.response.json().data.nombre).to.eql(pm.environment.get('e2_nombre_a')));",
    "pm.test('Estado APROBADO y comercio abierto sin cierre manual', () => { const d = pm.response.json().data; pm.expect(d.estado).to.eql('APROBADO'); pm.expect(d.cerradoManualmente).to.eql(false); pm.expect(d.horarios.length).to.be.above(0); });",
  ]),
  get('Dueño: lista de productos de A (referencia)', '/productos', TOKEN_D1, COM_A, [
    status(200),
    guardar(v('productos_dueno'), 'JSON.stringify(pm.response.json().data)'),
  ]),
  get('Empleado: lista de productos de A, igual a la del Dueño', '/productos', TOKEN_EMP, COM_A, [
    status(200),
    "pm.test('Hay productos', () => pm.expect(pm.response.json().data.length).to.be.above(0));",
    "pm.test('Misma lista que ve el Dueño', () => pm.expect(JSON.stringify(pm.response.json().data)).to.eql(pm.environment.get('e2_productos_dueno')));",
  ]),
  get('Empleado: pedidos de A', '/pedidos/comercio', TOKEN_EMP, COM_A, [
    status(200),
    "pm.test('Es una lista', () => pm.expect(pm.response.json().data).to.be.an('array'));",
  ]),
  get('Dueño: resumen de hoy de A (referencia)', '/pedidos/comercio/resumen-hoy', TOKEN_D1, COM_A, [
    status(200),
    guardar(v('resumen_dueno'), 'JSON.stringify(pm.response.json().data)'),
  ]),
  get('Empleado: resumen de hoy de A, igual al del Dueño', '/pedidos/comercio/resumen-hoy', TOKEN_EMP, COM_A, [
    status(200),
    "pm.test('Mismo resumen que ve el Dueño', () => pm.expect(JSON.stringify(pm.response.json().data)).to.eql(pm.environment.get('e2_resumen_dueno')));",
  ]),
  get('Empleado: con dos comercios, el header B devuelve los datos de B', '/comercios/perfil', TOKEN_EMP, COM_B, [
    status(200),
    "pm.test('Es el comercio B, no el A', () => { const d = pm.response.json().data; pm.expect(d.id).to.eql(Number(pm.environment.get('e2_com_b'))); pm.expect(d.nombre).to.not.eql(pm.environment.get('e2_nombre_a')); });",
  ]),
  get('Empleado: los productos de B son los de B (ninguno)', '/productos', TOKEN_EMP, COM_B, [
    status(200),
    "pm.test('B no tiene productos', () => pm.expect(pm.response.json().data).to.eql([]));",
  ]),
);

const cuatroLecturas = [
  ['perfil', '/comercios/perfil'],
  ['productos', '/productos'],
  ['pedidos', '/pedidos/comercio'],
  ['resumen de hoy', '/pedidos/comercio/resumen-hoy'],
];

for (const [nombre, ruta] of cuatroLecturas) {
  agregar(
    get(`Sin token: ${nombre} da 401`, ruta, undefined, COM_A, [status(401)]),
    get(`Administrador: ${nombre} da 403 con header`, ruta, 'token_admin', COM_A, [status(403)]),
    get(`Administrador: ${nombre} da 403 sin header`, ruta, 'token_admin', undefined, [status(403)]),
  );
}

const escrituras = [
  ['PUT', '/comercios/perfil', { nombre: 'Hackeado' }],
  ['PUT', '/comercios/perfil/foto', { url: 'https://res.cloudinary.com/demo/image/upload/x.png' }],
  ['POST', '/comercios/perfil/foto/firma'],
  ['PUT', '/comercios/cerrar'],
  ['PUT', '/comercios/abrir'],
  ['POST', '/productos', { nombre: 'Intruso', precio: 1, categoriaId: 1 }],
  ['PUT', '/productos/1', { nombre: 'Intruso', precio: 1, categoriaId: 1 }],
  ['PATCH', '/productos/1/estado', { estado: 'AGOTADO' }],
  ['PUT', '/pedidos/comercio/1/aceptar'],
  ['PUT', '/pedidos/comercio/1/despachar'],
  ['PUT', '/pedidos/comercio/1/entregar'],
  ['GET', '/comercios/equipo'],
  ['POST', '/comercios/equipo/invitaciones', { email: 'intruso.e2@bajonea.test' }],
  ['GET', '/comercios/redes-sociales'],
  ['GET', '/comercios/mis-comercios'],
  ['GET', '/comercios/alta-adicional/elegibilidad'],
  ['GET', '/oauth/mercadopago/cuenta'],
  ['GET', '/oauth/mercadopago/iniciar'],
  ['GET', '/pedidos/comercio/1/pago'],
];

for (const [metodo, ruta, body] of escrituras) {
  agregar(item(`Empleado activo: ${metodo} ${ruta} sigue cerrado: 403`, req(metodo, ruta, { token: TOKEN_EMP, comercio: COM_A, body }), [status(403)]));
}

const guardar404 = [
  status(404),
  "pm.test('Mismo mensaje y mismo código estable en data', () => pm.expect(pm.response.json()).to.eql({ mensaje: 'Comercio no encontrado', data: { codigo: 'COMERCIO_NO_DISPONIBLE' } }));",
  "pm.test('Cuerpo idéntico al primer 404', () => { const actual = JSON.stringify(pm.response.json()); const base = pm.environment.get('e2_cuerpo_404'); if (!base) { pm.environment.set('e2_cuerpo_404', actual); } else { pm.expect(actual).to.eql(base); } });",
];

agregar(
  item('Reiniciar la comparación de 404', req('GET', '/health'), [guardar(v('cuerpo_404'), "''")]),
  get('404: el Empleado con un comercio inexistente', '/comercios/perfil', TOKEN_EMP, '2000000000', guardar404),
  get('404: el Empleado con el comercio de otro Dueño', '/comercios/perfil', TOKEN_EMP, COM_AJENO, guardar404),
  get('404: el Empleado con un comercio sin relación', '/comercios/perfil', TOKEN_EMP, COM_SIN_RELACION, guardar404),
  get('404: un Cliente sin relación alguna', '/comercios/perfil', TOKEN_SR, COM_A, guardar404),
  get('404: el Dueño con el comercio de otro Dueño', '/comercios/perfil', TOKEN_D1, COM_AJENO, guardar404),
  get('404: el Dueño con un comercio inexistente', '/comercios/perfil', TOKEN_D1, '2000000000', guardar404),
  item('Atajo de test: la relación del Empleado con I pasa a INACTIVO', req('PUT', `/test/comercios/${COM_I}/empleados/{{${v('emp_id')}}}/estado`, { body: {}, query: 'estado=INACTIVO' }), [status(200)]),
  get('404: el Empleado con relación INACTIVA, con el mismo token', '/comercios/perfil', TOKEN_EMP, COM_I, guardar404),
  get('404: productos con relación INACTIVA', '/productos', TOKEN_EMP, COM_I, guardar404),
  get('404: pedidos con relación INACTIVA', '/pedidos/comercio', TOKEN_EMP, COM_I, guardar404),
  get('404: resumen de hoy con relación INACTIVA', '/pedidos/comercio/resumen-hoy', TOKEN_EMP, COM_I, guardar404),
  item('Atajo de test: la relación del Empleado con I vuelve a ACTIVO', req('PUT', `/test/comercios/${COM_I}/empleados/{{${v('emp_id')}}}/estado`, { body: {}, query: 'estado=ACTIVO' }), [status(200)]),
  get('Reactivada: el Empleado vuelve a leer I con el mismo token', '/comercios/perfil', TOKEN_EMP, COM_I, [status(200)]),
  item('Atajo de test: el estado de una relación inexistente da 404', req('PUT', `/test/comercios/${COM_AJENO}/empleados/{{${v('emp_id')}}}/estado`, { body: {}, query: 'estado=INACTIVO' }), [status(404)]),
);

const sinHeader = (token, etiqueta) => [
  get(`Header ausente: ${etiqueta} da 400`, '/comercios/perfil', token, undefined, [
    status(400),
    "pm.test('El texto es neutro', () => { const m = pm.response.json().mensaje; pm.expect(m).to.include('X-Comercio-Id'); pm.expect(m).to.not.include('Dueño'); });",
  ]),
  get(`Header no numérico: ${etiqueta} da 400`, '/comercios/perfil', token, 'abc', [
    status(400),
    "pm.test('El texto es neutro', () => pm.expect(pm.response.json().mensaje).to.not.include('Dueño'));",
  ]),
];

agregar(
  ...sinHeader(TOKEN_EMP, 'el Empleado'),
  ...sinHeader(TOKEN_D1, 'el Dueño'),
  get('Header ausente: un Cliente sin relación da 400, no 403', '/comercios/perfil', TOKEN_SR, undefined, [status(400)]),
);

agregar(
  item('Estados: el comercio B pasa a APTO_VENTA', req('PUT', `/test/comercios/${COM_B}/apto-venta`, { body: {} }), [status(200)]),
  get('Estados: el Empleado lee B en APTO_VENTA', '/comercios/perfil', TOKEN_EMP, COM_B, [
    status(200),
    "pm.test('Estado APTO_VENTA', () => pm.expect(pm.response.json().data.estado).to.eql('APTO_VENTA'));",
  ]),
  item('Estados: el Administrador suspende el comercio S', req('PUT', `/administrador/comercios/${COM_S}/suspender`, { token: 'token_admin', body: { motivo: 'Suspension de prueba del rol Empleado E2' } }), [status(200)]),
  get('Estados: el Empleado sigue leyendo S suspendido (perfil)', '/comercios/perfil', TOKEN_EMP, COM_S, [
    status(200),
    "pm.test('Estado SUSPENDIDO', () => pm.expect(pm.response.json().data.estado).to.eql('SUSPENDIDO'));",
  ]),
  get('Estados: el Empleado sigue leyendo S suspendido (productos)', '/productos', TOKEN_EMP, COM_S, [status(200)]),
  get('Estados: el Empleado sigue leyendo S suspendido (pedidos)', '/pedidos/comercio', TOKEN_EMP, COM_S, [status(200)]),
  get('Estados: el Empleado sigue leyendo S suspendido (resumen de hoy)', '/pedidos/comercio/resumen-hoy', TOKEN_EMP, COM_S, [status(200)]),
);

const misComercios = (nombre, token, testLines, comercio) => item(nombre, req('GET', '/empleados/mis-comercios', { token, comercio }), testLines);

agregar(
  misComercios('mis-comercios: el Empleado lista A, B, I y S en orden de alta, con la forma pedida', TOKEN_EMP, [
    status(200),
    mensajeEs('Comercios obtenidos correctamente'),
    "pm.test('Cuatro comercios en orden de alta: A, B, S, I', () => pm.expect(pm.response.json().data.map((c) => c.id)).to.eql(['e2_com_d1', 'e2_com_b', 'e2_com_s', 'e2_com_i'].map((k) => Number(pm.environment.get(k)))));",
    `pm.test('La forma de mis-comercios más fechaAlta', () => pm.response.json().data.forEach((c) => pm.expect(Object.keys(c).sort()).to.eql(${JSON.stringify(CAMPOS_MIS_COMERCIOS)})));`,
    "pm.test('Notificaciones en 0 y fechaAlta presente', () => pm.response.json().data.forEach((c) => { pm.expect(c.cantidadNotificacionesNoLeidas).to.eql(0); pm.expect(c.fechaAlta).to.be.a('string'); }));",
    "pm.test('operativo según el estado', () => pm.expect(pm.response.json().data.map((c) => [c.estado, c.operativo])).to.eql([['APROBADO', true], ['APTO_VENTA', true], ['SUSPENDIDO', false], ['APROBADO', true]]));",
  ]),
  item('Atajo de test: la relación con I pasa a INACTIVO', req('PUT', `/test/comercios/${COM_I}/empleados/{{${v('emp_id')}}}/estado`, { body: {}, query: 'estado=INACTIVO' }), [status(200)]),
  misComercios('mis-comercios: una relación INACTIVA sale del listado', TOKEN_EMP, [
    status(200),
    "pm.test('Quedan A, B y S', () => pm.expect(pm.response.json().data.map((c) => c.id)).to.eql(['e2_com_d1', 'e2_com_b', 'e2_com_s'].map((k) => Number(pm.environment.get(k)))));",
  ]),
  misComercios('mis-comercios: un Cliente sin relaciones recibe una lista vacía', TOKEN_SR, [
    status(200),
    "pm.test('Lista vacía', () => pm.expect(pm.response.json().data).to.eql([]));",
  ]),
  misComercios('mis-comercios: ignora un X-Comercio-Id no numérico', TOKEN_EMP, [status(200)], 'abc'),
  misComercios('mis-comercios: ignora un X-Comercio-Id de otro Dueño', TOKEN_EMP, [status(200)], COM_AJENO),
  misComercios('mis-comercios: sin token da 401', undefined, [status(401)]),
  misComercios('mis-comercios: el Dueño recibe 403', TOKEN_D1, [status(403)]),
  misComercios('mis-comercios: el Administrador recibe 403', 'token_admin', [status(403)]),
  get('mis-comercios del Dueño: sin cambios (sin fechaAlta)', '/comercios/mis-comercios', TOKEN_D1, undefined, [
    status(200),
    "pm.test('Ninguna fila del Dueño tiene fechaAlta', () => pm.response.json().data.forEach((c) => pm.expect(c).to.not.have.property('fechaAlta')));",
  ]),
  get('Notificaciones: el Empleado sigue ignorando el header (lista)', '/notificaciones', TOKEN_EMP, COM_AJENO, [status(200)]),
  get('Notificaciones: el Empleado sigue ignorando el header (contador)', '/notificaciones/no-leidas/contador', TOKEN_EMP, 'abc', [status(200)]),
);

const SCRIPT_PRE_REQUEST_SIN_HEADER_AUTOMATICO = [
  "if (pm.variables.get('cab_comercio_inyectada') === '1') {",
  "  pm.request.headers.remove('X-Comercio-Id');",
  '}',
];

const folder = {
  name: NOMBRE_FOLDER,
  item: items,
  event: [{ listen: 'prerequest', script: { type: 'text/javascript', exec: SCRIPT_PRE_REQUEST_SIN_HEADER_AUTOMATICO } }],
};

const collection = JSON.parse(fs.readFileSync(collectionPath, 'utf8'));
const idx = collection.item.findIndex((f) => f.name === NOMBRE_FOLDER);
if (idx >= 0) collection.item[idx] = folder;
else collection.item.push(folder);
fs.writeFileSync(collectionPath, JSON.stringify(collection, null, 2) + '\n', 'utf8');

const claves = new Set();
const recorrer = (texto) => {
  for (const coincidencia of texto.matchAll(/e2_[a-z0-9_]+/g)) claves.add(coincidencia[0]);
};
recorrer(JSON.stringify(folder));
const environment = JSON.parse(fs.readFileSync(environmentPath, 'utf8'));
const existentes = new Set(environment.values.map((x) => x.key));
for (const key of [...claves].sort()) {
  if (!existentes.has(key)) environment.values.push({ key, value: '', type: 'default', enabled: true });
}
fs.writeFileSync(environmentPath, JSON.stringify(environment, null, 2) + '\n', 'utf8');

const totalAserciones = JSON.stringify(folder).match(/pm\.test\(/g)?.length ?? 0;
console.log(`OK: carpeta "${NOMBRE_FOLDER}" con ${folder.item.length} requests y ${totalAserciones} aserciones definidas; ${claves.size} variables de entorno.`);
