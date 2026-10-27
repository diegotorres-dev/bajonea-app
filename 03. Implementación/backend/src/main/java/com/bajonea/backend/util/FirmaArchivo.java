package com.bajonea.backend.util;

import java.util.Optional;

/**
 * Tipo real de un archivo por su firma de bytes. No mira la extensión ni el {@code Content-Type} que declara el
 * cliente: un ejecutable renombrado a {@code .pdf} no pasa. Es una defensa de formato, no un antivirus.
 */
public final class FirmaArchivo {

    public static final String PDF = "application/pdf";
    public static final String JPEG = "image/jpeg";
    public static final String PNG = "image/png";
    public static final String WEBP = "image/webp";

    private static final byte[] FIRMA_PDF = {'%', 'P', 'D', 'F', '-'};
    private static final byte[] FIRMA_JPEG = {(byte) 0xFF, (byte) 0xD8, (byte) 0xFF};
    private static final byte[] FIRMA_PNG = {(byte) 0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A};

    private FirmaArchivo() {
    }

    public static Optional<String> detectar(byte[] contenido) {
        if (contenido == null) {
            return Optional.empty();
        }
        if (empiezaCon(contenido, FIRMA_PDF)) {
            return Optional.of(PDF);
        }
        if (empiezaCon(contenido, FIRMA_JPEG)) {
            return Optional.of(JPEG);
        }
        if (empiezaCon(contenido, FIRMA_PNG)) {
            return Optional.of(PNG);
        }
        if (contenido.length >= 12 && coincide(contenido, 0, new byte[] {'R', 'I', 'F', 'F'})
                && coincide(contenido, 8, new byte[] {'W', 'E', 'B', 'P'})) {
            return Optional.of(WEBP);
        }
        return Optional.empty();
    }

    private static boolean empiezaCon(byte[] contenido, byte[] firma) {
        return contenido.length >= firma.length && coincide(contenido, 0, firma);
    }

    private static boolean coincide(byte[] contenido, int desde, byte[] firma) {
        for (int i = 0; i < firma.length; i++) {
            if (contenido[desde + i] != firma[i]) {
                return false;
            }
        }
        return true;
    }
}
