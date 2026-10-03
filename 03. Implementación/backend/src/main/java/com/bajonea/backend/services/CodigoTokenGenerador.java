package com.bajonea.backend.services;

import java.security.SecureRandom;
import org.springframework.stereotype.Component;

/**
 * Genera el valor de un token: código numérico de 6 dígitos, pensado para tipeo manual en las
 * pantallas de verificación, recuperación y reactivación. Vive aparte de {@link TokenService}
 * para poder reemplazar la fuente de azar en las pruebas.
 */
@Component
public class CodigoTokenGenerador {

    private static final int ESPACIO_DE_CODIGOS = 1_000_000;

    private final SecureRandom secureRandom = new SecureRandom();

    public String generar() {
        return String.format("%06d", secureRandom.nextInt(ESPACIO_DE_CODIGOS));
    }
}
