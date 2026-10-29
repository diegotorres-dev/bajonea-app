package com.bajonea.backend.repositories;

import com.bajonea.backend.entities.Cliente;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface ClienteRepository extends JpaRepository<Cliente, Integer> {

    @Query("""
            SELECT c FROM Cliente c
            JOIN FETCH c.personaFisica pf
            JOIN FETCH pf.persona p
            JOIN FETCH p.usuario
            ORDER BY c.id
            """)
    List<Cliente> findAllParaListadoAdmin();
}
