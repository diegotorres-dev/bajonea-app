package com.bajonea.backend.validation.validators;

import com.bajonea.backend.validation.annotations.ValidarCodigoPostalArgentino;
import jakarta.validation.ConstraintValidator;
import jakarta.validation.ConstraintValidatorContext;

import java.util.regex.Pattern;

/**
 * Valida un código postal argentino en cualquiera de sus dos formatos vigentes: el clásico
 * de 4 dígitos (ej. {@code "9420"}) o el CPA alfanumérico de 8 caracteres, 1 letra + 4
 * dígitos + 3 letras (ej. {@code "C1425DJP"}). No distingue mayúsculas/minúsculas.
 */
public class CodigoPostalArgentinoValidator
        implements ConstraintValidator<ValidarCodigoPostalArgentino, String> {

    private static final Pattern FORMATO_CLASICO = Pattern.compile("^\\d{4}$");
    private static final Pattern FORMATO_CPA = Pattern.compile("^[A-Za-z]\\d{4}[A-Za-z]{3}$");

    @Override
    public boolean isValid(String codigoPostal, ConstraintValidatorContext context) {
        if (codigoPostal == null) {
            return true;
        }
        return FORMATO_CLASICO.matcher(codigoPostal).matches()
                || FORMATO_CPA.matcher(codigoPostal).matches();
    }
}
