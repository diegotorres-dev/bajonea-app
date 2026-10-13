import { execFileSync, spawn } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';

const B = process.env.E2E_API_BASE_URL || 'http://localhost:8080/api/v1';
const ROUNDS = Number(process.env.ROUNDS || 10);
const ADMIN = { nombreUsuario: 'adminbajonea', password: process.env.ADMIN_PASSWORD };
const sqlUnaVez = (q) => execFileSync('C:/xampp/mysql/bin/mysql.exe', ['-u', 'root', '-N', '-B', 'bajonea_test', '-e', q]).toString().trim();
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
  const email = `stressa4.${u}@bajonea.test`;
  const nombreUsuario = `sf${u}`.slice(0, 20);
  const password = clavePropia();
  const r = await call('POST', '/auth/registro/comercio', null, {
    razonSocial: `StressA4 ${u} SRL`,
    cuit: cuit(),
    condicionIva: 'RESPONSABLE_INSCRIPTO',
    tipoSociedad: 'SRL',
    domicilioFiscal: 'Av. Stress 1',
    fechaInicioActividades: '2020-01-01',
    nombre: `StressA4 ${u}`,
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
  const email = `stressa4.cli.${u}@bajonea.test`;
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
const BASE_CATEGORIA = `StressA4 ${uniq()}`;

const mysql = 'C:/xampp/mysql/bin/mysql.exe';

function desactivarMientrasOpera(comercioId, empleadoId, milisegundos) {
  const consulta = `START TRANSACTION; SELECT id INTO @relacion FROM empleado_comercio WHERE empleado_id = ${empleadoId} AND comercio_id = ${comercioId} FOR UPDATE; ` +
    `SELECT SLEEP(${milisegundos / 1000}); UPDATE empleado_comercio SET estado = 'INACTIVO', fecha_baja = NOW() WHERE id = @relacion; COMMIT;`;
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
      if (r.status === 404 && JSON.stringify(r.json) !== NO_DISPONIBLE && !/no encontrad/i.test(r.json?.mensaje ?? '')) {
        problemas.push(`${etiqueta}: 404 con cuerpo inesperado ${JSON.stringify(r.json)}`);
      }
    },
  };
}

const PEDIDOS_POR_RONDA = Number(process.env.PEDIDOS_POR_RONDA || 6);
const cab = cabecera;
const lista = (actor, comercioId) => call('GET', '/notificaciones', actor.token, undefined, cab(comercioId));
const contador = (actor, comercioId) => call('GET', '/notificaciones/no-leidas/contador', actor.token, undefined, cab(comercioId));
const marcarTodas = (actor, comercioId) => call('PUT', '/notificaciones/leidas', actor.token, {}, cab(comercioId));
const marcarUna = (actor, id) => call('PUT', `/notificaciones/${id}/leida`, actor.token, {});
const personales = (actor) => call('GET', '/notificaciones', actor.token);
const pagar = (id) => call('PUT', `/test/pedidos/${id}/pago-aprobado`);
const cancelarCliente = (cliente, id) => call('PUT', `/pedidos/cliente/${id}/cancelar`, cliente.token, {});
const ahoraMas = (minutos) => new Date(Date.now() - 3 * 3600 * 1000 + minutos * 60 * 1000).toISOString().slice(0, 19);
const expirar = () => call('POST', `/test/jobs/pedidos/expirar-sin-respuesta?ahora=${ahoraMas(45)}`);
const cambiarRelacion = (comercioId, empleadoId, estado) => call('PUT', `/test/comercios/${comercioId}/empleados/${empleadoId}/estado?estado=${estado}`);

async function pedidoSinPagar(cliente, productoId) {
  await call('DELETE', '/carrito', cliente.token);
  const agregado = await call('POST', '/carrito/items', cliente.token, { productoId, cantidad: 1 });
  if (agregado.status !== 201) throw new Error('carrito ' + JSON.stringify(agregado));
  const pedido = await call('POST', '/pedidos/cliente', cliente.token, { tipoEntrega: 'RETIRO', direccionId: null });
  if (pedido.status !== 201) throw new Error('pedido ' + JSON.stringify(pedido));
  return pedido.json.data.id;
}

