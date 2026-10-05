package com.bajonea.backend.services;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.bajonea.backend.dto.response.CierreComercioResponseDTO;
import com.bajonea.backend.entities.Comercio;
import com.bajonea.backend.entities.HistorialCierreComercio;
import com.bajonea.backend.entities.Horario;
import com.bajonea.backend.enums.AccionCierre;
import com.bajonea.backend.enums.ActorCierre;
import com.bajonea.backend.enums.DiaSemana;
import com.bajonea.backend.enums.EstadoComercio;
import com.bajonea.backend.exceptions.ConflictoDeNegocioException;
import com.bajonea.backend.exceptions.RecursoNoEncontradoException;
import com.bajonea.backend.repositories.ComercioRepository;
import com.bajonea.backend.repositories.HistorialCierreComercioRepository;
import com.bajonea.backend.repositories.HorarioRepository;
import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.InOrder;
import org.springframework.test.util.ReflectionTestUtils;

class CierreComercioServiceTest {

    private static final LocalDate LUNES = LocalDate.of(2026, 10, 5);
    private static final int COMERCIO_ID = 1;
    private static final int DUENO_ID = 9;

    private ComercioRepository comercioRepository;
    private HorarioRepository horarioRepository;
    private HistorialCierreComercioRepository historialRepository;
    private EntityManager entityManager;
    private LocalDateTime ahora;
    private CierreComercioService service;
    private Comercio comercio;

    @BeforeEach
    void preparar() {
        comercioRepository = mock(ComercioRepository.class);
        horarioRepository = mock(HorarioRepository.class);
        historialRepository = mock(HistorialCierreComercioRepository.class);
        entityManager = mock(EntityManager.class);
        ahora = LUNES.atTime(11, 0, 30);
        DisponibilidadComercioService disponibilidad = new DisponibilidadComercioService(horarioRepository, historialRepository) {
            @Override
            public LocalDateTime ahora() {
                return ahora;
            }
        };
        service = new CierreComercioService(comercioRepository, horarioRepository, historialRepository, disponibilidad);
        ReflectionTestUtils.setField(service, "entityManager", entityManager);

        comercio = Comercio.builder().id(COMERCIO_ID).estado(EstadoComercio.APTO_VENTA).build();
        when(comercioRepository.findById(COMERCIO_ID)).thenReturn(Optional.of(comercio));
        when(horarioRepository.findByComercioId(COMERCIO_ID)).thenReturn(List.of(franja("10:00", "14:00"), franja("19:00", "23:00")));
    }

    private static Horario franja(String apertura, String cierre) {
        return Horario.builder().diaSemana(DiaSemana.LUNES).horaApertura(LocalTime.parse(apertura)).horaCierre(LocalTime.parse(cierre)).build();
    }

    private HistorialCierreComercio filaGuardada() {
        ArgumentCaptor<HistorialCierreComercio> captor = ArgumentCaptor.forClass(HistorialCierreComercio.class);
        verify(historialRepository).save(captor.capture());
        return captor.getValue();
    }

    private void cierreVigenteEn(LocalDateTime momento) {
        comercio.setCerradoManualmente(true);
        when(historialRepository.findTopByComercioIdAndAccionOrderByFechaHoraDescIdDesc(COMERCIO_ID, AccionCierre.CERRADO))
                .thenReturn(Optional.of(HistorialCierreComercio.builder().accion(AccionCierre.CERRADO).fechaHora(momento).build()));
    }

    @Test
    void cerrarDentroDeFranjaPrendeLaBanderaYEscribeUnaFilaConElActorYLaHoraSinFracciones() {
        CierreComercioResponseDTO respuesta = service.cerrar(COMERCIO_ID, DUENO_ID, ActorCierre.DUENO);

        assertTrue(comercio.isCerradoManualmente());
        HistorialCierreComercio fila = filaGuardada();
        assertEquals(AccionCierre.CERRADO, fila.getAccion());
        assertEquals(ActorCierre.DUENO, fila.getActorRol());
        assertEquals(DUENO_ID, fila.getActorUsuarioId());
        assertEquals(LUNES.atTime(11, 0, 30), fila.getFechaHora());
        assertTrue(respuesta.isCerradoManualmente());
        assertFalse(respuesta.isAbiertoAhora());
        assertTrue(respuesta.isPuedeCambiarCierre());
        assertEquals("Reabre hoy a las 19:00", respuesta.getTextoReapertura());
    }

    @Test
    void laHoraDelHistorialSeGuardaSinNanosegundosParaQueLaBaseNoRedondeeHaciaArriba() {
        ahora = LUNES.atTime(11, 0, 30, 700_000_000);

        service.cerrar(COMERCIO_ID, DUENO_ID, ActorCierre.DUENO);

        assertEquals(LUNES.atTime(11, 0, 30), filaGuardada().getFechaHora());
    }

    @Test
    void tomaElComercioConBloqueoDeEscrituraAntesDeDecidir() {
        service.cerrar(COMERCIO_ID, DUENO_ID, ActorCierre.DUENO);

        InOrder orden = inOrder(entityManager, comercioRepository);
        orden.verify(entityManager).refresh(comercio, LockModeType.PESSIMISTIC_WRITE);
        orden.verify(comercioRepository).save(comercio);
    }

