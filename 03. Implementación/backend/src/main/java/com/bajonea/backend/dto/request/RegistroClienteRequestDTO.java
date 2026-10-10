package com.bajonea.backend.dto.request;

import com.bajonea.backend.validation.annotations.EdadMinima;
import com.bajonea.backend.validation.annotations.ValidarFormatoEmail;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.LocalDate;
import java.util.Locale;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * Body de {@code POST /api/v1/auth/registro/cliente} (Fase 9). Combina en un solo request
 * plano los campos de {@code Usuario} + {@code PersonaFisica} + {@code Cliente} — ninguna
 * de esas tres entidades tiene un DTO propio, ya que Cliente no agrega columnas y Persona
 * nunca se expone vía API (ver {@code CLAUDE.md} §5bis).
 *
 * <p>Los datos personales y de cuenta viven en {@link DatosClienteRequestDTO} (compartidos con el alta
 * de una cuenta nueva por invitación de empleado); acá quedan el {@code email}, con su setter de
 * normalización (trim y minúsculas) para que el mensaje de "obligatorio" y el de "formato inválido"
 * queden siempre separados y el valor persistido sea el ya normalizado, y la aceptación de los Términos y
 * Condiciones, que se valida y no se guarda (ver {@code docs/DECISIONES.md}, 2026-10-06). La fecha de nacimiento
 * suma acá la edad mínima de 14 años, que no rige para la cuenta nueva por invitación de empleado.</p>
 */
@Getter
@NoArgsConstructor
public class RegistroClienteRequestDTO extends DatosClienteRequestDTO {

    @NotBlank(message = "El email es obligatorio")
    @ValidarFormatoEmail
    @Size(max = 254, message = "El email no puede superar los 254 caracteres")
    private String email;

    @NotNull(message = "Tenés que aceptar los Términos y Condiciones")
    @AssertTrue(message = "Tenés que aceptar los Términos y Condiciones")
    private Boolean aceptaTerminos;

    public void setEmail(String email) {
        this.email = email == null ? null : email.trim().toLowerCase(Locale.ROOT);
    }

    public void setAceptaTerminos(Boolean aceptaTerminos) {
        this.aceptaTerminos = aceptaTerminos;
    }

    @Override
    @EdadMinima(anios = 14)
    public LocalDate getFechaNacimiento() {
        return super.getFechaNacimiento();
    }
}
