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

    @NotBlank
    private String passwordActual;

    @NotBlank
    @ValidarPasswordSegura
    private String passwordNueva;
}
