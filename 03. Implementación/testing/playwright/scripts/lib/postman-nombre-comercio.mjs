import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const aqui = path.dirname(fileURLToPath(import.meta.url));
export const collectionPath = path.resolve(aqui, '../../../../postman/Bajonea-MVP.postman_collection.json');
export const environmentPath = path.resolve(aqui, '../../../../postman/Bajonea-Local.postman_environment.json');

export const HEADER = 'X-Comercio-Id';
export const MENSAJE_NOMBRE_EN_USO = 'Ya existe un comercio con ese nombre. Elegí otro.';
export const PASSWORD = 'Testing123';

export function cuitValido(base10) {
  const mult = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  let suma = 0;
  for (let i = 0; i < 10; i += 1) suma += Number(base10[i]) * mult[i];
  let dv = 11 - (suma % 11);
  if (dv === 11) dv = 0;
  return dv === 10 ? null : `${base10}${dv}`;
}

export function crearGenerador({ prefijoNumerico, prefijoEmail, prefijoUsuario }) {
  let contador = 0;
  return function identidad() {
    let cuit = null;
    while (cuit === null) {
      contador += 1;
      cuit = cuitValido(`${prefijoNumerico}${String(contador).padStart(6, '0')}`);
    }
    const n = String(contador).padStart(4, '0');
    return { n, cuit, dni: `${prefijoNumerico}${n}`, email: `${prefijoEmail}.${n}@bajonea.test`, usuario: `${prefijoUsuario}${n}` };
  };
}

export function req(method, urlPath, { body, token, query, headers } = {}) {
  const header = [];
  if (token) header.push({ key: 'Authorization', value: `Bearer {{${token}}}` });
  if (body !== undefined) header.push({ key: 'Content-Type', value: 'application/json' });
  for (const [key, value] of Object.entries(headers || {})) header.push({ key, value });
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
    const crudo = typeof body === 'string' ? body : JSON.stringify(body, null, 2);
    request.body = { mode: 'raw', raw: crudo, options: { raw: { language: 'json' } } };
  }
  return request;
}

export function item(name, request, testLines = []) {
  const event = [];
  if (testLines.length) event.push({ listen: 'test', script: { type: 'text/javascript', exec: testLines } });
  return { name, request, response: [], event };
}

export const status = (codigo) => `pm.test('Status code es ${codigo}', () => pm.response.to.have.status(${codigo}));`;
export const guardar = (variable, expr) => `pm.environment.set('${variable}', ${expr});`;
export const mensajeEs = (texto) =>
  `pm.test('El mensaje es exacto', () => pm.expect(pm.response.json().mensaje).to.eql(${JSON.stringify(texto)}));`;
export const mensajeNoEs = (texto) =>
  `pm.test('El mensaje no es el del nombre', () => pm.expect(pm.response.json().mensaje).to.not.eql(${JSON.stringify(texto)}));`;
export const dataEs = (objeto) =>
  `pm.test('data es exactamente ${JSON.stringify(objeto).replace(/'/g, '')}', () => pm.expect(pm.response.json().data).to.eql(${JSON.stringify(objeto)}));`;

export const horarios = [{ diaSemana: 'LUNES', horaApertura: '09:00:00', horaCierre: '18:00:00' }];
export const direccion = (localidadId, numero = '800') => ({ calle: 'Belgrano', numero, pisoDepto: null, codigoPostal: '9420', localidadId, principal: true });

export function cuerpoComercio(id, prefijoTexto, cambios = {}) {
  return {
    fotoPerfilUrl: `https://res.cloudinary.com/demo/image/upload/postman-${prefijoTexto.replace(/\s/g, '-')}-${id.n}.jpg`,
    aceptaTerminos: true,
    cuit: id.cuit,
    domicilioFiscal: `Direccion fiscal ${prefijoTexto} ${id.n}`,
    nombre: `Local ${prefijoTexto} ${id.n}`,
    descripcion: 'Comercio generado por la coleccion de Postman (nombre unico)',
    telefono: '+5492964555444',
    tipoComercio: 'RESTAURANTE',
    aceptaDelivery: false,
    aceptaRetiro: true,
    nombreUsuario: id.usuario,
    email: id.email,
    password: PASSWORD,
    direccion: direccion('{{localidad_id}}'),
    horarios,
    redesSociales: [{ tipo: 'INSTAGRAM', url: `instagram.com/${prefijoTexto.replace(/\s/g, '')}${id.n}` }],
    nombreRepresentante: 'Carlos',
    apellidoRepresentante: 'Sanchez',
    dniRepresentante: id.dni,
    telefonoRepresentante: '+5492964701103',
    fechaNacimientoRepresentante: '1988-04-04',
    ...cambios,
  };
}

