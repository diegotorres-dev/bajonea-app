package com.bajonea.backend.services;

import java.time.LocalDateTime;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Los 5 jobs {@code @Scheduled} de la máquina de estados de Pedido (Fase 19). Las frecuencias
 * de polling son fijas, tal como se definieron con Diego — no configurables. Los umbrales de
 * negocio que cada job evalúa (30/75/90/30/90 min) sí son configurables, ver
 * {@link com.bajonea.backend.config.PedidoTimeoutProperties} / {@code application.properties}.
 * <p>
 * Con {@code pedido.jobs.habilitado=false} (el perfil {@code test}) la ejecución programada no hace nada y las
 * pruebas los disparan a pedido, con la hora que quieran, por
 * {@code POST /api/v1/test/jobs/pedidos/{nombre}?ahora=} ({@link #ejecutar(String, LocalDateTime)}).
 */
@Component
public class PedidoSchedulerService {

    private final PedidoService pedidoService;
    private final boolean habilitado;

    public PedidoSchedulerService(PedidoService pedidoService, @Value("${pedido.jobs.habilitado:true}") boolean habilitado) {
        this.pedidoService = pedidoService;
        this.habilitado = habilitado;
    }

    @Scheduled(fixedDelay = 60_000)
    public void expirarPagosVencidos() {
        if (habilitado) {
            pedidoService.expirarPagosVencidos();
        }
    }

    @Scheduled(fixedDelay = 60_000)
    public void avisar75MinYAutoconfirmar() {
        if (habilitado) {
            pedidoService.avisar75MinYAutoconfirmar();
        }
    }

    @Scheduled(fixedDelay = 300_000)
    public void expirarPedidosSinRespuestaComercio() {
        if (habilitado) {
            pedidoService.expirarPedidosSinRespuestaComercio();
        }
    }

    @Scheduled(fixedDelay = 300_000)
    public void autoconfirmarRetirosPorSuspension() {
        if (habilitado) {
            pedidoService.autoconfirmarRetirosPorSuspension();
        }
    }

    @Scheduled(fixedDelay = 60_000)
    public void cancelarPreparacionPorSuspension() {
        if (habilitado) {
            pedidoService.cancelarPreparacionPorSuspension();
        }
    }

    /**
     * Ejecución a pedido de uno de los cuatro procesos con una hora dada (la usa el controller de test). Nombres:
     * {@code expirar-pagos}, {@code avisar-y-autoconfirmar}, {@code expirar-sin-respuesta},
     * {@code autoconfirmar-retiros} y {@code cancelar-preparacion-suspension}.
     */
    public void ejecutar(String nombre, LocalDateTime ahora) {
        switch (nombre) {
            case "expirar-pagos" -> pedidoService.expirarPagosVencidos(ahora);
            case "avisar-y-autoconfirmar" -> pedidoService.avisar75MinYAutoconfirmar(ahora);
            case "expirar-sin-respuesta" -> pedidoService.expirarPedidosSinRespuestaComercio(ahora);
            case "autoconfirmar-retiros" -> pedidoService.autoconfirmarRetirosPorSuspension(ahora);
            case "cancelar-preparacion-suspension" -> pedidoService.cancelarPreparacionPorSuspension(ahora);
            default -> throw new IllegalArgumentException("Proceso de pedidos desconocido: " + nombre);
        }
    }
}
