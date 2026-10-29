package com.bajonea.backend.dto.request;

import jakarta.validation.constraints.Size;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Getter
@NoArgsConstructor
@AllArgsConstructor
public class LevantamientoSuspensionRequestDTO {

    @Size(max = 500, message = "El motivo no puede superar los 500 caracteres")
    private String motivo;

    public void setMotivo(String motivo) {
        this.motivo = motivo == null || motivo.isBlank() ? null : motivo.trim();
    }
}
