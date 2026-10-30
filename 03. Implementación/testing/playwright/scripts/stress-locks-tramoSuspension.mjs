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
  return { comercioId: pendiente.id, productoId: producto.json.data.id, duenoToken: login.token, duenoId: login.usuario.id };
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

const suspenderComercio = (admin, id, motivo = MOTIVO) => call('PUT', `/administrador/comercios/${id}/suspender`, admin, { motivo });
const levantarComercio = (admin, id) => call('PUT', `/administrador/comercios/${id}/levantar-suspension`, admin, {});
const conComercio = (comercio) => ({ 'X-Comercio-Id': String(comercio.comercioId) });
const estadoComercio = (id) => sql(`SELECT estado FROM comercio WHERE id = ${id};`);
const estadoPedido = (id) => sql(`SELECT estado FROM pedido WHERE id = ${id};`);
const filasDePedido = (id, estado) => Number(sql(`SELECT COUNT(*) FROM historial_estado_pedido WHERE pedido_id = ${id} AND estado = '${estado}';`));
const notasDelPedido = (id) => Number(sql(`SELECT COUNT(*) FROM nota_credito nc JOIN pago pg ON pg.id = nc.pago_id WHERE pg.pedido_id = ${id};`));
const historialSuspensionComercio = (id) => Number(sql(`SELECT COUNT(*) FROM historial_estado_comercio WHERE comercio_id = ${id} AND estado_destino = 'SUSPENDIDO';`));

async function pedidoPagado(comercio, cliente, conAcepto = false) {
  await call('DELETE', '/carrito', cliente.token);
  const a = await call('POST', '/carrito/items', cliente.token, { productoId: comercio.productoId, cantidad: 1 });
  if (a.status !== 201 && a.status !== 200) throw new Error('carrito ' + JSON.stringify(a));
  const p = await call('POST', '/pedidos/cliente', cliente.token, { tipoEntrega: 'RETIRO' });
  if (p.status !== 201) throw new Error('pedido ' + JSON.stringify(p));
  const id = p.json.data.id;
  const pago = await call('PUT', `/test/pedidos/${id}/pago-aprobado?registrarPago=true`, null, {});
  if (pago.status !== 200) throw new Error('pago ' + JSON.stringify(pago));
  if (conAcepto) {
    const acepto = await call('PUT', `/pedidos/comercio/${id}/aceptar`, comercio.duenoToken, {}, conComercio(comercio));
    if (acepto.status !== 200) throw new Error('aceptar ' + JSON.stringify(acepto));
  }
  return id;
}

async function escenarioComercioDobleSuspension(admin, ronda) {
  const comercio = await comercioConProducto(admin);
  const respuestas = await Promise.all(Array.from({ length: 4 }, () => suspenderComercio(admin, comercio.comercioId)));
  respuestas.forEach((r, i) => registrar5xx(`comercio doble suspension #${i} (ronda ${ronda})`, r));
  const ok = respuestas.filter((r) => r.status === 200).length;
  exigir(ok === 1 && respuestas.filter((r) => r.status === 409).length === 3, `comercio doble suspension ronda ${ronda}: ${estadosDeRespuestas(respuestas)}`);
  exigir(estadoComercio(comercio.comercioId) === 'SUSPENDIDO', `comercio doble suspension ronda ${ronda}: estado ${estadoComercio(comercio.comercioId)}`);
  exigir(historialSuspensionComercio(comercio.comercioId) === 1, `comercio doble suspension ronda ${ronda}: ${historialSuspensionComercio(comercio.comercioId)} filas de historial`);
  anotar(`comercio-doble-suspension: ${estadosDeRespuestas(respuestas)}`);
}

