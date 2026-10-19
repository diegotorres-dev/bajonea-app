import {
  HEADER,
  PASSWORD,
  crearGenerador,
  dataEs,
  direccion,
  duenoConNombre,
  guardar,
  item,
  loginAdmin,
  publicarCarpeta,
  req,
  status,
} from './lib/postman-nombre-comercio.mjs';

const NOMBRE_FOLDER = '72 - Disponibilidad en vivo del nombre de comercio (endpoint publico del registro y endpoint del Dueño)';
const PREFIJO_TEXTO = 'disponibilidad nombre';
const PREFIJO_VAR = 'dn';
const PUBLICO = '/auth/comercio-nombre/disponibilidad';
const DUENO = '/comercios/nombre/disponibilidad';

const identidad = crearGenerador({ prefijoNumerico: '3096', prefijoEmail: 'disp.nombre.postman', prefijoUsuario: 'dnpm' });
const items = [];
const claves = ['dn_cliente_codigo', 'dn_cliente_token'];

const OCUPADO = 'Cafetería Ñandú Disponibilidad Postman';
const DISPONIBLE = { disponible: true };
const NO_DISPONIBLE = { disponible: false };

const publico = (titulo, nombre, testLines) =>
  items.push(item(titulo, req('GET', PUBLICO, { query: nombre === null ? undefined : `nombre=${encodeURIComponent(nombre)}` }), testLines));

const delDueno = (titulo, token, nombre, testLines, { comercioId, headers } = {}) =>
  items.push(
    item(titulo, req('GET', DUENO, {
      token,
      headers,
      query: `nombre=${encodeURIComponent(nombre)}${comercioId === undefined ? '' : `&comercioId=${comercioId}`}`,
    }), testLines),
  );

loginAdmin(items);

const dueñoA = duenoConNombre(items, identidad, { tag: 'a', prefijoVar: PREFIJO_VAR, prefijoTexto: PREFIJO_TEXTO, nombre: OCUPADO, resolucion: 'aprobar', claves });
const dueñoB = duenoConNombre(items, identidad, { tag: 'b', prefijoVar: PREFIJO_VAR, prefijoTexto: PREFIJO_TEXTO, nombre: 'Local Disponibilidad Ajeno Postman', resolucion: 'aprobar', claves });
const comA = `{{${dueñoA.com}}}`;
const comB = `{{${dueñoB.com}}}`;

publico('[publico] Un nombre libre responde disponible, sin sesion', 'Nombre Libre Disponibilidad Postman', [status(200), dataEs(DISPONIBLE)]);
publico('[publico] Un nombre tomado responde no disponible', OCUPADO, [status(200), dataEs(NO_DISPONIBLE)]);
publico('[publico] Con otras mayusculas', OCUPADO.toUpperCase(), [status(200), dataEs(NO_DISPONIBLE)]);
publico('[publico] Sin tildes y con la ene como n', 'cafeteria nandu disponibilidad postman', [status(200), dataEs(NO_DISPONIBLE)]);
publico('[publico] Con espacios de mas y tabulaciones', '  Cafetería\tÑandú   Disponibilidad  Postman ', [status(200), dataEs(NO_DISPONIBLE)]);
publico('[publico] La respuesta trae solo el campo disponible', OCUPADO, [
  status(200),
  "pm.test('Un solo campo', () => pm.expect(Object.keys(pm.response.json().data)).to.eql(['disponible']));",
]);
publico('[publico] Un nombre vacio: 400', '', [status(400)]);
publico('[publico] Un nombre en blanco: 400', '   ', [status(400)]);
publico('[publico] Un nombre solo con simbolos: 400', '@@@ ---', [status(400)]);
publico('[publico] Un nombre de 151 caracteres: 400', 'N'.repeat(151), [status(400)]);
publico('[publico] Sin el parametro: 400', null, [status(400)]);

delDueno('[dueño] Sin token: 401', undefined, OCUPADO, [status(401)]);

