import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';

const B = process.env.E2E_API_BASE_URL || 'http://localhost:8080/api/v1';
const ROUNDS = Number(process.env.ROUNDS || 8);
const PEDIDOS_VOLUMEN = Number(process.env.PEDIDOS_VOLUMEN || 30000);
const REPETICIONES_VOLUMEN = Number(process.env.REPETICIONES_VOLUMEN || 20);
const OBJETIVO_P95_MS = Number(process.env.OBJETIVO_P95_MS || 300);
const ADMIN = { nombreUsuario: 'adminbajonea', password: process.env.ADMIN_PASSWORD };
const MYSQL = process.env.MYSQL_BIN || 'C:/xampp/mysql/bin/mysql.exe';
const sqlUnaVez = (q) => execFileSync(MYSQL, ['-u', 'root', '-N', '-B', 'bajonea_test', '-e', q], { maxBuffer: 64 * 1024 * 1024 }).toString().trim();
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
const clavePropia = () => `Pw${uniq()}Aa1`;
const FACTURABLES = ['EN_PREPARACION', 'EN_CAMINO', 'LISTO_PARA_RETIRAR', 'ENTREGADO', 'NO_RETIRADO'];
const LISTA_FACTURABLES = FACTURABLES.map((e) => `'${e}'`).join(',');

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
const DIAS_ZONA = ['DOMINGO', 'LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO'];
const horariosTodosLosDias = DIAS_ZONA.map((diaSemana) => ({ diaSemana, horaApertura: '00:00', horaCierre: '23:59' }));

const enUshuaia = (desplazamientoDias = 0) => new Date(Date.now() - 3 * 3600_000 + desplazamientoDias * 86_400_000);
const fechaA = (desplazamientoDias = 0) => enUshuaia(desplazamientoDias).toISOString().slice(0, 10);
const DIA_DE_HOY = () => DIAS_ZONA[enUshuaia().getUTCDay()];

let LOC;
async function resolverLocalidad() {
  const provincias = (await call('GET', '/geografia/provincias')).json.data;
  const provincia = provincias.find((p) => p.nombre.startsWith('Tierra del Fuego'));
  const localidades = (await call('GET', `/geografia/localidades?provinciaId=${encodeURIComponent(provincia.id)}`)).json.data;
  return localidades.find((l) => /r[ií]o grande/i.test(l.nombre)).id;
}

const direccion = () => ({ calle: 'Stress', numero: '1', pisoDepto: null, codigoPostal: '9420', localidadId: LOC, principal: true });

