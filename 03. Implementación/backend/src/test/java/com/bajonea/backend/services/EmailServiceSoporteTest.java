package com.bajonea.backend.services;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import com.bajonea.backend.util.SoporteEnlaces;
import com.resend.Resend;
import com.resend.core.exception.ResendException;
import com.resend.services.emails.Emails;
import com.resend.services.emails.model.CreateEmailOptions;
import com.resend.services.emails.model.CreateEmailResponse;
import java.util.List;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.slf4j.LoggerFactory;
import org.springframework.test.util.ReflectionTestUtils;

/**
 * Los tres emails de Soporte (Fase 5, tramo S4): el enlace "Ver mi consulta" lleva el código y el email en el fragmento,
 * el resultado se devuelve en lugar de tragarse, y ni el destinatario ni el código quedan en el log.
 */
class EmailServiceSoporteTest {

    private static final String CODIGO = "AB2CD3EF";
    private static final String EMAIL = "persona+prueba@bajonea.test";

    private Resend resend;
    private Emails emails;
    private EmailService servicio;
    private ListAppender<ILoggingEvent> logs;
    private Logger logger;

    @BeforeEach
    void preparar() {
        resend = mock(Resend.class);
        emails = mock(Emails.class);
        servicio = new EmailService(resend);
        ReflectionTestUtils.setField(servicio, "remitente", "info@bajonea.test");
        ReflectionTestUtils.setField(servicio, "frontendBaseUrl", "https://bajonea.test/");
        logger = (Logger) LoggerFactory.getLogger(EmailService.class);
        logs = new ListAppender<>();
        logs.start();
        logger.addAppender(logs);
    }

    @AfterEach
    void limpiar() {
        logger.detachAppender(logs);
    }

    private void assertSinDatosPersonalesEnElLog() {
        for (ILoggingEvent evento : logs.list) {
            String mensaje = evento.getFormattedMessage();
            assertFalse(mensaje.contains(EMAIL), mensaje);
            assertFalse(mensaje.contains(CODIGO), mensaje);
            assertFalse(mensaje.contains("persona"), mensaje);
        }
    }

    @Test
    void elEnlaceLlevaElCodigoYElEmailEnElFragmentoNuncaEnLaQuery() {
        String enlace = SoporteEnlaces.enlaceConsulta("https://bajonea.test/", CODIGO, EMAIL);

        assertEquals("https://bajonea.test/soporte-consulta.html#codigo=AB2CD3EF&email=persona%2Bprueba%40bajonea.test", enlace);
        assertEquals("soporte-consulta.html", SoporteEnlaces.PAGINA_CONSULTA);
        assertFalse(enlace.contains("?"));
        assertEquals(1, enlace.chars().filter(c -> c == '#').count());
    }

    @Test
    void laConsultaRecibidaLlevaElCodigoYElBotonVerMiConsulta() throws ResendException {
        ReflectionTestUtils.setField(servicio, "envioHabilitado", true);
        CreateEmailResponse respuesta = mock(CreateEmailResponse.class);
        when(respuesta.getId()).thenReturn("id-resend");
        when(resend.emails()).thenReturn(emails);
        when(emails.send(any(CreateEmailOptions.class))).thenReturn(respuesta);

        ResultadoEnvioEmail resultado = servicio.enviarSoporteConsultaRecibida(EMAIL, CODIGO);

        ArgumentCaptor<CreateEmailOptions> captor = ArgumentCaptor.forClass(CreateEmailOptions.class);
        verify(emails).send(captor.capture());
        assertEquals(ResultadoEnvioEmail.Estado.ENVIADO, resultado.estado());
        assertEquals("Recibimos tu consulta — Bajoneá", captor.getValue().getSubject());
        assertTrue(captor.getValue().getTo().contains(EMAIL));
        assertTrue(captor.getValue().getText().contains("El código de tu consulta es: " + CODIGO));
        assertTrue(captor.getValue().getText().contains("Ver mi consulta: https://bajonea.test/soporte-consulta.html#codigo=" + CODIGO));
        assertSinDatosPersonalesEnElLog();
    }

