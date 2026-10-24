package com.bajonea.backend.services;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.bajonea.backend.config.security.ComercioActivo;
import com.bajonea.backend.dto.request.HorarioRequestDTO;
import com.bajonea.backend.dto.request.SuspensionComercioRequestDTO;
import com.bajonea.backend.enums.EstadoComercio;
import com.bajonea.backend.services.DatosPruebaEmpleado.Cuenta;
import com.bajonea.backend.services.DatosPruebaEmpleado.Dueno;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Callable;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

/**
 * Corridas simultáneas del cierre de turnos con hilos y datos confirmados de verdad: dos o más corridas a la vez
 * cierran y envían una sola vez cada turno, y el cierre convive con la edición de horarios, la suspensión del comercio,
 * un pago aprobado y la recuperación de un envío huérfano, sin errores de bloqueo.
 */
class CierreTurnoConcurrenciaIntegrationTest extends CierreTurnoIntegrationBase {

    @Autowired
    private HorarioEdicionService horarioEdicionService;

    @Autowired
    private AdministradorService administradorService;

    private static void sinBloqueos(List<Object> resultados) {
        for (Object resultado : resultados) {
            if (resultado instanceof Exception e) {
                String texto = String.valueOf(e) + (e.getCause() == null ? "" : " / " + e.getCause());
                assertFalse(texto.contains("Deadlock") || texto.contains("Lock wait timeout"),
                        "Error de bloqueo: " + texto);
            }
        }
    }

    private void envioLento() {
        when(emailService.enviarResumenTurno(org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any(),
                org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any())).thenAnswer(invocacion -> {
                    Thread.sleep(80);
                    return ResultadoEnvioEmail.enviado("lento");
                });
    }

    @Test
    void variasCorridasSimultaneasCierranYEnvianUnaSolaVezCadaTurno() {
        envioLento();
        List<Dueno> duenos = new ArrayList<>();
        for (int i = 0; i < 4; i++) {
            Dueno dueno = comercioConAlmuerzo();
            pagar(dueno, hoy().atTime(13, 0));
            duenos.add(dueno);
        }
        List<Callable<Object>> tareas = new ArrayList<>();
        for (int i = 0; i < 6; i++) {
            tareas.add(() -> job.abrirYCerrarTurnos(almuerzoTerminado()));
        }

        List<Object> resultados = correrAlMismoTiempo(tareas);

        sinErrores(resultados);
        for (Dueno dueno : duenos) {
            assertEquals("ENVIADO", unicoCierre(dueno.comercioId()).get("email_estado"));
            verify(emailService, times(1)).enviarResumenTurno(eq(dueno.email()), anyString(), anyString(), anyString());
        }
    }

    @Test
    void elCierreConvivePorLaVezConLaEdicionDeHorariosLaSuspensionYUnPagoSinErroresDeBloqueo() {
        Cuenta administrador = datos.registrarClienteConCredenciales();
        datos.hacerAdministrador(administrador.id());
        for (int ronda = 0; ronda < 4; ronda++) {
            Dueno dueno = comercioConAlmuerzo();
            int horarioOriginal = (Integer) jdbcTemplate.queryForObject("SELECT id FROM horario WHERE comercio_id = ?", Integer.class,
                    dueno.comercioId());
            int porPagar = pedidoPendiente(dueno);
            jdbcTemplate.update("UPDATE pedido SET fecha_creacion = ? WHERE id = ?", hoy().atTime(16, 0), porPagar);
            ComercioActivo actor = ComercioActivo.delDueno(dueno.comercioId(), dueno.id(), EstadoComercio.APTO_VENTA);
            List<HorarioRequestDTO> nuevos = List.of(new HorarioRequestDTO(diaDe(hoy()), LocalTime.of(13, 0), LocalTime.of(16, 0)));

            List<Callable<Object>> tareas = new ArrayList<>();
            tareas.add(() -> job.abrirYCerrarTurnos(almuerzoTerminado()));
            tareas.add(() -> job.abrirYCerrarTurnos(almuerzoTerminado()));
            tareas.add(() -> horarioEdicionService.editarHorarios(actor, nuevos));
            tareas.add(() -> {
                pedidoService.confirmarPagoAprobado(porPagar, hoy().atTime(14, 30));
                return null;
            });
            tareas.add(() -> {
                administradorService.suspenderComercio(dueno.comercioId(), administrador.id(), new SuspensionComercioRequestDTO("Prueba"));
                return null;
            });

            List<Object> resultados = correrAlMismoTiempo(tareas);

            sinBloqueos(resultados);
            Map<String, Object> fila = unicoCierre(dueno.comercioId());
            assertEquals(horarioOriginal, fila.get("horario_id"));
            assertTrue(List.of("ENVIADO", "OMITIDO").contains(fila.get("email_estado")), "estado inesperado " + fila.get("email_estado"));
        }
    }

    @Test
    void laRecuperacionDeUnEnviandoHuerfanoContraOtraCorridaNoEnviaDosVeces() {
        envioLento();
        Dueno dueno = comercioConAlmuerzo();
        job.abrirYCerrarTurnos(almuerzoTerminado());
        int id = (Integer) unicoCierre(dueno.comercioId()).get("id");
        jdbcTemplate.update("UPDATE cierre_turno SET email_estado = 'ENVIANDO', email_envio_iniciado = ?, email_fecha_envio = NULL WHERE id = ?",
                almuerzoTerminado().minusMinutes(30), id);
        List<Callable<Object>> tareas = new ArrayList<>();
        for (int i = 0; i < 5; i++) {
            tareas.add(() -> job.abrirYCerrarTurnos(almuerzoTerminado().plusMinutes(5)));
        }

        List<Object> resultados = correrAlMismoTiempo(tareas);

        sinErrores(resultados);
        assertEquals("ENVIADO", unicoCierre(dueno.comercioId()).get("email_estado"));
        verify(emailService, times(2)).enviarResumenTurno(eq(dueno.email()), anyString(), anyString(), anyString());
    }

    @Test
    void elFinDeUnaCorridaMientrasOtraSigueEnviandoNoPierdeNingunCierre() {
        envioLento();
        List<Dueno> duenos = new ArrayList<>();
        for (int i = 0; i < 3; i++) {
            duenos.add(comercioConAlmuerzo());
        }
        List<Callable<Object>> tareas = new ArrayList<>();
        tareas.add(() -> job.abrirYCerrarTurnos(almuerzoTerminado()));
        tareas.add(() -> job.abrirYCerrarTurnos(almuerzoTerminado().plusSeconds(1)));

        sinErrores(correrAlMismoTiempo(tareas));

        for (Dueno dueno : duenos) {
            assertEquals("ENVIADO", unicoCierre(dueno.comercioId()).get("email_estado"));
        }
        LocalDateTime tarde = almuerzoTerminado().plusHours(1);
        job.abrirYCerrarTurnos(tarde);
        for (Dueno dueno : duenos) {
            verify(emailService, times(1)).enviarResumenTurno(eq(dueno.email()), anyString(), anyString(), anyString());
        }
    }
}
