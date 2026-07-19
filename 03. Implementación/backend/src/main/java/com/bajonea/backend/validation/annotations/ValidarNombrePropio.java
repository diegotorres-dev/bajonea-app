package com.bajonea.backend.validation.annotations;

import com.bajonea.backend.validation.validators.NombrePropioValidator;
import jakarta.validation.Constraint;
import jakarta.validation.Payload;

import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * Valida que el campo anotado (nombre o apellido) contenga solo letras (incluye acentos y
 * ñ), espacios y guiones, sin números ni caracteres especiales, y que no esté vacío ni sea
 * solo espacios. Ver {@link NombrePropioValidator} para la implementación.
 */
@Target(ElementType.FIELD)
@Retention(RetentionPolicy.RUNTIME)
@Constraint(validatedBy = NombrePropioValidator.class)
@Documented
public @interface ValidarNombrePropio {

    String message() default "Debe contener solo letras, espacios y guiones";

    Class<?>[] groups() default {};

    Class<? extends Payload>[] payload() default {};
}