async function sumarAlEquipo(dueno, comercioId, cuenta) {
  const inv = await call('POST', '/comercios/equipo/invitaciones', dueno.token, { email: cuenta.email }, cab(comercioId));
  if (inv.status !== 201) throw new Error('invitar ' + JSON.stringify(inv));
  const codigo = (await call('GET', `/test/invitaciones-empleado/codigo?email=${encodeURIComponent(cuenta.email)}&comercioId=${comercioId}`)).json.data;
  const acep = await call('POST', '/auth/invitaciones-empleado/aceptar', null, { email: cuenta.email, codigo });
  if (acep.status !== 200) throw new Error('aceptar ' + JSON.stringify(acep));
}

async function conLogin(cuenta) {
  const login = await call('POST', '/auth/login', null, { nombreUsuario: cuenta.nombreUsuario, password: cuenta.password });
  if (login.status !== 200) throw new Error('login ' + JSON.stringify(login));
  return { ...cuenta, token: login.json.data.token, id: login.json.data.usuario.id };
}

async function compradores(n) {
  const lista = [];
  for (let i = 0; i < n; i++) lista.push(await comprador());
  return lista;
}

const copias = (usuarioId, pedidoId, tipo) =>
  Number(sql(`SELECT COUNT(*) FROM notificacion WHERE usuario_id = ${usuarioId} AND tipo = '${tipo}' AND entidad_tipo = 'PEDIDO' AND entidad_id = ${pedidoId};`));
const copiasDelTipo = (pedidoId, tipo) => Number(sql(`SELECT COUNT(*) FROM notificacion WHERE tipo = '${tipo}' AND entidad_tipo = 'PEDIDO' AND entidad_id = ${pedidoId};`));
const estadoPedido = (id) => sql(`SELECT estado FROM pedido WHERE id = ${id};`);
const noLeidasSql = (usuarioId, comercioId) =>
  Number(sql(`SELECT COUNT(*) FROM notificacion WHERE usuario_id = ${usuarioId} AND comercio_id = ${comercioId} AND leida = 0 AND canal = 'PUSH';`));

function invariantesGenerales(problemas, ronda, comercioIds) {
  const ids = comercioIds.join(',');
  const duplicadas = Number(sql(
    `SELECT COUNT(*) FROM (SELECT usuario_id, tipo, entidad_id FROM notificacion WHERE comercio_id IN (${ids}) AND entidad_tipo = 'PEDIDO' ` +
      `GROUP BY usuario_id, tipo, entidad_id HAVING COUNT(*) > 1) t;`,
  ));
  if (duplicadas) problemas.push(`ronda ${ronda}: ${duplicadas} avisos del comercio duplicados (mismo usuario, tipo y pedido)`);
  const mal = Number(sql(
    `SELECT COUNT(*) FROM notificacion n JOIN pedido p ON p.id = n.entidad_id WHERE n.entidad_tipo = 'PEDIDO' AND n.comercio_id IS NOT NULL ` +
      `AND n.comercio_id IN (${ids}) AND n.comercio_id <> p.comercio_id;`,
  ));
  if (mal) problemas.push(`ronda ${ronda}: ${mal} avisos con un comercio distinto al de su pedido`);
  const sinComercio = Number(sql(
    `SELECT COUNT(*) FROM notificacion n JOIN pedido p ON p.id = n.entidad_id WHERE n.entidad_tipo = 'PEDIDO' AND p.comercio_id IN (${ids}) ` +
      `AND n.tipo IN ('NUEVO_PEDIDO','PEDIDO_CANCELADO_CLIENTE','PEDIDO_EXPIRADO_COMERCIO') AND n.comercio_id IS NULL;`,
  ));
  if (sinComercio) problemas.push(`ronda ${ronda}: ${sinComercio} avisos del equipo sin comercio`);
  const personalesConComercio = Number(sql(
    `SELECT COUNT(*) FROM notificacion n JOIN pedido p ON p.id = n.entidad_id WHERE n.entidad_tipo = 'PEDIDO' AND p.comercio_id IN (${ids}) ` +
      `AND n.tipo NOT IN ('NUEVO_PEDIDO','PEDIDO_CANCELADO_CLIENTE','PEDIDO_EXPIRADO_COMERCIO') AND n.comercio_id IS NOT NULL;`,
  ));
  if (personalesConComercio) problemas.push(`ronda ${ronda}: ${personalesConComercio} avisos personales del Cliente con comercio`);
}

