package com.bajonea.backend.dto.request;

import com.bajonea.backend.enums.CondicionIva;
import com.bajonea.backend.enums.TipoPersonaJuridica;
import com.bajonea.backend.validation.annotations.ValidarCuit;
import com.bajonea.backend.validation.annotations.ValidarFechaNacimientoRepresentante;
import com.bajonea.backend.validation.annotations.ValidarFormatoDni;
import com.bajonea.backend.validation.annotations.ValidarFormatoNombre;
import com.bajonea.backend.validation.annotations.ValidarTelefonoArgentino;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PastOrPresent;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.time.LocalDate;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * Datos fiscales y del representante de un Dueño, que puede corregir al volver a solicitar un comercio
 * rechazado solo si nunca tuvo un comercio aprobado ({@link ReSolicitudComercioRequestDTO#getLegales()}).
 * Mismos campos, anotaciones y normalizaciones que los del mismo nombre de
 * {@link RegistroComercioRequestDTO}, así que un dato válido en el alta lo es acá. Cuando se manda este
 * bloque va completo: no hay cambios parciales de datos fiscales.
 */
@Getter
@Setter
@NoArgsConstructor
public class DatosLegalesComercioRequestDTO {

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
