package com.bajonea.backend.services;

import java.time.Clock;
import java.time.LocalDateTime;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Proceso de vencimiento de invitaciones de empleado: cada 60 segundos pasa a {@code VENCIDA} toda invitación
 * {@code PENDIENTE} cuya fecha de vencimiento ya pasó (misma forma que {@link ReaperturaComerciosJob}: un
 * {@code @Scheduled(fixedDelay = 60_000)} que delega en un servicio transaccional). Se evalúa contra el reloj
 * de la aplicación ({@link Clock}), el mismo con el que se escribe {@code fecha_vencimiento}, nunca contra
 * {@code NOW()} de la base. Es idempotente y no necesita coordinación entre instancias: si el backend corre en
 * más de una, la segunda corrida no encuentra nada que cambiar. Si el proceso se atrasa, el estado visible
 * sigue siendo correcto: el listado calcula "vencida" y invitar o reenviar pasan a {@code VENCIDA} las del par.
 * <p>
 * Con {@code invitacion.vencimiento.job-habilitado=false} (el perfil {@code test}) la ejecución programada no
 * hace nada y la prueba lo dispara a pedido con {@link #vencerInvitaciones(LocalDateTime)}.
 */
@Component
public class InvitacionVencimientoJob {

    private static final Logger log = LoggerFactory.getLogger(InvitacionVencimientoJob.class);

    private final InvitacionVencimientoService vencimientoService;
    private final Clock clock;
    private final boolean habilitado;

    public InvitacionVencimientoJob(InvitacionVencimientoService vencimientoService, Clock clock,
            @Value("${invitacion.vencimiento.job-habilitado:true}") boolean habilitado) {
        this.vencimientoService = vencimientoService;
        this.clock = clock;
        this.habilitado = habilitado;
    }

    @Scheduled(fixedDelay = 60_000)
    public void vencerInvitaciones() {
        if (!habilitado) {
            return;
        }
        try {
            vencerInvitaciones(LocalDateTime.now(clock));
        } catch (RuntimeException e) {
            log.error("No se pudo completar el vencimiento de invitaciones de empleado", e);
        }
    }

    /**
     * Devuelve la cantidad de invitaciones pasadas a {@code VENCIDA}. Procesa por lotes hasta que no queden
     * invitaciones vencidas por pasar.
     */
    public int vencerInvitaciones(LocalDateTime ahora) {
        int total = 0;
        InvitacionVencimientoService.ResultadoLote lote;
        do {
            lote = vencimientoService.vencerLote(ahora);
            total += lote.vencidas();
        } while (lote.hayMas());
        if (total > 0) {
            log.info("Invitaciones de empleado pasadas a VENCIDA: {}", total);
        }
        return total;
    }
}
