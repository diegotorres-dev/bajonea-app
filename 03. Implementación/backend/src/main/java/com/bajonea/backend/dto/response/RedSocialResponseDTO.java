package com.bajonea.backend.dto.response;

import com.bajonea.backend.enums.TipoRedSocial;
import java.time.LocalDateTime;
import lombok.Getter;

@Getter
public class RedSocialResponseDTO {

    private final Integer id;
    private final TipoRedSocial tipo;
    private final String url;
    private final LocalDateTime fechaCreacion;
    private final LocalDateTime fechaModificacion;

    public RedSocialResponseDTO(Integer id, TipoRedSocial tipo, String url, LocalDateTime fechaCreacion,
            LocalDateTime fechaModificacion) {
        this.id = id;
        this.tipo = tipo;
        this.url = url;
        this.fechaCreacion = fechaCreacion;
        this.fechaModificacion = fechaModificacion;
    }
}
