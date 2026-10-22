package com.bajonea.backend.services;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.bajonea.backend.config.PrecioBloqueoProperties;
import com.bajonea.backend.dto.request.ProductoRequestDTO;
import com.bajonea.backend.dto.response.ProductoResponseDTO;
import com.bajonea.backend.exceptions.ConflictoComercioException;
import com.bajonea.backend.services.DatosPruebaEmpleado.Dueno;
import java.math.BigDecimal;
import java.time.Duration;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

class ProductoPrecioFranjaIntegrationTest extends TurnoIntegrationBase {

    private static final DateTimeFormatter HORA = DateTimeFormatter.ofPattern("HH:mm");

    @Autowired
    private PrecioBloqueoProperties propiedades;

    @BeforeEach
    void verificarElPuntoDePartida() {
        assertFalse(propiedades.isHabilitado(), "el perfil test arranca con el bloqueo apagado");
    }

    @AfterEach
    void apagarElBloqueo() {
        propiedades.setHabilitado(false);
    }

    private void franjaAlrededorDeAhora(int comercioId, int minutosAntes, int minutosDespues) {
        LocalDateTime ahora = LocalDateTime.now(clock);
        LocalDateTime inicio = ahora.minusMinutes(minutosAntes);
        LocalDateTime fin = ahora.plusMinutes(minutosDespues);
        horario(comercioId, inicio.toLocalDate(), inicio.format(HORA), fin.format(HORA));
    }

    private int productoConImagen(Dueno dueno) {
        int productoId = producto(dueno);
        jdbcTemplate.update("INSERT INTO imagen_producto (producto_id, url, orden, es_principal) VALUES (?, ?, 0, 1)", productoId,
                "https://res.cloudinary.com/demo/image/upload/productos/" + dueno.comercioId() + "/" + productoId + "/foto.png");
        return productoId;
    }

    private ProductoRequestDTO conPrecio(String precio) {
        return new ProductoRequestDTO("Producto editado", "d", new BigDecimal(precio), categoriaId(), List.of());
    }

    private int categoriaId() {
        return jdbcTemplate.queryForObject("SELECT id FROM categoria ORDER BY id LIMIT 1", Integer.class);
    }

    private BigDecimal precioEnLaBase(int productoId) {
        return jdbcTemplate.queryForObject("SELECT precio FROM producto WHERE id = ?", BigDecimal.class, productoId);
    }

    private int filasDeHistorial(Dueno dueno, int productoId) {
        return jdbcTemplate.queryForObject("SELECT COUNT(*) FROM historial_edicion_comercio WHERE comercio_id = ? AND entidad_tipo = 'PRODUCTO' "
                + "AND accion = 'EDITAR' AND entidad_id = ?", Integer.class, dueno.comercioId(), productoId);
    }

    @Test
    void conElBloqueoEncendidoUnPrecioNuevoEnFranjaRevierteTodo() {
        Dueno dueno = comercioSinHorarios();
        franjaAlrededorDeAhora(dueno.comercioId(), 30, 30);
        int productoId = productoConImagen(dueno);
        propiedades.setHabilitado(true);

        ConflictoComercioException ex = assertThrows(ConflictoComercioException.class,
                () -> productoService.editarProducto(actor(dueno), productoId, conPrecio("1800")));

        assertEquals(ConflictoComercioException.PRECIO_BLOQUEADO_EN_FRANJA, ex.getCodigo());
        assertEquals(0, new BigDecimal("1500").compareTo(precioEnLaBase(productoId)));
        assertEquals("Producto carrito", jdbcTemplate.queryForObject("SELECT LEFT(nombre, 16) FROM producto WHERE id = ?", String.class, productoId));
        assertEquals(0, filasDeHistorial(dueno, productoId));
    }

    @Test
    void fueraDeLaFranjaElPrecioSeGuardaYQuedaEnElHistorial() {
        Dueno dueno = comercioSinHorarios();
        LocalDateTime ahora = LocalDateTime.now(clock);
        LocalDateTime inicio = ahora.plusHours(2);
        horario(dueno.comercioId(), inicio.toLocalDate(), inicio.format(HORA), ahora.plusHours(3).format(HORA));
        int productoId = productoConImagen(dueno);
        propiedades.setHabilitado(true);

        ProductoResponseDTO respuesta = productoService.editarProducto(actor(dueno), productoId, conPrecio("1800"));

        assertEquals(0, new BigDecimal("1800").compareTo(precioEnLaBase(productoId)));
        assertFalse(respuesta.getPrecioBloqueado());
        assertEquals(1, filasDeHistorial(dueno, productoId));
        assertTrue(jdbcTemplate.queryForObject("SELECT detalle FROM historial_edicion_comercio WHERE comercio_id = ? AND entidad_id = ? AND accion = 'EDITAR'",
                String.class, dueno.comercioId(), productoId).contains("precio"));
    }

    @Test
    void elMismoPrecioEnFranjaGuardaLosOtrosCampos() {
        Dueno dueno = comercioSinHorarios();
        franjaAlrededorDeAhora(dueno.comercioId(), 30, 30);
        int productoId = productoConImagen(dueno);
        propiedades.setHabilitado(true);

        ProductoResponseDTO respuesta = productoService.editarProducto(actor(dueno), productoId, conPrecio("1500.00"));

        assertEquals("Producto Editado", respuesta.getNombre());
        assertTrue(respuesta.getPrecioBloqueado());
        assertEquals(1, filasDeHistorial(dueno, productoId));
    }

    @Test
    void conElBloqueoApagadoUnCambioDePrecioEnFranjaSeGuarda() {
        Dueno dueno = comercioSinHorarios();
        franjaAlrededorDeAhora(dueno.comercioId(), 30, 30);
        int productoId = productoConImagen(dueno);

        ProductoResponseDTO respuesta = productoService.editarProducto(actor(dueno), productoId, conPrecio("1900"));

        assertEquals(0, new BigDecimal("1900").compareTo(precioEnLaBase(productoId)));
        assertFalse(respuesta.getPrecioBloqueado());
    }

    @Test
    void laListaDelComercioInformaHastaCuandoDuraLaFranja() {
        Dueno dueno = comercioSinHorarios();
        franjaAlrededorDeAhora(dueno.comercioId(), 30, 30);
        productoConImagen(dueno);
        propiedades.setHabilitado(true);

        ProductoResponseDTO fila = productoService.listarProductosDelComercio(dueno.comercioId()).get(0);

        assertTrue(fila.getPrecioBloqueado());
        long minutos = Duration.between(LocalDateTime.now(clock), fila.getPrecioBloqueadoHasta()).toMinutes();
        assertTrue(minutos >= 28 && minutos <= 31, "la franja termina en unos 30 minutos y dio " + minutos);
    }
}
