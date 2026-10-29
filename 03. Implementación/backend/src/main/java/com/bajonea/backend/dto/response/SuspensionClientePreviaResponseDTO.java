package com.bajonea.backend.dto.response;

import com.bajonea.backend.enums.EstadoUsuario;
import lombok.Getter;

@Getter
public class SuspensionClientePreviaResponseDTO {

    private final Integer usuarioId;
    private final EstadoUsuario estadoActual;
    private final long pedidosPagadosEnCurso;
    private final long pedidosSinPagar;

    public SuspensionClientePreviaResponseDTO(Integer usuarioId, EstadoUsuario estadoActual, long pedidosPagadosEnCurso,
            long pedidosSinPagar) {
        this.usuarioId = usuarioId;
        this.estadoActual = estadoActual;
        this.pedidosPagadosEnCurso = pedidosPagadosEnCurso;
        this.pedidosSinPagar = pedidosSinPagar;
    }
}
