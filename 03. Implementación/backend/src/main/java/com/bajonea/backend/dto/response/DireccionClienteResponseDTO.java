package com.bajonea.backend.dto.response;

import lombok.Getter;

@Getter
public class DireccionClienteResponseDTO {

    private final Integer id;
    private final String nombre;
    private final String calle;
    private final String numero;
    private final String pisoDepto;
    private final String codigoPostal;
    private final String localidadId;
    private final String nombreLocalidad;
    private final String nombreProvincia;
    private final String referencia;
    private final boolean principal;

    public DireccionClienteResponseDTO(
            Integer id,
            String nombre,
            String calle,
            String numero,
            String pisoDepto,
            String codigoPostal,
            String localidadId,
            String nombreLocalidad,
            String nombreProvincia,
            String referencia,
            boolean principal) {
        this.id = id;
        this.nombre = nombre;
        this.calle = calle;
        this.numero = numero;
        this.pisoDepto = pisoDepto;
        this.codigoPostal = codigoPostal;
        this.localidadId = localidadId;
        this.nombreLocalidad = nombreLocalidad;
        this.nombreProvincia = nombreProvincia;
        this.referencia = referencia;
        this.principal = principal;
    }
}
