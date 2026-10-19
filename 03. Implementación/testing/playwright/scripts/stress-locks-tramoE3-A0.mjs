import { execFileSync } from 'node:child_process';
import { haceMinutosEnZona } from './lib/zona.mjs';
import { existsSync, readFileSync, statSync } from 'node:fs';

const B = process.env.E2E_API_BASE_URL || 'http://localhost:8080/api/v1';
const LOC = process.env.LOC;
const CLOUD = process.env.CLOUDINARY_CLOUD_NAME || 'demo';
const ROUNDS = Number(process.env.ROUNDS || 8);
const ADMIN = { nombreUsuario: 'adminbajonea', password: process.env.ADMIN_PASSWORD };
if (!ADMIN.password) {
  console.error('Falta ADMIN_PASSWORD (contraseña de admin@bajonea.ar en bajonea_test; ver testing/playwright/README.md)');
  process.exit(1);
}
const LOG_BACKEND = process.env.BACKEND_LOG || `${process.env.TEMP || '/tmp'}/backend-test.log`;
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

const haceMinutos = haceMinutosEnZona;

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
  const email = `stresse3.${u}@bajonea.test`;
  const nombreUsuario = `se${u}`.slice(0, 20);
  const r = await call('POST', '/auth/registro/comercio', null, {
    aceptaTerminos: true,
    razonSocial: `StressE3 ${u} SRL`,
    cuit: cuit(),
    condicionIva: 'RESPONSABLE_INSCRIPTO',
    tipoSociedad: 'SRL',
    domicilioFiscal: 'Av. Stress 1',
    fechaInicioActividades: '2020-01-01',
    nombre: `StressE3 ${u}`,
    descripcion: 'x',
    telefono: tel(),
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
    redesSociales: [{ tipo: 'INSTAGRAM', url: `https://instagram.com/se${u}` }],
  });
  if (r.status !== 201) throw new Error('registro dueno ' + JSON.stringify(r));
  const login = await verificarYLoguear(email, nombreUsuario, 'Testing123');
  return { email, nombreUsuario, password: 'Testing123', token: login.token, duenoId: login.usuario.id };
}

async function nuevoCliente() {
  const u = uniq();
  const email = `stresse3c.${u}@bajonea.test`;
  const nombreUsuario = `sf${u}`.slice(0, 20);
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
  return { token: login.token, clienteId: login.usuario.id };
}

async function duenoOperativo(admin) {
  const d = await nuevoDueno();
  const pendiente = (await call('GET', '/administrador/comercios/pendientes', admin)).json.data.find((c) => c.emailCuenta === d.email);
  const aprobado = await call('PUT', `/administrador/comercios/${pendiente.id}/resolver`, admin, { aprobar: true });
  if (aprobado.status !== 200) throw new Error('aprobar ' + JSON.stringify(aprobado));
  d.comercioId = pendiente.id;
  const apto = await call('PUT', `/test/comercios/${d.comercioId}/apto-venta`);
  if (apto.status !== 200) throw new Error('apto-venta ' + JSON.stringify(apto));
  return d;
}

async function crearProducto(dueno, categoriaId) {
  const r = await call('POST', '/productos', dueno.token, { nombre: `Producto ${uniq()}`, precio: 1500, categoriaId }, cabecera(dueno));
  if (r.status !== 201) throw new Error('producto ' + JSON.stringify(r));
  return r.json.data.id;
}

const cabecera = (dueno) => ({ 'X-Comercio-Id': String(dueno.comercioId) });
const aceptar = (dueno, id) => call('PUT', `/pedidos/comercio/${id}/aceptar`, dueno.token, undefined, cabecera(dueno));
const rechazar = (dueno, id) => call('PUT', `/pedidos/comercio/${id}/rechazar`, dueno.token, { motivo: 'SIN_STOCK' }, cabecera(dueno));
const despachar = (dueno, id) => call('PUT', `/pedidos/comercio/${id}/despachar`, dueno.token, undefined, cabecera(dueno));
const anular = (dueno, id) => call('PUT', `/pedidos/comercio/${id}/anular`, dueno.token, { motivo: 'PROBLEMA_TECNICO' }, cabecera(dueno));
const cancelarCliente = (cliente, id) => call('PUT', `/pedidos/cliente/${id}/cancelar`, cliente.token);
const entregarCliente = (cliente, id) => call('PUT', `/pedidos/cliente/${id}/entregar`, cliente.token);
const correrProceso = (nombre) => call('POST', `/test/jobs/pedidos/${nombre}`);
const loginIncorrecto = (dueno) => call('POST', '/auth/login', null, { nombreUsuario: dueno.nombreUsuario, password: 'ClaveIncorrecta1' });

