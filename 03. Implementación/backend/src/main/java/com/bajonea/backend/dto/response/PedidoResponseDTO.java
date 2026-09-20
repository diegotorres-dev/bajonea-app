package com.bajonea.backend.dto.response;

import com.bajonea.backend.enums.CanceladoPor;
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
    private final LocalDateTime fechaEntrega;
    private final List<DetallePedidoResponseDTO> detalles;
    private final BigDecimal total;

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
            LocalDateTime fechaEntrega,
            List<DetallePedidoResponseDTO> detalles,
            BigDecimal total) {
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
        this.fechaEntrega = fechaEntrega;
        this.detalles = detalles;
        this.total = total;
    }
}
