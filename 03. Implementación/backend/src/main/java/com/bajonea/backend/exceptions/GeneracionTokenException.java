package com.bajonea.backend.exceptions;

/**
 * Se lanza cuando {@code TokenService} agota los reintentos sin lograr un código único. Mapea a
 * {@code 500 Internal Server Error} con un mensaje propio (ver GlobalExceptionHandler): es una falla
 * del servidor, no un conflicto de datos del usuario, así que nunca debe confundirse con el
 * {@code 409} de "ya existe un registro".
 */
public class GeneracionTokenException extends RuntimeException {

    public GeneracionTokenException(String mensaje) {
        super(mensaje);
    }
}
