package com.bajonea.backend.enums;

/**
 * Ciclo de vida recortado del MVP: {@code PENDIENTE -> EN_PREPARACION / RECHAZADO}.
 * No incluye EN_CAMINO, LISTO_PARA_RETIRAR, ENTREGADO, ANULADO, EXPIRADO,
 * CANCELADO_POR_SISTEMA ni PENDIENTE_PAGO del modelo completo (ver docs/modelo-mvp.md,
 * nota de alcance 9).
 */
public enum EstadoPedido {
    PENDIENTE,
    EN_PREPARACION,
    RECHAZADO
}
