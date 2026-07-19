package com.bajonea.backend.dto.response;

import lombok.Getter;

@Getter
public class LoginResponseDTO {

    private final String token;
    private final UsuarioResponseDTO usuario;

    public LoginResponseDTO(String token, UsuarioResponseDTO usuario) {
        this.token = token;
        this.usuario = usuario;
    }
}
