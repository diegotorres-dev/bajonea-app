package com.bajonea.backend.services;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.bajonea.backend.dto.request.SuspensionComercioRequestDTO;
import com.bajonea.backend.dto.request.SuspensionUsuarioRequestDTO;
import com.bajonea.backend.entities.Pedido;
import com.bajonea.backend.enums.MotivoNotaCredito;
import com.bajonea.backend.repositories.PedidoRepository;
import com.bajonea.backend.services.DatosPruebaEmpleado.Dueno;
import com.bajonea.backend.services.MercadoPagoReembolsoClient.ResultadoReembolsoMp;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * El email de un aviso y el pedido de reembolso a Mercado Pago salen cuando la transacción de negocio ya terminó y soltó
 * su conexión (Fase 5, tramo S3.1): en ese momento no hay transacción activa ni recursos de transacción atados al hilo, y
 * el rastro del resultado se registra en una transacción corta propia. Un fallo del envío no deshace el cambio de negocio.
 */
class EfectosPosterioresSinTransaccionIntegrationTest extends SuspensionDuenoTestBase {

    @Autowired
    private ReembolsoService reembolsoService;

    @Autowired
    private PedidoRepository pedidoRepository;

    @Autowired
    private AvisoCuentaService avisoCuentaService;

    private final List<String> estadoDelHiloAlEnviar = new ArrayList<>();

    @BeforeEach
    void limpiarCapturas() {
        estadoDelHiloAlEnviar.clear();
    }

    private void capturarEstadoDelHilo() {
        estadoDelHiloAlEnviar.add("transaccionActiva=" + TransactionSynchronizationManager.isActualTransactionActive()
                + ",sincronizacionActiva=" + TransactionSynchronizationManager.isSynchronizationActive()
                + ",recursosAtados=" + TransactionSynchronizationManager.getResourceMap().size());
    }

    private void assertSinTransaccionAlEnviar(int envios) {
        assertEquals(envios, estadoDelHiloAlEnviar.size());
        for (String estado : estadoDelHiloAlEnviar) {
            assertEquals("transaccionActiva=false,sincronizacionActiva=false,recursosAtados=0", estado);
        }
    }

