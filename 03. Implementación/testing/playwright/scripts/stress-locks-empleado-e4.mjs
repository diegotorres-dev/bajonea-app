import { execFileSync, spawn } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';

/*
 * E4, estrés de la gestión del equipo con los endpoints reales (HTTP):
 *   A1: S1, S2, S4, S5 y S10 (desactivar y reactivar al miembro).
 *   A2: S3 (renunciar contra desactivar) y S7 (renunciar contra las escrituras propias del Empleado).
 *   A3: S6 (fan-out de pedidos pagados con desactivar y reactivar en medio), S8 (desactivar y reactivar contra cerrar,
 *       abrir, datos operativos, suspension del Administrador y bloqueo de cuenta del Dueño) y S9 (purgado de cientos
 *       de avisos mientras entran avisos por fan-out).
 * Uso: ADMIN_PASSWORD=... [ROUNDS=6] [ESCENARIO=1|2|3|4|5|6|7|8|9|10] node stress-locks-empleado-e4.mjs
 * Los invariantes se leen de la base con mysql.exe y se revisa el log del backend (Deadlock found / Lock wait timeout).
 */
const B = process.env.E2E_API_BASE_URL || 'http://localhost:8080/api/v1';
const ROUNDS = Number(process.env.ROUNDS || 6);
const ADMIN = { nombreUsuario: 'adminbajonea', password: process.env.ADMIN_PASSWORD };
const MYSQL = process.env.MYSQL_BIN || 'C:/xampp/mysql/bin/mysql.exe';
const sqlUnaVez = (q) => execFileSync(MYSQL, ['-u', 'root', '-N', '-B', 'bajonea_test', '-e', q]).toString().trim();
const sql = (q) => {
  let resultado = sqlUnaVez(q);
  for (let intento = 0; intento < 2 && resultado === '' && /^\s*SELECT/i.test(q); intento += 1) resultado = sqlUnaVez(q);
  return resultado;
};

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
  return localidades.find((l) => /r[ií]o grande/i.test(l.nombre)).id;
}

const direccion = () => ({ calle: 'Stress', numero: '1', pisoDepto: null, codigoPostal: '9420', localidadId: LOC, principal: true });
const cabecera = (comercioId) => ({ 'X-Comercio-Id': String(comercioId) });

async function nuevoDueno() {
  const u = uniq();
  const email = `stresse4.${u}@bajonea.test`;
  const nombreUsuario = `sh${u}`.slice(0, 20);
  const password = clavePropia();
  const r = await call('POST', '/auth/registro/comercio', null, {
    razonSocial: `StressE4 ${u} SRL`,
    cuit: cuit(),
    condicionIva: 'RESPONSABLE_INSCRIPTO',
    tipoSociedad: 'SRL',
    domicilioFiscal: 'Av. Stress 1',
    fechaInicioActividades: '2020-01-01',
    nombre: `StressE4 ${u}`,
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
    redesSociales: [{ tipo: 'INSTAGRAM', url: `https://instagram.com/sh${u}` }],
  });
  if (r.status !== 201) throw new Error('registro dueno ' + JSON.stringify(r));
  const codigo = (await call('GET', `/test/token-verificacion?email=${email}`)).json.data;
  const v = await call('POST', '/auth/verificar', null, { email, codigo });
  if (v.status !== 200) throw new Error('verificar dueno ' + JSON.stringify(v));
  const login = await call('POST', '/auth/login', null, { nombreUsuario, password });
  if (login.status !== 200) throw new Error('login dueno ' + JSON.stringify(login));
  return { email, nombreUsuario, password, token: login.json.data.token, duenoId: login.json.data.usuario.id };
}

async function duenoAprobado(admin) {
  const d = await nuevoDueno();
  const pendiente = (await call('GET', '/administrador/comercios/pendientes', admin)).json.data.find((c) => c.emailCuenta === d.email);
  const aprobado = await call('PUT', `/administrador/comercios/${pendiente.id}/resolver`, admin, { aprobar: true });
  if (aprobado.status !== 200) throw new Error('aprobar ' + JSON.stringify(aprobado));
  d.comercioId = pendiente.id;
  return d;
}

