package com.bajonea.backend.dto.request;

import com.bajonea.backend.validation.annotations.ValidarUrlCloudinary;
import jakarta.validation.constraints.NotBlank;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class UrlImagenRequestDTO {

    @NotBlank(message = "No debe estar vacío")
    @ValidarUrlCloudinary
    private String url;
}
