import fs from 'node:fs';
import {
  HEADER,
  collectionPath,
  guardar,
  mensajeEs,
  req,
  status,
} from './lib/postman-nombre-comercio.mjs';

const NOMBRE_CARPETA = '73 - Horarios Fase 2 T1 (edicion versionada, turnos que cruzan la medianoche, cambio programado y cancelacion, Empleado y guards)';
const PREFIJO_CARPETA = '73 - ';
const P = 'ht1';
const v = (nombre) => `${P}_${nombre}`;
function item(name, request, testLines = [], preLines = []) {
  const event = [];
  if (preLines.length) event.push({ listen: 'prerequest', script: { type: 'text/javascript', exec: preLines } });
  if (testLines.length) event.push({ listen: 'test', script: { type: 'text/javascript', exec: testLines } });
  return { name, request, response: [], event };
}
const entorno = (variable) => `pm.environment.get('${variable}')`;

const items = [];
const agregar = (...nuevos) => items.push(...nuevos);

const COM = `{{${v('com')}}}`;
const TOKEN_DUENO = v('d_token');
const TOKEN_EMPLEADO = v('e_token');
const TOKEN_AJENO = v('x_token');
const RUTA = '/comercios/perfil/horarios';

const MENSAJE_CIERRE_IGUAL = 'La hora de cierre no puede ser igual a la de apertura. Si atendés las 24 horas, cargá de 00:00 a 23:59.';

const codigoEs = (codigo) => `pm.test('El codigo estable es ${codigo}', () => pm.expect(pm.response.json().data.codigo).to.eql('${codigo}'));`;
const dataCumple = (descripcion, cuerpoFuncion) => `pm.test(${JSON.stringify(descripcion)}, () => { const d = pm.response.json().data; ${cuerpoFuncion} });`;
const mensajeContiene = (texto) => `pm.test(${JSON.stringify(`El mensaje contiene "${texto}"`)}, () => pm.expect(pm.response.json().mensaje).to.include(${JSON.stringify(texto)}));`;
const NO_DISPONIBLE = [
  status(404),
  "pm.test('Mismo 404 de siempre: Comercio no encontrado y codigo COMERCIO_NO_DISPONIBLE', () => { const b = pm.response.json(); pm.expect(b.mensaje).to.eql('Comercio no encontrado'); pm.expect(b.data.codigo).to.eql('COMERCIO_NO_DISPONIBLE'); });",
];

const franja = (diaSemana, horaApertura, horaCierre) => ({ diaSemana, horaApertura, horaCierre });
const TODOS_LOS_DIAS = ['LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO', 'DOMINGO'].map((dia) => franja(dia, '00:00:00', '23:59:00'));

const editar = (nombre, token, horarios, testLines, { sinHeader = false } = {}) =>
  item(nombre, req('PUT', RUTA, { token, headers: sinHeader ? {} : { [HEADER]: COM }, body: { horarios } }), testLines);

