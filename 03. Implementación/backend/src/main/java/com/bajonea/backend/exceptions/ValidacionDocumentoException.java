package com.bajonea.backend.exceptions;

import java.util.Map;

/**
 * Archivo de un documento del comercio que no se puede aceptar (tamaño, formato). Mapea a {@code 400} con un código
 * estable en {@code data.codigo}, para que el cliente distinga el motivo sin leer el texto.
 */
public class ValidacionDocumentoException extends ValidacionException {

    public static final String TAMANO_EXCEDIDO = "DOCUMENTO_TAMANO_EXCEDIDO";
    public static final String FORMATO_NO_PERMITIDO = "DOCUMENTO_FORMATO_NO_PERMITIDO";

    private final String codigo;
    private final transient Map<String, Object> datosAdicionales;

    public ValidacionDocumentoException(String codigo, String mensaje) {
        this(codigo, mensaje, Map.of());
    }

    public ValidacionDocumentoException(String codigo, String mensaje, Map<String, Object> datosAdicionales) {
        super(mensaje);
        this.codigo = codigo;
        this.datosAdicionales = datosAdicionales;
    }

    public String getCodigo() {
        return codigo;
    }

    public Map<String, Object> getData() {
        Map<String, Object> data = new java.util.LinkedHashMap<>();
        data.put("codigo", codigo);
        data.putAll(datosAdicionales);
        return data;
    }
}
