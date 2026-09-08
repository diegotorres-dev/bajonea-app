package com.bajonea.backend.util;

import com.bajonea.backend.exceptions.ValidacionException;

/**
 * Reglas de negocio de Comercio compartidas por más de un Service (alta y edición de
 * perfil) — no expresables como anotación de Bean Validation sobre un DTO porque dependen
 * de la combinación de dos campos. Extraída de {@code RegistroService} para que
 * {@code ComercioService.editarPerfil} reuse la misma regla en vez de duplicarla
 * (ver docs/DECISIONES.md).
 */
public final class ComercioValidaciones {

    private ComercioValidaciones() {
    }

    public static void validarModalidadesEntrega(boolean aceptaDelivery, boolean aceptaRetiro) {
        if (!aceptaDelivery && !aceptaRetiro) {
            throw new ValidacionException("El comercio debe ofrecer al menos una modalidad de entrega (delivery o retiro)");
        }
    }
}
