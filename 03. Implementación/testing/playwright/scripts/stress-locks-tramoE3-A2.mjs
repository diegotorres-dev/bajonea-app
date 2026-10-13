import { execFileSync, spawn } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';

const B = process.env.E2E_API_BASE_URL || 'http://localhost:8080/api/v1';
const ROUNDS = Number(process.env.ROUNDS || 10);
const ADMIN = { nombreUsuario: 'adminbajonea', password: process.env.ADMIN_PASSWORD };
const sql = (q) => execFileSync('C:/xampp/mysql/bin/mysql.exe', ['-u', 'root', '-N', '-B', 'bajonea_test', '-e', q]).toString().trim();

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
  const email = `stressa2.${u}@bajonea.test`;
  const nombreUsuario = `sf${u}`.slice(0, 20);
  const password = clavePropia();
  const r = await call('POST', '/auth/registro/comercio', null, {
    razonSocial: `StressA2 ${u} SRL`,
    cuit: cuit(),
    condicionIva: 'RESPONSABLE_INSCRIPTO',
    tipoSociedad: 'SRL',
    domicilioFiscal: 'Av. Stress 1',
    fechaInicioActividades: '2020-01-01',
    nombre: `StressA2 ${u}`,
    descripcion: 'x',
    telefono: tel(),
    emailContacto: email,
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
  const email = `stressa2.cli.${u}@bajonea.test`;
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
const BASE_CATEGORIA = `StressA2 ${uniq()}`;

const mysql = 'C:/xampp/mysql/bin/mysql.exe';

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

const filasDeEdicion = (comercioId, usuarioId) => Number(sql(`SELECT COUNT(*) FROM historial_edicion_comercio WHERE comercio_id = ${comercioId} AND usuario_id = ${usuarioId};`));

async function escenario1(admin) {
  const { problemas, registrar } = nuevoRegistro();
  const resumen = {};
  for (let ronda = 1; ronda <= ROUNDS; ronda++) {
    const d = await comercioListo(admin);
    const empleado = await empleadoDe(d, [d.comercioId]);
    const cliente = await comprador();
    const pedidos = [await pedidoPendiente(cliente, d.productoId), await pedidoPendiente(cliente, d.productoId)];
    const filasAntes = filasDeEdicion(d.comercioId, empleado.id);
    const retenida = desactivarMientrasOpera(d.comercioId, empleado.id, 1500);
    await esperar(350);
    const tareas = [
      ...Array.from({ length: 3 }, () => datosOperativos(empleado, d.comercioId).then((r) => ({ tipo: 'datos', r }))),
      estadoProducto(empleado, d, 'AGOTADO').then((r) => ({ tipo: 'estadoProducto', r })),
      reordenar(empleado, d).then((r) => ({ tipo: 'orden', r })),
      editarProducto(empleado, d).then((r) => ({ tipo: 'producto', r })),
      cerrar(empleado, d.comercioId).then((r) => ({ tipo: 'cerrar', r })),
      abrir(empleado, d.comercioId).then((r) => ({ tipo: 'abrir', r })),
      accionPedido(empleado, d.comercioId, pedidos[0], 'aceptar').then((r) => ({ tipo: 'aceptar', r })),
      accionPedido(empleado, d.comercioId, pedidos[1], 'rechazar').then((r) => ({ tipo: 'rechazar', r })),
    ];
    const resultados = await Promise.all(tareas);
    await retenida;
    for (const { tipo, r } of resultados) {
      contar(resumen, `${tipo}:${r.status}`);
      registrar(`ronda ${ronda} ${tipo}`, r, [404]);
    }
    if (filasDeEdicion(d.comercioId, empleado.id) !== filasAntes) problemas.push(`ronda ${ronda}: el Empleado desactivado dejo filas de edicion`);
    for (const id of pedidos) {
      if (sql(`SELECT estado FROM pedido WHERE id = ${id};`) !== 'PENDIENTE_CONFIRMACION_COMERCIO') problemas.push(`ronda ${ronda}: el pedido ${id} cambio de estado con el Empleado desactivado`);
    }
    if (Number(sql(`SELECT COUNT(*) FROM historial_cierre_comercio WHERE comercio_id = ${d.comercioId};`)) !== 0) problemas.push(`ronda ${ronda}: hay filas de cierre del Empleado desactivado`);
  }
  console.log('Resumen (1, desactivacion mientras el Empleado opera: todo tiene que ser 404):', resumir(resumen));
  return problemas;
}

async function escenario2(admin) {
  const { problemas, registrar } = nuevoRegistro();
  const resumen = {};
  for (let ronda = 1; ronda <= ROUNDS; ronda++) {
    const d = await comercioListo(admin);
    const empleados = [await empleadoDe(d, [d.comercioId]), await empleadoDe(d, [d.comercioId])];
    const cliente = await comprador();
    const pedidos = [];
    for (let i = 0; i < 4; i++) pedidos.push(await pedidoPendiente(cliente, d.productoId));
    const tareas = [
      esperar(aleatorio(40)).then(() => call('PUT', `/administrador/comercios/${d.comercioId}/suspender`, admin, { motivo: 'Suspension de estres' })).then((r) => ({ tipo: 'suspender', r })),
      ...pedidos.flatMap((id, i) => [
        accionPedido(empleados[i % 2], d.comercioId, id, 'aceptar').then((r) => ({ tipo: 'aceptar', r })),
        accionPedido(empleados[(i + 1) % 2], d.comercioId, id, i % 2 ? 'rechazar' : 'despachar').then((r) => ({ tipo: 'otra', r })),
      ]),
      ...Array.from({ length: 2 }, () => datosOperativos(empleados[0], d.comercioId).then((r) => ({ tipo: 'datos', r }))),
    ];
    const resultados = await Promise.all(tareas);
    for (const { tipo, r } of resultados) {
      contar(resumen, `${tipo}:${r.status}`);
      registrar(`ronda ${ronda} ${tipo}`, r, tipo === 'suspender' ? [200] : [200, 404, 409]);
    }
    for (const id of pedidos) {
      const estado = sql(`SELECT estado FROM pedido WHERE id = ${id};`);
      const ultimo = sql(`SELECT estado FROM historial_estado_pedido WHERE pedido_id = ${id} ORDER BY id DESC LIMIT 1;`);
      if (estado !== ultimo) problemas.push(`ronda ${ronda}: el pedido ${id} esta ${estado} y el ultimo historial dice ${ultimo}`);
      const notas = Number(sql(`SELECT COUNT(*) FROM nota_credito nc JOIN pago p ON p.id = nc.pago_id WHERE p.pedido_id = ${id};`));
      if (notas > 1) problemas.push(`ronda ${ronda}: el pedido ${id} tiene ${notas} notas de credito`);
    }
  }
  console.log('Resumen (2, aceptar/rechazar/despachar de dos Empleados contra la suspension del comercio):', resumir(resumen));
  return problemas;
}

async function escenario3(admin) {
  const { problemas, registrar } = nuevoRegistro();
  const resumen = {};
  for (let ronda = 1; ronda <= ROUNDS; ronda++) {
    const d = await comercioListo(admin);
    const empleados = [await empleadoDe(d, [d.comercioId]), await empleadoDe(d, [d.comercioId])];
    const tareas = [
      ...Array.from({ length: 3 }, () => loginIncorrecto(d).then((r) => ({ tipo: 'login', r }))),
      ...empleados.flatMap((e) => [
        datosOperativos(e, d.comercioId).then((r) => ({ tipo: 'datos', r })),
        estadoProducto(e, d, 'AGOTADO').then((r) => ({ tipo: 'estadoProducto', r })),
        reordenar(e, d).then((r) => ({ tipo: 'orden', r })),
      ]),
      datosOperativos(d, d.comercioId).then((r) => ({ tipo: 'datosDueno', r })),
    ];
    const resultados = await Promise.all(tareas);
    for (const { tipo, r } of resultados) {
      contar(resumen, `${tipo}:${r.status}`);
      if (tipo === 'login') registrar(`ronda ${ronda} login`, r, [200, 401, 409]);
      else registrar(`ronda ${ronda} ${tipo}`, r, [200, 401, 404, 409]);
    }
    for (const e of empleados) {
      const filas = sql(`SELECT actor_rol, usuario_id FROM historial_edicion_comercio WHERE comercio_id = ${d.comercioId} AND usuario_id = ${e.id};`).split('\n').filter(Boolean);
      for (const fila of filas) if (!fila.startsWith('EMPLEADO\t')) problemas.push(`ronda ${ronda}: fila de historial del Empleado ${e.id} con rol ${fila}`);
    }
  }
  console.log('Resumen (3, ediciones de Empleados y Dueño contra el bloqueo de cuenta del Dueño):', resumir(resumen));
  return problemas;
}

async function escenario4(admin) {
  const { problemas, registrar } = nuevoRegistro();
  const resumen = {};
  for (let ronda = 1; ronda <= ROUNDS; ronda++) {
    const d = await comercioListo(admin);
    const empleados = [await empleadoDe(d, [d.comercioId]), await empleadoDe(d, [d.comercioId])];
    const tareas = [
      ...Array.from({ length: 3 }, (_, i) => cerrar(empleados[i % 2], d.comercioId).then((r) => ({ tipo: 'cerrar', r }))),
      ...Array.from({ length: 3 }, (_, i) => abrir(empleados[(i + 1) % 2], d.comercioId).then((r) => ({ tipo: 'abrir', r }))),
      cerrar(d, d.comercioId).then((r) => ({ tipo: 'cerrarDueno', r })),
      abrir(d, d.comercioId).then((r) => ({ tipo: 'abrirDueno', r })),
      ...Array.from({ length: 3 }, () => datosOperativos(empleados[0], d.comercioId).then((r) => ({ tipo: 'datos', r }))),
    ];
    const resultados = await Promise.all(tareas);
    for (const { tipo, r } of resultados) {
      contar(resumen, `${tipo}:${r.status}`);
      registrar(`ronda ${ronda} ${tipo}`, r, [200, 404, 409]);
    }
    const cierres = Number(sql(`SELECT COUNT(*) FROM historial_cierre_comercio WHERE comercio_id = ${d.comercioId};`));
    const bandera = sql(`SELECT cerrado_manualmente FROM comercio WHERE id = ${d.comercioId};`);
    const ultima = sql(`SELECT accion FROM historial_cierre_comercio WHERE comercio_id = ${d.comercioId} ORDER BY id DESC LIMIT 1;`);
    if (cierres > 0 && ((ultima === 'CERRADO') !== (bandera === '1'))) problemas.push(`ronda ${ronda}: la bandera (${bandera}) no coincide con la ultima fila (${ultima})`);
    const raras = sql(`SELECT COUNT(*) FROM historial_cierre_comercio WHERE comercio_id = ${d.comercioId} AND ((actor_rol = 'EMPLEADO' AND actor_usuario_id NOT IN (${empleados.map((e) => e.id).join(',')})) OR (actor_rol = 'DUENO' AND actor_usuario_id <> ${d.duenoId}));`);
    if (Number(raras) > 0) problemas.push(`ronda ${ronda}: filas de cierre con el actor equivocado`);
  }
  console.log('Resumen (4, cerrar y abrir de Empleados y Dueño con ediciones):', resumir(resumen));
  return problemas;
}

async function escenario5(admin) {
  const { problemas, registrar } = nuevoRegistro();
  const resumen = {};
  for (let ronda = 1; ronda <= ROUNDS; ronda++) {
    const d = await comercioListo(admin);
    const empleados = [await empleadoDe(d, [d.comercioId]), await empleadoDe(d, [d.comercioId]), await empleadoDe(d, [d.comercioId])];
    const cliente = await comprador();
    const pedido = await pedidoPendiente(cliente, d.productoId);
    const actores = [...empleados, d];
    const acciones = ['aceptar', 'rechazar', 'aceptar', 'aceptar'];
    const tareas = actores.map((actor, i) => accionPedido(actor, d.comercioId, pedido, acciones[i]).then((r) => ({ tipo: acciones[i], r })));
    const resultados = await Promise.all(tareas);
    let exitos = 0;
    for (const { tipo, r } of resultados) {
      contar(resumen, `${tipo}:${r.status}`);
      registrar(`ronda ${ronda} ${tipo}`, r, [200, 409]);
      if (r.status === 200) exitos++;
    }
    if (exitos !== 1) problemas.push(`ronda ${ronda}: ${exitos} acciones respondieron 200 sobre el mismo pedido pendiente (tiene que ser 1)`);
    const filas = Number(sql(`SELECT COUNT(*) FROM historial_estado_pedido WHERE pedido_id = ${pedido};`));
    if (filas !== 3) problemas.push(`ronda ${ronda}: el pedido tiene ${filas} filas de historial (tiene que haber 3: la creacion, el pago y la accion ganadora)`);
    const estado = sql(`SELECT estado FROM pedido WHERE id = ${pedido};`);
    const ultimo = sql(`SELECT estado FROM historial_estado_pedido WHERE pedido_id = ${pedido} ORDER BY id DESC LIMIT 1;`);
    if (estado !== ultimo) problemas.push(`ronda ${ronda}: estado ${estado} distinto del ultimo historial ${ultimo}`);
    const actor = sql(`SELECT CONCAT(actor_rol, ':', actor_usuario_id) FROM historial_estado_pedido WHERE pedido_id = ${pedido} ORDER BY id DESC LIMIT 1;`);
    const validos = [...empleados.map((e) => `EMPLEADO:${e.id}`), `DUENO:${d.duenoId}`];
    if (!validos.includes(actor)) problemas.push(`ronda ${ronda}: el actor de la transicion ganadora (${actor}) no es ninguno de los que actuaron`);
    const avisos = Number(sql(`SELECT COUNT(*) FROM notificacion WHERE entidad_tipo = 'PEDIDO' AND entidad_id = ${pedido} AND tipo IN ('PEDIDO_ACEPTADO','PEDIDO_RECHAZADO');`));
    if (avisos !== 1) problemas.push(`ronda ${ronda}: ${avisos} avisos al Cliente (tiene que ser 1)`);
  }
  console.log('Resumen (5, tres Empleados y el Dueño sobre el mismo pedido):', resumir(resumen));
  return problemas;
}

async function escenario6(admin) {
  const { problemas, registrar } = nuevoRegistro();
  const resumen = {};
  for (let ronda = 1; ronda <= ROUNDS; ronda++) {
    const d = await comercioListo(admin);
    const empleado = await empleadoDe(d, [d.comercioId]);
    const ajeno = await nuevoClienteVerificado();
    const sesionAjena = await call('POST', '/auth/login', null, { nombreUsuario: ajeno.nombreUsuario, password: ajeno.password });
    const retenida = desactivarMientrasOpera(d.comercioId, empleado.id, 1200);
    await esperar(300);
    const tareas = ['/notificaciones', '/notificaciones/no-leidas/contador'].flatMap((ruta) => [
      call('GET', ruta, empleado.token, undefined, cabecera(d.comercioId)).then((r) => ({ tipo: `empleado${ruta}`, r })),
      call('GET', ruta, sesionAjena.json.data.token, undefined, cabecera(d.comercioId)).then((r) => ({ tipo: `ajeno${ruta}`, r })),
      call('GET', ruta, empleado.token).then((r) => ({ tipo: `sinHeader${ruta}`, r })),
    ]);
    const resultados = await Promise.all(tareas);
    await retenida;
    for (const { tipo, r } of resultados) {
      contar(resumen, `${tipo}:${r.status}`);
      registrar(`ronda ${ronda} ${tipo}`, r, tipo.startsWith('sinHeader') ? [200] : tipo.startsWith('ajeno') ? [404] : [200, 404]);
    }
    const despues = await call('GET', '/notificaciones', empleado.token, undefined, cabecera(d.comercioId));
    if (despues.status !== 404) problemas.push(`ronda ${ronda}: tras la desactivacion las notificaciones dieron ${despues.status} en vez de 404`);
  }
  console.log('Resumen (6, notificaciones con header contra la desactivacion):', resumir(resumen));
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
  const escenarios = [escenario1, escenario2, escenario3, escenario4, escenario5, escenario6];
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
