import { execFileSync } from 'node:child_process';

const B = process.env.E2E_API_BASE_URL || 'http://localhost:8080/api/v1';
const LOC = process.env.LOC;
const CLOUD = process.env.CLOUDINARY_CLOUD_NAME;
const ROUNDS = Number(process.env.ROUNDS || 15);
const CLIENTES_POR_RONDA = Number(process.env.CLIENTES || 6);
const ADMIN = { nombreUsuario: 'adminbajonea', password: process.env.ADMIN_PASSWORD || 'PostmanAdmin123' };
const sql = (q) => execFileSync('C:/xampp/mysql/bin/mysql.exe', ['-u', 'root', '-N', '-B', 'bajonea_test', '-e', q]).toString().trim();

if (!LOC || !CLOUD) {
  console.error('Faltan LOC (id de localidad) y/o CLOUDINARY_CLOUD_NAME');
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
  const email = `stress5.${u}@bajonea.test`;
  const nombreUsuario = `sf${u}`.slice(0, 20);
  const r = await call('POST', '/auth/registro/comercio', null, {
    razonSocial: `Stress5 ${u} SRL`,
    cuit: cuit(),
    condicionIva: 'RESPONSABLE_INSCRIPTO',
    tipoSociedad: 'SRL',
    domicilioFiscal: 'Av. Stress 1',
    fechaInicioActividades: '2020-01-01',
    nombre: `Stress5 ${u}`,
    descripcion: 'x',
    telefono: tel(),
    emailContacto: email,
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
    redesSociales: [{ tipo: 'INSTAGRAM', url: `https://instagram.com/sf${u}` }],
  });
  if (r.status !== 201) throw new Error('registro dueno ' + JSON.stringify(r));
  const login = await verificarYLoguear(email, nombreUsuario, 'Testing123');
  return { email, nombreUsuario, password: 'Testing123', token: login.token, duenoId: login.usuario.id };
}

async function nuevoCliente() {
  const u = uniq();
  const email = `stress5c.${u}@bajonea.test`;
  const nombreUsuario = `sc${u}`.slice(0, 20);
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
  return { token: login.token };
}

async function duenoAprobado(admin, conMercadoPago, mpUserId) {
  const d = await nuevoDueno();
  const pendiente = (await call('GET', '/administrador/comercios/pendientes', admin)).json.data.find((c) => c.emailCuenta === d.email);
  const aprobado = await call('PUT', `/administrador/comercios/${pendiente.id}/resolver`, admin, { aprobar: true });
  if (aprobado.status !== 200) throw new Error('aprobar ' + JSON.stringify(aprobado));
  d.comercioId = pendiente.id;
  if (conMercadoPago) {
    const v = await call('POST', `/test/duenos/${d.duenoId}/mercadopago-simulada${mpUserId ? `?mpUserId=${mpUserId}` : ''}`);
    if (v.status !== 200) throw new Error('vincular ' + JSON.stringify(v));
  }
  return d;
}

async function crearProducto(dueno, categoriaId) {
  const r = await call('POST', '/productos', dueno.token, { nombre: `Producto ${uniq()}`, precio: 1500, categoriaId }, { 'X-Comercio-Id': String(dueno.comercioId) });
  if (r.status !== 201) throw new Error('producto ' + JSON.stringify(r));
  return r.json.data.id;
}

const agregarAlCarrito = (cliente, productoId) => call('POST', '/carrito/items', cliente.token, { productoId, cantidad: 1 });
const crearPedido = (cliente) => call('POST', '/pedidos/cliente', cliente.token, { tipoEntrega: 'RETIRO', direccionId: null });
const desvincular = (dueno) => call('DELETE', '/oauth/mercadopago/desvincular', dueno.token);
const vincular = (dueno, mpUserId) => call('POST', `/test/duenos/${dueno.duenoId}/mercadopago-simulada${mpUserId ? `?mpUserId=${mpUserId}` : ''}`);

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

async function categoriaDeLaCorrida(admin) {
  const r = await call('POST', '/categorias', admin, { nombre: `Stress5 ${uniq()}` });
  if (r.status !== 201) throw new Error('categoria ' + JSON.stringify(r));
  return r.json.data.id;
}

