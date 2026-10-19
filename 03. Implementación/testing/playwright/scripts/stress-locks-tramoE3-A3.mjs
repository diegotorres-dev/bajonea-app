import { execFileSync, spawn } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';

const B = process.env.E2E_API_BASE_URL || 'http://localhost:8080/api/v1';
const ROUNDS = Number(process.env.ROUNDS || 10);
const ADMIN = { nombreUsuario: 'adminbajonea', password: process.env.ADMIN_PASSWORD };
const sqlUnaVez = (q) => execFileSync(process.env.MYSQL_BIN || 'C:/xampp/mysql/bin/mysql.exe', ['-u', 'root', '-N', '-B', 'bajonea_test', '-e', q]).toString().trim();
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
const esperar = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
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
const horariosTodosLosDias = ['LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO', 'DOMINGO'].map((diaSemana) => ({
  diaSemana,
  horaApertura: '00:00',
  horaCierre: '23:59',
}));

let LOC;
async function resolverLocalidad() {
  const provincias = (await call('GET', '/geografia/provincias')).json.data;
  const provincia = provincias.find((p) => p.nombre.startsWith('Tierra del Fuego'));
  const localidades = (await call('GET', `/geografia/localidades?provinciaId=${encodeURIComponent(provincia.id)}`)).json.data;
  const localidad = localidades.find((l) => /r[ií]o grande/i.test(l.nombre));
  return localidad.id;
}

const direccion = () => ({ calle: 'Stress', numero: '1', pisoDepto: null, codigoPostal: '9420', localidadId: LOC, principal: true });

