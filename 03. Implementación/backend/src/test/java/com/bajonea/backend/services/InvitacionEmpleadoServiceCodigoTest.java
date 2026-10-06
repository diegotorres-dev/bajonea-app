package com.bajonea.backend.services;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.bajonea.backend.config.security.ComercioActivo;
import com.bajonea.backend.dto.response.InvitacionEmpleadoResponseDTO;
import com.bajonea.backend.entities.Comercio;
import com.bajonea.backend.entities.Dueno;
import com.bajonea.backend.entities.InvitacionEmpleado;
import com.bajonea.backend.entities.PersonaFisica;
import com.bajonea.backend.entities.Usuario;
import com.bajonea.backend.enums.EstadoInvitacionEmpleado;
import com.bajonea.backend.exceptions.ConflictoDeNegocioException;
import com.bajonea.backend.exceptions.GeneracionTokenException;
import com.bajonea.backend.repositories.ComercioRepository;
import com.bajonea.backend.repositories.ComercioRepository.EstadoYCierreComercio;
import com.bajonea.backend.repositories.DuenoRepository;
import com.bajonea.backend.repositories.EmpleadoComercioRepository;
import com.bajonea.backend.repositories.EmpleadoInsercionRepository;
import com.bajonea.backend.repositories.HistorialEmpleadoComercioRepository;
import com.bajonea.backend.repositories.InvitacionEmpleadoRepository;
import com.bajonea.backend.repositories.InvitacionInsercionRepository;
import com.bajonea.backend.repositories.PersonaFisicaRepository;
import com.bajonea.backend.repositories.UsuarioRepository;
import java.time.Clock;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DuplicateKeyException;

/**
 * Los caminos de generación e inserción del código de la invitación que una prueba contra la base no puede
 * provocar a voluntad: código ya en uso, choque en el INSERT por el índice del código (se reintenta), choque
 * por el índice del par comercio y email (es "ya hay una pendiente", no se reintenta) y agotamiento de reintentos.
 */
class InvitacionEmpleadoServiceCodigoTest {

    private static final int COMERCIO_ID = 30;
    private static final int DUENO_ID = 7;
    private static final String EMAIL = "nuevo@bajonea.test";
    private static final ZoneId ZONA = ZoneId.of("America/Argentina/Ushuaia");
    private static final LocalDateTime AHORA = LocalDateTime.of(2026, 10, 6, 12, 0, 0);

    private InvitacionEmpleadoRepository invitacionRepository;
    private InvitacionInsercionRepository insercionRepository;
    private CodigoTokenGenerador generador;
    private InvitacionEmpleadoService service;

    @BeforeEach
    void preparar() {
        invitacionRepository = mock(InvitacionEmpleadoRepository.class);
        insercionRepository = mock(InvitacionInsercionRepository.class);
        generador = mock(CodigoTokenGenerador.class);
        UsuarioRepository usuarioRepository = mock(UsuarioRepository.class);
        ComercioRepository comercioRepository = mock(ComercioRepository.class);
        DuenoRepository duenoRepository = mock(DuenoRepository.class);

        when(usuarioRepository.findByIdConBloqueo(DUENO_ID)).thenReturn(Optional.of(Usuario.builder().id(DUENO_ID).build()));
        when(usuarioRepository.findByEmail(EMAIL)).thenReturn(Optional.empty());
        EstadoYCierreComercio estado = mock(EstadoYCierreComercio.class);
        when(estado.getEstado()).thenReturn("APROBADO");
        when(comercioRepository.leerEstadoConBloqueoCompartido(COMERCIO_ID)).thenReturn(Optional.of(estado));
        when(comercioRepository.findById(COMERCIO_ID))
                .thenReturn(Optional.of(Comercio.builder().id(COMERCIO_ID).nombre("Café Sur").build()));
        when(duenoRepository.findById(DUENO_ID)).thenReturn(Optional.of(Dueno.builder()
                .personaFisica(PersonaFisica.builder().nombre("Ana").apellido("Pérez").build()).build()));
        when(invitacionRepository.findByComercioIdAndEmailAndEstadoConBloqueo(COMERCIO_ID, EMAIL, EstadoInvitacionEmpleado.PENDIENTE))
                .thenReturn(List.of());
        when(invitacionRepository.countByComercioIdAndFechaCreacionAfter(eq(COMERCIO_ID), any())).thenReturn(0L);
        when(invitacionRepository.findById(anyInt())).thenAnswer(invocacion -> Optional.of(InvitacionEmpleado.builder()
                .id(invocacion.getArgument(0)).email(EMAIL).codigo("999999").estado(EstadoInvitacionEmpleado.PENDIENTE)
                .fechaCreacion(AHORA).fechaVencimiento(AHORA.plusDays(7)).build()));

        Clock reloj = Clock.fixed(AHORA.atZone(ZONA).toInstant(), ZONA);
        service = new InvitacionEmpleadoService(invitacionRepository, insercionRepository, mock(HistorialEmpleadoComercioRepository.class),
                mock(EmpleadoComercioRepository.class), usuarioRepository, comercioRepository, duenoRepository,
                mock(PersonaFisicaRepository.class), mock(EmpleadoInsercionRepository.class), mock(RegistroService.class),
                mock(NotificacionService.class), mock(MatrizRolesService.class), mock(InvitacionRegularizacionService.class), generador, mock(EmailService.class), reloj, 3);
    }

