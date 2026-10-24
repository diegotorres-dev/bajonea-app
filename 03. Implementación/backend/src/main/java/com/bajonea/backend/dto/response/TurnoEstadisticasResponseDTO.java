package com.bajonea.backend.dto.response;

import java.time.LocalDateTime;
import lombok.Getter;

@Getter
public class TurnoEstadisticasResponseDTO {

    private final Integer horarioId;
    private final LocalDateTime inicio;
    private final LocalDateTime fin;
    private final boolean cruzaMedianoche;

    public TurnoEstadisticasResponseDTO(Integer horarioId, LocalDateTime inicio, LocalDateTime fin, boolean cruzaMedianoche) {
        this.horarioId = horarioId;
        this.inicio = inicio;
        this.fin = fin;
        this.cruzaMedianoche = cruzaMedianoche;
    }
}