async function escenarioSuspenderContraAceptar(admin, ronda) {
  const comercio = await comercioConProducto(admin);
  const cliente = await nuevoCliente();
  const pedidos = [];
  for (let i = 0; i < 4; i += 1) pedidos.push(await pedidoPagado(comercio, cliente));
  const tareas = [suspenderComercio(admin, comercio.comercioId)];
  for (const id of pedidos) tareas.push(call('PUT', `/pedidos/comercio/${id}/aceptar`, comercio.duenoToken, {}, conComercio(comercio)));
  const respuestas = await Promise.all(tareas);
  respuestas.forEach((r, i) => registrar5xx(`suspender contra aceptar #${i} (ronda ${ronda})`, r));
  exigir(respuestas[0].status === 200, `suspender contra aceptar ronda ${ronda}: la suspension dio ${respuestas[0].status}`);
  const inesperadas = respuestas.slice(1).filter((r) => r.status !== 200 && !(r.status === 409 && r.json?.data?.codigo === 'COMERCIO_SIN_OPERACION'));
  exigir(inesperadas.length === 0, `suspender contra aceptar ronda ${ronda}: respuestas inesperadas ${JSON.stringify(inesperadas.slice(0, 2))}`);
  pedidos.forEach((id, i) => {
    const aceptado = respuestas[i + 1].status === 200;
    exigir(estadoPedido(id) === (aceptado ? 'EN_PREPARACION' : 'RECHAZADO'), `suspender contra aceptar ronda ${ronda}: pedido ${id} en ${estadoPedido(id)} con respuesta ${respuestas[i + 1].status}`);
  });
  anotar(`aceptar: ${respuestas.slice(1).filter((r) => r.status === 200).length} aceptados antes de la suspension`);
}

async function escenarioSuspenderContraPago(admin, ronda) {
  const comercio = await comercioConProducto(admin);
  const cliente = await nuevoCliente();
  const pedidos = [];
  for (let i = 0; i < 4; i += 1) {
    await call('DELETE', '/carrito', cliente.token);
    await call('POST', '/carrito/items', cliente.token, { productoId: comercio.productoId, cantidad: 1 });
    const p = await call('POST', '/pedidos/cliente', cliente.token, { tipoEntrega: 'RETIRO' });
    pedidos.push(p.json.data.id);
  }
  const tareas = [suspenderComercio(admin, comercio.comercioId)];
  for (const id of pedidos) tareas.push(call('PUT', `/test/pedidos/${id}/pago-aprobado?registrarPago=true`, null, {}));
  const respuestas = await Promise.all(tareas);
  respuestas.forEach((r, i) => registrar5xx(`suspender contra pago #${i} (ronda ${ronda})`, r));
  exigir(respuestas[0].status === 200, `suspender contra pago ronda ${ronda}: la suspension dio ${respuestas[0].status}`);
  for (const id of pedidos) {
    const estado = estadoPedido(id);
    exigir(estado === 'RECHAZADO' || estado === 'CANCELADO_POR_SISTEMA', `suspender contra pago ronda ${ronda}: pedido ${id} en ${estado}`);
    exigir(notasDelPedido(id) === 1, `suspender contra pago ronda ${ronda}: pedido ${id} en ${estado} con ${notasDelPedido(id)} notas`);
  }
  anotar(`pago: ${pedidos.filter((id) => estadoPedido(id) === 'CANCELADO_POR_SISTEMA').length} cancelados y devueltos, ${pedidos.filter((id) => estadoPedido(id) === 'RECHAZADO').length} rechazados y devueltos`);
}