async function pedidoPagado(dueno, cliente, productoId) {
  const agregado = await call('POST', '/carrito/items', cliente.token, { productoId, cantidad: 1 });
  if (agregado.status !== 201) throw new Error('carrito ' + JSON.stringify(agregado));
  const creado = await call('POST', '/pedidos/cliente', cliente.token, { tipoEntrega: 'RETIRO', direccionId: null });
  if (creado.status !== 201) throw new Error('pedido ' + JSON.stringify(creado));
  const id = creado.json.data.id;
  const pago = await call('PUT', `/test/pedidos/${id}/pago-aprobado?registrarPago=true`);
  if (pago.status !== 200) throw new Error('pago ' + JSON.stringify(pago));
  return id;
}

async function pedidoEnPreparacion(dueno, cliente, productoId) {
  const id = await pedidoPagado(dueno, cliente, productoId);
  const r = await aceptar(dueno, id);
  if (r.status !== 200) throw new Error('aceptar ' + JSON.stringify(r));
  return id;
}

function envejecer(pedidoId, estado, minutos) {
  sql(`UPDATE historial_estado_pedido SET fecha_hora = '${haceMinutos(minutos)}' WHERE pedido_id = ${pedidoId} AND estado = '${estado}';`);
}

const SEMBRADOS_EN_CAMINO = new Set();

