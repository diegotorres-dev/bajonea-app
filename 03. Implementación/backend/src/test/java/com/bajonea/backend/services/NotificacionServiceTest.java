package com.bajonea.backend.services;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
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
import com.bajonea.backend.enums.EstadoComercio;
import com.bajonea.backend.enums.RolUsuario;
import com.bajonea.backend.enums.TipoEntidadNotificacion;
import com.bajonea.backend.enums.TipoNotificacion;
import com.bajonea.backend.exceptions.ComercioNoDisponibleException;
import com.bajonea.backend.exceptions.RecursoNoEncontradoException;
import com.bajonea.backend.exceptions.ValidacionException;
import com.bajonea.backend.repositories.ComercioRepository;
import com.bajonea.backend.repositories.EmpleadoComercioRepository;
import com.bajonea.backend.repositories.NotificacionRepository;
import com.bajonea.backend.repositories.UsuarioRepository;
import java.time.Clock;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

class NotificacionServiceTest {

    private static final int USUARIO_ID = 7;
    private static final int COMERCIO_ID = 30;

    private NotificacionRepository notificacionRepository;
    private ComercioRepository comercioRepository;
    private EmpleadoComercioRepository empleadoComercioRepository;
    private NotificacionService service;

    private final AuthenticatedUser dueno = new AuthenticatedUser(USUARIO_ID, 1, RolUsuario.DUENO);
    private final AuthenticatedUser cliente = new AuthenticatedUser(USUARIO_ID, 1, RolUsuario.CLIENTE);
    private final AuthenticatedUser admin = new AuthenticatedUser(USUARIO_ID, 1, RolUsuario.ADMINISTRADOR);

    @BeforeEach
    void preparar() {
        notificacionRepository = mock(NotificacionRepository.class);
        comercioRepository = mock(ComercioRepository.class);
        empleadoComercioRepository = mock(EmpleadoComercioRepository.class);
        UsuarioRepository usuarioRepository = mock(UsuarioRepository.class);
        when(usuarioRepository.getReferenceById(anyInt())).thenAnswer(invocacion -> Usuario.builder().id(invocacion.getArgument(0)).build());
        service = new NotificacionService(notificacionRepository, usuarioRepository, comercioRepository, empleadoComercioRepository,
                new ComercioActivoService(comercioRepository, empleadoComercioRepository), Clock.systemDefaultZone());
    }

    private static Notificacion notificacion(int id, Integer comercioId) {
        return Notificacion.builder()
                .id(id)
                .usuario(Usuario.builder().id(USUARIO_ID).build())
                .mensaje("Mensaje " + id)
                .fechaCreacion(LocalDateTime.now())
                .entidadTipo(TipoEntidadNotificacion.COMERCIO)
                .entidadId(COMERCIO_ID)
                .comercioId(comercioId)
                .build();
    }

    private void comercioDelDueno() {
        when(comercioRepository.findByIdAndDuenoId(COMERCIO_ID, USUARIO_ID))
                .thenReturn(Optional.of(Comercio.builder().id(COMERCIO_ID).build()));
    }

    private void empleadoActivo() {
        Comercio comercio = Comercio.builder().id(COMERCIO_ID).estado(EstadoComercio.APTO_VENTA)
                .dueno(com.bajonea.backend.entities.Dueno.builder().id(99).build()).build();
        when(empleadoComercioRepository.findComercioAccesible(anyInt(), anyInt(), any(), any())).thenReturn(Optional.of(comercio));
    }

    @Test
    void elDuenoListaSoloLasDelComercioDelHeader() {
        comercioDelDueno();
        when(notificacionRepository.findByUsuarioIdAndComercioId(USUARIO_ID, COMERCIO_ID))
                .thenReturn(List.of(notificacion(1, COMERCIO_ID), notificacion(2, COMERCIO_ID)));

        List<NotificacionResponseDTO> resultado = service.listar(dueno, String.valueOf(COMERCIO_ID));

        assertEquals(List.of(1, 2), resultado.stream().map(NotificacionResponseDTO::getId).toList());
        verify(notificacionRepository, never()).findPersonalesPushByUsuarioId(anyInt());
    }