async function nuevoDueno() {
  const u = uniq();
  const email = `stresst5.${u}@bajonea.test`;
  const nombreUsuario = `se${u}`.slice(0, 20);
  const password = clavePropia();
  const r = await call('POST', '/auth/registro/comercio', null, {
    aceptaTerminos: true,
    razonSocial: `StressT5 ${u} SRL`,
    cuit: cuit(),
    condicionIva: 'RESPONSABLE_INSCRIPTO',
    tipoSociedad: 'SRL',
    domicilioFiscal: 'Av. Stress 1',
    fechaInicioActividades: '2020-01-01',
    nombre: `StressT5 ${u}`,
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
    redesSociales: [{ tipo: 'INSTAGRAM', url: `https://instagram.com/se${u}` }],
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
  const apto = await call('PUT', `/test/comercios/${d.comercioId}/apto-venta`);
  if (apto.status !== 200) throw new Error('apto-venta ' + JSON.stringify(apto));
  return d;
}

async function nuevoClienteVerificado() {
  const u = uniq();
  const email = `stresst5.cli.${u}@bajonea.test`;
  const nombreUsuario = `sf${u}`.slice(0, 20);
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
  const login = await call('POST', '/auth/login', null, { nombreUsuario, password });
  if (login.status !== 200) throw new Error('login cliente ' + JSON.stringify(login));
  return { email, nombreUsuario, password, token: login.json.data.token, id: login.json.data.usuario.id };
}

const cabecera = (comercioId) => ({ 'X-Comercio-Id': String(comercioId) });
const LOG_BACKEND = process.env.BACKEND_LOG || `${process.env.TEMP || '/tmp'}/backend-test.log`;
let categoriaId;

function nuevoRegistro() {
  const problemas = [];
  return {
    problemas,
    registrar: (etiqueta, r, permitidos) => {
      if (r.status >= 500) problemas.push(`${etiqueta}: ${r.status} ${JSON.stringify(r.json)}`);
      else if (!permitidos.includes(r.status)) problemas.push(`${etiqueta}: estado inesperado ${r.status} ${JSON.stringify(r.json)}`);
    },
  };
}

const cerca = (a, b) => Math.abs(Number(a) - Number(b)) < 0.011;
const suma = (valores) => valores.reduce((s, x) => s + x, 0);

function inconsistencias(etiqueta, d) {
  const problemas = [];
  const t = d.totales;
  if (suma(d.periodos.map((p) => p.pedidos)) !== t.pedidos) problemas.push(`${etiqueta}: la suma de periodos.pedidos no es totales.pedidos`);
  if (suma(d.periodos.map((p) => p.facturados)) !== t.facturados) problemas.push(`${etiqueta}: la suma de periodos.facturados no es totales.facturados`);
  if (!cerca(suma(d.periodos.map((p) => Number(p.vendido))), t.vendido)) problemas.push(`${etiqueta}: la suma de periodos.vendido no es totales.vendido`);
  if (!cerca(Number(t.neto), Number(t.vendido) - Number(t.comision))) problemas.push(`${etiqueta}: neto distinto de vendido menos comision`);
  if (suma(Object.values(t.resultados)) !== t.pedidos) problemas.push(`${etiqueta}: la suma de resultados no es totales.pedidos`);
  if (t.facturados > t.pedidos) problemas.push(`${etiqueta}: mas facturados que pedidos`);
  for (const p of d.periodos) {
    if (suma(Object.values(p.resultados)) !== p.pedidos) problemas.push(`${etiqueta}: un periodo tiene resultados que no suman sus pedidos`);
    if (p.facturados === 0 && p.ticketPromedio !== null) problemas.push(`${etiqueta}: ticket distinto de nulo sin facturados`);
    if (p.facturados > 0 && !cerca(Number(p.ticketPromedio), Number(p.vendido) / p.facturados)) problemas.push(`${etiqueta}: ticket mal calculado`);
  }
  return problemas;
}

const estadisticas = (token, comercioId, desde, hasta, agrupar) =>
  call('GET', `/comercios/estadisticas?desde=${desde}&hasta=${hasta}&agrupar=${agrupar}`, token, undefined, cabecera(comercioId));

function sqlDelComercio(comercioId, desde, hasta) {
  const [pedidos, facturados, vendido, comision] = sql(
    `SELECT COUNT(*), SUM(estado IN (${LISTA_FACTURABLES})), COALESCE(SUM(IF(estado IN (${LISTA_FACTURABLES}), subtotal, 0)), 0), `
      + `COALESCE(SUM(IF(estado IN (${LISTA_FACTURABLES}), cargo_servicio_comercio, 0)), 0) FROM pedido WHERE comercio_id = ${comercioId} `
      + `AND ((turno_fecha BETWEEN '${desde}' AND '${hasta}') OR (turno_fecha IS NULL AND fecha_pago_confirmado >= '${desde} 00:00:00' `
      + `AND fecha_pago_confirmado < DATE_ADD('${hasta}', INTERVAL 1 DAY)));`,
  ).split('\t');
  return { pedidos: Number(pedidos), facturados: Number(facturados || 0), vendido: Number(vendido), comision: Number(comision) };
}

function contraLaBase(etiqueta, d, comercioId, desde, hasta) {
  const e = sqlDelComercio(comercioId, desde, hasta);
  const t = d.totales;
  const problemas = [];
  if (t.pedidos !== e.pedidos) problemas.push(`${etiqueta}: la API dice ${t.pedidos} pedidos y la base ${e.pedidos}`);
  if (t.facturados !== e.facturados) problemas.push(`${etiqueta}: la API dice ${t.facturados} facturados y la base ${e.facturados}`);
  if (!cerca(t.vendido, e.vendido)) problemas.push(`${etiqueta}: la API dice ${t.vendido} vendido y la base ${e.vendido}`);
  if (!cerca(t.comision, e.comision)) problemas.push(`${etiqueta}: la API dice ${t.comision} de comision y la base ${e.comision}`);
  return problemas;
}

function pedidosSql(comercioId, clienteId, cantidad, estado = 'PENDIENTE_CONFIRMACION_COMERCIO') {
  const horarioId = sql(`SELECT id FROM horario WHERE comercio_id = ${comercioId} AND dia_semana = '${DIA_DE_HOY()}' AND vigente_hasta IS NULL ORDER BY id LIMIT 1;`);
  const antes = Number(sql('SELECT COALESCE(MAX(id), 0) FROM pedido;'));
  sql(`INSERT INTO pedido (cliente_id, comercio_id, modalidad_entrega, estado, pago_estado, subtotal, cargo_servicio_cliente, cargo_servicio_comercio, total, fecha_creacion, fecha_pago_confirmado, turno_fecha, turno_horario_id) `
    + `SELECT ${clienteId}, ${comercioId}, 'RETIRO', '${estado}', 'PAGADO', 1500, 200, 15, 1700, NOW(), NOW(), '${fechaA(0)}', ${horarioId} FROM seq_1_to_${cantidad};`);
  const ids = sql(`SELECT id FROM pedido WHERE comercio_id = ${comercioId} AND id > ${antes} ORDER BY id;`).split('\n').filter(Boolean).map(Number);
  sql(`INSERT INTO historial_estado_pedido (pedido_id, estado, actor_rol, fecha_hora) SELECT id, 'PENDIENTE_CONFIRMACION_COMERCIO', 'SISTEMA', NOW() FROM pedido WHERE comercio_id = ${comercioId} AND id > ${antes};`);
  return ids;
}

async function escenario1(admin) {
  console.log(`--- (1) lecturas de estadisticas mientras el Dueño acepta y rechaza pedidos (${ROUNDS} rondas) ---`);
  const dueno = await duenoAprobado(admin);
  const comprador = await nuevoClienteVerificado();
  const { problemas, registrar } = nuevoRegistro();
  const resumen = {};
  const desde = fechaA(-6);
  const hasta = fechaA(0);
  for (let ronda = 1; ronda <= ROUNDS; ronda += 1) {
    const ids = pedidosSql(dueno.comercioId, comprador.id, 20);
    const tareas = [];
    ids.forEach((id, i) => {
      if (i < 14) tareas.push(call('PUT', `/pedidos/comercio/${id}/aceptar`, dueno.token, {}, cabecera(dueno.comercioId)).then((r) => registrar(`ronda ${ronda}: aceptar ${id}`, r, [200])));
      else tareas.push(call('PUT', `/pedidos/comercio/${id}/rechazar`, dueno.token, { motivo: 'SIN_STOCK' }, cabecera(dueno.comercioId)).then((r) => registrar(`ronda ${ronda}: rechazar ${id}`, r, [200])));
    });
    for (let i = 0; i < 30; i += 1) {
      const agrupar = i % 2 === 0 ? 'DIA' : 'TURNO';
      tareas.push(estadisticas(dueno.token, dueno.comercioId, desde, hasta, agrupar).then((r) => {
        registrar(`ronda ${ronda}: leer ${agrupar}`, r, [200]);
        resumen[`lecturas ${agrupar}`] = (resumen[`lecturas ${agrupar}`] ?? 0) + 1;
        if (r.status === 200) problemas.push(...inconsistencias(`ronda ${ronda}: lectura ${agrupar}`, r.json.data));
      }));
    }
    await Promise.all(tareas);
    for (const agrupar of ['DIA', 'TURNO']) {
      const r = await estadisticas(dueno.token, dueno.comercioId, desde, hasta, agrupar);
      registrar(`ronda ${ronda}: lectura final ${agrupar}`, r, [200]);
      if (r.status === 200) {
        problemas.push(...inconsistencias(`ronda ${ronda}: final ${agrupar}`, r.json.data));
        problemas.push(...contraLaBase(`ronda ${ronda}: final ${agrupar}`, r.json.data, dueno.comercioId, desde, hasta));
      }
    }
  }
  console.log('Resumen (1):', JSON.stringify(resumen));
  return problemas;
}

async function escenario2(admin) {
  console.log(`--- (2) dos Dueños leyendo a la vez: cada uno ve solo lo suyo (${ROUNDS} rondas) ---`);
  const [uno, otro] = [await duenoAprobado(admin), await duenoAprobado(admin)];
  const comprador = await nuevoClienteVerificado();
  const { problemas, registrar } = nuevoRegistro();
  const desde = fechaA(-6);
  const hasta = fechaA(0);
  for (let ronda = 1; ronda <= ROUNDS; ronda += 1) {
    pedidosSql(uno.comercioId, comprador.id, 7, 'ENTREGADO');
    pedidosSql(otro.comercioId, comprador.id, 3, 'RECHAZADO');
    const tareas = [];
    for (let i = 0; i < 20; i += 1) {
      const agrupar = i % 2 === 0 ? 'DIA' : 'TURNO';
      tareas.push(estadisticas(uno.token, uno.comercioId, desde, hasta, agrupar).then((r) => registrar(`ronda ${ronda}: uno`, r, [200])));
      tareas.push(estadisticas(otro.token, otro.comercioId, desde, hasta, agrupar).then((r) => registrar(`ronda ${ronda}: otro`, r, [200])));
      tareas.push(estadisticas(uno.token, otro.comercioId, desde, hasta, agrupar).then((r) => registrar(`ronda ${ronda}: cruzado`, r, [404])));
    }
    await Promise.all(tareas);
    const delUno = await estadisticas(uno.token, uno.comercioId, desde, hasta, 'DIA');
    const delOtro = await estadisticas(otro.token, otro.comercioId, desde, hasta, 'DIA');
    if (delUno.status === 200) problemas.push(...contraLaBase(`ronda ${ronda}: uno`, delUno.json.data, uno.comercioId, desde, hasta));
    if (delOtro.status === 200) problemas.push(...contraLaBase(`ronda ${ronda}: otro`, delOtro.json.data, otro.comercioId, desde, hasta));
    if (delUno.status === 200 && delUno.json.data.totales.resultados.RECHAZADO !== 0) problemas.push(`ronda ${ronda}: el Dueño uno ve rechazados del otro`);
    if (delOtro.status === 200 && delOtro.json.data.totales.resultados.ENTREGADO !== 0) problemas.push(`ronda ${ronda}: el Dueño otro ve entregados del uno`);
  }
  return problemas;
}

const version = (n) => DIAS_ZONA.map((diaSemana) => ({ diaSemana, horaApertura: `0${8 + (n % 4)}:00`.slice(-5), horaCierre: `${14 + (n % 4)}:00` }));

async function escenario3(admin) {
  console.log(`--- (3) lecturas mientras entran pagos y se editan los horarios (${ROUNDS} rondas) ---`);
  const dueno = await duenoAprobado(admin);
  const comprador = await nuevoClienteVerificado();
  const producto = await call('POST', '/productos', dueno.token, { nombre: `Prod T5 ${uniq()}`, precio: 10000, categoriaId }, cabecera(dueno.comercioId));
  if (producto.status !== 201) throw new Error('producto ' + JSON.stringify(producto));
  const { problemas, registrar } = nuevoRegistro();
  const desde = fechaA(-6);
  const hasta = fechaA(0);
  for (let ronda = 1; ronda <= ROUNDS; ronda += 1) {
    const pedidos = [];
    for (let i = 0; i < 4; i += 1) {
      await call('DELETE', '/carrito', comprador.token);
      const item = await call('POST', '/carrito/items', comprador.token, { productoId: producto.json.data.id, cantidad: 1 });
      registrar(`ronda ${ronda}: agregar`, item, [201]);
      const pedido = await call('POST', '/pedidos/cliente', comprador.token, { tipoEntrega: 'RETIRO', direccionId: null });
      registrar(`ronda ${ronda}: pedido`, pedido, [201]);
      if (pedido.status === 201) pedidos.push(pedido.json.data.id);
    }
    const tareas = pedidos.map((id) => call('PUT', `/test/pedidos/${id}/pago-aprobado`).then((r) => registrar(`ronda ${ronda}: pago ${id}`, r, [200])));
    tareas.push(call('PUT', '/comercios/perfil/horarios', dueno.token, { horarios: version(ronda) }, cabecera(dueno.comercioId))
      .then((r) => registrar(`ronda ${ronda}: editar horarios`, r, [200, 409])));
    for (let i = 0; i < 24; i += 1) {
      const agrupar = i % 2 === 0 ? 'DIA' : 'TURNO';
      tareas.push(estadisticas(dueno.token, dueno.comercioId, desde, hasta, agrupar).then((r) => {
        registrar(`ronda ${ronda}: leer ${agrupar}`, r, [200]);
        if (r.status === 200) problemas.push(...inconsistencias(`ronda ${ronda}: lectura ${agrupar}`, r.json.data));
      }));
    }
    await Promise.all(tareas);
    const final = await estadisticas(dueno.token, dueno.comercioId, desde, hasta, 'TURNO');
    registrar(`ronda ${ronda}: final`, final, [200]);
    if (final.status === 200) {
      problemas.push(...contraLaBase(`ronda ${ronda}: final`, final.json.data, dueno.comercioId, desde, hasta));
      const resumenTurno = await call('GET', '/pedidos/comercio/resumen-turno', dueno.token, undefined, cabecera(dueno.comercioId));
      const hoy = final.json.data.periodos.filter((p) => p.fecha === hasta).reduce((s, p) => s + Number(p.vendido), 0);
      if (resumenTurno.status === 200 && resumenTurno.json.data.estado === 'EN_CURSO' && !cerca(resumenTurno.json.data.vendido, hoy)) {
        problemas.push(`ronda ${ronda}: el panel dice ${resumenTurno.json.data.vendido} vendido y las estadisticas ${hoy}`);
      }
    }
  }
  return problemas;
}

function percentil(valores, p) {
  const ordenados = [...valores].sort((a, b) => a - b);
  return ordenados[Math.min(ordenados.length - 1, Math.ceil((p / 100) * ordenados.length) - 1)];
}

async function escenario4(admin) {
  console.log(`--- (4) volumen: ${PEDIDOS_VOLUMEN} pedidos en un solo comercio, ${REPETICIONES_VOLUMEN} repeticiones por combinacion ---`);
  const problemas = [];
  const dueno = await duenoAprobado(admin);
  const comprador = await nuevoClienteVerificado();
  const comercioId = dueno.comercioId;
  try {
    sql(`DELETE FROM horario WHERE comercio_id = ${comercioId};`);
    sql(`INSERT INTO horario (comercio_id, dia_semana, hora_apertura, hora_cierre) VALUES (${comercioId},'LUNES','12:00:00','15:00:00'),(${comercioId},'LUNES','20:00:00','23:00:00');`);
    const h1 = Number(sql(`SELECT MIN(id) FROM horario WHERE comercio_id = ${comercioId};`));
    const h2 = Number(sql(`SELECT MAX(id) FROM horario WHERE comercio_id = ${comercioId};`));
    sql(`INSERT INTO pedido (cliente_id, comercio_id, modalidad_entrega, estado, pago_estado, subtotal, cargo_servicio_cliente, cargo_servicio_comercio, total, fecha_creacion, fecha_pago_confirmado, turno_fecha, turno_horario_id) `
      + `SELECT ${comprador.id}, ${comercioId}, 'RETIRO', `
      + `ELT(1 + ((s.seq DIV 7) MOD 20), 'ENTREGADO','ENTREGADO','ENTREGADO','ENTREGADO','ENTREGADO','ENTREGADO','ENTREGADO','ENTREGADO','ENTREGADO','ENTREGADO','RECHAZADO','RECHAZADO','NO_RETIRADO','CANCELADO','ANULADO','EXPIRADO','EN_PREPARACION','LISTO_PARA_RETIRAR','CANCELADO_POR_SISTEMA','ENTREGADO'), `
      + `'PAGADO', 1000 + (s.seq MOD 37) * 100, 200, 10 + (s.seq MOD 37), 1200 + (s.seq MOD 37) * 100, `
      + `TIMESTAMP(CURDATE() - INTERVAL (s.seq MOD 119) DAY, IF((s.seq DIV 3) MOD 2 = 0, '13:00:00', '21:00:00')), `
      + `TIMESTAMP(CURDATE() - INTERVAL (s.seq MOD 119) DAY, IF((s.seq DIV 3) MOD 2 = 0, '13:00:00', '21:00:00')), `
      + `IF(s.seq MOD 25 = 0, NULL, CURDATE() - INTERVAL (s.seq MOD 119) DAY), IF(s.seq MOD 25 = 0, NULL, IF((s.seq DIV 3) MOD 2 = 0, ${h1}, ${h2})) `
      + `FROM seq_1_to_${PEDIDOS_VOLUMEN} s;`);
    sql(`INSERT INTO pedido (cliente_id, comercio_id, modalidad_entrega, estado, pago_estado, subtotal, cargo_servicio_cliente, cargo_servicio_comercio, total, fecha_creacion) `
      + `SELECT ${comprador.id}, ${comercioId}, 'RETIRO', 'CANCELADO_POR_SISTEMA', 'PENDIENTE', 1000, 200, 10, 1200, NOW() - INTERVAL s.seq HOUR FROM seq_1_to_900 s;`);
    sql('ANALYZE TABLE pedido;');
    const total = Number(sql(`SELECT COUNT(*) FROM pedido WHERE comercio_id = ${comercioId};`));
    console.log(`Datos sinteticos: ${total} filas del comercio ${comercioId}`);

    for (const dias of [7, 30, 92]) {
      const desdeSql = fechaA(-(dias - 1));
      const consultaSql = (hint) => `SELECT turno_fecha, turno_horario_id, estado, COUNT(*), SUM(subtotal), SUM(cargo_servicio_comercio) FROM pedido ${hint} WHERE comercio_id = ${comercioId} AND turno_fecha BETWEEN '${desdeSql}' AND '${fechaA(0)}' GROUP BY turno_fecha, turno_horario_id, estado`;
      for (const [etiqueta, hint] of [['plan elegido', ''], ['forzando idx_pedido_turno', 'FORCE INDEX (idx_pedido_turno)']]) {
        const plan = sql(`EXPLAIN ${consultaSql(hint)};`).split('	');
        const tiempos = [];
        for (let i = 0; i < 5; i += 1) {
          tiempos.push(Number(sql(`SET @t = NOW(6); SELECT COUNT(*) INTO @x FROM (${consultaSql(hint)}) q; SELECT TIMESTAMPDIFF(MICROSECOND, @t, NOW(6)) / 1000;`)));
        }
        console.log(`Base, ${dias} dias, ${etiqueta}: tipo=${plan[3]} indice=${plan[5]} filas estimadas=${plan[8]} tiempo ms=${tiempos.map((t) => t.toFixed(1)).join('/')}`);
        if (!hint && (plan[3] === 'ALL' || plan[5] === 'NULL')) problemas.push(`la consulta de ${dias} dias recorre toda la tabla (tipo ${plan[3]}, indice ${plan[5]})`);
      }
    }

    const filas = [];
    for (const dias of [7, 30, 92]) {
      for (const agrupar of ['DIA', 'TURNO']) {
        const tiempos = [];
        let ultimo = null;
        for (let i = 0; i < REPETICIONES_VOLUMEN; i += 1) {
          const t0 = Date.now();
          const r = await estadisticas(dueno.token, comercioId, fechaA(-(dias - 1)), fechaA(0), agrupar);
          tiempos.push(Date.now() - t0);
          if (r.status !== 200) {
            problemas.push(`volumen ${dias} dias ${agrupar}: ${r.status} ${JSON.stringify(r.json)}`);
            break;
          }
          ultimo = r.json.data;
        }
        if (ultimo) {
          problemas.push(...inconsistencias(`volumen ${dias} dias ${agrupar}`, ultimo));
          problemas.push(...contraLaBase(`volumen ${dias} dias ${agrupar}`, ultimo, comercioId, fechaA(-(dias - 1)), fechaA(0)));
        }
        filas.push({ dias, agrupar, p50: percentil(tiempos, 50), p95: percentil(tiempos, 95), max: Math.max(...tiempos) });
      }
    }
    console.log('Tiempos por HTTP (ms): ' + filas.map((f) => `${f.dias}d ${f.agrupar} p50=${f.p50} p95=${f.p95} max=${f.max}`).join(' | '));
    const peor = filas.find((f) => f.dias === 92 && f.agrupar === 'TURNO');
    if (peor && peor.p95 > OBJETIVO_P95_MS) problemas.push(`92 dias por turno: p95 ${peor.p95} ms supera el objetivo de ${OBJETIVO_P95_MS} ms`);
  } finally {
    sql(`DELETE FROM pedido WHERE comercio_id = ${comercioId};`);
    sql(`DELETE FROM horario WHERE comercio_id = ${comercioId};`);
    const restos = Number(sql(`SELECT COUNT(*) FROM pedido WHERE comercio_id = ${comercioId};`));
    console.log(`Datos sinteticos borrados (restan ${restos} pedidos)`);
  }
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
  const categoria = await call('POST', '/categorias', admin, { nombre: `StressT5 ${uniq()}` });
  if (categoria.status !== 201) throw new Error('categoria ' + JSON.stringify(categoria));
  categoriaId = categoria.json.data.id;
  const solo = process.env.ESCENARIO;
  const escenarios = [escenario1, escenario2, escenario3, escenario4];
  const todos = [];
  for (let i = 0; i < escenarios.length; i++) {
    if ((!solo && i < 3) || solo === String(i + 1)) todos.push(...(await escenarios[i](admin)));
  }
  todos.push(...revisarElLog(inicioLog));
  console.log(todos.length ? 'PROBLEMAS:\n' + todos.join('\n') : 'SIN PROBLEMAS (sin 5xx, sin inconsistencias, sin Deadlock ni Lock wait timeout en el log)');
  if (todos.length) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
