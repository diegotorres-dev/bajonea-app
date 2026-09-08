package com.bajonea.backend.dto.request;

import com.bajonea.backend.validation.annotations.ValidarNombrePropio;
import com.bajonea.backend.validation.annotations.ValidarTelefonoArgentino;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * No incluye {@code email}/{@code dni}/{@code fechaNacimiento}: quedan de solo lectura para
 * el Cliente, confirmado explícitamente fuera de alcance de esta fase (Fase 16a).
 */
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class ClienteEditarPerfilRequestDTO {

    @NotBlank(message = "El nombre es obligatorio")
    @ValidarNombrePropio
    @Size(max = 100, message = "El nombre no puede superar los 100 caracteres")
    private String nombre;

    @NotBlank(message = "El apellido es obligatorio")
    @ValidarNombrePropio
    @Size(max = 100, message = "El apellido no puede superar los 100 caracteres")
    private String apellido;

    @NotBlank(message = "No debe estar vacío")
    @ValidarTelefonoArgentino
    @Size(max = 30, message = "El teléfono no puede superar los 30 caracteres")
    private String telefono;
}
