import { execFileSync } from 'node:child_process';

const B = process.env.E2E_API_BASE_URL || 'http://localhost:8080/api/v1';
const LOC = process.env.LOC;
const CLOUD = process.env.CLOUDINARY_CLOUD_NAME;
const ROUNDS = Number(process.env.ROUNDS || 12);
const CLIENTES_POR_RONDA = Number(process.env.CLIENTES || 6);
const ADMIN = { nombreUsuario: 'adminbajonea', password: process.env.ADMIN_PASSWORD || 'PostmanAdmin123' };
const sql = (q) => execFileSync('C:/xampp/mysql/bin/mysql.exe', ['-u', 'root', '-N', '-B', 'bajonea_test', '-e', q]).toString().trim();
const MENSAJE_CERRADO = 'Este comercio está cerrado en este momento';

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
  const email = `stressc1.${u}@bajonea.test`;
  const nombreUsuario = `sg${u}`.slice(0, 20);
  const r = await call('POST', '/auth/registro/comercio', null, {
    razonSocial: `StressC1 ${u} SRL`,
    cuit: cuit(),
    condicionIva: 'RESPONSABLE_INSCRIPTO',
    tipoSociedad: 'SRL',
    domicilioFiscal: 'Av. Stress 1',
    fechaInicioActividades: '2020-01-01',
    nombre: `StressC1 ${u}`,
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
    redesSociales: [{ tipo: 'INSTAGRAM', url: `https://instagram.com/sg${u}` }],
  });
  if (r.status !== 201) throw new Error('registro dueno ' + JSON.stringify(r));
  const login = await verificarYLoguear(email, nombreUsuario, 'Testing123');
  return { email, nombreUsuario, password: 'Testing123', token: login.token, duenoId: login.usuario.id };
}

async function nuevoCliente() {
  const u = uniq();
  const email = `stressc1c.${u}@bajonea.test`;
  const nombreUsuario = `sh${u}`.slice(0, 20);
  const r = await call('POST', '/auth/registro/cliente', null, {
    nombre: 'Cliente',
    apellido: 'Stress',
    dni: dni(),
    fechaNacimiento: '1995-05-20',
    telefono: tel(),
    nombreUsuario,
    email,
    password: 'Testing123',
    direccion: { calle: 'Stress', numero: '1', pisoDepto: null, codigoPostal: '9420', localidadId: LOC, principal: true },
  });
  if (r.status !== 201) throw new Error('registro cliente ' + JSON.stringify(r));
  const login = await verificarYLoguear(email, nombreUsuario, 'Testing123');
  return { token: login.token };
}

async function duenoAprobado(admin, conMercadoPago) {
  const d = await nuevoDueno();
  const pendiente = (await call('GET', '/administrador/comercios/pendientes', admin)).json.data.find((c) => c.emailCuenta === d.email);
  if (conMercadoPago) {
    const v = await call('POST', `/test/duenos/${d.duenoId}/mercadopago-simulada`);
    if (v.status !== 200) throw new Error('vincular ' + JSON.stringify(v));
  }
  const aprobado = await call('PUT', `/administrador/comercios/${pendiente.id}/resolver`, admin, { aprobar: true });
  if (aprobado.status !== 200) throw new Error('aprobar ' + JSON.stringify(aprobado));
  d.comercioId = pendiente.id;
  return d;
}

async function crearProducto(dueno, categoriaId) {
  const r = await call('POST', '/productos', dueno.token, { nombre: `Producto ${uniq()}`, precio: 1500, categoriaId }, { 'X-Comercio-Id': String(dueno.comercioId) });
  if (r.status !== 201) throw new Error('producto ' + JSON.stringify(r));
  return r.json.data.id;
}

