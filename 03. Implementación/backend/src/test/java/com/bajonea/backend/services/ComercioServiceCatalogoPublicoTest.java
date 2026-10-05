package com.bajonea.backend.services;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.bajonea.backend.dto.response.ComercioPublicoResponseDTO;
import com.bajonea.backend.entities.Comercio;
import com.bajonea.backend.entities.Dueno;
import com.bajonea.backend.entities.HistorialEstadoComercio;
import com.bajonea.backend.entities.Horario;
import com.bajonea.backend.entities.PersonaJuridica;
import com.bajonea.backend.enums.DiaSemana;
import com.bajonea.backend.enums.EstadoApertura;
import com.bajonea.backend.enums.EstadoComercio;
import com.bajonea.backend.exceptions.RecursoNoEncontradoException;
import com.bajonea.backend.repositories.ComercioRepository;
import com.bajonea.backend.repositories.DireccionRepository;
import com.bajonea.backend.repositories.HistorialCierreComercioRepository;
import com.bajonea.backend.repositories.HistorialEstadoComercioRepository;
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
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.mockito.ArgumentCaptor;
import org.springframework.test.util.ReflectionTestUtils;

class ComercioServiceCatalogoPublicoTest {

    private static final LocalDate LUNES = LocalDate.of(2026, 10, 5);
    private static final String MOTIVO = "Bloqueo de cuenta por intentos fallidos";

    private ComercioRepository comercioRepository;
    private HorarioRepository horarioRepository;
    private HistorialEstadoComercioRepository historialRepository;
    private EntityManager entityManager;
    private LocalDateTime ahora;
    private ComercioService service;

    @BeforeEach
    void preparar() {
        comercioRepository = mock(ComercioRepository.class);
        horarioRepository = mock(HorarioRepository.class);
        historialRepository = mock(HistorialEstadoComercioRepository.class);
        entityManager = mock(EntityManager.class);
        ahora = LUNES.atTime(12, 0);
        DisponibilidadComercioService disponibilidad = new DisponibilidadComercioService(horarioRepository,
                mock(HistorialCierreComercioRepository.class)) {
            @Override
            public LocalDateTime ahora() {
                return ahora;
            }
        };
        service = new ComercioService(comercioRepository, mock(DireccionRepository.class), horarioRepository, historialRepository,
                mock(CloudinaryService.class), disponibilidad);
        ReflectionTestUtils.setField(service, "entityManager", entityManager);
        when(horarioRepository.findByComercioId(any())).thenReturn(List.of(
                Horario.builder().diaSemana(DiaSemana.LUNES).horaApertura(LocalTime.of(10, 0)).horaCierre(LocalTime.of(14, 0)).build()));
        when(historialRepository.save(any(HistorialEstadoComercio.class))).thenAnswer(invocacion -> invocacion.getArgument(0));
    }

    private static Comercio comercio(int id, EstadoComercio estado) {
        PersonaJuridica personaJuridica = PersonaJuridica.builder().razonSocial("Razon " + id).cuit("3071240300" + id % 10).build();
        return Comercio.builder()
                .id(id)
                .nombre("Comercio " + id)
                .estado(estado)
                .dueno(Dueno.builder().personaJuridica(personaJuridica).build())
                .build();
    }

    @Test
    void elCatalogoListaLosAptoVentaYLosCerradosTemporalmenteYNingunOtroEstado() {
        when(comercioRepository.findByEstadoIn(List.of(EstadoComercio.APTO_VENTA, EstadoComercio.CERRADO_TEMPORALMENTE)))
                .thenReturn(List.of(comercio(1, EstadoComercio.APTO_VENTA), comercio(2, EstadoComercio.CERRADO_TEMPORALMENTE)));

        List<ComercioPublicoResponseDTO> listado = service.listarAprobados();

        assertEquals(List.of(1, 2), listado.stream().map(ComercioPublicoResponseDTO::getId).toList());
        verify(comercioRepository).findByEstadoIn(List.of(EstadoComercio.APTO_VENTA, EstadoComercio.CERRADO_TEMPORALMENTE));
    }

    @Test
    void elEstadoDelDtoPublicoEsSiempreAptoVentaTambienParaUnCerradoTemporalmente() {
        when(comercioRepository.findByEstadoIn(any()))
                .thenReturn(List.of(comercio(1, EstadoComercio.APTO_VENTA), comercio(2, EstadoComercio.CERRADO_TEMPORALMENTE)));

        List<ComercioPublicoResponseDTO> listado = service.listarAprobados();

        assertTrue(listado.stream().allMatch(c -> c.getEstado() == EstadoComercio.APTO_VENTA));
    }

    @Test
    void elDtoPublicoDeUnCerradoTemporalmenteInformaCerradoTemporalmenteSinTextoDeReapertura() {
        when(comercioRepository.findByEstadoIn(any()))
                .thenReturn(List.of(comercio(1, EstadoComercio.APTO_VENTA), comercio(2, EstadoComercio.CERRADO_TEMPORALMENTE)));

        List<ComercioPublicoResponseDTO> listado = service.listarAprobados();

        assertEquals(EstadoApertura.ABIERTO, listado.get(0).getEstadoApertura());
        assertNull(listado.get(0).getTextoReapertura());
        assertEquals(EstadoApertura.CERRADO_TEMPORALMENTE, listado.get(1).getEstadoApertura());
        assertNull(listado.get(1).getTextoReapertura());
    }

