package com.bajonea.backend.dto.request;

import com.bajonea.backend.validation.annotations.ValidarFormatoEmail;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.util.Locale;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * Body de {@code POST /api/v1/auth/invitaciones-empleado/aceptar}. {@code cuentaNueva} y
 * {@code aceptaTerminos} solo se usan cuando el email todavía no tiene cuenta: con una cuenta existente se
 * ignoran por completo (aceptar nunca modifica una cuenta existente). Que falten cuando el email no tiene
 * cuenta es una regla de negocio del servicio (depende del estado de la base), no de este DTO; los datos de
 * {@code cuentaNueva}, si vienen, se validan acá con las mismas reglas del registro de Cliente.
 */
@Getter
@NoArgsConstructor
public class AceptarInvitacionEmpleadoRequestDTO {

    @NotBlank(message = "El email es obligatorio")
    @ValidarFormatoEmail
    @Size(max = 254, message = "El email no puede superar los 254 caracteres")
    private String email;

    @NotBlank(message = "El código es obligatorio")
    @Pattern(regexp = "\\d{6}", message = "El código debe tener 6 dígitos numéricos")
    private String codigo;

    private Boolean aceptaTerminos;

    @Valid
    private DatosClienteRequestDTO cuentaNueva;

    public void setEmail(String email) {
        this.email = email == null ? null : email.trim().toLowerCase(Locale.ROOT);
    }

    public void setCodigo(String codigo) {
        this.codigo = codigo == null ? null : codigo.trim();
    }

    public void setAceptaTerminos(Boolean aceptaTerminos) {
        this.aceptaTerminos = aceptaTerminos;
    }

    public void setCuentaNueva(DatosClienteRequestDTO cuentaNueva) {
        this.cuentaNueva = cuentaNueva;
    }
}
