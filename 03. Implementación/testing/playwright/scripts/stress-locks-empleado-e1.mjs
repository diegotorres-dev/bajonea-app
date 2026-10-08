import { execFileSync } from 'node:child_process';

const B = process.env.E2E_API_BASE_URL || 'http://localhost:8080/api/v1';
const ROUNDS = Number(process.env.ROUNDS || 10);
const ADMIN = { nombreUsuario: 'adminbajonea', password: process.env.ADMIN_PASSWORD };
const sql = (q) => execFileSync('C:/xampp/mysql/bin/mysql.exe', ['-u', 'root', '-N', '-B', 'bajonea_test', '-e', q]).toString().trim();

if (!ADMIN.password) {
  console.error('Falta ADMIN_PASSWORD (contraseña actual de admin@bajonea.ar en bajonea_test)');
  process.exit(1);
}

let seq = Date.now() % 100000;
const uniq = () => `${Date.now().toString(36)}${(seq++).toString(36)}`.slice(-10);
const esperar = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const aleatorio = (max) => Math.floor(Math.random() * max);
const clavePropia = () => `Pw${uniq()}Aa1`;

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
let dniSeq = 40_000_000 + Math.floor(Math.random() * 30_000_000);
const dni = () => String(dniSeq++);
const tel = () => `+549296${Math.floor(1_000_000 + Math.random() * 8_999_999)}`;
const horariosTodosLosDias = ['LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO', 'DOMINGO'].map((diaSemana) => ({
  diaSemana,
  horaApertura: '00:00',
  horaCierre: '23:59',
}));

let LOC;
async function resolverLocalidad() {
  const provincias = (await call('GET', '/geografia/provincias')).json.data;
  const provincia = provincias.find((p) => p.nombre.startsWith('Tierra del Fuego'));
  const localidades = (await call('GET', `/geografia/localidades?provinciaId=${encodeURIComponent(provincia.id)}`)).json.data;
  const localidad = localidades.find((l) => /r[ií]o grande/i.test(l.nombre));
  return localidad.id;
}

const direccion = () => ({ calle: 'Stress', numero: '1', pisoDepto: null, codigoPostal: '9420', localidadId: LOC, principal: true });

async function nuevoDueno() {
  const u = uniq();
  const email = `stresse1.${u}@bajonea.test`;
  const nombreUsuario = `se${u}`.slice(0, 20);
  const password = clavePropia();
  const r = await call('POST', '/auth/registro/comercio', null, {
    razonSocial: `StressE1 ${u} SRL`,
    cuit: cuit(),
    condicionIva: 'RESPONSABLE_INSCRIPTO',
    tipoSociedad: 'SRL',
    domicilioFiscal: 'Av. Stress 1',
    fechaInicioActividades: '2020-01-01',
    nombre: `StressE1 ${u}`,
    descripcion: 'x',
    telefono: tel(),
    emailContacto: email,
    tipoComercio: 'RESTAURANTE',
    aceptaDelivery: false,
    aceptaRetiro: true,
    nombreUsuario,
    email,
    password,
    direccion: { ...direccion(), principal: false },
    horarios: horariosTodosLosDias,
    nombreRepresentante: 'Rep',
    apellidoRepresentante: 'Stress',
    dniRepresentante: dni(),
    telefonoRepresentante: tel(),
    fechaNacimientoRepresentante: '1985-03-15',
    fotoPerfilUrl: 'https://res.cloudinary.com/demo/image/upload/v1/comercios/pre-registro/stress.png',
    redesSociales: [{ tipo: 'INSTAGRAM', url: `https://instagram.com/se${u}` }],
  });
  if (r.status !== 201) throw new Error('registro dueno ' + JSON.stringify(r));
  const codigo = (await call('GET', `/test/token-verificacion?email=${email}`)).json.data;
  const v = await call('POST', '/auth/verificar', null, { email, codigo });
  if (v.status !== 200) throw new Error('verificar dueno ' + JSON.stringify(v));
  const login = await call('POST', '/auth/login', null, { nombreUsuario, password });
  if (login.status !== 200) throw new Error('login dueno ' + JSON.stringify(login));
  return { email, nombreUsuario, password, token: login.json.data.token, duenoId: login.json.data.usuario.id };
}

async function duenoAprobado(admin, conMercadoPago = false) {
  const d = await nuevoDueno();
  const pendiente = (await call('GET', '/administrador/comercios/pendientes', admin)).json.data.find((c) => c.emailCuenta === d.email);
  if (conMercadoPago) {
    const vinculada = await call('POST', `/test/duenos/${d.duenoId}/mercadopago-simulada`);
    if (vinculada.status !== 200) throw new Error('vincular ' + JSON.stringify(vinculada));
  }
  const aprobado = await call('PUT', `/administrador/comercios/${pendiente.id}/resolver`, admin, { aprobar: true });
  if (aprobado.status !== 200) throw new Error('aprobar ' + JSON.stringify(aprobado));
  d.comercioId = pendiente.id;
  return d;
}

async function nuevoClienteVerificado() {
  const u = uniq();
  const email = `stresse1.cli.${u}@bajonea.test`;
  const nombreUsuario = `sc${u}`.slice(0, 20);
  const password = clavePropia();
  const r = await call('POST', '/auth/registro/cliente', null, {
    nombre: 'Cliente',
    apellido: 'Stress',
    dni: dni(),
    fechaNacimiento: '1995-05-20',
    telefono: tel(),
    nombreUsuario,
    email,
    password,
    aceptaTerminos: true,
    direccion: direccion(),
  });
  if (r.status !== 201) throw new Error('registro cliente ' + JSON.stringify(r));
  const codigo = (await call('GET', `/test/token-verificacion?email=${email}`)).json.data;
  const v = await call('POST', '/auth/verificar', null, { email, codigo });
  if (v.status !== 200) throw new Error('verificar cliente ' + JSON.stringify(v));
  return { email, nombreUsuario, password };
}