async function escenarioA(admin) {
  console.log('--- (a) dos Dueños vinculan la misma cuenta a la vez ---');
  const { problemas, registrar5xx, exigir } = nuevoRegistro();
  const resumen = new Map();
  for (let ronda = 1; ronda <= ROUNDS; ronda++) {
    const primero = await duenoAprobado(admin, false);
    const segundo = await duenoAprobado(admin, false);
    const cuenta = `stress5-a-${uniq()}`;
    const [a, b] = await Promise.all([vincular(primero, cuenta), vincular(segundo, cuenta)]);
    registrar5xx(`ronda ${ronda} vincular`, a);
    registrar5xx(`ronda ${ronda} vincular`, b);
    const codigos = [a.status, b.status].sort().join('+');
    contar(resumen, codigos);
    const activas = Number(sql(`SELECT COUNT(*) FROM cuenta_mercado_pago WHERE mp_user_id = '${cuenta}' AND activa = 1;`));
    exigir(codigos === '200+409', `ronda ${ronda}: respuestas ${codigos} (se esperaba 200+409)`);
    exigir(activas === 1, `ronda ${ronda}: ${activas} filas activas con la misma cuenta (se esperaba 1)`);
    const perdedor = [a, b].find((r) => r.status === 409);
    if (perdedor) exigir(perdedor.json?.mensaje?.includes('ya está en uso'), `ronda ${ronda}: mensaje inesperado ${JSON.stringify(perdedor.json)}`);
    const comerciosApto = Number(sql(`SELECT COUNT(*) FROM comercio WHERE id IN (${primero.comercioId}, ${segundo.comercioId}) AND estado = 'APTO_VENTA';`));
    exigir(comerciosApto === 1, `ronda ${ronda}: ${comerciosApto} comercios APTO_VENTA (se esperaba 1)`);
    console.log(`ronda ${ronda}: respuestas=${codigos} filas activas=${activas} comercios APTO_VENTA=${comerciosApto}`);
  }
  console.log('Resumen (a):', resumir(resumen));
  return problemas;
}

