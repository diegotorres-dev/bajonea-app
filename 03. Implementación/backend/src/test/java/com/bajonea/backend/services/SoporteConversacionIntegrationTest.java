package com.bajonea.backend.services;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;

import com.bajonea.backend.dto.response.ConsultaSoporteAdminDetalleResponseDTO;
import com.bajonea.backend.dto.response.ConsultaSoporteCreadaResponseDTO;
import com.bajonea.backend.dto.response.ConsultaSoporteResponseDTO;
import com.bajonea.backend.enums.AutorMensajeSoporte;
import com.bajonea.backend.enums.EstadoTicketSoporte;
import com.bajonea.backend.enums.TipoTicketSoporte;
import com.bajonea.backend.exceptions.ConflictoDeNegocioException;
import com.bajonea.backend.exceptions.RecursoNoEncontradoException;
import java.util.HashSet;
import java.util.Set;
import org.junit.jupiter.api.Test;

/**
 * La conversación por turnos de una consulta de Soporte (Fase 5, tramo S4): cómo nace, quién puede escribir cuándo, el tope
 * de 20 mensajes, el cierre y el acceso con email y código.
 */
class SoporteConversacionIntegrationTest extends SoporteIntegrationBase {

    private ConsultaSoporteResponseDTO ver(String email, String codigo, String ip) {
        return soporte.verSinSesion(acceso(email, codigo), ip);
    }

    @Test
    void laConsultaNaceEnEsperaDeSoporteConSuPrimerMensajeYUnCodigoLegible() {
        String email = emailNuevo();
        String ip = ipNueva();

        ConsultaSoporteCreadaResponseDTO creada = soporte.crearSinSesion(
                pedido(email.toUpperCase(), TipoTicketSoporte.APELACION_COMERCIO, "  Mi comercio fue rechazado sin motivo  "), ip);

        assertEquals(EstadoTicketSoporte.ESPERA_SOPORTE, creada.getEstado());
        assertTrue(creada.getCodigo().matches("[2-9A-HJKMNP-Z]{8}"), creada.getCodigo());
        assertEquals(email, jdbcTemplate.queryForObject("SELECT email FROM ticket_soporte WHERE id = ?", String.class, creada.getId()));
        assertEquals("APELACION_COMERCIO", jdbcTemplate.queryForObject("SELECT tipo FROM ticket_soporte WHERE id = ?", String.class, creada.getId()));
        assertEquals(ip, jdbcTemplate.queryForObject("SELECT ip FROM ticket_soporte WHERE id = ?", String.class, creada.getId()));
        assertNull(jdbcTemplate.queryForObject("SELECT usuario_id FROM ticket_soporte WHERE id = ?", Integer.class, creada.getId()));
        assertEquals(1, cantidadDeMensajes(creada.getId()));
        assertEquals(1, filasDeMensajes(creada.getId()));
        assertEquals("Mi comercio fue rechazado sin motivo",
                jdbcTemplate.queryForObject("SELECT texto FROM ticket_soporte_mensaje WHERE ticket_id = ?", String.class, creada.getId()));
        assertEquals("PERSONA", jdbcTemplate.queryForObject("SELECT autor FROM ticket_soporte_mensaje WHERE ticket_id = ?", String.class, creada.getId()));
    }

    @Test
    void losCincoTiposSeGuardanTalCual() {
        for (TipoTicketSoporte tipo : TipoTicketSoporte.values()) {
            ConsultaSoporteCreadaResponseDTO creada = soporte.crearSinSesion(pedido(emailNuevo(), tipo, TEXTO_INICIAL), ipNueva());
            assertEquals(tipo.name(), jdbcTemplate.queryForObject("SELECT tipo FROM ticket_soporte WHERE id = ?", String.class, creada.getId()));
        }
    }

    @Test
    void elAlfabetoDelCodigoNoTieneCaracteresQueSeConfunden() {
        CodigoConsultaGenerador generador = new CodigoConsultaGenerador();
        Set<String> vistos = new HashSet<>();
        for (int i = 0; i < 3000; i++) {
            String codigo = generador.generar();
            assertEquals(8, codigo.length());
            assertTrue(codigo.matches("[2-9A-HJKMNP-Z]{8}"), codigo);
            for (char prohibido : "01OIL".toCharArray()) {
                assertFalse(codigo.indexOf(prohibido) >= 0, codigo);
            }
            vistos.add(codigo);
        }
        assertEquals(3000, vistos.size());
    }

