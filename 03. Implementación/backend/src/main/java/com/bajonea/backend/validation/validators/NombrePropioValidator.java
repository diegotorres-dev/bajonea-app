package com.bajonea.backend.validation.validators;

import com.bajonea.backend.validation.annotations.ValidarNombrePropio;
import jakarta.validation.ConstraintValidator;
import jakarta.validation.ConstraintValidatorContext;

import java.util.regex.Pattern;

/**
 * Valida que el valor sea un nombre propio válido: solo letras Unicode (incluye acentos y
 * ñ), espacios y guiones, debe empezar con una letra, y no puede ser una cadena vacía o
 * compuesta únicamente por espacios.
 */
public class NombrePropioValidator implements ConstraintValidator<ValidarNombrePropio, String> {

    private static final Pattern PATRON = Pattern.compile("^\\p{L}[\\p{L} '-]*$");

    @Override
    public boolean isValid(String valor, ConstraintValidatorContext context) {
        if (valor == null) {
            return true;
        }
        if (valor.trim().isEmpty()) {
            return false;
        }
        return PATRON.matcher(valor).matches();
    }
}
