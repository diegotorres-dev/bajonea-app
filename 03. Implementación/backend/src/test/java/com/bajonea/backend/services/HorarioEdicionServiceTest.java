package com.bajonea.backend.services;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.bajonea.backend.config.security.ComercioActivo;
import com.bajonea.backend.dto.request.HorarioRequestDTO;
import com.bajonea.backend.dto.response.HorariosComercioResponseDTO;
import com.bajonea.backend.entities.Comercio;
import com.bajonea.backend.entities.Horario;
import com.bajonea.backend.enums.AccionEdicion;
import com.bajonea.backend.enums.DiaSemana;
import com.bajonea.backend.enums.EstadoComercio;
import com.bajonea.backend.enums.RolActorComercio;
import com.bajonea.backend.enums.TipoEntidadEdicion;
import com.bajonea.backend.exceptions.ConflictoComercioException;
import com.bajonea.backend.exceptions.ValidacionException;
import com.bajonea.backend.repositories.ComercioRepository;
import com.bajonea.backend.repositories.HorarioRepository;
import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.InOrder;
import org.springframework.test.util.ReflectionTestUtils;

class HorarioEdicionServiceTest {

    private static final int COMERCIO_ID = 7;
    private static final int DUENO_ID = 70;
    private static final int EMPLEADO_ID = 71;
    private static final LocalDate HOY = LocalDate.of(2026, 10, 7);

    private ComercioRepository comercioRepository;
    private HorarioRepository horarioRepository;
    private HistorialEdicionComercioService historial;
    private DisponibilidadComercioService disponibilidad;
    private EntityManager entityManager;
    private HorarioEdicionService service;
    private Comercio comercio;
    private List<Horario> almacen;

    @BeforeEach
    void preparar() {
        comercioRepository = mock(ComercioRepository.class);
        horarioRepository = mock(HorarioRepository.class);
        historial = mock(HistorialEdicionComercioService.class);
        disponibilidad = mock(DisponibilidadComercioService.class);
        entityManager = mock(EntityManager.class);
        service = new HorarioEdicionService(comercioRepository, horarioRepository, historial, disponibilidad);
        ReflectionTestUtils.setField(service, "entityManager", entityManager);

        comercio = Comercio.builder().id(COMERCIO_ID).nombre("Cafe").estado(EstadoComercio.APTO_VENTA).build();
        almacen = new ArrayList<>();
        when(comercioRepository.findById(COMERCIO_ID)).thenReturn(Optional.of(comercio));
        when(disponibilidad.ahora()).thenReturn(HOY.atTime(12, 0));
        when(horarioRepository.findVigentesDesdeConBloqueo(eq(COMERCIO_ID), any())).thenAnswer(invocacion -> new ArrayList<>(almacen));
    }

    private static ComercioActivo dueno() {
        return ComercioActivo.delDueno(COMERCIO_ID, DUENO_ID, EstadoComercio.APTO_VENTA);
    }

    private static ComercioActivo empleado(EstadoComercio estado) {
        return new ComercioActivo(COMERCIO_ID, DUENO_ID, EMPLEADO_ID, RolActorComercio.EMPLEADO, estado);
    }

    private Horario fila(DiaSemana dia, String apertura, String cierre, LocalDate desde, LocalDate hasta) {
        Horario horario = Horario.builder().comercio(comercio).diaSemana(dia).horaApertura(LocalTime.parse(apertura))
                .horaCierre(LocalTime.parse(cierre)).vigenteDesde(desde).vigenteHasta(hasta).build();
        almacen.add(horario);
        return horario;
    }

    private static HorarioRequestDTO franja(DiaSemana dia, String apertura, String cierre) {
        return new HorarioRequestDTO(dia, LocalTime.parse(apertura), LocalTime.parse(cierre));
    }

    @Test
    void tomaElUsuarioLuegoElComercioConBloqueoDeEscrituraYRecienDespuesLeeLasFilas() {
        fila(DiaSemana.LUNES, "09:00", "18:00", LocalDate.of(2000, 1, 1), null);

        service.editarHorarios(dueno(), List.of(franja(DiaSemana.MARTES, "10:00", "12:00")));

        InOrder orden = inOrder(historial, entityManager, horarioRepository);
        orden.verify(historial).iniciarEscritura(dueno());
        orden.verify(entityManager).refresh(comercio, LockModeType.PESSIMISTIC_WRITE);
        orden.verify(horarioRepository).findVigentesDesdeConBloqueo(eq(COMERCIO_ID), any());
    }

    @Test
    void unaVersionDistintaCierraLoVigenteConHoyEInsertaLoNuevoDesdeManiana() {
        Horario vieja = fila(DiaSemana.LUNES, "09:00", "18:00", LocalDate.of(2000, 1, 1), null);

        service.editarHorarios(dueno(), List.of(franja(DiaSemana.MARTES, "10:00", "12:00")));

        assertEquals(HOY, vieja.getVigenteHasta());
        ArgumentCaptor<Horario> nueva = ArgumentCaptor.forClass(Horario.class);
        verify(horarioRepository).save(nueva.capture());
        assertEquals(HOY.plusDays(1), nueva.getValue().getVigenteDesde());
        assertEquals(DiaSemana.MARTES, nueva.getValue().getDiaSemana());
        verify(historial).registrar(any(ComercioActivo.class), eq(TipoEntidadEdicion.HORARIO), any(), eq("Cafe"), eq(AccionEdicion.EDITAR),
                any());
    }

