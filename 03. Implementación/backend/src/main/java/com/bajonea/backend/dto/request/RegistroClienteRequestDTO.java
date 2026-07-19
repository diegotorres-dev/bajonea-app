package com.bajonea.backend.dto.request;

import com.bajonea.backend.validation.annotations.MayorDeEdad;
import com.bajonea.backend.validation.annotations.ValidarDni;
import com.bajonea.backend.validation.annotations.ValidarNombrePropio;
import com.bajonea.backend.validation.annotations.ValidarPasswordSegura;
import com.bajonea.backend.validation.annotations.ValidarTelefonoArgentino;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Past;
import jakarta.validation.constraints.Size;
import java.time.LocalDate;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * Body de {@code POST /api/v1/auth/registro/cliente} (Fase 9). Combina en un solo request
 * plano los campos de {@code Usuario} + {@code PersonaFisica} + {@code Cliente} — ninguna
 * de esas tres entidades tiene un DTO propio, ya que Cliente no agrega columnas y Persona
 * nunca se expone vía API (ver {@code CLAUDE.md} §5bis).
 */
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class RegistroClienteRequestDTO {

    @NotBlank
    @ValidarNombrePropio
    @Size(max = 100)
    private String nombre;

    @NotBlank
    @ValidarNombrePropio
    @Size(max = 100)
    private String apellido;

    @NotBlank
    @ValidarDni
    private String dni;

    @NotNull
    @Past
    @MayorDeEdad
    private LocalDate fechaNacimiento;

    @NotBlank
    @ValidarTelefonoArgentino
    @Size(max = 30)
    private String telefono;

    @NotBlank
    @Email
    @Size(max = 150)
    private String email;

    @NotBlank
    @ValidarPasswordSegura
    @Size(max = 72)
    private String password;

    @NotNull
    @Valid
    private DireccionRequestDTO direccion;
}
