package com.bajonea.backend.dto.response;

import com.bajonea.backend.enums.EstadoReclamo;
import com.bajonea.backend.enums.MotivoReclamo;
import com.bajonea.backend.enums.TipoResolucionReclamo;
import com.fasterxml.jackson.annotation.JsonInclude;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

/**
 * Bloque {@code reclamo} de las respuestas de pedido. Lo ve el Cliente (con la elegibilidad: {@code puedeReclamar},
 * {@code fechaLimiteReclamo} y {@code motivosDisponibles}, que calcula el servidor) y, con menos datos, el Dueño: el
 * Dueño no recibe el mensaje del Cliente ni el motivo de un rechazo. El Empleado no lo recibe nunca. Los campos nulos no
 * viajan. {@code reembolsoEnProceso} vale {@code true} para un reclamo aprobado cuyo reembolso todavía no se procesó.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record ReclamoPedidoResponseDTO(
        Boolean puedeReclamar,
        LocalDateTime fechaLimiteReclamo,
        List<MotivoReclamo> motivosDisponibles,
        Integer id,
        MotivoReclamo motivo,
        EstadoReclamo estado,
        LocalDateTime fechaCreacion,
        TipoResolucionReclamo tipoResolucion,
        BigDecimal montoAprobado,
        String motivoRechazo,
        LocalDateTime fechaResolucion,
        Boolean reembolsoEnProceso,
        String avisoPlazoVencido,
        Integer cantidadFotos) {
}
