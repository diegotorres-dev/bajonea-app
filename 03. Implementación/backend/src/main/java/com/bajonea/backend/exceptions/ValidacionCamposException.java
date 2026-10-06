package com.bajonea.backend.exceptions;

import java.util.Map;

/**
 * Error de validación de entrada que depende del estado de la base y se detecta en el servicio (por ejemplo,
 * "cuenta nueva requiere datos de cuenta"): mapea a {@code 400} con el mismo cuerpo que una falla de Bean
 * Validation, un mapa {@code {campo: mensaje}} en {@code data} para que el frontend lo muestre bajo cada input.
 */
public class ValidacionCamposException extends RuntimeException {

    private final transient Map<String, String> errores;

    public ValidacionCamposException(Map<String, String> errores) {
        super(descripcion(errores));
        this.errores = errores;
    }

    public Map<String, String> getErrores() {
        return errores;
    }

    static String descripcion(Map<String, String> errores) {
        StringBuilder sb = new StringBuilder();
        errores.forEach((campo, mensaje) -> {
            if (sb.length() > 0) {
                sb.append("; ");
            }
            sb.append(campo).append(": ").append(mensaje);
        });
        return sb.toString();
    }
}
