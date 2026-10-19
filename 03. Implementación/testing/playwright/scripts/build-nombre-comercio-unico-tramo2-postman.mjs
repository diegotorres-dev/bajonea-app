import {
  HEADER,
  MENSAJE_NOMBRE_EN_USO,
  crearGenerador,
  cuerpoComercio,
  direccion,
  duenoConNombre,
  guardar,
  horarios,
  item,
  loginAdmin,
  mensajeEs,
  mensajeNoEs,
  publicarCarpeta,
  req,
  status,
} from './lib/postman-nombre-comercio.mjs';

const NOMBRE_FOLDER = '71 - Nombre unico de comercio (registro, alta adicional, perfil, RECHAZADO que retiene y RECHAZO_DEFINITIVO que libera)';
const PREFIJO_TEXTO = 'nombre unico';
const PREFIJO_VAR = 'nu';

const identidad = crearGenerador({ prefijoNumerico: '3095', prefijoEmail: 'nombre.unico.postman', prefijoUsuario: 'nupm' });
const items = [];
const claves = ['nu_foto_alta'];

const NOMBRE_BASE = 'Cafetería Ñandú Unico Postman';

const registrar = (titulo, nombre, testLines, { id = identidad(), cambios = {} } = {}) => {
  items.push(
    item(titulo, req('POST', '/auth/registro/comercio', { body: cuerpoComercio(id, PREFIJO_TEXTO, { nombre, ...cambios }) }), testLines),
  );
  return id;
};

loginAdmin(items);

const dueñoA = duenoConNombre(items, identidad, { tag: 'a', prefijoVar: PREFIJO_VAR, prefijoTexto: PREFIJO_TEXTO, nombre: NOMBRE_BASE, resolucion: 'aprobar', claves });

const choque = [status(409), mensajeEs(MENSAJE_NOMBRE_EN_USO)];
registrar('[registro] El mismo nombre: 409 con el mensaje', NOMBRE_BASE, choque);
registrar('[registro] Con mayusculas: 409', 'CAFETERÍA ÑANDÚ UNICO POSTMAN', choque);
registrar('[registro] Sin tildes y con la ene como n: 409', 'cafeteria nandu unico postman', choque);
registrar('[registro] Con espacios de mas: 409', '  Cafetería    Ñandú   Unico   Postman  ', choque);
registrar('[registro] Con tabulaciones entre las palabras: 409', 'Cafetería\tÑandú\tUnico\tPostman', choque);
registrar('[registro] Un nombre distinto aunque parecido: 201', `${NOMBRE_BASE} Norte`, [status(201)]);

registrar('[orden] Un error de validacion gana al conflicto de nombre: 400', NOMBRE_BASE, [status(400)], { cambios: { horarios: [] } });
registrar('[orden] Un email repetido conserva su propio mensaje: 409', NOMBRE_BASE, [status(409), mensajeNoEs(MENSAJE_NOMBRE_EN_USO)], {
  cambios: { email: dueñoA.id.email },
});

const idHuerfano = registrar('[huerfano] Con el nombre tomado: 409', NOMBRE_BASE, choque);
registrar('[huerfano] La misma cuenta, email y usuario se registra con otro nombre: 201 (el rechazo no dejo nada)', `${NOMBRE_BASE} Reintento`, [status(201)], { id: idHuerfano });

const dueñoB = duenoConNombre(items, identidad, { tag: 'b', prefijoVar: PREFIJO_VAR, prefijoTexto: PREFIJO_TEXTO, nombre: 'Local Unico Alta Postman', resolucion: 'aprobar', claves });
const tokenB = dueñoB.token;
const comB = `{{${dueñoB.com}}}`;

const cuerpoAlta = (nombre, cambios = {}) => ({
  nombre,
  descripcion: 'Comercio adicional generado por la coleccion de Postman (nombre unico)',
  telefono: '+5492964555444',
  aceptaTerminos: true,
  tipoComercio: 'RESTAURANTE',
  aceptaDelivery: false,
  aceptaRetiro: true,
  fotoPerfilUrl: '{{nu_foto_alta}}',
  direccion: direccion('{{localidad_id}}', '910'),
  horarios,
  redesSociales: [{ tipo: 'INSTAGRAM', url: 'instagram.com/nombreunicoalta' }],
  ...cambios,
});
const alta = (titulo, nombre, testLines, cambios) => item(titulo, req('POST', '/comercios', { token: tokenB, body: cuerpoAlta(nombre, cambios) }), testLines);

