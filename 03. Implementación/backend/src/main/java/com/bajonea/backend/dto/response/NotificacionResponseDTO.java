package com.bajonea.backend.dto.response;

import com.bajonea.backend.enums.TipoEntidadNotificacion;
import java.time.LocalDateTime;
import lombok.Getter;

@Getter
public class NotificacionResponseDTO {

    private final Integer id;
    private final String mensaje;
    private final boolean leida;
    private final LocalDateTime fechaCreacion;
    private final TipoEntidadNotificacion entidadTipo;
    private final Integer entidadId;

    public NotificacionResponseDTO(Integer id, String mensaje, boolean leida, LocalDateTime fechaCreacion,
            TipoEntidadNotificacion entidadTipo, Integer entidadId) {
        this.id = id;
        this.mensaje = mensaje;
        this.leida = leida;
        this.fechaCreacion = fechaCreacion;
        this.entidadTipo = entidadTipo;
        this.entidadId = entidadId;
    }
}
