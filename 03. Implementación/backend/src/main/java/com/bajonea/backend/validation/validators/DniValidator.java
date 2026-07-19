package com.bajonea.backend.validation.validators;

import com.bajonea.backend.validation.annotations.ValidarDni;
import jakarta.validation.ConstraintValidator;
import jakarta.validation.ConstraintValidatorContext;

/**
 * Valida formato (7 u 8 dígitos) y rango razonable de un DNI argentino: entre 1.000.000 y
 * 99.999.999. Rechaza ceros a la izquierda que dejen el valor fuera de rango y cualquier
 * valor no numérico.
 */
public class DniValidator implements ConstraintValidator<ValidarDni, String> {

    private static final long MINIMO = 1_000_000L;
    private static final long MAXIMO = 99_999_999L;

    @Override
    public boolean isValid(String dni, ConstraintValidatorContext context) {
        if (dni == null) {
            return true;
        }
        if (!dni.matches("\\d{7,8}")) {
            return false;
        }

        long valor = Long.parseLong(dni);
        return valor >= MINIMO && valor <= MAXIMO;
    }
}
