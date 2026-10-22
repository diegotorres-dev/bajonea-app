package com.bajonea.backend.exceptions;

import java.util.LinkedHashMap;
import java.util.Map;

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
 * <li>{@link #PEDIDO_PROPIO}: un Empleado intenta gestionar (o ver la trazabilidad de) un pedido del que él mismo
 * es el Cliente.</li>
 * <li>{@link #RETIRO_EN_ESPERA}: se intenta cerrar como no retirado un pedido que todavía no cumplió la espera
 * mínima; {@code data} suma {@code minutosRestantes} y {@code disponibleDesde}.</li>
 * <li>{@link #EMPLEADO_NO_REACTIVABLE}: el Dueño intenta reactivar directamente a un miembro inactivo que no dio
 * de baja él (renunció, o no hay registro de la baja); para que vuelva hace falta una invitación nueva.</li>
 * <li>{@link #INVITACION_PENDIENTE}: el Dueño intenta reactivar directamente a un miembro inactivo que tiene una
 * invitación pendiente y vigente en ese comercio.</li>
 * <li>{@link #PRECIO_BLOQUEADO_EN_FRANJA}: el Dueño o el Empleado intenta cambiar el precio de un producto mientras el
 * comercio está dentro de una franja horaria.</li>
 * <li>{@link #PRECIO_CAMBIO}: el Cliente confirma un pedido con un total esperado distinto del que se cobraría;
 * {@code data} suma {@code subtotal}, {@code cargoServicioCliente}, {@code total} e {@code items}.</li>
 * </ul>
 */
public class ConflictoComercioException extends ConflictoDeNegocioException {

    public static final String PEDIDO_PROPIO = "PEDIDO_PROPIO";
    public static final String MENSAJE_PEDIDO_PROPIO = "No podés gestionar tus propios pedidos";

    public static final String SUSPENDIDO = "COMERCIO_SUSPENDIDO";
    public static final String SIN_OPERACION = "COMERCIO_SIN_OPERACION";
    public static final String NO_OPERATIVO = "COMERCIO_NO_OPERATIVO";
    public static final String FUERA_DE_HORARIO = "FUERA_DE_HORARIO";
    public static final String RETIRO_EN_ESPERA = "RETIRO_EN_ESPERA";
    public static final String EMPLEADO_NO_REACTIVABLE = "EMPLEADO_NO_REACTIVABLE";
    public static final String INVITACION_PENDIENTE = "INVITACION_PENDIENTE";
    public static final String PRECIO_BLOQUEADO_EN_FRANJA = "PRECIO_BLOQUEADO_EN_FRANJA";
    public static final String MENSAJE_PRECIO_BLOQUEADO_EN_FRANJA =
            "No podés cambiar precios mientras tu comercio está en horario de atención. Hacelo fuera de ese horario.";
    public static final String PRECIO_CAMBIO = "PRECIO_CAMBIO";
    public static final String MENSAJE_PRECIO_CAMBIO = "Los montos de tu pedido cambiaron. Revisá el nuevo total antes de pagar.";

    private final String codigo;
    private final Map<String, Object> datosAdicionales;

    public ConflictoComercioException(String codigo, String mensaje) {
        this(codigo, mensaje, Map.of());
    }

    public ConflictoComercioException(String codigo, String mensaje, Map<String, Object> datosAdicionales) {
        super(mensaje);
        this.codigo = codigo;
        this.datosAdicionales = datosAdicionales;
    }

    public Map<String, Object> getData() {
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("codigo", codigo);
        data.putAll(datosAdicionales);
        return data;
    }

    public String getCodigo() {
        return codigo;
    }
}
