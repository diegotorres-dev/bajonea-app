package com.bajonea.backend.dto.response;

import lombok.Getter;

@Getter
public class IniciarVinculacionMercadoPagoResponseDTO {

    private final String url;

    public IniciarVinculacionMercadoPagoResponseDTO(String url) {
        this.url = url;
    }
}