    @Test
    void elCodigoSeNormalizaSinEspaciosNiGuionesYEnMayusculas() {
        assertEquals("ABCD2345", CodigoConsultaGenerador.normalizar(" abcd-2345 "));
        assertEquals("ABCD2345", CodigoConsultaGenerador.normalizar("ab cd 23 45"));
        assertEquals("", CodigoConsultaGenerador.normalizar(null));
    }

    @Test
    void sePuedeVerLaConsultaConElEmailSinImportarMayusculasYElCodigoSinGuionesNiMinusculas() {
        String email = emailNuevo();
        ConsultaSoporteCreadaResponseDTO creada = crear(email, ipNueva());
        String codigoTipeado = creada.getCodigo().substring(0, 4).toLowerCase() + " - " + creada.getCodigo().substring(4).toLowerCase();

        ConsultaSoporteResponseDTO vista = ver(email.toUpperCase(), codigoTipeado, ipNueva());

        assertEquals(creada.getCodigo(), vista.getCodigo());
        assertEquals(1, vista.getMensajes().size());
        assertEquals(TEXTO_INICIAL, vista.getMensajes().get(0).getTexto());
        assertFalse(vista.isPuedeResponder());
        assertEquals(ConversacionSoporte.MENSAJE_TURNO_PERSONA, vista.getAviso());
        assertNull(vista.getMensajes().get(0).getEmailEnviado());
    }

    @Test
    void laConversacionAlternaLosTurnosEntreLaPersonaYSoporte() {
        String email = emailNuevo();
        String ip = ipNueva();
        ConsultaSoporteCreadaResponseDTO creada = crear(email, ip);

        ConflictoDeNegocioException fueraDeTurno = assertThrows(ConflictoDeNegocioException.class,
                () -> soporte.responderSinSesion(respuestaPublica(email, creada.getCodigo(), "Otra vez yo"), ip));
        assertEquals("Soporte todavía no respondió. Vas a poder escribir cuando lo haga.", fueraDeTurno.getMessage());
        assertEquals(1, cantidadDeMensajes(creada.getId()));

        ConsultaSoporteAdminDetalleResponseDTO tras = soporteAdmin.responder(creada.getId(), texto("Hola, ¿qué te dice la pantalla?"));
        assertEquals(EstadoTicketSoporte.ESPERA_PERSONA, tras.getEstado());
        assertFalse(tras.isPuedeResponder());
        assertEquals(2, tras.getCantidadMensajes());

        ConflictoDeNegocioException soporteFueraDeTurno = assertThrows(ConflictoDeNegocioException.class,
                () -> soporteAdmin.responder(creada.getId(), texto("Sigo acá")));
        assertEquals(ConversacionSoporte.MENSAJE_TURNO_SOPORTE, soporteFueraDeTurno.getMessage());
        assertEquals(2, filasDeMensajes(creada.getId()));

        ConsultaSoporteResponseDTO vista = ver(email, creada.getCodigo(), ip);
        assertTrue(vista.isPuedeResponder());
        assertNull(vista.getAviso());

        ConsultaSoporteResponseDTO respondida = soporte.responderSinSesion(respuestaPublica(email, creada.getCodigo(), "Gracias"), ip);
        assertEquals(EstadoTicketSoporte.ESPERA_SOPORTE, respondida.getEstado());
        assertEquals(3, respondida.getMensajes().size());
        assertEquals(AutorMensajeSoporte.PERSONA, respondida.getMensajes().get(2).getAutor());
        assertEquals("ESPERA_SOPORTE", estadoDeLaConsulta(creada.getId()));
    }

