package com.bajonea.backend.dto.response;

import com.bajonea.backend.enums.EstadoUsuario;
import lombok.Getter;

@Getter
public class ReactivacionCuentaResponseDTO {

    private final Integer usuarioId;
    private final EstadoUsuario estado;

    public ReactivacionCuentaResponseDTO(Integer usuarioId, EstadoUsuario estado) {
        this.usuarioId = usuarioId;
        this.estado = estado;
    }
}
