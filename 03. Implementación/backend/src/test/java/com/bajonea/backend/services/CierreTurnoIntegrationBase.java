package com.bajonea.backend.services;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

import com.bajonea.backend.services.DatosPruebaEmpleado.Dueno;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;

/**
 * Base de las pruebas del cierre de turnos (Fase 2, T4) contra {@code bajonea_test}. El job recorre todos los comercios
 * de la base, así que cada prueba mira solo las filas de {@code cierre_turno} de los comercios que ella creó. El envío
 * del email está simulado (el {@code EmailService} de la base es un mock) y sale bien salvo que la prueba diga otra cosa.
 */
abstract class CierreTurnoIntegrationBase extends TurnoIntegrationBase {

    @Autowired
    protected CierreTurnoJob job;

    @Autowired
    protected CierreTurnoService cierreTurnoService;

    @Autowired
    protected ResumenTurnoService resumenTurnoService;

    @Autowired
    protected DisponibilidadComercioService disponibilidadComercioService;

    @BeforeEach
    void simularEnvioCorrecto() {
        when(emailService.enviarResumenTurno(any(), any(), any(), any())).thenReturn(ResultadoEnvioEmail.enviado("id-resend"));
    }

    @Override
    protected Dueno comercioSinHorarios() {
        Dueno dueno = super.comercioSinHorarios();
        datos.cambiarEstadoUsuario(dueno.id(), "ACTIVO");
        return dueno;
    }

    protected LocalDateTime almuerzoTerminado() {
        return hoy().atTime(15, 30);
    }

    protected Dueno comercioConAlmuerzo() {
        Dueno dueno = comercioSinHorarios();
        horario(dueno.comercioId(), hoy(), "12:00", "15:00");
        return dueno;
    }

    protected int pagar(Dueno dueno, LocalDateTime instante) {
        int pedidoId = pedidoPendiente(dueno);
        pedidoService.confirmarPagoAprobado(pedidoId, instante);
        return pedidoId;
    }

    protected void estado(int pedidoId, String estado) {
        jdbcTemplate.update("UPDATE pedido SET estado = ? WHERE id = ?", estado, pedidoId);
    }

    protected List<Map<String, Object>> cierres(int comercioId) {
        return jdbcTemplate.queryForList("SELECT * FROM cierre_turno WHERE comercio_id = ? ORDER BY id", comercioId);
    }

    protected Map<String, Object> unicoCierre(int comercioId) {
        List<Map<String, Object>> filas = cierres(comercioId);
        org.junit.jupiter.api.Assertions.assertEquals(1, filas.size(), "Se esperaba un solo cierre del comercio " + comercioId);
        return filas.get(0);
    }

    protected int segundoComercioDelDueno(Dueno dueno, String nombre) {
        jdbcTemplate.update("INSERT INTO comercio (dueno_id, nombre, foto_perfil_url, telefono, tipo_comercio, acepta_delivery, "
                + "acepta_retiro, estado) SELECT dueno_id, ?, foto_perfil_url, telefono, tipo_comercio, acepta_delivery, "
                + "acepta_retiro, 'APTO_VENTA' FROM comercio WHERE id = ?", nombre, dueno.comercioId());
        return jdbcTemplate.queryForObject("SELECT LAST_INSERT_ID()", Integer.class);
    }

    protected static LocalDateTime fechaHora(Object valor) {
        return fechaHoraDe(valor);
    }
}
