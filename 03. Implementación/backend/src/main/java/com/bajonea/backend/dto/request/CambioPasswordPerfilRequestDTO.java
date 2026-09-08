package com.bajonea.backend.dto.request;

import com.bajonea.backend.validation.annotations.ValidarPasswordSegura;
import jakarta.validation.constraints.NotBlank;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class CambioPasswordPerfilRequestDTO {

    @NotBlank(message = "No debe estar vacío")
    private String passwordActual;

    @NotBlank(message = "No debe estar vacío")
    @ValidarPasswordSegura
    private String passwordNueva;
}
