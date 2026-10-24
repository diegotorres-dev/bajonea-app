package com.bajonea.backend.dto.response;

import com.bajonea.backend.enums.AgrupacionEstadisticas;
import java.time.LocalDate;
import java.util.List;
import lombok.Getter;

@Getter
public class EstadisticasComercioResponseDTO {

    private final LocalDate desde;
    private final LocalDate hasta;
    private final AgrupacionEstadisticas agrupar;
    private final CifrasEstadisticasResponseDTO totales;
    private final List<PeriodoEstadisticasResponseDTO> periodos;

    public EstadisticasComercioResponseDTO(LocalDate desde, LocalDate hasta, AgrupacionEstadisticas agrupar,
            CifrasEstadisticasResponseDTO totales, List<PeriodoEstadisticasResponseDTO> periodos) {
        this.desde = desde;
        this.hasta = hasta;
        this.agrupar = agrupar;
        this.totales = totales;
        this.periodos = periodos;
    }
}
