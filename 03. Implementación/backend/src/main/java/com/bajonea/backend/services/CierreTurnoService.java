package com.bajonea.backend.services;

import com.bajonea.backend.config.TurnoCierreProperties;
import com.bajonea.backend.entities.Horario;
import com.bajonea.backend.enums.EstadoComercio;
import com.bajonea.backend.enums.EstadoEmailCierreTurno;
import com.bajonea.backend.enums.EstadoPedido;
import com.bajonea.backend.repositories.CierreTurnoInsercionRepository;
import com.bajonea.backend.repositories.CierreTurnoRepository;
import com.bajonea.backend.repositories.CierreTurnoRepository.UltimoCierreDeComercio;
import com.bajonea.backend.repositories.ComercioRepository;
import com.bajonea.backend.repositories.ComercioRepository.ComercioElegibleParaCierre;
import com.bajonea.backend.repositories.HorarioRepository;
import com.bajonea.backend.repositories.PedidoRepository;
import com.bajonea.backend.services.DisponibilidadComercioService.Turno;
import com.bajonea.backend.services.ResumenTurnoService.CifrasTurno;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

/**
 * Cierre de turnos: guarda la foto de un turno terminado y deja el email del Dueño en cola. Dos pasos separados
 * para que el proceso que los llama no sostenga nada entre ellos: {@link #candidatos} recorre toda la plataforma con
 * tres consultas y en memoria (solo lectura), y {@link #cerrar} trabaja un comercio y un turno en una transacción
 * corta. Ninguno toma bloqueos: la única escritura es el alta en {@code cierre_turno}, cuyas claves foráneas solo
 * toman bloqueos compartidos sobre {@code comercio} y {@code horario}, que son hojas del orden global.
 */
@Service
@RequiredArgsConstructor
public class CierreTurnoService {

    private static final Logger log = LoggerFactory.getLogger(CierreTurnoService.class);

    public static final Set<EstadoComercio> ESTADOS_ELEGIBLES = Set.of(EstadoComercio.APTO_VENTA, EstadoComercio.SUSPENDIDO,
            EstadoComercio.CERRADO_TEMPORALMENTE);

    public enum ResultadoCierre {
        CERRADO,
        DIFERIDO,
        YA_CERRADO
    }

    public record CandidatoCierre(Integer comercioId, EstadoComercio estadoComercio, Turno turno) {
    }

    private final ComercioRepository comercioRepository;
    private final HorarioRepository horarioRepository;
    private final CierreTurnoRepository cierreTurnoRepository;
    private final CierreTurnoInsercionRepository cierreTurnoInsercionRepository;
    private final PedidoRepository pedidoRepository;
    private final ResumenTurnoService resumenTurnoService;
    private final DisponibilidadComercioService disponibilidadComercioService;
    private final TurnoCierreProperties propiedades;

    /**
     * Turnos que ya se pueden cerrar, agrupados por comercio y de los más viejos a los más nuevos: los que terminaron
     * hace al menos {@code gracia-minutos}, hace menos de {@code dias-atras} días y después del último turno cerrado
     * del comercio. Un comercio que nunca cerró un turno (o cuyo último cierre quedó fuera de la ventana) cierra solo
     * su último turno terminado, para no mandar mails vacíos al desplegar ni tras vincular Mercado Pago.
     */
    @Transactional(readOnly = true)
    public List<CandidatoCierre> candidatos(LocalDateTime ahora) {
        List<ComercioElegibleParaCierre> comercios = comercioRepository.findElegiblesParaCierreDeTurno(ESTADOS_ELEGIBLES);
        if (comercios.isEmpty()) {
            return List.of();
        }
        List<Integer> ids = comercios.stream().map(ComercioElegibleParaCierre::getId).toList();
        LocalDate fechaDesdeHorarios = ahora.toLocalDate().minusDays(propiedades.getDiasAtras() + 1L);
        Map<Integer, List<Horario>> horariosPorComercio = horarioRepository.findVigentesDesdeIn(ids, fechaDesdeHorarios).stream()
                .collect(Collectors.groupingBy(horario -> horario.getComercio().getId()));
        Map<Integer, LocalDateTime> ultimoFin = new HashMap<>();
        for (UltimoCierreDeComercio ultimo : cierreTurnoRepository.findUltimoFinDesde(ids,
                ahora.toLocalDate().minusDays(propiedades.getDiasAtras() + 2L))) {
            ultimoFin.put(ultimo.getComercioId(), ultimo.getFin());
        }

        LocalDateTime hasta = ahora.minusMinutes(propiedades.getGraciaMinutos());
        LocalDateTime desdeVentana = ahora.minusDays(propiedades.getDiasAtras());
        List<CandidatoCierre> candidatos = new ArrayList<>();
        for (ComercioElegibleParaCierre comercio : comercios) {
            List<Horario> horarios = horariosPorComercio.get(comercio.getId());
            if (horarios == null || horarios.isEmpty()) {
                continue;
            }
            LocalDateTime ultimo = ultimoFin.get(comercio.getId());
            if (ultimo == null) {
                Optional<Turno> unico = disponibilidadComercioService
                        .ultimoTurnoTerminado(horarios, ahora, propiedades.getDiasAtras())
                        .filter(turno -> !turno.fin().isAfter(hasta));
                unico.ifPresent(turno -> candidatos.add(new CandidatoCierre(comercio.getId(), comercio.getEstado(), turno)));
                continue;
            }
            LocalDateTime desde = ultimo.isAfter(desdeVentana) ? ultimo : desdeVentana;
            for (Turno turno : disponibilidadComercioService.turnosTerminadosEntre(horarios, desde, hasta)) {
                candidatos.add(new CandidatoCierre(comercio.getId(), comercio.getEstado(), turno));
            }
        }
        return candidatos;
    }

    @Transactional(isolation = Isolation.REPEATABLE_READ)
    public ResultadoCierre cerrar(CandidatoCierre candidato, LocalDateTime ahora) {
        Turno turno = candidato.turno();
        Integer comercioId = candidato.comercioId();
        boolean hayPagosSinResolver = pedidoRepository.existsByComercioIdAndEstadoCreadoAntesDe(comercioId,
                EstadoPedido.PENDIENTE_PAGO, turno.fin());
        if (hayPagosSinResolver) {
            if (ahora.isBefore(turno.fin().plusMinutes(propiedades.getEsperaMaximaMinutos()))) {
                return ResultadoCierre.DIFERIDO;
            }
            log.warn("El turno {} del comercio {} se cierra con pedidos sin pagar después de {} minutos de espera",
                    turno.inicio(), comercioId, propiedades.getEsperaMaximaMinutos());
        }

        CifrasTurno cifras = resumenTurnoService.cifras(comercioId, turno);
        boolean avisa = candidato.estadoComercio() == EstadoComercio.APTO_VENTA || cifras.cantidadPedidos() > 0
                || cifras.pendientes() > 0;
        boolean insertado = cierreTurnoInsercionRepository.insertar(comercioId, turno.inicio().toLocalDate(),
                turno.horario().getId(), turno.inicio(), turno.fin(), cifras.cantidadPedidos(), cifras.vendido(),
                cifras.comision(), cifras.neto(), cifras.pendientes(), ahora,
                (avisa ? EstadoEmailCierreTurno.PENDIENTE : EstadoEmailCierreTurno.OMITIDO).name(),
                avisa ? null : "Comercio no operativo sin pedidos ni pendientes");
        return insertado ? ResultadoCierre.CERRADO : ResultadoCierre.YA_CERRADO;
    }
}
