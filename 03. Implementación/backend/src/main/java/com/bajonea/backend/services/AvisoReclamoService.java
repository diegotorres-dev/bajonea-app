package com.bajonea.backend.services;

import com.bajonea.backend.enums.TipoEntidadNotificacion;
import com.bajonea.backend.enums.TipoNotificacion;
import com.bajonea.backend.util.EjecucionPostCommit;
import java.math.BigDecimal;
import java.time.Clock;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Avisos de la resolución de un reclamo. Al Cliente le llega un aviso dentro de la app (creado en la transacción de la
 * resolución) y un email que sale una sola vez, recién cuando esa transacción se confirmó y soltó su conexión (nunca dentro
 * de ella), con el rastro del resultado en una fila de canal {@code EMAIL}; no hay reintento automático. Al Dueño le llega
 * solo el aviso dentro de la app, y únicamente cuando hubo reembolso: el texto no afirma cuánto se le descuenta, porque el
 * reparto de un reembolso parcial entre el Dueño y la plataforma no está verificado.
 */
@Service
public class AvisoReclamoService {

    private static final Logger log = LoggerFactory.getLogger(AvisoReclamoService.class);

    private final NotificacionService notificacionService;
    private final EmailService emailService;
    private final Clock clock;
    private final TransactionTemplate transaccion;

    public AvisoReclamoService(NotificacionService notificacionService, EmailService emailService, Clock clock,
            PlatformTransactionManager transactionManager) {
        this.notificacionService = notificacionService;
        this.emailService = emailService;
        this.clock = clock;
        this.transaccion = new TransactionTemplate(transactionManager);
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public void avisarAprobacionAlCliente(Integer clienteUsuarioId, String emailCliente, Integer pedidoId, BigDecimal monto) {
        String mensaje = "Aprobamos tu reclamo del pedido #" + pedidoId + " y te vamos a devolver "
                + ResumenTurnoMensajeBuilder.monto(monto) + ". El reembolso puede tardar unos días en acreditarse.";
        notificacionService.crearParaCliente(clienteUsuarioId, mensaje, TipoNotificacion.RECLAMO_APROBADO,
                TipoEntidadNotificacion.PEDIDO, pedidoId);
        EjecucionPostCommit.ejecutar(() -> enviarYRegistrar(clienteUsuarioId, mensaje, TipoNotificacion.RECLAMO_APROBADO,
                () -> emailService.enviarReclamoResuelto(emailCliente, pedidoId, true, monto, null)));
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public void avisarRechazoAlCliente(Integer clienteUsuarioId, String emailCliente, Integer pedidoId, String motivo) {
        String mensaje = "Revisamos tu reclamo del pedido #" + pedidoId + " y no pudimos aprobarlo. Motivo: " + motivo;
        notificacionService.crearParaCliente(clienteUsuarioId, mensaje, TipoNotificacion.RECLAMO_RECHAZADO,
                TipoEntidadNotificacion.PEDIDO, pedidoId);
        EjecucionPostCommit.ejecutar(() -> enviarYRegistrar(clienteUsuarioId, mensaje, TipoNotificacion.RECLAMO_RECHAZADO,
                () -> emailService.enviarReclamoResuelto(emailCliente, pedidoId, false, null, motivo)));
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public void avisarReembolsoAlDueno(Integer duenoId, Integer comercioId, Integer pedidoId, BigDecimal monto) {
        String mensaje = "Reembolsamos " + ResumenTurnoMensajeBuilder.monto(monto) + " al Cliente por un reclamo del pedido #"
                + pedidoId + ". Mercado Pago lo descuenta de tu cuenta en la parte que te corresponde.";
        notificacionService.crearParaDueno(duenoId, comercioId, mensaje, TipoNotificacion.RECLAMO_REEMBOLSO_DUENO,
                TipoEntidadNotificacion.PEDIDO, pedidoId);
    }

    private void enviarYRegistrar(Integer usuarioId, String mensaje, TipoNotificacion tipo,
            java.util.function.Supplier<ResultadoEnvioEmail> envio) {
        boolean salio;
        try {
            salio = envio.get().salio();
        } catch (RuntimeException ex) {
            log.warn("El envío del email {} terminó con un error inesperado", tipo, ex);
            salio = false;
        }
        boolean resultado = salio;
        LocalDateTime fecha = LocalDateTime.now(clock).truncatedTo(ChronoUnit.SECONDS);
        try {
            transaccion.executeWithoutResult(
                    status -> notificacionService.registrarResultadoEmail(usuarioId, mensaje, tipo, fecha, resultado, null));
        } catch (RuntimeException ex) {
            log.error("No se pudo registrar el resultado del email {} del usuarioId={}", tipo, usuarioId, ex);
        }
    }
}
