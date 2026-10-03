package com.bajonea.backend.services;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.bajonea.backend.config.security.AuthenticatedUser;
import com.bajonea.backend.dto.response.NotificacionResponseDTO;
import com.bajonea.backend.entities.Comercio;
import com.bajonea.backend.entities.Notificacion;
import com.bajonea.backend.entities.Usuario;
import com.bajonea.backend.enums.RolUsuario;
import com.bajonea.backend.enums.TipoEntidadNotificacion;
import com.bajonea.backend.exceptions.RecursoNoEncontradoException;
import com.bajonea.backend.exceptions.ValidacionException;
import com.bajonea.backend.repositories.ComercioRepository;
import com.bajonea.backend.repositories.NotificacionRepository;
import com.bajonea.backend.repositories.UsuarioRepository;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class NotificacionServiceTest {

    private static final int USUARIO_ID = 7;
    private static final int COMERCIO_ID = 30;

    private NotificacionRepository notificacionRepository;
    private ComercioRepository comercioRepository;
    private NotificacionService service;

    private final AuthenticatedUser dueno = new AuthenticatedUser(USUARIO_ID, 1, RolUsuario.DUENO);
    private final AuthenticatedUser cliente = new AuthenticatedUser(USUARIO_ID, 1, RolUsuario.CLIENTE);
    private final AuthenticatedUser admin = new AuthenticatedUser(USUARIO_ID, 1, RolUsuario.ADMINISTRADOR);

    @BeforeEach
    void preparar() {
        notificacionRepository = mock(NotificacionRepository.class);
        comercioRepository = mock(ComercioRepository.class);
        service = new NotificacionService(notificacionRepository, mock(UsuarioRepository.class), comercioRepository,
                new ComercioActivoService(comercioRepository));
    }

    private static Notificacion notificacion(int id) {
        return Notificacion.builder()
                .id(id)
                .usuario(Usuario.builder().id(USUARIO_ID).build())
                .mensaje("Mensaje " + id)
                .fechaCreacion(LocalDateTime.now())
                .entidadTipo(TipoEntidadNotificacion.COMERCIO)
                .entidadId(COMERCIO_ID)
                .build();
    }

    private void comercioDelDueno() {
        when(comercioRepository.findByIdAndDuenoId(COMERCIO_ID, USUARIO_ID))
                .thenReturn(Optional.of(Comercio.builder().id(COMERCIO_ID).build()));
    }

    @Test
    void elDuenoListaSoloLasDelComercioDelHeader() {
        comercioDelDueno();
        when(notificacionRepository.findByUsuarioIdAndComercioId(USUARIO_ID, COMERCIO_ID)).thenReturn(List.of(notificacion(1), notificacion(2)));

        List<NotificacionResponseDTO> resultado = service.listar(dueno, String.valueOf(COMERCIO_ID));

        assertEquals(List.of(1, 2), resultado.stream().map(NotificacionResponseDTO::getId).toList());
        verify(notificacionRepository, never()).findByUsuarioIdOrderByFechaCreacionDesc(anyInt());
    }

    @Test
    void elClienteListaTodasEIgnoraElHeaderAunqueSeaInvalido() {
        when(notificacionRepository.findByUsuarioIdOrderByFechaCreacionDesc(USUARIO_ID)).thenReturn(List.of(notificacion(1)));

        List<NotificacionResponseDTO> resultado = service.listar(cliente, "abc");

        assertEquals(1, resultado.size());
        verify(notificacionRepository, never()).findByUsuarioIdAndComercioId(anyInt(), anyInt());
        verifyNoInteractions(comercioRepository);
    }

    @Test
    void otrosRolesTampocoUsanElHeader() {
        when(notificacionRepository.findByUsuarioIdOrderByFechaCreacionDesc(USUARIO_ID)).thenReturn(List.of());
        when(notificacionRepository.countByUsuarioIdAndLeidaFalse(USUARIO_ID)).thenReturn(3L);

        assertTrue(service.listar(admin, "99999").isEmpty());
        assertEquals(3, service.contarNoLeidas(admin, "abc"));
        verifyNoInteractions(comercioRepository);
    }

    @Test
    void elDuenoConUnComercioAjenoRecibe404EnListarYContador() {
        when(comercioRepository.findByIdAndDuenoId(99, USUARIO_ID)).thenReturn(Optional.empty());

        assertThrows(RecursoNoEncontradoException.class, () -> service.listar(dueno, "99"));
        assertThrows(RecursoNoEncontradoException.class, () -> service.contarNoLeidas(dueno, "99"));
    }

    @Test
    void elDuenoConUnHeaderNoNumericoRecibe400() {
        assertThrows(ValidacionException.class, () -> service.listar(dueno, "abc"));
        assertThrows(ValidacionException.class, () -> service.contarNoLeidas(dueno, "12.5"));
    }

    @Test
    void elContadorDelDuenoEsElDelComercioYElDelClienteEsElTotal() {
        comercioDelDueno();
        when(notificacionRepository.countNoLeidasByUsuarioIdAndComercioId(USUARIO_ID, COMERCIO_ID)).thenReturn(2L);
        when(notificacionRepository.countByUsuarioIdAndLeidaFalse(USUARIO_ID)).thenReturn(9L);

        assertEquals(2, service.contarNoLeidas(dueno, String.valueOf(COMERCIO_ID)));
        assertEquals(9, service.contarNoLeidas(cliente, String.valueOf(COMERCIO_ID)));
    }

    @Test
    void marcarLeidasDelComercioDevuelveCuantasCambiaronYEsIdempotente() {
        comercioDelDueno();
        when(notificacionRepository.marcarLeidasByUsuarioIdAndComercioId(USUARIO_ID, COMERCIO_ID)).thenReturn(3, 0);

        assertEquals(3, service.marcarLeidasDelComercio(USUARIO_ID, COMERCIO_ID));
        assertEquals(0, service.marcarLeidasDelComercio(USUARIO_ID, COMERCIO_ID));
    }

    @Test
    void marcarLeidasDeUnComercioAjenoDa404YNoTocaNada() {
        when(comercioRepository.findByIdAndDuenoId(99, USUARIO_ID)).thenReturn(Optional.empty());

        assertThrows(RecursoNoEncontradoException.class, () -> service.marcarLeidasDelComercio(USUARIO_ID, 99));
        verify(notificacionRepository, never()).marcarLeidasByUsuarioIdAndComercioId(any(), any());
    }

    @Test
    void marcarLeidasNoExigeQueElComercioEsteOperativo() {
        comercioDelDueno();
        when(notificacionRepository.marcarLeidasByUsuarioIdAndComercioId(USUARIO_ID, COMERCIO_ID)).thenReturn(1);

        assertEquals(1, service.marcarLeidasDelComercio(USUARIO_ID, COMERCIO_ID));
    }
}
