package com.bajonea.backend.dto.request;

import com.bajonea.backend.enums.TipoComercio;
import com.bajonea.backend.validation.annotations.ValidarTelefonoArgentino;
import com.bajonea.backend.validation.annotations.ValidarUrlCloudinary;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.util.List;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * Datos propios del negocio de un comercio, sin nada del titular ni de la cuenta de acceso:
 * los comparten {@link RegistroComercioRequestDTO} (alta del primer comercio junto con el Dueño) y
 * {@link AltaComercioAdicionalRequestDTO} (alta de un comercio adicional de un Dueño ya existente), así
 * que sus reglas de validación viven en un solo lugar. {@code RegistroService.crearComercio} recibe
 * exactamente este tipo.
 * <p>
 * {@code fotoPerfilUrl} es obligatorio ({@code comercio.foto_perfil_url NOT NULL}); de qué carpeta de
 * Cloudinary tiene que venir depende del flujo y lo valida el Service, no este DTO. {@code horarios}
 * exige al menos una franja y {@code redesSociales} al menos una y hasta 5 (mismo límite operativo que
 * {@code RedSocialService}); las reglas cruzadas (superposición de horarios, tipos de red repetidos,
 * modalidades de entrega, localidad existente) las valida {@code RegistroService.crearComercio}.
 */
@Getter
@Setter
@NoArgsConstructor
public class DatosNegocioComercioRequestDTO {

    @NotBlank(message = "El nombre del comercio es obligatorio")
    @Pattern(regexp = ".*[\\p{L}0-9].*", message = "Ingresá un nombre de comercio válido")
    @Size(max = 150, message = "El nombre no puede superar los 150 caracteres")
    private String nombre;

    @Size(max = 2000, message = "La descripción no puede superar los 2000 caracteres")
    private String descripcion;

    @NotBlank(message = "El teléfono de contacto es obligatorio")
    @ValidarTelefonoArgentino
    @Size(max = 30, message = "El teléfono no puede superar los 30 caracteres")
    private String telefono;

    @NotBlank(message = "El email de contacto es obligatorio")
    @Email(message = "Ingresá un email de contacto con formato válido")
    @Size(max = 150, message = "El email no puede superar los 150 caracteres")
    private String emailContacto;

    @NotNull(message = "Seleccioná el tipo de comercio")
    private TipoComercio tipoComercio;

    private boolean aceptaDelivery;

    private boolean aceptaRetiro;

    @NotNull(message = "La dirección es obligatoria")
    @Valid
    private DireccionRequestDTO direccion;

    @NotEmpty(message = "No debe estar vacío")
    @Valid
    private List<HorarioRequestDTO> horarios;

    @NotBlank(message = "Agregá una foto de perfil de tu comercio")
    @ValidarUrlCloudinary
    @Size(max = 500, message = "La foto de perfil no puede superar los 500 caracteres")
    private String fotoPerfilUrl;

    @NotEmpty(message = "Debés cargar al menos una red social")
    @Size(max = 5, message = "No podés cargar más de 5 redes sociales")
    @Valid
    private List<RedSocialRequestDTO> redesSociales;
}