async function verificarContadores(problemas, ronda, comercioId, actores) {
  for (const actor of actores) {
    const r = await contador(actor, comercioId);
    if (r.status !== 200) continue;
    const enBase = noLeidasSql(actor.id, comercioId);
    if (Number(r.json.data) !== enBase) problemas.push(`ronda ${ronda}: el contador de ${actor.id} dice ${r.json.data} y la base tiene ${enBase}`);
  }
}

async function leer(registrar, ronda, actor, comercioId, iteraciones, { puedeCaer = false } = {}) {
  const permitidos = puedeCaer ? [200, 404] : [200];
  for (let i = 0; i < iteraciones; i++) {
    await esperar(aleatorio(25));
    const l = await lista(actor, comercioId);
    registrar(`ronda ${ronda} lista de ${actor.id}`, l, permitidos);
    await esperar(aleatorio(15));
    registrar(`ronda ${ronda} contador de ${actor.id}`, await contador(actor, comercioId), permitidos);
    registrar(`ronda ${ronda} marcar todas de ${actor.id}`, await marcarTodas(actor, comercioId), permitidos);
    const primero = l.status === 200 && l.json.data[0];
    if (primero) registrar(`ronda ${ronda} marcar una de ${actor.id}`, await marcarUna(actor, primero.id), puedeCaer ? [200, 404] : [200]);
  }
}

