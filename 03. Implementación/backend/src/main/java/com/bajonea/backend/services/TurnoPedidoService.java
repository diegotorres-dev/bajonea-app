package com.bajonea.backend.services;

import com.bajonea.backend.entities.Horario;
import com.bajonea.backend.repositories.HorarioRepository;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Decide a qué turno pertenece un pedido en el instante en que se confirma su pago. Un pago dentro de un turno
 * va a ese turno; un pago fuera de toda franja va al último turno terminado dentro de
 * {@code turno.pago-fuera-franja-dias} días (7 por defecto); si tampoco hay uno, el pedido queda sin turno.
 * El turno se identifica por la fecha de apertura y por la fila de {@code horario} (la versión vigente ese día),
 * así que editar los horarios después no cambia el turno de un pedido ya pagado. Solo lee, sin bloqueos.
 */
@Service
@Transactional(readOnly = true)
public class TurnoPedidoService {

    public record AsignacionTurno(LocalDate fecha, Integer horarioId) {
    }

    private final HorarioRepository horarioRepository;
    private final DisponibilidadComercioService disponibilidadComercioService;
    private final int diasFueraDeFranja;

    public TurnoPedidoService(HorarioRepository horarioRepository, DisponibilidadComercioService disponibilidadComercioService,
            @Value("${turno.pago-fuera-franja-dias:7}") int diasFueraDeFranja) {
        this.horarioRepository = horarioRepository;
        this.disponibilidadComercioService = disponibilidadComercioService;
        this.diasFueraDeFranja = diasFueraDeFranja;
    }

    public int diasFueraDeFranja() {
        return diasFueraDeFranja;
    }

    public LocalDate fechaDesdeParaLeerHorarios(LocalDate fechaDelPago) {
        return fechaDelPago.minusDays(diasFueraDeFranja + 1L);
    }

    public Optional<AsignacionTurno> asignar(Integer comercioId, LocalDateTime instante) {
        List<Horario> horarios = horarioRepository.findVigentesDesde(comercioId, fechaDesdeParaLeerHorarios(instante.toLocalDate()));
        return asignar(horarios, instante);
    }

    public Optional<AsignacionTurno> asignar(List<Horario> horarios, LocalDateTime instante) {
        return disponibilidadComercioService.turnoDe(horarios, instante)
                .or(() -> disponibilidadComercioService.ultimoTurnoTerminado(horarios, instante, diasFueraDeFranja))
                .map(turno -> new AsignacionTurno(turno.inicio().toLocalDate(), turno.horario().getId()));
    }
}
