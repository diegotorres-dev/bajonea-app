import { execFileSync } from 'node:child_process';

const B = process.env.E2E_API_BASE_URL || 'http://localhost:8080/api/v1';
const LOC = process.env.LOC;
const ROUNDS = Number(process.env.ROUNDS || 8);
const ESCENARIO = process.env.ESCENARIO ? process.env.ESCENARIO.split(',').map(Number) : null;
const ADMIN = { nombreUsuario: process.env.ADMIN_USUARIO || 'adminbajonea', password: process.env.ADMIN_PASSWORD };
const MOTIVO = 'Pedidos falsos reiterados en el ultimo mes';
if (!ADMIN.password) {
  console.error('Falta ADMIN_PASSWORD (contraseña de admin@bajonea.ar en bajonea_test; ver testing/playwright/README.md)');
  process.exit(1);
}
if (!LOC) {
  console.error('Falta LOC (id de la localidad Río Grande)');
  process.exit(1);
}

const MYSQL = process.env.MYSQL_BIN || 'C:/xampp/mysql/bin/mysql.exe';
const sqlUnaVez = (q) => execFileSync(MYSQL, ['-u', 'root', '-N', '-B', '--default-character-set=utf8mb4', 'bajonea_test'], { input: q }).toString().trim();
const sql = (q) => {
  let resultado = sqlUnaVez(q);
  for (let intento = 0; intento < 2 && resultado === '' && /^\s*SELECT/i.test(q); intento += 1) resultado = sqlUnaVez(q);
  return resultado;
};

let seq = Date.now() % 100000;
const uniq = () => `${Date.now().toString(36)}${(seq++).toString(36)}`.slice(-10);

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

async function nuevoCliente() {
  const u = uniq();
  const cuerpo = {
    nombre: 'Stress',
    apellido: 'Suspension',
    dni: dni(),
    fechaNacimiento: '1995-05-20',
    telefono: tel(),
    nombreUsuario: `ss${u}`.slice(0, 20),
    email: `stress.susp.${u}@bajonea.test`,
    password: 'Testing123',
    aceptaTerminos: true,
    direccion: { calle: 'Calle Siempre Viva', numero: '123', pisoDepto: null, codigoPostal: '9420', localidadId: LOC, principal: true },
  };
  const r = await call('POST', '/auth/registro/cliente', null, cuerpo);
  if (r.status !== 201) throw new Error('registro cliente ' + JSON.stringify(r));
  const codigo = (await call('GET', `/test/token-verificacion?email=${cuerpo.email}`)).json.data;
  const v = await call('POST', '/auth/verificar', null, { email: cuerpo.email, codigo });
  if (v.status !== 200) throw new Error('verificar ' + JSON.stringify(v));
  const login = (await call('POST', '/auth/login', null, { nombreUsuario: cuerpo.nombreUsuario, password: cuerpo.password })).json.data;
  return { token: login.token, id: login.usuario.id, nombreUsuario: cuerpo.nombreUsuario, password: cuerpo.password };
}

