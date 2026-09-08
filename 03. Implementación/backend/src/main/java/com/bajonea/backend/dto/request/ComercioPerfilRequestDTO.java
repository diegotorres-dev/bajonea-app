package com.bajonea.backend.dto.request;

import com.bajonea.backend.validation.annotations.ValidarFormatoEmail;
import com.bajonea.backend.validation.annotations.ValidarTelefonoArgentino;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * No incluye {@code razonSocial}/{@code cuit}/{@code condicionIva} ni el resto de los datos
 * fiscales de {@code PersonaJuridica} — este endpoint es autoservicio de perfil público del
 * comercio, no una edición de sus datos legales (sin flujo previsto en el MVP para eso).
 * Tampoco incluye {@code fotoPerfilUrl}: {@code @ValidarUrlCloudinary} solo valida el dominio
 * ({@code res.cloudinary.com}), no la propiedad del recurso — un comercio podría pegar la URL
 * de una imagen subida por otro comercio, y no hay forma de verificarlo sin el flujo de
 * subida firmada. Ese campo tiene su propio par de endpoints desde la Fase 11
 * ({@code POST /comercios/perfil/foto/firma} + {@code PUT /comercios/perfil/foto}, con
 * {@code FotoPerfilComercioRequestDTO}), separado de este DTO de edición de perfil general.
 * Ver docs/DECISIONES.md, 2026-07-17 y 2026-07-18.
 */
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class ComercioPerfilRequestDTO {

    @NotBlank(message = "No debe estar vacío")
    @Pattern(regexp = ".*[\\p{L}0-9].*", message = "Ingresá un nombre de comercio válido")
    @Size(max = 150)
    private String nombre;

    @Size(max = 2000, message = "La descripción no puede superar los 2000 caracteres.")
    private String descripcion;

    @NotBlank(message = "No debe estar vacío")
    @ValidarTelefonoArgentino
    @Size(max = 30)
    private String telefono;

    @NotBlank(message = "No debe estar vacío")
    @ValidarFormatoEmail(message = "Ingresá un email de contacto con formato válido")
    @Size(max = 150)
    private String emailContacto;

    private boolean aceptaDelivery;

    private boolean aceptaRetiro;
}
