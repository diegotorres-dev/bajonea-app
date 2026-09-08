package com.bajonea.backend.validation.annotations;

import com.bajonea.backend.validation.validators.FormatoEmailValidator;
import jakarta.validation.Constraint;
import jakarta.validation.Payload;

import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * Valida el formato de un email (`algo@algo.algo`, sin espacios) sin pronunciarse sobre la
 * obligatoriedad — tolerante a blanco/vacío además de a {@code null}, para que el mensaje de
 * "obligatorio" (`@NotBlank`) y el de "formato inválido" nunca compitan por el mismo valor
 * vacío. Reemplaza a la combinación previa de {@code @Email} + {@code @Pattern} (redundante
 * entre sí y no blanco-tolerante en conjunto). Ver {@link FormatoEmailValidator}.
 */
@Target(ElementType.FIELD)
@Retention(RetentionPolicy.RUNTIME)
@Constraint(validatedBy = FormatoEmailValidator.class)
@Documented
public @interface ValidarFormatoEmail {

    String message() default "Ingresá un email válido";

    Class<?>[] groups() default {};

    Class<? extends Payload>[] payload() default {};
}
