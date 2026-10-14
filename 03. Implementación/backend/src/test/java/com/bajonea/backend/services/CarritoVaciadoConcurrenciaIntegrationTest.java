package com.bajonea.backend.services;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assertions.fail;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.reset;

import com.bajonea.backend.dto.request.ItemCarritoRequestDTO;
import com.bajonea.backend.entities.Comercio;
import com.bajonea.backend.enums.EstadoProducto;
import com.bajonea.backend.exceptions.ConflictoDeNegocioException;
import com.bajonea.backend.exceptions.RecursoNoEncontradoException;
import com.bajonea.backend.services.DatosPruebaEmpleado.Dueno;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.atomic.AtomicBoolean;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;

/**
 * El carrito contra {@code bajonea_test} con hilos y datos confirmados (mini-tramo del carrito de E3). Un pago aprobado
 * que vacía el carrito, el Cliente que lo modifica y el Dueño que pasa un producto a agotado se serializan por el
 * bloqueo de la fila {@code carrito} y usan sentencias en bloque: ninguna falla por una fila que otra transacción ya
 * borró, y el carrito nunca queda con ítems y sin comercio. Los pagos "con foto temprana" fijan la foto de la
 * transacción antes de que la otra operación confirme, como el webhook real (que empieza con una lectura común y
 * llama a Mercado Pago antes de bloquear el pedido): es el caso en que bloquear sin usar sentencias en bloque, o usar
 * sentencias en bloque sin bloquear, deja de alcanzar.
 */
class CarritoVaciadoConcurrenciaIntegrationTest extends CarritoIntegrationBase {

    @MockitoSpyBean
    private ComercioService comercioService;

    @AfterEach
    void limpiarEspias() {
        reset(comercioService);
    }

    private void soltarCuandoTodosTienenFoto(CountDownLatch fotos, CountDownLatch seguir) {
        Thread soltador = new Thread(() -> {
            esperar(fotos);
            seguir.countDown();
        });
        soltador.setDaemon(true);
        soltador.start();
    }

    @Test
    void variosPagosDelMismoClienteConLaMismaFotoConfirmanTodosYVacianElCarritoUnaVez() {
        Dueno dueno = comercioApto(false);
        int cliente = datos.registrarCliente();
        agregar(cliente, producto(dueno));
        agregar(cliente, producto(dueno));
        agregar(cliente, producto(dueno));
        List<Integer> pedidos = List.of(pedidoPendientePago(cliente, dueno), pedidoPendientePago(cliente, dueno),
                pedidoPendientePago(cliente, dueno));

        CountDownLatch fotos = new CountDownLatch(pedidos.size());
        CountDownLatch seguir = new CountDownLatch(1);
        soltarCuandoTodosTienenFoto(fotos, seguir);
        List<Callable<Object>> tareas = new ArrayList<>();
        for (int pedido : pedidos) {
            tareas.add(pagoConFotoTemprana(pedido, cliente, fotos, seguir));
        }

        sinErrores(correrAlMismoTiempo(tareas));

        for (int pedido : pedidos) {
            assertEquals("PENDIENTE_CONFIRMACION_COMERCIO", estadoDelPedido(pedido));
        }
        assertEquals(0, items(cliente));
        assertNull(comercioDelCarrito(cliente));
    }

    @Test
    void elPagoNoFallaSiElClienteVacioElCarritoDespuesDeFijarSuFoto() throws Exception {
        Dueno dueno = comercioApto(false);
        int cliente = datos.registrarCliente();
        agregar(cliente, producto(dueno));
        agregar(cliente, producto(dueno));
        int pedido = pedidoPendientePago(cliente, dueno);

        ejecutarContraPagoConFotoTemprana(cliente, pedido, () -> carritoService.vaciarCarrito(cliente));

        assertEquals("PENDIENTE_CONFIRMACION_COMERCIO", estadoDelPedido(pedido));
        assertEquals(0, items(cliente));
        assertNull(comercioDelCarrito(cliente));
    }

