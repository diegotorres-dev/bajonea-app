import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backend = path.resolve(__dirname, '../../../backend');
const fuentes = path.join(backend, 'src/main/java/com/bajonea/backend');
const SELECCION = process.env.MUTACIONES ? process.env.MUTACIONES.split(',') : null;
const PRUEBAS_BASE = process.env.PRUEBAS || 'SuspensionComercioIntegrationTest,SuspensionComercioPagoIntegrationTest,AptitudVentaComercioServiceTest';
const REINTENTOS = Number(process.env.REINTENTOS || 1);

const MUTACIONES = [
  {
    id: 'N1', descripcion: 'M2 original: el pago en vuelo no lee el estado del comercio',
    archivo: 'services/PedidoService.java',
    viejo: 'return new PedidoBloqueado(pedido, equipo, estadosUsuarios.get(participantes.getClienteId()), estadoComercio,\n                suspendidoDesde);',
    nuevo: 'return new PedidoBloqueado(pedido, equipo, estadosUsuarios.get(participantes.getClienteId()), null,\n                suspendidoDesde);',
    pruebas: 'SuspensionComercioPagoIntegrationTest',
  },
  {
    id: 'N2', descripcion: 'M3 original: las transiciones de pedido no comprueban el estado del actor dentro de la transaccion',
    archivo: 'services/PedidoService.java',
    viejo: 'if (actorUsuarioId != null && estadosUsuarios.get(actorUsuarioId) == EstadoUsuario.SUSPENDIDO) {',
    nuevo: 'if (false && actorUsuarioId != null && estadosUsuarios.get(actorUsuarioId) == EstadoUsuario.SUSPENDIDO) {',
    pruebas: 'SuspensionCliente*',
  },
  {
    id: 'N3', descripcion: 'el proceso de 90 minutos de preparacion ignora que se levanto la suspension',
    archivo: 'services/PedidoService.java',
    viejo: 'if (pedido.getEstado() != EstadoPedido.EN_PREPARACION || !comercioSuspendido(bloqueado)\n                        || bloqueado.suspendidoDesde().plusMinutes(minutos).isAfter(reloj.get())) {',
    nuevo: 'if (pedido.getEstado() != EstadoPedido.EN_PREPARACION\n                        || (bloqueado.suspendidoDesde() != null && bloqueado.suspendidoDesde().plusMinutes(minutos).isAfter(reloj.get()))) {',
    pruebas: 'PedidoServiceCarreraTest,SuspensionComercioIntegrationTest',
  },
  {
    id: 'N4', descripcion: 'se pierde suspendido_desde al convertir una suspension del Dueno en individual',
    archivo: 'services/SuspensionComercioService.java',
    viejo: 'comercio.setSuspendidoDesde(conversion ? comercio.getSuspendidoDesde() : ahora);',
    nuevo: 'comercio.setSuspendidoDesde(ahora);',
    pruebas: 'SuspensionComercioIntegrationTest',
  },
  {
    id: 'N5', descripcion: 'el tope de preparacion se cuenta desde la creacion del pedido y no desde la suspension',
    archivo: 'services/PedidoService.java',
    viejo: '|| bloqueado.suspendidoDesde().plusMinutes(minutos).isAfter(reloj.get())) {\n                    return;\n                }\n                pedido.setEstado(EstadoPedido.CANCELADO_POR_SISTEMA);',
    nuevo: '|| pedido.getFechaCreacion().plusMinutes(minutos).isAfter(reloj.get())) {\n                    return;\n                }\n                pedido.setEstado(EstadoPedido.CANCELADO_POR_SISTEMA);',
    pruebas: 'PedidoServiceCarreraTest,SuspensionComercioIntegrationTest',
  },
  {
    id: 'N6', descripcion: 'el webhook toma el pedido antes de leer el comercio (orden de bloqueo invertido)',
    archivo: 'services/PedidoService.java',
    viejo: '        EstadoComercio estadoComercio = null;\n        LocalDateTime suspendidoDesde = null;\n        if (leerEstados) {\n            ComercioRepository.EstadoYCierreComercio lectura = comercioRepository\n                    .leerEstadoConBloqueoCompartido(participantes.getComercioId()).orElse(null);\n            if (lectura != null) {\n                estadoComercio = EstadoComercio.valueOf(lectura.getEstado());\n                suspendidoDesde = lectura.getSuspendidoDesde();\n            }\n        }\n        Pedido pedido = pedidoRepository.findById(pedidoId)\n                .orElseThrow(() -> new RecursoNoEncontradoException("Pedido no encontrado"));\n        entityManager.refresh(pedido, LockModeType.PESSIMISTIC_WRITE);',
    nuevo: '        Pedido pedido = pedidoRepository.findById(pedidoId)\n                .orElseThrow(() -> new RecursoNoEncontradoException("Pedido no encontrado"));\n        entityManager.refresh(pedido, LockModeType.PESSIMISTIC_WRITE);\n        EstadoComercio estadoComercio = null;\n        LocalDateTime suspendidoDesde = null;\n        if (leerEstados) {\n            ComercioRepository.EstadoYCierreComercio lectura = comercioRepository\n                    .leerEstadoConBloqueoCompartido(participantes.getComercioId()).orElse(null);\n            if (lectura != null) {\n                estadoComercio = EstadoComercio.valueOf(lectura.getEstado());\n                suspendidoDesde = lectura.getSuspendidoDesde();\n            }\n        }',
    pruebas: 'SuspensionComercioPagoIntegrationTest',
  },
  {
    id: 'N7', descripcion: 'el Dueno vuelve a poder aceptar pedidos con el comercio suspendido',
    archivo: 'services/ComercioActivoService.java',
    viejo: '        if (!actor.esEmpleado()) {\n            if (estadoComercio == EstadoComercio.SUSPENDIDO) {',
    nuevo: '        if (!actor.esEmpleado()) {\n            if (false && estadoComercio == EstadoComercio.SUSPENDIDO) {',
    pruebas: 'SuspensionComercioIntegrationTest',
  },
  {
    id: 'N8', descripcion: 'se levanta individualmente un comercio suspendido por el Dueno',
    archivo: 'services/SuspensionComercioService.java',
    viejo: 'if (comercio.getSuspensionOrigen() == OrigenSuspensionComercio.DUENO) {\n                throw new ConflictoDeNegocioException(MENSAJE_SUSPENDIDO_POR_DUENO);',
    nuevo: 'if (false) {\n                throw new ConflictoDeNegocioException(MENSAJE_SUSPENDIDO_POR_DUENO);',
    pruebas: 'SuspensionComercioIntegrationTest',
  },
  {
    id: 'N9', descripcion: 'levantar deja siempre APTO_VENTA sin recalcular con Mercado Pago y documentos',
    archivo: 'services/SuspensionComercioService.java',
    viejo: 'EstadoComercio destino = aptitudVentaComercioService.destinoAlLevantarSuspension(comercio, entradasDueno);',
    nuevo: 'EstadoComercio destino = EstadoComercio.APTO_VENTA;',
    pruebas: 'SuspensionComercioIntegrationTest',
  },
  {
    id: 'N10', descripcion: 'un pago tardio se reembolsa siempre con el motivo viejo y nunca con PAGO_TARDIO',
    archivo: 'services/PedidoService.java',
    viejo: '            motivo = MotivoNotaCredito.PAGO_TARDIO;',
    nuevo: '            motivo = MotivoNotaCredito.CANCELACION_CLIENTE;',
    pruebas: 'SuspensionComercioPagoIntegrationTest',
  },
  {
    id: 'N11', descripcion: '"Ir a pagar" no esta bloqueado con el comercio suspendido',
    archivo: 'services/MercadoPagoPagoService.java',
    viejo: 'if (pedido.getComercio().getEstado() == EstadoComercio.SUSPENDIDO) {',
    nuevo: 'if (false && pedido.getComercio().getEstado() == EstadoComercio.SUSPENDIDO) {',
    pruebas: 'SuspensionComercioIntegrationTest',
  },
  {
    id: 'N12', descripcion: 'el guard de edicion vuelve a eximir al Dueno',
    archivo: 'services/ComercioActivoService.java',
    viejo: '    public static void validarComercioModificable(ComercioActivo actor, EstadoComercio estadoComercio) {\n        if (actor.esEmpleado() && !ESTADOS_ACCESIBLES_EMPLEADO.contains(estadoComercio)) {\n            throw new ComercioNoDisponibleException();\n        }',
    nuevo: '    public static void validarComercioModificable(ComercioActivo actor, EstadoComercio estadoComercio) {\n        if (!actor.esEmpleado()) {\n            return;\n        }\n        if (!ESTADOS_ACCESIBLES_EMPLEADO.contains(estadoComercio)) {\n            throw new ComercioNoDisponibleException();\n        }',
    pruebas: 'SuspensionComercioIntegrationTest',
  },
  {
    id: 'N13', descripcion: 'se puede desvincular Mercado Pago con un comercio suspendido',
    archivo: 'services/MercadoPagoOAuthService.java',
    viejo: 'if (comercios.stream().anyMatch(comercio -> comercio.getEstado() == EstadoComercio.SUSPENDIDO)) {',
    nuevo: 'if (false && comercios.stream().anyMatch(comercio -> comercio.getEstado() == EstadoComercio.SUSPENDIDO)) {',
    pruebas: 'SuspensionComercioIntegrationTest',
  },
  {
    id: 'N14', descripcion: 'se puede aceptar una invitacion pendiente con el comercio suspendido',
    archivo: 'services/InvitacionEmpleadoService.java',
    viejo: 'EstadoComercio.APROBADO, EstadoComercio.APTO_VENTA, EstadoComercio.CERRADO_TEMPORALMENTE);',
    nuevo: 'EstadoComercio.APROBADO, EstadoComercio.APTO_VENTA, EstadoComercio.CERRADO_TEMPORALMENTE, EstadoComercio.SUSPENDIDO);',
    pruebas: 'SuspensionComercioIntegrationTest',
  },
  {
    id: 'N15', descripcion: 'el Empleado con la cuenta suspendida no queda fuera del reparto de avisos',
    archivo: 'services/SuspensionComercioService.java',
    viejo: 'if (activa && estados.get(relacion.getEmpleadoId()) != EstadoUsuario.SUSPENDIDO) {',
    nuevo: 'if (activa) {',
    pruebas: 'SuspensionComercioIntegrationTest',
  },
  {
    id: 'N16', descripcion: 'el aviso del equipo lleva el motivo de la suspension',
    archivo: 'services/AvisoCuentaService.java',
    viejo: '"El comercio \'" + nombreComercio + "\' fue suspendido. Mientras dure no se aceptan pedidos nuevos.",',
    nuevo: '"El comercio \'" + nombreComercio + "\' fue suspendido. Mientras dure no se aceptan pedidos nuevos. Motivo: " + nombreComercio,',
    pruebas: 'SuspensionComercioIntegrationTest',
  },
  {
    id: 'N17', descripcion: 'el proceso de retiros cuenta siempre desde la suspension e ignora cuando quedo listo el pedido',
    archivo: 'services/PedidoService.java',
    viejo: 'LocalDateTime base = listoDesde != null && listoDesde.isAfter(bloqueado.suspendidoDesde())\n                        ? listoDesde\n                        : bloqueado.suspendidoDesde();',
    nuevo: 'LocalDateTime base = bloqueado.suspendidoDesde();',
    pruebas: 'SuspensionComercioIntegrationTest,PedidoNoRetiradoServiceTest',
  },
  {
    id: 'N18', descripcion: 'las ediciones del perfil no toman el comercio antes de validar su estado',
    archivo: 'services/ComercioService.java',
    viejo: '        Comercio comercio = obtenerComercio(actor.comercioId());\n        entityManager.refresh(comercio, LockModeType.PESSIMISTIC_WRITE);\n        ComercioActivoService.validarComercioModificable(actor, comercio.getEstado());\n\n        String nombreNuevo',
    nuevo: '        Comercio comercio = obtenerComercio(actor.comercioId());\n\n        String nombreNuevo',
    pruebas: 'SuspensionComercioIntegrationTest',
  },
  {
    id: 'N19', descripcion: 'suspender apaga el cierre manual del comercio',
    archivo: 'services/SuspensionComercioService.java',
    viejo: '            comercio.setMotivoSuspension(request.getMotivo());',
    nuevo: '            comercio.setMotivoSuspension(request.getMotivo());\n            comercio.setCerradoManualmente(false);',
    pruebas: 'SuspensionComercioIntegrationTest',
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
  if (!limpio.includes(mutacion.viejo)) {
    resultados.push({ id: mutacion.id, estado: 'NO APLICA (texto no encontrado)' });
    console.log(`${mutacion.id} NO APLICA (texto no encontrado)`);
    continue;
  }
  const mutado = limpio.replace(mutacion.viejo, mutacion.nuevo);
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