    @Test
    void elClienteSinHeaderListaSoloLasPersonales() {
        when(notificacionRepository.findPersonalesPushByUsuarioId(USUARIO_ID)).thenReturn(List.of(notificacion(1, null)));

        assertEquals(1, service.listar(cliente, null).size());
        assertEquals(1, service.listar(cliente, "").size());
        assertEquals(1, service.listar(cliente, "  ").size());
        verify(notificacionRepository, never()).findByUsuarioIdAndComercioId(anyInt(), anyInt());
        verifyNoInteractions(comercioRepository);
    }

    @Test
    void elClienteConHeaderNoNumericoRecibe400() {
        assertThrows(ValidacionException.class, () -> service.listar(cliente, "abc"));
        assertThrows(ValidacionException.class, () -> service.contarNoLeidas(cliente, "abc"));
        verify(notificacionRepository, never()).findPersonalesPushByUsuarioId(anyInt());
    }

    @Test
    void elClienteConHeaderDeUnComercioDondeNoEsEmpleadoActivoRecibeElMismo404EnListarYContador() {
        assertThrows(ComercioNoDisponibleException.class, () -> service.listar(cliente, String.valueOf(COMERCIO_ID)));
        assertThrows(ComercioNoDisponibleException.class, () -> service.contarNoLeidas(cliente, String.valueOf(COMERCIO_ID)));
        verify(notificacionRepository, never()).findPersonalesPushByUsuarioId(anyInt());
        verify(notificacionRepository, never()).findByUsuarioIdAndComercioId(anyInt(), anyInt());
    }

    @Test
    void elEmpleadoActivoConHeaderDeSuComercioListaYCuentaLasNotificacionesDeEseComercio() {
        empleadoActivo();
        when(notificacionRepository.findByUsuarioIdAndComercioId(USUARIO_ID, COMERCIO_ID)).thenReturn(List.of(notificacion(4, COMERCIO_ID)));
        when(notificacionRepository.countNoLeidasByUsuarioIdAndComercioId(USUARIO_ID, COMERCIO_ID)).thenReturn(1L);

        assertEquals(List.of(4), service.listar(cliente, String.valueOf(COMERCIO_ID)).stream().map(NotificacionResponseDTO::getId).toList());
        assertEquals(1, service.contarNoLeidas(cliente, String.valueOf(COMERCIO_ID)));
        verify(notificacionRepository, never()).findPersonalesPushByUsuarioId(anyInt());
    }

