package com.bajonea.backend.dto.response;

import com.bajonea.backend.enums.CanceladoPor;
import com.bajonea.backend.enums.EstadoNotaCredito;
import com.bajonea.backend.enums.EstadoPagoPedido;
import com.bajonea.backend.enums.EstadoPedido;
import com.bajonea.backend.enums.FuenteEntrega;
import com.bajonea.backend.enums.MotivoNotaCredito;
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
 * no afirmar un reembolso que todavía no ocurrió. {@code comercioNombre} y {@code comercioFotoUrl} vienen del
 * pedido: el nombre y la foto del comercio se ven aunque el comercio ya no esté en el catálogo público (por
 * ejemplo, suspendido). {@code noRetiradoDisponibleDesde} y
 * {@code noRetiradoMinutosRestantes} solo van en las respuestas del lado del comercio, para un retiro en
 * {@code LISTO_PARA_RETIRAR}: cuándo se habilita "Cerrar como no retirado" (hora del comercio) y cuántos minutos
 * faltan según el reloj del servidor, redondeado hacia arriba (0 si ya se puede). En cualquier otro caso, y en
 * las respuestas del Cliente, valen {@code null}.
 * {@code limiteResolucionSuspension} es, solo en las respuestas del comercio y con el comercio suspendido, la hora en que
 * el proceso de los topes resuelve un pedido {@code EN_PREPARACION} o {@code LISTO_PARA_RETIRAR}; {@code null} en cualquier
 * otro caso. {@code comercioNoDisponible} es {@code true} cuando el pedido espera el pago y el comercio está suspendido
 * (la pantalla del Cliente no deja pagar). {@code reembolsoMotivo} es el motivo de la nota de crédito más reciente (nulo si
 * nunca se generó): la pantalla del Cliente lo usa para explicar por qué se canceló un pedido ya pagado.
 */
@Getter
public class PedidoResponseDTO {

    private final Integer id;
    private final Integer clienteId;
    private final String nombreCliente;
    private final Integer comercioId;
    private final String comercioNombre;
    private final String comercioFotoUrl;
    private final EstadoPedido estado;
    private final EstadoPagoPedido pagoEstado;
    private final TipoEntrega tipoEntrega;
    private final DireccionEntregaResponseDTO direccion;
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
    private final LocalDateTime noRetiradoDisponibleDesde;
    private final Long noRetiradoMinutosRestantes;
    private final LocalDateTime limiteResolucionSuspension;
    private final boolean comercioNoDisponible;
    private final MotivoNotaCredito reembolsoMotivo;

    public PedidoResponseDTO(
            Integer id,
            Integer clienteId,
            String nombreCliente,
            Integer comercioId,
            String comercioNombre,
            String comercioFotoUrl,
            EstadoPedido estado,
            EstadoPagoPedido pagoEstado,
            TipoEntrega tipoEntrega,
            DireccionEntregaResponseDTO direccion,
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
            BigDecimal reembolsoMonto,
            LocalDateTime noRetiradoDisponibleDesde,
            Long noRetiradoMinutosRestantes,
            LocalDateTime limiteResolucionSuspension,
            boolean comercioNoDisponible,
            MotivoNotaCredito reembolsoMotivo) {
        this.id = id;
        this.clienteId = clienteId;
        this.nombreCliente = nombreCliente;
        this.comercioId = comercioId;
        this.comercioNombre = comercioNombre;
        this.comercioFotoUrl = comercioFotoUrl;
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
        this.noRetiradoDisponibleDesde = noRetiradoDisponibleDesde;
        this.noRetiradoMinutosRestantes = noRetiradoMinutosRestantes;
        this.limiteResolucionSuspension = limiteResolucionSuspension;
        this.comercioNoDisponible = comercioNoDisponible;
        this.reembolsoMotivo = reembolsoMotivo;
    }
}