const clonar = async (comercioId, estado = 'APROBADO') => {
  const r = await call('POST', `/test/comercios/${comercioId}/clonar?nombre=${encodeURIComponent(`Clon ${uniq()}`)}&estado=${estado}`);
  if (r.status !== 201) throw new Error('clonar ' + JSON.stringify(r));
  return r.json.data;
};

const cabecera = (comercioId) => ({ 'X-Comercio-Id': String(comercioId) });
const invitar = (dueno, comercioId, email) => call('POST', '/comercios/equipo/invitaciones', dueno.token, { email }, cabecera(comercioId));
const reenviar = (dueno, comercioId, id) => call('POST', `/comercios/equipo/invitaciones/${id}/reenviar`, dueno.token, undefined, cabecera(comercioId));
const cancelar = (dueno, comercioId, id) => call('PUT', `/comercios/equipo/invitaciones/${id}/cancelar`, dueno.token, undefined, cabecera(comercioId));
const codigoDe = async (email, comercioId) => (await call('GET', `/test/invitaciones-empleado/codigo?email=${encodeURIComponent(email)}&comercioId=${comercioId}`)).json.data;
const validar = (email, codigo) => call('POST', '/auth/invitaciones-empleado/validar', null, { email, codigo });
const cuentaNueva = () => ({
  nombre: 'Empleada',
  apellido: 'Stress',
  dni: dni(),
  fechaNacimiento: '1996-08-14',
  telefono: tel(),
  nombreUsuario: `st${uniq()}`.slice(0, 20),
  password: clavePropia(),
  direccion: direccion(),
});
const aceptarNueva = (email, codigo) => call('POST', '/auth/invitaciones-empleado/aceptar', null, { email, codigo, aceptaTerminos: true, cuentaNueva: cuentaNueva() });
const aceptarExistente = (email, codigo) => call('POST', '/auth/invitaciones-empleado/aceptar', null, { email, codigo });
const loginIncorrecto = (nombreUsuario) => call('POST', '/auth/login', null, { nombreUsuario, password: `Mala${uniq()}` });

const emailInvitado = () => `stresse1.inv.${uniq()}@bajonea.test`;
const filas = (consulta) => {
  const salida = sql(consulta);
  return salida === '' ? [] : salida.split(/\r?\n/);
};
const invitaciones = (comercioId, email) =>
  filas(`SELECT CONCAT(id, '|', estado, '|', intentos_fallidos) FROM invitacion_empleado WHERE comercio_id = ${comercioId} AND email = '${email}' ORDER BY id;`).map((f) => {
    const [id, estado, intentos] = f.split('|');
    return { id: Number(id), estado, intentos: Number(intentos) };
  });
const pendientes = (comercioId, email) => invitaciones(comercioId, email).filter((i) => i.estado === 'PENDIENTE');
const cantidadUsuarios = (email) => Number(sql(`SELECT COUNT(*) FROM usuario WHERE email = '${email}';`));
const usuarioIdDe = (email) => Number(sql(`SELECT COALESCE(MAX(id), 0) FROM usuario WHERE email = '${email}';`));
const cantidadEmpleados = (usuarioId) => Number(sql(`SELECT COUNT(*) FROM empleado WHERE id = ${usuarioId};`));
const relaciones = (usuarioId, comercioId) =>
  Number(sql(`SELECT COUNT(*) FROM empleado_comercio WHERE empleado_id = ${usuarioId}${comercioId === undefined ? '' : ` AND comercio_id = ${comercioId}`};`));
const relacionesActivas = (comercioId) => Number(sql(`SELECT COUNT(*) FROM empleado_comercio WHERE comercio_id = ${comercioId} AND estado = 'ACTIVO';`));
const avisos = (duenoId, comercioId) =>
  Number(sql(`SELECT COUNT(*) FROM notificacion WHERE usuario_id = ${duenoId} AND tipo = 'INVITACION_EMPLEADO' AND canal = 'PUSH' AND entidad_tipo = 'COMERCIO' AND entidad_id = ${comercioId};`));
const historiales = (comercioId, motivo) => Number(sql(`SELECT COUNT(*) FROM historial_empleado_comercio WHERE comercio_id = ${comercioId} AND motivo = '${motivo}';`));
const estadoUsuarioDe = (usuarioId) => sql(`SELECT CONCAT(estado, '|', intentos_fallidos) FROM usuario WHERE id = ${usuarioId};`);
const estadoComercioDe = (comercioId) => sql(`SELECT estado FROM comercio WHERE id = ${comercioId};`);
const filasEmailRegularizacion = (email) => Number(sql(`SELECT COUNT(*) FROM notificacion n JOIN usuario u ON u.id = n.usuario_id WHERE u.email = '${email}' AND n.tipo = 'INVITACION_EMPLEADO' AND n.canal = 'EMAIL';`));

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
const codigos = (respuestas) => respuestas.map((r) => r.status).sort().join(',');

