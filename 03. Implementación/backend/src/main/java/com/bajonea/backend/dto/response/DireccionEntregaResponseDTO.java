package com.bajonea.backend.dto.response;

import lombok.Getter;

/**
 * Dirección de entrega de un pedido tal como se guardó al confirmarlo: es una copia, no la dirección viva del
 * Cliente, así que editar o eliminar esa dirección después no la cambia. No lleva el alias privado del Cliente.
 */
@Getter
public class DireccionEntregaResponseDTO {

    private final String calle;
    private final String numero;
    private final String pisoDepto;
    private final String codigoPostal;
    private final String localidadId;
    private final String nombreLocalidad;
    private final String nombreProvincia;
    private final String referencia;

    public DireccionEntregaResponseDTO(
            String calle,
            String numero,
            String pisoDepto,
            String codigoPostal,
            String localidadId,
            String nombreLocalidad,
            String nombreProvincia,
            String referencia) {
        this.calle = calle;
        this.numero = numero;
        this.pisoDepto = pisoDepto;
        this.codigoPostal = codigoPostal;
        this.localidadId = localidadId;
        this.nombreLocalidad = nombreLocalidad;
        this.nombreProvincia = nombreProvincia;
        this.referencia = referencia;
    }
}
