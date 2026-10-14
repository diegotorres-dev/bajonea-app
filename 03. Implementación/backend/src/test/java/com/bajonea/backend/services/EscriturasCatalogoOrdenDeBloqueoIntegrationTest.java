package com.bajonea.backend.services;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.doAnswer;

import com.bajonea.backend.config.security.ComercioActivo;
import com.bajonea.backend.dto.request.ImagenProductoRequestDTO;
import com.bajonea.backend.dto.request.ProductoRequestDTO;
import com.bajonea.backend.dto.response.ProductoResponseDTO;
import com.bajonea.backend.enums.EstadoComercio;
import com.bajonea.backend.enums.EstadoProducto;
import com.bajonea.backend.enums.RolActorComercio;
import com.bajonea.backend.exceptions.ComercioNoDisponibleException;
import com.bajonea.backend.exceptions.ConflictoComercioException;
import com.bajonea.backend.exceptions.RecursoNoEncontradoException;
import com.bajonea.backend.services.DatosPruebaEmpleado.Cuenta;
import com.bajonea.backend.services.DatosPruebaEmpleado.Dueno;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.function.Consumer;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * El punto de detención de las carreras es la hora que {@code HistorialEdicionComercioService.registrar} pide justo
 * antes de insertar la fila del historial (después de volcar las escrituras pendientes): la escritura del Dueño ya
 * tiene en el motor todo lo que va a tomar antes de ese insert.
 * <p>
 * Orden único de bloqueo de las escrituras del catálogo (E3, bloque A5b): relación, comercio {@code LOCK IN SHARE
 * MODE} para todo actor, producto {@code FOR UPDATE}, y recién después las lecturas comunes. Tres defectos reales del
 * estrés de A5, cada uno con una carrera determinista:
 * <ul>
 * <li>A5-3: el Dueño tomaba el producto antes que el comercio y el Empleado al revés; con un {@code FOR UPDATE} del
 * comercio ({@code cerrar}, {@code abrir}, datos operativos) encolado en medio, las tres transacciones se
 * interbloqueaban.</li>
 * <li>A5-2: dos escrituras sobre la misma imagen: la segunda leía la imagen de una foto vieja y fallaba al escribir
 * con un error 500; ahora espera el producto y responde 404.</li>
 * <li>A5-1: las dos firmas de Cloudinary no revalidaban la relación del Empleado ni el estado del comercio.</li>
 * </ul>
 */
@SpringBootTest
@ActiveProfiles("test")
class EscriturasCatalogoOrdenDeBloqueoIntegrationTest {

    private static final ThreadLocal<Runnable> GANCHO = new ThreadLocal<>();

    @Autowired
    private ProductoService productoService;

    @Autowired
    private RegistroService registroService;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private PlatformTransactionManager transactionManager;

    @PersistenceContext
    private EntityManager entityManager;

    @Value("${cloudinary.cloud-name}")
    private String cloudName;

    @MockitoBean
    private EmailService emailService;

    @MockitoSpyBean
    private DisponibilidadComercioService disponibilidadComercioService;

    private DatosPruebaEmpleado datos;

    private record Escenario(Dueno dueno, Cuenta empleado, int categoriaId) {

        ComercioActivo comoEmpleado() {
            return new ComercioActivo(dueno.comercioId(), dueno.id(), empleado.id(), RolActorComercio.EMPLEADO, EstadoComercio.APROBADO);
        }

        ComercioActivo comoDueno() {
            return ComercioActivo.delDueno(dueno.comercioId(), dueno.id(), EstadoComercio.APROBADO);
        }
    }

    @BeforeEach
    void preparar() {
        datos = new DatosPruebaEmpleado(registroService, objectMapper, jdbcTemplate);
        doAnswer(invocacion -> {
            Runnable gancho = GANCHO.get();
            if (gancho != null) {
                gancho.run();
            }
            return invocacion.callRealMethod();
        }).when(disponibilidadComercioService).ahora();
    }

    private Escenario escenario() {
        Dueno dueno = datos.registrarDuenoAprobado();
        Cuenta empleado = datos.registrarClienteConCredenciales();
        datos.vincularEmpleado(empleado.id(), dueno.comercioId(), "ACTIVO", LocalDateTime.now().minusDays(1));
        jdbcTemplate.update("INSERT INTO categoria (nombre) VALUES (?)", "Cat A5b " + DatosPruebaEmpleado.sufijo());
        int categoriaId = jdbcTemplate.queryForObject("SELECT LAST_INSERT_ID()", Integer.class);
        return new Escenario(dueno, empleado, categoriaId);
    }

