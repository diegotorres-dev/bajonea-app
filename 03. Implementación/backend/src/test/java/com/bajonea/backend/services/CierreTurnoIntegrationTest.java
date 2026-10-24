package com.bajonea.backend.services;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.bajonea.backend.entities.Horario;
import com.bajonea.backend.repositories.HorarioRepository;
import com.bajonea.backend.services.CierreTurnoService.CandidatoCierre;
import com.bajonea.backend.services.CierreTurnoService.ResultadoCierre;
import com.bajonea.backend.services.DatosPruebaEmpleado.Dueno;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicBoolean;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;

/**
 * Cierre de turnos y envío del resumen (Fase 2, T4) contra {@code bajonea_test}: las cifras de la foto coinciden con el
 * cálculo del panel, la espera por pagos sin resolver, la gracia, la idempotencia, los estados de envío y los
 * reintentos.
 */
class CierreTurnoIntegrationTest extends CierreTurnoIntegrationBase {

    @Autowired
    private HorarioRepository horarioRepository;

    @Test
    void laFotoDelCierreTieneLasCifrasDelPanelYElMailLlevaElNetoYLosPendientes() {
        Dueno dueno = comercioConAlmuerzo();
        int entregado = pagar(dueno, hoy().atTime(12, 30));
        int enPreparacion = pagar(dueno, hoy().atTime(13, 0));
        int rechazado = pagar(dueno, hoy().atTime(13, 30));
        pagar(dueno, hoy().atTime(14, 0));
        estado(entregado, "ENTREGADO");
        estado(enPreparacion, "EN_PREPARACION");
        estado(rechazado, "RECHAZADO");

        Horario horario = horarioRepository.findVigentesDesde(dueno.comercioId(), hoy().minusDays(1)).get(0);
        DisponibilidadComercioService.Turno turno = disponibilidadComercioService
                .turnosTerminadosEntre(List.of(horario), hoy().atTime(14, 0), almuerzoTerminado()).get(0);
        ResumenTurnoService.CifrasTurno panel = resumenTurnoService.cifras(dueno.comercioId(), turno);

        job.abrirYCerrarTurnos(almuerzoTerminado());

        Map<String, Object> fila = unicoCierre(dueno.comercioId());
        assertEquals(panel.cantidadPedidos(), fila.get("cantidad_pedidos"));
        assertEquals(0, panel.vendido().compareTo((BigDecimal) fila.get("vendido")));
        assertEquals(0, panel.comision().compareTo((BigDecimal) fila.get("comision")));
        assertEquals(0, panel.neto().compareTo((BigDecimal) fila.get("neto")));
        assertEquals(panel.pendientes(), fila.get("pendientes_al_cierre"));
        assertEquals(4, fila.get("cantidad_pedidos"));
        assertEquals(0, new BigDecimal("3000.00").compareTo((BigDecimal) fila.get("vendido")));
        assertEquals(0, new BigDecimal("200.00").compareTo((BigDecimal) fila.get("comision")));
        assertEquals(0, new BigDecimal("2800.00").compareTo((BigDecimal) fila.get("neto")));
        assertEquals(1, fila.get("pendientes_al_cierre"));
        assertEquals("ENVIADO", fila.get("email_estado"));
        assertEquals(almuerzoTerminado(), fechaHora(fila.get("email_fecha_envio")));

        ArgumentCaptor<String> asunto = ArgumentCaptor.forClass(String.class);
        ArgumentCaptor<String> cuerpo = ArgumentCaptor.forClass(String.class);
        verify(emailService).enviarResumenTurno(eq(dueno.email()), asunto.capture(), cuerpo.capture(), anyString());
        assertEquals("Cerró tu turno en " + dueno.nombreComercio() + ": neto $2.800", asunto.getValue());
        assertTrue(cuerpo.getValue().contains("Vendido en el turno: $3.000\nComisión de Bajoneá: $200\nNeto del turno: $2.800\nPedidos del turno: 4\n"));
        assertTrue(cuerpo.getValue().contains("Quedó 1 pedido sin responder al cerrar el turno."));
    }

