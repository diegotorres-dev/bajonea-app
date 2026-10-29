import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backend = path.resolve(__dirname, '../../../backend');
const fuentes = path.join(backend, 'src/main/java/com/bajonea/backend');
const SELECCION = process.env.MUTACIONES ? process.env.MUTACIONES.split(',') : null;
const PRUEBAS = process.env.PRUEBAS || 'Suspension*,EstadoUsuarioCentralizadoTest,AuthService*';
const REINTENTOS = Number(process.env.REINTENTOS || 1);

const MUTACIONES = [
  {
    id: 'M1', descripcion: 'el checkout no mira el estado de la cuenta del Cliente',
    archivo: 'services/PedidoService.java',
    viejo: 'estadoUsuarioService.exigirNoSuspendido(usuarioId);\n        Cliente cliente',
    nuevo: 'usuarioRepository.leerIdConBloqueoCompartido(usuarioId);\n        Cliente cliente',
  },
  {
    id: 'M2', descripcion: 'el pago en vuelo no lee el estado del Cliente antes de bloquear el pedido',
    archivo: 'services/PedidoService.java',
    viejo: 'return new PedidoBloqueado(pedido, equipo, estadosUsuarios.get(participantes.getClienteId()), estadoComercio);',
    nuevo: 'return new PedidoBloqueado(pedido, equipo, null, estadoComercio);',
  },
  {
    id: 'M3', descripcion: 'las transiciones de pedido no comprueban el estado del actor dentro de la transaccion',
    archivo: 'services/PedidoService.java',
    viejo: 'if (actorUsuarioId != null && estadosUsuarios.get(actorUsuarioId) == EstadoUsuario.SUSPENDIDO) {',
    nuevo: 'if (false && actorUsuarioId != null && estadosUsuarios.get(actorUsuarioId) == EstadoUsuario.SUSPENDIDO) {',
  },
  {
    id: 'M4', descripcion: 'las escrituras del comercio no comprueban el estado del actor',
    archivo: 'services/HistorialEdicionComercioService.java',
    viejo: 'EstadoUsuarioService.exigirNoSuspendido(usuarioRepository, actor.actorUsuarioId());',
    nuevo: 'usuarioRepository.leerIdConBloqueoCompartido(actor.actorUsuarioId());',
  },
  {
    id: 'M5', descripcion: 'el login revela el estado suspendido antes de probar la contrasena',
    archivo: 'services/AuthService.java',
    viejo: 'if (!suspendida) {\n            validarEstadoParaLogin(usuario);',
    nuevo: 'if (true) {\n            validarEstadoParaLogin(usuario);',
  },
  {
    id: 'M6', descripcion: 'recuperar la contrasena levanta la suspension',
    archivo: 'services/AuthService.java',
    viejo: 'if (usuario.getEstado() != EstadoUsuario.SUSPENDIDO) {\n            estadoUsuarioService.cambiar(usuario, EstadoUsuario.ACTIVO, MOTIVO_DESBLOQUEO_RECUPERACION',
    nuevo: 'if (true) {\n            estadoUsuarioService.cambiar(usuario, EstadoUsuario.ACTIVO, MOTIVO_DESBLOQUEO_RECUPERACION',
  },
  {
    id: 'M7', descripcion: 'la verificacion del email activa cualquier estado',
    archivo: 'services/AuthService.java',
    viejo: 'if (usuario != null && usuario.getEstado() == EstadoUsuario.PENDIENTE) {',
    nuevo: 'if (usuario != null) {',
  },
  {
    id: 'M8', descripcion: 'el filtro JWT no mira el estado de la cuenta',
    archivo: 'config/security/JwtAuthenticationFilter.java',
    viejo: 'if (estado != null && EstadoUsuario.SUSPENDIDO.name().equals(estado.getEstadoUsuario())) {',
    nuevo: 'if (false && estado != null && EstadoUsuario.SUSPENDIDO.name().equals(estado.getEstadoUsuario())) {',
  },
  {
    id: 'M9', descripcion: 'suspender lee al usuario con una lectura comun antes del bloqueo (snapshot temprano)',
    archivo: 'services/SuspensionUsuarioService.java',
    viejo: 'Usuario usuario = usuarioRepository.findByIdConBloqueo(usuarioId)\n                .orElseThrow(() -> new RecursoNoEncontradoException("Usuario no encontrado"));\n        entityManager.refresh(usuario);',
    nuevo: 'Usuario usuario = usuarioRepository.findById(usuarioId)\n                .orElseThrow(() -> new RecursoNoEncontradoException("Usuario no encontrado"));\n        entityManager.refresh(usuario, jakarta.persistence.LockModeType.PESSIMISTIC_WRITE);',
  },
  {
    id: 'M10', descripcion: 'suspender no cierra la sesion',
    archivo: 'services/SuspensionUsuarioService.java',
    viejo: '            cerrarSesionesPorSuspension(usuarioId);\n',
    nuevo: '',
  },
  {
    id: 'M11', descripcion: 'un pago tardio sobre un pedido cancelado no se reembolsa (H4)',
    archivo: 'services/MercadoPagoPagoService.java',
    viejo: '                pedidoService.reembolsarPagoTardio(bloqueado);\n',
    nuevo: '',
  },
  {
    id: 'M12', descripcion: 'el servicio central no escribe el historial',
    archivo: 'services/EstadoUsuarioService.java',
    viejo: 'historialEstadoUsuarioRepository.save(HistorialEstadoUsuario.builder()',
    nuevo: 'if (false) historialEstadoUsuarioRepository.save(HistorialEstadoUsuario.builder()',
  },
  {
    id: 'M13', descripcion: 'suspender no cancela los pedidos sin pagar',
    archivo: 'services/SuspensionUsuarioService.java',
    viejo: 'int cancelados = pedidoService.cancelarPedidosSinPagarPorSuspensionCliente(usuarioId);',
    nuevo: 'int cancelados = 0;',
  },
  {
    id: 'M14', descripcion: '"Ir a pagar" no esta bloqueado para una cuenta suspendida',
    archivo: 'services/MercadoPagoPagoService.java',
    viejo: '        estadoUsuarioService.exigirNoSuspendido(usuarioId);\n        Pedido pedido',
    nuevo: '        Pedido pedido',
  },
  {
    id: 'M15', descripcion: 'el cierre manual del comercio no comprueba el estado del actor',
    archivo: 'services/CierreComercioService.java',
    viejo: 'if (EstadoUsuario.valueOf(cuenta.getEstado()) == EstadoUsuario.SUSPENDIDO) {',
    nuevo: 'if (false && EstadoUsuario.valueOf(cuenta.getEstado()) == EstadoUsuario.SUSPENDIDO) {',
  },
  {
    id: 'M16', descripcion: 'levantar una cuenta que estaba inactiva la deja activa (ignora el estado anterior)',
    archivo: 'services/SuspensionUsuarioService.java',
    viejo: 'if (origen == EstadoUsuario.PENDIENTE || origen == EstadoUsuario.INACTIVO) {',
    nuevo: 'if (origen == EstadoUsuario.PENDIENTE) {',
  },
  {
    id: 'M17', descripcion: 'levantar una cuenta activa no actualiza la ultima actividad',
    archivo: 'services/SuspensionUsuarioService.java',
    viejo: 'if (estadoDestino == EstadoUsuario.ACTIVO) {\n                usuario.setFechaUltimoAcceso',
    nuevo: 'if (false) {\n                usuario.setFechaUltimoAcceso',
  },
  {
    id: 'M18', descripcion: 'levantar actualiza la ultima actividad aunque la cuenta no quede activa',
    archivo: 'services/SuspensionUsuarioService.java',
    viejo: 'if (estadoDestino == EstadoUsuario.ACTIVO) {\n                usuario.setFechaUltimoAcceso',
    nuevo: 'if (true) {\n                usuario.setFechaUltimoAcceso',
  },
  {
    id: 'M19', descripcion: 'el listado de Clientes mira siempre el email de la suspension',
    archivo: 'services/AdministradorService.java',
    viejo: 'boolean emailFallido = usuario.getEstado() == EstadoUsuario.SUSPENDIDO\n                ?',
    nuevo: 'boolean emailFallido = true\n                ?',
  },
];

const mvnw = path.join(backend, process.platform === 'win32' ? 'mvnw.cmd' : 'mvnw');

function correr() {
  const comando = `"${mvnw}" test -Dspring.profiles.active=test "-Dtest=${PRUEBAS}"`;
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

const base = correr();
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
  const base = crlf ? original.replace(/\r\n/g, '\n') : original;
  if (!base.includes(mutacion.viejo)) {
    resultados.push({ id: mutacion.id, estado: 'NO APLICA (texto no encontrado)' });
    continue;
  }
  const mutado = base.replace(mutacion.viejo, mutacion.nuevo);
  fs.writeFileSync(archivo, crlf ? mutado.replace(/\n/g, '\r\n') : mutado, 'utf8');
  let detectada = false;
  let detalle = [];
  try {
    for (let i = 0; i < REINTENTOS && !detectada; i += 1) {
      const r = correr();
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
