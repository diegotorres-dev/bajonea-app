package com.bajonea.backend.services;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.bajonea.backend.config.security.ComercioActivo;
import com.bajonea.backend.dto.request.AceptarInvitacionEmpleadoRequestDTO;
import com.bajonea.backend.enums.EstadoComercio;
import com.bajonea.backend.enums.EstadoEmpleadoComercio;
import com.bajonea.backend.enums.MotivoHistorialEmpleado;
import com.bajonea.backend.exceptions.ComercioNoDisponibleException;
import com.bajonea.backend.exceptions.ConflictoComercioException;
import com.bajonea.backend.exceptions.ConflictoDeNegocioException;
import com.bajonea.backend.services.DatosPruebaEmpleado.Cuenta;
import com.bajonea.backend.services.DatosPruebaEmpleado.Dueno;
import com.bajonea.backend.services.GestionMiembroEquipoService.ResultadoCambio;
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
 * Carreras de desactivar y reactivar a un miembro del equipo (E4, bloque A1) contra {@code bajonea_test}, con
 * latches y barreras para fijar el orden de los hechos. Cada prueba tiene la mutación que la hace fallar (ver
 * {@code docs/DECISIONES.md}): S1 sin el {@code FOR UPDATE} de la relación (la baja se fecha antes de esperar),
 * S2 y S4 con la relación leída compartida y escrita después (interbloqueo) o sin revalidar el estado
 * (dos bajas), S5 sin comprobar la invitación pendiente y S10 decidiendo "reactivable" con una lectura anterior
 * al bloqueo (foto vieja).
 */
@SpringBootTest
@ActiveProfiles("test")
class GestionMiembroEquipoConcurrenciaIntegrationTest {

    @Autowired
    private RegistroService registroService;

    @Autowired
    private GestionMiembroEquipoService gestion;

    @Autowired
    private InvitacionEmpleadoService invitaciones;

    @Autowired
    private ComercioActivoService comercioActivoService;

    @Autowired
    private TestSupportService testSupportService;

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

    private Escena escena(String estadoRelacion) {
        Dueno dueno = datos.registrarDuenoAprobado();
        datos.cambiarEstadoUsuario(dueno.id(), "ACTIVO");
        Cuenta empleado = datos.registrarClienteConCredenciales();
        int relacionId = datos.vincularEmpleado(empleado.id(), dueno.comercioId(), estadoRelacion, LocalDateTime.now().minusDays(2));
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

    private int avisos(int usuarioId, String tipo) {
        return jdbcTemplate.queryForObject("SELECT COUNT(*) FROM notificacion WHERE usuario_id = ? AND tipo = ?", Integer.class, usuarioId, tipo);
    }

    /** Ejecuta las tareas a la vez (largada con barrera) y devuelve el resultado o la excepción de cada una. */
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

    @Test
    void desactivarEsperaALaEscrituraDelEmpleadoQueYaValidoSuRelacionYFechaLaBajaDespues() throws Exception {
        for (int ronda = 0; ronda < 2; ronda++) {
            Escena e = escena("ACTIVO");
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

                Future<ResultadoCambio> baja = hilos.submit(() -> gestion.desactivar(e.activo(), e.empleado().id()));
                escribe.get(30, TimeUnit.SECONDS);
                assertTrue(baja.get(30, TimeUnit.SECONDS).huboCambio());
            } finally {
                hilos.shutdownNow();
            }

            LocalDateTime fechaBaja = jdbcTemplate.queryForObject("SELECT fecha_baja FROM empleado_comercio WHERE id = ?", LocalDateTime.class, e.relacionId());
            assertNotNull(escritura.get());
            assertFalse(fechaBaja.isBefore(escritura.get()),
                    "ronda " + ronda + ": la baja (" + fechaBaja + ") se fecha antes de la escritura que ya estaba confirmada (" + escritura.get() + ")");
            assertThrows(ComercioNoDisponibleException.class, () -> new TransactionTemplate(transactionManager).executeWithoutResult(
                    status -> comercioActivoService.exigirRelacionActiva(e.empleado().id(), e.dueno().comercioId())));
        }
    }

