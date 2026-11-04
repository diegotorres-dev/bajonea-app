import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';

const B = process.env.E2E_API_BASE_URL || 'http://localhost:8080/api/v1';
const LOC = process.env.LOC;
const ROUNDS = Number(process.env.ROUNDS || 3);
const PEDIDOS_POR_RONDA = Number(process.env.PEDIDOS_POR_RONDA || 12);
const PUERTO_MP = Number(process.env.MP_STUB_PORT || 9099);
const LOG_BACKEND = process.env.BACKEND_LOG || `${process.env.TEMP || '/tmp'}/backend-test.log`;
const ADMIN = { nombreUsuario: process.env.ADMIN_USUARIO || 'adminbajonea', password: process.env.ADMIN_PASSWORD };
const sqlUnaVez = (q) => execFileSync(process.env.MYSQL_BIN || 'C:/xampp/mysql/bin/mysql.exe', ['-u', 'root', '-N', '-B', 'bajonea_test', '-e', q]).toString().trim();
const sql = (q) => {
  let resultado = sqlUnaVez(q);
  for (let intento = 0; intento < 2 && resultado === '' && /^\s*SELECT/i.test(q); intento += 1) resultado = sqlUnaVez(q);
  return resultado;
};

if (!LOC) {
  console.error('Falta LOC (id de localidad de Rio Grande)');
  process.exit(1);
}
if (!ADMIN.password) {
  console.error('Falta ADMIN_PASSWORD (contraseña de admin@bajonea.ar en bajonea_test; ver testing/playwright/README.md)');
  process.exit(1);
}

const refundsDelStub = [];
let contadorDeReembolsos = 0;

