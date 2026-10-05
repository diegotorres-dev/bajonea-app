import { execFileSync } from 'node:child_process';

const B = process.env.E2E_API_BASE_URL || 'http://localhost:8080/api/v1';
const LOC = process.env.LOC;
const CLOUD = process.env.CLOUDINARY_CLOUD_NAME;
const ROUNDS = Number(process.env.ROUNDS || 12);
const ADMIN = { nombreUsuario: 'adminbajonea', password: process.env.ADMIN_PASSWORD || 'PostmanAdmin123' };
const sql = (q) => execFileSync('C:/xampp/mysql/bin/mysql.exe', ['-u', 'root', '-N', '-B', 'bajonea_test', '-e', q]).toString().trim();

if (!LOC || !CLOUD) {
  console.error('Faltan LOC (id de localidad) y/o CLOUDINARY_CLOUD_NAME');
  process.exit(1);
}

let seq = Date.now() % 100000;
const uniq = () => `${Date.now().toString(36)}${(seq++).toString(36)}`.slice(-10);
const esperar = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
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

async function verificarYLoguear(email, nombreUsuario, password) {
  const codigo = (await call('GET', `/test/token-verificacion?email=${email}`)).json.data;
  const v = await call('POST', '/auth/verificar', null, { email, codigo });
  if (v.status !== 200) throw new Error('verificar ' + JSON.stringify(v));
  const login = await call('POST', '/auth/login', null, { nombreUsuario, password });
  if (login.status !== 200) throw new Error('login ' + JSON.stringify(login));
  return login.json.data;
}

async function nuevoDueno() {
  const u = uniq();
  const email = `stressc3.${u}@bajonea.test`;
  const nombreUsuario = `sg${u}`.slice(0, 20);
  const r = await call('POST', '/auth/registro/comercio', null, {
    razonSocial: `StressC3 ${u} SRL`,
    cuit: cuit(),
    condicionIva: 'RESPONSABLE_INSCRIPTO',
    tipoSociedad: 'SRL',
    domicilioFiscal: 'Av. Stress 1',
    fechaInicioActividades: '2020-01-01',
    nombre: `StressC3 ${u}`,
    descripcion: 'x',
    telefono: tel(),
    emailContacto: email,
    tipoComercio: 'RESTAURANTE',
    aceptaDelivery: false,
    aceptaRetiro: true,
    nombreUsuario,
    email,
    password: 'Testing123',
    direccion: { calle: 'Stress', numero: '1', pisoDepto: null, codigoPostal: '9420', localidadId: LOC, principal: false },
    horarios: horariosTodosLosDias,
    nombreRepresentante: 'Rep',
    apellidoRepresentante: 'Stress',
    dniRepresentante: dni(),
    telefonoRepresentante: tel(),
    fechaNacimientoRepresentante: '1985-03-15',
    fotoPerfilUrl: `https://res.cloudinary.com/${CLOUD}/image/upload/v1/comercios/pre-registro/stress.png`,
    redesSociales: [{ tipo: 'INSTAGRAM', url: `https://instagram.com/sg${u}` }],
  });
  if (r.status !== 201) throw new Error('registro dueno ' + JSON.stringify(r));
  const login = await verificarYLoguear(email, nombreUsuario, 'Testing123');
  return { email, nombreUsuario, password: 'Testing123', token: login.token, duenoId: login.usuario.id };
}

async function duenoAprobado(admin, conMercadoPago) {
  const d = await nuevoDueno();
  const pendiente = (await call('GET', '/administrador/comercios/pendientes', admin)).json.data.find((c) => c.emailCuenta === d.email);
  if (conMercadoPago) {
    const v = await call('POST', `/test/duenos/${d.duenoId}/mercadopago-simulada`);
    if (v.status !== 200) throw new Error('vincular ' + JSON.stringify(v));
  }
  const aprobado = await call('PUT', `/administrador/comercios/${pendiente.id}/resolver`, admin, { aprobar: true });
  if (aprobado.status !== 200) throw new Error('aprobar ' + JSON.stringify(aprobado));
  d.comercioId = pendiente.id;
  return d;
}



function nuevoRegistro() {
  const problemas = [];
  return {
    problemas,
    registrar5xx: (etiqueta, r) => {
      if (r.status >= 500) problemas.push(`${etiqueta}: ${r.status} ${JSON.stringify(r.json)}`);
    },
    exigir: (condicion, mensaje) => {
      if (!condicion) problemas.push(mensaje);
    },
  };
}

const contar = (mapa, clave) => mapa.set(clave, (mapa.get(clave) || 0) + 1);
const resumir = (mapa) => Object.fromEntries([...mapa.entries()].sort());

