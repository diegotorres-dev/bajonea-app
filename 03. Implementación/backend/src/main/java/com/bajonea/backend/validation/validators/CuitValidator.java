package com.bajonea.backend.validation.validators;

import com.bajonea.backend.validation.annotations.ValidarCuit;
import jakarta.validation.ConstraintValidator;
import jakarta.validation.ConstraintValidatorContext;

/**
 * Valida el formato (11 dígitos) y el dígito verificador de un CUIT según el algoritmo
 * módulo 11 de AFIP: cada uno de los primeros 10 dígitos se multiplica por su multiplicador
 * correspondiente, se suman los productos, y el dígito verificador esperado surge de
 * {@code 11 - (suma % 11)} (con los casos borde 11 -> 0 y 10 -> CUIT inválido).
 */
public class CuitValidator implements ConstraintValidator<ValidarCuit, String> {

    private static final int[] MULTIPLICADORES = {5, 4, 3, 2, 7, 6, 5, 4, 3, 2};

    @Override
    public boolean isValid(String cuit, ConstraintValidatorContext context) {
        if (cuit == null) {
            // La ausencia del valor es responsabilidad de @NotBlank/@NotNull en el DTO;
            // este validator solo se expide sobre formato y dígito verificador.
            return true;
        }
        if (!cuit.matches("\\d{11}")) {
            return false;
        }

        int suma = 0;
        for (int i = 0; i < MULTIPLICADORES.length; i++) {
            suma += Character.getNumericValue(cuit.charAt(i)) * MULTIPLICADORES[i];
        }

        int resto = suma % 11;
        int digitoVerificadorEsperado = 11 - resto;
        if (digitoVerificadorEsperado == 11) {
            digitoVerificadorEsperado = 0;
        } else if (digitoVerificadorEsperado == 10) {
            return false; // No existe CUIT matemáticamente válido para esta combinación.
        }

        int digitoVerificadorReal = Character.getNumericValue(cuit.charAt(10));
        return digitoVerificadorEsperado == digitoVerificadorReal;
    }
}