    @Test
    void cerrarFueraDeHorarioDa409YNoEscribeNada() {
        ahora = LUNES.atTime(16, 0);

        ConflictoDeNegocioException ex = assertThrows(ConflictoDeNegocioException.class,
                () -> service.cerrar(COMERCIO_ID, DUENO_ID, ActorCierre.DUENO));

        assertEquals("Solo podés abrir o cerrar dentro de tu horario", ex.getMessage());
        assertFalse(comercio.isCerradoManualmente());
        verify(historialRepository, never()).save(any());
        verify(comercioRepository, never()).save(any());
    }

    @Test
    void abrirFueraDeHorarioTambienDa409AunqueEsteCerradoManualmente() {
        cierreVigenteEn(LUNES.atTime(11, 0));
        ahora = LUNES.atTime(16, 0);

        ConflictoDeNegocioException ex = assertThrows(ConflictoDeNegocioException.class,
                () -> service.abrir(COMERCIO_ID, DUENO_ID, ActorCierre.DUENO));

        assertEquals("Solo podés abrir o cerrar dentro de tu horario", ex.getMessage());
        assertTrue(comercio.isCerradoManualmente());
        verify(historialRepository, never()).save(any());
    }

    @Test
    void unComercioQueNoEsOperativoDa409ConSuTexto() {
        for (EstadoComercio estado : EstadoComercio.values()) {
            if (estado == EstadoComercio.APROBADO || estado == EstadoComercio.APTO_VENTA) {
                continue;
            }
            comercio.setEstado(estado);

            ConflictoDeNegocioException ex = assertThrows(ConflictoDeNegocioException.class,
                    () -> service.cerrar(COMERCIO_ID, DUENO_ID, ActorCierre.DUENO), "estado " + estado);

            assertEquals("Este comercio no está operativo", ex.getMessage());
        }
        verify(historialRepository, never()).save(any());
    }

    @Test
    void unComercioAprobadoSinMercadoPagoTambienPuedeCerrar() {
        comercio.setEstado(EstadoComercio.APROBADO);

        CierreComercioResponseDTO respuesta = service.cerrar(COMERCIO_ID, DUENO_ID, ActorCierre.DUENO);

        assertTrue(respuesta.isCerradoManualmente());
    }

    @Test
    void unComercioInexistenteDa404() {
        when(comercioRepository.findById(99)).thenReturn(Optional.empty());

        assertThrows(RecursoNoEncontradoException.class, () -> service.cerrar(99, DUENO_ID, ActorCierre.DUENO));
    }

    @Test
    void elDobleCierreResponde200ConElEstadoActualYNoEscribeOtraFila() {
        cierreVigenteEn(LUNES.atTime(10, 30));

        CierreComercioResponseDTO respuesta = service.cerrar(COMERCIO_ID, DUENO_ID, ActorCierre.DUENO);

        assertTrue(respuesta.isCerradoManualmente());
        assertEquals("Reabre hoy a las 19:00", respuesta.getTextoReapertura());
        verify(historialRepository, never()).save(any());
        verify(comercioRepository, never()).save(any());
    }

    @Test
    void laDobleAperturaResponde200ConElEstadoActualYNoEscribeOtraFila() {
        CierreComercioResponseDTO respuesta = service.abrir(COMERCIO_ID, DUENO_ID, ActorCierre.DUENO);

        assertFalse(respuesta.isCerradoManualmente());
        assertTrue(respuesta.isAbiertoAhora());
        assertNull(respuesta.getTextoReapertura());
        verify(historialRepository, never()).save(any());
    }

    @Test
    void abrirUnComercioCerradoApagaLaBanderaYEscribeReabierto() {
        cierreVigenteEn(LUNES.atTime(10, 30));

        CierreComercioResponseDTO respuesta = service.abrir(COMERCIO_ID, DUENO_ID, ActorCierre.DUENO);

        assertFalse(comercio.isCerradoManualmente());
        HistorialCierreComercio fila = filaGuardada();
        assertEquals(AccionCierre.REABIERTO, fila.getAccion());
        assertEquals(ActorCierre.DUENO, fila.getActorRol());
        assertEquals(DUENO_ID, fila.getActorUsuarioId());
        assertTrue(respuesta.isAbiertoAhora());
    }

    @Test
    void unaSolaTransaccionGuardaBanderaYFilaPorOperacion() {
        service.cerrar(COMERCIO_ID, DUENO_ID, ActorCierre.DUENO);

        verify(comercioRepository, times(1)).save(comercio);
        verify(historialRepository, times(1)).save(any(HistorialCierreComercio.class));
    }

    @Test
    void elActorEmpleadoLlegaPorParametroYQuedaEnLaFila() {
        service.cerrar(COMERCIO_ID, 33, ActorCierre.EMPLEADO);

        HistorialCierreComercio fila = filaGuardada();
        assertEquals(ActorCierre.EMPLEADO, fila.getActorRol());
        assertEquals(33, fila.getActorUsuarioId());
    }

