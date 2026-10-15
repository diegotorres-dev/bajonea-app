package com.bajonea.backend.repositories;

import com.bajonea.backend.enums.MotivoHistorialEmpleado;
import java.time.LocalDateTime;

public record FilaActividadEquipo(Integer id, LocalDateTime fechaHora, MotivoHistorialEmpleado motivo, Integer actorUsuarioId,
        String actorNombre, String actorApellido, Integer duenoId, Integer empleadoId, String empleadoNombre, String empleadoApellido,
        Integer invitacionId, String invitacionEmail) {
}
