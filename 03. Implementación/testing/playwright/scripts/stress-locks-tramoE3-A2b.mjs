import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';

const B = process.env.E2E_API_BASE_URL || 'http://localhost:8080/api/v1';
const LOC = process.env.LOC;
const ROUNDS = Number(process.env.ROUNDS || 5);
const PEDIDOS_VOLUMEN = Number(process.env.PEDIDOS_VOLUMEN || 30000);
const PAGINA_VOLUMEN = Number(process.env.PAGINA_VOLUMEN || 100);
const ADMIN = { nombreUsuario: process.env.ADMIN_USUARIO || 'adminbajonea', password: process.env.ADMIN_PASSWORD };
const LOG_BACKEND = process.env.BACKEND_LOG || `${process.env.TEMP || '/tmp'}/backend-test.log`;
const sqlUnaVez = (q) => execFileSync('C:/xampp/mysql/bin/mysql.exe', ['-u', 'root', '-N', '-B', 'bajonea_test', '-e', q], { maxBuffer: 256 * 1024 * 1024 }).toString().trim();
const sql = (q) => {
  let resultado = sqlUnaVez(q);
  for (let intento = 0; intento < 2 && resultado === '' && /^\s*SELECT/i.test(q); intento += 1) resultado = sqlUnaVez(q);
  return resultado;
};

if (!LOC || !ADMIN.password) {
  console.error('Faltan LOC (id de localidad de Rio Grande) y/o ADMIN_PASSWORD (contrasena actual del administrador)');
  process.exit(1);
}

let seq = Date.now() % 100000;
const uniq = () => `${Date.now().toString(36)}${(seq++).toString(36)}`.slice(-10);
const aleatorio = (max) => Math.floor(Math.random() * max);
const dormir = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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

async function verificarYEntrar(email, nombreUsuario, password) {
  const codigo = (await call('GET', `/test/token-verificacion?email=${email}`)).json.data;
  const v = await call('POST', '/auth/verificar', null, { email, codigo });
  if (v.status !== 200) throw new Error('verificar ' + JSON.stringify(v));
  const login = await call('POST', '/auth/login', null, { nombreUsuario, password });
  if (login.status !== 200) throw new Error('login ' + JSON.stringify(login));
  return { email, nombreUsuario, password, token: login.json.data.token, id: login.json.data.usuario.id };
}

async function nuevoCliente() {
  const u = uniq();
  const email = `stressa2b.cli.${u}@bajonea.test`;
  const nombreUsuario = `sb${u}`.slice(0, 20);
  const password = `Pw${uniq()}x`;
  const r = await call('POST', '/auth/registro/cliente', null, {
    nombre: 'Clienta',
    apellido: 'Estres',
    dni: dni(),
    fechaNacimiento: '1995-05-20',
    telefono: tel(),
    nombreUsuario,
    email,
    password,
    aceptaTerminos: true,
    direccion: { calle: 'Stress', numero: '1', pisoDepto: null, codigoPostal: '9420', localidadId: LOC, principal: true },
  });
  if (r.status !== 201) throw new Error('registro cliente ' + JSON.stringify(r));
  return verificarYEntrar(email, nombreUsuario, password);
}

async function nuevoDueno() {
  const u = uniq();
  const email = `stressa2b.${u}@bajonea.test`;
  const nombreUsuario = `sc${u}`.slice(0, 20);
  const password = `Pw${uniq()}x`;
  const r = await call('POST', '/auth/registro/comercio', null, {
    razonSocial: `StressA2b ${u} SRL`,
    cuit: cuit(),
    condicionIva: 'RESPONSABLE_INSCRIPTO',
    tipoSociedad: 'SRL',
    domicilioFiscal: 'Av. Stress 1',
    fechaInicioActividades: '2020-01-01',
    nombre: `StressA2b ${u}`,
    descripcion: 'x',
    telefono: tel(),
    emailContacto: email,
    tipoComercio: 'RESTAURANTE',
    aceptaDelivery: false,
    aceptaRetiro: true,
    nombreUsuario,
    email,
    password,
    direccion: { calle: 'Stress', numero: '1', pisoDepto: null, codigoPostal: '9420', localidadId: LOC, principal: false },
    horarios: horariosTodosLosDias,
    nombreRepresentante: 'Rep',
    apellidoRepresentante: 'Stress',
    dniRepresentante: dni(),
    telefonoRepresentante: tel(),
    fechaNacimientoRepresentante: '1985-03-15',
    fotoPerfilUrl: 'https://res.cloudinary.com/demo/image/upload/v1/comercios/pre-registro/stress.png',
    redesSociales: [{ tipo: 'INSTAGRAM', url: `https://instagram.com/sc${u}` }],
  });
  if (r.status !== 201) throw new Error('registro dueno ' + JSON.stringify(r));
  const d = await verificarYEntrar(email, nombreUsuario, password);
  d.duenoId = d.id;
  return d;
}

