import { execFileSync, spawn } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';

const B = process.env.E2E_API_BASE_URL || 'http://localhost:8080/api/v1';
const ROUNDS = Number(process.env.ROUNDS || 6);
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
  const email = `stressa5.${u}@bajonea.test`;
  const nombreUsuario = `sf${u}`.slice(0, 20);
  const password = clavePropia();
  const r = await call('POST', '/auth/registro/comercio', null, {
    razonSocial: `StressA5 ${u} SRL`,
    cuit: cuit(),
    condicionIva: 'RESPONSABLE_INSCRIPTO',
    tipoSociedad: 'SRL',
    domicilioFiscal: 'Av. Stress 1',
    fechaInicioActividades: '2020-01-01',
    nombre: `StressA5 ${u}`,
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
  const email = `stressa5.cli.${u}@bajonea.test`;
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
const BASE_CATEGORIA = `StressA5 ${uniq()}`;

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
      if (r.status === 404 && JSON.stringify(r.json) !== NO_DISPONIBLE && !/no encontrad[oa]/i.test(r.json?.mensaje ?? '')) {
        problemas.push(`${etiqueta}: 404 con cuerpo inesperado ${JSON.stringify(r.json)}`);
      }
    },
  };
}

const filasDeEdicion = (comercioId, usuarioId) => Number(sql(`SELECT COUNT(*) FROM historial_edicion_comercio WHERE comercio_id = ${comercioId} AND usuario_id = ${usuarioId};`));

const URL_VALIDA = 'https://res.cloudinary.com/demo/image/upload/v1/matriz.png';
const idDeLaRelacion = (comercioId, empleadoId) => sql(`SELECT id FROM empleado_comercio WHERE empleado_id = ${empleadoId} AND comercio_id = ${comercioId};`);

function desactivarPorIdMientrasOpera(relacionId, milisegundos) {
  const consulta = `START TRANSACTION; SELECT id FROM empleado_comercio WHERE id = ${relacionId} FOR UPDATE; ` +
    `SELECT SLEEP(${milisegundos / 1000}); UPDATE empleado_comercio SET estado = 'INACTIVO', fecha_baja = NOW() WHERE id = ${relacionId}; COMMIT;`;
  return new Promise((resolve, reject) => {
    const proceso = spawn(mysql, ['-u', 'root', '-N', '-B', 'bajonea_test', '-e', consulta], { stdio: 'ignore' });
    proceso.on('error', reject);
    proceso.on('exit', (codigo) => (codigo === 0 ? resolve() : reject(new Error('mysql termino con ' + codigo))));
  });
}

async function pedidoEn(d, cliente, estado) {
  const id = await pedidoPendiente(cliente, d.productoId);
  if (estado === 'PENDIENTE') return id;
  const aceptado = await call('PUT', `/pedidos/comercio/${id}/aceptar`, d.token, {}, cabecera(d.comercioId));
  if (aceptado.status !== 200) throw new Error('aceptar previo ' + JSON.stringify(aceptado));
  if (estado === 'PREPARACION') return id;
  const despachado = await call('PUT', `/pedidos/comercio/${id}/despachar`, d.token, {}, cabecera(d.comercioId));
  if (despachado.status !== 200) throw new Error('despachar previo ' + JSON.stringify(despachado));
  if (estado === 'LISTO_VIEJO') {
    const viejo = await call('PUT', `/test/pedidos/${id}/envejecer-listo?minutos=61`);
    if (viejo.status !== 200) throw new Error('envejecer ' + JSON.stringify(viejo));
  }
  return id;
}

async function prepararEscrituras(d, cliente) {
  const aceptar = await pedidoEn(d, cliente, 'PENDIENTE');
  const rechazar = await pedidoEn(d, cliente, 'PENDIENTE');
  const despachar = await pedidoEn(d, cliente, 'PREPARACION');
  const anular = await pedidoEn(d, cliente, 'PREPARACION');
  const entregar = await pedidoEn(d, cliente, 'LISTO');
  const noRetirado = await pedidoEn(d, cliente, 'LISTO_VIEJO');
  const sobrante = await call('POST', `/productos/${d.productoId}/imagenes`, d.token,
    { url: `https://res.cloudinary.com/${d.nube}/image/upload/v1/productos/${d.comercioId}/${d.productoId}/sobrante-${uniq()}.png`, orden: 1, esPrincipal: false }, cabecera(d.comercioId));
  if (sobrante.status !== 201) throw new Error('imagen sobrante ' + JSON.stringify(sobrante));
  return { aceptar, rechazar, despachar, anular, entregar, noRetirado, imagenSobrante: sobrante.json.data.id };
}

