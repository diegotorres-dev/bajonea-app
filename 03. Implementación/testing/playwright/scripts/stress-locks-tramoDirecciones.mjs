import { execFileSync } from 'node:child_process';

const B = process.env.E2E_API_BASE_URL || 'http://localhost:8080/api/v1';
const LOC = process.env.LOC;
const ROUNDS = Number(process.env.ROUNDS || 8);
const ESCENARIO = process.env.ESCENARIO ? process.env.ESCENARIO.split(',').map(Number) : null;
const ADMIN = { nombreUsuario: process.env.ADMIN_USUARIO || 'adminbajonea', password: process.env.ADMIN_PASSWORD };
const USHUAIA = '94015020';
const BASE = '/clientes/direcciones';
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
    apellido: 'Direcciones',
    dni: dni(),
    fechaNacimiento: '1995-05-20',
    telefono: tel(),
    nombreUsuario: `sd${u}`.slice(0, 20),
    email: `stress.dir.${u}@bajonea.test`,
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
  return { token: login.token, id: login.usuario.id };
}

async function comercioConProducto(admin) {
  const u = uniq();
  const cuerpo = {
    aceptaTerminos: true,
    cuit: cuit(),
    domicilioFiscal: 'Av. Stress 1',
    nombre: `Stress Direcciones ${u}`,
    descripcion: 'x',
    telefono: tel(),
    tipoComercio: 'RESTAURANTE',
    aceptaDelivery: true,
    aceptaRetiro: true,
    nombreUsuario: `sc${u}`.slice(0, 20),
    email: `stress.dircom.${u}@bajonea.test`,
    password: 'Testing123',
    direccion: { calle: 'Stress', numero: '1', pisoDepto: null, codigoPostal: '9420', localidadId: LOC, principal: false },
    horarios: ['LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO', 'DOMINGO'].map((diaSemana) => ({ diaSemana, horaApertura: '00:00', horaCierre: '23:59' })),
    nombreRepresentante: 'Rep',
    apellidoRepresentante: 'Stress',
    dniRepresentante: dni(),
    telefonoRepresentante: tel(),
    fechaNacimientoRepresentante: '1985-03-15',
    fotoPerfilUrl: 'https://res.cloudinary.com/demo/image/upload/stress-dir.png',
    redesSociales: [{ tipo: 'INSTAGRAM', url: `https://instagram.com/sd${u}` }],
  };
  const r = await call('POST', '/auth/registro/comercio', null, cuerpo);
  if (r.status !== 201) throw new Error('registro comercio ' + JSON.stringify(r));
  const codigo = (await call('GET', `/test/token-verificacion?email=${cuerpo.email}`)).json.data;
  await call('POST', '/auth/verificar', null, { email: cuerpo.email, codigo });
  const pendiente = (await call('GET', '/administrador/comercios/pendientes', admin)).json.data.find((c) => c.emailCuenta === cuerpo.email);
  await call('PUT', `/administrador/comercios/${pendiente.id}/resolver`, admin, { aprobar: true });
  await call('PUT', `/test/comercios/${pendiente.id}/apto-venta`, null, {});
  const login = (await call('POST', '/auth/login', null, { nombreUsuario: cuerpo.nombreUsuario, password: cuerpo.password })).json.data;
  const categoria = (await call('POST', '/categorias', admin, { nombre: `Cat Dir ${u}` })).json.data.id;
  const producto = await call('POST', '/productos', login.token, { nombre: `Prod Dir ${u}`, descripcion: 'x', precio: 10000, categoriaId: categoria }, { 'X-Comercio-Id': String(pendiente.id) });
  if (producto.status !== 201) throw new Error('producto ' + JSON.stringify(producto));
  return { comercioId: pendiente.id, productoId: producto.json.data.id };
}

const cuerpoDireccion = (calle, extra = {}, localidadId = LOC) => ({ calle, numero: '100', codigoPostal: '9420', localidadId, ...extra });
const alta = (token, calle, extra, localidadId) => call('POST', BASE, token, cuerpoDireccion(calle, extra, localidadId));
const editar = (token, id, cuerpo) => call('PUT', `${BASE}/${id}`, token, cuerpo);
const predeterminar = (token, id) => call('PUT', `${BASE}/${id}/principal`, token, {});
const baja = (token, id) => call('DELETE', `${BASE}/${id}`, token);

const activas = (id) => Number(sql(`SELECT COUNT(*) FROM direccion WHERE cliente_id = ${id} AND eliminada = 0;`));
const predeterminadas = (id) => Number(sql(`SELECT COUNT(*) FROM direccion WHERE cliente_id = ${id} AND eliminada = 0 AND principal = 1;`));
const idsActivas = (id) => sql(`SELECT id FROM direccion WHERE cliente_id = ${id} AND eliminada = 0 ORDER BY id;`).split('\n').filter(Boolean).map(Number);
const predeterminadaDe = (id) => Number(sql(`SELECT id FROM direccion WHERE cliente_id = ${id} AND eliminada = 0 AND principal = 1;`));

