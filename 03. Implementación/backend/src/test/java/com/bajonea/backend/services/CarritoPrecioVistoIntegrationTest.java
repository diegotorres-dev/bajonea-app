package com.bajonea.backend.services;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.bajonea.backend.dto.response.CarritoResponseDTO;
import com.bajonea.backend.dto.response.ItemCarritoResponseDTO;
import com.bajonea.backend.services.DatosPruebaEmpleado.Dueno;
import java.math.BigDecimal;
import org.junit.jupiter.api.Test;

class CarritoPrecioVistoIntegrationTest extends CarritoIntegrationBase {

    private BigDecimal precioVisto(int clienteId, int productoId) {
        return jdbcTemplate.queryForObject("SELECT ic.precio_visto FROM item_carrito ic JOIN carrito c ON c.id = ic.carrito_id "
                + "WHERE c.cliente_id = ? AND ic.producto_id = ?", BigDecimal.class, clienteId, productoId);
    }

    private void cambiarPrecio(int productoId, String precio) {
        jdbcTemplate.update("UPDATE producto SET precio = ? WHERE id = ?", new BigDecimal(precio), productoId);
    }

    private ItemCarritoResponseDTO item(CarritoResponseDTO carrito, int productoId) {
        return carrito.getItems().stream().filter(i -> i.getProductoId() == productoId).findFirst().orElseThrow();
    }

    @Test
    void alAgregarUnItemNuevoSeEstampaElPrecioVigente() {
        Dueno dueno = comercioApto(false);
        int productoId = producto(dueno);
        int clienteId = datos.registrarCliente();

        agregar(clienteId, productoId);

        assertEquals(0, new BigDecimal("1500").compareTo(precioVisto(clienteId, productoId)));
        ItemCarritoResponseDTO fila = item(carritoService.verCarrito(clienteId), productoId);
        assertFalse(fila.isPrecioCambio());
        assertEquals(0, new BigDecimal("1500").compareTo(fila.getPrecioVisto()));
    }

    @Test
    void unaEdicionDePrecioPosteriorMarcaElCambioYElTotalUsaElPrecioNuevo() {
        Dueno dueno = comercioApto(false);
        int productoId = producto(dueno);
        int clienteId = datos.registrarCliente();
        agregar(clienteId, productoId);

        cambiarPrecio(productoId, "1800");
        CarritoResponseDTO carrito = carritoService.verCarrito(clienteId);

        ItemCarritoResponseDTO fila = item(carrito, productoId);
        assertTrue(fila.isPrecioCambio());
        assertEquals(0, new BigDecimal("1500").compareTo(fila.getPrecioVisto()));
        assertEquals(0, new BigDecimal("1800").compareTo(fila.getPrecioUnitario()));
        assertTrue(carrito.isHayCambioDePrecio());
        assertEquals(0, new BigDecimal("1800").compareTo(carrito.getSubtotal()));
        assertEquals(0, carrito.getSubtotal().add(carrito.getCargoServicioCliente()).compareTo(carrito.getTotal()));
    }

    @Test
    void sumarOCambiarLaCantidadNoVuelveAEstamparElPrecio() {
        Dueno dueno = comercioApto(false);
        int productoId = producto(dueno);
        int clienteId = datos.registrarCliente();
        agregar(clienteId, productoId);
        cambiarPrecio(productoId, "1800");

        agregar(clienteId, productoId);
        int itemId = item(carritoService.verCarrito(clienteId), productoId).getId();
        carritoService.actualizarCantidad(clienteId, itemId, 4);

        assertEquals(0, new BigDecimal("1500").compareTo(precioVisto(clienteId, productoId)));
        CarritoResponseDTO carrito = carritoService.verCarrito(clienteId);
        assertTrue(item(carrito, productoId).isPrecioCambio());
        assertEquals(4, item(carrito, productoId).getCantidad());
    }

    @Test
    void unItemAgregadoDespuesDeLaEdicionNoAvisaYTomaElPrecioNuevo() {
        Dueno dueno = comercioApto(false);
        int productoId = producto(dueno);
        int otroProductoId = producto(dueno);
        int clienteId = datos.registrarCliente();
        agregar(clienteId, productoId);
        cambiarPrecio(otroProductoId, "2100");

        agregar(clienteId, otroProductoId);
        CarritoResponseDTO carrito = carritoService.verCarrito(clienteId);

        assertEquals(0, new BigDecimal("2100").compareTo(precioVisto(clienteId, otroProductoId)));
        assertFalse(item(carrito, otroProductoId).isPrecioCambio());
        assertFalse(carrito.isHayCambioDePrecio());
    }

    @Test
    void unItemSinPrecioVistoNuncaAvisa() {
        Dueno dueno = comercioApto(false);
        int productoId = producto(dueno);
        int clienteId = datos.registrarCliente();
        agregar(clienteId, productoId);
        jdbcTemplate.update("UPDATE item_carrito SET precio_visto = NULL WHERE producto_id = ?", productoId);
        cambiarPrecio(productoId, "1800");

        CarritoResponseDTO carrito = carritoService.verCarrito(clienteId);

        assertNull(item(carrito, productoId).getPrecioVisto());
        assertFalse(item(carrito, productoId).isPrecioCambio());
        assertFalse(carrito.isHayCambioDePrecio());
    }

    @Test
    void unPrecioVistoConOtraEscalaNoCuentaComoCambio() {
        Dueno dueno = comercioApto(false);
        int productoId = producto(dueno);
        int clienteId = datos.registrarCliente();
        agregar(clienteId, productoId);
        jdbcTemplate.update("UPDATE item_carrito SET precio_visto = 1500.00 WHERE producto_id = ?", productoId);

        assertFalse(carritoService.verCarrito(clienteId).isHayCambioDePrecio());
    }
}
