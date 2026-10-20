import { execFileSync, spawn } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';

const B = process.env.E2E_API_BASE_URL || 'http://localhost:8080/api/v1';
const ROUNDS = Number(process.env.ROUNDS || 10);
const ADMIN = { nombreUsuario: 'adminbajonea', password: process.env.ADMIN_PASSWORD };
const sqlUnaVez = (q) => execFileSync(process.env.MYSQL_BIN || 'C:/xampp/mysql/bin/mysql.exe', ['-u', 'root', '--default-character-set=utf8mb4', '-N', '-B', 'bajonea_test', '-e', q]).toString().trim();
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
  const email = `stressa4b.${u}@bajonea.test`;
  const nombreUsuario = `sf${u}`.slice(0, 20);
  const password = clavePropia();
  const r = await call('POST', '/auth/registro/comercio', null, {
    aceptaTerminos: true,
    razonSocial: `StressA4b ${u} SRL`,
    cuit: cuit(),
    condicionIva: 'RESPONSABLE_INSCRIPTO',
    tipoSociedad: 'SRL',
    domicilioFiscal: 'Av. Stress 1',
    fechaInicioActividades: '2020-01-01',
    nombre: `StressA4b ${u}`,
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
  const email = `stressa4b.cli.${u}@bajonea.test`;
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
const BASE_CATEGORIA = `StressA4b ${uniq()}`;

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

const accionPedido = (actor, comercioId, pedidoId, accion) =>
  call('PUT', `/pedidos/comercio/${pedidoId}/${accion}`, actor.token, accion === 'rechazar' || accion === 'anular' ? { motivo: 'SIN_STOCK' } : {}, cabecera(comercioId));
const noRetirado = (actor, comercioId, pedidoId) => accionPedido(actor, comercioId, pedidoId, 'no-retirado');
const entregar = (actor, comercioId, pedidoId) => accionPedido(actor, comercioId, pedidoId, 'entregar');
const cancelarComoCliente = (cliente, pedidoId) => call('PUT', `/pedidos/cliente/${pedidoId}/cancelar`, cliente.token, {});
const envejecer = (pedidoId, minutos) => call('PUT', `/test/pedidos/${pedidoId}/envejecer-listo?minutos=${minutos}`);
const trazabilidad = (actor, comercioId, pedidoId) => call('GET', `/pedidos/comercio/${pedidoId}/trazabilidad`, actor.token, undefined, cabecera(comercioId));
const listaDePedidos = (actor, comercioId) => call('GET', '/pedidos/comercio', actor.token, undefined, cabecera(comercioId));
const actividad = (actor, comercioId) => call('GET', '/comercios/equipo/actividad', actor.token, undefined, cabecera(comercioId));
const resumenHoy = (actor, comercioId) => call('GET', '/pedidos/comercio/resumen-turno', actor.token, undefined, cabecera(comercioId));
const avisosDelCliente = (cliente) => call('GET', '/notificaciones', cliente.token);
const loginCorrecto = (cuenta) => call('POST', '/auth/login', null, { nombreUsuario: cuenta.nombreUsuario, password: cuenta.password });
const loginIncorrecto = (cuenta) => call('POST', '/auth/login', null, { nombreUsuario: cuenta.nombreUsuario, password: 'ClaveIncorrecta1' });

async function pedidoListo(cliente, d, minutos) {
  const id = await pedidoPendiente(cliente, d.productoId);
  const aceptado = await accionPedido(d, d.comercioId, id, 'aceptar');
  if (aceptado.status !== 200) throw new Error('aceptar ' + JSON.stringify(aceptado));
  const despachado = await accionPedido(d, d.comercioId, id, 'despachar');
  if (despachado.status !== 200) throw new Error('despachar ' + JSON.stringify(despachado));
  const viejo = await envejecer(id, minutos);
  if (viejo.status !== 200) throw new Error('envejecer ' + JSON.stringify(viejo));
  return id;
}

const horaDelProceso = () => sql("SELECT DATE_FORMAT(NOW() + INTERVAL 3 HOUR, '%Y-%m-%dT%H:%i:%s');");
const correrProceso = (ahora) => call('POST', `/test/jobs/pedidos/autoconfirmar-retiros?ahora=${ahora}`);

const textoT36 = (id) => `Tu pedido #${id} no fue retirado y el comercio lo cerró. Como ya estaba preparado, no hay devolución del pago.`;
const contarAvisos = (id, tipo) => Number(sql(`SELECT COUNT(*) FROM notificacion WHERE entidad_tipo = 'PEDIDO' AND entidad_id = ${id} AND tipo = '${tipo}';`));
const filasDeHistorial = (id, estado) => Number(sql(`SELECT COUNT(*) FROM historial_estado_pedido WHERE pedido_id = ${id} AND estado = '${estado}';`));
const notasDelPedido = (id) => Number(sql(`SELECT COUNT(*) FROM nota_credito nc JOIN pago p ON p.id = nc.pago_id WHERE p.pedido_id = ${id};`));

function verificarTransicionUnica(problemas, ronda, id, permitidos) {
  const estado = sql(`SELECT estado FROM pedido WHERE id = ${id};`);
  const ultimo = sql(`SELECT estado FROM historial_estado_pedido WHERE pedido_id = ${id} ORDER BY id DESC LIMIT 1;`);
  if (estado !== ultimo) problemas.push(`ronda ${ronda}: el pedido ${id} esta ${estado} y el ultimo historial dice ${ultimo}`);
  if (!permitidos.includes(estado)) problemas.push(`ronda ${ronda}: el pedido ${id} termino en ${estado} y solo podia terminar en ${permitidos.join(' o ')}`);
  for (const final of ['NO_RETIRADO', 'ENTREGADO']) {
    const filas = filasDeHistorial(id, final);
    if (filas !== (estado === final ? 1 : 0)) problemas.push(`ronda ${ronda}: el pedido ${id} esta ${estado} y tiene ${filas} fila(s) de historial ${final}`);
  }
  const avisos = contarAvisos(id, 'PEDIDO_NO_RETIRADO');
  const esperados = estado === 'NO_RETIRADO' ? 1 : 0;
  if (avisos !== esperados) problemas.push(`ronda ${ronda}: el pedido ${id} esta ${estado} y tiene ${avisos} aviso(s) T36 (esperados ${esperados})`);
  const aOtros = Number(sql(`SELECT COUNT(*) FROM notificacion WHERE entidad_tipo = 'PEDIDO' AND entidad_id = ${id} AND tipo = 'PEDIDO_NO_RETIRADO' AND usuario_id <> (SELECT cliente_id FROM pedido WHERE id = ${id});`));
  if (aOtros !== 0) problemas.push(`ronda ${ronda}: el aviso T36 del pedido ${id} llego a ${aOtros} usuario(s) que no son el Cliente`);
  if (contarAvisos(id, 'PEDIDO_CERRADO_TIMER_SUSPENSION') !== 0) problemas.push(`ronda ${ronda}: el pedido ${id} recibio el viejo aviso de cierre por timer`);
  if (notasDelPedido(id) !== 0) problemas.push(`ronda ${ronda}: el pedido ${id} tiene nota de credito`);
  if (estado === 'NO_RETIRADO') {
    const mensaje = sql(`SELECT mensaje FROM notificacion WHERE entidad_tipo = 'PEDIDO' AND entidad_id = ${id} AND tipo = 'PEDIDO_NO_RETIRADO';`);
    if (mensaje !== textoT36(id)) problemas.push(`ronda ${ronda}: el aviso T36 del pedido ${id} no tiene el texto aprobado: ${mensaje}`);
  }
  return estado;
}

async function escenario1(admin) {
  const { problemas, registrar } = nuevoRegistro();
  const resumen = {};
  for (let ronda = 1; ronda <= ROUNDS; ronda++) {
    const d = await comercioListo(admin);
    const empleados = [await empleadoDe(d, [d.comercioId]), await empleadoDe(d, [d.comercioId]), await empleadoDe(d, [d.comercioId])];
    const cliente = await comprador();
    const ids = [];
    for (let i = 0; i < 5; i++) ids.push(await pedidoListo(cliente, d, 90));
    const actores = [d, ...empleados];

    const tareas = ids.flatMap((id) => [
      ...actores.flatMap((actor) => [0, 1].map(() => esperar(aleatorio(40)).then(() => noRetirado(actor, d.comercioId, id)).then((r) => ({ tipo: 'cerrar', id, r })))),
      ...[d, empleados[0]].map((actor) => esperar(aleatorio(40)).then(() => entregar(actor, d.comercioId, id)).then((r) => ({ tipo: 'entregar', id, r }))),
      esperar(aleatorio(40)).then(() => cancelarComoCliente(cliente, id)).then((r) => ({ tipo: 'cancelar-cliente', id, r })),
      esperar(aleatorio(60)).then(() => trazabilidad(empleados[1], d.comercioId, id)).then((r) => ({ tipo: 'trazabilidad', id, r })),
    ]);
    tareas.push(
      ...actores.map((actor) => esperar(aleatorio(80)).then(() => listaDePedidos(actor, d.comercioId)).then((r) => ({ tipo: 'lista', r }))),
      ...actores.map((actor) => esperar(aleatorio(80)).then(() => resumenHoy(actor, d.comercioId)).then((r) => ({ tipo: 'resumen', r }))),
      esperar(aleatorio(80)).then(() => actividad(d, d.comercioId)).then((r) => ({ tipo: 'actividad', r })),
      esperar(aleatorio(80)).then(() => avisosDelCliente(cliente)).then((r) => ({ tipo: 'avisos-cliente', r })),
    );
    const resultados = await Promise.all(tareas);
    const ganadores = new Map();
    for (const { tipo, id, r } of resultados) {
      contar(resumen, `${tipo}:${r.status}`);
      if (tipo === 'cerrar' || tipo === 'entregar') {
        registrar(`ronda ${ronda} ${tipo} pedido ${id}`, r, [200, 409]);
        if (r.status === 200) ganadores.set(id, (ganadores.get(id) ?? 0) + 1);
      } else if (tipo === 'cancelar-cliente') {
        registrar(`ronda ${ronda} cancelar pedido ${id}`, r, [409]);
      } else {
        registrar(`ronda ${ronda} ${tipo}`, r, [200]);
      }
    }
    for (const id of ids) {
      if ((ganadores.get(id) ?? 0) !== 1) problemas.push(`ronda ${ronda}: el pedido ${id} tuvo ${ganadores.get(id) ?? 0} ganadores (tiene que ser exactamente 1)`);
      verificarTransicionUnica(problemas, ronda, id, ['NO_RETIRADO', 'ENTREGADO']);
    }
  }
  console.log('Resumen (1, el Dueño y tres Empleados cierran como no retirado contra entregar y contra la cancelacion del Cliente, con listas, trazabilidad, Actividad y resumen en paralelo):', resumir(resumen));
  return problemas;
}

async function escenario2(admin) {
  const { problemas, registrar } = nuevoRegistro();
  const resumen = {};
  for (let ronda = 1; ronda <= ROUNDS; ronda++) {
    const d = await comercioListo(admin);
    const elena = await empleadoDe(d, [d.comercioId]);
    const cliente = await comprador();
    const ids = [];
    for (let i = 0; i < 4; i++) ids.push(await pedidoListo(cliente, d, 90));
    const suspension = await call('PUT', `/administrador/comercios/${d.comercioId}/suspender`, admin, { motivo: 'Suspension de estres A4b' });
    registrar(`ronda ${ronda} suspender`, suspension, [200]);
    sql(`UPDATE pedido SET suspension_retiro_expira = NOW() - INTERVAL 1 MINUTE WHERE comercio_id = ${d.comercioId} AND estado = 'LISTO_PARA_RETIRAR';`);
    const ahora = horaDelProceso();

    const tareas = [
      ...[0, 1, 2, 3].map(() => esperar(aleatorio(40)).then(() => correrProceso(ahora)).then((r) => ({ tipo: 'proceso', r }))),
      ...ids.flatMap((id) => [
        esperar(aleatorio(60)).then(() => noRetirado(elena, d.comercioId, id)).then((r) => ({ tipo: 'cerrar-empleada', id, r })),
        esperar(aleatorio(60)).then(() => noRetirado(d, d.comercioId, id)).then((r) => ({ tipo: 'cerrar-dueno', id, r })),
        esperar(aleatorio(60)).then(() => trazabilidad(d, d.comercioId, id)).then((r) => ({ tipo: 'trazabilidad', r })),
      ]),
      esperar(aleatorio(60)).then(() => actividad(d, d.comercioId)).then((r) => ({ tipo: 'actividad', r })),
      esperar(aleatorio(60)).then(() => listaDePedidos(elena, d.comercioId)).then((r) => ({ tipo: 'lista', r })),
    ];
    const resultados = await Promise.all(tareas);
    for (const { tipo, id, r } of resultados) {
      contar(resumen, `${tipo}:${r.status}`);
      if (tipo.startsWith('cerrar')) registrar(`ronda ${ronda} ${tipo} pedido ${id}`, r, [200, 409]);
      else registrar(`ronda ${ronda} ${tipo}`, r, [200]);
    }
    for (const id of ids) {
      verificarTransicionUnica(problemas, ronda, id, ['NO_RETIRADO']);
      const sistema = Number(sql(`SELECT COUNT(*) FROM historial_estado_pedido WHERE pedido_id = ${id} AND estado = 'NO_RETIRADO' AND actor_rol = 'SISTEMA' AND motivo_timeout = 'TIMEOUT_RETIRO_SUSPENSION';`));
      const manual = Number(sql(`SELECT COUNT(*) FROM historial_estado_pedido WHERE pedido_id = ${id} AND estado = 'NO_RETIRADO' AND actor_rol IN ('DUENO','EMPLEADO') AND motivo_timeout IS NULL;`));
      if (sistema + manual !== 1) problemas.push(`ronda ${ronda}: el pedido ${id} tiene ${sistema} cierre(s) del sistema y ${manual} manual(es); tiene que haber exactamente uno`);
    }
  }
  console.log('Resumen (2, el proceso automatico del comercio suspendido (cuatro corridas) contra el cierre manual del Dueño y de una Empleada):', resumir(resumen));
  return problemas;
}

async function escenario3(admin) {
  const { problemas, registrar } = nuevoRegistro();
  const resumen = {};
  for (let ronda = 1; ronda <= ROUNDS; ronda++) {
    const d = await comercioListo(admin);
    const elena = await empleadoDe(d, [d.comercioId]);
    const cliente = await comprador();
    const listos = [];
    for (let i = 0; i < 4; i++) listos.push(await pedidoListo(cliente, d, 90));
    const enPreparacion = await pedidoPendiente(cliente, d.productoId);
    await accionPedido(d, d.comercioId, enPreparacion, 'aceptar');
    const todos = [...listos, enPreparacion];

    const tareas = [
      esperar(aleatorio(60)).then(() => call('PUT', `/administrador/comercios/${d.comercioId}/suspender`, admin, { motivo: 'Suspension de estres A4b' })).then((r) => ({ tipo: 'suspender', r })),
      ...listos.flatMap((id) => [
        esperar(aleatorio(60)).then(() => noRetirado(elena, d.comercioId, id)).then((r) => ({ tipo: 'cerrar-empleada', id, r })),
        esperar(aleatorio(60)).then(() => noRetirado(d, d.comercioId, id)).then((r) => ({ tipo: 'cerrar-dueno', id, r })),
      ]),
      esperar(aleatorio(60)).then(() => listaDePedidos(d, d.comercioId)).then((r) => ({ tipo: 'lista', r })),
    ];
    const resultados = await Promise.all(tareas);
    for (const { tipo, id, r } of resultados) {
      contar(resumen, `${tipo}:${r.status}`);
      if (tipo === 'suspender') registrar(`ronda ${ronda} suspender`, r, [200]);
      else if (tipo.startsWith('cerrar')) registrar(`ronda ${ronda} ${tipo} pedido ${id}`, r, [200, 409]);
      else registrar(`ronda ${ronda} ${tipo}`, r, [200]);
    }
    for (const id of listos) {
      const estado = verificarTransicionUnica(problemas, ronda, id, ['NO_RETIRADO', 'LISTO_PARA_RETIRAR']);
      const timer = sql(`SELECT suspension_retiro_expira IS NOT NULL FROM pedido WHERE id = ${id};`);
      if (estado === 'LISTO_PARA_RETIRAR' && timer !== '1') problemas.push(`ronda ${ronda}: el pedido ${id} quedo listo sin cerrar y sin el plazo de la suspension`);
    }
    const estadoPreparacion = sql(`SELECT estado FROM pedido WHERE id = ${enPreparacion};`);
    if (estadoPreparacion !== 'CANCELADO_POR_SISTEMA') problemas.push(`ronda ${ronda}: el pedido en preparacion quedo ${estadoPreparacion} y la suspension tenia que cancelarlo`);
    if (contarAvisos(enPreparacion, 'PEDIDO_NO_RETIRADO') !== 0) problemas.push(`ronda ${ronda}: el pedido en preparacion recibio un aviso de no retirado`);
    if (todos.length === 0) problemas.push('sin pedidos');
  }
  console.log('Resumen (3, el cierre manual del Dueño y de una Empleada contra la suspension del comercio por el Administrador):', resumir(resumen));
  return problemas;
}

async function escenario4(admin) {
  const { problemas, registrar } = nuevoRegistro();
  const resumen = {};
  for (let ronda = 1; ronda <= ROUNDS; ronda++) {
    const d = await comercioListo(admin);
    const gabriela = await empleadoDe(d, [d.comercioId]);
    const hector = await empleadoDe(d, [d.comercioId]);
    const cliente = await comprador();
    const ids = [];
    for (let i = 0; i < 4; i++) ids.push(await pedidoListo(cliente, d, 90));
    const retenida = desactivarMientrasOpera(d.comercioId, gabriela.id, 300);
    await esperar(100);

    const tareas = ids.flatMap((id) => [
      esperar(aleatorio(450)).then(() => noRetirado(gabriela, d.comercioId, id)).then((r) => ({ tipo: 'cerrar-gabriela', id, r })),
      esperar(aleatorio(450)).then(() => noRetirado(hector, d.comercioId, id)).then((r) => ({ tipo: 'cerrar-hector', id, r })),
    ]);
    const resultados = await Promise.all(tareas);
    await retenida;
    for (const { tipo, id, r } of resultados) {
      contar(resumen, `${tipo}:${r.status}`);
      registrar(`ronda ${ronda} ${tipo} pedido ${id}`, r, tipo === 'cerrar-gabriela' ? [200, 404, 409] : [200, 409]);
      if (tipo === 'cerrar-gabriela' && r.status === 404 && JSON.stringify(r.json) !== NO_DISPONIBLE) {
        problemas.push(`ronda ${ronda}: el 404 de la Empleada desactivada no es el de siempre: ${JSON.stringify(r.json)}`);
      }
    }
    for (const id of ids) {
      verificarTransicionUnica(problemas, ronda, id, ['NO_RETIRADO']);
      const actorGabriela = Number(sql(`SELECT COUNT(*) FROM historial_estado_pedido WHERE pedido_id = ${id} AND estado = 'NO_RETIRADO' AND actor_usuario_id = ${gabriela.id};`));
      const actorHector = Number(sql(`SELECT COUNT(*) FROM historial_estado_pedido WHERE pedido_id = ${id} AND estado = 'NO_RETIRADO' AND actor_usuario_id = ${hector.id};`));
      if (actorGabriela + actorHector !== 1) problemas.push(`ronda ${ronda}: el pedido ${id} no tiene exactamente un actor del cierre`);
    }
    const despues = await noRetirado(gabriela, d.comercioId, ids[0]);
    if (despues.status !== 404) problemas.push(`ronda ${ronda}: con la relacion de Gabriela inactiva el cierre dio ${despues.status} en vez de 404`);
  }
  console.log('Resumen (4, el cierre manual de una Empleada mientras una desactivacion sostiene su relacion FOR UPDATE, contra otra Empleada):', resumir(resumen));
  return problemas;
}

async function escenario5(admin) {
  const { problemas, registrar } = nuevoRegistro();
  const resumen = {};
  for (let ronda = 1; ronda <= ROUNDS; ronda++) {
    const d = await comercioListo(admin);
    const elena = await empleadoDe(d, [d.comercioId]);
    const cliente = await comprador();
    const ids = [];
    for (let i = 0; i < 4; i++) ids.push(await pedidoListo(cliente, d, 90));

    const tareas = [
      ...ids.flatMap((id) => [
        esperar(aleatorio(80)).then(() => noRetirado(elena, d.comercioId, id)).then((r) => ({ tipo: 'cerrar-empleada', id, r })),
        esperar(aleatorio(80)).then(() => noRetirado(d, d.comercioId, id)).then((r) => ({ tipo: 'cerrar-dueno', id, r })),
      ]),
      ...[0, 1, 2].map(() => esperar(aleatorio(80)).then(() => loginCorrecto(cliente)).then((r) => ({ tipo: 'login-cliente', r, permitidos: [200] }))),
      esperar(aleatorio(80)).then(() => loginIncorrecto(elena)).then((r) => ({ tipo: 'login-incorrecto-empleada', r, permitidos: [401] })),
      esperar(aleatorio(80)).then(() => loginIncorrecto(cliente)).then((r) => ({ tipo: 'login-incorrecto-cliente', r, permitidos: [401] })),
      esperar(aleatorio(80)).then(() => loginIncorrecto(d)).then((r) => ({ tipo: 'login-incorrecto-dueno', r, permitidos: [401] })),
    ];
    const resultados = await Promise.all(tareas);
    for (const { tipo, id, r, permitidos } of resultados) {
      contar(resumen, `${tipo}:${r.status}`);
      if (tipo.startsWith('cerrar')) registrar(`ronda ${ronda} ${tipo} pedido ${id}`, r, [200, 401, 409]);
      else registrar(`ronda ${ronda} ${tipo}`, r, permitidos);
    }
    for (const id of ids) {
      const estado = sql(`SELECT estado FROM pedido WHERE id = ${id};`);
      if (estado === 'NO_RETIRADO') verificarTransicionUnica(problemas, ronda, id, ['NO_RETIRADO']);
      else if (estado !== 'LISTO_PARA_RETIRAR') problemas.push(`ronda ${ronda}: el pedido ${id} quedo ${estado}`);
      else if (filasDeHistorial(id, 'NO_RETIRADO') !== 0) problemas.push(`ronda ${ronda}: el pedido ${id} sigue listo pero tiene historial de no retirado`);
    }
  }
  console.log('Resumen (5, el cierre manual contra el login (y el login fallido) del Dueño, del Cliente y de la Empleada, que toman las mismas filas de usuario):', resumir(resumen));
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
  const escenarios = [escenario1, escenario2, escenario3, escenario4, escenario5];
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
