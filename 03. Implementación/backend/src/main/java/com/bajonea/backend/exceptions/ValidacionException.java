package com.bajonea.backend.exceptions;

/**
 * Mapea a {@code 400 Bad Request} (ver GlobalExceptionHandler). Para validaciones de negocio
 * que no se pueden expresar como anotación de Bean Validation sobre el DTO (ej. una FK que
 * no existe, detectada recién en el Service).
 */
public class ValidacionException extends RuntimeException {

    public ValidacionException(String mensaje) {
        super(mensaje);
    }
}
