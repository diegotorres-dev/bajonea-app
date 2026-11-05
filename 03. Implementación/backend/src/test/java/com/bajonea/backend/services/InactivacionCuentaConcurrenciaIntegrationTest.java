package com.bajonea.backend.services;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

import com.bajonea.backend.services.DatosPruebaEmpleado.Cuenta;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * La corrida de inactivación frente a quien está usando la cuenta (Fase 5, tramo S6): una sola prueba determinística de
 * carrera (un login que tiene la fila del usuario y confirma después de que la corrida ya eligió a la cuenta como
 * candidata) y el aislamiento entre cuentas (un fallo en una no frena ni deja a medias a las demás).
 */
class InactivacionCuentaConcurrenciaIntegrationTest extends InactividadTestBase {

    @MockitoSpyBean
    private AvisoCuentaService avisoCuenta;

    private void fallarAlAvisar(int usuarioId) {
        new TransactionTemplate(transactionManager).executeWithoutResult(status -> doThrow(new IllegalStateException("falla provocada"))
                .when(avisoCuenta).avisarInactivacion(eq(usuarioId), anyString(), anyList()));
    }

    @Test
    void siUnLoginTieneLaFilaDelUsuarioLaCorridaEsperaYAlObtenerlaVeLaFechaNuevaYNoInactiva() throws Exception {
        Cuenta cuenta = cliente();
        vencida(cuenta.id());
        CountDownLatch filaTomada = new CountDownLatch(1);
        CountDownLatch soltar = new CountDownLatch(1);
        TransactionTemplate plantilla = new TransactionTemplate(transactionManager);

        CompletableFuture<Void> login = CompletableFuture.runAsync(() -> plantilla.executeWithoutResult(status -> {
            jdbcTemplate.queryForObject("SELECT id FROM usuario WHERE id = ? FOR UPDATE", Integer.class, cuenta.id());
            filaTomada.countDown();
            try {
                assertTrue(soltar.await(20, TimeUnit.SECONDS));
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
            jdbcTemplate.update("UPDATE usuario SET fecha_ultimo_acceso = ? WHERE id = ?", ahora, cuenta.id());
        }));
        assertTrue(filaTomada.await(10, TimeUnit.SECONDS));

        CompletableFuture<InactivacionCuentaService.ResultadoCorrida> corrida = CompletableFuture.supplyAsync(this::correr);
        Thread.sleep(1500);
        assertFalse(corrida.isDone(), "la corrida tiene que esperar el bloqueo de la fila del usuario");
        soltar.countDown();
        login.get(20, TimeUnit.SECONDS);
        corrida.get(20, TimeUnit.SECONDS);

        assertEquals("ACTIVO", estadoUsuario(cuenta.id()));
        assertEquals(0, filasHistorialUsuario(cuenta.id(), "INACTIVO"));
        assertEquals(0, avisos(cuenta.id(), "CUENTA_INACTIVADA"));
        verify(emailService, never()).enviarCuentaInactivada(eq(cuenta.email()), anyList());
    }

    private InactivacionCuentaService.ResultadoCorrida correrMientrasSeTieneLaFila(int usuarioId, Runnable cambioDentro) throws Exception {
        CountDownLatch filaTomada = new CountDownLatch(1);
        CountDownLatch soltar = new CountDownLatch(1);
        TransactionTemplate plantilla = new TransactionTemplate(transactionManager);
        CompletableFuture<Void> otro = CompletableFuture.runAsync(() -> plantilla.executeWithoutResult(status -> {
            jdbcTemplate.queryForObject("SELECT id FROM usuario WHERE id = ? FOR UPDATE", Integer.class, usuarioId);
            filaTomada.countDown();
            try {
                assertTrue(soltar.await(20, TimeUnit.SECONDS));
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
            cambioDentro.run();
        }));
        assertTrue(filaTomada.await(10, TimeUnit.SECONDS));
        CompletableFuture<InactivacionCuentaService.ResultadoCorrida> corrida = CompletableFuture.supplyAsync(this::correr);
        Thread.sleep(1000);
        soltar.countDown();
        otro.get(20, TimeUnit.SECONDS);
        return corrida.get(20, TimeUnit.SECONDS);
    }

    @Test
    void unaCuentaQueDejoDeEstarActivaMientrasLaCorridaEsperabaSeOmite() throws Exception {
        Cuenta cuenta = cliente();
        vencida(cuenta.id());

        correrMientrasSeTieneLaFila(cuenta.id(), () -> datos.cambiarEstadoUsuario(cuenta.id(), "SUSPENDIDO"));

        assertEquals("SUSPENDIDO", estadoUsuario(cuenta.id()));
        assertEquals(0, filasHistorialUsuario(cuenta.id(), "INACTIVO"));
    }

    @Test
    void siApareceUnComercioInactivableDespuesDeElegirALaCuentaLaCorridaNoLaInactivaAMedias() throws Exception {
        DatosPruebaEmpleado.Dueno dueno = duenoActivo();
        vencida(dueno.id());
        int[] nuevo = new int[1];

        InactivacionCuentaService.ResultadoCorrida resultado = correrMientrasSeTieneLaFila(dueno.id(),
                () -> nuevo[0] = comercioExtra(dueno, com.bajonea.backend.enums.EstadoComercio.APROBADO));

        assertTrue(resultado.omitidas() >= 1);
        assertEquals("ACTIVO", estadoUsuario(dueno.id()));
        assertEquals("APTO_VENTA", estadoComercio(dueno.comercioId()));
        assertEquals("APROBADO", estadoComercio(nuevo[0]));
        correr();
        assertTrue(inactivada(dueno.id()), "la corrida siguiente ya ve el comercio nuevo y los inactiva a todos juntos");
        assertEquals("INACTIVO", estadoComercio(nuevo[0]));
    }

    @Test
    void unFalloEnUnaCuentaLaDejaIntactaYNoFrenaALasDemas() {
        Cuenta fallida = cliente();
        Cuenta sana = cliente();
        authService.login(login(fallida), "127.0.0.1", "test");
        vencida(fallida.id());
        vencida(sana.id());
        fallarAlAvisar(fallida.id());

        InactivacionCuentaService.ResultadoCorrida resultado = correr();

        assertTrue(resultado.conFalla() >= 1);
        assertEquals("ACTIVO", estadoUsuario(fallida.id()));
        assertEquals(0, filasHistorialUsuario(fallida.id(), "INACTIVO"));
        assertEquals(1, sesionesActivas(fallida.id()), "la transacción revertida no cierra la sesión");
        verify(emailService, never()).enviarCuentaInactivada(eq(fallida.email()), anyList());
        assertTrue(inactivada(sana.id()));
        verify(emailService).enviarCuentaInactivada(eq(sana.email()), anyList());
    }

    @Test
    void unDuenoQueFallaNoDejaComerciosInactivosMientrasSuCuentaSigueActiva() {
        DatosPruebaEmpleado.Dueno dueno = duenoActivo();
        int extra = comercioExtra(dueno, com.bajonea.backend.enums.EstadoComercio.APROBADO);
        vencida(dueno.id());
        fallarAlAvisar(dueno.id());

        correr();

        assertEquals("ACTIVO", estadoUsuario(dueno.id()));
        assertEquals("APTO_VENTA", estadoComercio(dueno.comercioId()));
        assertEquals("APROBADO", estadoComercio(extra));
        assertEquals(0, filasHistorialComercio(dueno.comercioId(), "INACTIVO"));
    }
}