    @Test
    void elDetalleResuelveUnCerradoTemporalmenteConLaMismaRegla() {
        when(comercioRepository.findById(2)).thenReturn(Optional.of(comercio(2, EstadoComercio.CERRADO_TEMPORALMENTE)));

        ComercioPublicoResponseDTO detalle = service.buscarAprobadoPorId(2);

        assertEquals(2, detalle.getId());
        assertEquals(EstadoComercio.APTO_VENTA, detalle.getEstado());
        assertEquals(EstadoApertura.CERRADO_TEMPORALMENTE, detalle.getEstadoApertura());
        assertNull(detalle.getTextoReapertura());
    }

    @Test
    void elDetalleDeUnAptoVentaSigueFuncionando() {
        when(comercioRepository.findById(1)).thenReturn(Optional.of(comercio(1, EstadoComercio.APTO_VENTA)));

        assertEquals(EstadoApertura.ABIERTO, service.buscarAprobadoPorId(1).getEstadoApertura());
    }

    @ParameterizedTest
    @EnumSource(value = EstadoComercio.class, names = { "PENDIENTE", "APROBADO", "RECHAZADO", "SUSPENDIDO", "INACTIVO", "RECHAZO_DEFINITIVO" })
    void elDetalleDaNoEncontradoParaCualquierOtroEstado(EstadoComercio estado) {
        when(comercioRepository.findById(3)).thenReturn(Optional.of(comercio(3, estado)));

        assertThrows(RecursoNoEncontradoException.class, () -> service.buscarAprobadoPorId(3));
    }

    @Test
    void elBloqueoPasaUnAptoVentaACerradoTemporalmenteYDejaSuFilaDeHistorial() {
        Comercio comercio = comercio(1, EstadoComercio.APTO_VENTA);

        boolean cerro = service.cerrarTemporalmentePorBloqueoDeCuenta(comercio, MOTIVO);

        assertTrue(cerro);
        assertEquals(EstadoComercio.CERRADO_TEMPORALMENTE, comercio.getEstado());
        verify(entityManager).refresh(comercio, LockModeType.PESSIMISTIC_WRITE);
        ArgumentCaptor<HistorialEstadoComercio> fila = ArgumentCaptor.forClass(HistorialEstadoComercio.class);
        verify(historialRepository).save(fila.capture());
        assertEquals(EstadoComercio.APTO_VENTA, fila.getValue().getEstadoOrigen());
        assertEquals(EstadoComercio.CERRADO_TEMPORALMENTE, fila.getValue().getEstadoDestino());
        assertNull(fila.getValue().getAdministrador());
        assertEquals(MOTIVO, fila.getValue().getMotivo());
    }

    @ParameterizedTest
    @EnumSource(value = EstadoComercio.class, names = { "APTO_VENTA", "CERRADO_TEMPORALMENTE" }, mode = EnumSource.Mode.EXCLUDE)
    void elBloqueoNoTocaNingunOtroEstadoNiEscribeHistorial(EstadoComercio estado) {
        Comercio comercio = comercio(1, estado);

        boolean cerro = service.cerrarTemporalmentePorBloqueoDeCuenta(comercio, MOTIVO);

        assertFalse(cerro);
        assertEquals(estado, comercio.getEstado());
        verify(historialRepository, never()).save(any());
        verify(comercioRepository, never()).save(any());
    }

    @Test
    void elBloqueoDecideConElEstadoRealDespuesDelBloqueoYNoConLaFotoDeLaTransaccion() {
        Comercio comercio = comercio(1, EstadoComercio.APTO_VENTA);
        doAnswer(invocacion -> {
            comercio.setEstado(EstadoComercio.APROBADO);
            return null;
        }).when(entityManager).refresh(eq(comercio), eq(LockModeType.PESSIMISTIC_WRITE));

        boolean cerro = service.cerrarTemporalmentePorBloqueoDeCuenta(comercio, MOTIVO);

        assertFalse(cerro);
        assertEquals(EstadoComercio.APROBADO, comercio.getEstado());
        verify(historialRepository, never()).save(any());
    }

    @Test
    void unAprobadoQueUnaVinculacionAcabaDePasarAAptoVentaSiSeCierra() {
        Comercio comercio = comercio(1, EstadoComercio.APROBADO);
        doAnswer(invocacion -> {
            comercio.setEstado(EstadoComercio.APTO_VENTA);
            return null;
        }).when(entityManager).refresh(eq(comercio), eq(LockModeType.PESSIMISTIC_WRITE));

        boolean cerro = service.cerrarTemporalmentePorBloqueoDeCuenta(comercio, MOTIVO);

        assertTrue(cerro);
        assertEquals(EstadoComercio.CERRADO_TEMPORALMENTE, comercio.getEstado());
        ArgumentCaptor<HistorialEstadoComercio> fila = ArgumentCaptor.forClass(HistorialEstadoComercio.class);
        verify(historialRepository).save(fila.capture());
        assertEquals(EstadoComercio.APTO_VENTA, fila.getValue().getEstadoOrigen());
    }
}
