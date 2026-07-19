package com.bajonea.backend.dto.response;

import lombok.Getter;

/**
 * Envoltorio estándar del cuerpo de toda respuesta HTTP del proyecto (regla transversal 3,
 * CLAUDE.md). El status code y los headers siguen a cargo de {@code ResponseEntity} por fuera
 * de esta clase.
 */
@Getter
public class ApiResponse<T> {

    private final String mensaje;
    private final T data;

    public ApiResponse(String mensaje, T data) {
        this.mensaje = mensaje;
        this.data = data;
    }
}
