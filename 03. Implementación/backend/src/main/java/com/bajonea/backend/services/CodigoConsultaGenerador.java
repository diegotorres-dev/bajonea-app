package com.bajonea.backend.services;

import java.security.SecureRandom;
import org.springframework.stereotype.Component;

/**
 * Código de una consulta de Soporte: 8 caracteres de un alfabeto de 31 sin los que se confunden al leerlos ni al
 * tipearlos (0, O, 1, I y L), con aleatoriedad criptográfica. Vive aparte para poder reemplazar la fuente de azar en las
 * pruebas (la colisión se resuelve en {@code SoporteService} reintentando con otro código).
 */
@Component
public class CodigoConsultaGenerador {

    public static final String ALFABETO = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
    public static final int LONGITUD = 8;

    private final SecureRandom secureRandom = new SecureRandom();

    public String generar() {
        StringBuilder codigo = new StringBuilder(LONGITUD);
        for (int i = 0; i < LONGITUD; i++) {
            codigo.append(ALFABETO.charAt(secureRandom.nextInt(ALFABETO.length())));
        }
        return codigo.toString();
    }

    /** Deja un código tipeado por la persona en su forma canónica: sin espacios ni guiones y en mayúsculas. */
    public static String normalizar(String ingresado) {
        if (ingresado == null) {
            return "";
        }
        return ingresado.replaceAll("[\\s\\-]", "").toUpperCase(java.util.Locale.ROOT);
    }
}