async function nuevoDueno() {
  const u = uniq();
  const email = `stressa3.${u}@bajonea.test`;
  const nombreUsuario = `sf${u}`.slice(0, 20);
  const password = clavePropia();
  const r = await call('POST', '/auth/registro/comercio', null, {
    aceptaTerminos: true,
    razonSocial: `StressA3 ${u} SRL`,
    cuit: cuit(),
    condicionIva: 'RESPONSABLE_INSCRIPTO',
    tipoSociedad: 'SRL',
    domicilioFiscal: 'Av. Stress 1',
    fechaInicioActividades: '2020-01-01',
    nombre: `StressA3 ${u}`,
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
    redesSociales: [{ tipo: 'INSTAGRAM', url: `https://instagram.com/sf${u}` }],
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
  return d;
}

async function nuevoClienteVerificado() {
  const u = uniq();
  const email = `stressa3.cli.${u}@bajonea.test`;
  const nombreUsuario = `sg${u}`.slice(0, 20);
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
  return { email, nombreUsuario, password };
}

const clonar = async (comercioId, estado = 'APROBADO') => {
  const r = await call('POST', `/test/comercios/${comercioId}/clonar?nombre=${encodeURIComponent(`Clon ${uniq()}`)}&estado=${estado}`);
  if (r.status !== 201) throw new Error('clonar ' + JSON.stringify(r));
  return r.json.data;
};

const cabecera = (comercioId) => ({ 'X-Comercio-Id': String(comercioId) });

async function empleadoDe(dueno, comercioIds) {
  const cuenta = await nuevoClienteVerificado();
  for (const comercioId of comercioIds) {
    const inv = await call('POST', '/comercios/equipo/invitaciones', dueno.token, { email: cuenta.email }, cabecera(comercioId));
    if (inv.status !== 201) throw new Error('invitar ' + JSON.stringify(inv));
    const codigo = (await call('GET', `/test/invitaciones-empleado/codigo?email=${encodeURIComponent(cuenta.email)}&comercioId=${comercioId}`)).json.data;
    const acep = await call('POST', '/auth/invitaciones-empleado/aceptar', null, { email: cuenta.email, codigo });
    if (acep.status !== 200) throw new Error('aceptar ' + JSON.stringify(acep));
  }
  const login = await call('POST', '/auth/login', null, { nombreUsuario: cuenta.nombreUsuario, password: cuenta.password });
  if (login.status !== 200) throw new Error('login empleado ' + JSON.stringify(login));
  return { ...cuenta, token: login.json.data.token, id: login.json.data.usuario.id };
}

const LOG_BACKEND = process.env.BACKEND_LOG || `${process.env.TEMP || '/tmp'}/backend-test.log`;
const NO_DISPONIBLE = JSON.stringify({ mensaje: 'Comercio no encontrado', data: { codigo: 'COMERCIO_NO_DISPONIBLE' } });
const BASE_CATEGORIA = `StressA3 ${uniq()}`;

const mysql = process.env.MYSQL_BIN || 'C:/xampp/mysql/bin/mysql.exe';

function desactivarMientrasOpera(comercioId, empleadoId, milisegundos) {
  const consulta = `START TRANSACTION; SELECT id FROM empleado_comercio WHERE empleado_id = ${empleadoId} AND comercio_id = ${comercioId} FOR UPDATE; ` +
    `SELECT SLEEP(${milisegundos / 1000}); UPDATE empleado_comercio SET estado = 'INACTIVO', fecha_baja = NOW() WHERE empleado_id = ${empleadoId} AND comercio_id = ${comercioId}; COMMIT;`;
  return new Promise((resolve, reject) => {
    const proceso = spawn(mysql, ['-u', 'root', '-N', '-B', 'bajonea_test', '-e', consulta], { stdio: 'ignore' });
    proceso.on('error', reject);
    proceso.on('exit', (codigo) => (codigo === 0 ? resolve() : reject(new Error('mysql termino con ' + codigo))));
  });
}


let categoriaId;

async function comercioListo(admin) {
  const d = await duenoAprobado(admin);
  const apto = await call('PUT', `/test/comercios/${d.comercioId}/apto-venta`);
  if (apto.status !== 200) throw new Error('apto-venta ' + JSON.stringify(apto));
  const firma = await call('POST', '/comercios/perfil/foto/firma', d.token, {}, cabecera(d.comercioId));
  d.nube = firma.json.data.cloudName;
  const producto = await call('POST', '/productos', d.token, { nombre: `Producto ${uniq()}`, precio: 1500, categoriaId }, cabecera(d.comercioId));
  if (producto.status !== 201) throw new Error('producto ' + JSON.stringify(producto));
  d.productoId = producto.json.data.id;
  const imagen = await call('POST', `/productos/${d.productoId}/imagenes`, d.token,
    { url: `https://res.cloudinary.com/${d.nube}/image/upload/v1/productos/${d.comercioId}/${d.productoId}/s.png`, orden: 0, esPrincipal: true }, cabecera(d.comercioId));
  if (imagen.status !== 201) throw new Error('imagen ' + JSON.stringify(imagen));
  d.imagenId = imagen.json.data.id;
  return d;
}

async function comprador() {
  const cuenta = await nuevoClienteVerificado();
  const login = await call('POST', '/auth/login', null, { nombreUsuario: cuenta.nombreUsuario, password: cuenta.password });
  if (login.status !== 200) throw new Error('login comprador ' + JSON.stringify(login));
  return { ...cuenta, token: login.json.data.token };
}

async function pedidoPendiente(cliente, productoId) {
  const agregado = await call('POST', '/carrito/items', cliente.token, { productoId, cantidad: 1 });
  if (agregado.status !== 201) throw new Error('carrito ' + JSON.stringify(agregado));
  const pedido = await call('POST', '/pedidos/cliente', cliente.token, { tipoEntrega: 'RETIRO', direccionId: null });
  if (pedido.status !== 201) throw new Error('pedido ' + JSON.stringify(pedido));
  const id = pedido.json.data.id;
  const pago = await call('PUT', `/test/pedidos/${id}/pago-aprobado?registrarPago=true`);
  if (pago.status !== 200) throw new Error('pago ' + JSON.stringify(pago));
  return id;
}

const datosOperativos = (actor, comercioId) => call('PUT', '/comercios/perfil/datos-operativos', actor.token, { descripcion: `Stress ${uniq()}`, telefono: tel() }, cabecera(comercioId));
const estadoProducto = (actor, d, estado) => call('PATCH', `/productos/${d.productoId}/estado`, actor.token, { estado }, cabecera(d.comercioId));
const reordenar = (actor, d) => call('PATCH', `/productos/${d.productoId}/imagenes/${d.imagenId}/orden`, actor.token, { orden: aleatorio(3) }, cabecera(d.comercioId));
const editarProducto = (actor, d) => call('PUT', `/productos/${d.productoId}`, actor.token, { nombre: `Producto ${uniq()}`, precio: 1000 + aleatorio(9000), categoriaId }, cabecera(d.comercioId));
const cerrar = (actor, comercioId) => call('PUT', '/comercios/cerrar', actor.token, {}, cabecera(comercioId));
const abrir = (actor, comercioId) => call('PUT', '/comercios/abrir', actor.token, {}, cabecera(comercioId));
const accionPedido = (actor, comercioId, pedidoId, accion) =>
  call('PUT', `/pedidos/comercio/${pedidoId}/${accion}`, actor.token,
    accion === 'rechazar' || accion === 'anular' ? { motivo: 'SIN_STOCK' } : {}, cabecera(comercioId));
const loginIncorrecto = (d) => call('POST', '/auth/login', null, { nombreUsuario: d.nombreUsuario, password: 'ClaveIncorrecta1' });

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
      if (r.status === 404 && JSON.stringify(r.json) !== NO_DISPONIBLE && !/no encontrado/i.test(r.json?.mensaje ?? '')) {
        problemas.push(`${etiqueta}: 404 con cuerpo inesperado ${JSON.stringify(r.json)}`);
      }
    },
  };
}

