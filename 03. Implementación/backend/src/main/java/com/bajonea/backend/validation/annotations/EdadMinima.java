package com.bajonea.backend.validation.annotations;

import com.bajonea.backend.validation.validators.EdadMinimaValidator;
import jakarta.validation.Constraint;
import jakarta.validation.Payload;

import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * Valida que la fecha anotada (ej. fecha de nacimiento) corresponda a una persona con al menos {@code anios}
 * años cumplidos hoy, contando con la fecha del bean {@link java.time.Clock} del sistema. Cumplir los años
 * ese mismo día ya alcanza. Una fecha futura se rechaza con "La fecha ingresada no es válida", el mismo
 * texto de {@link ValidarFechaNacimientoPlausible}, para que el campo muestre un único mensaje. Ver
 * {@link EdadMinimaValidator}.
 */
@Target(ElementType.FIELD)
@Retention(RetentionPolicy.RUNTIME)
@Constraint(validatedBy = EdadMinimaValidator.class)
@Documented
public @interface EdadMinima {

    int anios();

    String message() default "Tenés que tener al menos {anios} años para registrarte";

    Class<?>[] groups() default {};

    Class<? extends Payload>[] payload() default {};
}
