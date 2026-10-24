package com.bajonea.backend.enums;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.util.Map;
import org.junit.jupiter.api.Test;

class CategoriaResultadoPedidoTest {

    private static final Map<EstadoPedido, CategoriaResultadoPedido> ESPERADAS = Map.ofEntries(
            Map.entry(EstadoPedido.PENDIENTE_PAGO, CategoriaResultadoPedido.EN_CURSO),
            Map.entry(EstadoPedido.PENDIENTE_CONFIRMACION_COMERCIO, CategoriaResultadoPedido.EN_CURSO),
            Map.entry(EstadoPedido.EN_PREPARACION, CategoriaResultadoPedido.EN_CURSO),
            Map.entry(EstadoPedido.EN_CAMINO, CategoriaResultadoPedido.EN_CURSO),
            Map.entry(EstadoPedido.LISTO_PARA_RETIRAR, CategoriaResultadoPedido.EN_CURSO),
            Map.entry(EstadoPedido.ENTREGADO, CategoriaResultadoPedido.ENTREGADO),
            Map.entry(EstadoPedido.NO_RETIRADO, CategoriaResultadoPedido.NO_RETIRADO),
            Map.entry(EstadoPedido.RECHAZADO, CategoriaResultadoPedido.RECHAZADO),
            Map.entry(EstadoPedido.CANCELADO, CategoriaResultadoPedido.CANCELADO),
            Map.entry(EstadoPedido.ANULADO, CategoriaResultadoPedido.ANULADO),
            Map.entry(EstadoPedido.CANCELADO_POR_SISTEMA, CategoriaResultadoPedido.CANCELADO),
            Map.entry(EstadoPedido.EXPIRADO, CategoriaResultadoPedido.EXPIRADO));

    @Test
    void losDoceEstadosDelPedidoTienenSuCategoria() {
        for (EstadoPedido estado : EstadoPedido.values()) {
            assertEquals(ESPERADAS.get(estado), CategoriaResultadoPedido.desde(estado.name()), estado.name());
        }
        assertEquals(EstadoPedido.values().length, ESPERADAS.size());
    }

    @Test
    void elLiteralViejoPendienteCuentaComoEnCurso() {
        assertEquals(CategoriaResultadoPedido.EN_CURSO, CategoriaResultadoPedido.desde("PENDIENTE"));
    }

    @Test
    void unEstadoDesconocidoONuloCuentaComoEnCursoYNoRompe() {
        assertEquals(CategoriaResultadoPedido.EN_CURSO, CategoriaResultadoPedido.desde("ESTADO_QUE_NO_EXISTE"));
        assertEquals(CategoriaResultadoPedido.EN_CURSO, CategoriaResultadoPedido.desde(null));
    }
}
