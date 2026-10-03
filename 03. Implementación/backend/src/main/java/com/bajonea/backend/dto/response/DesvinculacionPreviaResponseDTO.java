package com.bajonea.backend.dto.response;

import java.time.LocalDateTime;
import java.util.List;
import lombok.Getter;

/**
 * Qué pasaría si el Dueño desvincula su cuenta de Mercado Pago hoy, para el modal de confirmación de
 * {@code comercio-perfil.html}: todos sus comercios (en cualquier estado) con los pedidos en curso de
 * cada uno, y los pagos pendientes que bloquean la desvinculación. Es informativa: el servidor
 * revalida la regla de {@code PENDIENTE_PAGO} (con bloqueo) al desvincular y no compara estos números.
 * {@code puedeReintentarDesde} es aproximado (el job de vencimiento corre cada 60 segundos) y es
 * {@code null} cuando no hay pagos pendientes.
 */
@Getter
public class DesvinculacionPreviaResponseDTO {

    private final boolean puedeDesvincular;
    private final List<ComercioPrevia> comercios;
    private final PagosPendientes pagosPendientes;

    public DesvinculacionPreviaResponseDTO(boolean puedeDesvincular, List<ComercioPrevia> comercios,
            PagosPendientes pagosPendientes) {
        this.puedeDesvincular = puedeDesvincular;
        this.comercios = comercios;
        this.pagosPendientes = pagosPendientes;
    }

    @Getter
    public static class ComercioPrevia {

        private final Integer id;
        private final String nombre;
        private final List<PedidosEnCurso> pedidosEnCurso;
        private final long cantidadPagosPendientes;

        public ComercioPrevia(Integer id, String nombre, List<PedidosEnCurso> pedidosEnCurso, long cantidadPagosPendientes) {
            this.id = id;
            this.nombre = nombre;
            this.pedidosEnCurso = pedidosEnCurso;
            this.cantidadPagosPendientes = cantidadPagosPendientes;
        }
    }

    @Getter
    public static class PedidosEnCurso {

        private final String estado;
        private final long cantidad;

        public PedidosEnCurso(String estado, long cantidad) {
            this.estado = estado;
            this.cantidad = cantidad;
        }
    }

    @Getter
    public static class PagosPendientes {

        private final long cantidadTotal;
        private final LocalDateTime puedeReintentarDesde;

        public PagosPendientes(long cantidadTotal, LocalDateTime puedeReintentarDesde) {
            this.cantidadTotal = cantidadTotal;
            this.puedeReintentarDesde = puedeReintentarDesde;
        }
    }
}
