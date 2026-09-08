package com.bajonea.backend.dto.request;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class OrdenImagenRequestDTO {

    @NotNull(message = "El orden es obligatorio")
    @PositiveOrZero(message = "El orden debe ser un valor positivo")
    private Integer orden;
}
