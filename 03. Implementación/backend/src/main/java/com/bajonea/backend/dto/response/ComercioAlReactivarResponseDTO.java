package com.bajonea.backend.dto.response;

import com.bajonea.backend.enums.EstadoComercio;
import lombok.Getter;

@Getter
public class ComercioAlReactivarResponseDTO {

    public enum Resultado {
        VUELVE,
        SIGUE_SUSPENDIDO
    }

    private final Integer comercioId;
    private final String nombre;
    private final EstadoComercio estadoActual;
    private final Resultado resultado;

    public ComercioAlReactivarResponseDTO(Integer comercioId, String nombre, EstadoComercio estadoActual, Resultado resultado) {
        this.comercioId = comercioId;
        this.nombre = nombre;
        this.estadoActual = estadoActual;
        this.resultado = resultado;
    }
}
