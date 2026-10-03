package com.bajonea.backend.dto.request;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * {@code motivo} es texto libre a propósito: no hay ningún ENUM de motivo de rechazo de
 * Comercio documentado en el diccionario completo (a diferencia de
 * {@code Pedido.motivo_rechazo}, que sí usa {@code MotivoRechazo}) — ser fiel al modelo acá
 * es dejarlo como {@code String}, no inventar una estructura que no existe. Obligatorio a
 * nivel Service cuando {@code aprobar = false}, no vía Bean Validation (es una regla
 * condicional a otro campo, un solo uso, no amerita una anotación custom nueva).
 * <p>
 * {@code definitivo} es opcional ({@code null} equivale a {@code false}) y solo tiene sentido al rechazar:
 * el Administrador lo manda para rechazar el comercio de forma definitiva, sin que el Dueño pueda corregirlo
 * ni volver a solicitarlo ({@code RECHAZO_DEFINITIVO}). Aunque no se mande, el servidor decide solo el rechazo
 * definitivo cuando la solicitud rechazada es una re-solicitud y el comercio ya usó todos sus intentos
 * ({@code comercio.resolicitudes.max}); el aviso de "último intento" que ve el Administrador es solo una ayuda
 * de pantalla. Con {@code aprobar = true} no puede venir en {@code true}.
 */
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class AprobacionComercioRequestDTO {

    @NotNull
    private Boolean aprobar;

    @Size(max = 500)
    private String motivo;

    private Boolean definitivo;

    public AprobacionComercioRequestDTO(Boolean aprobar, String motivo) {
        this.aprobar = aprobar;
        this.motivo = motivo;
    }
}
