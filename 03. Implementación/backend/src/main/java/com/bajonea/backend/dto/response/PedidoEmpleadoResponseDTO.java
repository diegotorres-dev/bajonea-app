package com.bajonea.backend.dto.response;

import com.bajonea.backend.enums.CanceladoPor;
import com.bajonea.backend.enums.EstadoPedido;
import com.bajonea.backend.enums.EstadoReembolsoEmpleado;
import com.bajonea.backend.enums.FuenteEntrega;
import com.bajonea.backend.enums.MotivoRechazo;
import com.bajonea.backend.enums.TipoEntrega;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import lombok.Getter;

/**
 * Pedido del comercio para un Empleado ({@code GET /api/v1/pedidos/comercio} cuando el actor es Empleado). Es una
 * lista blanca de campos: lo necesario para operar y atender al cliente (identificador, estado, nombre del
 * cliente, entrega y dirección, ítems con precios, subtotal, total pagado, motivos de rechazo o anulación y fechas)
 * y el estado del reembolso en términos simples. No lleva el cargo de servicio (ni el del cliente ni el del
 * comercio), el neto a cobrar, el id interno del cliente, el estado técnico del pago ni nada de Mercado Pago. Un
 * campo nuevo de {@link PedidoResponseDTO} no llega al Empleado salvo que se agregue acá a propósito.
 */
@Getter
public class PedidoEmpleadoResponseDTO {

    private final Integer id;
    private final String nombreCliente;
    private final Integer comercioId;
    private final EstadoPedido estado;
    private final TipoEntrega tipoEntrega;
    private final DireccionResponseDTO direccion;
    private final MotivoRechazo motivoRechazo;
    private final String comentarioRechazo;
    private final CanceladoPor canceladoPor;
    private final FuenteEntrega fuenteEntrega;
    private final String motivoAnulacion;
    private final LocalDateTime fechaCreacion;
    private final LocalDateTime fechaPagoAprobado;
    private final LocalDateTime fechaEntrega;
    private final List<DetallePedidoResponseDTO> detalles;
    private final BigDecimal subtotal;
    private final BigDecimal total;
    private final EstadoReembolsoEmpleado reembolsoEstado;
    private final BigDecimal reembolsoMonto;

    private PedidoEmpleadoResponseDTO(PedidoResponseDTO pedido) {
        this.id = pedido.getId();
        this.nombreCliente = pedido.getNombreCliente();
        this.comercioId = pedido.getComercioId();
        this.estado = pedido.getEstado();
        this.tipoEntrega = pedido.getTipoEntrega();
        this.direccion = pedido.getDireccion();
        this.motivoRechazo = pedido.getMotivoRechazo();
        this.comentarioRechazo = pedido.getComentarioRechazo();
        this.canceladoPor = pedido.getCanceladoPor();
        this.fuenteEntrega = pedido.getFuenteEntrega();
        this.motivoAnulacion = pedido.getMotivoAnulacion();
        this.fechaCreacion = pedido.getFechaCreacion();
        this.fechaPagoAprobado = pedido.getFechaPagoAprobado();
        this.fechaEntrega = pedido.getFechaEntrega();
        this.detalles = pedido.getDetalles();
        this.subtotal = pedido.getSubtotal();
        this.total = pedido.getTotal();
        this.reembolsoEstado = EstadoReembolsoEmpleado.desde(pedido.getReembolsoEstado());
        this.reembolsoMonto = pedido.getReembolsoMonto();
    }

    public static PedidoEmpleadoResponseDTO desde(PedidoResponseDTO pedido) {
        return new PedidoEmpleadoResponseDTO(pedido);
    }
}
