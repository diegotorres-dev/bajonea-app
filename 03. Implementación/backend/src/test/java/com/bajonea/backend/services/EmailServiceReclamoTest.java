package com.bajonea.backend.services;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.resend.Resend;
import com.resend.core.exception.ResendException;
import com.resend.services.emails.Emails;
import com.resend.services.emails.model.CreateEmailOptions;
import com.resend.services.emails.model.CreateEmailResponse;
import java.math.BigDecimal;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.test.util.ReflectionTestUtils;

/** El email que recibe el Cliente cuando se resuelve su reclamo (Fase 5, tramo S5). */
class EmailServiceReclamoTest {

    private Resend resend;
    private Emails emails;
    private EmailService servicio;

    @BeforeEach
    void preparar() {
        resend = mock(Resend.class);
        emails = mock(Emails.class);
        servicio = new EmailService(resend);
        ReflectionTestUtils.setField(servicio, "remitente", "info@bajonea.test");
    }

    private CreateEmailOptions enviado() throws ResendException {
        ArgumentCaptor<CreateEmailOptions> captor = ArgumentCaptor.forClass(CreateEmailOptions.class);
        verify(emails).send(captor.capture());
        return captor.getValue();
    }

    private void respuestaDeResend() throws ResendException {
        CreateEmailResponse respuesta = mock(CreateEmailResponse.class);
        when(respuesta.getId()).thenReturn("id-resend");
        when(resend.emails()).thenReturn(emails);
        when(emails.send(any(CreateEmailOptions.class))).thenReturn(respuesta);
    }

    @Test
    void elEmailDeUnReclamoAprobadoDiceElMontoYQueElReembolsoPuedeTardar() throws ResendException {
        ReflectionTestUtils.setField(servicio, "envioHabilitado", true);
        respuestaDeResend();

        ResultadoEnvioEmail resultado = servicio.enviarReclamoResuelto("cliente@bajonea.test", 42, true, new BigDecimal("1250.50"), null);

        assertTrue(resultado.salio());
        CreateEmailOptions opciones = enviado();
        assertTrue(opciones.getSubject().contains("#42"));
        assertTrue(opciones.getText().contains("lo aprobamos"));
        assertTrue(opciones.getText().contains("$1.250,50"));
        assertTrue(opciones.getText().contains("puede tardar unos días"));
        assertTrue(opciones.getTo().contains("cliente@bajonea.test"));
        assertFalse(opciones.getText().contains("http"));
    }

    @Test
    void elEmailDeUnReclamoRechazadoDiceElMotivo() throws ResendException {
        ReflectionTestUtils.setField(servicio, "envioHabilitado", true);
        respuestaDeResend();

        servicio.enviarReclamoResuelto("cliente@bajonea.test", 43, false, null, "El pedido se entregó completo");

        CreateEmailOptions opciones = enviado();
        assertTrue(opciones.getSubject().contains("#43"));
        assertTrue(opciones.getText().contains("no pudimos aprobarlo"));
        assertTrue(opciones.getText().contains("Motivo: El pedido se entregó completo"));
        assertFalse(opciones.getText().contains("$"));
    }

    @Test
    void conEnvioDeshabilitadoNoLlamaAResendYDevuelveDeshabilitado() {
        ReflectionTestUtils.setField(servicio, "envioHabilitado", false);

        ResultadoEnvioEmail resultado = servicio.enviarReclamoResuelto("cliente@bajonea.test", 44, true, new BigDecimal("10"), null);

        assertEquals(ResultadoEnvioEmail.deshabilitado().salio(), resultado.salio());
        verifyNoInteractions(resend);
    }
}
