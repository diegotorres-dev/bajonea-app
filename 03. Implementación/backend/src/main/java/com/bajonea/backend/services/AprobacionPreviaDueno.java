package com.bajonea.backend.services;

import com.bajonea.backend.entities.Comercio;
import com.bajonea.backend.enums.EstadoComercio;
import com.bajonea.backend.repositories.ComercioRepository;
import com.bajonea.backend.repositories.HistorialEstadoComercioRepository;
import java.util.Collection;
import java.util.EnumSet;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

/**
 * Responde si un Dueño ya tuvo algún comercio aprobado. Es la única derivación de esa pregunta y la usan
 * dos reglas: el Administrador la ve como "comercio adicional" ({@code esAdicional}), y de ella depende que el
 * Dueño pueda corregir sus datos fiscales y del representante al volver a solicitar un comercio rechazado
 * (solo si nunca tuvo uno aprobado: después de la primera aprobación esos datos ya los validó el
 * Administrador y no se cambian desde acá).
 * <p>
 * Un comercio "tuvo aprobación" si alguna vez pasó a {@code APROBADO} según el historial
 * ({@code historial_estado_comercio}), con respaldo en el estado actual ({@link #ESTADOS_QUE_REVELAN_APROBACION})
 * para los que no tienen la fila (datos anteriores al historial, o armados a mano).
 */
@Component
@RequiredArgsConstructor
public class AprobacionPreviaDueno {

    static final Set<EstadoComercio> ESTADOS_QUE_REVELAN_APROBACION = EnumSet.of(
            EstadoComercio.APROBADO, EstadoComercio.APTO_VENTA, EstadoComercio.SUSPENDIDO,
            EstadoComercio.CERRADO_TEMPORALMENTE, EstadoComercio.INACTIVO);

    private final ComercioRepository comercioRepository;
    private final HistorialEstadoComercioRepository historialEstadoComercioRepository;

    /**
     * Ids (dentro de {@code comercioIds}) de los comercios que alguna vez pasaron a {@code APROBADO}, en una
     * sola consulta; para decidir {@link #tuvoAprobacion} sobre muchos comercios sin una consulta por cada uno.
     */
    public Set<Integer> idsAprobadosAlgunaVez(Collection<Integer> comercioIds) {
        if (comercioIds.isEmpty()) {
            return Set.of();
        }
        return new HashSet<>(historialEstadoComercioRepository.findComercioIdsConTransicionA(comercioIds, EstadoComercio.APROBADO));
    }

    public boolean tuvoAprobacion(Comercio comercio, Set<Integer> aprobadosAlgunaVez) {
        return aprobadosAlgunaVez.contains(comercio.getId()) || ESTADOS_QUE_REVELAN_APROBACION.contains(comercio.getEstado());
    }

    /**
     * ¿El Dueño tuvo algún comercio aprobado, sin contar {@code excluirComercioId} (el comercio sobre el que
     * se pregunta)? Una consulta de comercios y una de historial.
     */
    public boolean duenoTuvoComercioAprobado(Integer duenoId, Integer excluirComercioId) {
        List<Comercio> otros = comercioRepository.findByDuenoIdOrderByFechaRegistroAscIdAsc(duenoId).stream()
                .filter(comercio -> !comercio.getId().equals(excluirComercioId))
                .toList();
        Set<Integer> aprobados = idsAprobadosAlgunaVez(otros.stream().map(Comercio::getId).toList());
        return otros.stream().anyMatch(comercio -> tuvoAprobacion(comercio, aprobados));
    }
}
