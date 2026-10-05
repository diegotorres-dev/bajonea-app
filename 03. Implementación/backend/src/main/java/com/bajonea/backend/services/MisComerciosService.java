package com.bajonea.backend.services;

import com.bajonea.backend.dto.response.MiComercioResponseDTO;
import com.bajonea.backend.entities.Comercio;
import com.bajonea.backend.entities.Horario;
import com.bajonea.backend.repositories.ComercioRepository;
import com.bajonea.backend.repositories.HorarioRepository;
import com.bajonea.backend.repositories.NotificacionRepository;
import com.bajonea.backend.repositories.NotificacionRepository.ContadorNoLeidasPorComercio;
import com.bajonea.backend.services.DisponibilidadComercioService.Disponibilidad;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Listado de todos los comercios del Dueño autenticado para el selector de comercio. No resuelve un
 * comercio activo (no usa {@code X-Comercio-Id}): devuelve todos, en cualquier estado, y el frontend los
 * agrupa. El contador de notificaciones no leídas sale de una única consulta agrupada y los horarios de
 * otra, también agrupada, para calcular el estado de apertura de cada comercio.
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class MisComerciosService {

    private final ComercioRepository comercioRepository;
    private final NotificacionRepository notificacionRepository;
    private final HorarioRepository horarioRepository;
    private final DisponibilidadComercioService disponibilidadComercioService;

    public List<MiComercioResponseDTO> listar(Integer duenoId) {
        List<Comercio> comercios = comercioRepository.findByDuenoIdOrderByFechaRegistroAscIdAsc(duenoId);
        Map<Integer, Long> noLeidasPorComercio = new HashMap<>();
        for (ContadorNoLeidasPorComercio contador : notificacionRepository.contarNoLeidasPorComercio(duenoId)) {
            noLeidasPorComercio.put(contador.getComercioId(), contador.getCantidad());
        }
        Map<Integer, List<Horario>> horariosPorComercio = comercios.isEmpty()
                ? Map.of()
                : horarioRepository.findByComercioIdIn(comercios.stream().map(Comercio::getId).toList()).stream()
                        .collect(Collectors.groupingBy(horario -> horario.getComercio().getId()));
        LocalDateTime ahora = disponibilidadComercioService.ahora();
        return comercios.stream()
                .map(comercio -> {
                    Disponibilidad disponibilidad = disponibilidadComercioService.calcular(comercio,
                            horariosPorComercio.getOrDefault(comercio.getId(), List.of()), ahora);
                    return new MiComercioResponseDTO(
                            comercio.getId(),
                            comercio.getNombre(),
                            comercio.getFotoPerfilUrl(),
                            comercio.getEstado(),
                            comercio.getFechaRegistro(),
                            ComercioActivoService.esOperativo(comercio.getEstado()),
                            noLeidasPorComercio.getOrDefault(comercio.getId(), 0L),
                            disponibilidad.cerradoManualmente(),
                            disponibilidad.abiertoAhora(),
                            disponibilidad.puedeCambiarCierre(),
                            disponibilidad.textoReapertura());
                })
                .toList();
    }
}
