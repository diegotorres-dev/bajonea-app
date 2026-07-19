package com.bajonea.backend.dto.response;

import java.time.LocalDateTime;
import lombok.Getter;

@Getter
public class NotificacionResponseDTO {

    private final Integer id;
    private final String mensaje;
    private final boolean leida;
    private final LocalDateTime fechaCreacion;

    public NotificacionResponseDTO(Integer id, String mensaje, boolean leida, LocalDateTime fechaCreacion) {
        this.id = id;
        this.mensaje = mensaje;
        this.leida = leida;
        this.fechaCreacion = fechaCreacion;
    }
}