async function escenario1(admin) {
  const { problemas, registrar } = nuevoRegistro();
  const resumen = {};
  for (let ronda = 1; ronda <= ROUNDS; ronda++) {
    const d = await comercioListo(admin);
    d.id = d.duenoId;
    const fijos = [await empleadoDe(d, [d.comercioId]), await empleadoDe(d, [d.comercioId])];
    const intermitente = await empleadoDe(d, [d.comercioId]);
    const aSumar = [await nuevoClienteVerificado(), await nuevoClienteVerificado()];
    const cliente = await comprador();
    const clienteId = Number(sql(`SELECT id FROM usuario WHERE email = '${cliente.email}';`));
    const aPagar = [];
    for (const otro of await compradores(PEDIDOS_POR_RONDA)) aPagar.push(await pedidoSinPagar(otro, d.productoId));
    const aResolver = [];
    for (let i = 0; i < PEDIDOS_POR_RONDA; i++) aResolver.push(await pedidoPendiente(cliente, d.productoId));

    const tareas = [
      ...aPagar.flatMap((id) => [0, 1].map(() => esperar(aleatorio(40)).then(() => pagar(id)).then((r) => ({ tipo: 'pagar', r })))),
      ...aResolver.map((id) => esperar(aleatorio(40)).then(() => cancelarCliente(cliente, id)).then((r) => ({ tipo: 'cancelar', r }))),
      esperar(aleatorio(40)).then(() => expirar()).then((r) => ({ tipo: 'expirar', r })),
      esperar(aleatorio(40)).then(() => expirar()).then((r) => ({ tipo: 'expirar', r })),
      (async () => {
        for (let i = 0; i < 6; i++) {
          await cambiarRelacion(d.comercioId, intermitente.id, i % 2 === 0 ? 'INACTIVO' : 'ACTIVO');
          await esperar(aleatorio(20));
        }
        return { tipo: 'intermitente', r: await cambiarRelacion(d.comercioId, intermitente.id, 'INACTIVO') };
      })(),
      ...aSumar.map((cuenta) => esperar(aleatorio(30)).then(() => sumarAlEquipo(d, d.comercioId, cuenta)).then(() => ({ tipo: 'sumar', r: { status: 200, json: null } }))),
      leer(registrar, ronda, d, d.comercioId, 5).then(() => ({ tipo: 'lector' })),
      leer(registrar, ronda, fijos[0], d.comercioId, 5).then(() => ({ tipo: 'lector' })),
      leer(registrar, ronda, fijos[1], d.comercioId, 5).then(() => ({ tipo: 'lector' })),
      leer(registrar, ronda, intermitente, d.comercioId, 5, { puedeCaer: true }).then(() => ({ tipo: 'lector' })),
      (async () => {
        for (let i = 0; i < 5; i++) {
          registrar(`ronda ${ronda} personales del comprador`, await personales(cliente), [200]);
          await esperar(aleatorio(30));
        }
        return { tipo: 'lector' };
      })(),
    ];
    const resultados = await Promise.all(tareas);
    for (const { tipo, r } of resultados) {
      if (!r) continue;
      contar(resumen, `${tipo}:${r.status}`);
      if (tipo === 'pagar') registrar(`ronda ${ronda} pagar`, r, [200]);
      if (tipo === 'cancelar') registrar(`ronda ${ronda} cancelar`, r, [200, 409]);
      if (tipo === 'expirar') registrar(`ronda ${ronda} expirar`, r, [200]);
      if (tipo === 'intermitente') registrar(`ronda ${ronda} intermitente`, r, [200]);
    }

    const fijosIds = fijos.map((f) => f.id);
    for (const id of aPagar) {
      if (estadoPedido(id) === 'PENDIENTE_PAGO') problemas.push(`ronda ${ronda}: el pedido ${id} quedo sin pagar`);
      if (copias(d.duenoId, id, 'NUEVO_PEDIDO') !== 1) problemas.push(`ronda ${ronda}: el Dueño tiene ${copias(d.duenoId, id, 'NUEVO_PEDIDO')} copias de NUEVO_PEDIDO del pedido ${id}`);
      for (const e of fijosIds) if (copias(e, id, 'NUEVO_PEDIDO') !== 1) problemas.push(`ronda ${ronda}: el Empleado fijo ${e} tiene ${copias(e, id, 'NUEVO_PEDIDO')} copias del pedido ${id}`);
      if (copias(clienteId, id, 'NUEVO_PEDIDO') !== 0) problemas.push(`ronda ${ronda}: el comprador recibio el aviso del equipo del pedido ${id}`);
      if (copias(intermitente.id, id, 'NUEVO_PEDIDO') > 1) problemas.push(`ronda ${ronda}: el intermitente tiene mas de una copia del pedido ${id}`);
    }
    for (const id of aResolver) {
      const estado = estadoPedido(id);
      if (!['CANCELADO', 'EXPIRADO'].includes(estado)) {
        problemas.push(`ronda ${ronda}: el pedido ${id} termino ${estado} (tenia que ser CANCELADO o EXPIRADO)`);
        continue;
      }
      const [ganador, perdedor] = estado === 'CANCELADO' ? ['PEDIDO_CANCELADO_CLIENTE', 'PEDIDO_EXPIRADO_COMERCIO'] : ['PEDIDO_EXPIRADO_COMERCIO', 'PEDIDO_CANCELADO_CLIENTE'];
      if (copias(d.duenoId, id, ganador) !== 1) problemas.push(`ronda ${ronda}: el Dueño tiene ${copias(d.duenoId, id, ganador)} copias de ${ganador} del pedido ${id}`);
      for (const e of fijosIds) if (copias(e, id, ganador) !== 1) problemas.push(`ronda ${ronda}: el fijo ${e} tiene ${copias(e, id, ganador)} copias de ${ganador} del pedido ${id}`);
      if (copiasDelTipo(id, perdedor) !== 0) problemas.push(`ronda ${ronda}: el pedido ${id} (${estado}) tiene ${copiasDelTipo(id, perdedor)} copias de ${perdedor}`);
      if (estado === 'EXPIRADO' && copias(clienteId, id, 'PEDIDO_EXPIRADO_CLIENTE') !== 1) problemas.push(`ronda ${ronda}: el comprador no recibio su aviso de expiracion del pedido ${id}`);
    }
    invariantesGenerales(problemas, ronda, [d.comercioId]);

    const eventoFinal = await pedidoSinPagar(cliente, d.productoId);
    await pagar(eventoFinal);
    if (copias(intermitente.id, eventoFinal, 'NUEVO_PEDIDO') !== 0) problemas.push(`ronda ${ronda}: el intermitente, ya INACTIVO, recibio un aviso nuevo`);
    if (copias(d.duenoId, eventoFinal, 'NUEVO_PEDIDO') !== 1) problemas.push(`ronda ${ronda}: el Dueño no recibio el aviso final`);
    const sumados = sql(`SELECT empleado_id FROM empleado_comercio WHERE comercio_id = ${d.comercioId} AND estado = 'ACTIVO' AND empleado_id NOT IN (${fijosIds.join(',')});`)
      .split(/\r?\n/).filter(Boolean).map(Number);
    if (sumados.length !== 2) problemas.push(`ronda ${ronda}: se esperaban 2 Empleados sumados durante los eventos y hay ${sumados.length}`);
    for (const s of sumados) if (copias(s, eventoFinal, 'NUEVO_PEDIDO') !== 1) problemas.push(`ronda ${ronda}: el Empleado sumado ${s} no recibio el aviso posterior a su alta`);

    await verificarContadores(problemas, ronda, d.comercioId, [d, ...fijos]);
  }
  console.log('Resumen (1, eventos de Cliente, sistema y Dueño mientras entran y salen Empleados y cuatro usuarios leen y marcan):', resumir(resumen));
  return problemas;
}

