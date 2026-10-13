package com.bajonea.backend.services;

import com.bajonea.backend.entities.CuentaMercadoPago;
import com.bajonea.backend.entities.NotaCredito;
import com.bajonea.backend.entities.Pago;
import com.bajonea.backend.entities.Pedido;
import com.bajonea.backend.enums.EstadoNotaCredito;
import com.bajonea.backend.enums.MotivoNotaCredito;
import com.bajonea.backend.exceptions.ConflictoDeNegocioException;
import com.bajonea.backend.exceptions.RecursoNoEncontradoException;
import com.bajonea.backend.services.MercadoPagoReembolsoClient.ResultadoReembolsoMp;
import java.math.BigDecimal;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Reembolso total de un pedido cuyo pago ya estaba confirmado en MercadoPago. La nota de crédito se crea en la
 * <b>misma transacción</b> que el cambio de estado del pedido ({@link #generarNotaYReembolsarTotal}), con el
 * pedido ya bloqueado: si no se puede escribir la nota el pedido no cambia de estado, y una transición que pierde
 * una carrera nunca llega a pedir plata. Solo la llamada a MercadoPago va después del commit; si falla, nunca
 * deshace el cambio de estado ya confirmado: la nota queda en el estado que corresponda al resultado real
 * ({@code PROCESADO}, {@code FALLIDO} o {@code PENDIENTE_REVISION_MANUAL}) como rastro consultable por el
 * Administrador, que puede reintentarla ({@link #reintentarNotaCredito}).
 *
 * <p>La llamada HTTP no corre dentro de una transacción ni mantiene bloqueada la fila del pedido. No usa
 * {@code @Transactional} de clase a propósito.
 *
 * <p>Criterio único de "pago reembolsable": {@code mp_estado = 'approved'} y
 * {@code fecha_confirmacion} no nula. {@code id_transaccion_mp} por sí solo no sirve (también se
 * completa con pagos rechazados).
 */
@Service
public class ReembolsoService {

    private static final Logger log = LoggerFactory.getLogger(ReembolsoService.class);

    private static final String ESTADO_PAGO_APROBADO = "approved";
    private static final String ERROR_CUENTA_DESVINCULADA =
            "La cuenta de Mercado Pago del comercio está desvinculada: el reembolso no se intentó automáticamente";

    private final PagoService pagoService;
    private final NotaCreditoService notaCreditoService;
    private final CuentaMercadoPagoService cuentaMercadoPagoService;
    private final MercadoPagoReembolsoClient reembolsoClient;
    private final TransactionTemplate transaccionNueva;

    public ReembolsoService(PagoService pagoService, NotaCreditoService notaCreditoService,
            CuentaMercadoPagoService cuentaMercadoPagoService, MercadoPagoReembolsoClient reembolsoClient,
            PlatformTransactionManager transactionManager) {
        this.pagoService = pagoService;
        this.notaCreditoService = notaCreditoService;
        this.cuentaMercadoPagoService = cuentaMercadoPagoService;
        this.reembolsoClient = reembolsoClient;
        this.transaccionNueva = new TransactionTemplate(transactionManager);
        this.transaccionNueva.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
    }

    /**
     * Crea la nota de crédito de quien no puede dejar un pedido sin ella (anulación, rechazo, vencimiento sin
     * respuesta, suspensión del comercio y cancelación del Cliente): la nota se crea en la <b>misma transacción</b>
     * que el cambio de estado del pedido, así que si no se puede escribir la nota el pedido no cambia de estado.
     * Exige una transacción abierta con el pedido ya bloqueado ({@code PedidoService.bloquearParaActualizar}): ese
     * bloqueo es lo que impide que dos transiciones simultáneas creen dos notas, y además se vuelve a mirar el
     * monto ya cubierto del pago por si acaso. Solo la llamada a Mercado Pago se difiere a después del commit
     * (con el registro del resultado en una transacción propia), y únicamente si el commit ocurre: una transición
     * que pierde la carrera nunca llega a pedir plata.
     *
     * <p>Devuelve {@code true} si el pedido tiene una nota de crédito (recién creada o ya existente) y por lo tanto
     * hay una devolución en gestión; {@code false} si el pedido no tiene un pago aprobado y confirmado que
     * reembolsar.
     */
    public boolean generarNotaYReembolsarTotal(Pedido pedido, MotivoNotaCredito motivo) {
        if (!TransactionSynchronizationManager.isActualTransactionActive()) {
            throw new IllegalStateException("La nota de crédito de una anulación se crea dentro de la transacción del cambio de estado");
        }
        Integer pedidoId = pedido.getId();
        PreparacionReembolso preparacion = prepararIntento(pedidoId, motivo);
        IntentoReembolso intento = preparacion.intento();
        if (intento != null) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    try {
                        solicitarYRegistrar(intento);
                    } catch (RuntimeException ex) {
                        log.error("Reembolso del pedidoId={} ({}) terminó con un error inesperado", pedidoId, motivo, ex);
                    }
                }
            });
        }
        return preparacion.hayNota();
    }

    /**
     * Reintento manual (Administrador) de una nota que quedó en {@code PENDIENTE_REVISION_MANUAL} o
     * {@code FALLIDO}. Mismo flujo que el reembolso original, pero sobre la nota existente en vez de
     * crear una nueva. A diferencia de la llamada a Mercado Pago que sigue a un cambio de estado, acá sí se lanzan las
     * excepciones de negocio: quien lo dispara es una persona esperando una respuesta. Corre
     * siempre en el acto (nunca diferido a un commit) y no debe invocarse dentro de una
     * transacción abierta, para que la llamada a MercadoPago quede fuera de ella.
     */
    public void reintentarNotaCredito(Integer notaCreditoId) {
        IntentoReembolso intento = transaccionNueva.execute(status -> prepararReintento(notaCreditoId));
        solicitarYRegistrar(intento);
    }

    private void solicitarYRegistrar(IntentoReembolso intento) {
        String idempotencyKey = "nc-" + intento.notaCreditoId() + "-" + intento.numeroIntento();
        ResultadoReembolsoMp resultado = reembolsoClient.solicitarReembolsoTotal(intento.paymentId(), intento.accessToken(), idempotencyKey);

        transaccionNueva.executeWithoutResult(status -> {
            if (resultado.exitoso()) {
                notaCreditoService.registrarReembolsoExitoso(intento.notaCreditoId(), resultado.refundId());
                log.info("Reembolso total del pedidoId={} ({}) procesado: refundId={}, monto={}",
                        intento.pedidoId(), intento.motivo(), resultado.refundId(), intento.monto());
            } else {
                notaCreditoService.registrarReembolsoFallido(intento.notaCreditoId(), resultado.error());
                log.error("Reembolso total del pedidoId={} ({}) FALLIDO: {}", intento.pedidoId(), intento.motivo(), resultado.error());
            }
        });
    }

    private IntentoReembolso prepararReintento(Integer notaCreditoId) {
        NotaCredito nota = notaCreditoService.obtenerParaActualizar(notaCreditoId);
        Integer pedidoId = nota.getPago().getPedido().getId();
        Pago pago = pagoService.buscarPorPedidoParaActualizar(pedidoId)
                .orElseThrow(() -> new RecursoNoEncontradoException("El pedido de la nota de crédito no tiene ningún pago asociado"));

        if (nota.getEstado() != EstadoNotaCredito.PENDIENTE_REVISION_MANUAL && nota.getEstado() != EstadoNotaCredito.FALLIDO) {
            throw new ConflictoDeNegocioException(nota.getEstado() == EstadoNotaCredito.PROCESADO
                    ? "Este reembolso ya se procesó"
                    : "Este reembolso ya está en proceso o ya no requiere revisión");
        }
        if (!esPagoReembolsable(pago)) {
            throw new ConflictoDeNegocioException("El pago del pedido no está aprobado en Mercado Pago: no hay nada que reembolsar");
        }
        if (notaCreditoService.montoCubiertoExcluyendo(pago.getId(), nota.getId()).add(nota.getMonto()).compareTo(pago.getMonto()) > 0) {
            throw new ConflictoDeNegocioException("El pago ya tiene otro reembolso registrado: reintentar este duplicaría la devolución");
        }

        Integer duenoId = pago.getPedido().getComercio().getDueno().getId();
        CuentaMercadoPago cuenta = cuentaMercadoPagoService.buscarActivaPorDueno(duenoId)
                .orElseThrow(() -> new ConflictoDeNegocioException(
                        "La cuenta de Mercado Pago del comercio sigue desvinculada. El comercio tiene que volver a vincularla para poder reintentar el reembolso"));

        int numeroIntento = nota.getIntentos() + 1;
        notaCreditoService.marcarEnProceso(nota.getId());
        return new IntentoReembolso(nota.getId(), pago.getIdTransaccionMp(), cuenta.getAccessToken(), nota.getMonto(),
                numeroIntento, pedidoId, nota.getMotivo());
    }

    private PreparacionReembolso prepararIntento(Integer pedidoId, MotivoNotaCredito motivo) {
        Optional<Pago> pagoOpt = pagoService.buscarPorPedidoParaActualizar(pedidoId);
        if (pagoOpt.isEmpty()) {
            log.info("Pedido {} sin pago de Mercado Pago asociado: no hay nada que reembolsar", pedidoId);
            return PreparacionReembolso.SIN_NOTA;
        }
        Pago pago = pagoOpt.get();
        if (!esPagoReembolsable(pago)) {
            log.info("Pedido {}: el pago no está aprobado y confirmado (mp_estado={}), no se reembolsa", pedidoId, pago.getMpEstado());
            return PreparacionReembolso.SIN_NOTA;
        }
        if (notaCreditoService.montoCubierto(pago.getId()).compareTo(pago.getMonto()) >= 0) {
            log.info("Pedido {}: el pago ya tiene reembolso registrado por el monto completo, no se duplica", pedidoId);
            return new PreparacionReembolso(null, true);
        }

        Integer duenoId = pago.getPedido().getComercio().getDueno().getId();
        Optional<CuentaMercadoPago> cuenta = cuentaMercadoPagoService.buscarActivaPorDueno(duenoId);
        if (cuenta.isEmpty()) {
            NotaCredito nota = notaCreditoService.crearPendienteRevisionManual(pago, pago.getMonto(), motivo, ERROR_CUENTA_DESVINCULADA);
            log.warn("Pedido {}: cuenta de Mercado Pago del comercio desvinculada, nota de crédito {} queda pendiente de revisión manual",
                    pedidoId, nota.getId());
            return new PreparacionReembolso(null, true);
        }

        NotaCredito nota = notaCreditoService.crear(pago, pago.getMonto(), motivo);
        return new PreparacionReembolso(new IntentoReembolso(nota.getId(), pago.getIdTransaccionMp(), cuenta.get().getAccessToken(),
                pago.getMonto(), nota.getIntentos() + 1, pedidoId, motivo), true);
    }

    private static boolean esPagoReembolsable(Pago pago) {
        return ESTADO_PAGO_APROBADO.equals(pago.getMpEstado())
                && pago.getFechaConfirmacion() != null
                && pago.getIdTransaccionMp() != null;
    }

    private record PreparacionReembolso(IntentoReembolso intento, boolean hayNota) {

        static final PreparacionReembolso SIN_NOTA = new PreparacionReembolso(null, false);
    }

    private record IntentoReembolso(Integer notaCreditoId, String paymentId, String accessToken, BigDecimal monto,
            int numeroIntento, Integer pedidoId, MotivoNotaCredito motivo) {
    }
}
