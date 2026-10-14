import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const archivo = process.argv[2] || 'reportes/resultados.json';
const cuantos = Number(process.argv[3] || 15);
if (!existsSync(archivo)) {
  console.error(`No existe ${archivo}: corré Playwright con el reporter json (por defecto escribe en reportes/resultados.json).`);
  process.exit(1);
}
const reporte = JSON.parse(readFileSync(archivo, 'utf8'));
const porSpec = new Map();
const tests = [];
const estados = {};

function recorrer(suite, archivoDeSuite) {
  const archivoActual = suite.file || archivoDeSuite;
  for (const spec of suite.specs || []) {
    for (const prueba of spec.tests || []) {
      for (const resultado of prueba.results || []) {
        const nombre = path.basename(archivoActual || spec.file || '?');
        porSpec.set(nombre, (porSpec.get(nombre) || 0) + resultado.duration);
        tests.push({ spec: nombre, titulo: spec.title, linea: spec.line, duracion: resultado.duration, estado: resultado.status, inicio: new Date(resultado.startTime).getTime() });
        estados[resultado.status] = (estados[resultado.status] || 0) + 1;
      }
    }
  }
  for (const hija of suite.suites || []) recorrer(hija, archivoActual);
}
for (const suite of reporte.suites || []) recorrer(suite);

const segundos = (ms) => (ms / 1000).toFixed(1).padStart(8);
console.log('Estados:', JSON.stringify(estados), ' Duración total reportada:', ((reporte.stats?.duration || 0) / 60000).toFixed(1), 'min');
console.log('\nSpecs más lentos (suma de duraciones de sus tests):');
[...porSpec.entries()].sort((a, b) => b[1] - a[1]).slice(0, cuantos).forEach(([nombre, ms]) => console.log(`${segundos(ms)} s  ${nombre}`));
console.log('\nTests más lentos:');
[...tests].sort((a, b) => b.duracion - a.duracion).slice(0, cuantos).forEach((t) => console.log(`${segundos(t.duracion)} s  ${t.spec}:${t.linea}  ${t.titulo.slice(0, 90)} [${t.estado}]`));

const ordenados = [...tests].sort((a, b) => a.inicio - b.inicio);
let huecoMayor = { ms: 0, antes: null, despues: null };
for (let i = 1; i < ordenados.length; i += 1) {
  const finAnterior = ordenados[i - 1].inicio + ordenados[i - 1].duracion;
  const hueco = ordenados[i].inicio - finAnterior;
  if (hueco > huecoMayor.ms) huecoMayor = { ms: hueco, antes: ordenados[i - 1], despues: ordenados[i] };
}
console.log('\nMayor hueco sin actividad entre un test y el siguiente (sospecha de suspensión de la máquina si supera varios minutos):');
console.log(huecoMayor.antes ? `${(huecoMayor.ms / 1000).toFixed(1)} s entre ${huecoMayor.antes.spec}:${huecoMayor.antes.linea} y ${huecoMayor.despues.spec}:${huecoMayor.despues.linea}` : 'sin datos');
const largos = tests.filter((t) => t.duracion > 120000);
console.log(`Tests de más de 120 s: ${largos.length}`);
largos.forEach((t) => console.log(`  ${t.spec}:${t.linea} ${segundos(t.duracion)} s [${t.estado}]`));
