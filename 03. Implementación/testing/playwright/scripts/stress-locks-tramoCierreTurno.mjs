import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';

const B = process.env.E2E_API_BASE_URL || 'http://localhost:8080/api/v1';
const ROUNDS = Number(process.env.ROUNDS || 8);
const COMERCIOS_VOLUMEN = Number(process.env.COMERCIOS_VOLUMEN || 2000);
const PEDIDOS_VOLUMEN = Number(process.env.PEDIDOS_VOLUMEN || 30000);
const DUENOS_VOLUMEN = Number(process.env.DUENOS_VOLUMEN || 20);
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
const DIAS_ZONA = ['DOMINGO', 'LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO'];
const horariosTodosLosDias = DIAS_ZONA.map((diaSemana) => ({ diaSemana, horaApertura: '00:00', horaCierre: '23:59' }));

const MINUTO = 60_000;
const enUshuaia = (desplazamientoMin = 0) => new Date(Date.now() - 3 * 3600_000 + desplazamientoMin * MINUTO);
const HOY = () => enUshuaia().toISOString().slice(0, 10);
const DIA_DE_HOY = () => DIAS_ZONA[enUshuaia().getUTCDay()];
const hoyA = (hora) => `${HOY()}T${hora.length === 5 ? `${hora}:00` : hora}`;
const sumarMinutos = (iso, minutos) => new Date(Date.parse(`${iso}Z`) + minutos * MINUTO).toISOString().slice(0, 19);
const AHORA = () => hoyA('15:30');

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
  const email = `stresst4.${u}@bajonea.test`;
  const nombreUsuario = `sh${u}`.slice(0, 20);
  const password = clavePropia();
  const r = await call('POST', '/auth/registro/comercio', null, {
    aceptaTerminos: true,
    razonSocial: `StressT4 ${u} SRL`,
    cuit: cuit(),
    condicionIva: 'RESPONSABLE_INSCRIPTO',
    tipoSociedad: 'SRL',
    domicilioFiscal: 'Av. Stress 1',
    fechaInicioActividades: '2020-01-01',
    nombre: `StressT4 ${u}`,
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
    redesSociales: [{ tipo: 'INSTAGRAM', url: `https://instagram.com/sh${u}` }],
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
  const email = `stresst4.cli.${u}@bajonea.test`;
  const nombreUsuario = `si${u}`.slice(0, 20);
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

const clonar = async (comercioId, estado = 'APTO_VENTA') => {
  const r = await call('POST', `/test/comercios/${comercioId}/clonar?nombre=${encodeURIComponent(`Clon ${uniq()}`)}&estado=${estado}`);
  if (r.status !== 201) throw new Error('clonar ' + JSON.stringify(r));
  return r.json.data;
};

const cabecera = (comercioId) => ({ 'X-Comercio-Id': String(comercioId) });
const LOG_BACKEND = process.env.BACKEND_LOG || `${process.env.TEMP || '/tmp'}/backend-test.log`;
let categoriaId;

const horariosSql = (comercioId, filas) => {
  sql(`DELETE FROM horario WHERE comercio_id = ${comercioId};`);
  for (const fila of filas) {
    sql(`INSERT INTO horario (comercio_id, dia_semana, hora_apertura, hora_cierre) VALUES (${comercioId}, '${fila.dia}', '${fila.apertura}', '${fila.cierre}');`);
  }
};
const almuerzo = () => [{ dia: DIA_DE_HOY(), apertura: '12:00', cierre: '15:00' }];

const correr = (ahora) => call('POST', `/test/jobs/cierre-turnos?ahora=${encodeURIComponent(ahora)}`);
const fallas = (cantidad) => call('PUT', `/test/email-resumen-turno/fallas?cantidad=${cantidad}`);
const cierresDe = (comercioId) => sql(`SELECT id, email_estado, email_intentos, cantidad_pedidos, vendido, comision, neto, pendientes_al_cierre FROM cierre_turno WHERE comercio_id = ${comercioId} ORDER BY id;`)
  .split('\n').filter(Boolean).map((linea) => {
    const [id, estado, intentos, cantidad, vendido, comision, neto, pendientes] = linea.split('\t');
    return { id: Number(id), estado, intentos: Number(intentos), cantidad: Number(cantidad), vendido: Number(vendido), comision: Number(comision), neto: Number(neto), pendientes: Number(pendientes) };
  });

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
    },
  };
}

