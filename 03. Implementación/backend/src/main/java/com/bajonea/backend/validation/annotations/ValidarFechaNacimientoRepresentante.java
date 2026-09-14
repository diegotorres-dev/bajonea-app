package com.bajonea.backend.validation.annotations;

import com.bajonea.backend.validation.validators.FechaNacimientoRepresentanteValidator;
import jakarta.validation.Constraint;
import jakarta.validation.Payload;

import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * Combina, para el representante legal de un Comercio, el piso de edad mínima de
 * {@link MayorDeEdad} (18 años) con el techo de plausibilidad de
 * {@link ValidarFechaNacimientoPlausible} (120 años) — no reemplaza a ninguna de esas dos
 * anotaciones genéricas del catálogo, es específica de este campo porque es el único que
 * necesita ambos chequeos a la vez (agregada 2026-09-14 tras detectar que
 * {@code fechaNacimientoRepresentante} aceptaba fechas como 01/01/1901 al no tener techo).
 * Apilar {@link MayorDeEdad} + {@link ValidarFechaNacimientoPlausible} en el mismo campo se
 * descartó a propósito: ambas fallan a la vez ante una fecha futura, y Bean Validation no
 * garantiza qué mensaje de las dos gana (ver `.claude/skills/skill-validaciones/SKILL.md`).
 * Ver {@link FechaNacimientoRepresentanteValidator} para la implementación y el mensaje
 * específico de cada caso (fecha futura / menor de 18 / anterior a 120 años).
 */
@Target(ElementType.FIELD)
@Retention(RetentionPolicy.RUNTIME)
@Constraint(validatedBy = FechaNacimientoRepresentanteValidator.class)
@Documented
public @interface ValidarFechaNacimientoRepresentante {

    String message() default "La fecha ingresada no es válida";

    Class<?>[] groups() default {};

    Class<? extends Payload>[] payload() default {};
}