    @Test
    void laRespuestaDeSoporteLlevaElEnlaceYElAsuntoNoTieneElCodigo() throws ResendException {
        ReflectionTestUtils.setField(servicio, "envioHabilitado", true);
        CreateEmailResponse respuesta = mock(CreateEmailResponse.class);
        when(resend.emails()).thenReturn(emails);
        when(emails.send(any(CreateEmailOptions.class))).thenReturn(respuesta);

        servicio.enviarSoporteRespuesta(EMAIL, CODIGO);

        ArgumentCaptor<CreateEmailOptions> captor = ArgumentCaptor.forClass(CreateEmailOptions.class);
        verify(emails).send(captor.capture());
        assertEquals("Soporte respondió tu consulta — Bajoneá", captor.getValue().getSubject());
        assertTrue(captor.getValue().getText().contains("#codigo=" + CODIGO + "&email="));
        assertSinDatosPersonalesEnElLog();
    }

    @Test
    void elReenvioDeCodigosListaTodosConSuEnlace() throws ResendException {
        ReflectionTestUtils.setField(servicio, "envioHabilitado", true);
        CreateEmailResponse respuesta = mock(CreateEmailResponse.class);
        when(resend.emails()).thenReturn(emails);
        when(emails.send(any(CreateEmailOptions.class))).thenReturn(respuesta);

        servicio.enviarSoporteCodigos(EMAIL, List.of(CODIGO, "ZZ9YY8XX"));

        ArgumentCaptor<CreateEmailOptions> captor = ArgumentCaptor.forClass(CreateEmailOptions.class);
        verify(emails).send(captor.capture());
        assertEquals("Tus códigos de consulta — Bajoneá", captor.getValue().getSubject());
        assertTrue(captor.getValue().getText().contains(CODIGO + ": https://bajonea.test/soporte-consulta.html#codigo=" + CODIGO));
        assertTrue(captor.getValue().getText().contains("ZZ9YY8XX: https://bajonea.test/soporte-consulta.html#codigo=ZZ9YY8XX"));
        assertSinDatosPersonalesEnElLog();
    }

    @Test
    void conEnvioDeshabilitadoNoLlamaAResendNiRegistraElDestinatario() {
        ReflectionTestUtils.setField(servicio, "envioHabilitado", false);

        ResultadoEnvioEmail resultado = servicio.enviarSoporteConsultaRecibida(EMAIL, CODIGO);
        servicio.enviarSoporteRespuesta(EMAIL, CODIGO);
        servicio.enviarSoporteCodigos(EMAIL, List.of(CODIGO));

        verifyNoInteractions(resend);
        assertEquals(ResultadoEnvioEmail.Estado.DESHABILITADO, resultado.estado());
        assertEquals(3, logs.list.size());
        assertSinDatosPersonalesEnElLog();
    }

    @Test
    void siResendFallaDevuelveElResultadoFallidoSinRelanzarYSinDatosEnElLog() throws ResendException {
        ReflectionTestUtils.setField(servicio, "envioHabilitado", true);
        when(resend.emails()).thenReturn(emails);
        when(emails.send(any(CreateEmailOptions.class))).thenThrow(new ResendException("falló para " + EMAIL + " con " + CODIGO));

        ResultadoEnvioEmail resultado = servicio.enviarSoporteRespuesta(EMAIL, CODIGO);
        when(emails.send(any(CreateEmailOptions.class))).thenThrow(new IllegalStateException("falló para " + EMAIL));
        ResultadoEnvioEmail inesperado = servicio.enviarSoporteRespuesta(EMAIL, CODIGO);

        assertEquals(ResultadoEnvioEmail.Estado.FALLIDO, resultado.estado());
        assertFalse(resultado.salio());
        assertEquals(ResultadoEnvioEmail.Estado.FALLIDO, inesperado.estado());
        assertEquals(2, logs.list.size());
        assertSinDatosPersonalesEnElLog();
    }

    @Test
    void lasFallasSimuladasSoloCuentanParaLosEmailsDeSoporteConElEnvioDeshabilitado() {
        ReflectionTestUtils.setField(servicio, "envioHabilitado", false);
        servicio.simularFallasDeSoporte(2);

        assertEquals(ResultadoEnvioEmail.Estado.FALLIDO, servicio.enviarSoporteRespuesta(EMAIL, CODIGO).estado());
        assertEquals(ResultadoEnvioEmail.Estado.FALLIDO, servicio.enviarSoporteConsultaRecibida(EMAIL, CODIGO).estado());
        assertEquals(ResultadoEnvioEmail.Estado.DESHABILITADO, servicio.enviarSoporteCodigos(EMAIL, List.of(CODIGO)).estado());
        assertSinDatosPersonalesEnElLog();
    }
}