    private InvitacionEmpleadoResponseDTO invitar() {
        return service.invitar(new ComercioActivo(COMERCIO_ID, DUENO_ID), EMAIL);
    }

    @Test
    void siElCodigoYaEstaEnUsoPorOtraPendienteDelEmailGeneraOtro() {
        when(generador.generar()).thenReturn("111111", "222222");
        when(insercionRepository.existeCodigoPendiente(EMAIL, "111111")).thenReturn(true);
        when(insercionRepository.existeCodigoPendiente(EMAIL, "222222")).thenReturn(false);
        when(insercionRepository.insertarPendiente(eq(COMERCIO_ID), eq(EMAIL), eq("222222"), eq(DUENO_ID), any(), any())).thenReturn(55);

        InvitacionEmpleadoResponseDTO respuesta = invitar();

        assertEquals(55, respuesta.getId());
        verify(generador, times(2)).generar();
        verify(insercionRepository, never()).insertarPendiente(anyInt(), anyString(), eq("111111"), anyInt(), any(), any());
    }

    @Test
    void unChoqueDelInsertPorElIndiceDelCodigoSeReintentaConOtroCodigo() {
        when(generador.generar()).thenReturn("111111", "222222");
        when(insercionRepository.insertarPendiente(eq(COMERCIO_ID), eq(EMAIL), eq("111111"), eq(DUENO_ID), any(), any()))
                .thenThrow(new DuplicateKeyException("Duplicate entry 'nuevo@bajonea.test-111111-1' for key 'uq_inv_pendiente_email_codigo'"));
        when(insercionRepository.insertarPendiente(eq(COMERCIO_ID), eq(EMAIL), eq("222222"), eq(DUENO_ID), any(), any())).thenReturn(56);

        assertEquals(56, invitar().getId());

        verify(generador, times(2)).generar();
    }

    @Test
    void unChoqueDelInsertPorElIndiceDelParEsYaHayUnaPendienteYNoSeReintenta() {
        when(generador.generar()).thenReturn("111111", "222222");
        when(insercionRepository.insertarPendiente(anyInt(), anyString(), anyString(), anyInt(), any(), any()))
                .thenThrow(new DuplicateKeyException("Duplicate entry '30-nuevo@bajonea.test-1' for key 'uq_inv_pendiente_comercio_email'"));

        ConflictoDeNegocioException error = assertThrows(ConflictoDeNegocioException.class, this::invitar);

        assertEquals("Ya hay una invitación pendiente para ese email. Podés reenviarla.", error.getMessage());
        verify(generador, times(1)).generar();
    }

    @Test
    void sinCodigoLibreTrasLosReintentosFallaConUnErrorDelServidor() {
        when(generador.generar()).thenReturn("111111");
        when(insercionRepository.existeCodigoPendiente(EMAIL, "111111")).thenReturn(true);

        assertThrows(GeneracionTokenException.class, this::invitar);

        verify(generador, times(3)).generar();
        verify(insercionRepository, never()).insertarPendiente(anyInt(), anyString(), anyString(), anyInt(), any(), any());
    }
}
