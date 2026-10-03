package com.bajonea.backend.dto.response;

import com.bajonea.backend.enums.TipoComercio;
import java.util.List;
import lombok.AllArgsConstructor;
import lombok.Getter;

/**
 * Respuesta de {@code GET /api/v1/comercios/{comercioId}/correccion}: todo lo que la pantalla de corrección
 * de un comercio rechazado necesita para precargar el formulario y mostrar el estado del trámite.
 * <p>
 * {@code intentoActual} es el número de la re-solicitud que se está por enviar (1 para la primera) y
 * {@code intentosRestantes} cuántas quedan contando esa. {@code tokenVersion} es el id de la fila de
 * historial del último rechazo ({@code 0} si no hay): se devuelve tal cual en el {@code PUT}. {@code legales}
 * es {@code null} salvo que {@code puedeCorregirDatosLegales} sea {@code true}.
 */
@Getter
@AllArgsConstructor
public class CorreccionComercioResponseDTO {

    private final Integer comercioId;
    private final String nombre;
    private final String descripcion;
    private final String telefono;
    private final String emailContacto;
    private final TipoComercio tipoComercio;
    private final boolean aceptaDelivery;
    private final boolean aceptaRetiro;
    private final String fotoPerfilUrl;
    private final DireccionCorreccionResponseDTO direccion;
    private final List<HorarioResponseDTO> horarios;
    private final List<RedSocialResponseDTO> redesSociales;
    private final String motivoRechazo;
    private final int intentoActual;
    private final int maximoResolicitudes;
    private final int intentosRestantes;
    private final boolean puedeCorregirDatosLegales;
    private final DatosLegalesCorreccionResponseDTO legales;
    private final Integer tokenVersion;
}