const cabecera = (dueno) => ({ 'X-Comercio-Id': String(dueno.comercioId) });
const cerrar = (dueno) => call('PUT', '/comercios/cerrar', dueno.token, undefined, cabecera(dueno));
const abrir = (dueno) => call('PUT', '/comercios/abrir', dueno.token, undefined, cabecera(dueno));
const editarPerfil = (dueno, nombre) =>
  call('PUT', '/comercios/perfil', dueno.token, { nombre, descripcion: 'x', telefono: tel(), emailContacto: dueno.email, aceptaDelivery: false, aceptaRetiro: true }, cabecera(dueno));
const desvincular = (dueno) => call('DELETE', '/oauth/mercadopago/desvincular', dueno.token);
const vincular = (dueno, mpUserId) => call('POST', `/test/duenos/${dueno.duenoId}/mercadopago-simulada${mpUserId ? `?mpUserId=${mpUserId}` : ''}`);
const correrJob = (ahora) => call('POST', `/test/jobs/reapertura-comercios${ahora ? `?ahora=${encodeURIComponent(ahora)}` : ''}`);
const agregarAlCarrito = (cliente, productoId) => call('POST', '/carrito/items', cliente.token, { productoId, cantidad: 1 });
const crearPedido = (cliente) => call('POST', '/pedidos/cliente', cliente.token, { tipoEntrega: 'RETIRO', direccionId: null });

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

const banderaDe = (comercioId) => Number(sql(`SELECT cerrado_manualmente FROM comercio WHERE id = ${comercioId};`));
const accionesDe = (comercioId) => {
  const salida = sql(`SELECT accion FROM historial_cierre_comercio WHERE comercio_id = ${comercioId} ORDER BY id;`);
  return salida === '' ? [] : salida.split(/\r?\n/);
};
const fechasDe = (comercioId) => {
  const salida = sql(`SELECT UNIX_TIMESTAMP(fecha_hora) FROM historial_cierre_comercio WHERE comercio_id = ${comercioId} ORDER BY id;`);
  return salida === '' ? [] : salida.split(/\r?\n/).map(Number);
};

function historialIncoherente(comercioId, { fechasMonotonas }) {
  const acciones = accionesDe(comercioId);
  const bandera = banderaDe(comercioId);
  const errores = [];
  acciones.forEach((accion, i) => {
    const esperada = i % 2 === 0 ? 'CERRADO' : 'REABIERTO';
    if (accion !== esperada) errores.push(`fila ${i + 1} es ${accion} y se esperaba ${esperada} (${acciones.join(',')})`);
  });
  const ultima = acciones.length ? acciones[acciones.length - 1] : 'REABIERTO';
  if ((ultima === 'CERRADO') !== (bandera === 1)) errores.push(`la bandera vale ${bandera} y la ultima fila es ${ultima}`);
  if (fechasMonotonas) {
    const fechas = fechasDe(comercioId);
    for (let i = 1; i < fechas.length; i++) if (fechas[i] < fechas[i - 1]) errores.push(`fecha_hora retrocede en la fila ${i + 1}`);
  }
  return errores;
}

async function categoriaDeLaCorrida(admin) {
  const r = await call('POST', '/categorias', admin, { nombre: `StressC1 ${uniq()}` });
  if (r.status !== 201) throw new Error('categoria ' + JSON.stringify(r));
  return r.json.data.id;
}

async function escenario1(admin) {
  console.log('--- (1) muchos cerrar y abrir concurrentes sobre el mismo comercio ---');
  const { problemas, registrar5xx, exigir } = nuevoRegistro();
  const resumen = new Map();
  for (let ronda = 1; ronda <= ROUNDS; ronda++) {
    const dueno = await duenoAprobado(admin, ronda % 2 === 0);
    const tareas = [];
    for (let i = 0; i < 14; i++) {
      const operacion = Math.random() < 0.5 ? cerrar : abrir;
      tareas.push(esperar(aleatorio(25)).then(() => operacion(dueno)));
    }
    const respuestas = await Promise.all(tareas);
    respuestas.forEach((r) => {
      registrar5xx(`ronda ${ronda}`, r);
      contar(resumen, r.status);
    });
    exigir(respuestas.every((r) => r.status === 200), `ronda ${ronda}: respuestas ${respuestas.map((r) => r.status)} (se esperaba 200 siempre)`);
    const errores = historialIncoherente(dueno.comercioId, { fechasMonotonas: true });
    errores.forEach((e) => problemas.push(`ronda ${ronda}: ${e}`));
    console.log(`ronda ${ronda}: filas=${accionesDe(dueno.comercioId).length} bandera=${banderaDe(dueno.comercioId)} ${errores.length ? '<-- INCOHERENTE' : ''}`);
  }
  console.log('Resumen (1):', resumir(resumen));
  return problemas;
}

