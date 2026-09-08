package com.bajonea.backend.dto.request;

import com.bajonea.backend.validation.annotations.ValidarUrlCloudinary;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class FotoPerfilUsuarioRequestDTO {

    @NotBlank(message = "No debe estar vacío")
    @ValidarUrlCloudinary
    @Pattern(regexp = "(?i).*\\.(jpg|jpeg|png|webp)$",
            message = "La URL debe apuntar a un archivo jpg, jpeg, png o webp")
    @Size(max = 500, message = "La URL de la foto de perfil no puede superar los 500 caracteres")
    private String url;
}
