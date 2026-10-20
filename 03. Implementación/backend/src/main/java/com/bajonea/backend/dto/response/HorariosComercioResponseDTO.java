package com.bajonea.backend.dto.response;

import java.time.LocalDate;
import java.util.List;
import lombok.Getter;

@Getter
public class HorariosComercioResponseDTO {

    private final List<HorarioResponseDTO> vigentes;
    private final List<HorarioResponseDTO> pendientes;
    private final LocalDate rigeDesde;

    public HorariosComercioResponseDTO(List<HorarioResponseDTO> vigentes, List<HorarioResponseDTO> pendientes,
            LocalDate rigeDesde) {
        this.vigentes = vigentes;
        this.pendientes = pendientes;
        this.rigeDesde = rigeDesde;
    }
}