    private int producto(Escenario e) {
        ProductoResponseDTO producto = productoService.crearProducto(e.comoDueno(),
                new ProductoRequestDTO("Producto A5b " + DatosPruebaEmpleado.sufijo(), "desc", new BigDecimal("1500"), e.categoriaId(), List.of()));
        return producto.getId();
    }

    private int imagen(int productoId, int orden, boolean principal) {
        jdbcTemplate.update("INSERT INTO imagen_producto (producto_id, url, orden, es_principal) VALUES (?, ?, ?, ?)",
                productoId, "https://res.cloudinary.com/demo/image/upload/v1/semilla-" + DatosPruebaEmpleado.sufijo() + ".png", orden, principal);
        return jdbcTemplate.queryForObject("SELECT LAST_INSERT_ID()", Integer.class);
    }

    private String urlEnCarpeta(Escenario e, int productoId) {
        return "https://res.cloudinary.com/" + cloudName + "/image/upload/v1/productos/" + e.dueno().comercioId() + "/" + productoId + "/nueva-"
                + DatosPruebaEmpleado.sufijo() + ".png";
    }

    private ProductoRequestDTO edicion(Escenario e) {
        return new ProductoRequestDTO("Producto Editado " + DatosPruebaEmpleado.sufijo(), "d", new BigDecimal("1700"), e.categoriaId(), List.of());
    }

    // ---------- A5-3: orden único comercio -> producto ----------

    /**
     * El Dueño hace su escritura y se queda detenido justo antes de registrarla en el historial, con lo que ya tiene
     * tomado en el motor. El Empleado edita el mismo producto (toma el comercio compartido y pide el producto) y un
     * tercero pide el comercio exclusivo (como {@code cerrar}). Con el orden viejo del Dueño, al soltarlo su registro
     * pide el comercio detrás del exclusivo en cola y las tres transacciones se esperan en círculo.
     */
    private void cruceDuenoEmpleadoCerrar(Escenario e, int productoId, Consumer<ComercioActivo> escrituraDelDueno) throws Exception {
        ExecutorService hilos = Executors.newFixedThreadPool(3);
        CountDownLatch detenido = new CountDownLatch(1);
        CountDownLatch soltar = new CountDownLatch(1);
        try {
            Future<?> dueno = hilos.submit(() -> {
                GANCHO.set(() -> {
                    entityManager.flush();
                    detenido.countDown();
                    esperar(soltar);
                });
                try {
                    escrituraDelDueno.accept(e.comoDueno());
                } finally {
                    GANCHO.remove();
                }
            });
            assertTrue(detenido.await(15, TimeUnit.SECONDS));

            Future<?> empleado = hilos.submit(() -> productoService.editarProducto(e.comoEmpleado(), productoId, edicion(e)));
            pausa(700);
            Future<?> cierre = hilos.submit(() -> new TransactionTemplate(transactionManager).executeWithoutResult(status ->
                    jdbcTemplate.queryForList("SELECT id FROM comercio WHERE id = ? FOR UPDATE", e.dueno().comercioId())));
            pausa(700);
            soltar.countDown();

            dueno.get(30, TimeUnit.SECONDS);
            empleado.get(30, TimeUnit.SECONDS);
            cierre.get(30, TimeUnit.SECONDS);
        } finally {
            soltar.countDown();
            hilos.shutdownNow();
        }
    }

    @Test
    void cambiarElEstadoDelDuenoNoSeInterbloqueaConElEmpleadoYUnBloqueoExclusivoDelComercio() throws Exception {
        Escenario e = escenario();
        int productoId = producto(e);
        imagen(productoId, 0, true);

        cruceDuenoEmpleadoCerrar(e, productoId, actor -> productoService.cambiarEstado(actor, productoId, EstadoProducto.AGOTADO));

        assertEquals("AGOTADO", jdbcTemplate.queryForObject("SELECT estado FROM producto WHERE id = ?", String.class, productoId));
    }

    @Test
    void editarElProductoDelDuenoNoSeInterbloqueaConElEmpleadoYUnBloqueoExclusivoDelComercio() throws Exception {
        Escenario e = escenario();
        int productoId = producto(e);
        imagen(productoId, 0, true);

        cruceDuenoEmpleadoCerrar(e, productoId, actor -> productoService.editarProducto(actor, productoId, edicion(e)));

        assertTrue(jdbcTemplate.queryForObject("SELECT nombre FROM producto WHERE id = ?", String.class, productoId).startsWith("Producto Editado"));
    }

