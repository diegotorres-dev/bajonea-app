package com.bajonea.backend.services;

import com.bajonea.backend.dto.response.MiComercioResponseDTO;
import com.bajonea.backend.entities.Comercio;
import com.bajonea.backend.repositories.ComercioRepository;
import com.bajonea.backend.repositories.NotificacionRepository;
import com.bajonea.backend.repositories.NotificacionRepository.ContadorNoLeidasPorComercio;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Listado de todos los comercios del Dueño autenticado para el selector de comercio. No resuelve un
 * comercio activo (no usa {@code X-Comercio-Id}): devuelve todos, en cualquier estado, y el frontend los
 * agrupa. El contador de notificaciones no leídas sale de una única consulta agrupada.
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class MisComerciosService {

    private final ComercioRepository comercioRepository;
    private final NotificacionRepository notificacionRepository;

    public List<MiComercioResponseDTO> listar(Integer duenoId) {
        List<Comercio> comercios = comercioRepository.findByDuenoIdOrderByFechaRegistroAscIdAsc(duenoId);
        Map<Integer, Long> noLeidasPorComercio = new HashMap<>();
        for (ContadorNoLeidasPorComercio contador : notificacionRepository.contarNoLeidasPorComercio(duenoId)) {
            noLeidasPorComercio.put(contador.getComercioId(), contador.getCantidad());
        }
        return comercios.stream()
                .map(comercio -> new MiComercioResponseDTO(
                        comercio.getId(),
                        comercio.getNombre(),
                        comercio.getFotoPerfilUrl(),
                        comercio.getEstado(),
                        comercio.getFechaRegistro(),
                        ComercioActivoService.esOperativo(comercio.getEstado()),
                        noLeidasPorComercio.getOrDefault(comercio.getId(), 0L)))
                .toList();
    }
}