async function escenario1(admin) {
  console.log('--- (S1) aceptar y cancelar la misma invitacion ---');
  const { problemas, registrar5xx, exigir } = nuevoRegistro();
  const resumen = new Map();
  const dueno = await duenoAprobado(admin);
  for (let ronda = 1; ronda <= ROUNDS; ronda++) {
    const comercioId = await clonar(dueno.comercioId);
    const email = emailInvitado();
    const inv = await invitar(dueno, comercioId, email);
    if (inv.status !== 201) throw new Error('invitar ' + JSON.stringify(inv));
    const id = inv.json.data.id;
    const codigo = await codigoDe(email, comercioId);

    const [aceptacion, cancelacion] = await Promise.all([
      esperar(aleatorio(30)).then(() => aceptarNueva(email, codigo)),
      esperar(aleatorio(30)).then(() => cancelar(dueno, comercioId, id)),
    ]);
    registrar5xx(`ronda ${ronda} aceptar`, aceptacion);
    registrar5xx(`ronda ${ronda} cancelar`, cancelacion);
    contar(resumen, `aceptar:${aceptacion.status}/cancelar:${cancelacion.status}`);
    const estado = invitaciones(comercioId, email)[0].estado;
    exigir(!(aceptacion.status === 200 && cancelacion.status === 200), `ronda ${ronda}: aceptar y cancelar dieron 200 a la vez`);
    exigir(aceptacion.status === 200 || cancelacion.status === 200, `ronda ${ronda}: ninguno gano (${aceptacion.status}, ${cancelacion.status})`);
    if (aceptacion.status === 200) {
      exigir(cancelacion.status === 409, `ronda ${ronda}: cancelar dio ${cancelacion.status} tras aceptar`);
      exigir(estado === 'ACEPTADA', `ronda ${ronda}: invitacion ${estado} tras aceptar`);
      exigir(relacionesActivas(comercioId) === 1, `ronda ${ronda}: relaciones activas ${relacionesActivas(comercioId)}`);
      exigir(historiales(comercioId, 'ACEPTACION') === 1, `ronda ${ronda}: filas ACEPTACION ${historiales(comercioId, 'ACEPTACION')}`);
      exigir(cantidadUsuarios(email) === 1, `ronda ${ronda}: usuarios ${cantidadUsuarios(email)}`);
    } else {
      exigir(aceptacion.status === 401, `ronda ${ronda}: aceptar dio ${aceptacion.status} tras cancelar`);
      exigir(estado === 'CANCELADA', `ronda ${ronda}: invitacion ${estado} tras cancelar`);
      exigir(relacionesActivas(comercioId) === 0, `ronda ${ronda}: relacion creada pese a cancelar`);
      exigir(cantidadUsuarios(email) === 0, `ronda ${ronda}: usuario creado pese a cancelar`);
      exigir(historiales(comercioId, 'ACEPTACION') === 0, `ronda ${ronda}: fila ACEPTACION pese a cancelar`);
    }
    console.log(`ronda ${ronda}: aceptar=${aceptacion.status} cancelar=${cancelacion.status} invitacion=${estado}`);
  }
  console.log('Resumen (S1):', resumir(resumen));
  return problemas;
}

async function escenario2(admin) {
  console.log('--- (S2) dos aceptaciones del mismo email y codigo con cuenta nueva ---');
  const { problemas, registrar5xx, exigir } = nuevoRegistro();
  const resumen = new Map();
  const dueno = await duenoAprobado(admin);
  for (let ronda = 1; ronda <= ROUNDS; ronda++) {
    const comercioId = await clonar(dueno.comercioId);
    const email = emailInvitado();
    const inv = await invitar(dueno, comercioId, email);
    if (inv.status !== 201) throw new Error('invitar ' + JSON.stringify(inv));
    const codigo = await codigoDe(email, comercioId);

    const respuestas = await Promise.all(Array.from({ length: 2 }, () => esperar(aleatorio(20)).then(() => aceptarNueva(email, codigo))));
    respuestas.forEach((r) => {
      registrar5xx(`ronda ${ronda} aceptar`, r);
      contar(resumen, `aceptar:${r.status}`);
    });
    exigir(codigos(respuestas) === '200,401', `ronda ${ronda}: respuestas ${codigos(respuestas)}, se esperaba 200,401`);
    const usuarioId = usuarioIdDe(email);
    exigir(cantidadUsuarios(email) === 1, `ronda ${ronda}: usuarios ${cantidadUsuarios(email)}`);
    exigir(cantidadEmpleados(usuarioId) === 1, `ronda ${ronda}: filas empleado ${cantidadEmpleados(usuarioId)}`);
    exigir(relaciones(usuarioId, comercioId) === 1, `ronda ${ronda}: relaciones ${relaciones(usuarioId, comercioId)}`);
    exigir(avisos(dueno.duenoId, comercioId) === 1, `ronda ${ronda}: avisos al Dueno ${avisos(dueno.duenoId, comercioId)}`);
    exigir(historiales(comercioId, 'ACEPTACION') === 1, `ronda ${ronda}: filas ACEPTACION ${historiales(comercioId, 'ACEPTACION')}`);
    console.log(`ronda ${ronda}: aceptar=${codigos(respuestas)} usuarios=${cantidadUsuarios(email)} avisos=${avisos(dueno.duenoId, comercioId)}`);
  }
  console.log('Resumen (S2):', resumir(resumen));
  return problemas;
}

