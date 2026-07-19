package com.bajonea.backend.validation.validators;

import com.bajonea.backend.validation.annotations.ValidarPasswordSegura;
import jakarta.validation.ConstraintValidator;
import jakarta.validation.ConstraintValidatorContext;

import java.util.regex.Pattern;

/**
 * Valida la política de password del MVP: mínimo 8 caracteres, al menos 1 mayúscula y al
 * menos 1 número. No exige símbolo especial (decisión explícita para no ser excesivo en
 * esta etapa).
 */
public class PasswordSeguraValidator implements ConstraintValidator<ValidarPasswordSegura, String> {

    private static final Pattern PATRON = Pattern.compile("^(?=.*[A-Z])(?=.*[0-9]).{8,}$");

    @Override
    public boolean isValid(String password, ConstraintValidatorContext context) {
        if (password == null) {
            return true;
        }
        return PATRON.matcher(password).matches();
    }
}