function levantarMercadoPago() {
  const servidor = createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const partes = [];
    req.on('data', (parte) => partes.push(parte));
    req.on('end', () => {
      const responder = (cuerpo, estado = 200) => {
        setTimeout(() => {
          res.writeHead(estado, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(cuerpo));
        }, 30 + Math.floor(Math.random() * 90));
      };
      if (req.method === 'POST' && /^\/v1\/payments\/\d+\/refunds$/.test(url.pathname)) {
        contadorDeReembolsos += 1;
        const texto = Buffer.concat(partes).toString('utf8');
        const cuerpo = texto ? JSON.parse(texto) : {};
        const falla = Math.random() < 0.2;
        refundsDelStub.push({ pago: Number(url.pathname.split('/')[3]), amount: cuerpo.amount ?? null, clave: req.headers['x-idempotency-key'], aprobado: !falla });
        if (falla) return responder({ message: 'insufficient funds', error: 'bad_request', status: 400 }, 400);
        const respuesta = { id: 900000 + contadorDeReembolsos, status: 'approved' };
        if (cuerpo.amount !== undefined) respuesta.amount = cuerpo.amount;
        return responder(respuesta);
      }
      return responder({ message: 'no encontrado' }, 404);
    });
  });
  return new Promise((resolve) => servidor.listen(PUERTO_MP, () => resolve(servidor)));
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
const horarios = ['LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO', 'DOMINGO'].map((diaSemana) => ({
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
  const email = `stressrec.${u}@bajonea.test`;
  const nombreUsuario = `sr${u}`.slice(0, 20);
  const r = await call('POST', '/auth/registro/comercio', null, {
    aceptaTerminos: true,
    razonSocial: `StressRec ${u} SRL`,
    cuit: cuit(),
    condicionIva: 'RESPONSABLE_INSCRIPTO',
    tipoSociedad: 'SRL',
    domicilioFiscal: 'Av. Stress 1',
    fechaInicioActividades: '2020-01-01',
    nombre: `StressRec ${u}`,
    descripcion: 'x',
    telefono: tel(),
    tipoComercio: 'RESTAURANTE',
    aceptaDelivery: true,
    aceptaRetiro: true,
    nombreUsuario,
    email,
    password: 'Testing123',
    direccion: { calle: 'Stress', numero: '1', pisoDepto: null, codigoPostal: '9420', localidadId: LOC, principal: false },
    horarios,
    nombreRepresentante: 'Rep',
    apellidoRepresentante: 'Stress',
    dniRepresentante: dni(),
    telefonoRepresentante: tel(),
    fechaNacimientoRepresentante: '1985-03-15',
    fotoPerfilUrl: 'https://res.cloudinary.com/demo/image/upload/v1/comercios/pre-registro/stress.png',
    redesSociales: [{ tipo: 'INSTAGRAM', url: `https://instagram.com/sr${u}` }],
  });
  if (r.status !== 201) throw new Error('registro dueno ' + JSON.stringify(r));
  const login = await verificarYLoguear(email, nombreUsuario, 'Testing123');
  const comercioId = Number(sql(`SELECT c.id FROM comercio c JOIN usuario u ON u.id = c.dueno_id WHERE u.email = '${email}';`));
  sql(`UPDATE comercio SET estado = 'APROBADO' WHERE id = ${comercioId};`);
  const mp = await call('POST', `/test/duenos/${login.usuario.id}/mercadopago-simulada`);
  if (mp.status !== 200) throw new Error('mercadopago-simulada ' + JSON.stringify(mp));
  if (sql(`SELECT estado FROM comercio WHERE id = ${comercioId};`) !== 'APTO_VENTA') {
    const apto = await call('PUT', `/test/comercios/${comercioId}/apto-venta`);
    if (apto.status !== 200) throw new Error('apto-venta ' + JSON.stringify(apto));
  }
  return { token: login.token, duenoId: login.usuario.id, comercioId, h: { 'X-Comercio-Id': String(comercioId) } };
}

async function nuevoCliente() {
  const u = uniq();
  const email = `stressrecc.${u}@bajonea.test`;
  const nombreUsuario = `sq${u}`.slice(0, 20);
  const r = await call('POST', '/auth/registro/cliente', null, {
    nombre: 'Cliente',
    apellido: 'Stress',
    dni: dni(),
    fechaNacimiento: '1995-05-20',
    telefono: tel(),
    nombreUsuario,
    email,
    password: 'Testing123',
    aceptaTerminos: true,
    direccion: { calle: 'Stress', numero: '1', pisoDepto: null, codigoPostal: '9420', localidadId: LOC, principal: true },
  });
  if (r.status !== 201) throw new Error('registro cliente ' + JSON.stringify(r));
  const login = await verificarYLoguear(email, nombreUsuario, 'Testing123');
  return { token: login.token, id: login.usuario.id };
}

function pedidoEntregado(clienteId, comercioId) {
  const id = sql(`INSERT INTO pedido (cliente_id, comercio_id, modalidad_entrega, estado, pago_estado, subtotal, cargo_servicio_cliente, cargo_servicio_comercio, total, fecha_creacion, fecha_entrega, fuente_entrega) `
    + `VALUES (${clienteId}, ${comercioId}, 'DOMICILIO', 'ENTREGADO', 'PAGADO', 1500, 200, 100, 1700, NOW(), NOW(), 'CLIENTE'); SELECT LAST_INSERT_ID();`);
  sql(`INSERT INTO pago (pedido_id, monto, mp_preferencia_id, mp_estado, id_transaccion_mp, fecha_confirmacion) VALUES (${id}, 1700, 'pref-${id}', 'approved', CAST(${100000 + Number(id)} AS CHAR), NOW());`);
  sql(`INSERT INTO historial_estado_pedido (pedido_id, estado, actor_rol, actor_usuario_id, fecha_hora) VALUES (${id}, 'PENDIENTE_CONFIRMACION_COMERCIO', 'SISTEMA', NULL, NOW());`);
  return Number(id);
}

function nuevoRegistro() {
  const problemas = [];
  return {
    problemas,
    registrar: (etiqueta, r, permitidos) => {
      if (r.status >= 500) problemas.push(`${etiqueta}: ${r.status} ${JSON.stringify(r.json)}`);
      else if (permitidos && !permitidos.includes(r.status)) problemas.push(`${etiqueta}: estado inesperado ${r.status} ${JSON.stringify(r.json)}`);
    },
    exigir: (condicion, mensaje) => {
      if (!condicion) problemas.push(mensaje);
    },
  };
}

const MOTIVOS = ['NO_RECIBI_PEDIDO', 'FALTAN_PRODUCTOS', 'PRODUCTOS_EQUIVOCADOS', 'PRODUCTO_EN_MAL_ESTADO', 'COBRO_INCORRECTO', 'OTRO'];
const reclamar = (cliente, pedidoId) => call('POST', `/pedidos/cliente/${pedidoId}/reclamo`, cliente.token, { motivo: MOTIVOS[aleatorio(MOTIVOS.length)], descripcion: `Reclamo de estres ${uniq()} con texto suficiente` });
const resolucionAleatoria = () => {
  const n = aleatorio(3);
  if (n === 0) return { tipo: 'REEMBOLSO_TOTAL' };
  if (n === 1) return { tipo: 'REEMBOLSO_PARCIAL', monto: 100 + aleatorio(1000) + 0.5 };
  return { tipo: 'RECHAZO', motivo: `Rechazo de estres ${uniq()}` };
};
const resolver = (admin, id, cuerpo) => call('PUT', `/administrador/reclamos/${id}/resolver`, admin, cuerpo);

function reclamoDe(pedidoId) {
  const id = sql(`SELECT id FROM reclamo WHERE pedido_id = ${pedidoId};`);
  return id === '' ? null : Number(id);
}

function auditarPedido(registro, etiqueta, pedidoId) {
  const filas = Number(sql(`SELECT COUNT(*) FROM reclamo WHERE pedido_id = ${pedidoId};`));
  registro.exigir(filas === 1, `${etiqueta}: el pedido ${pedidoId} tiene ${filas} reclamos`);
  if (filas !== 1) return;
  const [id, estado, tipo, monto] = sql(`SELECT id, estado, IFNULL(tipo_resolucion, 'NULL'), IFNULL(monto_aprobado, 'NULL') FROM reclamo WHERE pedido_id = ${pedidoId};`).split('\t');
  const notas = sql(`SELECT nc.id, nc.estado, nc.monto, IFNULL(nc.reclamo_id, 'NULL'), nc.motivo FROM nota_credito nc JOIN pago pg ON pg.id = nc.pago_id WHERE pg.pedido_id = ${pedidoId} ORDER BY nc.id;`)
    .split('\n').filter(Boolean).map((l) => l.split('\t'));
  if (estado === 'PENDIENTE') {
    registro.exigir(notas.length === 0, `${etiqueta}: el pedido ${pedidoId} tiene un reclamo pendiente y ${notas.length} notas`);
    return;
  }
  if (tipo === 'RECHAZO') {
    registro.exigir(estado === 'RECHAZADO' && notas.length === 0, `${etiqueta}: el pedido ${pedidoId} rechazado tiene ${notas.length} notas`);
    return;
  }
  registro.exigir(estado === 'APROBADO' && notas.length === 1, `${etiqueta}: el pedido ${pedidoId} aprobado tiene ${notas.length} notas`);
  if (notas.length !== 1) return;
  const [, estadoNota, montoNota, reclamoNota, motivoNota] = notas[0];
  registro.exigir(reclamoNota === id && motivoNota === 'RECLAMO', `${etiqueta}: la nota del pedido ${pedidoId} no esta ligada al reclamo ${id}`);
  registro.exigir(Number(montoNota) === Number(monto) && Number(montoNota) > 0 && Number(montoNota) <= 1700, `${etiqueta}: el monto aprobado ${monto} no coincide con la nota ${montoNota}`);
  registro.exigir(['PROCESADO', 'FALLIDO', 'PENDIENTE'].includes(estadoNota), `${etiqueta}: la nota del pedido ${pedidoId} quedo ${estadoNota}`);
  const avisosCliente = Number(sql(`SELECT COUNT(*) FROM notificacion n JOIN pedido p ON p.cliente_id = n.usuario_id WHERE p.id = ${pedidoId} AND n.entidad_id = ${pedidoId} AND n.tipo = 'RECLAMO_APROBADO' AND n.canal = 'PUSH';`));
  registro.exigir(avisosCliente === 1, `${etiqueta}: el pedido ${pedidoId} tiene ${avisosCliente} avisos de aprobacion`);
}

async function escenarioRafagaMixta(contexto) {
  const { admin, dueno } = contexto;
  const registro = nuevoRegistro();
  for (let ronda = 1; ronda <= ROUNDS; ronda++) {
    const filas = [];
    for (let i = 0; i < PEDIDOS_POR_RONDA; i++) {
      const cliente = await nuevoCliente();
      filas.push({ cliente, pedido: pedidoEntregado(cliente.id, dueno.comercioId) });
    }
    const creaciones = await Promise.all(filas.flatMap(({ cliente, pedido }) => [0, 1, 2].map(async (n) => {
      await esperar(aleatorio(25));
      const r = await reclamar(cliente, pedido);
      registro.registrar(`S1 ronda ${ronda} crear ${pedido}`, r, [201, 409]);
      return r.status;
    })));
    for (const { pedido } of filas) {
      const reclamos = Number(sql(`SELECT COUNT(*) FROM reclamo WHERE pedido_id = ${pedido};`));
      registro.exigir(reclamos === 1, `S1 ronda ${ronda}: el pedido ${pedido} tiene ${reclamos} reclamos tras tres creaciones simultaneas`);
    }
    const tareas = [];
    const ganadores = new Map();
    for (const { cliente, pedido } of filas) {
      const id = reclamoDe(pedido);
      if (id === null) continue;
      for (let n = 0; n < 3; n++) {
        tareas.push(esperar(aleatorio(30)).then(() => resolver(admin, id, resolucionAleatoria())).then((r) => {
          registro.registrar(`S1 ronda ${ronda} resolver ${id}`, r, [200, 409]);
          if (r.status === 200) ganadores.set(id, (ganadores.get(id) || 0) + 1);
        }));
      }
      tareas.push(call('GET', '/pedidos/cliente', cliente.token).then((r) => registro.registrar(`S1 ronda ${ronda} lista Cliente`, r, [200])));
      tareas.push(call('GET', `/administrador/reclamos/${id}`, admin).then((r) => registro.registrar(`S1 ronda ${ronda} detalle ${id}`, r, [200])));
    }
    for (const filtro of ['PENDIENTES', 'REEMBOLSO_EN_PROCESO', 'RESUELTOS']) {
      tareas.push(call('GET', `/administrador/reclamos?filtro=${filtro}&limite=50`, admin).then((r) => registro.registrar(`S1 ronda ${ronda} bandeja ${filtro}`, r, [200])));
    }
    tareas.push(call('GET', '/administrador/metricas', admin).then((r) => registro.registrar(`S1 ronda ${ronda} metricas`, r, [200])));
    tareas.push(call('GET', '/pedidos/comercio', dueno.token, undefined, dueno.h).then((r) => registro.registrar(`S1 ronda ${ronda} lista Dueño`, r, [200])));
    await Promise.all(tareas);
    for (const { pedido } of filas) {
      const id = reclamoDe(pedido);
      registro.exigir(ganadores.get(id) === 1, `S1 ronda ${ronda}: el reclamo ${id} tuvo ${ganadores.get(id) || 0} resoluciones exitosas`);
    }

    const fallidas = sql(`SELECT nc.id FROM nota_credito nc JOIN pago pg ON pg.id = nc.pago_id JOIN pedido p ON p.id = pg.pedido_id WHERE nc.estado = 'FALLIDO' AND nc.reclamo_id IS NOT NULL AND p.comercio_id = ${dueno.comercioId};`)
      .split('\n').filter(Boolean).map(Number);
    const reintentos = await Promise.all(fallidas.flatMap((nota) => [0, 1].map(async () => {
      await esperar(aleatorio(30));
      const r = await call('POST', `/administrador/reembolsos/${nota}/reintentar`, admin);
      registro.registrar(`S1 ronda ${ronda} reintento nota ${nota}`, r, [200, 409]);
      return r.status;
    })));
    for (const { pedido } of filas) auditarPedido(registro, `S1 ronda ${ronda}`, pedido);
    console.log(`S1 ronda ${ronda}: ${filas.length} pedidos, ${creaciones.length} creaciones, ${fallidas.length} notas fallidas reintentadas dos veces (${reintentos.filter((s) => s === 200).length} exitosas)`);
  }
  return registro.problemas;
}

async function escenarioContraSuspension(contexto) {
  const { admin, dueno } = contexto;
  const registro = nuevoRegistro();
  for (let ronda = 1; ronda <= ROUNDS; ronda++) {
    const cliente = await nuevoCliente();
    const pedidos = [pedidoEntregado(cliente.id, dueno.comercioId), pedidoEntregado(cliente.id, dueno.comercioId)];
    const primero = await reclamar(cliente, pedidos[0]);
    registro.registrar(`S2 ronda ${ronda} reclamo previo`, primero, [201]);
    const idPrevio = reclamoDe(pedidos[0]);
    const resultados = await Promise.all([
      reclamar(cliente, pedidos[1]).then((r) => ({ tipo: 'crear', r })),
      resolver(admin, idPrevio, { tipo: 'REEMBOLSO_TOTAL' }).then((r) => ({ tipo: 'resolver', r })),
      call('PUT', `/administrador/clientes/${cliente.id}/suspender`, admin, { motivo: 'Suspension de estres de reclamos' }).then((r) => ({ tipo: 'suspender', r })),
    ]);
    for (const { tipo, r } of resultados) {
      registro.registrar(`S2 ronda ${ronda} ${tipo}`, r, tipo === 'crear' ? [201, 401, 409] : [200]);
    }
    auditarPedido(registro, `S2 ronda ${ronda}`, pedidos[0]);
    const segundo = Number(sql(`SELECT COUNT(*) FROM reclamo WHERE pedido_id = ${pedidos[1]};`));
    registro.exigir(segundo === (resultados[0].r.status === 201 ? 1 : 0), `S2 ronda ${ronda}: el segundo reclamo no coincide con la respuesta (${segundo} filas, ${resultados[0].r.status})`);
    registro.exigir(sql(`SELECT estado FROM usuario WHERE id = ${cliente.id};`) === 'SUSPENDIDO', `S2 ronda ${ronda}: el Cliente no quedo suspendido`);
    console.log(`S2 ronda ${ronda}: crear ${resultados[0].r.status}, resolver ${resultados[1].r.status}, suspender ${resultados[2].r.status}`);
  }
  return registro.problemas;
}

function bytesDelLog() {
  return existsSync(LOG_BACKEND) ? statSync(LOG_BACKEND).size : 0;
}

function revisarElLog(desde) {
  if (!existsSync(LOG_BACKEND)) return [`no se encontro el log del backend en ${LOG_BACKEND}: revisar a mano que no tenga "Deadlock found", "Lock wait timeout" ni "Connection is not available"`];
  const texto = readFileSync(LOG_BACKEND).subarray(desde).toString('utf8');
  const problemas = [];
  const deadlocks = (texto.match(/Deadlock found/g) || []).length;
  const timeouts = (texto.match(/Lock wait timeout/g) || []).length;
  const pool = (texto.match(/Connection is not available/g) || []).length;
  const viejos = (texto.match(/ObjectOptimisticLockingFailureException|StaleObjectStateException/g) || []).length;
  if (deadlocks) problemas.push(`el log del backend tiene ${deadlocks} "Deadlock found"`);
  if (timeouts) problemas.push(`el log del backend tiene ${timeouts} "Lock wait timeout"`);
  if (pool) problemas.push(`el log del backend tiene ${pool} "Connection is not available"`);
  if (viejos) problemas.push(`el log del backend tiene ${viejos} errores de fila ya borrada`);
  return problemas;
}

function auditarElStub() {
  const problemas = [];
  const aprobadosPorPago = new Map();
  for (const r of refundsDelStub.filter((x) => x.aprobado)) aprobadosPorPago.set(r.pago, (aprobadosPorPago.get(r.pago) || 0) + 1);
  for (const [pago, cantidad] of aprobadosPorPago) {
    if (cantidad > 1) problemas.push(`Mercado Pago simulado aprobo ${cantidad} reembolsos del pago ${pago}`);
  }
  const notasProcesadas = Number(sql("SELECT COUNT(*) FROM nota_credito WHERE motivo = 'RECLAMO' AND estado = 'PROCESADO' AND fecha_emision > NOW() - INTERVAL 1 DAY;"));
  if (aprobadosPorPago.size < 1 && notasProcesadas > 0) problemas.push('hay notas procesadas y ningun reembolso aprobado en el simulado');
  return problemas;
}

async function main() {
  const inicioLog = bytesDelLog();
  const servidor = await levantarMercadoPago();
  const login = await call('POST', '/auth/login', null, ADMIN);
  if (login.status !== 200) throw new Error('login admin ' + JSON.stringify(login));
  const admin = login.json.data.token;
  const dueno = await nuevoDueno();
  const contexto = { admin, dueno };
  const solo = process.env.ESCENARIO;
  const escenarios = [escenarioRafagaMixta, escenarioContraSuspension];
  const todos = [];
  for (let i = 0; i < escenarios.length; i++) {
    if (!solo || solo === String(i + 1)) todos.push(...(await escenarios[i](contexto)));
  }
  servidor.close();
  todos.push(...auditarElStub());
  todos.push(...revisarElLog(inicioLog));
  console.log(`Reembolsos pedidos al Mercado Pago simulado: ${refundsDelStub.length} (${refundsDelStub.filter((r) => !r.aprobado).length} con falla simulada)`);
  console.log(todos.length ? 'PROBLEMAS:\n' + todos.join('\n') : 'SIN PROBLEMAS (sin 5xx, sin inconsistencias, sin Deadlock, Lock wait timeout ni Connection is not available en el log)');
  if (todos.length) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
