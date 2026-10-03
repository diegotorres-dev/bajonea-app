package com.bajonea.backend.util;

import java.text.Normalizer;
import java.util.Locale;
import java.util.regex.Pattern;

/**
 * Normalización de texto compartida por los Services que persisten nombre/apellido,
 * razón social, nombre de comercio/producto y calle de dirección (Fase 2 del lote de
 * ajustes post-migración, ver docs/DECISIONES.md). Misma lógica que {@code aTitleCase}
 * de {@code frontend/js/validators.js}, portada a Java para que backend y frontend
 * capitalicen exactamente igual.
 */
public final class TextoUtils {

    private static final Locale LOCALE_NORMALIZACION = Locale.forLanguageTag("es-AR");
    private static final Pattern FORMATO_CPA = Pattern.compile("^[A-Za-z]\\d{4}[A-Za-z]{3}$");
    private static final Pattern ESQUEMA_HTTP = Pattern.compile("(?i)^https?://.*");
    private static final Pattern MARCAS_DIACRITICAS = Pattern.compile("\\p{M}+");
    private static final Pattern ESPACIOS_CONSECUTIVOS = Pattern.compile("\\s+");

    private TextoUtils() {
    }

    public static String normalizarUrlConEsquema(String url) {
        if (url == null) {
            return null;
        }
        String recortado = url.trim();
        if (recortado.isEmpty() || ESQUEMA_HTTP.matcher(recortado).matches()) {
            return recortado;
        }
        return "https://" + recortado;
    }

    public static String normalizarCodigoPostal(String codigoPostal) {
        if (codigoPostal == null) {
            return null;
        }
        String recortado = codigoPostal.trim();
        return FORMATO_CPA.matcher(recortado).matches() ? recortado.toUpperCase(LOCALE_NORMALIZACION) : recortado;
    }

    public static String aTitleCase(String texto) {
        if (texto == null) {
            return null;
        }
        String minusculas = texto.toLowerCase(LOCALE_NORMALIZACION);
        StringBuilder resultado = new StringBuilder(minusculas.length());
        boolean inicioDePalabra = true;
        for (int i = 0; i < minusculas.length(); i++) {
            char actual = minusculas.charAt(i);
            if (inicioDePalabra && Character.isLetter(actual)) {
                resultado.append(Character.toUpperCase(actual));
                inicioDePalabra = false;
            } else {
                resultado.append(actual);
                inicioDePalabra = esDelimitadorDePalabra(actual);
            }
        }
        return resultado.toString();
    }

    /**
     * Forma canónica para comparar textos ingresados por personas: descompone (NFD), quita las
     * marcas diacríticas (tildes, diéresis, la tilde de la ñ), pasa a minúsculas, recorta y colapsa
     * los espacios consecutivos. {@code null} equivale a cadena vacía, así que {@code null} y
     * {@code ""} comparan igual. Usado por el chequeo de comercio duplicado del alta adicional; no
     * es para persistir ni para mostrar.
     */
    public static String normalizarParaComparar(String texto) {
        if (texto == null) {
            return "";
        }
        String sinMarcas = MARCAS_DIACRITICAS.matcher(Normalizer.normalize(texto, Normalizer.Form.NFD)).replaceAll("");
        return ESPACIOS_CONSECUTIVOS.matcher(sinMarcas.toLowerCase(LOCALE_NORMALIZACION).trim()).replaceAll(" ");
    }

    private static boolean esDelimitadorDePalabra(char caracter) {
        return Character.isWhitespace(caracter) || caracter == '-' || caracter == '\'' || caracter == '/';
    }
}
