package com.bajonea.backend.services;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.bajonea.backend.services.ResumenTurnoMensajeBuilder.CierreParaMensaje;
import com.bajonea.backend.services.ResumenTurnoMensajeBuilder.Mensaje;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;
import org.junit.jupiter.api.Test;

class ResumenTurnoMensajeBuilderTest {

    private static final LocalDate JUEVES = LocalDate.of(2026, 10, 22);

    private static CierreParaMensaje popular(int pedidos, String vendido, String comision, String neto, int pendientes) {
        return new CierreParaMensaje("Pizzería Popular", JUEVES, LocalTime.of(20, 0), LocalTime.of(2, 0), pedidos,
                new BigDecimal(vendido), new BigDecimal(comision), new BigDecimal(neto), pendientes);
    }

    private static CierreParaMensaje cafe(int pedidos) {
        return new CierreParaMensaje("Corner Coffee Shop", JUEVES, LocalTime.of(12, 0), LocalTime.of(15, 0), pedidos,
                BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ZERO, 0);
    }

    @Test
    void unComercioConVentasMuestraElNetoEnElAsuntoYLasCifrasDelPanelEnElCuerpo() {
        Mensaje mensaje = ResumenTurnoMensajeBuilder.armar("Diego", List.of(popular(23, "128400.00", "1284.00", "127116.00", 2)));

        assertEquals("Cerró tu turno en Pizzería Popular: neto $127.116", mensaje.asunto());
        assertEquals("Hola Diego,\n\n"
                + "Cerró el turno de Pizzería Popular del jueves 22/10, de 20:00 a 02:00 (día siguiente).\n\n"
                + "Vendido en el turno: $128.400\n"
                + "Comisión de Bajoneá: $1.284\n"
                + "Neto del turno: $127.116\n"
                + "Pedidos del turno: 23\n\n"
                + "Quedaron 2 pedidos sin responder al cerrar el turno. No están incluidos en estos montos.\n\n"
                + "Podés ver el detalle en el panel de Bajoneá.\n\n"
                + "Equipo de Bajoneá", mensaje.cuerpo());
    }

    @Test
    void unComercioSinPedidosDiceQueNoHuboPedidosYNoMuestraMontos() {
        Mensaje mensaje = ResumenTurnoMensajeBuilder.armar("Diego", List.of(cafe(0)));

        assertEquals("Cerró tu turno en Corner Coffee Shop: sin pedidos", mensaje.asunto());
        assertEquals("Hola Diego,\n\n"
                + "Cerró el turno de Corner Coffee Shop del jueves 22/10, de 12:00 a 15:00.\n\n"
                + "No hubo pedidos en este turno.\n\n"
                + "Podés ver el detalle en el panel de Bajoneá.\n\n"
                + "Equipo de Bajoneá", mensaje.cuerpo());
        assertFalse(mensaje.cuerpo().contains("Vendido"));
    }

    @Test
    void sinPedidosPeroConPendientesAgregaLaLineaDePendientes() {
        CierreParaMensaje cierre = new CierreParaMensaje("Corner Coffee Shop", JUEVES, LocalTime.of(12, 0), LocalTime.of(15, 0), 0,
                BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ZERO, 1);

        Mensaje mensaje = ResumenTurnoMensajeBuilder.armar("Diego", List.of(cierre));

        assertEquals("Cerró tu turno en Corner Coffee Shop: sin pedidos", mensaje.asunto());
        assertEquals("Hola Diego,\n\n"
                + "Cerró el turno de Corner Coffee Shop del jueves 22/10, de 12:00 a 15:00.\n\n"
                + "No hubo pedidos en este turno.\n\n"
                + "Quedó 1 pedido sin responder al cerrar el turno. No está incluido en estos montos.\n\n"
                + "Podés ver el detalle en el panel de Bajoneá.\n\n"
                + "Equipo de Bajoneá", mensaje.cuerpo());
    }

    @Test
    void conPedidosPeroTotalEnCeroElAsuntoMuestraNetoCero() {
        Mensaje mensaje = ResumenTurnoMensajeBuilder.armar("Diego", List.of(popular(3, "0.00", "0.00", "0.00", 0)));

        assertEquals("Cerró tu turno en Pizzería Popular: neto $0", mensaje.asunto());
        assertTrue(mensaje.cuerpo().contains("Pedidos del turno: 3\n"));
        assertFalse(mensaje.cuerpo().contains("sin responder"));
    }

    @Test
    void variosComerciosVanEnUnSoloMensajeConUnBloqueCadaUno() {
        Mensaje mensaje = ResumenTurnoMensajeBuilder.armar("Diego",
                List.of(popular(23, "128400.00", "1284.00", "127116.00", 2), cafe(0)));

        assertEquals("Cerraron los turnos de tus comercios", mensaje.asunto());
        assertEquals("Hola Diego,\n\n"
                + "Cerraron estos turnos:\n\n"
                + "Pizzería Popular — jueves 22/10, de 20:00 a 02:00 (día siguiente)\n"
                + "Vendido en el turno: $128.400\n"
                + "Comisión de Bajoneá: $1.284\n"
                + "Neto del turno: $127.116\n"
                + "Pedidos del turno: 23\n"
                + "Pedidos sin responder al cierre: 2 (no incluidos en estos montos)\n\n"
                + "Corner Coffee Shop — jueves 22/10, de 12:00 a 15:00\n"
                + "No hubo pedidos en este turno.\n\n"
                + "Podés ver el detalle en el panel de Bajoneá.\n\n"
                + "Equipo de Bajoneá", mensaje.cuerpo());
    }

    @Test
    void losMontosUsanFormatoArgentinoYSoloMuestranCentavosSiLosHay() {
        assertEquals("$0", ResumenTurnoMensajeBuilder.monto(new BigDecimal("0.00")));
        assertEquals("$1.284,50", ResumenTurnoMensajeBuilder.monto(new BigDecimal("1284.50")));
        assertEquals("$1.234.567", ResumenTurnoMensajeBuilder.monto(new BigDecimal("1234567.00")));
        assertEquals("$12,05", ResumenTurnoMensajeBuilder.monto(new BigDecimal("12.05")));
        assertEquals("$999", ResumenTurnoMensajeBuilder.monto(new BigDecimal("999")));
    }

    @Test
    void elTurnoQueNoCruzaLaMedianoche23_59NoLlevaElSufijoDeDiaSiguiente() {
        CierreParaMensaje cierre = new CierreParaMensaje("Café Sur", JUEVES, LocalTime.of(0, 0), LocalTime.of(23, 59), 1,
                new BigDecimal("100.00"), new BigDecimal("1.00"), new BigDecimal("99.00"), 0);

        Mensaje mensaje = ResumenTurnoMensajeBuilder.armar("Ana", List.of(cierre));

        assertTrue(mensaje.cuerpo().contains("de 00:00 a 23:59."));
        assertFalse(mensaje.cuerpo().contains("día siguiente"));
        assertFalse(mensaje.cuerpo().contains("+1"));
    }
}
