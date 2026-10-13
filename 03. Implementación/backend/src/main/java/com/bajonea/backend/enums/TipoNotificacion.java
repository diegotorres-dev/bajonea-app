package com.bajonea.backend.enums;

import static com.bajonea.backend.enums.AudienciaNotificacion.ADMINISTRADOR;
import static com.bajonea.backend.enums.AudienciaNotificacion.CLIENTE;
import static com.bajonea.backend.enums.AudienciaNotificacion.CLIENTE_O_DUENO;
import static com.bajonea.backend.enums.AudienciaNotificacion.DUENO;
import static com.bajonea.backend.enums.AudienciaNotificacion.EQUIPO;

public enum TipoNotificacion {
    NUEVO_PEDIDO(EQUIPO),
    PEDIDO_ACEPTADO(CLIENTE),
    PEDIDO_RECHAZADO(CLIENTE),
    PEDIDO_EN_CAMINO(CLIENTE),
    PEDIDO_LISTO_RETIRO(CLIENTE),
    AVISO_75MIN_SIN_CONFIRMACION(CLIENTE),
    PEDIDO_AUTOCONFIRMADO(CLIENTE),
    PEDIDO_CANCELADO_CLIENTE(EQUIPO),
    PEDIDO_ANULADO_COMERCIO(CLIENTE),
    PEDIDO_CANCELADO_SISTEMA(CLIENTE),
    PEDIDO_EXPIRADO_CLIENTE(CLIENTE),
    PEDIDO_EXPIRADO_COMERCIO(EQUIPO),
    COMERCIO_APROBADO(DUENO),
    COMERCIO_RECHAZADO(DUENO),
    COMERCIO_SUSPENDIDO(DUENO),
    NUEVO_COMERCIO_PENDIENTE(ADMINISTRADOR),
    NUEVA_RESOLICITUD_COMERCIO(ADMINISTRADOR),
    NUEVO_RECLAMO(ADMINISTRADOR),
    RECLAMO_APROBADO(CLIENTE),
    RECLAMO_RECHAZADO(CLIENTE),
    NUEVO_MENSAJE_SOPORTE(ADMINISTRADOR),
    PRODUCTO_REMOVIDO_CARRITO(CLIENTE),
    CUENTA_INACTIVADA(CLIENTE),
    COMERCIO_INACTIVADO(DUENO),
    PEDIDO_CERRADO_TIMER_SUSPENSION(CLIENTE),
    REEMBOLSO_FALLIDO_DEFINITIVO(ADMINISTRADOR),
    CLIENTE_SUSPENDIDO(CLIENTE),
    SUSPENSION_LEVANTADA(CLIENTE_O_DUENO),
    PEDIDO_AUTOCONFIRMADO_COMERCIO(EQUIPO),
    INVITACION_EMPLEADO(DUENO),
    EMPLEADO_DESACTIVADO(CLIENTE_O_DUENO);

    private final AudienciaNotificacion audiencia;

    TipoNotificacion(AudienciaNotificacion audiencia) {
        this.audiencia = audiencia;
    }

    public AudienciaNotificacion getAudiencia() {
        return audiencia;
    }
}
