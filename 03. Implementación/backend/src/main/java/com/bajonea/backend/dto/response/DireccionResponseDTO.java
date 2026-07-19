package com.bajonea.backend.dto.response;

import lombok.Getter;

/**
 * Expone la localidad como {@code localidadId} + {@code nombreLocalidad} +
 * {@code nombreProvincia} en vez del objeto {@code Localidad} completo, siguiendo la regla
 * general de no anidar entidades relacionadas completas en un ResponseDTO.
 */
@Getter
public class DireccionResponseDTO {

    private final Integer id;
    private final String calle;
    private final String numero;
    private final String pisoDepto;
    private final String codigoPostal;
    private final String localidadId;
    private final String nombreLocalidad;
    private final String nombreProvincia;
    private final boolean principal;

    public DireccionResponseDTO(
            Integer id,
            String calle,
            String numero,
            String pisoDepto,
            String codigoPostal,
            String localidadId,
            String nombreLocalidad,
            String nombreProvincia,
            boolean principal) {
        this.id = id;
        this.calle = calle;
        this.numero = numero;
        this.pisoDepto = pisoDepto;
        this.codigoPostal = codigoPostal;
        this.localidadId = localidadId;
        this.nombreLocalidad = nombreLocalidad;
        this.nombreProvincia = nombreProvincia;
        this.principal = principal;
    }
}
