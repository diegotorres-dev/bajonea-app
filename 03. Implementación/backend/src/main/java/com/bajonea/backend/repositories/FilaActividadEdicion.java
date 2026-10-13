package com.bajonea.backend.repositories;

import com.bajonea.backend.enums.AccionEdicion;
import com.bajonea.backend.enums.RolActorComercio;
import com.bajonea.backend.enums.TipoEntidadEdicion;
import java.time.LocalDateTime;

public record FilaActividadEdicion(Integer id, LocalDateTime fechaHora, Integer usuarioId, RolActorComercio actorRol,
        String actorNombre, String actorApellido, TipoEntidadEdicion entidadTipo, Integer entidadId, String entidadNombre,
        AccionEdicion accion, String detalle) {
}
