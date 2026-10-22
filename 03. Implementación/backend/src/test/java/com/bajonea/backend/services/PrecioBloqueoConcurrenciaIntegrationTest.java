package com.bajonea.backend.services;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assertions.fail;

import com.bajonea.backend.config.PrecioBloqueoProperties;
import com.bajonea.backend.dto.request.PedidoRequestDTO;
import com.bajonea.backend.dto.request.ProductoRequestDTO;
import com.bajonea.backend.enums.TipoEntrega;
import com.bajonea.backend.exceptions.ConflictoComercioException;
import com.bajonea.backend.services.DatosPruebaEmpleado.Dueno;
import java.math.BigDecimal;
import java.util.List;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.support.TransactionTemplate;

class PrecioBloqueoConcurrenciaIntegrationTest extends CarritoIntegrationBase {

    @Autowired
    private PrecioBloqueoProperties propiedades;

    @AfterEach
    void apagarElBloqueo() {
        propiedades.setHabilitado(false);
    }

    private int productoConImagen(Dueno dueno) {
        int productoId = producto(dueno);
        jdbcTemplate.update("INSERT INTO imagen_producto (producto_id, url, orden, es_principal) VALUES (?, ?, 0, 1)", productoId,
                "https://res.cloudinary.com/demo/image/upload/productos/" + dueno.comercioId() + "/" + productoId + "/foto.png");
        return productoId;
    }

    private ProductoRequestDTO conPrecio(String precio) {
        int categoriaId = jdbcTemplate.queryForObject("SELECT id FROM categoria ORDER BY id LIMIT 1", Integer.class);
        return new ProductoRequestDTO("Producto editado", "d", new BigDecimal(precio), categoriaId, List.of());
    }

    private PedidoRequestDTO pedido(BigDecimal totalEsperado) {
        PedidoRequestDTO request = new PedidoRequestDTO();
        request.setTipoEntrega(TipoEntrega.RETIRO);
        request.setTotalEsperado(totalEsperado);
        return request;
    }

    @Test
    void unaEdicionDePrecioContraLaCreacionDelPedidoNuncaCobraUnTotalDistintoAlEsperado() {
        Dueno dueno = comercioApto(false);
        jdbcTemplate.update("UPDATE comercio SET acepta_retiro = 1 WHERE id = ?", dueno.comercioId());
        int productoId = productoConImagen(dueno);
        int creados = 0;
        int avisados = 0;

        for (int ronda = 0; ronda < 12; ronda++) {
            int clienteId = datos.registrarCliente();
            agregar(clienteId, productoId);
            BigDecimal totalEsperado = carritoService.verCarrito(clienteId).getTotal();
            String precioNuevo = String.valueOf(2000 + ronda * 10);

            List<Object> resultados = correrAlMismoTiempo(List.of(
                    () -> productoService.editarProducto(actor(dueno), productoId, conPrecio(precioNuevo)),
                    () -> pedidoService.confirmarPedido(clienteId, pedido(totalEsperado))));

            assertFalse(resultados.get(0) instanceof Exception, "la edicion fallo: " + resultados.get(0));
            Object pedido = resultados.get(1);
            if (pedido instanceof ConflictoComercioException ex) {
                assertEquals(ConflictoComercioException.PRECIO_CAMBIO, ex.getCodigo());
                assertEquals(0, jdbcTemplate.queryForObject("SELECT COUNT(*) FROM pedido WHERE cliente_id = ?", Integer.class, clienteId));
                avisados++;
            } else if (pedido instanceof Exception otro) {
                fail("error inesperado al confirmar el pedido: " + otro);
            } else {
                BigDecimal totalCobrado = jdbcTemplate.queryForObject("SELECT total FROM pedido WHERE cliente_id = ?", BigDecimal.class, clienteId);
                assertEquals(0, totalEsperado.compareTo(totalCobrado), "el pedido se creo con un total distinto del esperado");
                creados++;
            }
        }
        assertEquals(12, creados + avisados);
    }

    @Test
    void dosEdicionesDePrecioSimultaneasSeSerializanSinErrores() {
        Dueno dueno = comercioApto(false);
        int productoId = productoConImagen(dueno);
        propiedades.setHabilitado(true);
        jdbcTemplate.update("DELETE FROM horario WHERE comercio_id = ?", dueno.comercioId());

        for (int ronda = 0; ronda < 8; ronda++) {
            String a = String.valueOf(3000 + ronda);
            String b = String.valueOf(4000 + ronda);
            List<Object> resultados = correrAlMismoTiempo(List.of(
                    () -> productoService.editarProducto(actor(dueno), productoId, conPrecio(a)),
                    () -> productoService.editarProducto(actor(dueno), productoId, conPrecio(b))));

            for (Object resultado : resultados) {
                assertFalse(resultado instanceof Exception, "una edicion fallo: " + resultado);
            }
            BigDecimal final_ = jdbcTemplate.queryForObject("SELECT precio FROM producto WHERE id = ?", BigDecimal.class, productoId);
            assertTrue(final_.compareTo(new BigDecimal(a)) == 0 || final_.compareTo(new BigDecimal(b)) == 0);
        }
    }

    @Test
    void unaEdicionDePrecioEsperaAQuienTieneElComercioExclusivoYTerminaSinInterbloqueo() throws Exception {
        Dueno dueno = comercioApto(false);
        int productoId = productoConImagen(dueno);
        propiedades.setHabilitado(true);
        jdbcTemplate.update("DELETE FROM horario WHERE comercio_id = ?", dueno.comercioId());

        ExecutorService pool = Executors.newFixedThreadPool(2);
        try {
            CountDownLatch tomado = new CountDownLatch(1);
            CountDownLatch soltar = new CountDownLatch(1);
            Future<Object> quienLoTiene = enSegundoPlano(pool, () -> new TransactionTemplate(transactionManager).execute(estado -> {
                jdbcTemplate.queryForList("SELECT id FROM comercio WHERE id = ? FOR UPDATE", dueno.comercioId());
                tomado.countDown();
                esperar(soltar);
                return null;
            }));
            esperar(tomado);

            Callable<Object> edicion = () -> productoService.editarProducto(actor(dueno), productoId, conPrecio("5000"));
            Future<Object> editando = enSegundoPlano(pool, edicion);
            Thread.sleep(800);
            assertFalse(editando.isDone(), "la edicion debia esperar al comercio tomado en exclusivo");
            soltar.countDown();

            assertFalse(resultado(quienLoTiene) instanceof Exception);
            assertFalse(resultado(editando) instanceof Exception, "la edicion fallo al liberarse el comercio");
        } finally {
            pool.shutdownNow();
        }
        assertEquals(0, new BigDecimal("5000").compareTo(
                jdbcTemplate.queryForObject("SELECT precio FROM producto WHERE id = ?", BigDecimal.class, productoId)));
    }
}
