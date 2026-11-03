package com.bajonea.backend.services;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;

import com.bajonea.backend.dto.response.ConsultaSoporteCreadaResponseDTO;
import com.bajonea.backend.enums.TipoTicketSoporte;
import com.bajonea.backend.exceptions.LimiteSoporteException;
import com.bajonea.backend.exceptions.RecursoNoEncontradoException;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

/**
 * Los límites del módulo de Soporte con sus mensajes exactos (Fase 5, tramo S4): consultas por día y abiertas por email,
 * consultas por IP, intentos fallidos de acceso por email y por IP, y reenvío de códigos.
 */
class SoporteLimitesIntegrationTest extends SoporteIntegrationBase {

    private static final String DIARIO = "Ya enviaste 3 consultas hoy. Probá de nuevo mañana o esperá la respuesta de Soporte.";
    private static final String ABIERTAS = "Ya tenés 3 consultas abiertas. Esperá a que Soporte las responda para enviar otra.";
    private static final String POR_IP = "Se enviaron demasiadas consultas desde tu conexión. Probá de nuevo más tarde.";
    private static final String INTENTOS = "Hiciste demasiados intentos. Probá de nuevo en una hora.";

    private int consultasDelEmail(String email) {
        return jdbcTemplate.queryForObject("SELECT COUNT(*) FROM ticket_soporte WHERE email = ?", Integer.class, email);
    }

    private void fallar(String email, String ip, int veces) {
        for (int i = 0; i < veces; i++) {
            assertThrows(RecursoNoEncontradoException.class, () -> soporte.verSinSesion(acceso(email, "ZZZZZZZZ"), ip));
        }
    }

    @Test
    void laCuartaConsultaDelDiaDeUnEmailSeRechazaConSuMensaje() {
        String email = emailNuevo();
        for (int i = 0; i < 3; i++) {
            crear(email, ipNueva());
        }

        LimiteSoporteException ex = assertThrows(LimiteSoporteException.class, () -> crear(email, ipNueva()));

        assertEquals(DIARIO, ex.getMessage());
        assertEquals(3, consultasDelEmail(email));
    }

    @Test
    void lasConsultasCerradasSiguenContandoParaElLimiteDelDia() {
        String email = emailNuevo();
        for (int i = 0; i < 3; i++) {
            soporteAdmin.cerrar(crear(email, ipNueva()).getId());
        }

        LimiteSoporteException ex = assertThrows(LimiteSoporteException.class, () -> crear(email, ipNueva()));

        assertEquals(DIARIO, ex.getMessage());
    }

    @Test
    void conTresConsultasAbiertasDeAyerNoSePuedeEnviarOtraAunqueHoyNoSeHayaEnviadoNinguna() {
        String email = emailNuevo();
        for (int i = 0; i < 3; i++) {
            crear(email, ipNueva());
        }
        envejecerConsultas(email, 30);

        LimiteSoporteException ex = assertThrows(LimiteSoporteException.class, () -> crear(email, ipNueva()));

        assertEquals(ABIERTAS, ex.getMessage());
        assertEquals(3, consultasDelEmail(email));
    }

    @Test
    void alCerrarUnaDeLasAbiertasDeAyerSePuedeEnviarOtra() {
        String email = emailNuevo();
        ConsultaSoporteCreadaResponseDTO primera = crear(email, ipNueva());
        crear(email, ipNueva());
        crear(email, ipNueva());
        envejecerConsultas(email, 30);
        assertThrows(LimiteSoporteException.class, () -> crear(email, ipNueva()));

        soporteAdmin.cerrar(primera.getId());

        assertDoesNotThrow(() -> crear(email, ipNueva()));
        assertEquals(4, consultasDelEmail(email));
    }

    @Test
    void laOnceavaConsultaDeUnaMismaIpSeRechazaAunqueCadaEmailSeaDistinto() {
        String ip = ipNueva();
        for (int i = 0; i < 10; i++) {
            crear(emailNuevo(), ip);
        }

        LimiteSoporteException ex = assertThrows(LimiteSoporteException.class, () -> crear(emailNuevo(), ip));

        assertEquals(POR_IP, ex.getMessage());
        assertEquals(10, jdbcTemplate.queryForObject("SELECT COUNT(*) FROM ticket_soporte WHERE ip = ?", Integer.class, ip));
    }

