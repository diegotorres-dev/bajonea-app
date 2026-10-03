package com.bajonea.backend.dto.response;

import java.math.BigDecimal;
import java.util.List;
import lombok.Getter;

/**
 * Sin {@code id} propio: el Carrito es 1:1 con el Cliente autenticado y ninguna operación
 * de {@code CarritoController} (Fase 9) necesita referenciarlo por id, todas actúan sobre
 * "el carrito del cliente actual" o sobre un {@code ItemCarrito} puntual.
 * {@code comercioId}/{@code nombreComercio} quedan {@code null} mientras el carrito está
 * vacío. {@code cargoServicioCliente} es una previsualización de la {@code ConfiguracionTarifa}
 * vigente sobre {@code subtotal} (mismo cálculo que se vuelve a hacer, real, recién al
 * confirmar el pedido) — {@code 0} mientras el carrito está vacío, para no mostrar un cargo
 * fijo sobre un pedido que todavía no existe.
 */
@Getter
public class CarritoResponseDTO {

    private final Integer comercioId;
    private final String nombreComercio;
    private final List<ItemCarritoResponseDTO> items;
    private final BigDecimal subtotal;
    private final BigDecimal cargoServicioCliente;

    public CarritoResponseDTO(
            Integer comercioId, String nombreComercio, List<ItemCarritoResponseDTO> items, BigDecimal subtotal,
            BigDecimal cargoServicioCliente) {
        this.comercioId = comercioId;
        this.nombreComercio = nombreComercio;
        this.items = items;
        this.subtotal = subtotal;
        this.cargoServicioCliente = cargoServicioCliente;
    }
}
