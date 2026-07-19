package com.bajonea.backend.dto.response;

import com.bajonea.backend.enums.EstadoPedido;
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
 * una relación secundaria.
 */
@Getter
public class PedidoResponseDTO {

    private final Integer id;
    private final Integer clienteId;
    private final Integer comercioId;
    private final EstadoPedido estado;
    private final TipoEntrega tipoEntrega;
    private final DireccionResponseDTO direccion;
    private final MotivoRechazo motivoRechazo;
    private final String comentarioRechazo;
    private final LocalDateTime fechaCreacion;
    private final List<DetallePedidoResponseDTO> detalles;
    private final BigDecimal total;

    public PedidoResponseDTO(
            Integer id,
            Integer clienteId,
            Integer comercioId,
            EstadoPedido estado,
            TipoEntrega tipoEntrega,
            DireccionResponseDTO direccion,
            MotivoRechazo motivoRechazo,
            String comentarioRechazo,
            LocalDateTime fechaCreacion,
            List<DetallePedidoResponseDTO> detalles,
            BigDecimal total) {
        this.id = id;
        this.clienteId = clienteId;
        this.comercioId = comercioId;
        this.estado = estado;
        this.tipoEntrega = tipoEntrega;
        this.direccion = direccion;
        this.motivoRechazo = motivoRechazo;
        this.comentarioRechazo = comentarioRechazo;
        this.fechaCreacion = fechaCreacion;
        this.detalles = detalles;
        this.total = total;
    }
}