    @Test
    void unaRespuestaDeUnSoloCaracterEsValida() {
        String email = emailNuevo();
        String ip = ipNueva();
        ConsultaSoporteCreadaResponseDTO creada = crear(email, ip);
        soporteAdmin.responder(creada.getId(), texto("Contanos más"));

        ConsultaSoporteResponseDTO respondida = soporte.responderSinSesion(respuestaPublica(email, creada.getCodigo(), "k"), ip);

        assertEquals("k", respondida.getMensajes().get(2).getTexto());
    }

    @Test
    void elMensajeNumeroVeinteCierraLaConsultaSolaYYaNadieEscribe() {
        String email = emailNuevo();
        String ip = ipNueva();
        ConsultaSoporteCreadaResponseDTO creada = crear(email, ip);
        for (int turno = 2; turno < 20; turno++) {
            if (turno % 2 == 0) {
                soporteAdmin.responder(creada.getId(), texto("Respuesta de Soporte " + turno));
            } else {
                soporte.responderSinSesion(respuestaPublica(email, creada.getCodigo(), "Respuesta de la persona " + turno), ip);
            }
        }
        assertEquals(19, cantidadDeMensajes(creada.getId()));
        assertEquals("ESPERA_SOPORTE", estadoDeLaConsulta(creada.getId()));

        ConsultaSoporteAdminDetalleResponseDTO ultima = soporteAdmin.responder(creada.getId(), texto("Último mensaje de Soporte"));

        assertEquals(EstadoTicketSoporte.CERRADO, ultima.getEstado());
        assertEquals(20, ultima.getCantidadMensajes());
        assertNotNull(ultima.getCerradoEn());
        assertEquals(20, filasDeMensajes(creada.getId()));

        ConsultaSoporteResponseDTO vista = ver(email, creada.getCodigo(), ip);
        assertFalse(vista.isPuedeResponder());
        assertEquals(ConversacionSoporte.MENSAJE_TOPE, vista.getAviso());
        assertEquals("Llegamos al máximo de mensajes de esta consulta. Si necesitás algo más, enviá una consulta nueva.", vista.getAviso());

        ConflictoDeNegocioException persona = assertThrows(ConflictoDeNegocioException.class,
                () -> soporte.responderSinSesion(respuestaPublica(email, creada.getCodigo(), "¿Puedo seguir?"), ip));
        assertEquals(ConversacionSoporte.MENSAJE_CERRADA, persona.getMessage());
        assertThrows(ConflictoDeNegocioException.class, () -> soporteAdmin.responder(creada.getId(), texto("¿Y yo?")));
        assertEquals(20, filasDeMensajes(creada.getId()));
    }

    @Test
    void soloSoporteCierraYUnaConsultaCerradaNoSeReabreNiAceptaMensajes() {
        String email = emailNuevo();
        String ip = ipNueva();
        ConsultaSoporteCreadaResponseDTO creada = crear(email, ip);

        ConsultaSoporteAdminDetalleResponseDTO cerrada = soporteAdmin.cerrar(creada.getId());

        assertEquals(EstadoTicketSoporte.CERRADO, cerrada.getEstado());
        assertNotNull(cerrada.getCerradoEn());
        ConsultaSoporteResponseDTO vista = ver(email, creada.getCodigo(), ip);
        assertEquals(ConversacionSoporte.MENSAJE_CERRADA, vista.getAviso());
        assertEquals("Esta consulta está cerrada. Si necesitás algo más, enviá una consulta nueva.", vista.getAviso());

        ConflictoDeNegocioException persona = assertThrows(ConflictoDeNegocioException.class,
                () -> soporte.responderSinSesion(respuestaPublica(email, creada.getCodigo(), "Quiero seguir"), ip));
        assertEquals(ConversacionSoporte.MENSAJE_CERRADA, persona.getMessage());
        ConflictoDeNegocioException admin = assertThrows(ConflictoDeNegocioException.class,
                () -> soporteAdmin.responder(creada.getId(), texto("Reabro")));
        assertEquals(ConversacionSoporte.MENSAJE_CERRADA, admin.getMessage());
        ConflictoDeNegocioException otraVez = assertThrows(ConflictoDeNegocioException.class, () -> soporteAdmin.cerrar(creada.getId()));
        assertEquals(SoporteAdminService.MENSAJE_YA_CERRADA, otraVez.getMessage());
        assertEquals("CERRADO", estadoDeLaConsulta(creada.getId()));
        assertEquals(1, filasDeMensajes(creada.getId()));
    }

