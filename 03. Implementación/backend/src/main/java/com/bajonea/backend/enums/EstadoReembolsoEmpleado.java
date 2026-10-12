package com.bajonea.backend.enums;

/**
 * Estado del reembolso de un pedido en términos simples, solo lectura, para el Empleado. Resume el estado de la
 * nota de crédito más reciente sin exponer el detalle técnico (reintentos, errores de Mercado Pago).
 */
public enum EstadoReembolsoEmpleado {
    SIN_REEMBOLSO,
    EN_PROCESO,
    REEMBOLSADO,
    EN_REVISION;

    public static EstadoReembolsoEmpleado desde(EstadoNotaCredito estado) {
        if (estado == null) {
            return SIN_REEMBOLSO;
        }
        return switch (estado) {
            case PENDIENTE, PENDIENTE_REINTENTO -> EN_PROCESO;
            case PROCESADO -> REEMBOLSADO;
            case FALLIDO, PENDIENTE_REVISION_MANUAL -> EN_REVISION;
        };
    }
}