const problemas = [];
const registrar5xx = (etiqueta, r) => {
  if (r.status >= 500) problemas.push(`${etiqueta}: ${r.status} ${JSON.stringify(r.json)}`);
};
const exigir = (condicion, mensaje) => {
  if (!condicion) problemas.push(mensaje);
};
const resumen = new Map();
const anotar = (clave) => resumen.set(clave, (resumen.get(clave) || 0) + 1);
const estadosDe = (respuestas) => [...respuestas.map((r) => r.status)].sort().join('+');

async function conDirecciones(cantidad) {
  const cliente = await nuevoCliente();
  for (let i = 1; i < cantidad; i += 1) {
    const r = await alta(cliente.token, `Previa ${i}`);
    if (r.status !== 201) throw new Error('alta previa ' + JSON.stringify(r));
  }
  return cliente;
}

async function escenarioCupo(ronda) {
  const cliente = await conDirecciones(4);
  const respuestas = await Promise.all(Array.from({ length: 6 }, (_, i) => alta(cliente.token, `Carrera ${i}`)));
  respuestas.forEach((r, i) => registrar5xx(`cupo #${i} (ronda ${ronda})`, r));
  const ganadoras = respuestas.filter((r) => r.status === 201).length;
  const perdedoras = respuestas.filter((r) => r.status === 409 && r.json?.data?.codigo === 'DIRECCIONES_CUPO_MAXIMO').length;
  exigir(ganadoras === 1 && perdedoras === 5, `cupo ronda ${ronda}: ${estadosDe(respuestas)} (se esperaba una 201 y cinco 409 DIRECCIONES_CUPO_MAXIMO)`);
  exigir(activas(cliente.id) === 5, `cupo ronda ${ronda}: ${activas(cliente.id)} activas (se esperaban 5)`);
  exigir(predeterminadas(cliente.id) === 1, `cupo ronda ${ronda}: ${predeterminadas(cliente.id)} predeterminadas`);
  anotar(`cupo: ${estadosDe(respuestas)}`);
}

async function escenarioPredeterminadas(ronda) {
  const cliente = await conDirecciones(4);
  const ids = idsActivas(cliente.id);
  const dos = await Promise.all([predeterminar(cliente.token, ids[1]), predeterminar(cliente.token, ids[2])]);
  dos.forEach((r, i) => registrar5xx(`dos cambios #${i} (ronda ${ronda})`, r));
  exigir(dos.every((r) => r.status === 200), `dos cambios ronda ${ronda}: ${estadosDe(dos)}`);
  exigir(predeterminadas(cliente.id) === 1, `dos cambios ronda ${ronda}: ${predeterminadas(cliente.id)} predeterminadas`);

  const mezcla = await Promise.all([
    predeterminar(cliente.token, ids[0]),
    predeterminar(cliente.token, ids[1]),
    predeterminar(cliente.token, ids[3]),
    alta(cliente.token, 'Con principal', { principal: true }),
  ]);
  mezcla.forEach((r, i) => registrar5xx(`cambios y alta con principal #${i} (ronda ${ronda})`, r));
  exigir(mezcla.slice(0, 3).every((r) => r.status === 200) && [201, 409].includes(mezcla[3].status), `cambios mezclados ronda ${ronda}: ${mezcla.map((r) => r.status).join(',')}`);
  exigir(predeterminadas(cliente.id) === 1, `cambios mezclados ronda ${ronda}: ${predeterminadas(cliente.id)} predeterminadas`);
  anotar(`predeterminadas: ${estadosDe(dos)}`);
}

async function escenarioBajaContraCambio(ronda) {
  const cliente = await conDirecciones(3);
  const ids = idsActivas(cliente.id);
  const inicial = predeterminadaDe(cliente.id);
  const otra = ids.find((id) => id !== inicial);
  const respuestas = await Promise.all([baja(cliente.token, inicial), predeterminar(cliente.token, otra)]);
  respuestas.forEach((r, i) => registrar5xx(`baja contra cambio #${i} (ronda ${ronda})`, r));
  exigir(respuestas.every((r) => r.status === 200), `baja contra cambio ronda ${ronda}: ${respuestas.map((r) => r.status).join(',')}`);
  exigir(activas(cliente.id) === 2, `baja contra cambio ronda ${ronda}: ${activas(cliente.id)} activas`);
  exigir(predeterminadas(cliente.id) === 1, `baja contra cambio ronda ${ronda}: ${predeterminadas(cliente.id)} predeterminadas`);
  exigir(predeterminadaDe(cliente.id) !== inicial, `baja contra cambio ronda ${ronda}: la eliminada sigue como predeterminada`);

  const cliente2 = await conDirecciones(3);
  const ids2 = idsActivas(cliente2.id);
  const pred2 = predeterminadaDe(cliente2.id);
  const respuestas2 = await Promise.all([baja(cliente2.token, pred2), predeterminar(cliente2.token, pred2), predeterminar(cliente2.token, ids2.find((id) => id !== pred2))]);
  respuestas2.forEach((r, i) => registrar5xx(`baja contra marcar la misma #${i} (ronda ${ronda})`, r));
  exigir(respuestas2.every((r) => [200, 404].includes(r.status)), `baja contra marcar la misma ronda ${ronda}: ${respuestas2.map((r) => r.status).join(',')}`);
  exigir(predeterminadas(cliente2.id) === 1, `baja contra marcar la misma ronda ${ronda}: ${predeterminadas(cliente2.id)} predeterminadas`);
  anotar(`baja-contra-cambio: ${estadosDe(respuestas)}`);
}

