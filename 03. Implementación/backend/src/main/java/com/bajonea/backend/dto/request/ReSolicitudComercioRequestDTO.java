package com.bajonea.backend.dto.request;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * Body de {@code PUT /api/v1/comercios/{comercioId}/resolicitud}: el Dueño corrige un comercio rechazado y
 * pide de nuevo su aprobación. Lleva los datos del negocio completos ({@link DatosNegocioComercioRequestDTO},
 * con las mismas reglas que el alta: lo que no cambia se manda igual), el bloque {@code legales} opcional y
 * el {@code tokenVersion} que devolvió {@code GET .../correccion}.
 * <p>
 * {@code legales} solo se acepta si el Dueño nunca tuvo un comercio aprobado (si no, {@code 409}); cuando
 * viene, va completo. {@code tokenVersion} es el id de la fila de historial del último rechazo del comercio
 * ({@code 0} si el comercio no tiene ninguna): si cambió desde que el Dueño abrió la pantalla (otra pestaña ya
 * reenvió, o el Administrador rechazó de nuevo) la solicitud se rechaza con {@code 409} y no gasta un intento.
 */
@Getter
@Setter
@NoArgsConstructor
public class ReSolicitudComercioRequestDTO extends DatosNegocioComercioRequestDTO {

    @Valid
    private DatosLegalesComercioRequestDTO legales;

    @NotNull(message = "Falta la versión de la solicitud. Volvé a abrir la corrección")
    @PositiveOrZero(message = "La versión de la solicitud no es válida")
    private Integer tokenVersion;
}
