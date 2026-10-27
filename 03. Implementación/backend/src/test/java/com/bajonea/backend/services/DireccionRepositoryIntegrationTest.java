package com.bajonea.backend.services;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.bajonea.backend.entities.Direccion;
import com.bajonea.backend.repositories.DireccionRepository;
import java.time.LocalDateTime;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * La garantía en base de una sola dirección predeterminada activa por Cliente (índice único sobre la columna generada
 * de V42) y las consultas de {@link DireccionRepository}, contra {@code bajonea_test}.
 */
@SpringBootTest
@ActiveProfiles("test")
class DireccionRepositoryIntegrationTest {

    @Autowired
    private DireccionRepository direccionRepository;

    @Autowired
    private RegistroService registroService;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private com.fasterxml.jackson.databind.ObjectMapper objectMapper;

    @Autowired
    private TransactionTemplate transactionTemplate;

    @MockitoBean
    private EmailService emailService;

    private DatosPruebaEmpleado datos;

    @BeforeEach
    void preparar() {
        datos = new DatosPruebaEmpleado(registroService, objectMapper, jdbcTemplate);
    }

    private int insertar(int clienteId, boolean principal, boolean eliminada, String calle) {
        jdbcTemplate.update("INSERT INTO direccion (calle, numero, codigo_postal, localidad_id, cliente_id, principal, eliminada, fecha_creacion) "
                + "VALUES (?, '1', '9420', '94008010', ?, ?, ?, ?)", calle, clienteId, principal, eliminada, LocalDateTime.now());
        return jdbcTemplate.queryForObject("SELECT LAST_INSERT_ID()", Integer.class);
    }

    @Test
    void elIndiceUnicoRechazaUnaSegundaPredeterminadaActivaDelMismoCliente() {
        int clienteId = datos.registrarCliente();

        assertThrows(DataIntegrityViolationException.class, () -> insertar(clienteId, true, false, "Otra"));

        assertEquals(1, direccionRepository.findActivasByClienteId(clienteId).size());
    }

    @Test
    void laEliminadaConPrincipalNoCuentaYLasNoPredeterminadasSePuedenRepetir() {
        int clienteId = datos.registrarCliente();
        insertar(clienteId, true, true, "Vieja eliminada");
        insertar(clienteId, false, false, "Una");
        insertar(clienteId, false, false, "Otra");

        List<Direccion> activas = direccionRepository.findActivasByClienteId(clienteId);

        assertEquals(3, activas.size());
        assertTrue(activas.get(0).isPrincipal());
        assertEquals(3, direccionRepository.countByClienteIdAndEliminadaFalse(clienteId));
    }

    @Test
    void dosClientesDistintosTienenCadaUnoSuPredeterminada() {
        int a = datos.registrarCliente();
        int b = datos.registrarCliente();

        assertTrue(direccionRepository.findPrincipalActivaByClienteId(a).isPresent());
        assertTrue(direccionRepository.findPrincipalActivaByClienteId(b).isPresent());
    }

    @Test
    void laLecturaParaEntregaTraeLosCamposYMarcaLaEliminada() {
        int clienteId = datos.registrarCliente();
        int id = insertar(clienteId, false, true, "Borrada");

        var fila = transactionTemplate.execute(status -> direccionRepository.leerParaEntregaConBloqueoCompartido(id)).orElseThrow();

        assertEquals(id, fila.getId());
        assertEquals(clienteId, fila.getClienteId());
        assertTrue(fila.getEliminada());
        assertEquals("Borrada", fila.getCalle());
        assertEquals("94008010", fila.getLocalidadId());
        assertFalse(transactionTemplate.execute(status -> direccionRepository.leerParaEntregaConBloqueoCompartido(999999999)).isPresent());
    }

    @Test
    void laLecturaParaEntregaEsperaAQueTermineUnaEscrituraDeEsaDireccion() throws Exception {
        int clienteId = datos.registrarCliente();
        int id = direccionRepository.findPrincipalActivaByClienteId(clienteId).orElseThrow().getId();
        CountDownLatch bloqueada = new CountDownLatch(1);
        CountDownLatch soltar = new CountDownLatch(1);
        ExecutorService pool = Executors.newFixedThreadPool(2);
        try {
            Future<?> escritura = pool.submit(() -> transactionTemplate.executeWithoutResult(status -> {
                jdbcTemplate.queryForObject("SELECT id FROM direccion WHERE id = ? FOR UPDATE", Integer.class, id);
                bloqueada.countDown();
                try {
                    soltar.await(30, TimeUnit.SECONDS);
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                }
            }));
            assertTrue(bloqueada.await(30, TimeUnit.SECONDS));

            Future<Boolean> lectura = pool.submit(() ->
                    transactionTemplate.execute(status -> direccionRepository.leerParaEntregaConBloqueoCompartido(id).isPresent()));

            Thread.sleep(1500);
            assertFalse(lectura.isDone(), "La lectura con bloqueo compartido no esperó a la escritura de la misma dirección");
            soltar.countDown();
            assertTrue(lectura.get(30, TimeUnit.SECONDS));
            escritura.get(30, TimeUnit.SECONDS);
        } finally {
            soltar.countDown();
            pool.shutdownNow();
        }
    }

    @Test
    void lasDireccionesDeOtroClienteNoSeEncuentranPorSuId() {
        int a = datos.registrarCliente();
        int b = datos.registrarCliente();
        int deB = direccionRepository.findPrincipalActivaByClienteId(b).orElseThrow().getId();

        assertFalse(direccionRepository.findByIdAndClienteIdAndEliminadaFalse(deB, a).isPresent());
        assertTrue(direccionRepository.findByIdAndClienteIdAndEliminadaFalse(deB, b).isPresent());
    }
}