async function escenarioPendientesMuchosContraAceptarRechazarYBarrido(admin, ronda) {
  const comercio = await comercioConProducto(admin);
  const cliente = await nuevoCliente();
  const pedidos = [];
  for (let i = 0; i < 12; i += 1) pedidos.push(await pedidoPagado(comercio, cliente));
  const aceptar = pedidos.slice(0, 6);
  const rechazar = pedidos.slice(6, 8);
  const tareas = [suspenderComercio(admin, comercio.comercioId), suspenderComercio(admin, comercio.comercioId)];
  for (const id of aceptar) tareas.push(call('PUT', `/pedidos/comercio/${id}/aceptar`, comercio.duenoToken, {}, conComercio(comercio)));
  for (const id of rechazar) tareas.push(call('PUT', `/pedidos/comercio/${id}/rechazar`, comercio.duenoToken, { motivo: 'SIN_STOCK' }, conComercio(comercio)));
  tareas.push(call('POST', '/test/jobs/pedidos/rechazar-pendientes-suspension', null, {}));
  tareas.push(call('POST', '/test/jobs/pedidos/rechazar-pendientes-suspension', null, {}));
  const respuestas = await Promise.all(tareas);
  respuestas.forEach((r, i) => registrar5xx(`pendientes contra aceptar, rechazar y barrido #${i} (ronda ${ronda})`, r));
  exigir(respuestas.slice(0, 2).filter((r) => r.status === 200).length === 1, `pendientes ronda ${ronda}: las dos suspensiones dieron ${estadosDeRespuestas(respuestas.slice(0, 2))}`);
  const inesperadas = respuestas.slice(2, 10).filter((r) => r.status !== 200 && r.status !== 409);
  exigir(inesperadas.length === 0, `pendientes ronda ${ronda}: respuestas inesperadas ${JSON.stringify(inesperadas.slice(0, 2))}`);
  const aceptados = pedidos.filter((id) => estadoPedido(id) === 'EN_PREPARACION');
  const rechazados = pedidos.filter((id) => estadoPedido(id) === 'RECHAZADO');
  exigir(aceptados.length + rechazados.length === pedidos.length, `pendientes ronda ${ronda}: ${pedidos.length - aceptados.length - rechazados.length} pedidos en otro estado`);
  for (const id of aceptados) {
    exigir(aceptar.includes(id), `pendientes ronda ${ronda}: el pedido ${id} quedo aceptado sin que nadie lo aceptara`);
    exigir(notasDelPedido(id) === 0, `pendientes ronda ${ronda}: pedido aceptado ${id} con ${notasDelPedido(id)} notas`);
  }
  for (const id of rechazados) {
    exigir(notasDelPedido(id) === 1, `pendientes ronda ${ronda}: pedido rechazado ${id} con ${notasDelPedido(id)} notas`);
    exigir(filasDePedido(id, 'RECHAZADO') === 1, `pendientes ronda ${ronda}: pedido ${id} con ${filasDePedido(id, 'RECHAZADO')} filas de rechazo`);
  }
  const avisos = Number(sql(`SELECT COUNT(*) FROM notificacion WHERE usuario_id = ${cliente.id} AND tipo = 'PEDIDO_RECHAZADO' AND canal = 'PUSH';`));
  exigir(avisos === rechazados.length, `pendientes ronda ${ronda}: ${avisos} avisos para ${rechazados.length} rechazados`);
  exigir(estadoComercio(comercio.comercioId) === 'SUSPENDIDO', `pendientes ronda ${ronda}: el comercio quedo en ${estadoComercio(comercio.comercioId)}`);
  anotar(`pendientes: ${aceptados.length} aceptados antes y ${rechazados.length} rechazados con una sola nota`);
}

async function escenarioSuspenderContraDespacharYAnular(admin, ronda) {
  const comercio = await comercioConProducto(admin);
  const cliente = await nuevoCliente();
  const aDespachar = await pedidoPagado(comercio, cliente, true);
  const aAnular = await pedidoPagado(comercio, cliente, true);
  const [s, d, a] = await Promise.all([
    suspenderComercio(admin, comercio.comercioId),
    call('PUT', `/pedidos/comercio/${aDespachar}/despachar`, comercio.duenoToken, {}, conComercio(comercio)),
    call('PUT', `/pedidos/comercio/${aAnular}/anular`, comercio.duenoToken, { motivo: 'SIN_STOCK' }, conComercio(comercio)),
  ]);
  [s, d, a].forEach((r, i) => registrar5xx(`suspender contra despachar y anular #${i} (ronda ${ronda})`, r));
  exigir(s.status === 200 && d.status === 200 && a.status === 200, `suspender contra despachar y anular ronda ${ronda}: ${s.status} ${d.status} ${a.status}`);
  exigir(estadoPedido(aDespachar) === 'LISTO_PARA_RETIRAR' && estadoPedido(aAnular) === 'ANULADO', `suspender contra despachar y anular ronda ${ronda}: estados ${estadoPedido(aDespachar)} y ${estadoPedido(aAnular)}`);
  exigir(notasDelPedido(aAnular) === 1, `suspender contra despachar y anular ronda ${ronda}: ${notasDelPedido(aAnular)} notas`);
  anotar('despachar-y-anular: ambos funcionan siempre');
}

