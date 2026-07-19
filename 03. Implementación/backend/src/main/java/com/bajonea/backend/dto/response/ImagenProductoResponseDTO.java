package com.bajonea.backend.dto.response;

import lombok.Getter;

@Getter
public class ImagenProductoResponseDTO {

    private final Integer id;
    private final String url;
    private final Integer orden;
    private final boolean esPrincipal;

    public ImagenProductoResponseDTO(Integer id, String url, Integer orden, boolean esPrincipal) {
        this.id = id;
        this.url = url;
        this.orden = orden;
        this.esPrincipal = esPrincipal;
    }
}