    @Test
    void elTurnoNoSeCierraAntesDeLaGraciaYSiAlCumplirla() {
        Dueno dueno = comercioConAlmuerzo();

        job.abrirYCerrarTurnos(hoy().atTime(14, 59));
        job.abrirYCerrarTurnos(hoy().atTime(15, 29, 59));
        assertTrue(cierres(dueno.comercioId()).isEmpty());

        job.abrirYCerrarTurnos(hoy().atTime(15, 30));
        assertEquals(1, cierres(dueno.comercioId()).size());
    }

    @Test
    void unTurnoSinPedidosIgualSeCierraYSeAvisaConTotalCero() {
        Dueno dueno = comercioConAlmuerzo();

        job.abrirYCerrarTurnos(almuerzoTerminado());

        Map<String, Object> fila = unicoCierre(dueno.comercioId());
        assertEquals(0, fila.get("cantidad_pedidos"));
        assertEquals("ENVIADO", fila.get("email_estado"));
        ArgumentCaptor<String> asunto = ArgumentCaptor.forClass(String.class);
        verify(emailService).enviarResumenTurno(eq(dueno.email()), asunto.capture(), anyString(), anyString());
        assertEquals("Cerró tu turno en " + dueno.nombreComercio() + ": sin pedidos", asunto.getValue());
    }

    @Test
    void unaSegundaCorridaNoCreaOtroCierreNiVuelveAEnviar() {
        Dueno dueno = comercioConAlmuerzo();

        job.abrirYCerrarTurnos(almuerzoTerminado());
        job.abrirYCerrarTurnos(almuerzoTerminado().plusMinutes(5));
        job.abrirYCerrarTurnos(almuerzoTerminado().plusHours(2));

        assertEquals(1, cierres(dueno.comercioId()).size());
        verify(emailService, times(1)).enviarResumenTurno(eq(dueno.email()), anyString(), anyString(), anyString());
    }

    @Test
    void unComercioQueNuncaCerroUnTurnoSoloCierraElUltimoAunqueHayaFranjasTodosLosDias() {
        Dueno dueno = comercioSinHorarios();
        horariosTodosLosDias(dueno.comercioId(), "12:00", "15:00");

        job.abrirYCerrarTurnos(almuerzoTerminado());
        job.abrirYCerrarTurnos(almuerzoTerminado().plusMinutes(1));

        assertEquals(1, cierres(dueno.comercioId()).size());
        verify(emailService, times(1)).enviarResumenTurno(eq(dueno.email()), anyString(), anyString(), anyString());
    }

    @Test
    void despuesDelPrimerCierreLosTurnosSiguientesSeCierranUnoPorUno() {
        Dueno dueno = comercioSinHorarios();
        horariosTodosLosDias(dueno.comercioId(), "12:00", "15:00");
        job.abrirYCerrarTurnos(almuerzoTerminado());

        job.abrirYCerrarTurnos(almuerzoTerminado().plusDays(1));

        assertEquals(2, cierres(dueno.comercioId()).size());
        job.abrirYCerrarTurnos(almuerzoTerminado().plusDays(3));
        assertEquals(4, cierres(dueno.comercioId()).size());
    }