async function escenario3(admin) {
  console.log('--- (S3) aceptar y reenviar a la vez, y ademas invitar de nuevo ---');
  const { problemas, registrar5xx, exigir } = nuevoRegistro();
  const resumen = new Map();
  const dueno = await duenoAprobado(admin);
  for (let ronda = 1; ronda <= ROUNDS; ronda++) {
    const comercioId = await clonar(dueno.comercioId);
    const email = emailInvitado();
    const inv = await invitar(dueno, comercioId, email);
    if (inv.status !== 201) throw new Error('invitar ' + JSON.stringify(inv));
    const id = inv.json.data.id;
    const codigoViejo = await codigoDe(email, comercioId);

    const aceptarPrimero = ronda % 2 === 1;
    const demoraAceptar = aceptarPrimero ? aleatorio(6) : 12 + aleatorio(25);
    const demoraDueno = () => (aceptarPrimero ? 6 + aleatorio(25) : aleatorio(6));
    const tareas = [
      esperar(demoraAceptar).then(() => aceptarNueva(email, codigoViejo)).then((r) => ({ tipo: 'aceptar', r })),
      esperar(demoraDueno()).then(() => reenviar(dueno, comercioId, id)).then((r) => ({ tipo: 'reenviar', r })),
      esperar(demoraDueno()).then(() => invitar(dueno, comercioId, email)).then((r) => ({ tipo: 'invitar', r })),
      esperar(demoraDueno()).then(() => invitar(dueno, comercioId, email)).then((r) => ({ tipo: 'invitar', r })),
    ];
    const resultados = await Promise.all(tareas);
    resultados.forEach(({ tipo, r }) => {
      registrar5xx(`ronda ${ronda} ${tipo}`, r);
      contar(resumen, `${tipo}:${r.status}`);
    });
    const de = (tipo) => resultados.filter((x) => x.tipo === tipo).map((x) => x.r.status);
    const aceptar = de('aceptar')[0];
    const reenvio = de('reenviar')[0];
    exigir(pendientes(comercioId, email).length <= 1, `ronda ${ronda}: ${pendientes(comercioId, email).length} invitaciones PENDIENTE para el mismo par`);
    exigir(de('invitar').every((s) => s === 409), `ronda ${ronda}: invitar dio ${de('invitar')}, se esperaba 409`);
    exigir(!(aceptar === 200 && reenvio === 200), `ronda ${ronda}: aceptar y reenviar dieron 200 a la vez`);
    if (aceptar === 200) {
      exigir(reenvio === 409, `ronda ${ronda}: reenviar dio ${reenvio} tras aceptar`);
      exigir(pendientes(comercioId, email).length === 0, `ronda ${ronda}: PENDIENTE huerfana tras aceptar`);
      exigir(relacionesActivas(comercioId) === 1, `ronda ${ronda}: relaciones activas ${relacionesActivas(comercioId)}`);
    } else {
      exigir(aceptar === 401, `ronda ${ronda}: aceptar dio ${aceptar} sin aceptar`);
      exigir(reenvio === 200, `ronda ${ronda}: reenviar dio ${reenvio}, se esperaba 200`);
      exigir(pendientes(comercioId, email).length === 1, `ronda ${ronda}: PENDIENTES ${pendientes(comercioId, email).length}, se esperaba 1`);
      exigir(relacionesActivas(comercioId) === 0, `ronda ${ronda}: relacion creada sin aceptar`);
      const nuevo = await codigoDe(email, comercioId);
      const valida = await validar(email, nuevo);
      exigir(valida.status === 200, `ronda ${ronda}: el codigo nuevo dio ${valida.status}`);
      if (nuevo !== codigoViejo) {
        const vieja = await validar(email, codigoViejo);
        exigir(vieja.status === 401, `ronda ${ronda}: el codigo viejo dio ${vieja.status}`);
      }
    }
    console.log(`ronda ${ronda}: aceptar=${aceptar} reenviar=${reenvio} invitar=${de('invitar')} pendientes=${pendientes(comercioId, email).length}`);
  }
  console.log('Resumen (S3):', resumir(resumen));
  return problemas;
}

async function escenario4(admin) {
  console.log('--- (S4) seis invitaciones simultaneas del mismo Dueno a emails distintos ---');
  const { problemas, registrar5xx, exigir } = nuevoRegistro();
  const resumen = new Map();
  const dueno = await duenoAprobado(admin);
  for (let ronda = 1; ronda <= ROUNDS; ronda++) {
    const comercioId = await clonar(dueno.comercioId);
    const emails = Array.from({ length: 6 }, emailInvitado);
    const respuestas = await Promise.all(emails.map((e) => esperar(aleatorio(25)).then(() => invitar(dueno, comercioId, e))));
    respuestas.forEach((r) => {
      registrar5xx(`ronda ${ronda} invitar`, r);
      contar(resumen, `invitar:${r.status}`);
    });
    exigir(codigos(respuestas) === '201,201,201,201,201,409', `ronda ${ronda}: respuestas ${codigos(respuestas)}, se esperaban cinco 201 y un 409`);
    const rechazada = respuestas.find((r) => r.status === 409);
    exigir(!rechazada || /^Alcanzaste el máximo de 5 invitaciones por hora\. Probá de nuevo a las \d{2}:\d{2}$/.test(rechazada.json.mensaje), `ronda ${ronda}: mensaje del tope ${rechazada && rechazada.json.mensaje}`);
    const total = Number(sql(`SELECT COUNT(*) FROM invitacion_empleado WHERE comercio_id = ${comercioId};`));
    exigir(total === 5, `ronda ${ronda}: filas en la ventana ${total}`);
    console.log(`ronda ${ronda}: ${codigos(respuestas)} filas=${total}`);
  }
  console.log('Resumen (S4):', resumir(resumen));
  return problemas;
}

async function escenario5(admin) {
  console.log('--- (S5) dos invitaciones simultaneas al mismo email ---');
  const { problemas, registrar5xx, exigir } = nuevoRegistro();
  const resumen = new Map();
  const dueno = await duenoAprobado(admin);
  for (let ronda = 1; ronda <= ROUNDS; ronda++) {
    const comercioId = await clonar(dueno.comercioId);
    const email = emailInvitado();
    const respuestas = await Promise.all(Array.from({ length: 2 }, () => esperar(aleatorio(20)).then(() => invitar(dueno, comercioId, email))));
    respuestas.forEach((r) => {
      registrar5xx(`ronda ${ronda} invitar`, r);
      contar(resumen, `invitar:${r.status}`);
    });
    exigir(codigos(respuestas) === '201,409', `ronda ${ronda}: respuestas ${codigos(respuestas)}, se esperaba 201,409`);
    const rechazada = respuestas.find((r) => r.status === 409);
    exigir(!rechazada || rechazada.json.mensaje === 'Ya hay una invitación pendiente para ese email. Podés reenviarla.', `ronda ${ronda}: mensaje ${rechazada && rechazada.json.mensaje}`);
    exigir(pendientes(comercioId, email).length === 1, `ronda ${ronda}: PENDIENTES ${pendientes(comercioId, email).length}`);
    exigir(invitaciones(comercioId, email).length === 1, `ronda ${ronda}: filas ${invitaciones(comercioId, email).length}`);
    console.log(`ronda ${ronda}: ${codigos(respuestas)} pendientes=${pendientes(comercioId, email).length}`);
  }
  console.log('Resumen (S5):', resumir(resumen));
  return problemas;
}