async function comercioConProducto(admin) {
  const u = uniq();
  const cuerpo = {
    aceptaTerminos: true,
    cuit: cuit(),
    domicilioFiscal: 'Av. Stress 1',
    nombre: `Stress Suspension ${u}`,
    descripcion: 'x',
    telefono: tel(),
    tipoComercio: 'RESTAURANTE',
    aceptaDelivery: true,
    aceptaRetiro: true,
    nombreUsuario: `sc${u}`.slice(0, 20),
    email: `stress.suspcom.${u}@bajonea.test`,
    password: 'Testing123',
    direccion: { calle: 'Stress', numero: '1', pisoDepto: null, codigoPostal: '9420', localidadId: LOC, principal: false },
    horarios: ['LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO', 'DOMINGO'].map((diaSemana) => ({ diaSemana, horaApertura: '00:00', horaCierre: '23:59' })),
    nombreRepresentante: 'Rep',
    apellidoRepresentante: 'Stress',
    dniRepresentante: dni(),
    telefonoRepresentante: tel(),
    fechaNacimientoRepresentante: '1985-03-15',
    fotoPerfilUrl: 'https://res.cloudinary.com/demo/image/upload/stress-susp.png',
    redesSociales: [{ tipo: 'INSTAGRAM', url: `https://instagram.com/ss${u}` }],
  };
  const r = await call('POST', '/auth/registro/comercio', null, cuerpo);
  if (r.status !== 201) throw new Error('registro comercio ' + JSON.stringify(r));
  const codigo = (await call('GET', `/test/token-verificacion?email=${cuerpo.email}`)).json.data;
  await call('POST', '/auth/verificar', null, { email: cuerpo.email, codigo });
  const pendiente = (await call('GET', '/administrador/comercios/pendientes', admin)).json.data.find((c) => c.emailCuenta === cuerpo.email);
  await call('PUT', `/administrador/comercios/${pendiente.id}/resolver`, admin, { aprobar: true });
  await call('PUT', `/test/comercios/${pendiente.id}/apto-venta`, null, {});
  const login = (await call('POST', '/auth/login', null, { nombreUsuario: cuerpo.nombreUsuario, password: cuerpo.password })).json.data;
  const categoria = (await call('POST', '/categorias', admin, { nombre: `Cat Susp ${u}` })).json.data.id;
  const producto = await call('POST', '/productos', login.token, { nombre: `Prod Susp ${u}`, descripcion: 'x', precio: 10000, categoriaId: categoria }, { 'X-Comercio-Id': String(pendiente.id) });
  if (producto.status !== 201) throw new Error('producto ' + JSON.stringify(producto));
  return { comercioId: pendiente.id, productoId: producto.json.data.id };
}

const suspender = (admin, id) => call('PUT', `/administrador/clientes/${id}/suspender`, admin, { motivo: MOTIVO });
const levantar = (admin, id) => call('PUT', `/administrador/clientes/${id}/levantar-suspension`, admin, {});

const estadoDe = (id) => sql(`SELECT estado FROM usuario WHERE id = ${id};`);
const filasDeHistorial = (id) => Number(sql(`SELECT COUNT(*) FROM historial_estado_usuario WHERE usuario_id = ${id} AND (estado_destino = 'SUSPENDIDO' OR estado_origen = 'SUSPENDIDO');`));
const sesionesActivas = (id) => Number(sql(`SELECT COUNT(*) FROM sesion WHERE usuario_id = ${id} AND activa = 1;`));
const pedidosSinPagar = (id) => Number(sql(`SELECT COUNT(*) FROM pedido WHERE cliente_id = ${id} AND estado = 'PENDIENTE_PAGO';`));
const pedidosDe = (id) => Number(sql(`SELECT COUNT(*) FROM pedido WHERE cliente_id = ${id};`));

const problemas = [];
const registrar5xx = (etiqueta, r) => {
  if (r.status >= 500) problemas.push(`${etiqueta}: ${r.status} ${JSON.stringify(r.json)}`);
};
const exigir = (condicion, mensaje) => {
  if (!condicion) problemas.push(mensaje);
};
const resumen = new Map();
const anotar = (clave) => resumen.set(clave, (resumen.get(clave) || 0) + 1);
const estadosDeRespuestas = (respuestas) => [...respuestas.map((r) => r.status)].sort().join('+');

