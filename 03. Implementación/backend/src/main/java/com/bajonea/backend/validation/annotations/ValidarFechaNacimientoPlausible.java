package com.bajonea.backend.validation.annotations;

import com.bajonea.backend.validation.validators.FechaNacimientoPlausibleValidator;
import jakarta.validation.Constraint;
import jakarta.validation.Payload;

import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * Valida que la fecha anotada sea una fecha de nacimiento plausible: no futura y no
 * anterior a 120 años desde hoy. Chequeo de plausibilidad de datos, no una política de
 * edad mínima — a diferencia de {@link MayorDeEdad}, no exige ningún piso de edad. Ver
 * {@link FechaNacimientoPlausibleValidator} para la implementación.
 */
@Target(ElementType.FIELD)
@Retention(RetentionPolicy.RUNTIME)
@Constraint(validatedBy = FechaNacimientoPlausibleValidator.class)
@Documented
public @interface ValidarFechaNacimientoPlausible {

    String message() default "La fecha ingresada no es válida";

    Class<?>[] groups() default {};

    Class<? extends Payload>[] payload() default {};
}
