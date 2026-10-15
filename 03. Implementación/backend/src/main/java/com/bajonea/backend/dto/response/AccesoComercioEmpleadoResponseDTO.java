package com.bajonea.backend.dto.response;

import com.bajonea.backend.enums.EstadoEmpleadoComercio;
import com.bajonea.backend.enums.MotivoHistorialEmpleado;
import lombok.Getter;

/**
 * Respuesta de {@code GET /api/v1/empleados/comercios/{comercioId}/acceso}: cómo está la relación propia de quien
 * pregunta con ese comercio. {@code motivoBaja} ({@code BAJA_DUENO} o {@code RENUNCIA}) solo tiene valor con la
 * relación {@code INACTIVO} y se deriva de su última baja registrada (nulo si no hay registro).
 * {@code comercioAccesible} dice si el comercio está en un estado al que un Empleado accede, sin revelar el motivo
 * cuando no lo está.
 */
@Getter
public class AccesoComercioEmpleadoResponseDTO {

    private final EstadoEmpleadoComercio estado;
    private final MotivoHistorialEmpleado motivoBaja;
    private final boolean comercioAccesible;

    public AccesoComercioEmpleadoResponseDTO(EstadoEmpleadoComercio estado, MotivoHistorialEmpleado motivoBaja,
            boolean comercioAccesible) {
        this.estado = estado;
        this.motivoBaja = motivoBaja;
        this.comercioAccesible = comercioAccesible;
    }
}