    @Test
    void variasBajasYReactivacionesSimultaneasNoDanErroresYDejanElHistorialAlternado() throws Exception {
        for (int ronda = 0; ronda < 6; ronda++) {
            Escena e = escena("ACTIVO");
            List<Callable<Object>> tareas = new ArrayList<>();
            for (int i = 0; i < 4; i++) {
                tareas.add(() -> gestion.desactivar(e.activo(), e.empleado().id()));
                tareas.add(() -> gestion.reactivar(e.activo(), e.empleado().id()));
            }
            List<Object> resultados = correrJuntas(tareas);

            assertTrue(fallos(resultados).isEmpty(), "ronda " + ronda + ": " + fallos(resultados));
            List<String> motivos = motivos(e.relacionId());
            for (int i = 0; i < motivos.size(); i++) {
                assertEquals(i % 2 == 0 ? "BAJA_DUENO" : "REACTIVACION", motivos.get(i), "ronda " + ronda + ": " + motivos);
            }
            boolean ultimaFueBaja = !motivos.isEmpty() && motivos.size() % 2 == 1;
            assertEquals(ultimaFueBaja ? "INACTIVO" : "ACTIVO", estadoRelacion(e.relacionId()), "ronda " + ronda + ": " + motivos);
            assertEquals(motivos.stream().filter("BAJA_DUENO"::equals).count(), avisos(e.empleado().id(), "EMPLEADO_DESACTIVADO"));
            assertEquals(motivos.stream().filter("REACTIVACION"::equals).count(), avisos(e.empleado().id(), "EMPLEADO_REACTIVADO"));
        }
    }

    @Test
    void variasDesactivacionesSimultaneasEscribenUnaSolaBajaUnAvisoYGanaLaPrimera() throws Exception {
        for (int ronda = 0; ronda < 6; ronda++) {
            Escena e = escena("ACTIVO");
            List<Callable<Object>> tareas = new ArrayList<>();
            for (int i = 0; i < 4; i++) {
                tareas.add(() -> gestion.desactivar(e.activo(), e.empleado().id()));
            }
            List<Object> resultados = correrJuntas(tareas);

            assertTrue(fallos(resultados).isEmpty(), "ronda " + ronda + ": " + fallos(resultados));
            long conCambio = resultados.stream().map(ResultadoCambio.class::cast).filter(ResultadoCambio::huboCambio).count();
            assertEquals(1, conCambio, "ronda " + ronda + ": una sola desactivación hace el cambio");
            assertEquals(List.of("BAJA_DUENO"), motivos(e.relacionId()), "ronda " + ronda);
            assertEquals(1, avisos(e.empleado().id(), "EMPLEADO_DESACTIVADO"), "ronda " + ronda);
            assertEquals("INACTIVO", estadoRelacion(e.relacionId()));
        }
    }

    private String invitar(Escena e) {
        invitaciones.invitar(e.activo(), e.empleado().email());
        return jdbcTemplate.queryForObject("SELECT codigo FROM invitacion_empleado WHERE comercio_id = ? AND email = ? AND estado = 'PENDIENTE'",
                String.class, e.dueno().comercioId(), e.empleado().email());
    }

    private AceptarInvitacionEmpleadoRequestDTO aceptar(String email, String codigo) {
        AceptarInvitacionEmpleadoRequestDTO request = new AceptarInvitacionEmpleadoRequestDTO();
        request.setEmail(email);
        request.setCodigo(codigo);
        return request;
    }

    private int pendientesVigentes(Escena e) {
        return jdbcTemplate.queryForObject("SELECT COUNT(*) FROM invitacion_empleado WHERE comercio_id = ? AND email = ? AND estado = 'PENDIENTE' "
                + "AND fecha_vencimiento > ?", Integer.class, e.dueno().comercioId(), e.empleado().email(), LocalDateTime.now(clock));
    }