    @Test
    void elPagoNoFallaSiElClienteQuitoUnItemDespuesDeFijarSuFoto() throws Exception {
        Dueno dueno = comercioApto(false);
        int cliente = datos.registrarCliente();
        agregar(cliente, producto(dueno));
        agregar(cliente, producto(dueno));
        int pedido = pedidoPendientePago(cliente, dueno);
        int itemId = carritoService.verCarrito(cliente).getItems().get(0).getId();

        ejecutarContraPagoConFotoTemprana(cliente, pedido, () -> carritoService.eliminarItem(cliente, itemId));

        assertEquals("PENDIENTE_CONFIRMACION_COMERCIO", estadoDelPedido(pedido));
        assertEquals(0, items(cliente));
    }

    @Test
    void elPagoNoFallaSiElClienteCambioUnaCantidadDespuesDeFijarSuFoto() throws Exception {
        Dueno dueno = comercioApto(false);
        int cliente = datos.registrarCliente();
        agregar(cliente, producto(dueno));
        int pedido = pedidoPendientePago(cliente, dueno);
        int itemId = carritoService.verCarrito(cliente).getItems().get(0).getId();

        ejecutarContraPagoConFotoTemprana(cliente, pedido, () -> carritoService.actualizarCantidad(cliente, itemId, 5));

        assertEquals("PENDIENTE_CONFIRMACION_COMERCIO", estadoDelPedido(pedido));
        assertEquals(0, items(cliente));
    }

