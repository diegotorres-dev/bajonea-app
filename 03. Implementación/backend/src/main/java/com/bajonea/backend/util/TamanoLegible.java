package com.bajonea.backend.util;

import java.util.Locale;

public final class TamanoLegible {

    private static final Locale ES_AR = Locale.forLanguageTag("es-AR");
    private static final double MB = 1024.0 * 1024.0;

    private TamanoLegible() {
    }

    /** "11,4 MB" para tamaños de un megabyte o más, "350 KB" para los menores; el máximo entero va sin decimales. */
    public static String formatear(long bytes) {
        if (bytes >= (long) MB) {
            double mb = bytes / MB;
            if (mb == Math.rint(mb)) {
                return String.format(ES_AR, "%d MB", (long) mb);
            }
            return String.format(ES_AR, "%.1f MB", mb);
        }
        return String.format(ES_AR, "%d KB", Math.max(1, Math.round(bytes / 1024.0)));
    }
}