async function barrer(ahora) {
  for (let vuelta = 0; vuelta < 6; vuelta += 1) {
    const r = await correr(ahora);
    if (r.status !== 200) throw new Error('barrido ' + JSON.stringify(r));
    const d = r.json.data;
    if (d.cierresCreados === 0 && d.mailsEnviados === 0 && d.cierresConFalla === 0) return;
  }
}

async function comercioConProducto(admin) {
  const d = await duenoAprobado(admin);
  const producto = await call('POST', '/productos', d.token, { nombre: `Producto ${uniq()}`, precio: 1500, categoriaId }, cabecera(d.comercioId));
  if (producto.status !== 201) throw new Error('producto ' + JSON.stringify(producto));
  d.productoId = producto.json.data.id;
  return d;
}

async function pedidoPagable(comprador, productoId) {
  await call('DELETE', '/carrito', comprador.token);
  const agregado = await call('POST', '/carrito/items', comprador.token, { productoId, cantidad: 1 });
  if (agregado.status !== 201) throw new Error('carrito ' + JSON.stringify(agregado));
  const pedido = await call('POST', '/pedidos/cliente', comprador.token, { tipoEntrega: 'RETIRO', direccionId: null });
  if (pedido.status !== 201) throw new Error('pedido ' + JSON.stringify(pedido));
  const id = pedido.json.data.id;
  sql(`UPDATE pedido SET fecha_creacion = '${HOY()} 23:30:00' WHERE id = ${id};`);
  return id;
}

const pagar = (pedidoId, ahora) => call('PUT', `/test/pedidos/${pedidoId}/pago-aprobado?registrarPago=true${ahora ? `&ahora=${encodeURIComponent(ahora)}` : ''}`);

async function escenario1(admin) {
  console.log('--- (1) varias corridas simultaneas del cierre sobre 20 comercios con turno terminado ---');
  const { problemas, registrar } = nuevoRegistro();
  const resumen = {};
  const ahora = AHORA();
  for (let ronda = 1; ronda <= ROUNDS; ronda++) {
    await barrer(ahora);
    const duenos = [];
    const comercios = [];
    for (let i = 0; i < 4; i++) {
      const d = await duenoAprobado(admin);
      duenos.push(d);
      comercios.push(d.comercioId);
      for (let j = 0; j < 4; j++) comercios.push(await clonar(d.comercioId, 'APTO_VENTA'));
    }
    for (const comercioId of comercios) horariosSql(comercioId, almuerzo());
    const ultimoId = Number(sql('SELECT IFNULL(MAX(id), 0) FROM cierre_turno;'));

    const resultados = await Promise.all(Array.from({ length: 6 }, () => correr(ahora)));
    let creados = 0;
    let enviados = 0;
    for (const r of resultados) {
      contar(resumen, `corrida:${r.status}`);
      registrar(`ronda ${ronda} corrida`, r, [200]);
      creados += r.json?.data?.cierresCreados ?? 0;
      enviados += r.json?.data?.cierresEnviados ?? 0;
    }
    const filasNuevas = Number(sql(`SELECT COUNT(*) FROM cierre_turno WHERE id > ${ultimoId};`));
    if (creados !== filasNuevas) problemas.push(`ronda ${ronda}: las corridas informan ${creados} cierres creados y hay ${filasNuevas} filas nuevas`);
    for (const comercioId of comercios) {
      const filas = cierresDe(comercioId);
      if (filas.length !== 1) problemas.push(`ronda ${ronda}: el comercio ${comercioId} tiene ${filas.length} cierres`);
      else if (filas[0].estado !== 'ENVIADO') problemas.push(`ronda ${ronda}: el cierre del comercio ${comercioId} quedo ${filas[0].estado}`);
    }
    const enviadasNuevas = Number(sql(`SELECT COUNT(*) FROM cierre_turno WHERE id > ${ultimoId} AND email_estado = 'ENVIADO';`));
    if (enviados !== enviadasNuevas) problemas.push(`ronda ${ronda}: las corridas informan ${enviados} cierres enviados y hay ${enviadasNuevas} filas ENVIADO`);
    const huerfanos = Number(sql(`SELECT COUNT(*) FROM cierre_turno WHERE email_estado = 'ENVIANDO';`));
    if (huerfanos !== 0) problemas.push(`ronda ${ronda}: quedaron ${huerfanos} cierres ENVIANDO`);
  }
  console.log('Resumen (1):', resumir(resumen));
  return problemas;
}

