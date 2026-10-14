import { spawnSync, execSync } from 'node:child_process';
import { readFileSync, mkdirSync, existsSync, unlinkSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolverAdminPassword } from './lib/admin-password.mjs';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const postman = path.resolve(aqui, '../../../postman');
const coleccion = path.join(postman, 'Bajonea-MVP.postman_collection.json');
const entorno = path.join(postman, 'Bajonea-Local.postman_environment.json');
const reportes = path.resolve(aqui, '../reportes');

const argumentos = process.argv.slice(2);
let repeticiones = 1;
const prefijos = [];
let todas = false;
for (let i = 0; i < argumentos.length; i += 1) {
  if (argumentos[i] === '--repeticiones') {
    repeticiones = Number(argumentos[++i]);
  } else if (argumentos[i] === '--todas') {
    todas = true;
  } else {
    prefijos.push(argumentos[i]);
  }
}
if (!todas && prefijos.length === 0) {
  console.error('Uso: node scripts/correr-newman.mjs (--todas | <prefijo de carpeta>...) [--repeticiones N]   (E2E_API_BASE_URL, ADMIN_PASSWORD)');
  process.exit(2);
}

const base = process.env.E2E_API_BASE_URL || 'http://localhost:8080/api/v1';
const json = JSON.parse(readFileSync(coleccion, 'utf8'));
const carpetas = json.item.map((f) => f.name).filter((nombre) => todas || prefijos.some((p) => nombre.startsWith(`${p} - `)));
if (!todas && carpetas.length !== prefijos.length) {
  console.error(`No se encontraron todas las carpetas pedidas. Encontradas: ${carpetas.map((c) => c.slice(0, 6)).join(', ')}`);
  process.exit(2);
}

async function localidadRioGrande() {
  const provincias = (await (await fetch(`${base}/geografia/provincias`)).json()).data;
  const provincia = provincias.find((p) => p.nombre.startsWith('Tierra del Fuego'));
  const localidades = (await (await fetch(`${base}/geografia/localidades?provinciaId=${provincia.id}`)).json()).data;
  return localidades.find((l) => /r[ií]o grande/i.test(l.nombre)).id;
}

const password = resolverAdminPassword();
const localidadId = await localidadRioGrande();
mkdirSync(reportes, { recursive: true });
const newmanJs = path.join(execSync('npm root -g', { encoding: 'utf8' }).trim(), 'newman', 'bin', 'newman.js');
let fallos = 0;
const resumenes = [];

for (let vuelta = 1; vuelta <= repeticiones; vuelta += 1) {
  const exportado = path.join(os.tmpdir(), `newman-${process.pid}-${vuelta}.json`);
  const args = ['run', coleccion, '-e', entorno, '--env-var', `base_url=${base}`, '--env-var', `localidad_id=${localidadId}`, '--env-var', `admin_password=${password}`,
    '--reporters', 'cli,json', '--reporter-json-export', exportado, '--color', 'off'];
  if (!todas) {
    for (const carpeta of carpetas) args.push('--folder', carpeta);
  }
  console.log(`\n=== Newman, vuelta ${vuelta} de ${repeticiones}: ${todas ? 'colección completa' : carpetas.map((c) => c.slice(0, 2)).join(', ')} contra ${base} ===`);
  const inicio = Date.now();
  const resultado = spawnSync(process.execPath, [newmanJs, ...args], { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8', maxBuffer: 1024 * 1024 * 512 });
  const salida = `${resultado.stdout || ''}${resultado.stderr || ''}`;
  const corrida = existsSync(exportado) ? JSON.parse(readFileSync(exportado, 'utf8')).run : null;
  if (existsSync(exportado)) unlinkSync(exportado);
  const resumen = corrida ? corrida.stats : null;
  const duracion = ((Date.now() - inicio) / 1000).toFixed(0);
  if (resumen) {
    const f = resumen.assertions.failed + resumen.requests.failed + resumen.testScripts.failed + resumen.prerequestScripts.failed;
    fallos += f;
    resumenes.push({ vuelta, requests: resumen.requests.total, assertions: resumen.assertions.total, fallas: f, segundos: Number(duracion) });
    console.log(`vuelta ${vuelta}: requests ${resumen.requests.total}, assertions ${resumen.assertions.total}, fallas ${f}, ${duracion} s`);
    if (f > 0) {
      const detalle = corrida.failures.slice(0, 15);
      for (const falla of detalle) {
        console.log(`  FALLA: ${falla.source?.name || '?'} -> ${falla.error?.name}: ${String(falla.error?.message).slice(0, 220)}`);
      }
    }
  } else {
    fallos += 1;
    console.log(salida.split('\n').slice(-40).join('\n'));
    console.log(`vuelta ${vuelta}: Newman no produjo reporte (código ${resultado.status})`);
  }
}
console.log('\nResumen:', JSON.stringify(resumenes));
process.exitCode = fallos ? 1 : 0;