async function escenarioB(admin, categoriaId) {
  console.log('--- (b) crear pedidos mientras se desvincula ---');
  const { problemas, registrar5xx, exigir } = nuevoRegistro();
  const resumenPedidos = new Map();
  const resumenDesvincular = new Map();
  for (let ronda = 1; ronda <= ROUNDS; ronda++) {
    const dueno = await duenoAprobado(admin, true);
    const productoId = await crearProducto(dueno, categoriaId);
    const clientes = [];
    for (let i = 0; i < CLIENTES_POR_RONDA; i++) {
      const cliente = await nuevoCliente();
      const agregado = await agregarAlCarrito(cliente, productoId);
      if (agregado.status !== 201) throw new Error('carrito ' + JSON.stringify(agregado));
      clientes.push(cliente);
    }

    const desvincularPrimero = ronda % 3 === 0;
    const retrasoDesvincular = desvincularPrimero ? 0 : aleatorio(25);
    const tareas = clientes.map((cliente) => esperar(desvincularPrimero ? 15 + aleatorio(10) : aleatorio(40)).then(() => crearPedido(cliente)));
    const tareaDesvincular = esperar(retrasoDesvincular).then(() => desvincular(dueno));
    const [respuestaDesvincular, ...respuestasPedidos] = await Promise.all([tareaDesvincular, ...tareas]);

    registrar5xx(`ronda ${ronda} desvincular`, respuestaDesvincular);
    respuestasPedidos.forEach((r) => registrar5xx(`ronda ${ronda} crear pedido`, r));
    contar(resumenDesvincular, respuestaDesvincular.status);
    respuestasPedidos.forEach((r) => contar(resumenPedidos, r.status));

    const huerfanos = Number(
      sql(
        `SELECT COUNT(*) FROM pedido p JOIN comercio c ON c.id = p.comercio_id JOIN cuenta_mercado_pago m ON m.dueno_id = c.dueno_id ` +
          `WHERE c.id = ${dueno.comercioId} AND p.estado = 'PENDIENTE_PAGO' AND m.activa = 0;`,
      ),
    );
    const creados = respuestasPedidos.filter((r) => r.status === 201).length;
    const enBase = Number(sql(`SELECT COUNT(*) FROM pedido WHERE comercio_id = ${dueno.comercioId};`));
    const cuentaActiva = sql(`SELECT activa FROM cuenta_mercado_pago WHERE dueno_id = ${dueno.duenoId};`) === '1';
    exigir(huerfanos === 0, `ronda ${ronda}: ${huerfanos} pedido(s) PENDIENTE_PAGO sobre una cuenta inactiva`);
    exigir(creados === enBase, `ronda ${ronda}: ${creados} pedidos creados con 201 pero ${enBase} en la base`);
    exigir(respuestasPedidos.every((r) => r.status === 201 || r.status === 409), `ronda ${ronda}: respuestas de pedido inesperadas ${respuestasPedidos.map((r) => r.status)}`);
    exigir(respuestaDesvincular.status === 200 || respuestaDesvincular.status === 409, `ronda ${ronda}: desvincular respondio ${respuestaDesvincular.status}`);
    if (respuestaDesvincular.status === 200) {
      exigir(!cuentaActiva, `ronda ${ronda}: desvincular 200 pero la cuenta sigue activa`);
      exigir(Number(sql(`SELECT COUNT(*) FROM pedido WHERE comercio_id = ${dueno.comercioId} AND estado = 'PENDIENTE_PAGO';`)) === 0, `ronda ${ronda}: desvincular 200 con pedidos PENDIENTE_PAGO`);
    } else {
      exigir(cuentaActiva, `ronda ${ronda}: desvincular 409 pero la cuenta quedo inactiva`);
      exigir(creados > 0, `ronda ${ronda}: desvincular 409 sin ningun pedido pendiente de pago`);
    }
    const rechazados409 = respuestasPedidos.filter((r) => r.status === 409 && !String(r.json?.mensaje).includes('no está aceptando pedidos'));
    exigir(rechazados409.length === 0, `ronda ${ronda}: 409 con un mensaje distinto del esperado ${JSON.stringify(rechazados409.map((r) => r.json))}`);
    console.log(
      `ronda ${ronda}${desvincularPrimero ? ' (desvincula primero)' : ''}: desvincular=${respuestaDesvincular.status} pedidos=${respuestasPedidos.map((r) => r.status).join(',')} ` +
        `en base=${enBase} cuenta activa=${cuentaActiva} huerfanos=${huerfanos}`,
    );
  }
  console.log('Resumen (b) desvincular:', resumir(resumenDesvincular), 'pedidos:', resumir(resumenPedidos));
  return problemas;
}

async function escenarioC(admin, categoriaId) {
  console.log('--- (c) desvincular con un pedido en PENDIENTE_PAGO ---');
  const { problemas, registrar5xx, exigir } = nuevoRegistro();
  const resumen = new Map();
  for (let ronda = 1; ronda <= ROUNDS; ronda++) {
    const dueno = await duenoAprobado(admin, true);
    const productoId = await crearProducto(dueno, categoriaId);
    const cliente = await nuevoCliente();
    await agregarAlCarrito(cliente, productoId);
    const pedido = await crearPedido(cliente);
    if (pedido.status !== 201) throw new Error('pedido ' + JSON.stringify(pedido));

    const respuestas = await Promise.all([1, 2, 3, 4, 5].map(() => desvincular(dueno)));
    respuestas.forEach((r) => {
      registrar5xx(`ronda ${ronda} desvincular`, r);
      contar(resumen, r.status);
    });
    exigir(respuestas.every((r) => r.status === 409), `ronda ${ronda}: respuestas ${respuestas.map((r) => r.status)} (se esperaba 409 siempre)`);
    exigir(sql(`SELECT activa FROM cuenta_mercado_pago WHERE dueno_id = ${dueno.duenoId};`) === '1', `ronda ${ronda}: la cuenta quedo inactiva`);
    exigir(sql(`SELECT estado FROM comercio WHERE id = ${dueno.comercioId};`) === 'APTO_VENTA', `ronda ${ronda}: el comercio ya no esta APTO_VENTA`);

    const pagado = await call('PUT', `/test/pedidos/${pedido.json.data.id}/pago-aprobado`);
    registrar5xx(`ronda ${ronda} pago`, pagado);
    const tras = await Promise.all([desvincular(dueno), desvincular(dueno)]);
    tras.forEach((r) => registrar5xx(`ronda ${ronda} desvincular tras pagar`, r));
    const codigos = tras.map((r) => r.status).sort().join('+');
    exigir(codigos === '200+404', `ronda ${ronda}: tras pagar, dos desvinculaciones dieron ${codigos} (se esperaba 200+404)`);
    console.log(`ronda ${ronda}: con pendiente=${respuestas.map((r) => r.status).join(',')} tras pagar=${codigos}`);
  }
  console.log('Resumen (c) con pendiente:', resumir(resumen));
  return problemas;
}

