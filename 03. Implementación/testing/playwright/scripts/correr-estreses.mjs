import { spawn } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolverAdminPassword } from './lib/admin-password.mjs';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.E2E_API_BASE_URL || 'http://localhost:8080/api/v1';
const LOG_BACKEND = process.env.BACKEND_LOG || path.join(process.env.TEMP || os.tmpdir(), 'backend-test.log');
const MYSQL = process.env.MYSQL_BIN || 'C:/xampp/mysql/bin/mysql.exe';

const ESTRESES = [
  { id: 'e1', archivo: 'stress-locks-empleado-e1.mjs', descripcion: 'E1: invitaciones, aceptación y equipo' },
  { id: 'e2', archivo: 'stress-locks-empleado-e2.mjs', descripcion: 'E2: acceso y resolver de actor' },
  { id: '2a', archivo: 'stress-locks-tramo2a.mjs', descripcion: 'Multi-comercio 2A: alta adicional' },
  { id: '5a', archivo: 'stress-locks-tramo5a.mjs', descripcion: 'Multi-comercio 5A: cuenta de Mercado Pago única' },
  { id: 'c1', archivo: 'stress-locks-tramoC1.mjs', descripcion: 'Cierre manual C1' },
  { id: 'c2', archivo: 'stress-locks-tramoC2.mjs', descripcion: 'Cierre manual C2: bloqueo del Dueño' },
  { id: 'c3', archivo: 'stress-locks-tramoC3.mjs', descripcion: 'Cierre manual C3: bloqueo vigente' },
  { id: 'a0', archivo: 'stress-locks-tramoE3-A0.mjs', descripcion: 'E3 A0: pedidos con varios operadores' },
  { id: 'a1', archivo: 'stress-locks-tramoE3-A1.mjs', descripcion: 'E3 A1: historial de ediciones' },
  { id: 'a2', archivo: 'stress-locks-tramoE3-A2.mjs', descripcion: 'E3 A2: escrituras delegadas' },
  { id: 'a2b', archivo: 'stress-locks-tramoE3-A2b.mjs', descripcion: 'E3 A2b: actividad con volumen' },
  { id: 'a3', archivo: 'stress-locks-tramoE3-A3.mjs', descripcion: 'E3 A3: pedido propio y trazabilidad' },
  { id: 'a4', archivo: 'stress-locks-tramoE3-A4.mjs', descripcion: 'E3 A4: avisos con fan-out' },
  { id: 'carrito', archivo: 'stress-locks-tramoE3-carrito.mjs', descripcion: 'E3 carrito (necesita el backend con MERCADOPAGO_API_BASE_URL apuntando al stub)', requiereStubMp: true },
  { id: 'a4b', archivo: 'stress-locks-tramoE3-A4b.mjs', descripcion: 'E3 A4b: no retirado' },
  { id: 'a6', archivo: 'stress-locks-tramoE3-A6.mjs', descripcion: 'E3 A6: T30 al equipo' },
  { id: 'a5', archivo: 'stress-locks-tramoE3-A5.mjs', descripcion: 'E3 A5 y A5b: desactivación contra las 18 escrituras, Dueño y Empleado a la vez, matriz de 49 combinaciones de producto e imagen y escrituras de imagen' },
  { id: 'nombre', archivo: 'stress-locks-tramoNombreUnico.mjs', descripcion: 'Tramo 2: nombre único de comercio (registros, altas, renombres y disponibilidad simultáneos)' },
  { id: 'horarios', archivo: 'stress-locks-tramoHorarios.mjs', descripcion: 'Fase 2 T1: edicion versionada de horarios contra cierre, bloqueos, desactivacion, lecturas, pedidos y productos' },
  { id: 'turnos', archivo: 'stress-locks-tramoTurnos.mjs', descripcion: 'Fase 2 T2: pedido por turno (pagos contra ediciones de horarios, bloqueos, resumen, backfill y pago repetido)' },
  { id: 'precios', archivo: 'stress-locks-tramoPrecios.mjs', descripcion: 'Fase 2 T3: precio no modificable en franja y total esperado (ediciones de precio contra carrito, pedido, cierre, horarios y pagos)' },
  { id: 'cierres', archivo: 'stress-locks-tramoCierreTurno.mjs', descripcion: 'Fase 2 T4: cierre de turno y email al Dueño (corridas simultaneas, ediciones de horarios, pagos, suspension, bloqueo y fallas del envio)' },
  { id: 'estadisticas', archivo: 'stress-locks-tramoEstadisticas.mjs', descripcion: 'Fase 2 T5: estadisticas del Dueño (lecturas contra pagos, aceptaciones, rechazos y ediciones de horarios; dos Dueños; el escenario 4, volumen, se corre aparte con ESCENARIO=4)' },
  { id: 'direcciones', archivo: 'stress-locks-tramoDirecciones.mjs', descripcion: 'Fase 3: direcciones del Cliente (cupo de cinco, una sola predeterminada, nunca cero activas, pedido contra edicion y baja de la direccion)' },
  { id: 'suspension', archivo: 'stress-locks-tramoSuspension.mjs', descripcion: 'Fase 5 S1 y S2: suspension de cuentas (doble suspension, contra login y checkout) y de comercios (doble suspension, contra aceptar, pago, despachar y anular, checkout, cierre manual, Mercado Pago y documentos, y levantar contra el tope de 90 minutos; sin 5xx, sin sesiones activas, sin pedidos nacidos despues de la suspension)' },
  { id: 'documentos', archivo: 'stress-locks-tramoDocumentos.mjs', descripcion: 'Fase 4: documentos del comercio y regla de apto para venta (cupo, baja contra aprobacion, Mercado Pago contra aprobacion, bloqueo de cuenta contra aprobacion, revocacion contra subida)' },
  { id: 'e4', archivo: 'stress-locks-empleado-e4.mjs', descripcion: 'E4: gestión del equipo (desactivar, reactivar y renunciar; S1 a S10)' },
];

