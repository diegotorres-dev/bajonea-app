package com.bajonea.backend.services;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.bajonea.backend.entities.NotaCredito;
import com.bajonea.backend.entities.Pago;
import com.bajonea.backend.enums.EstadoNotaCredito;
import com.bajonea.backend.enums.MotivoNotaCredito;
import com.bajonea.backend.repositories.NotaCreditoRepository;
import java.math.BigDecimal;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/** Las notas de crédito de un reclamo y el cálculo de lo que ya cubren las demás notas del pago (Fase 5, tramo S5). */
class NotaCreditoServiceReclamoTest {

    private NotaCreditoRepository repository;
    private NotaCreditoService service;

    @BeforeEach
    void preparar() {
        repository = mock(NotaCreditoRepository.class);
        when(repository.save(any(NotaCredito.class))).thenAnswer(invocacion -> invocacion.getArgument(0));
        service = new NotaCreditoService(repository);
    }

    private static NotaCreditoRepository.EstadoYMonto fila(String estado, String monto) {
        return new NotaCreditoRepository.EstadoYMonto() {
            @Override
            public String getEstado() {
                return estado;
            }

            @Override
            public BigDecimal getMonto() {
                return new BigDecimal(monto);
            }
        };
    }

    @Test
    void laNotaDeUnReclamoLlevaElMotivoReclamoYElIdDelReclamo() {
        Pago pago = Pago.builder().id(3).idTransaccionMp("777").build();

        NotaCredito nota = service.crearDeReclamo(pago, new BigDecimal("250.00"), 12);

        assertEquals(MotivoNotaCredito.RECLAMO, nota.getMotivo());
        assertEquals(12, nota.getReclamoId());
        assertEquals(EstadoNotaCredito.PENDIENTE, nota.getEstado());
        assertEquals("777", nota.getMpPaymentId());
    }

    @Test
    void laNotaDeUnReclamoConLaCuentaDesvinculadaNaceEnRevisionManualConElMotivo() {
        Pago pago = Pago.builder().id(3).idTransaccionMp("777").build();

        NotaCredito nota = service.crearDeReclamoPendienteRevisionManual(pago, new BigDecimal("250.00"), 12, "cuenta desvinculada");

        assertEquals(EstadoNotaCredito.PENDIENTE_REVISION_MANUAL, nota.getEstado());
        assertEquals("cuenta desvinculada", nota.getUltimoError());
        assertEquals(12, nota.getReclamoId());
    }

    @Test
    void lasNotasNormalesNoLlevanReclamo() {
        Pago pago = Pago.builder().id(3).idTransaccionMp("777").build();

        assertNull(service.crear(pago, new BigDecimal("1.00"), MotivoNotaCredito.RECHAZO_COMERCIO).getReclamoId());
        assertNull(service.crearPendienteRevisionManual(pago, new BigDecimal("1.00"), MotivoNotaCredito.RECHAZO_COMERCIO, "x").getReclamoId());
    }

    @Test
    void lasNotasFallidasNoCubrenElPagoYLasVivasSi() {
        when(repository.leerOtrasDelPagoConBloqueo(3, 99)).thenReturn(List.of(
                fila("PROCESADO", "500.00"), fila("PENDIENTE", "100.00"), fila("PENDIENTE_REINTENTO", "50.00"),
                fila("PENDIENTE_REVISION_MANUAL", "25.00"), fila("FALLIDO", "300.00")));

        assertEquals(0, new BigDecimal("675.00").compareTo(service.montoCubiertoPorOtrasConBloqueo(3, 99)));
    }

    @Test
    void sinOtrasNotasNoSeCubreNada() {
        when(repository.leerOtrasDelPagoConBloqueo(3, 99)).thenReturn(List.of());

        assertEquals(0, BigDecimal.ZERO.compareTo(service.montoCubiertoPorOtrasConBloqueo(3, 99)));
    }

    @Test
    void ajustarElMontoActualizaLaNota() {
        NotaCredito existente = NotaCredito.builder().id(5).monto(new BigDecimal("1700.00")).estado(EstadoNotaCredito.PENDIENTE).intentos(0).build();
        when(repository.findById(5)).thenReturn(java.util.Optional.of(existente));

        NotaCredito ajustada = service.ajustarMonto(5, new BigDecimal("1200.00"));

        assertEquals(0, new BigDecimal("1200.00").compareTo(ajustada.getMonto()));
    }
}
