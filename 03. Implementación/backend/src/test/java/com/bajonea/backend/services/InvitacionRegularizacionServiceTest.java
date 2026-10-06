package com.bajonea.backend.services;

import static org.junit.jupiter.api.Assertions.assertEquals;
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

import com.bajonea.backend.entities.Usuario;
import com.bajonea.backend.enums.CanalNotificacion;
import com.bajonea.backend.enums.MotivoRegularizacionInvitacion;
import com.bajonea.backend.enums.TipoNotificacion;
import com.bajonea.backend.repositories.NotificacionRepository;
import java.time.Clock;
import java.time.LocalDateTime;
import java.time.ZoneId;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionSynchronizationUtils;

class InvitacionRegularizacionServiceTest {

    private static final ZoneId ZONA = ZoneId.of("America/Argentina/Ushuaia");
    private static final LocalDateTime AHORA = LocalDateTime.of(2026, 10, 6, 12, 0, 0);

    private NotificacionRepository notificacionRepository;
    private NotificacionService notificacionService;
    private EmailService emailService;
    private InvitacionRegularizacionService service;
    private Usuario destinatario;

    @BeforeEach
    void preparar() {
        notificacionRepository = mock(NotificacionRepository.class);
        notificacionService = mock(NotificacionService.class);
        emailService = mock(EmailService.class);
        Clock reloj = Clock.fixed(AHORA.atZone(ZONA).toInstant(), ZONA);
        service = new InvitacionRegularizacionService(notificacionRepository, notificacionService, emailService, reloj);
        destinatario = Usuario.builder().id(7).email("cuenta@bajonea.test").build();
    }

    @AfterEach
    void limpiar() {
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.clear();
        }
    }

    private void conVentana(long enviados) {
        when(notificacionRepository.countByUsuarioIdAndTipoAndCanalAndFechaCreacionAfter(
                eq(7), eq(TipoNotificacion.INVITACION_EMPLEADO), eq(CanalNotificacion.EMAIL), any())).thenReturn(enviados);
    }

    @Test
    void bajoElTopeRegistraLaFilaYManda_ElEmailRecienAlConfirmar() {
        TransactionSynchronizationManager.initSynchronization();
        conVentana(2);

        boolean enviado = service.registrarYEnviar(destinatario, "Café Sur", MotivoRegularizacionInvitacion.BLOQUEADA);

        assertTrue(enviado);
        verify(notificacionService).registrarEmailEnviado(eq(7), anyString(), eq(TipoNotificacion.INVITACION_EMPLEADO), eq(AHORA));
        verifyNoInteractions(emailService);

        TransactionSynchronizationUtils.invokeAfterCommit(TransactionSynchronizationManager.getSynchronizations());

        verify(emailService).enviarRegularizacionInvitacion("cuenta@bajonea.test", MotivoRegularizacionInvitacion.BLOQUEADA, "Café Sur");
    }

    @Test
    void sinTransaccionEnCursoElEmailSaleEnElActo() {
        conVentana(0);

        assertTrue(service.registrarYEnviar(destinatario, "Café Sur", MotivoRegularizacionInvitacion.SUSPENDIDA));

        verify(emailService).enviarRegularizacionInvitacion("cuenta@bajonea.test", MotivoRegularizacionInvitacion.SUSPENDIDA, "Café Sur");
    }

    @Test
    void conTresEnLaVentanaNoRegistraNiManda() {
        TransactionSynchronizationManager.initSynchronization();
        conVentana(3);

        boolean enviado = service.registrarYEnviar(destinatario, "Café Sur", MotivoRegularizacionInvitacion.INACTIVA);

        assertFalse(enviado);
        verify(notificacionService, never()).registrarEmailEnviado(any(), anyString(), any(), any());
        TransactionSynchronizationUtils.invokeAfterCommit(TransactionSynchronizationManager.getSynchronizations());
        verifyNoInteractions(emailService);
    }

    @Test
    void laVentanaSonVeinticuatroHorasCorridasHaciaAtras() {
        conVentana(0);

        service.registrarYEnviar(destinatario, "Café Sur", MotivoRegularizacionInvitacion.SIN_VERIFICAR);

        ArgumentCaptor<LocalDateTime> desde = ArgumentCaptor.forClass(LocalDateTime.class);
        verify(notificacionRepository).countByUsuarioIdAndTipoAndCanalAndFechaCreacionAfter(
                eq(7), eq(TipoNotificacion.INVITACION_EMPLEADO), eq(CanalNotificacion.EMAIL), desde.capture());
        assertEquals(AHORA.minusHours(24), desde.getValue());
    }

    @Test
    void elMensajeDeLaFilaNombraAlComercioYElMotivo() {
        conVentana(0);

        service.registrarYEnviar(destinatario, "Café Sur", MotivoRegularizacionInvitacion.BLOQUEADA);

        ArgumentCaptor<String> mensaje = ArgumentCaptor.forClass(String.class);
        verify(notificacionService).registrarEmailEnviado(eq(7), mensaje.capture(), any(), any());
        assertTrue(mensaje.getValue().contains("Café Sur"));
        assertTrue(mensaje.getValue().contains("tu cuenta está bloqueada"));
    }
}
