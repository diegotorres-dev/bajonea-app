package com.bajonea.backend.repositories;

import com.bajonea.backend.entities.Dueno;
import jakarta.persistence.LockModeType;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;

public interface DuenoRepository extends JpaRepository<Dueno, Integer> {

    /**
     * {@code SELECT ... FOR UPDATE} sobre la fila del Dueño — serializa las altas de comercio del
     * mismo Dueño (elegibilidad + chequeo de duplicado + inserción) sin bloquear a otros Dueños. Mismo
     * patrón que {@code UsuarioRepository.findByIdConBloqueo}; tiene que ser la primera sentencia de la
     * transacción para que las lecturas siguientes vean lo confirmado por la alta anterior.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT d FROM Dueno d WHERE d.id = :id")
    Optional<Dueno> findByIdConBloqueo(Integer id);
}
