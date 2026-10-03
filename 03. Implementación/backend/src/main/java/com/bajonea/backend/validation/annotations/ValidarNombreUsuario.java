package com.bajonea.backend.validation.annotations;

import com.bajonea.backend.validation.validators.NombreUsuarioValidator;
import jakarta.validation.Constraint;
import jakarta.validation.Payload;

import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * Valida el formato de un nombre de usuario (solo letras y números, entre 8 y 20 caracteres),
 * blanco-tolerante para no competir con {@code @NotBlank}. Informa mensajes distintos según el
 * defecto. No evalúa nombres reservados ni unicidad: eso lo resuelve el Service.
 */
@Target(ElementType.FIELD)
@Retention(RetentionPolicy.RUNTIME)
@Constraint(validatedBy = NombreUsuarioValidator.class)
@Documented
public @interface ValidarNombreUsuario {

    String message() default "Solo se permiten letras y números";

    Class<?>[] groups() default {};

    Class<? extends Payload>[] payload() default {};
}
