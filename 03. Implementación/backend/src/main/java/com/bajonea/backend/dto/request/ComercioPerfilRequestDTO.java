package com.bajonea.backend.dto.request;

import com.bajonea.backend.validation.annotations.ValidarTelefonoArgentino;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
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
 * subida firmada de Fase 11. Ese campo se agrega recién cuando el propio backend, tras
 * validar la firma, sea quien asocie la URL — no un valor que llega suelto por body. Ver
 * docs/DECISIONES.md, 2026-07-17.
 */
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class ComercioPerfilRequestDTO {

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

    private boolean aceptaDelivery;

    private boolean aceptaRetiro;
}
