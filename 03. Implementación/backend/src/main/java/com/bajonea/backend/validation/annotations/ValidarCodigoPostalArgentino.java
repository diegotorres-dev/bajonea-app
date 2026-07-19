package com.bajonea.backend.validation.annotations;

import com.bajonea.backend.validation.validators.CodigoPostalArgentinoValidator;
import jakarta.validation.Constraint;
import jakarta.validation.Payload;

import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * Valida que el campo anotado sea un código postal argentino válido: el formato clásico de
 * 4 dígitos, o el CPA alfanumérico de 8 caracteres (ej. {@code "C1425DJP"}). Ver
 * {@link CodigoPostalArgentinoValidator} para la implementación.
 */
@Target(ElementType.FIELD)
@Retention(RetentionPolicy.RUNTIME)
@Constraint(validatedBy = CodigoPostalArgentinoValidator.class)
@Documented
public @interface ValidarCodigoPostalArgentino {

    String message() default "Código postal inválido";

    Class<?>[] groups() default {};

    Class<? extends Payload>[] payload() default {};
}
