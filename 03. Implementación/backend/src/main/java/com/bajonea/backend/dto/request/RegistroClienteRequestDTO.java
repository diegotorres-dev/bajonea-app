package com.bajonea.backend.dto.request;

import com.bajonea.backend.validation.annotations.ValidarFechaNacimientoPlausible;
import com.bajonea.backend.validation.annotations.ValidarFormatoDni;
import com.bajonea.backend.validation.annotations.ValidarFormatoEmail;
import com.bajonea.backend.validation.annotations.ValidarFormatoNombre;
import com.bajonea.backend.validation.annotations.ValidarPasswordSegura;
import com.bajonea.backend.validation.annotations.ValidarTelefonoArgentino;
import com.bajonea.backend.validation.annotations.ValidarUrlCloudinary;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.LocalDate;
import java.util.Locale;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * Body de {@code POST /api/v1/auth/registro/cliente} (Fase 9). Combina en un solo request
 * plano los campos de {@code Usuario} + {@code PersonaFisica} + {@code Cliente} — ninguna
 * de esas tres entidades tiene un DTO propio, ya que Cliente no agrega columnas y Persona
 * nunca se expone vía API (ver {@code CLAUDE.md} §5bis).
 *
 * <p>{@code nombre}/{@code apellido}/{@code dni}/{@code telefono}/{@code email} usan
 * setters manuales (en vez de los generados por Lombok) para normalizar el valor recibido
 * antes de que Bean Validation lo evalúe — trim, colapso de espacios internos, limpieza de
 * separadores de DNI/teléfono, lowercase de email — de forma que el mensaje de "obligatorio"
 * y el de "formato inválido" queden siempre correctamente separados, y que el valor que
 * termina persistido sea siempre el ya normalizado (ver {@code docs/DECISIONES.md}, tramo de
 * perfeccionamiento de validaciones de "01. Datos Personales").</p>
 */
@Getter
@NoArgsConstructor
@AllArgsConstructor
public class RegistroClienteRequestDTO {

    @NotBlank(message = "El nombre es obligatorio")
    @ValidarFormatoNombre
    @Size(max = 100, message = "El nombre no puede superar los 100 caracteres")
    private String nombre;

    @NotBlank(message = "El apellido es obligatorio")
    @ValidarFormatoNombre(message = "El apellido solo puede contener letras")
    @Size(max = 100, message = "El apellido no puede superar los 100 caracteres")
    private String apellido;

    @NotBlank(message = "El DNI es obligatorio")
    @ValidarFormatoDni
    private String dni;

    @NotNull(message = "La fecha de nacimiento es obligatoria")
    @ValidarFechaNacimientoPlausible
    private LocalDate fechaNacimiento;

    @NotBlank(message = "El teléfono es obligatorio")
    @ValidarTelefonoArgentino
    @Size(max = 30, message = "El teléfono no puede superar los 30 caracteres")
    private String telefono;

    @NotBlank(message = "El email es obligatorio")
    @ValidarFormatoEmail
    @Size(max = 254, message = "El email no puede superar los 254 caracteres")
    private String email;

    @NotBlank(message = "La contraseña es obligatoria")
    @ValidarPasswordSegura
    private String password;

    @NotNull(message = "La dirección es obligatoria")
    @Valid
    private DireccionRequestDTO direccion;

    @ValidarUrlCloudinary
    @Size(max = 500, message = "La foto de perfil no puede superar los 500 caracteres")
    private String fotoPerfilUrl;

    public void setNombre(String nombre) {
        this.nombre = normalizarEspacios(nombre);
    }

    public void setApellido(String apellido) {
        this.apellido = normalizarEspacios(apellido);
    }

    public void setDni(String dni) {
        this.dni = dni == null ? null : dni.replaceAll("[.\\-\\s]", "");
    }

    public void setTelefono(String telefono) {
        this.telefono = telefono == null ? null : telefono.replaceAll("[ ()\\-]", "");
    }

    public void setEmail(String email) {
        this.email = email == null ? null : email.trim().toLowerCase(Locale.ROOT);
    }

    public void setPassword(String password) {
        this.password = password;
    }

    public void setDireccion(DireccionRequestDTO direccion) {
        this.direccion = direccion;
    }

    public void setFotoPerfilUrl(String fotoPerfilUrl) {
        this.fotoPerfilUrl = fotoPerfilUrl;
    }

    private static String normalizarEspacios(String valor) {
        if (valor == null) {
            return null;
        }
        return valor.trim().replaceAll("\\s+", " ");
    }
}