function las18Escrituras(actor, d, p) {
  const h = cabecera(d.comercioId);
  const c = d.comercioId;
  const url = (sufijo) => `https://res.cloudinary.com/${d.nube}/image/upload/v1/productos/${c}/${d.productoId}/${sufijo}-${uniq()}.png`;
  return [
    ['crear-producto', () => call('POST', '/productos', actor.token, { nombre: `Producto ${uniq()}`, precio: 1200, categoriaId }, h)],
    ['editar-producto', () => call('PUT', `/productos/${d.productoId}`, actor.token, { nombre: `Producto ${uniq()}`, precio: 1000 + aleatorio(9000), categoriaId }, h)],
    ['estado-producto', () => call('PATCH', `/productos/${d.productoId}/estado`, actor.token, { estado: 'AGOTADO' }, h)],
    ['firma-imagen', () => call('POST', `/productos/${d.productoId}/cloudinary/firma`, actor.token, {}, h)],
    ['agregar-imagen', () => call('POST', `/productos/${d.productoId}/imagenes`, actor.token, { url: url('agregada'), orden: 2, esPrincipal: false }, h)],
    ['eliminar-imagen', () => call('DELETE', `/productos/${d.productoId}/imagenes/${p.imagenSobrante}`, actor.token, undefined, h)],
    ['orden-imagen', () => call('PATCH', `/productos/${d.productoId}/imagenes/${d.imagenId}/orden`, actor.token, { orden: aleatorio(3) }, h)],
    ['firma-recorte', () => call('POST', `/productos/${d.productoId}/imagenes/${d.imagenId}/recorte/firma`, actor.token, {}, h)],
    ['url-imagen', () => call('PATCH', `/productos/${d.productoId}/imagenes/${d.imagenId}/url`, actor.token, { url: url('recorte') }, h)],
    ['datos-operativos', () => call('PUT', '/comercios/perfil/datos-operativos', actor.token, { descripcion: `Stress ${uniq()}`, telefono: tel() }, h)],
    ['cerrar', () => call('PUT', '/comercios/cerrar', actor.token, {}, h)],
    ['abrir', () => call('PUT', '/comercios/abrir', actor.token, {}, h)],
    ['aceptar', () => call('PUT', `/pedidos/comercio/${p.aceptar}/aceptar`, actor.token, {}, h)],
    ['rechazar', () => call('PUT', `/pedidos/comercio/${p.rechazar}/rechazar`, actor.token, { motivo: 'SIN_STOCK' }, h)],
    ['despachar', () => call('PUT', `/pedidos/comercio/${p.despachar}/despachar`, actor.token, {}, h)],
    ['anular', () => call('PUT', `/pedidos/comercio/${p.anular}/anular`, actor.token, { motivo: 'SIN_STOCK' }, h)],
    ['entregar', () => call('PUT', `/pedidos/comercio/${p.entregar}/entregar`, actor.token, {}, h)],
    ['no-retirado', () => call('PUT', `/pedidos/comercio/${p.noRetirado}/no-retirado`, actor.token, {}, h)],
  ];
}

const estadosDe = (p) => [p.aceptar, p.rechazar, p.despachar, p.anular, p.entregar, p.noRetirado].map((id) => sql(`SELECT estado FROM pedido WHERE id = ${id};`)).join(',');