async function escenario2(admin) {
  const { problemas, registrar } = nuevoRegistro();
  for (let ronda = 1; ronda <= ROUNDS; ronda++) {
    const d = await comercioListo(admin);
    d.id = d.duenoId;
    const segundo = await clonar(d.comercioId, 'APTO_VENTA');
    const productoDelSegundo = await call('POST', '/productos', d.token, { nombre: `Producto ${uniq()}`, precio: 1500, categoriaId }, cab(segundo));
    if (productoDelSegundo.status !== 201) throw new Error('producto segundo ' + JSON.stringify(productoDelSegundo));
    const ambos = await empleadoDe(d, [d.comercioId, segundo]);
    const soloPrimero = await empleadoDe(d, [d.comercioId]);
    const pedidosPrimero = [];
    const pedidosSegundo = [];
    for (const otro of await compradores(3)) pedidosPrimero.push(await pedidoSinPagar(otro, d.productoId));
    for (const otro of await compradores(3)) pedidosSegundo.push(await pedidoSinPagar(otro, productoDelSegundo.json.data.id));
    const tareas = [
      ...[...pedidosPrimero, ...pedidosSegundo].map((id) => esperar(aleatorio(40)).then(() => pagar(id)).then((r) => ({ tipo: 'pagar', r }))),
      leer(registrar, ronda, d, d.comercioId, 4).then(() => ({})),
      leer(registrar, ronda, d, segundo, 4).then(() => ({})),
      leer(registrar, ronda, ambos, d.comercioId, 4).then(() => ({})),
      leer(registrar, ronda, ambos, segundo, 4).then(() => ({})),
      leer(registrar, ronda, soloPrimero, d.comercioId, 4).then(() => ({})),
      leer(registrar, ronda, soloPrimero, segundo, 3, { puedeCaer: true }).then(() => ({})),
    ];
    const resultados = await Promise.all(tareas);
    for (const { tipo, r } of resultados) if (tipo === 'pagar') registrar(`ronda ${ronda} pagar`, r, [200]);

    const comercioDe = (id) => Number(sql(`SELECT comercio_id FROM pedido WHERE id = ${id};`));
    for (const [actor, comercioId] of [[d, d.comercioId], [d, segundo], [ambos, d.comercioId], [ambos, segundo], [soloPrimero, d.comercioId]]) {
      const l = await lista(actor, comercioId);
      if (l.status !== 200) {
        problemas.push(`ronda ${ronda}: lista de ${actor.id} con el comercio ${comercioId} dio ${l.status}`);
        continue;
      }
      const deLosPedidos = l.json.data.filter((item) => item.entidadTipo === 'PEDIDO');
      for (const item of l.json.data) {
        const delComercio = item.entidadTipo === 'PEDIDO' ? comercioDe(item.entidadId) : item.entidadId;
        if (delComercio !== comercioId) problemas.push(`ronda ${ronda}: ${actor.id} ve con el comercio ${comercioId} un aviso de ${item.entidadTipo} ${item.entidadId}, de otro comercio`);
      }
      const esperados = comercioId === d.comercioId ? pedidosPrimero.length : pedidosSegundo.length;
      if (deLosPedidos.length !== esperados) problemas.push(`ronda ${ronda}: ${actor.id} con el comercio ${comercioId} ve ${deLosPedidos.length} avisos de pedidos y tenian que ser ${esperados}`);
    }
    const ajeno = await lista(soloPrimero, segundo);
    if (ajeno.status !== 404) problemas.push(`ronda ${ronda}: el Empleado de un solo comercio vio el otro con ${ajeno.status}`);
    invariantesGenerales(problemas, ronda, [d.comercioId, segundo]);
  }
  console.log('Resumen (2): Dueño y Empleados de dos comercios leyendo y marcando mientras llegan pedidos a ambos, sin cruces entre comercios.');
  return problemas;
}

