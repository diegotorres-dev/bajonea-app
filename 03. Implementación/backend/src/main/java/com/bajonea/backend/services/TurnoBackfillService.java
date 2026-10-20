package com.bajonea.backend.services;

import com.bajonea.backend.entities.Horario;
import com.bajonea.backend.repositories.HorarioRepository;
import java.sql.Timestamp;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Proceso de una sola vez que asigna el turno a los pedidos pagados antes de que existieran las columnas de turno
 * (migración V39). Recorre, comercio por comercio, los pedidos con {@code fecha_pago_confirmado} y sin
 * {@code turno_fecha}, lee las versiones de {@code horario} una vez por comercio y asigna con la misma regla que el
 * pago ({@link TurnoPedidoService}). Cada pedido se escribe por clave primaria con {@code turno_fecha IS NULL} en la
 * condición, en lotes de una transacción cada uno, así que es idempotente, se puede correr con más de una instancia
 * y nunca pisa un turno ya asignado. No toma otro bloqueo que la fila del pedido (y la lectura compartida de la fila
 * de {@code horario} que impone la clave foránea). Los pedidos que no se pueden asignar (comercio sin franjas en la
 * ventana) quedan sin turno.
 */
@Service
public class TurnoBackfillService {

    private static final Logger log = LoggerFactory.getLogger(TurnoBackfillService.class);
    private static final int TAMANO_LOTE = 500;

    public record ResultadoBackfill(int asignados, int sinTurno) {
    }

    private record PedidoPagado(Integer id, LocalDateTime fechaPago) {
    }

    private final JdbcTemplate jdbcTemplate;
    private final HorarioRepository horarioRepository;
    private final TurnoPedidoService turnoPedidoService;
    private final TransactionTemplate transactionTemplate;

    public TurnoBackfillService(JdbcTemplate jdbcTemplate, HorarioRepository horarioRepository,
            TurnoPedidoService turnoPedidoService, PlatformTransactionManager transactionManager) {
        this.jdbcTemplate = jdbcTemplate;
        this.horarioRepository = horarioRepository;
        this.turnoPedidoService = turnoPedidoService;
        this.transactionTemplate = new TransactionTemplate(transactionManager);
    }

    public ResultadoBackfill ejecutar() {
        int asignados = 0;
        int sinTurno = 0;
        List<Integer> comercios = jdbcTemplate.queryForList(
                "SELECT DISTINCT comercio_id FROM pedido WHERE turno_fecha IS NULL AND fecha_pago_confirmado IS NOT NULL "
                        + "ORDER BY comercio_id", Integer.class);
        for (Integer comercioId : comercios) {
            try {
                ResultadoBackfill parcial = ejecutarComercio(comercioId);
                asignados += parcial.asignados();
                sinTurno += parcial.sinTurno();
            } catch (RuntimeException e) {
                log.error("No se pudo asignar el turno a los pedidos del comercio {}", comercioId, e);
            }
        }
        log.info("Asignación de turnos a pedidos anteriores: {} asignados, {} sin turno", asignados, sinTurno);
        return new ResultadoBackfill(asignados, sinTurno);
    }

    private ResultadoBackfill ejecutarComercio(Integer comercioId) {
        Timestamp primera = jdbcTemplate.queryForObject(
                "SELECT MIN(fecha_pago_confirmado) FROM pedido WHERE comercio_id = ? AND turno_fecha IS NULL "
                        + "AND fecha_pago_confirmado IS NOT NULL", Timestamp.class, comercioId);
        if (primera == null) {
            return new ResultadoBackfill(0, 0);
        }
        LocalDate desde = turnoPedidoService.fechaDesdeParaLeerHorarios(primera.toLocalDateTime().toLocalDate());
        List<Horario> horarios = horarioRepository.findVigentesDesde(comercioId, desde);

        int asignados = 0;
        int sinTurno = 0;
        int ultimoId = 0;
        while (true) {
            List<PedidoPagado> lote = leerLote(comercioId, ultimoId);
            if (lote.isEmpty()) {
                break;
            }
            ultimoId = lote.get(lote.size() - 1).id();
            List<Object[]> cambios = new ArrayList<>();
            for (PedidoPagado pedido : lote) {
                Optional<TurnoPedidoService.AsignacionTurno> asignacion = turnoPedidoService.asignar(horarios, pedido.fechaPago());
                if (asignacion.isPresent()) {
                    cambios.add(new Object[] {java.sql.Date.valueOf(asignacion.get().fecha()), asignacion.get().horarioId(), pedido.id()});
                } else {
                    sinTurno++;
                }
            }
            if (!cambios.isEmpty()) {
                asignados += escribir(cambios);
            }
        }
        return new ResultadoBackfill(asignados, sinTurno);
    }

    int escribir(List<Object[]> cambios) {
        return transactionTemplate.execute(status -> {
            int escritos = 0;
            for (Object[] cambio : cambios) {
                escritos += jdbcTemplate.update(
                        "UPDATE pedido SET turno_fecha = ?, turno_horario_id = ? WHERE id = ? AND turno_fecha IS NULL", cambio);
            }
            return escritos;
        });
    }

    private List<PedidoPagado> leerLote(Integer comercioId, int despuesDelId) {
        return jdbcTemplate.query(
                "SELECT id, fecha_pago_confirmado FROM pedido WHERE comercio_id = ? AND turno_fecha IS NULL "
                        + "AND fecha_pago_confirmado IS NOT NULL AND id > ? ORDER BY id LIMIT " + TAMANO_LOTE,
                (rs, fila) -> new PedidoPagado(rs.getInt("id"), rs.getTimestamp("fecha_pago_confirmado").toLocalDateTime()),
                comercioId, despuesDelId);
    }
}
