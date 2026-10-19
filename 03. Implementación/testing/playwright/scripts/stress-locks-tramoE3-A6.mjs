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
  const email = `stressa6.${u}@bajonea.test`;
  const nombreUsuario = `sf${u}`.slice(0, 20);
  const password = clavePropia();
  const r = await call('POST', '/auth/registro/comercio', null, {
    aceptaTerminos: true,
    razonSocial: `StressA6 ${u} SRL`,
    cuit: cuit(),
    condicionIva: 'RESPONSABLE_INSCRIPTO',
    tipoSociedad: 'SRL',
    domicilioFiscal: 'Av. Stress 1',
    fechaInicioActividades: '2020-01-01',
    nombre: `StressA6 ${u}`,
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
  const email = `stressa6.cli.${u}@bajonea.test`;
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
const BASE_CATEGORIA = `StressA6 ${uniq()}`;

const mysql = process.env.MYSQL_BIN || 'C:/xampp/mysql/bin/mysql.exe';

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
      `AND n.tipo IN ('NUEVO_PEDIDO','PEDIDO_CANCELADO_CLIENTE','PEDIDO_EXPIRADO_COMERCIO','PEDIDO_AUTOCONFIRMADO_COMERCIO') AND n.comercio_id IS NULL;`,
  ));
  if (sinComercio) problemas.push(`ronda ${ronda}: ${sinComercio} avisos del equipo sin comercio`);
  const personalesConComercio = Number(sql(
    `SELECT COUNT(*) FROM notificacion n JOIN pedido p ON p.id = n.entidad_id WHERE n.entidad_tipo = 'PEDIDO' AND p.comercio_id IN (${ids}) ` +
      `AND n.tipo NOT IN ('NUEVO_PEDIDO','PEDIDO_CANCELADO_CLIENTE','PEDIDO_EXPIRADO_COMERCIO','PEDIDO_AUTOCONFIRMADO_COMERCIO') AND n.comercio_id IS NOT NULL;`,
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

const T30 = 'PEDIDO_AUTOCONFIRMADO_COMERCIO';
const T8 = 'PEDIDO_AUTOCONFIRMADO';
const autoconfirmar = () => call('POST', '/test/jobs/pedidos/avisar-y-autoconfirmar');
const entregarCliente = (cliente, id) => call('PUT', `/pedidos/cliente/${id}/entregar`, cliente.token, {});
const hace = (minutos) => ahoraMas(-minutos).replace('T', ' ');

async function pedidoEnCamino(cliente, dueno, productoId, minutos = 100) {
  const id = await pedidoPendiente(cliente, productoId);
  sql(`UPDATE pedido SET estado = 'EN_CAMINO' WHERE id = ${id};`);
  sql(
    `INSERT INTO historial_estado_pedido (pedido_id, estado, actor_rol, actor_usuario_id, fecha_hora) VALUES ` +
      `(${id}, 'EN_PREPARACION', 'DUENO', ${dueno.duenoId}, '${hace(minutos + 20)}'), (${id}, 'EN_CAMINO', 'DUENO', ${dueno.duenoId}, '${hace(minutos)}');`,
  );
  return id;
}

const fuenteDe = (id) => sql(`SELECT IFNULL(fuente_entrega, '') FROM pedido WHERE id = ${id};`);
const filasEntregado = (id) => Number(sql(`SELECT COUNT(*) FROM historial_estado_pedido WHERE pedido_id = ${id} AND estado = 'ENTREGADO';`));

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
    const pedidos = [];
    for (let i = 0; i < PEDIDOS_POR_RONDA; i++) pedidos.push(await pedidoEnCamino(cliente, d, d.productoId));

    const tareas = [
      esperar(aleatorio(30)).then(() => autoconfirmar()).then((r) => ({ tipo: 'proceso', r })),
      esperar(aleatorio(30)).then(() => autoconfirmar()).then((r) => ({ tipo: 'proceso', r })),
      ...pedidos.map((id) => esperar(aleatorio(60)).then(() => entregarCliente(cliente, id)).then((r) => ({ tipo: 'entregar', r }))),
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
      if (tipo === 'proceso') registrar(`ronda ${ronda} proceso`, r, [200]);
      if (tipo === 'entregar') registrar(`ronda ${ronda} entregar`, r, [200, 409]);
      if (tipo === 'intermitente') registrar(`ronda ${ronda} intermitente`, r, [200]);
    }
    await autoconfirmar();

    const fijosIds = fijos.map((f) => f.id);
    for (const id of pedidos) {
      if (estadoPedido(id) !== 'ENTREGADO') {
        problemas.push(`ronda ${ronda}: el pedido ${id} termino ${estadoPedido(id)} (tenia que ser ENTREGADO)`);
        continue;
      }
      if (filasEntregado(id) !== 1) problemas.push(`ronda ${ronda}: el pedido ${id} tiene ${filasEntregado(id)} filas ENTREGADO`);
      const fuente = fuenteDe(id);
      if (fuente === 'CLIENTE') {
        if (copiasDelTipo(id, T30) !== 0) problemas.push(`ronda ${ronda}: el pedido ${id}, confirmado por el Cliente, tiene ${copiasDelTipo(id, T30)} avisos T30`);
        if (copiasDelTipo(id, T8) !== 0) problemas.push(`ronda ${ronda}: el pedido ${id}, confirmado por el Cliente, tiene un aviso T8`);
        continue;
      }
      if (fuente !== 'SISTEMA') problemas.push(`ronda ${ronda}: el pedido ${id} tiene fuente_entrega "${fuente}"`);
      if (copias(d.duenoId, id, T30) !== 1) problemas.push(`ronda ${ronda}: el Dueño tiene ${copias(d.duenoId, id, T30)} copias de T30 del pedido ${id}`);
      for (const e of fijosIds) if (copias(e, id, T30) !== 1) problemas.push(`ronda ${ronda}: el Empleado fijo ${e} tiene ${copias(e, id, T30)} copias de T30 del pedido ${id}`);
      if (copias(clienteId, id, T30) !== 0) problemas.push(`ronda ${ronda}: el comprador recibio el aviso del equipo del pedido ${id}`);
      if (copias(intermitente.id, id, T30) > 1) problemas.push(`ronda ${ronda}: el intermitente tiene mas de una copia de T30 del pedido ${id}`);
      if (copias(clienteId, id, T8) !== 1) problemas.push(`ronda ${ronda}: el comprador tiene ${copias(clienteId, id, T8)} avisos T8 del pedido ${id}`);
      const total = copiasDelTipo(id, T30);
      const maximo = 1 + fijosIds.length + 1 + aSumar.length;
      if (total < 1 + fijosIds.length || total > maximo) problemas.push(`ronda ${ronda}: el pedido ${id} tiene ${total} copias de T30 (entre ${1 + fijosIds.length} y ${maximo})`);
    }
    invariantesGenerales(problemas, ronda, [d.comercioId]);
    await verificarContadores(problemas, ronda, d.comercioId, [d, ...fijos]);
  }
  console.log('Resumen (1, autoconfirmacion contra confirmacion del Cliente, altas y bajas del equipo y lecturas):', resumir(resumen));
  return problemas;
}

