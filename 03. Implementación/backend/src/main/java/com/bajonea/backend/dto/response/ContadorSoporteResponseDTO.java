package com.bajonea.backend.dto.response;

import lombok.Getter;

@Getter
public class ContadorSoporteResponseDTO {

    private final long esperandoTuRespuesta;

    public ContadorSoporteResponseDTO(long esperandoTuRespuesta) {
        this.esperandoTuRespuesta = esperandoTuRespuesta;
    }
}
