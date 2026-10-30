import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backend = path.resolve(__dirname, '../../../backend');
const fuentes = path.join(backend, 'src/main/java/com/bajonea/backend');
const SELECCION = process.env.MUTACIONES ? process.env.MUTACIONES.split(',') : null;
const PRUEBAS_BASE = process.env.PRUEBAS || 'DocumentoComercioHttpIntegrationTest,DocumentoComercioAptitudIntegrationTest,AptitudVentaComercioServiceTest,SuspensionComercioConcurrenciaIntegrationTest#subir*';
const REINTENTOS = Number(process.env.REINTENTOS || 1);

const MUTACIONES = [
  {
    id: 'C1', descripcion: 'el Dueno no puede subir documentos con el comercio suspendido',
    archivo: 'services/DocumentoComercioService.java',
    reemplazos: [['EstadoComercio.CERRADO_TEMPORALMENTE, EstadoComercio.SUSPENDIDO);', 'EstadoComercio.CERRADO_TEMPORALMENTE);']],
    pruebas: 'DocumentoComercioHttpIntegrationTest',
  },
  {
    id: 'C2', descripcion: 'subir, aprobar o rechazar un documento promueve a un comercio suspendido (participa en el recalculo y la regla lo trata como cualquier otro)',
    archivo: 'services/AptitudVentaComercioService.java',
    reemplazos: [
      ['|| estado == EstadoComercio.CERRADO_TEMPORALMENTE || estado == EstadoComercio.INACTIVO;',
        '|| estado == EstadoComercio.CERRADO_TEMPORALMENTE || estado == EstadoComercio.INACTIVO || estado == EstadoComercio.SUSPENDIDO;'],
      ['                if (motivo != MotivoRecalculo.SUSPENSION_LEVANTADA) {\n                    return actual;\n                }\n                if (!puedeSeguir) {',
        '                if (!puedeSeguir) {'],
    ],
    pruebas: 'DocumentoComercioHttpIntegrationTest,DocumentoComercioAptitudIntegrationTest,AptitudVentaComercioServiceTest,SuspensionComercioConcurrenciaIntegrationTest#subir*',
  },
  {
    id: 'C3', descripcion: 'la regla pura ya no ignora a un comercio suspendido salvo al levantar la suspension (la otra capa, participa, sigue protegiendo)',
    archivo: 'services/AptitudVentaComercioService.java',
    reemplazos: [['                if (motivo != MotivoRecalculo.SUSPENSION_LEVANTADA) {\n                    return actual;\n                }\n                if (!puedeSeguir) {',
      '                if (!puedeSeguir) {']],
    pruebas: 'AptitudVentaComercioServiceTest',
  },
  {
    id: 'C4', descripcion: 'al levantar la suspension el comercio queda APTO_VENTA sin mirar los documentos vigentes',
    archivo: 'services/AptitudVentaComercioService.java',
    reemplazos: [['        return decidir(EstadoComercio.SUSPENDIDO, dueno.bloqueado(), dueno.cuentaMercadoPagoActiva(), conteo.aprobados(),\n                conteo.pendientes(), documentacionProperties.isRequerida(), MotivoRecalculo.SUSPENSION_LEVANTADA);',
      '        return EstadoComercio.APTO_VENTA;']],
    pruebas: 'SuspensionComercioConcurrenciaIntegrationTest#subir*',
  },
];

const mvnw = path.join(backend, process.platform === 'win32' ? 'mvnw.cmd' : 'mvnw');

function correr(pruebas) {
  const comando = `"${mvnw}" test -Dspring.profiles.active=test "-Dtest=${pruebas}"`;
  try {
    const salida = execSync(comando, { cwd: backend, encoding: 'utf8', maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'pipe'] });
    return { ok: true, salida };
  } catch (e) {
    return { ok: false, salida: String(e.stdout || '') + String(e.stderr || '') };
  }
}

function fallas(salida) {
  const nombres = new Set();
  for (const linea of salida.split('\n')) {
    const m = linea.match(/^\[ERROR\]\s+(?:[A-Za-z]+\.)([A-Za-z0-9_]+(?:\(\)\[\d+\])?):\d+/);
    if (m) nombres.add(m[0].replace('[ERROR]', '').trim().split(' ')[0].slice(0, 110));
  }
  if (nombres.size === 0 && /COMPILATION ERROR/.test(salida)) nombres.add('ERROR DE COMPILACION');
  return [...nombres];
}

const base = correr(PRUEBAS_BASE);
if (!base.ok || !/Tests run:/.test(base.salida)) {
  console.error('La corrida base no pasa: se aborta (ninguna mutacion es valida sobre una base roja).');
  console.error(base.salida.split(String.fromCharCode(10)).filter(Boolean).slice(-15).join(String.fromCharCode(10)));
  process.exit(2);
}
console.log('Corrida base verde: ' + (base.salida.match(/Tests run: \d+, Failures: \d+, Errors: \d+, Skipped: \d+(?!.* in )/g) || []).slice(-1));

const resultados = [];
for (const mutacion of MUTACIONES) {
  if (SELECCION && !SELECCION.includes(mutacion.id)) continue;
  const archivo = path.join(fuentes, mutacion.archivo);
  const original = fs.readFileSync(archivo, 'utf8');
  const crlf = original.includes('\r\n');
  const limpio = crlf ? original.replace(/\r\n/g, '\n') : original;
  const pares = mutacion.reemplazos;
  if (!pares.every(([viejo]) => limpio.includes(viejo))) {
    resultados.push({ id: mutacion.id, estado: 'NO APLICA (texto no encontrado)' });
    console.log(`${mutacion.id} NO APLICA (texto no encontrado)`);
    continue;
  }
  const mutado = pares.reduce((texto, [viejo, nuevo]) => texto.replace(viejo, nuevo), limpio);
  fs.writeFileSync(archivo, crlf ? mutado.replace(/\n/g, '\r\n') : mutado, 'utf8');
  let detectada = false;
  let detalle = [];
  try {
    for (let i = 0; i < REINTENTOS && !detectada; i += 1) {
      const r = correr(mutacion.pruebas || PRUEBAS_BASE);
      if (!r.ok && /Tests run:|COMPILATION ERROR/.test(r.salida)) {
        detectada = true;
        detalle = fallas(r.salida);
        if (detalle.length === 0) detalle = ['SIN NOMBRES DE TEST. Ultimas lineas: ' + r.salida.split(/\r?\n/).filter(Boolean).slice(-6).join(' | ')];
      }
    }
  } finally {
    fs.writeFileSync(archivo, original, 'utf8');
  }
  resultados.push({ id: mutacion.id, descripcion: mutacion.descripcion, estado: detectada ? 'DETECTADA' : 'SOBREVIVE', detalle: detalle.slice(0, 4) });
  console.log(`${mutacion.id} ${detectada ? 'DETECTADA' : 'SOBREVIVE'}: ${mutacion.descripcion}`);
  detalle.slice(0, 4).forEach((d) => console.log(`    ${d}`));
}
console.log('\nResumen:');
resultados.forEach((r) => console.log(`${r.id}: ${r.estado}`));
const sobreviven = resultados.filter((r) => r.estado !== 'DETECTADA');
process.exitCode = sobreviven.length ? 1 : 0;
