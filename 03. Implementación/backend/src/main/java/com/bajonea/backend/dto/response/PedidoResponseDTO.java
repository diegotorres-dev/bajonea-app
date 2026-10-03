package com.bajonea.backend.dto.response;

import com.bajonea.backend.enums.CanceladoPor;
import com.bajonea.backend.enums.EstadoNotaCredito;
import com.bajonea.backend.enums.EstadoPagoPedido;
import com.bajonea.backend.enums.EstadoPedido;
import com.bajonea.backend.enums.FuenteEntrega;
import com.bajonea.backend.enums.MotivoRechazo;
import com.bajonea.backend.enums.TipoEntrega;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import lombok.Getter;

/**
 * Incluye {@code motivoRechazo}/{@code comentarioRechazo} (nulos salvo
 * {@code estado = RECHAZADO}) — agregado no pedido explícitamente en la consigna de esta
 * tanda, pero indispensable: sin esto, un pedido rechazado no tendría forma de mostrarle al
 * cliente por qué. {@code direccion} viaja completa (no solo su id) porque solo aplica
 * cuando {@code tipoEntrega = DOMICILIO} y ahí es información necesaria para el cliente, no
 * una relación secundaria. {@code pagoEstado}/{@code canceladoPor}/{@code fuenteEntrega}/
 * {@code fechaEntrega}/{@code motivoAnulacion} sumados en la Fase 19 (máquina de estados
 * completa del Pedido) — el frontend los necesita para renderizar cada uno de los 11 estados.
 * {@code subtotal}/{@code cargoServicioCliente}/{@code cargoServicioComercio} sumados en el
 * tramo de split real de MercadoPago: hasta acá solo viajaba {@code total} (subtotal +
 * cargoServicioCliente, ya sumado), sin desglosar — el frontend necesita cada monto por
 * separado para mostrar la línea "Cargo por servicio" (Cliente) y "Cargo por servicio (1%)"
 * (Comercio). {@code reembolsoEstado}/{@code reembolsoMonto} reflejan la nota de crédito más
 * reciente del pago del pedido (nulos si nunca se generó ninguna) — el frontend los usa para
 * no afirmar un reembolso que todavía no ocurrió.
 */
@Getter
public class PedidoResponseDTO {

    private final Integer id;
    private final Integer clienteId;
    private final String nombreCliente;
    private final Integer comercioId;
    private final EstadoPedido estado;
    private final EstadoPagoPedido pagoEstado;
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
    private final BigDecimal cargoServicioCliente;
    private final BigDecimal cargoServicioComercio;
    private final BigDecimal total;
    private final EstadoNotaCredito reembolsoEstado;
    private final BigDecimal reembolsoMonto;

    public PedidoResponseDTO(
            Integer id,
            Integer clienteId,
            String nombreCliente,
            Integer comercioId,
            EstadoPedido estado,
            EstadoPagoPedido pagoEstado,
            TipoEntrega tipoEntrega,
            DireccionResponseDTO direccion,
            MotivoRechazo motivoRechazo,
            String comentarioRechazo,
            CanceladoPor canceladoPor,
            FuenteEntrega fuenteEntrega,
            String motivoAnulacion,
            LocalDateTime fechaCreacion,
            LocalDateTime fechaPagoAprobado,
            LocalDateTime fechaEntrega,
            List<DetallePedidoResponseDTO> detalles,
            BigDecimal subtotal,
            BigDecimal cargoServicioCliente,
            BigDecimal cargoServicioComercio,
            BigDecimal total,
            EstadoNotaCredito reembolsoEstado,
            BigDecimal reembolsoMonto) {
        this.id = id;
        this.clienteId = clienteId;
        this.nombreCliente = nombreCliente;
        this.comercioId = comercioId;
        this.estado = estado;
        this.pagoEstado = pagoEstado;
        this.tipoEntrega = tipoEntrega;
        this.direccion = direccion;
        this.motivoRechazo = motivoRechazo;
        this.comentarioRechazo = comentarioRechazo;
        this.canceladoPor = canceladoPor;
        this.fuenteEntrega = fuenteEntrega;
        this.motivoAnulacion = motivoAnulacion;
        this.fechaCreacion = fechaCreacion;
        this.fechaPagoAprobado = fechaPagoAprobado;
        this.fechaEntrega = fechaEntrega;
        this.detalles = detalles;
        this.subtotal = subtotal;
        this.cargoServicioCliente = cargoServicioCliente;
        this.cargoServicioComercio = cargoServicioComercio;
        this.total = total;
        this.reembolsoEstado = reembolsoEstado;
        this.reembolsoMonto = reembolsoMonto;
    }
}
