package com.bajonea.backend.dto.request;

import com.bajonea.backend.validation.annotations.ValidarUrlCloudinary;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class FotoPerfilComercioRequestDTO {

    @NotBlank
    @ValidarUrlCloudinary
    @Pattern(regexp = "(?i).*\\.(jpg|jpeg|png|webp)$",
            message = "La URL debe apuntar a un archivo jpg, jpeg, png o webp")
    private String url;
}
