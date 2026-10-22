package com.bajonea.backend.services;

import static org.junit.jupiter.api.Assertions.fail;

import com.bajonea.backend.config.security.ComercioActivo;
import com.bajonea.backend.dto.request.ItemCarritoRequestDTO;
import com.bajonea.backend.enums.EstadoComercio;
import com.bajonea.backend.repositories.ItemCarritoRepository;
import com.bajonea.backend.services.DatosPruebaEmpleado.Dueno;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Base de las pruebas de integración del carrito contra {@code bajonea_test} con hilos y datos confirmados de verdad
 * (mini-tramo del carrito de E3). Cada prueba crea sus propios Dueño, Cliente, productos y pedidos con datos únicos.
 * El comercio queda abierto todos los días las 24 horas para que agregar al carrito no dependa de la hora de la corrida.
 */
@SpringBootTest
@ActiveProfiles("test")
abstract class CarritoIntegrationBase {

    @Autowired
    protected CarritoService carritoService;

    @Autowired
    protected PedidoService pedidoService;

    @Autowired
    protected ProductoService productoService;

    @Autowired
    protected RegistroService registroService;

    @Autowired
    protected CuentaMercadoPagoService cuentaService;

    @Autowired
    protected ItemCarritoRepository itemCarritoRepository;

    @Autowired
    protected JdbcTemplate jdbcTemplate;

    @Autowired
    protected ObjectMapper objectMapper;

    @Autowired
    protected PlatformTransactionManager transactionManager;

    @MockitoBean
    protected EmailService emailService;

    protected DatosPruebaEmpleado datos;

    @BeforeEach
    void prepararDatos() {
        datos = new DatosPruebaEmpleado(registroService, objectMapper, jdbcTemplate);
    }

    protected Dueno comercioApto(boolean conCuentaMercadoPago) {
        Dueno dueno = datos.registrarDuenoAprobado();
        datos.cambiarEstadoComercio(dueno.comercioId(), "APTO_VENTA");
        jdbcTemplate.update("DELETE FROM horario WHERE comercio_id = ?", dueno.comercioId());
        for (String dia : List.of("LUNES", "MARTES", "MIERCOLES", "JUEVES", "VIERNES", "SABADO", "DOMINGO")) {
            jdbcTemplate.update("INSERT INTO horario (comercio_id, dia_semana, hora_apertura, hora_cierre) VALUES (?, ?, '00:00:00', '23:59:59')",
                    dueno.comercioId(), dia);
        }
        if (conCuentaMercadoPago) {
            cuentaService.vincular(dueno.id(), "MP-CAR-" + DatosPruebaEmpleado.sufijo(), "token", "refresh", "pub", true,
                    LocalDateTime.now().plusDays(1));
        }
        return dueno;
    }

    protected ComercioActivo actor(Dueno dueno) {
        return ComercioActivo.delDueno(dueno.comercioId(), dueno.id(), EstadoComercio.APTO_VENTA);
    }

    protected int producto(Dueno dueno) {
        List<Integer> categorias = jdbcTemplate.queryForList("SELECT id FROM categoria ORDER BY id LIMIT 1", Integer.class);
        if (categorias.isEmpty()) {
            jdbcTemplate.update("INSERT INTO categoria (nombre) VALUES (?)", "Cat base " + DatosPruebaEmpleado.sufijo());
            categorias = jdbcTemplate.queryForList("SELECT id FROM categoria ORDER BY id LIMIT 1", Integer.class);
        }
        Integer categoriaId = categorias.get(0);
        jdbcTemplate.update("INSERT INTO producto (comercio_id, categoria_id, nombre, precio, estado) VALUES (?, ?, ?, 1500, 'DISPONIBLE')",
                dueno.comercioId(), categoriaId, "Producto carrito " + DatosPruebaEmpleado.sufijo());
        return jdbcTemplate.queryForObject("SELECT LAST_INSERT_ID()", Integer.class);
    }

    protected void agregar(int clienteId, int productoId) {
        carritoService.agregarItem(clienteId, new ItemCarritoRequestDTO(productoId, 1, null));
    }

    protected int pedidoPendientePago(int clienteId, Dueno dueno) {
        jdbcTemplate.update("INSERT INTO pedido (cliente_id, comercio_id, modalidad_entrega, estado, pago_estado, subtotal, "
                + "cargo_servicio_cliente, cargo_servicio_comercio, total, fecha_creacion) "
                + "VALUES (?, ?, 'RETIRO', 'PENDIENTE_PAGO', 'PENDIENTE', 1500, 200, 100, 1700, ?)",
                clienteId, dueno.comercioId(), LocalDateTime.now());
        return jdbcTemplate.queryForObject("SELECT LAST_INSERT_ID()", Integer.class);
    }

