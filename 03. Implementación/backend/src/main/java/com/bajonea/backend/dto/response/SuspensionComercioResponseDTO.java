package com.bajonea.backend.dto.response;

import com.bajonea.backend.enums.EstadoComercio;
import com.bajonea.backend.enums.OrigenSuspensionComercio;
import java.time.LocalDateTime;
import lombok.Getter;

@Getter
public class SuspensionComercioResponseDTO {

    private final Integer comercioId;
    private final EstadoComercio estado;
    private final OrigenSuspensionComercio suspensionOrigen;
    private final LocalDateTime suspendidoDesde;
    private final String motivoSuspension;

    public SuspensionComercioResponseDTO(Integer comercioId, EstadoComercio estado, OrigenSuspensionComercio suspensionOrigen,
            LocalDateTime suspendidoDesde, String motivoSuspension) {
        this.comercioId = comercioId;
        this.estado = estado;
        this.suspensionOrigen = suspensionOrigen;
        this.suspendidoDesde = suspendidoDesde;
        this.motivoSuspension = motivoSuspension;
    }
}
