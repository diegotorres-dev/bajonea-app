package com.bajonea.backend.services;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.bajonea.backend.dto.response.ConsultaSoporteCreadaResponseDTO;
import com.bajonea.backend.exceptions.ConflictoDeNegocioException;
import com.bajonea.backend.exceptions.LimiteSoporteException;
import com.bajonea.backend.exceptions.RecursoNoEncontradoException;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Callable;
import org.junit.jupiter.api.RepeatedTest;

/**
 * Carreras del módulo de Soporte (Fase 5, tramo S4), cada una repetida 8 veces: los límites por email y por IP y los
 * intentos fallidos se respetan al pie de la letra aunque los pedidos lleguen a la vez, y dos escrituras sobre la misma
 * consulta (dos respuestas de Soporte, una respuesta contra un cierre, dos mensajes de la persona, el mensaje número 20)
 * nunca duplican un turno ni pasan el tope. Una sola transacción gana cada disputa y las demás reciben el mensaje de
 * negocio que corresponde, nunca un error interno.
 */
class SoporteConcurrenciaIntegrationTest extends SoporteIntegrationBase {

    private static long contar(List<Object> resultados, Class<? extends Exception> tipo) {
        return resultados.stream().filter(tipo::isInstance).count();
    }

    private static long exitos(List<Object> resultados) {
        return resultados.stream().filter(r -> !(r instanceof Exception)).count();
    }

    private static void sinOtrosErrores(List<Object> resultados, Class<?>... esperados) {
        for (Object resultado : resultados) {
            if (resultado instanceof Exception ex) {
                boolean esperado = false;
                for (Class<?> clase : esperados) {
                    esperado |= clase.isInstance(ex);
                }
                assertTrue(esperado, "error inesperado: " + ex);
            }
        }
    }

    private ConsultaSoporteCreadaResponseDTO llevarA(String email, String ip, int mensajes) {
        ConsultaSoporteCreadaResponseDTO creada = crear(email, ip);
        for (int turno = 2; turno <= mensajes; turno++) {
            if (turno % 2 == 0) {
                soporteAdmin.responder(creada.getId(), texto("Soporte " + turno));
            } else {
                soporte.responderSinSesion(respuestaPublica(email, creada.getCodigo(), "Persona " + turno), ip);
            }
        }
        return creada;
    }

    @RepeatedTest(8)
    void diezConsultasSimultaneasDelMismoEmailCreanComoMaximoTres() {
        String email = emailNuevo();
        List<Callable<Object>> tareas = new ArrayList<>();
        for (int i = 0; i < 10; i++) {
            String ip = ipNueva();
            tareas.add(() -> crear(email, ip));
        }

        List<Object> resultados = correrAlMismoTiempo(tareas);

        sinOtrosErrores(resultados, LimiteSoporteException.class);
        assertEquals(3, exitos(resultados));
        assertEquals(7, contar(resultados, LimiteSoporteException.class));
        assertEquals(3, jdbcTemplate.queryForObject("SELECT COUNT(*) FROM ticket_soporte WHERE email = ?", Integer.class, email));
        assertEquals(3, jdbcTemplate.queryForObject("SELECT COUNT(*) FROM ticket_soporte t JOIN ticket_soporte_mensaje m ON m.ticket_id = t.id WHERE t.email = ?",
                Integer.class, email));
    }

    @RepeatedTest(8)
    void veinteConsultasSimultaneasDeLaMismaIpCreanComoMaximoDiez() {
        String ip = ipNueva();
        List<Callable<Object>> tareas = new ArrayList<>();
        for (int i = 0; i < 20; i++) {
            String email = emailNuevo();
            tareas.add(() -> crear(email, ip));
        }

        List<Object> resultados = correrAlMismoTiempo(tareas);

        sinOtrosErrores(resultados, LimiteSoporteException.class);
        assertEquals(10, exitos(resultados));
        assertEquals(10, contar(resultados, LimiteSoporteException.class));
        assertEquals(10, jdbcTemplate.queryForObject("SELECT COUNT(*) FROM ticket_soporte WHERE ip = ?", Integer.class, ip));
    }

