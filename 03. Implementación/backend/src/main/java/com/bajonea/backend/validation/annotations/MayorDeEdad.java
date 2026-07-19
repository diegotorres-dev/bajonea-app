package com.bajonea.backend.validation.annotations;

import com.bajonea.backend.validation.validators.MayorDeEdadValidator;
import jakarta.validation.Constraint;
import jakarta.validation.Payload;

import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * Valida que la fecha anotada (ej. fecha de nacimiento) corresponda a una persona de 18
 * años o más al momento de la validación. Ver {@link MayorDeEdadValidator} para la
 * implementación.
 */
@Target(ElementType.FIELD)
@Retention(RetentionPolicy.RUNTIME)
@Constraint(validatedBy = MayorDeEdadValidator.class)
@Documented
public @interface MayorDeEdad {

    String message() default "Debe ser mayor de 18 años";

    Class<?>[] groups() default {};

    Class<? extends Payload>[] payload() default {};
}
