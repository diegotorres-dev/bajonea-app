package com.bajonea.backend.validation.annotations;

import com.bajonea.backend.validation.validators.DniValidator;
import jakarta.validation.Constraint;
import jakarta.validation.Payload;

import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * Valida que el campo anotado sea un DNI argentino: 7 u 8 dígitos, en el rango
 * [1.000.000, 99.999.999]. Ver {@link DniValidator} para la implementación.
 */
@Target(ElementType.FIELD)
@Retention(RetentionPolicy.RUNTIME)
@Constraint(validatedBy = DniValidator.class)
@Documented
public @interface ValidarDni {

    String message() default "DNI inválido";

    Class<?>[] groups() default {};

    Class<? extends Payload>[] payload() default {};
}
