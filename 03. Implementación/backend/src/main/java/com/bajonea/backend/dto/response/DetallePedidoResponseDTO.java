package com.bajonea.backend.dto.response;

import java.math.BigDecimal;
import lombok.Getter;

@Getter
public class DetallePedidoResponseDTO {

    private final Integer productoId;
    private final String nombreProducto;
    private final BigDecimal precioUnitario;
    private final Integer cantidad;
    private final BigDecimal subtotal;
    private final String nota;

    public DetallePedidoResponseDTO(
            Integer productoId,
            String nombreProducto,
            BigDecimal precioUnitario,
            Integer cantidad,
            BigDecimal subtotal,
            String nota) {
        this.productoId = productoId;
        this.nombreProducto = nombreProducto;
        this.precioUnitario = precioUnitario;
        this.cantidad = cantidad;
        this.subtotal = subtotal;
        this.nota = nota;
    }
}