async function escenario2(admin) {
  console.log('--- (2) el cierre contra ediciones de horarios, pagos, suspension y bloqueo de cuenta ---');
  const { problemas, registrar } = nuevoRegistro();
  const resumen = {};
  const ahora = AHORA();
  const comprador = await nuevoClienteVerificado();
  for (let ronda = 1; ronda <= ROUNDS; ronda++) {
    const conPagos = ronda % 2 === 1;
    const d = await comercioConProducto(admin);
    const pedidos = [];
    for (let i = 0; i < 4; i++) pedidos.push(await pedidoPagable(comprador, d.productoId));
    horariosSql(d.comercioId, almuerzo());
    for (const pedidoId of pedidos.slice(0, 2)) await pagar(pedidoId, hoyA('13:00'));
    sql(`UPDATE pedido SET estado = 'ENTREGADO' WHERE id = ${pedidos[0]};`);
    await barrer(ahora);

    const tareas = [];
    for (let i = 0; i < 3; i++) tareas.push(correr(ahora).then((r) => ({ tipo: 'corrida', r })));
    tareas.push(call('PUT', '/comercios/perfil/horarios', d.token,
      { horarios: [{ diaSemana: DIA_DE_HOY(), horaApertura: '13:00', horaCierre: '16:00' }] }, cabecera(d.comercioId)).then((r) => ({ tipo: 'horarios', r })));
    if (conPagos) {
      for (const pedidoId of pedidos.slice(2)) tareas.push(pagar(pedidoId, hoyA('14:00')).then((r) => ({ tipo: 'pago', r })));
      tareas.push(call('PUT', `/administrador/comercios/${d.comercioId}/suspender`, admin, { motivo: 'Suspension de la prueba de estres T4' }).then((r) => ({ tipo: 'suspension', r })));
      for (let i = 0; i < 3; i++) {
        tareas.push(call('POST', '/auth/login', null, { nombreUsuario: d.nombreUsuario, password: 'ClaveIncorrecta1' }).then((r) => ({ tipo: 'login-fallido', r })));
      }
    }
    const resultados = await Promise.all(tareas);
    for (const { tipo, r } of resultados) {
      contar(resumen, `${tipo}:${r.status}`);
      const permitidos = tipo === 'corrida' ? [200] : tipo === 'horarios' ? [200, 404, 409] : tipo === 'pago' ? [200, 409] : tipo === 'suspension' ? [200, 409] : [200, 401, 409];
      registrar(`ronda ${ronda} ${tipo}`, r, permitidos);
    }
    await correr(ahora);

    const filas = cierresDe(d.comercioId);
    if (filas.length !== 1) {
      problemas.push(`ronda ${ronda}: el comercio ${d.comercioId} tiene ${filas.length} cierres`);
      continue;
    }
    const fila = filas[0];
    if (!['ENVIADO', 'OMITIDO'].includes(fila.estado)) problemas.push(`ronda ${ronda}: el cierre quedo ${fila.estado}`);
    if (Math.abs(fila.neto - (fila.vendido - fila.comision)) > 0.001) problemas.push(`ronda ${ronda}: neto ${fila.neto} distinto de vendido - comision`);
    if (!conPagos) {
      const esperado = sql(`SELECT COUNT(*), IFNULL(SUM(CASE WHEN estado IN ('EN_PREPARACION','EN_CAMINO','LISTO_PARA_RETIRAR','ENTREGADO','NO_RETIRADO') THEN subtotal END), 0), `
        + `IFNULL(SUM(CASE WHEN estado IN ('EN_PREPARACION','EN_CAMINO','LISTO_PARA_RETIRAR','ENTREGADO','NO_RETIRADO') THEN cargo_servicio_comercio END), 0) `
        + `FROM pedido WHERE comercio_id = ${d.comercioId} AND turno_fecha = '${HOY()}';`).split('\t').map(Number);
      const pendientes = Number(sql(`SELECT COUNT(*) FROM pedido WHERE comercio_id = ${d.comercioId} AND estado = 'PENDIENTE_CONFIRMACION_COMERCIO';`));
      if (fila.cantidad !== esperado[0] || Math.abs(fila.vendido - esperado[1]) > 0.001 || Math.abs(fila.comision - esperado[2]) > 0.001 || fila.pendientes !== pendientes) {
        problemas.push(`ronda ${ronda}: la foto dice ${JSON.stringify(fila)} y SQL calcula ${JSON.stringify({ esperado, pendientes })}`);
      }
    } else if (fila.cantidad < 2 || fila.cantidad > 4) {
      problemas.push(`ronda ${ronda}: cantidad de pedidos ${fila.cantidad} fuera de lo posible (2 a 4)`);
    }
  }
  console.log('Resumen (2):', resumir(resumen));
  return problemas;
}

