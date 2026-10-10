package com.bajonea.backend.dto.request;

import com.bajonea.backend.validation.NombreUsuarioPolicy;
import com.bajonea.backend.validation.annotations.ValidarFechaNacimientoPlausible;
import com.bajonea.backend.validation.annotations.ValidarFormatoDni;
import com.bajonea.backend.validation.annotations.ValidarFormatoNombre;
import com.bajonea.backend.validation.annotations.ValidarNombreUsuario;
import com.bajonea.backend.validation.annotations.ValidarPasswordSegura;
import com.bajonea.backend.validation.annotations.ValidarTelefonoArgentino;
import com.bajonea.backend.validation.annotations.ValidarUrlCloudinary;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.LocalDate;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * Datos personales y de cuenta de un Cliente, sin el email ni la aceptación de los Términos y
 * Condiciones: los comparten el registro de Cliente ({@link RegistroClienteRequestDTO}, que suma esos dos
 * campos) y el alta de una cuenta nueva al aceptar una invitación de empleado, donde el email lo da la
 * propia invitación. Las validaciones y los setters de normalización (trim, colapso de espacios, limpieza de
 * separadores de DNI y teléfono, minúsculas del nombre de usuario) son las mismas que tenía el registro, de
 * modo que el JSON del registro de Cliente no cambia. La edad mínima no se valida acá: el registro de Cliente
 * exige 14 años cumplidos ({@link RegistroClienteRequestDTO#getFechaNacimiento}) y el alta de una cuenta nueva
 * por invitación de empleado exige 18, como regla del servicio de invitaciones; así el mensaje de 14 años
 * nunca aparece en el flujo de la invitación.
 */
@Getter
@NoArgsConstructor
public class DatosClienteRequestDTO {

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

    @NotBlank(message = "El nombre de usuario es obligatorio")
    @ValidarNombreUsuario
    @Size(max = 20, message = "El nombre de usuario no puede superar los 20 caracteres")
    private String nombreUsuario;

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

    public void setFechaNacimiento(LocalDate fechaNacimiento) {
        this.fechaNacimiento = fechaNacimiento;
    }

    public void setTelefono(String telefono) {
        this.telefono = telefono == null ? null : telefono.replaceAll("[ ()\\-]", "");
    }

    public void setNombreUsuario(String nombreUsuario) {
        this.nombreUsuario = NombreUsuarioPolicy.normalizar(nombreUsuario);
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
