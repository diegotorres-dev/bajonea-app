import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';

const B = process.env.E2E_API_BASE_URL || 'http://localhost:8080/api/v1';
const LOC = process.env.LOC;
const ROUNDS = Number(process.env.ROUNDS || 8);
const PUERTO_MP = Number(process.env.MP_STUB_PORT || 9099);
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

const BASE_ID_PAGO = 100000;
const pagados = new Set();
let consultasAMercadoPago = 0;

function levantarMercadoPago() {
  const pago = (pedidoId) => ({
    id: BASE_ID_PAGO + pedidoId,
    status: 'approved',
    external_reference: String(pedidoId),
    payment_type_id: 'account_money',
    date_created: '2026-01-01T00:00:00.000-03:00',
    fee_details: [{ type: 'application_fee', fee_payer: 'collector', amount: 300 }],
  });
  const servidor = createServer((req, res) => {
    consultasAMercadoPago += 1;
    const url = new URL(req.url, 'http://localhost');
    const responder = (cuerpo, estado = 200) => {
      setTimeout(() => {
        res.writeHead(estado, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(cuerpo));
      }, 100 + Math.floor(Math.random() * 120));
    };
    if (req.method === 'POST' && url.pathname === '/checkout/preferences') {
      req.resume();
      return responder({ id: `pref-${Date.now()}-${consultasAMercadoPago}`, init_point: 'http://localhost/pago', sandbox_init_point: 'http://localhost/pago' });
    }
    if (url.pathname === '/v1/payments/search') {
      const referencia = Number(url.searchParams.get('external_reference'));
      return responder({ results: pagados.has(referencia) ? [pago(referencia)] : [] });
    }
    const m = url.pathname.match(/^\/v1\/payments\/(\d+)$/);
    if (m) return responder(pago(Number(m[1]) - BASE_ID_PAGO));
    return responder({ message: 'no encontrado' }, 404);
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
  const email = `stresscar.${u}@bajonea.test`;
  const nombreUsuario = `sk${u}`.slice(0, 20);
  const r = await call('POST', '/auth/registro/comercio', null, {
    aceptaTerminos: true,
    razonSocial: `StressCar ${u} SRL`,
    cuit: cuit(),
    condicionIva: 'RESPONSABLE_INSCRIPTO',
    tipoSociedad: 'SRL',
    domicilioFiscal: 'Av. Stress 1',
    fechaInicioActividades: '2020-01-01',
    nombre: `StressCar ${u}`,
    descripcion: 'x',
    telefono: tel(),
    tipoComercio: 'RESTAURANTE',
    aceptaDelivery: false,
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
    redesSociales: [{ tipo: 'INSTAGRAM', url: `https://instagram.com/sk${u}` }],
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
  return { email, nombreUsuario, password: 'Testing123', token: login.token, duenoId: login.usuario.id, comercioId, h: { 'X-Comercio-Id': String(comercioId) } };
}

async function nuevoCliente() {
  const u = uniq();
  const email = `stresscarc.${u}@bajonea.test`;
  const nombreUsuario = `sj${u}`.slice(0, 20);
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
  return { token: login.token, id: login.usuario.id, nombreUsuario, password: 'Testing123' };
}

async function nuevoProducto(dueno, categoriaId) {
  const r = await call('POST', '/productos', dueno.token, { nombre: `Producto ${uniq()}`, precio: 1500, categoriaId }, dueno.h);
  if (r.status !== 201) throw new Error('producto ' + JSON.stringify(r));
  return r.json.data.id;
}

async function agregar(cliente, productoId) {
  return call('POST', '/carrito/items', cliente.token, { productoId, cantidad: 1 });
}

async function pedidoConPago(cliente) {
  const creado = await call('POST', '/pedidos/cliente', cliente.token, { tipoEntrega: 'RETIRO', direccionId: null });
  if (creado.status !== 201) throw new Error('pedido ' + JSON.stringify(creado));
  const id = creado.json.data.id;
  const pago = await call('POST', `/pedidos/cliente/${id}/pago`, cliente.token);
  if (pago.status !== 200) throw new Error('pago ' + JSON.stringify(pago));
  pagados.add(id);
  return id;
}

const webhook = (pedidoId) => call('POST', `/webhooks/mercadopago?pedidoId=${pedidoId}&data.id=${BASE_ID_PAGO + pedidoId}&type=payment`);
const sincronizar = (cliente, pedidoId, conId) =>
  call('POST', `/pedidos/cliente/${pedidoId}/pago/sincronizar`, cliente.token, conId ? { paymentId: String(BASE_ID_PAGO + pedidoId) } : undefined);

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

const contar = (mapa, clave) => mapa.set(clave, (mapa.get(clave) || 0) + 1);
const resumir = (mapa) => Object.fromEntries([...mapa.entries()].sort());

function carritoConsistente(registro, etiqueta, clienteId) {
  const items = Number(sql(`SELECT COUNT(*) FROM item_carrito ic JOIN carrito c ON c.id = ic.carrito_id WHERE c.cliente_id = ${clienteId};`));
  const comercio = sql(`SELECT IFNULL(comercio_id, 'NULL') FROM carrito WHERE cliente_id = ${clienteId};`);
  if (comercio === '') {
    registro.exigir(items === 0, `${etiqueta}: ${items} ítems sin carrito`);
    return { items, comercio: 'sin carrito' };
  }
  registro.exigir(items === 0 ? comercio === 'NULL' : comercio !== 'NULL',
    `${etiqueta}: carrito inconsistente (${items} ítems, comercio ${comercio})`);
  return { items, comercio };
}

function pedidosPagados(registro, etiqueta, pedidos) {
  for (const id of pedidos) {
    const estado = sql(`SELECT estado FROM pedido WHERE id = ${id};`);
    registro.exigir(estado === 'PENDIENTE_CONFIRMACION_COMERCIO', `${etiqueta}: el pedido ${id} quedó ${estado} y no PENDIENTE_CONFIRMACION_COMERCIO`);
    const filas = Number(sql(`SELECT COUNT(*) FROM historial_estado_pedido WHERE pedido_id = ${id} AND estado = 'PENDIENTE_CONFIRMACION_COMERCIO';`));
    registro.exigir(filas === 1, `${etiqueta}: el pedido ${id} tiene ${filas} filas de PENDIENTE_CONFIRMACION_COMERCIO en el historial`);
    const avisos = Number(sql(`SELECT COUNT(*) FROM notificacion WHERE entidad_tipo = 'PEDIDO' AND entidad_id = ${id} AND tipo = 'NUEVO_PEDIDO' AND usuario_id = (SELECT dueno_id FROM comercio WHERE id = (SELECT comercio_id FROM pedido WHERE id = ${id}));`));
    registro.exigir(avisos === 1, `${etiqueta}: el pedido ${id} tiene ${avisos} avisos de pedido nuevo para el Dueño`);
  }
}

async function armarCliente(dueno, productos, cantidadDePedidos) {
  const cliente = await nuevoCliente();
  for (const productoId of productos) {
    const a = await agregar(cliente, productoId);
    if (a.status !== 201) throw new Error('carrito ' + JSON.stringify(a));
  }
  const pedidos = [];
  for (let i = 0; i < cantidadDePedidos; i++) pedidos.push(await pedidoConPago(cliente));
  return { cliente, pedidos };
}

async function escenarioPagosDelMismoCliente(dueno, categoriaId) {
  const registro = nuevoRegistro();
  const resumen = new Map();
  for (let ronda = 0; ronda < ROUNDS; ronda++) {
    const productos = [await nuevoProducto(dueno, categoriaId), await nuevoProducto(dueno, categoriaId), await nuevoProducto(dueno, categoriaId)];
    const { cliente, pedidos } = await armarCliente(dueno, productos, 4);
    const [p1, p2, p3, p4] = pedidos;
    const resultados = await Promise.all([
      webhook(p1),
      webhook(p2),
      webhook(p1),
      sincronizar(cliente, p3, false),
      sincronizar(cliente, p4, true),
    ]);
    resultados.forEach((r, i) => {
      registro.registrar(`S1 ronda ${ronda} op ${i}`, r, [200]);
      contar(resumen, r.status);
    });
    pedidosPagados(registro, `S1 ronda ${ronda}`, pedidos);
    const c = carritoConsistente(registro, `S1 ronda ${ronda}`, cliente.id);
    registro.exigir(c.items === 0, `S1 ronda ${ronda}: el carrito quedó con ${c.items} ítems tras pagar todos los pedidos`);
    console.log(`S1 ronda ${ronda}: ${resultados.map((r) => r.status).join(',')} | carrito ${c.items} ítems`);
  }
  console.log('Resumen (S1):', resumir(resumen));
  return registro.problemas;
}

async function escenarioPagosContraElCliente(dueno, categoriaId) {
  const registro = nuevoRegistro();
  const resumen = new Map();
  for (let ronda = 0; ronda < ROUNDS; ronda++) {
    const productos = [await nuevoProducto(dueno, categoriaId), await nuevoProducto(dueno, categoriaId), await nuevoProducto(dueno, categoriaId)];
    const extra = await nuevoProducto(dueno, categoriaId);
    const { cliente, pedidos } = await armarCliente(dueno, productos, 2);
    const carrito = (await call('GET', '/carrito', cliente.token)).json.data;
    const itemId = carrito.items[0].id;
    const operaciones = [
      ['webhook', () => webhook(pedidos[0]), [200]],
      ['sincronizar', () => sincronizar(cliente, pedidos[1], true), [200]],
      ['vaciar', () => call('DELETE', '/carrito', cliente.token), [200]],
      ['quitar', () => call('DELETE', `/carrito/items/${itemId}`, cliente.token), [200, 404]],
      ['cantidad', () => call('PUT', `/carrito/items/${itemId}`, cliente.token, { cantidad: 4 }), [200, 404]],
      ['agregar', () => agregar(cliente, extra), [201]],
    ];
    const resultados = await Promise.all(operaciones.map(async ([nombre, op, permitidos]) => {
      await esperar(aleatorio(60));
      const r = await op();
      registro.registrar(`S2 ronda ${ronda} ${nombre}`, r, permitidos);
      contar(resumen, `${nombre}:${r.status}`);
      return `${nombre}=${r.status}`;
    }));
    pedidosPagados(registro, `S2 ronda ${ronda}`, pedidos);
    const c = carritoConsistente(registro, `S2 ronda ${ronda}`, cliente.id);
    console.log(`S2 ronda ${ronda}: ${resultados.join(' ')} | carrito ${c.items} ítems, comercio ${c.comercio}`);
  }
  console.log('Resumen (S2):', resumir(resumen));
  return registro.problemas;
}

async function escenarioPagosContraElDueno(dueno, categoriaId) {
  const registro = nuevoRegistro();
  const resumen = new Map();
  for (let ronda = 0; ronda < ROUNDS; ronda++) {
    const agotable = await nuevoProducto(dueno, categoriaId);
    const otro = await nuevoProducto(dueno, categoriaId);
    const { cliente, pedidos } = await armarCliente(dueno, [agotable, otro], 2);
    const curiosos = [await nuevoCliente(), await nuevoCliente(), await nuevoCliente()];
    const operaciones = [
      ['webhook', () => webhook(pedidos[0]), [200]],
      ['sincronizar', () => sincronizar(cliente, pedidos[1], false), [200]],
      ['agotar', () => call('PATCH', `/productos/${agotable}/estado`, dueno.token, { estado: 'AGOTADO' }, dueno.h), [200]],
      ...curiosos.map((c, i) => [`curioso${i}`, () => agregar(c, agotable), [201, 409]]),
    ];
    const resultados = await Promise.all(operaciones.map(async ([nombre, op, permitidos]) => {
      await esperar(aleatorio(60));
      const r = await op();
      registro.registrar(`S3 ronda ${ronda} ${nombre}`, r, permitidos);
      contar(resumen, `${nombre}:${r.status}`);
      return `${nombre}=${r.status}`;
    }));
    pedidosPagados(registro, `S3 ronda ${ronda}`, pedidos);
    const restantes = Number(sql(`SELECT COUNT(*) FROM item_carrito WHERE producto_id = ${agotable};`));
    registro.exigir(restantes === 0, `S3 ronda ${ronda}: el producto agotado quedó en ${restantes} ítems de carritos`);
    for (const c of [cliente, ...curiosos]) carritoConsistente(registro, `S3 ronda ${ronda}`, c.id);
    console.log(`S3 ronda ${ronda}: ${resultados.join(' ')}`);
  }
  console.log('Resumen (S3):', resumir(resumen));
  return registro.problemas;
}

async function escenarioPagosContraElLogin(dueno, categoriaId) {
  const registro = nuevoRegistro();
  const resumen = new Map();
  for (let ronda = 0; ronda < ROUNDS; ronda++) {
    const productos = [await nuevoProducto(dueno, categoriaId), await nuevoProducto(dueno, categoriaId)];
    const { cliente, pedidos } = await armarCliente(dueno, productos, 3);
    const otro = await armarCliente(dueno, [productos[0]], 1);
    const operaciones = [
      ['webhook0', () => webhook(pedidos[0]), [200]],
      ['webhook1', () => webhook(pedidos[1]), [200]],
      ['webhook2', () => webhook(pedidos[2]), [200]],
      ['webhookOtro', () => webhook(otro.pedidos[0]), [200]],
      ['login', () => call('POST', '/auth/login', null, { nombreUsuario: cliente.nombreUsuario, password: cliente.password }), [200]],
      ['loginFallido', () => call('POST', '/auth/login', null, { nombreUsuario: otro.cliente.nombreUsuario, password: 'ClaveIncorrecta1' }), [401, 409]],
    ];
    const resultados = await Promise.all(operaciones.map(async ([nombre, op, permitidos]) => {
      await esperar(aleatorio(60));
      const r = await op();
      registro.registrar(`S4 ronda ${ronda} ${nombre}`, r, permitidos);
      contar(resumen, `${nombre}:${r.status}`);
      return `${nombre}=${r.status}`;
    }));
    pedidosPagados(registro, `S4 ronda ${ronda}`, [...pedidos, ...otro.pedidos]);
    registro.exigir(carritoConsistente(registro, `S4 ronda ${ronda}`, cliente.id).items === 0, `S4 ronda ${ronda}: carrito del comprador no vacío`);
    registro.exigir(carritoConsistente(registro, `S4 ronda ${ronda}`, otro.cliente.id).items === 0, `S4 ronda ${ronda}: carrito del otro comprador no vacío`);
    console.log(`S4 ronda ${ronda}: ${resultados.join(' ')}`);
  }
  console.log('Resumen (S4):', resumir(resumen));
  return registro.problemas;
}

async function escenarioClientesIndependientes(dueno, categoriaId) {
  const registro = nuevoRegistro();
  for (let ronda = 0; ronda < ROUNDS; ronda++) {
    const compartido = await nuevoProducto(dueno, categoriaId);
    const grupo = [];
    for (let i = 0; i < 4; i++) grupo.push(await armarCliente(dueno, [compartido], 1));
    const espectador = await nuevoCliente();
    const a = await agregar(espectador, compartido);
    registro.registrar(`S5 ronda ${ronda} espectador`, a, [201]);
    const resultados = await Promise.all(grupo.map(async (g) => (await webhook(g.pedidos[0]))));
    resultados.forEach((r, i) => registro.registrar(`S5 ronda ${ronda} webhook ${i}`, r, [200]));
    for (const g of grupo) {
      pedidosPagados(registro, `S5 ronda ${ronda}`, g.pedidos);
      registro.exigir(carritoConsistente(registro, `S5 ronda ${ronda}`, g.cliente.id).items === 0, `S5 ronda ${ronda}: carrito vacío esperado`);
    }
    const c = carritoConsistente(registro, `S5 ronda ${ronda}`, espectador.id);
    registro.exigir(c.items === 1, `S5 ronda ${ronda}: el carrito del espectador perdió su ítem (${c.items})`);
    console.log(`S5 ronda ${ronda}: ${resultados.map((r) => r.status).join(',')} | espectador ${c.items} ítem`);
  }
  return registro.problemas;
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
  const viejos = (texto.match(/ObjectOptimisticLockingFailureException|StaleObjectStateException/g) || []).length;
  if (deadlocks) problemas.push(`el log del backend tiene ${deadlocks} "Deadlock found"`);
  if (timeouts) problemas.push(`el log del backend tiene ${timeouts} "Lock wait timeout"`);
  if (viejos) problemas.push(`el log del backend tiene ${viejos} errores de fila ya borrada (ObjectOptimisticLockingFailureException / StaleObjectStateException)`);
  return problemas;
}

async function main() {
  const inicioLog = bytesDelLog();
  const servidor = await levantarMercadoPago();
  const categoriaId = Number(sql('SELECT id FROM categoria ORDER BY id LIMIT 1;'));
  const dueno = await nuevoDueno();
  const solo = process.env.ESCENARIO;
  const escenarios = [
    escenarioPagosDelMismoCliente,
    escenarioPagosContraElCliente,
    escenarioPagosContraElDueno,
    escenarioPagosContraElLogin,
    escenarioClientesIndependientes,
  ];
  const todos = [];
  for (let i = 0; i < escenarios.length; i++) {
    if (!solo || solo === String(i + 1)) todos.push(...(await escenarios[i](dueno, categoriaId)));
  }
  servidor.close();
  todos.push(...revisarElLog(inicioLog));
  console.log(`Consultas atendidas por el Mercado Pago simulado: ${consultasAMercadoPago}`);
  console.log(todos.length ? 'PROBLEMAS:\n' + todos.join('\n') : 'SIN PROBLEMAS (sin 5xx, sin inconsistencias, sin Deadlock ni Lock wait timeout en el log)');
  if (todos.length) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