async function escenario2(admin) {
  const { problemas, registrar } = nuevoRegistro();
  for (let ronda = 1; ronda <= ROUNDS; ronda++) {
    const d = await comercioListo(admin);
    const x = await empleadoDe(d, [d.comercioId]);
    const otro = await empleadoDe(d, [d.comercioId]);
    const ajeno = await comprador();
    const propios = [];
    const ajenos = [];
    for (let i = 0; i < 3; i++) propios.push(await pedidoEnCamino(x, d, d.productoId));
    for (let i = 0; i < 3; i++) ajenos.push(await pedidoEnCamino(ajeno, d, d.productoId));
    const resultados = await Promise.all([autoconfirmar(), autoconfirmar(), autoconfirmar()]);
    for (const r of resultados) registrar(`ronda ${ronda} proceso`, r, [200]);

    for (const id of propios) {
      if (copias(x.id, id, T30) !== 0) problemas.push(`ronda ${ronda}: X, Cliente de su pedido ${id}, recibio el aviso del equipo`);
      if (copias(x.id, id, T8) !== 1) problemas.push(`ronda ${ronda}: X no recibio su aviso de comprador del pedido ${id}`);
      if (copias(otro.id, id, T30) !== 1 || copias(d.duenoId, id, T30) !== 1) problemas.push(`ronda ${ronda}: el resto del equipo no recibio el aviso del pedido propio de X ${id}`);
    }
    for (const id of ajenos) {
      if (copias(x.id, id, T30) !== 1) problemas.push(`ronda ${ronda}: X no recibio el aviso del pedido ajeno ${id}`);
      if (copiasDelTipo(id, T30) !== 3) problemas.push(`ronda ${ronda}: el pedido ajeno ${id} tiene ${copiasDelTipo(id, T30)} avisos T30 (se esperaban 3)`);
    }
    const conComercio = await lista(x, d.comercioId);
    registrar(`ronda ${ronda} lista de X con comercio`, conComercio, [200]);
    const deAutoconfirmacion = conComercio.status === 200 ? conComercio.json.data.filter((n) => /se confirmó automáticamente como entregado/.test(n.mensaje)) : [];
    if (conComercio.status === 200 && deAutoconfirmacion.length !== 3) problemas.push(`ronda ${ronda}: X ve ${deAutoconfirmacion.length} avisos T30 del comercio (se esperaban 3)`);
    if (deAutoconfirmacion.some((n) => propios.includes(n.entidadId))) problemas.push(`ronda ${ronda}: X ve el aviso T30 de un pedido propio`);
    const sinComercio = await personales(x);
    registrar(`ronda ${ronda} personales de X`, sinComercio, [200]);
    if (sinComercio.status === 200 && sinComercio.json.data.length !== 3) problemas.push(`ronda ${ronda}: X ve ${sinComercio.json.data.length} avisos personales (se esperaban 3)`);
    invariantesGenerales(problemas, ronda, [d.comercioId]);
  }
  console.log('Resumen (2): el Cliente del pedido que es Empleado nunca recibe el aviso del equipo de su propio pedido y si el de comprador.');
  return problemas;
}

