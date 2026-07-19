package com.bajonea.backend.exceptions;

/**
 * Mapea a {@code 409 Conflict} (ver GlobalExceptionHandler). Para violaciones de estado o
 * regla de negocio: email duplicado, producto de otro comercio en el carrito, límite de
 * imágenes superado, etc.
 */
public class ConflictoDeNegocioException extends RuntimeException {

    public ConflictoDeNegocioException(String mensaje) {
        super(mensaje);
    }
}
