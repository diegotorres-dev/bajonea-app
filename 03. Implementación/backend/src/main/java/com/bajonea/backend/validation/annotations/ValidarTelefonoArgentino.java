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
 * Valida que el campo anotado sea un teléfono argentino en el formato usado por todos los
 * formularios del proyecto: prefijo fijo {@code +549} (no editable en el HTML) + exactamente
 * 10 dígitos locales. Ver {@link TelefonoArgentinoValidator} para el detalle exacto de la
 * normalización aplicada.
 */
@Target(ElementType.FIELD)
@Retention(RetentionPolicy.RUNTIME)
@Constraint(validatedBy = TelefonoArgentinoValidator.class)
@Documented
public @interface ValidarTelefonoArgentino {

    String message() default "Ingresá un número de teléfono válido (cod. área + número)";

    Class<?>[] groups() default {};

    Class<? extends Payload>[] payload() default {};
}