    private int emailsRegistrados(int usuarioId, String tipo, String estado) {
        return jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM notificacion WHERE usuario_id = ? AND canal = 'EMAIL' AND tipo = ? AND estado = ?",
                Integer.class, usuarioId, tipo, estado);
    }

    @Test
    void elEmailDeLaSuspensionDeUnClienteSaleSinTransaccionYDejaSuRastro() {
        when(emailService.enviarCuentaSuspendida(anyString(), anyString())).thenAnswer(invocacion -> {
            capturarEstadoDelHilo();
            return ResultadoEnvioEmail.enviado("id");
        });
        int cliente = datos.registrarCliente();

        suspensionUsuario.suspender(cliente, administradorId, new SuspensionUsuarioRequestDTO("Pedidos falsos reiterados"));

        assertSinTransaccionAlEnviar(1);
        assertEquals(1, emailsRegistrados(cliente, "CLIENTE_SUSPENDIDO", "ENVIADO"));
    }

    @Test
    void elEmailDeLaSuspensionDeUnDuenoYDeUnComercioSaleSinTransaccion() {
        when(emailService.enviarDuenoSuspendido(anyString(), anyString(), anyList())).thenAnswer(invocacion -> {
            capturarEstadoDelHilo();
            return ResultadoEnvioEmail.enviado("id");
        });
        when(emailService.enviarComercioSuspendido(anyString(), anyString(), anyString())).thenAnswer(invocacion -> {
            capturarEstadoDelHilo();
            return ResultadoEnvioEmail.enviado("id");
        });
        Dueno dueno = duenoActivo();
        Dueno otro = duenoActivo();

        suspender(dueno);
        suspensionComercio.suspender(otro.comercioId(), administradorId, new SuspensionComercioRequestDTO("Incumplimiento reiterado"));

        assertSinTransaccionAlEnviar(2);
        assertEquals(1, emailsRegistrados(dueno.id(), "DUENO_SUSPENDIDO", "ENVIADO"));
        assertEquals(1, emailsRegistrados(otro.id(), "COMERCIO_SUSPENDIDO", "ENVIADO"));
    }

    @Test
    void siElEnvioDelEmailFallaLaSuspensionQuedaYElResultadoSeRegistraConUnSoloIntento() {
        when(emailService.enviarCuentaSuspendida(anyString(), anyString())).thenAnswer(invocacion -> {
            capturarEstadoDelHilo();
            throw new IllegalStateException("el proveedor de email se cayó");
        });
        int cliente = datos.registrarCliente();

        suspensionUsuario.suspender(cliente, administradorId, new SuspensionUsuarioRequestDTO("Pedidos falsos reiterados"));

        assertEquals("SUSPENDIDO", estadoUsuario(cliente));
        verify(emailService, times(1)).enviarCuentaSuspendida(anyString(), anyString());
        assertSinTransaccionAlEnviar(1);
        assertEquals(1, emailsRegistrados(cliente, "CLIENTE_SUSPENDIDO", "FALLIDO"));
    }

    @Test
    void siLaSuspensionSeRevierteNoSaleNingunEmail() {
        int cliente = datos.registrarCliente();

        try {
            new TransactionTemplate(transactionManager).executeWithoutResult(estado -> {
                suspensionUsuarioSinConfirmar(cliente);
                throw new IllegalStateException("se revierte");
            });
        } catch (IllegalStateException esperado) {
            assertEquals("se revierte", esperado.getMessage());
        }

        verify(emailService, times(0)).enviarCuentaSuspendida(anyString(), anyString());
        assertEquals(0, emailsRegistrados(cliente, "CLIENTE_SUSPENDIDO", "ENVIADO"));
    }

    private void suspensionUsuarioSinConfirmar(int cliente) {
        avisoCuentaService.avisarSuspension(cliente, "cliente-" + cliente + "@bajonea.test", "Motivo de prueba");
    }

    @Test
    void elPedidoDeReembolsoAMercadoPagoSaleSinTransaccionYDespuesDelCommit() {
        when(reembolsoClient.solicitarReembolsoTotal(any(), any(), anyString())).thenAnswer(invocacion -> {
            capturarEstadoDelHilo();
            return new ResultadoReembolsoMp(true, "refund", null);
        });
        Dueno dueno = comercioApto(true);
        int cliente = datos.registrarCliente();
        int pedidoId = pedidoPendientePago(cliente, dueno);
        filaDePago(pedidoId);
        jdbcTemplate.update("UPDATE pago SET mp_estado = 'approved', fecha_confirmacion = NOW(), id_transaccion_mp = ? WHERE pedido_id = ?",
                "mp-fuera-" + pedidoId, pedidoId);

        new TransactionTemplate(transactionManager).executeWithoutResult(estado -> {
            Pedido pedido = pedidoRepository.findById(pedidoId).orElseThrow();
            assertTrue(reembolsoService.generarNotaYReembolsarTotal(pedido, MotivoNotaCredito.PAGO_TARDIO));
            assertTrue(estadoDelHiloAlEnviar.isEmpty(), "el pedido a Mercado Pago no puede salir antes del commit");
        });

        assertSinTransaccionAlEnviar(1);
        assertEquals(1, notas(pedidoId));
        assertEquals("PROCESADO", jdbcTemplate.queryForObject(
                "SELECT nc.estado FROM nota_credito nc JOIN pago pg ON pg.id = nc.pago_id WHERE pg.pedido_id = ?", String.class, pedidoId));
    }

    @Test
    void siLaTransaccionDelCambioDeEstadoSeRevierteNoSePideNingunReembolso() {
        Dueno dueno = comercioApto(true);
        int cliente = datos.registrarCliente();
        int pedidoId = pedidoPendientePago(cliente, dueno);
        filaDePago(pedidoId);
        jdbcTemplate.update("UPDATE pago SET mp_estado = 'approved', fecha_confirmacion = NOW(), id_transaccion_mp = ? WHERE pedido_id = ?",
                "mp-revertido-" + pedidoId, pedidoId);

        try {
            new TransactionTemplate(transactionManager).executeWithoutResult(estado -> {
                Pedido pedido = pedidoRepository.findById(pedidoId).orElseThrow();
                reembolsoService.generarNotaYReembolsarTotal(pedido, MotivoNotaCredito.PAGO_TARDIO);
                throw new IllegalStateException("se revierte");
            });
        } catch (IllegalStateException esperado) {
            assertFalse(esperado.getMessage().isBlank());
        }

        verify(reembolsoClient, times(0)).solicitarReembolsoTotal(any(), any(), anyString());
        assertEquals(0, notas(pedidoId));
    }
}
