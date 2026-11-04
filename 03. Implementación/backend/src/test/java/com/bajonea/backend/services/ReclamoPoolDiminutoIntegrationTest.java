package com.bajonea.backend.services;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;

import com.bajonea.backend.enums.TipoResolucionReclamo;
import com.bajonea.backend.services.DatosPruebaEmpleado.Dueno;
import com.bajonea.backend.services.MercadoPagoReembolsoClient.ResultadoReembolsoMp;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Callable;
import org.junit.jupiter.api.Test;
import org.springframework.test.context.TestPropertySource;

/**
 * Ni el email ni la llamada a Mercado Pago de la resolución de un reclamo se hacen con una conexión de la base tomada
 * (Fase 5, tramo S5; reglas 16 y 17). El pool es de tres conexiones y esperar una más de 4 segundos falla; el email
 * simulado tarda 1,5 segundos y la llamada a Mercado Pago simulada otro tanto. Si cualquiera de las dos corriera dentro de
 * la transacción, nueve resoluciones a la vez ocuparían las tres conexiones durante 3 segundos cada tanda (más de 4
 * segundos de espera) y alguna fallaría con {@code Connection is not available}.
 */
@TestPropertySource(properties = {
        "spring.datasource.hikari.maximum-pool-size=3",
        "spring.datasource.hikari.minimum-idle=3",
        "spring.datasource.hikari.connection-timeout=4000"
})
class ReclamoPoolDiminutoIntegrationTest extends ReclamoIntegrationBase {

    private static final long LATENCIA_MS = 1500;
    private static final long LATENCIA_MERCADO_PAGO_MS = 2500;

    @Test
    void nueveResolucionesConEmailYMercadoPagoLentosTerminanTodasConUnPoolDeTresConexiones() {
        Dueno dueno = duenoConCuenta();
        List<Integer> pedidos = new ArrayList<>();
        List<Callable<Object>> tareas = new ArrayList<>();
        for (int i = 0; i < 9; i++) {
            int cliente = datos.registrarCliente();
            int pedidoId = pedidoEntregado(cliente, dueno);
            reclamar(cliente, pedidoId);
            pedidos.add(pedidoId);
            int id = reclamoId(pedidoId);
            tareas.add(() -> reclamoAdmin.resolver(adminId(), id, resolucion(TipoResolucionReclamo.REEMBOLSO_PARCIAL, "100", null)));
        }
        when(reembolsoClient.solicitarReembolsoParcial(anyString(), anyString(), anyString(), any())).thenAnswer(invocacion -> {
            Thread.sleep(LATENCIA_MERCADO_PAGO_MS);
            return new ResultadoReembolsoMp(true, "refund", null);
        });
        when(emailService.enviarReclamoResuelto(anyString(), any(), anyBoolean(), any(), any())).thenAnswer(invocacion -> {
            Thread.sleep(LATENCIA_MS);
            return ResultadoEnvioEmail.enviado("id");
        });

        long inicio = System.nanoTime();
        List<Object> resultados = correrAlMismoTiempo(tareas);
        long milisegundos = (System.nanoTime() - inicio) / 1_000_000;

        sinErrores(resultados);
        for (int pedidoId : pedidos) {
            assertEquals("APROBADO", jdbcTemplate.queryForObject("SELECT estado FROM reclamo WHERE pedido_id = ?", String.class, pedidoId));
            assertEquals("PROCESADO", notasDelPedido(pedidoId).get(0).get("estado"));
        }
        assertTrue(milisegundos < 30_000, "tardó " + milisegundos + " ms");
    }
}
