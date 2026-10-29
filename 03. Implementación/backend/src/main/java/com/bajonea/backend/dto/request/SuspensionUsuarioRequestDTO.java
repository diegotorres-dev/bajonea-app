package com.bajonea.backend.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Getter
@NoArgsConstructor
@AllArgsConstructor
public class SuspensionUsuarioRequestDTO {

    @NotBlank(message = "Ingresá el motivo de la suspensión")
    @Size(min = 10, max = 500, message = "El motivo debe tener entre 10 y 500 caracteres")
    private String motivo;

    public void setMotivo(String motivo) {
        this.motivo = motivo == null ? null : motivo.trim();
    }
}
