package com.bajonea.backend.dto.request;

import com.bajonea.backend.enums.CondicionIva;
import com.bajonea.backend.enums.TipoPersonaJuridica;
import com.bajonea.backend.validation.NombreUsuarioPolicy;
import com.bajonea.backend.validation.annotations.ValidarCuit;
import com.bajonea.backend.validation.annotations.ValidarFechaNacimientoRepresentante;
import com.bajonea.backend.validation.annotations.ValidarFormatoDni;
import com.bajonea.backend.validation.annotations.ValidarFormatoEmail;
import com.bajonea.backend.validation.annotations.ValidarFormatoNombre;
import com.bajonea.backend.validation.annotations.ValidarNombreUsuario;
import com.bajonea.backend.validation.annotations.ValidarPasswordSegura;
import com.bajonea.backend.validation.annotations.ValidarTelefonoArgentino;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PastOrPresent;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.time.LocalDate;
import java.util.Locale;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * Body de {@code POST /api/v1/auth/registro/comercio} (Fase 9). Extiende
 * {@link DatosNegocioComercioRequestDTO} (multi-comercio, tramo 2A): los datos del negocio
 * ({@code nombre}, {@code descripcion}, {@code telefono}, {@code emailContacto}, {@code tipoComercio},
 * modalidades, {@code direccion}, {@code horarios}, {@code fotoPerfilUrl} y {@code redesSociales}, con
 * todo lo que se explica más abajo sobre ellos) viven en esa superclase, compartida con el alta de un
 * comercio adicional; acá quedan los datos fiscales, del representante y de la cuenta. El JSON del
 * request no cambia. Combina en un solo request
 * plano los campos de {@code PersonaJuridica} + {@code PersonaFisica} (representante) +
 * {@code Comercio} + las credenciales de acceso del {@code Usuario} que se crea junto con el
 * comercio — ninguna de esas entidades tiene un DTO propio (ver {@code CLAUDE.md} §5bis).
 * <p>
 * Lleva dos campos de email distintos, a propósito: {@code email} es la credencial de login
 * del Usuario, {@code emailContacto} es el email público del Comercio, que según
 * {@code docs/modelo-mvp.md} "puede diferir del email del usuario representante".
 * <p>
 * {@code horarios} suma la reincorporación de {@code Horario} (Fase 16a, ver
 * {@code CLAUDE.md} §5 y docs/DECISIONES.md): al menos una franja es obligatoria para
 * completar el registro, aunque el comercio puede no abrir todos los días.
 * <p>
 * Los 5 campos de representante ({@code nombreRepresentante}, {@code apellidoRepresentante},
 * {@code dniRepresentante}, {@code telefonoRepresentante}, {@code fechaNacimientoRepresentante})
 * corrigen retroactivamente un gap real de los Tramos 16.1/16.8 (ver docs/DECISIONES.md): el
 * representante de un Comercio es una {@code PersonaFisica} real, colgada de la misma
 * {@code Persona} que su {@code PersonaJuridica}. Migrados en el tramo de perfeccionamiento de
 * validaciones de "2. Legales" (2026-09-01, ver docs/DECISIONES.md) al mismo toolkit
 * blanco-tolerante que ya usa {@code RegistroClienteRequestDTO} ({@code nombre}/{@code apellido}
 * → {@link ValidarFormatoNombre}, {@code dni} → {@link ValidarFormatoDni}), con setters manuales
 * de normalización (trim + colapso de espacios / sanitización de separadores) igual que en ese
 * DTO — con una única divergencia intencional: {@code fechaNacimientoRepresentante} exige
 * mayoría de edad (18 años), a diferencia de {@code RegistroClienteRequestDTO.fechaNacimiento}
 * (que perdió ese piso el mismo día), porque el representante legal de una empresa sí debe ser
 * mayor de edad — decisión de negocio explícita, no un descuido de sincronización entre ambos
 * DTOs. Desde 2026-09-14 ese piso de 18 años se combina con el mismo techo de plausibilidad de
 * 120 años que ya tenía {@code RegistroClienteRequestDTO.fechaNacimiento} (gap real detectado:
 * antes aceptaba fechas como 01/01/1901), vía la anotación combinada
 * {@link ValidarFechaNacimientoRepresentante} — ver su Javadoc para por qué no se apiló
 * {@code @MayorDeEdad} + {@code @ValidarFechaNacimientoPlausible} directamente en el campo.
 * <p>
 * {@code fotoPerfilUrl} es obligatorio ({@code comercio.foto_perfil_url NOT NULL} en
 * {@code bajonea_final}, confirmado por Diego — corrección de un gap real encontrado en la
 * verificación end-to-end del Tramo 4, ver docs/DECISIONES.md): la URL real ya subida a
 * Cloudinary vía {@code POST /auth/registro/comercio/foto-firma} (público, scoped a la carpeta
 * fija {@code comercios/pre-registro/} porque el comercio todavía no tiene {@code id} en este
 * punto del flujo), viaja en este mismo body y se persiste directo en
 * {@code Comercio.fotoPerfilUrl}.
 * <p>
 * {@code redesSociales} suma la carga de {@code RedSocial} directo en el registro (Fase B del
 * lote de ajustes post-migración, ver docs/DECISIONES.md): al menos una es obligatoria y hasta
 * 5 como máximo, mismo límite operativo ya validado en {@code RedSocialService}. Reutiliza
 * {@code RedSocialRequestDTO} tal cual (mismas anotaciones de {@code tipo}/{@code url}) en vez
 * de crear un DTO nuevo — el body de alta individual de {@code RedSocialController} y el de
 * este registro tienen exactamente la misma forma.
 */