const MENSAJE_PROPIO = 'No podés gestionar tus propios pedidos';
const esPropio409 = (r) => r.status === 409 && r.json?.data?.codigo === 'PEDIDO_PROPIO' && r.json?.mensaje === MENSAJE_PROPIO;
const esSinOperacion409 = (r) => r.status === 409 && r.json?.data?.codigo === 'COMERCIO_SIN_OPERACION';
const trazabilidad = (actor, comercioId, pedidoId) => call('GET', `/pedidos/comercio/${pedidoId}/trazabilidad`, actor.token, undefined, cabecera(comercioId));
const listaDePedidos = (actor, comercioId) => call('GET', '/pedidos/comercio', actor.token, undefined, cabecera(comercioId));
const ACCIONES = ['aceptar', 'rechazar', 'despachar', 'entregar', 'anular'];

const historialVisible = (pedidoId) =>
  sql(`SELECT estado FROM historial_estado_pedido WHERE pedido_id = ${pedidoId} AND estado <> 'PENDIENTE_PAGO' AND (motivo_timeout IS NULL OR motivo_timeout <> 'TIMEOUT_PAGO') ORDER BY fecha_hora, id;`)
    .split(/\r?\n/).filter(Boolean);

function verificarPedidos(problemas, ronda, ids) {
  for (const id of ids) {
    const estado = sql(`SELECT estado FROM pedido WHERE id = ${id};`);
    const ultimo = sql(`SELECT estado FROM historial_estado_pedido WHERE pedido_id = ${id} ORDER BY id DESC LIMIT 1;`);
    if (estado !== ultimo) problemas.push(`ronda ${ronda}: el pedido ${id} esta ${estado} y el ultimo historial dice ${ultimo}`);
    const notas = Number(sql(`SELECT COUNT(*) FROM nota_credito nc JOIN pago p ON p.id = nc.pago_id WHERE p.pedido_id = ${id};`));
    if (notas > 1) problemas.push(`ronda ${ronda}: el pedido ${id} tiene ${notas} notas de credito`);
  }
}

function filasDelPropioPedido(comercioId) {
  return Number(sql(`SELECT COUNT(*) FROM historial_estado_pedido h JOIN pedido p ON p.id = h.pedido_id WHERE p.comercio_id = ${comercioId} AND p.cliente_id = h.actor_usuario_id AND h.actor_rol IN ('EMPLEADO','DUENO');`));
}

