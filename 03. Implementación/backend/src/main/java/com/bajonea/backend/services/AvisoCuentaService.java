package com.bajonea.backend.services;

import com.bajonea.backend.entities.Comercio;
import com.bajonea.backend.entities.HistorialEstadoComercio;
import com.bajonea.backend.entities.HistorialEstadoUsuario;
import com.bajonea.backend.entities.Notificacion;
import com.bajonea.backend.entities.Usuario;
import com.bajonea.backend.enums.EstadoComercio;
import com.bajonea.backend.enums.EstadoEnvioNotificacion;
import com.bajonea.backend.enums.EstadoUsuario;
import com.bajonea.backend.enums.TipoEntidadNotificacion;
import com.bajonea.backend.enums.TipoNotificacion;
import com.bajonea.backend.exceptions.ConflictoDeNegocioException;
import com.bajonea.backend.exceptions.RecursoNoEncontradoException;
import com.bajonea.backend.repositories.ComercioRepository;
import com.bajonea.backend.repositories.HistorialEstadoComercioRepository;
import com.bajonea.backend.repositories.HistorialEstadoUsuarioRepository;
import com.bajonea.backend.repositories.UsuarioRepository;
import com.bajonea.backend.util.EjecucionPostCommit;
import java.time.Clock;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.function.Supplier;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Avisos de la suspensión de una cuenta y de su levantamiento (T28 y T29): el aviso dentro de la app se crea en la
 * transacción de la suspensión; el email sale una sola vez, recién cuando esa transacción se confirma, y deja una
 * fila de canal {@code EMAIL} en {@code notificacion} con {@code ENVIADO} o {@code FALLIDO}. No hay reintento
 * automático: un Administrador puede reenviar el último email fallido ({@link #reenviarEmailFallido}). La persona
 * suspendida no puede ver el aviso dentro de la app mientras dure la suspensión, así que el email es su canal real.
 */
@Service
public class AvisoCuentaService {

    private static final Logger log = LoggerFactory.getLogger(AvisoCuentaService.class);

    private final NotificacionService notificacionService;
    private final EmailService emailService;
    private final UsuarioRepository usuarioRepository;
    private final HistorialEstadoUsuarioRepository historialEstadoUsuarioRepository;
    private final ComercioRepository comercioRepository;
    private final HistorialEstadoComercioRepository historialEstadoComercioRepository;
    private final Clock clock;
    private final TransactionTemplate transaccionNueva;

    public AvisoCuentaService(NotificacionService notificacionService, EmailService emailService,
            UsuarioRepository usuarioRepository, HistorialEstadoUsuarioRepository historialEstadoUsuarioRepository,
            ComercioRepository comercioRepository, HistorialEstadoComercioRepository historialEstadoComercioRepository, Clock clock,
            PlatformTransactionManager transactionManager) {
        this.notificacionService = notificacionService;
        this.emailService = emailService;
        this.usuarioRepository = usuarioRepository;
        this.historialEstadoUsuarioRepository = historialEstadoUsuarioRepository;
        this.comercioRepository = comercioRepository;
        this.historialEstadoComercioRepository = historialEstadoComercioRepository;
        this.clock = clock;
        this.transaccionNueva = new TransactionTemplate(transactionManager);
        this.transaccionNueva.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public void avisarSuspension(Integer usuarioId, String email, String motivo) {
        String mensaje = "Tu cuenta fue suspendida. Motivo: " + motivo;
        notificacionService.crearParaCliente(usuarioId, mensaje, TipoNotificacion.CLIENTE_SUSPENDIDO);
        EjecucionPostCommit.ejecutar(() -> enviarYRegistrar(usuarioId, mensaje, TipoNotificacion.CLIENTE_SUSPENDIDO,
                () -> emailService.enviarCuentaSuspendida(email, motivo)));
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public void avisarLevantamiento(Integer usuarioId, String email, String motivo) {
        String mensaje = "Levantamos la suspensión de tu cuenta."
                + (motivo == null ? "" : " Mensaje del equipo: " + motivo);
        notificacionService.crearParaCliente(usuarioId, mensaje, TipoNotificacion.SUSPENSION_LEVANTADA);
        EjecucionPostCommit.ejecutar(() -> enviarYRegistrar(usuarioId, mensaje, TipoNotificacion.SUSPENSION_LEVANTADA,
                () -> emailService.enviarSuspensionLevantada(email, motivo)));
    }

    /**
     * Aviso al Dueño de que un comercio suyo fue suspendido (T16): aviso dentro de la app con el motivo y email con
     * un solo intento después del commit, con rastro por comercio. El Dueño puede entrar al panel en solo lectura, pero
     * el email sigue siendo el canal que le llega siempre.
     */
    @Transactional(propagation = Propagation.MANDATORY)
    public void avisarSuspensionComercio(Integer duenoId, String emailDueno, Integer comercioId, String nombreComercio, String motivo) {
        String mensaje = "Tu comercio '" + nombreComercio + "' fue suspendido. Motivo: " + motivo;
        notificacionService.crearParaDueno(duenoId, comercioId, mensaje, TipoNotificacion.COMERCIO_SUSPENDIDO,
                TipoEntidadNotificacion.COMERCIO, comercioId);
        EjecucionPostCommit.ejecutar(() -> enviarYRegistrar(duenoId, mensaje, TipoNotificacion.COMERCIO_SUSPENDIDO, comercioId,
                () -> emailService.enviarComercioSuspendido(emailDueno, nombreComercio, motivo)));
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public void avisarLevantamientoComercio(Integer duenoId, String emailDueno, Integer comercioId, String nombreComercio,
            String motivo) {
        String mensaje = "Levantamos la suspensión de tu comercio '" + nombreComercio + "'."
                + (motivo == null ? "" : " Mensaje del equipo: " + motivo);
        notificacionService.crearParaDueno(duenoId, comercioId, mensaje, TipoNotificacion.SUSPENSION_LEVANTADA,
                TipoEntidadNotificacion.COMERCIO, comercioId);
        EjecucionPostCommit.ejecutar(() -> enviarYRegistrar(duenoId, mensaje, TipoNotificacion.SUSPENSION_LEVANTADA, comercioId,
                () -> emailService.enviarComercioSuspensionLevantada(emailDueno, nombreComercio, motivo)));
    }

    /**
     * Aviso a los Empleados de que el comercio fue suspendido o dejó de estarlo: solo dentro de la app, sin el motivo
     * y sin email.
     */
    @Transactional(propagation = Propagation.MANDATORY)
    public void avisarEmpleadosSuspensionComercio(Integer comercioId, String nombreComercio, java.util.Collection<Integer> empleados) {
        notificacionService.crearParaEmpleados(comercioId, empleados,
                "El comercio '" + nombreComercio + "' fue suspendido. Mientras dure no se aceptan pedidos nuevos.",
                TipoNotificacion.COMERCIO_SUSPENDIDO_EQUIPO, TipoEntidadNotificacion.COMERCIO, comercioId);
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public void avisarEmpleadosLevantamientoComercio(Integer comercioId, String nombreComercio, java.util.Collection<Integer> empleados) {
        notificacionService.crearParaEmpleados(comercioId, empleados,
                "Levantaron la suspensión del comercio '" + nombreComercio + "'. Ya vuelve a funcionar con normalidad.",
                TipoNotificacion.COMERCIO_SUSPENSION_LEVANTADA_EQUIPO, TipoEntidadNotificacion.COMERCIO, comercioId);
    }

    private void enviarYRegistrar(Integer usuarioId, String mensaje, TipoNotificacion tipo, Supplier<ResultadoEnvioEmail> envio) {
        enviarYRegistrar(usuarioId, mensaje, tipo, null, envio);
    }

    private void enviarYRegistrar(Integer usuarioId, String mensaje, TipoNotificacion tipo, Integer comercioId,
            Supplier<ResultadoEnvioEmail> envio) {
        boolean salio = enviar(envio);
        LocalDateTime fecha = LocalDateTime.now(clock).truncatedTo(ChronoUnit.SECONDS);
        try {
            transaccionNueva.executeWithoutResult(
                    status -> notificacionService.registrarResultadoEmail(usuarioId, mensaje, tipo, fecha, salio, comercioId));
        } catch (RuntimeException ex) {
            log.error("No se pudo registrar el resultado del email {} del usuarioId={}", tipo, usuarioId, ex);
        }
    }

    private static boolean enviar(Supplier<ResultadoEnvioEmail> envio) {
        try {
            return envio.get().salio();
        } catch (RuntimeException ex) {
            log.warn("El envío del aviso de cuenta terminó con un error inesperado", ex);
            return false;
        }
    }

    /**
     * Reenvía, con un solo intento, el último email de suspensión (si la cuenta sigue suspendida) o de
     * levantamiento (si ya no lo está) cuando quedó {@code FALLIDO}. El envío no corre dentro de ninguna
     * transacción.
     */
    public EstadoEnvioNotificacion reenviarEmailFallido(Integer usuarioId) {
        Reenvio reenvio = transaccionNueva.execute(status -> prepararReenvio(usuarioId));
        boolean salio = enviar(reenvio.envio());
        LocalDateTime fecha = LocalDateTime.now(clock).truncatedTo(ChronoUnit.SECONDS);
        transaccionNueva.executeWithoutResult(
                status -> notificacionService.marcarResultadoEmail(reenvio.notificacionId(), fecha, salio));
        return salio ? EstadoEnvioNotificacion.ENVIADO : EstadoEnvioNotificacion.FALLIDO;
    }

    /**
     * Reenvía, con un solo intento, el último email de suspensión del comercio (si sigue suspendido) o de levantamiento
     * (si ya no lo está) cuando quedó {@code FALLIDO}. El envío no corre dentro de ninguna transacción.
     */
    public EstadoEnvioNotificacion reenviarEmailComercioFallido(Integer comercioId) {
        Reenvio reenvio = transaccionNueva.execute(status -> prepararReenvioComercio(comercioId));
        boolean salio = enviar(reenvio.envio());
        LocalDateTime fecha = LocalDateTime.now(clock).truncatedTo(ChronoUnit.SECONDS);
        transaccionNueva.executeWithoutResult(
                status -> notificacionService.marcarResultadoEmail(reenvio.notificacionId(), fecha, salio));
        return salio ? EstadoEnvioNotificacion.ENVIADO : EstadoEnvioNotificacion.FALLIDO;
    }

    private Reenvio prepararReenvioComercio(Integer comercioId) {
        Comercio comercio = comercioRepository.findById(comercioId)
                .orElseThrow(() -> new RecursoNoEncontradoException("Comercio no encontrado"));
        Integer duenoId = comercio.getDueno().getId();
        boolean suspendido = comercio.getEstado() == EstadoComercio.SUSPENDIDO;
        TipoNotificacion tipo = suspendido ? TipoNotificacion.COMERCIO_SUSPENDIDO : TipoNotificacion.SUSPENSION_LEVANTADA;
        Notificacion ultimo = notificacionService.ultimoEmailDelComercio(duenoId, tipo, comercioId)
                .filter(email -> email.getEstado() == EstadoEnvioNotificacion.FALLIDO)
                .orElseThrow(() -> new ConflictoDeNegocioException("No hay ningún email fallido para reenviar"));
        String email = usuarioRepository.findById(duenoId)
                .orElseThrow(() -> new RecursoNoEncontradoException("Usuario no encontrado")).getEmail();
        String nombre = comercio.getNombre();
        if (suspendido) {
            String motivo = comercio.getMotivoSuspension();
            return new Reenvio(ultimo.getId(), () -> emailService.enviarComercioSuspendido(email, nombre, motivo));
        }
        String motivo = historialEstadoComercioRepository
                .findTopByComercioIdAndEstadoOrigenOrderByIdDesc(comercioId, EstadoComercio.SUSPENDIDO)
                .map(HistorialEstadoComercio::getMotivo)
                .orElse(null);
        return new Reenvio(ultimo.getId(), () -> emailService.enviarComercioSuspensionLevantada(email, nombre, motivo));
    }

    private Reenvio prepararReenvio(Integer usuarioId) {
        Usuario usuario = usuarioRepository.findById(usuarioId)
                .orElseThrow(() -> new RecursoNoEncontradoException("Usuario no encontrado"));
        boolean suspendida = usuario.getEstado() == EstadoUsuario.SUSPENDIDO;
        TipoNotificacion tipo = suspendida ? TipoNotificacion.CLIENTE_SUSPENDIDO : TipoNotificacion.SUSPENSION_LEVANTADA;
        Notificacion ultimo = notificacionService.ultimoEmail(usuarioId, tipo)
                .filter(email -> email.getEstado() == EstadoEnvioNotificacion.FALLIDO)
                .orElseThrow(() -> new ConflictoDeNegocioException("No hay ningún email fallido para reenviar"));
        String email = usuario.getEmail();
        if (suspendida) {
            String motivo = usuario.getMotivoSuspension();
            return new Reenvio(ultimo.getId(), () -> emailService.enviarCuentaSuspendida(email, motivo));
        }
        String motivo = historialEstadoUsuarioRepository
                .findTopByUsuarioIdAndEstadoOrigenOrderByIdDesc(usuarioId, EstadoUsuario.SUSPENDIDO)
                .map(HistorialEstadoUsuario::getMotivo)
                .orElse(null);
        return new Reenvio(ultimo.getId(), () -> emailService.enviarSuspensionLevantada(email, motivo));
    }

    private record Reenvio(Integer notificacionId, Supplier<ResultadoEnvioEmail> envio) {
    }
}
