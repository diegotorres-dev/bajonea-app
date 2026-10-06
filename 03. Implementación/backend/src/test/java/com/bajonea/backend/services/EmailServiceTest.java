package com.bajonea.backend.services;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import com.bajonea.backend.enums.MotivoRegularizacionInvitacion;
import com.resend.Resend;
import com.resend.core.exception.ResendException;
import com.resend.services.emails.Emails;
import com.resend.services.emails.model.CreateEmailOptions;
import com.resend.services.emails.model.CreateEmailResponse;
import java.util.List;
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

    @Test
    void laInvitacionDeEmpleadoLlevaElCodigoYUnEnlaceGenericoSinCodigoNiEmail() throws ResendException {
        ReflectionTestUtils.setField(servicio, "envioHabilitado", true);
        ReflectionTestUtils.setField(servicio, "frontendBaseUrl", "https://bajonea.test");
        CreateEmailResponse respuesta = mock(CreateEmailResponse.class);
        when(resend.emails()).thenReturn(emails);
        when(emails.send(any(CreateEmailOptions.class))).thenReturn(respuesta);

        servicio.enviarInvitacionEmpleado("nuevo@bajonea.test", "Ana Pérez", "Café Sur", CODIGO);

        ArgumentCaptor<CreateEmailOptions> captor = ArgumentCaptor.forClass(CreateEmailOptions.class);
        verify(emails).send(captor.capture());
        CreateEmailOptions correo = captor.getValue();
        assertEquals("Ana Pérez te invitó a trabajar en Café Sur", correo.getSubject());
        assertTrue(correo.getTo().contains("nuevo@bajonea.test"));
        String cuerpo = correo.getText();
        assertTrue(cuerpo.startsWith("Hola,\n\nAna Pérez te invitó a sumarte al equipo de Café Sur en Bajoneá. "
                + "Con tu cuenta vas a poder gestionar sus productos y pedidos.\n\n"));
        assertTrue(cuerpo.contains("Tu código: " + CODIGO + "\nVence en 7 días.\n\n"));
        assertTrue(cuerpo.contains("Cómo aceptarla:\n1. Entrá a https://bajonea.test/invitacion-empleado.html\n"
                + "2. Ingresá este email y el código.\n3. Si todavía no tenés cuenta, completá tus datos.\n\n"));
        assertTrue(cuerpo.contains("También podés abrir Bajoneá y tocar «Tengo una invitación» en la pantalla de inicio de sesión."));
        assertTrue(cuerpo.endsWith("Si no esperabas este mensaje, ignoralo."));
        assertFalse(cuerpo.contains("#"), "el enlace no lleva anchors");
        assertFalse(cuerpo.contains("?"), "el enlace no lleva parámetros");
        assertFalse(cuerpo.contains("nuevo@bajonea.test"), "el enlace no lleva el email");
        assertEquals(1, cuerpo.split(CODIGO, -1).length - 1, "el código aparece una sola vez, solo como texto");
    }

    @Test
    void elAvisoDeRegularizacionDaElMotivoYLaAccionDeCadaEstadoYNombraSoloAlComercio() throws ResendException {
        ReflectionTestUtils.setField(servicio, "envioHabilitado", true);
        CreateEmailResponse respuesta = mock(CreateEmailResponse.class);
        when(resend.emails()).thenReturn(emails);
        when(emails.send(any(CreateEmailOptions.class))).thenReturn(respuesta);

        for (MotivoRegularizacionInvitacion motivo : MotivoRegularizacionInvitacion.values()) {
            servicio.enviarRegularizacionInvitacion("cuenta@bajonea.test", motivo, "Café Sur");
        }

        ArgumentCaptor<CreateEmailOptions> captor = ArgumentCaptor.forClass(CreateEmailOptions.class);
        verify(emails, times(4)).send(captor.capture());
        List<String> cuerpos = captor.getAllValues().stream().map(CreateEmailOptions::getText).toList();
        assertTrue(captor.getAllValues().stream().allMatch(c -> "Un comercio quiso invitarte a trabajar en Bajoneá".equals(c.getSubject())));
        assertEquals("Café Sur quiso invitarte a su equipo en Bajoneá, pero no pudimos enviarte la invitación porque tu cuenta está bloqueada.\n\n"
                + "Recuperá tu contraseña desde el inicio de sesión.\n\n"
                + "Después, pedile al comercio que te invite de nuevo.\n\n"
                + "Si no esperabas este mensaje, ignoralo.", cuerpos.get(0));
        assertTrue(cuerpos.get(1).contains("porque tu cuenta está suspendida.\n\nContactá a soporte.\n\n"));
        assertTrue(cuerpos.get(2).contains("porque tu cuenta está inactiva.\n\nIniciá sesión para reactivarla.\n\n"));
        assertTrue(cuerpos.get(3).contains("porque todavía no verificaste tu email.\n\nVerificá tu email para activar tu cuenta.\n\n"));
    }

    @Test
    void conEnvioDeshabilitadoElLogDeLasInvitacionesNoFiltraElCodigoNiElCuerpo() {
        ReflectionTestUtils.setField(servicio, "envioHabilitado", false);
        ReflectionTestUtils.setField(servicio, "frontendBaseUrl", "https://bajonea.test");

        servicio.enviarInvitacionEmpleado("nuevo@bajonea.test", "Ana Pérez", "Café Sur", CODIGO);
        servicio.enviarRegularizacionInvitacion("cuenta@bajonea.test", MotivoRegularizacionInvitacion.BLOQUEADA, "Café Sur");

        verifyNoInteractions(resend);
        assertEquals(2, logs.list.size());
        for (ILoggingEvent evento : logs.list) {
            String mensaje = evento.getFormattedMessage();
            assertFalse(mensaje.contains(CODIGO));
            assertFalse(mensaje.contains("Tu código"));
            assertFalse(mensaje.contains("https://bajonea.test"));
            assertFalse(mensaje.contains("bloqueada"));
            assertEquals(Level.INFO, evento.getLevel());
        }
        assertTrue(logs.list.get(0).getFormattedMessage().contains("nuevo@bajonea.test"));
        assertTrue(logs.list.get(1).getFormattedMessage().contains("cuenta@bajonea.test"));
    }
}