    @Test
    void elTextoConHtmlSeGuardaYSeDevuelveTalCualSinInterpretarlo() {
        String email = emailNuevo();
        String ip = ipNueva();
        String html = "<img src=x onerror=alert(1)> & <b>negrita</b>";
        ConsultaSoporteCreadaResponseDTO creada = soporte.crearSinSesion(pedido(email, TipoTicketSoporte.OTRA, html), ip);

        assertEquals(html, ver(email, creada.getCodigo(), ip).getMensajes().get(0).getTexto());
        assertEquals(html, jdbcTemplate.queryForObject("SELECT texto FROM ticket_soporte_mensaje WHERE ticket_id = ?", String.class, creada.getId()));
    }

    @Test
    void conUnCodigoOEmailIncorrectoLaRespuestaEsSiempreLaMisma() {
        String emailDuenio = emailNuevo();
        String otroEmail = emailNuevo();
        ConsultaSoporteCreadaResponseDTO propia = crear(emailDuenio, ipNueva());
        ConsultaSoporteCreadaResponseDTO ajena = crear(otroEmail, ipNueva());

        RecursoNoEncontradoException emailInexistente = assertThrows(RecursoNoEncontradoException.class,
                () -> ver(emailNuevo(), propia.getCodigo(), ipNueva()));
        RecursoNoEncontradoException codigoIncorrecto = assertThrows(RecursoNoEncontradoException.class,
                () -> ver(emailDuenio, "ZZZZZZZZ", ipNueva()));
        RecursoNoEncontradoException combinacionAjena = assertThrows(RecursoNoEncontradoException.class,
                () -> ver(emailDuenio, ajena.getCodigo(), ipNueva()));
        RecursoNoEncontradoException codigoMalFormado = assertThrows(RecursoNoEncontradoException.class,
                () -> ver(emailDuenio, "123", ipNueva()));

        String esperado = "No encontramos una consulta con esos datos. Revisá el email y el código.";
        for (RecursoNoEncontradoException ex : new RecursoNoEncontradoException[] {emailInexistente, codigoIncorrecto, combinacionAjena,
                codigoMalFormado}) {
            assertEquals(esperado, ex.getMessage());
        }
        assertThrows(RecursoNoEncontradoException.class,
                () -> soporte.responderSinSesion(respuestaPublica(otroEmail, propia.getCodigo(), "Intento"), ipNueva()));
        assertEquals(1, filasDeMensajes(propia.getId()));
    }

    @Test
    void laRespuestaDeSoporteMandaUnEmailALaPersonaConSuCodigo() {
        String email = emailNuevo();
        ConsultaSoporteCreadaResponseDTO creada = crear(email, ipNueva());

        soporteAdmin.responder(creada.getId(), texto("Ya revisamos tu caso"));

        verify(emailService, times(1)).enviarSoporteRespuesta(email, creada.getCodigo());
        verify(emailService, times(1)).enviarSoporteConsultaRecibida(email, creada.getCodigo());
        assertEquals(1, jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM ticket_soporte_mensaje WHERE ticket_id = ? AND autor = 'SOPORTE' AND email_enviado = 1",
                Integer.class, creada.getId()));
        verify(emailService, times(0)).enviarSoporteCodigos(anyString(), org.mockito.ArgumentMatchers.anyList());
    }

    @Test
    void unaConsultaOUnMensajeInexistenteDaNoEncontrado() {
        assertThrows(RecursoNoEncontradoException.class, () -> soporteAdmin.detalle(Integer.MAX_VALUE));
        assertThrows(RecursoNoEncontradoException.class, () -> soporteAdmin.responder(Integer.MAX_VALUE, texto("x")));
        assertThrows(RecursoNoEncontradoException.class, () -> soporteAdmin.cerrar(Integer.MAX_VALUE));
        assertThrows(RecursoNoEncontradoException.class, () -> soporteAdmin.reenviarEmail(Integer.MAX_VALUE));
    }
}
