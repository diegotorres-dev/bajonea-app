import { execFileSync } from 'node:child_process';

const B = process.env.E2E_API_BASE_URL || 'http://localhost:8080/api/v1';
const LOC = process.env.LOC;
const ROUNDS = Number(process.env.ROUNDS || 3);
const ADMIN = { nombreUsuario: process.env.ADMIN_USUARIO || 'adminbajonea', password: process.env.ADMIN_PASSWORD };
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
const ip = () => `172.${1 + Math.floor(Math.random() * 250)}.${1 + Math.floor(Math.random() * 250)}.${1 + Math.floor(Math.random() * 250)}`;
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const aleatorio = (max) => Math.floor(Math.random() * max);

async function call(method, path, token, body, origen) {
  const res = await fetch(B + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(origen ? { 'X-Forwarded-For': origen } : {}),
    },
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

const dni = () => String(Math.floor(20_000_000 + Math.random() * 60_000_000));
const tel = () => `+549296${Math.floor(1_000_000 + Math.random() * 8_999_999)}`;

async function nuevoCliente() {
  const u = uniq();
  const cuerpo = {
    nombre: 'Stress',
    apellido: 'Soporte',
    dni: dni(),
    fechaNacimiento: '1995-05-20',
    telefono: tel(),
    nombreUsuario: `ss${u}`.slice(0, 20),
    email: `stress.soporte.${u}@bajonea.test`,
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
  return { token: login.token, id: login.usuario.id, email: cuerpo.email };
}

const problemas = [];
const resumen = new Map();
const anotar = (clave) => resumen.set(clave, (resumen.get(clave) || 0) + 1);
const exigir = (condicion, mensaje) => {
  if (!condicion) problemas.push(mensaje);
};
const sin5xx = (etiqueta, r) => {
  anotar(`${etiqueta}:${r.status}`);
  if (r.status >= 500) problemas.push(`${etiqueta}: ${r.status} ${JSON.stringify(r.json)}`);
};

const TIPOS = ['APELACION_CUENTA', 'APELACION_COMERCIO', 'NO_PUEDO_ENTRAR', 'COMERCIO_RECHAZADO_DOCUMENTOS_COBROS', 'OTRA'];
const crearSinSesion = (email, origen) => call('POST', '/soporte/publico/consultas', null, { email, tipo: TIPOS[aleatorio(5)], mensaje: 'Consulta de prueba de estres' }, origen);
const crearConSesion = (token, origen) => call('POST', '/soporte/consultas', token, { tipo: TIPOS[aleatorio(5)], mensaje: 'Consulta de prueba de estres' }, origen);
const verPublica = (email, codigo, origen) => call('POST', '/soporte/publico/consultas/ver', null, { email, codigo }, origen);
const responderPublica = (email, codigo, texto, origen) => call('POST', '/soporte/publico/consultas/responder', null, { email, codigo, texto }, origen);
const responderAdmin = (admin, id, texto) => call('POST', `/administrador/soporte/${id}/mensajes`, admin, { texto });
const cerrarAdmin = (admin, id) => call('PUT', `/administrador/soporte/${id}/cerrar`, admin);
const reenviar = (email, origen) => call('POST', '/soporte/publico/codigos/reenviar', null, { email }, origen);

function revisarConsultas(ids, etiqueta) {
  for (const id of ids) {
    const fila = sql(`SELECT CONCAT(estado, '|', cantidad_mensajes) FROM ticket_soporte WHERE id = ${id};`).split('|');
    const estado = fila[0];
    const cantidad = Number(fila[1]);
    const autores = sql(`SELECT autor FROM ticket_soporte_mensaje WHERE ticket_id = ${id} ORDER BY id;`).split(/\r?\n/).filter(Boolean);
    exigir(autores.length === cantidad, `${etiqueta}: la consulta ${id} dice ${cantidad} mensajes y tiene ${autores.length}`);
    exigir(cantidad >= 1 && cantidad <= 20, `${etiqueta}: la consulta ${id} tiene ${cantidad} mensajes`);
    autores.forEach((autor, i) => exigir(autor === (i % 2 === 0 ? 'PERSONA' : 'SOPORTE'), `${etiqueta}: la consulta ${id} rompe el turno en el mensaje ${i + 1} (${autores.join(',')})`));
    if (estado !== 'CERRADO') {
      const esperado = autores[autores.length - 1] === 'PERSONA' ? 'ESPERA_SOPORTE' : 'ESPERA_PERSONA';
      exigir(estado === esperado, `${etiqueta}: la consulta ${id} esta ${estado} y el ultimo mensaje es de ${autores[autores.length - 1]}`);
    }
    if (cantidad === 20) exigir(estado === 'CERRADO', `${etiqueta}: la consulta ${id} llego a 20 y esta ${estado}`);
  }
}

async function rondaDeCreaciones(admin, clientes, ronda) {
  console.log('--- (1) rafaga de creaciones, con y sin sesion, desde pocas IP y pocos emails ---');
  const emails = Array.from({ length: 8 }, () => `stress.soporte.c${uniq()}@bajonea.test`);
  const ips = Array.from({ length: 4 }, ip);
  const tareas = [];
  for (let i = 0; i < 40; i += 1) {
    const email = emails[aleatorio(emails.length)];
    const origen = ips[aleatorio(ips.length)];
    tareas.push(esperar(aleatorio(30)).then(() => crearSinSesion(email, origen)).then((r) => ({ r, email, origen, tipo: 'sin sesion' })));
  }
  for (const cliente of clientes) {
    for (let i = 0; i < 4; i += 1) {
      const origen = ips[aleatorio(ips.length)];
      tareas.push(esperar(aleatorio(30)).then(() => crearConSesion(cliente.token, origen)).then((r) => ({ r, email: cliente.email, origen, tipo: 'con sesion' })));
    }
  }
  const resultados = await Promise.all(tareas);
  resultados.forEach(({ r, tipo }) => {
    sin5xx(`crear ${tipo}`, r);
    exigir(r.status === 201 || r.status === 429, `ronda ${ronda}: crear ${tipo} dio ${r.status}`);
  });
  const todos = [...emails, ...clientes.map((c) => c.email)];
  for (const email of todos) {
    const creadas = Number(sql(`SELECT COUNT(*) FROM ticket_soporte WHERE email = '${email}';`));
    exigir(creadas <= 3, `ronda ${ronda}: ${creadas} consultas del email ${email} (maximo 3)`);
    const exitos = resultados.filter((x) => x.email === email && x.r.status === 201).length;
    exigir(exitos === creadas, `ronda ${ronda}: ${exitos} respuestas 201 y ${creadas} consultas guardadas para ${email}`);
  }
  for (const origen of ips) {
    const creadas = Number(sql(`SELECT COUNT(*) FROM ticket_soporte WHERE ip = '${origen}';`));
    exigir(creadas <= 10, `ronda ${ronda}: ${creadas} consultas desde la IP ${origen} (maximo 10)`);
    const exitos = resultados.filter((x) => x.origen === origen && x.r.status === 201).length;
    exigir(exitos === creadas, `ronda ${ronda}: ${exitos} respuestas 201 y ${creadas} consultas guardadas desde ${origen}`);
  }
  const ids = resultados.filter((x) => x.r.status === 201).map((x) => x.r.json.data.id);
  revisarConsultas(ids, `ronda ${ronda} creaciones`);
  return resultados.filter((x) => x.r.status === 201).map((x) => ({ id: x.r.json.data.id, email: x.email, codigo: x.r.json.data.codigo, tipo: x.tipo }));
}

async function rondaDeConversaciones(admin, consultas, clientes, ronda) {
  console.log('--- (2) respuestas de Soporte y de la persona, con y sin sesion, mas cierres y lecturas del Administrador ---');
  const porCliente = new Map(clientes.map((c) => [c.email, c]));
  const tareas = [];
  for (const c of consultas) {
    const cliente = porCliente.get(c.email);
    for (let vuelta = 0; vuelta < 3; vuelta += 1) {
      tareas.push(esperar(aleatorio(40)).then(() => responderAdmin(admin, c.id, `Respuesta de Soporte ${uniq()}`)).then((r) => ({ r, tipo: 'admin' })));
      tareas.push(esperar(aleatorio(40)).then(() => responderPublica(c.email, c.codigo, `Respuesta ${uniq()}`, ip())).then((r) => ({ r, tipo: 'persona sin sesion' })));
      if (cliente) {
        tareas.push(esperar(aleatorio(40)).then(() => call('POST', `/soporte/mis-consultas/${c.id}/mensajes`, cliente.token, { texto: `Con sesion ${uniq()}` })).then((r) => ({ r, tipo: 'persona con sesion' })));
      }
    }
    if (aleatorio(5) === 0) tareas.push(esperar(aleatorio(60)).then(() => cerrarAdmin(admin, c.id)).then((r) => ({ r, tipo: 'cerrar' })));
    tareas.push(esperar(aleatorio(60)).then(() => call('GET', `/administrador/soporte/${c.id}`, admin)).then((r) => ({ r, tipo: 'detalle' })));
  }
  tareas.push(call('GET', '/administrador/soporte?estado=ESPERAN&limite=50', admin).then((r) => ({ r, tipo: 'bandeja' })));
  tareas.push(call('GET', '/administrador/metricas', admin).then((r) => ({ r, tipo: 'metricas' })));
  const resultados = await Promise.all(tareas);
  resultados.forEach(({ r, tipo }) => {
    sin5xx(`conversacion ${tipo}`, r);
    exigir([200, 409].includes(r.status), `ronda ${ronda}: ${tipo} dio ${r.status}`);
  });
  revisarConsultas(consultas.map((c) => c.id), `ronda ${ronda} conversaciones`);
}

async function rondaDeAccesosIncorrectos(consultas, ronda) {
  console.log('--- (3) accesos con codigos erroneos que superan el limite por email y por IP ---');
  const emailObjetivo = `stress.soporte.x${uniq()}@bajonea.test`;
  const ipObjetivo = ip();
  const tareas = [];
  for (let i = 0; i < 14; i += 1) tareas.push(esperar(aleatorio(20)).then(() => verPublica(emailObjetivo, 'ZZZZZZZZ', ip())).then((r) => ({ r, grupo: 'email' })));
  for (let i = 0; i < 16; i += 1) tareas.push(esperar(aleatorio(20)).then(() => verPublica(`stress.soporte.y${uniq()}@bajonea.test`, 'ZZZZZZZZ', ipObjetivo)).then((r) => ({ r, grupo: 'ip' })));
  if (consultas.length > 0) {
    const c = consultas[0];
    for (let i = 0; i < 6; i += 1) tareas.push(verPublica(c.email, c.codigo, ip()).then((r) => ({ r, grupo: 'correcto' })));
  }
  for (let i = 0; i < 6; i += 1) tareas.push(reenviar(emailObjetivo, ip()).then((r) => ({ r, grupo: 'reenvio' })));
  const resultados = await Promise.all(tareas);
  resultados.forEach(({ r, grupo }) => {
    sin5xx(`acceso ${grupo}`, r);
    exigir([200, 404, 429].includes(r.status), `ronda ${ronda}: acceso ${grupo} dio ${r.status}`);
  });
  const porEmail = resultados.filter((x) => x.grupo === 'email');
  exigir(porEmail.filter((x) => x.r.status === 404).length === 5, `ronda ${ronda}: ${porEmail.filter((x) => x.r.status === 404).length} fallos aceptados para un email (esperados 5)`);
  const porIp = resultados.filter((x) => x.grupo === 'ip');
  exigir(porIp.filter((x) => x.r.status === 404).length === 10, `ronda ${ronda}: ${porIp.filter((x) => x.r.status === 404).length} fallos aceptados para una IP (esperados 10)`);
  const reenvios = resultados.filter((x) => x.grupo === 'reenvio');
  exigir(reenvios.filter((x) => x.r.status === 200).length === 3, `ronda ${ronda}: ${reenvios.filter((x) => x.r.status === 200).length} reenvios aceptados (esperados 3)`);
  const contadorEmail = Number(sql(`SELECT cantidad FROM soporte_limite WHERE clave = 'INTENTO_EMAIL|${emailObjetivo}';`));
  exigir(contadorEmail === 5, `ronda ${ronda}: el contador de intentos del email vale ${contadorEmail}`);
  const contadorIp = Number(sql(`SELECT cantidad FROM soporte_limite WHERE clave = 'INTENTO_IP|${ipObjetivo}';`));
  exigir(contadorIp === 10, `ronda ${ronda}: el contador de intentos de la IP vale ${contadorIp}`);
}

async function rondaDelTope(admin, ronda) {
  console.log('--- (4) el mensaje numero 20 disputado entre dos respuestas de Soporte y mensajes de la persona ---');
  const email = `stress.soporte.t${uniq()}@bajonea.test`;
  const origen = ip();
  const creada = await crearSinSesion(email, origen);
  sin5xx('tope crear', creada);
  if (creada.status !== 201) return;
  const { id, codigo } = creada.json.data;
  for (let turno = 2; turno <= 19; turno += 1) {
    const r = turno % 2 === 0 ? await responderAdmin(admin, id, `Soporte ${turno}`) : await responderPublica(email, codigo, `Persona ${turno}`, origen);
    sin5xx('tope turno', r);
    exigir(r.status === 200, `ronda ${ronda}: el mensaje ${turno} dio ${r.status}`);
  }
  const resultados = await Promise.all([
    responderAdmin(admin, id, 'Veinte A'),
    responderAdmin(admin, id, 'Veinte B'),
    responderPublica(email, codigo, 'Persona fuera de turno', origen),
    responderPublica(email, codigo, 'Persona fuera de turno 2', origen),
    cerrarAdmin(admin, id),
  ]);
  resultados.forEach((r) => sin5xx('tope disputa', r));
  const cantidad = Number(sql(`SELECT cantidad_mensajes FROM ticket_soporte WHERE id = ${id};`));
  exigir(cantidad >= 19 && cantidad <= 20, `ronda ${ronda}: el tope dejo ${cantidad} mensajes`);
  exigir(sql(`SELECT estado FROM ticket_soporte WHERE id = ${id};`) === 'CERRADO' || resultados.every((r) => r.status !== 200), `ronda ${ronda}: ninguna accion cerro la consulta del tope`);
  revisarConsultas([id], `ronda ${ronda} tope`);
}

async function main() {
  const admin = (await call('POST', '/auth/login', null, ADMIN)).json.data.token;
  for (let ronda = 1; ronda <= ROUNDS; ronda += 1) {
    const clientes = [];
    for (let i = 0; i < 4; i += 1) clientes.push(await nuevoCliente());
    const consultas = await rondaDeCreaciones(admin, clientes, ronda);
    await rondaDeConversaciones(admin, consultas, clientes, ronda);
    await rondaDeAccesosIncorrectos(consultas, ronda);
    await rondaDelTope(admin, ronda);
    console.log(`ronda ${ronda}: ${problemas.length === 0 ? 'ok' : `${problemas.length} problema(s) hasta ahora`}`);
  }
  console.log('Resumen de respuestas:', Object.fromEntries([...resumen].sort()));
  if (problemas.length) {
    console.log('PROBLEMAS:\n' + problemas.join('\n'));
    process.exitCode = 1;
  } else {
    console.log('SIN PROBLEMAS (sin 5xx, limites por email e IP exactos, turnos alternados, tope de 20 respetado, contadores de intentos exactos)');
  }
}

main().catch((e) => {
  console.error('FALLO DEL SCRIPT', e);
  process.exit(1);
});