    @Test
    void elActorSistemaNuncaGuardaUsuario() {
        service.cerrar(COMERCIO_ID, 33, ActorCierre.SISTEMA);

        HistorialCierreComercio fila = filaGuardada();
        assertEquals(ActorCierre.SISTEMA, fila.getActorRol());
        assertNull(fila.getActorUsuarioId());
    }

    @Test
    void unaFranjaQueCierraA2359PermiteCerrarEn235930() {
        when(horarioRepository.findByComercioId(COMERCIO_ID)).thenReturn(List.of(franja("00:00", "23:59")));
        ahora = LUNES.atTime(23, 59, 30);

        CierreComercioResponseDTO respuesta = service.cerrar(COMERCIO_ID, DUENO_ID, ActorCierre.DUENO);

        assertTrue(respuesta.isCerradoManualmente());
        assertEquals("Reabre el lunes a las 00:00", respuesta.getTextoReapertura());
    }

    @Test
    void elJobReabreCuandoYaEmpezoLaProximaFranjaConActorSistemaYLaHoraReal() {
        cierreVigenteEn(LUNES.atTime(11, 0));
        LocalDateTime corrida = LUNES.atTime(19, 0, 20, 400_000_000);

        boolean reabrio = service.reabrirSiVencido(COMERCIO_ID, corrida);

        assertTrue(reabrio);
        assertFalse(comercio.isCerradoManualmente());
        HistorialCierreComercio fila = filaGuardada();
        assertEquals(AccionCierre.REABIERTO, fila.getAccion());
        assertEquals(ActorCierre.SISTEMA, fila.getActorRol());
        assertNull(fila.getActorUsuarioId());
        assertEquals(LUNES.atTime(19, 0, 20), fila.getFechaHora());
    }

    @Test
    void elJobNoReabreDentroDeLaFranjaDelCierre() {
        cierreVigenteEn(LUNES.atTime(11, 0));

        boolean reabrio = service.reabrirSiVencido(COMERCIO_ID, LUNES.atTime(18, 59, 59));

        assertFalse(reabrio);
        assertTrue(comercio.isCerradoManualmente());
        verify(historialRepository, never()).save(any());
    }

    @Test
    void elJobNoReabreSiLaFranjaEmpezoEnElMismoSegundoDelCierre() {
        cierreVigenteEn(LUNES.atTime(19, 0));

        assertFalse(service.reabrirSiVencido(COMERCIO_ID, LUNES.atTime(19, 0, 30)));
        assertTrue(comercio.isCerradoManualmente());
    }

    @Test
    void elJobSePoneAlDiaTrasUnaCaidaDeVariosDiasAunQueLaFranjaVencidaYaHayaPasado() {
        cierreVigenteEn(LUNES.atTime(21, 0));
        LocalDateTime variosDiasDespues = LUNES.plusDays(8).atTime(9, 15);

        boolean reabrio = service.reabrirSiVencido(COMERCIO_ID, variosDiasDespues);

        assertTrue(reabrio);
        HistorialCierreComercio fila = filaGuardada();
        assertEquals(variosDiasDespues, fila.getFechaHora());
    }

    @Test
    void elJobNoHaceNadaSiAlguienYaReabrioElComercio() {
        comercio.setCerradoManualmente(false);

        assertFalse(service.reabrirSiVencido(COMERCIO_ID, LUNES.plusDays(2).atTime(12, 0)));
        verify(historialRepository, never()).save(any());
        verify(comercioRepository, never()).save(any());
    }

    @Test
    void conLaBanderaPrendidaYSinFilaCerradoElJobReabreIgualYEscribeReabierto() {
        comercio.setCerradoManualmente(true);
        when(historialRepository.findTopByComercioIdAndAccionOrderByFechaHoraDescIdDesc(COMERCIO_ID, AccionCierre.CERRADO))
                .thenReturn(Optional.empty());

        boolean reabrio = service.reabrirSiVencido(COMERCIO_ID, LUNES.atTime(12, 0));

        assertTrue(reabrio);
        assertFalse(comercio.isCerradoManualmente());
        assertEquals(ActorCierre.SISTEMA, filaGuardada().getActorRol());
    }

    @Test
    void elJobBloqueaElComercioConForUpdateAntesDeLeerLaBandera() {
        cierreVigenteEn(LUNES.atTime(11, 0));

        service.reabrirSiVencido(COMERCIO_ID, LUNES.atTime(19, 5));

        verify(entityManager).refresh(comercio, LockModeType.PESSIMISTIC_WRITE);
    }

    @Test
    void sinFranjasElJobNoReabreSolo() {
        cierreVigenteEn(LUNES.atTime(11, 0));
        when(horarioRepository.findByComercioId(COMERCIO_ID)).thenReturn(List.of());

        assertFalse(service.reabrirSiVencido(COMERCIO_ID, LUNES.plusDays(30).atTime(12, 0)));
        assertTrue(comercio.isCerradoManualmente());
    }
}
