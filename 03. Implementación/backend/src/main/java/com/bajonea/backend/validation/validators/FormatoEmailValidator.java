package com.bajonea.backend.validation.validators;

import com.bajonea.backend.validation.annotations.ValidarFormatoEmail;
import jakarta.validation.ConstraintValidator;
import jakarta.validation.ConstraintValidatorContext;

import java.util.regex.Pattern;

public class FormatoEmailValidator implements ConstraintValidator<ValidarFormatoEmail, String> {

    private static final Pattern PATRON = Pattern.compile("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$");

    @Override
    public boolean isValid(String email, ConstraintValidatorContext context) {
        if (email == null || email.isBlank()) {
            return true;
        }
        return PATRON.matcher(email).matches();
    }
}
