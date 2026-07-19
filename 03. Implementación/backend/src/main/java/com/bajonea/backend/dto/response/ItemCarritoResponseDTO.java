package com.bajonea.backend.dto.response;

import java.math.BigDecimal;
import lombok.Getter;

/**
 * Incluye {@code id} (del propio ItemCarrito) además de los campos pedidos — no es un
 * agregado arbitrario: {@code PUT /carrito/items/{id}} y {@code DELETE /carrito/items/{id}}
 * (Fase 9) necesitan que el frontend tenga ese id disponible desde acá para poder armar
 * esas requests.
 */
@Getter
public class ItemCarritoResponseDTO {

    private final Integer id;
    private final Integer productoId;
    private final String nombreProducto;
    private final BigDecimal precioUnitario;
    private final Integer cantidad;
    private final BigDecimal subtotal;
    private final String nota;

    public ItemCarritoResponseDTO(
            Integer id,
            Integer productoId,
            String nombreProducto,
            BigDecimal precioUnitario,
            Integer cantidad,
            BigDecimal subtotal,
            String nota) {
        this.id = id;
        this.productoId = productoId;
        this.nombreProducto = nombreProducto;
        this.precioUnitario = precioUnitario;
        this.cantidad = cantidad;
        this.subtotal = subtotal;
        this.nota = nota;
    }
}
