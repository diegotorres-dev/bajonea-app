package com.bajonea.backend.dto.response;

import com.bajonea.backend.enums.EstadoTicketSoporte;
import lombok.Getter;

@Getter
public class ConsultaSoporteCreadaResponseDTO {

    private final Integer id;
    private final String codigo;
    private final EstadoTicketSoporte estado;

    public ConsultaSoporteCreadaResponseDTO(Integer id, String codigo, EstadoTicketSoporte estado) {
        this.id = id;
        this.codigo = codigo;
        this.estado = estado;
    }
}
