package com.bajonea.backend.services;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.bajonea.backend.exceptions.ConflictoDeNegocioException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Callable;
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

/**
 * Carrera entre registros simultáneos del mismo nombre de comercio desde Dueños distintos (Tramo 2). El chequeo previo
 * no alcanza (todos ven el nombre libre) y el que decide es el índice único: exactamente un registro se confirma, el
 * resto falla con el conflicto de nombre (chequeo previo) o con la violación de {@code uq_comercio_nombre_unico}
 * (que el handler global traduce a 409), y no queda ningún usuario ni persona huérfanos de los perdedores. Cualquier
 * otra falla, incluido un interbloqueo ({@code Deadlock found}), rompe la prueba.
 */
@SpringBootTest
@ActiveProfiles("test")
class RegistroComercioNombreConcurrenciaIntegrationTest {

    @Autowired
    private RegistroService registroService;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private ObjectMapper objectMapper;

    @MockitoBean
    private EmailService emailService;

    private DatosPruebaEmpleado datos;

    @BeforeEach
    void preparar() {
        datos = new DatosPruebaEmpleado(registroService, objectMapper, jdbcTemplate);
    }

    @Test
    void registrosSimultaneosDelMismoNombreDejanUnGanadorYNingunHuerfano() throws Exception {
        int[] participantes = {2, 3, 6, 12, 2, 3, 6, 12};
        for (int ronda = 0; ronda < participantes.length; ronda++) {
            correrRonda(participantes[ronda], "Concurrente Ñandú " + DatosPruebaEmpleado.sufijo());
        }
    }

    private void correrRonda(int cantidad, String nombre) throws Exception {
        int usuariosAntes = jdbcTemplate.queryForObject("SELECT COUNT(*) FROM usuario", Integer.class);
        ExecutorService pool = Executors.newFixedThreadPool(cantidad);
        CountDownLatch salida = new CountDownLatch(1);
        List<Future<String>> resultados = new ArrayList<>();
        for (int i = 0; i < cantidad; i++) {
            String variante = i % 2 == 0 ? nombre : nombre.toUpperCase().replace("Ñ", "N");
            Callable<String> tarea = () -> {
                salida.await();
                try {
                    datos.registrarDuenoAprobado(variante);
                    return "OK";
                } catch (ConflictoDeNegocioException e) {
                    return "CONFLICTO";
                } catch (DataIntegrityViolationException e) {
                    return String.valueOf(e.getMostSpecificCause().getMessage()).contains("uq_comercio_nombre_unico")
                            ? "INDICE" : "OTRO: " + e.getMostSpecificCause().getMessage();
                } catch (Exception e) {
                    return "OTRO: " + e.getClass().getSimpleName() + " " + e.getMessage();
                }
            };
            resultados.add(pool.submit(tarea));
        }
        salida.countDown();

        int exitos = 0;
        List<String> otros = new ArrayList<>();
        for (Future<String> futuro : resultados) {
            String resultado = futuro.get(60, TimeUnit.SECONDS);
            if (resultado.equals("OK")) {
                exitos++;
            } else if (!resultado.equals("CONFLICTO") && !resultado.equals("INDICE")) {
                otros.add(resultado);
            }
        }
        pool.shutdown();

        assertTrue(otros.isEmpty(), "con " + cantidad + " simultáneos solo se esperan éxito, conflicto o violación del índice: " + otros);
        assertEquals(1, exitos, "exactamente un registro gana con " + cantidad + " simultáneos");
        assertEquals(usuariosAntes + 1, jdbcTemplate.queryForObject("SELECT COUNT(*) FROM usuario", Integer.class),
                "los perdedores no dejan usuarios");
        assertEquals(1, jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM comercio WHERE nombre_unico = TRIM(REGEXP_REPLACE(?, '[[:space:]]+', ' '))", Integer.class, nombre));
    }
}