    @Test
    void otrosRolesTampocoUsanElHeader() {
        when(notificacionRepository.findPersonalesPushByUsuarioId(USUARIO_ID)).thenReturn(List.of());
        when(notificacionRepository.countPersonalesPushNoLeidasByUsuarioId(USUARIO_ID)).thenReturn(3L);

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
    void elContadorDelDuenoEsElDelComercioYElDelClienteEsElDeLasPersonales() {
        comercioDelDueno();
        when(notificacionRepository.countNoLeidasByUsuarioIdAndComercioId(USUARIO_ID, COMERCIO_ID)).thenReturn(2L);
        when(notificacionRepository.countPersonalesPushNoLeidasByUsuarioId(USUARIO_ID)).thenReturn(9L);

        assertEquals(2, service.contarNoLeidas(dueno, String.valueOf(COMERCIO_ID)));
        assertEquals(9, service.contarNoLeidas(cliente, null));
    }

    @Test
    void marcarLeidasDelComercioDevuelveCuantasCambiaronYEsIdempotente() {
        comercioDelDueno();
        when(notificacionRepository.findIdsNoLeidasByUsuarioIdAndComercioId(USUARIO_ID, COMERCIO_ID)).thenReturn(List.of(1, 2, 3), List.of());
        when(notificacionRepository.marcarLeidasPorIds(List.of(1, 2, 3))).thenReturn(3);

        assertEquals(3, service.marcarLeidasDelComercio(USUARIO_ID, COMERCIO_ID));
        assertEquals(0, service.marcarLeidasDelComercio(USUARIO_ID, COMERCIO_ID));
    }

    @Test
    void marcarLeidasDeUnComercioAjenoDa404YNoTocaNada() {
        when(comercioRepository.findByIdAndDuenoId(99, USUARIO_ID)).thenReturn(Optional.empty());

        assertThrows(RecursoNoEncontradoException.class, () -> service.marcarLeidasDelComercio(USUARIO_ID, 99));
        verify(notificacionRepository, never()).marcarLeidasPorIds(any());
    }

    @Test
    void marcarLeidasNoExigeQueElComercioEsteOperativo() {
        comercioDelDueno();
        when(notificacionRepository.findIdsNoLeidasByUsuarioIdAndComercioId(USUARIO_ID, COMERCIO_ID)).thenReturn(List.of(8));
        when(notificacionRepository.marcarLeidasPorIds(List.of(8))).thenReturn(1);

        assertEquals(1, service.marcarLeidasDelComercio(USUARIO_ID, COMERCIO_ID));
    }

    @Test
    void marcarTodasDelComercioActivoUsaElHeaderYSirveAlEmpleado() {
        empleadoActivo();
        when(notificacionRepository.findIdsNoLeidasByUsuarioIdAndComercioId(USUARIO_ID, COMERCIO_ID)).thenReturn(List.of(4, 5));
        when(notificacionRepository.marcarLeidasPorIds(List.of(4, 5))).thenReturn(2);

        assertEquals(2, service.marcarLeidasDelComercioActivo(cliente, String.valueOf(COMERCIO_ID)));
        assertThrows(ValidacionException.class, () -> service.marcarLeidasDelComercioActivo(cliente, null));
        assertThrows(ValidacionException.class, () -> service.marcarLeidasDelComercioActivo(dueno, " "));
        assertThrows(ComercioNoDisponibleException.class, () -> service.marcarLeidasDelComercioActivo(admin, "30"));
    }

    @Test
    void marcarTodasEnLotesNoSuperaElTamanoDelLote() {
        comercioDelDueno();
        List<Integer> ids = new java.util.ArrayList<>();
        for (int i = 1; i <= 1200; i++) {
            ids.add(i);
        }
        when(notificacionRepository.findIdsNoLeidasByUsuarioIdAndComercioId(USUARIO_ID, COMERCIO_ID)).thenReturn(ids);
        when(notificacionRepository.marcarLeidasPorIds(any())).thenAnswer(invocacion -> ((java.util.Collection<?>) invocacion.getArgument(0)).size());

        assertEquals(1200, service.marcarLeidasDelComercio(USUARIO_ID, COMERCIO_ID));
        verify(notificacionRepository, org.mockito.Mockito.times(3)).marcarLeidasPorIds(any());
    }

    @Test
    void marcarLeidaDeUnAvisoDeComercioExigeSerDuenoOEmpleadoActivo() {
        Notificacion deComercio = notificacion(10, COMERCIO_ID);
        when(notificacionRepository.findById(10)).thenReturn(Optional.of(deComercio));

        assertThrows(RecursoNoEncontradoException.class, () -> service.marcarLeida(USUARIO_ID, 10));
        assertFalse(deComercio.isLeida());

        empleadoActivo();
        assertEquals(10, service.marcarLeida(USUARIO_ID, 10).getId());
        assertTrue(deComercio.isLeida());
    }

    @Test
    void marcarLeidaDeUnAvisoDeComercioLaPuedeElDuenoDelComercio() {
        Notificacion deComercio = notificacion(11, COMERCIO_ID);
        when(notificacionRepository.findById(11)).thenReturn(Optional.of(deComercio));
        comercioDelDueno();

        assertEquals(11, service.marcarLeida(USUARIO_ID, 11).getId());
        assertTrue(deComercio.isLeida());
    }

    @Test
    void marcarLeidaDeUnAvisoPersonalNoConsultaElComercio() {
        Notificacion personal = notificacion(12, null);
        when(notificacionRepository.findById(12)).thenReturn(Optional.of(personal));

        assertEquals(12, service.marcarLeida(USUARIO_ID, 12).getId());
        assertTrue(personal.isLeida());
        verifyNoInteractions(comercioRepository);
        verifyNoInteractions(empleadoComercioRepository);
    }

    @Test
    void marcarLeidaDeLaNotificacionDeOtroUsuarioDa404() {
        when(notificacionRepository.findById(13)).thenReturn(Optional.of(notificacion(13, null)));

        assertThrows(RecursoNoEncontradoException.class, () -> service.marcarLeida(USUARIO_ID + 1, 13));
    }

    @SuppressWarnings("unchecked")
    @Test
    void crearParaEquipoEmiteUnaCopiaPorDestinatarioEnIdAscendenteSinRepetirAlDueno() {
        service.crearParaEquipo(COMERCIO_ID, 50, List.of(80, 20, 50), "Nuevo pedido", TipoNotificacion.NUEVO_PEDIDO,
                TipoEntidadNotificacion.PEDIDO, 900);

        ArgumentCaptor<List<Notificacion>> copias = ArgumentCaptor.forClass(List.class);
        verify(notificacionRepository).saveAll(copias.capture());
        assertEquals(List.of(20, 50, 80), copias.getValue().stream().map(copia -> copia.getUsuario().getId()).toList());
        for (Notificacion copia : copias.getValue()) {
            assertEquals(COMERCIO_ID, copia.getComercioId());
            assertEquals(900, copia.getEntidadId());
            assertFalse(copia.isLeida());
        }
    }

    @Test
    void cadaCaminoDeCreacionRechazaLosTiposQueNoLeCorresponden() {
        assertThrows(IllegalArgumentException.class,
                () -> service.crearParaCliente(USUARIO_ID, "x", TipoNotificacion.NUEVO_PEDIDO));
        assertThrows(IllegalArgumentException.class,
                () -> service.crearParaCliente(USUARIO_ID, "x", TipoNotificacion.COMERCIO_APROBADO));
        assertThrows(IllegalArgumentException.class, () -> service.crearParaDueno(USUARIO_ID, COMERCIO_ID, "x",
                TipoNotificacion.PEDIDO_ACEPTADO, TipoEntidadNotificacion.PEDIDO, 1));
        assertThrows(IllegalArgumentException.class, () -> service.crearParaDueno(USUARIO_ID, COMERCIO_ID, "x",
                TipoNotificacion.NUEVO_PEDIDO, TipoEntidadNotificacion.PEDIDO, 1));
        assertThrows(IllegalArgumentException.class, () -> service.crearParaEquipo(COMERCIO_ID, USUARIO_ID, List.of(), "x",
                TipoNotificacion.COMERCIO_SUSPENDIDO, TipoEntidadNotificacion.COMERCIO, COMERCIO_ID));
        verify(notificacionRepository, never()).save(any());
        verify(notificacionRepository, never()).saveAll(any());
    }

    @Test
    void crearParaClienteNoLlevaComercioYCrearParaDuenoSi() {
        service.crearParaCliente(USUARIO_ID, "Tu pedido", TipoNotificacion.PEDIDO_ACEPTADO, TipoEntidadNotificacion.PEDIDO, 5);
        service.crearParaDueno(USUARIO_ID, COMERCIO_ID, "Aprobado", TipoNotificacion.COMERCIO_APROBADO, TipoEntidadNotificacion.COMERCIO,
                COMERCIO_ID);

        ArgumentCaptor<Notificacion> guardadas = ArgumentCaptor.forClass(Notificacion.class);
        verify(notificacionRepository, org.mockito.Mockito.times(2)).save(guardadas.capture());
        assertNull(guardadas.getAllValues().get(0).getComercioId());
        assertEquals(COMERCIO_ID, guardadas.getAllValues().get(1).getComercioId());
    }

    @Test
    void purgarBorraPorClavePrimariaSoloLoDelComercio() {
        when(notificacionRepository.findIdsByUsuarioIdAndComercioId(USUARIO_ID, COMERCIO_ID)).thenReturn(List.of(3, 9));

        assertEquals(2, service.purgarAvisosDelComercio(USUARIO_ID, COMERCIO_ID));
        verify(notificacionRepository).deleteAllByIdInBatch(List.of(3, 9));

        when(notificacionRepository.findIdsByUsuarioIdAndComercioId(USUARIO_ID, 31)).thenReturn(List.of());
        assertEquals(0, service.purgarAvisosDelComercio(USUARIO_ID, 31));
        verify(notificacionRepository, never()).deleteAllByIdInBatch(List.of());
    }
}
