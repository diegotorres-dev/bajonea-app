package com.bajonea.backend.dto.request;

import com.bajonea.backend.validation.NombreUsuarioPolicy;
import com.bajonea.backend.validation.annotations.ValidarNombreUsuario;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Getter
@NoArgsConstructor
@AllArgsConstructor
public class CambiarNombreUsuarioRequestDTO {

    @NotBlank(message = "El nombre de usuario es obligatorio")
    @ValidarNombreUsuario
    @Size(max = 20, message = "El nombre de usuario no puede superar los 20 caracteres")
    private String nombreUsuario;

    @NotBlank(message = "No debe estar vacío")
    private String passwordActual;

    public void setNombreUsuario(String nombreUsuario) {
        this.nombreUsuario = NombreUsuarioPolicy.normalizar(nombreUsuario);
    }

    public void setPasswordActual(String passwordActual) {
        this.passwordActual = passwordActual;
    }
}