async function pedidoEnCamino(dueno, cliente, productoId, minutosEnCamino) {
  const id = await pedidoEnPreparacion(dueno, cliente, productoId);
  SEMBRADOS_EN_CAMINO.add(id);
  sql(`UPDATE pedido SET estado = 'EN_CAMINO' WHERE id = ${id};`);
  sql(
    `INSERT INTO historial_estado_pedido (pedido_id, estado, actor_rol, actor_usuario_id, fecha_hora) ` +
      `VALUES (${id}, 'EN_CAMINO', 'DUENO', ${dueno.duenoId}, '${haceMinutos(minutosEnCamino)}');`,
  );
  return id;
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

const TRANSICIONES = {
  PENDIENTE_PAGO: ['PENDIENTE_CONFIRMACION_COMERCIO', 'CANCELADO_POR_SISTEMA'],
  PENDIENTE_CONFIRMACION_COMERCIO: ['EN_PREPARACION', 'RECHAZADO', 'CANCELADO', 'EXPIRADO', 'CANCELADO_POR_SISTEMA'],
  EN_PREPARACION: ['EN_CAMINO', 'LISTO_PARA_RETIRAR', 'CANCELADO', 'ANULADO', 'CANCELADO_POR_SISTEMA'],
  EN_CAMINO: ['ENTREGADO'],
  LISTO_PARA_RETIRAR: ['ENTREGADO', 'NO_RETIRADO'],
};
const MOTIVO_DE_NOTA = {
  RECHAZADO: 'RECHAZO_COMERCIO',
  EXPIRADO: 'EXPIRACION_SIN_RESPUESTA',
  ANULADO: 'ANULACION_COMERCIO',
  CANCELADO: 'CANCELACION_CLIENTE',
  CANCELADO_POR_SISTEMA: 'SUSPENSION_COMERCIO',
};
const GENERAN_NOTA = new Set(Object.keys(MOTIVO_DE_NOTA));
const AVISOS_POR_FILA = {
  NUEVO_PEDIDO: (filas) => filas.filter((f) => f.estado === 'PENDIENTE_CONFIRMACION_COMERCIO').length,
  PEDIDO_ACEPTADO: (filas) => filas.filter((f) => f.estado === 'EN_PREPARACION').length,
  PEDIDO_RECHAZADO: (filas) => filas.filter((f) => f.estado === 'RECHAZADO').length,
  PEDIDO_EN_CAMINO: (filas) => filas.filter((f) => f.estado === 'EN_CAMINO').length,
  PEDIDO_LISTO_RETIRO: (filas) => filas.filter((f) => f.estado === 'LISTO_PARA_RETIRAR').length,
  PEDIDO_CANCELADO_CLIENTE: (filas) => filas.filter((f) => f.estado === 'CANCELADO').length,
  PEDIDO_ANULADO_COMERCIO: (filas) => filas.filter((f) => f.estado === 'ANULADO').length,
  PEDIDO_CANCELADO_SISTEMA: (filas) => filas.filter((f) => f.estado === 'CANCELADO_POR_SISTEMA').length,
  PEDIDO_EXPIRADO_CLIENTE: (filas) => filas.filter((f) => f.estado === 'EXPIRADO').length,
  PEDIDO_EXPIRADO_COMERCIO: (filas) => filas.filter((f) => f.estado === 'EXPIRADO').length,
  PEDIDO_AUTOCONFIRMADO: (filas) => filas.filter((f) => f.estado === 'ENTREGADO' && f.motivo === 'TIMEOUT_ENTREGA').length,
  PEDIDO_AUTOCONFIRMADO_COMERCIO: (filas) => filas.filter((f) => f.estado === 'ENTREGADO' && f.motivo === 'TIMEOUT_ENTREGA').length,
  PEDIDO_NO_RETIRADO: (filas) => filas.filter((f) => f.estado === 'NO_RETIRADO').length,
  PEDIDO_CERRADO_TIMER_SUSPENSION: () => 0,
};

function lineas(salida) {
  return salida === '' ? [] : salida.split(/\r?\n/);
}

function invariantesDelPedido(pedidoId) {
  const errores = [];
  const estado = sql(`SELECT estado FROM pedido WHERE id = ${pedidoId};`);
  const filas = lineas(sql(`SELECT CONCAT(estado, '|', actor_rol, '|', IFNULL(motivo_timeout, '')) FROM historial_estado_pedido WHERE pedido_id = ${pedidoId} ORDER BY id;`)).map((l) => {
    const [estadoFila, actor, motivo] = l.split('|');
    return { estado: estadoFila, actor, motivo };
  });
  if (filas.length === 0) return [`pedido ${pedidoId}: sin historial`];
  if (filas[filas.length - 1].estado !== estado) errores.push(`pedido ${pedidoId}: estado ${estado} y ultima fila ${filas[filas.length - 1].estado}`);
  for (let i = 1; i < filas.length; i++) {
    const permitidas = TRANSICIONES[filas[i - 1].estado] || [];
    if (!permitidas.includes(filas[i].estado)) errores.push(`pedido ${pedidoId}: transicion invalida ${filas[i - 1].estado} -> ${filas[i].estado} (${filas.map((f) => f.estado).join(' > ')})`);
  }
  const repetidas = filas.filter((f, i) => filas.findIndex((g) => g.estado === f.estado) !== i);
  if (repetidas.length) errores.push(`pedido ${pedidoId}: estados repetidos en el historial ${filas.map((f) => f.estado).join(' > ')}`);

  const avisos = new Map(lineas(sql(`SELECT CONCAT(tipo, '|', COUNT(*)) FROM notificacion WHERE entidad_tipo = 'PEDIDO' AND entidad_id = ${pedidoId} GROUP BY tipo;`))
    .map((l) => l.split('|')).map(([tipo, n]) => [tipo, Number(n)]));
  for (const [tipo, n] of avisos) {
    if (tipo === 'AVISO_75MIN_SIN_CONFIRMACION') {
      if (n > 1) errores.push(`pedido ${pedidoId}: ${n} avisos de 75 minutos`);
      continue;
    }
    const esperado = AVISOS_POR_FILA[tipo] ? AVISOS_POR_FILA[tipo](filas) : null;
    if (esperado !== null && tipo === 'PEDIDO_EN_CAMINO' && SEMBRADOS_EN_CAMINO.has(pedidoId)) continue;
    if (esperado === null) errores.push(`pedido ${pedidoId}: aviso inesperado ${tipo}`);
    else if (esperado !== n) errores.push(`pedido ${pedidoId}: ${n} avisos ${tipo} y ${esperado} filas de historial que lo justifican`);
  }
  for (const [tipo, calcular] of Object.entries(AVISOS_POR_FILA)) {
    if (tipo === 'PEDIDO_EN_CAMINO' && SEMBRADOS_EN_CAMINO.has(pedidoId)) continue;
    const esperado = calcular(filas);
    if (esperado > 0 && (avisos.get(tipo) || 0) !== esperado) errores.push(`pedido ${pedidoId}: falta el aviso ${tipo} (${avisos.get(tipo) || 0} de ${esperado})`);
  }

  const notas = Number(sql(`SELECT COUNT(*) FROM nota_credito n JOIN pago p ON p.id = n.pago_id WHERE p.pedido_id = ${pedidoId};`));
  const debeTenerNota = filas.some((f) => GENERAN_NOTA.has(f.estado));
  if (debeTenerNota && notas !== 1) errores.push(`pedido ${pedidoId}: ${notas} notas de credito (se esperaba 1) en ${filas.map((f) => f.estado).join(' > ')}`);
  if (!debeTenerNota && notas !== 0) errores.push(`pedido ${pedidoId}: ${notas} notas de credito sin una transicion que las justifique (${filas.map((f) => f.estado).join(' > ')})`);
  const terminal = filas.find((f) => GENERAN_NOTA.has(f.estado));
  if (terminal && notas === 1) {
    const motivo = sql(`SELECT n.motivo FROM nota_credito n JOIN pago p ON p.id = n.pago_id WHERE p.pedido_id = ${pedidoId};`);
    if (motivo !== MOTIVO_DE_NOTA[terminal.estado]) errores.push(`pedido ${pedidoId}: ${terminal.estado} con una nota de motivo ${motivo} (se esperaba ${MOTIVO_DE_NOTA[terminal.estado]})`);
  }
  return errores;
}

function revisar(pedidos, problemas, etiqueta) {
  pedidos.forEach((id) => invariantesDelPedido(id).forEach((e) => problemas.push(`${etiqueta}: ${e}`)));
}

const aceptables = (r) => r.status === 200 || r.status === 409;

async function escenarioAceptarContraRechazar(admin, categoriaId) {
  console.log('--- (1) aceptar contra rechazar del mismo pedido ---');
  const { problemas, registrar5xx, exigir } = nuevoRegistro();
  const resumen = new Map();
  for (let ronda = 1; ronda <= ROUNDS; ronda++) {
    const dueno = await duenoOperativo(admin);
    const productoId = await crearProducto(dueno, categoriaId);
    const cliente = await nuevoCliente();
    const pedidos = [];
    for (let i = 0; i < 3; i++) pedidos.push(await pedidoPagado(dueno, cliente, productoId));
    const tareas = pedidos.flatMap((id) => [
      esperar(aleatorio(25)).then(() => aceptar(dueno, id)).then((r) => ({ id, tipo: 'aceptar', r })),
      esperar(aleatorio(25)).then(() => rechazar(dueno, id)).then((r) => ({ id, tipo: 'rechazar', r })),
      esperar(aleatorio(25)).then(() => aceptar(dueno, id)).then((r) => ({ id, tipo: 'aceptar', r })),
    ]);
    const resultados = await Promise.all(tareas);
    resultados.forEach(({ id, tipo, r }) => {
      registrar5xx(`ronda ${ronda} pedido ${id} ${tipo}`, r);
      exigir(aceptables(r), `ronda ${ronda}: ${tipo} dio ${r.status}`);
      contar(resumen, `${tipo}:${r.status}`);
    });
    pedidos.forEach((id) => exigir(resultados.filter((x) => x.id === id && x.r.status === 200).length === 1, `ronda ${ronda}: pedido ${id} con ${resultados.filter((x) => x.id === id && x.r.status === 200).length} operaciones ganadoras`));
    revisar(pedidos, problemas, `ronda ${ronda}`);
    console.log(`ronda ${ronda}: ${pedidos.map((id) => sql(`SELECT estado FROM pedido WHERE id = ${id};`)).join(', ')}`);
  }
  console.log('Resumen (1):', resumir(resumen));
  return problemas;
}

async function escenarioAnularContraDespachar(admin, categoriaId) {
  console.log('--- (2) anular contra despachar, con anulaciones repetidas ---');
  const { problemas, registrar5xx, exigir } = nuevoRegistro();
  const resumen = new Map();
  for (let ronda = 1; ronda <= ROUNDS; ronda++) {
    const dueno = await duenoOperativo(admin);
    const productoId = await crearProducto(dueno, categoriaId);
    const cliente = await nuevoCliente();
    const pedidos = [];
    for (let i = 0; i < 3; i++) pedidos.push(await pedidoEnPreparacion(dueno, cliente, productoId));
    const tareas = pedidos.flatMap((id) => [
      esperar(aleatorio(25)).then(() => anular(dueno, id)).then((r) => ({ id, tipo: 'anular', r })),
      esperar(aleatorio(25)).then(() => despachar(dueno, id)).then((r) => ({ id, tipo: 'despachar', r })),
      esperar(aleatorio(25)).then(() => anular(dueno, id)).then((r) => ({ id, tipo: 'anular', r })),
    ]);
    const resultados = await Promise.all(tareas);
    resultados.forEach(({ id, tipo, r }) => {
      registrar5xx(`ronda ${ronda} pedido ${id} ${tipo}`, r);
      exigir(aceptables(r), `ronda ${ronda}: ${tipo} dio ${r.status}`);
      contar(resumen, `${tipo}:${r.status}`);
    });
    pedidos.forEach((id) => exigir(resultados.filter((x) => x.id === id && x.r.status === 200).length === 1, `ronda ${ronda}: pedido ${id} con ${resultados.filter((x) => x.id === id && x.r.status === 200).length} operaciones ganadoras`));
    revisar(pedidos, problemas, `ronda ${ronda}`);
    console.log(`ronda ${ronda}: ${pedidos.map((id) => sql(`SELECT estado FROM pedido WHERE id = ${id};`)).join(', ')}`);
  }
  console.log('Resumen (2):', resumir(resumen));
  return problemas;
}

async function escenarioDobleAnulacion(admin, categoriaId) {
  console.log('--- (3) anular dos veces (o mas) a la vez ---');
  const { problemas, registrar5xx, exigir } = nuevoRegistro();
  const resumen = new Map();
  for (let ronda = 1; ronda <= ROUNDS; ronda++) {
    const dueno = await duenoOperativo(admin);
    const productoId = await crearProducto(dueno, categoriaId);
    const cliente = await nuevoCliente();
    const pedidos = [];
    for (let i = 0; i < 3; i++) pedidos.push(await pedidoEnPreparacion(dueno, cliente, productoId));
    const tareas = pedidos.flatMap((id) => Array.from({ length: 5 }, () => esperar(aleatorio(15)).then(() => anular(dueno, id)).then((r) => ({ id, r }))));
    const resultados = await Promise.all(tareas);
    resultados.forEach(({ id, r }) => {
      registrar5xx(`ronda ${ronda} pedido ${id} anular`, r);
      exigir(aceptables(r), `ronda ${ronda}: anular dio ${r.status}`);
      contar(resumen, `anular:${r.status}`);
    });
    pedidos.forEach((id) => {
      const ganadoras = resultados.filter((x) => x.id === id && x.r.status === 200).length;
      exigir(ganadoras === 1, `ronda ${ronda}: pedido ${id} con ${ganadoras} anulaciones exitosas`);
      exigir(sql(`SELECT estado FROM pedido WHERE id = ${id};`) === 'ANULADO', `ronda ${ronda}: pedido ${id} quedo ${sql(`SELECT estado FROM pedido WHERE id = ${id};`)}`);
    });
    revisar(pedidos, problemas, `ronda ${ronda}`);
    console.log(`ronda ${ronda}: notas=${pedidos.map((id) => sql(`SELECT COUNT(*) FROM nota_credito n JOIN pago p ON p.id = n.pago_id WHERE p.pedido_id = ${id};`)).join(',')}`);
  }
  console.log('Resumen (3):', resumir(resumen));
  return problemas;
}

async function escenarioCancelarContraAceptar(admin, categoriaId) {
  console.log('--- (4) cancelar del Cliente contra aceptar del comercio ---');
  const { problemas, registrar5xx, exigir } = nuevoRegistro();
  const resumen = new Map();
  for (let ronda = 1; ronda <= ROUNDS; ronda++) {
    const dueno = await duenoOperativo(admin);
    const productoId = await crearProducto(dueno, categoriaId);
    const cliente = await nuevoCliente();
    const pedidos = [];
    for (let i = 0; i < 3; i++) pedidos.push(await pedidoPagado(dueno, cliente, productoId));
    const tareas = pedidos.flatMap((id) => [
      esperar(aleatorio(25)).then(() => cancelarCliente(cliente, id)).then((r) => ({ id, tipo: 'cancelar', r })),
      esperar(aleatorio(25)).then(() => aceptar(dueno, id)).then((r) => ({ id, tipo: 'aceptar', r })),
      esperar(aleatorio(25)).then(() => rechazar(dueno, id)).then((r) => ({ id, tipo: 'rechazar', r })),
    ]);
    const resultados = await Promise.all(tareas);
    resultados.forEach(({ id, tipo, r }) => {
      registrar5xx(`ronda ${ronda} pedido ${id} ${tipo}`, r);
      exigir(aceptables(r), `ronda ${ronda}: ${tipo} dio ${r.status}`);
      contar(resumen, `${tipo}:${r.status}`);
    });
    revisar(pedidos, problemas, `ronda ${ronda}`);
    console.log(`ronda ${ronda}: ${pedidos.map((id) => sql(`SELECT estado FROM pedido WHERE id = ${id};`)).join(', ')}`);
  }
  console.log('Resumen (4):', resumir(resumen));
  return problemas;
}

async function escenarioExpiracionContraAceptar(admin, categoriaId) {
  console.log('--- (5) proceso de expiracion contra aceptar y rechazar ---');
  const { problemas, registrar5xx, exigir } = nuevoRegistro();
  const resumen = new Map();
  for (let ronda = 1; ronda <= ROUNDS; ronda++) {
    const dueno = await duenoOperativo(admin);
    const productoId = await crearProducto(dueno, categoriaId);
    const cliente = await nuevoCliente();
    const pedidos = [];
    for (let i = 0; i < 8; i++) {
      const id = await pedidoPagado(dueno, cliente, productoId);
      envejecer(id, 'PENDIENTE_CONFIRMACION_COMERCIO', 45);
      pedidos.push(id);
    }
    const tareas = [
      correrProceso('expirar-sin-respuesta').then((r) => ({ tipo: 'proceso', r })),
      esperar(5).then(() => correrProceso('expirar-sin-respuesta')).then((r) => ({ tipo: 'proceso', r })),
      ...pedidos.flatMap((id, i) => [
        esperar(aleatorio(150)).then(() => (i % 2 === 0 ? aceptar(dueno, id) : rechazar(dueno, id))).then((r) => ({ id, tipo: 'accion', r })),
      ]),
    ];
    const resultados = await Promise.all(tareas);
    resultados.forEach(({ tipo, r }) => {
      registrar5xx(`ronda ${ronda} ${tipo}`, r);
      contar(resumen, `${tipo}:${r.status}`);
    });
    resultados.filter(({ tipo }) => tipo === 'proceso').forEach(({ r }) => exigir(r.status === 200, `ronda ${ronda}: el proceso dio ${r.status}`));
    resultados.filter(({ tipo }) => tipo === 'accion').forEach(({ r }) => exigir(aceptables(r), `ronda ${ronda}: la accion dio ${r.status}`));
    revisar(pedidos, problemas, `ronda ${ronda}`);
    console.log(`ronda ${ronda}: ${pedidos.map((id) => sql(`SELECT estado FROM pedido WHERE id = ${id};`)).join(', ')}`);
  }
  console.log('Resumen (5):', resumir(resumen));
  return problemas;
}

async function escenarioAutoconfirmacionContraCliente(admin, categoriaId) {
  console.log('--- (6) autoconfirmacion contra la confirmacion del Cliente ---');
  const { problemas, registrar5xx, exigir } = nuevoRegistro();
  const resumen = new Map();
  for (let ronda = 1; ronda <= ROUNDS; ronda++) {
    const dueno = await duenoOperativo(admin);
    const productoId = await crearProducto(dueno, categoriaId);
    const cliente = await nuevoCliente();
    const pedidos = [];
    for (let i = 0; i < 8; i++) pedidos.push(await pedidoEnCamino(dueno, cliente, productoId, 100));
    const tareas = [
      correrProceso('avisar-y-autoconfirmar').then((r) => ({ tipo: 'proceso', r })),
      esperar(5).then(() => correrProceso('avisar-y-autoconfirmar')).then((r) => ({ tipo: 'proceso', r })),
      ...pedidos.flatMap((id) => [
        esperar(aleatorio(150)).then(() => entregarCliente(cliente, id)).then((r) => ({ id, tipo: 'entregar', r })),
        esperar(aleatorio(150)).then(() => entregarCliente(cliente, id)).then((r) => ({ id, tipo: 'entregar', r })),
      ]),
    ];
    const resultados = await Promise.all(tareas);
    resultados.forEach(({ tipo, r }) => {
      registrar5xx(`ronda ${ronda} ${tipo}`, r);
      contar(resumen, `${tipo}:${r.status}`);
    });
    resultados.filter(({ tipo }) => tipo === 'proceso').forEach(({ r }) => exigir(r.status === 200, `ronda ${ronda}: el proceso dio ${r.status}`));
    resultados.filter(({ tipo }) => tipo === 'entregar').forEach(({ r }) => exigir(aceptables(r), `ronda ${ronda}: entregar dio ${r.status}`));
    pedidos.forEach((id) => exigir(sql(`SELECT estado FROM pedido WHERE id = ${id};`) === 'ENTREGADO', `ronda ${ronda}: pedido ${id} quedo ${sql(`SELECT estado FROM pedido WHERE id = ${id};`)}`));
    revisar(pedidos, problemas, `ronda ${ronda}`);
    console.log(`ronda ${ronda}: fuentes=${pedidos.map((id) => sql(`SELECT fuente_entrega FROM pedido WHERE id = ${id};`)).join(',')}`);
  }
  console.log('Resumen (6):', resumir(resumen));
  return problemas;
}

async function escenarioContraElLogin(admin, categoriaId) {
  console.log('--- (7) todas las transiciones contra el login con intentos fallidos del mismo Dueno ---');
  const { problemas, registrar5xx, exigir } = nuevoRegistro();
  const resumen = new Map();
  for (let ronda = 1; ronda <= ROUNDS; ronda++) {
    const dueno = await duenoOperativo(admin);
    const productoId = await crearProducto(dueno, categoriaId);
    const cliente = await nuevoCliente();
    const p1 = await pedidoPagado(dueno, cliente, productoId);
    const p2 = await pedidoPagado(dueno, cliente, productoId);
    const p3 = await pedidoEnPreparacion(dueno, cliente, productoId);
    const p4 = await pedidoEnPreparacion(dueno, cliente, productoId);
    const p5 = await pedidoPagado(dueno, cliente, productoId);
    envejecer(p5, 'PENDIENTE_CONFIRMACION_COMERCIO', 45);
    const p6 = await pedidoEnCamino(dueno, cliente, productoId, 100);
    const pedidos = [p1, p2, p3, p4, p5, p6];

    sql(`UPDATE usuario SET intentos_fallidos = 2 WHERE id = ${dueno.duenoId};`);
    const tareas = [
      ...Array.from({ length: 2 }, () => esperar(aleatorio(60)).then(() => loginIncorrecto(dueno)).then((r) => ({ tipo: 'login', r }))),
      esperar(aleatorio(60)).then(() => aceptar(dueno, p1)).then((r) => ({ tipo: 'aceptar', r })),
      esperar(aleatorio(60)).then(() => cancelarCliente(cliente, p1)).then((r) => ({ tipo: 'cancelar', r })),
      esperar(aleatorio(60)).then(() => rechazar(dueno, p2)).then((r) => ({ tipo: 'rechazar', r })),
      esperar(aleatorio(60)).then(() => anular(dueno, p3)).then((r) => ({ tipo: 'anular', r })),
      esperar(aleatorio(60)).then(() => anular(dueno, p3)).then((r) => ({ tipo: 'anular', r })),
      esperar(aleatorio(60)).then(() => despachar(dueno, p4)).then((r) => ({ tipo: 'despachar', r })),
      esperar(aleatorio(60)).then(() => correrProceso('expirar-sin-respuesta')).then((r) => ({ tipo: 'proceso', r })),
      esperar(aleatorio(60)).then(() => correrProceso('avisar-y-autoconfirmar')).then((r) => ({ tipo: 'proceso', r })),
      esperar(aleatorio(60)).then(() => entregarCliente(cliente, p6)).then((r) => ({ tipo: 'entregar', r })),
    ];
    const resultados = await Promise.all(tareas);
    resultados.forEach(({ tipo, r }) => {
      registrar5xx(`ronda ${ronda} ${tipo}`, r);
      contar(resumen, `${tipo}:${r.status}`);
    });
    resultados.filter(({ tipo }) => tipo === 'login').forEach(({ r }) => exigir(r.status === 401 || r.status === 409, `ronda ${ronda}: login incorrecto dio ${r.status}`));
    resultados.filter(({ tipo }) => ['aceptar', 'rechazar', 'anular', 'despachar'].includes(tipo)).forEach(({ tipo, r }) =>
      exigir([200, 401, 409].includes(r.status), `ronda ${ronda}: ${tipo} dio ${r.status}`));
    resultados.filter(({ tipo }) => ['cancelar', 'entregar'].includes(tipo)).forEach(({ tipo, r }) => exigir(aceptables(r), `ronda ${ronda}: ${tipo} dio ${r.status}`));
    resultados.filter(({ tipo }) => tipo === 'proceso').forEach(({ r }) => exigir(r.status === 200, `ronda ${ronda}: el proceso dio ${r.status}`));
    exigir(sql(`SELECT estado FROM usuario WHERE id = ${dueno.duenoId};`) === 'BLOQUEADO', `ronda ${ronda}: el Dueno quedo ${sql(`SELECT estado FROM usuario WHERE id = ${dueno.duenoId};`)}`);
    exigir(sql(`SELECT estado FROM comercio WHERE id = ${dueno.comercioId};`) === 'CERRADO_TEMPORALMENTE', `ronda ${ronda}: el comercio quedo ${sql(`SELECT estado FROM comercio WHERE id = ${dueno.comercioId};`)}`);
    revisar(pedidos, problemas, `ronda ${ronda}`);
    console.log(`ronda ${ronda}: ${resultados.map(({ tipo, r }) => `${tipo}:${r.status}`).join(' ')}`);
  }
  console.log('Resumen (7):', resumir(resumen));
  return problemas;
}

async function escenarioSuspension(admin, categoriaId) {
  console.log('--- (8) suspension del comercio contra aceptar, anular, el Cliente y los procesos ---');
  const { problemas, registrar5xx, exigir } = nuevoRegistro();
  const resumen = new Map();
  for (let ronda = 1; ronda <= ROUNDS; ronda++) {
    const dueno = await duenoOperativo(admin);
    const productoId = await crearProducto(dueno, categoriaId);
    const cliente = await nuevoCliente();
    const p1 = await pedidoPagado(dueno, cliente, productoId);
    const p2 = await pedidoPagado(dueno, cliente, productoId);
    const p3 = await pedidoEnPreparacion(dueno, cliente, productoId);
    const p4 = await pedidoEnPreparacion(dueno, cliente, productoId);
    envejecer(p2, 'PENDIENTE_CONFIRMACION_COMERCIO', 45);
    const pedidos = [p1, p2, p3, p4];

    const tareas = [
      esperar(aleatorio(30)).then(() => call('PUT', `/administrador/comercios/${dueno.comercioId}/suspender`, admin, { motivo: 'Suspension de estres' })).then((r) => ({ tipo: 'suspender', r })),
      esperar(aleatorio(30)).then(() => aceptar(dueno, p1)).then((r) => ({ tipo: 'aceptar', r })),
      esperar(aleatorio(30)).then(() => cancelarCliente(cliente, p1)).then((r) => ({ tipo: 'cancelar', r })),
      esperar(aleatorio(30)).then(() => correrProceso('expirar-sin-respuesta')).then((r) => ({ tipo: 'proceso', r })),
      esperar(aleatorio(30)).then(() => anular(dueno, p3)).then((r) => ({ tipo: 'anular', r })),
      esperar(aleatorio(30)).then(() => despachar(dueno, p4)).then((r) => ({ tipo: 'despachar', r })),
    ];
    const resultados = await Promise.all(tareas);
    resultados.forEach(({ tipo, r }) => {
      registrar5xx(`ronda ${ronda} ${tipo}`, r);
      contar(resumen, `${tipo}:${r.status}`);
    });
    exigir(resultados.find(({ tipo }) => tipo === 'suspender').r.status === 200, `ronda ${ronda}: suspender dio ${resultados.find(({ tipo }) => tipo === 'suspender').r.status}`);
    resultados.filter(({ tipo }) => tipo !== 'suspender' && tipo !== 'proceso').forEach(({ tipo, r }) => exigir(aceptables(r), `ronda ${ronda}: ${tipo} dio ${r.status}`));
    revisar(pedidos, problemas, `ronda ${ronda}`);
    const pendientes = lineas(sql(`SELECT id FROM pedido WHERE comercio_id = ${dueno.comercioId} AND estado IN ('PENDIENTE_CONFIRMACION_COMERCIO', 'EN_PREPARACION');`));
    console.log(`ronda ${ronda}: ${pedidos.map((id) => sql(`SELECT estado FROM pedido WHERE id = ${id};`)).join(', ')} (activos tras la suspension: ${pendientes.length})`);
  }
  console.log('Resumen (8):', resumir(resumen));
  return problemas;
}

async function escenarioNotasEnLaTransaccion(admin, categoriaId) {
  console.log('--- (9) rechazar, cancelar del Cliente, expiracion, aceptar y suspension sobre los mismos pedidos: una sola nota por pedido ---');
  const { problemas, registrar5xx, exigir } = nuevoRegistro();
  const resumen = new Map();
  for (let ronda = 1; ronda <= ROUNDS; ronda++) {
    const dueno = await duenoOperativo(admin);
    const productoId = await crearProducto(dueno, categoriaId);
    const cliente = await nuevoCliente();
    const pedidos = [];
    for (let i = 0; i < 6; i++) {
      const id = await pedidoPagado(dueno, cliente, productoId);
      if (i % 2 === 0) envejecer(id, 'PENDIENTE_CONFIRMACION_COMERCIO', 45);
      pedidos.push(id);
    }
    const suspender = ronda % 2 === 0;
    const tareas = [
      correrProceso('expirar-sin-respuesta').then((r) => ({ tipo: 'proceso', r })),
      esperar(aleatorio(30)).then(() => correrProceso('expirar-sin-respuesta')).then((r) => ({ tipo: 'proceso', r })),
      ...pedidos.flatMap((id) => [
        esperar(aleatorio(60)).then(() => rechazar(dueno, id)).then((r) => ({ id, tipo: 'rechazar', r })),
        esperar(aleatorio(60)).then(() => cancelarCliente(cliente, id)).then((r) => ({ id, tipo: 'cancelar', r })),
        esperar(aleatorio(60)).then(() => cancelarCliente(cliente, id)).then((r) => ({ id, tipo: 'cancelar', r })),
        esperar(aleatorio(60)).then(() => aceptar(dueno, id)).then((r) => ({ id, tipo: 'aceptar', r })),
      ]),
      ...(suspender
        ? [esperar(aleatorio(60)).then(() => call('PUT', `/administrador/comercios/${dueno.comercioId}/suspender`, admin, { motivo: 'Suspension de estres' })).then((r) => ({ tipo: 'suspender', r }))]
        : []),
    ];
    const resultados = await Promise.all(tareas);
    resultados.forEach(({ tipo, r }) => {
      registrar5xx(`ronda ${ronda} ${tipo}`, r);
      contar(resumen, `${tipo}:${r.status}`);
    });
    resultados.filter(({ tipo }) => tipo === 'proceso').forEach(({ r }) => exigir(r.status === 200, `ronda ${ronda}: el proceso dio ${r.status}`));
    resultados.filter(({ tipo }) => ['rechazar', 'cancelar', 'aceptar'].includes(tipo)).forEach(({ tipo, r }) => exigir(aceptables(r), `ronda ${ronda}: ${tipo} dio ${r.status}`));
    if (suspender) exigir(resultados.find(({ tipo }) => tipo === 'suspender').r.status === 200, `ronda ${ronda}: suspender dio ${resultados.find(({ tipo }) => tipo === 'suspender').r.status}`);
    revisar(pedidos, problemas, `ronda ${ronda}`);
    console.log(`ronda ${ronda}${suspender ? ' (con suspension)' : ''}: ${pedidos.map((id) => sql(`SELECT estado FROM pedido WHERE id = ${id};`)).join(', ')}`);
  }
  console.log('Resumen (9):', resumir(resumen));
  return problemas;
}

function bytesDelLog() {
  return existsSync(LOG_BACKEND) ? statSync(LOG_BACKEND).size : 0;
}

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
  const admin = (await call('POST', '/auth/login', null, ADMIN)).json.data.token;
  const r = await call('POST', '/categorias', admin, { nombre: `StressE3 ${uniq()}` });
  if (r.status !== 201) throw new Error('categoria ' + JSON.stringify(r));
  const categoriaId = r.json.data.id;
  const solo = process.env.ESCENARIO;
  const escenarios = [
    escenarioAceptarContraRechazar,
    escenarioAnularContraDespachar,
    escenarioDobleAnulacion,
    escenarioCancelarContraAceptar,
    escenarioExpiracionContraAceptar,
    escenarioAutoconfirmacionContraCliente,
    escenarioContraElLogin,
    escenarioSuspension,
    escenarioNotasEnLaTransaccion,
  ];
  const todos = [];
  for (let i = 0; i < escenarios.length; i++) {
    if (!solo || solo === String(i + 1)) todos.push(...(await escenarios[i](admin, categoriaId)));
  }
  todos.push(...revisarElLog(inicioLog));
  console.log(todos.length ? 'PROBLEMAS:\n' + todos.join('\n') : 'SIN PROBLEMAS (sin 5xx, sin inconsistencias, sin Deadlock ni Lock wait timeout en el log)');
  if (todos.length) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