async function escenarioUltimasBajas(ronda) {
  const cliente = await conDirecciones(2);
  const ids = idsActivas(cliente.id);
  const dos = await Promise.all(ids.map((id) => baja(cliente.token, id)));
  dos.forEach((r, i) => registrar5xx(`dos bajas #${i} (ronda ${ronda})`, r));
  const ok = dos.filter((r) => r.status === 200).length;
  const ultima = dos.filter((r) => r.status === 409 && r.json?.data?.codigo === 'ULTIMA_DIRECCION').length;
  exigir(ok === 1 && ultima === 1, `dos bajas ronda ${ronda}: ${estadosDe(dos)} (se esperaba una 200 y una 409 ULTIMA_DIRECCION)`);
  exigir(activas(cliente.id) === 1 && predeterminadas(cliente.id) === 1, `dos bajas ronda ${ronda}: ${activas(cliente.id)} activas, ${predeterminadas(cliente.id)} predeterminadas`);

  const cliente3 = await conDirecciones(3);
  const tres = await Promise.all(idsActivas(cliente3.id).map((id) => baja(cliente3.token, id)));
  tres.forEach((r, i) => registrar5xx(`tres bajas #${i} (ronda ${ronda})`, r));
  exigir(tres.filter((r) => r.status === 200).length === 2 && tres.filter((r) => r.status === 409).length === 1, `tres bajas ronda ${ronda}: ${estadosDe(tres)} (se esperaban dos 200 y una 409)`);
  exigir(activas(cliente3.id) === 1 && predeterminadas(cliente3.id) === 1, `tres bajas ronda ${ronda}: ${activas(cliente3.id)} activas, ${predeterminadas(cliente3.id)} predeterminadas`);
  anotar(`ultimas-bajas: ${estadosDe(dos)}`);
}

const copiaDe = (pedidoId) => sql(`SELECT CONCAT_WS('|', IFNULL(entrega_calle,'N'), IFNULL(entrega_numero,'N'), IFNULL(entrega_codigo_postal,'N'), IFNULL(entrega_localidad_id,'N'), IFNULL(entrega_referencia,'N')) FROM pedido WHERE id = ${pedidoId};`);
const cuerpoNuevo = () => ({ ...cuerpoDireccion('Nueva Calle', { referencia: 'Timbre roto' }, USHUAIA), numero: '999', codigoPostal: '9410' });
const COPIA_VIEJA = `Calle Siempre Viva|123|9420|${LOC}|N`;
const COPIA_NUEVA = `Nueva Calle|999|9410|${USHUAIA}|Timbre roto`;

async function pedidoContra(ronda, comercio, accionConcurrente, etiqueta) {
  const cliente = await conDirecciones(2);
  const direccionId = predeterminadaDe(cliente.id);
  await call('DELETE', '/carrito', cliente.token);
  const agregado = await call('POST', '/carrito/items', cliente.token, { productoId: comercio.productoId, cantidad: 1 });
  if (agregado.status !== 201) throw new Error('carrito ' + JSON.stringify(agregado));
  const respuestas = await Promise.all([
    call('POST', '/pedidos/cliente', cliente.token, { tipoEntrega: 'DOMICILIO', direccionId }),
    ...accionConcurrente(cliente, direccionId),
  ]);
  respuestas.forEach((r, i) => registrar5xx(`${etiqueta} #${i} (ronda ${ronda})`, r));
  return { cliente, direccionId, respuestas };
}

