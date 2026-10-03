package com.bajonea.backend.dto.response;

import lombok.AllArgsConstructor;
import lombok.Getter;

/**
 * Dirección del comercio para precargar el formulario de corrección: a diferencia de
 * {@link DireccionResponseDTO} lleva el {@code provinciaId}, que el selector Provincia → Localidad necesita
 * para quedar posicionado.
 */
@Getter
@AllArgsConstructor
public class DireccionCorreccionResponseDTO {

    private final Integer id;
    private final String calle;
    private final String numero;
    private final String pisoDepto;
    private final String codigoPostal;
    private final String provinciaId;
    private final String nombreProvincia;
    private final String localidadId;
    private final String nombreLocalidad;
}
