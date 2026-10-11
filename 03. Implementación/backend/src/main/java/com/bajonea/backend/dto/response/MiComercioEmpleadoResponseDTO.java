package com.bajonea.backend.dto.response;

import com.bajonea.backend.enums.EstadoComercio;
import java.time.LocalDateTime;
import lombok.Getter;

/**
 * Fila de {@code GET /api/v1/empleados/mis-comercios}: la forma de {@link MiComercioResponseDTO} más
 * {@code fechaAlta}, la fecha en que el Empleado se sumó al equipo del comercio. {@code fechaRegistro} sigue
 * siendo la del comercio. {@code cantidadNotificacionesNoLeidas} vale siempre 0: las notificaciones del
 * Empleado por comercio quedan fuera de este tramo.
 */
@Getter
public class MiComercioEmpleadoResponseDTO extends MiComercioResponseDTO {

    private final LocalDateTime fechaAlta;

    public MiComercioEmpleadoResponseDTO(Integer id, String nombre, String fotoPerfilUrl, EstadoComercio estado,
            LocalDateTime fechaRegistro, boolean operativo, long cantidadNotificacionesNoLeidas, boolean cerradoManualmente,
            boolean abiertoAhora, boolean puedeCambiarCierre, String textoReapertura, LocalDateTime fechaAlta) {
        super(id, nombre, fotoPerfilUrl, estado, fechaRegistro, operativo, cantidadNotificacionesNoLeidas, cerradoManualmente,
                abiertoAhora, puedeCambiarCierre, textoReapertura);
        this.fechaAlta = fechaAlta;
    }
}
