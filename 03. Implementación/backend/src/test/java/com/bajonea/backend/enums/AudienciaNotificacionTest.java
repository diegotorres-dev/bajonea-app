package com.bajonea.backend.enums;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.EnumMap;
import java.util.Map;
import org.junit.jupiter.api.Test;

/**
 * Clasificación aprobada de cada {@link TipoNotificacion} (E3, bloque A4). El enum obliga a clasificar cada tipo al
 * declararlo; esta tabla es la fuente de verdad aprobada y falla si un tipo se agrega o cambia de audiencia sin
 * decidirlo a propósito: de la audiencia depende por qué camino se crea el aviso y si lleva comercio.
 */
class AudienciaNotificacionTest {

    private static final Map<TipoNotificacion, AudienciaNotificacion> APROBADA = new EnumMap<>(TipoNotificacion.class);

    static {
        APROBADA.put(TipoNotificacion.NUEVO_PEDIDO, AudienciaNotificacion.EQUIPO);
        APROBADA.put(TipoNotificacion.PEDIDO_CANCELADO_CLIENTE, AudienciaNotificacion.EQUIPO);
        APROBADA.put(TipoNotificacion.PEDIDO_EXPIRADO_COMERCIO, AudienciaNotificacion.EQUIPO);
        APROBADA.put(TipoNotificacion.PEDIDO_AUTOCONFIRMADO_COMERCIO, AudienciaNotificacion.EQUIPO);

        APROBADA.put(TipoNotificacion.COMERCIO_APROBADO, AudienciaNotificacion.DUENO);
        APROBADA.put(TipoNotificacion.COMERCIO_RECHAZADO, AudienciaNotificacion.DUENO);
        APROBADA.put(TipoNotificacion.COMERCIO_SUSPENDIDO, AudienciaNotificacion.DUENO);
        APROBADA.put(TipoNotificacion.COMERCIO_INACTIVADO, AudienciaNotificacion.DUENO);
        APROBADA.put(TipoNotificacion.INVITACION_EMPLEADO, AudienciaNotificacion.DUENO);
        APROBADA.put(TipoNotificacion.SUSPENSION_LEVANTADA, AudienciaNotificacion.CLIENTE_O_DUENO);
        APROBADA.put(TipoNotificacion.EMPLEADO_DESACTIVADO, AudienciaNotificacion.CLIENTE_O_DUENO);
        APROBADA.put(TipoNotificacion.EMPLEADO_REACTIVADO, AudienciaNotificacion.CLIENTE_O_DUENO);
        APROBADA.put(TipoNotificacion.DOCUMENTO_APROBADO, AudienciaNotificacion.DUENO);
        APROBADA.put(TipoNotificacion.DOCUMENTO_RECHAZADO, AudienciaNotificacion.DUENO);
        APROBADA.put(TipoNotificacion.COMERCIO_APTO_VENTA, AudienciaNotificacion.DUENO);
        APROBADA.put(TipoNotificacion.COMERCIO_SIN_APTITUD, AudienciaNotificacion.DUENO);

        APROBADA.put(TipoNotificacion.NUEVO_COMERCIO_PENDIENTE, AudienciaNotificacion.ADMINISTRADOR);
        APROBADA.put(TipoNotificacion.NUEVA_RESOLICITUD_COMERCIO, AudienciaNotificacion.ADMINISTRADOR);
        APROBADA.put(TipoNotificacion.NUEVO_RECLAMO, AudienciaNotificacion.ADMINISTRADOR);
        APROBADA.put(TipoNotificacion.NUEVO_MENSAJE_SOPORTE, AudienciaNotificacion.ADMINISTRADOR);
        APROBADA.put(TipoNotificacion.REEMBOLSO_FALLIDO_DEFINITIVO, AudienciaNotificacion.ADMINISTRADOR);

        for (TipoNotificacion tipo : new TipoNotificacion[] {TipoNotificacion.PEDIDO_ACEPTADO, TipoNotificacion.PEDIDO_RECHAZADO,
                TipoNotificacion.PEDIDO_EN_CAMINO, TipoNotificacion.PEDIDO_LISTO_RETIRO, TipoNotificacion.AVISO_75MIN_SIN_CONFIRMACION,
                TipoNotificacion.PEDIDO_AUTOCONFIRMADO, TipoNotificacion.PEDIDO_ANULADO_COMERCIO, TipoNotificacion.PEDIDO_CANCELADO_SISTEMA,
                TipoNotificacion.PEDIDO_EXPIRADO_CLIENTE, TipoNotificacion.PEDIDO_CERRADO_TIMER_SUSPENSION,
                TipoNotificacion.PRODUCTO_REMOVIDO_CARRITO, TipoNotificacion.RECLAMO_APROBADO, TipoNotificacion.RECLAMO_RECHAZADO,
                TipoNotificacion.CUENTA_INACTIVADA, TipoNotificacion.CLIENTE_SUSPENDIDO, TipoNotificacion.PEDIDO_NO_RETIRADO}) {
            APROBADA.put(tipo, AudienciaNotificacion.CLIENTE);
        }
    }

    @Test
    void cadaTipoTieneLaAudienciaAprobada() {
        for (TipoNotificacion tipo : TipoNotificacion.values()) {
            assertTrue(APROBADA.containsKey(tipo), tipo + " no está en la tabla aprobada: decidir su audiencia a propósito");
            assertNotNull(tipo.getAudiencia(), tipo + " sin audiencia");
            assertEquals(APROBADA.get(tipo), tipo.getAudiencia(), "audiencia de " + tipo);
        }
    }

    @Test
    void losTiposOperativosDelEquipoSonExactamenteLosAprobados() {
        assertEquals(java.util.Set.of(TipoNotificacion.NUEVO_PEDIDO, TipoNotificacion.PEDIDO_CANCELADO_CLIENTE,
                TipoNotificacion.PEDIDO_EXPIRADO_COMERCIO, TipoNotificacion.PEDIDO_AUTOCONFIRMADO_COMERCIO),
                java.util.Arrays.stream(TipoNotificacion.values())
                        .filter(tipo -> tipo.getAudiencia() == AudienciaNotificacion.EQUIPO)
                        .collect(java.util.stream.Collectors.toSet()));
    }

    @Test
    void losTiposClienteSonLosDelCompradorYNingunoDelComercio() {
        for (TipoNotificacion tipo : new TipoNotificacion[] {TipoNotificacion.PEDIDO_ACEPTADO, TipoNotificacion.PEDIDO_RECHAZADO,
                TipoNotificacion.PEDIDO_EN_CAMINO, TipoNotificacion.PEDIDO_LISTO_RETIRO, TipoNotificacion.AVISO_75MIN_SIN_CONFIRMACION,
                TipoNotificacion.PEDIDO_AUTOCONFIRMADO, TipoNotificacion.PEDIDO_ANULADO_COMERCIO, TipoNotificacion.PEDIDO_CANCELADO_SISTEMA,
                TipoNotificacion.PEDIDO_EXPIRADO_CLIENTE, TipoNotificacion.PEDIDO_CERRADO_TIMER_SUSPENSION,
                TipoNotificacion.PRODUCTO_REMOVIDO_CARRITO, TipoNotificacion.PEDIDO_NO_RETIRADO}) {
            assertEquals(AudienciaNotificacion.CLIENTE, tipo.getAudiencia(), tipo.name());
        }
    }
}
