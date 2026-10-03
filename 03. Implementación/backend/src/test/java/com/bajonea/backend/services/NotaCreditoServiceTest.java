package com.bajonea.backend.services;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
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
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class NotaCreditoServiceTest {

    private NotaCreditoRepository repository;
    private NotaCreditoService service;

    @BeforeEach
    void preparar() {
        repository = mock(NotaCreditoRepository.class);
        when(repository.save(any(NotaCredito.class))).thenAnswer(invocacion -> invocacion.getArgument(0));
        service = new NotaCreditoService(repository);
    }

    private NotaCredito nota(int id, String monto, EstadoNotaCredito estado) {
        return NotaCredito.builder().id(id).monto(new BigDecimal(monto)).estado(estado).intentos(0).build();
    }

    @Test
    void crearRegistraMotivoYElPaymentIdDelPagoConEstadoPendienteYCeroIntentos() {
        Pago pago = Pago.builder().id(3).idTransaccionMp("777").build();

        NotaCredito creada = service.crear(pago, new BigDecimal("500.00"), MotivoNotaCredito.RECHAZO_COMERCIO);

        assertEquals(EstadoNotaCredito.PENDIENTE, creada.getEstado());
        assertEquals(MotivoNotaCredito.RECHAZO_COMERCIO, creada.getMotivo());
        assertEquals("777", creada.getMpPaymentId());
        assertEquals(0, creada.getIntentos());
        assertNotNull(creada.getFechaEmision());
    }

    @Test
    void revisionManualQuedaConElMotivoEnUltimoErrorSinIntentos() {
        Pago pago = Pago.builder().id(3).idTransaccionMp("777").build();

        NotaCredito creada = service.crearPendienteRevisionManual(pago, new BigDecimal("500.00"),
                MotivoNotaCredito.EXPIRACION_SIN_RESPUESTA, "cuenta desvinculada");

        assertEquals(EstadoNotaCredito.PENDIENTE_REVISION_MANUAL, creada.getEstado());
        assertEquals("cuenta desvinculada", creada.getUltimoError());
        assertEquals(0, creada.getIntentos());
    }

    @Test
    void montoCubiertoSumaLasNotasVivasYDescartaLasFallidas() {
        when(repository.findByPagoId(3)).thenReturn(List.of(
                nota(1, "100.00", EstadoNotaCredito.PROCESADO),
                nota(2, "50.00", EstadoNotaCredito.PENDIENTE),
                nota(3, "20.00", EstadoNotaCredito.PENDIENTE_REVISION_MANUAL),
                nota(4, "999.00", EstadoNotaCredito.FALLIDO)));

        assertEquals(0, new BigDecimal("170.00").compareTo(service.montoCubierto(3)));
    }

    @Test
    void reembolsoExitosoGuardaRefundIdLimpiaErrorYSumaUnIntento() {
        NotaCredito existente = nota(8, "100.00", EstadoNotaCredito.PENDIENTE);
        existente.setUltimoError("viejo");
        when(repository.findById(8)).thenReturn(Optional.of(existente));

        NotaCredito resultado = service.registrarReembolsoExitoso(8, "4455");

        assertEquals(EstadoNotaCredito.PROCESADO, resultado.getEstado());
        assertEquals("4455", resultado.getRefundIdMp());
        assertNull(resultado.getUltimoError());
        assertEquals(1, resultado.getIntentos());
        assertNotNull(resultado.getFechaProceso());
    }

    @Test
    void reembolsoFallidoGuardaElErrorRecortadoAlLargoDeLaColumna() {
        NotaCredito existente = nota(9, "100.00", EstadoNotaCredito.PENDIENTE);
        when(repository.findById(9)).thenReturn(Optional.of(existente));

        NotaCredito resultado = service.registrarReembolsoFallido(9, "x".repeat(800));

        assertEquals(EstadoNotaCredito.FALLIDO, resultado.getEstado());
        assertEquals(500, resultado.getUltimoError().length());
        assertEquals(1, resultado.getIntentos());
        assertNotNull(resultado.getFechaFallido());
    }
}