async function escenarioDobleSuspension(admin, ronda) {
  const cliente = await nuevoCliente();
  const respuestas = await Promise.all(Array.from({ length: 4 }, () => suspender(admin, cliente.id)));
  respuestas.forEach((r, i) => registrar5xx(`doble suspension #${i} (ronda ${ronda})`, r));
  const ok = respuestas.filter((r) => r.status === 200).length;
  const conflicto = respuestas.filter((r) => r.status === 409).length;
  exigir(ok === 1 && conflicto === 3, `doble suspension ronda ${ronda}: ${estadosDeRespuestas(respuestas)} (se esperaba una 200 y tres 409)`);
  exigir(estadoDe(cliente.id) === 'SUSPENDIDO', `doble suspension ronda ${ronda}: estado ${estadoDe(cliente.id)}`);
  exigir(filasDeHistorial(cliente.id) === 1, `doble suspension ronda ${ronda}: ${filasDeHistorial(cliente.id)} filas de historial`);
  anotar(`doble-suspension: ${estadosDeRespuestas(respuestas)}`);
}

async function escenarioSuspenderContraLogin(admin, ronda) {
  const cliente = await nuevoCliente();
  const tareas = [suspender(admin, cliente.id)];
  for (let i = 0; i < 30; i += 1) {
    tareas.push(call('POST', '/auth/login', null, { nombreUsuario: cliente.nombreUsuario, password: cliente.password }));
  }
  const respuestas = await Promise.all(tareas);
  respuestas.forEach((r, i) => registrar5xx(`suspender contra login #${i} (ronda ${ronda})`, r));
  exigir(respuestas[0].status === 200, `suspender contra login ronda ${ronda}: la suspension dio ${respuestas[0].status}`);
  const inesperados = respuestas.slice(1).filter((r) => r.status !== 200 && !(r.status === 409 && r.json?.data?.codigo === 'CUENTA_SUSPENDIDA'));
  exigir(inesperados.length === 0, `suspender contra login ronda ${ronda}: respuestas inesperadas ${JSON.stringify(inesperados.slice(0, 2))}`);
  exigir(sesionesActivas(cliente.id) === 0, `suspender contra login ronda ${ronda}: ${sesionesActivas(cliente.id)} sesiones activas`);
  const despues = await call('POST', '/auth/login', null, { nombreUsuario: cliente.nombreUsuario, password: cliente.password });
  exigir(despues.status === 409 && despues.json?.data?.codigo === 'CUENTA_SUSPENDIDA', `suspender contra login ronda ${ronda}: un login posterior dio ${despues.status}`);
  anotar(`login: 200x${respuestas.slice(1).filter((r) => r.status === 200).length}`);
}

async function escenarioSuspenderContraCheckout(admin, comercio, ronda) {
  const cliente = await nuevoCliente();
  const a = await call('POST', '/carrito/items', cliente.token, { productoId: comercio.productoId, cantidad: 1 });
  if (a.status !== 201 && a.status !== 200) throw new Error('carrito ' + JSON.stringify(a));
  const tareas = [suspender(admin, cliente.id)];
  for (let i = 0; i < 20; i += 1) {
    tareas.push(call('POST', '/pedidos/cliente', cliente.token, { tipoEntrega: 'RETIRO' }));
  }
  const respuestas = await Promise.all(tareas);
  respuestas.forEach((r, i) => registrar5xx(`suspender contra checkout #${i} (ronda ${ronda})`, r));
  exigir(respuestas[0].status === 200, `suspender contra checkout ronda ${ronda}: la suspension dio ${respuestas[0].status}`);
  const nacidos = respuestas.slice(1).filter((r) => r.status === 201).length;
  exigir(pedidosDe(cliente.id) === nacidos, `suspender contra checkout ronda ${ronda}: ${pedidosDe(cliente.id)} pedidos en base y ${nacidos} respuestas 201`);
  exigir(pedidosSinPagar(cliente.id) === 0, `suspender contra checkout ronda ${ronda}: ${pedidosSinPagar(cliente.id)} pedidos sin pagar tras la suspension`);
  const items = Number(sql(`SELECT COUNT(*) FROM item_carrito ic JOIN carrito c ON c.id = ic.carrito_id WHERE c.cliente_id = ${cliente.id};`));
  exigir(items === 1, `suspender contra checkout ronda ${recordRonda(ronda)}: el carrito tiene ${items} items (se esperaba conservarlo)`);
  anotar(`checkout: ${nacidos} nacidos antes de la suspension`);
}