async function escenario1(admin) {
  const { problemas, registrar } = nuevoRegistro();
  const resumen = {};
  for (let ronda = 1; ronda <= ROUNDS; ronda++) {
    const d = await comercioListo(admin);
    const elena = await empleadoDe(d, [d.comercioId]);
    const fabiana = await empleadoDe(d, [d.comercioId]);
    const cliente = await comprador();
    const propios = [await pedidoPendiente(elena, d.productoId)];
    propios.push(await pedidoPendiente(elena, d.productoId));
    propios.push(await pedidoPendiente(elena, d.productoId));
    const ajenos = [await pedidoPendiente(cliente, d.productoId), await pedidoPendiente(cliente, d.productoId)];
    await accionPedido(d, d.comercioId, propios[1], 'aceptar');
    await accionPedido(d, d.comercioId, propios[2], 'aceptar');
    await accionPedido(fabiana, d.comercioId, propios[2], 'despachar');

    const intentosDeElena = propios.flatMap((id) => [...ACCIONES, ...ACCIONES].map((accion) =>
      esperar(aleatorio(30)).then(() => accionPedido(elena, d.comercioId, id, accion)).then((r) => ({ tipo: `elena-${accion}-propio`, r, propio: true }))));
    const tareas = [
      ...intentosDeElena,
      accionPedido(d, d.comercioId, propios[0], 'aceptar').then((r) => ({ tipo: 'dueno-aceptar-propio', r })),
      accionPedido(fabiana, d.comercioId, propios[0], 'rechazar').then((r) => ({ tipo: 'fabiana-rechazar-propio', r })),
      accionPedido(fabiana, d.comercioId, propios[1], 'despachar').then((r) => ({ tipo: 'fabiana-despachar-propio', r })),
      accionPedido(d, d.comercioId, propios[2], 'entregar').then((r) => ({ tipo: 'dueno-entregar-propio', r })),
      accionPedido(elena, d.comercioId, ajenos[0], 'aceptar').then((r) => ({ tipo: 'elena-aceptar-ajeno', r })),
      accionPedido(fabiana, d.comercioId, ajenos[0], 'rechazar').then((r) => ({ tipo: 'fabiana-rechazar-ajeno', r })),
      accionPedido(elena, d.comercioId, ajenos[1], 'rechazar').then((r) => ({ tipo: 'elena-rechazar-ajeno', r })),
      ...propios.map((id) => trazabilidad(elena, d.comercioId, id).then((r) => ({ tipo: 'elena-trazabilidad-propio', r, trazaPropia: true }))),
      ...propios.map((id) => trazabilidad(fabiana, d.comercioId, id).then((r) => ({ tipo: 'fabiana-trazabilidad-propio', r }))),
    ];
    const resultados = await Promise.all(tareas);
    for (const { tipo, r, propio, trazaPropia } of resultados) {
      contar(resumen, `${tipo}:${r.status}`);
      if (propio || trazaPropia) {
        if (!esPropio409(r)) problemas.push(`ronda ${ronda} ${tipo}: tenia que ser 409 PEDIDO_PROPIO y fue ${r.status} ${JSON.stringify(r.json)}`);
      } else if (tipo.endsWith('trazabilidad-propio')) {
        registrar(`ronda ${ronda} ${tipo}`, r, [200]);
      } else {
        registrar(`ronda ${ronda} ${tipo}`, r, [200, 409]);
      }
    }
    if (filasDelPropioPedido(d.comercioId) !== 0) problemas.push(`ronda ${ronda}: un Empleado o el Dueño dejo filas de historial sobre un pedido del que es el Cliente`);
    verificarPedidos(problemas, ronda, [...propios, ...ajenos]);
  }
  console.log('Resumen (1, un Empleado contra su propio pedido mientras el Dueño y otro Empleado transicionan el comercio: PEDIDO_PROPIO siempre):', resumir(resumen));
  return problemas;
}

