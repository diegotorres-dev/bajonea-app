package com.bajonea.backend.services;

import com.bajonea.backend.repositories.MensajeSoporteRepository;
import com.bajonea.backend.util.EjecucionPostCommit;
import java.util.List;
import java.util.function.Supplier;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Emails del módulo de Soporte. Todos salen una sola vez, recién cuando la transacción de negocio se confirmó y soltó su
 * conexión ({@link EjecucionPostCommit}); si la transacción se revierte no sale ninguno, y ninguno corre dentro de una
 * transacción. Sin reintentos automáticos. El resultado del email de una respuesta de Soporte se deja marcado en el mensaje
 * ({@code email_enviado}) con una transacción corta propia, para que el Administrador vea que no salió y pueda reenviarlo.
 * Nada de lo que se registra en el log incluye emails ni códigos.
 */
@Service
public class AvisoSoporteService {

    private static final Logger log = LoggerFactory.getLogger(AvisoSoporteService.class);

    private final EmailService emailService;
    private final MensajeSoporteRepository mensajeRepository;
    private final TransactionTemplate transaccion;

    public AvisoSoporteService(EmailService emailService, MensajeSoporteRepository mensajeRepository,
            PlatformTransactionManager transactionManager) {
        this.emailService = emailService;
        this.mensajeRepository = mensajeRepository;
        this.transaccion = new TransactionTemplate(transactionManager);
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public void avisarConsultaRecibida(String email, String codigo) {
        EjecucionPostCommit.ejecutar(() -> enviar(() -> emailService.enviarSoporteConsultaRecibida(email, codigo)));
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public void avisarRespuesta(String email, String codigo, Integer mensajeId) {
        EjecucionPostCommit.ejecutar(() -> enviarYMarcar(email, codigo, mensajeId));
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public void enviarCodigos(String email, List<String> codigos) {
        EjecucionPostCommit.ejecutar(() -> enviar(() -> emailService.enviarSoporteCodigos(email, codigos)));
    }

    /**
     * Reenvío manual del email de una respuesta de Soporte que no salió. No corre dentro de ninguna transacción.
     */
    public boolean reenviarRespuesta(String email, String codigo, Integer mensajeId) {
        return enviarYMarcar(email, codigo, mensajeId);
    }

    private boolean enviarYMarcar(String email, String codigo, Integer mensajeId) {
        boolean salio = enviar(() -> emailService.enviarSoporteRespuesta(email, codigo));
        try {
            transaccion.executeWithoutResult(status -> mensajeRepository.marcarEmailEnviado(mensajeId, salio));
        } catch (RuntimeException ex) {
            log.error("No se pudo registrar el resultado del email de Soporte del mensaje {}", mensajeId, ex);
        }
        return salio;
    }

    private static boolean enviar(Supplier<ResultadoEnvioEmail> envio) {
        try {
            return envio.get().salio();
        } catch (RuntimeException ex) {
            log.warn("El envío de un email de Soporte terminó con un error inesperado: {}", ex.getClass().getSimpleName());
            return false;
        }
    }
}