async function escenarioComercioContraCheckout(admin, ronda) {
  const comercio = await comercioConProducto(admin);
  const cliente = await nuevoCliente();
  await call('POST', '/carrito/items', cliente.token, { productoId: comercio.productoId, cantidad: 1 });
  const tareas = [suspenderComercio(admin, comercio.comercioId)];
  for (let i = 0; i < 20; i += 1) tareas.push(call('POST', '/pedidos/cliente', cliente.token, { tipoEntrega: 'RETIRO' }));
  const respuestas = await Promise.all(tareas);
  respuestas.forEach((r, i) => registrar5xx(`suspender comercio contra checkout #${i} (ronda ${ronda})`, r));
  exigir(respuestas[0].status === 200, `suspender comercio contra checkout ronda ${ronda}: la suspension dio ${respuestas[0].status}`);
  const nacidos = respuestas.slice(1).filter((r) => r.status === 201).length;
  const enBase = Number(sql(`SELECT COUNT(*) FROM pedido WHERE cliente_id = ${cliente.id};`));
  exigir(enBase === nacidos, `suspender comercio contra checkout ronda ${ronda}: ${enBase} pedidos en base y ${nacidos} respuestas 201`);
  const despues = Number(sql(`SELECT COUNT(*) FROM pedido p JOIN comercio c ON c.id = p.comercio_id WHERE p.cliente_id = ${cliente.id} AND p.fecha_creacion > DATE_ADD(c.suspendido_desde, INTERVAL 1 SECOND);`));
  exigir(despues === 0, `suspender comercio contra checkout ronda ${ronda}: ${despues} pedidos nacidos despues de la suspension`);
  anotar(`checkout comercio: ${nacidos} nacidos antes`);
}

async function escenarioSuspenderContraCierre(admin, ronda) {
  const comercio = await comercioConProducto(admin);
  const respuestas = await Promise.all([
    suspenderComercio(admin, comercio.comercioId),
    call('PUT', '/comercios/cerrar', comercio.duenoToken, {}, conComercio(comercio)),
    call('PUT', '/comercios/abrir', comercio.duenoToken, {}, conComercio(comercio)),
    call('PUT', '/comercios/cerrar', comercio.duenoToken, {}, conComercio(comercio)),
  ]);
  respuestas.forEach((r, i) => registrar5xx(`suspender contra cerrar y abrir #${i} (ronda ${ronda})`, r));
  exigir(respuestas[0].status === 200, `suspender contra cerrar y abrir ronda ${ronda}: la suspension dio ${respuestas[0].status}`);
  const inesperadas = respuestas.slice(1).filter((r) => r.status !== 200 && !(r.status === 409 && r.json?.data?.codigo === 'COMERCIO_NO_OPERATIVO'));
  exigir(inesperadas.length === 0, `suspender contra cerrar y abrir ronda ${ronda}: respuestas inesperadas ${JSON.stringify(inesperadas.slice(0, 2))}`);
  exigir(estadoComercio(comercio.comercioId) === 'SUSPENDIDO', `suspender contra cerrar y abrir ronda ${ronda}: estado ${estadoComercio(comercio.comercioId)}`);
  anotar(`cierre: ${estadosDeRespuestas(respuestas.slice(1))}`);
}

async function escenarioSuspenderContraMercadoPagoYDocumentos(admin, ronda) {
  const comercio = await comercioConProducto(admin);
  const respuestas = await Promise.all([
    suspenderComercio(admin, comercio.comercioId),
    call('POST', `/test/duenos/${comercio.duenoId}/mercadopago-simulada`, null, {}),
    call('PUT', `/test/comercios/${comercio.comercioId}/documentacion-aprobada`, null, {}),
  ]);
  respuestas.forEach((r, i) => registrar5xx(`suspender contra Mercado Pago y documentos #${i} (ronda ${ronda})`, r));
  exigir(respuestas[0].status === 200, `suspender contra Mercado Pago y documentos ronda ${ronda}: la suspension dio ${respuestas[0].status}`);
  exigir(estadoComercio(comercio.comercioId) === 'SUSPENDIDO', `suspender contra Mercado Pago y documentos ronda ${ronda}: estado ${estadoComercio(comercio.comercioId)}`);
  anotar('mercadopago-y-documentos: siempre queda suspendido');
}

