package com.bajonea.backend.repositories;

import com.bajonea.backend.entities.RedSocial;
import com.bajonea.backend.enums.TipoRedSocial;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface RedSocialRepository extends JpaRepository<RedSocial, Integer> {

    List<RedSocial> findByComercioIdAndFechaBajaIsNull(Integer comercioId);

    long countByComercioIdAndFechaBajaIsNull(Integer comercioId);

    Optional<RedSocial> findByComercioIdAndTipo(Integer comercioId, TipoRedSocial tipo);
}
