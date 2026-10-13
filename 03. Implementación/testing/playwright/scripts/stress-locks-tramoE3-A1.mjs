import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';

const B = process.env.E2E_API_BASE_URL || 'http://localhost:8080/api/v1';
const LOC = process.env.LOC;
const ROUNDS = Number(process.env.ROUNDS || 8);
const ADMIN = { nombreUsuario: process.env.ADMIN_USUARIO || 'adminbajonea', password: process.env.ADMIN_PASSWORD };
const LOG_BACKEND = process.env.BACKEND_LOG || `${process.env.TEMP || '/tmp'}/backend-test.log`;
const sql = (q) => execFileSync('C:/xampp/mysql/bin/mysql.exe', ['-u', 'root', '-N', '-B', 'bajonea_test', '-e', q]).toString().trim();

if (!LOC || !ADMIN.password) {
  console.error('Faltan LOC (id de localidad de Rio Grande) y/o ADMIN_PASSWORD (contrasena actual del administrador)');
  process.exit(1);
}

let seq = Date.now() % 100000;
const uniq = () => `${Date.now().toString(36)}${(seq++).toString(36)}`.slice(-10);
const aleatorio = (max) => Math.floor(Math.random() * max);

async function call(method, path, token, body, headers = {}) {
  const res = await fetch(B + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  return { status: res.status, json };
}

function cuit() {
  const m = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  for (;;) {
    const base = '30' + String(Math.floor(10_000_000 + Math.random() * 89_999_999));
    let s = 0;
    for (let i = 0; i < 10; i++) s += Number(base[i]) * m[i];
    let dv = 11 - (s % 11);
    if (dv === 11) dv = 0;
    if (dv === 10) continue;
    return base + dv;
  }
}
const dni = () => String(Math.floor(20_000_000 + Math.random() * 20_000_000));
const tel = () => `+549296${Math.floor(1_000_000 + Math.random() * 8_999_999)}`;
const horariosTodosLosDias = ['LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO', 'DOMINGO'].map((diaSemana) => ({
  diaSemana,
  horaApertura: '00:00',
  horaCierre: '23:59',
}));

async function nuevoDueno() {
  const u = uniq();
  const email = `stressa1.${u}@bajonea.test`;
  const nombreUsuario = `sa${u}`.slice(0, 20);
  const password = `Pw${uniq()}x`;
  const r = await call('POST', '/auth/registro/comercio', null, {
    razonSocial: `StressA1 ${u} SRL`,
    cuit: cuit(),
    condicionIva: 'RESPONSABLE_INSCRIPTO',
    tipoSociedad: 'SRL',
    domicilioFiscal: 'Av. Stress 1',
    fechaInicioActividades: '2020-01-01',
    nombre: `StressA1 ${u}`,
    descripcion: 'x',
    telefono: tel(),
    emailContacto: email,
    tipoComercio: 'RESTAURANTE',
    aceptaDelivery: false,
    aceptaRetiro: true,
    nombreUsuario,
    email,
    password,
    direccion: { calle: 'Stress', numero: '1', pisoDepto: null, codigoPostal: '9420', localidadId: LOC, principal: false },
    horarios: horariosTodosLosDias,
    nombreRepresentante: 'Rep',
    apellidoRepresentante: 'Stress',
    dniRepresentante: dni(),
    telefonoRepresentante: tel(),
    fechaNacimientoRepresentante: '1985-03-15',
    fotoPerfilUrl: 'https://res.cloudinary.com/demo/image/upload/v1/comercios/pre-registro/stress.png',
    redesSociales: [{ tipo: 'INSTAGRAM', url: `https://instagram.com/sa${u}` }],
  });
  if (r.status !== 201) throw new Error('registro dueno ' + JSON.stringify(r));
  const codigo = (await call('GET', `/test/token-verificacion?email=${email}`)).json.data;
  const v = await call('POST', '/auth/verificar', null, { email, codigo });
  if (v.status !== 200) throw new Error('verificar ' + JSON.stringify(v));
  const login = await call('POST', '/auth/login', null, { nombreUsuario, password });
  if (login.status !== 200) throw new Error('login ' + JSON.stringify(login));
  return { email, nombreUsuario, password, token: login.json.data.token, duenoId: login.json.data.usuario.id };
}

const cabecera = (dueno) => ({ 'X-Comercio-Id': String(dueno.comercioId) });

async function duenoOperativo(admin, categoriaId) {
  const d = await nuevoDueno();
  const pendiente = (await call('GET', '/administrador/comercios/pendientes', admin)).json.data.find((c) => c.emailCuenta === d.email);
  const aprobado = await call('PUT', `/administrador/comercios/${pendiente.id}/resolver`, admin, { aprobar: true });
  if (aprobado.status !== 200) throw new Error('aprobar ' + JSON.stringify(aprobado));
  d.comercioId = pendiente.id;
  const apto = await call('PUT', `/test/comercios/${d.comercioId}/apto-venta`);
  if (apto.status !== 200) throw new Error('apto-venta ' + JSON.stringify(apto));
  const firma = await call('POST', '/comercios/perfil/foto/firma', d.token, {}, cabecera(d));
  const nube = firma.json.data.cloudName;
  const producto = await call('POST', '/productos', d.token, { nombre: `Producto ${uniq()}`, precio: 1500, categoriaId }, cabecera(d));
  if (producto.status !== 201) throw new Error('producto ' + JSON.stringify(producto));
  d.productoId = producto.json.data.id;
  const imagen = await call('POST', `/productos/${d.productoId}/imagenes`, d.token,
    { url: `https://res.cloudinary.com/${nube}/image/upload/v1/productos/${d.comercioId}/${d.productoId}/s.png`, orden: 0, esPrincipal: true }, cabecera(d));
  if (imagen.status !== 201) throw new Error('imagen ' + JSON.stringify(imagen));
  d.imagenId = imagen.json.data.id;
  return d;
}

const editarPerfil = (d) => call('PUT', '/comercios/perfil', d.token, {
  nombre: `Stress A1 ${uniq()}`, descripcion: 'x', telefono: tel(), emailContacto: d.email, aceptaDelivery: false, aceptaRetiro: true,
}, cabecera(d));
const editarProducto = (d) => call('PUT', `/productos/${d.productoId}`, d.token,
  { nombre: `Producto ${uniq()}`, precio: 1000 + aleatorio(9000), categoriaId: d.categoriaId }, cabecera(d));
const cambiarEstado = (d, estado) => call('PATCH', `/productos/${d.productoId}/estado`, d.token, { estado }, cabecera(d));
const reordenar = (d) => call('PATCH', `/productos/${d.productoId}/imagenes/${d.imagenId}/orden`, d.token, { orden: aleatorio(3) }, cabecera(d));
const cerrar = (d) => call('PUT', '/comercios/cerrar', d.token, {}, cabecera(d));
const abrir = (d) => call('PUT', '/comercios/abrir', d.token, {}, cabecera(d));
const actividad = (d, query = '') => call('GET', `/comercios/equipo/actividad${query}`, d.token, undefined, cabecera(d));
const loginIncorrecto = (d) => call('POST', '/auth/login', null, { nombreUsuario: d.nombreUsuario, password: 'ClaveIncorrecta1' });

const ACEPTABLES = new Set([200, 401, 404, 409]);
const aceptable = (r) => ACEPTABLES.has(r.status);
const contar = (resumen, clave) => {
  resumen[clave] = (resumen[clave] || 0) + 1;
};
const resumir = (resumen) => Object.entries(resumen).sort().map(([k, n]) => `${k}=${n}`).join(' ');

function revisarFilas(d, nombre, ok200) {
  const problemas = [];
  const filas = sql(`SELECT usuario_id, actor_rol, entidad_tipo, accion, fecha_hora IS NULL FROM historial_edicion_comercio WHERE comercio_id = ${d.comercioId};`)
    .split('\n').filter(Boolean).map((l) => l.split('\t'));
  for (const [usuario, rol, tipo, accion, sinFecha] of filas) {
    if (Number(usuario) !== d.duenoId || rol !== 'DUENO' || !tipo || !accion || sinFecha === '1') problemas.push(`${nombre}: fila inconsistente ${[usuario, rol, tipo, accion, sinFecha]}`);
  }
  const preparacion = 2;
  if (filas.length > ok200 + preparacion) problemas.push(`${nombre}: hay ${filas.length} filas de historial y solo ${ok200} escrituras respondieron 200 (más las ${preparacion} del alta del producto y su imagen)`);
  return problemas;
}

async function escenarioEdicionesContraElBloqueoDeCuenta(admin, categoriaId) {
  const problemas = [];
  const resumen = {};
  for (let ronda = 1; ronda <= ROUNDS; ronda++) {
    const d = await duenoOperativo(admin, categoriaId);
    d.categoriaId = categoriaId;
    const tareas = [
      ...Array.from({ length: 3 }, () => loginIncorrecto(d).then((r) => ({ tipo: 'login', r }))),
      ...Array.from({ length: 2 }, () => editarPerfil(d).then((r) => ({ tipo: 'perfil', r }))),
      ...Array.from({ length: 2 }, () => editarProducto(d).then((r) => ({ tipo: 'producto', r }))),
      cambiarEstado(d, 'AGOTADO').then((r) => ({ tipo: 'estado', r })),
      reordenar(d).then((r) => ({ tipo: 'orden', r })),
    ];
    const resultados = await Promise.all(tareas);
    let ok200 = 0;
    for (const { tipo, r } of resultados) {
      contar(resumen, `${tipo}:${r.status}`);
      if (tipo !== 'login' && r.status === 200) ok200++;
      if (r.status >= 500) problemas.push(`ronda ${ronda}: ${tipo} dio ${r.status} ${JSON.stringify(r.json)}`);
      else if (tipo !== 'login' && !aceptable(r)) problemas.push(`ronda ${ronda}: ${tipo} dio ${r.status}`);
    }
    problemas.push(...revisarFilas(d, `ronda ${ronda}`, ok200));
  }
  console.log('Resumen (1, ediciones contra el bloqueo de cuenta):', resumir(resumen));
  return problemas;
}

async function escenarioMuchasEscriturasSobreLoMismo(admin, categoriaId) {
  const problemas = [];
  const resumen = {};
  for (let ronda = 1; ronda <= ROUNDS; ronda++) {
    const d = await duenoOperativo(admin, categoriaId);
    d.categoriaId = categoriaId;
    const tareas = [
      ...Array.from({ length: 6 }, () => editarProducto(d).then((r) => ({ tipo: 'producto', r }))),
      ...Array.from({ length: 4 }, () => editarPerfil(d).then((r) => ({ tipo: 'perfil', r }))),
      ...Array.from({ length: 3 }, (_, i) => cambiarEstado(d, i % 2 ? 'DISPONIBLE' : 'AGOTADO').then((r) => ({ tipo: 'estado', r }))),
      ...Array.from({ length: 3 }, () => reordenar(d).then((r) => ({ tipo: 'orden', r }))),
    ];
    const resultados = await Promise.all(tareas);
    let ok200 = 0;
    for (const { tipo, r } of resultados) {
      contar(resumen, `${tipo}:${r.status}`);
      if (r.status === 200) ok200++;
      if (r.status >= 500) problemas.push(`ronda ${ronda}: ${tipo} dio ${r.status} ${JSON.stringify(r.json)}`);
      else if (!aceptable(r)) problemas.push(`ronda ${ronda}: ${tipo} dio ${r.status}`);
    }
    problemas.push(...revisarFilas(d, `ronda ${ronda}`, ok200));
  }
  console.log('Resumen (2, muchas escrituras sobre lo mismo):', resumir(resumen));
  return problemas;
}

async function escenarioLecturaDeActividadDuranteEscrituras(admin, categoriaId) {
  const problemas = [];
  const resumen = {};
  for (let ronda = 1; ronda <= ROUNDS; ronda++) {
    const d = await duenoOperativo(admin, categoriaId);
    d.categoriaId = categoriaId;
    await Promise.all(Array.from({ length: 4 }, () => editarProducto(d)));
    const tareas = [
      ...Array.from({ length: 6 }, () => editarProducto(d).then((r) => ({ tipo: 'producto', r }))),
      ...Array.from({ length: 3 }, () => editarPerfil(d).then((r) => ({ tipo: 'perfil', r }))),
      ...Array.from({ length: 6 }, async () => {
        const primera = await actividad(d, '?limite=3');
        if (primera.status !== 200) return { tipo: 'actividad', r: primera };
        const cursor = primera.json.data.siguienteCursor;
        const segunda = cursor ? await actividad(d, `?limite=3&cursor=${encodeURIComponent(cursor)}`) : primera;
        const ids = [...primera.json.data.items, ...(segunda === primera ? [] : segunda.json?.data?.items ?? [])].map((i) => i.id);
        if (new Set(ids).size !== ids.length) problemas.push(`ronda ${ronda}: la actividad repitio filas entre dos paginas: ${ids}`);
        return { tipo: 'actividad', r: segunda };
      }),
    ];
    const resultados = await Promise.all(tareas);
    for (const { tipo, r } of resultados) {
      contar(resumen, `${tipo}:${r.status}`);
      if (r.status >= 500) problemas.push(`ronda ${ronda}: ${tipo} dio ${r.status} ${JSON.stringify(r.json)}`);
      else if (tipo === 'actividad' && r.status !== 200) problemas.push(`ronda ${ronda}: la actividad dio ${r.status}`);
    }
  }
  console.log('Resumen (3, lectura de actividad durante escrituras):', resumir(resumen));
  return problemas;
}

async function escenarioCierreContraEdiciones(admin, categoriaId) {
  const problemas = [];
  const resumen = {};
  for (let ronda = 1; ronda <= ROUNDS; ronda++) {
    const d = await duenoOperativo(admin, categoriaId);
    d.categoriaId = categoriaId;
    const tareas = [
      ...Array.from({ length: 3 }, () => cerrar(d).then((r) => ({ tipo: 'cerrar', r }))),
      ...Array.from({ length: 3 }, () => abrir(d).then((r) => ({ tipo: 'abrir', r }))),
      ...Array.from({ length: 4 }, () => editarPerfil(d).then((r) => ({ tipo: 'perfil', r }))),
      ...Array.from({ length: 3 }, () => editarProducto(d).then((r) => ({ tipo: 'producto', r }))),
    ];
    const resultados = await Promise.all(tareas);
    let ok200 = 0;
    for (const { tipo, r } of resultados) {
      contar(resumen, `${tipo}:${r.status}`);
      if (['perfil', 'producto'].includes(tipo) && r.status === 200) ok200++;
      if (r.status >= 500) problemas.push(`ronda ${ronda}: ${tipo} dio ${r.status} ${JSON.stringify(r.json)}`);
      else if (!aceptable(r)) problemas.push(`ronda ${ronda}: ${tipo} dio ${r.status}`);
    }
    problemas.push(...revisarFilas(d, `ronda ${ronda}`, ok200));
    const cierres = Number(sql(`SELECT COUNT(*) FROM historial_cierre_comercio WHERE comercio_id = ${d.comercioId};`));
    const bandera = sql(`SELECT cerrado_manualmente FROM comercio WHERE id = ${d.comercioId};`);
    const ultima = sql(`SELECT accion FROM historial_cierre_comercio WHERE comercio_id = ${d.comercioId} ORDER BY id DESC LIMIT 1;`);
    if (cierres > 0 && ((ultima === 'CERRADO') !== (bandera === '1'))) problemas.push(`ronda ${ronda}: la bandera de cierre (${bandera}) no coincide con la ultima fila del historial (${ultima})`);
  }
  console.log('Resumen (4, cierre y apertura contra ediciones):', resumir(resumen));
  return problemas;
}

const bytesDelLog = () => (existsSync(LOG_BACKEND) ? statSync(LOG_BACKEND).size : 0);

function revisarElLog(desde) {
  if (!existsSync(LOG_BACKEND)) return [`no se encontro el log del backend en ${LOG_BACKEND}: revisar a mano que no tenga "Deadlock found" ni "Lock wait timeout"`];
  const texto = readFileSync(LOG_BACKEND).subarray(desde).toString('utf8');
  const problemas = [];
  const deadlocks = (texto.match(/Deadlock found/g) || []).length;
  const timeouts = (texto.match(/Lock wait timeout/g) || []).length;
  if (deadlocks) problemas.push(`el log del backend tiene ${deadlocks} "Deadlock found"`);
  if (timeouts) problemas.push(`el log del backend tiene ${timeouts} "Lock wait timeout"`);
  return problemas;
}

async function main() {
  const inicioLog = bytesDelLog();
  const login = await call('POST', '/auth/login', null, ADMIN);
  if (login.status !== 200) throw new Error('login admin ' + JSON.stringify(login));
  const admin = login.json.data.token;
  const r = await call('POST', '/categorias', admin, { nombre: `StressA1 ${uniq()}` });
  if (r.status !== 201) throw new Error('categoria ' + JSON.stringify(r));
  const categoriaId = r.json.data.id;
  const solo = process.env.ESCENARIO;
  const escenarios = [
    escenarioEdicionesContraElBloqueoDeCuenta,
    escenarioMuchasEscriturasSobreLoMismo,
    escenarioLecturaDeActividadDuranteEscrituras,
    escenarioCierreContraEdiciones,
  ];
  const todos = [];
  for (let i = 0; i < escenarios.length; i++) {
    if (!solo || solo === String(i + 1)) todos.push(...(await escenarios[i](admin, categoriaId)));
  }
  todos.push(...revisarElLog(inicioLog));
  console.log(todos.length ? 'PROBLEMAS:\n' + todos.join('\n') : 'SIN PROBLEMAS (sin 5xx, sin filas de historial inconsistentes, sin Deadlock ni Lock wait timeout en el log)');
  if (todos.length) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
