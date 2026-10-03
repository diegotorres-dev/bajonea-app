package com.bajonea.backend.services;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.bajonea.backend.dto.response.MiComercioResponseDTO;
import com.bajonea.backend.entities.Comercio;
import com.bajonea.backend.enums.EstadoComercio;
import com.bajonea.backend.repositories.ComercioRepository;
import com.bajonea.backend.repositories.NotificacionRepository;
import com.bajonea.backend.repositories.NotificacionRepository.ContadorNoLeidasPorComercio;
import java.time.LocalDateTime;
import java.util.Arrays;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;

class MisComerciosServiceTest {

    private static final int DUENO_ID = 7;

    private ComercioRepository comercioRepository;
    private NotificacionRepository notificacionRepository;
    private MisComerciosService service;

    @BeforeEach
    void preparar() {
        comercioRepository = mock(ComercioRepository.class);
        notificacionRepository = mock(NotificacionRepository.class);
        service = new MisComerciosService(comercioRepository, notificacionRepository);
    }

    private static Comercio comercio(int id, String nombre, EstadoComercio estado, LocalDateTime fechaRegistro) {
        return Comercio.builder()
                .id(id)
                .nombre(nombre)
                .fotoPerfilUrl("https://res.cloudinary.com/x/image/upload/v1/" + id + ".png")
                .estado(estado)
                .fechaRegistro(fechaRegistro)
                .build();
    }

    private static ContadorNoLeidasPorComercio contador(int comercioId, long cantidad) {
        return new ContadorNoLeidasPorComercio() {
            @Override
            public Integer getComercioId() {
                return comercioId;
            }

            @Override
            public Long getCantidad() {
                return cantidad;
            }
        };
    }

    @Test
    void devuelveTodosLosComerciosEnElOrdenDelRepositorioSinFiltrarPorEstado() {
        LocalDateTime base = LocalDateTime.of(2026, 9, 1, 10, 0);
        List<Comercio> comercios = Arrays.stream(EstadoComercio.values())
                .map(estado -> comercio(10 + estado.ordinal(), "Comercio " + estado, estado, base.plusDays(estado.ordinal())))
                .toList();
        when(comercioRepository.findByDuenoIdOrderByFechaRegistroAscIdAsc(DUENO_ID)).thenReturn(comercios);
        when(notificacionRepository.contarNoLeidasPorComercio(DUENO_ID)).thenReturn(List.of());

        List<MiComercioResponseDTO> resultado = service.listar(DUENO_ID);

        assertEquals(comercios.size(), resultado.size());
        for (int i = 0; i < comercios.size(); i++) {
            assertEquals(comercios.get(i).getId(), resultado.get(i).getId());
            assertEquals(comercios.get(i).getEstado(), resultado.get(i).getEstado());
            assertEquals(comercios.get(i).getNombre(), resultado.get(i).getNombre());
            assertEquals(comercios.get(i).getFotoPerfilUrl(), resultado.get(i).getFotoPerfilUrl());
            assertEquals(comercios.get(i).getFechaRegistro(), resultado.get(i).getFechaRegistro());
        }
    }

    @ParameterizedTest
    @EnumSource(EstadoComercio.class)
    void soloAprobadoYAptoVentaSonOperativos(EstadoComercio estado) {
        when(comercioRepository.findByDuenoIdOrderByFechaRegistroAscIdAsc(DUENO_ID))
                .thenReturn(List.of(comercio(1, "Uno", estado, LocalDateTime.now())));
        when(notificacionRepository.contarNoLeidasPorComercio(DUENO_ID)).thenReturn(List.of());

        boolean operativo = service.listar(DUENO_ID).get(0).isOperativo();

        boolean esperado = estado == EstadoComercio.APROBADO || estado == EstadoComercio.APTO_VENTA;
        assertEquals(esperado, operativo, "operativo para " + estado);
    }

    @Test
    void elContadorSaleDeLaConsultaAgrupadaYLosComerciosSinNotificacionesTienenCero() {
        LocalDateTime ahora = LocalDateTime.now();
        when(comercioRepository.findByDuenoIdOrderByFechaRegistroAscIdAsc(DUENO_ID)).thenReturn(List.of(
                comercio(1, "A", EstadoComercio.APROBADO, ahora),
                comercio(2, "B", EstadoComercio.PENDIENTE, ahora),
                comercio(3, "C", EstadoComercio.RECHAZADO, ahora)));
        when(notificacionRepository.contarNoLeidasPorComercio(DUENO_ID)).thenReturn(List.of(contador(1, 4), contador(3, 1)));

        List<MiComercioResponseDTO> resultado = service.listar(DUENO_ID);

        assertEquals(4, resultado.get(0).getCantidadNotificacionesNoLeidas());
        assertEquals(0, resultado.get(1).getCantidadNotificacionesNoLeidas());
        assertEquals(1, resultado.get(2).getCantidadNotificacionesNoLeidas());
    }

    @Test
    void ignoraUnContadorDeUnComercioQueNoEstaEnElListado() {
        when(comercioRepository.findByDuenoIdOrderByFechaRegistroAscIdAsc(DUENO_ID))
                .thenReturn(List.of(comercio(1, "A", EstadoComercio.APROBADO, LocalDateTime.now())));
        when(notificacionRepository.contarNoLeidasPorComercio(DUENO_ID)).thenReturn(List.of(contador(99, 5)));

        List<MiComercioResponseDTO> resultado = service.listar(DUENO_ID);

        assertEquals(1, resultado.size());
        assertEquals(0, resultado.get(0).getCantidadNotificacionesNoLeidas());
    }

    @Test
    void unDuenoSinComerciosDevuelveListaVacia() {
        when(comercioRepository.findByDuenoIdOrderByFechaRegistroAscIdAsc(DUENO_ID)).thenReturn(List.of());
        when(notificacionRepository.contarNoLeidasPorComercio(DUENO_ID)).thenReturn(List.of());

        assertTrue(service.listar(DUENO_ID).isEmpty());
    }

    @Test
    void esOperativoCoincideConLaReglaDelServicioDeComercioActivo() {
        assertTrue(ComercioActivoService.esOperativo(EstadoComercio.APROBADO));
        assertTrue(ComercioActivoService.esOperativo(EstadoComercio.APTO_VENTA));
        assertFalse(ComercioActivoService.esOperativo(EstadoComercio.PENDIENTE));
    }
}