    @RepeatedTest(8)
    void dosRespuestasSimultaneasDeSoporteUnaGanaYLaOtraRecibeElMensajeDeTurno() {
        ConsultaSoporteCreadaResponseDTO creada = crear(emailNuevo(), ipNueva());
        List<Callable<Object>> tareas = List.of(
                () -> soporteAdmin.responder(creada.getId(), texto("Respuesta A")),
                () -> soporteAdmin.responder(creada.getId(), texto("Respuesta B")));

        List<Object> resultados = correrAlMismoTiempo(tareas);

        sinOtrosErrores(resultados, ConflictoDeNegocioException.class);
        assertEquals(1, exitos(resultados));
        assertEquals(1, contar(resultados, ConflictoDeNegocioException.class));
        ConflictoDeNegocioException perdedora = resultados.stream().filter(ConflictoDeNegocioException.class::isInstance)
                .map(ConflictoDeNegocioException.class::cast).findFirst().orElseThrow();
        assertEquals(ConversacionSoporte.MENSAJE_TURNO_SOPORTE, perdedora.getMessage());
        assertEquals(2, filasDeMensajes(creada.getId()));
        assertEquals(2, cantidadDeMensajes(creada.getId()));
        assertEquals("ESPERA_PERSONA", estadoDeLaConsulta(creada.getId()));
    }

    @RepeatedTest(8)
    void unaRespuestaDeSoporteContraUnCierreDejaLaConsultaCoherente() {
        ConsultaSoporteCreadaResponseDTO creada = crear(emailNuevo(), ipNueva());
        List<Callable<Object>> tareas = List.of(
                () -> soporteAdmin.responder(creada.getId(), texto("Respuesta")),
                () -> soporteAdmin.cerrar(creada.getId()));

        List<Object> resultados = correrAlMismoTiempo(tareas);

        sinOtrosErrores(resultados, ConflictoDeNegocioException.class);
        assertEquals("CERRADO", estadoDeLaConsulta(creada.getId()));
        boolean respondio = !(resultados.get(0) instanceof Exception);
        assertEquals(respondio ? 2 : 1, filasDeMensajes(creada.getId()));
        assertEquals(filasDeMensajes(creada.getId()), cantidadDeMensajes(creada.getId()));
        if (!respondio) {
            assertEquals(ConversacionSoporte.MENSAJE_CERRADA, ((Exception) resultados.get(0)).getMessage());
        }
    }

    @RepeatedTest(8)
    void unaRespuestaDeLaPersonaContraUnCierreDejaLaConsultaCoherente() {
        String email = emailNuevo();
        String ip = ipNueva();
        ConsultaSoporteCreadaResponseDTO creada = crear(email, ip);
        soporteAdmin.responder(creada.getId(), texto("Contanos más"));
        List<Callable<Object>> tareas = List.of(
                () -> soporte.responderSinSesion(respuestaPublica(email, creada.getCodigo(), "Acá va mi respuesta"), ip),
                () -> soporteAdmin.cerrar(creada.getId()));

        List<Object> resultados = correrAlMismoTiempo(tareas);

        sinOtrosErrores(resultados, ConflictoDeNegocioException.class);
        assertEquals("CERRADO", estadoDeLaConsulta(creada.getId()));
        boolean respondio = !(resultados.get(0) instanceof Exception);
        assertEquals(respondio ? 3 : 2, filasDeMensajes(creada.getId()));
        assertEquals(filasDeMensajes(creada.getId()), cantidadDeMensajes(creada.getId()));
    }

    @RepeatedTest(8)
    void dosMensajesSimultaneosDeLaPersonaUnoGanaYElOtroRecibeElMensajeDeTurno() {
        String email = emailNuevo();
        String ip = ipNueva();
        ConsultaSoporteCreadaResponseDTO creada = crear(email, ip);
        soporteAdmin.responder(creada.getId(), texto("Contanos más"));
        List<Callable<Object>> tareas = List.of(
                () -> soporte.responderSinSesion(respuestaPublica(email, creada.getCodigo(), "Mensaje A"), ip),
                () -> soporte.responderSinSesion(respuestaPublica(email, creada.getCodigo(), "Mensaje B"), ip),
                () -> soporte.responderSinSesion(respuestaPublica(email, creada.getCodigo(), "Mensaje C"), ip));

        List<Object> resultados = correrAlMismoTiempo(tareas);

        sinOtrosErrores(resultados, ConflictoDeNegocioException.class);
        assertEquals(1, exitos(resultados));
        assertEquals(2, contar(resultados, ConflictoDeNegocioException.class));
        assertEquals(3, filasDeMensajes(creada.getId()));
        assertEquals("ESPERA_SOPORTE", estadoDeLaConsulta(creada.getId()));
    }