async function escenario3(admin) {
  const { problemas, registrar } = nuevoRegistro();
  for (let ronda = 1; ronda <= ROUNDS; ronda++) {
    const d = await comercioListo(admin);
    const fijos = [await empleadoDe(d, [d.comercioId]), await empleadoDe(d, [d.comercioId])];
    const cliente = await comprador();
    const porPagar = [];
    for (const otro of await compradores(2)) porPagar.push(await pedidoSinPagar(otro, d.productoId));
    const porCancelar = [await pedidoPendiente(cliente, d.productoId), await pedidoPendiente(cliente, d.productoId)];
    const tareas = [
      ...porPagar.flatMap((id) => Array.from({ length: 6 }, () => pagar(id).then((r) => ({ tipo: 'pagar', r })))),
      ...porCancelar.flatMap((id) => Array.from({ length: 4 }, () => cancelarCliente(cliente, id).then((r) => ({ tipo: 'cancelar', r })))),
    ];
    const resultados = await Promise.all(tareas);
    for (const { tipo, r } of resultados) registrar(`ronda ${ronda} ${tipo}`, r, tipo === 'pagar' ? [200] : [200, 409]);
    const ganadoresCancelar = resultados.filter((x) => x.tipo === 'cancelar' && x.r.status === 200).length;
    if (ganadoresCancelar !== porCancelar.length) problemas.push(`ronda ${ronda}: ${ganadoresCancelar} cancelaciones ganaron y tenian que ser ${porCancelar.length}`);
    const esperadas = 1 + fijos.length;
    for (const id of porPagar) {
      if (copiasDelTipo(id, 'NUEVO_PEDIDO') !== esperadas) problemas.push(`ronda ${ronda}: el pedido ${id} tiene ${copiasDelTipo(id, 'NUEVO_PEDIDO')} copias de NUEVO_PEDIDO y tenian que ser ${esperadas}`);
    }
    for (const id of porCancelar) {
      if (copiasDelTipo(id, 'PEDIDO_CANCELADO_CLIENTE') !== esperadas) problemas.push(`ronda ${ronda}: el pedido ${id} tiene ${copiasDelTipo(id, 'PEDIDO_CANCELADO_CLIENTE')} copias de la cancelacion y tenian que ser ${esperadas}`);
    }
    invariantesGenerales(problemas, ronda, [d.comercioId]);
  }
  console.log('Resumen (3): el mismo evento disparado seis y cuatro veces a la vez deja exactamente un juego de copias.');
  return problemas;
}

