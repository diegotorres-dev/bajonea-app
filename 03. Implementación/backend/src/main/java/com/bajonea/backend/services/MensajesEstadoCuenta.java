package com.bajonea.backend.services;

import com.bajonea.backend.enums.EstadoUsuario;

/**
 * Texto de conflicto que corresponde a una cuenta que no está {@code ACTIVO}. Es el vocabulario del login
 * (el frontend lo mapea a su mensaje humano en {@code MENSAJES_LOGIN_CONFLICTO}) y lo reutiliza el alta por
 * invitación de empleado para no inventar un tercero.
 */
public final class MensajesEstadoCuenta {

    private MensajesEstadoCuenta() {
    }

    /**
     * @return el mensaje de conflicto del estado, o {@code null} si la cuenta está {@code ACTIVO} y no hay
     *         nada que informar
     */
    public static String conflictoDeLogin(EstadoUsuario estado) {
        return switch (estado) {
            case ACTIVO -> null;
            case PENDIENTE -> "Verificá tu email antes de iniciar sesión";
            case BLOQUEADO -> "Cuenta bloqueada. Recuperá tu contraseña para desbloquearla";
            case INACTIVO -> "Cuenta inactiva. Solicitá la reactivación de tu cuenta";
            case SUSPENDIDO -> "Cuenta suspendida";
        };
    }
}
