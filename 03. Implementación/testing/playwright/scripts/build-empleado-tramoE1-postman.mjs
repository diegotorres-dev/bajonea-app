import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const collectionPath = path.resolve(__dirname, '../../../postman/Bajonea-MVP.postman_collection.json');
const environmentPath = path.resolve(__dirname, '../../../postman/Bajonea-Local.postman_environment.json');

const NOMBRE_FOLDER = '56 - Rol Empleado E1 (invitaciones: invitar, reenviar, cancelar, equipo, validar, aceptar y matriz de roles)';
const MENSAJE_INVALIDO = 'El código es incorrecto o la invitación ya no está vigente. Pedí que te reenvíen la invitación.';

const v = (clave) => `e1_${clave}`;

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
const mensajeIgualA = (variable, descripcion) =>
  `pm.test('${descripcion}', () => pm.expect(pm.response.json().mensaje).to.eql(${entorno(variable)}));`;
const sinClaveCodigo = "pm.test('La respuesta no expone ningún código', () => pm.expect(pm.response.text()).to.not.include('codigo'));";

function identidad(clave) {
  return [
    `const s = Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36);`,
    guardar(v(`${clave}_email`), `'e1.${clave}.' + s + '@bajonea.test'`),
    guardar(v(`${clave}_usuario`), `('e1${clave}' + s).slice(0, 20)`),
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
  domicilioFiscal: 'Direccion fiscal E1 100',
  fechaInicioActividades: '2020-01-01',
  nombre,
  descripcion: 'Comercio generado por la coleccion de Postman (rol Empleado, E1)',
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
  fotoPerfilUrl: 'https://res.cloudinary.com/demo/image/upload/postman-empleado-e1.jpg',
  redesSociales: [{ tipo: 'INSTAGRAM', url: 'instagram.com/empleadoe1' }],
});