async function escenario6(admin) {
  console.log('--- (S6) un Empleado nuevo acepta a la vez invitaciones de dos comercios ---');
  const { problemas, registrar5xx, exigir } = nuevoRegistro();
  const resumen = new Map();
  const dueno = await duenoAprobado(admin);
  for (let ronda = 1; ronda <= ROUNDS; ronda++) {
    const cuenta = await nuevoClienteVerificado();
    const comercios = [await clonar(dueno.comercioId), await clonar(dueno.comercioId)];
    const entradas = [];
    for (const comercioId of comercios) {
      const inv = await invitar(dueno, comercioId, cuenta.email);
      if (inv.status !== 201) throw new Error('invitar ' + JSON.stringify(inv));
      entradas.push({ comercioId, codigo: await codigoDe(cuenta.email, comercioId) });
    }
    const usuarioId = usuarioIdDe(cuenta.email);
    exigir(cantidadEmpleados(usuarioId) === 0, `ronda ${ronda}: ya habia fila empleado antes de aceptar`);

    const respuestas = await Promise.all(entradas.map(({ codigo }) => esperar(aleatorio(20)).then(() => aceptarExistente(cuenta.email, codigo))));
    respuestas.forEach((r) => {
      registrar5xx(`ronda ${ronda} aceptar`, r);
      contar(resumen, `aceptar:${r.status}`);
    });
    exigir(codigos(respuestas) === '200,200', `ronda ${ronda}: respuestas ${codigos(respuestas)}`);
    exigir(cantidadEmpleados(usuarioId) === 1, `ronda ${ronda}: filas empleado ${cantidadEmpleados(usuarioId)}`);
    exigir(relaciones(usuarioId) === 2, `ronda ${ronda}: relaciones ${relaciones(usuarioId)}`);
    comercios.forEach((comercioId) => {
      exigir(relaciones(usuarioId, comercioId) === 1, `ronda ${ronda}: relaciones en ${comercioId} ${relaciones(usuarioId, comercioId)}`);
      exigir(avisos(dueno.duenoId, comercioId) === 1, `ronda ${ronda}: avisos en ${comercioId} ${avisos(dueno.duenoId, comercioId)}`);
    });
    console.log(`ronda ${ronda}: aceptar=${codigos(respuestas)} empleados=${cantidadEmpleados(usuarioId)} relaciones=${relaciones(usuarioId)}`);
  }
  console.log('Resumen (S6):', resumir(resumen));
  return problemas;
}

async function escenario7(admin) {
  console.log('--- (S7) veinte codigos erroneos en paralelo con el correcto mezclado ---');
  const { problemas, registrar5xx, exigir } = nuevoRegistro();
  const resumen = new Map();
  const dueno = await duenoAprobado(admin);
  for (let ronda = 1; ronda <= ROUNDS; ronda++) {
    const comercioId = await clonar(dueno.comercioId);
    const email = emailInvitado();
    const inv = await invitar(dueno, comercioId, email);
    if (inv.status !== 201) throw new Error('invitar ' + JSON.stringify(inv));
    const codigo = await codigoDe(email, comercioId);
    const incorrecto = codigo === '000000' ? '111111' : '000000';
    const correctoPorAceptar = ronda % 2 === 0;
    const posicion = aleatorio(21);

    const tareas = Array.from({ length: 21 }, (_, i) => {
      const esCorrecto = i === posicion;
      const accion = () => {
        if (esCorrecto) return correctoPorAceptar ? aceptarNueva(email, codigo) : validar(email, codigo);
        return i % 2 === 0 ? validar(email, incorrecto) : aceptarExistente(email, incorrecto);
      };
      const demora = esCorrecto ? aleatorio(12) : correctoPorAceptar ? 10 + aleatorio(30) : aleatorio(40);
      return esperar(demora).then(accion).then((r) => ({ esCorrecto, r }));
    });
    const resultados = await Promise.all(tareas);
    resultados.forEach(({ esCorrecto, r }) => {
      registrar5xx(`ronda ${ronda} ${esCorrecto ? 'correcto' : 'erroneo'}`, r);
      contar(resumen, `${esCorrecto ? 'correcto' : 'erroneo'}:${r.status}`);
    });
    const erroneos = resultados.filter((x) => !x.esCorrecto).map((x) => x.r.status);
    const correcto = resultados.find((x) => x.esCorrecto).r.status;
    const fila = invitaciones(comercioId, email)[0];
    exigir(erroneos.every((s) => s === 401), `ronda ${ronda}: erroneos con ${[...new Set(erroneos)]}`);
    exigir(fila.intentos <= 5, `ronda ${ronda}: intentos ${fila.intentos}`);
    exigir(correcto === 200 || correcto === 401, `ronda ${ronda}: el correcto dio ${correcto}`);
    if (correctoPorAceptar && correcto === 200) {
      exigir(fila.estado === 'ACEPTADA', `ronda ${ronda}: invitacion ${fila.estado} tras aceptar`);
      exigir(relacionesActivas(comercioId) === 1, `ronda ${ronda}: relaciones activas ${relacionesActivas(comercioId)}`);
      exigir(cantidadUsuarios(email) === 1, `ronda ${ronda}: usuarios ${cantidadUsuarios(email)}`);
    } else {
      exigir(fila.estado === 'INVALIDADA' && fila.intentos === 5, `ronda ${ronda}: invitacion ${fila.estado} con ${fila.intentos} intentos`);
      exigir(relacionesActivas(comercioId) === 0, `ronda ${ronda}: relacion creada pese a invalidar`);
      exigir(cantidadUsuarios(email) === 0, `ronda ${ronda}: usuario creado pese a invalidar`);
    }
    console.log(`ronda ${ronda}: correcto(${correctoPorAceptar ? 'aceptar' : 'validar'})=${correcto} invitacion=${fila.estado}/${fila.intentos}`);
  }
  console.log('Resumen (S7):', resumir(resumen));
  return problemas;
}