    @Test
    void agregarUnaImagenDelDuenoNoSeInterbloqueaConElEmpleadoYUnBloqueoExclusivoDelComercio() throws Exception {
        Escenario e = escenario();
        int productoId = producto(e);
        imagen(productoId, 0, true);

        cruceDuenoEmpleadoCerrar(e, productoId,
                actor -> productoService.agregarImagen(actor, productoId, new ImagenProductoRequestDTO(urlEnCarpeta(e, productoId), 1, false)));

        assertEquals(2, jdbcTemplate.queryForObject("SELECT COUNT(*) FROM imagen_producto WHERE producto_id = ?", Integer.class, productoId));
    }

    // ---------- A5-2: dos escrituras sobre la misma imagen ----------

    /**
     * El Dueño elimina la imagen y se detiene antes de confirmar (la imagen ya está borrada para él, sin confirmar).
     * El Empleado hace otra escritura sobre la misma imagen y llega a su primera lectura mientras tanto. Al soltar al
     * Dueño, el Empleado tiene que ver la imagen como inexistente (404), no escribir sobre una fila que ya no está.
     */
    private void carreraSobreLaMismaImagen(Consumer<CarreraDeImagen> escrituraDelEmpleado) throws Exception {
        Escenario e = escenario();
        int productoId = producto(e);
        int principal = imagen(productoId, 0, true);
        int sobrante = imagen(productoId, 1, false);
        ExecutorService hilos = Executors.newFixedThreadPool(2);
        CountDownLatch detenido = new CountDownLatch(1);
        CountDownLatch soltar = new CountDownLatch(1);
        try {
            Future<?> dueno = hilos.submit(() -> {
                GANCHO.set(() -> {
                    detenido.countDown();
                    esperar(soltar);
                });
                try {
                    productoService.eliminarImagen(e.comoDueno(), productoId, sobrante);
                } finally {
                    GANCHO.remove();
                }
            });
            assertTrue(detenido.await(15, TimeUnit.SECONDS));

            Future<?> empleado = hilos.submit(() -> escrituraDelEmpleado.accept(new CarreraDeImagen(e, productoId, sobrante)));
            pausa(900);
            soltar.countDown();

            dueno.get(30, TimeUnit.SECONDS);
            ExecutionException fallo = assertThrows(ExecutionException.class, () -> empleado.get(30, TimeUnit.SECONDS));
            assertInstanceOf(RecursoNoEncontradoException.class, fallo.getCause(), String.valueOf(fallo.getCause()));
        } finally {
            soltar.countDown();
            hilos.shutdownNow();
        }
        assertEquals(1, jdbcTemplate.queryForObject("SELECT COUNT(*) FROM imagen_producto WHERE producto_id = ?", Integer.class, productoId));
        assertEquals(1, jdbcTemplate.queryForObject("SELECT COUNT(*) FROM imagen_producto WHERE id = ? AND es_principal = 1", Integer.class, principal));
        assertEquals(1, jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM historial_edicion_comercio WHERE comercio_id = ? AND entidad_tipo = 'IMAGEN_PRODUCTO' AND accion = 'ELIMINAR'",
                Integer.class, e.dueno().comercioId()));
        assertEquals(0, jdbcTemplate.queryForObject("SELECT COUNT(*) FROM historial_edicion_comercio WHERE usuario_id = ?", Integer.class,
                e.empleado().id()));
    }

    private record CarreraDeImagen(Escenario e, int productoId, int imagenId) {
    }

    @Test
    void eliminarLaMismaImagenDosVecesDa404EnLaSegunda() throws Exception {
        carreraSobreLaMismaImagen(c -> productoService.eliminarImagen(c.e().comoEmpleado(), c.productoId(), c.imagenId()));
    }

    @Test
    void reordenarUnaImagenQueOtroEliminoDa404() throws Exception {
        carreraSobreLaMismaImagen(c -> productoService.reordenarImagen(c.e().comoEmpleado(), c.productoId(), c.imagenId(), 4));
    }

    @Test
    void cambiarLaUrlDeUnaImagenQueOtroEliminoDa404() throws Exception {
        carreraSobreLaMismaImagen(c -> productoService.actualizarUrlImagen(c.e().comoEmpleado(), c.productoId(), c.imagenId(),
                urlEnCarpeta(c.e(), c.productoId())));
    }

    // ---------- A5-1: las firmas revalidan la relación y el estado del comercio ----------

    @Test
    void conLaRelacionInactivaLasDosFirmasDeCloudinaryResponden404() {
        Escenario e = escenario();
        int productoId = producto(e);
        int imagenId = imagen(productoId, 0, true);
        jdbcTemplate.update("UPDATE empleado_comercio SET estado = 'INACTIVO', fecha_baja = NOW() WHERE empleado_id = ? AND comercio_id = ?",
                e.empleado().id(), e.dueno().comercioId());

        assertThrows(ComercioNoDisponibleException.class, () -> productoService.generarFirmaImagen(e.comoEmpleado(), productoId));
        assertThrows(ComercioNoDisponibleException.class, () -> productoService.generarFirmaRecorteImagen(e.comoEmpleado(), productoId, imagenId));
    }

    @Test
    void siLaDesactivacionGanaLaCarreraLasFirmasEsperanYResponden404() throws Exception {
        Escenario e = escenario();
        int productoId = producto(e);
        int imagenId = imagen(productoId, 0, true);
        ExecutorService hilos = Executors.newFixedThreadPool(3);
        CountDownLatch relacionTomada = new CountDownLatch(1);
        CountDownLatch firmasLanzadas = new CountDownLatch(2);
        try {
            Future<?> desactivacion = hilos.submit(() -> new TransactionTemplate(transactionManager).executeWithoutResult(status -> {
                jdbcTemplate.queryForList("SELECT id FROM empleado_comercio WHERE empleado_id = ? AND comercio_id = ? FOR UPDATE",
                        e.empleado().id(), e.dueno().comercioId());
                relacionTomada.countDown();
                esperar(firmasLanzadas);
                pausa(700);
                jdbcTemplate.update("UPDATE empleado_comercio SET estado = 'INACTIVO', fecha_baja = NOW() WHERE empleado_id = ? AND comercio_id = ?",
                        e.empleado().id(), e.dueno().comercioId());
            }));
            assertTrue(relacionTomada.await(15, TimeUnit.SECONDS));

            Future<?> firmaImagen = hilos.submit(() -> {
                firmasLanzadas.countDown();
                return productoService.generarFirmaImagen(e.comoEmpleado(), productoId);
            });
            Future<?> firmaRecorte = hilos.submit(() -> {
                firmasLanzadas.countDown();
                return productoService.generarFirmaRecorteImagen(e.comoEmpleado(), productoId, imagenId);
            });

            desactivacion.get(30, TimeUnit.SECONDS);
            for (Future<?> firma : List.of(firmaImagen, firmaRecorte)) {
                ExecutionException fallo = assertThrows(ExecutionException.class, () -> firma.get(30, TimeUnit.SECONDS));
                assertInstanceOf(ComercioNoDisponibleException.class, fallo.getCause());
            }
        } finally {
            hilos.shutdownNow();
        }
    }

    @Test
    void conElComercioSuspendidoLasFirmasDelEmpleadoDan409YLasDelDuenoSiguenFuncionando() {
        Escenario e = escenario();
        int productoId = producto(e);
        int imagenId = imagen(productoId, 0, true);
        datos.cambiarEstadoComercio(e.dueno().comercioId(), "SUSPENDIDO");

        ConflictoComercioException firma = assertThrows(ConflictoComercioException.class,
                () -> productoService.generarFirmaImagen(e.comoEmpleado(), productoId));
        assertEquals(ConflictoComercioException.SUSPENDIDO, firma.getCodigo());
        assertThrows(ConflictoComercioException.class, () -> productoService.generarFirmaRecorteImagen(e.comoEmpleado(), productoId, imagenId));

        assertNotNull(productoService.generarFirmaImagen(e.comoDueno(), productoId));
        assertNotNull(productoService.generarFirmaRecorteImagen(e.comoDueno(), productoId, imagenId));
    }

    private static void esperar(CountDownLatch latch) {
        try {
            latch.await(15, TimeUnit.SECONDS);
        } catch (InterruptedException ex) {
            Thread.currentThread().interrupt();
        }
    }

    private static void pausa(long milisegundos) {
        try {
            Thread.sleep(milisegundos);
        } catch (InterruptedException ex) {
            Thread.currentThread().interrupt();
        }
    }
}
