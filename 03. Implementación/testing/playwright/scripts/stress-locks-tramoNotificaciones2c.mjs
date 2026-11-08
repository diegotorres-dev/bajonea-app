import { execFileSync } from 'node:child_process';

const B = process.env.E2E_API_BASE_URL || 'http://localhost:8080/api/v1';
const LOC = process.env.LOC;
const ROUNDS = Number(process.env.ROUNDS || 3);
if (!LOC) {
  console.error('Falta LOC (id de la localidad Río Grande)');
  process.exit(1);
}

const MYSQL = process.env.MYSQL_BIN || 'C:/xampp/mysql/bin/mysql.exe';
const sql = (q) => execFileSync(MYSQL, ['-u', 'root', '-N', '-B', '--default-character-set=utf8mb4', 'bajonea_test'], { input: q }).toString().trim();

let seq = Date.now() % 100000;
const uniq = () => `${Date.now().toString(36)}${(seq++).toString(36)}`.slice(-10);
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const aleatorio = (max) => Math.floor(Math.random() * max);

async function call(method, path, token, body) {
  const res = await fetch(B + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  return { status: res.status, json, cursor: res.headers.get('X-Siguiente-Cursor') };
}

const dni = () => String(Math.floor(20_000_000 + Math.random() * 60_000_000));
const tel = () => `+549296${Math.floor(1_000_000 + Math.random() * 8_999_999)}`;

async function nuevoCliente() {
  const u = uniq();
  const cuerpo = {
    nombre: 'Stress',
    apellido: 'Avisos',
    dni: dni(),
    fechaNacimiento: '1995-05-20',
    telefono: tel(),
    nombreUsuario: `sa${u}`.slice(0, 20),
    email: `stress.avisos.${u}@bajonea.test`,
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

const problemas = [];
const resumen = new Map();
const anotar = (clave) => resumen.set(clave, (resumen.get(clave) || 0) + 1);
const exigir = (condicion, mensaje) => {
  if (!condicion) problemas.push(mensaje);
};
const sin5xx = (etiqueta, r) => {
  anotar(`${etiqueta}:${r.status}`);
  exigir(r.status < 500, `${etiqueta}: respondio ${r.status} ${JSON.stringify(r.json)}`);
};

async function recorrerPaginas(cliente, ronda) {
  const ids = [];
  let cursor = null;
  let paginas = 0;
  do {
    const r = await call('GET', cursor ? `/notificaciones?cursor=${encodeURIComponent(cursor)}` : '/notificaciones', cliente.token);
    sin5xx('lista', r);
    if (r.status !== 200) return null;
    r.json.data.forEach((n) => ids.push({ id: n.id, fecha: n.fechaCreacion }));
    cursor = r.cursor;
    paginas += 1;
    exigir(paginas < 100, `ronda ${ronda}: el recorrido no termina`);
  } while (cursor && paginas < 100);
  return ids;
}

async function ronda(numero) {
  console.log(`--- ronda ${numero}: marcar todas mientras llegan avisos y se lee la lista ---`);
  const cliente = await nuevoCliente();
  const sembrados = 200;
  const inicial = await call('POST', `/test/usuarios/${cliente.id}/avisos-personales?cantidad=${sembrados}`, undefined, {});
  sin5xx('siembra', inicial);
  let total = sembrados;
  let marcadas = 0;

  const tareas = [];
  for (let i = 0; i < 4; i += 1) {
    tareas.push((async () => {
      await esperar(aleatorio(30));
      const r = await call('PUT', '/notificaciones/personales/leidas', cliente.token, {});
      sin5xx('marcar', r);
      if (r.status === 200) marcadas += r.json.data;
    })());
  }
  for (let i = 0; i < 6; i += 1) {
    tareas.push((async () => {
      await esperar(aleatorio(40));
      const r = await call('POST', `/test/usuarios/${cliente.id}/avisos-personales?cantidad=${1 + aleatorio(3)}`, undefined, {});
      sin5xx('llegada', r);
      if (r.status === 201) total += r.json.data.length;
    })());
  }
  for (let i = 0; i < 6; i += 1) {
    tareas.push((async () => {
      await esperar(aleatorio(30));
      const ids = await recorrerPaginas(cliente, numero);
      if (ids) {
        exigir(new Set(ids.map((x) => x.id)).size === ids.length, `ronda ${numero}: un recorrido repitio avisos`);
        exigir(ids.every((x, k) => k === 0 || ids[k - 1].fecha > x.fecha || (ids[k - 1].fecha === x.fecha && ids[k - 1].id > x.id)), `ronda ${numero}: un recorrido no vino de mas nuevo a mas viejo`);
      }
    })());
  }
  for (let i = 0; i < 4; i += 1) {
    tareas.push((async () => {
      await esperar(aleatorio(30));
      sin5xx('contador', await call('GET', '/notificaciones/no-leidas/contador', cliente.token));
    })());
  }
  await Promise.all(tareas);

  const final = await call('PUT', '/notificaciones/personales/leidas', cliente.token, {});
  sin5xx('marcar final', final);
  if (final.status === 200) marcadas += final.json.data;

  exigir(marcadas === total, `ronda ${numero}: se marcaron ${marcadas} y habia ${total}: algun aviso se marco dos veces o ninguna`);
  const sinLeer = Number(sql(`SELECT COUNT(*) FROM notificacion WHERE usuario_id = ${cliente.id} AND leida = 0;`));
  exigir(sinLeer === 0, `ronda ${numero}: quedaron ${sinLeer} sin leer`);
  const filas = Number(sql(`SELECT COUNT(*) FROM notificacion WHERE usuario_id = ${cliente.id};`));
  exigir(filas === total, `ronda ${numero}: hay ${filas} filas y se esperaban ${total}`);
  const contador = (await call('GET', '/notificaciones/no-leidas/contador', cliente.token)).json.data;
  exigir(contador === 0, `ronda ${numero}: el contador vale ${contador}`);
  const ids = await recorrerPaginas(cliente, numero);
  exigir(ids && ids.length === total, `ronda ${numero}: el recorrido final trajo ${ids ? ids.length : 'nada'} y habia ${total}`);
}

async function main() {
  for (let n = 1; n <= ROUNDS; n += 1) {
    await ronda(n);
    console.log(`ronda ${n}: ${problemas.length === 0 ? 'ok' : `${problemas.length} problema(s) hasta ahora`}`);
  }
  console.log('Resumen de respuestas:', Object.fromEntries([...resumen].sort()));
  if (problemas.length) {
    console.log('PROBLEMAS:\n' + problemas.join('\n'));
    process.exitCode = 1;
  } else {
    console.log('SIN PROBLEMAS (sin 5xx, cada aviso se marca exactamente una vez, recorridos sin repetidos ni desordenados, contador en cero)');
  }
}

main().catch((e) => {
  console.error('FALLO DEL SCRIPT', e);
  process.exit(1);
});
