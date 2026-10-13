package com.bajonea.backend.repositories;

import com.bajonea.backend.enums.AccionCierre;
import com.bajonea.backend.enums.ActorCierre;
import java.time.LocalDateTime;

public record FilaActividadCierre(Integer id, LocalDateTime fechaHora, Integer usuarioId, ActorCierre actorRol,
        String actorNombre, String actorApellido, AccionCierre accion) {
}
