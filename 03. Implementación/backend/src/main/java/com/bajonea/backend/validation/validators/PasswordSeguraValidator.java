package com.bajonea.backend.validation.validators;

import com.bajonea.backend.validation.annotations.ValidarPasswordSegura;
import jakarta.validation.ConstraintValidator;
import jakarta.validation.ConstraintValidatorContext;

import java.util.regex.Pattern;

/**
 * Valida la política de password del MVP: 8 a 72 caracteres (72 es el límite real de
 * bcrypt), al menos 1 mayúscula, al menos 1 minúscula y al menos 1 número. No exige símbolo
 * especial (decisión explícita para no ser excesivo en esta etapa). Alineado con
 * {@code requisitos-funcionales-generales.md}, que ya pedía minúscula — no exigida hasta
 * ahora por un gap real detectado y corregido.
 */
public class PasswordSeguraValidator implements ConstraintValidator<ValidarPasswordSegura, String> {

    private static final Pattern PATRON = Pattern.compile("^(?=.*[A-Z])(?=.*[a-z])(?=.*\\d).{8,72}$");

    @Override
    public boolean isValid(String password, ConstraintValidatorContext context) {
        if (password == null || password.isBlank()) {
            return true;
        }
        return PATRON.matcher(password).matches();
    }
}
