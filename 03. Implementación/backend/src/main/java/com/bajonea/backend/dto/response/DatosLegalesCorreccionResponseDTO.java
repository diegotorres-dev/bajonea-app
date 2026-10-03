package com.bajonea.backend.dto.response;

import com.bajonea.backend.enums.CondicionIva;
import com.bajonea.backend.enums.TipoPersonaJuridica;
import java.time.LocalDate;
import lombok.AllArgsConstructor;
import lombok.Getter;

/**
 * Datos fiscales y del representante del Dueño, para precargar el bloque de datos legales de la
 * corrección. Solo se incluye en {@link CorreccionComercioResponseDTO} cuando el Dueño puede corregirlos.
 */
@Getter
@AllArgsConstructor
public class DatosLegalesCorreccionResponseDTO {

    private final String razonSocial;
    private final String cuit;
    private final CondicionIva condicionIva;
    private final TipoPersonaJuridica tipoSociedad;
    private final String domicilioFiscal;
    private final LocalDate fechaInicioActividades;
    private final RepresentanteResponseDTO representante;
}