async function escenario8(admin) {
  console.log('--- (S8) aceptar contra tres intentos fallidos de login del invitado ---');
  const { problemas, registrar5xx, exigir } = nuevoRegistro();
  const resumen = new Map();
  const dueno = await duenoAprobado(admin);
  for (let ronda = 1; ronda <= ROUNDS; ronda++) {
    const comercioId = await clonar(dueno.comercioId);
    const cuenta = await nuevoClienteVerificado();
    const inv = await invitar(dueno, comercioId, cuenta.email);
    if (inv.status !== 201) throw new Error('invitar ' + JSON.stringify(inv));
    const codigo = await codigoDe(cuenta.email, comercioId);
    const usuarioId = usuarioIdDe(cuenta.email);

    const tareas = [esperar(aleatorio(60)).then(() => aceptarExistente(cuenta.email, codigo)).then((r) => ({ tipo: 'aceptar', r }))];
    for (let i = 0; i < 3; i++) tareas.push(esperar(aleatorio(60)).then(() => loginIncorrecto(cuenta.nombreUsuario)).then((r) => ({ tipo: 'login', r })));
    const resultados = await Promise.all(tareas);
    resultados.forEach(({ tipo, r }) => {
      registrar5xx(`ronda ${ronda} ${tipo}`, r);
      contar(resumen, `${tipo}:${r.status}`);
    });
    const logins = resultados.filter((x) => x.tipo === 'login').map((x) => x.r.status);
    const aceptar = resultados.find((x) => x.tipo === 'aceptar').r.status;
    exigir(logins.every((s) => s === 401), `ronda ${ronda}: logins ${logins}, se esperaban tres 401`);
    exigir(estadoUsuarioDe(usuarioId) === 'BLOQUEADO|3', `ronda ${ronda}: usuario ${estadoUsuarioDe(usuarioId)}, se esperaba BLOQUEADO|3`);
    exigir(aceptar === 200 || aceptar === 409, `ronda ${ronda}: aceptar dio ${aceptar}`);
    const estadoInv = invitaciones(comercioId, cuenta.email)[0].estado;
    if (aceptar === 200) {
      exigir(estadoInv === 'ACEPTADA', `ronda ${ronda}: invitacion ${estadoInv} tras aceptar`);
      exigir(relaciones(usuarioId, comercioId) === 1, `ronda ${ronda}: relaciones ${relaciones(usuarioId, comercioId)}`);
      exigir(cantidadEmpleados(usuarioId) === 1, `ronda ${ronda}: filas empleado ${cantidadEmpleados(usuarioId)}`);
      exigir(avisos(dueno.duenoId, comercioId) === 1, `ronda ${ronda}: avisos ${avisos(dueno.duenoId, comercioId)}`);
    } else {
      exigir(estadoInv === 'PENDIENTE', `ronda ${ronda}: invitacion ${estadoInv} tras el 409`);
      exigir(relaciones(usuarioId) === 0 && cantidadEmpleados(usuarioId) === 0, `ronda ${ronda}: filas creadas pese al 409`);
      exigir(avisos(dueno.duenoId, comercioId) === 0, `ronda ${ronda}: aviso pese al 409`);
    }
    console.log(`ronda ${ronda}: aceptar=${aceptar} logins=${logins} usuario=${estadoUsuarioDe(usuarioId)} invitacion=${estadoInv}`);
  }
  console.log('Resumen (S8):', resumir(resumen));
  return problemas;
}

async function escenario9(admin) {
  console.log('--- (S9) aceptar contra el bloqueo de la cuenta del Dueno ---');
  const { problemas, registrar5xx, exigir } = nuevoRegistro();
  const resumen = new Map();
  for (let ronda = 1; ronda <= ROUNDS; ronda++) {
    const dueno = await duenoAprobado(admin, true);
    const email = emailInvitado();
    const inv = await invitar(dueno, dueno.comercioId, email);
    if (inv.status !== 201) throw new Error('invitar ' + JSON.stringify(inv));
    const codigo = await codigoDe(email, dueno.comercioId);
    sql(`UPDATE usuario SET intentos_fallidos = 2 WHERE id = ${dueno.duenoId};`);

    const tareas = [esperar(aleatorio(70)).then(() => aceptarNueva(email, codigo)).then((r) => ({ tipo: 'aceptar', r }))];
    for (let i = 0; i < 2; i++) tareas.push(esperar(aleatorio(70)).then(() => loginIncorrecto(dueno.nombreUsuario)).then((r) => ({ tipo: 'login', r })));
    const resultados = await Promise.all(tareas);
    resultados.forEach(({ tipo, r }) => {
      registrar5xx(`ronda ${ronda} ${tipo}`, r);
      contar(resumen, `${tipo}:${r.status}`);
    });
    const logins = resultados.filter((x) => x.tipo === 'login').map((x) => x.r.status);
    const aceptar = resultados.find((x) => x.tipo === 'aceptar').r.status;
    exigir(logins.filter((s) => s === 401).length === 1 && logins.every((s) => s === 401 || s === 409), `ronda ${ronda}: logins ${logins}, se esperaba un 401 y el resto 409`);
    exigir(aceptar === 200, `ronda ${ronda}: aceptar dio ${aceptar}, se esperaba 200`);
    exigir(estadoUsuarioDe(dueno.duenoId).startsWith('BLOQUEADO|'), `ronda ${ronda}: Dueno ${estadoUsuarioDe(dueno.duenoId)}`);
    exigir(estadoComercioDe(dueno.comercioId) === 'CERRADO_TEMPORALMENTE', `ronda ${ronda}: comercio ${estadoComercioDe(dueno.comercioId)} con el Dueno bloqueado`);
    exigir(invitaciones(dueno.comercioId, email)[0].estado === 'ACEPTADA', `ronda ${ronda}: invitacion ${invitaciones(dueno.comercioId, email)[0].estado}`);
    exigir(relacionesActivas(dueno.comercioId) === 1, `ronda ${ronda}: relaciones activas ${relacionesActivas(dueno.comercioId)}`);
    exigir(avisos(dueno.duenoId, dueno.comercioId) === 1, `ronda ${ronda}: avisos ${avisos(dueno.duenoId, dueno.comercioId)}`);
    console.log(`ronda ${ronda}: aceptar=${aceptar} logins=${logins} dueno=${estadoUsuarioDe(dueno.duenoId)} comercio=${estadoComercioDe(dueno.comercioId)}`);
  }
  console.log('Resumen (S9):', resumir(resumen));
  return problemas;
}