async function escenarioPedidoContraEdicion(comercio, ronda) {
  const { cliente, respuestas } = await pedidoContra(
    ronda,
    comercio,
    (c, id) => [editar(c.token, id, cuerpoNuevo())],
    'pedido contra edicion',
  );
  exigir(respuestas[0].status === 201 && respuestas[1].status === 200, `pedido contra edicion ronda ${ronda}: ${respuestas.map((r) => r.status).join(',')}`);
  if (respuestas[0].status === 201) {
    const copia = copiaDe(respuestas[0].json.data.id);
    exigir(copia === COPIA_VIEJA || copia === COPIA_NUEVA, `pedido contra edicion ronda ${ronda}: copia mezclada ${copia}`);
    const visto = respuestas[0].json.data.direccion;
    exigir(visto && visto.calle === copia.split('|')[0], `pedido contra edicion ronda ${ronda}: la respuesta no coincide con la fila (${visto && visto.calle} / ${copia})`);
    anotar(`pedido-contra-edicion: ${copia === COPIA_VIEJA ? 'copia vieja' : 'copia nueva'}`);
  }
  exigir(predeterminadas(cliente.id) === 1, `pedido contra edicion ronda ${ronda}: ${predeterminadas(cliente.id)} predeterminadas`);
}

async function escenarioPedidoContraBaja(comercio, ronda) {
  const { cliente, respuestas } = await pedidoContra(ronda, comercio, (c, id) => [baja(c.token, id)], 'pedido contra baja');
  exigir(respuestas[1].status === 200, `pedido contra baja ronda ${ronda}: la baja dio ${respuestas[1].status}`);
  exigir([201, 404].includes(respuestas[0].status), `pedido contra baja ronda ${ronda}: el pedido dio ${respuestas[0].status}`);
  if (respuestas[0].status === 201) {
    const copia = copiaDe(respuestas[0].json.data.id);
    exigir(copia === COPIA_VIEJA, `pedido contra baja ronda ${ronda}: copia incompleta ${copia}`);
    anotar('pedido-contra-baja: 201 con copia completa');
  } else {
    exigir(Number(sql(`SELECT COUNT(*) FROM pedido WHERE cliente_id = ${cliente.id};`)) === 0, `pedido contra baja ronda ${ronda}: 404 pero quedó un pedido`);
    anotar('pedido-contra-baja: 404 sin pedido');
  }
  exigir(activas(cliente.id) === 1 && predeterminadas(cliente.id) === 1, `pedido contra baja ronda ${ronda}: ${activas(cliente.id)} activas, ${predeterminadas(cliente.id)} predeterminadas`);
}

async function escenarioPedidoContraTodo(comercio, ronda) {
  const { cliente, respuestas } = await pedidoContra(
    ronda,
    comercio,
    (c, id) => [
      editar(c.token, id, cuerpoNuevo()),
      alta(c.token, 'Concurrente', { principal: true }),
      predeterminar(c.token, idsActivas(c.id).find((x) => x !== id)),
    ],
    'pedido contra todo',
  );
  exigir(respuestas[0].status === 201, `pedido contra todo ronda ${ronda}: el pedido dio ${respuestas[0].status}`);
  if (respuestas[0].status === 201) {
    const copia = copiaDe(respuestas[0].json.data.id);
    exigir(copia === COPIA_VIEJA || copia === COPIA_NUEVA, `pedido contra todo ronda ${ronda}: copia mezclada ${copia}`);
  }
  exigir(predeterminadas(cliente.id) === 1, `pedido contra todo ronda ${ronda}: ${predeterminadas(cliente.id)} predeterminadas`);
  anotar('pedido-contra-todo: ok');
}

async function main() {
  const admin = (await call('POST', '/auth/login', null, ADMIN)).json.data.token;
  const correr = (n) => !ESCENARIO || ESCENARIO.includes(n);
  const comercio = correr(5) ? await comercioConProducto(admin) : null;
  for (let ronda = 1; ronda <= ROUNDS; ronda++) {
    if (correr(1)) await escenarioCupo(ronda);
    if (correr(2)) await escenarioPredeterminadas(ronda);
    if (correr(3)) await escenarioBajaContraCambio(ronda);
    if (correr(4)) await escenarioUltimasBajas(ronda);
    if (correr(5)) {
      await escenarioPedidoContraEdicion(comercio, ronda);
      await escenarioPedidoContraBaja(comercio, ronda);
      await escenarioPedidoContraTodo(comercio, ronda);
    }
    console.log(`ronda ${ronda}: ${problemas.length === 0 ? 'ok' : `${problemas.length} problema(s) hasta ahora`}`);
  }
  console.log('Resumen de pares de respuestas:', Object.fromEntries([...resumen].sort()));
  if (problemas.length) {
    console.log('PROBLEMAS:\n' + problemas.join('\n'));
    process.exitCode = 1;
  } else {
    console.log('SIN PROBLEMAS (sin 5xx, cupo de cinco, una sola predeterminada, nunca cero activas, copia del pedido completa)');
  }
}

main().catch((e) => {
  console.error('FALLO DEL SCRIPT', e);
  process.exit(1);
});