const cabecera = (d) => ({ 'X-Comercio-Id': String(d.comercioId) });

async function duenoOperativo(admin, categoriaId) {
  const d = await nuevoDueno();
  const pendiente = (await call('GET', '/administrador/comercios/pendientes', admin)).json.data.find((c) => c.emailCuenta === d.email);
  const aprobado = await call('PUT', `/administrador/comercios/${pendiente.id}/resolver`, admin, { aprobar: true });
  if (aprobado.status !== 200) throw new Error('aprobar ' + JSON.stringify(aprobado));
  d.comercioId = pendiente.id;
  const apto = await call('PUT', `/test/comercios/${d.comercioId}/apto-venta`);
  if (apto.status !== 200) throw new Error('apto-venta ' + JSON.stringify(apto));
  const producto = await call('POST', '/productos', d.token, { nombre: `Producto ${uniq()}`, precio: 1500, categoriaId }, cabecera(d));
  if (producto.status !== 201) throw new Error('producto ' + JSON.stringify(producto));
  d.productoId = producto.json.data.id;
  const firma = await call('POST', `/productos/${d.productoId}/cloudinary/firma`, d.token, {}, cabecera(d));
  const nube = firma.json.data.cloudName;
  const imagen = await call('POST', `/productos/${d.productoId}/imagenes`, d.token,
    { url: `https://res.cloudinary.com/${nube}/image/upload/v1/productos/${d.comercioId}/${d.productoId}/s.png`, orden: 0, esPrincipal: true }, cabecera(d));
  if (imagen.status !== 201) throw new Error('imagen ' + JSON.stringify(imagen));
  d.categoriaId = categoriaId;
  return d;
}

const ESTADOS_VISIBLES = "'PENDIENTE_CONFIRMACION_COMERCIO','EN_PREPARACION','EN_CAMINO','LISTO_PARA_RETIRAR','ENTREGADO','RECHAZADO','CANCELADO','ANULADO','CANCELADO_POR_SISTEMA','EXPIRADO'";
const RANGO_FUENTE = { PEDIDO: 0, EDICION: 1, CIERRE: 2 };

function idsVisiblesEnLaBase(comercioId) {
  const filas = sql(
    `SELECT CONCAT('PEDIDO-', h.id) FROM historial_estado_pedido h JOIN pedido p ON p.id = h.pedido_id ` +
      `WHERE p.comercio_id = ${comercioId} AND h.estado IN (${ESTADOS_VISIBLES}) AND (h.motivo_timeout IS NULL OR h.motivo_timeout <> 'TIMEOUT_PAGO') ` +
      `UNION ALL SELECT CONCAT('EDICION-', id) FROM historial_edicion_comercio WHERE comercio_id = ${comercioId} ` +
      `UNION ALL SELECT CONCAT('CIERRE-', id) FROM historial_cierre_comercio WHERE comercio_id = ${comercioId};`,
  );
  return new Set(filas.split(/\r?\n/).filter(Boolean));
}

function momento(item) {
  return new Date(item.fechaHora).getTime();
}

function ordenInvalido(anterior, siguiente) {
  const a = momento(anterior);
  const s = momento(siguiente);
  if (a !== s) return a < s;
  const ra = RANGO_FUENTE[anterior.fuente];
  const rs = RANGO_FUENTE[siguiente.fuente];
  if (ra !== rs) return ra > rs;
  return Number(anterior.id.split('-')[1]) <= Number(siguiente.id.split('-')[1]);
}

async function recorrer(d, limite, maxPaginas = 100000) {
  const items = [];
  const latencias = [];
  let cursor = null;
  for (let pagina = 0; pagina < maxPaginas; pagina++) {
    const t0 = performance.now();
    const r = await call('GET', `/comercios/equipo/actividad?limite=${limite}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`, d.token, undefined, cabecera(d));
    latencias.push(performance.now() - t0);
    if (r.status !== 200) return { items, latencias, error: `la actividad dio ${r.status} ${JSON.stringify(r.json)}` };
    items.push(...r.json.data.items);
    cursor = r.json.data.siguienteCursor;
    if (!r.json.data.hayMas) break;
  }
  return { items, latencias, error: null };
}

