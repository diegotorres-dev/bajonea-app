package com.bajonea.backend.validation.annotations;

import com.bajonea.backend.validation.validators.CuitValidator;
import jakarta.validation.Constraint;
import jakarta.validation.Payload;

import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * Valida que el campo anotado sea un CUIT de 11 dígitos con dígito verificador correcto
 * según el algoritmo módulo 11 de AFIP. Ver {@link CuitValidator} para la implementación.
 */
@Target(ElementType.FIELD)
@Retention(RetentionPolicy.RUNTIME)
@Constraint(validatedBy = CuitValidator.class)
@Documented
public @interface ValidarCuit {

    String message() default "CUIT inválido";

    Class<?>[] groups() default {};

    Class<? extends Payload>[] payload() default {};
}
