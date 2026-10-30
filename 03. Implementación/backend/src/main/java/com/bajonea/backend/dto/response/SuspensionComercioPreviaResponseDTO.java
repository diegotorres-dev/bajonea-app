package com.bajonea.backend.dto.response;

import com.bajonea.backend.enums.EstadoComercio;
import com.bajonea.backend.enums.OrigenSuspensionComercio;
import lombok.Getter;

@Getter
public class SuspensionComercioPreviaResponseDTO {

    private final Integer comercioId;
    private final EstadoComercio estadoActual;
    private final OrigenSuspensionComercio suspensionOrigen;
    private final long pedidosPendientesDeConfirmacion;
    private final long pedidosEnPreparacion;
    private final long pedidosListosParaRetirar;
    private final long pedidosEnCamino;
    private final long pedidosSinPagar;
    private final long topePreparacionMinutos;
    private final long topeRetiroMinutos;

    public SuspensionComercioPreviaResponseDTO(Integer comercioId, EstadoComercio estadoActual,
            OrigenSuspensionComercio suspensionOrigen, long pedidosPendientesDeConfirmacion, long pedidosEnPreparacion,
            long pedidosListosParaRetirar, long pedidosEnCamino, long pedidosSinPagar, long topePreparacionMinutos,
            long topeRetiroMinutos) {
        this.comercioId = comercioId;
        this.estadoActual = estadoActual;
        this.suspensionOrigen = suspensionOrigen;
        this.pedidosPendientesDeConfirmacion = pedidosPendientesDeConfirmacion;
        this.pedidosEnPreparacion = pedidosEnPreparacion;
        this.pedidosListosParaRetirar = pedidosListosParaRetirar;
        this.pedidosEnCamino = pedidosEnCamino;
        this.pedidosSinPagar = pedidosSinPagar;
        this.topePreparacionMinutos = topePreparacionMinutos;
        this.topeRetiroMinutos = topeRetiroMinutos;
    }
}
