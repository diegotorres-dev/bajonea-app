package com.bajonea.backend.validation.validators;

import com.bajonea.backend.validation.annotations.ValidarFechaNacimientoRepresentante;
import jakarta.validation.ConstraintValidator;
import jakarta.validation.ConstraintValidatorContext;

import java.time.LocalDate;
import java.time.Period;

/**
 * Combina el piso de edad mínima de {@link MayorDeEdadValidator} (18 años) con el techo de
 * plausibilidad de {@link FechaNacimientoPlausibleValidator} (120 años, límite inclusivo —
 * mismo criterio que ese validador), reportando un mensaje distinto para cada caso de falla.
 */
public class FechaNacimientoRepresentanteValidator
        implements ConstraintValidator<ValidarFechaNacimientoRepresentante, LocalDate> {

    private static final int EDAD_MINIMA = 18;
    private static final int ANTIGUEDAD_MAXIMA_ANIOS = 120;

    @Override
    public boolean isValid(LocalDate fechaNacimiento, ConstraintValidatorContext context) {
        if (fechaNacimiento == null) {
            return true;
        }
        LocalDate hoy = LocalDate.now();
        if (fechaNacimiento.isAfter(hoy)) {
            return marcarInvalido(context, "La fecha ingresada no es válida");
        }
        if (fechaNacimiento.isBefore(hoy.minusYears(ANTIGUEDAD_MAXIMA_ANIOS))) {
            return marcarInvalido(context, "La fecha ingresada no puede ser anterior a 120 años");
        }
        if (Period.between(fechaNacimiento, hoy).getYears() < EDAD_MINIMA) {
            return marcarInvalido(context, "Debe ser mayor de 18 años");
        }
        return true;
    }

    private boolean marcarInvalido(ConstraintValidatorContext context, String mensaje) {
        context.disableDefaultConstraintViolation();
        context.buildConstraintViolationWithTemplate(mensaje).addConstraintViolation();
        return false;
    }
}
