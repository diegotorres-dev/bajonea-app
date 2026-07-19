package com.bajonea.backend.validation.validators;

import com.bajonea.backend.validation.annotations.ValidarUrlCloudinary;
import jakarta.validation.ConstraintValidator;
import jakarta.validation.ConstraintValidatorContext;

import java.net.URI;
import java.net.URISyntaxException;

/**
 * Valida que la URL anotada use esquema {@code https} y tenga como host exactamente
 * {@code res.cloudinary.com}, el dominio de entrega de Cloudinary. Cualquier otra URL
 * (incluido cualquier intento de suplantar el dominio con un subdominio o path engañoso)
 * se rechaza.
 */
public class UrlCloudinaryValidator implements ConstraintValidator<ValidarUrlCloudinary, String> {

    private static final String HOST_ESPERADO = "res.cloudinary.com";

    @Override
    public boolean isValid(String url, ConstraintValidatorContext context) {
        if (url == null) {
            return true;
        }
        try {
            URI uri = new URI(url);
            return "https".equalsIgnoreCase(uri.getScheme()) && HOST_ESPERADO.equals(uri.getHost());
        } catch (URISyntaxException e) {
            return false;
        }
    }
}
