package com.bajonea.backend.services;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import com.resend.Resend;
import com.resend.core.exception.ResendException;
import com.resend.services.emails.Emails;
import com.resend.services.emails.model.CreateEmailOptions;
import com.resend.services.emails.model.CreateEmailResponse;
import java.util.Map;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;
import org.springframework.core.env.MapPropertySource;
import org.springframework.test.util.ReflectionTestUtils;

class EmailServiceTest {

    private static final String CODIGO = "654321";

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

        logger = (Logger) LoggerFactory.getLogger(EmailService.class);
        logs = new ListAppender<>();
        logs.start();
        logger.addAppender(logs);
    }

    @AfterEach
    void limpiar() {
        logger.detachAppender(logs);
    }

    @Test
    void conEnvioDeshabilitadoNoLlamaAResendYSoloLogueaDestinatarioYAsunto() {
        ReflectionTestUtils.setField(servicio, "envioHabilitado", false);

        servicio.enviarVerificacion("cliente@bajonea.test", CODIGO);
        servicio.enviarRecuperacionPassword("cliente@bajonea.test", CODIGO);
        servicio.enviarReactivacionCuenta("cliente@bajonea.test", CODIGO);

        verifyNoInteractions(resend);
        assertEquals(3, logs.list.size());
        for (ILoggingEvent evento : logs.list) {
            String mensaje = evento.getFormattedMessage();
            assertTrue(mensaje.contains("cliente@bajonea.test"));
            assertTrue(mensaje.contains("Bajoneá"));
            assertFalse(mensaje.contains(CODIGO));
            assertEquals(Level.INFO, evento.getLevel());
        }
    }

    @Test
    void conEnvioHabilitadoEnviaPorResendConElCodigoEnElCuerpo() throws ResendException {
        ReflectionTestUtils.setField(servicio, "envioHabilitado", true);
        CreateEmailResponse respuesta = mock(CreateEmailResponse.class);
        when(respuesta.getId()).thenReturn("id-resend");
        when(resend.emails()).thenReturn(emails);
        when(emails.send(any(CreateEmailOptions.class))).thenReturn(respuesta);

        servicio.enviarVerificacion("cliente@bajonea.test", CODIGO);

        ArgumentCaptor<CreateEmailOptions> captor = ArgumentCaptor.forClass(CreateEmailOptions.class);
        verify(emails).send(captor.capture());
        assertTrue(captor.getValue().getText().contains(CODIGO));
        assertTrue(captor.getValue().getTo().contains("cliente@bajonea.test"));
        assertTrue(logs.list.stream().noneMatch(e -> e.getFormattedMessage().contains(CODIGO)));
    }

    @Test
    void sinConfigurarLaPropiedadElEnvioQuedaHabilitadoPorDefecto() throws ResendException {
        CreateEmailResponse respuesta = mock(CreateEmailResponse.class);
        when(resend.emails()).thenReturn(emails);
        when(emails.send(any(CreateEmailOptions.class))).thenReturn(respuesta);

        AnnotationConfigApplicationContext contexto = new AnnotationConfigApplicationContext();
        contexto.getBeanFactory().registerSingleton("resend", resend);
        contexto.getEnvironment().getPropertySources().addFirst(
                new MapPropertySource("props", Map.of("mail.from", "info@bajonea.test")));
        contexto.register(EmailService.class);
        contexto.refresh();
        try {
            contexto.getBean(EmailService.class).enviarRecuperacionPassword("cliente@bajonea.test", CODIGO);
        } finally {
            contexto.close();
        }

        verify(emails).send(any(CreateEmailOptions.class));
    }
}
