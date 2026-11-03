package com.bajonea.backend.services;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;

import com.bajonea.backend.dto.response.ConsultaSoporteCreadaResponseDTO;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Callable;
import org.junit.jupiter.api.Test;
import org.springframework.test.context.TestPropertySource;

/**
 * Ningún email de Soporte se envía con una conexión de la base tomada (Fase 5, tramo S4). El pool es de tres conexiones y
 * esperar una conexión más de 4 segundos falla; el envío simulado tarda 1,5 segundos. Si el envío corriera dentro de la
 * transacción, nueve respuestas a la vez ocuparían las tres conexiones durante 1,5 segundos cada tanda (más de 4 segundos
 * en total) y alguna fallaría con {@code Connection is not available}. Con el envío fuera de la transacción cada una usa la
 * conexión unos milisegundos y todas terminan.
 */
@TestPropertySource(properties = {
        "spring.datasource.hikari.maximum-pool-size=3",
        "spring.datasource.hikari.minimum-idle=3",
        "spring.datasource.hikari.connection-timeout=4000"
})
class SoporteEmailsPoolDiminutoIntegrationTest extends SoporteIntegrationBase {

    private static final long LATENCIA_MS = 1500;

    private void emailsLentos() {
        when(emailService.enviarSoporteRespuesta(anyString(), anyString())).thenAnswer(invocacion -> {
            Thread.sleep(LATENCIA_MS);
            return ResultadoEnvioEmail.enviado("id");
        });
        when(emailService.enviarSoporteConsultaRecibida(anyString(), anyString())).thenAnswer(invocacion -> {
            Thread.sleep(LATENCIA_MS);
            return ResultadoEnvioEmail.enviado("id");
        });
    }

    @Test
    void nueveRespuestasDeSoporteConEmailLentoTerminanTodasConUnPoolDeTresConexiones() {
        List<ConsultaSoporteCreadaResponseDTO> consultas = new ArrayList<>();
        for (int i = 0; i < 9; i++) {
            consultas.add(crear(emailNuevo(), ipNueva()));
        }
        emailsLentos();
        List<Callable<Object>> tareas = new ArrayList<>();
        for (ConsultaSoporteCreadaResponseDTO consulta : consultas) {
            tareas.add(() -> soporteAdmin.responder(consulta.getId(), texto("Respuesta con email lento")));
        }

        long inicio = System.nanoTime();
        List<Object> resultados = correrAlMismoTiempo(tareas);
        long milisegundos = (System.nanoTime() - inicio) / 1_000_000;

        sinErrores(resultados);
        for (ConsultaSoporteCreadaResponseDTO consulta : consultas) {
            assertEquals("ESPERA_PERSONA", estadoDeLaConsulta(consulta.getId()));
            assertEquals(1, jdbcTemplate.queryForObject(
                    "SELECT COUNT(*) FROM ticket_soporte_mensaje WHERE ticket_id = ? AND autor = 'SOPORTE' AND email_enviado = 1", Integer.class, consulta.getId()));
        }
        assertTrue(milisegundos < 3 * LATENCIA_MS + 4000, "tardó " + milisegundos + " ms");
    }

    @Test
    void nueveConsultasNuevasConEmailLentoTerminanTodasConUnPoolDeTresConexiones() {
        emailsLentos();
        List<Callable<Object>> tareas = new ArrayList<>();
        for (int i = 0; i < 9; i++) {
            String email = emailNuevo();
            String ip = ipNueva();
            tareas.add(() -> crear(email, ip));
        }

        List<Object> resultados = correrAlMismoTiempo(tareas);

        sinErrores(resultados);
        assertEquals(9, resultados.size());
    }
}
