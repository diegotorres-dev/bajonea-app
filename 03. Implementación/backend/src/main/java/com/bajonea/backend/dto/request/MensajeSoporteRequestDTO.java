package com.bajonea.backend.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Getter
@NoArgsConstructor
public class MensajeSoporteRequestDTO {

    @NotBlank(message = "Escribí tu mensaje")
    @Size(max = 1000, message = "El mensaje no puede superar los 1000 caracteres")
    private String texto;

    public MensajeSoporteRequestDTO(String texto) {
        this.texto = texto;
    }

    public void setTexto(String texto) {
        this.texto = texto == null ? null : texto.trim();
    }
}
