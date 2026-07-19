package com.bajonea.backend.validation.annotations;

import com.bajonea.backend.validation.validators.DireccionExclusionMutuaValidator;
import jakarta.validation.Constraint;
import jakarta.validation.Payload;

import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * Validación a nivel de clase para un DTO de Direccion: exactamente uno de los campos
 * {@code clienteId} / {@code comercioId} debe estar presente (no nulo), nunca ambos ni
 * ninguno. Sube a nivel de anotación declarativa la regla de exclusión mutua documentada
 * en {@code docs/modelo-mvp.md}, tabla {@code direccion}. Ver
 * {@link DireccionExclusionMutuaValidator} para la implementación.
 */
@Target(ElementType.TYPE)
@Retention(RetentionPolicy.RUNTIME)
@Constraint(validatedBy = DireccionExclusionMutuaValidator.class)
@Documented
public @interface DireccionExclusionMutua {

    String message() default "La dirección debe pertenecer a exactamente un cliente o un comercio, nunca a ambos ni a ninguno";

    Class<?>[] groups() default {};

    Class<? extends Payload>[] payload() default {};
}
