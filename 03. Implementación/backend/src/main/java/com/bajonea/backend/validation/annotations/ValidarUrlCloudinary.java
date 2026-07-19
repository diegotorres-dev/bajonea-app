package com.bajonea.backend.validation.annotations;

import com.bajonea.backend.validation.validators.UrlCloudinaryValidator;
import jakarta.validation.Constraint;
import jakarta.validation.Payload;

import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * Valida que el campo anotado sea una URL servida desde el dominio de entrega de
 * Cloudinary ({@code https://res.cloudinary.com/...}), para evitar que se persista una URL
 * arbitraria en campos como {@code foto_perfil_url} o {@code imagen_producto.url}. Ver
 * {@link UrlCloudinaryValidator} para la implementación.
 */
@Target(ElementType.FIELD)
@Retention(RetentionPolicy.RUNTIME)
@Constraint(validatedBy = UrlCloudinaryValidator.class)
@Documented
public @interface ValidarUrlCloudinary {

    String message() default "La URL debe pertenecer al dominio de Cloudinary";

    Class<?>[] groups() default {};

    Class<? extends Payload>[] payload() default {};
}
