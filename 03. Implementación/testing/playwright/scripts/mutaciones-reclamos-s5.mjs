import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backend = path.resolve(__dirname, '../../../backend');
const fuentes = path.join(backend, 'src/main/java/com/bajonea/backend');
const SELECCION = process.env.MUTACIONES ? process.env.MUTACIONES.split(',') : null;
const MYSQL = process.env.MYSQL_BIN || 'C:/xampp/mysql/bin/mysql.exe';
const BASE_DE_DATOS = process.env.BASE_DE_DATOS || 'bajonea_test';

const CREAR = 'ReclamoCrearIntegrationTest';
const RESOLVER = 'ReclamoResolverIntegrationTest';
const HTTP = 'ReclamoHttpIntegrationTest';
const FOTO = 'ReclamoFotoDeLaTransaccionIntegrationTest';
const POOL = 'ReclamoPoolDiminutoIntegrationTest';
const CONCURRENCIA = 'ReclamoConcurrenciaIntegrationTest';
const POLITICA = 'PoliticaReclamoTest';
const PRUEBAS_BASE = process.env.PRUEBAS
  || [CREAR, RESOLVER, HTTP, FOTO, POOL, CONCURRENCIA, POLITICA, 'MercadoPagoReembolsoClientTest', 'ReembolsoServiceReintentoTest', 'ReembolsoServiceTest'].join(',');
const REINTENTOS = Number(process.env.REINTENTOS || 1);