    @Test
    void unDuenoConDosComerciosRecibeUnSoloMailConAmbosCierres() {
        Dueno dueno = comercioConAlmuerzo();
        int segundo = segundoComercioDelDueno(dueno, "Segundo " + DatosPruebaEmpleado.sufijo());
        horario(segundo, hoy(), "12:00", "15:00");
        pagar(dueno, hoy().atTime(13, 0));

        job.abrirYCerrarTurnos(almuerzoTerminado());

        assertEquals("ENVIADO", unicoCierre(dueno.comercioId()).get("email_estado"));
        assertEquals("ENVIADO", unicoCierre(segundo).get("email_estado"));
        ArgumentCaptor<String> asunto = ArgumentCaptor.forClass(String.class);
        ArgumentCaptor<String> cuerpo = ArgumentCaptor.forClass(String.class);
        verify(emailService, times(1)).enviarResumenTurno(eq(dueno.email()), asunto.capture(), cuerpo.capture(), anyString());
        assertEquals("Cerraron los turnos de tus comercios", asunto.getValue());
        assertTrue(cuerpo.getValue().contains(dueno.nombreComercio()));
        assertTrue(cuerpo.getValue().contains("Segundo "));
    }

    @Test
    void conLaCuentaDelDuenoBloqueadaElCierreQuedaOmitidoYNoSeEnviaNiAlReactivar() {
        Dueno dueno = comercioConAlmuerzo();
        datos.cambiarEstadoUsuario(dueno.id(), "BLOQUEADO");

        job.abrirYCerrarTurnos(almuerzoTerminado());

        Map<String, Object> fila = unicoCierre(dueno.comercioId());
        assertEquals("OMITIDO", fila.get("email_estado"));
        assertEquals(CierreTurnoEnvioService.MOTIVO_CUENTA_NO_ACTIVA, fila.get("email_ultimo_error"));
        datos.cambiarEstadoUsuario(dueno.id(), "ACTIVO");
        job.abrirYCerrarTurnos(almuerzoTerminado().plusMinutes(10));
        assertEquals("OMITIDO", unicoCierre(dueno.comercioId()).get("email_estado"));
        verify(emailService, never()).enviarResumenTurno(eq(dueno.email()), anyString(), anyString(), anyString());
    }

    @Test
    void laFallaDeResendReintentaConElRetrocesoYAlRecuperarseQuedaEnviado() {
        Dueno dueno = comercioConAlmuerzo();
        when(emailService.enviarResumenTurno(eq(dueno.email()), anyString(), anyString(), anyString()))
                .thenReturn(ResultadoEnvioEmail.fallido(503, "503 Falla"), ResultadoEnvioEmail.fallido(503, "503 Falla"),
                        ResultadoEnvioEmail.enviado("ok"));
        LocalDateTime t0 = almuerzoTerminado();

        job.abrirYCerrarTurnos(t0);
        Map<String, Object> primera = unicoCierre(dueno.comercioId());
        assertEquals("PENDIENTE", primera.get("email_estado"));
        assertEquals(1, primera.get("email_intentos"));
        assertEquals(t0.plusMinutes(10), fechaHora(primera.get("email_proximo_intento")));
        assertEquals("503 Falla", primera.get("email_ultimo_error"));

        job.abrirYCerrarTurnos(t0.plusMinutes(9));
        assertEquals(1, unicoCierre(dueno.comercioId()).get("email_intentos"));

        job.abrirYCerrarTurnos(t0.plusMinutes(10));
        Map<String, Object> segunda = unicoCierre(dueno.comercioId());
        assertEquals(2, segunda.get("email_intentos"));
        assertEquals(t0.plusMinutes(40), fechaHora(segunda.get("email_proximo_intento")));

        job.abrirYCerrarTurnos(t0.plusMinutes(40));
        Map<String, Object> tercera = unicoCierre(dueno.comercioId());
        assertEquals("ENVIADO", tercera.get("email_estado"));
        assertEquals(2, tercera.get("email_intentos"));
        assertNull(tercera.get("email_proximo_intento"));
        verify(emailService, times(3)).enviarResumenTurno(eq(dueno.email()), anyString(), anyString(), anyString());
    }