async function escenario2(admin) {
  const { problemas, registrar } = nuevoRegistro();
  const resumen = {};
  for (let ronda = 1; ronda <= ROUNDS; ronda++) {
    const d = await comercioListo(admin);
    const elena = await empleadoDe(d, [d.comercioId]);
    const fabiana = await empleadoDe(d, [d.comercioId]);
    const gabriela = await empleadoDe(d, [d.comercioId]);
    const cliente = await comprador();
    const pedidos = [];
    for (let i = 0; i < 4; i++) pedidos.push(await pedidoPendiente(cliente, d.productoId));
    const deGabriela = await pedidoPendiente(gabriela, d.productoId);
    const todos = [...pedidos, deGabriela];
    const observaciones = [];
    const lectores = [d, elena, fabiana, gabriela];
    const retenida = desactivarMientrasOpera(d.comercioId, gabriela.id, 300);
    await esperar(100);

    const lecturas = todos.flatMap((id) => lectores.flatMap((actor) => [0, 1, 2].map(() =>
      esperar(aleatorio(500)).then(() => trazabilidad(actor, d.comercioId, id)).then((r) => ({ tipo: 'trazabilidad', actor, id, r })))));
    const listas = lectores.flatMap((actor) => [0, 1, 2].map(() =>
      esperar(aleatorio(500)).then(() => listaDePedidos(actor, d.comercioId)).then((r) => ({ tipo: 'lista', actor, r }))));
    const escrituras = [
      () => accionPedido(d, d.comercioId, pedidos[0], 'aceptar'),
      () => accionPedido(fabiana, d.comercioId, pedidos[0], 'despachar'),
      () => accionPedido(elena, d.comercioId, pedidos[0], 'entregar'),
      () => accionPedido(elena, d.comercioId, pedidos[1], 'aceptar'),
      () => accionPedido(d, d.comercioId, pedidos[1], 'anular'),
      () => accionPedido(fabiana, d.comercioId, pedidos[2], 'rechazar'),
      () => accionPedido(d, d.comercioId, pedidos[3], 'aceptar'),
      () => accionPedido(gabriela, d.comercioId, pedidos[3], 'despachar'),
      () => accionPedido(d, d.comercioId, deGabriela, 'aceptar'),
      () => accionPedido(gabriela, d.comercioId, deGabriela, 'despachar'),
    ].map((f) => esperar(aleatorio(500)).then(f).then((r) => ({ tipo: 'escritura', r })));
    const resultados = await Promise.all([...lecturas, ...listas, ...escrituras]);
    await retenida;

    for (const { tipo, actor, id, r } of resultados) {
      const quien = actor ? (actor === d ? 'dueno' : actor === elena ? 'elena' : actor === fabiana ? 'fabiana' : 'gabriela') : 'x';
      contar(resumen, `${tipo}-${quien}:${r.status}`);
      if (tipo === 'escritura') {
        registrar(`ronda ${ronda} escritura`, r, [200, 404, 409]);
        continue;
      }
      const esGabriela = actor === gabriela;
      if (tipo === 'trazabilidad') {
        const propio = esGabriela && id === deGabriela;
        const permitidos = propio ? [409, 404] : esGabriela ? [200, 404] : [200];
        registrar(`ronda ${ronda} trazabilidad ${quien} pedido ${id}`, r, permitidos);
        if (propio && r.status === 409 && !esPropio409(r)) problemas.push(`ronda ${ronda}: el 409 de la trazabilidad propia no es PEDIDO_PROPIO: ${JSON.stringify(r.json)}`);
        if (r.status === 200) observaciones.push({ id, estados: r.json.data.pasos.map((p) => p.estado) });
      } else {
        registrar(`ronda ${ronda} lista ${quien}`, r, esGabriela ? [200, 404] : [200]);
        if (r.status === 200) {
          for (const pedido of r.json.data) {
            const esperada = actor !== d && pedido.id === deGabriela && esGabriela;
            if (actor === d && 'esPedidoPropio' in pedido) problemas.push(`ronda ${ronda}: la lista del Dueño trae esPedidoPropio`);
            if (actor !== d && pedido.esPedidoPropio !== esperada) problemas.push(`ronda ${ronda}: pedido ${pedido.id} en la lista de ${quien} con esPedidoPropio=${pedido.esPedidoPropio}`);
            if (actor !== d && ('clienteId' in pedido || 'cargoServicioComercio' in pedido)) problemas.push(`ronda ${ronda}: la lista del Empleado trae datos del Dueño`);
          }
        }
      }
    }
    for (const { id, estados } of observaciones) {
      const finales = historialVisible(id);
      if (estados.length > finales.length || estados.some((estado, i) => estado !== finales[i])) {
        problemas.push(`ronda ${ronda}: la trazabilidad del pedido ${id} [${estados.join(',')}] no es un prefijo del historial final [${finales.join(',')}]`);
      }
    }
    const despues = await trazabilidad(gabriela, d.comercioId, pedidos[0]);
    if (despues.status !== 404) problemas.push(`ronda ${ronda}: con la relacion de Gabriela inactiva la trazabilidad dio ${despues.status} en vez de 404`);
    verificarPedidos(problemas, ronda, todos);
  }
  console.log('Resumen (2, lecturas de trazabilidad y lista contra transiciones del Dueño y varios Empleados y la desactivacion de una Empleada):', resumir(resumen));
  return problemas;
}