const argumentos = process.argv.slice(2);
if (argumentos.includes('--lista')) {
  ESTRESES.forEach((e) => console.log(`${e.id.padEnd(8)} ${e.archivo.padEnd(36)} ${e.descripcion}`));
  process.exit(0);
}
const iSolo = argumentos.indexOf('--solo');
const solo = iSolo >= 0 ? argumentos[iSolo + 1].split(',') : null;
const iSin = argumentos.indexOf('--sin');
const sin = iSin >= 0 ? argumentos[iSin + 1].split(',') : [];
const elegidos = ESTRESES.filter((e) => (!solo || solo.includes(e.id)) && !sin.includes(e.id));
if (elegidos.length === 0) {
  console.error('Ningún estrés elegido (ver --lista).');
  process.exit(2);
}

let password;
try {
  password = resolverAdminPassword();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

async function json(ruta) {
  const respuesta = await fetch(`${BASE}${ruta}`);
  return { status: respuesta.status, cuerpo: await respuesta.json().catch(() => null) };
}

async function verificarEntorno() {
  const salud = await json('/health').catch(() => ({ status: 0 }));
  if (salud.status !== 200) throw new Error(`El backend no responde en ${BASE}`);
  const perfilTest = await json('/test/emails-regularizacion/cantidad?email=comprobacion%40bajonea.test');
  if (perfilTest.status !== 200) {
    throw new Error(`El backend de ${BASE} no tiene el perfil test activo (los atajos responden ${perfilTest.status}): no es el backend de bajonea_test, no se corre ningún estrés`);
  }
  const provincias = (await json('/geografia/provincias')).cuerpo.data;
  const provincia = provincias.find((p) => p.nombre.startsWith('Tierra del Fuego'));
  const localidades = (await json(`/geografia/localidades?provinciaId=${encodeURIComponent(provincia.id)}`)).cuerpo.data;
  return localidades.find((l) => /r[ií]o grande/i.test(l.nombre)).id;
}

function ejecutar(estres, env) {
  return new Promise((resolve) => {
    const inicio = Date.now();
    const proceso = spawn(process.execPath, [path.join(aqui, estres.archivo)], { env, stdio: ['ignore', 'pipe', 'pipe'] });
    let salida = '';
    proceso.stdout.on('data', (d) => (salida += d));
    proceso.stderr.on('data', (d) => (salida += d));
    proceso.on('exit', (codigo) => resolve({ codigo, salida, segundos: (Date.now() - inicio) / 1000 }));
  });
}

function contarEnElLog(patron) {
  if (!existsSync(LOG_BACKEND)) return 0;
  let total = (readFileSync(LOG_BACKEND).toString('utf8').match(patron) || []).length;
  const carpeta = path.dirname(LOG_BACKEND);
  const prefijo = `${path.basename(LOG_BACKEND)}.`;
  for (const archivo of readdirSync(carpeta)) {
    if (archivo.startsWith(prefijo) && archivo.endsWith('.gz')) {
      total += (gunzipSync(readFileSync(path.join(carpeta, archivo))).toString('utf8').match(patron) || []).length;
    }
  }
  return total;
}

const loc = await verificarEntorno();
const nube = process.env.CLOUDINARY_CLOUD_NAME || 'demo';
const inicioLog = { deadlocks: contarEnElLog(/Deadlock found/g), timeouts: contarEnElLog(/Lock wait timeout/g) };
console.log(`Estreses contra ${BASE} (localidad ${loc}, log del backend ${LOG_BACKEND}, ${elegidos.length} scripts)\n`);

const resultados = [];
for (const estres of elegidos) {
  const env = {
    ...process.env,
    E2E_API_BASE_URL: BASE,
    ADMIN_PASSWORD: password,
    LOC: String(loc),
    CLOUDINARY_CLOUD_NAME: nube,
    BACKEND_LOG: LOG_BACKEND,
    MYSQL_BIN: MYSQL,
  };
  process.stdout.write(`${estres.id.padEnd(8)} ${estres.descripcion} ... `);
  const r = await ejecutar(estres, env);
  const problemas = r.salida.includes('SIN PROBLEMAS') && r.codigo === 0 ? [] : r.salida.split('\n').filter((l) => l.trim() !== '').slice(-12);
  resultados.push({ ...estres, codigo: r.codigo, segundos: r.segundos, problemas });
  console.log(problemas.length === 0 ? `ok (${r.segundos.toFixed(0)} s)` : `CON PROBLEMAS (${r.segundos.toFixed(0)} s)`);
  if (problemas.length) problemas.forEach((l) => console.log(`    ${l.slice(0, 260)}`));
}

const deadlocks = contarEnElLog(/Deadlock found/g) - inicioLog.deadlocks;
const timeouts = contarEnElLog(/Lock wait timeout/g) - inicioLog.timeouts;
console.log('\nResumen');
for (const r of resultados) console.log(`${r.id.padEnd(8)} ${r.problemas.length === 0 ? 'OK ' : 'MAL'} ${r.segundos.toFixed(0).padStart(5)} s  ${r.archivo}`);
console.log(`Log del backend durante toda la corrida: ${deadlocks} "Deadlock found", ${timeouts} "Lock wait timeout"`);
const total = resultados.reduce((a, r) => a + r.segundos, 0);
console.log(`Tiempo total: ${(total / 60).toFixed(1)} min`);
process.exitCode = resultados.some((r) => r.problemas.length) || deadlocks || timeouts ? 1 : 0;
