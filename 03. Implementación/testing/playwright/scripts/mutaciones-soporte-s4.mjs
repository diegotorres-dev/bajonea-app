import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backend = path.resolve(__dirname, '../../../backend');
const fuentes = path.join(backend, 'src/main/java/com/bajonea/backend');
const SELECCION = process.env.MUTACIONES ? process.env.MUTACIONES.split(',') : null;
const PRUEBAS_BASE = process.env.PRUEBAS || 'SoporteConversacionIntegrationTest,SoporteLimitesIntegrationTest,SoporteSesionIntegrationTest,SoporteAdminIntegrationTest,SoporteHttpIntegrationTest,SoporteEmailsIntegrationTest,SoporteColisionDeCodigoIntegrationTest,SoporteEmailsPoolDiminutoIntegrationTest,EmailServiceSoporteTest,SoporteConcurrenciaIntegrationTest';
const REINTENTOS = Number(process.env.REINTENTOS || 1);

const BLOQUEO = '    @Lock(LockModeType.PESSIMISTIC_WRITE)\n    @Query("SELECT t FROM TicketSoporte t WHERE t.id = :id")';
const SOLO_QUERY = '    @Query("SELECT t FROM TicketSoporte t WHERE t.id = :id")';
const CONVERSACION_Y_CONCURRENCIA = 'SoporteConcurrenciaIntegrationTest,SoporteConversacionIntegrationTest';

