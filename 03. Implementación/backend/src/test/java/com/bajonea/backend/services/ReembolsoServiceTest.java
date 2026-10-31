package com.bajonea.backend.services;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.bajonea.backend.entities.CuentaMercadoPago;
import com.bajonea.backend.entities.NotaCredito;
import com.bajonea.backend.entities.Pago;
import com.bajonea.backend.entities.Pedido;
import com.bajonea.backend.enums.MotivoNotaCredito;
import com.bajonea.backend.services.MercadoPagoReembolsoClient.ResultadoReembolsoMp;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.Optional;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Answers;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.SimpleTransactionStatus;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

class ReembolsoServiceTest {

    private static final Integer PEDIDO_ID = 77;
    private static final Integer PAGO_ID = 12;
    private static final Integer DUENO_ID = 5;
    private static final BigDecimal MONTO = new BigDecimal("10200.00");

    private PagoService pagoService;
    private NotaCreditoService notaCreditoService;
    private CuentaMercadoPagoService cuentaService;
    private MercadoPagoReembolsoClient client;
    private ReembolsoService reembolsoService;
    private Pedido pedido;

    @BeforeEach
    void preparar() {
        pagoService = mock(PagoService.class);
        notaCreditoService = mock(NotaCreditoService.class);
        cuentaService = mock(CuentaMercadoPagoService.class);
        client = mock(MercadoPagoReembolsoClient.class);
        PlatformTransactionManager tm = mock(PlatformTransactionManager.class);
        when(tm.getTransaction(any())).thenReturn(new SimpleTransactionStatus());
        reembolsoService = new ReembolsoService(pagoService, notaCreditoService, cuentaService, client, tm);

        pedido = mock(Pedido.class, Answers.RETURNS_DEEP_STUBS);
        when(pedido.getId()).thenReturn(PEDIDO_ID);
        when(pedido.getComercio().getDueno().getId()).thenReturn(DUENO_ID);
    }

