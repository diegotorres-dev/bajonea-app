package com.bajonea.backend.enums;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Cómo terminó (o en qué punto está) un pedido que llegó pagado al comercio, para las estadísticas del Dueño. Es una
 * categoría de la API y no un estado del pedido: junta {@code CANCELADO} con {@code CANCELADO_POR_SISTEMA} y todos
 * los estados en curso, y se arma a partir del nombre del estado leído como texto de la base, porque el ENUM físico
 * conserva el literal viejo {@code PENDIENTE} que el enum {@link EstadoPedido} ya no tiene.
 */
public enum CategoriaResultadoPedido {
    ENTREGADO,
    NO_RETIRADO,
    RECHAZADO,
    CANCELADO,
    ANULADO,
    EXPIRADO,
    EN_CURSO;

    private static final Logger log = LoggerFactory.getLogger(CategoriaResultadoPedido.class);

    public static CategoriaResultadoPedido desde(String estado) {
        if (estado == null) {
            return EN_CURSO;
        }
        return switch (estado) {
            case "ENTREGADO" -> ENTREGADO;
            case "NO_RETIRADO" -> NO_RETIRADO;
            case "RECHAZADO" -> RECHAZADO;
            case "CANCELADO", "CANCELADO_POR_SISTEMA" -> CANCELADO;
            case "ANULADO" -> ANULADO;
            case "EXPIRADO" -> EXPIRADO;
            case "PENDIENTE", "PENDIENTE_CONFIRMACION_COMERCIO", "EN_PREPARACION", "EN_CAMINO", "LISTO_PARA_RETIRAR" -> EN_CURSO;
            default -> {
                log.warn("Estado de pedido desconocido en las estadísticas ({}): se cuenta como en curso", estado);
                yield EN_CURSO;
            }
        };
    }
}