function identidad(clave) {
  return [
    'const s = Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36);',
    guardar(v(`${clave}_email`), `'t1.${clave}.' + s + '@bajonea.test'`),
    guardar(v(`${clave}_usuario`), `('t1${clave}' + s).slice(0, 20)`),
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
  guardar(v('nombre_tmp'), "'Local Horarios T1 ' + Date.now().toString(36)"),
];

function clienteNuevo(clave, nombre) {
  return [
    item(
      `Registro ${nombre}`,
      req('POST', '/auth/registro/cliente', {
        body: {
          nombre,
          apellido: 'Horarios',
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
  ]);

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
        razonSocial: 'Horarios T1 SRL',
        cuit: `{{${v('cuit_tmp')}}}`,
        condicionIva: 'RESPONSABLE_INSCRIPTO',
        tipoSociedad: 'SRL',
        domicilioFiscal: 'Direccion fiscal T1 100',
        fechaInicioActividades: '2020-01-01',
        nombre: `{{${v('nombre_tmp')}}}`,
        descripcion: 'Comercio generado por la coleccion de Postman (horarios, Fase 2 T1)',
        telefono: '+5492964555444',
        tipoComercio: 'RESTAURANTE',
        aceptaDelivery: false,
        aceptaRetiro: true,
        nombreUsuario: `{{${v('d_usuario')}}}`,
        email: `{{${v('d_email')}}}`,
        password: `{{${v('d_password')}}}`,
        direccion: { calle: 'Belgrano', numero: '800', pisoDepto: null, codigoPostal: '9420', localidadId: '{{localidad_id}}', principal: false },
        horarios: TODOS_LOS_DIAS,
        nombreRepresentante: 'Carlos',
        apellidoRepresentante: 'Sanchez',
        dniRepresentante: `{{${v('dni_rep_tmp')}}}`,
        telefonoRepresentante: '+5492964701103',
        fechaNacimientoRepresentante: '1988-04-04',
        fotoPerfilUrl: 'https://res.cloudinary.com/demo/image/upload/postman-horarios-t1.jpg',
        redesSociales: [{ tipo: 'INSTAGRAM', url: 'instagram.com/horariost1' }],
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
  item('Atajo de test: el comercio pasa a APTO_VENTA (entra al catalogo)', req('PUT', `/test/comercios/${COM}/apto-venta`, { body: {} }), [status(200)]),
  ...clienteNuevo('e', 'Empleada'),
  item('El Dueño invita a la Empleada al comercio', req('POST', '/comercios/equipo/invitaciones', { token: TOKEN_DUENO, headers: { [HEADER]: COM }, body: { email: `{{${v('e_email')}}}` } }), [status(201)]),
  item('Bypass test - codigo de la invitacion', req('GET', '/test/invitaciones-empleado/codigo', { query: `email={{${v('e_email')}}}&comercioId=${COM}` }), [
    status(200),
    guardar(v('inv_codigo'), 'pm.response.json().data'),
  ]),
  item('La Empleada acepta la invitacion', req('POST', '/auth/invitaciones-empleado/aceptar', { body: { email: `{{${v('e_email')}}}`, codigo: `{{${v('inv_codigo')}}}` } }), [status(200)]),
  loginDe('e', 'Empleada', TOKEN_EMPLEADO),
  ...clienteNuevo('x', 'Cliente sin relacion'),
  loginDe('x', 'Cliente sin relacion', TOKEN_AJENO),
);

agregar(
  editar('[edicion] El Dueño programa una version nueva: lo vigente de hoy no cambia y el cambio rige desde mañana', TOKEN_DUENO, [franja('MARTES', '10:00:00', '20:00:00')], [
    status(200),
    dataCumple('Hay 7 franjas vigentes y 1 pendiente con la fecha desde la que rige', "pm.expect(d.vigentes.length).to.eql(7); pm.expect(d.pendientes.length).to.eql(1); pm.expect(d.rigeDesde).to.match(/^\\d{4}-\\d{2}-\\d{2}$/);"),
    guardar(v('rige'), 'pm.response.json().data.rigeDesde'),
  ]),
  item('[lectura] El perfil del Dueño separa lo vigente del cambio programado', req('GET', '/comercios/perfil', { token: TOKEN_DUENO, headers: { [HEADER]: COM } }), [
    status(200),
    dataCumple('7 vigentes, 1 pendiente y la fecha de rige', `pm.expect(d.horarios.length).to.eql(7); pm.expect(d.horariosPendientes.length).to.eql(1); pm.expect(d.horariosRigenDesde).to.eql(${entorno(v('rige'))});`),
  ]),
  item('[lectura] El perfil de la Empleada tambien lo ve', req('GET', '/comercios/perfil', { token: TOKEN_EMPLEADO, headers: { [HEADER]: COM } }), [
    status(200),
    dataCumple('7 vigentes y 1 pendiente', 'pm.expect(d.horarios.length).to.eql(7); pm.expect(d.horariosPendientes.length).to.eql(1);'),
  ]),
  item('[lectura] El catalogo publico solo muestra lo vigente de hoy', req('GET', '/catalogo/comercios'), [
    status(200),
    `const c = pm.response.json().data.find((x) => String(x.id) === String(${entorno(v('com'))}));`,
    "pm.test('El comercio esta en el catalogo', () => pm.expect(c).to.exist);",
    "pm.test('Muestra las 7 franjas vigentes y ninguna cruza la medianoche', () => { pm.expect(c.horarios.length).to.eql(7); c.horarios.forEach((h) => pm.expect(h.cruzaMedianoche).to.eql(false)); });",
  ]),
  editar('[edicion] Una segunda edicion el mismo dia reemplaza al cambio programado', TOKEN_DUENO, [franja('JUEVES', '08:00:00', '12:00:00')], [
    status(200),
    dataCumple('Solo queda la version nueva pendiente', "pm.expect(d.pendientes.length).to.eql(1); pm.expect(d.pendientes[0].diaSemana).to.eql('JUEVES'); pm.expect(d.vigentes.length).to.eql(7);"),
  ]),
  editar('[edicion] La Empleada edita y un turno que cruza la medianoche se informa con cruzaMedianoche', TOKEN_EMPLEADO, [franja('VIERNES', '20:00:00', '02:00:00'), franja('SABADO', '20:00:00', '23:59:00')], [
    status(200),
    dataCumple('El turno del viernes cruza y el del sabado no', "const v = d.pendientes.find((h) => h.diaSemana === 'VIERNES'); const s = d.pendientes.find((h) => h.diaSemana === 'SABADO'); pm.expect(v.cruzaMedianoche).to.eql(true); pm.expect(s.cruzaMedianoche).to.eql(false);"),
  ]),
  item('[actividad] La Actividad del Dueño muestra "Editó los horarios" con el rol de quien edito', req('GET', '/comercios/equipo/actividad', { token: TOKEN_DUENO, headers: { [HEADER]: COM }, query: 'fuente=EDICION' }), [
    status(200),
    "pm.test('Hay filas de Editó los horarios del Dueño y de la Empleada', () => { const filas = pm.response.json().data.items.filter((i) => i.accionTexto === 'Editó los horarios'); pm.expect(filas.length).to.be.at.least(3); pm.expect(filas.some((f) => f.actorRol === 'EMPLEADO')).to.eql(true); pm.expect(filas.some((f) => f.actorRol === 'DUENO')).to.eql(true); });",
  ]),
  editar('[edicion] Una edicion igual a lo vigente cancela el cambio programado', TOKEN_DUENO, TODOS_LOS_DIAS, [
    status(200),
    dataCumple('No queda nada pendiente ni fecha de rige', "pm.expect(d.pendientes.length).to.eql(0); pm.expect(d.rigeDesde).to.eql(null); pm.expect(d.vigentes.length).to.eql(7);"),
  ]),
  editar('[edicion] Cancelar de nuevo sin nada programado es un 200 que no cambia nada', TOKEN_DUENO, TODOS_LOS_DIAS, [
    status(200),
    dataCumple('Sigue sin pendientes', 'pm.expect(d.pendientes.length).to.eql(0); pm.expect(d.vigentes.length).to.eql(7);'),
  ]),
);

agregar(
  editar('[validacion] La lista vacia: 400', TOKEN_DUENO, [], [status(400)]),
  editar('[validacion] Cierre igual a la apertura: 400 con el mensaje de las 24 horas', TOKEN_DUENO, [franja('LUNES', '09:00:00', '09:00:00')], [status(400), mensajeEs(MENSAJE_CIERRE_IGUAL)]),
  editar('[validacion] Superposicion el mismo dia: 400', TOKEN_DUENO, [franja('LUNES', '09:00:00', '13:00:00'), franja('LUNES', '12:00:00', '15:00:00')], [
    status(400),
    mensajeEs('Ya tenés un horario cargado el Lunes de 12:00 a 15:00, que se superpone con este'),
  ]),
  editar('[validacion] Superposicion entre dias por la cola del turno: 400 con el mensaje de los dos turnos', TOKEN_DUENO, [franja('VIERNES', '20:00:00', '02:00:00'), franja('SABADO', '01:00:00', '05:00:00')], [
    status(400),
    mensajeEs('El turno del viernes de 20:00 a 02:00 se superpone con el del sábado de 01:00 a 05:00'),
  ]),
  editar('[validacion] Superposicion con la vuelta de domingo a lunes: 400', TOKEN_DUENO, [franja('DOMINGO', '22:00:00', '03:00:00'), franja('LUNES', '02:00:00', '10:00:00')], [
    status(400),
    mensajeContiene('El turno del domingo de 22:00 a 03:00'),
  ]),
  editar('[validacion] Turnos adyacentes que no se solapan: 200', TOKEN_DUENO, [franja('VIERNES', '20:00:00', '23:59:00'), franja('SABADO', '00:00:00', '02:00:00')], [
    status(200),
    dataCumple('Quedan 2 pendientes', 'pm.expect(d.pendientes.length).to.eql(2);'),
  ]),
  editar('[validacion] Volver a lo vigente deja el comercio sin cambio programado', TOKEN_DUENO, TODOS_LOS_DIAS, [status(200), dataCumple('Sin pendientes', 'pm.expect(d.pendientes.length).to.eql(0);')]),
);

agregar(
  editar('[seguridad] Sin token: 401', undefined, [franja('LUNES', '09:00:00', '13:00:00')], [status(401)]),
  editar('[seguridad] Administrador: 403', 'token_admin', [franja('LUNES', '09:00:00', '13:00:00')], [status(403)]),
  editar('[seguridad] Cliente sin relacion con el header del comercio: 404 identico', TOKEN_AJENO, [franja('LUNES', '09:00:00', '13:00:00')], NO_DISPONIBLE),
  editar('[seguridad] Cliente sin relacion y sin header: 400', TOKEN_AJENO, [franja('LUNES', '09:00:00', '13:00:00')], [status(400)], { sinHeader: true }),
  editar('[seguridad] Un Empleado sin relacion y con la lista vacia recibe el 404 y no el 400', TOKEN_AJENO, [], NO_DISPONIBLE),
  item('El Administrador suspende el comercio', req('PUT', `/administrador/comercios/${COM}/suspender`, { token: 'token_admin', body: { motivo: 'Suspension de la coleccion de horarios' } }), [status(200)]),
  editar('[suspendido] La Empleada recibe 409 COMERCIO_SUSPENDIDO', TOKEN_EMPLEADO, [franja('MARTES', '10:00:00', '20:00:00')], [status(409), codigoEs('COMERCIO_SUSPENDIDO')]),
  editar('[suspendido] El Dueño tambien recibe 409 COMERCIO_SUSPENDIDO', TOKEN_DUENO, [franja('MARTES', '10:00:00', '20:00:00')], [status(409), codigoEs('COMERCIO_SUSPENDIDO')]),
);

const carpeta = { name: NOMBRE_CARPETA, item: items };
const collection = JSON.parse(fs.readFileSync(collectionPath, 'utf8'));
const idx = collection.item.findIndex((f) => f.name.startsWith(PREFIJO_CARPETA));
if (idx >= 0) {
  collection.item.splice(idx, 1);
}
collection.item.push(carpeta);
fs.writeFileSync(collectionPath, JSON.stringify(collection, null, 2) + '\n', 'utf8');

console.log(`OK: carpeta "${NOMBRE_CARPETA.slice(0, 40)}..." con ${items.length} requests.`);
