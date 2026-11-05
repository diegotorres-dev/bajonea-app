package com.bajonea.backend.services;

import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;

import com.bajonea.backend.services.DatosPruebaEmpleado.Cuenta;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.test.context.TestPropertySource;

/**
 * El email de la inactivación no se envía con una conexión de la base tomada (Fase 5, tramo S6). El pool es de tres
 * conexiones, esperar una más de 4 segundos falla y el envío simulado tarda 1 segundo. Mientras la corrida envía, otras
 * seis consultas simultáneas a la base tienen que seguir terminando: si el envío corriera dentro de la transacción la
 * corrida retendría una conexión y, con las demás en uso, alguna fallaría con {@code Connection is not available}.
 */
@TestPropertySource(properties = {
        "spring.datasource.hikari.maximum-pool-size=3",
        "spring.datasource.hikari.minimum-idle=3",
        "spring.datasource.hikari.connection-timeout=4000"
})
class InactivacionCuentaPoolDiminutoIntegrationTest extends InactividadTestBase {

    private static final long LATENCIA_MS = 1000;

    @Test
    void conUnPoolDeTresConexionesLaCorridaConEmailLentoNoRetieneConexionesMientrasEnvia() throws Exception {
        when(emailService.enviarCuentaInactivada(anyString(), anyList())).thenAnswer(invocacion -> {
            Thread.sleep(LATENCIA_MS);
            return ResultadoEnvioEmail.enviado("id");
        });
        List<Cuenta> cuentas = new ArrayList<>();
        for (int i = 0; i < 3; i++) {
            Cuenta cuenta = cliente();
            vencida(cuenta.id());
            cuentas.add(cuenta);
        }
        java.util.concurrent.CompletableFuture<InactivacionCuentaService.ResultadoCorrida> corrida =
                java.util.concurrent.CompletableFuture.supplyAsync(this::correr);
        Thread.sleep(300);

        List<java.util.concurrent.CompletableFuture<Integer>> consultas = new ArrayList<>();
        for (int i = 0; i < 6; i++) {
            consultas.add(java.util.concurrent.CompletableFuture.supplyAsync(
                    () -> jdbcTemplate.queryForObject("SELECT COUNT(*) FROM usuario", Integer.class)));
        }
        for (java.util.concurrent.CompletableFuture<Integer> consulta : consultas) {
            consulta.get(10, java.util.concurrent.TimeUnit.SECONDS);
        }
        InactivacionCuentaService.ResultadoCorrida resultado = corrida.get(30, java.util.concurrent.TimeUnit.SECONDS);

        assertTrue(resultado.inactivadas() >= 3);
        assertTrue(resultado.conFalla() == 0);
        for (Cuenta cuenta : cuentas) {
            assertTrue(inactivada(cuenta.id()));
        }
    }
}