async function escenario3(admin) {
  console.log('--- (3) fallas intermitentes del envio: ningun cierre se pierde ni queda enviando ---');
  const { problemas, registrar } = nuevoRegistro();
  const resumen = {};
  const ahora = AHORA();
  for (let ronda = 1; ronda <= ROUNDS; ronda++) {
    await barrer(ahora);
    const ultimoId = Number(sql('SELECT IFNULL(MAX(id), 0) FROM cierre_turno;'));
    const comercios = [];
    for (let i = 0; i < 3; i++) {
      const d = await duenoAprobado(admin);
      comercios.push(d.comercioId);
      comercios.push(await clonar(d.comercioId, 'APTO_VENTA'));
    }
    for (const comercioId of comercios) horariosSql(comercioId, almuerzo());
    const cantidadFallas = 1 + aleatorio(4);
    const f = await fallas(cantidadFallas);
    registrar(`ronda ${ronda} fallas`, f, [200]);
    try {
      let momento = ahora;
      for (const retroceso of [0, 10, 30, 60, 60]) {
        momento = sumarMinutos(momento, retroceso);
        const resultados = await Promise.all(Array.from({ length: 3 }, () => correr(momento)));
        for (const r of resultados) {
          contar(resumen, `corrida:${r.status}`);
          registrar(`ronda ${ronda} corrida`, r, [200]);
        }
      }
    } finally {
      await fallas(0);
    }
    for (const comercioId of comercios) {
      const filas = cierresDe(comercioId);
      if (filas.length !== 1) problemas.push(`ronda ${ronda}: el comercio ${comercioId} tiene ${filas.length} cierres`);
      else if (filas[0].estado !== 'ENVIADO') problemas.push(`ronda ${ronda}: el cierre del comercio ${comercioId} quedo ${filas[0].estado} tras ${filas[0].intentos} intentos (fallas simuladas ${cantidadFallas})`);
    }
    const huerfanos = Number(sql(`SELECT COUNT(*) FROM cierre_turno WHERE email_estado = 'ENVIANDO';`));
    if (huerfanos !== 0) problemas.push(`ronda ${ronda}: quedaron ${huerfanos} cierres ENVIANDO`);
    const sobreintentos = Number(sql(`SELECT COUNT(*) FROM cierre_turno WHERE id > ${ultimoId} AND email_intentos > 4;`));
    if (sobreintentos !== 0) problemas.push(`ronda ${ronda}: hay ${sobreintentos} cierres con mas de 4 intentos`);
  }
  console.log('Resumen (3):', resumir(resumen));
  return problemas;
}