async function escenario1(admin) {
  const { problemas, registrar } = nuevoRegistro();
  const resumen = {};
  for (let ronda = 1; ronda <= ROUNDS; ronda++) {
    const d = await comercioListo(admin);
    const empleado = await empleadoDe(d, [d.comercioId]);
    const cliente = await comprador();
    const p = await prepararEscrituras(d, cliente);
    const estadosAntes = estadosDe(p);
    const filasAntes = filasDeEdicion(d.comercioId, empleado.id);
    const cierresAntes = Number(sql(`SELECT COUNT(*) FROM historial_cierre_comercio WHERE comercio_id = ${d.comercioId};`));
    const historialAntes = Number(sql(`SELECT COUNT(*) FROM historial_estado_pedido WHERE pedido_id IN (${p.aceptar},${p.rechazar},${p.despachar},${p.anular},${p.entregar},${p.noRetirado});`));
    const retenida = desactivarPorIdMientrasOpera(idDeLaRelacion(d.comercioId, empleado.id), 1500);
    await esperar(350);
    const resultados = await Promise.all(las18Escrituras(empleado, d, p).map(([nombre, hacer]) => hacer().then((r) => ({ nombre, r }))));
    await retenida;
    for (const { nombre, r } of resultados) {
      contar(resumen, `${nombre}:${r.status}`);
      registrar(`ronda ${ronda} ${nombre}`, r, [404]);
    }
    if (filasDeEdicion(d.comercioId, empleado.id) !== filasAntes) problemas.push(`ronda ${ronda}: el Empleado desactivado dejo filas de edicion`);
    if (estadosDe(p) !== estadosAntes) problemas.push(`ronda ${ronda}: algun pedido cambio de estado con el Empleado desactivado (${estadosAntes} -> ${estadosDe(p)})`);
    if (Number(sql(`SELECT COUNT(*) FROM historial_cierre_comercio WHERE comercio_id = ${d.comercioId};`)) !== cierresAntes) problemas.push(`ronda ${ronda}: hay filas de cierre del Empleado desactivado`);
    const historialDespues = Number(sql(`SELECT COUNT(*) FROM historial_estado_pedido WHERE pedido_id IN (${p.aceptar},${p.rechazar},${p.despachar},${p.anular},${p.entregar},${p.noRetirado});`));
    if (historialDespues !== historialAntes) problemas.push(`ronda ${ronda}: aparecieron filas de historial de pedidos con el Empleado desactivado`);
  }
  console.log('Resumen (1, desactivacion retenida contra las 18 escrituras, las dos firmas de Cloudinary incluidas: todo 404):', resumir(resumen));
  return problemas;
}

async function escenario2(admin) {
  const { problemas, registrar } = nuevoRegistro();
  const resumen = {};
  for (let ronda = 1; ronda <= ROUNDS; ronda++) {
    const d = await comercioListo(admin);
    const empleado = await empleadoDe(d, [d.comercioId]);
    const cliente = await comprador();
    const p = await prepararEscrituras(d, cliente);
    const dueno = { token: d.token };
    const delEmpleado = las18Escrituras(empleado, d, p);
    const delDueno = las18Escrituras(dueno, d, p);
    const tareas = [...delEmpleado, ...delDueno].map(([nombre, hacer], i) => hacer().then((r) => ({ nombre: `${i < delEmpleado.length ? 'empleado' : 'dueno'}:${nombre}`, r })));
    const resultados = await Promise.all(tareas);
    for (const { nombre, r } of resultados) {
      contar(resumen, `${nombre.split(':')[1]}:${r.status}`);
      registrar(`ronda ${ronda} ${nombre}`, r, [200, 201, 400, 404, 409]);
    }
    for (const id of [p.aceptar, p.rechazar, p.despachar, p.anular, p.entregar, p.noRetirado]) {
      const filas = Number(sql(`SELECT COUNT(*) FROM historial_estado_pedido WHERE pedido_id = ${id};`));
      const distintos = Number(sql(`SELECT COUNT(DISTINCT estado) FROM historial_estado_pedido WHERE pedido_id = ${id};`));
      if (filas !== distintos) problemas.push(`ronda ${ronda}: el pedido ${id} tiene transiciones repetidas (${filas} filas, ${distintos} estados distintos)`);
    }
  }
  console.log('Resumen (2, las 18 escrituras del Empleado y del Dueño a la vez; ninguna puede dar 5xx):', resumir(resumen));
  return problemas;
}

