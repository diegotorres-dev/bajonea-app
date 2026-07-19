package com.bajonea.backend.exceptions;

/**
 * Mapea a {@code 404 Not Found} (ver GlobalExceptionHandler).
 */
public class RecursoNoEncontradoException extends RuntimeException {

    public RecursoNoEncontradoException(String mensaje) {
        super(mensaje);
    }
}
