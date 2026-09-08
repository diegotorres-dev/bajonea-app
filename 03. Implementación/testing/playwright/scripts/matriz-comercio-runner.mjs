const BASE = 'http://localhost:8080/api/v1';

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

async function post(path, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* non-json body */ }
  return { status: res.status, json, text };
}

async function put(path, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, { method: 'PUT', headers, body: JSON.stringify(body) });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* non-json body */ }
  return { status: res.status, json, text };
}

async function patch(path, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, { method: 'PATCH', headers, body: JSON.stringify(body) });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* non-json body */ }
  return { status: res.status, json, text };
}

async function del(path, token) {
  const headers = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, { method: 'DELETE', headers });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* non-json body */ }
  return { status: res.status, json, text };
}

async function get(path, token) {
  const headers = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, { method: 'GET', headers });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* non-json body */ }
  return { status: res.status, json, text };
}

async function runCase(name, path, method, body, token, expected) {
  const fn = method === 'POST' ? post : method === 'PUT' ? put : method === 'PATCH' ? patch : method === 'DELETE' ? () => del(path, token) : () => get(path, token);
  const result = method === 'DELETE' || method === 'GET' ? await fn() : await fn(path, body, token);
  const record = { name, path, method, body, status: result.status, response: result.json ?? result.text, expected: expected ?? null };
  console.log(JSON.stringify(record));
  return record;
}

async function registrarYVerificarYLogin(payload, tipoUsuario = 'comercio') {
  const reg = await post('/auth/registro/comercio', payload);
  if (reg.status !== 201) {
    console.error('FALLO REGISTRO SETUP', JSON.stringify(reg));
    throw new Error('registro fallo');
  }
  const email = payload.email;
  const tokenRes = await get(`/test/token?email=${encodeURIComponent(email)}&tipo=VERIFICACION_EMAIL`);
  if (tokenRes.status !== 200) {
    console.error('FALLO OBTENER TOKEN VERIF', JSON.stringify(tokenRes));
    throw new Error('token verif fallo');
  }
  const codigo = tokenRes.json.data;
  const verif = await post('/auth/verificar', { email, codigo });
  if (verif.status !== 200) {
    console.error('FALLO VERIFICAR', JSON.stringify(verif));
    throw new Error('verificacion fallo');
  }
  const login = await post('/auth/login', { email, password: payload.password });
  if (login.status !== 200) {
    console.error('FALLO LOGIN', JSON.stringify(login));
    throw new Error('login fallo');
  }
  return { token: login.json.data.token, usuarioId: login.json.data.usuario.id };
}

export { baseComercioPayload, post, put, patch, del, get, runCase, registrarYVerificarYLogin };
