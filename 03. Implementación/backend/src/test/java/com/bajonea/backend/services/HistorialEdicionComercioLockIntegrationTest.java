package com.bajonea.backend.services;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.bajonea.backend.config.security.ComercioActivo;
import com.bajonea.backend.dto.request.ComercioPerfilRequestDTO;
import com.bajonea.backend.enums.EstadoComercio;
import com.bajonea.backend.services.DatosPruebaEmpleado.Dueno;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Orden de bloqueo de las escrituras auditadas (bloque A1 de E3): el registro en {@code historial_edicion_comercio}
 * toma un bloqueo compartido sobre {@code usuario} y sobre {@code comercio} por sus claves foráneas, así que quien
 * escribe toma primero la fila del usuario que actúa. El bloqueo de cuenta del Dueño hace lo mismo que esta
 * prueba simula: bloquea el usuario y después pide el comercio. Si la escritura tomara el comercio antes que el
 * usuario, las dos transacciones se esperarían entre sí (interbloqueo). Acá la escritura espera su turno y las dos
 * terminan.
 */
@SpringBootTest
@ActiveProfiles("test")
class HistorialEdicionComercioLockIntegrationTest {

    @Autowired
    private ComercioService comercioService;

    @Autowired
    private RegistroService registroService;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private PlatformTransactionManager transactionManager;

    @MockitoBean
    private EmailService emailService;

    @Test
    void unaEscrituraAuditadaNoSeInterbloqueaConQuienTomaElUsuarioYDespuesElComercio() throws Exception {
        Dueno dueno = new DatosPruebaEmpleado(registroService, objectMapper, jdbcTemplate).registrarDuenoAprobado();
        ComercioActivo actor = ComercioActivo.delDueno(dueno.comercioId(), dueno.id(), EstadoComercio.APROBADO);
        ExecutorService hilos = Executors.newFixedThreadPool(2);
        CountDownLatch usuarioTomado = new CountDownLatch(1);
        CountDownLatch escrituraLanzada = new CountDownLatch(1);

        try {
            Future<?> bloqueoDeCuenta = hilos.submit(() -> new TransactionTemplate(transactionManager).executeWithoutResult(status -> {
                jdbcTemplate.queryForList("SELECT id FROM usuario WHERE id = ? FOR UPDATE", dueno.id());
                usuarioTomado.countDown();
                esperar(escrituraLanzada);
                pausa(600);
                jdbcTemplate.queryForList("SELECT id FROM comercio WHERE id = ? FOR UPDATE", dueno.comercioId());
            }));
            assertTrue(usuarioTomado.await(15, TimeUnit.SECONDS));

            Future<?> escritura = hilos.submit(() -> {
                escrituraLanzada.countDown();
                comercioService.editarPerfil(actor, new ComercioPerfilRequestDTO("Nombre Nuevo Lock", "descripcion", "+5492964333333",
                        "lock@bajonea.test", true, false));
            });

            bloqueoDeCuenta.get(30, TimeUnit.SECONDS);
            escritura.get(30, TimeUnit.SECONDS);
        } finally {
            hilos.shutdownNow();
        }

        assertEquals("Nombre Nuevo Lock", jdbcTemplate.queryForObject("SELECT nombre FROM comercio WHERE id = ?", String.class,
                dueno.comercioId()));
        assertEquals(1, jdbcTemplate.queryForObject("SELECT COUNT(*) FROM historial_edicion_comercio WHERE comercio_id = ?",
                Integer.class, dueno.comercioId()));
    }

    @Test
    void variasEdicionesDelPerfilALaVezNoSeInterbloquean() throws Exception {
        Dueno dueno = new DatosPruebaEmpleado(registroService, objectMapper, jdbcTemplate).registrarDuenoAprobado();
        ComercioActivo actor = ComercioActivo.delDueno(dueno.comercioId(), dueno.id(), EstadoComercio.APROBADO);
        int hilos = 6;
        int rondas = 6;
        ExecutorService pool = Executors.newFixedThreadPool(hilos);
        List<Throwable> fallos = new CopyOnWriteArrayList<>();

        try {
            for (int ronda = 0; ronda < rondas; ronda++) {
                CyclicBarrier largada = new CyclicBarrier(hilos);
                List<Future<?>> tareas = new ArrayList<>();
                for (int i = 0; i < hilos; i++) {
                    String telefono = "+549296" + (1_000_000 + ronda * 100 + i);
                    tareas.add(pool.submit(() -> {
                        try {
                            largada.await(10, TimeUnit.SECONDS);
                            comercioService.editarPerfil(actor, new ComercioPerfilRequestDTO("Comercio Concurrente", "descripcion", telefono,
                                    "concurrente@bajonea.test", true, false));
                        } catch (Exception e) {
                            fallos.add(e);
                        }
                        return null;
                    }));
                }
                for (Future<?> tarea : tareas) {
                    tarea.get(60, TimeUnit.SECONDS);
                }
            }
        } finally {
            pool.shutdownNow();
        }

        assertTrue(fallos.isEmpty(), "Ediciones concurrentes del perfil fallaron: " + fallos);
        int filas = jdbcTemplate.queryForObject("SELECT COUNT(*) FROM historial_edicion_comercio WHERE comercio_id = ?", Integer.class,
                dueno.comercioId());
        assertTrue(filas >= 1 && filas <= hilos * rondas, "Filas de historial inesperadas: " + filas);
    }

    private static void esperar(CountDownLatch latch) {
        try {
            latch.await(15, TimeUnit.SECONDS);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }

    private static void pausa(long milisegundos) {
        try {
            Thread.sleep(milisegundos);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }
}
