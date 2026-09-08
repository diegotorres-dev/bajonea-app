package com.bajonea.backend.validation.annotations;

import com.bajonea.backend.validation.validators.PasswordSeguraValidator;
import jakarta.validation.Constraint;
import jakarta.validation.Payload;

import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * Valida que el campo anotado cumpla la política de password del MVP: 8 a 72 caracteres, al
 * menos 1 mayúscula, al menos 1 minúscula y al menos 1 número. No exige símbolo especial.
 * Ver {@link PasswordSeguraValidator} para la implementación.
 */
@Target(ElementType.FIELD)
@Retention(RetentionPolicy.RUNTIME)
@Constraint(validatedBy = PasswordSeguraValidator.class)
@Documented
public @interface ValidarPasswordSegura {

    String message() default "Debe tener mínimo 8 caracteres, una mayúscula, una minúscula y un número";

    Class<?>[] groups() default {};

    Class<? extends Payload>[] payload() default {};
}
