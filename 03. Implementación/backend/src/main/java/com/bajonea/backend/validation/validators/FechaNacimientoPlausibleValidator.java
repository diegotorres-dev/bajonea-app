package com.bajonea.backend.validation.validators;

import com.bajonea.backend.validation.annotations.ValidarFechaNacimientoPlausible;
import jakarta.validation.ConstraintValidator;
import jakarta.validation.ConstraintValidatorContext;

import java.time.LocalDate;

/**
 * Valida que, a partir de la fecha de nacimiento anotada, no haya una fecha futura ni una
 * antigüedad mayor a 120 años respecto de la fecha actual del sistema.
 */
public class FechaNacimientoPlausibleValidator implements ConstraintValidator<ValidarFechaNacimientoPlausible, LocalDate> {

    private static final int ANTIGUEDAD_MAXIMA_ANIOS = 120;

    @Override
    public boolean isValid(LocalDate fechaNacimiento, ConstraintValidatorContext context) {
        if (fechaNacimiento == null) {
            return true;
        }
        LocalDate hoy = LocalDate.now();
        if (fechaNacimiento.isAfter(hoy)) {
            return false;
        }
        return !fechaNacimiento.isBefore(hoy.minusYears(ANTIGUEDAD_MAXIMA_ANIOS));
    }
}