async function escenarioLevantarContraElTope(admin, ronda) {
  const comercio = await comercioConProducto(admin);
  const cliente = await nuevoCliente();
  const pedido = await pedidoPagado(comercio, cliente, true);
  const s = await suspenderComercio(admin, comercio.comercioId);
  exigir(s.status === 200, `levantar contra el tope ronda ${ronda}: suspender dio ${s.status}`);
  await call('PUT', `/test/comercios/${comercio.comercioId}/envejecer-suspension?minutos=200`, null, {});
  const [l, j] = await Promise.all([levantarComercio(admin, comercio.comercioId), call('POST', '/test/jobs/pedidos/cancelar-preparacion-suspension', null, {})]);
  [l, j].forEach((r, i) => registrar5xx(`levantar contra el tope #${i} (ronda ${ronda})`, r));
  exigir(l.status === 200, `levantar contra el tope ronda ${ronda}: levantar dio ${l.status}`);
  const estado = estadoPedido(pedido);
  exigir(estado === 'EN_PREPARACION' || estado === 'CANCELADO_POR_SISTEMA', `levantar contra el tope ronda ${ronda}: pedido en ${estado}`);
  exigir(notasDelPedido(pedido) === (estado === 'CANCELADO_POR_SISTEMA' ? 1 : 0), `levantar contra el tope ronda ${ronda}: ${notasDelPedido(pedido)} notas con el pedido en ${estado}`);
  exigir(estadoComercio(comercio.comercioId) === 'APTO_VENTA' || estadoComercio(comercio.comercioId) === 'APROBADO', `levantar contra el tope ronda ${ronda}: comercio en ${estadoComercio(comercio.comercioId)}`);
  anotar(`levantar-contra-tope: pedido ${estado}`);
}

async function escenarioAccionesContraElTope(admin, ronda) {
  const comercio = await comercioConProducto(admin);
  const cliente = await nuevoCliente();
  const aDespachar = await pedidoPagado(comercio, cliente, true);
  const aAnular = await pedidoPagado(comercio, cliente, true);
  const dobleClic = await pedidoPagado(comercio, cliente, true);
  const s = await suspenderComercio(admin, comercio.comercioId);
  exigir(s.status === 200, `acciones contra el tope ronda ${ronda}: suspender dio ${s.status}`);
  await call('PUT', `/test/comercios/${comercio.comercioId}/envejecer-suspension?minutos=200`, null, {});
  const cabeceras = conComercio(comercio);
  const respuestas = await Promise.all([
    call('PUT', `/pedidos/comercio/${aDespachar}/despachar`, comercio.duenoToken, {}, cabeceras),
    call('PUT', `/pedidos/comercio/${aAnular}/anular`, comercio.duenoToken, { motivo: 'SIN_STOCK' }, cabeceras),
    call('PUT', `/pedidos/comercio/${dobleClic}/despachar`, comercio.duenoToken, {}, cabeceras),
    call('PUT', `/pedidos/comercio/${dobleClic}/despachar`, comercio.duenoToken, {}, cabeceras),
    call('POST', '/test/jobs/pedidos/cancelar-preparacion-suspension', null, {}),
    call('POST', '/test/jobs/pedidos/cancelar-preparacion-suspension', null, {}),
  ]);
  respuestas.forEach((r, i) => registrar5xx(`acciones contra el tope #${i} (ronda ${ronda})`, r));
  const [despacho, anulacion, clicUno, clicDos] = respuestas;
  const notas = (id) => notasDelPedido(id);
  const filas = (id, estado) => Number(sql(`SELECT COUNT(*) FROM historial_estado_pedido WHERE pedido_id = ${id} AND estado = '${estado}';`));

  const estadoDespacho = estadoPedido(aDespachar);
  exigir(estadoDespacho === 'LISTO_PARA_RETIRAR' || estadoDespacho === 'CANCELADO_POR_SISTEMA', `acciones contra el tope ronda ${ronda}: despachar quedo en ${estadoDespacho}`);
  exigir((estadoDespacho === 'LISTO_PARA_RETIRAR') === (despacho.status === 200), `acciones contra el tope ronda ${ronda}: despachar respondio ${despacho.status} con el pedido en ${estadoDespacho}`);
  exigir(notas(aDespachar) === (estadoDespacho === 'CANCELADO_POR_SISTEMA' ? 1 : 0), `acciones contra el tope ronda ${ronda}: ${notas(aDespachar)} notas con el pedido en ${estadoDespacho}`);
  exigir(filas(aDespachar, 'LISTO_PARA_RETIRAR') + filas(aDespachar, 'CANCELADO_POR_SISTEMA') === 1, `acciones contra el tope ronda ${ronda}: el pedido despachado tiene mas de un cierre`);

  const estadoAnulacion = estadoPedido(aAnular);
  exigir(estadoAnulacion === 'ANULADO' || estadoAnulacion === 'CANCELADO_POR_SISTEMA', `acciones contra el tope ronda ${ronda}: anular quedo en ${estadoAnulacion}`);
  exigir((estadoAnulacion === 'ANULADO') === (anulacion.status === 200), `acciones contra el tope ronda ${ronda}: anular respondio ${anulacion.status} con el pedido en ${estadoAnulacion}`);
  exigir(notas(aAnular) === 1, `acciones contra el tope ronda ${ronda}: ${notas(aAnular)} notas en el pedido anulado o cancelado (debe ser una)`);

  const ganadores = [clicUno, clicDos].filter((r) => r.status === 200).length;
  const estadoDoble = estadoPedido(dobleClic);
  exigir(estadoDoble === 'LISTO_PARA_RETIRAR' || estadoDoble === 'CANCELADO_POR_SISTEMA', `acciones contra el tope ronda ${ronda}: el doble clic quedo en ${estadoDoble}`);
  exigir(ganadores === (estadoDoble === 'LISTO_PARA_RETIRAR' ? 1 : 0), `acciones contra el tope ronda ${ronda}: ${ganadores} despachos con exito y el pedido en ${estadoDoble}`);
  exigir(filas(dobleClic, 'LISTO_PARA_RETIRAR') === (estadoDoble === 'LISTO_PARA_RETIRAR' ? 1 : 0), `acciones contra el tope ronda ${ronda}: el doble clic dejo ${filas(dobleClic, 'LISTO_PARA_RETIRAR')} filas de listo`);
  exigir(notas(dobleClic) === (estadoDoble === 'CANCELADO_POR_SISTEMA' ? 1 : 0), `acciones contra el tope ronda ${ronda}: ${notas(dobleClic)} notas en el doble clic con el pedido en ${estadoDoble}`);
  anotar(`acciones-contra-tope: despachar ${estadoDespacho}, anular ${estadoAnulacion}, doble clic ${estadoDoble}`);
}