async function escenarioD(admin) {
  console.log('--- (d) vincular y desvincular intercalados del mismo Dueño ---');
  const { problemas, registrar5xx, exigir } = nuevoRegistro();
  const resumenVincular = new Map();
  const resumenDesvincular = new Map();
  const mensajes409 = new Map();
  for (let ronda = 1; ronda <= ROUNDS; ronda++) {
    const dueno = await duenoAprobado(admin, ronda % 2 === 0);
    const cuenta = `stress5-d-${uniq()}`;
    const tareas = [];
    for (let i = 0; i < 3; i++) {
      tareas.push(esperar(aleatorio(20)).then(() => vincular(dueno, cuenta)).then((r) => ({ tipo: 'vincular', r })));
      tareas.push(esperar(aleatorio(20)).then(() => desvincular(dueno)).then((r) => ({ tipo: 'desvincular', r })));
    }
    const resultados = await Promise.all(tareas);
    resultados.forEach(({ tipo, r }) => {
      registrar5xx(`ronda ${ronda} ${tipo}`, r);
      contar(tipo === 'vincular' ? resumenVincular : resumenDesvincular, r.status);
    });

    const cuentaActiva = sql(`SELECT activa FROM cuenta_mercado_pago WHERE dueno_id = ${dueno.duenoId};`) === '1';
    const malos = Number(sql(`SELECT COUNT(*) FROM comercio WHERE dueno_id = ${dueno.duenoId} AND estado = '${cuentaActiva ? 'APROBADO' : 'APTO_VENTA'}';`));
    const activasConLaCuenta = Number(sql(`SELECT COUNT(*) FROM cuenta_mercado_pago WHERE mp_user_id = '${cuenta}' AND activa = 1;`));
    exigir(malos === 0, `ronda ${ronda}: ${malos} comercio(s) inconsistente(s) con la cuenta (activa=${cuentaActiva})`);
    exigir(activasConLaCuenta <= 1, `ronda ${ronda}: ${activasConLaCuenta} filas activas con la misma cuenta`);
    resultados.filter(({ tipo, r }) => tipo === 'vincular' && r.status === 409).forEach(({ r }) => contar(mensajes409, r.json?.mensaje));
    exigir(resultados.every(({ tipo, r }) => (tipo === 'vincular' ? r.status === 200 || r.status === 409 : r.status === 200 || r.status === 404)),
      `ronda ${ronda}: respuestas inesperadas ${resultados.map(({ tipo, r }) => `${tipo}=${r.status}`)}`);
    console.log(`ronda ${ronda}: ${resultados.map(({ tipo, r }) => `${tipo[0]}${r.status}`).join(' ')} cuenta activa=${cuentaActiva}${malos ? '  <-- INCONSISTENTE' : ''}`);
  }
  console.log('Resumen (d) vincular:', resumir(resumenVincular), 'desvincular:', resumir(resumenDesvincular));
  console.log('Mensajes de los 409 al vincular:', resumir(mensajes409));
  return problemas;
}

async function main() {
  const admin = (await call('POST', '/auth/login', null, ADMIN)).json.data.token;
  const categoriaId = await categoriaDeLaCorrida(admin);
  const solo = process.env.ESCENARIO;
  const todos = [];
  if (!solo || solo === 'a') todos.push(...(await escenarioA(admin)));
  if (!solo || solo === 'b') todos.push(...(await escenarioB(admin, categoriaId)));
  if (!solo || solo === 'c') todos.push(...(await escenarioC(admin, categoriaId)));
  if (!solo || solo === 'd') todos.push(...(await escenarioD(admin)));
  console.log(todos.length ? 'PROBLEMAS:\n' + todos.join('\n') : 'SIN PROBLEMAS (sin 5xx, sin inconsistencias)');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
