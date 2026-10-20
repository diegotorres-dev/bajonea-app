package com.bajonea.backend.services;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

/**
 * Dispara una vez, al terminar de arrancar, la asignación de turnos a los pedidos anteriores a la migración V39.
 * Corre en un hilo aparte para no demorar el arranque. Con {@code turno.backfill.habilitado=false} (el perfil
 * {@code test}) no hace nada: después de la primera corrida en cada base conviene apagarlo con esa propiedad.
 */
@Component
public class TurnoBackfillRunner {

    private static final Logger log = LoggerFactory.getLogger(TurnoBackfillRunner.class);

    private final TurnoBackfillService turnoBackfillService;
    private final boolean habilitado;

    public TurnoBackfillRunner(TurnoBackfillService turnoBackfillService,
            @Value("${turno.backfill.habilitado:true}") boolean habilitado) {
        this.turnoBackfillService = turnoBackfillService;
        this.habilitado = habilitado;
    }

    @EventListener(ApplicationReadyEvent.class)
    public void alArrancar() {
        if (!habilitado) {
            return;
        }
        Thread hilo = new Thread(() -> {
            try {
                turnoBackfillService.ejecutar();
            } catch (RuntimeException e) {
                log.error("No se pudo completar la asignación de turnos a pedidos anteriores", e);
            }
        }, "turno-backfill");
        hilo.setDaemon(true);
        hilo.start();
    }
}
