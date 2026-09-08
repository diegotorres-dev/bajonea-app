package com.bajonea.backend.validation.annotations;

import com.bajonea.backend.validation.validators.FormatoDniValidator;
import jakarta.validation.Constraint;
import jakarta.validation.Payload;

import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * Valida el formato de un DNI ya sanitizado (7 u 8 dígitos, sin separadores) sin
 * pronunciarse sobre la obligatoriedad — a diferencia de {@link ValidarDni}, es tolerante a
 * blanco/vacío además de a {@code null} y no aplica el chequeo de rango numérico
 * [1.000.000, 99.999.999]. Ver {@link FormatoDniValidator} para la implementación.
 */
@Target(ElementType.FIELD)
@Retention(RetentionPolicy.RUNTIME)
@Constraint(validatedBy = FormatoDniValidator.class)
@Documented
public @interface ValidarFormatoDni {

    String message() default "El DNI debe tener un formato válido";

    Class<?>[] groups() default {};

    Class<? extends Payload>[] payload() default {};
}