const MUTACIONES = [
  {
    id: 'M1', descripcion: 'la resolucion no bloquea el pedido (lectura simple)',
    archivo: 'services/ReclamoAdminService.java',
    reemplazos: [['Pedido pedido = pedidoService.bloquearParaActualizar(pedidoId, administradorUsuarioId);',
      'Pedido pedido = pedidoRepository.findById(pedidoId).orElseThrow();']],
    pruebas: [FOTO, RESOLVER].join(','),
  },
  {
    id: 'M2', descripcion: 'el reclamo se lee sin bloqueo (foto vieja de la transaccion)',
    archivo: 'services/ReclamoAdminService.java',
    reemplazos: [['reclamoRepository.findByIdParaActualizar(reclamoId)', 'reclamoRepository.findById(reclamoId)']],
    pruebas: [FOTO, CONCURRENCIA].join(','),
  },
  {
    id: 'M3', descripcion: 'sin revalidar el estado del reclamo con la fila bloqueada',
    archivo: 'services/ReclamoAdminService.java',
    reemplazos: [['if (reclamo.getEstado() != EstadoReclamo.PENDIENTE) {', 'if (false) {']],
    pruebas: [FOTO, RESOLVER, HTTP].join(','),
  },
  {
    id: 'M4', descripcion: 'sin el tope por saldo del reembolso parcial',
    archivo: 'services/ReembolsoService.java',
    reemplazos: [
      ['} else if (montoPedido.compareTo(saldo) == 0) {', '} else if (false) {'],
      ['} else if (montoPedido.compareTo(saldo) > 0) {', '} else if (false) {'],
    ],
    pruebas: [RESOLVER, HTTP].join(','),
  },
  {
    id: 'M5', descripcion: 'el reintento manda siempre el monto del pago y no el de la nota',
    archivo: 'services/ReembolsoService.java',
    reemplazos: [['cuenta.getAccessToken(), nota.getMonto(),\n                pago.getMonto(), numeroIntento', 'cuenta.getAccessToken(), pago.getMonto(),\n                pago.getMonto(), numeroIntento']],
    pruebas: RESOLVER + ',' + CONCURRENCIA,
  },
  {
    id: 'M6', descripcion: 'sin el unico de nota_credito.reclamo_id',
    sql: [
      'ALTER TABLE nota_credito DROP FOREIGN KEY fk_nota_credito_reclamo, DROP INDEX uq_nota_credito_reclamo',
      'DELETE n1 FROM nota_credito n1 JOIN nota_credito n2 ON n1.reclamo_id = n2.reclamo_id AND n1.id > n2.id; '
      + 'ALTER TABLE nota_credito ADD UNIQUE KEY uq_nota_credito_reclamo (reclamo_id), ADD CONSTRAINT fk_nota_credito_reclamo FOREIGN KEY (reclamo_id) REFERENCES reclamo (id)',
    ],
    pruebas: RESOLVER + '#elUnicoDeReclamoIdPermiteUnaSolaNotaPorReclamoYVariasNotasSinReclamo',
  },
  {
    id: 'M7', descripcion: 'el email de la resolucion se manda dentro de la transaccion',
    archivo: 'services/AvisoReclamoService.java',
    reemplazos: [[
      '        EjecucionPostCommit.ejecutar(() -> enviarYRegistrar(clienteUsuarioId, mensaje, TipoNotificacion.RECLAMO_APROBADO,\n                () -> emailService.enviarReclamoResuelto(emailCliente, pedidoId, true, monto, null)));',
      '        enviarYRegistrar(clienteUsuarioId, mensaje, TipoNotificacion.RECLAMO_APROBADO,\n                () -> emailService.enviarReclamoResuelto(emailCliente, pedidoId, true, monto, null));']],
    pruebas: POOL,
  },
  {
    id: 'M8', descripcion: 'la llamada a Mercado Pago se hace dentro de la transaccion',
    archivo: 'services/ReembolsoService.java',
    reemplazos: [[
      '        EjecucionPostCommit.ejecutar(() -> {\n            try {\n                solicitarYRegistrar(intento);\n            } catch (RuntimeException ex) {\n                log.error("Reembolso del reclamo {} (pedidoId={}) terminó con un error inesperado", reclamoId, pedidoId, ex);\n            }\n        });\n        return nota;',
      '        solicitarYRegistrar(intento);\n        return nota;']],
    pruebas: POOL,
  },
  {
    id: 'M9', descripcion: 'sin el 404 de los pedidos ajenos al crear',
    archivo: 'services/ReclamoService.java',
    reemplazos: [['        pedidoService.obtenerPedidoDelCliente(usuarioId, pedidoId);\n', '']],
    pruebas: CREAR + ',' + HTTP,
  },
  {
    id: 'M10', descripcion: 'sin la validacion del plazo de 7 dias',
    archivo: 'services/PoliticaReclamo.java',
    reemplazos: [['if (ahora.isAfter(fechaLimite(pedido))) {', 'if (false) {']],
    pruebas: [CREAR, HTTP, POLITICA].join(','),
  },
  {
    id: 'M11', descripcion: 'NO_RECIBI_PEDIDO se acepta en un pedido de retiro',
    archivo: 'services/ReclamoService.java',
    reemplazos: [['if (request.getMotivo() == MotivoReclamo.NO_RECIBI_PEDIDO && pedido.getTipoEntrega() != TipoEntrega.DOMICILIO) {', 'if (false) {']],
    pruebas: CREAR,
  },
  {
    id: 'M12', descripcion: 'el bloque ofrece NO_RECIBI_PEDIDO en un pedido de retiro',
    archivo: 'services/PoliticaReclamo.java',
    reemplazos: [['.filter(motivo -> motivo != MotivoReclamo.NO_RECIBI_PEDIDO || pedido.getTipoEntrega() == TipoEntrega.DOMICILIO)', '.filter(motivo -> true)']],
    pruebas: CREAR + ',' + POLITICA,
  },
  {
    id: 'M13', descripcion: 'la nota de un reclamo se mezcla con los campos de reembolso del pedido',
    archivo: 'services/PedidoService.java',
    reemplazos: [['            if (nota.getMotivo() == MotivoNotaCredito.RECLAMO) {\n                continue;\n            }\n', '']],
    pruebas: RESOLVER + ',' + HTTP,
  },
  {
    id: 'M14', descripcion: 'el saldo ignora las notas de otros motivos',
    archivo: 'services/ReembolsoService.java',
    reemplazos: [['notaCreditoService.montoCubiertoPorOtrasConBloqueo(pago.getId(), nota.getId())', 'BigDecimal.ZERO']],
    pruebas: RESOLVER,
  },
  {
    id: 'M15', descripcion: 'un parcial se manda siempre como reembolso total',
    archivo: 'services/ReembolsoService.java',
    reemplazos: [['boolean parcial = intento.monto().compareTo(intento.montoPago()) < 0;', 'boolean parcial = false;']],
    pruebas: RESOLVER,
  },
  {
    id: 'M16', descripcion: 'el Dueño recibe aviso tambien cuando el reclamo se rechaza',
    archivo: 'services/ReclamoAdminService.java',
    reemplazos: [['            avisos.avisarRechazoAlCliente(cliente.getId(), cliente.getEmail(), pedidoId, motivo);\n            return;',
      '            avisos.avisarRechazoAlCliente(cliente.getId(), cliente.getEmail(), pedidoId, motivo);\n            avisos.avisarReembolsoAlDueno(pedido.getComercio().getDueno().getId(), pedido.getComercio().getId(), pedidoId, java.math.BigDecimal.ONE);\n            return;']],
    pruebas: RESOLVER,
  },
  {
    id: 'M17', descripcion: 'sin traducir el choque del unico por pedido al conflicto de negocio',
    archivo: 'services/ReclamoService.java',
    reemplazos: [['if (esChoqueDelUnicoPorPedido(ex)) {', 'if (false) {']],
    pruebas: FOTO + ',' + CONCURRENCIA,
  },
  {
    id: 'M18', descripcion: 'la creacion no bloquea el pedido',
    archivo: 'services/ReclamoService.java',
    reemplazos: [['Pedido pedido = pedidoService.bloquearParaActualizar(pedidoId, usuarioId);', 'Pedido pedido = pedidoRepository.findById(pedidoId).orElseThrow();']],
    pruebas: FOTO,
  },
  {
    id: 'M19', descripcion: 'el reclamo aprobado no guarda el monto real de la nota',
    archivo: 'services/ReclamoAdminService.java',
    reemplazos: [['reclamo.setMontoAprobado(nota.getMonto());', 'reclamo.setMontoAprobado(BigDecimal.ONE);']],
    pruebas: RESOLVER + ',' + HTTP,
  },
  {
    id: 'M20', descripcion: 'el pago no se bloquea al resolver',
    archivo: 'services/ReclamoAdminService.java',
    reemplazos: [['pago = pagoService.buscarPorPedidoParaActualizar(pedidoId)', 'pago = pagoService.buscarPorPedido(pedidoId)']],
    pruebas: FOTO + ',' + RESOLVER,
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

function sql(sentencia) {
  execSync(`"${MYSQL}" -uroot ${BASE_DE_DATOS} -e "${sentencia}"`, { stdio: 'ignore' });
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
  let detectada = false;
  let detalle = [];
  if (mutacion.sql) {
    try {
      sql(mutacion.sql[0]);
      for (let i = 0; i < REINTENTOS && !detectada; i += 1) {
        const r = correr(mutacion.pruebas || PRUEBAS_BASE);
        if (!r.ok && /Tests run:|COMPILATION ERROR/.test(r.salida)) {
          detectada = true;
          detalle = fallas(r.salida);
        }
      }
    } finally {
      sql(mutacion.sql[1]);
    }
  } else {
    const ruta = path.join(fuentes, mutacion.archivo);
    const original = fs.readFileSync(ruta, 'utf8');
    const crlf = original.includes('\r\n');
    const limpio = crlf ? original.replace(/\r\n/g, '\n') : original;
    if (!mutacion.reemplazos.every(([viejo]) => limpio.includes(viejo))) {
      resultados.push({ id: mutacion.id, estado: 'NO APLICA (texto no encontrado)' });
      console.log(`${mutacion.id} NO APLICA (texto no encontrado)`);
      continue;
    }
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
  }
  resultados.push({ id: mutacion.id, descripcion: mutacion.descripcion, estado: detectada ? 'DETECTADA' : 'SOBREVIVE', detalle: detalle.slice(0, 4) });
  console.log(`${mutacion.id} ${detectada ? 'DETECTADA' : 'SOBREVIVE'}: ${mutacion.descripcion}`);
  detalle.slice(0, 4).forEach((d) => console.log(`    ${d}`));
}
console.log('\nResumen:');
resultados.forEach((r) => console.log(`${r.id}: ${r.estado}`));
const sobreviven = resultados.filter((r) => r.estado !== 'DETECTADA');
process.exitCode = sobreviven.length ? 1 : 0;