    @Test
    void tras5IntentosFallidosElCierreQuedaFallidoYNoSeReintentaMas() {
        Dueno dueno = comercioConAlmuerzo();
        when(emailService.enviarResumenTurno(eq(dueno.email()), anyString(), anyString(), anyString()))
                .thenReturn(ResultadoEnvioEmail.fallido(500, "500 error"));
        LocalDateTime hora = almuerzoTerminado();
        int[] retrocesos = {10, 30, 60, 60};

        job.abrirYCerrarTurnos(hora);
        for (int retroceso : retrocesos) {
            hora = hora.plusMinutes(retroceso);
            job.abrirYCerrarTurnos(hora);
        }

        Map<String, Object> fila = unicoCierre(dueno.comercioId());
        assertEquals("FALLIDO", fila.get("email_estado"));
        assertEquals(5, fila.get("email_intentos"));
        assertNull(fila.get("email_proximo_intento"));
        job.abrirYCerrarTurnos(hora.plusHours(5));
        verify(emailService, times(5)).enviarResumenTurno(eq(dueno.email()), anyString(), anyString(), anyString());
    }

    @Test
    void laFallaDeUnDuenoNoImpideElEnvioAlOtro() {
        Dueno primero = comercioConAlmuerzo();
        Dueno segundo = comercioConAlmuerzo();
        when(emailService.enviarResumenTurno(eq(primero.email()), anyString(), anyString(), anyString()))
                .thenReturn(ResultadoEnvioEmail.fallido(500, "500 error"));

        job.abrirYCerrarTurnos(almuerzoTerminado());

        assertEquals("PENDIENTE", unicoCierre(primero.comercioId()).get("email_estado"));
        assertEquals("ENVIADO", unicoCierre(segundo.comercioId()).get("email_estado"));
    }

    @Test
    void unPagoConfirmadoDespuesDelCierreNoCambiaLaFoto() {
        Dueno dueno = comercioConAlmuerzo();
        pagar(dueno, hoy().atTime(13, 0));
        job.abrirYCerrarTurnos(almuerzoTerminado());
        Map<String, Object> antes = unicoCierre(dueno.comercioId());

        pagar(dueno, almuerzoTerminado().plusMinutes(10));
        job.abrirYCerrarTurnos(almuerzoTerminado().plusMinutes(20));

        Map<String, Object> despues = unicoCierre(dueno.comercioId());
        assertEquals(antes.get("cantidad_pedidos"), despues.get("cantidad_pedidos"));
        assertEquals(1, despues.get("cantidad_pedidos"));
        assertEquals(antes.get("pendientes_al_cierre"), despues.get("pendientes_al_cierre"));
    }

    @Test
    void conUnPedidoSinPagarCreadoAntesDelFinElCierreEsperaHastaQueSeResuelva() {
        Dueno dueno = comercioConAlmuerzo();
        int sinPagar = pedidoPendiente(dueno);
        jdbcTemplate.update("UPDATE pedido SET fecha_creacion = ? WHERE id = ?", hoy().atTime(14, 50), sinPagar);

        job.abrirYCerrarTurnos(almuerzoTerminado());
        job.abrirYCerrarTurnos(almuerzoTerminado().plusMinutes(30));
        assertTrue(cierres(dueno.comercioId()).isEmpty());

        estado(sinPagar, "EXPIRADO");
        job.abrirYCerrarTurnos(almuerzoTerminado().plusMinutes(31));
        assertEquals(1, cierres(dueno.comercioId()).size());
    }

    @Test
    void unPedidoSinPagarCreadoDespuesDelFinNoDemoraElCierre() {
        Dueno dueno = comercioConAlmuerzo();
        int sinPagar = pedidoPendiente(dueno);
        jdbcTemplate.update("UPDATE pedido SET fecha_creacion = ? WHERE id = ?", hoy().atTime(15, 10), sinPagar);

        job.abrirYCerrarTurnos(almuerzoTerminado());

        assertEquals(1, cierres(dueno.comercioId()).size());
    }