items.push(
  item('[alta] Firma de la foto del alta adicional', req('POST', '/comercios/nuevo/foto/firma', { token: tokenB }), [
    status(200),
    'const d = pm.response.json().data;',
    guardar('nu_foto_alta', "'https://res.cloudinary.com/' + d.cloudName + '/image/upload/v1/' + d.folder + 'postman-nombre-unico.png'"),
  ]),
  alta('[alta] El nombre de un comercio de otro Dueño: 409', NOMBRE_BASE, choque),
  alta('[alta] El mismo nombre en otra direccion y con mayusculas: 409', NOMBRE_BASE.toUpperCase(), choque, {
    direccion: { calle: 'Otra Calle', numero: '4321', pisoDepto: '5A', codigoPostal: '9420', localidadId: '{{localidad_id}}', principal: false },
  }),
  alta('[alta] El nombre de otro comercio del mismo Dueño en otra direccion: 409', 'LOCAL UNICO ALTA POSTMAN', choque, {
    direccion: { calle: 'Otra Calle', numero: '4321', pisoDepto: null, codigoPostal: '9420', localidadId: '{{localidad_id}}', principal: false },
  }),
  alta('[alta] Un nombre libre: 201', 'Sucursal Unico Libre Postman', [status(201)]),
);

const perfil = (titulo, nombre, testLines, token = tokenB, com = comB) =>
  item(titulo, req('PUT', '/comercios/perfil', {
    token,
    headers: { [HEADER]: com },
    body: { nombre, descripcion: 'Descripcion de prueba', telefono: '+5492964555200', aceptaDelivery: false, aceptaRetiro: true },
  }), testLines);

items.push(
  perfil('[perfil] Renombrar al nombre de otro comercio en minusculas: 409', NOMBRE_BASE.toLowerCase(), choque),
  item('[perfil] El nombre no cambio', req('GET', '/comercios/perfil', { token: tokenB, headers: { [HEADER]: comB } }), [
    status(200),
    "pm.test('Sigue con su nombre', () => pm.expect(pm.response.json().data.nombre).to.eql('Local Unico Alta Postman'));",
  ]),
  perfil('[perfil] Cambiar solo las mayusculas del propio nombre: 200', 'LOCAL UNICO ALTA POSTMAN', [status(200)]),
  perfil('[perfil] Renombrar a un nombre libre: 200', 'Local Unico Renombrado Postman', [status(200)]),
);

const dueñoC = duenoConNombre(items, identidad, { tag: 'c', prefijoVar: PREFIJO_VAR, prefijoTexto: PREFIJO_TEXTO, nombre: 'Local Unico Tercero Postman', resolucion: 'aprobar', claves });
items.push(
  perfil('[perfil] El nombre que B dejo libre lo toma otro Dueño: 200', 'Local Unico Alta Postman', [status(200)], dueñoC.token, `{{${dueñoC.com}}}`),
);

const NOMBRE_RECHAZADO = 'Retenido Unico Postman';
duenoConNombre(items, identidad, { tag: 'r', prefijoVar: PREFIJO_VAR, prefijoTexto: PREFIJO_TEXTO, nombre: NOMBRE_RECHAZADO, resolucion: 'rechazar', claves });
registrar('[rechazado] Un comercio RECHAZADO retiene su nombre en un registro nuevo: 409', NOMBRE_RECHAZADO, choque);
items.push(alta('[rechazado] Y tambien en un alta adicional: 409', NOMBRE_RECHAZADO, choque));

const NOMBRE_DEFINITIVO = 'Liberado Unico Postman';
duenoConNombre(items, identidad, { tag: 'd', prefijoVar: PREFIJO_VAR, prefijoTexto: PREFIJO_TEXTO, nombre: NOMBRE_DEFINITIVO, resolucion: 'definitivo', claves });
registrar('[definitivo] Un RECHAZO_DEFINITIVO libera el nombre: 201', NOMBRE_DEFINITIVO, [status(201)]);
registrar('[definitivo] Y una vez retomado vuelve a estar tomado: 409', NOMBRE_DEFINITIVO, choque);

publicarCarpeta(NOMBRE_FOLDER, items, claves);
