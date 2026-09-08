package com.bajonea.backend.dto.request;

import com.bajonea.backend.validation.annotations.ValidarUrlCloudinary;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.PositiveOrZero;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class ImagenProductoRequestDTO {

    @NotBlank(message = "No debe estar vacío")
    @ValidarUrlCloudinary
    @Pattern(regexp = "(?i).*\\.(jpg|jpeg|png|webp)$",
            message = "La URL debe apuntar a un archivo jpg, jpeg, png o webp")
    private String url;

    @NotNull(message = "El orden es obligatorio")
    @PositiveOrZero(message = "El orden debe ser un valor positivo")
    private Integer orden;

    private boolean esPrincipal;
}