async function escenario4(admin) {
  console.log(`--- (4) volumen: ${COMERCIOS_VOLUMEN} comercios sinteticos, ${PEDIDOS_VOLUMEN} pedidos, ${DUENOS_VOLUMEN} duenos ---`);
  const problemas = [];
  const marca = `VolT4 ${uniq()}`;
  const duenos = [];
  for (let i = 0; i < DUENOS_VOLUMEN; i++) duenos.push(await duenoAprobado(admin));
  const comprador = await nuevoClienteVerificado();
  const base = duenos[0].comercioId;
  const porDueno = Math.ceil(COMERCIOS_VOLUMEN / DUENOS_VOLUMEN);
  const pedidosPorComercio = Math.max(1, Math.round(PEDIDOS_VOLUMEN / COMERCIOS_VOLUMEN));
  const dia = DIA_DE_HOY();
  const ahora = AHORA();
  try {
    await barrer(ahora);
    for (let i = 0; i < duenos.length; i++) {
      sql(`INSERT INTO comercio (dueno_id, nombre, foto_perfil_url, telefono, tipo_comercio, acepta_delivery, acepta_retiro, estado) `
        + `SELECT ${duenos[i].duenoId}, CONCAT('${marca} ', ${i}, '-', seq), foto_perfil_url, telefono, tipo_comercio, acepta_delivery, acepta_retiro, 'APTO_VENTA' `
        + `FROM comercio, seq_1_to_${porDueno} WHERE id = ${base};`);
    }
    const dias = DIAS_ZONA.map((nombre) => `'${nombre}'`).join(',');
    sql(`INSERT INTO horario (comercio_id, dia_semana, hora_apertura, hora_cierre) `
      + `SELECT c.id, d.dia, f.apertura, f.cierre FROM comercio c JOIN (SELECT ${dias.split(',').map((x) => x + ' AS dia').join(' UNION ALL SELECT ')}) d `
      + `JOIN (SELECT '12:00:00' AS apertura, '15:00:00' AS cierre UNION ALL SELECT '20:00:00', '23:00:00') f WHERE c.nombre LIKE '${marca} %';`);
    sql(`INSERT INTO pedido (cliente_id, comercio_id, modalidad_entrega, estado, pago_estado, subtotal, cargo_servicio_cliente, cargo_servicio_comercio, total, fecha_creacion, fecha_pago_confirmado, turno_fecha, turno_horario_id) `
      + `SELECT ${comprador.id}, c.id, 'RETIRO', CASE WHEN (c.id + s.seq) % 50 = 0 THEN 'PENDIENTE_CONFIRMACION_COMERCIO' WHEN (c.id + s.seq) % 10 = 1 THEN 'RECHAZADO' WHEN (c.id + s.seq) % 10 = 2 THEN 'EN_PREPARACION' ELSE 'ENTREGADO' END, 'PAGADO', 1500, 200, 15, 1700, '${HOY()} 13:00:00', '${HOY()} 13:00:00', '${HOY()}', `
      + `(SELECT h.id FROM horario h WHERE h.comercio_id = c.id AND h.dia_semana = '${dia}' AND h.hora_apertura = '12:00:00' LIMIT 1) `
      + `FROM comercio c, seq_1_to_${pedidosPorComercio} s WHERE c.nombre LIKE '${marca} %';`);
    const totalComercios = Number(sql(`SELECT COUNT(*) FROM comercio WHERE nombre LIKE '${marca} %';`));
    const totalPedidos = Number(sql(`SELECT COUNT(*) FROM pedido WHERE comercio_id IN (SELECT id FROM comercio WHERE nombre LIKE '${marca} %');`));
    console.log(`Datos sinteticos: ${totalComercios} comercios, ${totalPedidos} pedidos, ${totalComercios * 14} franjas`);

    const t0 = Date.now();
    const conTrabajo = await correr(ahora);
    const msConTrabajo = Date.now() - t0;
    if (conTrabajo.status !== 200) problemas.push(`corrida con ${totalComercios} cierres: ${conTrabajo.status} ${JSON.stringify(conTrabajo.json)}`);
    console.log(`Corrida con ${totalComercios} cierres pendientes: ${msConTrabajo} ms ${JSON.stringify(conTrabajo.json?.data)}`);
    const t1 = Date.now();
    const sinTrabajo = await correr(ahora);
    const msSinTrabajo = Date.now() - t1;
    console.log(`Corrida sin nada que cerrar (${totalComercios} comercios con franjas): ${msSinTrabajo} ms ${JSON.stringify(sinTrabajo.json?.data)}`);
    const cerrados = Number(sql(`SELECT COUNT(*) FROM cierre_turno WHERE comercio_id IN (SELECT id FROM comercio WHERE nombre LIKE '${marca} %');`));
    if (cerrados !== totalComercios) problemas.push(`se esperaban ${totalComercios} cierres sinteticos y hay ${cerrados}`);
    const noEnviados = Number(sql(`SELECT COUNT(*) FROM cierre_turno WHERE email_estado <> 'ENVIADO' AND comercio_id IN (SELECT id FROM comercio WHERE nombre LIKE '${marca} %');`));
    if (noEnviados !== 0) problemas.push(`${noEnviados} cierres sinteticos no quedaron ENVIADO`);
  } finally {
    const ids = `SELECT id FROM comercio WHERE nombre LIKE '${marca} %'`;
    sql(`DELETE FROM cierre_turno WHERE comercio_id IN (${ids});`);
    sql(`DELETE FROM pedido WHERE comercio_id IN (${ids});`);
    sql(`DELETE FROM horario WHERE comercio_id IN (${ids});`);
    sql(`DELETE FROM comercio WHERE nombre LIKE '${marca} %';`);
    const restos = Number(sql(`SELECT COUNT(*) FROM comercio WHERE nombre LIKE '${marca} %';`));
    console.log(`Datos sinteticos borrados (restan ${restos})`);
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
  const categoria = await call('POST', '/categorias', admin, { nombre: `StressT4 ${uniq()}` });
  if (categoria.status !== 201) throw new Error('categoria ' + JSON.stringify(categoria));
  categoriaId = categoria.json.data.id;
  await fallas(0);
  const solo = process.env.ESCENARIO;
  const escenarios = [escenario1, escenario2, escenario3, escenario4];
  const todos = [];
  try {
    for (let i = 0; i < escenarios.length; i++) {
      if ((!solo && i < 3) || solo === String(i + 1)) todos.push(...(await escenarios[i](admin)));
    }
  } finally {
    await fallas(0);
  }
  todos.push(...revisarElLog(inicioLog));
  console.log(todos.length ? 'PROBLEMAS:\n' + todos.join('\n') : 'SIN PROBLEMAS (sin 5xx, sin inconsistencias, sin Deadlock ni Lock wait timeout en el log)');
  if (todos.length) process.exitCode = 1;
}

main().catch(async (e) => {
  console.error(e);
  try {
    await fallas(0);
  } catch {
  }
  process.exit(1);
});
