import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backend = path.resolve(__dirname, '../../../backend');
const fuentes = path.join(backend, 'src/main/java/com/bajonea/backend');
const SELECCION = process.env.MUTACIONES ? process.env.MUTACIONES.split(',') : null;
const PRUEBAS_BASE = process.env.PRUEBAS || 'ConexionesAnidadasPoolDiminutoIntegrationTest,EfectosPosterioresSinTransaccionIntegrationTest,ReembolsoFotoDeLaTransaccionIntegrationTest,SuspensionClientePagoIntegrationTest';
const REINTENTOS = Number(process.env.REINTENTOS || 1);

const NUEVA_TX = 'org.springframework.transaction.support.TransactionTemplate';
const REQUIRES_NEW = 'org.springframework.transaction.TransactionDefinition.PROPAGATION_REQUIRES_NEW';

const MUTACIONES = [
  {
    id: 'M1', descripcion: 'el reembolso vuelve a pedir una segunda conexion (lectura en una transaccion REQUIRES_NEW dentro de la del pedido)',
    archivo: 'services/ReembolsoService.java',
    reemplazos: [['        Pago pago = pagoOpt.get();\n', `        Pago pago = pagoOpt.get();\n        ${NUEVA_TX} nueva = new ${NUEVA_TX}(transaccion.getTransactionManager());\n        nueva.setPropagationBehavior(${REQUIRES_NEW});\n        nueva.execute(s -> notaCreditoService.montoCubierto(pago.getId()));\n`]],
    pruebas: 'ConexionesAnidadasPoolDiminutoIntegrationTest',
  },
  {
    id: 'M2', descripcion: 'el efecto posterior vuelve al afterCommit y el registro del resultado del aviso a REQUIRES_NEW (diseno anterior)',
    archivo: 'util/EjecucionPostCommit.java',
    reemplazos: [['ColaPostTransaccion.encolar(accion);', 'accion.run();']],
    archivosExtra: [{
      archivo: 'services/AvisoCuentaService.java',
      reemplazos: [['        this.transaccion = new TransactionTemplate(transactionManager);\n', `        this.transaccion = new TransactionTemplate(transactionManager);\n        this.transaccion.setPropagationBehavior(${REQUIRES_NEW});\n`]],
    }],
    pruebas: 'ConexionesAnidadasPoolDiminutoIntegrationTest#variasSuspensionesConAvisoPorEmailNoAgotanElPool*+EfectosPosterioresSinTransaccionIntegrationTest',
  },
  {
    id: 'M3', descripcion: 'el email de la suspension de un Cliente se manda dentro de la transaccion',
    archivo: 'services/AvisoCuentaService.java',
    reemplazos: [['        EjecucionPostCommit.ejecutar(() -> enviarYRegistrar(usuarioId, mensaje, TipoNotificacion.CLIENTE_SUSPENDIDO,\n                () -> emailService.enviarCuentaSuspendida(email, motivo)));',
      '        enviarYRegistrar(usuarioId, mensaje, TipoNotificacion.CLIENTE_SUSPENDIDO, () -> emailService.enviarCuentaSuspendida(email, motivo));']],
    pruebas: 'EfectosPosterioresSinTransaccionIntegrationTest',
  },
  {
    id: 'M4', descripcion: 'sin la verificacion de nota duplicada: dos pagos tardios del mismo pago crean dos notas',
    archivo: 'services/NotaCreditoService.java',
    reemplazos: [['return cubierto.compareTo(pago.getMonto()) >= 0;', 'return false;']],
    pruebas: 'ReembolsoFotoDeLaTransaccionIntegrationTest,SuspensionClientePagoIntegrationTest',
  },
  {
    id: 'M5', descripcion: 'el pedido de reembolso a Mercado Pago sale dentro de la transaccion del cambio de estado',
    archivo: 'services/ReembolsoService.java',
    reemplazos: [['            EjecucionPostCommit.ejecutar(() -> {\n                try {\n                    solicitarYRegistrar(intento);\n                } catch (RuntimeException ex) {\n                    log.error("Reembolso del pedidoId={} ({}) terminó con un error inesperado", pedidoId, motivo, ex);\n                }\n            });',
      '            solicitarYRegistrar(intento);']],
    pruebas: 'EfectosPosterioresSinTransaccionIntegrationTest',
  },
  {
    id: 'M6', descripcion: 'el gestor de transacciones no vacia la cola al terminar la transaccion mas externa (los efectos nunca salen)',
    archivo: 'config/GestorTransacciones.java',
    reemplazos: [['            ColaPostTransaccion.transaccionTerminada();', '']],
    pruebas: 'EfectosPosterioresSinTransaccionIntegrationTest',
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
  const objetivos = [{ archivo: mutacion.archivo, reemplazos: mutacion.reemplazos }, ...(mutacion.archivosExtra || [])].map((o) => {
    const ruta = path.join(fuentes, o.archivo);
    const original = fs.readFileSync(ruta, 'utf8');
    const crlf = original.includes('\r\n');
    const limpio = crlf ? original.replace(/\r\n/g, '\n') : original;
    return { ...o, ruta, original, crlf, limpio };
  });
  if (!objetivos.every((o) => o.reemplazos.every(([viejo]) => o.limpio.includes(viejo)))) {
    resultados.push({ id: mutacion.id, estado: 'NO APLICA (texto no encontrado)' });
    console.log(`${mutacion.id} NO APLICA (texto no encontrado)`);
    continue;
  }
  let detectada = false;
  let detalle = [];
  try {
    for (const o of objetivos) {
      const mutado = o.reemplazos.reduce((texto, [viejo, nuevo]) => texto.replace(viejo, nuevo), o.limpio);
      fs.writeFileSync(o.ruta, o.crlf ? mutado.replace(/\n/g, '\r\n') : mutado, 'utf8');
    }
    for (let i = 0; i < REINTENTOS && !detectada; i += 1) {
      const r = correr(mutacion.pruebas || PRUEBAS_BASE);
      if (!r.ok && /Tests run:|COMPILATION ERROR/.test(r.salida)) {
        detectada = true;
        detalle = fallas(r.salida);
        if (detalle.length === 0) detalle = ['SIN NOMBRES DE TEST. Ultimas lineas: ' + r.salida.split(/\r?\n/).filter(Boolean).slice(-6).join(' | ')];
      }
    }
  } finally {
    for (const o of objetivos) fs.writeFileSync(o.ruta, o.original, 'utf8');
  }
  resultados.push({ id: mutacion.id, descripcion: mutacion.descripcion, estado: detectada ? 'DETECTADA' : 'SOBREVIVE', detalle: detalle.slice(0, 4) });
  console.log(`${mutacion.id} ${detectada ? 'DETECTADA' : 'SOBREVIVE'}: ${mutacion.descripcion}`);
  detalle.slice(0, 4).forEach((d) => console.log(`    ${d}`));
}
console.log('\nResumen:');
resultados.forEach((r) => console.log(`${r.id}: ${r.estado}`));
const sobreviven = resultados.filter((r) => r.estado !== 'DETECTADA');
process.exitCode = sobreviven.length ? 1 : 0;
