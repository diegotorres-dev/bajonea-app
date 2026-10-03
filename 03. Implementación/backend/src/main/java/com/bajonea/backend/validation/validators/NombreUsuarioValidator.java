package com.bajonea.backend.validation.validators;

import com.bajonea.backend.validation.NombreUsuarioPolicy;
import com.bajonea.backend.validation.annotations.ValidarNombreUsuario;
import jakarta.validation.ConstraintValidator;
import jakarta.validation.ConstraintValidatorContext;

public class NombreUsuarioValidator implements ConstraintValidator<ValidarNombreUsuario, String> {

    @Override
    public boolean isValid(String valor, ConstraintValidatorContext context) {
        if (valor == null || valor.isBlank()) {
            return true;
        }
        String mensaje = NombreUsuarioPolicy.mensajeDeFormatoInvalido(valor);
        if (mensaje != null) {
            return violacion(context, mensaje);
        }
        return true;
    }

    private boolean violacion(ConstraintValidatorContext context, String mensaje) {
        context.disableDefaultConstraintViolation();
        context.buildConstraintViolationWithTemplate(mensaje).addConstraintViolation();
        return false;
    }
}
