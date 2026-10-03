package com.bajonea.backend.repositories;

import com.bajonea.backend.entities.CuentaMercadoPago;
import jakarta.persistence.LockModeType;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;

public interface CuentaMercadoPagoRepository extends JpaRepository<CuentaMercadoPago, Integer> {

    Optional<CuentaMercadoPago> findByDuenoId(Integer duenoId);

    Optional<CuentaMercadoPago> findByDuenoIdAndActivaTrue(Integer duenoId);

    /**
     * La fila activa de una cuenta de Mercado Pago (a lo sumo una, la garantiza el índice único de
     * {@code mp_user_id_activo}), de cualquier Dueño. Lectura común: si se pierde una carrera, el índice único
     * la rechaza al guardar.
     */
    Optional<CuentaMercadoPago> findByMpUserIdAndActivaTrue(String mpUserId);

    /**
     * {@code SELECT ... FOR UPDATE} por Dueño. Con la fila existente la bloquea; sin fila, bloquea el hueco
     * del índice único de {@code dueno_id}, así que una vinculación que todavía no insertó su cuenta
     * también espera a que termine quien la consultó. Usada por la aprobación de un comercio para decidir
     * {@code APROBADO} vs {@code APTO_VENTA} sin carrera con la vinculación/desvinculación.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT c FROM CuentaMercadoPago c WHERE c.dueno.id = :duenoId")
    Optional<CuentaMercadoPago> findByDuenoIdConBloqueo(Integer duenoId);
}
