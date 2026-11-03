package com.bajonea.backend.dto.response;

import com.bajonea.backend.enums.EstadoTicketSoporte;
import com.bajonea.backend.enums.TipoTicketSoporte;
import java.time.LocalDateTime;
import lombok.Getter;

@Getter
public class ConsultaSoporteResumenResponseDTO {

    private final Integer id;
    private final String codigo;
    private final TipoTicketSoporte tipo;
    private final EstadoTicketSoporte estado;
    private final int cantidadMensajes;
    private final LocalDateTime creadoEn;
    private final LocalDateTime actualizadoEn;

    public ConsultaSoporteResumenResponseDTO(Integer id, String codigo, TipoTicketSoporte tipo, EstadoTicketSoporte estado,
            int cantidadMensajes, LocalDateTime creadoEn, LocalDateTime actualizadoEn) {
        this.id = id;
        this.codigo = codigo;
        this.tipo = tipo;
        this.estado = estado;
        this.cantidadMensajes = cantidadMensajes;
        this.creadoEn = creadoEn;
        this.actualizadoEn = actualizadoEn;
    }
}
