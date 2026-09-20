package com.bajonea.backend.dto.request;

import jakarta.validation.constraints.Pattern;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class SincronizarPagoRequestDTO {

    @Pattern(regexp = "[0-9]{1,20}", message = "El identificador de pago solo puede contener dígitos")
    private String paymentId;
}
