import { spawn, execSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, rmSync, mkdirSync, cpSync } from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolverAdminPassword } from './lib/admin-password.mjs';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const raiz = path.resolve(aqui, '../../..');
const backendDir = path.join(raiz, 'backend');
const mvnw = path.join(backendDir, 'mvnw.cmd');
const temp = process.env.TEMP || os.tmpdir();
const ARCHIVO_ESTADO = path.join(temp, 'bajonea-entorno-test.json');
const LOG_BACKEND = process.env.BACKEND_LOG || path.join(temp, 'backend-test.log');
const LOG_SPRING = LOG_BACKEND.split(path.sep).join('/');
const PUERTO_BACKEND = Number(process.env.PUERTO_BACKEND || 8080);
const PUERTO_FRONT = Number(process.env.PUERTO_FRONT || 5501);
const PUERTO_BACKEND_POR_DEFECTO_DEL_FRONT = 8080;

function leerEstado() {
  if (!existsSync(ARCHIVO_ESTADO)) return {};
  try {
    return JSON.parse(readFileSync(ARCHIVO_ESTADO, 'utf8'));
  } catch {
    return {};
  }
}

function guardarEstado(estado) {
  writeFileSync(ARCHIVO_ESTADO, JSON.stringify(estado, null, 2));
}

function puertoOcupado(puerto) {
  return new Promise((resolve) => {
    const socket = net.connect({ port: puerto, host: '127.0.0.1' });
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('error', () => resolve(false));
  });
}

