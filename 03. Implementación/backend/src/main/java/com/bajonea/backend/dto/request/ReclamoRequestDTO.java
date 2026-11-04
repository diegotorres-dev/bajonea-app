package com.bajonea.backend.dto.request;

import com.bajonea.backend.enums.MotivoReclamo;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@NoArgsConstructor
public class ReclamoRequestDTO {

    @NotNull(message = "Elegí el motivo del reclamo")
    private MotivoReclamo motivo;

    @NotBlank(message = "Contanos qué pasó")
    @Size(min = 10, max = 1000, message = "Contanos qué pasó en entre 10 y 1000 caracteres")
    private String descripcion;
}
