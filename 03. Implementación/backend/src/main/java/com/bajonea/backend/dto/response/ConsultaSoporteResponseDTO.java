package com.bajonea.backend.dto.response;

import com.bajonea.backend.enums.EstadoTicketSoporte;
import com.bajonea.backend.enums.TipoTicketSoporte;
import com.fasterxml.jackson.annotation.JsonInclude;
import java.time.LocalDateTime;
import java.util.List;
import lombok.Getter;

@Getter
@JsonInclude(JsonInclude.Include.NON_NULL)
public class ConsultaSoporteResponseDTO {

    private final Integer id;
    private final String codigo;
    private final TipoTicketSoporte tipo;
    private final EstadoTicketSoporte estado;
    private final int cantidadMensajes;
    private final int maxMensajes;
    private final LocalDateTime creadoEn;
    private final LocalDateTime actualizadoEn;
    private final LocalDateTime cerradoEn;
    private final boolean puedeResponder;
    private final String aviso;
    private final List<MensajeSoporteResponseDTO> mensajes;

    public ConsultaSoporteResponseDTO(Integer id, String codigo, TipoTicketSoporte tipo, EstadoTicketSoporte estado,
            int cantidadMensajes, int maxMensajes, LocalDateTime creadoEn, LocalDateTime actualizadoEn, LocalDateTime cerradoEn,
            boolean puedeResponder, String aviso, List<MensajeSoporteResponseDTO> mensajes) {
        this.id = id;
        this.codigo = codigo;
        this.tipo = tipo;
        this.estado = estado;
        this.cantidadMensajes = cantidadMensajes;
        this.maxMensajes = maxMensajes;
        this.creadoEn = creadoEn;
        this.actualizadoEn = actualizadoEn;
        this.cerradoEn = cerradoEn;
        this.puedeResponder = puedeResponder;
        this.aviso = aviso;
        this.mensajes = mensajes;
    }
}