async function escenario3(admin) {
  const { problemas, registrar } = nuevoRegistro();
  for (let ronda = 1; ronda <= ROUNDS; ronda++) {
    const d = await comercioListo(admin);
    const fijo = await empleadoDe(d, [d.comercioId]);
    const desactivado = await empleadoDe(d, [d.comercioId]);
    const cliente = await comprador();
    const pedidos = [];
    for (let i = 0; i < 3; i++) pedidos.push(await pedidoEnCamino(cliente, d, d.productoId));
    const desactivacion = desactivarMientrasOpera(d.comercioId, desactivado.id, 900);
    await esperar(250);
    const resultados = await Promise.all([autoconfirmar(), autoconfirmar()]);
    await desactivacion;
    for (const r of resultados) registrar(`ronda ${ronda} proceso durante la desactivacion`, r, [200]);
    for (const id of pedidos) {
      if (estadoPedido(id) !== 'ENTREGADO') problemas.push(`ronda ${ronda}: el pedido ${id} termino ${estadoPedido(id)}`);
      if (copias(desactivado.id, id, T30) !== 0) problemas.push(`ronda ${ronda}: el Empleado desactivado en medio del proceso recibio una copia del pedido ${id} (el proceso no esperó a la desactivacion)`);
      if (copias(fijo.id, id, T30) !== 1) problemas.push(`ronda ${ronda}: el Empleado fijo tiene ${copias(fijo.id, id, T30)} copias del pedido ${id}`);
      if (copias(d.duenoId, id, T30) !== 1) problemas.push(`ronda ${ronda}: el Dueño tiene ${copias(d.duenoId, id, T30)} copias del pedido ${id}`);
    }
    const lecturaDesactivado = await lista(desactivado, d.comercioId);
    if (lecturaDesactivado.status !== 404) problemas.push(`ronda ${ronda}: el desactivado todavia ve sus avisos (${lecturaDesactivado.status})`);
    invariantesGenerales(problemas, ronda, [d.comercioId]);
  }
  console.log('Resumen (3): la autoconfirmacion disparada mientras una desactivacion mantiene la relacion bloqueada espera y deja afuera al desactivado.');
  return problemas;
}