const cuentaNueva = (clave, fechaNacimiento = '1996-08-14') => ({
  nombre: 'Empleada',
  apellido: 'Invitada',
  dni: `{{${v(`${clave}_dni`)}}}`,
  fechaNacimiento,
  telefono: '+5492964551234',
  nombreUsuario: `{{${v(`${clave}_usuario`)}}}`,
  password: `{{${v(`${clave}_password`)}}}`,
  direccion: { calle: 'Belgrano', numero: '742', pisoDepto: null, codigoPostal: '9420', localidadId: '{{localidad_id}}', principal: true },
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
  const pasos = [
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
  return pasos;
}

agregar(...altaDueno('d1', 'Local Equipo Uno'));
agregar(
  item('Login Dueño d1', req('POST', '/auth/login', { body: { nombreUsuario: `{{${v('d1_usuario')}}}`, password: `{{${v('d1_password')}}}` } }), [
    status(200),
    guardar(v('d1_token'), 'pm.response.json().data.token'),
  ]),
  item('Administrador aprueba el comercio del Dueño d1', req('PUT', `/administrador/comercios/{{${v('com_d1')}}}/resolver`, { token: 'token_admin', body: { aprobar: true } }), [status(200)]),
);
agregar(...altaDueno('d2', 'Local Equipo Dos'));
agregar(item('Administrador aprueba el comercio del Dueño d2', req('PUT', `/administrador/comercios/{{${v('com_d2')}}}/resolver`, { token: 'token_admin', body: { aprobar: true } }), [status(200)]));

const COM_A = `{{${v('com_d1')}}}`;
const COM_E = `{{${v('com_d2')}}}`;
const TOKEN_D1 = v('d1_token');

const clonar = (nombre, clave, estado) =>
  item(`Clonar el comercio de d1 como ${estado} (${nombre})`, req('POST', `/test/comercios/${COM_A}/clonar`, { body: {}, query: `nombre=Equipo-E1-Postman-${nombre}&estado=${estado}` }), [
    status(201),
    guardar(v(`com_${clave}`), 'pm.response.json().data'),
  ]);

agregar(clonar('B', 'b', 'APROBADO'), clonar('N', 'n', 'PENDIENTE'), clonar('S', 's', 'APROBADO'), clonar('T', 't', 'APROBADO'), clonar('V', 'v', 'APROBADO'));
const COM_B = `{{${v('com_b')}}}`;
const COM_N = `{{${v('com_n')}}}`;
const COM_S = `{{${v('com_s')}}}`;
const COM_T = `{{${v('com_t')}}}`;
const COM_V = `{{${v('com_v')}}}`;

function altaCliente(clave, { verificar = true, login = false } = {}) {
  const email = `{{${v(`${clave}_email`)}}}`;
  const pasos = [
    item(
      `Registro Cliente ${clave}`,
      req('POST', '/auth/registro/cliente', {
        body: {
          nombre: 'Clienta',
          apellido: 'Equipo',
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
  ];
  if (verificar) {
    pasos.push(
      item(`Bypass test - codigo de verificacion Cliente ${clave}`, req('GET', '/test/token-verificacion', { query: `email=${email}` }), [
        status(200),
        guardar(v(`${clave}_codigo_verif`), 'pm.response.json().data'),
      ]),
      item(`Verificar cuenta Cliente ${clave}`, req('POST', '/auth/verificar', { body: { email, codigo: `{{${v(`${clave}_codigo_verif`)}}}` } }), [status(200)]),
    );
  }
  if (login) {
    pasos.push(
      item(`Login Cliente ${clave}`, req('POST', '/auth/login', { body: { nombreUsuario: `{{${v(`${clave}_usuario`)}}}`, password: `{{${v(`${clave}_password`)}}}` } }), [
        status(200),
        guardar(v(`${clave}_token`), 'pm.response.json().data.token'),
      ]),
    );
  }
  return pasos;
}

agregar(...altaCliente('x', { login: true }), ...altaCliente('bl'), ...altaCliente('sv', { verificar: false }));

const invitar = (nombre, comercio, emailExpr, testLines, { token = TOKEN_D1, preLines = [] } = {}) =>
  item(nombre, req('POST', '/comercios/equipo/invitaciones', { token, comercio, body: { email: emailExpr } }), testLines, preLines);

const equipo = (nombre, comercio, testLines) => item(nombre, req('GET', '/comercios/equipo', { token: TOKEN_D1, comercio }), testLines);

const codigoTest = (nombre, clave, comercio, variableCodigo) =>
  item(nombre, req('GET', '/test/invitaciones-empleado/codigo', { query: `email={{${v(`${clave}_email`)}}}&comercioId=${comercio}` }), [
    status(200),
    "pm.test('El código tiene 6 dígitos', () => pm.expect(pm.response.json().data).to.match(/^\\d{6}$/));",
    guardar(variableCodigo, 'pm.response.json().data'),
  ]);

const validar = (nombre, emailExpr, codigoExpr, testLines, preLines = []) =>
  item(nombre, req('POST', '/auth/invitaciones-empleado/validar', { body: { email: emailExpr, codigo: codigoExpr } }), testLines, preLines);

const aceptar = (nombre, cuerpo, testLines) => item(nombre, req('POST', '/auth/invitaciones-empleado/aceptar', { body: cuerpo }), testLines);

const cantidadRegularizacion = (nombre, emailExpr, esperada) =>
  item(nombre, req('GET', '/test/emails-regularizacion/cantidad', { query: `email=${emailExpr}` }), [
    status(200),
    `pm.test('Filas de regularización: ${esperada}', () => pm.expect(pm.response.json().data).to.eql(${esperada}));`,
  ]);

const estadoDeInvitacion = (variableId) => `(pm.response.json().data.invitaciones.find((i) => i.id === Number(${entorno(variableId)})) || {}).estado`;

const emailN1 = `{{${v('n1_email')}}}`;
const emailX = `{{${v('x_email')}}}`;

agregar(
  invitar(
    'Invitar: email con mayúsculas y espacios se normaliza (n1 en A)',
    COM_A,
    `{{${v('n1_email_crudo')}}}`,
    [
      status(201),
      `pm.test('El mensaje nombra el email normalizado', () => pm.expect(pm.response.json().mensaje).to.eql('Invitación enviada a ' + ${entorno(v('n1_email'))}));`,
      `pm.test('El email queda normalizado y el estado es PENDIENTE', () => { const d = pm.response.json().data; pm.expect(d.email).to.eql(${entorno(v('n1_email'))}); pm.expect(d.estado).to.eql('PENDIENTE'); });`,
      sinClaveCodigo,
      guardar(v('inv_n1'), 'pm.response.json().data.id'),
    ],
    {
      preLines: [
        ...identidad('n1'),
        guardar(v('n1_email_crudo'), `'  ' + ${entorno(v('n1_email'))}.toUpperCase() + ' '`),
      ],
    },
  ),
);

agregar(
  codigoTest('Atajo de test: código de la invitación de n1 en A', 'n1', COM_A, v('n1_codigo_1')),
  invitar('Invitar: email mal formado da 400', COM_A, 'esto-no-es-un-email', [status(400)]),
  invitar('Invitar: email vacío da 400', COM_A, '', [status(400)]),
  item('Invitar: sin X-Comercio-Id da 400', req('POST', '/comercios/equipo/invitaciones', { token: TOKEN_D1, body: { email: 'sin.header@bajonea.test' } }), [status(400)]),
  invitar('Invitar: X-Comercio-Id no numérico da 400', 'abc', 'no.numerico@bajonea.test', [status(400)]),
  invitar('Invitar: comercio de otro Dueño da 404', COM_E, 'ajeno@bajonea.test', [status(404), guardar(v('msg_404'), 'pm.response.json().mensaje')]),
  invitar('Invitar: comercio inexistente da el mismo 404', '99999999', 'inexistente@bajonea.test', [
    status(404),
    mensajeIgualA(v('msg_404'), 'El mensaje es idéntico al del comercio ajeno'),
  ]),
  item('Ver equipo: sin token da 401', req('GET', '/comercios/equipo', { comercio: COM_A }), [status(401)]),
  invitar('Invitar: un Cliente recibe 403', COM_A, 'cliente.invita@bajonea.test', [status(403)], { token: v('x_token') }),
  item('Ver equipo: un Cliente recibe 403', req('GET', '/comercios/equipo', { token: v('x_token'), comercio: COM_A }), [status(403)]),
  invitar('Invitar: el email de un Dueño da el 409 genérico', COM_A, `{{${v('d2_email')}}}`, [
    status(409),
    mensajeEs('No se puede invitar a este email'),
    guardar(v('msg_generico'), 'pm.response.json().mensaje'),
  ]),
  invitar('Invitar: el email de un Administrador da el mismo 409', COM_A, 'admin@bajonea.ar', [
    status(409),
    mensajeIgualA(v('msg_generico'), 'El mensaje es idéntico al del email de un Dueño'),
  ]),
  cantidadRegularizacion('Regularización: al Dueño invitado no se le mandó nada', `{{${v('d2_email')}}}`, 0),
  cantidadRegularizacion('Regularización: al Administrador no se le mandó nada', 'admin@bajonea.ar', 0),
  invitar('Invitar: ya hay una invitación vigente del mismo email da 409', COM_A, emailN1, [
    status(409),
    mensajeEs('Ya hay una invitación pendiente para ese email. Podés reenviarla.'),
  ]),
  invitar('Invitar: un comercio que no está operativo da 409', COM_N, 'no.operativo@bajonea.test', [
    status(409),
    mensajeEs('Este comercio no puede invitar empleados en este momento'),
  ]),
);

const loginFallido = (nombre, clave) =>
  item(nombre, req('POST', '/auth/login', { body: { nombreUsuario: `{{${v(`${clave}_usuario`)}}}`, password: 'ClaveIncorrecta1' } }), [status(401)]);

agregar(
  invitar('Invitar: bl todavía activa, entra al comercio S (revalidación posterior)', COM_S, `{{${v('bl_email')}}}`, [status(201), guardar(v('inv_bl'), 'pm.response.json().data.id')]),
  codigoTest('Atajo de test: código de la invitación de bl en S', 'bl', COM_S, v('bl_codigo')),
  loginFallido('Bloqueo de bl: login con contraseña incorrecta (1/3)', 'bl'),
  loginFallido('Bloqueo de bl: login con contraseña incorrecta (2/3)', 'bl'),
  loginFallido('Bloqueo de bl: login con contraseña incorrecta (3/3)', 'bl'),
  invitar('Invitar a una cuenta bloqueada da el 409 genérico', COM_A, `{{${v('bl_email')}}}`, [status(409), mensajeEs('No se puede invitar a este email')]),
  cantidadRegularizacion('Regularización: una fila para la cuenta bloqueada', `{{${v('bl_email')}}}`, 1),
  invitar('Invitar a la cuenta bloqueada de nuevo (2)', COM_A, `{{${v('bl_email')}}}`, [status(409)]),
  invitar('Invitar a la cuenta bloqueada de nuevo (3)', COM_A, `{{${v('bl_email')}}}`, [status(409)]),
  invitar('Invitar a la cuenta bloqueada de nuevo (4)', COM_A, `{{${v('bl_email')}}}`, [status(409)]),
  cantidadRegularizacion('Regularización: el tope es de 3 por día', `{{${v('bl_email')}}}`, 3),
  invitar('Invitar a una cuenta sin verificar da el 409 genérico', COM_A, `{{${v('sv_email')}}}`, [status(409), mensajeEs('No se puede invitar a este email')]),
  cantidadRegularizacion('Regularización: una fila para la cuenta sin verificar', `{{${v('sv_email')}}}`, 1),
  validar('Revalidación: validar con el código correcto de la cuenta que se bloqueó da 409 con el motivo', `{{${v('bl_email')}}}`, `{{${v('bl_codigo')}}}`, [
    status(409),
    mensajeEs('Cuenta bloqueada. Recuperá tu contraseña para desbloquearla'),
  ]),
  aceptar('Revalidación: aceptar con la cuenta bloqueada da 409', { email: `{{${v('bl_email')}}}`, codigo: `{{${v('bl_codigo')}}}` }, [
    status(409),
    mensajeEs('Cuenta bloqueada. Recuperá tu contraseña para desbloquearla'),
  ]),
);

agregar(
  equipo('Ver equipo A: la invitación de n1 figura PENDIENTE y no se expone ningún código', COM_A, [
    status(200),
    `pm.test('n1 figura PENDIENTE', () => pm.expect(${estadoDeInvitacion(v('inv_n1'))}).to.eql('PENDIENTE'));`,
    "pm.test('Todavía no hay miembros', () => pm.expect(pm.response.json().data.miembros).to.eql([]));",
    sinClaveCodigo,
  ]),
  item('Reenviar n1 (A): fila nueva y anterior REEMPLAZADA', req('POST', `/comercios/equipo/invitaciones/{{${v('inv_n1')}}}/reenviar`, { token: TOKEN_D1, comercio: COM_A }), [
    status(200),
    `pm.test('Es una fila nueva y está PENDIENTE', () => { const d = pm.response.json().data; pm.expect(d.id).to.not.eql(Number(${entorno(v('inv_n1'))})); pm.expect(d.estado).to.eql('PENDIENTE'); });`,
    `pm.test('El mensaje nombra el email', () => pm.expect(pm.response.json().mensaje).to.eql('Invitación reenviada a ' + ${entorno(v('n1_email'))}));`,
    guardar(v('inv_n1_nueva'), 'pm.response.json().data.id'),
  ]),
  item('Reenviar: una invitación de otro comercio da 404', req('POST', `/comercios/equipo/invitaciones/{{${v('inv_n1_nueva')}}}/reenviar`, { token: TOKEN_D1, comercio: COM_E }), [status(404)]),
  item('Cancelar: una invitación de otro comercio da el mismo 404', req('PUT', `/comercios/equipo/invitaciones/{{${v('inv_n1_nueva')}}}/cancelar`, { token: TOKEN_D1, comercio: COM_E }), [status(404)]),
  codigoTest('Atajo de test: código nuevo de n1 en A', 'n1', COM_A, v('n1_codigo_2')),
  validar(
    'Validar: el código de la invitación reemplazada ya no sirve',
    emailN1,
    `{{${v('n1_codigo_1')}}}`,
    [
      "const igual = pm.environment.get('e1_n1_codigo_1') === pm.environment.get('e1_n1_codigo_2');",
      "pm.test('El código viejo da 401 (salvo colisión de códigos)', () => pm.response.to.have.status(igual ? 200 : 401));",
    ],
  ),
  validar(
    'Validar: código incorrecto da 401 sin intentos restantes',
    emailN1,
    `{{${v('n1_codigo_malo')}}}`,
    [
      status(401),
      mensajeEs(MENSAJE_INVALIDO),
      "pm.test('No informa intentos restantes', () => pm.expect(pm.response.text()).to.not.match(/intentos/i));",
      guardar(v('msg_401'), 'pm.response.json().mensaje'),
    ],
    [guardar(v('n1_codigo_malo'), `${entorno(v('n1_codigo_2'))} === '000000' ? '111111' : '000000'`)],
  ),
  validar('Validar: un email sin invitación da el mismo 401', 'sin.invitacion@bajonea.test', '123456', [
    status(401),
    mensajeIgualA(v('msg_401'), 'El mensaje es idéntico al del código incorrecto'),
  ]),
  validar('Validar: un código con formato inválido da 400', emailN1, '12345', [status(400)]),
  validar('Validar: el código correcto informa el comercio y que la cuenta no existe', emailN1, `{{${v('n1_codigo_2')}}}`, [
    status(200),
    "pm.test('Informa comercio y vencimiento', () => { const d = pm.response.json().data; pm.expect(d.comercioNombre).to.be.a('string').and.not.empty; pm.expect(d.fechaVencimiento).to.be.a('string'); });",
    "pm.test('La cuenta todavía no existe', () => pm.expect(pm.response.json().data.cuentaExistente).to.eql(false));",
    "pm.test('Informa la foto del comercio', () => pm.expect(pm.response.json().data.comercioFotoPerfilUrl).to.include('res.cloudinary.com'));",
  ]),
);

const cuerpoAceptar = (clave, extra = {}) => ({
  email: `{{${v(`${clave}_email`)}}}`,
  codigo: `{{${v(`${clave}_codigo_2`)}}}`,
  aceptaTerminos: true,
  cuentaNueva: cuentaNueva(clave),
  ...extra,
});

agregar(
  aceptar('Aceptar: sin aceptaTerminos da 400 con el error por campo', (() => {
    const cuerpo = cuerpoAceptar('n1');
    delete cuerpo.aceptaTerminos;
    return cuerpo;
  })(), [
    status(400),
    `pm.test('Error en aceptaTerminos', () => pm.expect(pm.response.json().data.aceptaTerminos).to.eql('Tenés que aceptar los Términos y Condiciones'));`,
  ]),
  aceptar('Aceptar: aceptaTerminos en false da 400', cuerpoAceptar('n1', { aceptaTerminos: false }), [status(400)]),
  aceptar('Aceptar: sin cuentaNueva da 400 con el error por campo', (() => {
    const cuerpo = cuerpoAceptar('n1');
    delete cuerpo.cuentaNueva;
    return cuerpo;
  })(), [
    status(400),
    "pm.test('Error en cuentaNueva', () => pm.expect(pm.response.json().data.cuentaNueva).to.be.a('string').and.not.empty);",
  ]),
  aceptar('Aceptar: DNI ya registrado da el 409 del registro', { ...cuerpoAceptar('n1'), cuentaNueva: { ...cuentaNueva('n1'), dni: `{{${v('x_dni')}}}` } }, [
    status(409),
    mensajeEs('Ya existe una cuenta registrada con ese DNI'),
  ]),
  aceptar('Aceptar: nombre de usuario ya registrado da el 409 del registro', { ...cuerpoAceptar('n1'), cuentaNueva: { ...cuentaNueva('n1'), nombreUsuario: `{{${v('x_usuario')}}}` } }, [
    status(409),
    mensajeEs('Ese nombre de usuario ya está en uso'),
  ]),
  aceptar('Aceptar: con cuenta nueva crea la cuenta y la relación', cuerpoAceptar('n1'), [
    status(200),
    `pm.test('El mensaje nombra el comercio', () => pm.expect(pm.response.json().mensaje).to.match(/^Ya sos parte del equipo de Local Equipo Uno/));`,
    "pm.test('Cuenta creada y sin reactivación', () => { const d = pm.response.json().data; pm.expect(d.cuentaCreada).to.eql(true); pm.expect(d.relacionReactivada).to.eql(false); });",
  ]),
  aceptar('Aceptar: la segunda aceptación del mismo código da 401', cuerpoAceptar('n1'), [
    status(401),
    mensajeIgualA(v('msg_401'), 'El mensaje es idéntico al de cualquier otro fallo de resolución'),
  ]),
  item('Login del Empleado nuevo: la cuenta quedó ACTIVA, rol Cliente', req('POST', '/auth/login', { body: { nombreUsuario: `{{${v('n1_usuario')}}}`, password: `{{${v('n1_password')}}}` } }), [
    status(200),
    "pm.test('El rol es CLIENTE', () => pm.expect(pm.response.json().data.usuario.rol).to.eql('CLIENTE'));",
  ]),
  equipo('Ver equipo A: n1 figura como miembro ACTIVO y ya no como invitación', COM_A, [
    status(200),
    "pm.test('Un miembro ACTIVO con los datos de la cuenta', () => { const m = pm.response.json().data.miembros; pm.expect(m).to.have.length(1); pm.expect(m[0].estado).to.eql('ACTIVO'); pm.expect(m[0].nombre).to.eql('Empleada'); pm.expect(m[0].fechaBaja).to.eql(null); });",
    `pm.test('El email del miembro es el de n1', () => pm.expect(pm.response.json().data.miembros[0].email).to.eql(${entorno(v('n1_email'))}));`,
    `pm.test('La invitación aceptada dejó de figurar', () => pm.expect(${estadoDeInvitacion(v('inv_n1_nueva'))}).to.eql(undefined));`,
  ]),
  item('Notificaciones del Dueño bajo A: avisa que n1 aceptó', req('GET', '/notificaciones', { token: TOKEN_D1, comercio: COM_A }), [
    status(200),
    "pm.test('Figura el aviso de la aceptación', () => pm.expect(pm.response.json().data.some((n) => n.mensaje.includes('aceptó tu invitación y ya es parte del equipo de Local Equipo Uno'))).to.eql(true));",
  ]),
  item('Notificaciones del Dueño bajo B: el aviso no aparece', req('GET', '/notificaciones', { token: TOKEN_D1, comercio: COM_B }), [
    status(200),
    "pm.test('No figura el aviso de A', () => pm.expect(pm.response.json().data.some((n) => n.mensaje.includes('aceptó tu invitación'))).to.eql(false));",
  ]),
);

agregar(
  invitar('Cuenta existente: invitar a x (A)', COM_A, emailX, [status(201), guardar(v('inv_x'), 'pm.response.json().data.id')]),
  codigoTest('Atajo de test: código de x en A', 'x', COM_A, v('x_codigo_2')),
  validar('Cuenta existente: validar informa que la cuenta existe', emailX, `{{${v('x_codigo_2')}}}`, [
    status(200),
    "pm.test('La cuenta existe', () => pm.expect(pm.response.json().data.cuentaExistente).to.eql(true));",
  ]),
  aceptar(
    'Cuenta existente: aceptar con email y código, ignora cuentaNueva y no pide términos',
    { email: emailX, codigo: `{{${v('x_codigo_2')}}}`, cuentaNueva: { ...cuentaNueva('n1'), dni: '11111111' } },
    [
      status(200),
      "pm.test('No se creó una cuenta ni se reactivó nada', () => { const d = pm.response.json().data; pm.expect(d.cuentaCreada).to.eql(false); pm.expect(d.relacionReactivada).to.eql(false); });",
    ],
  ),
  invitar('Quien ya es parte activa del equipo da 409', COM_A, emailX, [status(409), mensajeEs('Esa persona ya es parte de tu equipo')]),
  item('Cuenta existente: x sigue entrando con su contraseña (aceptar no modificó la cuenta)', req('POST', '/auth/login', { body: { nombreUsuario: `{{${v('x_usuario')}}}`, password: `{{${v('x_password')}}}` } }), [
    status(200),
    "pm.test('El rol sigue siendo CLIENTE', () => pm.expect(pm.response.json().data.usuario.rol).to.eql('CLIENTE'));",
  ]),
);

const emailIso = `{{${v('iso_email')}}}`;
agregar(
  invitar('Aislamiento: invitar a iso en A', COM_A, emailIso, [status(201), guardar(v('inv_iso_a'), 'pm.response.json().data.id')], { preLines: identidad('iso') }),
  invitar('Aislamiento: invitar al mismo email en B (otro comercio del mismo Dueño)', COM_B, emailIso, [status(201), guardar(v('inv_iso_b'), 'pm.response.json().data.id')]),
  codigoTest('Atajo de test: código de iso en A', 'iso', COM_A, v('iso_codigo_2')),
  aceptar('Aislamiento: iso acepta en A con cuenta nueva', cuerpoAceptar('iso'), [status(200)]),
  equipo('Aislamiento: en B la invitación de iso sigue PENDIENTE y no hay miembros', COM_B, [
    status(200),
    `pm.test('La invitación de B sigue PENDIENTE', () => pm.expect(${estadoDeInvitacion(v('inv_iso_b'))}).to.eql('PENDIENTE'));`,
    "pm.test('B no tiene miembros', () => pm.expect(pm.response.json().data.miembros).to.eql([]));",
    `pm.test('B no lista la invitación de A', () => pm.expect(${estadoDeInvitacion(v('inv_iso_a'))}).to.eql(undefined));`,
  ]),
);

agregar(
  invitar('Código bloqueado: invitar a m1 en B', COM_B, `{{${v('m1_email')}}}`, [status(201), guardar(v('inv_m1'), 'pm.response.json().data.id')], { preLines: identidad('m1') }),
  codigoTest('Atajo de test: código de m1 en B', 'm1', COM_B, v('m1_codigo_1')),
);
for (let n = 1; n <= 5; n += 1) {
  agregar(
    validar(
      `Código bloqueado: código incorrecto ${n}/5 da 401`,
      `{{${v('m1_email')}}}`,
      `{{${v('m1_codigo_malo')}}}`,
      [status(401)],
      n === 1 ? [guardar(v('m1_codigo_malo'), `${entorno(v('m1_codigo_1'))} === '000000' ? '111111' : '000000'`)] : [],
    ),
  );
}
agregar(
  equipo('Código bloqueado: la invitación de m1 figura INVALIDADA', COM_B, [
    status(200),
    `pm.test('m1 figura INVALIDADA', () => pm.expect(${estadoDeInvitacion(v('inv_m1'))}).to.eql('INVALIDADA'));`,
  ]),
  validar('Código bloqueado: ni el código correcto sirve', `{{${v('m1_email')}}}`, `{{${v('m1_codigo_1')}}}`, [
    status(401),
    mensajeEs(MENSAJE_INVALIDO),
  ]),
  item('Código bloqueado: el Dueño reenvía y rehabilita', req('POST', `/comercios/equipo/invitaciones/{{${v('inv_m1')}}}/reenviar`, { token: TOKEN_D1, comercio: COM_B }), [status(200)]),
  equipo('Código bloqueado: tras reenviar, la lista tiene una sola línea de m1 y está Pendiente', COM_B, [
    status(200),
    `const lineas = pm.response.json().data.invitaciones.filter((i) => i.email === ${entorno(v('m1_email'))});`,
    "pm.test('Una sola línea para m1', () => pm.expect(lineas.length).to.eql(1));",
    "pm.test('La línea de m1 está PENDIENTE', () => pm.expect(lineas[0].estado).to.eql('PENDIENTE'));",
  ]),
  codigoTest('Atajo de test: código nuevo de m1 en B', 'm1', COM_B, v('m1_codigo_2')),
  validar('Código bloqueado: el código nuevo valida', `{{${v('m1_email')}}}`, `{{${v('m1_codigo_2')}}}`, [status(200)]),
  invitar('Vencida: invitar a v1 en B', COM_B, `{{${v('v1_email')}}}`, [status(201), guardar(v('inv_v1'), 'pm.response.json().data.id')], { preLines: identidad('v1') }),
  codigoTest('Atajo de test: código de v1 en B', 'v1', COM_B, v('v1_codigo_1')),
  item('Atajo de test: vencer la invitación de v1', req('PUT', `/test/invitaciones-empleado/{{${v('inv_v1')}}}/vencer`, { body: {} }), [status(200)]),
  item('Atajo de test: ejecutar el proceso de vencimiento (pasa v1 a VENCIDA en la base)', req('POST', '/test/jobs/vencimiento-invitaciones', { body: {} }), [
    status(200),
    "pm.test('El proceso venció al menos una', () => pm.expect(pm.response.json().data).to.be.at.least(1));",
  ]),
  equipo('Vencida: la invitación de v1 figura VENCIDA', COM_B, [
    status(200),
    `pm.test('v1 figura VENCIDA', () => pm.expect(${estadoDeInvitacion(v('inv_v1'))}).to.eql('VENCIDA'));`,
  ]),
  validar('Vencida: el código de una invitación vencida da el mismo 401', `{{${v('v1_email')}}}`, `{{${v('v1_codigo_1')}}}`, [
    status(401),
    mensajeIgualA(v('msg_401'), 'El mensaje es idéntico al de cualquier otro fallo de resolución'),
  ]),
  item('Vencida: el Dueño reenvía la vencida', req('POST', `/comercios/equipo/invitaciones/{{${v('inv_v1')}}}/reenviar`, { token: TOKEN_D1, comercio: COM_B }), [
    status(200),
    "pm.test('La nueva está PENDIENTE', () => pm.expect(pm.response.json().data.estado).to.eql('PENDIENTE'));",
  ]),
  equipo('Vencida: tras reenviar, la lista tiene una sola línea de v1 y está Pendiente (la vencida conserva su causa y no se lista)', COM_B, [
    status(200),
    `const lineas = pm.response.json().data.invitaciones.filter((i) => i.email === ${entorno(v('v1_email'))});`,
    "pm.test('Una sola línea para v1', () => pm.expect(lineas.length).to.eql(1));",
    "pm.test('La línea de v1 está PENDIENTE', () => pm.expect(lineas[0].estado).to.eql('PENDIENTE'));",
  ]),
);

agregar(
  invitar('Cancelar vencida: invitar a w1 en V', COM_V, `{{${v('w1_email')}}}`, [status(201), guardar(v('inv_w1'), 'pm.response.json().data.id')], { preLines: identidad('w1') }),
  item('Atajo de test: vencer la invitación de w1', req('PUT', `/test/invitaciones-empleado/{{${v('inv_w1')}}}/vencer`, { body: {} }), [status(200)]),
  item('Atajo de test: ejecutar el proceso de vencimiento (pasa w1 a VENCIDA en la base)', req('POST', '/test/jobs/vencimiento-invitaciones', { body: {} }), [
    status(200),
    "pm.test('El proceso venció al menos una', () => pm.expect(pm.response.json().data).to.be.at.least(1));",
  ]),
  equipo('Cancelar vencida: la invitación de w1 figura VENCIDA', COM_V, [
    status(200),
    `pm.test('w1 figura VENCIDA', () => pm.expect(${estadoDeInvitacion(v('inv_w1'))}).to.eql('VENCIDA'));`,
  ]),
  item('Cancelar vencida: el Dueño cancela la vencida', req('PUT', `/comercios/equipo/invitaciones/{{${v('inv_w1')}}}/cancelar`, { token: TOKEN_D1, comercio: COM_V }), [
    status(200),
    mensajeEs('Invitación cancelada'),
    "pm.test('Figura CANCELADA', () => pm.expect(pm.response.json().data.estado).to.eql('CANCELADA'));",
  ]),
  item('Cancelar vencida: repetirlo da 409', req('PUT', `/comercios/equipo/invitaciones/{{${v('inv_w1')}}}/cancelar`, { token: TOKEN_D1, comercio: COM_V }), [
    status(409),
    mensajeEs('Esta invitación ya no se puede cancelar'),
  ]),
  equipo('Cancelar vencida: la cancelada ya no figura en el equipo', COM_V, [
    status(200),
    `pm.test('w1 no figura', () => pm.expect(${estadoDeInvitacion(v('inv_w1'))}).to.eql(undefined));`,
  ]),
  invitar('Cancelar bloqueada: invitar a w2 en V', COM_V, `{{${v('w2_email')}}}`, [status(201), guardar(v('inv_w2'), 'pm.response.json().data.id')], { preLines: identidad('w2') }),
  codigoTest('Atajo de test: código de w2 en V', 'w2', COM_V, v('w2_codigo_1')),
);
for (let n = 1; n <= 5; n += 1) {
  agregar(
    validar(
      `Cancelar bloqueada: código incorrecto ${n}/5 da 401`,
      `{{${v('w2_email')}}}`,
      `{{${v('w2_codigo_malo')}}}`,
      [status(401)],
      n === 1 ? [guardar(v('w2_codigo_malo'), `${entorno(v('w2_codigo_1'))} === '000000' ? '111111' : '000000'`)] : [],
    ),
  );
}
agregar(
  equipo('Cancelar bloqueada: la invitación de w2 figura INVALIDADA', COM_V, [
    status(200),
    `pm.test('w2 figura INVALIDADA', () => pm.expect(${estadoDeInvitacion(v('inv_w2'))}).to.eql('INVALIDADA'));`,
  ]),
  item('Cancelar bloqueada: el Dueño cancela la de código bloqueado', req('PUT', `/comercios/equipo/invitaciones/{{${v('inv_w2')}}}/cancelar`, { token: TOKEN_D1, comercio: COM_V }), [
    status(200),
    mensajeEs('Invitación cancelada'),
    "pm.test('Figura CANCELADA', () => pm.expect(pm.response.json().data.estado).to.eql('CANCELADA'));",
  ]),
);

for (let n = 1; n <= 5; n += 1) {
  agregar(
    invitar(
      `Tope: invitación ${n}/5 del comercio T`,
      COM_T,
      `{{${v(`t${n}_email`)}}}`,
      n === 1 ? [status(201), guardar(v('inv_t1'), 'pm.response.json().data.id')] : [status(201)],
      { preLines: identidad(`t${n}`) },
    ),
  );
}
agregar(
  invitar('Tope: la sexta invitación en la hora da 409 con la hora de reintento', COM_T, 'sexta.invitacion@bajonea.test', [
    status(409),
    "pm.test('El mensaje trae la hora', () => pm.expect(pm.response.json().mensaje).to.match(/^Alcanzaste el máximo de 5 invitaciones por hora\\. Probá de nuevo a las \\d{2}:\\d{2}$/));",
  ]),
  codigoTest('Atajo de test: código de t1 en T', 't1', COM_T, v('t1_codigo_1')),
  item('Cancelar: la invitación de t1 queda CANCELADA', req('PUT', `/comercios/equipo/invitaciones/{{${v('inv_t1')}}}/cancelar`, { token: TOKEN_D1, comercio: COM_T }), [
    status(200),
    mensajeEs('Invitación cancelada'),
    "pm.test('La invitación devuelta figura CANCELADA', () => pm.expect(pm.response.json().data.estado).to.eql('CANCELADA'));",
  ]),
  item('Cancelar: repetirlo da 409', req('PUT', `/comercios/equipo/invitaciones/{{${v('inv_t1')}}}/cancelar`, { token: TOKEN_D1, comercio: COM_T }), [
    status(409),
    mensajeEs('Esta invitación ya no se puede cancelar'),
  ]),
  item('Reenviar: una invitación cancelada da 409', req('POST', `/comercios/equipo/invitaciones/{{${v('inv_t1')}}}/reenviar`, { token: TOKEN_D1, comercio: COM_T }), [
    status(409),
    mensajeEs('Esta invitación ya no se puede reenviar'),
  ]),
  validar('Cancelar: el código de la invitación cancelada da 401', `{{${v('t1_email')}}}`, `{{${v('t1_codigo_1')}}}`, [
    status(401),
    mensajeIgualA(v('msg_401'), 'El mensaje es idéntico al de cualquier otro fallo de resolución'),
  ]),
  equipo('Cancelar: la invitación cancelada no figura en el equipo', COM_T, [
    status(200),
    `pm.test('t1 no figura', () => pm.expect(${estadoDeInvitacion(v('inv_t1'))}).to.eql(undefined));`,
    "pm.test('Las otras cuatro siguen PENDIENTE', () => pm.expect(pm.response.json().data.invitaciones.filter((i) => i.estado === 'PENDIENTE')).to.have.length(4));",
  ]),
);

agregar(
  invitar('Comercio suspendido: invitar a s1 en S antes de suspenderlo', COM_S, `{{${v('s1_email')}}}`, [status(201)], { preLines: identidad('s1') }),
  codigoTest('Atajo de test: código de s1 en S', 's1', COM_S, v('s1_codigo_2')),
  item('Comercio suspendido: el Administrador suspende S', req('PUT', `/administrador/comercios/${COM_S}/suspender`, { token: 'token_admin', body: { motivo: 'Suspension de prueba del rol Empleado' } }), [status(200)]),
  validar('Comercio suspendido: validar sigue permitido', `{{${v('s1_email')}}}`, `{{${v('s1_codigo_2')}}}`, [status(200)]),
  aceptar('Comercio suspendido: aceptar con cuenta nueva sigue permitido', cuerpoAceptar('s1'), [
    status(200),
    "pm.test('Cuenta creada', () => pm.expect(pm.response.json().data.cuentaCreada).to.eql(true));",
  ]),
  invitar('Comercio suspendido: invitar en S ya no se puede', COM_S, 'otra.persona@bajonea.test', [status(409), mensajeEs('Este comercio no puede invitar empleados en este momento')]),
);

const MSG_EDAD_REGISTRO = 'Tenés que tener al menos 14 años para registrarte';
const MSG_EDAD_CUENTA_NUEVA = 'Tenés que tener 18 años o más para trabajar en un comercio';
const MSG_EDAD_CUENTA_EXISTENTE = 'Tenés que tener 18 años o más para sumarte a un equipo';

const fechaRelativa = (clave, anios, dias = 0) => [
  'const f = new Date();',
  `f.setFullYear(f.getFullYear() - ${anios});`,
  `f.setDate(f.getDate() + ${dias});`,
  'const dos = (n) => String(n).padStart(2, "0");',
  guardar(v(`fecha_${clave}`), "f.getFullYear() + '-' + dos(f.getMonth() + 1) + '-' + dos(f.getDate())"),
];

const fechaVar = (clave) => `{{${v(`fecha_${clave}`)}}}`;

const registroClienteConFecha = (nombre, clave, fechaClave, anios, dias, testLines, { generarIdentidad = true } = {}) =>
  item(
    nombre,
    req('POST', '/auth/registro/cliente', {
      body: {
        nombre: 'Clienta',
        apellido: 'Edad',
        dni: `{{${v(`${clave}_dni`)}}}`,
        fechaNacimiento: fechaVar(fechaClave),
        telefono: '+5492964551236',
        nombreUsuario: `{{${v(`${clave}_usuario`)}}}`,
        email: `{{${v(`${clave}_email`)}}}`,
        password: `{{${v(`${clave}_password`)}}}`,
        aceptaTerminos: true,
        direccion: { calle: 'Calle Siempre Viva', numero: '123', pisoDepto: null, codigoPostal: '9420', localidadId: '{{localidad_id}}', principal: true },
      },
    }),
    testLines,
    [...(generarIdentidad ? identidad(clave) : []), ...fechaRelativa(fechaClave, anios, dias)],
  );

const verificarCliente = (clave) => [
  item(`Bypass test - codigo de verificacion Cliente ${clave}`, req('GET', '/test/token-verificacion', { query: `email={{${v(`${clave}_email`)}}}` }), [
    status(200),
    guardar(v(`${clave}_codigo_verif`), 'pm.response.json().data'),
  ]),
  item(`Verificar cuenta Cliente ${clave}`, req('POST', '/auth/verificar', { body: { email: `{{${v(`${clave}_email`)}}}`, codigo: `{{${v(`${clave}_codigo_verif`)}}}` } }), [status(200)]),
];

const errorEnCampo = (campo, mensaje) =>
  `pm.test('Error en ${campo}', () => pm.expect(pm.response.json().data[${JSON.stringify(campo)}]).to.eql(${JSON.stringify(mensaje)}));`;

const aceptarConFecha = (nombre, clave, fechaClave, anios, dias, testLines) =>
  item(
    nombre,
    req('POST', '/auth/invitaciones-empleado/aceptar', {
      body: {
        email: `{{${v(`${clave}_email`)}}}`,
        codigo: `{{${v(`${clave}_codigo_2`)}}}`,
        aceptaTerminos: true,
        cuentaNueva: cuentaNueva(clave, fechaVar(fechaClave)),
      },
    }),
    testLines,
    fechaRelativa(fechaClave, anios, dias),
  );

agregar(
  registroClienteConFecha('Edad mínima: registro de Cliente con 13 años da 400 en fechaNacimiento', 'r13', 'r13', 13, 0, [
    status(400),
    errorEnCampo('fechaNacimiento', MSG_EDAD_REGISTRO),
  ]),
  registroClienteConFecha('Edad mínima: registro de Cliente un día antes de cumplir 14 da 400', 'r14m', 'r14m', 14, 1, [
    status(400),
    errorEnCampo('fechaNacimiento', MSG_EDAD_REGISTRO),
  ]),
  registroClienteConFecha('Edad mínima: registro de Cliente con 14 años cumplidos hoy da 201', 'r14', 'r14', 14, 0, [status(201)]),
);

agregar(clonar('ED', 'ed', 'APROBADO'));
const COM_ED = `{{${v('com_ed')}}}`;

agregar(
  invitar('Edad mínima: invitar a cn (email sin cuenta) en ED', COM_ED, `{{${v('cn_email')}}}`, [status(201), guardar(v('inv_cn'), 'pm.response.json().data.id')], { preLines: identidad('cn') }),
  codigoTest('Atajo de test: código de cn en ED', 'cn', COM_ED, v('cn_codigo_2')),
  aceptarConFecha('Edad mínima: cuenta nueva por invitación con 13 años da 400 con el mensaje de 18 (nunca el de 14) y prefijo', 'cn', 'cn13', 13, 0, [
    status(400),
    errorEnCampo('cuentaNueva.fechaNacimiento', MSG_EDAD_CUENTA_NUEVA),
    "pm.test('El mensaje de 14 años no aparece', () => pm.expect(pm.response.text()).to.not.include('al menos 14 años'));",
  ]),
  aceptarConFecha('Edad mínima: cuenta nueva por invitación con 15 años da 400 con el mensaje de 18', 'cn', 'cn15', 15, 0, [
    status(400),
    errorEnCampo('cuentaNueva.fechaNacimiento', MSG_EDAD_CUENTA_NUEVA),
  ]),
  aceptarConFecha('Edad mínima: cuenta nueva por invitación un día antes de cumplir 18 da 400', 'cn', 'cn18m', 18, 1, [
    status(400),
    errorEnCampo('cuentaNueva.fechaNacimiento', MSG_EDAD_CUENTA_NUEVA),
  ]),
  equipo('Edad mínima: la invitación de cn sigue PENDIENTE y no se creó ningún miembro', COM_ED, [
    status(200),
    `pm.test('cn sigue PENDIENTE', () => pm.expect(${estadoDeInvitacion(v('inv_cn'))}).to.eql('PENDIENTE'));`,
    "pm.test('No hay miembros', () => pm.expect(pm.response.json().data.miembros).to.eql([]));",
  ]),
  aceptarConFecha('Edad mínima: cuenta nueva por invitación con 18 años cumplidos hoy da 200', 'cn', 'cn18', 18, 0, [
    status(200),
    "pm.test('Cuenta creada', () => pm.expect(pm.response.json().data.cuentaCreada).to.eql(true));",
  ]),
);

agregar(
  invitar('Edad mínima: invitar a mn (email sin cuenta todavía) en ED', COM_ED, `{{${v('mn_email')}}}`, [status(201), guardar(v('inv_mn'), 'pm.response.json().data.id')], { preLines: identidad('mn') }),
  codigoTest('Atajo de test: código de mn en ED', 'mn', COM_ED, v('mn_codigo_2')),
  registroClienteConFecha('Edad mínima: mn se registra como Cliente con 16 años (válido para Cliente)', 'mn', 'mn16', 16, 0, [status(201)], { generarIdentidad: false }),
  ...verificarCliente('mn'),
  validar('Edad mínima: validar con una cuenta existente de 16 años da 409', `{{${v('mn_email')}}}`, `{{${v('mn_codigo_2')}}}`, [
    status(409),
    mensajeEs(MSG_EDAD_CUENTA_EXISTENTE),
  ]),
  aceptar('Edad mínima: aceptar con una cuenta existente de 16 años da el mismo 409', { email: `{{${v('mn_email')}}}`, codigo: `{{${v('mn_codigo_2')}}}` }, [
    status(409),
    mensajeEs(MSG_EDAD_CUENTA_EXISTENTE),
  ]),
  item('Edad mínima: reenviar a una cuenta existente de 16 años da el 409 genérico', req('POST', `/comercios/equipo/invitaciones/{{${v('inv_mn')}}}/reenviar`, { token: TOKEN_D1, comercio: COM_ED }), [
    status(409),
    mensajeEs('No se puede invitar a este email'),
  ]),
  invitar('Edad mínima: invitar a una cuenta existente de 16 años da el mismo 409 genérico', COM_ED, `{{${v('mn_email')}}}`, [
    status(409),
    mensajeEs('No se puede invitar a este email'),
  ]),
  cantidadRegularizacion('Edad mínima: a la cuenta de 16 años no se le mandó email de regularización', `{{${v('mn_email')}}}`, 0),
  equipo('Edad mínima: la invitación de mn sigue PENDIENTE, no se creó otra y no hay relación', COM_ED, [
    status(200),
    `pm.test('mn sigue PENDIENTE', () => pm.expect(${estadoDeInvitacion(v('inv_mn'))}).to.eql('PENDIENTE'));`,
    "pm.test('Una sola invitación pendiente de mn', () => pm.expect(pm.response.json().data.invitaciones.filter((i) => i.estado === 'PENDIENTE' && i.email === pm.environment.get('e1_mn_email'))).to.have.length(1));",
    "pm.test('mn no figura entre los miembros', () => pm.expect(pm.response.json().data.miembros.some((m) => m.email === pm.environment.get('e1_mn_email'))).to.eql(false));",
  ]),
);

agregar(
  registroClienteConFecha('Edad mínima: u17 se registra como Cliente un día antes de cumplir 18', 'u17', 'u17', 18, 1, [status(201)]),
  ...verificarCliente('u17'),
  invitar('Edad mínima: invitar a una cuenta existente un día antes de cumplir 18 da el 409 genérico', COM_ED, `{{${v('u17_email')}}}`, [
    status(409),
    mensajeEs('No se puede invitar a este email'),
  ]),
  registroClienteConFecha('Edad mínima: u18 se registra como Cliente con 18 años cumplidos hoy', 'u18', 'u18', 18, 0, [status(201)]),
  ...verificarCliente('u18'),
  invitar('Edad mínima: invitar a una cuenta existente con 18 años cumplidos hoy da 201', COM_ED, `{{${v('u18_email')}}}`, [status(201)]),
  codigoTest('Atajo de test: código de u18 en ED', 'u18', COM_ED, v('u18_codigo_2')),
  validar('Edad mínima: validar con una cuenta existente de 18 años cumplidos hoy da 200', `{{${v('u18_email')}}}`, `{{${v('u18_codigo_2')}}}`, [status(200)]),
  aceptar('Edad mínima: aceptar con una cuenta existente de 18 años cumplidos hoy da 200', { email: `{{${v('u18_email')}}}`, codigo: `{{${v('u18_codigo_2')}}}` }, [
    status(200),
    "pm.test('No se creó una cuenta', () => pm.expect(pm.response.json().data.cuentaCreada).to.eql(false));",
  ]),
);

const registroDeEmpleado = (emailExpr, dniExpr) =>
  registroComercio('{{e1_cuit_tmp}}', dniExpr, `{{${v('exe_usuario')}}}`, emailExpr, `{{${v('exe_password')}}}`, 'Ex Empleado Postman');

agregar(
  item('Matriz de roles: quien es Empleado no puede registrar un comercio con su email', req('POST', '/auth/registro/comercio', {
    body: registroDeEmpleado(emailN1, '{{e1_dni_rep_tmp}}'),
  }), [status(409), mensajeEs('Ya existe una cuenta registrada con ese email')], [...identidad('exe'), ...datosDueno]),
  item('Matriz de roles: ni con su DNI como representante', req('POST', '/auth/registro/comercio', {
    body: registroDeEmpleado(`{{${v('exe_email')}}}`, `{{${v('n1_dni')}}}`),
  }), [status(409), mensajeEs('Ya existe una cuenta registrada con ese DNI')]),
);

const folder = { name: NOMBRE_FOLDER, item: items };

const collection = JSON.parse(fs.readFileSync(collectionPath, 'utf8'));
const idx = collection.item.findIndex((f) => f.name === NOMBRE_FOLDER);
if (idx >= 0) collection.item[idx] = folder;
else collection.item.push(folder);
fs.writeFileSync(collectionPath, JSON.stringify(collection, null, 2) + '\n', 'utf8');

const claves = new Set();
const recorrer = (texto) => {
  for (const coincidencia of texto.matchAll(/e1_[a-z0-9_]+/g)) claves.add(coincidencia[0]);
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
