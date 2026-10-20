package com.bajonea.backend.services;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.bajonea.backend.config.security.ComercioActivo;
import com.bajonea.backend.dto.request.HorarioRequestDTO;
import com.bajonea.backend.enums.DiaSemana;
import com.bajonea.backend.enums.EstadoComercio;
import com.bajonea.backend.enums.RolActorComercio;
import com.bajonea.backend.exceptions.ComercioNoDisponibleException;
import com.bajonea.backend.exceptions.ConflictoComercioException;
import com.bajonea.backend.services.DatosPruebaEmpleado.Cuenta;
import com.bajonea.backend.services.DatosPruebaEmpleado.Dueno;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Callable;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
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
 * Carreras de la edición de horarios (Fase 2, T1) contra {@code bajonea_test}: ediciones simultáneas del mismo
 * comercio, lecturas durante las ediciones (nunca una ventana sin franjas vigentes) y la edición de un Empleado
 * contra su desactivación. Cada prueba muerde si se quita el {@code FOR UPDATE} del comercio, si se reordena el
 * bloqueo del usuario y del comercio o si la edición borra y reinserta en vez de versionar.
 */
@SpringBootTest
@ActiveProfiles("test")
class HorarioEdicionConcurrenciaIntegrationTest {

    @Autowired
    private RegistroService registroService;

    @Autowired
    private HorarioEdicionService horarioEdicionService;

    @Autowired
    private GestionMiembroEquipoService gestion;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private Clock clock;

    @Autowired
    private PlatformTransactionManager transactionManager;

    @MockitoBean
    private EmailService emailService;

    private DatosPruebaEmpleado datos;
    private LocalDate hoy;

    @BeforeEach
    void preparar() {
        datos = new DatosPruebaEmpleado(registroService, objectMapper, jdbcTemplate);
        hoy = LocalDate.now(clock);
    }

    private record Escena(Dueno dueno, Cuenta empleado, ComercioActivo comoDueno, ComercioActivo comoEmpleado) {
    }

    private Escena escena() {
        Dueno dueno = datos.registrarDuenoAprobado();
        datos.cambiarEstadoUsuario(dueno.id(), "ACTIVO");
        Cuenta empleado = datos.registrarClienteConCredenciales();
        datos.vincularEmpleado(empleado.id(), dueno.comercioId(), "ACTIVO", LocalDateTime.now().minusDays(1));
        return new Escena(dueno, empleado,
                ComercioActivo.delDueno(dueno.comercioId(), dueno.id(), EstadoComercio.APROBADO),
                new ComercioActivo(dueno.comercioId(), dueno.id(), empleado.id(), RolActorComercio.EMPLEADO, EstadoComercio.APROBADO));
    }

