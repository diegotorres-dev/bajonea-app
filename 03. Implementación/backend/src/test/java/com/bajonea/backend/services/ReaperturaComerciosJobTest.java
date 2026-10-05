package com.bajonea.backend.services;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.bajonea.backend.repositories.ComercioRepository;
import java.time.LocalDateTime;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class ReaperturaComerciosJobTest {

    private static final LocalDateTime AHORA = LocalDateTime.of(2026, 10, 5, 19, 1);

    private ComercioRepository comercioRepository;
    private CierreComercioService cierreComercioService;
    private ReaperturaComerciosJob job;

    @BeforeEach
    void preparar() {
        comercioRepository = mock(ComercioRepository.class);
        cierreComercioService = mock(CierreComercioService.class);
        job = new ReaperturaComerciosJob(comercioRepository, cierreComercioService, mock(DisponibilidadComercioService.class));
    }

    @Test
    void evaluaCadaComercioCerradoEnSuPropiaLlamadaYCuentaLosQueReabrio() {
        when(comercioRepository.findIdsCerradosManualmente()).thenReturn(List.of(1, 2, 3));
        when(cierreComercioService.reabrirSiVencido(1, AHORA)).thenReturn(true);
        when(cierreComercioService.reabrirSiVencido(2, AHORA)).thenReturn(false);
        when(cierreComercioService.reabrirSiVencido(3, AHORA)).thenReturn(true);

        assertEquals(2, job.reabrirComerciosVencidos(AHORA));

        verify(cierreComercioService).reabrirSiVencido(1, AHORA);
        verify(cierreComercioService).reabrirSiVencido(2, AHORA);
        verify(cierreComercioService).reabrirSiVencido(3, AHORA);
    }

    @Test
    void unComercioQueFallaNoFrenaALosDemas() {
        when(comercioRepository.findIdsCerradosManualmente()).thenReturn(List.of(1, 2, 3));
        doThrow(new IllegalStateException("falla")).when(cierreComercioService).reabrirSiVencido(2, AHORA);
        when(cierreComercioService.reabrirSiVencido(1, AHORA)).thenReturn(true);
        when(cierreComercioService.reabrirSiVencido(3, AHORA)).thenReturn(true);

        assertEquals(2, job.reabrirComerciosVencidos(AHORA));

        verify(cierreComercioService).reabrirSiVencido(3, AHORA);
    }

    @Test
    void sinComerciosCerradosNoHaceNada() {
        when(comercioRepository.findIdsCerradosManualmente()).thenReturn(List.of());

        assertEquals(0, job.reabrirComerciosVencidos(AHORA));

        verify(cierreComercioService, never()).reabrirSiVencido(org.mockito.ArgumentMatchers.anyInt(), org.mockito.ArgumentMatchers.any());
    }

    @Test
    void laCorridaProgramadaUsaLaHoraDelServicioDeDisponibilidad() {
        DisponibilidadComercioService disponibilidad = mock(DisponibilidadComercioService.class);
        when(disponibilidad.ahora()).thenReturn(AHORA);
        when(comercioRepository.findIdsCerradosManualmente()).thenReturn(List.of(4));
        ReaperturaComerciosJob programado = new ReaperturaComerciosJob(comercioRepository, cierreComercioService, disponibilidad);

        programado.reabrirComerciosVencidos();

        verify(cierreComercioService).reabrirSiVencido(4, AHORA);
    }
}
