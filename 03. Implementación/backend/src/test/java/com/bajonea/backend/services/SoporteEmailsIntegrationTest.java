package com.bajonea.backend.services;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import com.bajonea.backend.dto.response.ConsultaSoporteCreadaResponseDTO;
import com.bajonea.backend.exceptions.LimiteSoporteException;
import com.bajonea.backend.exceptions.RecursoNoEncontradoException;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Los emails de Soporte (Fase 5, tramo S4): salen una sola vez y recién después del commit, nunca dentro de una
 * transacción, no salen si la transacción se revierte, no se reintentan solos y nada de lo que se registra en el log
 * contiene un email, un código o el texto de un mensaje.
 */
class SoporteEmailsIntegrationTest extends SoporteIntegrationBase {

    @Autowired
    private AvisoSoporteService avisos;

    private final List<String> estadoAlEnviar = new ArrayList<>();

    private void capturarEstado() {
        estadoAlEnviar.add("transaccionActiva=" + TransactionSynchronizationManager.isActualTransactionActive()
                + ",sincronizacionActiva=" + TransactionSynchronizationManager.isSynchronizationActive()
                + ",recursosAtados=" + TransactionSynchronizationManager.getResourceMap().size());
    }

    private void exigirSinTransaccion(int envios) {
        assertEquals(envios, estadoAlEnviar.size());
        for (String estado : estadoAlEnviar) {
            assertEquals("transaccionActiva=false,sincronizacionActiva=false,recursosAtados=0", estado);
        }
    }

    @Test
    void elEmailDeConsultaRecibidaSaleUnaSolaVezYSinTransaccion() {
        when(emailService.enviarSoporteConsultaRecibida(anyString(), anyString())).thenAnswer(invocacion -> {
            capturarEstado();
            return ResultadoEnvioEmail.enviado("id");
        });
        String email = emailNuevo();

        ConsultaSoporteCreadaResponseDTO creada = crear(email, ipNueva());

        verify(emailService, times(1)).enviarSoporteConsultaRecibida(email, creada.getCodigo());
        exigirSinTransaccion(1);
    }

