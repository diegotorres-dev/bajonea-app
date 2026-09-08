package com.bajonea.backend.validation.validators;

import com.bajonea.backend.validation.annotations.ValidarFormatoDni;
import jakarta.validation.ConstraintValidator;
import jakarta.validation.ConstraintValidatorContext;

public class FormatoDniValidator implements ConstraintValidator<ValidarFormatoDni, String> {

    @Override
    public boolean isValid(String dni, ConstraintValidatorContext context) {
        if (dni == null || dni.isBlank()) {
            return true;
        }
        return dni.matches("\\d{7,8}");
    }
}
