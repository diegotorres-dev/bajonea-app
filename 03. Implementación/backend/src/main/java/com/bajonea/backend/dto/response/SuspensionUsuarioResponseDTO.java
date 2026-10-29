package com.bajonea.backend.dto.response;

import com.bajonea.backend.enums.EstadoUsuario;
import lombok.Getter;

@Getter
public class SuspensionUsuarioResponseDTO {

    private final Integer usuarioId;
    private final EstadoUsuario estado;
    private final int pedidosSinPagarCancelados;

    public SuspensionUsuarioResponseDTO(Integer usuarioId, EstadoUsuario estado, int pedidosSinPagarCancelados) {
        this.usuarioId = usuarioId;
        this.estado = estado;
        this.pedidosSinPagarCancelados = pedidosSinPagarCancelados;
    }
}
