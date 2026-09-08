import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const collectionPath = path.resolve(__dirname, '../../../postman/Bajonea-MVP.postman_collection.json');

function baseComercioPayload(overrides = {}) {
  const payload = {
    fotoPerfilUrl: 'https://res.cloudinary.com/demo/image/upload/v1/matriz-comercio-perfil.jpg',
    razonSocial: 'Comercio Matriz SRL',
    cuit: '30799000306',
    condicionIva: 'RESPONSABLE_INSCRIPTO',
    tipoSociedad: 'SRL',
    domicilioFiscal: 'Av. San Martin 100, Rio Grande',
    fechaInicioActividades: '2020-01-01',
    nombre: 'Comercio Matriz Base',
    descripcion: 'Comercio de prueba para la matriz de Postman de Comercio',
    telefono: '+5492964555100',
    emailContacto: 'contacto.matriz.comercio@bajonea.test',
    tipoComercio: 'RESTAURANTE',
    aceptaDelivery: true,
    aceptaRetiro: true,
    email: 'matriz.comercio.default@bajonea.test',
    password: 'Aa1Password2026',
    direccion: {
      calle: 'Belgrano',
      numero: '200',
      pisoDepto: null,
      codigoPostal: '9420',
      localidadId: '94008010',
      principal: false,
    },
    horarios: [{ diaSemana: 'LUNES', horaApertura: '00:00:00', horaCierre: '23:59:59' }],
    nombreRepresentante: 'Roberto',
    apellidoRepresentante: 'Fernandez',
    dniRepresentante: '30199222',
    telefonoRepresentante: '+5492964555333',
    fechaNacimientoRepresentante: '1985-03-15',
    redesSociales: [{ tipo: 'INSTAGRAM', url: 'https://instagram.com/matriz.comercio' }],
  };
  return deepMerge(payload, overrides);
}

function deepMerge(base, overrides) {
  const out = Array.isArray(base) ? [...base] : { ...base };
  for (const key of Object.keys(overrides)) {
    const val = overrides[key];
    if (val !== null && typeof val === 'object' && !Array.isArray(val) && typeof base[key] === 'object' && base[key] !== null) {
      out[key] = deepMerge(base[key], val);
    } else {
      out[key] = val;
    }
  }
  return out;
}

