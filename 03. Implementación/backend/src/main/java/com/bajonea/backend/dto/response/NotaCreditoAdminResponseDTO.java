package com.bajonea.backend.dto.response;

import com.bajonea.backend.enums.EstadoNotaCredito;
import com.bajonea.backend.enums.MotivoNotaCredito;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import lombok.Getter;

/**
 * Fila de la pantalla de revisión manual de reembolsos del Administrador. {@code codigo} se deriva
 * ({@code NC-<año de emisión>-<id con 5 dígitos>}), no es una columna.
 */
@Getter
public class NotaCreditoAdminResponseDTO {

    private final Integer id;
    private final String codigo;
    private final Integer pedidoId;
    private final String nombreCliente;
    private final String nombreComercio;
    private final BigDecimal monto;
    private final LocalDateTime fechaEmision;
    private final MotivoNotaCredito motivo;
    private final EstadoNotaCredito estado;
    private final String ultimoError;
    private final Integer intentos;

    public NotaCreditoAdminResponseDTO(Integer id, String codigo, Integer pedidoId, String nombreCliente, String nombreComercio,
            BigDecimal monto, LocalDateTime fechaEmision, MotivoNotaCredito motivo, EstadoNotaCredito estado, String ultimoError,
            Integer intentos) {
        this.id = id;
        this.codigo = codigo;
        this.pedidoId = pedidoId;
        this.nombreCliente = nombreCliente;
        this.nombreComercio = nombreComercio;
        this.monto = monto;
        this.fechaEmision = fechaEmision;
        this.motivo = motivo;
        this.estado = estado;
        this.ultimoError = ultimoError;
        this.intentos = intentos;
    }
}