const PERMITIDOS_CONCURRENCIA = [200, 201, 400, 404, 409];
function contarEnElLog(patron) {
  if (!existsSync(LOG_BACKEND)) return 0;
  let total = (readFileSync(LOG_BACKEND).toString('utf8').match(patron) || []).length;
  const carpeta = path.dirname(LOG_BACKEND);
  const prefijo = `${path.basename(LOG_BACKEND)}.`;
  for (const archivo of readdirSync(carpeta)) {
    if (archivo.startsWith(prefijo) && archivo.endsWith('.gz')) {
      total += (gunzipSync(readFileSync(path.join(carpeta, archivo))).toString('utf8').match(patron) || []).length;
    }
  }
  return total;
}
const cuentaDeadlocksDelLog = () => contarEnElLog(/Deadlock found/g);

async function productoConImagenes(d, actor) {
  const h = cabecera(d.comercioId);
  const producto = await call('POST', '/productos', actor.token, { nombre: `Producto ${uniq()}`, precio: 1500, categoriaId }, h);
  if (producto.status !== 201) throw new Error('producto de la rafaga ' + JSON.stringify(producto));
  const productoId = producto.json.data.id;
  const url = (sufijo) => `https://res.cloudinary.com/${d.nube}/image/upload/v1/productos/${d.comercioId}/${productoId}/${sufijo}-${uniq()}.png`;
  const ids = [];
  for (let i = 0; i < 3; i++) {
    const imagen = await call('POST', `/productos/${productoId}/imagenes`, actor.token, { url: url(`s${i}`), orden: i, esPrincipal: i === 0 }, h);
    if (imagen.status !== 201) throw new Error('imagen de la rafaga ' + JSON.stringify(imagen));
    ids.push(imagen.json.data.id);
  }
  return { productoId, base: ids[0], sobrantes: ids.slice(1), url };
}

const escriturasDeProductoEImagen = (actor, d, p) => {
  const h = cabecera(d.comercioId);
  const sobrante = (i) => p.sobrantes[i % p.sobrantes.length];
  return {
    estado: (i) => call('PATCH', `/productos/${p.productoId}/estado`, actor.token, { estado: i % 2 ? 'DISPONIBLE' : 'AGOTADO' }, h),
    editar: () => call('PUT', `/productos/${p.productoId}`, actor.token, { nombre: `Producto ${uniq()}`, precio: 1000 + aleatorio(9000), categoriaId }, h),
    crear: () => call('POST', '/productos', actor.token, { nombre: `Producto ${uniq()}`, precio: 1200, categoriaId }, h),
    agregar: () => call('POST', `/productos/${p.productoId}/imagenes`, actor.token, { url: p.url('agregada'), orden: 3, esPrincipal: false }, h),
    eliminar: (i) => call('DELETE', `/productos/${p.productoId}/imagenes/${sobrante(i)}`, actor.token, undefined, h),
    orden: () => call('PATCH', `/productos/${p.productoId}/imagenes/${p.base}/orden`, actor.token, { orden: aleatorio(3) }, h),
    url: () => call('PATCH', `/productos/${p.productoId}/imagenes/${p.base}/url`, actor.token, { url: p.url('recorte') }, h),
  };
};
const NOMBRES_DE_ESCRITURA = ['estado', 'editar', 'crear', 'agregar', 'eliminar', 'orden', 'url'];

