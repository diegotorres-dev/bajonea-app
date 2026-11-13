package com.bajonea.backend.dto.response;

import com.bajonea.backend.enums.EstadoUsuario;
import com.bajonea.backend.enums.RolUsuario;
import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.Getter;

/**
 * Representación pública de {@code Usuario}. Nunca incluye {@code passwordHash} ni ningún
 * otro campo sensible — solo lo que un cliente autenticado necesita ver de su propia
 * identidad (o un admin de la identidad ajena). {@code nombre} es el nombre de pila de la
 * persona y solo viaja en las respuestas que lo resuelven (login, reactivación y foto de perfil).
 */
@Getter
public class UsuarioResponseDTO {

    private final Integer id;
    private final String email;
    private final RolUsuario rol;
    private final EstadoUsuario estado;
    private final String fotoPerfilUrl;

    @JsonInclude(JsonInclude.Include.NON_NULL)
    private final String nombre;

    public UsuarioResponseDTO(Integer id, String email, RolUsuario rol, EstadoUsuario estado, String fotoPerfilUrl) {
        this(id, email, rol, estado, fotoPerfilUrl, null);
    }

    public UsuarioResponseDTO(Integer id, String email, RolUsuario rol, EstadoUsuario estado, String fotoPerfilUrl, String nombre) {
        this.id = id;
        this.email = email;
        this.rol = rol;
        this.estado = estado;
        this.fotoPerfilUrl = fotoPerfilUrl;
        this.nombre = nombre;
    }
}