async function escenario4(admin) {
  const { problemas, registrar } = nuevoRegistro();
  for (let ronda = 1; ronda <= ROUNDS; ronda++) {
    const d = await comercioListo(admin);
    d.id = d.duenoId;
    const otro = await empleadoDe(d, [d.comercioId]);
    const comprador1 = await empleadoDe(d, [d.comercioId]);
    const comprador2 = await empleadoDe(d, [d.comercioId]);
    const propios = [await pedidoSinPagar(comprador1, d.productoId), await pedidoSinPagar(comprador2, d.productoId)];
    const aResolver = [];
    for (let i = 0; i < 3; i++) aResolver.push(await pedidoPendiente(comprador1, d.productoId));
    const deAjeno = [];
    for (const ajeno of await compradores(2)) deAjeno.push(await pedidoSinPagar(ajeno, d.productoId));
    const tareas = [
      ...propios.map((id) => esperar(aleatorio(30)).then(() => pagar(id)).then((r) => ({ tipo: 'pagar', r }))),
      ...deAjeno.map((id) => esperar(aleatorio(30)).then(() => pagar(id)).then((r) => ({ tipo: 'pagar', r }))),
      ...aResolver.map((id) => esperar(aleatorio(30)).then(() => cancelarCliente(comprador1, id)).then((r) => ({ tipo: 'cancelar', r }))),
      expirar().then((r) => ({ tipo: 'expirar', r })),
      leer(registrar, ronda, comprador1, d.comercioId, 6).then(() => ({})),
      (async () => {
        for (let i = 0; i < 6; i++) {
          registrar(`ronda ${ronda} personales del Empleado comprador`, await personales(comprador1), [200]);
          registrar(`ronda ${ronda} contador personal`, await call('GET', '/notificaciones/no-leidas/contador', comprador1.token), [200]);
          await esperar(aleatorio(25));
        }
        return {};
      })(),
      leer(registrar, ronda, otro, d.comercioId, 4).then(() => ({})),
    ];
    const resultados = await Promise.all(tareas);
    for (const { tipo, r } of resultados) if (r) registrar(`ronda ${ronda} ${tipo}`, r, tipo === 'cancelar' ? [200, 409] : [200]);

    const clienteId = comprador1.id;
    for (const [comprador, ids] of [[comprador1, [propios[0], ...aResolver]], [comprador2, [propios[1]]]]) {
      for (const id of ids) {
        for (const tipo of ['NUEVO_PEDIDO', 'PEDIDO_CANCELADO_CLIENTE', 'PEDIDO_EXPIRADO_COMERCIO']) {
          if (copias(comprador.id, id, tipo) !== 0) problemas.push(`ronda ${ronda}: el Empleado comprador ${comprador.id} recibio ${tipo} de su propio pedido ${id}`);
        }
      }
    }
    for (const id of [...deAjeno, propios[1]]) {
      if (copias(clienteId, id, 'NUEVO_PEDIDO') !== 1) problemas.push(`ronda ${ronda}: el Empleado comprador 1 no recibio el aviso del pedido ajeno ${id}`);
    }
    if (copias(comprador2.id, propios[0], 'NUEVO_PEDIDO') !== 1) problemas.push(`ronda ${ronda}: el Empleado comprador 2 no recibio el aviso del pedido del comprador 1`);
    const mezcla = await personales(comprador1);
    if (mezcla.status === 200) {
      for (const aviso of mezcla.json.data) {
        const fila = sql(`SELECT tipo, IFNULL(comercio_id, 'null') FROM notificacion WHERE id = ${aviso.id};`).split(/\s+/);
        if (fila[1] !== 'null') problemas.push(`ronda ${ronda}: la lista personal del Empleado trae un aviso del comercio (${fila[0]})`);
      }
    }
    invariantesGenerales(problemas, ronda, [d.comercioId]);
  }
  console.log('Resumen (4): un Empleado que compra en su comercio no recibe los avisos del equipo de sus pedidos y no mezcla las dos campanas.');
  return problemas;
}