async function escenario10(admin) {
  console.log('--- (S10) invitar cuatro veces en paralelo a la misma cuenta bloqueada ---');
  const { problemas, registrar5xx, exigir } = nuevoRegistro();
  const resumen = new Map();
  const duenos = [await duenoAprobado(admin), await duenoAprobado(admin), await duenoAprobado(admin), await duenoAprobado(admin)];
  const bloqueada = async () => {
    const cuenta = await nuevoClienteVerificado();
    for (let i = 0; i < 3; i++) await loginIncorrecto(cuenta.nombreUsuario);
    return cuenta;
  };
  for (let ronda = 1; ronda <= ROUNDS; ronda++) {
    const mismoDueno = await bloqueada();
    const distintosDuenos = await bloqueada();
    const comercioPropio = await clonar(duenos[0].comercioId);

    const tareas = [
      ...Array.from({ length: 4 }, () => esperar(aleatorio(25)).then(() => invitar(duenos[0], comercioPropio, mismoDueno.email)).then((r) => ({ grupo: 'mismo', r }))),
      ...duenos.map((d) => esperar(aleatorio(25)).then(() => invitar(d, d.comercioId, distintosDuenos.email)).then((r) => ({ grupo: 'distintos', r }))),
    ];
    const resultados = await Promise.all(tareas);
    resultados.forEach(({ grupo, r }) => {
      registrar5xx(`ronda ${ronda} ${grupo}`, r);
      contar(resumen, `${grupo}:${r.status}`);
    });
    exigir(resultados.every(({ r }) => r.status === 409 && r.json.mensaje === 'No se puede invitar a este email'), `ronda ${ronda}: respuestas ${resultados.map(({ r }) => r.status)}`);
    const filasMismo = filasEmailRegularizacion(mismoDueno.email);
    const filasDistintos = filasEmailRegularizacion(distintosDuenos.email);
    contar(resumen, `filas-mismo-dueno:${filasMismo}`);
    contar(resumen, `filas-distintos-duenos:${filasDistintos}`);
    exigir(filasMismo === 3, `ronda ${ronda}: cuatro invitaciones del mismo Dueno dejaron ${filasMismo} filas, se esperaban 3 (la fila del Dueno las serializa)`);
    exigir(filasDistintos >= 3 && filasDistintos <= 4, `ronda ${ronda}: cuatro Duenos distintos dejaron ${filasDistintos} filas, se esperaban 3 o 4`);
    exigir(Number(sql(`SELECT COUNT(*) FROM invitacion_empleado WHERE email IN ('${mismoDueno.email}', '${distintosDuenos.email}');`)) === 0, `ronda ${ronda}: se creo una invitacion para una cuenta bloqueada`);
    console.log(`ronda ${ronda}: mismo Dueno=${filasMismo} filas, Duenos distintos=${filasDistintos} filas`);
  }
  console.log('Resumen (S10):', resumir(resumen));
  return problemas;
}