function matarArbol(pid) {
  try {
    execSync(`taskkill /PID ${pid} /T /F`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

async function esperar(condicion, intentos, pausaMs) {
  for (let i = 0; i < intentos; i += 1) {
    if (await condicion()) return true;
    await new Promise((resolve) => setTimeout(resolve, pausaMs));
  }
  return false;
}

async function health(puerto) {
  try {
    const respuesta = await fetch(`http://localhost:${puerto}/api/v1/health`);
    return respuesta.status === 200;
  } catch {
    return false;
  }
}

function detener() {
  const estado = leerEstado();
  let detenidos = 0;
  for (const clave of ['backendPid', 'frontPid']) {
    if (estado[clave]) {
      if (matarArbol(estado[clave])) detenidos += 1;
      console.log(`${clave} ${estado[clave]} detenido`);
    }
  }
  if (estado.frontDirTemporal && existsSync(estado.frontDirTemporal)) {
    rmSync(estado.frontDirTemporal, { recursive: true, force: true });
  }
  if (existsSync(ARCHIVO_ESTADO)) rmSync(ARCHIVO_ESTADO);
  console.log(`Procesos propios detenidos: ${detenidos}`);
}

function copiarFrontend(frontDir, limpiar = true) {
  if (limpiar) rmSync(frontDir, { recursive: true, force: true });
  mkdirSync(frontDir, { recursive: true });
  cpSync(path.join(raiz, 'frontend'), frontDir, { recursive: true, force: true });
  const archivoApi = path.join(frontDir, 'js', 'api.js');
  const contenido = readFileSync(archivoApi, 'utf8');
  const reemplazado = contenido.replace(`localhost:${PUERTO_BACKEND_POR_DEFECTO_DEL_FRONT}`, `localhost:${PUERTO_BACKEND}`);
  if (reemplazado === contenido) throw new Error('No se encontró el puerto del backend en js/api.js de la copia');
  writeFileSync(archivoApi, reemplazado);
}

function refrescarFront() {
  const estado = leerEstado();
  if (!estado.frontDirTemporal) {
    console.log('No hay copia temporal del frontend registrada (el frontend se sirve directo de frontend/): nada que refrescar');
    return;
  }
  if (!estado.frontPid) {
    console.error('No hay un frontend propio registrado: corré "levantar" primero');
    process.exit(1);
  }
  copiarFrontend(estado.frontDirTemporal, false);
  console.log(`Copia temporal del frontend regenerada en ${estado.frontDirTemporal} (frontPid ${estado.frontPid} sin tocar)`);
}

async function levantar() {
  const previo = leerEstado();
  if (previo.backendPid || previo.frontPid) {
    console.error(`Ya hay un entorno propio registrado en ${ARCHIVO_ESTADO}. Corré "detener" primero.`);
    process.exit(1);
  }
  for (const puerto of [PUERTO_BACKEND, PUERTO_FRONT]) {
    if (await puertoOcupado(puerto)) {
      console.error(`El puerto ${puerto} ya está ocupado por un proceso que no levantó este script: no lo toco. Elegí otro con PUERTO_BACKEND / PUERTO_FRONT.`);
      process.exit(1);
    }
  }
  const estado = { backendPort: PUERTO_BACKEND, frontPort: PUERTO_FRONT };

  writeFileSync(LOG_BACKEND, '');
  const backend = spawn(
    `"${mvnw}" -l "${LOG_BACKEND}.maven" spring-boot:run -Dspring-boot.run.profiles=test "-Dspring-boot.run.arguments=--server.port=${PUERTO_BACKEND} --logging.file.name=${LOG_SPRING}"`,
    [],
    { cwd: backendDir, shell: true, detached: true, windowsHide: true, stdio: 'ignore' },
  );
  backend.unref();
  estado.backendPid = backend.pid;
  guardarEstado(estado);

  let frontDir = path.join(raiz, 'frontend');
  if (PUERTO_BACKEND !== PUERTO_BACKEND_POR_DEFECTO_DEL_FRONT) {
    frontDir = path.join(temp, `bajonea-frontend-${PUERTO_BACKEND}`);
    copiarFrontend(frontDir);
    estado.frontDirTemporal = frontDir;
  }
  const front = spawn(
    'python',
    [path.join(raiz, '.claude', 'scripts', 'dev-server-no-cache.py'), String(PUERTO_FRONT), frontDir],
    { cwd: raiz, detached: true, windowsHide: true, stdio: 'ignore' },
  );
  front.unref();
  estado.frontPid = front.pid;
  guardarEstado(estado);

  const backendListo = await esperar(() => health(PUERTO_BACKEND), 100, 3000);
  if (!backendListo) {
    console.error(`El backend no levantó en el puerto ${PUERTO_BACKEND}. Últimas líneas del log (${LOG_BACKEND}):`);
    console.error(readFileSync(LOG_BACKEND, 'utf8').split('\n').slice(-25).join('\n'));
    detener();
    process.exit(1);
  }
  console.log(`Backend de test en http://localhost:${PUERTO_BACKEND} (log: ${LOG_BACKEND}), frontend en http://localhost:${PUERTO_FRONT}`);
}

async function llamar(metodo, ruta, cuerpo) {
  const respuesta = await fetch(`http://localhost:${PUERTO_BACKEND}/api/v1${ruta}`, {
    method: metodo,
    headers: { 'Content-Type': 'application/json' },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  const texto = await respuesta.text();
  let json = {};
  try {
    json = JSON.parse(texto);
  } catch {
  }
  return { status: respuesta.status, json };
}

async function fijarPasswordAdmin() {
  const password = resolverAdminPassword();
  await llamar('POST', '/auth/recuperar-password', { email: 'admin@bajonea.ar' });
  const token = await llamar('GET', '/test/token?email=admin%40bajonea.ar&tipo=RECUPERACION_PASSWORD');
  if (token.status !== 200) throw new Error(`No se obtuvo el código de recuperación del admin: ${token.status}`);
  const confirmacion = await llamar('POST', '/auth/recuperar-password/confirmar', {
    email: 'admin@bajonea.ar',
    codigo: token.json.data,
    nuevaPassword: password,
  });
  if (confirmacion.status !== 200) throw new Error(`No se pudo fijar la contraseña del admin: ${confirmacion.status}`);
  const login = await llamar('POST', '/auth/login', { nombreUsuario: 'adminbajonea', password });
  if (login.status !== 200) throw new Error(`El login del admin con la contraseña fijada dio ${login.status}`);
  console.log('Contraseña de admin@bajonea.ar fijada desde ADMIN_PASSWORD y verificada con un login');
}

async function preparar() {
  resolverAdminPassword();
  detener();
  console.log('Reseteando bajonea_test');
  execSync(`node "${path.join(aqui, 'reset-db.mjs')}"`, { stdio: 'inherit', cwd: path.join(aqui, '..') });
  await levantar();
  await fijarPasswordAdmin();
  console.log('ENTORNO_OK');
}

const comando = process.argv[2];
const acciones = { levantar, detener: async () => detener(), preparar, 'fijar-admin': fijarPasswordAdmin, 'refrescar-front': async () => refrescarFront() };
if (!acciones[comando]) {
  console.error('Uso: node scripts/entorno-test.mjs <preparar | levantar | detener | fijar-admin | refrescar-front>  (PUERTO_BACKEND, PUERTO_FRONT, BACKEND_LOG, ADMIN_PASSWORD)');
  process.exit(2);
}
acciones[comando]().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