async function escenario3(admin) {
  const problemas = [];
  const RAFAGAS = Number(process.env.RAFAGAS || 6);
  const d = await comercioListo(admin);
  const empleado = await empleadoDe(d, [d.comercioId]);
  const dueno = { token: d.token };
  const h = cabecera(d.comercioId);
  let totalSolicitudes = 0;
  let deadlocksTotales = 0;
  for (const opEmpleado of NOMBRES_DE_ESCRITURA) {
    for (const opDueno of NOMBRES_DE_ESCRITURA) {
      const deadlocksAntes = cuentaDeadlocksDelLog();
      let cincoXX = 0;
      for (let rafaga = 0; rafaga < RAFAGAS; rafaga++) {
        const p = await productoConImagenes(d, dueno);
        const delEmpleado = escriturasDeProductoEImagen(empleado, d, p);
        const delDueno = escriturasDeProductoEImagen(dueno, d, p);
        const lote = [];
        const agregar = (etiqueta, hacer) => lote.push(hacer().then((r) => {
          totalSolicitudes++;
          if (r.status >= 500) {
            cincoXX++;
            problemas.push(`E:${opEmpleado} x D:${opDueno} rafaga ${rafaga} ${etiqueta}: ${r.status} ${JSON.stringify(r.json)}`);
          } else if (!PERMITIDOS_CONCURRENCIA.includes(r.status)) {
            problemas.push(`E:${opEmpleado} x D:${opDueno} rafaga ${rafaga} ${etiqueta}: estado inesperado ${r.status}`);
          }
        }));
        for (let i = 0; i < 3; i++) {
          agregar(`E.${opEmpleado}`, () => delEmpleado[opEmpleado](i));
          agregar(`D.${opDueno}`, () => delDueno[opDueno](i));
        }
        agregar('E.cerrar', () => call('PUT', '/comercios/cerrar', empleado.token, {}, h));
        agregar('D.cerrar', () => call('PUT', '/comercios/cerrar', dueno.token, {}, h));
        agregar('E.abrir', () => call('PUT', '/comercios/abrir', empleado.token, {}, h));
        agregar('D.abrir', () => call('PUT', '/comercios/abrir', dueno.token, {}, h));
        agregar('E.datos', () => call('PUT', '/comercios/perfil/datos-operativos', empleado.token, { descripcion: `S ${uniq()}`, telefono: tel() }, h));
        agregar('D.datos', () => call('PUT', '/comercios/perfil/datos-operativos', dueno.token, { descripcion: `S ${uniq()}`, telefono: tel() }, h));
        agregar('E.firma', () => call('POST', `/productos/${p.productoId}/cloudinary/firma`, empleado.token, {}, h));
        agregar('D.firma-recorte', () => call('POST', `/productos/${p.productoId}/imagenes/${p.base}/recorte/firma`, dueno.token, {}, h));
        await Promise.all(lote);
      }
      const deadlocks = cuentaDeadlocksDelLog() - deadlocksAntes;
      deadlocksTotales += deadlocks;
      if (deadlocks) problemas.push(`E:${opEmpleado} x D:${opDueno}: ${deadlocks} "Deadlock found" en el log`);
      console.log(`  E.${opEmpleado.padEnd(8)} x D.${opDueno.padEnd(8)} deadlocks=${deadlocks} 5xx=${cincoXX}`);
    }
  }
  console.log(`Resumen (3, matriz completa: 7 escrituras de producto e imagen del Empleado x 7 del Dueño, mas cerrar, abrir, datos operativos y las firmas de ambos, ${RAFAGAS} rafagas por combinacion): ${totalSolicitudes} solicitudes, ${deadlocksTotales} deadlocks`);
  return problemas;
}