    @Test
    void elPagoNoFallaSiElDuenoMarcaElProductoAgotadoDespuesDeFijarSuFoto() throws Exception {
        Dueno dueno = comercioApto(false);
        int cliente = datos.registrarCliente();
        int agotado = producto(dueno);
        agregar(cliente, agotado);
        agregar(cliente, producto(dueno));
        int pedido = pedidoPendientePago(cliente, dueno);

        ejecutarContraPagoConFotoTemprana(cliente, pedido,
                () -> productoService.cambiarEstado(actor(dueno), agotado, EstadoProducto.AGOTADO));

        assertEquals("PENDIENTE_CONFIRMACION_COMERCIO", estadoDelPedido(pedido));
        assertEquals(0, items(cliente));
        assertEquals(1, jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM notificacion WHERE usuario_id = ? AND tipo = 'PRODUCTO_REMOVIDO_CARRITO'", Integer.class, cliente));
    }

    @Test
    void elPagoNoVaciaUnCarritoQueCambioDeComercioDespuesDeFijarSuFoto() throws Exception {
        Dueno comercioA = comercioApto(false);
        Dueno comercioB = comercioApto(false);
        int cliente = datos.registrarCliente();
        agregar(cliente, producto(comercioA));
        int pedidoDeA = pedidoPendientePago(cliente, comercioA);
        int productoDeB = producto(comercioB);

        ejecutarContraPagoConFotoTemprana(cliente, pedidoDeA, () -> {
            carritoService.vaciarCarrito(cliente);
            agregar(cliente, productoDeB);
        });

        assertEquals("PENDIENTE_CONFIRMACION_COMERCIO", estadoDelPedido(pedidoDeA));
        assertEquals(1, items(cliente), "el carrito de otro comercio no se vacía por el pago de este pedido");
        assertEquals(comercioB.comercioId(), comercioDelCarrito(cliente));
    }

    @Test
    void elPagoNoTocaUnCarritoQueQuedoSinComercioDespuesDeFijarSuFoto() throws Exception {
        Dueno dueno = comercioApto(false);
        int cliente = datos.registrarCliente();
        agregar(cliente, producto(dueno));
        int pedido = pedidoPendientePago(cliente, dueno);
        int itemId = carritoService.verCarrito(cliente).getItems().get(0).getId();

        ejecutarContraPagoConFotoTemprana(cliente, pedido, () -> carritoService.eliminarItem(cliente, itemId));

        assertEquals("PENDIENTE_CONFIRMACION_COMERCIO", estadoDelPedido(pedido));
        assertEquals(0, items(cliente));
        assertNull(comercioDelCarrito(cliente));
    }

    @Test
    void agregarUnItemMientrasElPagoVaciaElCarritoNoDejaUnItemSinComercio() throws Exception {
        Dueno dueno = comercioApto(false);
        int cliente = datos.registrarCliente();
        agregar(cliente, producto(dueno));
        int pedido = pedidoPendientePago(cliente, dueno);
        int otroProducto = producto(dueno);

        CountDownLatch enPausa = new CountDownLatch(1);
        CountDownLatch continuar = new CountDownLatch(1);
        AtomicBoolean pausar = new AtomicBoolean(true);
        doAnswer(invocacion -> {
            if (pausar.getAndSet(false)) {
                enPausa.countDown();
                esperar(continuar);
            }
            return invocacion.callRealMethod();
        }).when(comercioService).validarAceptaPedidos(any(Comercio.class));

        ExecutorService pool = Executors.newFixedThreadPool(2);
        try {
            Future<Object> agregando = enSegundoPlano(pool, () -> {
                agregar(cliente, otroProducto);
                return null;
            });
            esperar(enPausa);
            Future<Object> pagando = enSegundoPlano(pool, () -> {
                pedidoService.confirmarPagoAprobado(pedido);
                return null;
            });
            Thread.sleep(800);
            continuar.countDown();

            sinErrores(java.util.Arrays.asList(resultado(agregando), resultado(pagando)));
        } finally {
            pool.shutdownNow();
        }

        assertEquals("PENDIENTE_CONFIRMACION_COMERCIO", estadoDelPedido(pedido));
        if (items(cliente) > 0) {
            assertNotNull(comercioDelCarrito(cliente), "un carrito con ítems tiene que tener comercio");
        }
        assertTrue(items(cliente) == 0 || comercioDelCarrito(cliente) != null);
    }

    @Test
    void dosBajasSimultaneasDelMismoItemDejanUnExitoYUnNoEncontrado() {
        Dueno dueno = comercioApto(false);
        int cliente = datos.registrarCliente();
        agregar(cliente, producto(dueno));
        int itemId = carritoService.verCarrito(cliente).getItems().get(0).getId();

        List<Object> resultados = correrAlMismoTiempo(List.of(
                () -> carritoService.eliminarItem(cliente, itemId),
                () -> carritoService.eliminarItem(cliente, itemId),
                () -> carritoService.eliminarItem(cliente, itemId)));

        long exitos = resultados.stream().filter(r -> !(r instanceof Exception)).count();
        long noEncontrados = resultados.stream().filter(r -> r instanceof RecursoNoEncontradoException).count();
        assertEquals(1, exitos, resultados.toString());
        assertEquals(2, noEncontrados, resultados.toString());
        assertEquals(0, items(cliente));
        assertNull(comercioDelCarrito(cliente));
    }

    @Test
    void vaciarMuchasVecesAlMismoTiempoNuncaFalla() {
        Dueno dueno = comercioApto(false);
        int cliente = datos.registrarCliente();
        agregar(cliente, producto(dueno));
        agregar(cliente, producto(dueno));

        sinErrores(correrAlMismoTiempo(List.of(
                () -> {
                    carritoService.vaciarCarrito(cliente);
                    return null;
                },
                () -> {
                    carritoService.vaciarCarrito(cliente);
                    return null;
                },
                () -> {
                    carritoService.vaciarCarrito(cliente);
                    return null;
                },
                () -> {
                    carritoService.vaciarCarrito(cliente);
                    return null;
                })));

        assertEquals(0, items(cliente));
        assertNull(comercioDelCarrito(cliente));
    }

    @Test
    void elCambioDeEstadoDelProductoQuitaLosItemsAvisaSoloALosAfectadosYDejaSinComercioAlCarritoVacio() {
        Dueno dueno = comercioApto(false);
        int afectado = producto(dueno);
        int otro = producto(dueno);
        int soloAfectado = datos.registrarCliente();
        int afectadoYOtro = datos.registrarCliente();
        int sinElProducto = datos.registrarCliente();
        agregar(soloAfectado, afectado);
        agregar(afectadoYOtro, afectado);
        agregar(afectadoYOtro, otro);
        agregar(sinElProducto, otro);

        productoService.cambiarEstado(actor(dueno), afectado, EstadoProducto.AGOTADO);

        assertEquals(0, items(soloAfectado));
        assertNull(comercioDelCarrito(soloAfectado));
        assertEquals(1, items(afectadoYOtro));
        assertEquals(dueno.comercioId(), comercioDelCarrito(afectadoYOtro));
        assertEquals(1, items(sinElProducto));
        assertEquals(dueno.comercioId(), comercioDelCarrito(sinElProducto));
        assertEquals(1, avisosDeProductoRemovido(soloAfectado));
        assertEquals(1, avisosDeProductoRemovido(afectadoYOtro));
        assertEquals(0, avisosDeProductoRemovido(sinElProducto));
    }

    @Test
    void agregarAlCarritoYMarcarAgotadoAlMismoTiempoNuncaDejanElProductoAgotadoEnUnCarrito() {
        Dueno dueno = comercioApto(false);
        List<Integer> clientes = new ArrayList<>();
        for (int i = 0; i < 4; i++) {
            clientes.add(datos.registrarCliente());
        }
        for (int ronda = 0; ronda < 6; ronda++) {
            int producto = producto(dueno);
            List<Callable<Object>> tareas = new ArrayList<>();
            for (int cliente : clientes) {
                tareas.add(() -> {
                    agregar(cliente, producto);
                    return null;
                });
            }
            tareas.add(() -> productoService.cambiarEstado(actor(dueno), producto, EstadoProducto.AGOTADO));

            List<Object> resultados = correrAlMismoTiempo(tareas);

            for (Object resultado : resultados) {
                if (resultado instanceof Exception && !(resultado instanceof ConflictoDeNegocioException)) {
                    fail("Fallo inesperado en la ronda " + ronda + ": " + resultado);
                }
            }
            assertEquals(0, jdbcTemplate.queryForObject("SELECT COUNT(*) FROM item_carrito WHERE producto_id = ?", Integer.class, producto),
                    "el producto agotado quedó en algún carrito (ronda " + ronda + ")");
            for (int cliente : clientes) {
                if (items(cliente) == 0) {
                    assertNull(comercioDelCarrito(cliente), "carrito vacío con comercio (ronda " + ronda + ")");
                }
            }
            for (int cliente : clientes) {
                carritoService.vaciarCarrito(cliente);
            }
        }
    }

    @Test
    void elPrimerAccesoSimultaneoDeUnClienteCreaUnSoloCarritoSinFallar() {
        Dueno dueno = comercioApto(false);
        int producto = producto(dueno);
        int cliente = datos.registrarCliente();
        assertEquals(0, carritosDelCliente(cliente));

        sinErrores(correrAlMismoTiempo(List.of(
                () -> carritoService.verCarrito(cliente),
                () -> carritoService.verCarrito(cliente),
                () -> carritoService.agregarItem(cliente, new ItemCarritoRequestDTO(producto, 1, null)),
                () -> carritoService.agregarItem(cliente, new ItemCarritoRequestDTO(producto, 1, null)),
                () -> {
                    carritoService.vaciarCarrito(cliente);
                    return null;
                })));

        assertEquals(1, carritosDelCliente(cliente));
        assertFalse(items(cliente) > 1, "el mismo producto no puede estar en dos ítems");
    }

    @FunctionalInterface
    private interface Accion {
        void ejecutar() throws Exception;
    }

    private int avisosDeProductoRemovido(int usuarioId) {
        return jdbcTemplate.queryForObject("SELECT COUNT(*) FROM notificacion WHERE usuario_id = ? AND tipo = 'PRODUCTO_REMOVIDO_CARRITO'",
                Integer.class, usuarioId);
    }

    /**
     * Corre {@code otra} mientras el pago ya fijó la foto de su transacción: primero el pago toma la foto y espera, luego
     * {@code otra} se ejecuta y confirma, y recién entonces el pago sigue. El pago no tiene que fallar.
     */
    private void ejecutarContraPagoConFotoTemprana(int cliente, int pedido, Accion otra) throws Exception {
        CountDownLatch fotos = new CountDownLatch(1);
        CountDownLatch seguir = new CountDownLatch(1);
        ExecutorService pool = Executors.newSingleThreadExecutor();
        try {
            Future<Object> pagando = enSegundoPlano(pool, pagoConFotoTemprana(pedido, cliente, fotos, seguir));
            esperar(fotos);
            try {
                otra.ejecutar();
            } finally {
                seguir.countDown();
            }
            Object resultado = resultado(pagando);
            if (resultado instanceof Exception) {
                fail("El pago falló: " + resultado);
            }
        } finally {
            pool.shutdownNow();
        }
    }
}
