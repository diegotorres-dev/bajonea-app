package com.bajonea.backend.services;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.bajonea.backend.dto.request.PedidoRequestDTO;
import com.bajonea.backend.dto.response.ItemCarritoResponseDTO;
import com.bajonea.backend.dto.response.PedidoResponseDTO;
import com.bajonea.backend.enums.TipoEntrega;
import com.bajonea.backend.exceptions.ConflictoComercioException;
import com.bajonea.backend.exceptions.ValidacionException;
import com.bajonea.backend.services.DatosPruebaEmpleado.Dueno;
import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class PedidoTotalEsperadoIntegrationTest extends CarritoIntegrationBase {

    private static final BigDecimal CARGO = new BigDecimal("200");

    private record Escenario(Dueno dueno, int productoId, int clienteId) {
    }

    private Escenario escenario() {
        Dueno dueno = comercioApto(false);
        jdbcTemplate.update("UPDATE comercio SET acepta_retiro = 1 WHERE id = ?", dueno.comercioId());
        int productoId = producto(dueno);
        int clienteId = datos.registrarCliente();
        agregar(clienteId, productoId);
        return new Escenario(dueno, productoId, clienteId);
    }

    private PedidoRequestDTO pedido(BigDecimal totalEsperado) {
        PedidoRequestDTO request = new PedidoRequestDTO();
        request.setTipoEntrega(TipoEntrega.RETIRO);
        request.setTotalEsperado(totalEsperado);
        return request;
    }

    private int pedidosDelCliente(int clienteId) {
        return jdbcTemplate.queryForObject("SELECT COUNT(*) FROM pedido WHERE cliente_id = ?", Integer.class, clienteId);
    }

    private int detallesDelCliente(int clienteId) {
        return jdbcTemplate.queryForObject("SELECT COUNT(*) FROM detalle_pedido d JOIN pedido p ON p.id = d.pedido_id WHERE p.cliente_id = ?",
                Integer.class, clienteId);
    }

    private int historialDelCliente(int clienteId) {
        return jdbcTemplate.queryForObject("SELECT COUNT(*) FROM historial_estado_pedido h JOIN pedido p ON p.id = h.pedido_id WHERE p.cliente_id = ?",
                Integer.class, clienteId);
    }

    private void cambiarPrecio(int productoId, String precio) {
        jdbcTemplate.update("UPDATE producto SET precio = ? WHERE id = ?", new BigDecimal(precio), productoId);
    }

    @Test
    void sinTotalEsperadoElPedidoSeCreaComoAntes() {
        Escenario e = escenario();

        PedidoResponseDTO creado = pedidoService.confirmarPedido(e.clienteId(), pedido(null));

        assertNotNull(creado.getId());
        assertEquals(0, new BigDecimal("1500").add(CARGO).compareTo(creado.getTotal()));
        assertEquals(1, pedidosDelCliente(e.clienteId()));
    }

    @Test
    void conElTotalExactoSeCreaAunqueLaEscalaSeaOtra() {
        Escenario e = escenario();

        PedidoResponseDTO creado = pedidoService.confirmarPedido(e.clienteId(), pedido(new BigDecimal("1700.0")));

        assertEquals(0, new BigDecimal("1700").compareTo(creado.getTotal()));
        assertEquals(1, pedidosDelCliente(e.clienteId()));
    }

    @Test
    @SuppressWarnings("unchecked")
    void conElTotalViejoTrasUnaEdicionDePrecioDaPrecioCambioConLosMontosNuevosYNoCreaNada() {
        Escenario e = escenario();
        BigDecimal totalQueVioElCliente = carritoService.verCarrito(e.clienteId()).getTotal();
        cambiarPrecio(e.productoId(), "1800");

        ConflictoComercioException ex = assertThrows(ConflictoComercioException.class,
                () -> pedidoService.confirmarPedido(e.clienteId(), pedido(totalQueVioElCliente)));

        assertEquals(ConflictoComercioException.PRECIO_CAMBIO, ex.getCodigo());
        assertEquals(ConflictoComercioException.MENSAJE_PRECIO_CAMBIO, ex.getMessage());
        Map<String, Object> data = ex.getData();
        assertEquals(0, new BigDecimal("1800").compareTo((BigDecimal) data.get("subtotal")));
        assertEquals(0, CARGO.compareTo((BigDecimal) data.get("cargoServicioCliente")));
        assertEquals(0, new BigDecimal("2000").compareTo((BigDecimal) data.get("total")));
        List<ItemCarritoResponseDTO> items = (List<ItemCarritoResponseDTO>) data.get("items");
        assertEquals(1, items.size());
        assertTrue(items.get(0).isPrecioCambio());
        assertEquals(0, new BigDecimal("1500").compareTo(items.get(0).getPrecioVisto()));
        assertEquals(0, new BigDecimal("1800").compareTo(items.get(0).getPrecioUnitario()));
        assertEquals(0, pedidosDelCliente(e.clienteId()));
        assertEquals(0, detallesDelCliente(e.clienteId()));
        assertEquals(0, historialDelCliente(e.clienteId()));
        assertEquals(1, items(e.clienteId()));
    }

    @Test
    void despuesDelAvisoElReintentoConElTotalNuevoCreaElPedido() {
        Escenario e = escenario();
        cambiarPrecio(e.productoId(), "1800");
        assertThrows(ConflictoComercioException.class, () -> pedidoService.confirmarPedido(e.clienteId(), pedido(new BigDecimal("1700"))));

        PedidoResponseDTO creado = pedidoService.confirmarPedido(e.clienteId(), pedido(new BigDecimal("2000")));

        assertEquals(0, new BigDecimal("2000").compareTo(creado.getTotal()));
        assertEquals(1, pedidosDelCliente(e.clienteId()));
    }

    @Test
    @SuppressWarnings("unchecked")
    void unCambioDeTarifaTambienDaPrecioCambioAunqueNingunItemCambieDePrecio() {
        Escenario e = escenario();
        BigDecimal totalQueVioElCliente = carritoService.verCarrito(e.clienteId()).getTotal();
        jdbcTemplate.update("INSERT INTO configuracion_tarifa (administrador_id, cargo_cliente, tipo_cargo_cliente, cargo_comercio, "
                + "tipo_cargo_comercio, fecha_vigencia) SELECT administrador_id, 350, 'FIJO', cargo_comercio, tipo_cargo_comercio, "
                + "NOW() + INTERVAL 2 DAY FROM configuracion_tarifa ORDER BY fecha_vigencia DESC LIMIT 1");
        try {
            ConflictoComercioException ex = assertThrows(ConflictoComercioException.class,
                    () -> pedidoService.confirmarPedido(e.clienteId(), pedido(totalQueVioElCliente)));

            assertEquals(ConflictoComercioException.PRECIO_CAMBIO, ex.getCodigo());
            assertEquals(0, new BigDecimal("1850").compareTo((BigDecimal) ex.getData().get("total")));
            List<ItemCarritoResponseDTO> items = (List<ItemCarritoResponseDTO>) ex.getData().get("items");
            assertFalse(items.get(0).isPrecioCambio());
            assertEquals(0, pedidosDelCliente(e.clienteId()));
        } finally {
            jdbcTemplate.update("DELETE FROM configuracion_tarifa WHERE fecha_vigencia > NOW() + INTERVAL 1 DAY");
        }
    }

    @Test
    void losTopesDeMontoMaximoTienenPrioridadSobreElAvisoDeCambio() {
        Escenario e = escenario();
        cambiarPrecio(e.productoId(), "99999999");

        assertThrows(ValidacionException.class, () -> pedidoService.confirmarPedido(e.clienteId(), pedido(new BigDecimal("1700"))));
        assertEquals(0, pedidosDelCliente(e.clienteId()));
    }
}
