package com.bajonea.backend.services;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.bajonea.backend.config.security.ComercioActivo;
import com.bajonea.backend.enums.EstadoComercio;
import com.bajonea.backend.exceptions.ComercioNoDisponibleException;
import com.bajonea.backend.services.DatosPruebaEmpleado.Cuenta;
import com.bajonea.backend.services.DatosPruebaEmpleado.Dueno;
import com.bajonea.backend.services.GestionMiembroEquipoService.ResultadoCambio;
import com.bajonea.backend.services.GestionMiembroEquipoService.ResultadoRenuncia;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Clock;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Carreras de la renuncia del Empleado (E4, bloque A2) contra {@code bajonea_test}, con latches y barreras para
 * fijar el orden de los hechos. S3: renunciar contra desactivar (una sola baja y a lo sumo un aviso); S7: la renuncia
 * contra una escritura propia del Empleado que ya validó su relación. Mutaciones que las hacen fallar (ver
 * {@code docs/DECISIONES.md}): M3, no revalidar el estado después del bloqueo (dos bajas y dos avisos); M1, leer
 * la relación sin {@code FOR UPDATE} (la renuncia se fecha antes de esperar a la escritura en curso).
 */
@SpringBootTest
@ActiveProfiles("test")
class RenunciaEmpleadoConcurrenciaIntegrationTest {

    @Autowired
    private RegistroService registroService;

    @Autowired
    private GestionMiembroEquipoService gestion;

    @Autowired
    private ComercioActivoService comercioActivoService;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private PlatformTransactionManager transactionManager;

    @Autowired
    private Clock clock;

    @MockitoBean
    private EmailService emailService;

    private DatosPruebaEmpleado datos;

    @BeforeEach
    void preparar() {
        datos = new DatosPruebaEmpleado(registroService, objectMapper, jdbcTemplate);
    }

    private record Escena(Dueno dueno, Cuenta empleado, int relacionId, ComercioActivo activo) {
    }

    private Escena escena() {
        Dueno dueno = datos.registrarDuenoAprobado();
        datos.cambiarEstadoUsuario(dueno.id(), "ACTIVO");
        Cuenta empleado = datos.registrarClienteConCredenciales();
        int relacionId = datos.vincularEmpleado(empleado.id(), dueno.comercioId(), "ACTIVO", LocalDateTime.now().minusDays(2));
        return new Escena(dueno, empleado, relacionId, ComercioActivo.delDueno(dueno.comercioId(), dueno.id(), EstadoComercio.APROBADO));
    }

