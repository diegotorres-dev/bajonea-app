package com.bajonea.backend.repositories;

import com.bajonea.backend.entities.RedSocial;
import com.bajonea.backend.enums.TipoRedSocial;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface RedSocialRepository extends JpaRepository<RedSocial, Integer> {

    List<RedSocial> findByComercioIdAndFechaBajaIsNull(Integer comercioId);

    /**
     * Todas las filas del comercio, también las dadas de baja: la restricción única
     * {@code (comercio_id, tipo)} las cuenta.
     */
    List<RedSocial> findByComercioId(Integer comercioId);

    long countByComercioIdAndFechaBajaIsNull(Integer comercioId);

    Optional<RedSocial> findByComercioIdAndTipo(Integer comercioId, TipoRedSocial tipo);
}