@Getter
@Setter
@NoArgsConstructor
public class RegistroComercioRequestDTO extends DatosNegocioComercioRequestDTO {

    @NotBlank(message = "La razón social es obligatoria")
    @Pattern(regexp = ".*[\\p{L}0-9].*", message = "La razón social no puede contener solo caracteres especiales")
    @Size(max = 150, message = "La razón social no puede superar los 150 caracteres")
    private String razonSocial;

    @NotBlank(message = "El CUIT es obligatorio")
    @ValidarCuit(message = "El CUIT debe tener 11 dígitos numéricos")
    @Setter(AccessLevel.NONE)
    private String cuit;

    @NotNull(message = "Seleccioná la condición ante el IVA")
    private CondicionIva condicionIva;

    @NotNull(message = "Seleccioná el tipo de sociedad")
    private TipoPersonaJuridica tipoSociedad;

    @NotBlank(message = "El domicilio fiscal es obligatorio")
    @Pattern(regexp = ".*[\\p{L}0-9].*", message = "El domicilio fiscal no puede contener solo caracteres especiales")
    @Size(max = 255, message = "El domicilio fiscal no puede superar los 255 caracteres")
    private String domicilioFiscal;

    @NotNull(message = "La fecha de inicio de actividades es obligatoria")
    @PastOrPresent(message = "La fecha ingresada no es válida")
    private LocalDate fechaInicioActividades;

    @NotBlank(message = "El nombre de usuario es obligatorio")
    @ValidarNombreUsuario
    @Size(max = 20, message = "El nombre de usuario no puede superar los 20 caracteres")
    @Setter(AccessLevel.NONE)
    private String nombreUsuario;

    @NotBlank(message = "El email es obligatorio")
    @ValidarFormatoEmail
    @Size(max = 254, message = "El email no puede superar los 254 caracteres")
    @Setter(AccessLevel.NONE)
    private String email;

    @NotBlank(message = "La contraseña es obligatoria")
    @ValidarPasswordSegura
    private String password;

    @NotBlank(message = "El nombre es obligatorio")
    @ValidarFormatoNombre(message = "El nombre solo puede contener letras")
    @Size(max = 100, message = "El nombre no puede superar los 100 caracteres")
    @Setter(AccessLevel.NONE)
    private String nombreRepresentante;

    @NotBlank(message = "El apellido es obligatorio")
    @ValidarFormatoNombre(message = "El apellido solo puede contener letras")
    @Size(max = 100, message = "El apellido no puede superar los 100 caracteres")
    @Setter(AccessLevel.NONE)
    private String apellidoRepresentante;

    @NotBlank(message = "El DNI es obligatorio")
    @ValidarFormatoDni
    @Setter(AccessLevel.NONE)
    private String dniRepresentante;

    @NotBlank(message = "El teléfono es obligatorio")
    @ValidarTelefonoArgentino
    @Size(max = 30, message = "El teléfono no puede superar los 30 caracteres")
    private String telefonoRepresentante;

    @NotNull(message = "La fecha de nacimiento es obligatoria")
    @ValidarFechaNacimientoRepresentante
    private LocalDate fechaNacimientoRepresentante;

    public void setCuit(String cuit) {
        this.cuit = cuit == null ? null : cuit.replaceAll("[^0-9]", "");
    }

    public void setNombreUsuario(String nombreUsuario) {
        this.nombreUsuario = NombreUsuarioPolicy.normalizar(nombreUsuario);
    }

    public void setEmail(String email) {
        this.email = email == null ? null : email.trim().toLowerCase(Locale.ROOT);
    }

    public void setNombreRepresentante(String nombreRepresentante) {
        this.nombreRepresentante = normalizarEspacios(nombreRepresentante);
    }

    public void setApellidoRepresentante(String apellidoRepresentante) {
        this.apellidoRepresentante = normalizarEspacios(apellidoRepresentante);
    }

    public void setDniRepresentante(String dniRepresentante) {
        this.dniRepresentante = dniRepresentante == null ? null : dniRepresentante.replaceAll("[.\\-\\s]", "");
    }

    private static String normalizarEspacios(String valor) {
        if (valor == null) {
            return null;
        }
        return valor.trim().replaceAll("\\s+", " ");
    }
}