function revisarRecorrido(items, nombre) {
  const problemas = [];
  const vistos = new Set();
  for (const item of items) {
    if (vistos.has(item.id)) problemas.push(`${nombre}: la fila ${item.id} aparece repetida`);
    vistos.add(item.id);
  }
  for (let i = 1; i < items.length; i++) {
    if (ordenInvalido(items[i - 1], items[i])) {
      problemas.push(`${nombre}: orden roto entre ${items[i - 1].id} (${items[i - 1].fechaHora}) y ${items[i].id} (${items[i].fechaHora})`);
      break;
    }
  }
  return problemas;
}

const percentil = (valores, p) => {
  const orden = [...valores].sort((a, b) => a - b);
  return orden.length ? orden[Math.min(orden.length - 1, Math.floor((p / 100) * orden.length))] : 0;
};
const ms = (n) => `${n.toFixed(0)} ms`;

const ACEPTABLES = new Set([200, 401, 404, 409]);
const contar = (resumen, clave) => {
  resumen[clave] = (resumen[clave] || 0) + 1;
};
const resumir = (resumen) => Object.entries(resumen).sort().map(([k, n]) => `${k}=${n}`).join(' ');

const haceMinutos = (minutos) => {
  const m = new Date(Date.now() - minutos * 60_000);
  const dos = (n) => String(n).padStart(2, '0');
  return `${m.getFullYear()}-${dos(m.getMonth() + 1)}-${dos(m.getDate())} ${dos(m.getHours())}:${dos(m.getMinutes())}:${dos(m.getSeconds())}`;
};

async function pedidoPagado(cliente, d) {
  await call('DELETE', '/carrito', cliente.token);
  const item = await call('POST', '/carrito/items', cliente.token, { productoId: d.productoId, cantidad: 1 });
  if (item.status !== 201) throw new Error('item carrito ' + JSON.stringify(item));
  const pedido = await call('POST', '/pedidos/cliente', cliente.token, { tipoEntrega: 'RETIRO', direccionId: null });
  if (pedido.status !== 201) throw new Error('pedido ' + JSON.stringify(pedido));
  const pago = await call('PUT', `/test/pedidos/${pedido.json.data.id}/pago-aprobado?registrarPago=true`);
  if (pago.status !== 200) throw new Error('pago ' + JSON.stringify(pago));
  return pedido.json.data.id;
}

