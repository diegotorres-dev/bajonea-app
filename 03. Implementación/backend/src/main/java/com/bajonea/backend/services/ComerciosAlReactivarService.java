package com.bajonea.backend.services;

import com.bajonea.backend.dto.response.ComercioAlReactivarResponseDTO;
import com.bajonea.backend.dto.response.ComercioAlReactivarResponseDTO.Resultado;
import com.bajonea.backend.entities.Comercio;
import com.bajonea.backend.enums.EstadoComercio;
import com.bajonea.backend.repositories.ComercioRepository;
import java.util.ArrayList;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Qué pasa con los comercios de un Dueño cuando su cuenta inactiva se reactiva: los que la inactividad dejó
 * {@code INACTIVO} vuelven, y los suspendidos aparte siguen suspendidos. Los demás estados no se mencionan. Es solo
 * lectura y no toma bloqueos: es informativo, la reactivación real revalida todo con las filas bloqueadas.
 */
@Service
@RequiredArgsConstructor
public class ComerciosAlReactivarService {

    private final ComercioRepository comercioRepository;

    @Transactional(readOnly = true)
    public List<ComercioAlReactivarResponseDTO> deDueno(Integer duenoId) {
        List<ComercioAlReactivarResponseDTO> filas = new ArrayList<>();
        for (Comercio comercio : comercioRepository.findByDuenoIdOrderByFechaRegistroAscIdAsc(duenoId)) {
            EstadoComercio estado = comercio.getEstado();
            if (estado == EstadoComercio.INACTIVO) {
                filas.add(new ComercioAlReactivarResponseDTO(comercio.getId(), comercio.getNombre(), estado, Resultado.VUELVE));
            } else if (estado == EstadoComercio.SUSPENDIDO) {
                filas.add(new ComercioAlReactivarResponseDTO(comercio.getId(), comercio.getNombre(), estado, Resultado.SIGUE_SUSPENDIDO));
            }
        }
        return filas;
    }
}
