package com.bajonea.backend.services;

import com.bajonea.backend.entities.Usuario;
import com.bajonea.backend.enums.CanalNotificacion;
import com.bajonea.backend.enums.MotivoRegularizacionInvitacion;
import com.bajonea.backend.enums.TipoNotificacion;
import com.bajonea.backend.repositories.NotificacionRepository;
import com.bajonea.backend.util.EjecucionPostCommit;
import java.time.Clock;
import java.time.Duration;
import java.time.LocalDateTime;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Aviso por email a una cuenta existente a la que un comercio quiso invitar pero que no está en condiciones
 * de aceptar (bloqueada, suspendida, inactiva o sin verificar). Tope de 3 por destinatario en 24 horas
 * corridas, contado sobre las filas de {@code notificacion} con tipo {@code INVITACION_EMPLEADO}, canal
 * {@code EMAIL} y el destinatario como usuario: la fila significa "se intentó", se cuenta aunque falle el
 * envío y se escribe también cuando el Dueño recibe el {@code 409}. El email sale recién al confirmar la
 * transacción. El conteo y la escritura no están serializados entre Dueños distintos que inviten a la misma
 * cuenta a la vez: el tope puede excederse en uno o dos envíos (documentado, no justifica un bloqueo).
 */
@Service
@RequiredArgsConstructor
@Transactional
public class InvitacionRegularizacionService {

    public static final int TOPE_POR_VENTANA = 3;
    public static final Duration VENTANA = Duration.ofHours(24);

    private static final Logger log = LoggerFactory.getLogger(InvitacionRegularizacionService.class);

    private final NotificacionRepository notificacionRepository;
    private final NotificacionService notificacionService;
    private final EmailService emailService;
    private final Clock clock;

    /**
     * @return {@code true} si se registró el aviso y se programó el email; {@code false} si el destinatario ya
     *         alcanzó el tope de la ventana y no se hace nada
     */
    public boolean registrarYEnviar(Usuario destinatario, String nombreComercio, MotivoRegularizacionInvitacion motivo) {
        LocalDateTime ahora = LocalDateTime.now(clock);
        long enviados = notificacionRepository.countByUsuarioIdAndTipoAndCanalAndFechaCreacionAfter(
                destinatario.getId(), TipoNotificacion.INVITACION_EMPLEADO, CanalNotificacion.EMAIL, ahora.minus(VENTANA));
        if (enviados >= TOPE_POR_VENTANA) {
            log.info("Aviso de regularización omitido: la cuenta usuarioId={} ya recibió {} en las últimas 24 horas",
                    destinatario.getId(), enviados);
            return false;
        }
        notificacionService.registrarEmailEnviado(destinatario.getId(),
                "Invitación de " + nombreComercio + " no enviada porque " + motivo.getMotivo(),
                TipoNotificacion.INVITACION_EMPLEADO, ahora);
        String email = destinatario.getEmail();
        EjecucionPostCommit.ejecutar(() -> emailService.enviarRegularizacionInvitacion(email, motivo, nombreComercio));
        return true;
    }
}
