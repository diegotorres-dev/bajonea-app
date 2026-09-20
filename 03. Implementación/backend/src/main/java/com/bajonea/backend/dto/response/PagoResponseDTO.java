package com.bajonea.backend.dto.response;

import com.bajonea.backend.enums.EstadoPagoPedido;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import lombok.Getter;

@Getter
public class PagoResponseDTO {

    private final Integer pedidoId;
    private final EstadoPagoPedido estado;
    private final BigDecimal monto;
    private final String urlPago;
    private final LocalDateTime fechaCreacion;
    private final LocalDateTime fechaConfirmacion;
    private final boolean yaPagado;
    private final boolean enRevision;

    public PagoResponseDTO(
            Integer pedidoId,
            EstadoPagoPedido estado,
            BigDecimal monto,
            String urlPago,
            LocalDateTime fechaCreacion,
            LocalDateTime fechaConfirmacion,
            boolean yaPagado,
            boolean enRevision) {
        this.pedidoId = pedidoId;
        this.estado = estado;
        this.monto = monto;
        this.urlPago = urlPago;
        this.fechaCreacion = fechaCreacion;
        this.fechaConfirmacion = fechaConfirmacion;
        this.yaPagado = yaPagado;
        this.enRevision = enRevision;
    }
}
