package com.bajonea.backend.dto.response;

import com.bajonea.backend.enums.FuenteActividad;
import java.time.LocalDateTime;
import lombok.Getter;

/**
 * Una línea de la actividad del comercio. {@code id} es único entre las tres fuentes (por ejemplo
 * {@code EDICION-12}). {@code accion} y {@code entidadTipo} son códigos estables; {@code accionTexto} y
 * {@code actorRolTexto} ya vienen en texto legible. En las acciones del sistema {@code actorUsuarioId} es nulo.
 */
@Getter
public class ActividadComercioItemResponseDTO {

    private final String id;
    private final FuenteActividad fuente;
    private final LocalDateTime fechaHora;
    private final Integer actorUsuarioId;
    private final String actorNombre;
    private final String actorRol;
    private final String actorRolTexto;
    private final String accion;
    private final String accionTexto;
    private final String entidadTipo;
    private final Integer entidadId;
    private final String entidadNombre;
    private final String detalle;

    public ActividadComercioItemResponseDTO(String id, FuenteActividad fuente, LocalDateTime fechaHora, Integer actorUsuarioId,
            String actorNombre, String actorRol, String actorRolTexto, String accion, String accionTexto, String entidadTipo,
            Integer entidadId, String entidadNombre, String detalle) {
        this.id = id;
        this.fuente = fuente;
        this.fechaHora = fechaHora;
        this.actorUsuarioId = actorUsuarioId;
        this.actorNombre = actorNombre;
        this.actorRol = actorRol;
        this.actorRolTexto = actorRolTexto;
        this.accion = accion;
        this.accionTexto = accionTexto;
        this.entidadTipo = entidadTipo;
        this.entidadId = entidadId;
        this.entidadNombre = entidadNombre;
        this.detalle = detalle;
    }
}
