package com.bajonea.backend.services;

import com.bajonea.backend.dto.response.ResumenTurnoEmpleadoResponseDTO;
import com.bajonea.backend.dto.response.ResumenTurnoResponseDTO;
import com.bajonea.backend.dto.response.TurnoResumenResponseDTO;
import com.bajonea.backend.entities.Horario;
import com.bajonea.backend.enums.EstadoPedido;
import com.bajonea.backend.enums.EstadoResumenTurno;
import com.bajonea.backend.repositories.HorarioRepository;
import com.bajonea.backend.repositories.PedidoRepository;
import com.bajonea.backend.repositories.PedidoRepository.AgregadoDeTurno;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Resumen del panel del comercio por turno. Muestra el turno en curso; entre turnos, el último turno terminado
 * dentro de la ventana de {@link TurnoPedidoService#diasFueraDeFranja()} días; y sin ninguno, solo los pendientes.
 * Los montos salen de una agregación en la base sobre las columnas de turno del pedido (se asignan al confirmarse
 * el pago); los pendientes cuentan todos los del comercio, sean del turno que sean. Todo se lee en una sola
 * transacción de solo lectura, sin bloqueos.
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class ResumenTurnoService {

    static final List<EstadoPedido> ESTADOS_FACTURADOS = List.of(
            EstadoPedido.EN_PREPARACION, EstadoPedido.EN_CAMINO, EstadoPedido.LISTO_PARA_RETIRAR, EstadoPedido.ENTREGADO,
            EstadoPedido.NO_RETIRADO);

    private final PedidoRepository pedidoRepository;
    private final HorarioRepository horarioRepository;
    private final DisponibilidadComercioService disponibilidadComercioService;
    private final TurnoPedidoService turnoPedidoService;

    private record Calculo(EstadoResumenTurno estado, TurnoResumenResponseDTO turno, BigDecimal vendido, BigDecimal comision,
            int cantidadPedidos, int cantidadPendientes) {
    }

    public ResumenTurnoResponseDTO obtener(Integer comercioId) {
        Calculo calculo = calcular(comercioId);
        return new ResumenTurnoResponseDTO(calculo.estado(), calculo.turno(), calculo.vendido(), calculo.comision(),
                calculo.vendido().subtract(calculo.comision()), calculo.cantidadPedidos(), calculo.cantidadPendientes());
    }

    public ResumenTurnoEmpleadoResponseDTO obtenerParaEmpleado(Integer comercioId) {
        Calculo calculo = calcular(comercioId);
        return new ResumenTurnoEmpleadoResponseDTO(calculo.estado(), calculo.turno(), calculo.vendido(),
                calculo.cantidadPedidos(), calculo.cantidadPendientes());
    }

    private Calculo calcular(Integer comercioId) {
        LocalDateTime ahora = disponibilidadComercioService.ahora();
        List<Horario> horarios = horarioRepository.findVigentesDesde(comercioId,
                turnoPedidoService.fechaDesdeParaLeerHorarios(ahora.toLocalDate()));
        int pendientes = (int) pedidoRepository.countByComercioIdAndEstado(comercioId,
                EstadoPedido.PENDIENTE_CONFIRMACION_COMERCIO);

        EstadoResumenTurno estado = EstadoResumenTurno.EN_CURSO;
        Optional<DisponibilidadComercioService.Turno> turno = disponibilidadComercioService.turnoDe(horarios, ahora);
        if (turno.isEmpty()) {
            estado = EstadoResumenTurno.TERMINADO;
            turno = disponibilidadComercioService.ultimoTurnoTerminado(horarios, ahora, turnoPedidoService.diasFueraDeFranja());
        }
        if (turno.isEmpty()) {
            return new Calculo(EstadoResumenTurno.SIN_TURNO, null, BigDecimal.ZERO, BigDecimal.ZERO, 0, pendientes);
        }

        DisponibilidadComercioService.Turno t = turno.get();
        AgregadoDeTurno agregado = pedidoRepository.agregarTurno(comercioId, t.inicio().toLocalDate(), t.horario().getId(),
                ESTADOS_FACTURADOS);
        TurnoResumenResponseDTO turnoDto = new TurnoResumenResponseDTO(t.inicio().toLocalDate(), t.inicio(), t.fin(),
                DisponibilidadComercioService.cruzaMedianoche(t.horario()));
        return new Calculo(estado, turnoDto, valor(agregado.getVendido()), valor(agregado.getComision()),
                agregado.getCantidad() == null ? 0 : agregado.getCantidad().intValue(), pendientes);
    }

    private static BigDecimal valor(BigDecimal monto) {
        return monto == null ? BigDecimal.ZERO : monto;
    }
}