    @Test
    void elEmailDeLaRespuestaSaleSinTransaccionYDejaElMensajeMarcadoComoEnviado() {
        when(emailService.enviarSoporteRespuesta(anyString(), anyString())).thenAnswer(invocacion -> {
            capturarEstado();
            return ResultadoEnvioEmail.enviado("id");
        });
        ConsultaSoporteCreadaResponseDTO creada = crear(emailNuevo(), ipNueva());

        soporteAdmin.responder(creada.getId(), texto("Respuesta"));

        exigirSinTransaccion(1);
        assertEquals(1, jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM ticket_soporte_mensaje WHERE ticket_id = ? AND autor = 'SOPORTE' AND email_enviado = 1", Integer.class, creada.getId()));
    }

    @Test
    void elEmailNoSaleHastaQueLaTransaccionSeConfirma() {
        ConsultaSoporteCreadaResponseDTO creada = crear(emailNuevo(), ipNueva());
        int mensajeId = jdbcTemplate.queryForObject("SELECT id FROM ticket_soporte_mensaje WHERE ticket_id = ?", Integer.class, creada.getId());
        TransactionTemplate transaccion = new TransactionTemplate(transactionManager);

        transaccion.executeWithoutResult(status -> {
            avisos.avisarRespuesta("a@bajonea.test", creada.getCodigo(), mensajeId);
            verify(emailService, never()).enviarSoporteRespuesta(anyString(), anyString());
        });

        verify(emailService, times(1)).enviarSoporteRespuesta("a@bajonea.test", creada.getCodigo());
    }

    @Test
    void siLaTransaccionSeRevierteNoSaleNingunEmail() {
        TransactionTemplate transaccion = new TransactionTemplate(transactionManager);

        assertThrows(IllegalStateException.class, () -> transaccion.executeWithoutResult(status -> {
            avisos.avisarConsultaRecibida("a@bajonea.test", "ABCD2345");
            avisos.avisarRespuesta("a@bajonea.test", "ABCD2345", 1);
            avisos.enviarCodigos("a@bajonea.test", List.of("ABCD2345"));
            throw new IllegalStateException("se revierte");
        }));

        verify(emailService, never()).enviarSoporteConsultaRecibida(anyString(), anyString());
        verify(emailService, never()).enviarSoporteRespuesta(anyString(), anyString());
        verify(emailService, never()).enviarSoporteCodigos(anyString(), anyList());
    }

    @Test
    void unEmailFallidoNoSeReintentaSoloYNoDeshaceLaRespuesta() throws InterruptedException {
        String email = emailNuevo();
        ConsultaSoporteCreadaResponseDTO creada = crear(email, ipNueva());
        when(emailService.enviarSoporteRespuesta(anyString(), anyString())).thenReturn(ResultadoEnvioEmail.fallido(500, "x"));

        soporteAdmin.responder(creada.getId(), texto("Respuesta cuyo email falla"));
        Thread.sleep(500);

        verify(emailService, times(1)).enviarSoporteRespuesta(email, creada.getCodigo());
        assertEquals("ESPERA_PERSONA", estadoDeLaConsulta(creada.getId()));
        assertEquals(2, filasDeMensajes(creada.getId()));
        assertEquals(1, jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM ticket_soporte_mensaje WHERE ticket_id = ? AND autor = 'SOPORTE' AND email_enviado = 0", Integer.class, creada.getId()));
    }

    @Test
    void unEmailDeConsultaRecibidaFallidoNoImpideCrearLaConsulta() {
        when(emailService.enviarSoporteConsultaRecibida(anyString(), anyString())).thenReturn(ResultadoEnvioEmail.fallido(500, "x"));

        ConsultaSoporteCreadaResponseDTO creada = crear(emailNuevo(), ipNueva());

        assertEquals(1, filasDeMensajes(creada.getId()));
    }

    @Test
    void elLogNoContieneEmailesCodigosNiTextosDeMensajes() {
        Logger raiz = (Logger) LoggerFactory.getLogger(Logger.ROOT_LOGGER_NAME);
        ListAppender<ILoggingEvent> logs = new ListAppender<>();
        logs.start();
        raiz.addAppender(logs);
        String email = emailNuevo();
        String otroEmail = emailNuevo();
        String ip = ipNueva();
        String secreto = "texto-secreto-" + DatosUnicos.siguienteSufijo();
        try {
            ConsultaSoporteCreadaResponseDTO creada = soporte.crearSinSesion(pedido(email, com.bajonea.backend.enums.TipoTicketSoporte.OTRA, secreto), ip);
            soporte.verSinSesion(acceso(email, creada.getCodigo()), ip);
            String ipDeLosFallos = ipNueva();
            for (int i = 0; i < 11; i++) {
                int intento = i;
                if (i < 10) {
                    assertThrows(RecursoNoEncontradoException.class, () -> soporte.verSinSesion(acceso(otroEmail, "ZZZZZZZ" + intento), ipDeLosFallos));
                } else {
                    assertThrows(LimiteSoporteException.class, () -> soporte.verSinSesion(acceso(otroEmail, "ZZZZZZZ" + intento), ipDeLosFallos));
                }
            }
            soporteAdmin.responder(creada.getId(), texto(secreto + " respuesta"));
            when(emailService.enviarSoporteRespuesta(anyString(), anyString())).thenThrow(new IllegalStateException("falla " + email));
            soporte.responderSinSesion(respuestaPublica(email, creada.getCodigo(), secreto + " otra"), ip);
            soporteAdmin.responder(creada.getId(), texto(secreto + " final"));
            soporte.reenviarCodigos(reenvio(email), ipNueva());
            soporteAdmin.reenviarEmail(creada.getId());

            for (ILoggingEvent evento : logs.list) {
                String mensaje = evento.getFormattedMessage();
                assertFalse(mensaje.contains(email), mensaje);
                assertFalse(mensaje.contains(otroEmail), mensaje);
                assertFalse(mensaje.contains(creada.getCodigo()), mensaje);
                assertFalse(mensaje.contains(secreto), mensaje);
                assertTrue(evento.getThrowableProxy() == null || !evento.getThrowableProxy().getMessage().contains(creada.getCodigo()));
            }
        } finally {
            raiz.detachAppender(logs);
        }
    }
}
