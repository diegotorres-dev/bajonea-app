package com.bajonea.backend.dto.response;

import com.bajonea.backend.enums.EstadoComercio;
import java.time.LocalDateTime;
import lombok.Getter;

/**
 * Fila del listado {@code GET /api/v1/comercios/mis-comercios}: un comercio del Dueño autenticado en
 * cualquier estado, con lo mínimo que necesita el selector de comercio del frontend. {@code operativo}
 * es {@code true} para los estados en que el comercio puede operar ({@code APROBADO} y
 * {@code APTO_VENTA}); {@code cantidadNotificacionesNoLeidas} cuenta las notificaciones no leídas del
 * Dueño que pertenecen a ese comercio (las del comercio mismo y las de sus pedidos).
 */
@Getter
public class MiComercioResponseDTO {

    private final Integer id;
    private final String nombre;
    private final String fotoPerfilUrl;
    private final EstadoComercio estado;
    private final LocalDateTime fechaRegistro;
    private final boolean operativo;
    private final long cantidadNotificacionesNoLeidas;

    public MiComercioResponseDTO(Integer id, String nombre, String fotoPerfilUrl, EstadoComercio estado,
            LocalDateTime fechaRegistro, boolean operativo, long cantidadNotificacionesNoLeidas) {
        this.id = id;
        this.nombre = nombre;
        this.fotoPerfilUrl = fotoPerfilUrl;
        this.estado = estado;
        this.fechaRegistro = fechaRegistro;
        this.operativo = operativo;
        this.cantidadNotificacionesNoLeidas = cantidadNotificacionesNoLeidas;
    }
}
