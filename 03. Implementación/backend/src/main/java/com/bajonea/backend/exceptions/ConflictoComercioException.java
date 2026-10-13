package com.bajonea.backend.exceptions;

/**
 * Conflicto de negocio del módulo del Comercio que además lleva un código estable en {@code data.codigo}, para que
 * el cliente distinga el motivo sin leer el texto. Mapea a {@code 409} (ver GlobalExceptionHandler), igual que su
 * superclase.
 * <ul>
 * <li>{@link #SUSPENDIDO}: un Empleado intenta modificar productos, imágenes o datos operativos de un comercio
 * suspendido.</li>
 * <li>{@link #SIN_OPERACION}: un Empleado intenta aceptar un pedido nuevo con el comercio {@code SUSPENDIDO} o
 * {@code CERRADO_TEMPORALMENTE}.</li>
 * <li>{@link #NO_OPERATIVO}: cerrar o abrir un comercio que no está operativo (cualquier actor).</li>
 * <li>{@link #FUERA_DE_HORARIO}: cerrar o abrir fuera de una franja horaria (cualquier actor).</li>
 * </ul>
 */
public class ConflictoComercioException extends ConflictoDeNegocioException {

    public static final String SUSPENDIDO = "COMERCIO_SUSPENDIDO";
    public static final String SIN_OPERACION = "COMERCIO_SIN_OPERACION";
    public static final String NO_OPERATIVO = "COMERCIO_NO_OPERATIVO";
    public static final String FUERA_DE_HORARIO = "FUERA_DE_HORARIO";

    private final String codigo;

    public ConflictoComercioException(String codigo, String mensaje) {
        super(mensaje);
        this.codigo = codigo;
    }

    public String getCodigo() {
        return codigo;
    }
}