    @Test
    void elLimiteDeEmailNoAfectaAOtroEmailNiElDeIpAOtraIp() {
        String ip = ipNueva();
        String lleno = emailNuevo();
        for (int i = 0; i < 3; i++) {
            crear(lleno, ipNueva());
        }

        assertDoesNotThrow(() -> crear(emailNuevo(), ip));
        assertDoesNotThrow(() -> crear(emailNuevo(), ip));
    }

    @Test
    void despuesDeCincoIntentosFallidosElSextoSeBloqueaAunqueElCodigoSeaCorrecto() {
        String email = emailNuevo();
        ConsultaSoporteCreadaResponseDTO creada = crear(email, ipNueva());
        String ip = ipNueva();
        fallar(email, ip, 5);

        LimiteSoporteException ex = assertThrows(LimiteSoporteException.class,
                () -> soporte.verSinSesion(acceso(email, creada.getCodigo()), ip));
        assertEquals(INTENTOS, ex.getMessage());
        LimiteSoporteException desdeOtraIp = assertThrows(LimiteSoporteException.class,
                () -> soporte.verSinSesion(acceso(email, creada.getCodigo()), ipNueva()));
        assertEquals(INTENTOS, desdeOtraIp.getMessage());
        LimiteSoporteException respondiendo = assertThrows(LimiteSoporteException.class,
                () -> soporte.responderSinSesion(respuestaPublica(email, creada.getCodigo(), "Hola"), ipNueva()));
        assertEquals(INTENTOS, respondiendo.getMessage());
    }

    @Test
    void despuesDeDiezIntentosFallidosDeUnaIpSeBloqueanTodosLosEmailsDeEsaIp() {
        String ip = ipNueva();
        for (int i = 0; i < 10; i++) {
            String email = emailNuevo();
            assertThrows(RecursoNoEncontradoException.class, () -> soporte.verSinSesion(acceso(email, "ZZZZZZZZ"), ip));
        }
        String limpio = emailNuevo();
        ConsultaSoporteCreadaResponseDTO creada = crear(limpio, ipNueva());

        LimiteSoporteException ex = assertThrows(LimiteSoporteException.class,
                () -> soporte.verSinSesion(acceso(limpio, creada.getCodigo()), ip));

        assertEquals(INTENTOS, ex.getMessage());
        assertDoesNotThrow(() -> soporte.verSinSesion(acceso(limpio, creada.getCodigo()), ipNueva()));
    }

    @Test
    void losAccesosCorrectosNoCuentanComoIntentosFallidos() {
        String email = emailNuevo();
        ConsultaSoporteCreadaResponseDTO creada = crear(email, ipNueva());
        String ip = ipNueva();

        for (int i = 0; i < 12; i++) {
            soporte.verSinSesion(acceso(email, creada.getCodigo()), ip);
        }
        fallar(email, ip, 4);

        assertDoesNotThrow(() -> soporte.verSinSesion(acceso(email, creada.getCodigo()), ip));
    }

    @Test
    void cuandoPasaLaVentanaDeUnaHoraSePuedeVolverAIntentar() {
        String email = emailNuevo();
        ConsultaSoporteCreadaResponseDTO creada = crear(email, ipNueva());
        String ip = ipNueva();
        fallar(email, ip, 5);
        assertThrows(LimiteSoporteException.class, () -> soporte.verSinSesion(acceso(email, creada.getCodigo()), ip));

        jdbcTemplate.update("UPDATE soporte_limite SET ventana_inicio = ventana_inicio - INTERVAL 2 HOUR WHERE clave IN (?, ?)",
                "INTENTO_EMAIL|" + email, "INTENTO_IP|" + ip);

        assertDoesNotThrow(() -> soporte.verSinSesion(acceso(email, creada.getCodigo()), ip));
        assertThrows(RecursoNoEncontradoException.class, () -> soporte.verSinSesion(acceso(email, "ZZZZZZZZ"), ip));
        assertEquals(1, jdbcTemplate.queryForObject("SELECT cantidad FROM soporte_limite WHERE clave = ?", Integer.class, "INTENTO_EMAIL|" + email));
    }