    @Test
    void conUnPedidoSinPagarColgadoElCierreSeHaceIgualAlPasarElTopeDeEspera() {
        Dueno dueno = comercioConAlmuerzo();
        int colgado = pedidoPendiente(dueno);
        jdbcTemplate.update("UPDATE pedido SET fecha_creacion = ? WHERE id = ?", hoy().atTime(14, 50), colgado);

        job.abrirYCerrarTurnos(hoy().atTime(16, 59));
        assertTrue(cierres(dueno.comercioId()).isEmpty());
        job.abrirYCerrarTurnos(hoy().atTime(17, 0));

        assertEquals(1, cierres(dueno.comercioId()).size());
    }

    @Test
    void unTurnoQueCruzaLaMedianocheSeCierraConLaFechaDeSuAperturaYSuFinDelDiaSiguiente() {
        Dueno dueno = comercioSinHorarios();
        int cena = horario(dueno.comercioId(), hoy().minusDays(1), "20:00", "02:00");
        pagar(dueno, hoy().atTime(1, 30));

        job.abrirYCerrarTurnos(hoy().atTime(2, 29));
        assertTrue(cierres(dueno.comercioId()).isEmpty());
        job.abrirYCerrarTurnos(hoy().atTime(2, 30));

        Map<String, Object> fila = unicoCierre(dueno.comercioId());
        assertEquals(hoy().minusDays(1), fechaDe(fila.get("turno_fecha")));
        assertEquals(cena, fila.get("horario_id"));
        assertEquals(hoy().atTime(2, 0), fechaHora(fila.get("fin")));
        assertEquals(1, fila.get("cantidad_pedidos"));
    }

    @Test
    void unComercioSuspendidoSinPedidosRegistraElCierreSinAvisar() {
        Dueno dueno = comercioConAlmuerzo();
        datos.cambiarEstadoComercio(dueno.comercioId(), "SUSPENDIDO");

        job.abrirYCerrarTurnos(almuerzoTerminado());

        assertEquals("OMITIDO", unicoCierre(dueno.comercioId()).get("email_estado"));
        verify(emailService, never()).enviarResumenTurno(eq(dueno.email()), anyString(), anyString(), anyString());
    }

    @Test
    void unComercioSuspendidoConPedidosDelTurnoSiAvisa() {
        Dueno dueno = comercioConAlmuerzo();
        pagar(dueno, hoy().atTime(13, 0));
        datos.cambiarEstadoComercio(dueno.comercioId(), "SUSPENDIDO");

        job.abrirYCerrarTurnos(almuerzoTerminado());

        assertEquals("ENVIADO", unicoCierre(dueno.comercioId()).get("email_estado"));
        verify(emailService, times(1)).enviarResumenTurno(eq(dueno.email()), anyString(), anyString(), anyString());
    }

    @Test
    void losComerciosAprobadosSinCuentaDeCobroNuncaGeneranCierre() {
        Dueno dueno = comercioConAlmuerzo();
        datos.cambiarEstadoComercio(dueno.comercioId(), "APROBADO");

        job.abrirYCerrarTurnos(almuerzoTerminado());

        assertTrue(cierres(dueno.comercioId()).isEmpty());
    }

    @Test
    void unEnviandoHuerfanoVencidoVuelveAPendienteYSeEnvia() {
        Dueno dueno = comercioConAlmuerzo();
        job.abrirYCerrarTurnos(almuerzoTerminado());
        int id = (Integer) unicoCierre(dueno.comercioId()).get("id");
        jdbcTemplate.update("UPDATE cierre_turno SET email_estado = 'ENVIANDO', email_envio_iniciado = ?, email_fecha_envio = NULL WHERE id = ?",
                almuerzoTerminado().minusMinutes(5), id);

        job.abrirYCerrarTurnos(almuerzoTerminado().plusMinutes(10));
        assertEquals("ENVIANDO", unicoCierre(dueno.comercioId()).get("email_estado"));

        job.abrirYCerrarTurnos(almuerzoTerminado().plusMinutes(11));
        assertEquals("ENVIADO", unicoCierre(dueno.comercioId()).get("email_estado"));
        verify(emailService, times(2)).enviarResumenTurno(eq(dueno.email()), anyString(), anyString(), anyString());
    }