const estadoDe = (comercioId) => sql(`SELECT estado FROM comercio WHERE id = ${comercioId};`);
const estadoUsuarioDe = (usuarioId) => sql(`SELECT estado FROM usuario WHERE id = ${usuarioId};`);
const filasEstadoDe = (comercioId) => {
  const salida = sql(`SELECT CONCAT(estado_origen, '>', estado_destino) FROM historial_estado_comercio WHERE comercio_id = ${comercioId} ORDER BY id;`);
  return salida === '' ? [] : salida.split(/\r?\n/);
};

function cadenaIncoherente(comercioId) {
  const filas = filasEstadoDe(comercioId).map((f) => f.split('>'));
  const errores = [];
  filas.forEach(([origen], i) => {
    if (i > 0 && origen !== filas[i - 1][1]) errores.push(`fila ${i + 1} sale de ${origen} y la anterior termino en ${filas[i - 1][1]} (${filasEstadoDe(comercioId).join(', ')})`);
  });
  if (filas.length && filas[filas.length - 1][1] !== estadoDe(comercioId)) {
    errores.push(`la ultima fila termina en ${filas[filas.length - 1][1]} y el comercio esta en ${estadoDe(comercioId)}`);
  }
  return errores;
}

const aptoVentaConDuenoBloqueado = () =>
  sql(
    `SELECT COUNT(*) FROM comercio c JOIN usuario u ON u.id = c.dueno_id ` +
      `WHERE c.estado = 'APTO_VENTA' AND u.estado = 'BLOQUEADO' AND u.email LIKE 'stressc3.%';`,
  );

const loginIncorrecto = (dueno) => call('POST', '/auth/login', null, { nombreUsuario: dueno.nombreUsuario, password: 'ClaveIncorrecta1' });
const clonar = async (comercioId, estado) => {
  const r = await call('POST', `/test/comercios/${comercioId}/clonar?nombre=${encodeURIComponent(`Clon ${uniq()}`)}&estado=${estado}`);
  if (r.status !== 201) throw new Error('clonar ' + JSON.stringify(r));
  return r.json.data;
};
const aprobar = (admin, comercioId) => call('PUT', `/administrador/comercios/${comercioId}/resolver`, admin, { aprobar: true });
const vincular = (dueno) => call('POST', `/test/duenos/${dueno.duenoId}/mercadopago-simulada`);

async function recuperar(dueno, nuevaPassword) {
  await call('POST', '/auth/recuperar-password', null, { email: dueno.email });
  const codigo = (await call('GET', `/test/token?email=${dueno.email}&tipo=RECUPERACION_PASSWORD`)).json.data;
  const r = await call('POST', '/auth/recuperar-password/confirmar', null, { email: dueno.email, codigo, nuevaPassword });
  if (r.status !== 200) throw new Error('recuperar ' + JSON.stringify(r));
  dueno.password = nuevaPassword;
}

function bloqueoEsperado(respuestas, problemas, etiqueta, esperados401) {
  const codigos = respuestas.map((r) => r.status).sort().join(',');
  const cantidad401 = respuestas.filter((r) => r.status === 401).length;
  if (cantidad401 !== esperados401) problemas.push(`${etiqueta}: ${cantidad401} respuestas 401 en vez de ${esperados401} (${codigos})`);
  if (respuestas.some((r) => r.status !== 401 && r.status !== 409)) problemas.push(`${etiqueta}: login incorrecto con codigos ${codigos}`);
}

