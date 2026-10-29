import { execFileSync } from 'node:child_process';

const B = process.env.E2E_API_BASE_URL || 'http://localhost:8080/api/v1';
const ROUNDS = Number(process.env.ROUNDS || 10);
const ADMIN = { nombreUsuario: 'adminbajonea', password: process.env.ADMIN_PASSWORD };
const sqlUnaVez = (q) => execFileSync(process.env.MYSQL_BIN || 'C:/xampp/mysql/bin/mysql.exe', ['-u', 'root', '-N', '-B', 'bajonea_test', '-e', q]).toString().trim();
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
  const localidad = localidades.find((l) => /r[ií]o grande/i.test(l.nombre));
  return localidad.id;
}

const direccion = () => ({ calle: 'Stress', numero: '1', pisoDepto: null, codigoPostal: '9420', localidadId: LOC, principal: true });

async function nuevoDueno() {
  const u = uniq();
  const email = `stresse2.${u}@bajonea.test`;
  const nombreUsuario = `sf${u}`.slice(0, 20);
  const password = clavePropia();
  const r = await call('POST', '/auth/registro/comercio', null, {
    aceptaTerminos: true,
    razonSocial: `StressE2 ${u} SRL`,
    cuit: cuit(),
    condicionIva: 'RESPONSABLE_INSCRIPTO',
    tipoSociedad: 'SRL',
    domicilioFiscal: 'Av. Stress 1',
    fechaInicioActividades: '2020-01-01',
    nombre: `StressE2 ${u}`,
    descripcion: 'x',
    telefono: tel(),
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
    redesSociales: [{ tipo: 'INSTAGRAM', url: `https://instagram.com/sf${u}` }],
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
  const email = `stresse2.cli.${u}@bajonea.test`;
  const nombreUsuario = `sg${u}`.slice(0, 20);
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

async function empleadoDe(dueno, comercioIds) {
  const cuenta = await nuevoClienteVerificado();
  for (const comercioId of comercioIds) {
    const inv = await call('POST', '/comercios/equipo/invitaciones', dueno.token, { email: cuenta.email }, cabecera(comercioId));
    if (inv.status !== 201) throw new Error('invitar ' + JSON.stringify(inv));
    const codigo = (await call('GET', `/test/invitaciones-empleado/codigo?email=${encodeURIComponent(cuenta.email)}&comercioId=${comercioId}`)).json.data;
    const acep = await call('POST', '/auth/invitaciones-empleado/aceptar', null, { email: cuenta.email, codigo });
    if (acep.status !== 200) throw new Error('aceptar ' + JSON.stringify(acep));
  }
  const login = await call('POST', '/auth/login', null, { nombreUsuario: cuenta.nombreUsuario, password: cuenta.password });
  if (login.status !== 200) throw new Error('login empleado ' + JSON.stringify(login));
  return { ...cuenta, token: login.json.data.token, id: login.json.data.usuario.id };
}

const LECTURAS = ['/comercios/perfil', '/productos', '/pedidos/comercio', '/pedidos/comercio/resumen-turno'];
const leer = (empleado, comercioId, ruta) => call('GET', ruta, empleado.token, undefined, cabecera(comercioId));
const atajoRelacion = (comercioId, empleadoId, estado) => call('PUT', `/test/comercios/${comercioId}/empleados/${empleadoId}/estado?estado=${estado}`);
const estadoComercio = (comercioId, estado) => sql(estado === 'SUSPENDIDO'
  ? `UPDATE comercio SET estado = 'SUSPENDIDO', suspension_origen = 'INDIVIDUAL', suspendido_desde = NOW(), motivo_suspension = 'Suspension de la prueba de estres' WHERE id = ${comercioId};`
  : `UPDATE comercio SET estado = '${estado}', suspension_origen = NULL, suspendido_desde = NULL, motivo_suspension = NULL WHERE id = ${comercioId};`);

function nuevoRegistro() {
  const problemas = [];
  return {
    problemas,
    registrar: (etiqueta, r, permitidos) => {
      if (r.status >= 500) problemas.push(`${etiqueta}: ${r.status} ${JSON.stringify(r.json)}`);
      else if (!permitidos.includes(r.status)) problemas.push(`${etiqueta}: estado inesperado ${r.status} ${JSON.stringify(r.json)}`);
      if (r.status === 404 && JSON.stringify(r.json) !== JSON.stringify({ mensaje: 'Comercio no encontrado', data: { codigo: 'COMERCIO_NO_DISPONIBLE' } })) {
        problemas.push(`${etiqueta}: 404 con cuerpo distinto ${JSON.stringify(r.json)}`);
      }
    },
  };
}

const contar = (resumen, clave) => {
  resumen[clave] = (resumen[clave] ?? 0) + 1;
};
const resumir = (resumen) => Object.entries(resumen).sort(([a], [b]) => a.localeCompare(b)).map(([k, n]) => `${k}=${n}`).join(' ');

async function escenario1(admin) {
  console.log('S1: lecturas concurrentes mientras la relación pasa de ACTIVO a INACTIVO y de vuelta');
  const { problemas, registrar } = nuevoRegistro();
  const resumen = {};
  const dueno = await duenoAprobado(admin);
  const comercioId = await clonar(dueno.comercioId);
  const empleado = await empleadoDe(dueno, [comercioId]);

  for (let ronda = 1; ronda <= ROUNDS; ronda++) {
    const tareas = [];
    for (let i = 0; i < 24; i++) {
      const ruta = LECTURAS[i % LECTURAS.length];
      tareas.push(esperar(aleatorio(60)).then(() => leer(empleado, comercioId, ruta)).then((r) => ({ etiqueta: `ronda ${ronda} ${ruta}`, r })));
    }
    tareas.push(esperar(aleatorio(30)).then(() => atajoRelacion(comercioId, empleado.id, 'INACTIVO')).then((r) => ({ etiqueta: `ronda ${ronda} inactivar`, r, atajo: true })));
    tareas.push(esperar(aleatorio(60)).then(() => atajoRelacion(comercioId, empleado.id, 'ACTIVO')).then((r) => ({ etiqueta: `ronda ${ronda} activar`, r, atajo: true })));
    tareas.push(esperar(aleatorio(60)).then(() => atajoRelacion(comercioId, empleado.id, 'INACTIVO')).then((r) => ({ etiqueta: `ronda ${ronda} inactivar 2`, r, atajo: true })));
    const resultados = await Promise.all(tareas);
    resultados.forEach(({ etiqueta, r, atajo }) => {
      registrar(etiqueta, r, atajo ? [200] : [200, 404]);
      contar(resumen, `${atajo ? 'atajo' : 'lectura'}:${r.status}`);
    });

    const finalActivo = sql(`SELECT estado FROM empleado_comercio WHERE empleado_id = ${empleado.id} AND comercio_id = ${comercioId};`);
    for (const ruta of LECTURAS) {
      const r = await leer(empleado, comercioId, ruta);
      const esperado = finalActivo === 'ACTIVO' ? 200 : 404;
      if (r.status !== esperado) problemas.push(`ronda ${ronda}: ${ruta} tras estado final ${finalActivo}: ${r.status}`);
    }
    await atajoRelacion(comercioId, empleado.id, 'ACTIVO');
  }
  console.log('Resumen (S1):', resumir(resumen));
  return problemas;
}

async function escenario2(admin) {
  console.log('S2: lecturas concurrentes mientras el estado del comercio cambia entre accesibles y no accesibles');
  const { problemas, registrar } = nuevoRegistro();
  const resumen = {};
  const dueno = await duenoAprobado(admin);
  const comercioId = await clonar(dueno.comercioId);
  const empleado = await empleadoDe(dueno, [comercioId]);
  const secuencia = ['SUSPENDIDO', 'CERRADO_TEMPORALMENTE', 'PENDIENTE', 'APTO_VENTA', 'RECHAZADO', 'APROBADO'];

  for (let ronda = 1; ronda <= ROUNDS; ronda++) {
    const tareas = [];
    for (let i = 0; i < 24; i++) {
      const ruta = LECTURAS[i % LECTURAS.length];
      tareas.push(esperar(aleatorio(80)).then(() => leer(empleado, comercioId, ruta)).then((r) => ({ etiqueta: `ronda ${ronda} ${ruta}`, r })));
    }
    for (const estado of secuencia) {
      tareas.push(esperar(aleatorio(80)).then(() => estadoComercio(comercioId, estado)).then(() => ({ etiqueta: 'cambio', r: { status: 200, json: null } })));
    }
    const resultados = await Promise.all(tareas);
    resultados.forEach(({ etiqueta, r }) => {
      registrar(etiqueta, r, [200, 404]);
      contar(resumen, `${etiqueta === 'cambio' ? 'cambio' : 'lectura'}:${r.status}`);
    });
    estadoComercio(comercioId, 'APROBADO');
    for (const ruta of LECTURAS) {
      const r = await leer(empleado, comercioId, ruta);
      if (r.status !== 200) problemas.push(`ronda ${ronda}: ${ruta} con el comercio APROBADO: ${r.status}`);
    }
  }
  console.log('Resumen (S2):', resumir(resumen));
  return problemas;
}

async function escenario3(admin) {
  console.log('S3: mis-comercios del Empleado concurrente con cambios de relación y de estado');
  const { problemas, registrar } = nuevoRegistro();
  const resumen = {};
  const dueno = await duenoAprobado(admin);
  const comercios = [dueno.comercioId, await clonar(dueno.comercioId), await clonar(dueno.comercioId), await clonar(dueno.comercioId)];
  const empleado = await empleadoDe(dueno, comercios);

  for (let ronda = 1; ronda <= ROUNDS; ronda++) {
    const tareas = [];
    for (let i = 0; i < 16; i++) {
      tareas.push(
        esperar(aleatorio(60))
          .then(() => call('GET', '/empleados/mis-comercios', empleado.token))
          .then((r) => ({ etiqueta: `ronda ${ronda} mis-comercios`, r, lista: true })),
      );
    }
    tareas.push(esperar(aleatorio(40)).then(() => atajoRelacion(comercios[1], empleado.id, 'INACTIVO')).then((r) => ({ etiqueta: 'atajo 1', r })));
    tareas.push(esperar(aleatorio(40)).then(() => atajoRelacion(comercios[2], empleado.id, 'INACTIVO')).then((r) => ({ etiqueta: 'atajo 2', r })));
    tareas.push(esperar(aleatorio(60)).then(() => estadoComercio(comercios[3], 'PENDIENTE')).then(() => ({ etiqueta: 'cambio', r: { status: 200, json: null } })));
    tareas.push(esperar(aleatorio(60)).then(() => atajoRelacion(comercios[1], empleado.id, 'ACTIVO')).then((r) => ({ etiqueta: 'atajo 3', r })));
    const resultados = await Promise.all(tareas);
    resultados.forEach(({ etiqueta, r, lista }) => {
      registrar(etiqueta, r, [200]);
      contar(resumen, `${lista ? 'lista' : 'cambio'}:${r.status}`);
      if (lista && r.status === 200) {
        const ids = r.json.data.map((c) => c.id);
        if (new Set(ids).size !== ids.length) problemas.push(`${etiqueta}: ids repetidos ${ids}`);
        if (ids.some((id) => !comercios.includes(id))) problemas.push(`${etiqueta}: ids ajenos ${ids}`);
        if (!ids.includes(comercios[0])) problemas.push(`${etiqueta}: falta el comercio que nunca cambia ${ids}`);
        const altas = r.json.data.map((c) => c.fechaAlta);
        if (JSON.stringify([...altas].sort()) !== JSON.stringify(altas)) problemas.push(`${etiqueta}: fuera de orden de alta ${altas}`);
      }
    });
    estadoComercio(comercios[3], 'APROBADO');
    await atajoRelacion(comercios[1], empleado.id, 'ACTIVO');
    await atajoRelacion(comercios[2], empleado.id, 'ACTIVO');
    const final = await call('GET', '/empleados/mis-comercios', empleado.token);
    if (final.json.data.map((c) => c.id).join() !== comercios.join()) problemas.push(`ronda ${ronda}: lista final ${final.json.data.map((c) => c.id)} en vez de ${comercios}`);
  }
  console.log('Resumen (S3):', resumir(resumen));
  return problemas;
}

async function escenario4(admin) {
  console.log('S4: el Dueño abre y cierra el comercio, edita y lee mientras el Empleado lee');
  const { problemas, registrar } = nuevoRegistro();
  const resumen = {};
  const dueno = await duenoAprobado(admin);
  const comercioId = dueno.comercioId;
  const empleado = await empleadoDe(dueno, [comercioId]);

  for (let ronda = 1; ronda <= ROUNDS; ronda++) {
    const tareas = [];
    for (let i = 0; i < 24; i++) {
      const ruta = LECTURAS[i % LECTURAS.length];
      tareas.push(esperar(aleatorio(60)).then(() => leer(empleado, comercioId, ruta)).then((r) => ({ etiqueta: `ronda ${ronda} empleado ${ruta}`, r, permitidos: [200] })));
    }
    for (let i = 0; i < 6; i++) {
      tareas.push(
        esperar(aleatorio(60))
          .then(() => call('PUT', i % 2 === 0 ? '/comercios/cerrar' : '/comercios/abrir', dueno.token, undefined, cabecera(comercioId)))
          .then((r) => ({ etiqueta: `ronda ${ronda} dueño cerrar/abrir`, r, permitidos: [200, 409] })),
      );
    }
    for (const ruta of LECTURAS) {
      tareas.push(esperar(aleatorio(60)).then(() => leer(dueno, comercioId, ruta)).then((r) => ({ etiqueta: `ronda ${ronda} dueño ${ruta}`, r, permitidos: [200] })));
    }
    const resultados = await Promise.all(tareas);
    resultados.forEach(({ etiqueta, r, permitidos }) => {
      registrar(etiqueta, r, permitidos);
      contar(resumen, `${etiqueta.includes('empleado') ? 'empleado' : etiqueta.includes('cerrar') ? 'cierre' : 'dueño'}:${r.status}`);
    });
    await call('PUT', '/comercios/abrir', dueno.token, undefined, cabecera(comercioId));
  }
  console.log('Resumen (S4):', resumir(resumen));
  return problemas;
}

async function main() {
  LOC = await resolverLocalidad();
  const admin = (await call('POST', '/auth/login', null, ADMIN)).json.data.token;
  const solo = process.env.ESCENARIO;
  const escenarios = [escenario1, escenario2, escenario3, escenario4];
  const todos = [];
  for (let i = 0; i < escenarios.length; i++) {
    if (!solo || solo === String(i + 1)) todos.push(...(await escenarios[i](admin)));
  }
  console.log(todos.length ? 'PROBLEMAS:\n' + todos.join('\n') : 'SIN PROBLEMAS (solo 200 o 404, sin 5xx, sin inconsistencias)');
  if (todos.length) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
