package com.bajonea.backend.services;

import com.bajonea.backend.enums.ActorPedido;
import com.bajonea.backend.enums.EstadoPedido;
import com.bajonea.backend.enums.MotivoTimeoutPedido;
import java.util.Arrays;
import java.util.List;

/**
 * Textos legibles de las transiciones de un pedido, compartidos por la actividad del comercio (que habla de "un
 * pedido") y por la trazabilidad de un pedido puntual (que habla de "el pedido"). Una sola fuente para los verbos,
 * los nombres de rol y el nombre de quien actuó.
 */
final class TextosPedidoActividad {

    static final String UN_PEDIDO = "un pedido";
    static final String EL_PEDIDO = "el pedido";

    /**
     * Estados que el comercio llegó a ver: todos menos {@code PENDIENTE_PAGO} (el comercio nunca ve un pedido antes
     * del pago). Junto con la exclusión de {@code TIMEOUT_PAGO} en la consulta, es la regla de visibilidad de la
     * actividad y de la trazabilidad.
     */
    static final List<EstadoPedido> ESTADOS_VISIBLES_PARA_EL_COMERCIO = Arrays.stream(EstadoPedido.values())
            .filter(estado -> estado != EstadoPedido.PENDIENTE_PAGO)
            .toList();

    private TextosPedidoActividad() {
    }

    static String nombreDe(String nombre, String apellido) {
        String completo = ((nombre == null ? "" : nombre) + " " + (apellido == null ? "" : apellido)).trim();
        return completo.isEmpty() ? "Usuario" : completo;
    }

    static String textoDeRol(String rol) {
        return switch (rol) {
            case "DUENO" -> "Dueño";
            case "EMPLEADO" -> "Empleado";
            case "CLIENTE" -> "Cliente";
            case "SISTEMA" -> "Sistema";
            default -> rol;
        };
    }

    static String textoDePedido(EstadoPedido estado, ActorPedido actor, MotivoTimeoutPedido motivoTimeout, String pedido) {
        return switch (actor) {
            case SISTEMA -> textoDePedidoDelSistema(estado, motivoTimeout, pedido);
            case CLIENTE -> switch (estado) {
                case CANCELADO -> "Canceló " + pedido;
                case ENTREGADO -> "Confirmó la recepción de " + pedido;
                default -> "Cambió el estado de " + pedido;
            };
            case DUENO, EMPLEADO -> switch (estado) {
                case EN_PREPARACION -> "Aceptó " + pedido;
                case RECHAZADO -> "Rechazó " + pedido;
                case EN_CAMINO -> "Despachó " + pedido;
                case LISTO_PARA_RETIRAR -> "Dejó " + pedido + " listo para retirar";
                case ENTREGADO -> "Marcó " + pedido + " como entregado";
                case NO_RETIRADO -> "Cerró " + pedido + " como no retirado";
                case ANULADO -> "Anuló " + pedido;
                default -> "Cambió el estado de " + pedido;
            };
        };
    }

    private static String textoDePedidoDelSistema(EstadoPedido estado, MotivoTimeoutPedido motivoTimeout, String pedido) {
        return switch (estado) {
            case PENDIENTE_CONFIRMACION_COMERCIO -> "Pedido recibido";
            case EXPIRADO -> "Venció " + pedido + " sin respuesta del comercio";
            case RECHAZADO -> "Rechazó automáticamente " + pedido + " por la suspensión del comercio";
            case CANCELADO_POR_SISTEMA -> "Canceló " + pedido + " por la suspensión del comercio";
            case ENTREGADO -> motivoTimeout == MotivoTimeoutPedido.TIMEOUT_RETIRO_SUSPENSION
                    ? "Cerró automáticamente " + pedido + " listo para retirar (comercio suspendido)"
                    : "Confirmó automáticamente la entrega de " + pedido;
            case NO_RETIRADO -> "Cerró automáticamente " + pedido + " como no retirado (comercio suspendido)";
            default -> "Cambió el estado de " + pedido;
        };
    }
}
