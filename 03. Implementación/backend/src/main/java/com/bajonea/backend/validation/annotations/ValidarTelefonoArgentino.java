package com.bajonea.backend.validation.annotations;

import com.bajonea.backend.validation.validators.TelefonoArgentinoValidator;
import jakarta.validation.Constraint;
import jakarta.validation.Payload;

import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * Valida que el campo anotado sea un teléfono argentino en alguno de los formatos reales
 * tolerados (con/sin +54, con/sin 9, con/sin 0 de larga distancia, con/sin 15). Ver
 * {@link TelefonoArgentinoValidator} para el detalle exacto de la normalización aplicada.
 */
@Target(ElementType.FIELD)
@Retention(RetentionPolicy.RUNTIME)
@Constraint(validatedBy = TelefonoArgentinoValidator.class)
@Documented
public @interface ValidarTelefonoArgentino {

    String message() default "Teléfono inválido";

    Class<?>[] groups() default {};

    Class<? extends Payload>[] payload() default {};
}
