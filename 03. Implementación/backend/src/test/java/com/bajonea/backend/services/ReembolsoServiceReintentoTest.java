package com.bajonea.backend.services;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
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
import com.bajonea.backend.enums.EstadoNotaCredito;
import com.bajonea.backend.enums.MotivoNotaCredito;
import com.bajonea.backend.exceptions.ConflictoDeNegocioException;
import com.bajonea.backend.services.MercadoPagoReembolsoClient.ResultadoReembolsoMp;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Answers;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.SimpleTransactionStatus;

class ReembolsoServiceReintentoTest {

    private static final Integer PEDIDO_ID = 77;
    private static final Integer PAGO_ID = 12;
    private static final Integer NOTA_ID = 900;
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

    private Pago pago(String mpEstado, LocalDateTime fechaConfirmacion) {
        return Pago.builder()
                .id(PAGO_ID)
                .pedido(pedido)
                .monto(MONTO)
                .mpEstado(mpEstado)
                .fechaConfirmacion(fechaConfirmacion)
                .idTransaccionMp("1234567")
                .fechaCreacion(LocalDateTime.now())
                .build();
    }

    private NotaCredito nota(Pago pago, EstadoNotaCredito estado, int intentos) {
        return NotaCredito.builder()
                .id(NOTA_ID)
                .pago(pago)
                .monto(MONTO)
                .motivo(MotivoNotaCredito.RECHAZO_COMERCIO)
                .estado(estado)
                .intentos(intentos)
                .fechaEmision(LocalDateTime.now())
                .build();
    }

    private void darNotaYPago(NotaCredito nota, Pago pago) {
        when(notaCreditoService.obtenerParaActualizar(NOTA_ID)).thenReturn(nota);
        when(pagoService.buscarPorPedidoParaActualizar(PEDIDO_ID)).thenReturn(Optional.of(pago));
        when(notaCreditoService.montoCubiertoExcluyendo(PAGO_ID, NOTA_ID)).thenReturn(BigDecimal.ZERO);
    }

    private CuentaMercadoPago cuentaActiva() {
        return CuentaMercadoPago.builder().accessToken("APP_USR-token-del-comercio").activa(true).build();
    }

    @Test
    void reintentoDeNotaEnRevisionManualConCuentaVinculadaReembolsaConClaveDelPrimerIntento() {
        Pago pago = pago("approved", LocalDateTime.now());
        darNotaYPago(nota(pago, EstadoNotaCredito.PENDIENTE_REVISION_MANUAL, 0), pago);
        when(cuentaService.buscarActivaPorDueno(DUENO_ID)).thenReturn(Optional.of(cuentaActiva()));
        when(client.solicitarReembolsoTotal(anyString(), anyString(), anyString())).thenReturn(ResultadoReembolsoMp.exito("555"));

        reembolsoService.reintentarNotaCredito(NOTA_ID);

        verify(notaCreditoService).marcarEnProceso(NOTA_ID);
        verify(client).solicitarReembolsoTotal(eq("1234567"), eq("APP_USR-token-del-comercio"), eq("nc-900-1"));
        verify(notaCreditoService).registrarReembolsoExitoso(NOTA_ID, "555");
    }

    @Test
    void reintentoDeNotaFallidaUsaUnaClaveNuevaPorqueYaHuboUnIntentoReal() {
        Pago pago = pago("approved", LocalDateTime.now());
        darNotaYPago(nota(pago, EstadoNotaCredito.FALLIDO, 1), pago);
        when(cuentaService.buscarActivaPorDueno(DUENO_ID)).thenReturn(Optional.of(cuentaActiva()));
        when(client.solicitarReembolsoTotal(anyString(), anyString(), anyString()))
                .thenReturn(ResultadoReembolsoMp.fallido("Mercado Pago respondió 400: insufficient money"));

        reembolsoService.reintentarNotaCredito(NOTA_ID);

        verify(client).solicitarReembolsoTotal(eq("1234567"), anyString(), eq("nc-900-2"));
        verify(notaCreditoService).registrarReembolsoFallido(NOTA_ID, "Mercado Pago respondió 400: insufficient money");
        verify(notaCreditoService, never()).registrarReembolsoExitoso(any(), any());
    }

    @Test
    void siLaCuentaSigueDesvinculadaInformaElMotivoYNoLlamaAMercadoPagoNiCambiaLaNota() {
        Pago pago = pago("approved", LocalDateTime.now());
        darNotaYPago(nota(pago, EstadoNotaCredito.PENDIENTE_REVISION_MANUAL, 0), pago);
        when(cuentaService.buscarActivaPorDueno(DUENO_ID)).thenReturn(Optional.empty());

        ConflictoDeNegocioException ex = assertThrows(ConflictoDeNegocioException.class, () -> reembolsoService.reintentarNotaCredito(NOTA_ID));

        assertEquals(true, ex.getMessage().contains("sigue desvinculada"));
        verifyNoInteractions(client);
        verify(notaCreditoService, never()).marcarEnProceso(any());
        verify(notaCreditoService, never()).registrarReembolsoFallido(any(), any());
    }

    @Test
    void unaNotaYaProcesadaOEnProcesoNoSePuedeReintentar() {
        Pago pago = pago("approved", LocalDateTime.now());
        darNotaYPago(nota(pago, EstadoNotaCredito.PROCESADO, 1), pago);

        assertThrows(ConflictoDeNegocioException.class, () -> reembolsoService.reintentarNotaCredito(NOTA_ID));

        darNotaYPago(nota(pago, EstadoNotaCredito.PENDIENTE, 1), pago);
        assertThrows(ConflictoDeNegocioException.class, () -> reembolsoService.reintentarNotaCredito(NOTA_ID));
        verifyNoInteractions(client);
    }

    @Test
    void siElPagoYaNoEstaAprobadoNoSeReintenta() {
        Pago pago = pago("rejected", null);
        darNotaYPago(nota(pago, EstadoNotaCredito.FALLIDO, 1), pago);

        assertThrows(ConflictoDeNegocioException.class, () -> reembolsoService.reintentarNotaCredito(NOTA_ID));
        verifyNoInteractions(client);
    }

    @Test
    void siOtraNotaYaCubreElPagoNoSeDuplicaLaDevolucion() {
        Pago pago = pago("approved", LocalDateTime.now());
        darNotaYPago(nota(pago, EstadoNotaCredito.FALLIDO, 1), pago);
        when(notaCreditoService.montoCubiertoExcluyendo(PAGO_ID, NOTA_ID)).thenReturn(MONTO);

        ConflictoDeNegocioException ex = assertThrows(ConflictoDeNegocioException.class, () -> reembolsoService.reintentarNotaCredito(NOTA_ID));

        assertEquals(true, ex.getMessage().contains("duplicaría"));
        verifyNoInteractions(client);
    }
}