    @Test
    void reactivarEInvitarSimultaneosNuncaDejanActivoConUnaInvitacionPendienteVigente() throws Exception {
        for (int ronda = 0; ronda < 12; ronda++) {
            Escena e = escena("ACTIVO");
            gestion.desactivar(e.activo(), e.empleado().id());

            List<Object> resultados = correrJuntas(List.of(
                    () -> gestion.reactivar(e.activo(), e.empleado().id()),
                    () -> invitaciones.invitar(e.activo(), e.empleado().email())));

            for (Throwable fallo : fallos(resultados)) {
                assertTrue(fallo instanceof ConflictoComercioException || fallo instanceof ConflictoDeNegocioException,
                        "ronda " + ronda + ": error inesperado " + fallo);
            }
            boolean activo = "ACTIVO".equals(estadoRelacion(e.relacionId()));
            assertFalse(activo && pendientesVigentes(e) > 0,
                    "ronda " + ronda + ": la relación quedó ACTIVA con una invitación pendiente vigente " + motivos(e.relacionId()));
        }
    }

    @Test
    void reactivarYQueLaPersonaAcepteSuInvitacionSimultaneosNoReactivanDosVeces() throws Exception {
        for (int ronda = 0; ronda < 12; ronda++) {
            Escena e = escena("ACTIVO");
            gestion.desactivar(e.activo(), e.empleado().id());
            String codigo = invitar(e);

            List<Object> resultados = correrJuntas(List.of(
                    () -> gestion.reactivar(e.activo(), e.empleado().id()),
                    () -> invitaciones.aceptar(aceptar(e.empleado().email(), codigo))));

            for (Throwable fallo : fallos(resultados)) {
                assertTrue(fallo instanceof ConflictoComercioException, "ronda " + ronda + ": error inesperado " + fallo);
            }
            assertEquals("ACTIVO", estadoRelacion(e.relacionId()), "ronda " + ronda);
            assertEquals(0, jdbcTemplate.queryForObject("SELECT COUNT(*) FROM historial_empleado_comercio WHERE empleado_comercio_id = ? "
                    + "AND motivo = 'REACTIVACION' AND invitacion_id IS NULL", Integer.class, e.relacionId()),
                    "ronda " + ronda + ": con una invitación pendiente vigente el Dueño no reactiva directamente " + motivos(e.relacionId()));
            assertEquals(1, jdbcTemplate.queryForObject("SELECT COUNT(*) FROM historial_empleado_comercio WHERE empleado_comercio_id = ? "
                    + "AND motivo = 'REACTIVACION'", Integer.class, e.relacionId()), "ronda " + ronda);
        }
    }

    @Test
    void reactivarUnaRenunciaYQueLaPersonaAcepteUnaInvitacionNuevaQuedaActivaSoloPorLaInvitacion() throws Exception {
        for (int ronda = 0; ronda < 12; ronda++) {
            Escena e = escena("ACTIVO");
            testSupportService.cambiarEstadoRelacionEmpleado(e.dueno().comercioId(), e.empleado().id(), EstadoEmpleadoComercio.INACTIVO,
                    MotivoHistorialEmpleado.RENUNCIA);
            String codigo = invitar(e);

            List<Object> resultados = correrJuntas(List.of(
                    () -> gestion.reactivar(e.activo(), e.empleado().id()),
                    () -> invitaciones.aceptar(aceptar(e.empleado().email(), codigo))));

            for (Throwable fallo : fallos(resultados)) {
                assertTrue(fallo instanceof ConflictoComercioException, "ronda " + ronda + ": error inesperado " + fallo);
            }
            assertEquals("ACTIVO", estadoRelacion(e.relacionId()), "ronda " + ronda);
            assertEquals(1, jdbcTemplate.queryForObject("SELECT COUNT(*) FROM historial_empleado_comercio WHERE empleado_comercio_id = ? "
                    + "AND motivo = 'REACTIVACION' AND invitacion_id IS NOT NULL", Integer.class, e.relacionId()), "ronda " + ronda);
            assertEquals(0, jdbcTemplate.queryForObject("SELECT COUNT(*) FROM historial_empleado_comercio WHERE empleado_comercio_id = ? "
                    + "AND motivo = 'REACTIVACION' AND invitacion_id IS NULL", Integer.class, e.relacionId()), "ronda " + ronda);
        }
    }