    @RepeatedTest(8)
    void elMensajeVeinteDisputadoEntreLaPersonaYSoporteNoPasaElTope() {
        String email = emailNuevo();
        String ip = ipNueva();
        ConsultaSoporteCreadaResponseDTO creada = llevarA(email, ip, 19);
        assertEquals("ESPERA_SOPORTE", estadoDeLaConsulta(creada.getId()));
        List<Callable<Object>> tareas = List.of(
                () -> soporte.responderSinSesion(respuestaPublica(email, creada.getCodigo(), "Mensaje de la persona"), ip),
                () -> soporteAdmin.responder(creada.getId(), texto("Veinte de Soporte")),
                () -> soporteAdmin.responder(creada.getId(), texto("Otro veinte de Soporte")));

        List<Object> resultados = correrAlMismoTiempo(tareas);

        sinOtrosErrores(resultados, ConflictoDeNegocioException.class);
        assertEquals(1, exitos(resultados));
        assertTrue(resultados.get(1) instanceof Exception != resultados.get(2) instanceof Exception);
        assertEquals(20, filasDeMensajes(creada.getId()));
        assertEquals(20, cantidadDeMensajes(creada.getId()));
        assertEquals("CERRADO", estadoDeLaConsulta(creada.getId()));
    }

    @RepeatedTest(8)
    void elMensajeDiecinueveDeLaPersonaContraLaRespuestaDeSoporteRespetaElTurnoEnCualquierOrden() {
        String email = emailNuevo();
        String ip = ipNueva();
        ConsultaSoporteCreadaResponseDTO creada = llevarA(email, ip, 18);
        assertEquals("ESPERA_PERSONA", estadoDeLaConsulta(creada.getId()));
        List<Callable<Object>> tareas = List.of(
                () -> soporte.responderSinSesion(respuestaPublica(email, creada.getCodigo(), "Mensaje de la persona"), ip),
                () -> soporteAdmin.responder(creada.getId(), texto("Soporte")));

        List<Object> resultados = correrAlMismoTiempo(tareas);

        sinOtrosErrores(resultados, ConflictoDeNegocioException.class);
        assertTrue(!(resultados.get(0) instanceof Exception), "la persona siempre tiene el turno primero");
        boolean soporteEscribio = !(resultados.get(1) instanceof Exception);
        assertEquals(soporteEscribio ? 20 : 19, filasDeMensajes(creada.getId()));
        assertEquals(filasDeMensajes(creada.getId()), cantidadDeMensajes(creada.getId()));
        assertEquals(soporteEscribio ? "CERRADO" : "ESPERA_SOPORTE", estadoDeLaConsulta(creada.getId()));
    }

    @RepeatedTest(8)
    void losIntentosFallidosSimultaneosDeUnEmailNoPasanDeTreinta() {
        String email = emailNuevo();
        List<Callable<Object>> tareas = new ArrayList<>();
        for (int i = 0; i < 40; i++) {
            String ip = ipNueva();
            tareas.add(() -> soporte.verSinSesion(acceso(email, "ZZZZZZZZ"), ip));
        }

        List<Object> resultados = correrAlMismoTiempo(tareas);

        sinOtrosErrores(resultados, RecursoNoEncontradoException.class, LimiteSoporteException.class);
        assertEquals(30, contar(resultados, RecursoNoEncontradoException.class));
        assertEquals(10, contar(resultados, LimiteSoporteException.class));
        assertEquals(30, jdbcTemplate.queryForObject("SELECT cantidad FROM soporte_limite WHERE clave = ?", Integer.class, "INTENTO_EMAIL|" + email));
    }

    @RepeatedTest(8)
    void losIntentosFallidosSimultaneosDeUnaIpNoPasanDeDiez() {
        String ip = ipNueva();
        List<Callable<Object>> tareas = new ArrayList<>();
        for (int i = 0; i < 16; i++) {
            String email = emailNuevo();
            tareas.add(() -> soporte.verSinSesion(acceso(email, "ZZZZZZZZ"), ip));
        }

        List<Object> resultados = correrAlMismoTiempo(tareas);

        sinOtrosErrores(resultados, RecursoNoEncontradoException.class, LimiteSoporteException.class);
        assertEquals(10, contar(resultados, RecursoNoEncontradoException.class));
        assertEquals(6, contar(resultados, LimiteSoporteException.class));
        assertEquals(10, jdbcTemplate.queryForObject("SELECT cantidad FROM soporte_limite WHERE clave = ?", Integer.class, "INTENTO_IP|" + ip));
    }

    @RepeatedTest(8)
    void losReenviosSimultaneosDeCodigosNoPasanDeTresPorEmail() {
        String email = emailNuevo();
        List<Callable<Object>> tareas = new ArrayList<>();
        for (int i = 0; i < 8; i++) {
            String ip = ipNueva();
            tareas.add(() -> soporte.reenviarCodigos(reenvio(email), ip));
        }

        List<Object> resultados = correrAlMismoTiempo(tareas);

        sinOtrosErrores(resultados, LimiteSoporteException.class);
        assertEquals(3, exitos(resultados));
        assertEquals(5, contar(resultados, LimiteSoporteException.class));
    }
}
