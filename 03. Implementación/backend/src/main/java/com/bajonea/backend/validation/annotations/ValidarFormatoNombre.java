package com.bajonea.backend.validation.annotations;

import com.bajonea.backend.validation.validators.FormatoNombreValidator;
import jakarta.validation.Constraint;
import jakarta.validation.Payload;

import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * Valida el formato de un nombre/apellido (letras del alfabeto español, espacios, guiones y
 * apóstrofes) sin pronunciarse sobre la obligatoriedad — a diferencia de
 * {@link ValidarNombrePropio}, es tolerante a blanco/vacío además de a {@code null}, para
 * que el mensaje de "obligatorio" (`@NotBlank`) y el de "formato inválido" nunca compitan
 * por el mismo valor vacío. Ver {@link FormatoNombreValidator} para la implementación.
 */
@Target(ElementType.FIELD)
@Retention(RetentionPolicy.RUNTIME)
@Constraint(validatedBy = FormatoNombreValidator.class)
@Documented
public @interface ValidarFormatoNombre {

    String message() default "El nombre solo puede contener letras";

    Class<?>[] groups() default {};

    Class<? extends Payload>[] payload() default {};
}