    @Test
    void laDecisionDeReactivarSeTomaConLaRelacionBloqueadaYNoConUnaFotoAnteriorAEseBloqueo() throws Exception {
        for (int ronda = 0; ronda < 3; ronda++) {
            Escena e = escena("ACTIVO");
            gestion.desactivar(e.activo(), e.empleado().id());
            ExecutorService hilos = Executors.newFixedThreadPool(2);
            CountDownLatch relacionTomada = new CountDownLatch(1);
            CountDownLatch reactivarLanzado = new CountDownLatch(1);
            try {
                Future<?> cambio = hilos.submit(() -> new TransactionTemplate(transactionManager).executeWithoutResult(status -> {
                    jdbcTemplate.queryForObject("SELECT id FROM empleado_comercio WHERE id = ? FOR UPDATE", Integer.class, e.relacionId());
                    relacionTomada.countDown();
                    esperar(reactivarLanzado);
                    pausa(1200);
                    LocalDateTime ahora = LocalDateTime.now(clock);
                    jdbcTemplate.update("INSERT INTO historial_empleado_comercio (comercio_id, empleado_comercio_id, estado_origen, estado_destino, "
                            + "motivo, actor_usuario_id, fecha_hora) VALUES (?, ?, 'INACTIVO', 'ACTIVO', 'REACTIVACION', ?, ?)",
                            e.dueno().comercioId(), e.relacionId(), e.empleado().id(), ahora);
                    jdbcTemplate.update("INSERT INTO historial_empleado_comercio (comercio_id, empleado_comercio_id, estado_origen, estado_destino, "
                            + "motivo, actor_usuario_id, fecha_hora) VALUES (?, ?, 'ACTIVO', 'INACTIVO', 'RENUNCIA', ?, ?)",
                            e.dueno().comercioId(), e.relacionId(), e.empleado().id(), ahora);
                    jdbcTemplate.update("UPDATE empleado_comercio SET estado = 'INACTIVO', fecha_baja = ? WHERE id = ?", ahora, e.relacionId());
                }));
                esperar(relacionTomada);

                Future<?> reactivar = hilos.submit(() -> {
                    reactivarLanzado.countDown();
                    gestion.reactivar(e.activo(), e.empleado().id());
                });
                cambio.get(30, TimeUnit.SECONDS);
                Throwable resultado = assertThrows(java.util.concurrent.ExecutionException.class, () -> reactivar.get(30, TimeUnit.SECONDS)).getCause();
                assertTrue(resultado instanceof ConflictoComercioException conflicto
                                && ConflictoComercioException.EMPLEADO_NO_REACTIVABLE.equals(conflicto.getCodigo()),
                        "ronda " + ronda + ": " + resultado);
            } finally {
                hilos.shutdownNow();
            }

            assertEquals("INACTIVO", estadoRelacion(e.relacionId()), "ronda " + ronda);
            assertEquals(0, jdbcTemplate.queryForObject("SELECT COUNT(*) FROM historial_empleado_comercio WHERE empleado_comercio_id = ? "
                    + "AND motivo = 'REACTIVACION' AND actor_usuario_id = ?", Integer.class, e.relacionId(), e.dueno().id()),
                    "ronda " + ronda + ": el Dueño no reactivó a quien acababa de renunciar");
        }
    }
}