async function escenario4(admin) {
  const problemas = [];
  const cantidad = Number(process.env.PEDIDOS_VOLUMEN || 300);
  const integrantes = Number(process.env.EMPLEADOS_VOLUMEN || 5);
  const d = await comercioListo(admin);
  const empleados = [];
  for (let i = 0; i < integrantes; i++) empleados.push(await empleadoDe(d, [d.comercioId]));
  const cliente = await comprador();
  const clienteId = Number(sql(`SELECT id FROM usuario WHERE email = '${cliente.email}';`));
  const ajenos = Number(sql(`SELECT COUNT(*) FROM pedido WHERE estado = 'EN_CAMINO';`));
  console.log(`Volumen: cargando ${cantidad} pedidos EN_CAMINO en el comercio ${d.comercioId} con ${integrantes} Empleados activos (${ajenos} EN_CAMINO ajenos en la base)...`);
  sql(
    `INSERT INTO pedido (cliente_id, comercio_id, modalidad_entrega, estado, pago_estado, subtotal, cargo_servicio_cliente, cargo_servicio_comercio, total, fecha_creacion) ` +
      `SELECT ${clienteId}, ${d.comercioId}, 'RETIRO', 'EN_CAMINO', 'PAGADO', 10000, 200, 100, 10200, '${hace(300)}' FROM seq_1_to_${cantidad};`,
  );
  const base = `FROM pedido p WHERE p.comercio_id = ${d.comercioId} AND p.estado = 'EN_CAMINO'`;
  sql(
    `INSERT INTO historial_estado_pedido (pedido_id, estado, actor_rol, actor_usuario_id, fecha_hora) ` +
      `SELECT p.id, 'PENDIENTE_CONFIRMACION_COMERCIO', 'SISTEMA', NULL, '${hace(240)}' ${base} ` +
      `UNION ALL SELECT p.id, 'EN_PREPARACION', 'DUENO', ${d.duenoId}, '${hace(60)}' ${base} ` +
      `UNION ALL SELECT p.id, 'EN_CAMINO', 'DUENO', ${d.duenoId}, '${hace(40)}' ${base};`,
  );
  const candidatos = Number(sql(`SELECT COUNT(*) FROM pedido WHERE estado = 'EN_CAMINO';`));

  const t0 = Date.now();
  const sinVencer = await autoconfirmar();
  const msSinVencer = Date.now() - t0;
  if (sinVencer.status !== 200) problemas.push(`pasada sin pedidos vencidos: ${sinVencer.status}`);
  const todavia = Number(sql(`SELECT COUNT(*) FROM pedido WHERE comercio_id = ${d.comercioId} AND estado = 'EN_CAMINO';`));
  if (todavia !== cantidad) problemas.push(`la pasada con pedidos de 40 minutos autoconfirmo ${cantidad - todavia} (tenia que dejarlos en camino)`);

  sql(`UPDATE historial_estado_pedido h JOIN pedido p ON p.id = h.pedido_id SET h.fecha_hora = '${hace(100)}' WHERE p.comercio_id = ${d.comercioId} AND h.estado = 'EN_CAMINO';`);
  const t1 = Date.now();
  const vencidos = await autoconfirmar();
  const msVencidos = Date.now() - t1;
  if (vencidos.status !== 200) problemas.push(`pasada con pedidos vencidos: ${vencidos.status}`);
  const entregados = Number(sql(`SELECT COUNT(*) FROM pedido WHERE comercio_id = ${d.comercioId} AND estado = 'ENTREGADO';`));
  if (entregados !== cantidad) problemas.push(`se autoconfirmaron ${entregados} de ${cantidad} pedidos`);
  const avisosEquipo = Number(sql(`SELECT COUNT(*) FROM notificacion WHERE tipo = '${T30}' AND comercio_id = ${d.comercioId};`));
  const esperados = cantidad * (1 + integrantes);
  if (avisosEquipo !== esperados) problemas.push(`hay ${avisosEquipo} avisos T30 y se esperaban ${esperados}`);
  const duplicadas = Number(sql(
    `SELECT COUNT(*) FROM (SELECT usuario_id, entidad_id FROM notificacion WHERE tipo = '${T30}' AND comercio_id = ${d.comercioId} GROUP BY usuario_id, entidad_id HAVING COUNT(*) > 1) t;`,
  ));
  if (duplicadas) problemas.push(`${duplicadas} avisos T30 duplicados`);

  console.log(`MEDICION: una pasada del proceso con ${candidatos} pedidos EN_CAMINO en la base (${cantidad} del comercio con ${integrantes} Empleados activos mas el Dueño):`);
  console.log(`  - sin ninguno vencido (solo el bloqueo uniforme del equipo): ${msSinVencer} ms (${(msSinVencer / candidatos).toFixed(1)} ms por pedido)`);
  console.log(`  - con ${cantidad} vencidos (${cantidad} entregas, ${cantidad} avisos T8 y ${esperados} avisos T30): ${msVencidos} ms (${(msVencidos / cantidad).toFixed(1)} ms por pedido autoconfirmado)`);
  return problemas;
}

const bytesDelLog = () => (existsSync(LOG_BACKEND) ? statSync(LOG_BACKEND).size : 0);

function revisarElLog(desde) {
  if (!existsSync(LOG_BACKEND)) return [`no se encontro el log del backend en ${LOG_BACKEND}: revisar a mano que no tenga "Deadlock found" ni "Lock wait timeout"`];
  const texto = readFileSync(LOG_BACKEND).subarray(desde).toString('utf8');
  const problemas = [];
  const deadlocks = (texto.match(/Deadlock found/g) || []).length;
  const timeouts = (texto.match(/Lock wait timeout/g) || []).length;
  const fallos = (texto.match(/falló para el pedidoId/g) || []).length;
  if (deadlocks) problemas.push(`el log del backend tiene ${deadlocks} "Deadlock found"`);
  if (timeouts) problemas.push(`el log del backend tiene ${timeouts} "Lock wait timeout"`);
  if (fallos) problemas.push(`el log del backend tiene ${fallos} procesos de pedido que fallaron y siguieron con el siguiente`);
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
  const escenarios = [escenario1, escenario2, escenario3, escenario4];
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
