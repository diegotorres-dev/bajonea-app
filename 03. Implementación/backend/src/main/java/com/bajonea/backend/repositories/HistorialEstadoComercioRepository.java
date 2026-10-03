package com.bajonea.backend.repositories;

import com.bajonea.backend.entities.HistorialEstadoComercio;
import com.bajonea.backend.enums.EstadoComercio;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface HistorialEstadoComercioRepository extends JpaRepository<HistorialEstadoComercio, Integer> {

    /**
     * Última fila del historial del comercio. Desempata por id: dos transiciones dentro del mismo segundo
     * (la columna es {@code datetime} sin fracciones) tienen la misma {@code fechaHora}, y sin el
     * desempate cualquiera de las dos podría ser "la última".
     */
    Optional<HistorialEstadoComercio> findTopByComercioIdOrderByFechaHoraDescIdDesc(Integer comercioId);

    /**
     * Fila de la última transición del comercio a {@code estadoDestino} (la más reciente por id). Con
     * {@code RECHAZADO} es la fila del último rechazo: su motivo es el que ve el Dueño y su id es el token de
     * versión de la corrección.
     */
    Optional<HistorialEstadoComercio> findTopByComercioIdAndEstadoDestinoOrderByIdDesc(Integer comercioId,
            EstadoComercio estadoDestino);

    /**
     * Ids de los comercios (dentro de {@code comercioIds}) que alguna vez pasaron a {@code estadoDestino},
     * en una sola consulta. Usada por la bandeja del Administrador para saber si un Dueño ya tuvo otro
     * comercio aprobado alguna vez, aunque hoy ese comercio esté en otro estado.
     */
    @Query("SELECT DISTINCT h.comercio.id FROM HistorialEstadoComercio h "
            + "WHERE h.comercio.id IN :comercioIds AND h.estadoDestino = :estadoDestino")
    List<Integer> findComercioIdsConTransicionA(Collection<Integer> comercioIds, EstadoComercio estadoDestino);
}
