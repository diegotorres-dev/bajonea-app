import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const collectionPath = path.resolve(__dirname, '../../../postman/Bajonea-MVP.postman_collection.json');

// ---------------------------------------------------------------------------
// Helpers genericos (mismo estilo que build-matriz-comercio-postman.mjs)
// ---------------------------------------------------------------------------

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

function reqGet(urlPath, queryObj, token) {
  const header = [{ key: 'Content-Type', value: 'application/json' }];
  if (token) header.push({ key: 'Authorization', value: `Bearer {{${token}}}` });
  const segments = urlPath.replace(/^\//, '').split('/');
  const queryArr = Object.entries(queryObj || {}).map(([k, v]) => ({ key: k, value: String(v) }));
  const qs = queryArr.map((q) => `${q.key}=${encodeURIComponent(q.value)}`).join('&');
  return {
    method: 'GET',
    header,
    url: {
      raw: '{{base_url}}/' + segments.join('/') + (qs ? '?' + qs : ''),
      host: ['{{base_url}}'],
      path: segments,
      ...(queryArr.length ? { query: queryArr } : {}),
    },
  };
}

function item(name, request, execLines) {
  return {
    name,
    request,
    response: [],
    event: [{ listen: 'test', script: { type: 'text/javascript', exec: execLines } }],
  };
}

function assertStatusOnly(status) {
  return [`pm.test('Status code es ${status}', () => pm.response.to.have.status(${status}));`];
}

function assertCreated201() {
  return assertStatusOnly(201);
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

const s = (n, c = 'x') => c.repeat(n);

function urlDeLongitud(total) {
  const prefix = 'https://res.cloudinary.com/demo/image/upload/v1/';
  const suffix = '.jpg';
  const fillerLen = total - prefix.length - suffix.length;
  return prefix + 'a'.repeat(Math.max(fillerLen, 0)) + suffix;
}

function fechaHaceAnios(anios) {
  const d = new Date();
  d.setUTCFullYear(d.getUTCFullYear() - anios);
  return d.toISOString().slice(0, 10);
}

function hoy() {
  return new Date().toISOString().slice(0, 10);
}

function cuitValido(base10) {
  const multiplicadores = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  let suma = 0;
  for (let i = 0; i < 10; i++) suma += Number(base10[i]) * multiplicadores[i];
  let dv = 11 - (suma % 11);
  if (dv === 11) dv = 0;
  return base10 + String(dv);
}

// Mensajes de complejidad de password (idénticos en RegistroClienteRequestDTO,
// CambioPasswordPerfilRequestDTO y ConfirmarRecuperacionPasswordRequestDTO — los 3 usan
// solo @ValidarPasswordSegura, sin @Size propio desde la corrección del 2026-09-03).
const MSG_PASSWORD_COMPLEJA = 'Debe tener mínimo 8 caracteres, una mayúscula, una minúscula y un número';

// ---------------------------------------------------------------------------
// Payload base de Registro Cliente + contador de unicidad
// ---------------------------------------------------------------------------

let contadorCliente = 0;
function baseClientePayload(overrides = {}) {
  contadorCliente += 1;
  const n = contadorCliente;
  const payload = {
    nombre: 'Cliente',
    apellido: 'Matriz',
    dni: String(30700100 + n),
    fechaNacimiento: '1995-05-20',
    telefono: '+549296470' + String(1000 + n).slice(-4),
    email: `matriz.c22.${n}@bajonea.test`,
    password: 'Aa1Password2026',
    direccion: {
      calle: 'Belgrano',
      numero: '100',
      pisoDepto: null,
      codigoPostal: '9420',
      localidadId: '94008010',
      principal: true,
    },
  };
  return deepMerge(payload, overrides);
}

function registroClienteItem(name, overrides, execLines) {
  return item(name, req('POST', '/auth/registro/cliente', baseClientePayload(overrides)), execLines);
}

// ---------------------------------------------------------------------------
// Folder 22 - Matriz Cliente - Registro (campo por campo) - 54 items
// ---------------------------------------------------------------------------

const folder22 = {
  name: '22 - Matriz Cliente - Registro (campo por campo)',
  item: [
    registroClienteItem('Registro Cliente - nombre vacio', { nombre: '' }, assertFieldMessage(400, 'nombre', 'El nombre es obligatorio')),
    registroClienteItem('Registro Cliente - nombre formato invalido (numeros)', { nombre: '12345' }, assertFieldMessage(400, 'nombre', 'El nombre solo puede contener letras')),
    registroClienteItem('Registro Cliente - nombre formato invalido (caracteres especiales)', { nombre: 'Juan@#$' }, assertFieldMessage(400, 'nombre', 'El nombre solo puede contener letras')),
    registroClienteItem('Registro Cliente - nombre limite superior exacto (100 caracteres, debe aceptar)', { nombre: s(100, 'a') }, assertCreated201()),
    registroClienteItem('Registro Cliente - nombre por encima del limite (101 caracteres, debe rechazar)', { nombre: s(101, 'a') }, assertFieldMessage(400, 'nombre', 'El nombre no puede superar los 100 caracteres')),

    registroClienteItem('Registro Cliente - apellido vacio', { apellido: '' }, assertFieldMessage(400, 'apellido', 'El apellido es obligatorio')),
    registroClienteItem('Registro Cliente - apellido formato invalido (numeros)', { apellido: '12345' }, assertFieldMessage(400, 'apellido', 'El apellido solo puede contener letras')),
    registroClienteItem('Registro Cliente - apellido formato invalido (caracteres especiales)', { apellido: 'Perez@#$' }, assertFieldMessage(400, 'apellido', 'El apellido solo puede contener letras')),
    registroClienteItem('Registro Cliente - apellido limite superior exacto (100 caracteres, debe aceptar)', { apellido: s(100, 'a') }, assertCreated201()),
    registroClienteItem('Registro Cliente - apellido por encima del limite (101 caracteres, debe rechazar)', { apellido: s(101, 'a') }, assertFieldMessage(400, 'apellido', 'El apellido no puede superar los 100 caracteres')),

    registroClienteItem('Registro Cliente - dni vacio', { dni: '' }, assertFieldMessage(400, 'dni', 'El DNI es obligatorio')),
    registroClienteItem('Registro Cliente - dni formato invalido (letras)', { dni: 'abcdefgh' }, assertFieldMessage(400, 'dni', 'El DNI debe tener un formato válido')),
    registroClienteItem('Registro Cliente - dni formato invalido (12 digitos)', { dni: '123456789012' }, assertFieldMessage(400, 'dni', 'El DNI debe tener un formato válido')),
    registroClienteItem('Registro Cliente - dni limite inferior menos uno (6 digitos, debe rechazar)', { dni: '123456' }, assertFieldMessage(400, 'dni', 'El DNI debe tener un formato válido')),
    registroClienteItem('Registro Cliente - dni limite superior mas uno (9 digitos, debe rechazar)', { dni: '123456789' }, assertFieldMessage(400, 'dni', 'El DNI debe tener un formato válido')),
    registroClienteItem('Registro Cliente - dni con separadores (puntos, sanitiza y acepta)', { dni: '30.700.777' }, assertCreated201()),

    registroClienteItem('Registro Cliente - fechaNacimiento vacia (null)', { fechaNacimiento: null }, assertFieldMessage(400, 'fechaNacimiento', 'La fecha de nacimiento es obligatoria')),
    registroClienteItem('Registro Cliente - fechaNacimiento futura (debe rechazar)', { fechaNacimiento: '2099-01-01' }, assertFieldMessage(400, 'fechaNacimiento', 'La fecha ingresada no es válida')),
    item('Registro Cliente - fechaNacimiento hace 121 anios (debe rechazar)', req('POST', '/auth/registro/cliente', baseClientePayload({ fechaNacimiento: fechaHaceAnios(121) })), assertFieldMessage(400, 'fechaNacimiento', 'La fecha ingresada no es válida')),
    item('Registro Cliente - fechaNacimiento hoy mismo (limite exacto, debe aceptar)', req('POST', '/auth/registro/cliente', baseClientePayload({ fechaNacimiento: hoy() })), assertCreated201()),

    registroClienteItem('Registro Cliente - telefono vacio', { telefono: '' }, assertFieldMessage(400, 'telefono', 'El teléfono es obligatorio')),
    registroClienteItem('Registro Cliente - telefono formato invalido (sin prefijo +549)', { telefono: '2964700300' }, assertFieldMessage(400, 'telefono', 'Ingresá un número de teléfono válido (cod. área + número)')),
    registroClienteItem('Registro Cliente - telefono formato invalido (cantidad de digitos incorrecta)', { telefono: '+54929647003' }, assertFieldMessage(400, 'telefono', 'Ingresá un número de teléfono válido (cod. área + número)')),
    registroClienteItem('Registro Cliente - telefono con separadores (espacios y guiones, sanitiza y acepta)', { telefono: '+549 2964-700400' }, assertCreated201()),

    registroClienteItem('Registro Cliente - email vacio', { email: '' }, assertFieldMessage(400, 'email', 'El email es obligatorio')),
    registroClienteItem('Registro Cliente - email formato invalido (sin arroba)', { email: 'sinarrobatest.com' }, assertFieldMessage(400, 'email', 'Ingresá un email válido')),
    registroClienteItem('Registro Cliente - email formato invalido (sin dominio)', { email: 'sindominio@bajonea' }, assertFieldMessage(400, 'email', 'Ingresá un email válido')),
    registroClienteItem('Registro Cliente - email limite superior exacto (254 caracteres, debe aceptar)', { email: s(254 - '@bajonea.test'.length, 'a') + '@bajonea.test' }, assertCreated201()),
    registroClienteItem('Registro Cliente - email por encima del limite (255 caracteres, debe rechazar)', { email: s(255 - '@bajonea.test'.length, 'b') + '@bajonea.test' }, assertFieldMessage(400, 'email', 'El email no puede superar los 254 caracteres')),

    registroClienteItem('Registro Cliente - password vacia', { password: '' }, assertFieldMessage(400, 'password', 'La contraseña es obligatoria')),
    registroClienteItem('Registro Cliente - password formato invalido (sin mayuscula)', { password: 'aa1password' }, assertFieldMessage(400, 'password', MSG_PASSWORD_COMPLEJA)),
    registroClienteItem('Registro Cliente - password formato invalido (sin numero)', { password: 'Aapassword' }, assertFieldMessage(400, 'password', MSG_PASSWORD_COMPLEJA)),
    registroClienteItem('Registro Cliente - password limite inferior menos uno (7 caracteres, debe rechazar)', { password: 'Aa1abcd'.slice(0, 7) }, assertFieldMessage(400, 'password', MSG_PASSWORD_COMPLEJA)),
    registroClienteItem('Registro Cliente - password limite superior exacto (72 caracteres, debe aceptar)', { password: 'Aa1' + s(69, 'a') }, assertCreated201()),
    registroClienteItem('Registro Cliente - password por encima del limite (73 caracteres, debe rechazar)', { password: 'Aa1' + s(70, 'a') }, assertFieldMessage(400, 'password', MSG_PASSWORD_COMPLEJA)),

    registroClienteItem('Registro Cliente - direccion.calle vacia', { direccion: { calle: '' } }, assertFieldMessage(400, 'direccion.calle', 'La calle es obligatoria')),
    registroClienteItem('Registro Cliente - direccion.calle formato invalido (solo caracteres especiales)', { direccion: { calle: '###' } }, assertFieldMessage(400, 'direccion.calle', 'La calle no puede contener solo caracteres especiales')),
    registroClienteItem('Registro Cliente - direccion.calle limite superior exacto (150 caracteres, debe aceptar)', { direccion: { calle: s(150, 'a') } }, assertCreated201()),
    registroClienteItem('Registro Cliente - direccion.calle por encima del limite (151 caracteres, debe rechazar)', { direccion: { calle: s(151, 'a') } }, assertFieldMessage(400, 'direccion.calle', 'La calle no puede superar los 150 caracteres')),

    registroClienteItem('Registro Cliente - direccion.numero vacio', { direccion: { numero: '' } }, assertFieldMessage(400, 'direccion.numero', 'El número es obligatorio')),
    registroClienteItem('Registro Cliente - direccion.numero formato invalido (letras)', { direccion: { numero: 'abc' } }, assertFieldMessage(400, 'direccion.numero', 'Solo se permiten números')),
    registroClienteItem('Registro Cliente - direccion.numero formato invalido (caracteres especiales)', { direccion: { numero: '12-34' } }, assertFieldMessage(400, 'direccion.numero', 'Solo se permiten números')),
    registroClienteItem('Registro Cliente - direccion.numero limite superior exacto (10 digitos, debe aceptar)', { direccion: { numero: '1234567890' } }, assertCreated201()),
    registroClienteItem('Registro Cliente - direccion.numero por encima del limite (11 digitos, debe rechazar)', { direccion: { numero: '12345678901' } }, assertFieldMessage(400, 'direccion.numero', 'El número no puede superar los 10 caracteres')),

    registroClienteItem('Registro Cliente - direccion.pisoDepto formato invalido (solo caracteres especiales)', { direccion: { pisoDepto: '###' } }, assertFieldMessage(400, 'direccion.pisoDepto', 'El piso/departamento no puede contener solo caracteres especiales')),
    registroClienteItem('Registro Cliente - direccion.pisoDepto limite superior exacto (30 caracteres, debe aceptar)', { direccion: { pisoDepto: s(30, 'a') } }, assertCreated201()),
    registroClienteItem('Registro Cliente - direccion.pisoDepto por encima del limite (31 caracteres, debe rechazar)', { direccion: { pisoDepto: s(31, 'a') } }, assertFieldMessage(400, 'direccion.pisoDepto', 'El piso/departamento no puede superar los 30 caracteres')),
    registroClienteItem('Registro Cliente - direccion.pisoDepto vacio (opcional, debe aceptar)', { direccion: { pisoDepto: '' } }, assertCreated201()),

    registroClienteItem('Registro Cliente - direccion.codigoPostal vacio', { direccion: { codigoPostal: '' } }, assertFieldMessage(400, 'direccion.codigoPostal', 'El código postal es obligatorio')),
    registroClienteItem('Registro Cliente - direccion.codigoPostal formato invalido (3 digitos)', { direccion: { codigoPostal: '942' } }, assertFieldMessage(400, 'direccion.codigoPostal', 'Ingresá un código postal válido (4 dígitos o formato CPA)')),
    registroClienteItem('Registro Cliente - direccion.codigoPostal formato invalido (5 digitos)', { direccion: { codigoPostal: '94200' } }, assertFieldMessage(400, 'direccion.codigoPostal', 'Ingresá un código postal válido (4 dígitos o formato CPA)')),
    registroClienteItem('Registro Cliente - direccion.codigoPostal formato CPA valido (8 caracteres, debe aceptar)', { direccion: { codigoPostal: 'C1425AAB' } }, assertCreated201()),

    registroClienteItem('Registro Cliente - direccion.localidadId vacio', { direccion: { localidadId: '' } }, assertFieldMessage(400, 'direccion.localidadId', 'Seleccioná tu localidad')),

    registroClienteItem('Registro Cliente - sin aceptaTerminos (campo solo frontend, backend debe aceptar igual)', {}, assertCreated201()),
  ],
};

// ---------------------------------------------------------------------------
// Folder 23 - Matriz Cliente - Login - 3 items
// ---------------------------------------------------------------------------

const folder23 = {
  name: '23 - Matriz Cliente - Login',
  item: [
    item('Login - email vacio', req('POST', '/auth/login', { email: '', password: 'Aa1Password2026' }), assertFieldMessage(400, 'email', 'No debe estar vacío')),
    item('Login - email formato invalido', req('POST', '/auth/login', { email: 'noesunemail', password: 'Aa1Password2026' }), assertFieldMessage(400, 'email', 'Ingresá un email con formato válido')),
    item('Login - password vacia', req('POST', '/auth/login', { email: 'matriz.login@bajonea.test', password: '' }), assertFieldMessage(400, 'password', 'No debe estar vacío')),
  ],
};

// ---------------------------------------------------------------------------
// Folder 24 - Matriz Cliente - Verificacion de cuenta - 11 items
// ---------------------------------------------------------------------------

const EMAIL_VERIF_REAL = 'postman.matrizverifreal@bajonea.test';

const folder24 = {
  name: '24 - Matriz Cliente - Verificacion de cuenta',
  item: [
    item('Verificar cuenta - email vacio', req('POST', '/auth/verificar', { email: '', codigo: '123456' }), assertFieldMessage(400, 'email', 'No debe estar vacío')),
    item('Verificar cuenta - email formato invalido', req('POST', '/auth/verificar', { email: 'noesemail', codigo: '123456' }), assertFieldMessage(400, 'email', 'Ingresá un email con formato válido')),
    item('Verificar cuenta - codigo vacio', req('POST', '/auth/verificar', { email: 'matriz.verif@bajonea.test', codigo: '' }), assertFieldMessage(400, 'codigo', 'No debe estar vacío')),
    item('Verificar cuenta - codigo formato invalido (letras)', req('POST', '/auth/verificar', { email: 'matriz.verif@bajonea.test', codigo: 'abcdef' }), assertFieldMessage(400, 'codigo', 'El código debe tener 6 dígitos numéricos')),
    item('Verificar cuenta - codigo longitud corta (5 digitos)', req('POST', '/auth/verificar', { email: 'matriz.verif@bajonea.test', codigo: '12345' }), assertFieldMessage(400, 'codigo', 'El código debe tener 6 dígitos numéricos')),
    item('Verificar cuenta - codigo longitud larga (7 digitos)', req('POST', '/auth/verificar', { email: 'matriz.verif@bajonea.test', codigo: '1234567' }), assertFieldMessage(400, 'codigo', 'El código debe tener 6 dígitos numéricos')),
    item('Reenviar verificacion - email vacio', req('POST', '/auth/reenviar-verificacion', { email: '' }), assertFieldMessage(400, 'email', 'No debe estar vacío')),
    item('Reenviar verificacion - email formato invalido', req('POST', '/auth/reenviar-verificacion', { email: 'noesemail' }), assertFieldMessage(400, 'email', 'Ingresá un email con formato válido')),
    item('Setup - Registro Cliente para verificacion real (matriz)', req('POST', '/auth/registro/cliente', baseClientePayload({ email: EMAIL_VERIF_REAL })), assertCreated201()),
    item('Setup - Obtener codigo real de verificacion (matriz)', reqGet('/test/token', { email: EMAIL_VERIF_REAL, tipo: 'VERIFICACION_EMAIL' }), [
      "pm.test('Status code es 200', () => pm.response.to.have.status(200));",
      'const json = pm.response.json();',
      "pm.environment.set('matriz_verif_codigo', json.data);",
    ]),
    item('Verificar cuenta - codigo real de 6 digitos (debe aceptar)', req('POST', '/auth/verificar', { email: EMAIL_VERIF_REAL, codigo: '{{matriz_verif_codigo}}' }), assertStatusOnly(200)),
  ],
};

// ---------------------------------------------------------------------------
// Folder 25 - Matriz Cliente - Recuperacion de password - 18 items
// ---------------------------------------------------------------------------

const EMAIL_RECUP_REAL = 'postman.matrizrecupreal@bajonea.test';

const folder25 = {
  name: '25 - Matriz Cliente - Recuperacion de password',
  item: [
    item('Recuperar password - email vacio', req('POST', '/auth/recuperar-password', { email: '' }), assertFieldMessage(400, 'email', 'No debe estar vacío')),
    item('Recuperar password - email formato invalido', req('POST', '/auth/recuperar-password', { email: 'noesemail' }), assertFieldMessage(400, 'email', 'Ingresá un email con formato válido')),
    item('Recuperar password validar-codigo - email vacio', req('POST', '/auth/recuperar-password/validar-codigo', { email: '', codigo: '123456' }), assertFieldMessage(400, 'email', 'No debe estar vacío')),
    item('Recuperar password validar-codigo - email formato invalido', req('POST', '/auth/recuperar-password/validar-codigo', { email: 'noesemail', codigo: '123456' }), assertFieldMessage(400, 'email', 'Ingresá un email con formato válido')),
    item('Recuperar password validar-codigo - codigo vacio', req('POST', '/auth/recuperar-password/validar-codigo', { email: 'matriz.recup@bajonea.test', codigo: '' }), assertFieldMessage(400, 'codigo', 'No debe estar vacío')),
    item('Recuperar password validar-codigo - codigo formato invalido (letras)', req('POST', '/auth/recuperar-password/validar-codigo', { email: 'matriz.recup@bajonea.test', codigo: 'abcdef' }), assertFieldMessage(400, 'codigo', 'El código debe tener 6 dígitos numéricos')),
    item('Recuperar password validar-codigo - codigo longitud corta (5 digitos)', req('POST', '/auth/recuperar-password/validar-codigo', { email: 'matriz.recup@bajonea.test', codigo: '12345' }), assertFieldMessage(400, 'codigo', 'El código debe tener 6 dígitos numéricos')),
    item('Recuperar password validar-codigo - codigo longitud larga (7 digitos)', req('POST', '/auth/recuperar-password/validar-codigo', { email: 'matriz.recup@bajonea.test', codigo: '1234567' }), assertFieldMessage(400, 'codigo', 'El código debe tener 6 dígitos numéricos')),
    item('Recuperar password confirmar - nuevaPassword vacia', req('POST', '/auth/recuperar-password/confirmar', { email: 'matriz.recup@bajonea.test', codigo: '123456', nuevaPassword: '' }), assertFieldMessage(400, 'nuevaPassword', 'No debe estar vacío')),
    item('Recuperar password confirmar - nuevaPassword sin mayuscula', req('POST', '/auth/recuperar-password/confirmar', { email: 'matriz.recup@bajonea.test', codigo: '123456', nuevaPassword: 'aa1password' }), assertFieldMessage(400, 'nuevaPassword', MSG_PASSWORD_COMPLEJA)),
    item('Recuperar password confirmar - nuevaPassword sin numero', req('POST', '/auth/recuperar-password/confirmar', { email: 'matriz.recup@bajonea.test', codigo: '123456', nuevaPassword: 'Aapassword' }), assertFieldMessage(400, 'nuevaPassword', MSG_PASSWORD_COMPLEJA)),
    item('Recuperar password confirmar - nuevaPassword limite inferior menos uno (7 caracteres)', req('POST', '/auth/recuperar-password/confirmar', { email: 'matriz.recup@bajonea.test', codigo: '123456', nuevaPassword: 'Aa1abcd'.slice(0, 7) }), assertFieldMessage(400, 'nuevaPassword', MSG_PASSWORD_COMPLEJA)),
    item('Recuperar password confirmar - nuevaPassword 73 caracteres (sin @Size explicito, ver mensaje real)', req('POST', '/auth/recuperar-password/confirmar', { email: 'matriz.recup@bajonea.test', codigo: '123456', nuevaPassword: 'Aa1' + s(70, 'a') }), assertFieldMessage(400, 'nuevaPassword', MSG_PASSWORD_COMPLEJA)),
    item('Setup - Registro Cliente para recuperacion real (matriz)', req('POST', '/auth/registro/cliente', baseClientePayload({ email: EMAIL_RECUP_REAL })), assertCreated201()),
    item('Setup - Solicitar recuperacion real (matriz)', req('POST', '/auth/recuperar-password', { email: EMAIL_RECUP_REAL }), assertStatusOnly(200)),
    item('Setup - Obtener codigo real de recuperacion (matriz)', reqGet('/test/token', { email: EMAIL_RECUP_REAL, tipo: 'RECUPERACION_PASSWORD' }), [
      "pm.test('Status code es 200', () => pm.response.to.have.status(200));",
      'const json = pm.response.json();',
      "pm.environment.set('matriz_recup_codigo', json.data);",
    ]),
    item('Recuperar password validar-codigo - codigo real (debe aceptar)', req('POST', '/auth/recuperar-password/validar-codigo', { email: EMAIL_RECUP_REAL, codigo: '{{matriz_recup_codigo}}' }), assertStatusOnly(200)),
    item('Recuperar password confirmar - nuevaPassword limite superior exacto (72 caracteres, flujo real, debe aceptar)', req('POST', '/auth/recuperar-password/confirmar', { email: EMAIL_RECUP_REAL, codigo: '{{matriz_recup_codigo}}', nuevaPassword: 'Aa1' + s(69, 'a') }), assertStatusOnly(200)),
  ],
};

// ---------------------------------------------------------------------------
// Folder 26 - Matriz Cliente - Reactivacion de cuenta - 7 items
// ---------------------------------------------------------------------------

const folder26 = {
  name: '26 - Matriz Cliente - Reactivacion de cuenta',
  item: [
    item('Reactivar cuenta - email vacio', req('POST', '/auth/reactivar-cuenta', { email: '' }), assertFieldMessage(400, 'email', 'No debe estar vacío')),
    item('Reactivar cuenta - email formato invalido', req('POST', '/auth/reactivar-cuenta', { email: 'noesemail' }), assertFieldMessage(400, 'email', 'Ingresá un email con formato válido')),
    item('Reactivar cuenta confirmar - email vacio', req('POST', '/auth/reactivar-cuenta/confirmar', { email: '', codigo: '123456' }), assertFieldMessage(400, 'email', 'No debe estar vacío')),
    item('Reactivar cuenta confirmar - email formato invalido', req('POST', '/auth/reactivar-cuenta/confirmar', { email: 'noesemail', codigo: '123456' }), assertFieldMessage(400, 'email', 'Ingresá un email con formato válido')),
    item('Reactivar cuenta confirmar - codigo vacio', req('POST', '/auth/reactivar-cuenta/confirmar', { email: 'matriz.react@bajonea.test', codigo: '' }), assertFieldMessage(400, 'codigo', 'No debe estar vacío')),
    item('Reactivar cuenta confirmar - codigo formato invalido (letras)', req('POST', '/auth/reactivar-cuenta/confirmar', { email: 'matriz.react@bajonea.test', codigo: 'abcdef' }), assertFieldMessage(400, 'codigo', 'El código debe tener 6 dígitos numéricos')),
    item('Reactivar cuenta confirmar - codigo longitud corta (5 digitos)', req('POST', '/auth/reactivar-cuenta/confirmar', { email: 'matriz.react@bajonea.test', codigo: '12345' }), assertFieldMessage(400, 'codigo', 'El código debe tener 6 dígitos numéricos')),
  ],
};

// ---------------------------------------------------------------------------
// Folder 27 - Matriz Cliente - Perfil (datos personales) - 20 items
// ---------------------------------------------------------------------------

const EMAIL_PERFIL = 'postman.matrizperfil@bajonea.test';

const folder27 = {
  name: '27 - Matriz Cliente - Perfil (datos personales)',
  item: [
    item('Setup - Registro Cliente (matriz perfil)', req('POST', '/auth/registro/cliente', baseClientePayload({ email: EMAIL_PERFIL })), assertCreated201()),
    item('Setup - Obtener codigo real de verificacion (matriz perfil)', reqGet('/test/token', { email: EMAIL_PERFIL, tipo: 'VERIFICACION_EMAIL' }), [
      "pm.test('Status code es 200', () => pm.response.to.have.status(200));",
      'const json = pm.response.json();',
      "pm.environment.set('matriz_perfil_codigo', json.data);",
    ]),
    item('Setup - Verificar cuenta (matriz perfil)', req('POST', '/auth/verificar', { email: EMAIL_PERFIL, codigo: '{{matriz_perfil_codigo}}' }), assertStatusOnly(200)),
    item('Setup - Login (matriz perfil)', req('POST', '/auth/login', { email: EMAIL_PERFIL, password: 'Aa1Password2026' }), [
      "pm.test('Status code es 200', () => pm.response.to.have.status(200));",
      'const json = pm.response.json();',
      "pm.environment.set('matriz_perfil_token', json.data.token);",
    ]),
    item('Setup - GET clientes/perfil, obtener id (matriz perfil)', req('GET', '/clientes/perfil', undefined, 'matriz_perfil_token'), [
      "pm.test('Status code es 200', () => pm.response.to.have.status(200));",
      'const json = pm.response.json();',
      "pm.environment.set('matriz_perfil_usuario_id', json.data.id);",
    ]),
    item('Perfil Cliente - nombre vacio', req('PUT', '/clientes/perfil', { nombre: '', apellido: 'Matriz', telefono: '+5492964999999' }, 'matriz_perfil_token'), assertFieldMessage(400, 'nombre', 'El nombre es obligatorio')),
    item('Perfil Cliente - nombre formato invalido (numeros)', req('PUT', '/clientes/perfil', { nombre: '12345', apellido: 'Matriz', telefono: '+5492964999999' }, 'matriz_perfil_token'), assertFieldMessage(400, 'nombre', 'Debe contener solo letras, espacios y guiones')),
    item('Perfil Cliente - nombre formato invalido (caracteres especiales)', req('PUT', '/clientes/perfil', { nombre: 'Juan@#$', apellido: 'Matriz', telefono: '+5492964999999' }, 'matriz_perfil_token'), assertFieldMessage(400, 'nombre', 'Debe contener solo letras, espacios y guiones')),
    item('Perfil Cliente - nombre limite superior exacto (100 caracteres, debe aceptar)', req('PUT', '/clientes/perfil', { nombre: s(100, 'a'), apellido: 'Matriz', telefono: '+5492964999999' }, 'matriz_perfil_token'), assertStatusOnly(200)),
    item('Perfil Cliente - nombre por encima del limite (101 caracteres, debe rechazar)', req('PUT', '/clientes/perfil', { nombre: s(101, 'a'), apellido: 'Matriz', telefono: '+5492964999999' }, 'matriz_perfil_token'), assertFieldMessage(400, 'nombre', 'El nombre no puede superar los 100 caracteres')),
    item('Perfil Cliente - apellido vacio', req('PUT', '/clientes/perfil', { nombre: 'Cliente', apellido: '', telefono: '+5492964999999' }, 'matriz_perfil_token'), assertFieldMessage(400, 'apellido', 'El apellido es obligatorio')),
    item('Perfil Cliente - apellido formato invalido (numeros)', req('PUT', '/clientes/perfil', { nombre: 'Cliente', apellido: '12345', telefono: '+5492964999999' }, 'matriz_perfil_token'), assertFieldMessage(400, 'apellido', 'Debe contener solo letras, espacios y guiones')),
    item('Perfil Cliente - apellido formato invalido (caracteres especiales)', req('PUT', '/clientes/perfil', { nombre: 'Cliente', apellido: 'Perez@#$', telefono: '+5492964999999' }, 'matriz_perfil_token'), assertFieldMessage(400, 'apellido', 'Debe contener solo letras, espacios y guiones')),
    item('Perfil Cliente - apellido limite superior exacto (100 caracteres, debe aceptar)', req('PUT', '/clientes/perfil', { nombre: 'Cliente', apellido: s(100, 'a'), telefono: '+5492964999999' }, 'matriz_perfil_token'), assertStatusOnly(200)),
    item('Perfil Cliente - apellido por encima del limite (101 caracteres, debe rechazar)', req('PUT', '/clientes/perfil', { nombre: 'Cliente', apellido: s(101, 'a'), telefono: '+5492964999999' }, 'matriz_perfil_token'), assertFieldMessage(400, 'apellido', 'El apellido no puede superar los 100 caracteres')),
    item('Perfil Cliente - telefono vacio', req('PUT', '/clientes/perfil', { nombre: 'Cliente', apellido: 'Matriz', telefono: '' }, 'matriz_perfil_token'), assertFieldMessage(400, 'telefono', 'No debe estar vacío')),
    item('Perfil Cliente - telefono formato invalido (sin prefijo +549)', req('PUT', '/clientes/perfil', { nombre: 'Cliente', apellido: 'Matriz', telefono: '2964999999' }, 'matriz_perfil_token'), assertFieldMessage(400, 'telefono', 'Ingresá un número de teléfono válido (cod. área + número)')),
    item('Perfil Cliente - telefono formato invalido (cantidad de digitos incorrecta)', req('PUT', '/clientes/perfil', { nombre: 'Cliente', apellido: 'Matriz', telefono: '+549296499' }, 'matriz_perfil_token'), assertFieldMessage(400, 'telefono', 'Ingresá un número de teléfono válido (cod. área + número)')),
    item('Perfil Cliente - telefono con separadores (espacios y guiones, sanitiza y acepta)', req('PUT', '/clientes/perfil', { nombre: 'Cliente', apellido: 'Matriz', telefono: '+549 2964-999999' }, 'matriz_perfil_token'), assertStatusOnly(200)),
    item('Perfil Cliente - restaurar valores validos tras la matriz', req('PUT', '/clientes/perfil', { nombre: 'Cliente', apellido: 'Matriz', telefono: '+5492964999999' }, 'matriz_perfil_token'), assertStatusOnly(200)),
  ],
};

// ---------------------------------------------------------------------------
// Folder 28 - Matriz Cliente - Cambio de password desde perfil - 11 items
// ---------------------------------------------------------------------------

const EMAIL_PW72 = 'postman.matrizperfilpw72@bajonea.test';

const folder28 = {
  name: '28 - Matriz Cliente - Cambio de password desde perfil',
  item: [
    item('Cambiar password perfil - passwordActual vacia', req('POST', '/auth/cambiar-password', { passwordActual: '', passwordNueva: 'Aa1NuevaPassword' }, 'matriz_perfil_token'), assertFieldMessage(400, 'passwordActual', 'No debe estar vacío')),
    item('Cambiar password perfil - passwordNueva vacia', req('POST', '/auth/cambiar-password', { passwordActual: 'Aa1Password2026', passwordNueva: '' }, 'matriz_perfil_token'), assertFieldMessage(400, 'passwordNueva', 'No debe estar vacío')),
    item('Cambiar password perfil - passwordNueva sin mayuscula', req('POST', '/auth/cambiar-password', { passwordActual: 'Aa1Password2026', passwordNueva: 'aa1password' }, 'matriz_perfil_token'), assertFieldMessage(400, 'passwordNueva', MSG_PASSWORD_COMPLEJA)),
    item('Cambiar password perfil - passwordNueva sin numero', req('POST', '/auth/cambiar-password', { passwordActual: 'Aa1Password2026', passwordNueva: 'Aapassword' }, 'matriz_perfil_token'), assertFieldMessage(400, 'passwordNueva', MSG_PASSWORD_COMPLEJA)),
    item('Cambiar password perfil - passwordNueva limite inferior menos uno (7 caracteres)', req('POST', '/auth/cambiar-password', { passwordActual: 'Aa1Password2026', passwordNueva: 'Aa1abcd'.slice(0, 7) }, 'matriz_perfil_token'), assertFieldMessage(400, 'passwordNueva', MSG_PASSWORD_COMPLEJA)),
    item('Cambiar password perfil - passwordNueva 73 caracteres (sin @Size explicito en este DTO a diferencia del registro, ver auditoria Parte 3 punto 4 - mensaje generico de complejidad)', req('POST', '/auth/cambiar-password', { passwordActual: 'Aa1Password2026', passwordNueva: 'Aa1' + s(70, 'a') }, 'matriz_perfil_token'), assertFieldMessage(400, 'passwordNueva', MSG_PASSWORD_COMPLEJA)),
    item('Setup - Registro Cliente para password 72 caracteres (matriz perfil)', req('POST', '/auth/registro/cliente', baseClientePayload({ email: EMAIL_PW72 })), assertCreated201()),
    item('Setup - Obtener codigo real de verificacion (matriz pw72)', reqGet('/test/token', { email: EMAIL_PW72, tipo: 'VERIFICACION_EMAIL' }), [
      "pm.test('Status code es 200', () => pm.response.to.have.status(200));",
      'const json = pm.response.json();',
      "pm.environment.set('matriz_pw72_codigo', json.data);",
    ]),
    item('Setup - Verificar cuenta (matriz pw72)', req('POST', '/auth/verificar', { email: EMAIL_PW72, codigo: '{{matriz_pw72_codigo}}' }), assertStatusOnly(200)),
    item('Setup - Login (matriz pw72)', req('POST', '/auth/login', { email: EMAIL_PW72, password: 'Aa1Password2026' }), [
      "pm.test('Status code es 200', () => pm.response.to.have.status(200));",
      'const json = pm.response.json();',
      "pm.environment.set('matriz_pw72_token', json.data.token);",
    ]),
    item('Cambiar password perfil - passwordNueva limite superior exacto (72 caracteres, debe aceptar)', req('POST', '/auth/cambiar-password', { passwordActual: 'Aa1Password2026', passwordNueva: 'Aa1' + s(69, 'a') }, 'matriz_pw72_token'), assertStatusOnly(200)),
  ],
};

// ---------------------------------------------------------------------------
// Folder 29 - Matriz Cliente - Foto de perfil (Usuario) - 12 items
// ---------------------------------------------------------------------------

const EMAIL_PERFIL_AJENO = 'postman.matrizperfilajeno@bajonea.test';

const folder29 = {
  name: '29 - Matriz Cliente - Foto de perfil (Usuario)',
  item: [
    item('Foto perfil Usuario - url vacia', req('PATCH', '/usuarios/{{matriz_perfil_usuario_id}}/foto-perfil', { url: '' }, 'matriz_perfil_token'), assertFieldMessage(400, 'url', 'No debe estar vacío')),
    item('Foto perfil Usuario - url host invalido (no es res.cloudinary.com)', req('PATCH', '/usuarios/{{matriz_perfil_usuario_id}}/foto-perfil', { url: 'https://evil.com/image/upload/v1/x.jpg' }, 'matriz_perfil_token'), assertFieldMessage(400, 'url', 'La URL debe pertenecer al dominio de Cloudinary')),
    item('Foto perfil Usuario - url extension invalida (.pdf)', req('PATCH', '/usuarios/{{matriz_perfil_usuario_id}}/foto-perfil', { url: 'https://res.cloudinary.com/demo/image/upload/v1/x.pdf' }, 'matriz_perfil_token'), assertFieldMessage(400, 'url', 'La URL debe apuntar a un archivo jpg, jpeg, png o webp')),
    item('Foto perfil Usuario - url esquema invalido (http en vez de https)', req('PATCH', '/usuarios/{{matriz_perfil_usuario_id}}/foto-perfil', { url: 'http://res.cloudinary.com/demo/image/upload/v1/x.jpg' }, 'matriz_perfil_token'), assertFieldMessage(400, 'url', 'La URL debe pertenecer al dominio de Cloudinary')),
    item('Foto perfil Usuario - url limite superior exacto (500 caracteres, debe aceptar)', req('PATCH', '/usuarios/{{matriz_perfil_usuario_id}}/foto-perfil', { url: urlDeLongitud(500) }, 'matriz_perfil_token'), assertStatusOnly(200)),
    item('Foto perfil Usuario - url por encima del limite (501 caracteres, debe rechazar con 400)', req('PATCH', '/usuarios/{{matriz_perfil_usuario_id}}/foto-perfil', { url: urlDeLongitud(501) }, 'matriz_perfil_token'), assertFieldMessage(400, 'url', 'La URL de la foto de perfil no puede superar los 500 caracteres')),
    item('Foto perfil Usuario - url valida (debe aceptar)', req('PATCH', '/usuarios/{{matriz_perfil_usuario_id}}/foto-perfil', { url: 'https://res.cloudinary.com/demo/image/upload/v1/matriz-perfil-nueva.jpg' }, 'matriz_perfil_token'), assertStatusOnly(200)),
    item('Setup - Registro Cliente ajeno (matriz perfil, tenant isolation)', req('POST', '/auth/registro/cliente', baseClientePayload({ email: EMAIL_PERFIL_AJENO })), assertCreated201()),
    item('Setup - Obtener codigo real de verificacion (matriz ajeno)', reqGet('/test/token', { email: EMAIL_PERFIL_AJENO, tipo: 'VERIFICACION_EMAIL' }), [
      "pm.test('Status code es 200', () => pm.response.to.have.status(200));",
      'const json = pm.response.json();',
      "pm.environment.set('matriz_perfil_ajeno_codigo', json.data);",
    ]),
    item('Setup - Verificar cuenta (matriz ajeno)', req('POST', '/auth/verificar', { email: EMAIL_PERFIL_AJENO, codigo: '{{matriz_perfil_ajeno_codigo}}' }), assertStatusOnly(200)),
    item('Setup - Login (matriz ajeno)', req('POST', '/auth/login', { email: EMAIL_PERFIL_AJENO, password: 'Aa1Password2026' }), [
      "pm.test('Status code es 200', () => pm.response.to.have.status(200));",
      'const json = pm.response.json();',
      "pm.environment.set('matriz_perfil_ajeno_token', json.data.token);",
    ]),
    item('[negativo] Foto perfil Usuario - otro usuario intenta editar la foto de este id (debe dar 404, no 403)', req('PATCH', '/usuarios/{{matriz_perfil_usuario_id}}/foto-perfil', { url: 'https://res.cloudinary.com/demo/image/upload/v1/intento-ajeno.jpg' }, 'matriz_perfil_ajeno_token'), assertTopLevelMessage(404, 'Usuario no encontrado')),
  ],
};

// ---------------------------------------------------------------------------
// Folder 30 - Matriz Cliente - Carrito (alta y edicion de cantidad) - 29 items
// ---------------------------------------------------------------------------

const EMAIL_CARRITO_CLIENTE = 'postman.matrizcarrito@bajonea.test';
const EMAIL_CARRITO_COMERCIO = 'postman.matrizcomerciocarrito@bajonea.test';
const CUIT_CARRITO_COMERCIO = cuitValido('3079900050');

function baseComercioMatrizPayload(overrides = {}) {
  const payload = {
    fotoPerfilUrl: 'https://res.cloudinary.com/demo/image/upload/v1/matriz-cliente-comercio.jpg',
    razonSocial: 'Comercio Matriz Cliente SRL',
    cuit: CUIT_CARRITO_COMERCIO,
    condicionIva: 'RESPONSABLE_INSCRIPTO',
    tipoSociedad: 'SRL',
    domicilioFiscal: 'Av. San Martin 200, Rio Grande',
    fechaInicioActividades: '2020-01-01',
    nombre: 'Comercio Matriz Cliente',
    descripcion: 'Comercio de prueba para la matriz de Postman de Cliente',
    telefono: '+5492964800100',
    emailContacto: 'contacto.matrizcliente.comercio@bajonea.test',
    tipoComercio: 'RESTAURANTE',
    aceptaDelivery: true,
    aceptaRetiro: true,
    email: EMAIL_CARRITO_COMERCIO,
    password: 'Aa1Password2026',
    direccion: {
      calle: 'Belgrano',
      numero: '300',
      pisoDepto: null,
      codigoPostal: '9420',
      localidadId: '94008010',
      principal: false,
    },
    horarios: ['LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO', 'DOMINGO'].map((diaSemana) => ({
      diaSemana,
      horaApertura: '00:00:00',
      horaCierre: '23:59:59',
    })),
    nombreRepresentante: 'Marcos',
    apellidoRepresentante: 'Sosa',
    dniRepresentante: '30199444',
    telefonoRepresentante: '+5492964800200',
    fechaNacimientoRepresentante: '1985-03-15',
    redesSociales: [{ tipo: 'INSTAGRAM', url: 'https://instagram.com/matriz.cliente.comercio' }],
  };
  return deepMerge(payload, overrides);
}

const folder30 = {
  name: '30 - Matriz Cliente - Carrito (alta y edicion de cantidad)',
  item: [
    item('Setup - Registro Cliente (matriz carrito)', req('POST', '/auth/registro/cliente', baseClientePayload({ email: EMAIL_CARRITO_CLIENTE })), assertCreated201()),
    item('Setup - Obtener codigo verificacion Cliente (matriz carrito)', reqGet('/test/token', { email: EMAIL_CARRITO_CLIENTE, tipo: 'VERIFICACION_EMAIL' }), [
      "pm.test('Status code es 200', () => pm.response.to.have.status(200));",
      'const json = pm.response.json();',
      "pm.environment.set('matriz_carrito_cliente_codigo', json.data);",
    ]),
    item('Setup - Verificar Cliente (matriz carrito)', req('POST', '/auth/verificar', { email: EMAIL_CARRITO_CLIENTE, codigo: '{{matriz_carrito_cliente_codigo}}' }), assertStatusOnly(200)),
    item('Setup - Login Cliente (matriz carrito)', req('POST', '/auth/login', { email: EMAIL_CARRITO_CLIENTE, password: 'Aa1Password2026' }), [
      "pm.test('Status code es 200', () => pm.response.to.have.status(200));",
      'const json = pm.response.json();',
      "pm.environment.set('matriz_carrito_cliente_token', json.data.token);",
    ]),
    item('Setup - Registro Comercio (matriz carrito)', req('POST', '/auth/registro/comercio', baseComercioMatrizPayload()), assertCreated201()),
    item('Setup - Obtener codigo verificacion Comercio (matriz carrito)', reqGet('/test/token', { email: EMAIL_CARRITO_COMERCIO, tipo: 'VERIFICACION_EMAIL' }), [
      "pm.test('Status code es 200', () => pm.response.to.have.status(200));",
      'const json = pm.response.json();',
      "pm.environment.set('matriz_carrito_comercio_codigo', json.data);",
    ]),
    item('Setup - Verificar Comercio (matriz carrito)', req('POST', '/auth/verificar', { email: EMAIL_CARRITO_COMERCIO, codigo: '{{matriz_carrito_comercio_codigo}}' }), assertStatusOnly(200)),
    item('Setup - Login Comercio (matriz carrito)', req('POST', '/auth/login', { email: EMAIL_CARRITO_COMERCIO, password: 'Aa1Password2026' }), [
      "pm.test('Status code es 200', () => pm.response.to.have.status(200));",
      'const json = pm.response.json();',
      "pm.environment.set('matriz_carrito_comercio_token', json.data.token);",
    ]),
    item('Setup - Admin: listar comercios pendientes (matriz carrito)', req('GET', '/administrador/comercios/pendientes', undefined, 'token_admin'), [
      "pm.test('Status code es 200', () => pm.response.to.have.status(200));",
      'const json = pm.response.json();',
      `const comercio = json.data.find((c) => c.emailCuenta === '${EMAIL_CARRITO_COMERCIO}');`,
      "pm.environment.set('matriz_carrito_comercio_id', comercio.id);",
    ]),
    item('Setup - Admin: aprobar Comercio (matriz carrito)', req('PUT', '/administrador/comercios/{{matriz_carrito_comercio_id}}/resolver', { aprobar: true }, 'token_admin'), assertStatusOnly(200)),
    item('Setup - Crear categoria (matriz carrito)', req('POST', '/categorias', { nombre: 'Categoria Matriz Carrito' }, 'token_admin'), [
      "pm.test('Status code es 201', () => pm.response.to.have.status(201));",
      'const json = pm.response.json();',
      "pm.environment.set('matriz_carrito_categoria_id', json.data.id);",
    ]),
    item('Setup - Crear producto (matriz carrito)', req('POST', '/productos', { nombre: 'Producto Matriz Carrito', descripcion: 'Producto de prueba', precio: 1000, categoriaId: '{{matriz_carrito_categoria_id}}', tagIds: [] }, 'matriz_carrito_comercio_token'), [
      "pm.test('Status code es 201', () => pm.response.to.have.status(201));",
      'const json = pm.response.json();',
      "pm.environment.set('matriz_carrito_producto_id', json.data.id);",
    ]),
    item('Carrito alta - cantidad vacia (null)', req('POST', '/carrito/items', { productoId: '{{matriz_carrito_producto_id}}', cantidad: null }, 'matriz_carrito_cliente_token'), assertFieldMessage(400, 'cantidad', 'La cantidad es obligatoria')),
    item('Carrito alta - cantidad limite inferior menos uno (0, debe rechazar)', req('POST', '/carrito/items', { productoId: '{{matriz_carrito_producto_id}}', cantidad: 0 }, 'matriz_carrito_cliente_token'), assertFieldMessage(400, 'cantidad', 'La cantidad mínima es 1')),
    item('Carrito alta - cantidad limite inferior exacto (1, debe aceptar)', req('POST', '/carrito/items', { productoId: '{{matriz_carrito_producto_id}}', cantidad: 1 }, 'matriz_carrito_cliente_token'), assertCreated201()),
    item('Carrito alta - vaciar carrito (cleanup entre casos)', req('DELETE', '/carrito', undefined, 'matriz_carrito_cliente_token'), assertStatusOnly(200)),
    item('Carrito alta - cantidad limite superior exacto (20, debe aceptar)', req('POST', '/carrito/items', { productoId: '{{matriz_carrito_producto_id}}', cantidad: 20 }, 'matriz_carrito_cliente_token'), assertCreated201()),
    item('Carrito alta - vaciar carrito (cleanup entre casos) 2', req('DELETE', '/carrito', undefined, 'matriz_carrito_cliente_token'), assertStatusOnly(200)),
    item('Carrito alta - cantidad limite superior mas uno (21, debe rechazar)', req('POST', '/carrito/items', { productoId: '{{matriz_carrito_producto_id}}', cantidad: 21 }, 'matriz_carrito_cliente_token'), assertFieldMessage(400, 'cantidad', 'La cantidad máxima es 20')),
    item('Carrito alta - productoId vacio (null)', req('POST', '/carrito/items', { productoId: null, cantidad: 1 }, 'matriz_carrito_cliente_token'), assertFieldMessage(400, 'productoId', 'El producto es obligatorio')),
    item('Carrito alta - nota limite superior exacto (255 caracteres, debe aceptar)', req('POST', '/carrito/items', { productoId: '{{matriz_carrito_producto_id}}', cantidad: 1, nota: s(255, 'a') }, 'matriz_carrito_cliente_token'), assertCreated201()),
    item('Carrito alta - vaciar carrito (cleanup entre casos) 3', req('DELETE', '/carrito', undefined, 'matriz_carrito_cliente_token'), assertStatusOnly(200)),
    item('Carrito alta - nota por encima del limite (256 caracteres, debe rechazar)', req('POST', '/carrito/items', { productoId: '{{matriz_carrito_producto_id}}', cantidad: 1, nota: s(256, 'a') }, 'matriz_carrito_cliente_token'), assertFieldMessage(400, 'nota', 'La nota no puede superar los 255 caracteres')),
    item('Carrito alta - nota vacia (opcional, debe aceptar)', req('POST', '/carrito/items', { productoId: '{{matriz_carrito_producto_id}}', cantidad: 1, nota: '' }, 'matriz_carrito_cliente_token'), [
      "pm.test('Status code es 201', () => pm.response.to.have.status(201));",
      'const json = pm.response.json();',
      "pm.environment.set('matriz_carrito_item_id', json.data.items[0].id);",
    ]),
    item('Carrito editar cantidad - vacia (null)', req('PUT', '/carrito/items/{{matriz_carrito_item_id}}', { cantidad: null }, 'matriz_carrito_cliente_token'), assertFieldMessage(400, 'cantidad', 'La cantidad es obligatoria')),
    item('Carrito editar cantidad - limite inferior menos uno (0, debe rechazar)', req('PUT', '/carrito/items/{{matriz_carrito_item_id}}', { cantidad: 0 }, 'matriz_carrito_cliente_token'), assertFieldMessage(400, 'cantidad', 'La cantidad mínima es 1')),
    item('Carrito editar cantidad - limite inferior exacto (1, debe aceptar)', req('PUT', '/carrito/items/{{matriz_carrito_item_id}}', { cantidad: 1 }, 'matriz_carrito_cliente_token'), assertStatusOnly(200)),
    item('Carrito editar cantidad - limite superior exacto (20, debe aceptar)', req('PUT', '/carrito/items/{{matriz_carrito_item_id}}', { cantidad: 20 }, 'matriz_carrito_cliente_token'), assertStatusOnly(200)),
    item('Carrito editar cantidad - limite superior mas uno (21, debe rechazar)', req('PUT', '/carrito/items/{{matriz_carrito_item_id}}', { cantidad: 21 }, 'matriz_carrito_cliente_token'), assertFieldMessage(400, 'cantidad', 'La cantidad máxima es 20')),
  ],
};

// ---------------------------------------------------------------------------
// Folder 31 - Matriz Cliente - Checkout - 15 items
// ---------------------------------------------------------------------------

const EMAIL_CARRITO_COMERCIO2 = 'postman.matrizcomerciosindelivery@bajonea.test';
const CUIT_CARRITO_COMERCIO2 = cuitValido('3079900060');

const folder31 = {
  name: '31 - Matriz Cliente - Checkout',
  item: [
    item('Checkout - tipoEntrega vacio (null)', req('POST', '/pedidos/cliente', { tipoEntrega: null, direccionId: null }, 'matriz_carrito_cliente_token'), assertFieldMessage(400, 'tipoEntrega', 'Debés seleccionar una modalidad de entrega')),
    item('Checkout - tipoEntrega fuera del enum (falla en la deserializacion JSON, antes de Bean Validation)', req('POST', '/pedidos/cliente', { tipoEntrega: 'INVALIDO' }, 'matriz_carrito_cliente_token'), assertTopLevelMessage(400, 'El cuerpo de la solicitud contiene datos con formato inválido')),
    item('Checkout - DOMICILIO sin direccionId (debe rechazar, regla de negocio)', req('POST', '/pedidos/cliente', { tipoEntrega: 'DOMICILIO', direccionId: null }, 'matriz_carrito_cliente_token'), assertTopLevelMessage(409, 'La dirección es obligatoria para entrega a domicilio')),
    item('Checkout - RETIRO valido (debe aceptar, consume el carrito de este bloque)', req('POST', '/pedidos/cliente', { tipoEntrega: 'RETIRO' }, 'matriz_carrito_cliente_token'), assertCreated201()),

    item('Setup - Registro Comercio sin delivery (matriz carrito)', req('POST', '/auth/registro/comercio', baseComercioMatrizPayload({
      email: EMAIL_CARRITO_COMERCIO2,
      cuit: CUIT_CARRITO_COMERCIO2,
      emailContacto: 'contacto.matrizsindelivery@bajonea.test',
      nombre: 'Comercio Matriz Sin Delivery',
      aceptaDelivery: false,
      aceptaRetiro: true,
      dniRepresentante: '30199555',
    })), assertCreated201()),
    item('Setup - Obtener codigo verificacion Comercio sin delivery (matriz carrito)', reqGet('/test/token', { email: EMAIL_CARRITO_COMERCIO2, tipo: 'VERIFICACION_EMAIL' }), [
      "pm.test('Status code es 200', () => pm.response.to.have.status(200));",
      'const json = pm.response.json();',
      "pm.environment.set('matriz_carrito_comercio2_codigo', json.data);",
    ]),
    item('Setup - Verificar Comercio sin delivery (matriz carrito)', req('POST', '/auth/verificar', { email: EMAIL_CARRITO_COMERCIO2, codigo: '{{matriz_carrito_comercio2_codigo}}' }), assertStatusOnly(200)),
    item('Setup - Login Comercio sin delivery (matriz carrito)', req('POST', '/auth/login', { email: EMAIL_CARRITO_COMERCIO2, password: 'Aa1Password2026' }), [
      "pm.test('Status code es 200', () => pm.response.to.have.status(200));",
      'const json = pm.response.json();',
      "pm.environment.set('matriz_carrito_comercio2_token', json.data.token);",
    ]),
    item('Setup - Admin: listar comercios pendientes (comercio sin delivery)', req('GET', '/administrador/comercios/pendientes', undefined, 'token_admin'), [
      "pm.test('Status code es 200', () => pm.response.to.have.status(200));",
      'const json = pm.response.json();',
      `const comercio = json.data.find((c) => c.emailCuenta === '${EMAIL_CARRITO_COMERCIO2}');`,
      "pm.environment.set('matriz_carrito_comercio2_id', comercio.id);",
    ]),
    item('Setup - Admin: aprobar Comercio sin delivery (matriz carrito)', req('PUT', '/administrador/comercios/{{matriz_carrito_comercio2_id}}/resolver', { aprobar: true }, 'token_admin'), assertStatusOnly(200)),
    item('Setup - Crear producto en comercio sin delivery (matriz carrito)', req('POST', '/productos', { nombre: 'Producto Sin Delivery', descripcion: 'Producto de prueba', precio: 1000, categoriaId: '{{matriz_carrito_categoria_id}}', tagIds: [] }, 'matriz_carrito_comercio2_token'), [
      "pm.test('Status code es 201', () => pm.response.to.have.status(201));",
      'const json = pm.response.json();',
      "pm.environment.set('matriz_carrito_producto2_id', json.data.id);",
    ]),
    item('Setup - Agregar producto de comercio sin delivery al carrito', req('POST', '/carrito/items', { productoId: '{{matriz_carrito_producto2_id}}', cantidad: 1 }, 'matriz_carrito_cliente_token'), assertCreated201()),
    item('Setup - Obtener direccionId del Cliente (matriz carrito)', req('GET', '/clientes/perfil', undefined, 'matriz_carrito_cliente_token'), [
      "pm.test('Status code es 200', () => pm.response.to.have.status(200));",
      'const json = pm.response.json();',
      "pm.environment.set('matriz_carrito_direccion_id', json.data.direccion.id);",
    ]),
    item('[negocio] Checkout - DOMICILIO contra un comercio que no ofrece delivery (debe rechazar, regla de negocio)', req('POST', '/pedidos/cliente', { tipoEntrega: 'DOMICILIO', direccionId: '{{matriz_carrito_direccion_id}}' }, 'matriz_carrito_cliente_token'), assertTopLevelMessage(409, 'El comercio no ofrece entrega a domicilio')),
    item('Cleanup - vaciar carrito final (matriz carrito)', req('DELETE', '/carrito', undefined, 'matriz_carrito_cliente_token'), assertStatusOnly(200)),
  ],
};

// ---------------------------------------------------------------------------
// Folder 32 - Matriz Cliente - Explorar (busqueda y filtros del catalogo) - 7 items
// ---------------------------------------------------------------------------

const folder32 = {
  name: '32 - Matriz Cliente - Explorar (busqueda y filtros del catalogo)',
  item: [
    item('Explorar - q vacio (sin parametro, debe devolver el catalogo completo)', reqGet('/catalogo/productos', {}), [
      "pm.test('Status code es 200', () => pm.response.to.have.status(200));",
      'const json = pm.response.json();',
      "pm.test('productos es un array', () => pm.expect(json.data.productos).to.be.an('array'));",
    ]),
    item("Explorar - q con caracteres especiales / SQL-injection-like (debe tratarse como texto literal, no romper)", reqGet('/catalogo/productos', { q: "' OR '1'='1" }), assertStatusOnly(200)),
    item('Explorar - q con script tag (XSS-like, debe tratarse como texto literal)', reqGet('/catalogo/productos', { q: '<script>alert(1)</script>' }), assertStatusOnly(200)),
    item('Explorar - categoriaId inexistente (debe devolver vacio, no error)', reqGet('/catalogo/productos', { categoriaId: 999999 }), [
      "pm.test('Status code es 200', () => pm.response.to.have.status(200));",
      'const json = pm.response.json();',
      "pm.test('productos vacio', () => pm.expect(json.data.productos).to.have.lengthOf(0));",
    ]),
    item('Explorar - tagIds inexistente (debe devolver vacio, no error)', reqGet('/catalogo/productos', { tagIds: 999999 }), [
      "pm.test('Status code es 200', () => pm.response.to.have.status(200));",
      'const json = pm.response.json();',
      "pm.test('productos vacio', () => pm.expect(json.data.productos).to.have.lengthOf(0));",
    ]),
    item('Explorar - pagina fuera de rango (999, debe devolver vacio sin error)', reqGet('/catalogo/productos', { pagina: 999 }), [
      "pm.test('Status code es 200', () => pm.response.to.have.status(200));",
      'const json = pm.response.json();',
      "pm.test('productos vacio', () => pm.expect(json.data.productos).to.have.lengthOf(0));",
    ]),
    item('Explorar - pagina negativa (degrada a pagina 1, no rompe)', reqGet('/catalogo/productos', { pagina: -1 }), assertStatusOnly(200)),
  ],
};

// ---------------------------------------------------------------------------
// Splice into the collection
// ---------------------------------------------------------------------------

const collection = JSON.parse(fs.readFileSync(collectionPath, 'utf8'));
const nuevasFolders = [folder22, folder23, folder24, folder25, folder26, folder27, folder28, folder29, folder30, folder31, folder32];
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
