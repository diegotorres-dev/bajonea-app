package com.bajonea.backend.dto.response;

import com.bajonea.backend.enums.EstadoUsuario;
import com.bajonea.backend.enums.RolUsuario;
import lombok.Getter;

/**
 * Representación pública de {@code Usuario}. Nunca incluye {@code passwordHash} ni ningún
 * otro campo sensible — solo lo que un cliente autenticado necesita ver de su propia
 * identidad (o un admin de la identidad ajena).
 */
@Getter
public class UsuarioResponseDTO {

    private final Integer id;
    private final String email;
    private final RolUsuario rol;
    private final EstadoUsuario estado;

    public UsuarioResponseDTO(Integer id, String email, RolUsuario rol, EstadoUsuario estado) {
        this.id = id;
        this.email = email;
        this.rol = rol;
        this.estado = estado;
    }
}