const recordRonda = (ronda) => ronda;

async function escenarioLevantarContraLogin(admin, ronda) {
  const cliente = await nuevoCliente();
  const s = await suspender(admin, cliente.id);
  exigir(s.status === 200, `levantar contra login ronda ${ronda}: suspender dio ${s.status}`);
  const tareas = [levantar(admin, cliente.id)];
  for (let i = 0; i < 20; i += 1) {
    tareas.push(call('POST', '/auth/login', null, { nombreUsuario: cliente.nombreUsuario, password: cliente.password }));
  }
  const respuestas = await Promise.all(tareas);
  respuestas.forEach((r, i) => registrar5xx(`levantar contra login #${i} (ronda ${ronda})`, r));
  exigir(respuestas[0].status === 200, `levantar contra login ronda ${ronda}: levantar dio ${respuestas[0].status}`);
  const inesperados = respuestas.slice(1).filter((r) => r.status !== 200 && !(r.status === 409 && r.json?.data?.codigo === 'CUENTA_SUSPENDIDA'));
  exigir(inesperados.length === 0, `levantar contra login ronda ${ronda}: respuestas inesperadas ${JSON.stringify(inesperados.slice(0, 2))}`);
  exigir(estadoDe(cliente.id) === 'ACTIVO', `levantar contra login ronda ${ronda}: estado ${estadoDe(cliente.id)}`);
  exigir(sesionesActivas(cliente.id) <= 1, `levantar contra login ronda ${ronda}: ${sesionesActivas(cliente.id)} sesiones activas`);
  exigir(filasDeHistorial(cliente.id) === 2, `levantar contra login ronda ${ronda}: ${filasDeHistorial(cliente.id)} filas de historial`);
  anotar('levantar-contra-login');
}

const ESCENARIOS = [
  { n: 1, nombre: 'doble suspension', corre: (ctx, ronda) => escenarioDobleSuspension(ctx.admin, ronda) },
  { n: 2, nombre: 'suspender contra login', corre: (ctx, ronda) => escenarioSuspenderContraLogin(ctx.admin, ronda) },
  { n: 3, nombre: 'suspender contra checkout', corre: (ctx, ronda) => escenarioSuspenderContraCheckout(ctx.admin, ctx.comercio, ronda), necesitaComercio: true },
  { n: 4, nombre: 'levantar contra login', corre: (ctx, ronda) => escenarioLevantarContraLogin(ctx.admin, ronda) },
];

async function main() {
  const admin = (await call('POST', '/auth/login', null, ADMIN)).json.data.token;
  const correr = (n) => !ESCENARIO || ESCENARIO.includes(n);
  const elegidos = ESCENARIOS.filter((e) => correr(e.n));
  const comercio = elegidos.some((e) => e.necesitaComercio) ? await comercioConProducto(admin) : null;
  const ctx = { admin, comercio };
  for (let ronda = 1; ronda <= ROUNDS; ronda++) {
    for (const escenario of elegidos) await escenario.corre(ctx, ronda);
    console.log(`ronda ${ronda}: ${problemas.length === 0 ? 'ok' : `${problemas.length} problema(s) hasta ahora`}`);
  }
  console.log('Resumen de resultados:', Object.fromEntries([...resumen].sort()));
  if (problemas.length) {
    console.log('PROBLEMAS:\n' + problemas.join('\n'));
    process.exitCode = 1;
  } else {
    console.log('SIN PROBLEMAS (sin 5xx, una sola suspension, sin sesiones activas ni pedidos sin pagar tras suspender, carrito conservado)');
  }
}

main().catch((e) => {
  console.error('FALLO DEL SCRIPT', e);
  process.exit(1);
});