    protected void filaDePago(int pedidoId) {
        jdbcTemplate.update("INSERT INTO pago (pedido_id, monto, mp_preferencia_id) VALUES (?, 1700, ?)", pedidoId, "pref-" + pedidoId);
    }

    protected Integer carritoId(int clienteId) {
        List<Integer> ids = jdbcTemplate.queryForList("SELECT id FROM carrito WHERE cliente_id = ?", Integer.class, clienteId);
        return ids.isEmpty() ? null : ids.get(0);
    }

    protected int items(int clienteId) {
        return jdbcTemplate.queryForObject("SELECT COUNT(*) FROM item_carrito ic JOIN carrito c ON c.id = ic.carrito_id WHERE c.cliente_id = ?",
                Integer.class, clienteId);
    }

    protected Integer comercioDelCarrito(int clienteId) {
        List<Integer> filas = jdbcTemplate.query("SELECT comercio_id FROM carrito WHERE cliente_id = ?",
                (rs, n) -> rs.getObject(1) == null ? null : rs.getInt(1), clienteId);
        return filas.isEmpty() ? null : filas.get(0);
    }

    protected String estadoDelPedido(int pedidoId) {
        return jdbcTemplate.queryForObject("SELECT estado FROM pedido WHERE id = ?", String.class, pedidoId);
    }

    protected int carritosDelCliente(int clienteId) {
        return jdbcTemplate.queryForObject("SELECT COUNT(*) FROM carrito WHERE cliente_id = ?", Integer.class, clienteId);
    }

    /**
     * Un pago aprobado en la misma forma que el del webhook real: la transacción empieza con una lectura común (que
     * fija la foto de la transacción, como la búsqueda del pago al inicio de {@code procesarNotificacion}), espera
     * una señal y recién entonces confirma el pago. Lo que otra transacción confirme mientras espera no está en su foto.
     */
    protected Callable<Object> pagoConFotoTemprana(int pedidoId, int clienteId, CountDownLatch fotoTomada, CountDownLatch seguir) {
        return () -> new TransactionTemplate(transactionManager).execute(estado -> {
            Integer carritoId = carritoId(clienteId);
            if (carritoId != null) {
                itemCarritoRepository.findByCarritoId(carritoId);
            }
            fotoTomada.countDown();
            esperar(seguir);
            pedidoService.confirmarPagoAprobado(pedidoId);
            return null;
        });
    }

    protected static void esperar(CountDownLatch latch) {
        try {
            if (!latch.await(60, TimeUnit.SECONDS)) {
                fail("Se agotó la espera de una señal de la prueba");
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException(e);
        }
    }

    protected static List<Object> correrAlMismoTiempo(List<Callable<Object>> tareas) {
        ExecutorService pool = Executors.newFixedThreadPool(tareas.size());
        CountDownLatch salida = new CountDownLatch(1);
        try {
            List<Future<Object>> futuros = new ArrayList<>();
            for (Callable<Object> tarea : tareas) {
                futuros.add(pool.submit(() -> {
                    salida.await();
                    try {
                        return tarea.call();
                    } catch (Exception e) {
                        return e;
                    }
                }));
            }
            salida.countDown();
            List<Object> resultados = new ArrayList<>();
            for (Future<Object> futuro : futuros) {
                resultados.add(futuro.get(90, TimeUnit.SECONDS));
            }
            return resultados;
        } catch (Exception e) {
            throw new IllegalStateException(e);
        } finally {
            pool.shutdownNow();
        }
    }

    /** Lanza la tarea en su propio hilo ya, sin esperar el resultado. */
    protected static Future<Object> enSegundoPlano(ExecutorService pool, Callable<Object> tarea) {
        return pool.submit(() -> {
            try {
                return tarea.call();
            } catch (Exception e) {
                return e;
            }
        });
    }

    protected static Object resultado(Future<Object> futuro) {
        try {
            return futuro.get(90, TimeUnit.SECONDS);
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    protected static void sinErrores(List<Object> resultados) {
        for (Object resultado : resultados) {
            if (resultado instanceof Exception) {
                fail("Fallo inesperado: " + resultado);
            }
        }
    }
}