    @Test
    void lasFilasPendientesSeBorranAntesDeCalcularLaBase() {
        Horario vigente = fila(DiaSemana.LUNES, "09:00", "18:00", LocalDate.of(2000, 1, 1), HOY);
        Horario pendiente = fila(DiaSemana.JUEVES, "09:00", "12:00", HOY.plusDays(1), null);

        service.editarHorarios(dueno(), List.of(franja(DiaSemana.LUNES, "09:00", "18:00")));

        verify(horarioRepository).deleteAll(List.of(pendiente));
        assertEquals(null, vigente.getVigenteHasta());
        verify(horarioRepository, never()).save(any(Horario.class));
        verify(historial).registrar(any(ComercioActivo.class), eq(TipoEntidadEdicion.HORARIO), any(), any(), eq(AccionEdicion.EDITAR),
                eq("Canceló el cambio de horarios programado"));
    }

    @Test
    void sinCambioNiProgramadoNoRegistraNada() {
        fila(DiaSemana.LUNES, "09:00", "18:00", LocalDate.of(2000, 1, 1), null);

        HorariosComercioResponseDTO respuesta = service.editarHorarios(dueno(), List.of(franja(DiaSemana.LUNES, "09:00", "18:00")));

        verify(historial, never()).registrar(any(ComercioActivo.class), any(), any(), any(), any(), any());
        verify(horarioRepository, never()).save(any(Horario.class));
        assertTrue(respuesta.getPendientes().isEmpty());
    }

    @Test
    void laColaDelTurnoDeHoyBloqueaLaEdicionSinTocarNada() {
        Horario cruza = fila(DiaSemana.MIERCOLES, "20:00", "02:00", LocalDate.of(2000, 1, 1), null);

        ValidacionException error = assertThrows(ValidacionException.class,
                () -> service.editarHorarios(dueno(), List.of(franja(DiaSemana.JUEVES, "01:00", "05:00"))));

        assertTrue(error.getMessage().contains("Tu turno de hoy (miércoles de 20:00 a 02:00) termina el jueves a las 02:00"));
        assertTrue(error.getMessage().contains("Movela para que empiece después de las 02:00"));
        assertEquals(null, cruza.getVigenteHasta());
        verify(horarioRepository, never()).save(any(Horario.class));
    }

    @Test
    void elTurnoDeHoyQueCierraA0000NoTieneColaYNoBloquea() {
        fila(DiaSemana.MIERCOLES, "20:00", "00:00", LocalDate.of(2000, 1, 1), null);

        service.editarHorarios(dueno(), List.of(franja(DiaSemana.JUEVES, "00:00", "05:00")));

        verify(horarioRepository).save(any(Horario.class));
    }

    @Test
    void elEmpleadoConElComercioSuspendidoRecibeElConflictoAntesDeLeerLasFilas() {
        comercio.setEstado(EstadoComercio.SUSPENDIDO);

        ConflictoComercioException error = assertThrows(ConflictoComercioException.class,
                () -> service.editarHorarios(empleado(EstadoComercio.SUSPENDIDO), List.of(franja(DiaSemana.MARTES, "10:00", "12:00"))));

        assertEquals(ConflictoComercioException.SUSPENDIDO, error.getCodigo());
        verify(horarioRepository, never()).findVigentesDesdeConBloqueo(any(), any());
    }

    @Test
    void elDuenoConElComercioSuspendidoNoPuedeEditar() {
        comercio.setEstado(EstadoComercio.SUSPENDIDO);
        fila(DiaSemana.LUNES, "09:00", "18:00", LocalDate.of(2000, 1, 1), null);

        ConflictoComercioException error = assertThrows(ConflictoComercioException.class,
                () -> service.editarHorarios(dueno(), List.of(franja(DiaSemana.MARTES, "10:00", "12:00"))));

        assertEquals(ConflictoComercioException.SUSPENDIDO, error.getCodigo());
        verify(horarioRepository, never()).save(any(Horario.class));
    }

    @Test
    void laValidacionDeFranjasRechazaElCierreIgualALaAperturaSinEscribir() {
        fila(DiaSemana.LUNES, "09:00", "18:00", LocalDate.of(2000, 1, 1), null);

        assertThrows(ValidacionException.class,
                () -> service.editarHorarios(dueno(), List.of(franja(DiaSemana.MARTES, "10:00", "10:00"))));

        verify(horarioRepository, never()).save(any(Horario.class));
        verify(horarioRepository, never()).findVigentesDesdeConBloqueo(any(), any());
    }

    @Test
    void laFechaDeHoyVieneDelServicioDeDisponibilidadYNoDelRelojDelSistema() {
        when(disponibilidad.ahora()).thenReturn(LocalDateTime.of(2030, 1, 2, 3, 0));
        Horario vieja = fila(DiaSemana.LUNES, "09:00", "18:00", LocalDate.of(2000, 1, 1), null);

        service.editarHorarios(dueno(), List.of(franja(DiaSemana.MARTES, "10:00", "12:00")));

        assertEquals(LocalDate.of(2030, 1, 2), vieja.getVigenteHasta());
    }
}
