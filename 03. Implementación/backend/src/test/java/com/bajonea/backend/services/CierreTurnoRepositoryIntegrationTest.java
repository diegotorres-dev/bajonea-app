package com.bajonea.backend.services;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

import com.bajonea.backend.repositories.CierreTurnoRepository;
import com.bajonea.backend.services.DatosPruebaEmpleado.Dueno;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

/**
 * Cada escritura del envío es una sentencia por clave primaria con la condición del estado que espera: sobre una fila en
 * otro estado no afecta nada y no cambia ninguna columna. Es la red de seguridad contra dos corridas que pisan el
 * resultado una de la otra.
 */
class CierreTurnoRepositoryIntegrationTest extends CierreTurnoIntegrationBase {

    @Autowired
    private CierreTurnoRepository repositorio;

    private static final LocalDateTime T = LocalDateTime.of(2026, 10, 23, 15, 30);

    private int cierreCerrado() {
        Dueno dueno = comercioConAlmuerzo();
        job.abrirYCerrarTurnos(almuerzoTerminado());
        return (Integer) unicoCierre(dueno.comercioId()).get("id");
    }

    private void poner(int id, String estado) {
        jdbcTemplate.update("UPDATE cierre_turno SET email_estado = ?, email_intentos = 2, email_envio_iniciado = ?, email_fecha_envio = NULL, "
                + "email_proximo_intento = NULL, email_ultimo_error = 'previo' WHERE id = ?", estado, T.minusMinutes(30), id);
    }

    private int cierreEn(String estado) {
        int id = cierreCerrado();
        poner(id, estado);
        return id;
    }

    private Map<String, Object> fila(int id) {
        return jdbcTemplate.queryForMap("SELECT * FROM cierre_turno WHERE id = ?", id);
    }

    @Test
    void elResultadoDelEnvioSoloAplicaSobreUnaFilaEnviando() {
        List<String> estados = List.of("PENDIENTE", "ENVIADO", "FALLIDO", "OMITIDO");
        List<Integer> ids = estados.stream().map(estado -> cierreCerrado()).toList();
        for (int i = 0; i < estados.size(); i++) {
            String estado = estados.get(i);
            int id = ids.get(i);
            poner(id, estado);
            Map<String, Object> antes = fila(id);

            assertEquals(0, repositorio.marcarEnviado(id, T), "marcarEnviado sobre " + estado);
            assertEquals(0, repositorio.registrarFallaConReintento(id, 3, T.plusMinutes(10), "otro"), "falla con reintento sobre " + estado);
            assertEquals(0, repositorio.registrarFallaDefinitiva(id, 5, "otro"), "falla definitiva sobre " + estado);

            assertEquals(antes, fila(id), "la fila en " + estado + " cambió");
        }
    }

    @Test
    void reclamarYOmitirSoloAplicanSobreUnaFilaPendiente() {
        List<String> estados = List.of("ENVIANDO", "ENVIADO", "FALLIDO", "OMITIDO");
        List<Integer> ids = estados.stream().map(estado -> cierreCerrado()).toList();
        for (int i = 0; i < estados.size(); i++) {
            String estado = estados.get(i);
            int id = ids.get(i);
            poner(id, estado);
            Map<String, Object> antes = fila(id);

            assertEquals(0, repositorio.reclamar(id, T), "reclamar sobre " + estado);
            assertEquals(0, repositorio.omitir(id, "motivo"), "omitir sobre " + estado);

            assertEquals(antes, fila(id), "la fila en " + estado + " cambió");
        }
    }

    @Test
    void recuperarSoloAplicaSobreUnaFilaEnviandoMasViejaQueElLimite() {
        int reciente = cierreCerrado();
        int vieja = cierreCerrado();
        int pendiente = cierreCerrado();
        poner(reciente, "ENVIANDO");
        jdbcTemplate.update("UPDATE cierre_turno SET email_envio_iniciado = ? WHERE id = ?", T.minusMinutes(5), reciente);
        poner(vieja, "ENVIANDO");
        poner(pendiente, "PENDIENTE");

        assertEquals(0, repositorio.recuperarEnviando(reciente, T.minusMinutes(15)));
        assertEquals(0, repositorio.recuperarEnviando(pendiente, T.minusMinutes(15)));
        assertEquals(1, repositorio.recuperarEnviando(vieja, T.minusMinutes(15)));

        assertEquals("ENVIANDO", fila(reciente).get("email_estado"));
        assertEquals("PENDIENTE", fila(vieja).get("email_estado"));
        assertNull(fila(vieja).get("email_envio_iniciado"));
    }

    @Test
    void elFlujoNormalPasaDePendienteAEnviandoYAEnviadoUnaSolaVez() {
        int id = cierreEn("PENDIENTE");

        assertEquals(1, repositorio.reclamar(id, T));
        assertEquals(0, repositorio.reclamar(id, T));
        assertEquals(1, repositorio.marcarEnviado(id, T));
        assertEquals(0, repositorio.marcarEnviado(id, T));

        assertEquals("ENVIADO", fila(id).get("email_estado"));
    }
}