async function escenario2(admin, categoriaId) {
  console.log('--- (2) cerrar contra confirmar pedido ---');
  const { problemas, registrar5xx, exigir } = nuevoRegistro();
  const resumenPedidos = new Map();
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

    const rezagado = await nuevoCliente();
    const agregadoRezagado = await agregarAlCarrito(rezagado, productoId);
    if (agregadoRezagado.status !== 201) throw new Error('carrito ' + JSON.stringify(agregadoRezagado));

    const cerrarPrimero = ronda % 3 === 0;
    let finCierre = null;
    const tareaCierre = esperar(cerrarPrimero ? 0 : aleatorio(30)).then(async () => {
      const r = await cerrar(dueno);
      finCierre = Date.now();
      return r;
    });
    const tareas = clientes.map((cliente) =>
      esperar(cerrarPrimero ? 20 + aleatorio(15) : aleatorio(45)).then(async () => {
        const inicio = Date.now();
        const r = await crearPedido(cliente);
        return { r, inicio };
      }),
    );
    const [respuestaCierre, ...pedidos] = await Promise.all([tareaCierre, ...tareas]);

    registrar5xx(`ronda ${ronda} cerrar`, respuestaCierre);
    pedidos.forEach(({ r }) => {
      registrar5xx(`ronda ${ronda} crear pedido`, r);
      contar(resumenPedidos, r.status);
    });
    const creados = pedidos.filter(({ r }) => r.status === 201).length;
    const enBase = Number(sql(`SELECT COUNT(*) FROM pedido WHERE comercio_id = ${dueno.comercioId};`));
    exigir(respuestaCierre.status === 200, `ronda ${ronda}: cerrar respondio ${respuestaCierre.status}`);
    exigir(pedidos.every(({ r }) => r.status === 201 || (r.status === 409 && r.json?.mensaje === MENSAJE_CERRADO)),
      `ronda ${ronda}: respuestas de pedido inesperadas ${JSON.stringify(pedidos.map(({ r }) => [r.status, r.json?.mensaje]))}`);
    exigir(creados === enBase, `ronda ${ronda}: ${creados} pedidos con 201 pero ${enBase} en la base`);
    const nacidosTrasElCierre = pedidos.filter(({ r, inicio }) => r.status === 201 && finCierre !== null && inicio > finCierre).length;
    exigir(nacidosTrasElCierre === 0, `ronda ${ronda}: ${nacidosTrasElCierre} pedido(s) que empezaron despues de la respuesta del cierre nacieron igual`);

    const trasElCierre = await crearPedido(rezagado);
    exigir(trasElCierre.status === 409 && trasElCierre.json?.mensaje === MENSAJE_CERRADO, `ronda ${ronda}: un pedido posterior al cierre dio ${trasElCierre.status}`);
    exigir(banderaDe(dueno.comercioId) === 1, `ronda ${ronda}: la bandera no quedo prendida`);
    console.log(`ronda ${ronda}${cerrarPrimero ? ' (cierra primero)' : ''}: cerrar=${respuestaCierre.status} pedidos=${pedidos.map(({ r }) => r.status).join(',')} en base=${enBase}`);
  }
  console.log('Resumen (2) pedidos:', resumir(resumenPedidos));
  return problemas;
}

