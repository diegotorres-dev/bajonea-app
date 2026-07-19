package com.bajonea.backend.dto.request;

import com.bajonea.backend.validation.annotations.ValidarUrlCloudinary;
import jakarta.validation.constraints.NotBlank;
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
public class ImagenProductoRequestDTO {

    @NotBlank
    @ValidarUrlCloudinary
    private String url;

    @NotNull
    @PositiveOrZero
    private Integer orden;

    private boolean esPrincipal;
}
