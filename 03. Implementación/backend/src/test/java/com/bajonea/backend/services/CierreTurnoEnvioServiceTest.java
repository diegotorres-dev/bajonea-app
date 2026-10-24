package com.bajonea.backend.services;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.bajonea.backend.config.TurnoCierreProperties;
import com.bajonea.backend.enums.EstadoComercio;
import com.bajonea.backend.enums.EstadoUsuario;
import com.bajonea.backend.repositories.CierreTurnoRepository;
import com.bajonea.backend.repositories.CierreTurnoRepository.CierrePorEnviar;
import com.bajonea.backend.services.CierreTurnoEnvioService.ResultadoEnvio;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.transaction.PlatformTransactionManager;

class CierreTurnoEnvioServiceTest {

    private static final LocalDateTime AHORA = LocalDateTime.of(2026, 10, 23, 15, 30);

    private CierreTurnoRepository repositorio;
    private EmailService emailService;
    private TurnoCierreProperties propiedades;
    private CierreTurnoEnvioService servicio;

    @BeforeEach
    void preparar() {
        repositorio = mock(CierreTurnoRepository.class);
        emailService = mock(EmailService.class);
        propiedades = new TurnoCierreProperties();
        servicio = new CierreTurnoEnvioService(repositorio, emailService, propiedades, mock(PlatformTransactionManager.class));
        when(repositorio.reclamar(any(), any())).thenReturn(1);
        when(repositorio.marcarEnviado(any(), any())).thenReturn(1);
        when(repositorio.omitir(any(), anyString())).thenReturn(1);
    }

    private static CierrePorEnviar cierre(int id, int duenoId, EstadoUsuario estadoDueno, int intentos) {
        CierrePorEnviar cierre = mock(CierrePorEnviar.class);
        when(cierre.getId()).thenReturn(id);
        when(cierre.getComercioId()).thenReturn(id * 10);
        when(cierre.getNombreComercio()).thenReturn("Comercio " + id);
        when(cierre.getEstadoComercio()).thenReturn(EstadoComercio.APTO_VENTA);
        when(cierre.getDuenoId()).thenReturn(duenoId);
        when(cierre.getEmailDueno()).thenReturn("dueno" + duenoId + "@bajonea.test");
        when(cierre.getNombreDueno()).thenReturn("Dueno" + duenoId);
        when(cierre.getEstadoDueno()).thenReturn(estadoDueno);
        when(cierre.getTurnoFecha()).thenReturn(LocalDate.of(2026, 10, 23));
        when(cierre.getHoraApertura()).thenReturn(LocalTime.of(12, 0));
        when(cierre.getHoraCierre()).thenReturn(LocalTime.of(15, 0));
        when(cierre.getFin()).thenReturn(LocalDateTime.of(2026, 10, 23, 15, 0));
        when(cierre.getCantidadPedidos()).thenReturn(3);
        when(cierre.getVendido()).thenReturn(new BigDecimal("3000.00"));
        when(cierre.getComision()).thenReturn(new BigDecimal("30.00"));
        when(cierre.getNeto()).thenReturn(new BigDecimal("2970.00"));
        when(cierre.getPendientesAlCierre()).thenReturn(0);
        when(cierre.getEmailIntentos()).thenReturn(intentos);
        return cierre;
    }

    private void pendientes(CierrePorEnviar... cierres) {
        when(repositorio.findPorEnviar(AHORA)).thenReturn(List.of(cierres));
    }

    @Test
    void unDuenoConDosCierresRecibeUnSoloMailConLosDosYAmbosPasanAEnviado() {
        pendientes(cierre(1, 7, EstadoUsuario.ACTIVO, 0), cierre(2, 7, EstadoUsuario.ACTIVO, 0));
        when(emailService.enviarResumenTurno(any(), any(), any(), any())).thenReturn(ResultadoEnvioEmail.enviado("r1"));

        ResultadoEnvio resultado = servicio.enviarPendientes(AHORA);

        assertEquals(new ResultadoEnvio(1, 2, 0, 0), resultado);
        ArgumentCaptor<String> asunto = ArgumentCaptor.forClass(String.class);
        ArgumentCaptor<String> cuerpo = ArgumentCaptor.forClass(String.class);
        verify(emailService, times(1)).enviarResumenTurno(eq("dueno7@bajonea.test"), asunto.capture(), cuerpo.capture(),
                eq("cierre-turno-1-2-i0"));
        assertEquals("Cerraron los turnos de tus comercios", asunto.getValue());
        assertTrue(cuerpo.getValue().contains("Comercio 1") && cuerpo.getValue().contains("Comercio 2"));
        verify(repositorio).marcarEnviado(1, AHORA);
        verify(repositorio).marcarEnviado(2, AHORA);
    }

