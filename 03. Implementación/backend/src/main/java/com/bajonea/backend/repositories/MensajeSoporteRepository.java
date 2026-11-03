package com.bajonea.backend.repositories;

import com.bajonea.backend.entities.MensajeSoporte;
import com.bajonea.backend.enums.AutorMensajeSoporte;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface MensajeSoporteRepository extends JpaRepository<MensajeSoporte, Integer> {

    List<MensajeSoporte> findByTicketIdOrderByIdAsc(Integer ticketId);

    Optional<MensajeSoporte> findFirstByTicketIdAndAutorOrderByIdDesc(Integer ticketId, AutorMensajeSoporte autor);

    /** Marca por clave primaria si el email de un mensaje de Soporte salió o no; es lo único que se modifica de un mensaje. */
    @Modifying
    @Query("UPDATE MensajeSoporte m SET m.emailEnviado = :enviado WHERE m.id = :id")
    int marcarEmailEnviado(@Param("id") Integer id, @Param("enviado") boolean enviado);
}