export function sinClaves(objeto, ...claves) {
  const copia = { ...objeto };
  for (const clave of claves) delete copia[clave];
  return copia;
}

export function loginAdmin(items) {
  items.push(
    item('Login Administrador (sesion propia de esta carpeta)', req('POST', '/auth/login', { body: { nombreUsuario: '{{admin_usuario}}', password: '{{admin_password}}' } }), [
      status(200),
      guardar('token_admin', 'pm.response.json().data.token'),
    ]),
  );
}

export function duenoConNombre(items, identidad, { tag, prefijoVar, prefijoTexto, nombre, resolucion, claves }) {
  const id = identidad();
  const v = (sufijo) => `${prefijoVar}_${tag}_${sufijo}`;
  claves.push(v('codigo'), v('com'), v('token'));
  items.push(
    item(`[${tag}] Registro del Dueño (${resolucion})`, req('POST', '/auth/registro/comercio', { body: cuerpoComercio(id, prefijoTexto, { nombre }) }), [status(201)]),
    item(`[${tag}] Codigo de verificacion`, req('GET', '/test/token-verificacion', { query: `email=${id.email}` }), [status(200), guardar(v('codigo'), 'pm.response.json().data')]),
    item(`[${tag}] Verificar cuenta`, req('POST', '/auth/verificar', { body: { email: id.email, codigo: `{{${v('codigo')}}}` } }), [status(200)]),
    item(`[${tag}] El Administrador busca el comercio pendiente`, req('GET', '/administrador/comercios/pendientes', { token: 'token_admin' }), [
      status(200),
      `const c = pm.response.json().data.find((x) => x.emailCuenta === ${JSON.stringify(id.email)});`,
      "pm.test('El comercio esta pendiente', () => pm.expect(c).to.exist);",
      guardar(v('com'), 'c.id'),
    ]),
  );
  if (resolucion !== 'pendiente') {
    const cuerpo =
      resolucion === 'aprobar'
        ? { aprobar: true }
        : resolucion === 'rechazar'
          ? { aprobar: false, motivo: 'Rechazo de fixture del nombre unico' }
          : { aprobar: false, motivo: 'Rechazo definitivo de fixture del nombre unico', definitivo: true };
    items.push(
      item(`[${tag}] El Administrador resuelve el comercio (${resolucion})`, req('PUT', `/administrador/comercios/{{${v('com')}}}/resolver`, { token: 'token_admin', body: cuerpo }), [status(200)]),
    );
  }
  items.push(
    item(`[${tag}] Login del Dueño`, req('POST', '/auth/login', { body: { nombreUsuario: id.usuario, password: PASSWORD } }), [
      status(200),
      guardar(v('token'), 'pm.response.json().data.token'),
    ]),
  );
  return { id, token: v('token'), com: v('com'), nombre };
}

export function publicarCarpeta(nombreCarpeta, items, claves) {
  const folder = { name: nombreCarpeta, item: items };
  const collection = JSON.parse(fs.readFileSync(collectionPath, 'utf8'));
  const idx = collection.item.findIndex((f) => f.name === nombreCarpeta);
  if (idx >= 0) collection.item[idx] = folder;
  else collection.item.push(folder);
  fs.writeFileSync(collectionPath, JSON.stringify(collection, null, 2) + '\n', 'utf8');

  const environment = JSON.parse(fs.readFileSync(environmentPath, 'utf8'));
  const existentes = new Set(environment.values.map((x) => x.key));
  for (const key of claves) {
    if (!existentes.has(key)) environment.values.push({ key, value: '', type: 'default', enabled: true });
  }
  fs.writeFileSync(environmentPath, JSON.stringify(environment, null, 2) + '\n', 'utf8');

  console.log(`OK: carpeta "${nombreCarpeta}" con ${folder.item.length} requests.`);
}