    @Test
    void conDosDuenosSalenDosMailsCadaUnoConSuDestinatario() {
        pendientes(cierre(1, 7, EstadoUsuario.ACTIVO, 0), cierre(2, 8, EstadoUsuario.ACTIVO, 0));
        when(emailService.enviarResumenTurno(any(), any(), any(), any())).thenReturn(ResultadoEnvioEmail.deshabilitado());

        ResultadoEnvio resultado = servicio.enviarPendientes(AHORA);

        assertEquals(new ResultadoEnvio(2, 2, 0, 0), resultado);
        verify(emailService).enviarResumenTurno(eq("dueno7@bajonea.test"), anyString(), anyString(), anyString());
        verify(emailService).enviarResumenTurno(eq("dueno8@bajonea.test"), anyString(), anyString(), anyString());
    }

    @Test
    void unaCuentaDelDuenoQueNoEstaActivaOmiteElCierreYNoEnviaNiReclama() {
        pendientes(cierre(1, 7, EstadoUsuario.BLOQUEADO, 0), cierre(2, 7, EstadoUsuario.BLOQUEADO, 0));

        ResultadoEnvio resultado = servicio.enviarPendientes(AHORA);

        assertEquals(new ResultadoEnvio(0, 0, 2, 0), resultado);
        verify(repositorio).omitir(1, CierreTurnoEnvioService.MOTIVO_CUENTA_NO_ACTIVA);
        verify(repositorio).omitir(2, CierreTurnoEnvioService.MOTIVO_CUENTA_NO_ACTIVA);
        verify(repositorio, never()).reclamar(any(), any());
        verify(emailService, never()).enviarResumenTurno(any(), any(), any(), any());
    }

    @Test
    void lasFilasQueOtraCorridaYaReclamoNoSeEnvianDeNuevo() {
        pendientes(cierre(1, 7, EstadoUsuario.ACTIVO, 0), cierre(2, 7, EstadoUsuario.ACTIVO, 0));
        when(repositorio.reclamar(1, AHORA)).thenReturn(0);
        when(emailService.enviarResumenTurno(any(), any(), any(), any())).thenReturn(ResultadoEnvioEmail.enviado("r"));

        ResultadoEnvio resultado = servicio.enviarPendientes(AHORA);

        assertEquals(new ResultadoEnvio(1, 1, 0, 0), resultado);
        verify(emailService).enviarResumenTurno(eq("dueno7@bajonea.test"), anyString(), anyString(), eq("cierre-turno-2-i0"));
        verify(repositorio, never()).marcarEnviado(eq(1), any());
    }

    @Test
    void siOtraCorridaReclamoTodasLasFilasNoSeEnviaNada() {
        pendientes(cierre(1, 7, EstadoUsuario.ACTIVO, 0));
        when(repositorio.reclamar(1, AHORA)).thenReturn(0);

        assertEquals(new ResultadoEnvio(0, 0, 0, 0), servicio.enviarPendientes(AHORA));
        verify(emailService, never()).enviarResumenTurno(any(), any(), any(), any());
    }