async function escenario11(admin) {
  console.log('--- (S11) cancelar, reenviar y aceptar a la vez ---');
  const { problemas, registrar5xx, exigir } = nuevoRegistro();
  const resumen = new Map();
  const dueno = await duenoAprobado(admin);
  for (let ronda = 1; ronda <= ROUNDS; ronda++) {
    const comercioId = await clonar(dueno.comercioId);
    const email = emailInvitado();
    const inv = await invitar(dueno, comercioId, email);
    if (inv.status !== 201) throw new Error('invitar ' + JSON.stringify(inv));
    const id = inv.json.data.id;
    const codigo = await codigoDe(email, comercioId);

    const tareas = [
      esperar(aleatorio(30)).then(() => cancelar(dueno, comercioId, id)).then((r) => ({ tipo: 'cancelar', r })),
      esperar(aleatorio(30)).then(() => reenviar(dueno, comercioId, id)).then((r) => ({ tipo: 'reenviar', r })),
      esperar(aleatorio(30)).then(() => aceptarNueva(email, codigo)).then((r) => ({ tipo: 'aceptar', r })),
    ];
    const resultados = await Promise.all(tareas);
    resultados.forEach(({ tipo, r }) => {
      registrar5xx(`ronda ${ronda} ${tipo}`, r);
      contar(resumen, `${tipo}:${r.status}`);
    });
    const estado = (tipo) => resultados.find((x) => x.tipo === tipo).r.status;
    const ganadores = resultados.filter(({ r }) => r.status === 200).map(({ tipo }) => tipo);
    const filasInv = invitaciones(comercioId, email);
    const vigentes = pendientes(comercioId, email);
    exigir(ganadores.length === 1, `ronda ${ronda}: ganaron ${ganadores.join('+') || 'nadie'}`);
    exigir(vigentes.length <= 1, `ronda ${ronda}: ${vigentes.length} PENDIENTE para el mismo par`);
    if (ganadores[0] === 'aceptar') {
      exigir(vigentes.length === 0, `ronda ${ronda}: PENDIENTE huerfana tras aceptar`);
      exigir(estado('cancelar') === 409 && estado('reenviar') === 409, `ronda ${ronda}: cancelar=${estado('cancelar')} reenviar=${estado('reenviar')} tras aceptar`);
      exigir(relacionesActivas(comercioId) === 1 && cantidadUsuarios(email) === 1, `ronda ${ronda}: relacion o usuario inconsistentes tras aceptar`);
    } else if (ganadores[0] === 'cancelar') {
      exigir(vigentes.length === 0, `ronda ${ronda}: PENDIENTE huerfana tras cancelar`);
      exigir(estado('aceptar') === 401 && estado('reenviar') === 409, `ronda ${ronda}: aceptar=${estado('aceptar')} reenviar=${estado('reenviar')} tras cancelar`);
      exigir(relacionesActivas(comercioId) === 0 && cantidadUsuarios(email) === 0, `ronda ${ronda}: relacion o usuario creados pese a cancelar`);
    } else if (ganadores[0] === 'reenviar') {
      exigir(vigentes.length === 1, `ronda ${ronda}: PENDIENTES ${vigentes.length} tras reenviar, se esperaba 1`);
      exigir(estado('aceptar') === 401 && estado('cancelar') === 409, `ronda ${ronda}: aceptar=${estado('aceptar')} cancelar=${estado('cancelar')} tras reenviar`);
      exigir(relacionesActivas(comercioId) === 0 && cantidadUsuarios(email) === 0, `ronda ${ronda}: relacion o usuario creados pese a reenviar`);
    }
    console.log(`ronda ${ronda}: gano ${ganadores.join('+') || 'nadie'} estados=${filasInv.map((f) => f.estado).join('/')}`);
  }
  console.log('Resumen (S11):', resumir(resumen));
  return problemas;
}

async function escenario12(admin) {
  console.log('--- (S12, extra) codigos erroneos que invalidan contra reenviar e invitar del Dueno ---');
  const { problemas, registrar5xx, exigir } = nuevoRegistro();
  const resumen = new Map();
  const dueno = await duenoAprobado(admin);
  for (let ronda = 1; ronda <= ROUNDS; ronda++) {
    const comercioId = await clonar(dueno.comercioId);
    const email = emailInvitado();
    const inv = await invitar(dueno, comercioId, email);
    if (inv.status !== 201) throw new Error('invitar ' + JSON.stringify(inv));
    const id = inv.json.data.id;
    const codigo = await codigoDe(email, comercioId);
    const incorrecto = codigo === '000000' ? '111111' : '000000';

    const tareas = [
      ...Array.from({ length: 6 }, (_, i) => esperar(aleatorio(30)).then(() => (i % 2 === 0 ? validar(email, incorrecto) : aceptarExistente(email, incorrecto))).then((r) => ({ tipo: 'erroneo', r }))),
      esperar(aleatorio(30)).then(() => reenviar(dueno, comercioId, id)).then((r) => ({ tipo: 'reenviar', r })),
      esperar(aleatorio(30)).then(() => invitar(dueno, comercioId, email)).then((r) => ({ tipo: 'invitar', r })),
    ];
    const resultados = await Promise.all(tareas);
    resultados.forEach(({ tipo, r }) => {
      registrar5xx(`ronda ${ronda} ${tipo}`, r);
      contar(resumen, `${tipo}:${r.status}`);
    });
    const de = (tipo) => resultados.filter((x) => x.tipo === tipo).map((x) => x.r.status);
    exigir(de('erroneo').every((s) => s === 401), `ronda ${ronda}: erroneos con ${[...new Set(de('erroneo'))]}`);
    exigir(de('reenviar')[0] === 200 || de('invitar')[0] === 201, `ronda ${ronda}: reenviar=${de('reenviar')} invitar=${de('invitar')}, al menos uno tiene que crear la invitacion nueva`);
    exigir([200, 409].includes(de('reenviar')[0]) && [201, 409].includes(de('invitar')[0]), `ronda ${ronda}: reenviar=${de('reenviar')} invitar=${de('invitar')}`);
    exigir(pendientes(comercioId, email).length <= 1, `ronda ${ronda}: PENDIENTES ${pendientes(comercioId, email).length}, se esperaba como maximo 1`);
    exigir(invitaciones(comercioId, email).every((i) => i.intentos <= 5), `ronda ${ronda}: intentos por encima de 5`);
    console.log(`ronda ${ronda}: erroneos=${de('erroneo')} reenviar=${de('reenviar')} invitar=${de('invitar')} estados=${invitaciones(comercioId, email).map((i) => `${i.estado}/${i.intentos}`).join(' ')}`);
  }
  console.log('Resumen (S12):', resumir(resumen));
  return problemas;
}

async function main() {
  LOC = await resolverLocalidad();
  const admin = (await call('POST', '/auth/login', null, ADMIN)).json.data.token;
  const solo = process.env.ESCENARIO;
  const escenarios = [escenario1, escenario2, escenario3, escenario4, escenario5, escenario6, escenario7, escenario8, escenario9, escenario10, escenario11, escenario12];
  const todos = [];
  for (let i = 0; i < escenarios.length; i++) {
    if (!solo || solo === String(i + 1)) todos.push(...(await escenarios[i](admin)));
  }
  console.log(todos.length ? 'PROBLEMAS:\n' + todos.join('\n') : 'SIN PROBLEMAS (sin 5xx, sin inconsistencias)');
  if (todos.length) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