async function escenario3(admin) {
  console.log('--- (3) cerrar contra desvincular Mercado Pago ---');
  const { problemas, registrar5xx, exigir } = nuevoRegistro();
  const resumenCerrar = new Map();
  const resumenDesvincular = new Map();
  for (let ronda = 1; ronda <= ROUNDS; ronda++) {
    const dueno = await duenoAprobado(admin, true);
    const tareas = [];
    for (let i = 0; i < 4; i++) {
      tareas.push(esperar(aleatorio(25)).then(() => cerrar(dueno)).then((r) => ({ tipo: 'cerrar', r })));
      tareas.push(esperar(aleatorio(25)).then(() => desvincular(dueno)).then((r) => ({ tipo: 'desvincular', r })));
    }
    tareas.push(esperar(aleatorio(25)).then(() => abrir(dueno)).then((r) => ({ tipo: 'abrir', r })));
    const resultados = await Promise.all(tareas);
    resultados.forEach(({ tipo, r }) => {
      registrar5xx(`ronda ${ronda} ${tipo}`, r);
      if (tipo === 'desvincular') contar(resumenDesvincular, r.status);
      else contar(resumenCerrar, r.status);
    });
    exigir(resultados.filter(({ tipo }) => tipo !== 'desvincular').every(({ r }) => r.status === 200), `ronda ${ronda}: cerrar/abrir con respuestas inesperadas`);
    const codigosDesvincular = resultados.filter(({ tipo }) => tipo === 'desvincular').map(({ r }) => r.status).sort().join(',');
    exigir(codigosDesvincular === '200,404,404,404', `ronda ${ronda}: desvincular dio ${codigosDesvincular} (se esperaba 200,404,404,404)`);
    exigir(sql(`SELECT estado FROM comercio WHERE id = ${dueno.comercioId};`) === 'APROBADO', `ronda ${ronda}: el comercio no quedo APROBADO tras desvincular`);
    historialIncoherente(dueno.comercioId, { fechasMonotonas: true }).forEach((e) => problemas.push(`ronda ${ronda}: ${e}`));
    console.log(`ronda ${ronda}: desvincular=${codigosDesvincular} bandera=${banderaDe(dueno.comercioId)} filas=${accionesDe(dueno.comercioId).length}`);
  }
  console.log('Resumen (3) cerrar/abrir:', resumir(resumenCerrar), 'desvincular:', resumir(resumenDesvincular));
  return problemas;
}

async function escenario4(admin) {
  console.log('--- (4) un save concurrente del mismo comercio no pisa la bandera ---');
  const { problemas, registrar5xx, exigir } = nuevoRegistro();
  const resumen = new Map();
  for (let ronda = 1; ronda <= ROUNDS; ronda++) {
    const dueno = await duenoAprobado(admin, ronda % 2 === 0);
    const cuenta = `stressc1-${uniq()}`;
    const tareas = [esperar(aleatorio(15)).then(() => cerrar(dueno)).then((r) => ({ tipo: 'cerrar', r }))];
    for (let i = 0; i < 6; i++) {
      tareas.push(esperar(aleatorio(40)).then(() => editarPerfil(dueno, `Stress Edit ${ronda} ${i} ${uniq()}`)).then((r) => ({ tipo: 'editar', r })));
    }
    for (let i = 0; i < 2; i++) {
      tareas.push(esperar(aleatorio(40)).then(() => vincular(dueno, cuenta)).then((r) => ({ tipo: 'vincular', r })));
      tareas.push(esperar(aleatorio(40)).then(() => desvincular(dueno)).then((r) => ({ tipo: 'desvincular', r })));
    }
    const resultados = await Promise.all(tareas);
    resultados.forEach(({ tipo, r }) => {
      registrar5xx(`ronda ${ronda} ${tipo}`, r);
      contar(resumen, `${tipo}:${r.status}`);
    });
    exigir(resultados.find(({ tipo }) => tipo === 'cerrar').r.status === 200, `ronda ${ronda}: cerrar no dio 200`);
    exigir(resultados.filter(({ tipo }) => tipo === 'editar').every(({ r }) => r.status === 200), `ronda ${ronda}: alguna edicion de perfil no dio 200`);
    exigir(banderaDe(dueno.comercioId) === 1, `ronda ${ronda}: la bandera quedo en ${banderaDe(dueno.comercioId)} tras cerrar y guardar en paralelo`);
    exigir(accionesDe(dueno.comercioId).join(',') === 'CERRADO', `ronda ${ronda}: historial ${accionesDe(dueno.comercioId).join(',')}`);
    console.log(`ronda ${ronda}: bandera=${banderaDe(dueno.comercioId)} filas=${accionesDe(dueno.comercioId).length}`);
  }
  console.log('Resumen (4):', resumir(resumen));
  return problemas;
}

