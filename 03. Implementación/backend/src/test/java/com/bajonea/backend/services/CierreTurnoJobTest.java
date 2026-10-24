package com.bajonea.backend.services;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.bajonea.backend.enums.EstadoComercio;
import com.bajonea.backend.services.CierreTurnoEnvioService.ResultadoEnvio;
import com.bajonea.backend.services.CierreTurnoJob.ResultadoCorrida;
import com.bajonea.backend.services.CierreTurnoService.CandidatoCierre;
import com.bajonea.backend.services.CierreTurnoService.ResultadoCierre;
import java.time.LocalDateTime;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class CierreTurnoJobTest {

    private static final LocalDateTime AHORA = LocalDateTime.of(2026, 10, 23, 15, 30);

    private CierreTurnoService cierreTurnoService;
    private CierreTurnoEnvioService envioService;
    private DisponibilidadComercioService disponibilidad;
    private CierreTurnoJob job;

    @BeforeEach
    void preparar() {
        cierreTurnoService = mock(CierreTurnoService.class);
        envioService = mock(CierreTurnoEnvioService.class);
        disponibilidad = mock(DisponibilidadComercioService.class);
        job = new CierreTurnoJob(cierreTurnoService, envioService, disponibilidad, true);
        when(envioService.enviarPendientes(AHORA)).thenReturn(new ResultadoEnvio(0, 0, 0, 0));
    }

    private static CandidatoCierre candidato(int comercioId, int minuto) {
        return new CandidatoCierre(comercioId, EstadoComercio.APTO_VENTA, new DisponibilidadComercioService.Turno(null,
                AHORA.minusHours(3).plusMinutes(minuto), AHORA.minusMinutes(30).plusMinutes(minuto)));
    }

    @Test
    void conLaBanderaApagadaLaCorridaProgramadaNoHaceNada() {
        new CierreTurnoJob(cierreTurnoService, envioService, disponibilidad, false).abrirYCerrarTurnos();

        verify(cierreTurnoService, never()).candidatos(any());
        verify(envioService, never()).enviarPendientes(any());
    }

    @Test
    void laCorridaProgramadaUsaElRelojDeLaAplicacion() {
        when(disponibilidad.ahora()).thenReturn(AHORA);
        when(cierreTurnoService.candidatos(AHORA)).thenReturn(List.of());

        job.abrirYCerrarTurnos();

        verify(cierreTurnoService).candidatos(AHORA);
        verify(envioService).enviarPendientes(AHORA);
    }

    @Test
    void unComercioQueFallaNoFrenaALosDemasPeroSusTurnosSiguientesSeSaltean() {
        CandidatoCierre a1 = candidato(1, 0);
        CandidatoCierre a2 = candidato(1, 1);
        CandidatoCierre b1 = candidato(2, 0);
        when(cierreTurnoService.candidatos(AHORA)).thenReturn(List.of(a1, a2, b1));
        when(cierreTurnoService.cerrar(a1, AHORA)).thenThrow(new IllegalStateException("falla"));
        when(cierreTurnoService.cerrar(b1, AHORA)).thenReturn(ResultadoCierre.CERRADO);

        ResultadoCorrida resultado = job.abrirYCerrarTurnos(AHORA);

        assertEquals(1, resultado.cierresCreados());
        verify(cierreTurnoService, never()).cerrar(a2, AHORA);
        verify(cierreTurnoService).cerrar(b1, AHORA);
    }

    @Test
    void unTurnoDiferidoDetieneLosPosterioresDelMismoComercioPeroNoLosDeOtros() {
        CandidatoCierre a1 = candidato(1, 0);
        CandidatoCierre a2 = candidato(1, 1);
        CandidatoCierre b1 = candidato(2, 0);
        when(cierreTurnoService.candidatos(AHORA)).thenReturn(List.of(a1, a2, b1));
        when(cierreTurnoService.cerrar(a1, AHORA)).thenReturn(ResultadoCierre.DIFERIDO);
        when(cierreTurnoService.cerrar(b1, AHORA)).thenReturn(ResultadoCierre.CERRADO);

        ResultadoCorrida resultado = job.abrirYCerrarTurnos(AHORA);

        assertEquals(1, resultado.cierresDiferidos());
        assertEquals(1, resultado.cierresCreados());
        verify(cierreTurnoService, never()).cerrar(a2, AHORA);
    }

    @Test
    void siFallaElCalculoDeLosCandidatosElEnvioDeLosPendientesIgualCorre() {
        when(cierreTurnoService.candidatos(AHORA)).thenThrow(new IllegalStateException("consulta caída"));
        when(envioService.enviarPendientes(AHORA)).thenReturn(new ResultadoEnvio(2, 3, 0, 0));

        ResultadoCorrida resultado = job.abrirYCerrarTurnos(AHORA);

        assertEquals(0, resultado.cierresCreados());
        assertEquals(2, resultado.mailsEnviados());
        assertEquals(3, resultado.cierresEnviados());
    }

    @Test
    void siFallaElEnvioLosCierresCreadosSeInformanIgual() {
        CandidatoCierre a1 = candidato(1, 0);
        when(cierreTurnoService.candidatos(AHORA)).thenReturn(List.of(a1));
        when(cierreTurnoService.cerrar(a1, AHORA)).thenReturn(ResultadoCierre.CERRADO);
        when(envioService.recuperarEnviandoVencidos(AHORA)).thenThrow(new IllegalStateException("base caída"));

        ResultadoCorrida resultado = job.abrirYCerrarTurnos(AHORA);

        assertEquals(1, resultado.cierresCreados());
        assertEquals(0, resultado.mailsEnviados());
    }

    @Test
    void unTurnoYaCerradoPorOtraCorridaNoCuentaComoCreado() {
        CandidatoCierre a1 = candidato(1, 0);
        when(cierreTurnoService.candidatos(AHORA)).thenReturn(List.of(a1));
        when(cierreTurnoService.cerrar(a1, AHORA)).thenReturn(ResultadoCierre.YA_CERRADO);

        assertEquals(0, job.abrirYCerrarTurnos(AHORA).cierresCreados());
    }
}
