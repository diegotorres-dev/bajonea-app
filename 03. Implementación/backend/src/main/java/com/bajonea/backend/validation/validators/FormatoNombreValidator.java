package com.bajonea.backend.validation.validators;

import com.bajonea.backend.validation.annotations.ValidarFormatoNombre;
import jakarta.validation.ConstraintValidator;
import jakarta.validation.ConstraintValidatorContext;

import java.util.regex.Pattern;

public class FormatoNombreValidator implements ConstraintValidator<ValidarFormatoNombre, String> {

    private static final Pattern PATRON = Pattern.compile("^[A-Za-zÁÉÍÓÚáéíóúÑñÜü]+(?:[-' ][A-Za-zÁÉÍÓÚáéíóúÑñÜü]+)*$");

    @Override
    public boolean isValid(String valor, ConstraintValidatorContext context) {
        if (valor == null || valor.isBlank()) {
            return true;
        }
        return PATRON.matcher(valor).matches();
    }
}
