package com.bajonea.backend.dto.response;

import java.util.List;
import lombok.Getter;

/**
 * Recorrido de un pedido para el equipo del comercio (Dueño y Empleados): cada transición con su hora, su actor y,
 * cuando corresponde, su motivo, de la primera a la última. Nunca lo ve el Cliente.
 */
@Getter
public class TrazabilidadPedidoResponseDTO {

    private final Integer pedidoId;
    private final List<PasoTrazabilidadPedidoResponseDTO> pasos;

    public TrazabilidadPedidoResponseDTO(Integer pedidoId, List<PasoTrazabilidadPedidoResponseDTO> pasos) {
        this.pedidoId = pedidoId;
        this.pasos = pasos;
    }
}
