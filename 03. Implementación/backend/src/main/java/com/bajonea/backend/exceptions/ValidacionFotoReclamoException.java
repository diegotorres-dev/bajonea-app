package com.bajonea.backend.exceptions;

import java.util.Map;

/**
 * Foto de un reclamo que no se puede aceptar (cantidad, tamaño, formato). Mapea a {@code 400} con un código estable en
 * {@code data.codigo}, para que el cliente distinga el motivo sin leer el texto.
 */
public class ValidacionFotoReclamoException extends ValidacionException {

    public static final String CANTIDAD_EXCEDIDA = "RECLAMO_FOTO_CANTIDAD_EXCEDIDA";
    public static final String TAMANO_EXCEDIDO = "RECLAMO_FOTO_TAMANO_EXCEDIDO";
    public static final String FORMATO_NO_PERMITIDO = "RECLAMO_FOTO_FORMATO_NO_PERMITIDO";

    private final String codigo;

    public ValidacionFotoReclamoException(String codigo, String mensaje) {
        super(mensaje);
        this.codigo = codigo;
    }

    public String getCodigo() {
        return codigo;
    }

    public Map<String, Object> getData() {
        return Map.of("codigo", codigo);
    }
}