async function escenarioLecturaPaginadaContraTransiciones(admin, categoriaId, clientes) {
  const problemas = [];
  const resumen = {};
  for (let ronda = 1; ronda <= ROUNDS; ronda++) {
    const d = await duenoOperativo(admin, categoriaId);
    const pedidos = [];
    await Promise.all(clientes.map(async (cliente) => {
      for (let i = 0; i < 4; i++) pedidos.push({ id: await pedidoPagado(cliente, d), cliente });
    }));

    const [paraAceptar, paraExpirar, paraAutoconfirmar, paraCancelar] = [0, 1, 2, 3].map((k) => pedidos.filter((_, i) => i % 4 === k));
    for (const p of paraExpirar) {
      sql(`UPDATE historial_estado_pedido SET fecha_hora = '${haceMinutos(45)}' WHERE pedido_id = ${p.id} AND estado = 'PENDIENTE_CONFIRMACION_COMERCIO';`);
    }
    for (const p of paraAutoconfirmar) {
      const aceptado = await call('PUT', `/pedidos/comercio/${p.id}/aceptar`, d.token, {}, cabecera(d));
      if (aceptado.status !== 200) throw new Error('aceptar previo ' + JSON.stringify(aceptado));
      sql(`UPDATE pedido SET estado = 'EN_CAMINO' WHERE id = ${p.id};`);
      sql(`INSERT INTO historial_estado_pedido (pedido_id, estado, actor_rol, actor_usuario_id, fecha_hora) VALUES (${p.id}, 'EN_CAMINO', 'DUENO', ${d.duenoId}, '${haceMinutos(100)}');`);
    }

    const antes = idsVisiblesEnLaBase(d.comercioId);
    for (const limite of [1, 2, 3, 4, 5, 7, 100]) {
      const enReposo = await recorrer(d, limite);
      if (enReposo.error) problemas.push(`ronda ${ronda}: ${enReposo.error}`);
      problemas.push(...revisarRecorrido(enReposo.items, `ronda ${ronda}, en reposo con limite ${limite}`));
      const ids = new Set(enReposo.items.map((i) => i.id));
      if (ids.size !== antes.size || [...antes].some((id) => !ids.has(id))) {
        const sobran = [...ids].filter((id) => !antes.has(id));
        const faltan = [...antes].filter((id) => !ids.has(id));
        problemas.push(`ronda ${ronda}: en reposo con limite ${limite} el recorrido trajo ${ids.size} filas y la base tiene ${antes.size} visibles; sobran ${sobran.join(',')}; faltan ${faltan.join(',')}`);
      }
    }
    let escribiendo = true;
    const lectores = Array.from({ length: 5 }, async (_, k) => {
      const recorridos = [];
      while (escribiendo || recorridos.length === 0) {
        const antesDelRecorrido = idsVisiblesEnLaBase(d.comercioId);
        const { items, error } = await recorrer(d, 3 + (k % 3));
        if (error) {
          problemas.push(`ronda ${ronda}: ${error}`);
          break;
        }
        problemas.push(...revisarRecorrido(items, `ronda ${ronda}, lector ${k}`));
        const recibidos = new Set(items.map((i) => i.id));
        for (const id of antesDelRecorrido) {
          if (!recibidos.has(id)) problemas.push(`ronda ${ronda}, lector ${k}: la fila ${id} ya estaba al empezar el recorrido y no aparece`);
        }
        recorridos.push(items.length);
        contar(resumen, 'recorrido:200');
      }
    });

    const escritores = [
      ...paraAceptar.map((p) => call('PUT', `/pedidos/comercio/${p.id}/aceptar`, d.token, {}, cabecera(d)).then((r) => ({ tipo: 'aceptar', r }))),
      ...paraCancelar.map((p) => call('PUT', `/pedidos/cliente/${p.id}/cancelar`, p.cliente.token, {}).then((r) => ({ tipo: 'cancelar', r }))),
      ...paraCancelar.map((p) => call('PUT', `/pedidos/comercio/${p.id}/rechazar`, d.token, { motivo: 'SIN_STOCK' }, cabecera(d)).then((r) => ({ tipo: 'rechazar', r }))),
      call('POST', '/test/jobs/pedidos/expirar-sin-respuesta').then((r) => ({ tipo: 'job-expirar', r })),
      call('POST', '/test/jobs/pedidos/avisar-y-autoconfirmar').then((r) => ({ tipo: 'job-autoconfirmar', r })),
      ...paraAutoconfirmar.map((p) => call('PUT', `/pedidos/cliente/${p.id}/entregar`, p.cliente.token, {}).then((r) => ({ tipo: 'entregar-cliente', r }))),
      ...Array.from({ length: 4 }, () => call('PUT', `/productos/${d.productoId}`, d.token,
        { nombre: `Producto ${uniq()}`, precio: 1000 + aleatorio(9000), categoriaId }, cabecera(d)).then((r) => ({ tipo: 'producto', r }))),
      call('PUT', '/comercios/cerrar', d.token, {}, cabecera(d)).then((r) => ({ tipo: 'cerrar', r })),
      call('PUT', '/comercios/abrir', d.token, {}, cabecera(d)).then((r) => ({ tipo: 'abrir', r })),
    ];
    const resultados = await Promise.all(escritores);
    for (const p of paraAceptar.slice(0, 2)) {
      const despachado = await call('PUT', `/pedidos/comercio/${p.id}/despachar`, d.token, {}, cabecera(d));
      contar(resumen, `despachar:${despachado.status}`);
      if (despachado.status >= 500) problemas.push(`ronda ${ronda}: despachar dio ${despachado.status}`);
    }
    await dormir(300);
    escribiendo = false;
    await Promise.all(lectores);

    for (const { tipo, r } of resultados) {
      contar(resumen, `${tipo}:${r.status}`);
      if (process.env.VER_409 && r.status === 409) console.log(tipo, r.json && r.json.mensaje);
      if (r.status >= 500) problemas.push(`ronda ${ronda}: ${tipo} dio ${r.status} ${JSON.stringify(r.json)}`);
      else if (!ACEPTABLES.has(r.status)) problemas.push(`ronda ${ronda}: ${tipo} dio ${r.status}`);
    }

    const final = await recorrer(d, 7);
    if (final.error) {
      problemas.push(`ronda ${ronda}: ${final.error}`);
      continue;
    }
    problemas.push(...revisarRecorrido(final.items, `ronda ${ronda}, recorrido final`));
    const enLaBase = idsVisiblesEnLaBase(d.comercioId);
    const recibidos = new Set(final.items.map((i) => i.id));
    if (recibidos.size !== enLaBase.size || [...enLaBase].some((id) => !recibidos.has(id))) {
      problemas.push(`ronda ${ronda}: el recorrido final tiene ${recibidos.size} filas y la base ${enLaBase.size} visibles`);
    }
    if ([...antes].some((id) => !recibidos.has(id))) problemas.push(`ronda ${ronda}: una fila previa a las escrituras desapareció`);
    const sinNombre = final.items.filter((i) => i.fuente === 'PEDIDO' && i.actorRol === 'SISTEMA' && (i.actorNombre !== null || i.actorUsuarioId !== null));
    if (sinNombre.length) problemas.push(`ronda ${ronda}: ${sinNombre.length} filas del sistema traen nombre o usuario`);
  }
  console.log('Resumen (1, lectura paginada contra transiciones, ediciones, cierres y procesos):', resumir(resumen));
  return problemas;
}

