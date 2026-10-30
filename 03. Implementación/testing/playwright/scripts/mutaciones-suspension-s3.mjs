import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backend = path.resolve(__dirname, '../../../backend');
const fuentes = path.join(backend, 'src/main/java/com/bajonea/backend');
const SELECCION = process.env.MUTACIONES ? process.env.MUTACIONES.split(',') : null;
const PRUEBAS_BASE = process.env.PRUEBAS || 'SuspensionDuenoIntegrationTest,SuspensionDuenoConcurrenciaIntegrationTest';
const REINTENTOS = Number(process.env.REINTENTOS || 2);

const MUTACIONES = [
  {
    id: 'M1', descripcion: 'la suspension no toma el bloqueo del usuario del Dueno (lo lee sin FOR UPDATE)',
    archivo: 'services/SuspensionDuenoService.java',
    reemplazos: [['dueno = usuarioRepository.findByIdConBloqueo(duenoId)', 'dueno = usuarioRepository.findById(duenoId)']],
    pruebas: 'SuspensionDuenoConcurrenciaIntegrationTest#suspenderDosVecesALaVez*+levantarDosVecesALaVez*+suspenderContraLevantar*',
  },
  {
    id: 'M2', descripcion: 'al levantar se restauran tambien los comercios suspendidos por separado (sin el filtro de origen)',
    archivo: 'services/SuspensionDuenoService.java',
    reemplazos: [['if (bloqueado.getSuspensionOrigen() == OrigenSuspensionComercio.DUENO) {\n                    restaurables.add(bloqueado);', 'if (true) {\n                    restaurables.add(bloqueado);']],
    pruebas: 'SuspensionDuenoIntegrationTest',
  },
  {
    id: 'M3', descripcion: 'la cascada no suspende los comercios cerrados temporalmente',
    archivo: 'services/SuspensionDuenoService.java',
    reemplazos: [['Set.of(EstadoComercio.APROBADO, EstadoComercio.APTO_VENTA,\n            EstadoComercio.CERRADO_TEMPORALMENTE);', 'Set.of(EstadoComercio.APROBADO, EstadoComercio.APTO_VENTA);']],
    pruebas: 'SuspensionDuenoIntegrationTest',
  },
  {
    id: 'M4', descripcion: 'un Empleado suspendido, bloqueado o inactivo cuenta como activo',
    archivo: 'services/PedidoService.java',
    reemplazos: [['if (activa && estadoEmpleado == EstadoUsuario.ACTIVO) {', 'if (activa) {']],
    pruebas: 'SuspensionDuenoIntegrationTest',
  },
  {
    id: 'M5', descripcion: 'los comercios ya suspendidos por separado quedan fuera de la evaluacion de pedidos',
    archivo: 'services/SuspensionDuenoService.java',
    reemplazos: [['                } else if (comercio.getEstado() == EstadoComercio.SUSPENDIDO) {\n                    yaSuspendidos.add(comercio.getId());\n                }', '                }']],
    pruebas: 'SuspensionDuenoIntegrationTest',
  },
  {
    id: 'M6', descripcion: 'un endpoint de comercio puede anular un pedido listo para retirar (transicion que es solo del sistema)',
    archivo: 'services/PedidoService.java',
    reemplazos: [['        if (pedido.getEstado() != EstadoPedido.EN_PREPARACION) {\n            throw new ConflictoDeNegocioException(pedido.getEstado() == EstadoPedido.PENDIENTE_CONFIRMACION_COMERCIO\n                    ? MENSAJE_NO_SE_ANULA_SIN_ACEPTAR',
      '        if (pedido.getEstado() != EstadoPedido.EN_PREPARACION && pedido.getEstado() != EstadoPedido.LISTO_PARA_RETIRAR) {\n            throw new ConflictoDeNegocioException(pedido.getEstado() == EstadoPedido.PENDIENTE_CONFIRMACION_COMERCIO\n                    ? MENSAJE_NO_SE_ANULA_SIN_ACEPTAR']],
    pruebas: 'SuspensionDuenoIntegrationTest#elDuenoYElEmpleadoNoPuedenCancelar*',
  },
  {
    id: 'M6B', descripcion: 'un endpoint de comercio puede despachar un pedido listo para retirar',
    archivo: 'services/PedidoService.java',
    reemplazos: [['        if (pedido.getEstado() != EstadoPedido.EN_PREPARACION) {\n            throw new ConflictoDeNegocioException(pedido.getEstado() == EstadoPedido.PENDIENTE_CONFIRMACION_COMERCIO\n                    ? MENSAJE_PRIMERO_ACEPTAR',
      '        if (pedido.getEstado() != EstadoPedido.EN_PREPARACION && pedido.getEstado() != EstadoPedido.LISTO_PARA_RETIRAR) {\n            throw new ConflictoDeNegocioException(pedido.getEstado() == EstadoPedido.PENDIENTE_CONFIRMACION_COMERCIO\n                    ? MENSAJE_PRIMERO_ACEPTAR']],
    pruebas: 'SuspensionDuenoIntegrationTest#elDuenoYElEmpleadoNoPuedenCancelar*',
  },
  {
    id: 'M7', descripcion: 'el barrido de pedidos sin atencion no bloquea ni revalida: lee el pedido y actua',
    archivo: 'services/PedidoService.java',
    reemplazos: [['            PedidoBloqueado bloqueado = bloquearParaSinAtencion(pedidoId);',
      '            PedidoBloqueado bloqueado = new PedidoBloqueado(pedidoRepository.findById(pedidoId).orElseThrow(), List.of(), null, EstadoComercio.SUSPENDIDO, LocalDateTime.now(), EstadoUsuario.SUSPENDIDO, List.of());']],
    pruebas: 'SuspensionDuenoConcurrenciaIntegrationTest#dosBarridos*+suspenderAlDuenoContraLaSuspension*',
  },
  {
    id: 'M8', descripcion: 'se manda un email por cada comercio al Dueno ademas del email unico',
    archivo: 'services/AvisoCuentaService.java',
    reemplazos: [['        List<String> nombres = suspendidos.stream().map(ComercioAvisado::nombre).toList();\n        String mensaje = "Tu cuenta fue suspendida. Motivo: " + motivo;',
      '        for (ComercioAvisado comercio : suspendidos) {\n            EjecucionPostCommit.ejecutar(() -> emailService.enviarComercioSuspendido(email, comercio.nombre(), motivo));\n        }\n        List<String> nombres = suspendidos.stream().map(ComercioAvisado::nombre).toList();\n        String mensaje = "Tu cuenta fue suspendida. Motivo: " + motivo;']],
    pruebas: 'SuspensionDuenoIntegrationTest#saleUnSoloEmail*',
  },
  {
    id: 'M9', descripcion: 'se puede aprobar un comercio pendiente con el Dueno suspendido',
    archivo: 'services/AdministradorService.java',
    reemplazos: [['            exigirDuenoNoSuspendido(duenoId);', '']],
    pruebas: 'SuspensionDuenoIntegrationTest#conElDuenoSuspendidoNoSeApruebaUn*',
  },
  {
    id: 'M10', descripcion: 'al levantar, cada comercio vuelve a APTO_VENTA sin recalcular con la cuenta de cobro',
    archivo: 'services/SuspensionDuenoService.java',
    reemplazos: [['EstadoComercio destino = aptitudVentaComercioService.destinoAlLevantarSuspension(comercio, entradas);', 'EstadoComercio destino = EstadoComercio.APTO_VENTA;']],
    pruebas: 'SuspensionDuenoIntegrationTest',
  },
  {
    id: 'M11', descripcion: 'la suspension no cierra las sesiones del Dueno',
    archivo: 'services/SuspensionDuenoService.java',
    reemplazos: [['            cerrarSesiones(duenoId);\n', '']],
    pruebas: 'SuspensionDuenoIntegrationTest',
  },
  {
    id: 'M12', descripcion: 'la suspension no toma las relaciones de los Empleados (no hay destinatarios de los avisos)',
    archivo: 'services/SuspensionDuenoService.java',
    reemplazos: [['            Set<Integer> destinatarios = bloquearRelaciones(candidatos, estados);\n\n            List<Comercio> comercios = comerciosDelDueno(duenoId);\n            List<Comercio> bloqueados',
      '            Set<Integer> destinatarios = new HashSet<>();\n\n            List<Comercio> comercios = comerciosDelDueno(duenoId);\n            List<Comercio> bloqueados']],
    pruebas: 'SuspensionDuenoIntegrationTest',
  },
  {
    id: 'M13', descripcion: 'un comercio suspendido por separado se puede levantar con el Dueno suspendido',
    archivo: 'services/SuspensionComercioService.java',
    reemplazos: [['            if (bloqueados.estadoDueno() == EstadoUsuario.SUSPENDIDO) {', '            if (false) {']],
    pruebas: 'SuspensionDuenoIntegrationTest#unComercioSuspendidoPorSeparadoNoSePuedeLevantar*',
  },
  {
    id: 'M14', descripcion: 'una cuenta de Cliente se puede suspender desde la suspension de Duenos',
    archivo: 'services/SuspensionDuenoService.java',
    reemplazos: [['        if (rol != RolUsuario.DUENO) {\n            throw new RecursoNoEncontradoException("Dueño no encontrado");\n        }', '']],
    pruebas: 'SuspensionDuenoIntegrationTest#noSePuedeSuspenderAUnAdministrador*',
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
