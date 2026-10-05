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
  const email = `stressc2.${u}@bajonea.test`;
  const nombreUsuario = `sg${u}`.slice(0, 20);
  const r = await call('POST', '/auth/registro/comercio', null, {
    razonSocial: `StressC2 ${u} SRL`,
    cuit: cuit(),
    condicionIva: 'RESPONSABLE_INSCRIPTO',
    tipoSociedad: 'SRL',
    domicilioFiscal: 'Av. Stress 1',
    fechaInicioActividades: '2020-01-01',
    nombre: `StressC2 ${u}`,
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
  const email = `stressc2c.${u}@bajonea.test`;
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

const estadoDe = (comercioId) => sql(`SELECT estado FROM comercio WHERE id = ${comercioId};`);
const estadoUsuarioDe = (usuarioId) => sql(`SELECT estado FROM usuario WHERE id = ${usuarioId};`);
const filasEstadoDe = (comercioId) => {
  const salida = sql(`SELECT CONCAT(estado_origen, '>', estado_destino) FROM historial_estado_comercio WHERE comercio_id = ${comercioId} ORDER BY id;`);
  return salida === '' ? [] : salida.split(/\r?\n/);
};
const banderaDe = (comercioId) => Number(sql(`SELECT cerrado_manualmente FROM comercio WHERE id = ${comercioId};`));
const accionesDe = (comercioId) => {
  const salida = sql(`SELECT accion FROM historial_cierre_comercio WHERE comercio_id = ${comercioId} ORDER BY id;`);
  return salida === '' ? [] : salida.split(/\r?\n/);
};

function cadenaIncoherente(comercioId) {
  const filas = filasEstadoDe(comercioId).map((f) => f.split('>'));
  const errores = [];
  filas.forEach(([origen], i) => {
    if (i > 0 && origen !== filas[i - 1][1]) errores.push(`fila ${i + 1} sale de ${origen} y la anterior termino en ${filas[i - 1][1]} (${filasEstadoDe(comercioId).join(', ')})`);
  });
  if (filas.length && filas[filas.length - 1][1] !== estadoDe(comercioId)) {
    errores.push(`la ultima fila termina en ${filas[filas.length - 1][1]} y el comercio esta en ${estadoDe(comercioId)}`);
  }
  return errores;
}

function accionesIncoherentes(comercioId) {
  const acciones = accionesDe(comercioId);
  const errores = [];
  acciones.forEach((accion, i) => {
    const esperada = i % 2 === 0 ? 'CERRADO' : 'REABIERTO';
    if (accion !== esperada) errores.push(`cierre fila ${i + 1} es ${accion} y se esperaba ${esperada} (${acciones.join(',')})`);
  });
  const ultima = acciones.length ? acciones[acciones.length - 1] : 'REABIERTO';
  if ((ultima === 'CERRADO') !== (banderaDe(comercioId) === 1)) errores.push(`la bandera vale ${banderaDe(comercioId)} y la ultima fila es ${ultima}`);
  return errores;
}

const loginIncorrecto = (dueno) => call('POST', '/auth/login', null, { nombreUsuario: dueno.nombreUsuario, password: 'ClaveIncorrecta1' });
const clonar = async (comercioId, estado) => {
  const r = await call('POST', `/test/comercios/${comercioId}/clonar?nombre=${encodeURIComponent(`Clon ${uniq()}`)}&estado=${estado}`);
  if (r.status !== 201) throw new Error('clonar ' + JSON.stringify(r));
  return r.json.data;
};

async function recuperar(dueno, nuevaPassword) {
  await call('POST', '/auth/recuperar-password', null, { email: dueno.email });
  const codigo = (await call('GET', `/test/token?email=${dueno.email}&tipo=RECUPERACION_PASSWORD`)).json.data;
  const r = await call('POST', '/auth/recuperar-password/confirmar', null, { email: dueno.email, codigo, nuevaPassword });
  if (r.status !== 200) throw new Error('recuperar ' + JSON.stringify(r));
  dueno.password = nuevaPassword;
}

function bloqueoEsperado(respuestas, problemas, etiqueta, esperados401 = 3) {
  const codigos = respuestas.map((r) => r.status).sort().join(',');
  const cantidad401 = respuestas.filter((r) => r.status === 401).length;
  if (cantidad401 !== esperados401) problemas.push(`${etiqueta}: ${cantidad401} respuestas 401 en vez de ${esperados401} (${codigos})`);
  if (respuestas.some((r) => r.status !== 401 && r.status !== 409)) problemas.push(`${etiqueta}: login incorrecto con codigos ${codigos}`);
}

async function categoriaDeLaCorrida(admin) {
  const r = await call('POST', '/categorias', admin, { nombre: `StressC2 ${uniq()}` });
  if (r.status !== 201) throw new Error('categoria ' + JSON.stringify(r));
  return r.json.data.id;
}

async function escenario1(admin, categoriaId) {
  console.log('--- (1) bloqueo del Dueno contra confirmar pedido ---');
  const { problemas, registrar5xx, exigir } = nuevoRegistro();
  const resumenPedidos = new Map();
  const resumenLogin = new Map();
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

    sql(`UPDATE usuario SET intentos_fallidos = 2 WHERE id = ${dueno.duenoId};`);
    const bloquearPrimero = ronda % 3 === 0;
    let finBloqueo = null;
    const tareasLogin = [];
    for (let i = 0; i < 2; i++) {
      tareasLogin.push(
        esperar(bloquearPrimero ? 0 : aleatorio(60)).then(async () => {
          const r = await loginIncorrecto(dueno);
          if (r.status === 401 && r.json?.data?.intentosRestantes === 0) finBloqueo = Date.now();
          return r;
        }),
      );
    }
    const tareasPedido = clientes.map((cliente) =>
      esperar(bloquearPrimero ? 40 + aleatorio(40) : aleatorio(90)).then(async () => {
        const inicio = Date.now();
        const r = await crearPedido(cliente);
        return { r, inicio };
      }),
    );
    const [login1, login2, ...pedidos] = await Promise.all([...tareasLogin, ...tareasPedido]);
    const logins = [login1, login2];

    logins.forEach((r) => {
      registrar5xx(`ronda ${ronda} login`, r);
      contar(resumenLogin, r.status);
    });
    bloqueoEsperado(logins, problemas, `ronda ${ronda}`, 1);
    pedidos.forEach(({ r }) => {
      registrar5xx(`ronda ${ronda} crear pedido`, r);
      contar(resumenPedidos, r.status);
    });
    const creados = pedidos.filter(({ r }) => r.status === 201).length;
    const enBase = Number(sql(`SELECT COUNT(*) FROM pedido WHERE comercio_id = ${dueno.comercioId};`));
    exigir(pedidos.every(({ r }) => r.status === 201 || (r.status === 409 && r.json?.mensaje === MENSAJE_CERRADO)),
      `ronda ${ronda}: respuestas de pedido inesperadas ${JSON.stringify(pedidos.map(({ r }) => [r.status, r.json?.mensaje]))}`);
    exigir(creados === enBase, `ronda ${ronda}: ${creados} pedidos con 201 pero ${enBase} en la base`);
    const nacidosTrasElBloqueo = pedidos.filter(({ r, inicio }) => r.status === 201 && finBloqueo !== null && inicio > finBloqueo).length;
    exigir(nacidosTrasElBloqueo === 0, `ronda ${ronda}: ${nacidosTrasElBloqueo} pedido(s) que empezaron despues del bloqueo nacieron igual`);

    const trasElBloqueo = await crearPedido(rezagado);
    exigir(trasElBloqueo.status === 409 && trasElBloqueo.json?.mensaje === MENSAJE_CERRADO, `ronda ${ronda}: un pedido posterior al bloqueo dio ${trasElBloqueo.status} ${trasElBloqueo.json?.mensaje}`);
    exigir(estadoDe(dueno.comercioId) === 'CERRADO_TEMPORALMENTE', `ronda ${ronda}: el comercio quedo ${estadoDe(dueno.comercioId)}`);
    exigir(estadoUsuarioDe(dueno.duenoId) === 'BLOQUEADO', `ronda ${ronda}: el usuario quedo ${estadoUsuarioDe(dueno.duenoId)}`);
    exigir(filasEstadoDe(dueno.comercioId).filter((f) => f === 'APTO_VENTA>CERRADO_TEMPORALMENTE').length === 1, `ronda ${ronda}: filas de bloqueo ${filasEstadoDe(dueno.comercioId).join(', ')}`);
    cadenaIncoherente(dueno.comercioId).forEach((e) => problemas.push(`ronda ${ronda}: ${e}`));
    console.log(`ronda ${ronda}${bloquearPrimero ? ' (bloquea primero)' : ''}: logins=${logins.map((r) => r.status).join(',')} pedidos=${pedidos.map(({ r }) => r.status).join(',')} en base=${enBase}`);
  }
  console.log('Resumen (1) pedidos:', resumir(resumenPedidos), 'logins:', resumir(resumenLogin));
  return problemas;
}

async function escenario2(admin) {
  console.log('--- (2) bloqueo del Dueno contra cerrar y abrir manual del mismo comercio ---');
  const { problemas, registrar5xx, exigir } = nuevoRegistro();
  const resumen = new Map();
  for (let ronda = 1; ronda <= ROUNDS; ronda++) {
    const dueno = await duenoAprobado(admin, true);
    sql(`UPDATE usuario SET intentos_fallidos = 2 WHERE id = ${dueno.duenoId};`);
    const tareas = [];
    for (let i = 0; i < 2; i++) tareas.push(esperar(aleatorio(60)).then(() => loginIncorrecto(dueno)).then((r) => ({ tipo: 'login', r })));
    for (let i = 0; i < 8; i++) {
      const operacion = i % 2 === 0 ? cerrar : abrir;
      tareas.push(esperar(aleatorio(90)).then(() => operacion(dueno)).then((r) => ({ tipo: 'cierre', r })));
    }
    const resultados = await Promise.all(tareas);
    resultados.forEach(({ tipo, r }) => {
      registrar5xx(`ronda ${ronda} ${tipo}`, r);
      contar(resumen, `${tipo}:${r.status}`);
    });
    bloqueoEsperado(resultados.filter(({ tipo }) => tipo === 'login').map(({ r }) => r), problemas, `ronda ${ronda}`, 1);
    exigir(resultados.filter(({ tipo }) => tipo === 'cierre').every(({ r }) => r.status === 200 || r.status === 409 || r.status === 401),
      `ronda ${ronda}: cerrar/abrir con ${resultados.filter(({ tipo }) => tipo === 'cierre').map(({ r }) => r.status)}`);
    exigir(estadoDe(dueno.comercioId) === 'CERRADO_TEMPORALMENTE', `ronda ${ronda}: el comercio quedo ${estadoDe(dueno.comercioId)}`);
    accionesIncoherentes(dueno.comercioId).forEach((e) => problemas.push(`ronda ${ronda}: ${e}`));
    cadenaIncoherente(dueno.comercioId).forEach((e) => problemas.push(`ronda ${ronda}: ${e}`));
    console.log(`ronda ${ronda}: cierres=${accionesDe(dueno.comercioId).join(',') || '-'} bandera=${banderaDe(dueno.comercioId)} estado=${estadoDe(dueno.comercioId)}`);
  }
  console.log('Resumen (2):', resumir(resumen));
  return problemas;
}

async function escenario3(admin) {
  console.log('--- (3) bloqueo del Dueno contra desvincular Mercado Pago ---');
  const { problemas, registrar5xx, exigir } = nuevoRegistro();
  const resumen = new Map();
  for (let ronda = 1; ronda <= ROUNDS; ronda++) {
    const dueno = await duenoAprobado(admin, true);
    const adicional = await clonar(dueno.comercioId, 'APTO_VENTA');
    sql(`UPDATE usuario SET intentos_fallidos = 2 WHERE id = ${dueno.duenoId};`);
    const tareas = [];
    for (let i = 0; i < 2; i++) tareas.push(esperar(aleatorio(40)).then(() => loginIncorrecto(dueno)).then((r) => ({ tipo: 'login', r })));
    for (let i = 0; i < 3; i++) tareas.push(esperar(aleatorio(220)).then(() => desvincular(dueno)).then((r) => ({ tipo: 'desvincular', r })));
    const resultados = await Promise.all(tareas);
    resultados.forEach(({ tipo, r }) => {
      registrar5xx(`ronda ${ronda} ${tipo}`, r);
      contar(resumen, `${tipo}:${r.status}`);
    });
    bloqueoEsperado(resultados.filter(({ tipo }) => tipo === 'login').map(({ r }) => r), problemas, `ronda ${ronda}`, 1);
    const desvinculaciones = resultados.filter(({ tipo }) => tipo === 'desvincular').map(({ r }) => r.status);
    exigir(desvinculaciones.filter((s) => s === 200).length <= 1, `ronda ${ronda}: mas de una desvinculacion exitosa ${desvinculaciones}`);
    exigir(desvinculaciones.every((s) => [200, 401, 404].includes(s)), `ronda ${ronda}: desvincular dio ${desvinculaciones}`);
    const estados = [dueno.comercioId, adicional].map(estadoDe);
    const cuentaActiva = sql(`SELECT activa FROM cuenta_mercado_pago WHERE dueno_id = ${dueno.duenoId};`);
    const desvinculo = desvinculaciones.includes(200);
    exigir(cuentaActiva === (desvinculo ? '0' : '1'), `ronda ${ronda}: cuenta activa=${cuentaActiva} y desvinculo=${desvinculo}`);
    exigir(estados.every((estado) => ['CERRADO_TEMPORALMENTE', 'APROBADO'].includes(estado)), `ronda ${ronda}: estados finales ${estados}`);
    [dueno.comercioId, adicional].forEach((id) => cadenaIncoherente(id).forEach((e) => problemas.push(`ronda ${ronda}: comercio ${id}: ${e}`)));
    await recuperar(dueno, 'Testing456');
    const tras = [dueno.comercioId, adicional].map(estadoDe);
    exigir(tras.every((estado) => estado === (desvinculo ? 'APROBADO' : 'APTO_VENTA')), `ronda ${ronda}: tras recuperar ${tras} y desvinculo=${desvinculo}`);
    [dueno.comercioId, adicional].forEach((id) => cadenaIncoherente(id).forEach((e) => problemas.push(`ronda ${ronda} (tras recuperar): comercio ${id}: ${e}`)));
    console.log(`ronda ${ronda}: desvincular=${desvinculaciones} bloqueados=${estados} tras recuperar=${tras}`);
  }
  console.log('Resumen (3):', resumir(resumen));
  return problemas;
}

async function escenario4(admin) {
  console.log('--- (4) bloqueo y desbloqueo repetidos con varios comercios del mismo Dueno ---');
  const { problemas, registrar5xx, exigir } = nuevoRegistro();
  const resumen = new Map();
  for (let ronda = 1; ronda <= Math.max(3, Math.floor(ROUNDS / 2)); ronda++) {
    const dueno = await duenoAprobado(admin, true);
    const comercios = [dueno.comercioId, await clonar(dueno.comercioId, 'APTO_VENTA'), await clonar(dueno.comercioId, 'APTO_VENTA')];
    const suspendido = await clonar(dueno.comercioId, 'SUSPENDIDO');
    for (let ciclo = 1; ciclo <= 3; ciclo++) {
      const etiqueta = `ronda ${ronda} ciclo ${ciclo}`;
      const logins = await Promise.all(Array.from({ length: 5 }, () => esperar(aleatorio(25)).then(() => loginIncorrecto(dueno))));
      logins.forEach((r) => {
        registrar5xx(`${etiqueta} login`, r);
        contar(resumen, `login:${r.status}`);
      });
      bloqueoEsperado(logins, problemas, etiqueta);
      const bloqueados = comercios.map(estadoDe);
      exigir(bloqueados.every((e) => e === 'CERRADO_TEMPORALMENTE'), `${etiqueta}: tras bloquear ${bloqueados}`);
      exigir(estadoDe(suspendido) === 'SUSPENDIDO', `${etiqueta}: el suspendido quedo ${estadoDe(suspendido)}`);
      exigir(estadoUsuarioDe(dueno.duenoId) === 'BLOQUEADO', `${etiqueta}: usuario ${estadoUsuarioDe(dueno.duenoId)}`);

      await call('POST', '/auth/recuperar-password', null, { email: dueno.email });
      const codigo = (await call('GET', `/test/token?email=${dueno.email}&tipo=RECUPERACION_PASSWORD`)).json.data;
      const nuevaPassword = `Testing4${ciclo}6`;
      const confirmaciones = await Promise.all(
        Array.from({ length: 3 }, () => esperar(aleatorio(25)).then(() => call('POST', '/auth/recuperar-password/confirmar', null, { email: dueno.email, codigo, nuevaPassword }))),
      );
      confirmaciones.forEach((r) => {
        registrar5xx(`${etiqueta} recuperar`, r);
        contar(resumen, `recuperar:${r.status}`);
      });
      exigir(confirmaciones.filter((r) => r.status === 200).length === 1, `${etiqueta}: confirmaciones ${confirmaciones.map((r) => r.status)}`);
      dueno.password = nuevaPassword;
      const restaurados = comercios.map(estadoDe);
      exigir(restaurados.every((e) => e === 'APTO_VENTA'), `${etiqueta}: tras recuperar ${restaurados}`);
      exigir(estadoUsuarioDe(dueno.duenoId) === 'ACTIVO', `${etiqueta}: usuario ${estadoUsuarioDe(dueno.duenoId)}`);
      comercios.forEach((id) => {
        const filas = filasEstadoDe(id).filter((f) => f.includes('CERRADO_TEMPORALMENTE'));
        exigir(filas.length === ciclo * 2, `${etiqueta}: comercio ${id} con ${filas.length} filas de bloqueo y restauracion (se esperaban ${ciclo * 2}): ${filas.join(', ')}`);
      });
      console.log(`${etiqueta}: logins=${logins.map((r) => r.status)} bloqueados=${bloqueados.join('/')} restaurados=${restaurados.join('/')}`);
    }
    [...comercios, suspendido].forEach((id) => cadenaIncoherente(id).forEach((e) => problemas.push(`ronda ${ronda}: comercio ${id}: ${e}`)));
  }
  console.log('Resumen (4):', resumir(resumen));
  return problemas;
}

async function escenario5(admin) {
  console.log('--- (5) bloqueo del Dueno contra la aprobacion de otro comercio pendiente del mismo Dueno ---');
  const { problemas, registrar5xx, exigir } = nuevoRegistro();
  const resumen = new Map();
  for (let ronda = 1; ronda <= ROUNDS; ronda++) {
    const dueno = await duenoAprobado(admin, true);
    const pendiente = await clonar(dueno.comercioId, 'PENDIENTE');
    sql(`UPDATE usuario SET intentos_fallidos = 2 WHERE id = ${dueno.duenoId};`);
    const tareas = [esperar(aleatorio(60)).then(() => call('PUT', `/administrador/comercios/${pendiente}/resolver`, admin, { aprobar: true })).then((r) => ({ tipo: 'aprobar', r }))];
    for (let i = 0; i < 2; i++) tareas.push(esperar(aleatorio(60)).then(() => loginIncorrecto(dueno)).then((r) => ({ tipo: 'login', r })));
    const resultados = await Promise.all(tareas);
    resultados.forEach(({ tipo, r }) => {
      registrar5xx(`ronda ${ronda} ${tipo}`, r);
      contar(resumen, `${tipo}:${r.status}`);
    });
    bloqueoEsperado(resultados.filter(({ tipo }) => tipo === 'login').map(({ r }) => r), problemas, `ronda ${ronda}`, 1);
    const aprobacion = resultados.find(({ tipo }) => tipo === 'aprobar').r;
    exigir(aprobacion.status === 200, `ronda ${ronda}: aprobar dio ${aprobacion.status}`);
    exigir(estadoDe(dueno.comercioId) === 'CERRADO_TEMPORALMENTE', `ronda ${ronda}: el comercio base quedo ${estadoDe(dueno.comercioId)}`);
    exigir(['APTO_VENTA', 'CERRADO_TEMPORALMENTE'].includes(estadoDe(pendiente)), `ronda ${ronda}: el aprobado quedo ${estadoDe(pendiente)}`);
    [dueno.comercioId, pendiente].forEach((id) => cadenaIncoherente(id).forEach((e) => problemas.push(`ronda ${ronda}: comercio ${id}: ${e}`)));
    console.log(`ronda ${ronda}: aprobar=${aprobacion.status} base=${estadoDe(dueno.comercioId)} aprobado=${estadoDe(pendiente)}`);
  }
  console.log('Resumen (5):', resumir(resumen));
  return problemas;
}

async function main() {
  const admin = (await call('POST', '/auth/login', null, ADMIN)).json.data.token;
  const categoriaId = await categoriaDeLaCorrida(admin);
  const solo = process.env.ESCENARIO;
  const todos = [];
  if (!solo || solo === '1') todos.push(...(await escenario1(admin, categoriaId)));
  if (!solo || solo === '2') todos.push(...(await escenario2(admin)));
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