    private static void esperar(CountDownLatch latch) {
        try {
            assertTrue(latch.await(15, TimeUnit.SECONDS), "el latch no se liberó a tiempo");
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

    private String estadoRelacion(int relacionId) {
        return jdbcTemplate.queryForObject("SELECT estado FROM empleado_comercio WHERE id = ?", String.class, relacionId);
    }

    private List<String> motivos(int relacionId) {
        return jdbcTemplate.queryForList("SELECT motivo FROM historial_empleado_comercio WHERE empleado_comercio_id = ? ORDER BY id",
                String.class, relacionId);
    }

    private int avisosDeBaja(Escena e) {
        return jdbcTemplate.queryForObject("SELECT COUNT(*) FROM notificacion WHERE usuario_id IN (?, ?) AND tipo = 'EMPLEADO_DESACTIVADO'",
                Integer.class, e.empleado().id(), e.dueno().id());
    }

    private List<Object> correrJuntas(List<Callable<Object>> tareas) throws Exception {
        ExecutorService pool = Executors.newFixedThreadPool(tareas.size());
        CyclicBarrier largada = new CyclicBarrier(tareas.size());
        List<Future<Object>> futuros = new ArrayList<>();
        for (Callable<Object> tarea : tareas) {
            futuros.add(pool.submit(() -> {
                largada.await(15, TimeUnit.SECONDS);
                try {
                    return tarea.call();
                } catch (Throwable ex) {
                    return ex;
                }
            }));
        }
        List<Object> resultados = new ArrayList<>();
        for (Future<Object> futuro : futuros) {
            resultados.add(futuro.get(60, TimeUnit.SECONDS));
        }
        pool.shutdownNow();
        return resultados;
    }

    private static List<Throwable> fallos(List<Object> resultados) {
        return resultados.stream().filter(Throwable.class::isInstance).map(Throwable.class::cast).toList();
    }

    private static long conCambio(List<Object> resultados) {
        return resultados.stream().filter(resultado -> resultado instanceof ResultadoCambio cambio ? cambio.huboCambio()
                : resultado instanceof ResultadoRenuncia renuncia && renuncia.huboCambio()).count();
    }

    @Test
    void renunciarYDesactivarSimultaneosEscribenUnaSolaBajaYAlSumoUnAviso() throws Exception {
        for (int ronda = 0; ronda < 8; ronda++) {
            Escena e = escena();
            List<Callable<Object>> tareas = new ArrayList<>();
            for (int i = 0; i < 2; i++) {
                tareas.add(() -> gestion.renunciar(e.empleado().id(), e.dueno().comercioId()));
                tareas.add(() -> gestion.desactivar(e.activo(), e.empleado().id()));
            }
            List<Object> resultados = correrJuntas(tareas);

            assertTrue(fallos(resultados).isEmpty(), "ronda " + ronda + ": " + fallos(resultados));
            assertEquals(1, conCambio(resultados), "ronda " + ronda + ": una sola operación hace el cambio");
            List<String> motivos = motivos(e.relacionId());
            assertEquals(1, motivos.size(), "ronda " + ronda + ": una sola fila de baja " + motivos);
            assertTrue(motivos.get(0).equals("BAJA_DUENO") || motivos.get(0).equals("RENUNCIA"), "ronda " + ronda + ": " + motivos);
            assertEquals(1, avisosDeBaja(e), "ronda " + ronda + ": el que perdió no avisa nada, el que ganó avisa a la otra parte " + motivos);
            assertEquals("INACTIVO", estadoRelacion(e.relacionId()));
        }
    }

    @Test
    void renunciarYDesactivarEncoladosDetrasLaMismaRelacionNoRepitenLaBajaAunqueAmbosLaVieronActiva() throws Exception {
        for (int ronda = 0; ronda < 4; ronda++) {
            Escena e = escena();
            ExecutorService hilos = Executors.newFixedThreadPool(3);
            CountDownLatch relacionTomada = new CountDownLatch(1);
            CountDownLatch lanzados = new CountDownLatch(2);
            try {
                Future<?> retiene = hilos.submit(() -> new TransactionTemplate(transactionManager).executeWithoutResult(status -> {
                    jdbcTemplate.queryForObject("SELECT id FROM empleado_comercio WHERE id = ? FOR UPDATE", Integer.class, e.relacionId());
                    relacionTomada.countDown();
                    esperar(lanzados);
                    pausa(900);
                }));
                esperar(relacionTomada);

                Future<Object> renuncia = hilos.submit(() -> {
                    lanzados.countDown();
                    return gestion.renunciar(e.empleado().id(), e.dueno().comercioId());
                });
                Future<Object> baja = hilos.submit(() -> {
                    lanzados.countDown();
                    return gestion.desactivar(e.activo(), e.empleado().id());
                });
                retiene.get(30, TimeUnit.SECONDS);
                List<Object> resultados = List.of(renuncia.get(30, TimeUnit.SECONDS), baja.get(30, TimeUnit.SECONDS));

                assertEquals(1, conCambio(resultados), "ronda " + ronda + ": una sola operación hace el cambio");
            } finally {
                hilos.shutdownNow();
            }

            assertEquals(1, motivos(e.relacionId()).size(), "ronda " + ronda + ": " + motivos(e.relacionId()));
            assertEquals(1, avisosDeBaja(e), "ronda " + ronda);
        }
    }

    @Test
    void renunciarEsperaALaEscrituraPropiaQueYaValidoSuRelacionYFechaLaBajaDespues() throws Exception {
        for (int ronda = 0; ronda < 2; ronda++) {
            Escena e = escena();
            ExecutorService hilos = Executors.newFixedThreadPool(2);
            CountDownLatch validada = new CountDownLatch(1);
            AtomicReference<LocalDateTime> escritura = new AtomicReference<>();
            try {
                Future<?> escribe = hilos.submit(() -> new TransactionTemplate(transactionManager).executeWithoutResult(status -> {
                    comercioActivoService.exigirRelacionActiva(e.empleado().id(), e.dueno().comercioId());
                    validada.countDown();
                    pausa(1500);
                    escritura.set(LocalDateTime.now(clock).truncatedTo(ChronoUnit.SECONDS));
                }));
                esperar(validada);

                Future<ResultadoRenuncia> renuncia = hilos.submit(() -> gestion.renunciar(e.empleado().id(), e.dueno().comercioId()));
                escribe.get(30, TimeUnit.SECONDS);
                assertTrue(renuncia.get(30, TimeUnit.SECONDS).huboCambio());
            } finally {
                hilos.shutdownNow();
            }

            LocalDateTime fechaBaja = jdbcTemplate.queryForObject("SELECT fecha_baja FROM empleado_comercio WHERE id = ?", LocalDateTime.class, e.relacionId());
            assertNotNull(escritura.get());
            assertFalse(fechaBaja.isBefore(escritura.get()),
                    "ronda " + ronda + ": la renuncia (" + fechaBaja + ") se fecha antes de la escritura que ya estaba confirmada (" + escritura.get() + ")");
            assertThrows(ComercioNoDisponibleException.class, () -> new TransactionTemplate(transactionManager).executeWithoutResult(
                    status -> comercioActivoService.exigirRelacionActiva(e.empleado().id(), e.dueno().comercioId())));
            assertEquals(List.of("RENUNCIA"), motivos(e.relacionId()), "ronda " + ronda);
        }
    }

    @Test
    void variasRenunciasSimultaneasEscribenUnaSolaFilaYUnSoloAviso() throws Exception {
        for (int ronda = 0; ronda < 6; ronda++) {
            Escena e = escena();
            List<Callable<Object>> tareas = new ArrayList<>();
            for (int i = 0; i < 5; i++) {
                tareas.add(() -> gestion.renunciar(e.empleado().id(), e.dueno().comercioId()));
            }
            List<Object> resultados = correrJuntas(tareas);

            assertTrue(fallos(resultados).isEmpty(), "ronda " + ronda + ": " + fallos(resultados));
            assertEquals(1, conCambio(resultados), "ronda " + ronda);
            assertEquals(List.of("RENUNCIA"), motivos(e.relacionId()), "ronda " + ronda);
            assertEquals(1, avisosDeBaja(e), "ronda " + ronda);
        }
    }
}