async function escenario1(admin) {
  console.log('--- (1) tres confirmaciones simultaneas del mismo codigo de reactivacion ---');
  const { problemas, registrar5xx, exigir } = nuevoRegistro();
  const resumen = new Map();
  for (let ronda = 1; ronda <= ROUNDS; ronda++) {
    const dueno = await duenoAprobado(admin, true);
    const comercios = [await clonar(dueno.comercioId, 'INACTIVO'), await clonar(dueno.comercioId, 'INACTIVO')];
    sql(`UPDATE usuario SET estado = 'INACTIVO' WHERE id = ${dueno.duenoId};`);
    const solicitud = await call('POST', '/auth/reactivar-cuenta', null, { email: dueno.email });
    exigir(solicitud.status === 200, `ronda ${ronda}: solicitar reactivacion dio ${solicitud.status}`);
    const codigo = (await call('GET', `/test/token?email=${dueno.email}&tipo=REACTIVACION_CUENTA`)).json.data;

    const confirmaciones = await Promise.all(
      Array.from({ length: 3 }, () => esperar(aleatorio(25)).then(() => call('POST', '/auth/reactivar-cuenta/confirmar', null, { email: dueno.email, codigo }))),
    );
    confirmaciones.forEach((r) => {
      registrar5xx(`ronda ${ronda} confirmar`, r);
      contar(resumen, `confirmar:${r.status}`);
    });
    const codigos = confirmaciones.map((r) => r.status).sort().join(',');
    exigir(confirmaciones.filter((r) => r.status === 200).length === 1, `ronda ${ronda}: confirmaciones ${codigos}, se esperaba exactamente una 200`);
    exigir(confirmaciones.filter((r) => r.status === 401).length === 2, `ronda ${ronda}: confirmaciones ${codigos}, se esperaban dos 401`);
    exigir(estadoUsuarioDe(dueno.duenoId) === 'ACTIVO', `ronda ${ronda}: usuario ${estadoUsuarioDe(dueno.duenoId)}`);
    comercios.forEach((id) => {
      exigir(estadoDe(id) === 'APTO_VENTA', `ronda ${ronda}: comercio ${id} quedo ${estadoDe(id)}`);
      exigir(filasEstadoDe(id).join(',') === 'INACTIVO>APTO_VENTA', `ronda ${ronda}: comercio ${id} con historial ${filasEstadoDe(id).join(', ')}`);
    });
    console.log(`ronda ${ronda}: confirmaciones=${codigos} comercios=${comercios.map(estadoDe).join('/')} filas=${comercios.map((id) => filasEstadoDe(id).length).join('/')}`);
  }
  console.log('Resumen (1):', resumir(resumen));
  return problemas;
}

async function escenario2(admin) {
  console.log('--- (2) aprobacion de comercios pendientes contra el bloqueo del mismo Dueno ---');
  const { problemas, registrar5xx, exigir } = nuevoRegistro();
  const resumen = new Map();
  for (let ronda = 1; ronda <= ROUNDS; ronda++) {
    const dueno = await duenoAprobado(admin, true);
    const pendientes = [await clonar(dueno.comercioId, 'PENDIENTE'), await clonar(dueno.comercioId, 'PENDIENTE')];
    sql(`UPDATE usuario SET intentos_fallidos = 2 WHERE id = ${dueno.duenoId};`);
    const tareas = pendientes.map((id) => esperar(aleatorio(70)).then(() => aprobar(admin, id)).then((r) => ({ tipo: 'aprobar', r })));
    for (let i = 0; i < 2; i++) tareas.push(esperar(aleatorio(70)).then(() => loginIncorrecto(dueno)).then((r) => ({ tipo: 'login', r })));
    const resultados = await Promise.all(tareas);
    resultados.forEach(({ tipo, r }) => {
      registrar5xx(`ronda ${ronda} ${tipo}`, r);
      contar(resumen, `${tipo}:${r.status}`);
    });
    bloqueoEsperado(resultados.filter(({ tipo }) => tipo === 'login').map(({ r }) => r), problemas, `ronda ${ronda}`, 1);
    const aprobaciones = resultados.filter(({ tipo }) => tipo === 'aprobar').map(({ r }) => r.status);
    exigir(aprobaciones.every((s) => s === 200), `ronda ${ronda}: aprobar dio ${aprobaciones}`);
    exigir(estadoUsuarioDe(dueno.duenoId) === 'BLOQUEADO', `ronda ${ronda}: usuario ${estadoUsuarioDe(dueno.duenoId)}`);
    [dueno.comercioId, ...pendientes].forEach((id) => {
      exigir(estadoDe(id) === 'CERRADO_TEMPORALMENTE', `ronda ${ronda}: comercio ${id} quedo ${estadoDe(id)} con el Dueno bloqueado`);
      cadenaIncoherente(id).forEach((e) => problemas.push(`ronda ${ronda}: comercio ${id}: ${e}`));
    });
    exigir(aptoVentaConDuenoBloqueado() === '0', `ronda ${ronda}: quedo un comercio APTO_VENTA con el Dueno bloqueado`);
    console.log(`ronda ${ronda}: aprobar=${aprobaciones} estados=${[dueno.comercioId, ...pendientes].map(estadoDe).join('/')}`);
    await recuperar(dueno, 'Testing456');
    const tras = [dueno.comercioId, ...pendientes].map(estadoDe);
    exigir(tras.every((e) => e === 'APTO_VENTA'), `ronda ${ronda}: tras recuperar ${tras}`);
    [dueno.comercioId, ...pendientes].forEach((id) => cadenaIncoherente(id).forEach((e) => problemas.push(`ronda ${ronda} (tras recuperar): comercio ${id}: ${e}`)));
  }
  console.log('Resumen (2):', resumir(resumen));
  return problemas;
}