    @AfterEach
    void limpiarSincronizacion() {
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.clearSynchronization();
        }
        TransactionSynchronizationManager.setActualTransactionActive(false);
    }

    private Pago pago(String mpEstado, LocalDateTime fechaConfirmacion, String idTransaccionMp) {
        return Pago.builder()
                .id(PAGO_ID)
                .pedido(pedido)
                .monto(MONTO)
                .mpEstado(mpEstado)
                .fechaConfirmacion(fechaConfirmacion)
                .idTransaccionMp(idTransaccionMp)
                .fechaCreacion(LocalDateTime.now())
                .build();
    }

    private Pago pagoAprobado() {
        return pago("approved", LocalDateTime.now(), "1234567");
    }

    private void darPago(Pago pago) {
        when(pagoService.buscarPorPedidoParaActualizar(PEDIDO_ID)).thenReturn(Optional.of(pago));
    }

    private CuentaMercadoPago cuentaActiva() {
        return CuentaMercadoPago.builder().accessToken("APP_USR-token-del-comercio").activa(true).build();
    }

    private NotaCredito notaPendiente(Pago pago) {
        return NotaCredito.builder().id(900).pago(pago).monto(MONTO).intentos(0).build();
    }

    private void abrirTransaccionSimulada() {
        TransactionSynchronizationManager.initSynchronization();
        TransactionSynchronizationManager.setActualTransactionActive(true);
    }

    @Test
    void siMercadoPagoRechazaElReembolsoLaNotaQuedaFallidaConElErrorRealYNoSePropagaNada() {
        Pago pago = pagoAprobado();
        darPago(pago);
        when(cuentaService.buscarActivaPorDueno(DUENO_ID)).thenReturn(Optional.of(cuentaActiva()));
        when(notaCreditoService.crear(pago, MONTO, MotivoNotaCredito.EXPIRACION_SIN_RESPUESTA)).thenReturn(notaPendiente(pago));
        when(client.solicitarReembolsoTotal(anyString(), anyString(), anyString()))
                .thenReturn(ResultadoReembolsoMp.fallido("Mercado Pago respondió 400: insufficient money"));
        abrirTransaccionSimulada();

        reembolsoService.generarNotaYReembolsarTotal(pedido, MotivoNotaCredito.EXPIRACION_SIN_RESPUESTA);
        confirmarTransaccion();

        verify(notaCreditoService).registrarReembolsoFallido(900, "Mercado Pago respondió 400: insufficient money");
        verify(notaCreditoService, never()).registrarReembolsoExitoso(any(), any());
    }

    @Test
    void unaExcepcionInesperadaEnLaLlamadaAMercadoPagoNuncaLlegaAlLlamador() {
        Pago pago = pagoAprobado();
        darPago(pago);
        when(cuentaService.buscarActivaPorDueno(DUENO_ID)).thenReturn(Optional.of(cuentaActiva()));
        when(notaCreditoService.crear(pago, MONTO, MotivoNotaCredito.RECHAZO_COMERCIO)).thenReturn(notaPendiente(pago));
        when(client.solicitarReembolsoTotal(anyString(), anyString(), anyString())).thenThrow(new IllegalStateException("boom"));
        abrirTransaccionSimulada();

        reembolsoService.generarNotaYReembolsarTotal(pedido, MotivoNotaCredito.RECHAZO_COMERCIO);
        confirmarTransaccion();

        verify(notaCreditoService, never()).registrarReembolsoExitoso(any(), any());
    }

    @Test
    void unPagoQueNoEstaAprobadoYConfirmadoNoSeReembolsaNiCreaNota() {
        for (Pago pagoNoReembolsable : new Pago[] {pago("rejected", null, "999"), pago("approved", null, "999"), pago(null, null, null)}) {
            darPago(pagoNoReembolsable);
            abrirTransaccionSimulada();

            assertFalse(reembolsoService.generarNotaYReembolsarTotal(pedido, MotivoNotaCredito.SUSPENSION_COMERCIO));
            limpiarSincronizacion();
        }

        verifyNoInteractions(client);
        verify(notaCreditoService, never()).crear(any(), any(), any());
    }

    private void confirmarTransaccion() {
        for (TransactionSynchronization sync : TransactionSynchronizationManager.getSynchronizations()) {
            sync.afterCommit();
        }
    }

    @Test
    void laAnulacionCreaLaNotaDentroDeLaTransaccionYSoloLaLlamadaAMercadoPagoEsPosteriorAlCommit() {
        Pago pago = pagoAprobado();
        darPago(pago);
        when(cuentaService.buscarActivaPorDueno(DUENO_ID)).thenReturn(Optional.of(cuentaActiva()));
        when(notaCreditoService.crear(pago, MONTO, MotivoNotaCredito.ANULACION_COMERCIO)).thenReturn(notaPendiente(pago));
        when(client.solicitarReembolsoTotal(anyString(), anyString(), anyString())).thenReturn(ResultadoReembolsoMp.exito("777"));
        abrirTransaccionSimulada();

        boolean hayNota = reembolsoService.generarNotaYReembolsarTotal(pedido, MotivoNotaCredito.ANULACION_COMERCIO);

        assertTrue(hayNota);
        verify(notaCreditoService).crear(pago, MONTO, MotivoNotaCredito.ANULACION_COMERCIO);
        verifyNoInteractions(client);
        for (TransactionSynchronization sync : TransactionSynchronizationManager.getSynchronizations()) {
            sync.afterCommit();
        }
        verify(client).solicitarReembolsoTotal(eq("1234567"), eq("APP_USR-token-del-comercio"), eq("nc-900-1"));
        verify(notaCreditoService).registrarReembolsoExitoso(900, "777");
    }

    @Test
    void laAnulacionConLaCuentaDesvinculadaDejaLaNotaEnRevisionManualSinDiferirNada() {
        Pago pago = pagoAprobado();
        darPago(pago);
        when(cuentaService.buscarActivaPorDueno(DUENO_ID)).thenReturn(Optional.empty());
        when(notaCreditoService.crearPendienteRevisionManual(eq(pago), eq(MONTO), eq(MotivoNotaCredito.ANULACION_COMERCIO), anyString()))
                .thenReturn(notaPendiente(pago));
        abrirTransaccionSimulada();

        boolean hayNota = reembolsoService.generarNotaYReembolsarTotal(pedido, MotivoNotaCredito.ANULACION_COMERCIO);

        assertTrue(hayNota);
        assertTrue(TransactionSynchronizationManager.getSynchronizations().isEmpty());
        verifyNoInteractions(client);
    }

    @Test
    void laAnulacionDeUnPedidoSinPagoReembolsableNoCreaNotaYLoInforma() {
        when(pagoService.buscarPorPedidoParaActualizar(PEDIDO_ID)).thenReturn(Optional.empty());
        abrirTransaccionSimulada();

        assertFalse(reembolsoService.generarNotaYReembolsarTotal(pedido, MotivoNotaCredito.ANULACION_COMERCIO));

        verify(notaCreditoService, never()).crear(any(), any(), any());
        verify(notaCreditoService, never()).crearPendienteRevisionManual(any(), any(), any(), any());
    }

    @Test
    void siElPagoYaTieneLaNotaPorElMontoCompletoLaAnulacionNoCreaOtraPeroInformaQueHayDevolucion() {
        Pago pago = pagoAprobado();
        when(pagoService.buscarPorPedidoParaActualizar(PEDIDO_ID)).thenReturn(Optional.of(pago));
        when(cuentaService.buscarActivaPorDueno(DUENO_ID)).thenReturn(Optional.of(cuentaActiva()));
        NotaCredito propia = notaPendiente(pago);
        when(notaCreditoService.crear(pago, MONTO, MotivoNotaCredito.ANULACION_COMERCIO)).thenReturn(propia);
        when(notaCreditoService.otrasNotasCubrenElPago(pago, propia.getId())).thenReturn(true);
        abrirTransaccionSimulada();

        assertTrue(reembolsoService.generarNotaYReembolsarTotal(pedido, MotivoNotaCredito.ANULACION_COMERCIO));

        verify(notaCreditoService).eliminar(propia);
        assertTrue(TransactionSynchronizationManager.getSynchronizations().isEmpty());
    }

    @Test
    void siLaTransaccionDeLaAnulacionSeRevierteNoSePideNingunReembolso() {
        Pago pago = pagoAprobado();
        darPago(pago);
        when(cuentaService.buscarActivaPorDueno(DUENO_ID)).thenReturn(Optional.of(cuentaActiva()));
        when(notaCreditoService.crear(pago, MONTO, MotivoNotaCredito.ANULACION_COMERCIO)).thenReturn(notaPendiente(pago));
        abrirTransaccionSimulada();

        reembolsoService.generarNotaYReembolsarTotal(pedido, MotivoNotaCredito.ANULACION_COMERCIO);
        for (TransactionSynchronization sync : TransactionSynchronizationManager.getSynchronizations()) {
            sync.afterCompletion(TransactionSynchronization.STATUS_ROLLED_BACK);
        }

        verifyNoInteractions(client);
    }

    @Test
    void siNoSePuedeEscribirLaNotaLaExcepcionLlegaAlLlamadorParaRevertirLaAnulacion() {
        Pago pago = pagoAprobado();
        darPago(pago);
        when(cuentaService.buscarActivaPorDueno(DUENO_ID)).thenReturn(Optional.of(cuentaActiva()));
        when(notaCreditoService.crear(pago, MONTO, MotivoNotaCredito.ANULACION_COMERCIO)).thenThrow(new IllegalStateException("no se pudo escribir"));
        abrirTransaccionSimulada();

        org.junit.jupiter.api.Assertions.assertThrows(IllegalStateException.class,
                () -> reembolsoService.generarNotaYReembolsarTotal(pedido, MotivoNotaCredito.ANULACION_COMERCIO));
    }

    @Test
    void generarLaNotaDeUnaAnulacionFueraDeUnaTransaccionEsUnError() {
        org.junit.jupiter.api.Assertions.assertThrows(IllegalStateException.class,
                () -> reembolsoService.generarNotaYReembolsarTotal(pedido, MotivoNotaCredito.ANULACION_COMERCIO));
        verifyNoInteractions(pagoService);
    }
}
