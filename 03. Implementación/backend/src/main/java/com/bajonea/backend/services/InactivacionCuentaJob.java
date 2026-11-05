package com.bajonea.backend.services;

import com.bajonea.backend.services.InactivacionCuentaService.ResultadoCorrida;
import java.time.LocalDateTime;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Corrida diaria de la inactivación automática por falta de uso: a la hora configurada ({@code inactividad.cron}, por
 * defecto las 03:30) y en la zona de {@code app.zona-horaria}. Hay que dejar una sola instancia del backend con el
 * proceso habilitado. Con {@code inactividad.job-habilitado=false} (el perfil {@code test}) no hace nada solo y la
 * prueba lo dispara a pedido con {@link #inactivarCuentas(LocalDateTime)}.
 */
@Component
public class InactivacionCuentaJob {

    private static final Logger log = LoggerFactory.getLogger(InactivacionCuentaJob.class);

    private final InactivacionCuentaService servicio;
    private final boolean habilitado;

    public InactivacionCuentaJob(InactivacionCuentaService servicio,
            @Value("${inactividad.job-habilitado:true}") boolean habilitado) {
        this.servicio = servicio;
        this.habilitado = habilitado;
    }

    @Scheduled(cron = "${inactividad.cron:0 30 3 * * *}", zone = "${app.zona-horaria:America/Argentina/Ushuaia}")
    public void programada() {
        if (!habilitado) {
            return;
        }
        try {
            ResultadoCorrida resultado = inactivarCuentas(servicio.ahora());
            log.info("Inactivación por falta de uso: {} candidatas, {} inactivadas, {} omitidas, {} con falla",
                    resultado.candidatos(), resultado.inactivadas(), resultado.omitidas(), resultado.conFalla());
        } catch (RuntimeException e) {
            log.error("No se pudo completar la corrida de inactivación por falta de uso", e);
        }
    }

    public ResultadoCorrida inactivarCuentas(LocalDateTime ahora) {
        return servicio.inactivarVencidas(ahora);
    }
}
