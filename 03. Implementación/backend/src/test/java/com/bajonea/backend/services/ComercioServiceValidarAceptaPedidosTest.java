package com.bajonea.backend.services;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.bajonea.backend.entities.Comercio;
import com.bajonea.backend.entities.Horario;
import com.bajonea.backend.enums.DiaSemana;
import com.bajonea.backend.enums.EstadoComercio;
import com.bajonea.backend.exceptions.ConflictoDeNegocioException;
import com.bajonea.backend.repositories.ComercioRepository;
import com.bajonea.backend.repositories.DireccionRepository;
import com.bajonea.backend.repositories.HistorialCierreComercioRepository;
import com.bajonea.backend.repositories.HistorialEstadoComercioRepository;
import com.bajonea.backend.repositories.HorarioRepository;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;

class ComercioServiceValidarAceptaPedidosTest {

    private static final LocalDate LUNES = LocalDate.of(2026, 10, 5);
    private static final String TEXTO_NO_ACEPTA = "Este comercio no está aceptando pedidos en este momento";
    private static final String TEXTO_CIERRE_MANUAL = "Este comercio está cerrado en este momento";
    private static final String TEXTO_HORARIO = "Este comercio está cerrado en este momento. Podés hacer tu pedido dentro de su horario de atención.";

    private HorarioRepository horarioRepository;
    private LocalDateTime ahora;
    private ComercioService service;
    private Comercio comercio;

    @BeforeEach
    void preparar() {
        horarioRepository = mock(HorarioRepository.class);
        ahora = LUNES.atTime(12, 0);
        DisponibilidadComercioService disponibilidad = new DisponibilidadComercioService(horarioRepository,
                mock(HistorialCierreComercioRepository.class)) {
            @Override
            public LocalDateTime ahora() {
                return ahora;
            }
        };
        service = new ComercioService(mock(ComercioRepository.class), mock(DireccionRepository.class), horarioRepository,
                mock(HistorialEstadoComercioRepository.class), mock(CloudinaryService.class), disponibilidad);
        comercio = Comercio.builder().id(5).estado(EstadoComercio.APTO_VENTA).build();
        when(horarioRepository.findByComercioId(5)).thenReturn(List.of(
                Horario.builder().diaSemana(DiaSemana.LUNES).horaApertura(LocalTime.of(10, 0)).horaCierre(LocalTime.of(14, 0)).build()));
    }

    @Test
    void abiertoYAptoVentaAcepta() {
        assertDoesNotThrow(() -> service.validarAceptaPedidos(comercio, EstadoComercio.APTO_VENTA, false));
    }

    @Test
    void laVersionDeUnSoloArgumentoUsaElEstadoYElCierreDeLaEntidad() {
        comercio.setCerradoManualmente(true);

        ConflictoDeNegocioException ex = assertThrows(ConflictoDeNegocioException.class, () -> service.validarAceptaPedidos(comercio));

        assertEquals(TEXTO_CIERRE_MANUAL, ex.getMessage());
    }

    @Test
    void siNoEsAptoVentaGanaElTextoDeEstadoAunqueEsteCerradoYFueraDeHorario() {
        ahora = LUNES.atTime(20, 0);

        ConflictoDeNegocioException ex = assertThrows(ConflictoDeNegocioException.class,
                () -> service.validarAceptaPedidos(comercio, EstadoComercio.APROBADO, true));

        assertEquals(TEXTO_NO_ACEPTA, ex.getMessage());
        verify(horarioRepository, never()).findByComercioId(5);
    }

    @Test
    void unComercioCerradoTemporalmentePorBloqueoDaElMismoTextoQueElCierreManualAntesQueElGenerico() {
        ConflictoDeNegocioException ex = assertThrows(ConflictoDeNegocioException.class,
                () -> service.validarAceptaPedidos(comercio, EstadoComercio.CERRADO_TEMPORALMENTE, false));

        assertEquals(TEXTO_CIERRE_MANUAL, ex.getMessage());
        verify(horarioRepository, never()).findByComercioId(5);
    }

    @Test
    void elBloqueoGanaSobreElCierreManualYSobreElHorario() {
        ahora = LUNES.atTime(20, 0);

        ConflictoDeNegocioException ex = assertThrows(ConflictoDeNegocioException.class,
                () -> service.validarAceptaPedidos(comercio, EstadoComercio.CERRADO_TEMPORALMENTE, true));

        assertEquals(TEXTO_CIERRE_MANUAL, ex.getMessage());
    }

    @Test
    void laVersionDeUnSoloArgumentoUsaElEstadoCerradoTemporalmenteDeLaEntidad() {
        comercio.setEstado(EstadoComercio.CERRADO_TEMPORALMENTE);

        ConflictoDeNegocioException ex = assertThrows(ConflictoDeNegocioException.class, () -> service.validarAceptaPedidos(comercio));

        assertEquals(TEXTO_CIERRE_MANUAL, ex.getMessage());
    }

    @ParameterizedTest
    @EnumSource(value = EstadoComercio.class, names = { "PENDIENTE", "APROBADO", "RECHAZADO", "SUSPENDIDO", "INACTIVO", "RECHAZO_DEFINITIVO" })
    void losDemasEstadosSigueDandoElTextoGenerico(EstadoComercio estado) {
        ConflictoDeNegocioException ex = assertThrows(ConflictoDeNegocioException.class,
                () -> service.validarAceptaPedidos(comercio, estado, false));

        assertEquals(TEXTO_NO_ACEPTA, ex.getMessage());
    }

    @Test
    void conCierreManualYFueraDeHorarioGanaElTextoDeCierreManual() {
        ahora = LUNES.atTime(20, 0);

        ConflictoDeNegocioException ex = assertThrows(ConflictoDeNegocioException.class,
                () -> service.validarAceptaPedidos(comercio, EstadoComercio.APTO_VENTA, true));

        assertEquals(TEXTO_CIERRE_MANUAL, ex.getMessage());
    }

    @Test
    void fueraDeHorarioSinCierreManualUsaElTextoDeHorario() {
        ahora = LUNES.atTime(20, 0);

        ConflictoDeNegocioException ex = assertThrows(ConflictoDeNegocioException.class,
                () -> service.validarAceptaPedidos(comercio, EstadoComercio.APTO_VENTA, false));

        assertEquals(TEXTO_HORARIO, ex.getMessage());
    }

    @Test
    void sinHorariosCargadosSiempreEstaCerrado() {
        when(horarioRepository.findByComercioId(5)).thenReturn(List.of());

        ConflictoDeNegocioException ex = assertThrows(ConflictoDeNegocioException.class,
                () -> service.validarAceptaPedidos(comercio, EstadoComercio.APTO_VENTA, false));

        assertEquals(TEXTO_HORARIO, ex.getMessage());
    }

    @Test
    void unaFranjaHasta2359AceptaEn235930() {
        when(horarioRepository.findByComercioId(5)).thenReturn(List.of(
                Horario.builder().diaSemana(DiaSemana.LUNES).horaApertura(LocalTime.of(0, 0)).horaCierre(LocalTime.of(23, 59)).build()));
        ahora = LUNES.atTime(23, 59, 30);

        assertDoesNotThrow(() -> service.validarAceptaPedidos(comercio, EstadoComercio.APTO_VENTA, false));
    }
}