const ESCENARIOS = [
  { n: 1, nombre: 'doble suspension', corre: (ctx, ronda) => escenarioDobleSuspension(ctx.admin, ronda) },
  { n: 2, nombre: 'suspender contra login', corre: (ctx, ronda) => escenarioSuspenderContraLogin(ctx.admin, ronda) },
  { n: 3, nombre: 'suspender contra checkout', corre: (ctx, ronda) => escenarioSuspenderContraCheckout(ctx.admin, ctx.comercio, ronda), necesitaComercio: true },
  { n: 4, nombre: 'levantar contra login', corre: (ctx, ronda) => escenarioLevantarContraLogin(ctx.admin, ronda) },
  { n: 5, nombre: 'comercio: doble suspension', corre: (ctx, ronda) => escenarioComercioDobleSuspension(ctx.admin, ronda) },
  { n: 6, nombre: 'comercio: suspender contra aceptar', corre: (ctx, ronda) => escenarioSuspenderContraAceptar(ctx.admin, ronda) },
  { n: 7, nombre: 'comercio: suspender contra pago', corre: (ctx, ronda) => escenarioSuspenderContraPago(ctx.admin, ronda) },
  { n: 8, nombre: 'comercio: suspender contra despachar y anular', corre: (ctx, ronda) => escenarioSuspenderContraDespacharYAnular(ctx.admin, ronda) },
  { n: 9, nombre: 'comercio: suspender contra checkout', corre: (ctx, ronda) => escenarioComercioContraCheckout(ctx.admin, ronda) },
  { n: 10, nombre: 'comercio: suspender contra cerrar y abrir', corre: (ctx, ronda) => escenarioSuspenderContraCierre(ctx.admin, ronda) },
  { n: 11, nombre: 'comercio: suspender contra Mercado Pago y documentos', corre: (ctx, ronda) => escenarioSuspenderContraMercadoPagoYDocumentos(ctx.admin, ronda) },
  { n: 12, nombre: 'comercio: levantar contra el tope de 90 minutos', corre: (ctx, ronda) => escenarioLevantarContraElTope(ctx.admin, ronda) },
  { n: 13, nombre: 'comercio: despachar, anular y doble clic contra el tope de 90 minutos', corre: (ctx, ronda) => escenarioAccionesContraElTope(ctx.admin, ronda) },
  { n: 14, nombre: 'comercio: muchos pendientes contra aceptar, rechazar a mano, doble suspension y barrido', corre: (ctx, ronda) => escenarioPendientesMuchosContraAceptarRechazarYBarrido(ctx.admin, ronda) },
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
