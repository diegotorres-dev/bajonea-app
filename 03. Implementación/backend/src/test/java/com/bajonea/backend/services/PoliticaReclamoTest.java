package com.bajonea.backend.services;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.bajonea.backend.entities.Pago;
import com.bajonea.backend.entities.Pedido;
import com.bajonea.backend.enums.EstadoPedido;
import com.bajonea.backend.enums.MotivoReclamo;
import com.bajonea.backend.enums.TipoEntrega;
import java.time.LocalDateTime;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;

class PoliticaReclamoTest {

    private static final LocalDateTime ENTREGA = LocalDateTime.of(2026, 11, 1, 20, 0);

    private final PoliticaReclamo politica = new PoliticaReclamo(7);

    private static Pedido entregado(LocalDateTime fechaEntrega, TipoEntrega tipo) {
        return Pedido.builder().estado(EstadoPedido.ENTREGADO).tipoEntrega(tipo).fechaEntrega(fechaEntrega).build();
    }

    private static Pago pagoAprobado() {
        return Pago.builder().mpEstado("approved").idTransaccionMp("1").fechaConfirmacion(ENTREGA).build();
    }

    @Test
    void laFechaLimiteSonSieteDiasCorridosDesdeLaEntrega() {
        assertEquals(ENTREGA.plusDays(7), politica.fechaLimite(entregado(ENTREGA, TipoEntrega.DOMICILIO)));
        assertNull(politica.fechaLimite(entregado(null, TipoEntrega.DOMICILIO)));
        assertEquals(ENTREGA.plusDays(3), new PoliticaReclamo(3).fechaLimite(entregado(ENTREGA, TipoEntrega.RETIRO)));
    }

    @Test
    void elPlazoIncluyeElInstanteExactoDelLimite() {
        Pedido pedido = entregado(ENTREGA, TipoEntrega.DOMICILIO);

        assertNull(politica.motivoDeNoElegible(pedido, pagoAprobado(), ENTREGA.plusDays(7)));
        assertEquals("Pasaron los 7 días para reclamar este pedido.",
                politica.motivoDeNoElegible(pedido, pagoAprobado(), ENTREGA.plusDays(7).plusSeconds(1)));
    }

    @ParameterizedTest
    @EnumSource(value = EstadoPedido.class, mode = EnumSource.Mode.EXCLUDE, names = "ENTREGADO")
    void soloUnPedidoEntregadoSePuedeReclamar(EstadoPedido estado) {
        Pedido pedido = Pedido.builder().estado(estado).tipoEntrega(TipoEntrega.DOMICILIO).fechaEntrega(ENTREGA).build();

        assertEquals(PoliticaReclamo.MENSAJE_NO_ENTREGADO, politica.motivoDeNoElegible(pedido, pagoAprobado(), ENTREGA));
    }

    @Test
    void sinPagoAprobadoYConfirmadoNoSePuedeReclamar() {
        Pedido pedido = entregado(ENTREGA, TipoEntrega.DOMICILIO);

        assertEquals(PoliticaReclamo.MENSAJE_SIN_PAGO, politica.motivoDeNoElegible(pedido, null, ENTREGA));
        assertEquals(PoliticaReclamo.MENSAJE_SIN_PAGO, politica.motivoDeNoElegible(pedido,
                Pago.builder().mpEstado("pending").idTransaccionMp("1").fechaConfirmacion(ENTREGA).build(), ENTREGA));
        assertEquals(PoliticaReclamo.MENSAJE_SIN_PAGO, politica.motivoDeNoElegible(pedido,
                Pago.builder().mpEstado("approved").idTransaccionMp("1").build(), ENTREGA));
        assertEquals(PoliticaReclamo.MENSAJE_SIN_PAGO, politica.motivoDeNoElegible(pedido,
                Pago.builder().mpEstado("approved").fechaConfirmacion(ENTREGA).build(), ENTREGA));
    }

    @Test
    void sinFechaDeEntregaNoSePuedeReclamar() {
        assertEquals(PoliticaReclamo.MENSAJE_SIN_FECHA,
                politica.motivoDeNoElegible(entregado(null, TipoEntrega.DOMICILIO), pagoAprobado(), ENTREGA));
    }

    @Test
    void noRecibiElPedidoSoloSeOfreceEnLosPedidosADomicilio() {
        assertTrue(politica.motivosDisponibles(entregado(ENTREGA, TipoEntrega.DOMICILIO)).contains(MotivoReclamo.NO_RECIBI_PEDIDO));
        assertFalse(politica.motivosDisponibles(entregado(ENTREGA, TipoEntrega.RETIRO)).contains(MotivoReclamo.NO_RECIBI_PEDIDO));
        assertEquals(MotivoReclamo.values().length, politica.motivosDisponibles(entregado(ENTREGA, TipoEntrega.DOMICILIO)).size());
        assertEquals(MotivoReclamo.values().length - 1, politica.motivosDisponibles(entregado(ENTREGA, TipoEntrega.RETIRO)).size());
    }
}
