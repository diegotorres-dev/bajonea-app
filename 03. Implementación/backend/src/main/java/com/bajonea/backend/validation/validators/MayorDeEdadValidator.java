package com.bajonea.backend.validation.validators;

import com.bajonea.backend.validation.annotations.MayorDeEdad;
import jakarta.validation.ConstraintValidator;
import jakarta.validation.ConstraintValidatorContext;

import java.time.LocalDate;
import java.time.Period;

/**
 * Valida que, a partir de la fecha de nacimiento anotada, hayan transcurrido 18 años o más
 * hasta la fecha actual del sistema.
 */
public class MayorDeEdadValidator implements ConstraintValidator<MayorDeEdad, LocalDate> {

    private static final int EDAD_MINIMA = 18;

    @Override
    public boolean isValid(LocalDate fechaNacimiento, ConstraintValidatorContext context) {
        if (fechaNacimiento == null) {
            return true;
        }
        if (fechaNacimiento.isAfter(LocalDate.now())) {
            return false;
        }
        return Period.between(fechaNacimiento, LocalDate.now()).getYears() >= EDAD_MINIMA;
    }
}
