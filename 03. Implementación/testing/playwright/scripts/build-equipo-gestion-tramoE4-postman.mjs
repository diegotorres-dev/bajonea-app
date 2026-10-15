import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const collectionPath = path.resolve(__dirname, '../../../postman/Bajonea-MVP.postman_collection.json');
const environmentPath = path.resolve(__dirname, '../../../postman/Bajonea-Local.postman_environment.json');

const PREFIJO_CARPETA = '68 - ';
const NOMBRE_CARPETA = '68 - Gestion del equipo E4 (desactivar y reactivar miembros, historial, avisos y reglas de reactivacion)';

const v = (clave) => `e4_${clave}`;

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
const dataEs = (campo, valor) => `pm.test('data.${campo} es ${valor}', () => pm.expect(pm.response.json().data.${campo}).to.eql(${JSON.stringify(valor)}));`;
const NO_DISPONIBLE = [
  status(404),
  "pm.test('Mismo 404 de siempre: Comercio no encontrado y codigo COMERCIO_NO_DISPONIBLE', () => { const b = pm.response.json(); pm.expect(b.mensaje).to.eql('Comercio no encontrado'); pm.expect(b.data.codigo).to.eql('COMERCIO_NO_DISPONIBLE'); });",
];

function identidad(clave) {
  return [
    `const s = Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36);`,
    guardar(v(`${clave}_email`), `'e4.${clave}.' + s + '@bajonea.test'`),
    guardar(v(`${clave}_usuario`), `('e4${clave}' + s).slice(0, 20)`),
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
const TOKEN_E1 = v('e1_token');
const TOKEN_E2 = v('e2_token');
const E1 = `{{${v('e1_id')}}}`;
const E2 = `{{${v('e2_id')}}}`;
const TOKEN_E3 = v('e3_token');
const TOKEN_E4 = v('e4_token');
const TOKEN_E5 = v('e5_token');
const EQUIPO = '/comercios/equipo';
const RENUNCIAR = (comercio) => `/empleados/comercios/${comercio}/renunciar`;
const ACCESO = (comercio) => `/empleados/comercios/${comercio}/acceso`;

const items = [];
const agregar = (...nuevos) => items.push(...nuevos);

function clienteNuevo(clave, nombre) {
  return [
    item(
      `Registro ${nombre}`,
      req('POST', '/auth/registro/cliente', {
        body: {
          nombre,
          apellido: 'Equipo',
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

function sumarAlEquipo(clave, nombre) {
  return [
    item(`El Dueño invita a ${nombre} al comercio`, req('POST', `${EQUIPO}/invitaciones`, { token: TOKEN_DUENO, comercio: COM, body: { email: `{{${v(`${clave}_email`)}}}` } }), [status(201)]),
    item(`Bypass test - codigo de la invitacion de ${nombre}`, req('GET', '/test/invitaciones-empleado/codigo', { query: `email={{${v(`${clave}_email`)}}}&comercioId=${COM}` }), [
      status(200),
      guardar(v(`${clave}_inv_codigo`), 'pm.response.json().data'),
    ]),
    item(`${nombre} acepta la invitacion`, req('POST', '/auth/invitaciones-empleado/aceptar', { body: { email: `{{${v(`${clave}_email`)}}}`, codigo: `{{${v(`${clave}_inv_codigo`)}}}` } }), [status(200)]),
  ];
}

const desactivar = (id, token = TOKEN_DUENO, comercio = COM) => req('PUT', `${EQUIPO}/miembros/${id}/desactivar`, { token, comercio });
const reactivar = (id, token = TOKEN_DUENO, comercio = COM) => req('PUT', `${EQUIPO}/miembros/${id}/reactivar`, { token, comercio });

const miembro = (idVar, estado, motivo, puede) => [
  status(200),
  `const m = pm.response.json().data.miembros.find((x) => x.empleadoId === Number(${entorno(idVar)}));`,
  "pm.test('El miembro esta en el equipo', () => pm.expect(m).to.exist);",
  `pm.test('estado ${estado}', () => pm.expect(m.estado).to.eql('${estado}'));`,
  `pm.test('motivoBaja ${motivo}', () => pm.expect(m.motivoBaja).to.eql(${JSON.stringify(motivo)}));`,
  `pm.test('puedeReactivar ${puede}', () => pm.expect(m.puedeReactivar).to.eql(${puede}));`,
];

const avisoPersonal = (fragmento, existe = true) => [
  status(200),
  `const hay = pm.response.json().data.some((n) => n.mensaje.includes(${JSON.stringify(fragmento)}));`,
  `pm.test('La campana personal ${existe ? 'tiene' : 'no tiene'} el aviso "${fragmento}"', () => pm.expect(hay).to.eql(${existe}));`,
];

const avisoDelComercio = (fragmento, cantidad) => [
  status(200),
  `const hay = pm.response.json().data.filter((n) => n.mensaje.includes(${JSON.stringify(fragmento)})).length;`,
  `pm.test('Hay ${cantidad} aviso(s) "${fragmento}"', () => pm.expect(hay).to.eql(${cantidad}));`,
];

const ACCESO_DE = (estado, motivo, accesible) => [
  status(200),
  mensajeEs('Acceso obtenido correctamente'),
  dataEs('estado', estado),
  `pm.test('motivoBaja ${motivo}', () => pm.expect(pm.response.json().data.motivoBaja === undefined ? null : pm.response.json().data.motivoBaja).to.eql(${JSON.stringify(motivo)}));`,
  dataEs('comercioAccesible', accesible),
  'pm.test("Solo los tres campos", () => pm.expect(Object.keys(pm.response.json().data).filter((k) => pm.response.json().data[k] !== null).every((k) => ["estado", "motivoBaja", "comercioAccesible"].includes(k))).to.eql(true));',
];

const CAMBIO = (estado, motivo, puede, mensaje) => [
  status(200),
  mensajeEs(mensaje),
  dataEs('estado', estado),
  `pm.test('motivoBaja ${motivo}', () => pm.expect(pm.response.json().data.motivoBaja).to.eql(${JSON.stringify(motivo)}));`,
  dataEs('puedeReactivar', puede),
];

const ESTADOS_MIEMBRO = `GET ${EQUIPO}`;

agregar(
  item('Login Administrador (sesion propia de esta carpeta)', req('POST', '/auth/login', { body: { nombreUsuario: '{{admin_usuario}}', password: '{{admin_password}}' } }), [
    status(200),
    guardar('token_admin', 'pm.response.json().data.token'),
  ]),
  item(
    'Registro Dueño',
    req('POST', '/auth/registro/comercio', {
      body: {
        razonSocial: 'Equipo E4 SRL',
        cuit: `{{${v('cuit_tmp')}}}`,
        condicionIva: 'RESPONSABLE_INSCRIPTO',
        tipoSociedad: 'SRL',
        domicilioFiscal: 'Direccion fiscal E4 100',
        fechaInicioActividades: '2020-01-01',
        nombre: 'Local Equipo E4',
        descripcion: 'Comercio generado por la coleccion de Postman (gestion del equipo, E4)',
        telefono: '+5492964555444',
        emailContacto: `{{${v('d_email')}}}`,
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
        fotoPerfilUrl: 'https://res.cloudinary.com/demo/image/upload/postman-equipo-e4.jpg',
        redesSociales: [{ tipo: 'INSTAGRAM', url: 'instagram.com/equipoe4' }],
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
  ...clienteNuevo('e1', 'Ana'),
  ...sumarAlEquipo('e1', 'Ana'),
  loginDe('e1', 'Ana', TOKEN_E1),
  ...clienteNuevo('e2', 'Beto'),
  ...sumarAlEquipo('e2', 'Beto'),
  loginDe('e2', 'Beto', TOKEN_E2),

  item('El equipo trae a Ana activa, sin motivo de baja y sin posibilidad de reactivar', req('GET', EQUIPO, { token: TOKEN_DUENO, comercio: COM }), miembro(v('e1_id'), 'ACTIVO', null, false)),
  item('Ana trabaja en el comercio: GET /pedidos/comercio da 200', req('GET', '/pedidos/comercio', { token: TOKEN_E1, comercio: COM }), [status(200)]),

  item('Seguridad: Ana (Empleada) no puede desactivar a otro miembro', req('PUT', `${EQUIPO}/miembros/${E2}/desactivar`, { token: TOKEN_E1, comercio: COM }), [status(403)]),
  item('Seguridad: Ana no puede reactivar', req('PUT', `${EQUIPO}/miembros/${E2}/reactivar`, { token: TOKEN_E1, comercio: COM }), [status(403)]),
  item('Seguridad: sin sesion da 401', req('PUT', `${EQUIPO}/miembros/${E1}/desactivar`, { comercio: COM }), [status(401)]),
  item('Seguridad: sin X-Comercio-Id da 400', req('PUT', `${EQUIPO}/miembros/${E1}/desactivar`, { token: TOKEN_DUENO }), [status(400)]),
  item('Un miembro inexistente da 404 "Miembro no encontrado"', req('PUT', `${EQUIPO}/miembros/987654321/desactivar`, { token: TOKEN_DUENO, comercio: COM }), [status(404), mensajeEs('Miembro no encontrado')]),
  item('El propio Dueño no es un miembro: 404', req('PUT', `${EQUIPO}/miembros/{{${v('d_id')}}}/desactivar`, { token: TOKEN_DUENO, comercio: COM }), [status(404), mensajeEs('Miembro no encontrado')]),
  item('Reactivar a un miembro ya activo es idempotente: 200 sin cambios', req('PUT', `${EQUIPO}/miembros/${E1}/reactivar`, { token: TOKEN_DUENO, comercio: COM }), [
    status(200),
    mensajeEs('El miembro ya estaba activo'),
    dataEs('estado', 'ACTIVO'),
  ]),

  item('El Dueño da de baja a Ana', req('PUT', `${EQUIPO}/miembros/${E1}/desactivar`, { token: TOKEN_DUENO, comercio: COM }), CAMBIO('INACTIVO', 'BAJA_DUENO', true, 'Miembro dado de baja')),
  item('Repetir la baja es idempotente: 200 "El miembro ya estaba inactivo"', req('PUT', `${EQUIPO}/miembros/${E1}/desactivar`, { token: TOKEN_DUENO, comercio: COM }), CAMBIO('INACTIVO', 'BAJA_DUENO', true, 'El miembro ya estaba inactivo')),
  item('El equipo muestra a Ana inactiva, dada de baja por el Dueño y reactivable', req('GET', EQUIPO, { token: TOKEN_DUENO, comercio: COM }), miembro(v('e1_id'), 'INACTIVO', 'BAJA_DUENO', true)),
  item('Ana pierde el acceso en la siguiente request: el mismo 404', req('GET', '/pedidos/comercio', { token: TOKEN_E1, comercio: COM }), NO_DISPONIBLE),
  item('Ana ya no tiene comercios', req('GET', '/empleados/mis-comercios', { token: TOKEN_E1 }), [
    status(200),
    "pm.test('La lista esta vacia', () => pm.expect(pm.response.json().data.length).to.eql(0));",
  ]),
  item('La campana personal de Ana tiene el aviso de baja (T32)', req('GET', '/notificaciones', { token: TOKEN_E1 }), avisoPersonal('te dio de baja del equipo. Ya no tenés acceso a ese comercio.')),
  item('El Dueño reactiva directamente a Ana', req('PUT', `${EQUIPO}/miembros/${E1}/reactivar`, { token: TOKEN_DUENO, comercio: COM }), CAMBIO('ACTIVO', null, false, 'Miembro reactivado')),
  item('Ana recupera el acceso en la siguiente request', req('GET', '/pedidos/comercio', { token: TOKEN_E1, comercio: COM }), [status(200)]),
  item('La campana personal de Ana tiene el aviso de reactivacion (T37)', req('GET', '/notificaciones', { token: TOKEN_E1 }), avisoPersonal('te reactivó en el equipo. Ya podés volver a trabajar ahí.')),
  item('El equipo vuelve a mostrar a Ana activa', req('GET', EQUIPO, { token: TOKEN_DUENO, comercio: COM }), miembro(v('e1_id'), 'ACTIVO', null, false)),

  item('Atajo de test: se registra una renuncia de Beto', req('PUT', `/test/comercios/${COM}/empleados/${E2}/estado`, { body: {}, query: 'estado=INACTIVO&motivo=RENUNCIA' }), [status(200)]),
  item('El equipo muestra a Beto inactivo por renuncia y no reactivable', req('GET', EQUIPO, { token: TOKEN_DUENO, comercio: COM }), miembro(v('e2_id'), 'INACTIVO', 'RENUNCIA', false)),
  item('No se reactiva directamente a quien renuncio: 409 EMPLEADO_NO_REACTIVABLE', req('PUT', `${EQUIPO}/miembros/${E2}/reactivar`, { token: TOKEN_DUENO, comercio: COM }), [
    status(409),
    codigoEs('EMPLEADO_NO_REACTIVABLE'),
    mensajeEs('Esta persona dejó el equipo por su cuenta. Para que vuelva, invitala de nuevo.'),
  ]),
  item('Atajo de test: Beto vuelve a estar activo (sin pasar por el endpoint real)', req('PUT', `/test/comercios/${COM}/empleados/${E2}/estado`, { body: {}, query: 'estado=ACTIVO' }), [status(200)]),

  item('Con una baja del Dueño: se da de baja a Ana otra vez', req('PUT', `${EQUIPO}/miembros/${E1}/desactivar`, { token: TOKEN_DUENO, comercio: COM }), CAMBIO('INACTIVO', 'BAJA_DUENO', true, 'Miembro dado de baja')),
  item('El Dueño invita de nuevo a Ana: la invitacion trae 7 dias restantes', req('POST', `${EQUIPO}/invitaciones`, { token: TOKEN_DUENO, comercio: COM, body: { email: `{{${v('e1_email')}}}` } }), [
    status(201),
    guardar(v('inv_id'), 'pm.response.json().data.id'),
    dataEs('diasRestantes', 7),
  ]),
  item('El equipo lista la invitacion pendiente con 7 dias restantes calculados por el servidor', req('GET', EQUIPO, { token: TOKEN_DUENO, comercio: COM }), [
    status(200),
    `const i = pm.response.json().data.invitaciones.find((x) => x.id === Number(${entorno(v('inv_id'))}));`,
    "pm.test('La invitacion esta pendiente', () => { pm.expect(i).to.exist; pm.expect(i.estado).to.eql('PENDIENTE'); });",
    "pm.test('diasRestantes es 7', () => pm.expect(i.diasRestantes).to.eql(7));",
  ]),
  item('Con una invitacion pendiente vigente no se reactiva directamente: 409 INVITACION_PENDIENTE', req('PUT', `${EQUIPO}/miembros/${E1}/reactivar`, { token: TOKEN_DUENO, comercio: COM }), [
    status(409),
    codigoEs('INVITACION_PENDIENTE'),
    mensajeEs('Hay una invitación pendiente para esta persona. Cancelala primero.'),
  ]),
  item('El Dueño cancela la invitacion: ya no tiene dias restantes', req('PUT', `${EQUIPO}/invitaciones/{{${v('inv_id')}}}/cancelar`, { token: TOKEN_DUENO, comercio: COM }), [
    status(200),
    "pm.test('Sin diasRestantes', () => pm.expect(pm.response.json().data.diasRestantes === undefined || pm.response.json().data.diasRestantes === null).to.eql(true));",
  ]),
  item('Cancelada la invitacion, la reactivacion directa funciona', req('PUT', `${EQUIPO}/miembros/${E1}/reactivar`, { token: TOKEN_DUENO, comercio: COM }), CAMBIO('ACTIVO', null, false, 'Miembro reactivado')),

  item('Se da de baja a Ana para probar la cuenta no apta', req('PUT', `${EQUIPO}/miembros/${E1}/desactivar`, { token: TOKEN_DUENO, comercio: COM }), [status(200)]),
  item('Ana falla el login por primera vez', req('POST', '/auth/login', { body: { nombreUsuario: `{{${v('e1_usuario')}}}`, password: 'ClaveIncorrecta1' } }), [status(401)]),
  item('Ana falla el login por segunda vez', req('POST', '/auth/login', { body: { nombreUsuario: `{{${v('e1_usuario')}}}`, password: 'ClaveIncorrecta1' } }), [status(401)]),
  item('Ana falla el login por tercera vez: la cuenta se bloquea', req('POST', '/auth/login', { body: { nombreUsuario: `{{${v('e1_usuario')}}}`, password: 'ClaveIncorrecta1' } }), [status(401)]),
  item('Con la cuenta bloqueada la reactivacion da el 409 generico, sin revelar el estado', req('PUT', `${EQUIPO}/miembros/${E1}/reactivar`, { token: TOKEN_DUENO, comercio: COM }), [
    status(409),
    mensajeEs('No se puede reactivar a esta persona'),
    "pm.test('No revela que la cuenta esta bloqueada', () => pm.expect(pm.response.text().toLowerCase()).to.not.include('bloquead'));",
  ]),
  item('Sigue inactiva', req('GET', EQUIPO, { token: TOKEN_DUENO, comercio: COM }), miembro(v('e1_id'), 'INACTIVO', 'BAJA_DUENO', true)),

  ...clienteNuevo('e3', 'Cora'),
  ...sumarAlEquipo('e3', 'Cora'),
  loginDe('e3', 'Cora', TOKEN_E3),
  ...clienteNuevo('e4', 'Dani'),
  ...sumarAlEquipo('e4', 'Dani'),
  loginDe('e4', 'Dani', TOKEN_E4),
  ...clienteNuevo('e5', 'Eli'),
  loginDe('e5', 'Eli', TOKEN_E5),

  item('Renuncia: sin sesion da 401', req('PUT', `${RENUNCIAR(COM)}`), [status(401)]),
  item('Renuncia: el Dueño no puede renunciar (403 de la seguridad, no del servicio)', req('PUT', RENUNCIAR(COM), { token: TOKEN_DUENO }), [status(403)]),
  item('Renuncia: el Administrador no puede renunciar (403)', req('PUT', RENUNCIAR(COM), { token: 'token_admin' }), [status(403)]),
  item('Acceso: sin sesion da 401', req('GET', ACCESO(COM)), [status(401)]),
  item('Acceso: el Dueño recibe 403', req('GET', ACCESO(COM), { token: TOKEN_DUENO }), [status(403)]),
  item('Acceso: el Administrador recibe 403', req('GET', ACCESO(COM), { token: 'token_admin' }), [status(403)]),
  item('Renuncia: Eli (sin relacion con el comercio) recibe el 404 de siempre', req('PUT', RENUNCIAR(COM), { token: TOKEN_E5 }), [
    ...NO_DISPONIBLE,
    guardar(v('cuerpo_no_disponible'), 'pm.response.text()'),
  ]),
  item('Renuncia: un comercio inexistente da exactamente el mismo cuerpo', req('PUT', RENUNCIAR('987654321'), { token: TOKEN_E3 }), [
    ...NO_DISPONIBLE,
    `pm.test('Cuerpo identico al de un comercio sin relacion', () => pm.expect(pm.response.json()).to.eql(JSON.parse(${entorno(v('cuerpo_no_disponible'))})));`,
  ]),
  item('Acceso: Eli sin relacion recibe el mismo 404 identico', req('GET', ACCESO(COM), { token: TOKEN_E5 }), [
    ...NO_DISPONIBLE,
    `pm.test('Cuerpo identico', () => pm.expect(pm.response.json()).to.eql(JSON.parse(${entorno(v('cuerpo_no_disponible'))})));`,
  ]),
  item('Acceso: un comercio inexistente da el mismo cuerpo', req('GET', ACCESO('987654321'), { token: TOKEN_E3 }), [
    ...NO_DISPONIBLE,
    `pm.test('Cuerpo identico', () => pm.expect(pm.response.json()).to.eql(JSON.parse(${entorno(v('cuerpo_no_disponible'))})));`,
  ]),
  item('Acceso: Cora (activa) ve su relacion activa, sin motivo, y el comercio accesible; el header se ignora', req('GET', ACCESO(COM), { token: TOKEN_E3, comercio: 'no-es-un-numero' }), ACCESO_DE('ACTIVO', null, true)),
  item('La campana del Dueño aun no tiene avisos de renuncia', req('GET', '/notificaciones', { token: TOKEN_DUENO, comercio: COM }), avisoDelComercio('dejó de trabajar en', 0)),

  item('Cora renuncia: 200 "Dejaste de trabajar en el comercio" y sin datos', req('PUT', RENUNCIAR(COM), { token: TOKEN_E3 }), [
    status(200),
    mensajeEs('Dejaste de trabajar en el comercio'),
    "pm.test('Sin data', () => pm.expect(pm.response.json().data).to.eql(null));",
  ]),
  item('Repetir la renuncia es idempotente: 200 "Ya habías dejado de trabajar en este comercio"', req('PUT', RENUNCIAR(COM), { token: TOKEN_E3 }), [
    status(200),
    mensajeEs('Ya habías dejado de trabajar en este comercio'),
  ]),
  item('Acceso: Cora ve su relacion inactiva por renuncia', req('GET', ACCESO(COM), { token: TOKEN_E3 }), ACCESO_DE('INACTIVO', 'RENUNCIA', true)),
  item('Cora pierde el acceso en la siguiente request: el mismo 404', req('GET', '/pedidos/comercio', { token: TOKEN_E3, comercio: COM }), NO_DISPONIBLE),
  item('Cora ya no tiene comercios', req('GET', '/empleados/mis-comercios', { token: TOKEN_E3 }), [
    status(200),
    "pm.test('La lista esta vacia', () => pm.expect(pm.response.json().data.length).to.eql(0));",
  ]),
  item('El equipo muestra a Cora inactiva por renuncia y no reactivable', req('GET', EQUIPO, { token: TOKEN_DUENO, comercio: COM }), miembro(v('e3_id'), 'INACTIVO', 'RENUNCIA', false)),
  item('El Dueño no puede reactivar a quien renuncio: 409 EMPLEADO_NO_REACTIVABLE', req('PUT', `${EQUIPO}/miembros/{{${v('e3_id')}}}/reactivar`, { token: TOKEN_DUENO, comercio: COM }), [
    status(409),
    codigoEs('EMPLEADO_NO_REACTIVABLE'),
  ]),
  item('La campana del Dueño tiene el aviso de renuncia (T34), una sola vez', req('GET', '/notificaciones', { token: TOKEN_DUENO, comercio: COM }), avisoDelComercio('Cora Equipo dejó de trabajar en Local Equipo E4.', 1)),
  item('La campana personal de Cora no tiene aviso de baja', req('GET', '/notificaciones', { token: TOKEN_E3 }), avisoPersonal('te dio de baja del equipo', false)),
  item('Atajo de test: Cora vuelve a estar activa (el tope de invitaciones por hora del comercio no deja invitarla otra vez)', req('PUT', `/test/comercios/${COM}/empleados/{{${v('e3_id')}}}/estado`, { body: {}, query: 'estado=ACTIVO' }), [status(200)]),
  item('Acceso: Cora vuelve a estar activa', req('GET', ACCESO(COM), { token: TOKEN_E3 }), ACCESO_DE('ACTIVO', null, true)),
  item('El Dueño da de baja a Cora', req('PUT', `${EQUIPO}/miembros/{{${v('e3_id')}}}/desactivar`, { token: TOKEN_DUENO, comercio: COM }), [status(200)]),
  item('Acceso: Cora ve su relacion inactiva por baja del Dueño', req('GET', ACCESO(COM), { token: TOKEN_E3 }), ACCESO_DE('INACTIVO', 'BAJA_DUENO', true)),
  item('Renunciar despues de una baja del Dueño es idempotente y no cambia el motivo', req('PUT', RENUNCIAR(COM), { token: TOKEN_E3 }), [
    status(200),
    mensajeEs('Ya habías dejado de trabajar en este comercio'),
  ]),
  item('Acceso: el motivo sigue siendo la baja del Dueño', req('GET', ACCESO(COM), { token: TOKEN_E3 }), ACCESO_DE('INACTIVO', 'BAJA_DUENO', true)),

  item('Administrador suspende el comercio', req('PUT', `/administrador/comercios/${COM}/suspender`, { token: 'token_admin', body: { motivo: 'Suspension de la coleccion E4' } }), [status(200)]),
  item('Con el comercio suspendido el Dueño igual puede dar de baja a Beto', req('PUT', `${EQUIPO}/miembros/${E2}/desactivar`, { token: TOKEN_DUENO, comercio: COM }), [status(200), dataEs('estado', 'INACTIVO')]),
  item('Con el comercio suspendido no se reactiva: 409 COMERCIO_NO_OPERATIVO', req('PUT', `${EQUIPO}/miembros/${E2}/reactivar`, { token: TOKEN_DUENO, comercio: COM }), [
    status(409),
    codigoEs('COMERCIO_NO_OPERATIVO'),
  ]),
  item('Acceso: Dani ve el comercio suspendido como accesible', req('GET', ACCESO(COM), { token: TOKEN_E4 }), ACCESO_DE('ACTIVO', null, true)),
  item('Dani puede renunciar aunque el comercio este suspendido', req('PUT', RENUNCIAR(COM), { token: TOKEN_E4 }), [status(200), mensajeEs('Dejaste de trabajar en el comercio')]),
  item('Acceso: Dani queda inactivo por renuncia', req('GET', ACCESO(COM), { token: TOKEN_E4 }), ACCESO_DE('INACTIVO', 'RENUNCIA', true)),
  item('Parte 3: el Dueño lee la actividad del equipo (fuente=EQUIPO)', req('GET', `${EQUIPO}/actividad`, { token: TOKEN_DUENO, comercio: COM, query: 'fuente=EQUIPO&limite=100' }), [
    status(200),
    "const items = pm.response.json().data.items;",
    "pm.test('Todas las filas son de la fuente EQUIPO', () => pm.expect(items.length > 0 && items.every((x) => x.fuente === 'EQUIPO' && x.id.startsWith('EQUIPO-'))).to.eql(true));",
    `const invitoAna = items.find((x) => x.accionTexto === 'Invitó a ' + ${entorno(v('e1_email'))}.toLowerCase());`,
    "pm.test('Hay una invitacion enviada, del Dueño, con la invitacion como entidad', () => { pm.expect(invitoAna).to.exist; pm.expect(invitoAna.actorRol).to.eql('DUENO'); pm.expect(invitoAna.entidadTipo).to.eql('INVITACION'); });",
    `pm.test('Hay una invitacion cancelada', () => pm.expect(items.some((x) => x.accion === 'INVITACION_CANCELADA' && x.accionTexto === 'Canceló la invitación a ' + ${entorno(v('e1_email'))}.toLowerCase())).to.eql(true));`,
    "const baja = items.find((x) => x.accionTexto === 'Dio de baja a Ana Equipo');",
    "pm.test('La baja de Ana la hizo el Dueño y la entidad es el Empleado', () => { pm.expect(baja).to.exist; pm.expect(baja.accion).to.eql('BAJA_DUENO'); pm.expect(baja.actorRol).to.eql('DUENO'); pm.expect(baja.entidadTipo).to.eql('EMPLEADO'); pm.expect(baja.entidadNombre).to.eql('Ana Equipo'); });",
    "pm.test('La reactivacion directa de Ana figura', () => pm.expect(items.some((x) => x.accionTexto === 'Reactivó a Ana Equipo' && x.actorRol === 'DUENO')).to.eql(true));",
    "const renuncia = items.find((x) => x.accion === 'RENUNCIA' && x.entidadNombre === 'Cora Equipo');",
    "pm.test('La renuncia de Cora la hizo ella misma', () => { pm.expect(renuncia).to.exist; pm.expect(renuncia.actorRol).to.eql('EMPLEADO'); pm.expect(renuncia.actorNombre).to.eql('Cora Equipo'); pm.expect(renuncia.accionTexto).to.eql('Dejó de trabajar en el comercio'); });",
    "pm.test('Hay una aceptacion por cada Empleado que se sumo (4)', () => pm.expect(items.filter((x) => x.accion === 'ACEPTACION' && x.accionTexto === 'Aceptó la invitación').length).to.eql(4));",
    "pm.test('Esta ordenada de la mas nueva a la mas vieja', () => pm.expect(items.every((x, i) => i === 0 || items[i - 1].fechaHora >= x.fechaHora)).to.eql(true));",
    guardar(v('ids_equipo'), 'JSON.stringify(items.map((x) => x.id))'),
  ]),
  item('Parte 3: sin filtro la actividad mezcla las fuentes y trae las filas del equipo', req('GET', `${EQUIPO}/actividad`, { token: TOKEN_DUENO, comercio: COM, query: 'limite=100' }), [
    status(200),
    `const ids = pm.response.json().data.items.map((x) => x.id);`,
    `pm.test('Todas las filas del equipo estan sin filtro', () => JSON.parse(${entorno(v('ids_equipo'))}).forEach((id) => pm.expect(ids).to.include(id)));`,
  ]),
  item('Parte 3: la pagina de tres filas del equipo trae un cursor', req('GET', `${EQUIPO}/actividad`, { token: TOKEN_DUENO, comercio: COM, query: 'fuente=EQUIPO&limite=3' }), [
    status(200),
    "const d = pm.response.json().data;",
    "pm.test('hayMas y siguienteCursor', () => { pm.expect(d.hayMas).to.eql(true); pm.expect(d.siguienteCursor).to.be.a('string'); pm.expect(d.items.length).to.eql(3); });",
    `pm.test('Son las tres primeras del listado completo', () => pm.expect(d.items.map((x) => x.id)).to.eql(JSON.parse(${entorno(v('ids_equipo'))}).slice(0, 3)));`,
    guardar(v('cursor_equipo'), 'encodeURIComponent(d.siguienteCursor)'),
  ]),
  item('Parte 3: la segunda pagina sigue donde terminó la primera, sin repetir ni saltear', req('GET', `${EQUIPO}/actividad`, { token: TOKEN_DUENO, comercio: COM, query: `fuente=EQUIPO&limite=3&cursor={{${v('cursor_equipo')}}}` }), [
    status(200),
    `pm.test('Son las filas 4 a 6 del listado completo', () => pm.expect(pm.response.json().data.items.map((x) => x.id)).to.eql(JSON.parse(${entorno(v('ids_equipo'))}).slice(3, 6)));`,
  ]),
  item('Parte 3: una fuente invalida dice las cuatro validas', req('GET', `${EQUIPO}/actividad`, { token: TOKEN_DUENO, comercio: COM, query: 'fuente=basura' }), [
    status(400),
    mensajeEs('La fuente tiene que ser PEDIDO, EDICION, CIERRE o EQUIPO'),
  ]),

  item('Administrador: lee el equipo del comercio (suspendido) con la forma del Dueño', req('GET', `/administrador/comercios/${COM}/equipo`, { token: 'token_admin' }), [
    status(200),
    mensajeEs('Equipo obtenido correctamente'),
    "const m = pm.response.json().data.miembros;",
    "pm.test('Cuatro miembros, todos inactivos', () => { pm.expect(m.length).to.eql(4); pm.expect(m.every((x) => x.estado === 'INACTIVO' && x.fechaBaja)).to.eql(true); });",
    "const por = (id) => m.find((x) => x.empleadoId === Number(pm.environment.get(id)));",
    "pm.test('Ana: baja del Dueño, reactivable', () => { const x = por('e4_e1_id'); pm.expect(x.motivoBaja).to.eql('BAJA_DUENO'); pm.expect(x.puedeReactivar).to.eql(true); });",
    "pm.test('Beto: baja del Dueño, reactivable', () => { const x = por('e4_e2_id'); pm.expect(x.motivoBaja).to.eql('BAJA_DUENO'); pm.expect(x.puedeReactivar).to.eql(true); });",
    "pm.test('Cora: baja del Dueño, reactivable', () => { const x = por('e4_e3_id'); pm.expect(x.motivoBaja).to.eql('BAJA_DUENO'); pm.expect(x.puedeReactivar).to.eql(true); });",
    "pm.test('Dani: renuncia, no reactivable', () => { const x = por('e4_e4_id'); pm.expect(x.motivoBaja).to.eql('RENUNCIA'); pm.expect(x.puedeReactivar).to.eql(false); });",
    "pm.test('Sin invitaciones pendientes', () => pm.expect(pm.response.json().data.invitaciones.length).to.eql(0));",
  ]),
  item('Administrador: lee la actividad del equipo y es la misma que ve el Dueño', req('GET', `/administrador/comercios/${COM}/actividad`, { token: 'token_admin', query: 'fuente=EQUIPO&limite=100' }), [
    status(200),
    `pm.test('Mismas filas y mismo orden', () => pm.expect(pm.response.json().data.items.map((x) => x.id)).to.eql(JSON.parse(${entorno(v('ids_equipo'))})));`,
  ]),
  item('Administrador: la actividad sin filtro trae el equipo', req('GET', `/administrador/comercios/${COM}/actividad`, { token: 'token_admin', query: 'limite=100' }), [
    status(200),
    `const ids = pm.response.json().data.items.map((x) => x.id);`,
    `pm.test('Todas las filas del equipo estan', () => JSON.parse(${entorno(v('ids_equipo'))}).forEach((id) => pm.expect(ids).to.include(id)));`,
  ]),
  item('Administrador: pagina por cursor igual que el Dueño', req('GET', `/administrador/comercios/${COM}/actividad`, { token: 'token_admin', query: `fuente=EQUIPO&limite=3&cursor={{${v('cursor_equipo')}}}` }), [
    status(200),
    `pm.test('Filas 4 a 6', () => pm.expect(pm.response.json().data.items.map((x) => x.id)).to.eql(JSON.parse(${entorno(v('ids_equipo'))}).slice(3, 6)));`,
  ]),
  item('Administrador: el header X-Comercio-Id se ignora', req('GET', `/administrador/comercios/${COM}/equipo`, { token: 'token_admin', comercio: 'no-es-un-numero' }), [status(200)]),
  item('Administrador: una fuente invalida es 400', req('GET', `/administrador/comercios/${COM}/actividad`, { token: 'token_admin', query: 'fuente=basura' }), [
    status(400),
    mensajeEs('La fuente tiene que ser PEDIDO, EDICION, CIERRE o EQUIPO'),
  ]),
  item('Administrador: un comercio inexistente da 404 en el equipo', req('GET', '/administrador/comercios/987654321/equipo', { token: 'token_admin' }), [status(404), mensajeEs('Comercio no encontrado')]),
  item('Administrador: un comercio inexistente da 404 en la actividad', req('GET', '/administrador/comercios/987654321/actividad', { token: 'token_admin' }), [status(404), mensajeEs('Comercio no encontrado')]),
  item('Seguridad: sin sesion el equipo del Administrador da 401', req('GET', `/administrador/comercios/${COM}/equipo`), [status(401)]),
  item('Seguridad: sin sesion la actividad del Administrador da 401', req('GET', `/administrador/comercios/${COM}/actividad`), [status(401)]),
  item('Seguridad: el Dueño recibe 403 en el equipo del Administrador', req('GET', `/administrador/comercios/${COM}/equipo`, { token: TOKEN_DUENO, comercio: COM }), [status(403)]),
  item('Seguridad: el Dueño recibe 403 en la actividad del Administrador', req('GET', `/administrador/comercios/${COM}/actividad`, { token: TOKEN_DUENO, comercio: COM }), [status(403)]),
  item('Seguridad: un Cliente que fue Empleado recibe 403 en el equipo del Administrador', req('GET', `/administrador/comercios/${COM}/equipo`, { token: TOKEN_E4, comercio: COM }), [status(403)]),
  item('Seguridad: un Cliente sin relacion recibe 403 en la actividad del Administrador', req('GET', `/administrador/comercios/${COM}/actividad`, { token: TOKEN_E5 }), [status(403)]),
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
const claves = ['com', 'inv_id', 'cuit_tmp', 'dni_rep_tmp',
  'd_email', 'd_usuario', 'd_password', 'd_dni', 'd_codigo', 'd_token', 'd_id',
  'e1_email', 'e1_usuario', 'e1_password', 'e1_dni', 'e1_codigo', 'e1_inv_codigo', 'e1_token', 'e1_id',
  'e2_email', 'e2_usuario', 'e2_password', 'e2_dni', 'e2_codigo', 'e2_inv_codigo', 'e2_token', 'e2_id',
  'e3_email', 'e3_usuario', 'e3_password', 'e3_dni', 'e3_codigo', 'e3_inv_codigo', 'e3_token', 'e3_id',
  'e4_email', 'e4_usuario', 'e4_password', 'e4_dni', 'e4_codigo', 'e4_inv_codigo', 'e4_token', 'e4_id',
  'e5_email', 'e5_usuario', 'e5_password', 'e5_dni', 'e5_codigo', 'e5_token', 'e5_id', 'cuerpo_no_disponible', 'ids_equipo', 'cursor_equipo'].map(v);
const existentes = new Set(environment.values.map((x) => x.key));
for (const key of claves) {
  if (!existentes.has(key)) environment.values.push({ key, value: '', type: 'default', enabled: true });
}
fs.writeFileSync(environmentPath, JSON.stringify(environment, null, 2) + '\n', 'utf8');

console.log(`OK: carpeta "${NOMBRE_CARPETA.slice(0, 40)}..." con ${items.length} requests.`);
