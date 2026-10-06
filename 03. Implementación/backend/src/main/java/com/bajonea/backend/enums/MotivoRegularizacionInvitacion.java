package com.bajonea.backend.enums;

public enum MotivoRegularizacionInvitacion {
    BLOQUEADA("tu cuenta está bloqueada", "Recuperá tu contraseña desde el inicio de sesión."),
    SUSPENDIDA("tu cuenta está suspendida", "Contactá a soporte."),
    INACTIVA("tu cuenta está inactiva", "Iniciá sesión para reactivarla."),
    SIN_VERIFICAR("todavía no verificaste tu email", "Verificá tu email para activar tu cuenta.");

    private final String motivo;
    private final String accion;

    MotivoRegularizacionInvitacion(String motivo, String accion) {
        this.motivo = motivo;
        this.accion = accion;
    }

    public String getMotivo() {
        return motivo;
    }

    public String getAccion() {
        return accion;
    }

    public static MotivoRegularizacionInvitacion de(EstadoUsuario estado) {
        return switch (estado) {
            case BLOQUEADO -> BLOQUEADA;
            case SUSPENDIDO -> SUSPENDIDA;
            case INACTIVO -> INACTIVA;
            case PENDIENTE -> SIN_VERIFICAR;
            case ACTIVO -> throw new IllegalArgumentException("Una cuenta ACTIVA no necesita regularización");
        };
    }
}