    @Test
    void elCierreDelMismoTurnoDosVecesDaYaCerradoSinTocarLaFilaGanadora() {
        Dueno dueno = comercioConAlmuerzo();
        Horario horario = horarioRepository.findVigentesDesde(dueno.comercioId(), hoy().minusDays(1)).get(0);
        DisponibilidadComercioService.Turno turno = disponibilidadComercioService
                .turnosTerminadosEntre(List.of(horario), hoy().atTime(14, 0), almuerzoTerminado()).get(0);
        CandidatoCierre candidato = new CandidatoCierre(dueno.comercioId(), com.bajonea.backend.enums.EstadoComercio.APTO_VENTA, turno);

        assertEquals(ResultadoCierre.CERRADO, cierreTurnoService.cerrar(candidato, almuerzoTerminado()));
        assertEquals(ResultadoCierre.YA_CERRADO, cierreTurnoService.cerrar(candidato, almuerzoTerminado().plusMinutes(5)));

        assertEquals(almuerzoTerminado(), fechaHora(unicoCierre(dueno.comercioId()).get("fecha_cierre")));
    }

    @Test
    void sinFranjasVigentesNoHayTurnosNiCierre() {
        Dueno dueno = comercioSinHorarios();

        job.abrirYCerrarTurnos(almuerzoTerminado());

        assertTrue(cierres(dueno.comercioId()).isEmpty());
    }

    @Test
    void editarLosHorariosDespuesDeCerrarNoRompeNiDuplicaElCierre() {
        Dueno dueno = comercioConAlmuerzo();
        job.abrirYCerrarTurnos(almuerzoTerminado());
        int horarioId = (Integer) unicoCierre(dueno.comercioId()).get("horario_id");
        jdbcTemplate.update("UPDATE horario SET vigente_hasta = ? WHERE id = ?", hoy(), horarioId);
        horario(dueno.comercioId(), hoy().plusDays(1), "13:00", "16:00");

        job.abrirYCerrarTurnos(almuerzoTerminado().plusMinutes(10));

        assertEquals(1, cierres(dueno.comercioId()).size());
        assertEquals(horarioId, unicoCierre(dueno.comercioId()).get("horario_id"));
    }

    @Test
    void elEnvioDelMailNoSostieneNingunaTransaccionNiBloqueoAbiertos() {
        Dueno dueno = comercioConAlmuerzo();
        AtomicBoolean habiaTransaccion = new AtomicBoolean(false);
        AtomicBoolean seLlamo = new AtomicBoolean(false);
        when(emailService.enviarResumenTurno(eq(dueno.email()), anyString(), anyString(), anyString())).thenAnswer(invocacion -> {
            seLlamo.set(true);
            habiaTransaccion.set(TransactionSynchronizationManager.isActualTransactionActive());
            return ResultadoEnvioEmail.enviado("sin-transaccion");
        });

        job.abrirYCerrarTurnos(almuerzoTerminado());

        assertTrue(seLlamo.get());
        assertFalse(habiaTransaccion.get(), "el mail se envió con una transacción abierta");
    }

    @Test
    void conElPerfilTestLaCorridaProgramadaNoHaceNadaYLaCorridaAPedidoSi() {
        Dueno dueno = comercioSinHorarios();
        horario(dueno.comercioId(), hoy().minusDays(2), "00:00", "23:59");

        job.abrirYCerrarTurnos();

        assertTrue(cierres(dueno.comercioId()).isEmpty(), "la corrida programada cerró un turno con el perfil test");
        job.abrirYCerrarTurnos(disponibilidadComercioService.ahora());
        assertEquals(1, cierres(dueno.comercioId()).size());
    }
}
