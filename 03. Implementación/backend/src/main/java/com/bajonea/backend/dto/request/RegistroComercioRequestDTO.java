package com.bajonea.backend.dto.request;

import com.bajonea.backend.enums.CondicionIva;
import com.bajonea.backend.enums.TipoComercio;
import com.bajonea.backend.enums.TipoPersonaJuridica;
import com.bajonea.backend.validation.annotations.ValidarCuit;
import com.bajonea.backend.validation.annotations.ValidarPasswordSegura;
import com.bajonea.backend.validation.annotations.ValidarTelefonoArgentino;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PastOrPresent;
import jakarta.validation.constraints.Size;
import java.time.LocalDate;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * Body de {@code POST /api/v1/auth/registro/comercio} (Fase 9). Combina en un solo request
 * plano los campos de {@code PersonaJuridica} + {@code Comercio} + las credenciales de
 * acceso del {@code Usuario} que se crea junto con el comercio — ninguna de esas entidades
 * tiene un DTO propio (ver {@code CLAUDE.md} §5bis).
 * <p>
 * Lleva dos campos de email distintos, a propósito: {@code email} es la credencial de login
 * del Usuario, {@code emailContacto} es el email público del Comercio, que según
 * {@code docs/modelo-mvp.md} "puede diferir del email del usuario representante".
 */
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class RegistroComercioRequestDTO {

    @NotBlank
    @Size(max = 150)
    private String razonSocial;

    @NotBlank
    @ValidarCuit
    private String cuit;

    @NotNull
    private CondicionIva condicionIva;

    @NotNull
    private TipoPersonaJuridica tipoSociedad;

    @NotBlank
    @Size(max = 255)
    private String domicilioFiscal;

    @NotNull
    @PastOrPresent
    private LocalDate fechaInicioActividades;

    @NotBlank
    @Size(max = 150)
    private String nombre;

    @Size(max = 2000)
    private String descripcion;

    @NotBlank
    @ValidarTelefonoArgentino
    @Size(max = 30)
    private String telefono;

    @NotBlank
    @Email
    @Size(max = 150)
    private String emailContacto;

    @NotNull
    private TipoComercio tipoComercio;

    private boolean aceptaDelivery;

    private boolean aceptaRetiro;

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
