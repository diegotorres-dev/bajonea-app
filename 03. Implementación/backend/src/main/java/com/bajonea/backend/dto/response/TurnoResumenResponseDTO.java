package com.bajonea.backend.dto.response;

import java.time.LocalDate;
import java.time.LocalDateTime;
import lombok.Getter;

@Getter
public class TurnoResumenResponseDTO {

    private final LocalDate fecha;
    private final LocalDateTime inicio;
    private final LocalDateTime fin;
    private final boolean cruzaMedianoche;

    public TurnoResumenResponseDTO(LocalDate fecha, LocalDateTime inicio, LocalDateTime fin, boolean cruzaMedianoche) {
        this.fecha = fecha;
        this.inicio = inicio;
        this.fin = fin;
        this.cruzaMedianoche = cruzaMedianoche;
    }
}