async function escenario3(admin) {
  console.log('--- (3) vinculacion de Mercado Pago contra el bloqueo del mismo Dueno ---');
  const { problemas, registrar5xx, exigir } = nuevoRegistro();
  const resumen = new Map();
  for (let ronda = 1; ronda <= ROUNDS; ronda++) {
    const dueno = await duenoAprobado(admin, false);
    const comercios = [dueno.comercioId, await clonar(dueno.comercioId, 'APROBADO'), await clonar(dueno.comercioId, 'APROBADO')];
    sql(`UPDATE usuario SET intentos_fallidos = 2 WHERE id = ${dueno.duenoId};`);
    const tareas = [esperar(aleatorio(70)).then(() => vincular(dueno)).then((r) => ({ tipo: 'vincular', r }))];
    for (let i = 0; i < 2; i++) tareas.push(esperar(aleatorio(70)).then(() => loginIncorrecto(dueno)).then((r) => ({ tipo: 'login', r })));
    const resultados = await Promise.all(tareas);
    resultados.forEach(({ tipo, r }) => {
      registrar5xx(`ronda ${ronda} ${tipo}`, r);
      contar(resumen, `${tipo}:${r.status}`);
    });
    bloqueoEsperado(resultados.filter(({ tipo }) => tipo === 'login').map(({ r }) => r), problemas, `ronda ${ronda}`, 1);
    const vinculacion = resultados.find(({ tipo }) => tipo === 'vincular').r.status;
    exigir(vinculacion === 200, `ronda ${ronda}: vincular dio ${vinculacion}`);
    exigir(estadoUsuarioDe(dueno.duenoId) === 'BLOQUEADO', `ronda ${ronda}: usuario ${estadoUsuarioDe(dueno.duenoId)}`);
    exigir(sql(`SELECT activa FROM cuenta_mercado_pago WHERE dueno_id = ${dueno.duenoId};`) === '1', `ronda ${ronda}: la cuenta no quedo activa`);
    comercios.forEach((id) => {
      exigir(estadoDe(id) === 'CERRADO_TEMPORALMENTE', `ronda ${ronda}: comercio ${id} quedo ${estadoDe(id)} con el Dueno bloqueado`);
      cadenaIncoherente(id).forEach((e) => problemas.push(`ronda ${ronda}: comercio ${id}: ${e}`));
    });
    exigir(aptoVentaConDuenoBloqueado() === '0', `ronda ${ronda}: quedo un comercio APTO_VENTA con el Dueno bloqueado`);
    console.log(`ronda ${ronda}: vincular=${vinculacion} estados=${comercios.map(estadoDe).join('/')}`);
    await recuperar(dueno, 'Testing456');
    const tras = comercios.map(estadoDe);
    exigir(tras.every((e) => e === 'APTO_VENTA'), `ronda ${ronda}: tras recuperar ${tras}`);
    comercios.forEach((id) => cadenaIncoherente(id).forEach((e) => problemas.push(`ronda ${ronda} (tras recuperar): comercio ${id}: ${e}`)));
  }
  console.log('Resumen (3):', resumir(resumen));
  return problemas;
}

