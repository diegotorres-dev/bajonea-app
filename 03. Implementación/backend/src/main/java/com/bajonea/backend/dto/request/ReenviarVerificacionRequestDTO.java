package com.bajonea.backend.dto.request;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class ReenviarVerificacionRequestDTO {

    @NotBlank(message = "No debe estar vacío")
    @Email(message = "Ingresá un email con formato válido")
    private String email;
}