async function escenario5(admin) {
  const { problemas, registrar } = nuevoRegistro();
  for (let ronda = 1; ronda <= ROUNDS; ronda++) {
    const d = await comercioListo(admin);
    d.id = d.duenoId;
    const cuenta = await nuevoClienteVerificado();
    await sumarAlEquipo(d, d.comercioId, cuenta);
    const x = await conLogin(cuenta);
    const cliente = await comprador();
    const viejos = [];
    for (let i = 0; i < 2; i++) viejos.push(await pedidoPendiente(cliente, d.productoId));
    await cambiarRelacion(d.comercioId, x.id, 'INACTIVO');
    viejos.push(await pedidoPendiente(cliente, d.productoId));
    for (const id of viejos.slice(0, 2)) if (copias(x.id, id, 'NUEVO_PEDIDO') !== 1) problemas.push(`ronda ${ronda}: X no tenia su copia del pedido ${id} antes de la reactivacion`);
    if (copias(x.id, viejos[2], 'NUEVO_PEDIDO') !== 0) problemas.push(`ronda ${ronda}: X inactivo recibio un aviso`);

    const concurrentes = [];
    for (const otro of await compradores(3)) concurrentes.push(await pedidoSinPagar(otro, d.productoId));
    const tareas = [
      sumarAlEquipo(d, d.comercioId, cuenta).then(() => ({ tipo: 'reactivar', r: { status: 200 } })),
      ...concurrentes.map((id) => esperar(aleatorio(60)).then(() => pagar(id)).then((r) => ({ tipo: 'pagar', r }))),
      (async () => {
        for (let i = 0; i < 6; i++) {
          await lista(x, d.comercioId);
          await marcarTodas(x, d.comercioId);
          await esperar(aleatorio(30));
        }
        return {};
      })(),
    ];
    const resultados = await Promise.all(tareas);
    for (const { tipo, r } of resultados) if (r && tipo === 'pagar') registrar(`ronda ${ronda} pagar`, r, [200]);

    for (const id of viejos) if (copias(x.id, id, 'NUEVO_PEDIDO') !== 0) problemas.push(`ronda ${ronda}: X, reactivado, conserva el aviso viejo del pedido ${id}`);
    for (const id of concurrentes) if (copias(x.id, id, 'NUEVO_PEDIDO') > 1) problemas.push(`ronda ${ronda}: X tiene mas de una copia del pedido concurrente ${id}`);
    const despues = await pedidoSinPagar(cliente, d.productoId);
    await pagar(despues);
    if (copias(x.id, despues, 'NUEVO_PEDIDO') !== 1) problemas.push(`ronda ${ronda}: X reactivado no recibio el aviso posterior`);
    registrar(`ronda ${ronda} lista de X`, await lista(x, d.comercioId), [200]);
    invariantesGenerales(problemas, ronda, [d.comercioId]);
  }
  console.log('Resumen (5): reactivar un Empleado (con purgado de sus avisos viejos) mientras llegan pedidos: nunca conserva avisos anteriores ni duplica los nuevos.');
  return problemas;
}

async function escenario6(admin) {
  const { problemas, registrar } = nuevoRegistro();
  for (let ronda = 1; ronda <= ROUNDS; ronda++) {
    const d = await comercioListo(admin);
    const fijo = await empleadoDe(d, [d.comercioId]);
    const desactivado = await empleadoDe(d, [d.comercioId]);
    const compradores3 = await compradores(3);
    const pedidos = [];
    for (const otro of compradores3) pedidos.push(await pedidoSinPagar(otro, d.productoId));
    const desactivacion = desactivarMientrasOpera(d.comercioId, desactivado.id, 900);
    await esperar(250);
    const resultados = await Promise.all(pedidos.map((id) => pagar(id)));
    await desactivacion;
    for (const r of resultados) registrar(`ronda ${ronda} pagar durante la desactivacion`, r, [200]);
    for (const id of pedidos) {
      if (copias(desactivado.id, id, 'NUEVO_PEDIDO') !== 0) problemas.push(`ronda ${ronda}: el Empleado desactivado en medio del evento recibio una copia del pedido ${id} (el evento no esperó a la desactivacion)`);
      if (copias(fijo.id, id, 'NUEVO_PEDIDO') !== 1) problemas.push(`ronda ${ronda}: el Empleado fijo tiene ${copias(fijo.id, id, 'NUEVO_PEDIDO')} copias del pedido ${id}`);
      if (copias(d.duenoId, id, 'NUEVO_PEDIDO') !== 1) problemas.push(`ronda ${ronda}: el Dueño tiene ${copias(d.duenoId, id, 'NUEVO_PEDIDO')} copias del pedido ${id}`);
    }
    const lecturaDesactivado = await lista(desactivado, d.comercioId);
    if (lecturaDesactivado.status !== 404) problemas.push(`ronda ${ronda}: el desactivado todavia ve sus avisos (${lecturaDesactivado.status})`);
    invariantesGenerales(problemas, ronda, [d.comercioId]);
  }
  console.log('Resumen (6): tres eventos disparados mientras una desactivacion mantiene la relacion bloqueada: esperan y dejan afuera al desactivado.');
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
  console.log(todos.length ? 'PROBLEMAS:\n' + todos.join('\n') : 'SIN PROBLEMAS (sin 5xx, sin copias duplicadas ni faltantes, sin Deadlock ni Lock wait timeout en el log)');
  if (todos.length) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