    @Test
    void unaFallaReintentaConElRetrocesoDeDiezTreintaSesentaYSesentaMinutos() {
        when(emailService.enviarResumenTurno(any(), any(), any(), any())).thenReturn(ResultadoEnvioEmail.fallido(429, "429 rate_limit_exceeded"));
        int[] esperados = {10, 30, 60, 60};
        for (int intentosPrevios = 0; intentosPrevios < 4; intentosPrevios++) {
            pendientes(cierre(5, 7, EstadoUsuario.ACTIVO, intentosPrevios));

            ResultadoEnvio resultado = servicio.enviarPendientes(AHORA);

            assertEquals(new ResultadoEnvio(0, 0, 0, 1), resultado);
            verify(repositorio).registrarFallaConReintento(5, intentosPrevios + 1, AHORA.plusMinutes(esperados[intentosPrevios]),
                    "429 rate_limit_exceeded");
            org.mockito.Mockito.clearInvocations(repositorio);
            when(repositorio.reclamar(any(), any())).thenReturn(1);
        }
    }

    @Test
    void elQuintoIntentoFallidoDejaElCierreEnFallidoDefinitivo() {
        when(emailService.enviarResumenTurno(any(), any(), any(), any())).thenReturn(ResultadoEnvioEmail.fallido(500, "500 internal_server_error"));
        pendientes(cierre(5, 7, EstadoUsuario.ACTIVO, 4));

        servicio.enviarPendientes(AHORA);

        verify(repositorio).registrarFallaDefinitiva(5, 5, "500 internal_server_error");
        verify(repositorio, never()).registrarFallaConReintento(any(), any(), any(), any());
    }

    @Test
    void elErrorSeRecortaA500Caracteres() {
        when(emailService.enviarResumenTurno(any(), any(), any(), any())).thenReturn(ResultadoEnvioEmail.fallido(500, "x".repeat(900)));
        pendientes(cierre(5, 7, EstadoUsuario.ACTIVO, 0));

        servicio.enviarPendientes(AHORA);

        verify(repositorio).registrarFallaConReintento(eq(5), eq(1), any(), eq("x".repeat(500)));
    }

    @Test
    void laClaveDeIdempotenciaCambiaEnCadaIntentoYNoDependeDelOrden() {
        List<CierrePorEnviar> primerIntento = List.of(cierre(9, 7, EstadoUsuario.ACTIVO, 0), cierre(3, 7, EstadoUsuario.ACTIVO, 0));
        List<CierrePorEnviar> segundoIntento = List.of(cierre(9, 7, EstadoUsuario.ACTIVO, 1), cierre(3, 7, EstadoUsuario.ACTIVO, 1));

        assertEquals("cierre-turno-3-9-i0", CierreTurnoEnvioService.claveDeIdempotencia(primerIntento));
        assertEquals("cierre-turno-3-9-i1", CierreTurnoEnvioService.claveDeIdempotencia(segundoIntento));
    }

    @Test
    void laFallaDeUnDuenoNoFrenaElEnvioAlSiguiente() {
        pendientes(cierre(1, 7, EstadoUsuario.ACTIVO, 0), cierre(2, 8, EstadoUsuario.ACTIVO, 0));
        when(repositorio.reclamar(1, AHORA)).thenThrow(new IllegalStateException("la base se cayó"));
        when(emailService.enviarResumenTurno(any(), any(), any(), any())).thenReturn(ResultadoEnvioEmail.enviado("r"));

        ResultadoEnvio resultado = servicio.enviarPendientes(AHORA);

        assertEquals(new ResultadoEnvio(1, 1, 0, 0), resultado);
        verify(emailService).enviarResumenTurno(eq("dueno8@bajonea.test"), anyString(), anyString(), anyString());
        verify(emailService, never()).enviarResumenTurno(eq("dueno7@bajonea.test"), anyString(), anyString(), anyString());
    }

    @Test
    void lasFilasEnviandoVencidasVuelvenAPendienteUnaPorUna() {
        when(repositorio.findIdsEnviandoDesde(AHORA.minusMinutes(15))).thenReturn(List.of(4, 8));
        when(repositorio.recuperarEnviando(4, AHORA.minusMinutes(15))).thenReturn(1);
        when(repositorio.recuperarEnviando(8, AHORA.minusMinutes(15))).thenReturn(0);

        assertEquals(1, servicio.recuperarEnviandoVencidos(AHORA));
        verify(repositorio).recuperarEnviando(4, AHORA.minusMinutes(15));
        verify(repositorio).recuperarEnviando(8, AHORA.minusMinutes(15));
    }
}
