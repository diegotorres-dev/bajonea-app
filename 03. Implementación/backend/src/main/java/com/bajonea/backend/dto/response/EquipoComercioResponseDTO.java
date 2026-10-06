package com.bajonea.backend.dto.response;

import java.util.List;
import lombok.Getter;

/**
 * Equipo de un comercio para el Dueño: miembros activos e inactivos (por fecha de alta) e invitaciones
 * pendientes, vencidas o con el código bloqueado. Las invitaciones canceladas, reemplazadas y aceptadas no
 * aparecen (la aceptada figura como miembro).
 */
@Getter
public class EquipoComercioResponseDTO {

    private final List<MiembroEquipoResponseDTO> miembros;
    private final List<InvitacionEmpleadoResponseDTO> invitaciones;

    public EquipoComercioResponseDTO(List<MiembroEquipoResponseDTO> miembros, List<InvitacionEmpleadoResponseDTO> invitaciones) {
        this.miembros = miembros;
        this.invitaciones = invitaciones;
    }
}