function req(method, urlPath, body, token) {
  const header = [{ key: 'Content-Type', value: 'application/json' }];
  if (token) header.push({ key: 'Authorization', value: `Bearer {{${token}}}` });
  const segments = urlPath.replace(/^\//, '').split('/');
  const request = {
    method,
    header,
    url: {
      raw: '{{base_url}}/' + segments.join('/'),
      host: ['{{base_url}}'],
      path: segments,
    },
  };
  if (body !== undefined) {
    request.body = { mode: 'raw', raw: JSON.stringify(body, null, 2), options: { raw: { language: 'json' } } };
  }
  return request;
}

function assertStatusOnly(status) {
  return [`pm.test('Status code es ${status}', () => pm.response.to.have.status(${status}));`];
}

function assertFieldMessage(status, field, message) {
  return [
    `pm.test('Status code es ${status}', () => pm.response.to.have.status(${status}));`,
    'const json = pm.response.json();',
    `pm.test('Mensaje exacto de ${field}', () => pm.expect(json.data['${field}']).to.eql(${JSON.stringify(message)}));`,
  ];
}

function assertTopLevelMessage(status, message) {
  return [
    `pm.test('Status code es ${status}', () => pm.response.to.have.status(${status}));`,
    'const json = pm.response.json();',
    `pm.test('Mensaje exacto', () => pm.expect(json.mensaje).to.eql(${JSON.stringify(message)}));`,
  ];
}

function assertFieldAbsent(status, field) {
  return [
    `pm.test('Status code es ${status}', () => pm.response.to.have.status(${status}));`,
    'const json = pm.response.json();',
    `pm.test('${field} no genera error de formato', () => pm.expect(json.data).to.not.have.property('${field}'));`,
  ];
}

function assertCreated201() {
  return [
    "pm.test('Status code es 201', () => pm.response.to.have.status(201));",
    "pm.test('La respuesta tiene mensaje', () => { const json = pm.response.json(); pm.expect(json.mensaje).to.exist; });",
  ];
}

function item(name, request, execLines) {
  return { name, request, response: [], event: [{ listen: 'test', script: { type: 'text/javascript', exec: execLines } }] };
}

function registroItem(name, overrides, execLines) {
  return item(name, req('POST', '/auth/registro/comercio', baseComercioPayload(overrides)), execLines);
}

// ---------------------------------------------------------------------------
// Folder 33 - Paso 1 (Negocio)
// ---------------------------------------------------------------------------
const s = (n, c = 'x') => c.repeat(n);
const folder33 = {
  name: '33 - Matriz Comercio - Registro Paso 1 (Negocio)',
  item: [
    registroItem('Registro Comercio - nombre vacio', { nombre: '' }, assertFieldMessage(400, 'nombre', 'El nombre del comercio es obligatorio')),
    registroItem('Registro Comercio - nombre formato invalido (solo simbolos)', { nombre: '!!!' }, assertFieldMessage(400, 'nombre', 'Ingresá un nombre de comercio válido')),
    registroItem('Registro Comercio - nombre formato invalido (guiones)', { nombre: '-----' }, assertFieldMessage(400, 'nombre', 'Ingresá un nombre de comercio válido')),
    registroItem('Registro Comercio - nombre limite superior exacto 150 caracteres (debe aceptar)', { nombre: s(150, 'N'), email: 'matriz.c1.nombre150@bajonea.test', cuit: '30799000101', dniRepresentante: '30199301' }, assertCreated201()),
    registroItem('Registro Comercio - nombre por encima del limite 151 caracteres (debe rechazar)', { nombre: s(151, 'N') }, assertFieldMessage(400, 'nombre', 'El nombre no puede superar los 150 caracteres')),

    registroItem('Registro Comercio - descripcion limite superior exacto 2000 caracteres (debe aceptar)', { descripcion: s(2000, 'd'), email: 'matriz.c1.desc2000@bajonea.test', cuit: '30799000128', dniRepresentante: '30199302' }, assertCreated201()),
    registroItem('Registro Comercio - descripcion por encima del limite 2001 caracteres (debe rechazar)', { descripcion: s(2001, 'd') }, assertFieldMessage(400, 'descripcion', 'La descripción no puede superar los 2000 caracteres')),

    registroItem('Registro Comercio - telefono vacio', { telefono: '' }, assertFieldMessage(400, 'telefono', 'El teléfono de contacto es obligatorio')),
    registroItem('Registro Comercio - telefono formato invalido (sin +549)', { telefono: '2964555111' }, assertFieldMessage(400, 'telefono', 'Ingresá un número de teléfono válido (cod. área + número)')),
    registroItem('Registro Comercio - telefono formato invalido (letras)', { telefono: '+549296455abcd' }, assertFieldMessage(400, 'telefono', 'Ingresá un número de teléfono válido (cod. área + número)')),

    registroItem('Registro Comercio - emailContacto vacio', { emailContacto: '' }, assertFieldMessage(400, 'emailContacto', 'El email de contacto es obligatorio')),
    registroItem('Registro Comercio - emailContacto formato invalido (sin arroba)', { emailContacto: 'contacto.sin.arroba.test' }, assertFieldMessage(400, 'emailContacto', 'Ingresá un email de contacto con formato válido')),
    registroItem('Registro Comercio - emailContacto formato invalido (sin dominio)', { emailContacto: 'contacto@' }, assertFieldMessage(400, 'emailContacto', 'Ingresá un email de contacto con formato válido')),

    ...['RESTAURANTE', 'EMPRENDIMIENTO', 'ROTISERIA', 'HELADERIA', 'CAFETERIA', 'PANADERIA', 'PIZZERIA', 'PARRILLA', 'BAR', 'KIOSCO', 'FOOD_TRUCK', 'OTRO'].map((tipo) =>
      registroItem(`Registro Comercio - tipoComercio=${tipo} (pasa validacion de formato, aislado con password vacio)`, { tipoComercio: tipo, password: '' }, assertFieldAbsent(400, 'tipoComercio')),
    ),
    registroItem('Registro Comercio - tipoComercio vacio (null)', { tipoComercio: null }, assertFieldMessage(400, 'tipoComercio', 'Seleccioná el tipo de comercio')),
    registroItem('Registro Comercio - tipoComercio fuera del enum (INVALIDO)', { tipoComercio: 'INVALIDO' }, assertTopLevelMessage(400, 'El cuerpo de la solicitud contiene datos con formato inválido')),

    registroItem('Registro Comercio - ninguna modalidad de entrega (aceptaDelivery y aceptaRetiro false)', { aceptaDelivery: false, aceptaRetiro: false }, assertTopLevelMessage(400, 'El comercio debe ofrecer al menos una modalidad de entrega (delivery o retiro)')),

    registroItem('Registro Comercio - fotoPerfilUrl vacia', { fotoPerfilUrl: '' }, assertFieldMessage(400, 'fotoPerfilUrl', 'Agregá una foto de perfil de tu comercio')),
    registroItem('Registro Comercio - fotoPerfilUrl host invalido (no es res.cloudinary.com)', { fotoPerfilUrl: 'https://evil.com/image/upload/v1/x.jpg' }, assertFieldMessage(400, 'fotoPerfilUrl', 'La URL debe pertenecer al dominio de Cloudinary')),
    registroItem('Registro Comercio - fotoPerfilUrl esquema invalido (http en vez de https)', { fotoPerfilUrl: 'http://res.cloudinary.com/demo/image/upload/v1/x.jpg' }, assertFieldMessage(400, 'fotoPerfilUrl', 'La URL debe pertenecer al dominio de Cloudinary')),

    registroItem('Registro Comercio - direccion.calle vacia', { direccion: { calle: '' } }, assertFieldMessage(400, 'direccion.calle', 'La calle es obligatoria')),
    registroItem('Registro Comercio - direccion.codigoPostal formato CPA alternativo (debe aceptar)', { direccion: { codigoPostal: 'U9410ABC' }, email: 'matriz.c1.cpa@bajonea.test', cuit: '30799000136', dniRepresentante: '30199303' }, assertCreated201()),
  ],
};

// ---------------------------------------------------------------------------
// Folder 34 - Paso 2 (Legales)
// ---------------------------------------------------------------------------
const folder34 = {
  name: '34 - Matriz Comercio - Registro Paso 2 (Legales)',
  item: [
    registroItem('Registro Comercio - razonSocial vacia', { razonSocial: '' }, assertFieldMessage(400, 'razonSocial', 'La razón social es obligatoria')),
    registroItem('Registro Comercio - razonSocial formato invalido (solo simbolos)', { razonSocial: '####' }, assertFieldMessage(400, 'razonSocial', 'La razón social no puede contener solo caracteres especiales')),
    registroItem('Registro Comercio - razonSocial por encima del limite 151 (debe rechazar)', { razonSocial: s(151, 'R') }, assertFieldMessage(400, 'razonSocial', 'La razón social no puede superar los 150 caracteres')),
    registroItem('Registro Comercio - razonSocial limite superior exacto 150 (debe aceptar)', { razonSocial: s(150, 'R'), email: 'matriz.c2.razon150@bajonea.test', cuit: '30799000144', dniRepresentante: '30199310' }, assertCreated201()),

    registroItem('Registro Comercio - cuit vacio', { cuit: '' }, assertFieldMessage(400, 'cuit', 'El CUIT es obligatorio')),
    registroItem('Registro Comercio - cuit formato invalido (longitud incorrecta, 10 digitos)', { cuit: '3079900030' }, assertFieldMessage(400, 'cuit', 'El CUIT debe tener 11 dígitos numéricos')),
    registroItem('Registro Comercio - cuit formato invalido (digito verificador incorrecto)', { cuit: '30799000307' }, assertFieldMessage(400, 'cuit', 'El CUIT debe tener 11 dígitos numéricos')),

    ...['RESPONSABLE_INSCRIPTO', 'EXENTO', 'NO_INSCRIPTO', 'MONOTRIBUTO', 'RESPONSABLE_NACIONAL'].map((c) =>
      registroItem(`Registro Comercio - condicionIva=${c} (pasa validacion de formato, aislado con password vacio)`, { condicionIva: c, password: '' }, assertFieldAbsent(400, 'condicionIva')),
    ),
    registroItem('Registro Comercio - condicionIva vacio (null)', { condicionIva: null }, assertFieldMessage(400, 'condicionIva', 'Seleccioná la condición ante el IVA')),
    registroItem('Registro Comercio - condicionIva fuera del enum', { condicionIva: 'INVALIDO' }, assertTopLevelMessage(400, 'El cuerpo de la solicitud contiene datos con formato inválido')),

    ...['SA', 'SRL', 'SAS', 'SC', 'SCS', 'SCRL', 'SCSA', 'SCCS', 'CC', 'CS', 'CCSA', 'CA', 'SP', 'ST', 'ACP', 'EMP', 'EU', 'UTE'].map((t) =>
      registroItem(`Registro Comercio - tipoSociedad=${t} (pasa validacion de formato, aislado con password vacio)`, { tipoSociedad: t, password: '' }, assertFieldAbsent(400, 'tipoSociedad')),
    ),
    registroItem('Registro Comercio - tipoSociedad vacio (null)', { tipoSociedad: null }, assertFieldMessage(400, 'tipoSociedad', 'Seleccioná el tipo de sociedad')),
    registroItem('Registro Comercio - tipoSociedad fuera del enum', { tipoSociedad: 'INVALIDO' }, assertTopLevelMessage(400, 'El cuerpo de la solicitud contiene datos con formato inválido')),

    registroItem('Registro Comercio - domicilioFiscal vacio', { domicilioFiscal: '' }, assertFieldMessage(400, 'domicilioFiscal', 'El domicilio fiscal es obligatorio')),
    registroItem('Registro Comercio - domicilioFiscal formato invalido (solo simbolos)', { domicilioFiscal: '@@@@' }, assertFieldMessage(400, 'domicilioFiscal', 'El domicilio fiscal no puede contener solo caracteres especiales')),
    registroItem('Registro Comercio - domicilioFiscal por encima del limite 256 (debe rechazar)', { domicilioFiscal: s(256, 'D') }, assertFieldMessage(400, 'domicilioFiscal', 'El domicilio fiscal no puede superar los 255 caracteres')),
    registroItem('Registro Comercio - domicilioFiscal limite superior exacto 255 (debe aceptar)', { domicilioFiscal: s(255, 'D'), email: 'matriz.c2.dom255@bajonea.test', cuit: '30799000152', dniRepresentante: '30199311' }, assertCreated201()),

    registroItem('Registro Comercio - fechaInicioActividades vacia (null)', { fechaInicioActividades: null }, assertFieldMessage(400, 'fechaInicioActividades', 'La fecha de inicio de actividades es obligatoria')),
    registroItem('Registro Comercio - fechaInicioActividades futura (invalida)', { fechaInicioActividades: '2099-01-01' }, assertFieldMessage(400, 'fechaInicioActividades', 'La fecha ingresada no es válida')),

    registroItem('Registro Comercio - nombreRepresentante vacio', { nombreRepresentante: '' }, assertFieldMessage(400, 'nombreRepresentante', 'El nombre es obligatorio')),
    registroItem('Registro Comercio - nombreRepresentante formato invalido (numeros)', { nombreRepresentante: 'Roberto123' }, assertFieldMessage(400, 'nombreRepresentante', 'El nombre solo puede contener letras')),
    registroItem('Registro Comercio - nombreRepresentante por encima del limite 101 (debe rechazar)', { nombreRepresentante: s(101, 'N') }, assertFieldMessage(400, 'nombreRepresentante', 'El nombre no puede superar los 100 caracteres')),

    registroItem('Registro Comercio - apellidoRepresentante vacio', { apellidoRepresentante: '' }, assertFieldMessage(400, 'apellidoRepresentante', 'El apellido es obligatorio')),
    registroItem('Registro Comercio - apellidoRepresentante formato invalido (simbolos)', { apellidoRepresentante: 'Fernandez@' }, assertFieldMessage(400, 'apellidoRepresentante', 'El apellido solo puede contener letras')),

    registroItem('Registro Comercio - dniRepresentante vacio', { dniRepresentante: '' }, assertFieldMessage(400, 'dniRepresentante', 'El DNI es obligatorio')),
    registroItem('Registro Comercio - dniRepresentante formato invalido (6 digitos, corto)', { dniRepresentante: '123456' }, assertFieldMessage(400, 'dniRepresentante', 'El DNI debe tener un formato válido')),
    registroItem('Registro Comercio - dniRepresentante formato invalido (9 digitos, largo)', { dniRepresentante: '123456789' }, assertFieldMessage(400, 'dniRepresentante', 'El DNI debe tener un formato válido')),
    registroItem('Registro Comercio - dniRepresentante limite inferior exacto 7 digitos (debe aceptar)', { dniRepresentante: '3019930', email: 'matriz.c2.dni7@bajonea.test', cuit: '30799000209' }, assertCreated201()),

    registroItem('Registro Comercio - telefonoRepresentante vacio', { telefonoRepresentante: '' }, assertFieldMessage(400, 'telefonoRepresentante', 'El teléfono es obligatorio')),
    registroItem('Registro Comercio - telefonoRepresentante formato invalido (sin +549)', { telefonoRepresentante: '2964555333' }, assertFieldMessage(400, 'telefonoRepresentante', 'Ingresá un número de teléfono válido (cod. área + número)')),

    registroItem('Registro Comercio - fechaNacimientoRepresentante vacia (null)', { fechaNacimientoRepresentante: null }, assertFieldMessage(400, 'fechaNacimientoRepresentante', 'La fecha de nacimiento es obligatoria')),
    registroItem(
      '[bug ya corregido - @Past eliminado, MayorDeEdadValidator ahora cubre fecha futura internamente] Registro Comercio - fechaNacimientoRepresentante futura (mensaje ya deterministico)',
      { fechaNacimientoRepresentante: '2099-01-01' },
      assertFieldMessage(400, 'fechaNacimientoRepresentante', 'Debe ser mayor de 18 años'),
    ),
    registroItem('Registro Comercio - fechaNacimientoRepresentante menor de edad (17 anios, violacion unica)', { fechaNacimientoRepresentante: '2009-01-01' }, assertFieldMessage(400, 'fechaNacimientoRepresentante', 'Debe ser mayor de 18 años')),

    registroItem('Registro Comercio - email vacio', { email: '' }, assertFieldMessage(400, 'email', 'El email es obligatorio')),
    registroItem('Registro Comercio - email formato invalido (sin arroba)', { email: 'sin.arroba.test' }, assertFieldMessage(400, 'email', 'Ingresá un email válido')),

    registroItem('Registro Comercio - password 7 caracteres (por debajo del minimo, debe rechazar)', { password: 'Aa1abcd' }, assertFieldMessage(400, 'password', 'Debe tener mínimo 8 caracteres, una mayúscula, una minúscula y un número')),
    registroItem('Registro Comercio - password 8 caracteres exacto (limite inferior, debe aceptar)', { password: 'Aa1abcde', email: 'matriz.c2.pw8@bajonea.test', cuit: '30799000217' }, assertCreated201()),

    item('Registro Comercio - password 73 caracteres, corrida 1 (determinismo, ver Parte A)', req('POST', '/auth/registro/comercio', baseComercioPayload({ password: 'Aa1' + s(70) })), assertFieldMessage(400, 'password', 'Debe tener mínimo 8 caracteres, una mayúscula, una minúscula y un número')),
    item('Registro Comercio - password 73 caracteres, corrida 2 (determinismo, ver Parte A)', req('POST', '/auth/registro/comercio', baseComercioPayload({ password: 'Aa1' + s(70) })), assertFieldMessage(400, 'password', 'Debe tener mínimo 8 caracteres, una mayúscula, una minúscula y un número')),
    item('Registro Comercio - password 73 caracteres, corrida 3 (determinismo, ver Parte A)', req('POST', '/auth/registro/comercio', baseComercioPayload({ password: 'Aa1' + s(70) })), assertFieldMessage(400, 'password', 'Debe tener mínimo 8 caracteres, una mayúscula, una minúscula y un número')),
  ],
};

// ---------------------------------------------------------------------------
// Folder 35 - Paso 3 (Horarios)
// ---------------------------------------------------------------------------
const folder35 = {
  name: '35 - Matriz Comercio - Registro Paso 3 (Horarios)',
  item: [
    registroItem('Registro Comercio - horarios diaSemana null en una franja', { horarios: [{ diaSemana: null, horaApertura: '09:00:00', horaCierre: '18:00:00' }] }, assertFieldMessage(400, 'horarios[0].diaSemana', 'no debe ser nulo')),
    registroItem('Registro Comercio - horarios horaApertura null en una franja', { horarios: [{ diaSemana: 'LUNES', horaApertura: null, horaCierre: '18:00:00' }] }, assertFieldMessage(400, 'horarios[0].horaApertura', 'no debe ser nulo')),
    registroItem('Registro Comercio - horarios horaCierre igual a horaApertura (limite, debe rechazar)', { dniRepresentante: '30199330', horarios: [{ diaSemana: 'LUNES', horaApertura: '09:00:00', horaCierre: '09:00:00' }] }, assertTopLevelMessage(400, 'La hora de cierre debe ser posterior a la hora de apertura')),
    registroItem('Registro Comercio - horarios horaCierre anterior a horaApertura (debe rechazar)', { dniRepresentante: '30199331', horarios: [{ diaSemana: 'LUNES', horaApertura: '18:00:00', horaCierre: '09:00:00' }] }, assertTopLevelMessage(400, 'La hora de cierre debe ser posterior a la hora de apertura')),
    registroItem(
      'Registro Comercio - horarios superposicion en el mismo dia (debe rechazar)',
      { dniRepresentante: '30199332', horarios: [
        { diaSemana: 'LUNES', horaApertura: '09:00:00', horaCierre: '13:00:00' },
        { diaSemana: 'LUNES', horaApertura: '12:00:00', horaCierre: '18:00:00' },
      ] },
      assertTopLevelMessage(400, 'Ya tenés un horario cargado el Lunes de 12:00 a 18:00, que se superpone con este'),
    ),
    registroItem(
      'Registro Comercio - horarios sin superposicion, horario partido mismo dia (debe aceptar)',
      { email: 'matriz.c3.horariopartido@bajonea.test', cuit: '30799000268', dniRepresentante: '30199320', horarios: [
        { diaSemana: 'LUNES', horaApertura: '09:00:00', horaCierre: '13:00:00' },
        { diaSemana: 'LUNES', horaApertura: '17:00:00', horaCierre: '21:00:00' },
      ] },
      assertCreated201(),
    ),
    registroItem('Registro Comercio - horarios diaSemana fuera del enum', { dniRepresentante: '30199333', horarios: [{ diaSemana: 'LUNESX', horaApertura: '09:00:00', horaCierre: '18:00:00' }] }, assertTopLevelMessage(400, 'El cuerpo de la solicitud contiene datos con formato inválido')),
  ],
};

// ---------------------------------------------------------------------------
// Setup helper for authenticated domains
// ---------------------------------------------------------------------------
function setupRegistroComercio(nombreSetup, overrides, tokenVar) {
  const payload = baseComercioPayload(overrides);
  const items = [];
  items.push(item(`Setup - Registro Comercio (${nombreSetup})`, req('POST', '/auth/registro/comercio', payload), assertCreated201()));
  items.push(
    item(`Setup - Obtener codigo real de verificacion (${nombreSetup})`, req('GET', `/test/token?email=${encodeURIComponent(payload.email)}&tipo=VERIFICACION_EMAIL`, undefined), [
      "pm.test('Status code es 200', () => pm.response.to.have.status(200));",
      'const json = pm.response.json();',
      `pm.environment.set('${tokenVar}_codigo', json.data);`,
    ]),
  );
  items.push(
    item(`Setup - Verificar cuenta (${nombreSetup})`, req('POST', '/auth/verificar', { email: payload.email, codigo: `{{${tokenVar}_codigo}}` }), [
      "pm.test('Status code es 200', () => pm.response.to.have.status(200));",
    ]),
  );
  items.push(
    item(`Setup - Login (${nombreSetup})`, req('POST', '/auth/login', { email: payload.email, password: payload.password }), [
      "pm.test('Status code es 200', () => pm.response.to.have.status(200));",
      'const json = pm.response.json();',
      `pm.environment.set('${tokenVar}', json.data.token);`,
    ]),
  );
  return { items, payload };
}

// ---------------------------------------------------------------------------
// Folder 36 - Perfil de Comercio
// ---------------------------------------------------------------------------
const perfilSetup = setupRegistroComercio('matriz perfil comercio', { email: 'matriz.comercio.perfil@bajonea.test', cuit: '30799000225', dniRepresentante: '30199340' }, 'matriz_comercio_perfil_token');
function perfilBody(o) {
  return { nombre: 'Comercio Perfil Editado', descripcion: 'desc', telefono: '+5492964555200', emailContacto: 'nuevo.contacto@bajonea.test', aceptaDelivery: true, aceptaRetiro: true, ...o };
}
const folder36 = {
  name: '36 - Matriz Comercio - Perfil (edicion)',
  item: [
    ...perfilSetup.items,
    item('Perfil Comercio - nombre vacio', req('PUT', '/comercios/perfil', perfilBody({ nombre: '' }), 'matriz_comercio_perfil_token'), assertFieldMessage(400, 'nombre', 'No debe estar vacío')),
    item('Perfil Comercio - nombre formato invalido (simbolos)', req('PUT', '/comercios/perfil', perfilBody({ nombre: '###' }), 'matriz_comercio_perfil_token'), assertFieldMessage(400, 'nombre', 'Ingresá un nombre de comercio válido')),
    item(
      '[mensaje generico de Hibernate Validator, no personalizado como el resto de la app - @Size sin message propio] Perfil Comercio - nombre por encima del limite 151 (debe rechazar)',
      req('PUT', '/comercios/perfil', perfilBody({ nombre: s(151, 'N') }), 'matriz_comercio_perfil_token'),
      assertFieldMessage(400, 'nombre', 'el tamaño debe estar entre 0 y 150'),
    ),
    item('Perfil Comercio - nombre limite superior exacto 150 (debe aceptar)', req('PUT', '/comercios/perfil', perfilBody({ nombre: s(150, 'N') }), 'matriz_comercio_perfil_token'), assertStatusOnly(200)),
    item('Perfil Comercio - descripcion limite superior 2001 (debe rechazar)', req('PUT', '/comercios/perfil', perfilBody({ descripcion: s(2001, 'd') }), 'matriz_comercio_perfil_token'), assertFieldMessage(400, 'descripcion', 'La descripción no puede superar los 2000 caracteres.')),
    item('Perfil Comercio - descripcion limite superior exacto 2000 (debe aceptar)', req('PUT', '/comercios/perfil', perfilBody({ descripcion: s(2000, 'd') }), 'matriz_comercio_perfil_token'), assertStatusOnly(200)),
    item('Perfil Comercio - telefono vacio', req('PUT', '/comercios/perfil', perfilBody({ telefono: '' }), 'matriz_comercio_perfil_token'), assertFieldMessage(400, 'telefono', 'No debe estar vacío')),
    item('Perfil Comercio - telefono formato invalido', req('PUT', '/comercios/perfil', perfilBody({ telefono: '123456' }), 'matriz_comercio_perfil_token'), assertFieldMessage(400, 'telefono', 'Ingresá un número de teléfono válido (cod. área + número)')),
    item('Perfil Comercio - emailContacto vacio', req('PUT', '/comercios/perfil', perfilBody({ emailContacto: '' }), 'matriz_comercio_perfil_token'), assertFieldMessage(400, 'emailContacto', 'No debe estar vacío')),
    item('Perfil Comercio - emailContacto formato invalido', req('PUT', '/comercios/perfil', perfilBody({ emailContacto: 'sin-arroba' }), 'matriz_comercio_perfil_token'), assertFieldMessage(400, 'emailContacto', 'Ingresá un email de contacto con formato válido')),
    item(
      '[GAP CERRADO, confirmado por primera vez con test real] Perfil Comercio - sin ninguna modalidad de entrega (debe rechazar)',
      req('PUT', '/comercios/perfil', perfilBody({ aceptaDelivery: false, aceptaRetiro: false }), 'matriz_comercio_perfil_token'),
      assertTopLevelMessage(400, 'El comercio debe ofrecer al menos una modalidad de entrega (delivery o retiro)'),
    ),
    item('Perfil Comercio - valido (debe aceptar)', req('PUT', '/comercios/perfil', perfilBody({}), 'matriz_comercio_perfil_token'), assertStatusOnly(200)),
  ],
};

// ---------------------------------------------------------------------------
// Folder 37 - Cambio de password desde perfil de Comercio
// ---------------------------------------------------------------------------
const pwSetup = setupRegistroComercio('matriz password comercio', { email: 'matriz.comercio.pw@bajonea.test', cuit: '30799000403', dniRepresentante: '30199350' }, 'matriz_comercio_pw_token');
const pwPassword = pwSetup.payload.password;
const folder37 = {
  name: '37 - Matriz Comercio - Cambio de password desde perfil',
  item: [
    ...pwSetup.items,
    item('Cambiar password Comercio - passwordActual vacio', req('POST', '/auth/cambiar-password', { passwordActual: '', passwordNueva: 'Bb2NuevaPass' }, 'matriz_comercio_pw_token'), assertFieldMessage(400, 'passwordActual', 'No debe estar vacío')),
    item('Cambiar password Comercio - passwordNueva vacio', req('POST', '/auth/cambiar-password', { passwordActual: pwPassword, passwordNueva: '' }, 'matriz_comercio_pw_token'), assertFieldMessage(400, 'passwordNueva', 'No debe estar vacío')),
    item('Cambiar password Comercio - passwordNueva formato invalido (sin mayuscula)', req('POST', '/auth/cambiar-password', { passwordActual: pwPassword, passwordNueva: 'bb2nuevapass' }, 'matriz_comercio_pw_token'), assertFieldMessage(400, 'passwordNueva', 'Debe tener mínimo 8 caracteres, una mayúscula, una minúscula y un número')),
    item('Cambiar password Comercio - passwordNueva 73 caracteres, corrida 1 (determinismo, sin @Size redundante en este DTO)', req('POST', '/auth/cambiar-password', { passwordActual: pwPassword, passwordNueva: 'Aa1' + s(70) }, 'matriz_comercio_pw_token'), assertFieldMessage(400, 'passwordNueva', 'Debe tener mínimo 8 caracteres, una mayúscula, una minúscula y un número')),
    item('Cambiar password Comercio - passwordNueva 73 caracteres, corrida 2 (determinismo)', req('POST', '/auth/cambiar-password', { passwordActual: pwPassword, passwordNueva: 'Aa1' + s(70) }, 'matriz_comercio_pw_token'), assertFieldMessage(400, 'passwordNueva', 'Debe tener mínimo 8 caracteres, una mayúscula, una minúscula y un número')),
    item('Cambiar password Comercio - passwordActual incorrecta (1 solo intento, no agota bloqueo)', req('POST', '/auth/cambiar-password', { passwordActual: 'PasswordIncorrecta1', passwordNueva: 'Cc3NuevaPassValida' }, 'matriz_comercio_pw_token'), assertStatusOnly(401)),
    item('Cambiar password Comercio - valido (debe aceptar)', req('POST', '/auth/cambiar-password', { passwordActual: pwPassword, passwordNueva: 'Cc3NuevaPassValida' }, 'matriz_comercio_pw_token'), assertStatusOnly(200)),
    item('Cambiar password Comercio - login con password nueva confirma el cambio real', req('POST', '/auth/login', { email: pwSetup.payload.email, password: 'Cc3NuevaPassValida' }), assertStatusOnly(200)),
    item('Cambiar password Comercio - login con password vieja ya no funciona', req('POST', '/auth/login', { email: pwSetup.payload.email, password: pwPassword }), assertStatusOnly(401)),
  ],
};

// ---------------------------------------------------------------------------
// Folder 38 - Foto de perfil de Comercio
// ---------------------------------------------------------------------------
const fotoSetup = setupRegistroComercio('matriz foto comercio', { email: 'matriz.comercio.foto@bajonea.test', cuit: '30799000411', dniRepresentante: '30199360' }, 'matriz_comercio_foto_token');
const urlLarga = 'https://res.cloudinary.com/demo/image/upload/v1/' + 'a'.repeat(500) + '.jpg';
const folder38 = {
  name: '38 - Matriz Comercio - Foto de perfil',
  item: [
    ...fotoSetup.items,
    item('Foto perfil Comercio - url vacia', req('PUT', '/comercios/perfil/foto', { url: '' }, 'matriz_comercio_foto_token'), assertFieldMessage(400, 'url', 'No debe estar vacío')),
    item('Foto perfil Comercio - url host invalido (no es res.cloudinary.com)', req('PUT', '/comercios/perfil/foto', { url: 'https://evil.com/image/upload/v1/x.jpg' }, 'matriz_comercio_foto_token'), assertFieldMessage(400, 'url', 'La URL debe pertenecer al dominio de Cloudinary')),
    item('Foto perfil Comercio - url extension invalida (.pdf)', req('PUT', '/comercios/perfil/foto', { url: 'https://res.cloudinary.com/demo/image/upload/v1/x.pdf' }, 'matriz_comercio_foto_token'), assertFieldMessage(400, 'url', 'La URL debe apuntar a un archivo jpg, jpeg, png o webp')),
    item('Foto perfil Comercio - url esquema invalido (http en vez de https)', req('PUT', '/comercios/perfil/foto', { url: 'http://res.cloudinary.com/demo/image/upload/v1/x.jpg' }, 'matriz_comercio_foto_token'), assertFieldMessage(400, 'url', 'La URL debe pertenecer al dominio de Cloudinary')),
    item(
      '[bug ya corregido - @Size(max=500) agregado al DTO] Foto perfil Comercio - url de 552 caracteres (debe rechazar con 400)',
      req('PUT', '/comercios/perfil/foto', { url: urlLarga }, 'matriz_comercio_foto_token'),
      assertFieldMessage(400, 'url', 'La URL de la foto de perfil no puede superar los 500 caracteres'),
    ),
    item('Foto perfil Comercio - url valida (debe aceptar)', req('PUT', '/comercios/perfil/foto', { url: 'https://res.cloudinary.com/demo/image/upload/v1/matriz-foto-nueva.jpg' }, 'matriz_comercio_foto_token'), assertStatusOnly(200)),
  ],
};

// ---------------------------------------------------------------------------
// Folder 39 - CRUD de productos (campo por campo)
// ---------------------------------------------------------------------------
const productoSetup = setupRegistroComercio('matriz productos comercio', { email: 'matriz.comercio.productos@bajonea.test', cuit: '30799000438', dniRepresentante: '30199370' }, 'matriz_comercio_productos_token');
function prodBody(o) {
  return { nombre: 'Empanada Matriz', descripcion: 'desc', precio: 1000, categoriaId: '{{matriz_categoria_id}}', tagIds: ['{{matriz_tag_id}}'], ...o };
}
const folder39 = {
  name: '39 - Matriz Comercio - CRUD de productos (campo por campo)',
  item: [
    item('Setup - Login Administrador (matriz productos)', req('POST', '/auth/login', { email: '{{admin_email}}', password: '{{admin_password}}' }), [
      "pm.test('Status code es 200', () => pm.response.to.have.status(200));",
      'const json = pm.response.json();',
      "pm.environment.set('matriz_admin_token', json.data.token);",
    ]),
    item('Setup - Crear categoria (matriz productos)', req('POST', '/categorias', { nombre: 'Matriz Categoria Productos' }, 'matriz_admin_token'), [
      "pm.test('Status code es 201', () => pm.response.to.have.status(201));",
      'const json = pm.response.json();',
      "pm.environment.set('matriz_categoria_id', json.data.id);",
    ]),
    ...['MatrizTagA', 'MatrizTagB', 'MatrizTagC', 'MatrizTagD', 'MatrizTagE', 'MatrizTagF'].map((nombre, idx) =>
      item(`Setup - Crear tag ${nombre} (matriz productos)`, req('POST', '/tags', { nombre }, 'matriz_admin_token'), [
        "pm.test('Status code es 201', () => pm.response.to.have.status(201));",
        'const json = pm.response.json();',
        `pm.environment.set('matriz_tag_id_${idx + 1}', json.data.id);`,
        ...(idx === 0 ? ["pm.environment.set('matriz_tag_id', json.data.id);"] : []),
      ]),
    ),
    ...productoSetup.items,

    item('Producto - nombre vacio', req('POST', '/productos', prodBody({ nombre: '' }), 'matriz_comercio_productos_token'), assertFieldMessage(400, 'nombre', 'No debe estar vacío')),
    item('Producto - nombre formato invalido (empieza con simbolo)', req('POST', '/productos', prodBody({ nombre: '@Empanada' }), 'matriz_comercio_productos_token'), assertFieldMessage(400, 'nombre', 'Ingresá un nombre de producto válido (letras, números y espacios)')),
    item('Producto - nombre formato invalido (solo simbolos)', req('POST', '/productos', prodBody({ nombre: '###' }), 'matriz_comercio_productos_token'), assertFieldMessage(400, 'nombre', 'Ingresá un nombre de producto válido (letras, números y espacios)')),
    item(
      '[mensaje generico de Hibernate Validator, no personalizado como el resto de la app - @Size sin message propio] Producto - nombre por encima del limite 151 (debe rechazar)',
      req('POST', '/productos', prodBody({ nombre: s(151, 'N') }), 'matriz_comercio_productos_token'),
      assertFieldMessage(400, 'nombre', 'el tamaño debe estar entre 0 y 150'),
    ),
    item('Producto - nombre limite superior exacto 150 (debe aceptar)', req('POST', '/productos', prodBody({ nombre: s(150, 'N') }), 'matriz_comercio_productos_token'), assertStatusOnly(201)),
    item(
      '[mensaje generico de Hibernate Validator, gap ya documentado en CLAUDE.md] Producto - descripcion por encima del limite 2001 (debe rechazar)',
      req('POST', '/productos', prodBody({ descripcion: s(2001, 'd') }), 'matriz_comercio_productos_token'),
      assertFieldMessage(400, 'descripcion', 'el tamaño debe estar entre 0 y 2000'),
    ),
    item('Producto - descripcion limite superior exacto 2000 (debe aceptar)', req('POST', '/productos', prodBody({ descripcion: s(2000, 'd') }), 'matriz_comercio_productos_token'), assertStatusOnly(201)),
    item('Producto - precio nulo', req('POST', '/productos', prodBody({ precio: null }), 'matriz_comercio_productos_token'), assertFieldMessage(400, 'precio', 'No debe estar vacío')),
    item('Producto - precio cero (invalido, debe ser mayor a $0)', req('POST', '/productos', prodBody({ precio: 0 }), 'matriz_comercio_productos_token'), assertFieldMessage(400, 'precio', 'El precio debe ser mayor a $0')),
    item('Producto - precio negativo', req('POST', '/productos', prodBody({ precio: -100 }), 'matriz_comercio_productos_token'), assertFieldMessage(400, 'precio', 'El precio debe ser mayor a $0')),
    item('Producto - precio con decimales (fraction=0, debe rechazar)', req('POST', '/productos', prodBody({ precio: 10.5 }), 'matriz_comercio_productos_token'), assertFieldMessage(400, 'precio', 'El precio no puede tener más de 8 dígitos y no admite centavos')),
    item('Producto - precio 8 digitos limite superior exacto 99999999 (debe aceptar)', req('POST', '/productos', prodBody({ precio: 99999999 }), 'matriz_comercio_productos_token'), assertStatusOnly(201)),
    item('Producto - precio 9 digitos por encima del limite 100000000 (debe rechazar)', req('POST', '/productos', prodBody({ precio: 100000000 }), 'matriz_comercio_productos_token'), assertFieldMessage(400, 'precio', 'El precio no puede tener más de 8 dígitos y no admite centavos')),
    item(
      '[mensaje generico de Hibernate Validator, no personalizado como el resto de la app - @NotNull sin message propio] Producto - categoriaId nulo',
      req('POST', '/productos', prodBody({ categoriaId: null }), 'matriz_comercio_productos_token'),
      assertFieldMessage(400, 'categoriaId', 'no debe ser nulo'),
    ),
    item('Producto - categoriaId inexistente', req('POST', '/productos', prodBody({ categoriaId: 999999 }), 'matriz_comercio_productos_token'), assertTopLevelMessage(404, 'Categoría no encontrada')),
    item('Producto - tagIds vacio (opcional, debe aceptar)', req('POST', '/productos', prodBody({ tagIds: [] }), 'matriz_comercio_productos_token'), assertStatusOnly(201)),
    item('Producto - tagIds limite superior exacto 5 (debe aceptar)', req('POST', '/productos', prodBody({ tagIds: ['{{matriz_tag_id_1}}', '{{matriz_tag_id_2}}', '{{matriz_tag_id_3}}', '{{matriz_tag_id_4}}', '{{matriz_tag_id_5}}'] }), 'matriz_comercio_productos_token'), assertStatusOnly(201)),
    item('Producto - tagIds por encima del limite 6 (debe rechazar)', req('POST', '/productos', prodBody({ tagIds: ['{{matriz_tag_id_1}}', '{{matriz_tag_id_2}}', '{{matriz_tag_id_3}}', '{{matriz_tag_id_4}}', '{{matriz_tag_id_5}}', '{{matriz_tag_id_6}}'] }), 'matriz_comercio_productos_token'), assertFieldMessage(400, 'tagIds', 'No podés seleccionar más de 5 tags')),
    item('Producto - tagIds con id inexistente', req('POST', '/productos', prodBody({ tagIds: [999999] }), 'matriz_comercio_productos_token'), assertTopLevelMessage(404, 'Tag no encontrado: 999999')),
    item('Producto - valido (debe aceptar)', req('POST', '/productos', prodBody({}), 'matriz_comercio_productos_token'), [
      "pm.test('Status code es 201', () => pm.response.to.have.status(201));",
      'const json = pm.response.json();',
      "pm.environment.set('matriz_producto_id_imagenes', json.data.id);",
    ]),
  ],
};

// ---------------------------------------------------------------------------
// Folder 40 - Gestion de imagenes de producto
// ---------------------------------------------------------------------------
const folder40 = {
  name: '40 - Matriz Comercio - Gestion de imagenes de producto',
  item: [
    item('Imagen producto - url vacia', req('POST', '/productos/{{matriz_producto_id_imagenes}}/imagenes', { url: '', orden: 0, esPrincipal: true }, 'matriz_comercio_productos_token'), assertFieldMessage(400, 'url', 'No debe estar vacío')),
    item('Imagen producto - url host invalido', req('POST', '/productos/{{matriz_producto_id_imagenes}}/imagenes', { url: 'https://evil.com/x.jpg', orden: 0, esPrincipal: true }, 'matriz_comercio_productos_token'), assertFieldMessage(400, 'url', 'La URL debe pertenecer al dominio de Cloudinary')),
    item('Imagen producto - url extension invalida (.pdf)', req('POST', '/productos/{{matriz_producto_id_imagenes}}/imagenes', { url: 'https://res.cloudinary.com/demo/x.pdf', orden: 0, esPrincipal: true }, 'matriz_comercio_productos_token'), assertFieldMessage(400, 'url', 'La URL debe apuntar a un archivo jpg, jpeg, png o webp')),
    item('Imagen producto - url esquema invalido (http)', req('POST', '/productos/{{matriz_producto_id_imagenes}}/imagenes', { url: 'http://res.cloudinary.com/demo/x.jpg', orden: 0, esPrincipal: true }, 'matriz_comercio_productos_token'), assertFieldMessage(400, 'url', 'La URL debe pertenecer al dominio de Cloudinary')),
    item('Imagen producto - orden nulo', req('POST', '/productos/{{matriz_producto_id_imagenes}}/imagenes', { url: 'https://res.cloudinary.com/demo/image/upload/v1/matriz-img1.jpg', orden: null, esPrincipal: true }, 'matriz_comercio_productos_token'), assertFieldMessage(400, 'orden', 'El orden es obligatorio')),
    item('Imagen producto - orden negativo', req('POST', '/productos/{{matriz_producto_id_imagenes}}/imagenes', { url: 'https://res.cloudinary.com/demo/image/upload/v1/matriz-img1.jpg', orden: -1, esPrincipal: true }, 'matriz_comercio_productos_token'), assertFieldMessage(400, 'orden', 'El orden debe ser un valor positivo')),
    item('Imagen producto - valida (debe aceptar, primera imagen del producto)', req('POST', '/productos/{{matriz_producto_id_imagenes}}/imagenes', { url: 'https://res.cloudinary.com/demo/image/upload/v1/matriz-img1.jpg', orden: 0, esPrincipal: true }, 'matriz_comercio_productos_token'), [
      "pm.test('Status code es 201', () => pm.response.to.have.status(201));",
      'const json = pm.response.json();',
      "pm.environment.set('matriz_imagen_id', json.data.id);",
    ]),
    item('OrdenImagenRequestDTO - orden nulo', req('PATCH', '/productos/{{matriz_producto_id_imagenes}}/imagenes/{{matriz_imagen_id}}/orden', { orden: null }, 'matriz_comercio_productos_token'), assertFieldMessage(400, 'orden', 'El orden es obligatorio')),
    item('OrdenImagenRequestDTO - orden negativo', req('PATCH', '/productos/{{matriz_producto_id_imagenes}}/imagenes/{{matriz_imagen_id}}/orden', { orden: -1 }, 'matriz_comercio_productos_token'), assertFieldMessage(400, 'orden', 'El orden debe ser un valor positivo')),
    item('OrdenImagenRequestDTO - orden valido 0 (debe aceptar)', req('PATCH', '/productos/{{matriz_producto_id_imagenes}}/imagenes/{{matriz_imagen_id}}/orden', { orden: 0 }, 'matriz_comercio_productos_token'), assertStatusOnly(200)),
    item('UrlImagenRequestDTO - url vacia', req('PATCH', '/productos/{{matriz_producto_id_imagenes}}/imagenes/{{matriz_imagen_id}}/url', { url: '' }, 'matriz_comercio_productos_token'), assertFieldMessage(400, 'url', 'No debe estar vacío')),
    item('UrlImagenRequestDTO - url host invalido', req('PATCH', '/productos/{{matriz_producto_id_imagenes}}/imagenes/{{matriz_imagen_id}}/url', { url: 'https://evil.com/x.jpg' }, 'matriz_comercio_productos_token'), assertFieldMessage(400, 'url', 'La URL debe pertenecer al dominio de Cloudinary')),
    item(
      '[comportamiento intencional, ya documentado en la auditoria] UrlImagenRequestDTO - url con extension .pdf (sin @Pattern de extension, debe aceptar)',
      req('PATCH', '/productos/{{matriz_producto_id_imagenes}}/imagenes/{{matriz_imagen_id}}/url', { url: 'https://res.cloudinary.com/demo/image/upload/v1/matriz-recorte.pdf' }, 'matriz_comercio_productos_token'),
      assertStatusOnly(200),
    ),
  ],
};

// ---------------------------------------------------------------------------
// Folder 41 - Rechazo de pedido
// ---------------------------------------------------------------------------
const DIAS = ['LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO', 'DOMINGO'];
const pedidoComercioSetup = setupRegistroComercio(
  'matriz pedido comercio',
  { email: 'matriz.comercio.pedido@bajonea.test', cuit: '30799000454', dniRepresentante: '30199381', horarios: DIAS.map((d) => ({ diaSemana: d, horaApertura: '00:00:00', horaCierre: '23:59:59' })) },
  'matriz_comercio_pedido_token',
);
const folder41 = {
  name: '41 - Matriz Comercio - Rechazo de pedido',
  item: [
    item('Setup - Login Administrador (matriz pedido)', req('POST', '/auth/login', { email: '{{admin_email}}', password: '{{admin_password}}' }), [
      "pm.test('Status code es 200', () => pm.response.to.have.status(200));",
      'const json = pm.response.json();',
      "pm.environment.set('matriz_admin_token', json.data.token);",
    ]),
    ...pedidoComercioSetup.items,
    item('Setup - Obtener id de Comercio (matriz pedido)', req('GET', '/comercios/perfil', undefined, 'matriz_comercio_pedido_token'), [
      "pm.test('Status code es 200', () => pm.response.to.have.status(200));",
      'const json = pm.response.json();',
      "pm.environment.set('matriz_pedido_comercio_id', json.data.id);",
    ]),
    item('Setup - Aprobar Comercio (matriz pedido)', req('PUT', '/administrador/comercios/{{matriz_pedido_comercio_id}}/resolver', { aprobar: true }, 'matriz_admin_token'), assertStatusOnly(200)),
    item('Setup - Crear categoria (matriz pedido)', req('POST', '/categorias', { nombre: 'Matriz Categoria Pedido' }, 'matriz_admin_token'), [
      "pm.test('Status code es 201', () => pm.response.to.have.status(201));",
      'const json = pm.response.json();',
      "pm.environment.set('matriz_pedido_categoria_id', json.data.id);",
    ]),
    item('Setup - Crear producto (matriz pedido)', req('POST', '/productos', { nombre: 'Producto Matriz Pedido', descripcion: 'x', precio: 500, categoriaId: '{{matriz_pedido_categoria_id}}', tagIds: [] }, 'matriz_comercio_pedido_token'), [
      "pm.test('Status code es 201', () => pm.response.to.have.status(201));",
      'const json = pm.response.json();',
      "pm.environment.set('matriz_pedido_producto_id', json.data.id);",
    ]),
    item('Setup - Registro Cliente (matriz pedido)', req('POST', '/auth/registro/cliente', {
      nombre: 'Cliente', apellido: 'Matriz Pedido', dni: '30600500', fechaNacimiento: '1995-05-20', telefono: '+5492964100500',
      email: 'matriz.cliente.pedido@bajonea.test', password: 'Aa1Password2026',
      direccion: { calle: 'Belgrano', numero: '123', pisoDepto: null, codigoPostal: '9420', localidadId: '94008010', principal: true },
    }), assertCreated201()),
    item('Setup - Obtener codigo real de verificacion Cliente (matriz pedido)', req('GET', '/test/token?email=matriz.cliente.pedido@bajonea.test&tipo=VERIFICACION_EMAIL', undefined), [
      "pm.test('Status code es 200', () => pm.response.to.have.status(200));",
      'const json = pm.response.json();',
      "pm.environment.set('matriz_pedido_cliente_codigo', json.data);",
    ]),
    item('Setup - Verificar cuenta Cliente (matriz pedido)', req('POST', '/auth/verificar', { email: 'matriz.cliente.pedido@bajonea.test', codigo: '{{matriz_pedido_cliente_codigo}}' }), assertStatusOnly(200)),
    item('Setup - Login Cliente (matriz pedido)', req('POST', '/auth/login', { email: 'matriz.cliente.pedido@bajonea.test', password: 'Aa1Password2026' }), [
      "pm.test('Status code es 200', () => pm.response.to.have.status(200));",
      'const json = pm.response.json();',
      "pm.environment.set('matriz_pedido_cliente_token', json.data.token);",
    ]),
    item('Setup - Obtener perfil Cliente para direccionId (matriz pedido)', req('GET', '/clientes/perfil', undefined, 'matriz_pedido_cliente_token'), [
      "pm.test('Status code es 200', () => pm.response.to.have.status(200));",
      'const json = pm.response.json();',
      "pm.environment.set('matriz_pedido_direccion_id', json.data.direccion.id);",
    ]),
    item('Setup - Agregar item al carrito, pedido 1 (matriz pedido)', req('POST', '/carrito/items', { productoId: '{{matriz_pedido_producto_id}}', cantidad: 1 }, 'matriz_pedido_cliente_token'), assertStatusOnly(201)),
    item('Setup - Crear pedido 1 (matriz pedido)', req('POST', '/pedidos/cliente', { tipoEntrega: 'DOMICILIO', direccionId: '{{matriz_pedido_direccion_id}}' }, 'matriz_pedido_cliente_token'), [
      "pm.test('Status code es 201', () => pm.response.to.have.status(201));",
      'const json = pm.response.json();',
      "pm.environment.set('matriz_pedido_1_id', json.data.id);",
    ]),

    item(
      '[mensaje generico de Hibernate Validator, no personalizado como el resto de la app - @NotNull sin message propio] Rechazo pedido - motivo faltante (null)',
      req('PUT', '/pedidos/comercio/{{matriz_pedido_1_id}}/rechazar', { motivo: null, comentario: null }, 'matriz_comercio_pedido_token'),
      assertFieldMessage(400, 'motivo', 'no debe ser nulo'),
    ),
    item('Rechazo pedido - motivo=OTRO sin comentario (obligatoriedad condicional, debe rechazar)', req('PUT', '/pedidos/comercio/{{matriz_pedido_1_id}}/rechazar', { motivo: 'OTRO', comentario: null }, 'matriz_comercio_pedido_token'), assertTopLevelMessage(400, 'Ingresá un comentario para especificar el motivo del rechazo.')),
    item('Rechazo pedido - motivo=OTRO con comentario string vacio (debe rechazar)', req('PUT', '/pedidos/comercio/{{matriz_pedido_1_id}}/rechazar', { motivo: 'OTRO', comentario: '' }, 'matriz_comercio_pedido_token'), assertTopLevelMessage(400, 'Ingresá un comentario para especificar el motivo del rechazo.')),
    item(
      '[confirma que el backend tambien hace trim, no solo el frontend] Rechazo pedido - motivo=OTRO con comentario solo espacios (debe rechazar)',
      req('PUT', '/pedidos/comercio/{{matriz_pedido_1_id}}/rechazar', { motivo: 'OTRO', comentario: '   ' }, 'matriz_comercio_pedido_token'),
      assertTopLevelMessage(400, 'Ingresá un comentario para especificar el motivo del rechazo.'),
    ),
    item('Rechazo pedido - motivo fuera del enum', req('PUT', '/pedidos/comercio/{{matriz_pedido_1_id}}/rechazar', { motivo: 'INVALIDO', comentario: null }, 'matriz_comercio_pedido_token'), assertTopLevelMessage(400, 'El cuerpo de la solicitud contiene datos con formato inválido')),
    item('Rechazo pedido - motivo=OTRO con comentario valido (debe aceptar, consume pedido 1)', req('PUT', '/pedidos/comercio/{{matriz_pedido_1_id}}/rechazar', { motivo: 'OTRO', comentario: 'Motivo especifico del rechazo' }, 'matriz_comercio_pedido_token'), assertStatusOnly(200)),

    item('Setup - Agregar item al carrito, pedido 2 (matriz pedido)', req('POST', '/carrito/items', { productoId: '{{matriz_pedido_producto_id}}', cantidad: 1 }, 'matriz_pedido_cliente_token'), assertStatusOnly(201)),
    item('Setup - Crear pedido 2 (matriz pedido)', req('POST', '/pedidos/cliente', { tipoEntrega: 'DOMICILIO', direccionId: '{{matriz_pedido_direccion_id}}' }, 'matriz_pedido_cliente_token'), [
      "pm.test('Status code es 201', () => pm.response.to.have.status(201));",
      'const json = pm.response.json();',
      "pm.environment.set('matriz_pedido_2_id', json.data.id);",
    ]),
    item(
      '[mensaje generico de Hibernate Validator, no personalizado como el resto de la app - @Size sin message propio] Rechazo pedido - comentario por encima del limite 501 (debe rechazar)',
      req('PUT', '/pedidos/comercio/{{matriz_pedido_2_id}}/rechazar', { motivo: 'SIN_STOCK', comentario: 'c'.repeat(501) }, 'matriz_comercio_pedido_token'),
      assertFieldMessage(400, 'comentario', 'el tamaño debe estar entre 0 y 500'),
    ),
    item('Rechazo pedido - motivo != OTRO sin comentario (opcional, debe aceptar, consume pedido 2)', req('PUT', '/pedidos/comercio/{{matriz_pedido_2_id}}/rechazar', { motivo: 'SIN_STOCK', comentario: null }, 'matriz_comercio_pedido_token'), assertStatusOnly(200)),
  ],
};

// ---------------------------------------------------------------------------
// Splice into the collection
// ---------------------------------------------------------------------------
const collection = JSON.parse(fs.readFileSync(collectionPath, 'utf8'));
const nuevasFolders = [folder33, folder34, folder35, folder36, folder37, folder38, folder39, folder40, folder41];
const yaExisten = new Set(collection.item.map((f) => f.name));
for (const f of nuevasFolders) {
  if (yaExisten.has(f.name)) {
    const idx = collection.item.findIndex((x) => x.name === f.name);
    collection.item[idx] = f;
  } else {
    collection.item.push(f);
  }
}
fs.writeFileSync(collectionPath, JSON.stringify(collection, null, 2) + '\n', 'utf8');

let total = 0;
for (const f of nuevasFolders) total += f.item.length;
console.log(`OK: ${nuevasFolders.length} folders agregadas/actualizadas, ${total} items en total.`);
console.log('Total items en la coleccion ahora:', collection.item.reduce((acc, f) => acc + (f.item ? f.item.length : 1), 0));
