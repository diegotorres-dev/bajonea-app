package com.bajonea.backend.dto.response;

import java.time.LocalDateTime;
import java.util.List;
import lombok.AllArgsConstructor;
import lombok.Getter;

/**
 * Una re-solicitud pendiente de resolver, para la bandeja del Administrador: el comercio con todos sus
 * datos (fiscales incluidos) y lo que cambió el Dueño respecto de lo que se había rechazado.
 * {@code intento} es el número de esta re-solicitud (1 para la primera) y {@code maximoResolicitudes} el
 * tope; {@code esUltimoIntento} avisa que, si el Administrador la rechaza, el comercio pasa a rechazo
 * definitivo. {@code motivoRechazoAnterior} es el motivo del rechazo que el Dueño corrigió.
 */
@Getter
@AllArgsConstructor
public class ReSolicitudComercioAdminResponseDTO {

    private final ComercioAdminResponseDTO comercio;
    private final int intento;
    private final int maximoResolicitudes;
    private final LocalDateTime fechaResolicitud;
    private final String motivoRechazoAnterior;
    private final boolean esUltimoIntento;
    private final List<CambioComercioResponseDTO> cambios;
}
