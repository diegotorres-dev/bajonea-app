package com.bajonea.backend.dto.request;

import com.bajonea.backend.validation.annotations.ValidarFormatoEmail;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.util.Locale;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * Body de {@code POST /api/v1/auth/invitaciones-empleado/validar}: el email al que se mandó la invitación y
 * el código de 6 dígitos. El email se normaliza igual que en el registro (trim y minúsculas) antes de que
 * Bean Validation lo evalúe.
 */
@Getter
@NoArgsConstructor
public class ValidarInvitacionEmpleadoRequestDTO {

    @NotBlank(message = "El email es obligatorio")
    @ValidarFormatoEmail
    @Size(max = 254, message = "El email no puede superar los 254 caracteres")
    private String email;

    @NotBlank(message = "El código es obligatorio")
    @Pattern(regexp = "\\d{6}", message = "El código debe tener 6 dígitos numéricos")
    private String codigo;

    public void setEmail(String email) {
        this.email = email == null ? null : email.trim().toLowerCase(Locale.ROOT);
    }

    public void setCodigo(String codigo) {
        this.codigo = codigo == null ? null : codigo.trim();
    }
}