async function nuevoClienteVerificado() {
  const u = uniq();
  const email = `stresse4.emp.${u}@bajonea.test`;
  const nombreUsuario = `si${u}`.slice(0, 20);
  const password = clavePropia();
  const r = await call('POST', '/auth/registro/cliente', null, {
    nombre: 'Empleado',
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

const codigoDeInvitacion = async (email, comercioId) =>
  (await call('GET', `/test/invitaciones-empleado/codigo?email=${encodeURIComponent(email)}&comercioId=${comercioId}`)).json.data;

async function empleadoDe(dueno) {
  const cuenta = await nuevoClienteVerificado();
  const inv = await call('POST', '/comercios/equipo/invitaciones', dueno.token, { email: cuenta.email }, cabecera(dueno.comercioId));
  if (inv.status !== 201) throw new Error('invitar ' + JSON.stringify(inv));
  const codigo = await codigoDeInvitacion(cuenta.email, dueno.comercioId);
  const acep = await call('POST', '/auth/invitaciones-empleado/aceptar', null, { email: cuenta.email, codigo });
  if (acep.status !== 200) throw new Error('aceptar ' + JSON.stringify(acep));
  const login = await call('POST', '/auth/login', null, { nombreUsuario: cuenta.nombreUsuario, password: cuenta.password });
  if (login.status !== 200) throw new Error('login empleado ' + JSON.stringify(login));
  return { ...cuenta, token: login.json.data.token, id: login.json.data.usuario.id };
}

const desactivar = (d, empleadoId) => call('PUT', `/comercios/equipo/miembros/${empleadoId}/desactivar`, d.token, undefined, cabecera(d.comercioId));
const renunciar = (emp, comercioId) => call('PUT', `/empleados/comercios/${comercioId}/renunciar`, emp.token);
const reactivar = (d, empleadoId) => call('PUT', `/comercios/equipo/miembros/${empleadoId}/reactivar`, d.token, undefined, cabecera(d.comercioId));
const invitar = (d, email) => call('POST', '/comercios/equipo/invitaciones', d.token, { email }, cabecera(d.comercioId));
const aceptar = (email, codigo) => call('POST', '/auth/invitaciones-empleado/aceptar', null, { email, codigo });
const escribirComoEmpleado = (emp, comercioId, n) =>
  call('PUT', '/comercios/perfil/datos-operativos', emp.token, { descripcion: `descripcion ${n} ${uniq()}`, telefono: tel() }, cabecera(comercioId));
const atajoRelacion = (comercioId, empleadoId, estado, motivo) =>
  call('PUT', `/test/comercios/${comercioId}/empleados/${empleadoId}/estado?estado=${estado}${motivo ? `&motivo=${motivo}` : ''}`);

const relacionId = (comercioId, empleadoId) => Number(sql(`SELECT id FROM empleado_comercio WHERE comercio_id = ${comercioId} AND empleado_id = ${empleadoId};`));
const estadoRelacion = (comercioId, empleadoId) => sql(`SELECT estado FROM empleado_comercio WHERE comercio_id = ${comercioId} AND empleado_id = ${empleadoId};`);
const motivosDe = (relacion) =>
  sql(`SELECT motivo FROM historial_empleado_comercio WHERE empleado_comercio_id = ${relacion} AND motivo IN ('BAJA_DUENO','REACTIVACION','RENUNCIA') ORDER BY id;`)
    .split(/\r?\n/)
    .filter(Boolean);
const avisos = (usuarioId, tipo) => Number(sql(`SELECT COUNT(*) FROM notificacion WHERE usuario_id = ${usuarioId} AND tipo = '${tipo}';`));
const cuenta = (consulta) => Number(sql(consulta));

const LOG_BACKEND = process.env.BACKEND_LOG || `${process.env.TEMP || '/tmp'}/backend-test.log`;
const NO_DISPONIBLE = 'COMERCIO_NO_DISPONIBLE';

function nuevoRegistro() {
  const problemas = [];
  return {
    problemas,
    registrar: (etiqueta, r, permitidos) => {
      if (r.status >= 500) problemas.push(`${etiqueta}: ${r.status} ${JSON.stringify(r.json)}`);
      else if (!permitidos.includes(r.status)) problemas.push(`${etiqueta}: estado inesperado ${r.status} ${JSON.stringify(r.json)}`);
    },
  };
}

/** Una sesión mysql aparte que sostiene el bloqueo y escribe lo que haría otra operación en curso. */
function sesionMysql(consulta) {
  return new Promise((resolve, reject) => {
    const proceso = spawn(MYSQL, ['-u', 'root', '-N', '-B', 'bajonea_test', '-e', consulta], { stdio: 'ignore' });
    proceso.on('error', reject);
    proceso.on('exit', (codigo) => (codigo === 0 ? resolve() : reject(new Error('mysql termino con ' + codigo))));
  });
}

const MARCADOR = 'stress-e4-marcador';

/** Una escritura delegada del Empleado que ya validó su relación (compartida) y todavía no confirmó. */
function escrituraEnVuelo(comercioId, empleadoId, milisegundos) {
  return sesionMysql(
    `START TRANSACTION; SELECT id INTO @relacion FROM empleado_comercio WHERE empleado_id = ${empleadoId} AND comercio_id = ${comercioId} LOCK IN SHARE MODE; ` +
      `SELECT SLEEP(${milisegundos / 1000}); ` +
      `INSERT INTO historial_edicion_comercio (comercio_id, usuario_id, actor_rol, entidad_tipo, entidad_id, entidad_nombre, accion, detalle, fecha_hora) ` +
      `VALUES (${comercioId}, ${empleadoId}, 'EMPLEADO', 'COMERCIO', ${comercioId}, '${MARCADOR}', 'EDITAR', 'descripcion', NOW()); COMMIT;`,
  );
}

/** Estado de la relación leído y bloqueado en otra sesión, que después la deja inactiva por renuncia. */
function renunciaEnCurso(comercioId, empleadoId, milisegundos) {
  const relacion = relacionId(comercioId, empleadoId);
  return sesionMysql(
    `START TRANSACTION; SELECT id INTO @relacion FROM empleado_comercio WHERE id = ${relacion} FOR UPDATE; SELECT SLEEP(${milisegundos / 1000}); ` +
      `INSERT INTO historial_empleado_comercio (comercio_id, empleado_comercio_id, estado_origen, estado_destino, motivo, actor_usuario_id, fecha_hora) ` +
      `VALUES (${comercioId}, ${relacion}, 'INACTIVO', 'ACTIVO', 'REACTIVACION', ${empleadoId}, NOW()); ` +
      `INSERT INTO historial_empleado_comercio (comercio_id, empleado_comercio_id, estado_origen, estado_destino, motivo, actor_usuario_id, fecha_hora) ` +
      `VALUES (${comercioId}, ${relacion}, 'ACTIVO', 'INACTIVO', 'RENUNCIA', ${empleadoId}, NOW()); ` +
      `UPDATE empleado_comercio SET estado = 'INACTIVO', fecha_baja = NOW() WHERE id = ${relacion}; COMMIT;`,
  );
}

/** S1 y S7: la baja (del Dueño o la renuncia del propio Empleado) se fecha después de toda escritura del Empleado que ya estaba en curso, y las posteriores se rechazan. */
async function bajaContraEscrituras(admin, tag, descripcion, bajar, volverAActivar) {
  console.log(`--- ${tag}: ${descripcion}`);
  const { problemas, registrar } = nuevoRegistro();
  for (let ronda = 1; ronda <= ROUNDS; ronda++) {
    const d = await duenoAprobado(admin);
    const emp = await empleadoDe(d);

    const enVuelo = escrituraEnVuelo(d.comercioId, emp.id, 1500);
    await esperar(400);
    const baja = await bajar(d, emp);
    registrar(`${tag} ronda ${ronda} baja`, baja, [200]);
    await enVuelo;
    const fechaBaja = sql(`SELECT fecha_baja FROM empleado_comercio WHERE comercio_id = ${d.comercioId} AND empleado_id = ${emp.id};`);
    const marca = sql(`SELECT fecha_hora FROM historial_edicion_comercio WHERE comercio_id = ${d.comercioId} AND usuario_id = ${emp.id} AND entidad_nombre = '${MARCADOR}';`);
    if (!fechaBaja || !marca || fechaBaja < marca) problemas.push(`${tag} ronda ${ronda}: la baja (${fechaBaja}) se fecha antes de la escritura en curso que se confirmo (${marca})`);
    const despues = await escribirComoEmpleado(emp, d.comercioId, 'x');
    if (despues.status !== 404 || despues.json?.data?.codigo !== NO_DISPONIBLE) problemas.push(`${tag} ronda ${ronda}: una escritura posterior a la baja dio ${despues.status} ${JSON.stringify(despues.json)}`);

    const reac = await volverAActivar(d, emp);
    registrar(`${tag} ronda ${ronda} volver a activar`, reac, [200]);
    let bajaRespondida = false;
    const resultados = { exitosas: 0, rechazadas: 0, tardias: 0 };
    const escritor = async (id) => {
      for (let i = 0; i < 14; i++) {
        const empezoDespues = bajaRespondida;
        const r = await escribirComoEmpleado(emp, d.comercioId, `${id}-${i}`);
        registrar(`${tag} ronda ${ronda} escritor ${id}`, r, [200, 404]);
        if (r.status === 200) {
          resultados.exitosas += 1;
          if (empezoDespues) resultados.tardias += 1;
        } else if (r.status === 404) {
          resultados.rechazadas += 1;
          if (r.json?.data?.codigo !== NO_DISPONIBLE) problemas.push(`${tag} ronda ${ronda}: 404 sin el codigo estable ${JSON.stringify(r.json)}`);
        }
        await esperar(aleatorio(20));
      }
    };
    const desactiva = (async () => {
      await esperar(60 + aleatorio(120));
      const r = await bajar(d, emp);
      registrar(`${tag} ronda ${ronda} baja en la tormenta`, r, [200]);
      bajaRespondida = true;
    })();
    await Promise.all([escritor(1), escritor(2), escritor(3), escritor(4), desactiva]);
    if (resultados.tardias) problemas.push(`${tag} ronda ${ronda}: ${resultados.tardias} escrituras empezaron despues de la baja y se aceptaron`);
    const baja2 = sql(`SELECT fecha_baja FROM empleado_comercio WHERE comercio_id = ${d.comercioId} AND empleado_id = ${emp.id};`);
    const tarde = cuenta(
      `SELECT COUNT(*) FROM historial_edicion_comercio WHERE comercio_id = ${d.comercioId} AND usuario_id = ${emp.id} AND entidad_nombre IS NOT NULL ` +
        `AND entidad_nombre <> '${MARCADOR}' AND fecha_hora > '${baja2}';`,
    );
    if (tarde) problemas.push(`${tag} ronda ${ronda}: ${tarde} ediciones del Empleado se fechan despues de la baja`);
    if (estadoRelacion(d.comercioId, emp.id) !== 'INACTIVO') problemas.push(`${tag} ronda ${ronda}: la relacion no quedo INACTIVO`);
    console.log(`  ronda ${ronda}: ${resultados.exitosas} escrituras aceptadas, ${resultados.rechazadas} rechazadas`);
  }
  return problemas;
}

async function escenario1(admin) {
  return bajaContraEscrituras(admin, 'S1', 'desactivar contra las escrituras delegadas del Empleado',
    (d, emp) => desactivar(d, emp.id), (d, emp) => reactivar(d, emp.id));
}

async function escenario7(admin) {
  return bajaContraEscrituras(admin, 'S7', 'renunciar contra las escrituras propias del Empleado',
    (d, emp) => renunciar(emp, d.comercioId), (d, emp) => atajoRelacion(d.comercioId, emp.id, 'ACTIVO'));
}

/** S2: tormenta de desactivar y reactivar del mismo miembro; el historial alterna y el estado final coincide con la ultima fila. */
async function escenario2(admin) {
  console.log('--- S2: desactivar y reactivar a la vez');
  const { problemas, registrar } = nuevoRegistro();
  for (let ronda = 1; ronda <= ROUNDS; ronda++) {
    const d = await duenoAprobado(admin);
    const emp = await empleadoDe(d);
    const tareas = [];
    for (let i = 0; i < 4; i++) {
      tareas.push(desactivar(d, emp.id).then((r) => registrar(`S2 ronda ${ronda} desactivar`, r, [200])));
      tareas.push(reactivar(d, emp.id).then((r) => registrar(`S2 ronda ${ronda} reactivar`, r, [200])));
    }
    await Promise.all(tareas);
    const motivos = motivosDe(relacionId(d.comercioId, emp.id));
    motivos.forEach((motivo, i) => {
      const esperado = i % 2 === 0 ? 'BAJA_DUENO' : 'REACTIVACION';
      if (motivo !== esperado) problemas.push(`S2 ronda ${ronda}: el historial no alterna ${motivos.join(',')}`);
    });
    const ultimaFueBaja = motivos.length % 2 === 1;
    if (estadoRelacion(d.comercioId, emp.id) !== (ultimaFueBaja ? 'INACTIVO' : 'ACTIVO')) problemas.push(`S2 ronda ${ronda}: el estado final no coincide con la ultima fila ${motivos.join(',')}`);
    const bajas = motivos.filter((m) => m === 'BAJA_DUENO').length;
    const reacts = motivos.filter((m) => m === 'REACTIVACION').length;
    if (avisos(emp.id, 'EMPLEADO_DESACTIVADO') !== bajas) problemas.push(`S2 ronda ${ronda}: hay ${avisos(emp.id, 'EMPLEADO_DESACTIVADO')} avisos T32 y ${bajas} bajas`);
    if (avisos(emp.id, 'EMPLEADO_REACTIVADO') !== reacts) problemas.push(`S2 ronda ${ronda}: hay ${avisos(emp.id, 'EMPLEADO_REACTIVADO')} avisos T37 y ${reacts} reactivaciones`);
    console.log(`  ronda ${ronda}: historial ${motivos.length} filas (${bajas} bajas, ${reacts} reactivaciones)`);
  }
  return problemas;
}

/** S4: desactivaciones simultaneas escriben una sola baja, un solo aviso, y solo una reporta el cambio. */
async function escenario4(admin) {
  console.log('--- S4: doble desactivacion');
  const { problemas, registrar } = nuevoRegistro();
  for (let ronda = 1; ronda <= ROUNDS; ronda++) {
    const d = await duenoAprobado(admin);
    const emp = await empleadoDe(d);
    const otro = await empleadoDe(d);
    const resultados = await Promise.all([
      desactivar(d, emp.id),
      desactivar(d, emp.id),
      desactivar(d, emp.id),
      desactivar(d, emp.id),
      desactivar(d, emp.id),
      desactivar(d, emp.id),
      desactivar(d, otro.id),
    ]);
    resultados.forEach((r) => registrar(`S4 ronda ${ronda}`, r, [200]));
    const conCambio = resultados.slice(0, 6).filter((r) => r.json?.mensaje === 'Miembro dado de baja').length;
    if (conCambio !== 1) problemas.push(`S4 ronda ${ronda}: ${conCambio} desactivaciones hicieron el cambio (tenia que ser 1)`);
    const motivos = motivosDe(relacionId(d.comercioId, emp.id));
    if (motivos.join(',') !== 'BAJA_DUENO') problemas.push(`S4 ronda ${ronda}: historial ${motivos.join(',')}`);
    if (avisos(emp.id, 'EMPLEADO_DESACTIVADO') !== 1) problemas.push(`S4 ronda ${ronda}: ${avisos(emp.id, 'EMPLEADO_DESACTIVADO')} avisos T32`);
    if (motivosDe(relacionId(d.comercioId, otro.id)).join(',') !== 'BAJA_DUENO') problemas.push(`S4 ronda ${ronda}: el otro miembro no quedo con su baja`);
    if (estadoRelacion(d.comercioId, emp.id) !== 'INACTIVO' || estadoRelacion(d.comercioId, otro.id) !== 'INACTIVO') problemas.push(`S4 ronda ${ronda}: estado final inesperado`);
  }
  return problemas;
}

/** Sostiene la relación FOR UPDATE en otra sesión mientras llegan las operaciones, que se encolan detrás. */
function relacionRetenida(comercioId, empleadoId, milisegundos) {
  const relacion = relacionId(comercioId, empleadoId);
  return sesionMysql(`START TRANSACTION; SELECT id INTO @relacion FROM empleado_comercio WHERE id = ${relacion} FOR UPDATE; SELECT SLEEP(${milisegundos / 1000}); COMMIT;`);
}

/** S3: renunciar contra desactivar; una sola fila de baja y a lo sumo un aviso (T32 si la baja es del Dueño, T34 si es la renuncia). */
async function escenario3(admin) {
  console.log('--- S3: renunciar contra desactivar');
  const { problemas, registrar } = nuevoRegistro();
  const verificar = (etiqueta, d, emp, resultados) => {
    resultados.forEach((r) => registrar(etiqueta, r, [200]));
    const cambios = resultados.filter((r) => r.json?.mensaje === 'Miembro dado de baja' || r.json?.mensaje === 'Dejaste de trabajar en el comercio').length;
    if (cambios !== 1) problemas.push(`${etiqueta}: ${cambios} operaciones hicieron el cambio (tenia que ser 1)`);
    const motivos = motivosDe(relacionId(d.comercioId, emp.id));
    if (motivos.length !== 1) problemas.push(`${etiqueta}: el historial tiene ${motivos.length} filas de baja (${motivos.join(',')})`);
    const t32 = avisos(emp.id, 'EMPLEADO_DESACTIVADO');
    const t34 = avisos(d.duenoId, 'EMPLEADO_DESACTIVADO');
    if (t32 + t34 !== 1) problemas.push(`${etiqueta}: ${t32} avisos al Empleado y ${t34} al Dueño (tenia que ser exactamente uno en total)`);
    if (motivos[0] === 'BAJA_DUENO' && t32 !== 1) problemas.push(`${etiqueta}: la baja fue del Dueño y el Empleado no recibio su aviso`);
    if (motivos[0] === 'RENUNCIA' && t34 !== 1) problemas.push(`${etiqueta}: la baja fue una renuncia y el Dueño no recibio su aviso`);
    if (estadoRelacion(d.comercioId, emp.id) !== 'INACTIVO') problemas.push(`${etiqueta}: la relacion no quedo INACTIVO`);
    return motivos[0];
  };
  const ganadores = { BAJA_DUENO: 0, RENUNCIA: 0 };
  for (let ronda = 1; ronda <= ROUNDS; ronda++) {
    const d = await duenoAprobado(admin);
    const emp = await empleadoDe(d);
    const resultados = await Promise.all([renunciar(emp, d.comercioId), desactivar(d, emp.id), renunciar(emp, d.comercioId), desactivar(d, emp.id)]);
    ganadores[verificar(`S3 ronda ${ronda}`, d, emp, resultados)] += 1;
  }
  for (let ronda = 1; ronda <= ROUNDS; ronda++) {
    const d = await duenoAprobado(admin);
    const emp = await empleadoDe(d);
    const reteniendo = relacionRetenida(d.comercioId, emp.id, 1200);
    await esperar(300);
    const lanzar = { renuncia: () => renunciar(emp, d.comercioId), baja: () => desactivar(d, emp.id) };
    const orden = ronda % 2 === 0 ? ['renuncia', 'baja'] : ['baja', 'renuncia'];
    const primera = lanzar[orden[0]]();
    await esperar(80);
    const segunda = lanzar[orden[1]]();
    const resultados = await Promise.all([primera, segunda]);
    await reteniendo;
    ganadores[verificar(`S3 encolados ronda ${ronda}`, d, emp, resultados)] += 1;
  }
  console.log(`  ganaron ${ganadores.BAJA_DUENO} bajas del Dueño y ${ganadores.RENUNCIA} renuncias`);
  return problemas;
}


const pendientesVigentes = (comercioId, email) =>
  cuenta(`SELECT COUNT(*) FROM invitacion_empleado WHERE comercio_id = ${comercioId} AND email = '${email}' AND estado = 'PENDIENTE' AND fecha_vencimiento > NOW();`);

/** S5: reactivar contra invitar de nuevo y contra aceptar; nunca ACTIVO con una invitacion pendiente ni una reactivacion directa sobre una invitacion pendiente. */
async function escenario5(admin) {
  console.log('--- S5: reactivar contra invitar y contra aceptar');
  const { problemas, registrar } = nuevoRegistro();
  for (let ronda = 1; ronda <= ROUNDS * 2; ronda++) {
    const d = await duenoAprobado(admin);
    const emp = await empleadoDe(d);
    await registrar(`S5 ronda ${ronda} baja inicial`, await desactivar(d, emp.id), [200]);
    const [reac, inv] = await Promise.all([reactivar(d, emp.id), invitar(d, emp.email)]);
    registrar(`S5 ronda ${ronda} reactivar`, reac, [200, 409]);
    registrar(`S5 ronda ${ronda} invitar`, inv, [201, 409]);
    if (estadoRelacion(d.comercioId, emp.id) === 'ACTIVO' && pendientesVigentes(d.comercioId, emp.email) > 0) {
      problemas.push(`S5 ronda ${ronda}: relacion ACTIVA con una invitacion pendiente vigente (${motivosDe(relacionId(d.comercioId, emp.id)).join(',')})`);
    }
  }
  for (let ronda = 1; ronda <= ROUNDS * 2; ronda++) {
    const d = await duenoAprobado(admin);
    const emp = await empleadoDe(d);
    await registrar(`S5 aceptar ronda ${ronda} baja inicial`, await desactivar(d, emp.id), [200]);
    const inv = await invitar(d, emp.email);
    registrar(`S5 aceptar ronda ${ronda} invitar`, inv, [201]);
    const codigo = await codigoDeInvitacion(emp.email, d.comercioId);
    const [reac, acep] = await Promise.all([reactivar(d, emp.id), aceptar(emp.email, codigo)]);
    registrar(`S5 aceptar ronda ${ronda} reactivar`, reac, [200, 409]);
    registrar(`S5 aceptar ronda ${ronda} aceptar`, acep, [200]);
    const relacion = relacionId(d.comercioId, emp.id);
    const directas = cuenta(`SELECT COUNT(*) FROM historial_empleado_comercio WHERE empleado_comercio_id = ${relacion} AND motivo = 'REACTIVACION' AND invitacion_id IS NULL;`);
    const total = cuenta(`SELECT COUNT(*) FROM historial_empleado_comercio WHERE empleado_comercio_id = ${relacion} AND motivo = 'REACTIVACION';`);
    if (directas) problemas.push(`S5 aceptar ronda ${ronda}: ${directas} reactivaciones directas sobre una invitacion pendiente (${motivosDe(relacion).join(',')})`);
    if (total !== 1) problemas.push(`S5 aceptar ronda ${ronda}: ${total} filas REACTIVACION (tenia que ser 1)`);
    if (estadoRelacion(d.comercioId, emp.id) !== 'ACTIVO') problemas.push(`S5 aceptar ronda ${ronda}: la relacion no quedo ACTIVO`);
  }
  return problemas;
}

/** S10: reactivar a quien renuncio, contra la aceptacion de una invitacion nueva y contra una renuncia que se confirma mientras se espera. */
async function escenario10(admin) {
  console.log('--- S10: reactivar una renuncia');
  const { problemas, registrar } = nuevoRegistro();
  for (let ronda = 1; ronda <= ROUNDS; ronda++) {
    const d = await duenoAprobado(admin);
    const emp = await empleadoDe(d);
    registrar(`S10 ronda ${ronda} atajo`, await atajoRelacion(d.comercioId, emp.id, 'INACTIVO', 'RENUNCIA'), [200]);
    const inv = await invitar(d, emp.email);
    registrar(`S10 ronda ${ronda} invitar`, inv, [201]);
    const codigo = await codigoDeInvitacion(emp.email, d.comercioId);
    const [reac, acep] = await Promise.all([reactivar(d, emp.id), aceptar(emp.email, codigo)]);
    registrar(`S10 ronda ${ronda} reactivar`, reac, [200, 409]);
    registrar(`S10 ronda ${ronda} aceptar`, acep, [200]);
    const relacion = relacionId(d.comercioId, emp.id);
    if (estadoRelacion(d.comercioId, emp.id) !== 'ACTIVO') problemas.push(`S10 ronda ${ronda}: la relacion no quedo ACTIVO`);
    const porInvitacion = cuenta(`SELECT COUNT(*) FROM historial_empleado_comercio WHERE empleado_comercio_id = ${relacion} AND motivo = 'REACTIVACION' AND invitacion_id IS NOT NULL;`);
    const directas = cuenta(`SELECT COUNT(*) FROM historial_empleado_comercio WHERE empleado_comercio_id = ${relacion} AND motivo = 'REACTIVACION' AND invitacion_id IS NULL;`);
    if (porInvitacion !== 1 || directas !== 0) problemas.push(`S10 ronda ${ronda}: ${porInvitacion} reactivaciones por invitacion y ${directas} directas (${motivosDe(relacion).join(',')})`);
    if (reac.status === 200 && reac.json?.mensaje === 'Miembro reactivado') problemas.push(`S10 ronda ${ronda}: el Dueño reactivo directamente a quien habia renunciado`);
  }
  for (let ronda = 1; ronda <= ROUNDS; ronda++) {
    const d = await duenoAprobado(admin);
    const emp = await empleadoDe(d);
    registrar(`S10 foto ronda ${ronda} baja`, await desactivar(d, emp.id), [200]);
    const renuncia = renunciaEnCurso(d.comercioId, emp.id, 1300);
    await esperar(400);
    const r = await reactivar(d, emp.id);
    await renuncia;
    if (r.status !== 409 || r.json?.data?.codigo !== 'EMPLEADO_NO_REACTIVABLE') problemas.push(`S10 foto ronda ${ronda}: reactivar dio ${r.status} ${JSON.stringify(r.json)} y tenia que ser 409 EMPLEADO_NO_REACTIVABLE`);
    const relacion = relacionId(d.comercioId, emp.id);
    const delDueno = cuenta(`SELECT COUNT(*) FROM historial_empleado_comercio WHERE empleado_comercio_id = ${relacion} AND motivo = 'REACTIVACION' AND actor_usuario_id = ${d.duenoId};`);
    if (delDueno) problemas.push(`S10 foto ronda ${ronda}: el Dueño reactivo a quien acababa de renunciar (${motivosDe(relacion).join(',')})`);
    if (estadoRelacion(d.comercioId, emp.id) !== 'INACTIVO') problemas.push(`S10 foto ronda ${ronda}: la relacion no quedo INACTIVO`);
  }
  return problemas;
}

const BASE_CATEGORIA = `StressE4 ${uniq()}`;
let categoriaId;

async function comercioListo(admin) {
  const d = await duenoAprobado(admin);
  const apto = await call('PUT', `/test/comercios/${d.comercioId}/apto-venta`);
  if (apto.status !== 200) throw new Error('apto-venta ' + JSON.stringify(apto));
  const firma = await call('POST', '/comercios/perfil/foto/firma', d.token, {}, cabecera(d.comercioId));
  d.nube = firma.json.data.cloudName;
  const producto = await call('POST', '/productos', d.token, { nombre: `Producto ${uniq()}`, precio: 1500, categoriaId }, cabecera(d.comercioId));
  if (producto.status !== 201) throw new Error('producto ' + JSON.stringify(producto));
  d.productoId = producto.json.data.id;
  const imagen = await call('POST', `/productos/${d.productoId}/imagenes`, d.token,
    { url: `https://res.cloudinary.com/${d.nube}/image/upload/v1/productos/${d.comercioId}/${d.productoId}/s.png`, orden: 0, esPrincipal: true }, cabecera(d.comercioId));
  if (imagen.status !== 201) throw new Error('imagen ' + JSON.stringify(imagen));
  return d;
}

async function comprador() {
  const cuenta = await nuevoClienteVerificado();
  const login = await call('POST', '/auth/login', null, { nombreUsuario: cuenta.nombreUsuario, password: cuenta.password });
  if (login.status !== 200) throw new Error('login comprador ' + JSON.stringify(login));
  return { ...cuenta, token: login.json.data.token };
}

async function compradores(n) {
  const lista = [];
  for (let i = 0; i < n; i++) lista.push(await comprador());
  return lista;
}

async function pedidoSinPagar(cliente, productoId) {
  await call('DELETE', '/carrito', cliente.token);
  const agregado = await call('POST', '/carrito/items', cliente.token, { productoId, cantidad: 1 });
  if (agregado.status !== 201) throw new Error('carrito ' + JSON.stringify(agregado));
  const pedido = await call('POST', '/pedidos/cliente', cliente.token, { tipoEntrega: 'RETIRO', direccionId: null });
  if (pedido.status !== 201) throw new Error('pedido ' + JSON.stringify(pedido));
  return pedido.json.data.id;
}

const pagar = (id) => call('PUT', `/test/pedidos/${id}/pago-aprobado`);

async function pedidoPagado(cliente, productoId) {
  const id = await pedidoSinPagar(cliente, productoId);
  const pago = await call('PUT', `/test/pedidos/${id}/pago-aprobado?registrarPago=true`);
  if (pago.status !== 200) throw new Error('pago ' + JSON.stringify(pago));
  return id;
}

const copias = (usuarioId, pedidoId, tipo) =>
  cuenta(`SELECT COUNT(*) FROM notificacion WHERE usuario_id = ${usuarioId} AND tipo = '${tipo}' AND entidad_tipo = 'PEDIDO' AND entidad_id = ${pedidoId};`);
const estadoPedido = (id) => sql(`SELECT estado FROM pedido WHERE id = ${id};`);
const avisosDelComercio = (usuarioId, comercioId) => cuenta(`SELECT COUNT(*) FROM notificacion WHERE usuario_id = ${usuarioId} AND comercio_id = ${comercioId};`);

function sembrarAvisos(usuarioId, comercioId, cantidad) {
  sql(
    `INSERT INTO notificacion (usuario_id, tipo, mensaje, leida, fecha_creacion, canal, estado, entidad_tipo, entidad_id, comercio_id) ` +
      `SELECT ${usuarioId}, 'NUEVO_PEDIDO', CONCAT('Aviso sembrado ', seq), 0, NOW(), 'PUSH', 'PENDIENTE', 'COMERCIO', ${comercioId}, ${comercioId} FROM seq_1_to_${cantidad};`,
  );
}

function revisarHistorialAlternado(problemas, etiqueta, d, emp) {
  const relacion = relacionId(d.comercioId, emp.id);
  const motivos = motivosDe(relacion);
  motivos.forEach((motivo, i) => {
    const esperado = i % 2 === 0 ? 'BAJA_DUENO' : 'REACTIVACION';
    if (motivo !== esperado) problemas.push(`${etiqueta}: el historial no alterna ${motivos.join(',')}`);
  });
  const bajas = motivos.filter((m) => m === 'BAJA_DUENO').length;
  const reacts = motivos.filter((m) => m === 'REACTIVACION').length;
  const ultimaFueBaja = motivos.length % 2 === 1;
  if (estadoRelacion(d.comercioId, emp.id) !== (ultimaFueBaja ? 'INACTIVO' : 'ACTIVO')) problemas.push(`${etiqueta}: el estado final no coincide con la ultima fila ${motivos.join(',')}`);
  if (avisos(emp.id, 'EMPLEADO_DESACTIVADO') !== bajas) problemas.push(`${etiqueta}: ${avisos(emp.id, 'EMPLEADO_DESACTIVADO')} avisos T32 y ${bajas} bajas`);
  if (avisos(emp.id, 'EMPLEADO_REACTIVADO') !== reacts) problemas.push(`${etiqueta}: ${avisos(emp.id, 'EMPLEADO_REACTIVADO')} avisos T37 y ${reacts} reactivaciones`);
  return { bajas, reacts };
}

function revisarFanOut(problemas, etiqueta, d, fijo, mutante, pedidos) {
  for (const id of pedidos) {
    if (estadoPedido(id) === 'PENDIENTE_PAGO') problemas.push(`${etiqueta}: el pedido ${id} quedo sin pagar`);
    if (copias(d.duenoId, id, 'NUEVO_PEDIDO') !== 1) problemas.push(`${etiqueta}: el Dueño tiene ${copias(d.duenoId, id, 'NUEVO_PEDIDO')} copias del pedido ${id}`);
    if (copias(fijo.id, id, 'NUEVO_PEDIDO') !== 1) problemas.push(`${etiqueta}: el Empleado fijo tiene ${copias(fijo.id, id, 'NUEVO_PEDIDO')} copias del pedido ${id}`);
    if (copias(mutante.id, id, 'NUEVO_PEDIDO') > 1) problemas.push(`${etiqueta}: el miembro dado de baja tiene mas de una copia del pedido ${id}`);
  }
  const duplicadas = cuenta(
    `SELECT COUNT(*) FROM (SELECT usuario_id, tipo, entidad_id FROM notificacion WHERE comercio_id = ${d.comercioId} AND entidad_tipo = 'PEDIDO' ` +
      `GROUP BY usuario_id, tipo, entidad_id HAVING COUNT(*) > 1) t;`,
  );
  if (duplicadas) problemas.push(`${etiqueta}: ${duplicadas} avisos del comercio duplicados (mismo usuario, tipo y pedido)`);
}

/** Un pedido bloqueado FOR UPDATE en otra sesion: el fan-out que lo paga ya leyo a sus destinatarios y espera ahi. */
function pedidoRetenido(pedidoId, milisegundos) {
  return sesionMysql(`START TRANSACTION; SELECT id INTO @pedido FROM pedido WHERE id = ${pedidoId} FOR UPDATE; SELECT SLEEP(${milisegundos / 1000}); COMMIT;`);
}

/** S6: pedidos pagados (fan-out al equipo) mientras se desactiva y reactiva a un miembro con los endpoints reales; el miembro dado de baja no se queda con avisos del comercio. */
async function escenario6(admin) {
  console.log('--- S6: pedidos pagados mientras se desactiva y reactiva a un miembro');
  const { problemas, registrar } = nuevoRegistro();
  const PEDIDOS = Number(process.env.PEDIDOS_POR_RONDA || 8);
  for (let ronda = 1; ronda <= ROUNDS; ronda++) {
    const d = await comercioListo(admin);
    const fijo = await empleadoDe(d);
    const mutante = await empleadoDe(d);
    const aPagar = [];
    for (const c of await compradores(PEDIDOS)) aPagar.push(await pedidoSinPagar(c, d.productoId));
    const etiqueta = `S6 ronda ${ronda}`;
    const retenido = await pedidoSinPagar(await comprador(), d.productoId);
    const reteniendo = pedidoRetenido(retenido, 1800);
    await esperar(300);
    const pagoRetenido = pagar(retenido);
    await esperar(500);
    const bajaRetenida = await desactivar(d, mutante.id);
    registrar(`${etiqueta} baja con el fan-out detenido en el pedido`, bajaRetenida, [200]);
    await reteniendo;
    registrar(`${etiqueta} pago retenido`, await pagoRetenido, [200]);
    const avisosTrasLaBajaRetenida = avisosDelComercio(mutante.id, d.comercioId);
    if (avisosTrasLaBajaRetenida) problemas.push(`${etiqueta}: la baja hecha mientras el fan-out esperaba el pedido dejo ${avisosTrasLaBajaRetenida} avisos del comercio en el miembro dado de baja`);
    await Promise.all([
      ...aPagar.map((id) => esperar(aleatorio(400)).then(() => pagar(id)).then((r) => registrar(`${etiqueta} pagar`, r, [200]))),
      (async () => {
        for (let i = 0; i < 4; i++) {
          await esperar(aleatorio(40));
          registrar(`${etiqueta} desactivar`, await desactivar(d, mutante.id), [200]);
          await esperar(aleatorio(40));
          registrar(`${etiqueta} reactivar`, await reactivar(d, mutante.id), [200]);
        }
        await esperar(aleatorio(40));
        registrar(`${etiqueta} baja final`, await desactivar(d, mutante.id), [200]);
      })(),
    ]);
    if (estadoRelacion(d.comercioId, mutante.id) !== 'INACTIVO') problemas.push(`${etiqueta}: el miembro no quedo INACTIVO`);
    revisarFanOut(problemas, etiqueta, d, fijo, mutante, [...aPagar, retenido]);
    const { bajas } = revisarHistorialAlternado(problemas, etiqueta, d, mutante);
    const restantes = avisosDelComercio(mutante.id, d.comercioId);
    if (restantes) problemas.push(`${etiqueta}: el miembro dado de baja se quedo con ${restantes} avisos del comercio (el purgado tenia que dejarlo en 0)`);

    const comp = await comprador();
    const final = await pedidoPagado(comp, d.productoId);
    if (copias(mutante.id, final, 'NUEVO_PEDIDO') !== 0) problemas.push(`${etiqueta}: el miembro ya INACTIVO recibio un aviso del pedido final`);
    if (copias(d.duenoId, final, 'NUEVO_PEDIDO') !== 1 || copias(fijo.id, final, 'NUEVO_PEDIDO') !== 1) problemas.push(`${etiqueta}: el Dueño o el fijo no recibieron el aviso del pedido final`);
    console.log(`  ronda ${ronda}: ${aPagar.length} pedidos, ${bajas} bajas`);
  }
  return problemas;
}

const cerrarComo = (actor, comercioId) => call('PUT', '/comercios/cerrar', actor.token, undefined, cabecera(comercioId));
const abrirComo = (actor, comercioId) => call('PUT', '/comercios/abrir', actor.token, undefined, cabecera(comercioId));
const suspender = (admin, comercioId) => call('PUT', `/administrador/comercios/${comercioId}/suspender`, admin, { motivo: 'Suspension del estres E4' });
const loginFallido = (d) => call('POST', '/auth/login', null, { nombreUsuario: d.nombreUsuario, password: 'ClaveIncorrecta9' });

/** S8: desactivar y reactivar contra cerrar, abrir, datos operativos, la suspension del Administrador (con pedidos que cancelar) y el bloqueo de cuenta del Dueño. */
async function escenario8(admin) {
  console.log('--- S8: desactivar y reactivar contra las operaciones del comercio, la suspension y el bloqueo de cuenta');
  const { problemas, registrar } = nuevoRegistro();
  for (let ronda = 1; ronda <= ROUNDS; ronda++) {
    const modo = ['ninguno', 'suspender', 'bloquear'][ronda % 3];
    const d = await comercioListo(admin);
    const alternante = await empleadoDe(d);
    const escritor = await empleadoDe(d);
    const pagados = [];
    for (const c of await compradores(3)) pagados.push(await pedidoPagado(c, d.productoId));
    const etiqueta = `S8 ronda ${ronda} (${modo})`;
    const permitidosDueno = [200, 401, 409];
    const tareas = [
      (async () => {
        for (let i = 0; i < 10; i++) {
          await esperar(aleatorio(25));
          registrar(`${etiqueta} desactivar`, await desactivar(d, alternante.id), permitidosDueno);
          await esperar(aleatorio(25));
          registrar(`${etiqueta} reactivar`, await reactivar(d, alternante.id), permitidosDueno);
        }
      })(),
      (async () => {
        for (let i = 0; i < 12; i++) {
          await esperar(aleatorio(20));
          registrar(`${etiqueta} Empleado cerrar`, await cerrarComo(escritor, d.comercioId), [200, 409]);
          registrar(`${etiqueta} Empleado datos operativos`, await escribirComoEmpleado(escritor, d.comercioId, i), [200, 409]);
          registrar(`${etiqueta} Empleado abrir`, await abrirComo(escritor, d.comercioId), [200, 409]);
        }
      })(),
      (async () => {
        for (let i = 0; i < 14; i++) {
          await esperar(aleatorio(15));
          registrar(`${etiqueta} miembro alternado datos operativos`, await escribirComoEmpleado(alternante, d.comercioId, i), [200, 404, 409]);
          registrar(`${etiqueta} miembro alternado cerrar`, await cerrarComo(alternante, d.comercioId), [200, 404, 409]);
          registrar(`${etiqueta} miembro alternado abrir`, await abrirComo(alternante, d.comercioId), [200, 404, 409]);
        }
      })(),
      (async () => {
        for (let i = 0; i < 12; i++) {
          await esperar(aleatorio(20));
          registrar(`${etiqueta} Dueño cerrar`, await cerrarComo(d, d.comercioId), permitidosDueno);
          registrar(`${etiqueta} Dueño abrir`, await abrirComo(d, d.comercioId), permitidosDueno);
        }
      })(),
    ];
    if (modo === 'suspender') {
      tareas.push(esperar(60 + aleatorio(200)).then(async () => registrar(`${etiqueta} suspender`, await suspender(admin, d.comercioId), [200])));
    }
    if (modo === 'bloquear') {
      tareas.push(esperar(60 + aleatorio(200)).then(async () => {
        const resultados = await Promise.all([loginFallido(d), loginFallido(d), loginFallido(d), loginFallido(d)]);
        resultados.forEach((r) => registrar(`${etiqueta} login fallido`, r, [401, 409]));
      }));
    }
    await Promise.all(tareas);
    revisarHistorialAlternado(problemas, etiqueta, d, alternante);
    const estadoComercio = sql(`SELECT estado FROM comercio WHERE id = ${d.comercioId};`);
    if (modo === 'suspender' && estadoComercio !== 'SUSPENDIDO') problemas.push(`${etiqueta}: el comercio quedo ${estadoComercio} y tenia que ser SUSPENDIDO`);
    if (modo === 'bloquear' && !['CERRADO_TEMPORALMENTE', 'APTO_VENTA'].includes(estadoComercio)) problemas.push(`${etiqueta}: el comercio quedo ${estadoComercio}`);
    if (modo === 'suspender') {
      const sinCancelar = pagados.filter((id) => estadoPedido(id) === 'PENDIENTE_CONFIRMACION_COMERCIO').length;
      if (sinCancelar) problemas.push(`${etiqueta}: ${sinCancelar} pedidos pendientes quedaron sin cancelar por la suspension`);
    }
    if (estadoRelacion(d.comercioId, escritor.id) !== 'ACTIVO') problemas.push(`${etiqueta}: el Empleado que escribe dejo de estar ACTIVO`);
  }
  return problemas;
}

/** S9: desactivar y reactivar con cientos de avisos del comercio por purgar mientras entran avisos nuevos por el fan-out de pedidos pagados. */
async function escenario9(admin) {
  console.log('--- S9: purgado de cientos de avisos mientras entran avisos por fan-out');
  const { problemas, registrar } = nuevoRegistro();
  const PEDIDOS = Number(process.env.PEDIDOS_POR_RONDA || 8);
  const AVISOS = Number(process.env.AVISOS_SEMBRADOS || 400);
  for (let ronda = 1; ronda <= ROUNDS; ronda++) {
    const d = await comercioListo(admin);
    const fijo = await empleadoDe(d);
    const mutante = await empleadoDe(d);
    const aPagar = [];
    for (const c of await compradores(PEDIDOS)) aPagar.push(await pedidoSinPagar(c, d.productoId));
    const etiqueta = `S9 ronda ${ronda}`;
    sembrarAvisos(mutante.id, d.comercioId, AVISOS);
    const lector = async (actor, permitidos) => {
      for (let i = 0; i < 10; i++) {
        await esperar(aleatorio(20));
        registrar(`${etiqueta} lista de ${actor.id}`, await call('GET', '/notificaciones', actor.token, undefined, cabecera(d.comercioId)), permitidos);
        registrar(`${etiqueta} marcar todas de ${actor.id}`, await call('PUT', '/notificaciones/leidas', actor.token, {}, cabecera(d.comercioId)), permitidos);
      }
    };
    await Promise.all([
      lector(mutante, [200, 404]),
      lector(d, [200]),
      lector(fijo, [200]),
      ...aPagar.map((id) => esperar(aleatorio(500)).then(() => pagar(id)).then((r) => registrar(`${etiqueta} pagar`, r, [200]))),
      (async () => {
        for (let i = 0; i < 3; i++) {
          await esperar(aleatorio(40));
          registrar(`${etiqueta} desactivar`, await desactivar(d, mutante.id), [200]);
          registrar(`${etiqueta} reactivar`, await reactivar(d, mutante.id), [200]);
          sembrarAvisos(mutante.id, d.comercioId, AVISOS);
        }
        await esperar(aleatorio(40));
        registrar(`${etiqueta} baja final`, await desactivar(d, mutante.id), [200]);
      })(),
    ]);
    if (estadoRelacion(d.comercioId, mutante.id) !== 'INACTIVO') problemas.push(`${etiqueta}: el miembro no quedo INACTIVO`);
    revisarFanOut(problemas, etiqueta, d, fijo, mutante, aPagar);
    const { bajas } = revisarHistorialAlternado(problemas, etiqueta, d, mutante);
    const restantes = avisosDelComercio(mutante.id, d.comercioId);
    if (restantes) problemas.push(`${etiqueta}: quedaron ${restantes} avisos del comercio del miembro dado de baja`);
    const t32 = cuenta(`SELECT COUNT(*) FROM notificacion WHERE usuario_id = ${mutante.id} AND tipo = 'EMPLEADO_DESACTIVADO' AND comercio_id IS NULL;`);
    if (t32 !== bajas) problemas.push(`${etiqueta}: el aviso personal de baja (T32) sobrevivio ${t32} veces y hubo ${bajas} bajas`);
    console.log(`  ronda ${ronda}: ${aPagar.length} pedidos, ${bajas} bajas, ${AVISOS} avisos por purgada`);
  }
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
  LOC = await resolverLocalidad();
  const admin = (await call('POST', '/auth/login', null, ADMIN)).json.data.token;
  const categoria = await call('POST', '/categorias', admin, { nombre: BASE_CATEGORIA });
  if (categoria.status !== 201) throw new Error('categoria ' + JSON.stringify(categoria));
  categoriaId = categoria.json.data.id;
  const solo = process.env.ESCENARIO;
  const escenarios = [
    ['1', escenario1],
    ['2', escenario2],
    ['3', escenario3],
    ['4', escenario4],
    ['5', escenario5],
    ['6', escenario6],
    ['7', escenario7],
    ['8', escenario8],
    ['9', escenario9],
    ['10', escenario10],
  ];
  const todos = [];
  for (const [id, escenario] of escenarios) {
    if (!solo || solo === id) todos.push(...(await escenario(admin)));
  }
  todos.push(...revisarElLog(inicioLog));
  console.log(todos.length ? 'PROBLEMAS:\n' + todos.join('\n') : 'SIN PROBLEMAS (sin 5xx, historial y avisos coherentes, sin Deadlock ni Lock wait timeout en el log)');
  if (todos.length) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
