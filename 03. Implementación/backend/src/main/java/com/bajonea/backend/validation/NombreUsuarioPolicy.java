package com.bajonea.backend.validation;

import java.util.Locale;
import java.util.Set;

/**
 * Único lugar donde viven las reglas del nombre de usuario: normalización (trim + minúsculas),
 * formato (8 a 20 caracteres, solo letras y números ASCII, al menos una letra) y lista de
 * nombres reservados. La comparación de reservados es exacta y en minúsculas.
 */
public final class NombreUsuarioPolicy {

    public static final int LARGO_MINIMO = 8;
    public static final int LARGO_MAXIMO = 20;
    public static final String MENSAJE_NO_DISPONIBLE = "Ese nombre de usuario ya está en uso";

    private static final Set<String> RESERVADOS = Set.of(
            "administrador", "administrator", "bajonea", "soporte", "support",
            "comercio", "cliente", "empleado", "duenio", "superadmin");

    private NombreUsuarioPolicy() {
    }

    public static String normalizar(String valor) {
        return valor == null ? null : valor.trim().toLowerCase(Locale.ROOT);
    }

    public static boolean tieneSoloLetrasYNumeros(String valor) {
        for (int i = 0; i < valor.length(); i++) {
            char c = valor.charAt(i);
            boolean ok = (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9');
            if (!ok) {
                return false;
            }
        }
        return true;
    }

    public static boolean tieneAlMenosUnaLetra(String valor) {
        for (int i = 0; i < valor.length(); i++) {
            char c = valor.charAt(i);
            if ((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z')) {
                return true;
            }
        }
        return false;
    }

    public static String mensajeDeFormatoInvalido(String valor) {
        if (valor == null || valor.isBlank()) {
            return "El nombre de usuario es obligatorio";
        }
        if (!tieneSoloLetrasYNumeros(valor)) {
            return "Solo se permiten letras y números";
        }
        if (!tieneAlMenosUnaLetra(valor)) {
            return "El nombre de usuario debe contener al menos una letra.";
        }
        if (valor.length() < LARGO_MINIMO) {
            return "El nombre de usuario debe tener al menos 8 caracteres";
        }
        if (valor.length() > LARGO_MAXIMO) {
            return "El nombre de usuario no puede superar los 20 caracteres";
        }
        return null;
    }

    public static boolean tieneFormatoValido(String valor) {
        return valor != null
                && valor.length() >= LARGO_MINIMO
                && valor.length() <= LARGO_MAXIMO
                && tieneSoloLetrasYNumeros(valor)
                && tieneAlMenosUnaLetra(valor);
    }

    public static boolean esReservado(String valorNormalizado) {
        return valorNormalizado != null && RESERVADOS.contains(valorNormalizado);
    }
}
