package com.bajonea.backend.services;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.bajonea.backend.enums.EstadoUsuario;
import com.bajonea.backend.repositories.ComercioRepository;
import com.bajonea.backend.repositories.DireccionRepository;
import com.bajonea.backend.repositories.HistorialCierreComercioRepository;
import com.bajonea.backend.repositories.HistorialEstadoComercioRepository;
import com.bajonea.backend.repositories.HorarioRepository;
import com.bajonea.backend.repositories.UsuarioRepository;
import java.time.Clock;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;

/**
 * Lectura del bloqueo de la cuenta del Dueño con bloqueo compartido. Las transiciones que dependen de ese dato
 * (aprobar, vincular, restaurar, cerrar por bloqueo) viven en {@code AptitudVentaComercioService}; las prueba
 * {@code AptitudVentaComercioServiceTest} y las cubre con el motor real {@code BloqueoVigenteIntegrationTest}.
 */
class ComercioServiceBloqueoVigenteTest {

    private UsuarioRepository usuarioRepository;
    private ComercioService service;

    @BeforeEach
    void preparar() {
        usuarioRepository = mock(UsuarioRepository.class);
        service = new ComercioService(mock(ComercioRepository.class), mock(DireccionRepository.class), mock(HorarioRepository.class),
                mock(HistorialEstadoComercioRepository.class), mock(CloudinaryService.class),
                new DisponibilidadComercioService(mock(HorarioRepository.class), mock(HistorialCierreComercioRepository.class),
                        Clock.systemDefaultZone()),
                usuarioRepository, mock(HistorialEdicionComercioService.class), mock(NombreComercioService.class));
    }

    @ParameterizedTest
    @EnumSource(EstadoUsuario.class)
    void soloLaCuentaBloqueadaCuentaComoBloqueada(EstadoUsuario estado) {
        when(usuarioRepository.leerEstadoConBloqueoCompartido(7)).thenReturn(Optional.of(estado.name()));

        assertEquals(estado == EstadoUsuario.BLOQUEADO, service.duenoBloqueadoConBloqueo(7));
    }

    @Test
    void sinFilaDeUsuarioNoHayBloqueo() {
        when(usuarioRepository.leerEstadoConBloqueoCompartido(7)).thenReturn(Optional.empty());

        assertFalse(service.duenoBloqueadoConBloqueo(7));
        when(usuarioRepository.leerEstadoConBloqueoCompartido(8)).thenReturn(Optional.of("BLOQUEADO"));
        assertTrue(service.duenoBloqueadoConBloqueo(8));
    }
}