const idCliente = identidad();
items.push(
  item('[cliente] Registro de un Cliente para probar el 403', req('POST', '/auth/registro/cliente', {
    body: {
      nombre: 'Clienta',
      apellido: 'Disponibilidad',
      dni: idCliente.dni,
      fechaNacimiento: '1995-05-20',
      telefono: '+5492964700100',
      nombreUsuario: idCliente.usuario,
      email: idCliente.email,
      password: PASSWORD,
      aceptaTerminos: true,
      direccion: direccion('{{localidad_id}}'),
    },
  }), [status(201)]),
  item('[cliente] Codigo de verificacion', req('GET', '/test/token-verificacion', { query: `email=${idCliente.email}` }), [status(200), guardar('dn_cliente_codigo', 'pm.response.json().data')]),
  item('[cliente] Verificar cuenta', req('POST', '/auth/verificar', { body: { email: idCliente.email, codigo: '{{dn_cliente_codigo}}' } }), [status(200)]),
  item('[cliente] Login del Cliente', req('POST', '/auth/login', { body: { nombreUsuario: idCliente.usuario, password: PASSWORD } }), [
    status(200),
    guardar('dn_cliente_token', 'pm.response.json().data.token'),
  ]),
);
delDueno('[cliente] Un Cliente: 403', 'dn_cliente_token', OCUPADO, [status(403)]);
delDueno('[cliente] Un Cliente con X-Comercio-Id de un comercio: 403', 'dn_cliente_token', OCUPADO, [status(403)], { headers: { [HEADER]: comA } });
delDueno('[admin] El Administrador: 403', 'token_admin', OCUPADO, [status(403)]);

delDueno('[dueño] Un nombre libre: disponible', dueñoA.token, 'Nombre Libre Del Dueño Postman', [status(200), dataEs(DISPONIBLE)]);
delDueno('[dueño] Su propio nombre sin excluirlo: no disponible', dueñoA.token, OCUPADO, [status(200), dataEs(NO_DISPONIBLE)]);
delDueno('[dueño] Su propio nombre excluyendo su comercio, con otras mayusculas: disponible', dueñoA.token, OCUPADO.toUpperCase(), [status(200), dataEs(DISPONIBLE)], { comercioId: comA });
delDueno('[dueño] El nombre de otro comercio excluyendo el propio: no disponible', dueñoA.token, 'Local Disponibilidad Ajeno Postman', [status(200), dataEs(NO_DISPONIBLE)], { comercioId: comA });
delDueno('[dueño] El comercioId de otro Dueño: 404 sin revelar nada', dueñoA.token, 'Local Disponibilidad Ajeno Postman', [
  status(404),
  "pm.test('Mismo mensaje de siempre', () => pm.expect(pm.response.json().mensaje).to.eql('Comercio no encontrado'));",
  "pm.test('No filtra el nombre del otro comercio', () => pm.expect(pm.response.text()).to.not.include('Ajeno'));",
], { comercioId: comB });
delDueno('[dueño] Un comercioId inexistente: el mismo 404', dueñoA.token, 'Cualquiera', [status(404), "pm.test('Mismo mensaje', () => pm.expect(pm.response.json().mensaje).to.eql('Comercio no encontrado'));"], { comercioId: 99999999 });
delDueno('[dueño] Un comercioId no numerico: 400', dueñoA.token, 'Cualquiera', [status(400)], { comercioId: 'abc' });
delDueno('[dueño] Un nombre en blanco: 400', dueñoA.token, '   ', [status(400)]);
delDueno('[dueño] Un nombre de 151 caracteres: 400', dueñoA.token, 'N'.repeat(151), [status(400)]);
delDueno('[dueño] Ignora un X-Comercio-Id invalido', dueñoA.token, 'Nombre Libre Con Header Postman', [status(200), dataEs(DISPONIBLE)], { headers: { [HEADER]: 'abc' } });

const NOMBRE_RECHAZADO = 'Retenido Disponibilidad Postman';
duenoConNombre(items, identidad, { tag: 'r', prefijoVar: PREFIJO_VAR, prefijoTexto: PREFIJO_TEXTO, nombre: NOMBRE_RECHAZADO, resolucion: 'rechazar', claves });
publico('[rechazado] Un RECHAZADO retiene su nombre: no disponible', NOMBRE_RECHAZADO, [status(200), dataEs(NO_DISPONIBLE)]);

const NOMBRE_DEFINITIVO = 'Liberado Disponibilidad Postman';
duenoConNombre(items, identidad, { tag: 'd', prefijoVar: PREFIJO_VAR, prefijoTexto: PREFIJO_TEXTO, nombre: NOMBRE_DEFINITIVO, resolucion: 'definitivo', claves });
publico('[definitivo] Un RECHAZO_DEFINITIVO libera su nombre: disponible', NOMBRE_DEFINITIVO, [status(200), dataEs(DISPONIBLE)]);

const NOMBRE_PENDIENTE = 'Pendiente Disponibilidad Postman';
duenoConNombre(items, identidad, { tag: 'p', prefijoVar: PREFIJO_VAR, prefijoTexto: PREFIJO_TEXTO, nombre: NOMBRE_PENDIENTE, resolucion: 'pendiente', claves });
publico('[pendiente] Un comercio PENDIENTE tambien retiene su nombre, sin que la respuesta distinga el estado', NOMBRE_PENDIENTE, [
  status(200),
  dataEs(NO_DISPONIBLE),
]);

publicarCarpeta(NOMBRE_FOLDER, items, claves);