async function escenario4(admin) {
  const { problemas, registrar } = nuevoRegistro();
  const resumen = {};
  const RONDAS = Number(process.env.RONDAS_IMAGENES || 20);
  const d = await comercioListo(admin);
  const empleado = await empleadoDe(d, [d.comercioId]);
  const dueno = { token: d.token };
  const h = cabecera(d.comercioId);
  for (let ronda = 1; ronda <= RONDAS; ronda++) {
    const producto = await call('POST', '/productos', d.token, { nombre: `Producto ${uniq()}`, precio: 1500, categoriaId }, h);
    const productoId = producto.json.data.id;
    const base = `https://res.cloudinary.com/${d.nube}/image/upload/v1/productos/${d.comercioId}/${productoId}/`;
    const ids = [];
    for (let i = 0; i < 4; i++) {
      const imagen = await call('POST', `/productos/${productoId}/imagenes`, d.token, { url: `${base}i${i}-${uniq()}.png`, orden: i, esPrincipal: i === 0 }, h);
      if (imagen.status !== 201) throw new Error('imagen ' + JSON.stringify(imagen));
      ids.push(imagen.json.data.id);
    }
    const [a, b, c] = ids;
    const tareas = [
      ['dueno-eliminar-b', () => call('DELETE', `/productos/${productoId}/imagenes/${b}`, dueno.token, undefined, h)],
      ['empleado-orden-b', () => call('PATCH', `/productos/${productoId}/imagenes/${b}/orden`, empleado.token, { orden: 5 }, h)],
      ['empleado-url-b', () => call('PATCH', `/productos/${productoId}/imagenes/${b}/url`, empleado.token, { url: `${base}n-${uniq()}.png` }, h)],
      ['empleado-eliminar-a', () => call('DELETE', `/productos/${productoId}/imagenes/${a}`, empleado.token, undefined, h)],
      ['dueno-orden-a', () => call('PATCH', `/productos/${productoId}/imagenes/${a}/orden`, dueno.token, { orden: 4 }, h)],
      ['dueno-eliminar-b-otra-vez', () => call('DELETE', `/productos/${productoId}/imagenes/${b}`, dueno.token, undefined, h)],
      ['empleado-eliminar-c', () => call('DELETE', `/productos/${productoId}/imagenes/${c}`, empleado.token, undefined, h)],
      ['dueno-agregar', () => call('POST', `/productos/${productoId}/imagenes`, dueno.token, { url: `${base}nueva-${uniq()}.png`, orden: 6, esPrincipal: false }, h)],
    ];
    const resultados = await Promise.all(tareas.map(([nombre, hacer]) => hacer().then((r) => ({ nombre, r }))));
    for (const { nombre, r } of resultados) {
      contar(resumen, `${nombre}:${r.status}`);
      registrar(`ronda ${ronda} ${nombre}`, r, PERMITIDOS_CONCURRENCIA);
    }
    for (const id of [a, b, c]) {
      const eliminaciones = Number(sql(`SELECT COUNT(*) FROM historial_edicion_comercio WHERE entidad_tipo = 'IMAGEN_PRODUCTO' AND accion = 'ELIMINAR' AND entidad_id = ${id};`));
      const existe = Number(sql(`SELECT COUNT(*) FROM imagen_producto WHERE id = ${id};`));
      if (eliminaciones > 1) problemas.push(`ronda ${ronda}: la imagen ${id} tiene ${eliminaciones} filas de historial ELIMINAR`);
      if (existe + eliminaciones !== 1) problemas.push(`ronda ${ronda}: la imagen ${id} existe=${existe} eliminaciones=${eliminaciones} (tiene que ser una cosa o la otra)`);
    }
    const restantes = Number(sql(`SELECT COUNT(*) FROM imagen_producto WHERE producto_id = ${productoId};`));
    const principales = Number(sql(`SELECT COUNT(*) FROM imagen_producto WHERE producto_id = ${productoId} AND es_principal = 1;`));
    if (restantes > 0 && principales !== 1) problemas.push(`ronda ${ronda}: el producto ${productoId} quedo con ${principales} imagenes principales de ${restantes}`);
  }
  console.log('Resumen (4, escrituras de imagen del Dueño y del Empleado en paralelo sobre las mismas imagenes: nada de 5xx, una sola baja por imagen, una sola principal):', resumir(resumen));
  return problemas;
}

const cuentasDelLog = () => ({ deadlocks: contarEnElLog(/Deadlock found/g), timeouts: contarEnElLog(/Lock wait timeout/g) });

function revisarElLog(antes) {
  if (!existsSync(LOG_BACKEND)) return [`no se encontro el log del backend en ${LOG_BACKEND}: revisar a mano que no tenga "Deadlock found" ni "Lock wait timeout"`];
  const despues = cuentasDelLog();
  const problemas = [];
  if (despues.deadlocks - antes.deadlocks) problemas.push(`el log del backend tiene ${despues.deadlocks - antes.deadlocks} "Deadlock found" (el log y sus archivos rotados .gz se cuentan juntos)`);
  if (despues.timeouts - antes.timeouts) problemas.push(`el log del backend tiene ${despues.timeouts - antes.timeouts} "Lock wait timeout"`);
  return problemas;
}

async function main() {
  const inicioLog = cuentasDelLog();
  LOC = await resolverLocalidad();
  const admin = (await call('POST', '/auth/login', null, ADMIN)).json.data.token;
  const categoria = await call('POST', '/categorias', admin, { nombre: BASE_CATEGORIA });
  if (categoria.status !== 201) throw new Error('categoria ' + JSON.stringify(categoria));
  categoriaId = categoria.json.data.id;
  const solo = process.env.ESCENARIO;
  const escenarios = [escenario1, escenario2, escenario3, escenario4];
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