async function escenario3(admin) {
  const { problemas, registrar } = nuevoRegistro();
  const resumen = {};
  for (let ronda = 1; ronda <= ROUNDS; ronda++) {
    const d = await comercioListo(admin);
    const empleados = [await empleadoDe(d, [d.comercioId]), await empleadoDe(d, [d.comercioId]), await empleadoDe(d, [d.comercioId])];
    const propios = [];
    for (const e of empleados) propios.push(await pedidoPendiente(e, d.productoId));
    const tareas = [
      esperar(aleatorio(60)).then(() => call('PUT', `/administrador/comercios/${d.comercioId}/suspender`, admin, { motivo: 'Suspension de estres' })).then((r) => ({ tipo: 'suspender', r })),
      ...empleados.flatMap((e, i) => ACCIONES.flatMap((accion) => [0, 1].map(() =>
        esperar(aleatorio(60)).then(() => accionPedido(e, d.comercioId, propios[i], accion)).then((r) => ({ tipo: `propio-${accion}`, r, accion }))))),
      ...propios.map((id) => accionPedido(d, d.comercioId, id, 'aceptar').then((r) => ({ tipo: 'dueno-aceptar', r }))),
    ];
    const resultados = await Promise.all(tareas);
    for (const { tipo, r, accion } of resultados) {
      contar(resumen, `${tipo}:${r.status}`);
      if (tipo === 'suspender') registrar(`ronda ${ronda} suspender`, r, [200]);
      else if (tipo === 'dueno-aceptar') registrar(`ronda ${ronda} ${tipo}`, r, [200, 409]);
      else if (!esPropio409(r) && !(accion === 'aceptar' && esSinOperacion409(r))) {
        problemas.push(`ronda ${ronda} ${tipo}: tenia que ser 409 PEDIDO_PROPIO (o COMERCIO_SIN_OPERACION al aceptar) y fue ${r.status} ${JSON.stringify(r.json)}`);
      }
    }
    if (filasDelPropioPedido(d.comercioId) !== 0) problemas.push(`ronda ${ronda}: un Empleado dejo filas de historial sobre su propio pedido`);
    verificarPedidos(problemas, ronda, propios);
  }
  console.log('Resumen (3, tres Empleados contra sus propios pedidos mientras el Administrador suspende el comercio y el Dueño acepta):', resumir(resumen));
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
  const categoria = await call('POST', '/categorias', admin, { nombre: BASE_CATEGORIA });
  if (categoria.status !== 201) throw new Error('categoria ' + JSON.stringify(categoria));
  categoriaId = categoria.json.data.id;
  const solo = process.env.ESCENARIO;
  const escenarios = [escenario1, escenario2, escenario3];
  const todos = [];
  for (let i = 0; i < escenarios.length; i++) {
    if (!solo || solo === String(i + 1)) todos.push(...(await escenarios[i](admin)));
  }
  todos.push(...revisarElLog(inicioLog));
  console.log(todos.length ? 'PROBLEMAS:\n' + todos.join('\n') : 'SIN PROBLEMAS (sin 5xx, sin inconsistencias, sin Deadlock ni Lock wait timeout en el log)');
  if (todos.length) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
