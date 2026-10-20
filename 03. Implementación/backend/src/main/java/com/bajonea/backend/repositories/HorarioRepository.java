package com.bajonea.backend.repositories;

import com.bajonea.backend.entities.Horario;
import java.time.LocalDate;
import java.util.Collection;
import java.util.List;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface HorarioRepository extends JpaRepository<Horario, Integer> {

    List<Horario> findByComercioId(Integer comercioId);

    List<Horario> findByComercioIdIn(Collection<Integer> comercioIds);

    @Query("select h from Horario h where h.comercio.id = :comercioId "
            + "and (h.vigenteHasta is null or h.vigenteHasta >= :fechaDesde) order by h.id")
    List<Horario> findVigentesDesde(@Param("comercioId") Integer comercioId, @Param("fechaDesde") LocalDate fechaDesde);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select h from Horario h where h.comercio.id = :comercioId "
            + "and (h.vigenteHasta is null or h.vigenteHasta >= :fechaDesde) order by h.id")
    List<Horario> findVigentesDesdeConBloqueo(@Param("comercioId") Integer comercioId, @Param("fechaDesde") LocalDate fechaDesde);

    @Query("select h from Horario h where h.comercio.id in :comercioIds "
            + "and (h.vigenteHasta is null or h.vigenteHasta >= :fechaDesde) order by h.id")
    List<Horario> findVigentesDesdeIn(@Param("comercioIds") Collection<Integer> comercioIds,
            @Param("fechaDesde") LocalDate fechaDesde);

    @Query("select h from Horario h where h.comercio.id = :comercioId and h.vigenteDesde > :hoy order by h.id")
    List<Horario> findPendientes(@Param("comercioId") Integer comercioId, @Param("hoy") LocalDate hoy);
}
