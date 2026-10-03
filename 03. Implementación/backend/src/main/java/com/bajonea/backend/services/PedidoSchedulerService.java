package com.bajonea.backend.services;

import lombok.RequiredArgsConstructor;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Los 4 jobs {@code @Scheduled} de la máquina de estados de Pedido (Fase 19). Las frecuencias
 * de polling son fijas, tal como se definieron con Diego — no configurables. Los umbrales de
 * negocio que cada job evalúa (30/75/90/30/90 min) sí son configurables, ver
 * {@link com.bajonea.backend.config.PedidoTimeoutProperties} / {@code application.properties}.
 */
@Component
@RequiredArgsConstructor
public class PedidoSchedulerService {

    private final PedidoService pedidoService;

    @Scheduled(fixedDelay = 60_000)
    public void expirarPagosVencidos() {
        pedidoService.expirarPagosVencidos();
    }

    @Scheduled(fixedDelay = 60_000)
    public void avisar75MinYAutoconfirmar() {
        pedidoService.avisar75MinYAutoconfirmar();
    }

    @Scheduled(fixedDelay = 300_000)
    public void expirarPedidosSinRespuestaComercio() {
        pedidoService.expirarPedidosSinRespuestaComercio();
    }

    @Scheduled(fixedDelay = 300_000)
    public void autoconfirmarRetirosPorSuspension() {
        pedidoService.autoconfirmarRetirosPorSuspension();
    }
}
