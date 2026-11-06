package com.bajonea.backend.dto.response;

import com.bajonea.backend.enums.EstadoUsuario;
import com.bajonea.backend.enums.RolUsuario;
import java.util.List;
import lombok.Getter;

@Getter
public class ReactivacionCuentaPreviaResponseDTO {

    private final Integer usuarioId;
    private final RolUsuario rol;
    private final EstadoUsuario estadoActual;
    private final List<ComercioAlReactivarResponseDTO> comercios;

    public ReactivacionCuentaPreviaResponseDTO(Integer usuarioId, RolUsuario rol, EstadoUsuario estadoActual,
            List<ComercioAlReactivarResponseDTO> comercios) {
        this.usuarioId = usuarioId;
        this.rol = rol;
        this.estadoActual = estadoActual;
        this.comercios = comercios;
    }
}
