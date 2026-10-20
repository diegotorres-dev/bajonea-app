import { execFileSync, spawn } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';

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
  const email = `stresst1.${u}@bajonea.test`;
  const nombreUsuario = `sf${u}`.slice(0, 20);
  const password = clavePropia();
  const r = await call('POST', '/auth/registro/comercio', null, {
    aceptaTerminos: true,
    razonSocial: `StressT1 ${u} SRL`,
    cuit: cuit(),
    condicionIva: 'RESPONSABLE_INSCRIPTO',
    tipoSociedad: 'SRL',
    domicilioFiscal: 'Av. Stress 1',
    fechaInicioActividades: '2020-01-01',
    nombre: `StressT1 ${u}`,
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
  const email = `stresst1.cli.${u}@bajonea.test`;
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

const LOG_BACKEND = process.env.BACKEND_LOG || `${process.env.TEMP || '/tmp'}/backend-test.log`;
const NO_DISPONIBLE = JSON.stringify({ mensaje: 'Comercio no encontrado', data: { codigo: 'COMERCIO_NO_DISPONIBLE' } });
const BASE_CATEGORIA = `StressT1 ${uniq()}`;

const mysql = process.env.MYSQL_BIN || 'C:/xampp/mysql/bin/mysql.exe';

function desactivarMientrasOpera(comercioId, empleadoId, milisegundos) {
  const consulta = `START TRANSACTION; SELECT id FROM empleado_comercio WHERE empleado_id = ${empleadoId} AND comercio_id = ${comercioId} FOR UPDATE; ` +
    `SELECT SLEEP(${milisegundos / 1000}); UPDATE empleado_comercio SET estado = 'INACTIVO', fecha_baja = NOW() WHERE empleado_id = ${empleadoId} AND comercio_id = ${comercioId}; COMMIT;`;
  return new Promise((resolve, reject) => {
    const proceso = spawn(mysql, ['-u', 'root', '-N', '-B', 'bajonea_test', '-e', consulta], { stdio: 'ignore' });
    proceso.on('error', reject);
    proceso.on('exit', (codigo) => (codigo === 0 ? resolve() : reject(new Error('mysql termino con ' + codigo))));
  });
}


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
  d.imagenId = imagen.json.data.id;
  return d;
}

async function comprador() {
  const cuenta = await nuevoClienteVerificado();
  const login = await call('POST', '/auth/login', null, { nombreUsuario: cuenta.nombreUsuario, password: cuenta.password });
  if (login.status !== 200) throw new Error('login comprador ' + JSON.stringify(login));
  return { ...cuenta, token: login.json.data.token };
}

async function pedidoPendiente(cliente, productoId) {
  const agregado = await call('POST', '/carrito/items', cliente.token, { productoId, cantidad: 1 });
  if (agregado.status !== 201) throw new Error('carrito ' + JSON.stringify(agregado));
  const pedido = await call('POST', '/pedidos/cliente', cliente.token, { tipoEntrega: 'RETIRO', direccionId: null });
  if (pedido.status !== 201) throw new Error('pedido ' + JSON.stringify(pedido));
  const id = pedido.json.data.id;
  const pago = await call('PUT', `/test/pedidos/${id}/pago-aprobado?registrarPago=true`);
  if (pago.status !== 200) throw new Error('pago ' + JSON.stringify(pago));
  return id;
}

const datosOperativos = (actor, comercioId) => call('PUT', '/comercios/perfil/datos-operativos', actor.token, { descripcion: `Stress ${uniq()}`, telefono: tel() }, cabecera(comercioId));
const estadoProducto = (actor, d, estado) => call('PATCH', `/productos/${d.productoId}/estado`, actor.token, { estado }, cabecera(d.comercioId));
const reordenar = (actor, d) => call('PATCH', `/productos/${d.productoId}/imagenes/${d.imagenId}/orden`, actor.token, { orden: aleatorio(3) }, cabecera(d.comercioId));
const editarProducto = (actor, d) => call('PUT', `/productos/${d.productoId}`, actor.token, { nombre: `Producto ${uniq()}`, precio: 1000 + aleatorio(9000), categoriaId }, cabecera(d.comercioId));
const cerrar = (actor, comercioId) => call('PUT', '/comercios/cerrar', actor.token, {}, cabecera(comercioId));
const abrir = (actor, comercioId) => call('PUT', '/comercios/abrir', actor.token, {}, cabecera(comercioId));
const accionPedido = (actor, comercioId, pedidoId, accion) =>
  call('PUT', `/pedidos/comercio/${pedidoId}/${accion}`, actor.token,
    accion === 'rechazar' || accion === 'anular' ? { motivo: 'SIN_STOCK' } : {}, cabecera(comercioId));
const loginIncorrecto = (d) => call('POST', '/auth/login', null, { nombreUsuario: d.nombreUsuario, password: 'ClaveIncorrecta1' });

const contar = (resumen, clave) => {
  resumen[clave] = (resumen[clave] ?? 0) + 1;
};
const resumir = (resumen) => Object.entries(resumen).sort(([a], [b]) => a.localeCompare(b)).map(([k, n]) => `${k}=${n}`).join(' ');

function nuevoRegistro() {
  const problemas = [];
  return {
    problemas,
    registrar: (etiqueta, r, permitidos) => {
      if (r.status >= 500) problemas.push(`${etiqueta}: ${r.status} ${JSON.stringify(r.json)}`);
      else if (!permitidos.includes(r.status)) problemas.push(`${etiqueta}: estado inesperado ${r.status} ${JSON.stringify(r.json)}`);
      if (r.status === 404 && JSON.stringify(r.json) !== NO_DISPONIBLE && !/no encontrado/i.test(r.json?.mensaje ?? '')) {
        problemas.push(`${etiqueta}: 404 con cuerpo inesperado ${JSON.stringify(r.json)}`);
      }
    },
  };
}

const DIAS = ['LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO', 'DOMINGO'];
const version = (n) => {
  const cantidad = (n % 3) + 1;
  return Array.from({ length: cantidad }, (_, i) => ({ diaSemana: DIAS[(n + i) % 7], horaApertura: `0${8 + (n % 4)}:00`.slice(-5), horaCierre: `${14 + (n % 4)}:00` }));
};
const editar = (actor, comercioId, n) => call('PUT', '/comercios/perfil/horarios', actor.token, { horarios: version(n) }, cabecera(comercioId));
const diaAnterior = (fecha) => new Date(Date.parse(fecha + 'T00:00:00Z') - 86400000).toISOString().slice(0, 10);
const cuenta = (consulta) => Number(sql(consulta));

function invariantesDeVersiones(problemas, ronda, comercioId, hoy, filasBase) {
  const cerradas = cuenta(`SELECT COUNT(*) FROM horario WHERE comercio_id = ${comercioId} AND vigente_hasta IS NOT NULL;`);
  if (cerradas !== filasBase) problemas.push(`ronda ${ronda}: ${cerradas} filas cerradas (tienen que ser las ${filasBase} de la version de partida)`);
  const vigentes = cuenta(`SELECT COUNT(*) FROM horario WHERE comercio_id = ${comercioId} AND vigente_desde <= '${hoy}' AND (vigente_hasta IS NULL OR vigente_hasta >= '${hoy}');`);
  if (vigentes !== filasBase) problemas.push(`ronda ${ronda}: ${vigentes} filas vigentes hoy (tienen que ser ${filasBase}: la version de partida)`);
  const desdes = sql(`SELECT DISTINCT vigente_desde FROM horario WHERE comercio_id = ${comercioId} AND vigente_desde > '${hoy}';`).split('\n').filter(Boolean);
  if (desdes.length > 1) problemas.push(`ronda ${ronda}: filas pendientes de mas de una generacion (${desdes.join(', ')})`);
  const pendientesCerradas = cuenta(`SELECT COUNT(*) FROM horario WHERE comercio_id = ${comercioId} AND vigente_desde > '${hoy}' AND vigente_hasta IS NOT NULL;`);
  if (pendientesCerradas) problemas.push(`ronda ${ronda}: ${pendientesCerradas} filas pendientes con vigente_hasta`);
}

async function escenario1(admin) {
  console.log('--- (1) ediciones simultaneas del Dueno y de dos Empleados sobre el mismo comercio ---');
  const { problemas, registrar } = nuevoRegistro();
  const resumen = {};
  for (let ronda = 1; ronda <= ROUNDS; ronda++) {
    const d = await comercioListo(admin);
    const empleados = [await empleadoDe(d, [d.comercioId]), await empleadoDe(d, [d.comercioId])];
    const actores = [d, ...empleados];
    const resultados = await Promise.all(Array.from({ length: 9 }, (_, i) => editar(actores[i % 3], d.comercioId, i).then((r) => ({ r }))));
    let rige = null;
    for (const { r } of resultados) {
      contar(resumen, `editar:${r.status}`);
      registrar(`ronda ${ronda} editar`, r, [200]);
      if (r.status === 200) rige = r.json.data.rigeDesde ?? rige;
    }
    if (!rige) {
      problemas.push(`ronda ${ronda}: ninguna edicion informo rigeDesde`);
      continue;
    }
    invariantesDeVersiones(problemas, ronda, d.comercioId, diaAnterior(rige), 7);
    const historial = cuenta(`SELECT COUNT(*) FROM historial_edicion_comercio WHERE comercio_id = ${d.comercioId} AND entidad_tipo = 'HORARIO';`);
    if (historial !== 9) problemas.push(`ronda ${ronda}: ${historial} filas de historial de horarios (tienen que ser 9: cada edicion cambio algo)`);
  }
  console.log('Resumen (1):', resumir(resumen));
  return problemas;
}

async function escenario2(admin) {
  console.log('--- (2) edicion contra cerrar, abrir y la reapertura automatica ---');
  const { problemas, registrar } = nuevoRegistro();
  const resumen = {};
  for (let ronda = 1; ronda <= ROUNDS; ronda++) {
    const d = await comercioListo(admin);
    const empleado = await empleadoDe(d, [d.comercioId]);
    const futuro = new Date(Date.now() + 20 * 86400000).toISOString().slice(0, 19);
    const tareas = [
      ...Array.from({ length: 3 }, (_, i) => editar(i % 2 ? empleado : d, d.comercioId, i).then((r) => ({ tipo: 'editar', r }))),
      ...Array.from({ length: 2 }, () => cerrar(d, d.comercioId).then((r) => ({ tipo: 'cerrar', r }))),
      ...Array.from({ length: 2 }, () => abrir(empleado, d.comercioId).then((r) => ({ tipo: 'abrir', r }))),
      ...Array.from({ length: 2 }, () => call('POST', `/test/jobs/reapertura-comercios?ahora=${encodeURIComponent(futuro)}`).then((r) => ({ tipo: 'reapertura', r }))),
    ];
    const resultados = await Promise.all(tareas);
    for (const { tipo, r } of resultados) {
      contar(resumen, `${tipo}:${r.status}`);
      registrar(`ronda ${ronda} ${tipo}`, r, [200]);
    }
    const bandera = sql(`SELECT cerrado_manualmente FROM comercio WHERE id = ${d.comercioId};`);
    const ultima = sql(`SELECT accion FROM historial_cierre_comercio WHERE comercio_id = ${d.comercioId} ORDER BY fecha_hora DESC, id DESC LIMIT 1;`);
    if (ultima && (bandera === '1') !== (ultima === 'CERRADO')) problemas.push(`ronda ${ronda}: bandera ${bandera} y ultima fila de cierre ${ultima}`);
    const abiertas = cuenta(`SELECT COUNT(*) FROM horario WHERE comercio_id = ${d.comercioId} AND vigente_hasta IS NULL;`);
    if (abiertas < 1) problemas.push(`ronda ${ronda}: el comercio quedo sin filas abiertas`);
  }
  console.log('Resumen (2):', resumir(resumen));
  return problemas;
}

async function escenario3(admin) {
  console.log('--- (3) edicion contra el bloqueo de cuenta del Dueno y la suspension del Administrador ---');
  const { problemas, registrar } = nuevoRegistro();
  const resumen = {};
  for (let ronda = 1; ronda <= ROUNDS; ronda++) {
    const d = await comercioListo(admin);
    const empleado = await empleadoDe(d, [d.comercioId]);
    const tareas = [
      ...Array.from({ length: 3 }, () => loginIncorrecto(d).then((r) => ({ tipo: 'login', r }))),
      ...Array.from({ length: 4 }, (_, i) => editar(i % 2 ? empleado : d, d.comercioId, i).then((r) => ({ tipo: 'editar', r }))),
      esperar(aleatorio(30)).then(() => call('PUT', `/administrador/comercios/${d.comercioId}/suspender`, admin, { motivo: 'Suspension de estres' })).then((r) => ({ tipo: 'suspender', r })),
    ];
    const resultados = await Promise.all(tareas);
    for (const { tipo, r } of resultados) {
      contar(resumen, `${tipo}:${r.status}`);
      if (tipo === 'login') registrar(`ronda ${ronda} login`, r, [200, 401, 409]);
      else if (tipo === 'suspender') registrar(`ronda ${ronda} suspender`, r, [200, 409]);
      else registrar(`ronda ${ronda} editar`, r, [200, 401, 404, 409]);
    }
    const abiertas = cuenta(`SELECT COUNT(*) FROM horario WHERE comercio_id = ${d.comercioId} AND vigente_hasta IS NULL;`);
    if (abiertas < 1) problemas.push(`ronda ${ronda}: el comercio quedo sin filas abiertas`);
  }
  console.log('Resumen (3):', resumir(resumen));
  return problemas;
}

async function escenario4(admin) {
  console.log('--- (4) edicion del Empleado contra su desactivacion ---');
  const { problemas, registrar } = nuevoRegistro();
  const resumen = {};
  for (let ronda = 1; ronda <= ROUNDS; ronda++) {
    const d = await comercioListo(admin);
    const empleado = await empleadoDe(d, [d.comercioId]);
    const retenida = desactivarMientrasOpera(d.comercioId, empleado.id, 1500);
    await esperar(300);
    const resultados = await Promise.all(Array.from({ length: 3 }, (_, i) => editar(empleado, d.comercioId, i).then((r) => ({ r }))));
    await retenida;
    const filas = cuenta(`SELECT COUNT(*) FROM historial_edicion_comercio WHERE comercio_id = ${d.comercioId} AND usuario_id = ${empleado.id} AND entidad_tipo = 'HORARIO';`);
    for (const { r } of resultados) {
      contar(resumen, `editar:${r.status}`);
      registrar(`ronda ${ronda} editar`, r, [200, 404]);
      if (r.status === 404 && JSON.stringify(r.json) !== NO_DISPONIBLE) problemas.push(`ronda ${ronda}: 404 con cuerpo inesperado ${JSON.stringify(r.json)}`);
    }
    const exitos = resultados.filter(({ r }) => r.status === 200).length;
    if (filas !== exitos) problemas.push(`ronda ${ronda}: ${exitos} ediciones respondieron 200 y hay ${filas} filas de historial`);
    const despues = await editar(empleado, d.comercioId, 5);
    if (despues.status !== 404) problemas.push(`ronda ${ronda}: tras la desactivacion la edicion dio ${despues.status} en vez de 404`);
  }
  console.log('Resumen (4):', resumir(resumen));
  return problemas;
}

async function escenario5(admin) {
  console.log('--- (5) lecturas del catalogo, mis comercios y el perfil durante las ediciones ---');
  const { problemas, registrar } = nuevoRegistro();
  const resumen = {};
  for (let ronda = 1; ronda <= ROUNDS; ronda++) {
    const d = await comercioListo(admin);
    const empleado = await empleadoDe(d, [d.comercioId]);
    let seguir = true;
    let lecturas = 0;
    const lector = async () => {
      while (seguir) {
        const catalogo = await call('GET', '/catalogo/comercios');
        const mis = await call('GET', '/comercios/mis-comercios', d.token);
        const perfil = await call('GET', '/comercios/perfil', d.token, undefined, cabecera(d.comercioId));
        const delEmpleado = await call('GET', '/comercios/perfil', empleado.token, undefined, cabecera(d.comercioId));
        lecturas += 1;
        registrar(`ronda ${ronda} catalogo`, catalogo, [200]);
        registrar(`ronda ${ronda} mis-comercios`, mis, [200]);
        registrar(`ronda ${ronda} perfil`, perfil, [200]);
        registrar(`ronda ${ronda} perfil empleado`, delEmpleado, [200]);
        const fila = catalogo.json?.data?.find((c) => c.id === d.comercioId);
        if (fila && fila.horarios.length !== 7) problemas.push(`ronda ${ronda}: el catalogo mostro ${fila.horarios.length} franjas (tienen que ser las 7 vigentes)`);
        if (perfil.json?.data && perfil.json.data.horarios.length !== 7) problemas.push(`ronda ${ronda}: el perfil mostro ${perfil.json.data.horarios.length} franjas vigentes`);
        if (delEmpleado.json?.data && delEmpleado.json.data.horarios.length !== 7) problemas.push(`ronda ${ronda}: el perfil del Empleado mostro ${delEmpleado.json.data.horarios.length} franjas vigentes`);
        const miComercio = mis.json?.data?.find((c) => c.id === d.comercioId);
        if (miComercio && typeof miComercio.abiertoAhora !== 'boolean') problemas.push(`ronda ${ronda}: mis-comercios sin abiertoAhora`);
      }
    };
    const lectores = [lector(), lector()];
    for (let i = 0; i < 8; i++) {
      const r = await editar(i % 2 ? empleado : d, d.comercioId, i);
      contar(resumen, `editar:${r.status}`);
      registrar(`ronda ${ronda} editar`, r, [200]);
    }
    seguir = false;
    await Promise.all(lectores);
    contar(resumen, `lecturas:${lecturas > 0 ? 'con' : 'sin'}`);
    if (lecturas === 0) problemas.push(`ronda ${ronda}: no hubo lecturas`);
  }
  console.log('Resumen (5):', resumir(resumen));
  return problemas;
}

async function escenario6(admin) {
  console.log('--- (6) edicion contra confirmar pedido y la edicion y alta de productos ---');
  const { problemas, registrar } = nuevoRegistro();
  const resumen = {};
  for (let ronda = 1; ronda <= ROUNDS; ronda++) {
    const d = await comercioListo(admin);
    const empleado = await empleadoDe(d, [d.comercioId]);
    const cliente = await comprador();
    const agregado = await call('POST', '/carrito/items', cliente.token, { productoId: d.productoId, cantidad: 1 });
    if (agregado.status !== 201) throw new Error('carrito ' + JSON.stringify(agregado));
    const tareas = [
      ...Array.from({ length: 3 }, (_, i) => editar(i % 2 ? empleado : d, d.comercioId, i).then((r) => ({ tipo: 'editar', r }))),
      call('POST', '/pedidos/cliente', cliente.token, { tipoEntrega: 'RETIRO', direccionId: null }).then((r) => ({ tipo: 'pedido', r })),
      call('POST', '/productos', empleado.token, { nombre: `Producto ${uniq()}`, precio: 1200, categoriaId }, cabecera(d.comercioId)).then((r) => ({ tipo: 'alta', r })),
      call('PUT', `/productos/${d.productoId}`, d.token, { nombre: `Producto ${uniq()}`, precio: 1000 + aleatorio(9000), categoriaId }, cabecera(d.comercioId)).then((r) => ({ tipo: 'producto', r })),
      datosOperativos(empleado, d.comercioId).then((r) => ({ tipo: 'datos', r })),
    ];
    const resultados = await Promise.all(tareas);
    for (const { tipo, r } of resultados) {
      contar(resumen, `${tipo}:${r.status}`);
      registrar(`ronda ${ronda} ${tipo}`, r, tipo === 'pedido' ? [201, 409] : tipo === 'alta' ? [201] : [200]);
    }
  }
  console.log('Resumen (6):', resumir(resumen));
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
  const escenarios = [escenario1, escenario2, escenario3, escenario4, escenario5, escenario6];
  const todos = [];
  for (let i = 0; i < escenarios.length; i++) {
    if (!solo || solo === String(i + 1)) todos.push(...(await escenarios[i](admin)));
  }
  todos.push(...revisarElLog(inicioLog));
  console.log(todos.length ? 'PROBLEMAS:\n' + todos.join('\n') : 'SIN PROBLEMAS (sin 5xx, sin inconsistencias, sin Deadlock ni Lock wait timeout en el log)');
  if (todos.length) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
