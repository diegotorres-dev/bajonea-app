package com.bajonea.backend.dto.request;

import com.bajonea.backend.validation.NombreUsuarioPolicy;
import jakarta.validation.constraints.NotBlank;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * Body de {@code POST /api/v1/auth/login}. El login es exclusivamente por nombre de usuario;
 * se normaliza (trim + minúsculas) sin validar formato, para que un valor mal formado reciba
 * el mismo mensaje genérico que uno inexistente.
 */
@Getter
@NoArgsConstructor
@AllArgsConstructor
public class LoginRequestDTO {

    @NotBlank(message = "No debe estar vacío")
    private String nombreUsuario;

    @Setter
    @NotBlank(message = "No debe estar vacío")
    private String password;

    public void setNombreUsuario(String nombreUsuario) {
        this.nombreUsuario = NombreUsuarioPolicy.normalizar(nombreUsuario);
    }
}
