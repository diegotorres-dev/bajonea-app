package com.bajonea.backend.services;

import com.bajonea.backend.dto.response.MiComercioEmpleadoResponseDTO;
import com.bajonea.backend.entities.Comercio;
import com.bajonea.backend.entities.EmpleadoComercio;
import com.bajonea.backend.entities.Horario;
import com.bajonea.backend.enums.EstadoEmpleadoComercio;
import com.bajonea.backend.repositories.EmpleadoComercioRepository;
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
 * Comercios en los que el usuario autenticado es Empleado, para el selector de comercio: solo relaciones
 * {@code ACTIVO} con el comercio en un estado accesible para el Empleado, por fecha de alta e id. Una consulta con
 * el comercio ya cargado y los horarios de todos en otra, sin N+1. No usa {@code X-Comercio-Id}. Un Cliente sin
 * relaciones recibe una lista vacía.
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class MisComerciosEmpleadoService {

    private final EmpleadoComercioRepository empleadoComercioRepository;
    private final HorarioRepository horarioRepository;
    private final NotificacionRepository notificacionRepository;
    private final DisponibilidadComercioService disponibilidadComercioService;

    public List<MiComercioEmpleadoResponseDTO> listar(Integer empleadoId) {
        List<EmpleadoComercio> relaciones = empleadoComercioRepository.findAccesiblesDelEmpleado(empleadoId,
                EstadoEmpleadoComercio.ACTIVO, ComercioActivoService.ESTADOS_ACCESIBLES_EMPLEADO);
        if (relaciones.isEmpty()) {
            return List.of();
        }
        LocalDateTime ahora = disponibilidadComercioService.ahora();
        Map<Integer, List<Horario>> horariosPorComercio = horarioRepository
                .findVigentesDesdeIn(relaciones.stream().map(relacion -> relacion.getComercio().getId()).toList(),
                        disponibilidadComercioService.fechaDesdeParaLeer(ahora))
                .stream()
                .collect(Collectors.groupingBy(horario -> horario.getComercio().getId()));
        Map<Integer, Long> noLeidasPorComercio = new HashMap<>();
        for (ContadorNoLeidasPorComercio contador : notificacionRepository.contarNoLeidasPorComercio(empleadoId)) {
            noLeidasPorComercio.put(contador.getComercioId(), contador.getCantidad());
        }
        return relaciones.stream()
                .map(relacion -> {
                    Comercio comercio = relacion.getComercio();
                    Disponibilidad disponibilidad = disponibilidadComercioService.calcular(comercio,
                            horariosPorComercio.getOrDefault(comercio.getId(), List.of()), ahora);
                    return new MiComercioEmpleadoResponseDTO(
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
                            disponibilidad.textoReapertura(),
                            relacion.getFechaAlta());
                })
                .toList();
    }
}