const MUTACIONES = [
  {
    id: 'M1', descripcion: 'sin el bloqueo FOR UPDATE de la fila de la consulta',
    archivo: 'repositories/TicketSoporteRepository.java',
    reemplazos: [[BLOQUEO, SOLO_QUERY]],
    pruebas: CONVERSACION_Y_CONCURRENCIA,
  },
  {
    id: 'M2', descripcion: 'sin la validacion de turno',
    archivo: 'services/ConversacionSoporte.java',
    reemplazos: [['        if (ticket.getEstado() != estadoDelTurno) {', '        if (false) {']],
    pruebas: CONVERSACION_Y_CONCURRENCIA + ',SoporteSesionIntegrationTest',
  },
  {
    id: 'M3', descripcion: 'sin el tope de 20 mensajes',
    archivo: 'services/ConversacionSoporte.java',
    reemplazos: [['        if (total >= MAX_MENSAJES) {', '        if (false) {']],
    pruebas: CONVERSACION_Y_CONCURRENCIA,
  },
  {
    id: 'M4', descripcion: 'sin el limite de consultas por dia de un email',
    archivo: 'services/SoporteService.java',
    reemplazos: [['>= propiedades.getConsultasPorDiaEmail()', '>= Integer.MAX_VALUE']],
    pruebas: 'SoporteLimitesIntegrationTest,SoporteConcurrenciaIntegrationTest',
  },
  {
    id: 'M5', descripcion: 'sin el limite de consultas abiertas de un email',
    archivo: 'services/SoporteService.java',
    reemplazos: [['>= propiedades.getConsultasAbiertasEmail()', '>= Integer.MAX_VALUE']],
    pruebas: 'SoporteLimitesIntegrationTest',
  },
  {
    id: 'M6', descripcion: 'sin el limite de consultas por IP',
    archivo: 'services/SoporteService.java',
    reemplazos: [['>= propiedades.getConsultasPorDiaIp()', '>= Integer.MAX_VALUE']],
    pruebas: 'SoporteLimitesIntegrationTest,SoporteConcurrenciaIntegrationTest',
  },
  {
    id: 'M7', descripcion: 'sin la serializacion del contador (la fila de limite se lee sin FOR UPDATE)',
    archivo: 'repositories/SoporteLimiteRepository.java',
    reemplazos: [['WHERE clave = ? FOR UPDATE', 'WHERE clave = ?']],
    pruebas: 'SoporteConcurrenciaIntegrationTest',
  },
  {
    id: 'M8', descripcion: 'el email de la respuesta se manda dentro de la transaccion',
    archivo: 'services/AvisoSoporteService.java',
    reemplazos: [['        EjecucionPostCommit.ejecutar(() -> enviarYMarcar(email, codigo, mensajeId));', '        enviarYMarcar(email, codigo, mensajeId);']],
    pruebas: 'SoporteEmailsIntegrationTest,SoporteEmailsPoolDiminutoIntegrationTest',
  },
  {
    id: 'M9', descripcion: 'el mensaje de acceso incorrecto cambia segun que dato fallo',
    archivo: 'services/SoporteService.java',
    reemplazos: [['limites.registrarFallo(acceso, ahora);\n                return ResultadoSoporte.<ConsultaSoporteResponseDTO>error(new RecursoNoEncontradoException(MENSAJE_NO_ENCONTRADA));',
      'limites.registrarFallo(acceso, ahora);\n                return ResultadoSoporte.<ConsultaSoporteResponseDTO>error(new RecursoNoEncontradoException(codigoConFormato(codigo) ? MENSAJE_NO_ENCONTRADA : "El codigo no es valido"));']],
    pruebas: 'SoporteConversacionIntegrationTest,SoporteHttpIntegrationTest',
  },
  {
    id: 'M10', descripcion: 'sin el 404 de las consultas ajenas con sesion',
    archivo: 'services/SoporteService.java',
    reemplazos: [['ticketRepository.findDelUsuarioPorId(id, usuarioId, email)\n                .orElseThrow', 'ticketRepository.findById(id)\n                .orElseThrow']],
    pruebas: 'SoporteSesionIntegrationTest',
  },
  {
    id: 'M11', descripcion: 'los intentos fallidos de acceso no se cuentan',
    archivo: 'services/SoporteLimiteService.java',
    reemplazos: [['        Duration ventana = Duration.ofMinutes(propiedades.getVentanaIntentosMinutos());\n        sumar(acceso.claveEmail()', '        if (true) {\n            return;\n        }\n        Duration ventana = Duration.ofMinutes(propiedades.getVentanaIntentosMinutos());\n        sumar(acceso.claveEmail()']],
    pruebas: 'SoporteLimitesIntegrationTest,SoporteConcurrenciaIntegrationTest',
  },
  {
    id: 'M12', descripcion: 'el reenvio de codigos manda un email aunque no haya consultas',
    archivo: 'services/SoporteService.java',
    reemplazos: [['            if (!codigos.isEmpty()) {\n                avisos.enviarCodigos(email, codigos);', '            if (true) {\n                avisos.enviarCodigos(email, codigos);']],
    pruebas: 'SoporteLimitesIntegrationTest',
  },
  {
    id: 'M13', descripcion: 'el filtro JWT corta a la cuenta suspendida tambien en las rutas de Soporte',
    archivo: 'config/security/JwtAuthenticationFilter.java',
    reemplazos: [['&& request.getRequestURI().startsWith(PREFIJO_SOPORTE)', '&& request.getRequestURI().startsWith(PREFIJO_SOPORTE + "inexistente")']],
    pruebas: 'SoporteSesionIntegrationTest',
  },
  {
    id: 'M14', descripcion: 'el resultado del email de la respuesta no se marca en el mensaje',
    archivo: 'services/AvisoSoporteService.java',
    reemplazos: [['mensajeRepository.marcarEmailEnviado(mensajeId, salio)', 'mensajeRepository.marcarEmailEnviado(mensajeId, true)']],
    pruebas: 'SoporteAdminIntegrationTest,SoporteEmailsIntegrationTest',
  },
  {
    id: 'M15', descripcion: 'una consulta cerrada vuelve a aceptar mensajes',
    archivo: 'services/ConversacionSoporte.java',
    reemplazos: [['        if (ticket.getEstado() == EstadoTicketSoporte.CERRADO) {\n            return ResultadoSoporte.error(', '        if (false) {\n            return ResultadoSoporte.error(']],
    pruebas: CONVERSACION_Y_CONCURRENCIA,
  },
  {
    id: 'M16', descripcion: 'sin la deteccion de colision de codigo (el error de clave duplicada sube)',
    archivo: 'services/SoporteService.java',
    reemplazos: [['} catch (DuplicateKeyException colision) {\n                    id = null;', '} catch (IllegalStateException colision) {\n                    id = null;']],
    pruebas: 'SoporteColisionDeCodigoIntegrationTest',
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
  if (nombres.size === 0) {
    const resumen = salida.split('\n').filter((l) => /^\[ERROR\] (Failures|Errors):/.test(l) || /<<< (FAILURE|ERROR)/.test(l));
    resumen.slice(0, 3).forEach((l) => nombres.add(l.slice(0, 110)));
  }
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
  const ruta = path.join(fuentes, mutacion.archivo);
  const original = fs.readFileSync(ruta, 'utf8');
  const crlf = original.includes('\r\n');
  const limpio = crlf ? original.replace(/\r\n/g, '\n') : original;
  if (!mutacion.reemplazos.every(([viejo]) => limpio.includes(viejo))) {
    resultados.push({ id: mutacion.id, estado: 'NO APLICA (texto no encontrado)' });
    console.log(`${mutacion.id} NO APLICA (texto no encontrado)`);
    continue;
  }
  let detectada = false;
  let detalle = [];
  try {
    const mutado = mutacion.reemplazos.reduce((texto, [viejo, nuevo]) => texto.replace(viejo, nuevo), limpio);
    fs.writeFileSync(ruta, crlf ? mutado.replace(/\n/g, '\r\n') : mutado, 'utf8');
    for (let i = 0; i < REINTENTOS && !detectada; i += 1) {
      const r = correr(mutacion.pruebas || PRUEBAS_BASE);
      if (!r.ok && /Tests run:|COMPILATION ERROR/.test(r.salida)) {
        detectada = true;
        detalle = fallas(r.salida);
        if (detalle.length === 0) detalle = ['SIN NOMBRES DE TEST. Ultimas lineas: ' + r.salida.split(/\r?\n/).filter(Boolean).slice(-6).join(' | ')];
      }
    }
  } finally {
    fs.writeFileSync(ruta, original, 'utf8');
  }
  resultados.push({ id: mutacion.id, descripcion: mutacion.descripcion, estado: detectada ? 'DETECTADA' : 'SOBREVIVE', detalle: detalle.slice(0, 4) });
  console.log(`${mutacion.id} ${detectada ? 'DETECTADA' : 'SOBREVIVE'}: ${mutacion.descripcion}`);
  detalle.slice(0, 4).forEach((d) => console.log(`    ${d}`));
}
console.log('\nResumen:');
resultados.forEach((r) => console.log(`${r.id}: ${r.estado}`));
const sobreviven = resultados.filter((r) => r.estado !== 'DETECTADA');
process.exitCode = sobreviven.length ? 1 : 0;