async function escenarioVolumen(admin, categoriaId, clientes) {
  const problemas = [];
  const d = await duenoOperativo(admin, categoriaId);
  const cliente = clientes[0];
  const n = PEDIDOS_VOLUMEN;
  console.log(`Volumen: cargando ${n} pedidos sinteticos (${n * 4} filas de historial) en el comercio ${d.comercioId}...`);
  sql(
    `INSERT INTO pedido (cliente_id, comercio_id, modalidad_entrega, estado, pago_estado, subtotal, cargo_servicio_cliente, cargo_servicio_comercio, total, fecha_creacion) ` +
      `SELECT ${cliente.id}, ${d.comercioId}, 'RETIRO', 'ENTREGADO', 'PAGADO', 10000, 200, 100, 10200, ` +
      `TIMESTAMP('2026-01-01 00:00:00') + INTERVAL (seq % 5000) * 60 SECOND FROM seq_1_to_${n};`,
  );
  const base = `FROM pedido p WHERE p.comercio_id = ${d.comercioId} AND p.fecha_creacion < '2026-10-01'`;
  sql(
    `INSERT INTO historial_estado_pedido (pedido_id, estado, actor_rol, actor_usuario_id, motivo_timeout, fecha_hora) ` +
      `SELECT p.id, 'PENDIENTE_PAGO', 'CLIENTE', ${cliente.id}, NULL, p.fecha_creacion ${base} ` +
      `UNION ALL SELECT p.id, 'PENDIENTE_CONFIRMACION_COMERCIO', 'SISTEMA', NULL, NULL, p.fecha_creacion + INTERVAL 1 MINUTE ${base} ` +
      `UNION ALL SELECT p.id, 'EN_PREPARACION', 'DUENO', ${d.duenoId}, NULL, p.fecha_creacion + INTERVAL 3 MINUTE ${base} ` +
      `UNION ALL SELECT p.id, 'ENTREGADO', 'CLIENTE', ${cliente.id}, NULL, p.fecha_creacion + INTERVAL 30 MINUTE ${base};`,
  );
  for (let i = 0; i < 300; i++) {
    await call('PUT', `/productos/${d.productoId}`, d.token, { nombre: `Producto ${uniq()}`, precio: 1000 + aleatorio(9000), categoriaId }, cabecera(d));
  }
  const esperadas = idsVisiblesEnLaBase(d.comercioId);
  console.log(`Volumen: ${esperadas.size} filas visibles para el comercio (${n * 3} de pedidos, el resto ediciones).`);

  const primera = await call('GET', `/comercios/equipo/actividad?limite=${PAGINA_VOLUMEN}`, d.token, undefined, cabecera(d));
  if (primera.status !== 200) problemas.push(`primera pagina: ${primera.status}`);

  const inicio = performance.now();
  const { items, latencias, error } = await recorrer(d, PAGINA_VOLUMEN);
  const total = performance.now() - inicio;
  if (error) problemas.push(`volumen: ${error}`);
  problemas.push(...revisarRecorrido(items, 'volumen'));
  const recibidos = new Set(items.map((i) => i.id));
  if (recibidos.size !== esperadas.size || [...esperadas].some((id) => !recibidos.has(id))) {
    problemas.push(`volumen: el recorrido completo trajo ${recibidos.size} filas distintas y la base tiene ${esperadas.size}`);
  }
  console.log(
    `Volumen, recorrido completo con limite ${PAGINA_VOLUMEN}: ${latencias.length} paginas en ${(total / 1000).toFixed(1)} s; ` +
      `por pagina p50 ${ms(percentil(latencias, 50))}, p95 ${ms(percentil(latencias, 95))}, max ${ms(Math.max(...latencias))}; ` +
      `primera pagina ${ms(latencias[0])}, ultima ${ms(latencias[latencias.length - 1])}.`,
  );

  const concurrentes = 6;
  const t1 = performance.now();
  const lecturas = await Promise.all(Array.from({ length: concurrentes }, () => recorrer(d, PAGINA_VOLUMEN, 15)));
  const durante = performance.now() - t1;
  const todas = lecturas.flatMap((l) => l.latencias);
  lecturas.forEach((l, k) => {
    if (l.error) problemas.push(`volumen concurrente ${k}: ${l.error}`);
    problemas.push(...revisarRecorrido(l.items, `volumen concurrente ${k}`));
  });
  console.log(`Volumen, ${concurrentes} lectores en paralelo de 15 paginas: ${(durante / 1000).toFixed(1)} s; p50 ${ms(percentil(todas, 50))}, p95 ${ms(percentil(todas, 95))}, max ${ms(Math.max(...todas))}.`);

  const plan = sql(
    `ANALYZE FORMAT=JSON SELECT h.id, h.fecha_hora, h.actor_usuario_id, h.actor_rol, pf.nombre, pf.apellido, p.id, h.estado, h.motivo_timeout ` +
      `FROM historial_estado_pedido h JOIN pedido p ON p.id = h.pedido_id LEFT JOIN persona_fisica pf ON pf.id = h.actor_usuario_id ` +
      `WHERE p.comercio_id = ${d.comercioId} AND h.estado IN (${ESTADOS_VISIBLES}) AND (h.motivo_timeout IS NULL OR h.motivo_timeout <> 'TIMEOUT_PAGO') ` +
      `AND (h.fecha_hora < '9999-12-31 23:59:59') ORDER BY h.fecha_hora DESC, h.id DESC LIMIT ${PAGINA_VOLUMEN + 1}`,
  );
  const tiempoPlan = /"r_total_time_ms":\s*([\d.]+)/.exec(plan.replace(/\s+/g, ' '));
  console.log(`Volumen, consulta de pedidos de una pagina sin cursor (ANALYZE): ${tiempoPlan ? tiempoPlan[1] : '?'} ms en la base.`);

  sql(`DELETE h FROM historial_estado_pedido h JOIN pedido p ON p.id = h.pedido_id WHERE p.comercio_id = ${d.comercioId};`);
  sql(`DELETE FROM pedido WHERE comercio_id = ${d.comercioId};`);
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
  const login = await call('POST', '/auth/login', null, ADMIN);
  if (login.status !== 200) throw new Error('login admin ' + JSON.stringify(login));
  const admin = login.json.data.token;
  const r = await call('POST', '/categorias', admin, { nombre: `StressA2b ${uniq()}` });
  if (r.status !== 201) throw new Error('categoria ' + JSON.stringify(r));
  const categoriaId = r.json.data.id;
  const clientes = await Promise.all(Array.from({ length: 4 }, () => nuevoCliente()));
  const solo = process.env.ESCENARIO;
  const todos = [];
  if (!solo || solo === '1') todos.push(...(await escenarioLecturaPaginadaContraTransiciones(admin, categoriaId, clientes)));
  if (!solo || solo === '2') todos.push(...(await escenarioVolumen(admin, categoriaId, clientes)));
  todos.push(...revisarElLog(inicioLog));
  console.log(todos.length ? 'PROBLEMAS:\n' + todos.slice(0, 40).join('\n') : 'SIN PROBLEMAS (sin 5xx, recorridos sin repetidos ni saltos y en orden, sin Deadlock ni Lock wait timeout en el log)');
  if (todos.length) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