    private static List<HorarioRequestDTO> version(int n) {
        DiaSemana[] dias = DiaSemana.values();
        List<HorarioRequestDTO> franjas = new ArrayList<>();
        for (int i = 0; i <= n % 3; i++) {
            franjas.add(new HorarioRequestDTO(dias[(n + i) % 7], LocalTime.of(8 + n % 4, 0), LocalTime.of(14 + n % 4, 0)));
        }
        return franjas;
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
            resultados.add(futuro.get(90, TimeUnit.SECONDS));
        }
        pool.shutdownNow();
        return resultados;
    }

    private int contar(String sql, Object... parametros) {
        return jdbcTemplate.queryForObject(sql, Integer.class, parametros);
    }

    @Test
    void edicionesSimultaneasDelDuenoYElEmpleadoSeSerializanYDejanUnaSolaGeneracionPendiente() throws Exception {
        for (int ronda = 0; ronda < 3; ronda++) {
            Escena e = escena();
            List<Callable<Object>> tareas = new ArrayList<>();
            for (int i = 0; i < 8; i++) {
                int n = i;
                ComercioActivo actor = i % 2 == 0 ? e.comoDueno() : e.comoEmpleado();
                tareas.add(() -> horarioEdicionService.editarHorarios(actor, version(n)));
            }

            List<Object> resultados = correrJuntas(tareas);

            for (Object resultado : resultados) {
                assertTrue(!(resultado instanceof Throwable), "una edición falló: " + resultado);
            }
            int comercioId = e.dueno().comercioId();
            int pendientes = contar("SELECT COUNT(*) FROM horario WHERE comercio_id = ? AND vigente_desde > ?", comercioId, hoy);
            int cerradasHoy = contar("SELECT COUNT(*) FROM horario WHERE comercio_id = ? AND vigente_hasta = ?", comercioId, hoy);
            int vigentesHoy = contar("SELECT COUNT(*) FROM horario WHERE comercio_id = ? AND vigente_desde <= ? "
                    + "AND (vigente_hasta IS NULL OR vigente_hasta >= ?)", comercioId, hoy, hoy);
            assertEquals(1, cerradasHoy, "la versión de partida se cierra una sola vez");
            assertEquals(1, vigentesHoy, "lo vigente de hoy sigue siendo la versión de partida");
            assertTrue(pendientes >= 1 && pendientes <= 3, "queda una sola versión pendiente: " + pendientes);
            assertEquals(0, contar("SELECT COUNT(*) FROM horario WHERE comercio_id = ? AND vigente_desde > ? AND vigente_hasta IS NOT NULL",
                    comercioId, hoy));
            assertEquals(8, contar("SELECT COUNT(*) FROM historial_edicion_comercio WHERE comercio_id = ? AND entidad_tipo = 'HORARIO'", comercioId));
        }
    }

    @Test
    void unaLecturaNuncaVeLaVentanaSinFranjasVigentesDuranteLasEdiciones() throws Exception {
        Escena e = escena();
        int comercioId = e.dueno().comercioId();
        AtomicBoolean seguir = new AtomicBoolean(true);
        AtomicInteger lecturasVacias = new AtomicInteger();
        AtomicInteger lecturas = new AtomicInteger();
        ExecutorService lectores = Executors.newFixedThreadPool(3);
        List<Future<?>> futuros = new ArrayList<>();
        for (int i = 0; i < 3; i++) {
            futuros.add(lectores.submit(() -> {
                while (seguir.get()) {
                    int vigentes = jdbcTemplate.queryForObject("SELECT COUNT(*) FROM horario WHERE comercio_id = ? AND vigente_desde <= ? "
                            + "AND (vigente_hasta IS NULL OR vigente_hasta >= ?)", Integer.class, comercioId, hoy, hoy);
                    lecturas.incrementAndGet();
                    if (vigentes == 0) {
                        lecturasVacias.incrementAndGet();
                    }
                }
            }));
        }
        try {
            for (int i = 0; i < 12; i++) {
                horarioEdicionService.editarHorarios(i % 2 == 0 ? e.comoDueno() : e.comoEmpleado(), version(i));
            }
        } finally {
            seguir.set(false);
            for (Future<?> futuro : futuros) {
                futuro.get(30, TimeUnit.SECONDS);
            }
            lectores.shutdownNow();
        }

        assertTrue(lecturas.get() > 0);
        assertEquals(0, lecturasVacias.get(), "hubo lecturas sin ninguna franja vigente");
    }

    @Test
    void laEdicionDelEmpleadoContraSuDesactivacionDaOkOElMismo404SinOtroError() throws Exception {
        for (int ronda = 0; ronda < 4; ronda++) {
            Escena e = escena();
            List<Object> resultados = correrJuntas(List.of(
                    () -> horarioEdicionService.editarHorarios(e.comoEmpleado(), version(1)),
                    () -> gestion.desactivar(e.comoDueno(), e.empleado().id())));

            Object edicion = resultados.get(0);
            Object baja = resultados.get(1);
            assertTrue(!(baja instanceof Throwable), "la baja falló: " + baja);
            if (edicion instanceof Throwable error) {
                assertTrue(error instanceof ComercioNoDisponibleException, "error inesperado: " + error);
                assertEquals(0, contar("SELECT COUNT(*) FROM historial_edicion_comercio WHERE comercio_id = ? AND entidad_tipo = 'HORARIO'",
                        e.dueno().comercioId()));
            } else {
                assertEquals(1, contar("SELECT COUNT(*) FROM historial_edicion_comercio WHERE comercio_id = ? AND entidad_tipo = 'HORARIO'",
                        e.dueno().comercioId()));
            }
            assertEquals("INACTIVO", jdbcTemplate.queryForObject("SELECT estado FROM empleado_comercio WHERE empleado_id = ? AND comercio_id = ?",
                    String.class, e.empleado().id(), e.dueno().comercioId()));
        }
    }

    @Test
    void laEdicionDelEmpleadoEsperaALaSuspensionEnCursoYLaVeConfirmadaEnVezDeLeerElEstadoViejo() throws Exception {
        for (int ronda = 0; ronda < 2; ronda++) {
            Escena e = escena();
            int comercioId = e.dueno().comercioId();
            ExecutorService hilos = Executors.newFixedThreadPool(2);
            java.util.concurrent.CountDownLatch bloqueado = new java.util.concurrent.CountDownLatch(1);
            try {
                Future<?> suspension = hilos.submit(() -> new TransactionTemplate(transactionManager).executeWithoutResult(status -> {
                    jdbcTemplate.queryForObject("SELECT id FROM comercio WHERE id = ? FOR UPDATE", Integer.class, comercioId);
                    jdbcTemplate.update("UPDATE comercio SET estado = 'SUSPENDIDO' WHERE id = ?", comercioId);
                    bloqueado.countDown();
                    try {
                        Thread.sleep(1500);
                    } catch (InterruptedException ex) {
                        Thread.currentThread().interrupt();
                    }
                }));
                assertTrue(bloqueado.await(15, TimeUnit.SECONDS));
                Future<Object> edicion = hilos.submit(() -> {
                    try {
                        return horarioEdicionService.editarHorarios(e.comoEmpleado(), version(1));
                    } catch (Throwable ex) {
                        return ex;
                    }
                });
                suspension.get(30, TimeUnit.SECONDS);
                Object resultado = edicion.get(30, TimeUnit.SECONDS);

                assertTrue(resultado instanceof ConflictoComercioException, "la edicion tenia que ver la suspension confirmada: " + resultado);
                assertEquals(1, contar("SELECT COUNT(*) FROM horario WHERE comercio_id = ?", comercioId));
            } finally {
                hilos.shutdownNow();
            }
        }
    }
}