    @Test
    void elReenvioDeCodigosRespondeSiempreLoMismoHayaONoConsultas() {
        String conConsultas = emailNuevo();
        ConsultaSoporteCreadaResponseDTO creada = crear(conConsultas, ipNueva());
        String sinConsultas = emailNuevo();

        String uno = soporte.reenviarCodigos(reenvio(conConsultas), ipNueva());
        String otro = soporte.reenviarCodigos(reenvio(sinConsultas), ipNueva());

        assertEquals("Si hay consultas con ese email, te mandamos los códigos. Revisá tu bandeja de entrada.", uno);
        assertEquals(uno, otro);
        ArgumentCaptor<List<String>> codigos = ArgumentCaptor.forClass(List.class);
        verify(emailService, times(1)).enviarSoporteCodigos(anyString(), codigos.capture());
        assertEquals(List.of(creada.getCodigo()), codigos.getValue());
        verify(emailService, never()).enviarSoporteCodigos(org.mockito.ArgumentMatchers.eq(sinConsultas), anyList());
    }

    @Test
    void elReenvioSoloIncluyeLasConsultasNoCerradasYNoMandaNadaSiNoQuedaNinguna() {
        String email = emailNuevo();
        ConsultaSoporteCreadaResponseDTO abierta = crear(email, ipNueva());
        ConsultaSoporteCreadaResponseDTO cerrada = crear(email, ipNueva());
        soporteAdmin.cerrar(cerrada.getId());

        soporte.reenviarCodigos(reenvio(email), ipNueva());

        ArgumentCaptor<List<String>> codigos = ArgumentCaptor.forClass(List.class);
        verify(emailService, times(1)).enviarSoporteCodigos(anyString(), codigos.capture());
        assertEquals(List.of(abierta.getCodigo()), codigos.getValue());

        soporteAdmin.cerrar(abierta.getId());
        soporte.reenviarCodigos(reenvio(email), ipNueva());
        verify(emailService, times(1)).enviarSoporteCodigos(anyString(), anyList());
    }

    @Test
    void elReenvioTieneUnMaximoDeTresPorHoraPorEmailYPorIpHayaONoConsultas() {
        String email = emailNuevo();
        for (int i = 0; i < 3; i++) {
            soporte.reenviarCodigos(reenvio(email), ipNueva());
        }
        LimiteSoporteException porEmail = assertThrows(LimiteSoporteException.class,
                () -> soporte.reenviarCodigos(reenvio(email), ipNueva()));
        assertEquals(INTENTOS, porEmail.getMessage());

        String ip = ipNueva();
        for (int i = 0; i < 3; i++) {
            soporte.reenviarCodigos(reenvio(emailNuevo()), ip);
        }
        LimiteSoporteException porIp = assertThrows(LimiteSoporteException.class,
                () -> soporte.reenviarCodigos(reenvio(emailNuevo()), ip));
        assertEquals(INTENTOS, porIp.getMessage());
    }

    @Test
    void unaConsultaCreadaConLosTresLimitesEnSuNivelNoDejaFilasDeContadorSinUsar() {
        String email = emailNuevo();
        String ip = ipNueva();

        crear(email, ip);

        assertEquals(1, jdbcTemplate.queryForObject("SELECT COUNT(*) FROM soporte_limite WHERE clave = ?", Integer.class, "CREAR_EMAIL|" + email));
        assertEquals(1, jdbcTemplate.queryForObject("SELECT COUNT(*) FROM soporte_limite WHERE clave = ?", Integer.class, "CREAR_IP|" + ip));
        assertEquals(TipoTicketSoporte.NO_PUEDO_ENTRAR.name(),
                jdbcTemplate.queryForObject("SELECT tipo FROM ticket_soporte WHERE email = ?", String.class, email));
    }
}
