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
}
