package com.bajonea.backend.exceptions;

/**
 * Se superó un límite del módulo de Soporte (consultas por día, consultas abiertas, consultas por conexión, intentos de
 * acceso con un código incorrecto o reenvíos de códigos). Mapea a {@code 429 Too Many Requests} (ver GlobalExceptionHandler).
 */
public class LimiteSoporteException extends RuntimeException {

    public LimiteSoporteException(String mensaje) {
        super(mensaje);
    }
}
