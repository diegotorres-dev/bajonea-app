package com.bajonea.backend.dto.response;

import com.bajonea.backend.enums.EstadoNotaCredito;
import com.bajonea.backend.enums.EstadoReclamo;
import com.bajonea.backend.enums.MotivoReclamo;
import com.bajonea.backend.enums.TipoEntrega;
import com.bajonea.backend.enums.TipoResolucionReclamo;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

/**
 * Lo que ve el Administrador de los reclamos: la bandeja (con los contadores de cada filtro) y el detalle de uno. Solo el
 * Administrador recibe el mensaje del Cliente.
 */
public final class ReclamoAdminResponseDTO {

    private ReclamoAdminResponseDTO() {
    }

    public record Contadores(long pendientes, long reembolsoEnProceso, long resueltos) {
    }

    public record Resumen(
            Integer id,
            Integer pedidoId,
            MotivoReclamo motivo,
            EstadoReclamo estado,
            LocalDateTime fechaCreacion,
            Integer comercioId,
            String comercioNombre,
            BigDecimal total,
            TipoResolucionReclamo tipoResolucion,
            BigDecimal montoAprobado,
            LocalDateTime fechaResolucion,
            Boolean reembolsoEnProceso) {
    }

    public record Bandeja(Contadores contadores, List<Resumen> reclamos) {
    }

    public record PedidoDelReclamo(
            Integer id,
            Integer comercioId,
            String comercioNombre,
            Integer clienteUsuarioId,
            String clienteNombre,
            String clienteEmail,
            TipoEntrega tipoEntrega,
            LocalDateTime fechaEntrega,
            List<DetallePedidoResponseDTO> detalles,
            BigDecimal subtotal,
            BigDecimal cargoServicioCliente,
            BigDecimal total) {
    }

    public record Reembolso(
            Integer notaCreditoId,
            EstadoNotaCredito estado,
            BigDecimal monto,
            Integer intentos,
            String ultimoError) {
    }

    public record Detalle(
            Integer id,
            EstadoReclamo estado,
            MotivoReclamo motivo,
            String descripcion,
            LocalDateTime fechaCreacion,
            LocalDateTime fechaLimiteReclamo,
            TipoResolucionReclamo tipoResolucion,
            BigDecimal montoAprobado,
            String notaResolucion,
            LocalDateTime fechaResolucion,
            Boolean reembolsoEnProceso,
            PedidoDelReclamo pedido,
            BigDecimal saldoReembolsable,
            Reembolso reembolso) {
    }
}
