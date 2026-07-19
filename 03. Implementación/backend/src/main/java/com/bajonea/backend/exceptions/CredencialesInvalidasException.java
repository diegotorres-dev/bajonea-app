package com.bajonea.backend.exceptions;

/**
 * Mapea a {@code 401 Unauthorized} (ver GlobalExceptionHandler y CLAUDE.md, regla 4: "token
 * ausente/inválido"). Cubre credenciales de login incorrectas, contraseña actual incorrecta
 * en el cambio desde perfil, y tokens de un solo uso (verificación, recuperación,
 * reactivación) inválidos, expirados o ya utilizados.
 */
public class CredencialesInvalidasException extends RuntimeException {

    public CredencialesInvalidasException(String mensaje) {
        super(mensaje);
    }
}