async function escenario5(admin) {
  console.log('--- (5) job de reapertura contra cerrar y abrir ---');
  const { problemas, registrar5xx, exigir } = nuevoRegistro();
  const resumen = new Map();
  const futuro = () => sql(`SELECT DATE_FORMAT(DATE_ADD(NOW(), INTERVAL 9 DAY), '%Y-%m-%dT%H:%i:%s');`);
  for (let ronda = 1; ronda <= ROUNDS; ronda++) {
    const dueno = await duenoAprobado(admin, ronda % 2 === 0);
    const ahora = futuro();
    const tareas = [];
    for (let i = 0; i < 4; i++) {
      tareas.push(esperar(aleatorio(25)).then(() => cerrar(dueno)).then((r) => ({ tipo: 'cerrar', r })));
      tareas.push(esperar(aleatorio(25)).then(() => correrJob(ahora)).then((r) => ({ tipo: 'job', r })));
    }
    tareas.push(esperar(aleatorio(25)).then(() => abrir(dueno)).then((r) => ({ tipo: 'abrir', r })));
    const resultados = await Promise.all(tareas);
    resultados.forEach(({ tipo, r }) => {
      registrar5xx(`ronda ${ronda} ${tipo}`, r);
      contar(resumen, `${tipo}:${r.status}`);
    });
    exigir(resultados.every(({ r }) => r.status === 200), `ronda ${ronda}: respuestas ${resultados.map(({ tipo, r }) => `${tipo}=${r.status}`)}`);
    historialIncoherente(dueno.comercioId, { fechasMonotonas: false }).forEach((e) => problemas.push(`ronda ${ronda}: ${e}`));
    const reabiertasPorSistema = Number(sql(`SELECT COUNT(*) FROM historial_cierre_comercio WHERE comercio_id = ${dueno.comercioId} AND accion = 'REABIERTO' AND actor_rol = 'SISTEMA';`));
    const sistemaConUsuario = Number(sql(`SELECT COUNT(*) FROM historial_cierre_comercio WHERE comercio_id = ${dueno.comercioId} AND actor_rol = 'SISTEMA' AND actor_usuario_id IS NOT NULL;`));
    exigir(sistemaConUsuario === 0, `ronda ${ronda}: filas SISTEMA con usuario`);
    console.log(`ronda ${ronda}: acciones=${accionesDe(dueno.comercioId).join(',')} bandera=${banderaDe(dueno.comercioId)} reabiertas por el sistema=${reabiertasPorSistema}`);
  }
  console.log('Resumen (5):', resumir(resumen));
  return problemas;
}

async function main() {
  const admin = (await call('POST', '/auth/login', null, ADMIN)).json.data.token;
  const categoriaId = await categoriaDeLaCorrida(admin);
  const solo = process.env.ESCENARIO;
  const todos = [];
  if (!solo || solo === '1') todos.push(...(await escenario1(admin)));
  if (!solo || solo === '2') todos.push(...(await escenario2(admin, categoriaId)));
  if (!solo || solo === '3') todos.push(...(await escenario3(admin)));
  if (!solo || solo === '4') todos.push(...(await escenario4(admin)));
  if (!solo || solo === '5') todos.push(...(await escenario5(admin)));
  console.log(todos.length ? 'PROBLEMAS:\n' + todos.join('\n') : 'SIN PROBLEMAS (sin 5xx, sin inconsistencias)');
  if (todos.length) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
