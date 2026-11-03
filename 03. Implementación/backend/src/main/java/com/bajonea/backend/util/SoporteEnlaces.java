package com.bajonea.backend.util;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;

/**
 * Enlace "Ver mi consulta" de los emails de Soporte. El código y el email viajan en el fragmento ({@code #}) y no en la
 * query: el navegador nunca envía el fragmento al servidor, así que no queda en los registros de acceso, en un proxy ni en el
 * encabezado {@code Referer}. La pantalla los lee, limpia la URL con {@code history.replaceState} y recién ahí consulta.
 */
public final class SoporteEnlaces {

    public static final String PAGINA_CONSULTA = "soporte-consulta.html";

    private SoporteEnlaces() {
    }

    public static String enlaceConsulta(String frontendBaseUrl, String codigo, String email) {
        String base = frontendBaseUrl.endsWith("/") ? frontendBaseUrl.substring(0, frontendBaseUrl.length() - 1) : frontendBaseUrl;
        return base + "/" + PAGINA_CONSULTA + "#codigo=" + URLEncoder.encode(codigo, StandardCharsets.UTF_8)
                + "&email=" + URLEncoder.encode(email, StandardCharsets.UTF_8);
    }
}
