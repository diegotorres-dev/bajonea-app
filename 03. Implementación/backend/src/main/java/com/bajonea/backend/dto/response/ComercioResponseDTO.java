package com.bajonea.backend.dto.response;

import com.bajonea.backend.enums.EstadoComercio;
import com.bajonea.backend.enums.TipoComercio;
import lombok.Getter;

/**
 * Incluye {@code razonSocial}/{@code cuit} de la {@code PersonaJuridica} titular como
 * campos descriptivos planos, no el objeto completo. Incluye la {@code direccion} operativa
 * anidada completa (no solo su id): es la dirección única del comercio, parte central de su
 * perfil público, no una relación secundaria — mismo criterio de excepción ya habilitado en
 * {@code generar-capa-crud/SKILL.md} §2 ("salvo que el caso de uso lo justifique
 * explícitamente").
 */
@Getter
public class ComercioResponseDTO {

    private final Integer id;
    private final String nombre;
    private final String descripcion;
    private final String fotoPerfilUrl;
    private final String telefono;
    private final String emailContacto;
    private final TipoComercio tipoComercio;
    private final boolean aceptaDelivery;
    private final boolean aceptaRetiro;
    private final EstadoComercio estado;
    private final String razonSocial;
    private final String cuit;
    private final DireccionResponseDTO direccion;

    public ComercioResponseDTO(
            Integer id,
            String nombre,
            String descripcion,
            String fotoPerfilUrl,
            String telefono,
            String emailContacto,
            TipoComercio tipoComercio,
            boolean aceptaDelivery,
            boolean aceptaRetiro,
            EstadoComercio estado,
            String razonSocial,
            String cuit,
            DireccionResponseDTO direccion) {
        this.id = id;
        this.nombre = nombre;
        this.descripcion = descripcion;
        this.fotoPerfilUrl = fotoPerfilUrl;
        this.telefono = telefono;
        this.emailContacto = emailContacto;
        this.tipoComercio = tipoComercio;
        this.aceptaDelivery = aceptaDelivery;
        this.aceptaRetiro = aceptaRetiro;
        this.estado = estado;
        this.razonSocial = razonSocial;
        this.cuit = cuit;
        this.direccion = direccion;
    }
}