async function escenario4(admin) {
  console.log('--- (4) aprobacion, vinculacion y bloqueo a la vez sobre el mismo Dueno ---');
  const { problemas, registrar5xx, exigir } = nuevoRegistro();
  const resumen = new Map();
  for (let ronda = 1; ronda <= ROUNDS; ronda++) {
    const dueno = await duenoAprobado(admin, false);
    const pendientes = [await clonar(dueno.comercioId, 'PENDIENTE'), await clonar(dueno.comercioId, 'PENDIENTE')];
    const comercios = [dueno.comercioId, ...pendientes];
    sql(`UPDATE usuario SET intentos_fallidos = 2 WHERE id = ${dueno.duenoId};`);
    const tareas = [
      esperar(aleatorio(80)).then(() => vincular(dueno)).then((r) => ({ tipo: 'vincular', r })),
      ...pendientes.map((id) => esperar(aleatorio(80)).then(() => aprobar(admin, id)).then((r) => ({ tipo: 'aprobar', r }))),
    ];
    for (let i = 0; i < 2; i++) tareas.push(esperar(aleatorio(80)).then(() => loginIncorrecto(dueno)).then((r) => ({ tipo: 'login', r })));
    const resultados = await Promise.all(tareas);
    resultados.forEach(({ tipo, r }) => {
      registrar5xx(`ronda ${ronda} ${tipo}`, r);
      contar(resumen, `${tipo}:${r.status}`);
    });
    bloqueoEsperado(resultados.filter(({ tipo }) => tipo === 'login').map(({ r }) => r), problemas, `ronda ${ronda}`, 1);
    const otros = resultados.filter(({ tipo }) => tipo !== 'login').map(({ tipo, r }) => `${tipo}:${r.status}`);
    exigir(otros.every((x) => x.endsWith(':200')), `ronda ${ronda}: respuestas ${otros}`);
    exigir(estadoUsuarioDe(dueno.duenoId) === 'BLOQUEADO', `ronda ${ronda}: usuario ${estadoUsuarioDe(dueno.duenoId)}`);
    exigir(aptoVentaConDuenoBloqueado() === '0', `ronda ${ronda}: quedo un comercio APTO_VENTA con el Dueno bloqueado`);
    comercios.forEach((id) => {
      exigir(['CERRADO_TEMPORALMENTE', 'APROBADO'].includes(estadoDe(id)), `ronda ${ronda}: comercio ${id} quedo ${estadoDe(id)}`);
      cadenaIncoherente(id).forEach((e) => problemas.push(`ronda ${ronda}: comercio ${id}: ${e}`));
    });
    console.log(`ronda ${ronda}: ${otros.join(',')} estados=${comercios.map(estadoDe).join('/')}`);
    await recuperar(dueno, 'Testing456');
    const tras = comercios.map(estadoDe);
    const cuentaActiva = sql(`SELECT activa FROM cuenta_mercado_pago WHERE dueno_id = ${dueno.duenoId};`) === '1';
    exigir(cuentaActiva, `ronda ${ronda}: la cuenta no quedo activa`);
    exigir(tras.every((e) => e === 'APTO_VENTA' || e === 'APROBADO'), `ronda ${ronda}: tras recuperar ${tras}`);
    comercios.forEach((id) => cadenaIncoherente(id).forEach((e) => problemas.push(`ronda ${ronda} (tras recuperar): comercio ${id}: ${e}`)));
  }
  console.log('Resumen (4):', resumir(resumen));
  return problemas;
}

async function escenario5(admin) {
  console.log('--- (5) control: aprobaciones simultaneas con el Dueno activo no cambian ---');
  const { problemas, registrar5xx, exigir } = nuevoRegistro();
  const resumen = new Map();
  for (let ronda = 1; ronda <= ROUNDS; ronda++) {
    const dueno = await duenoAprobado(admin, true);
    const pendientes = [await clonar(dueno.comercioId, 'PENDIENTE'), await clonar(dueno.comercioId, 'PENDIENTE'), await clonar(dueno.comercioId, 'PENDIENTE')];
    const resultados = await Promise.all(pendientes.map((id) => esperar(aleatorio(40)).then(() => aprobar(admin, id))));
    resultados.forEach((r) => {
      registrar5xx(`ronda ${ronda} aprobar`, r);
      contar(resumen, `aprobar:${r.status}`);
    });
    exigir(resultados.every((r) => r.status === 200), `ronda ${ronda}: aprobar dio ${resultados.map((r) => r.status)}`);
    pendientes.forEach((id) => {
      exigir(estadoDe(id) === 'APTO_VENTA', `ronda ${ronda}: comercio ${id} quedo ${estadoDe(id)}`);
      exigir(filasEstadoDe(id).join(',') === 'PENDIENTE>APROBADO,APROBADO>APTO_VENTA', `ronda ${ronda}: comercio ${id} con historial ${filasEstadoDe(id).join(', ')}`);
    });
    console.log(`ronda ${ronda}: aprobar=${resultados.map((r) => r.status)} estados=${pendientes.map(estadoDe).join('/')}`);
  }
  console.log('Resumen (5):', resumir(resumen));
  return problemas;
}

async function main() {
  const admin = (await call('POST', '/auth/login', null, ADMIN)).json.data.token;
  const solo = process.env.ESCENARIO;
  const todos = [];
  if (!solo || solo === '1') todos.push(...(await escenario1(admin)));
  if (!solo || solo === '2') todos.push(...(await escenario2(admin)));
  if (!solo || solo === '3') todos.push(...(await escenario3(admin)));
  if (!solo || solo === '4') todos.push(...(await escenario4(admin)));
  if (!solo || solo === '5') todos.push(...(await escenario5(admin)));
  console.log(todos.length ? 'PROBLEMAS:\n' + todos.join('\n') : 'SIN PROBLEMAS (sin 5xx, sin inconsistencias)');
  if (todos.length) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
