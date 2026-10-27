package com.bajonea.backend.services;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.bajonea.backend.dto.request.DireccionClienteRequestDTO;
import com.bajonea.backend.entities.Cliente;
import com.bajonea.backend.entities.Direccion;
import com.bajonea.backend.entities.Localidad;
import com.bajonea.backend.entities.Provincia;
import com.bajonea.backend.entities.Usuario;
import com.bajonea.backend.exceptions.ConflictoComercioException;
import com.bajonea.backend.exceptions.RecursoNoEncontradoException;
import com.bajonea.backend.repositories.ClienteRepository;
import com.bajonea.backend.repositories.DireccionRepository;
import com.bajonea.backend.repositories.UsuarioRepository;
import java.time.Clock;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentMatchers;
import org.mockito.InOrder;
import org.mockito.Mockito;

/**
 * El orden de las sentencias del CRUD de direcciones del Cliente: la fila {@code usuario} se bloquea
 * {@code FOR UPDATE} antes de cualquier lectura de direcciones (los conteos y la predeterminada se leen ya con el
 * bloqueo), y al cambiar la predeterminada se baja la vieja con {@code flush} antes de subir la nueva. El efecto real
 * contra la base está en {@code DireccionClienteIntegrationTest} y en el estrés {@code stress-locks-tramoDirecciones.mjs}.
 */
class DireccionClienteServiceTest {

    private DireccionRepository direccionRepository;
    private UsuarioRepository usuarioRepository;
    private ValidadorDatosNegocioComercio validador;
    private DireccionClienteService servicio;
    private Localidad localidad;

    @BeforeEach
    void preparar() {
        direccionRepository = mock(DireccionRepository.class);
        usuarioRepository = mock(UsuarioRepository.class);
        ClienteRepository clienteRepository = mock(ClienteRepository.class);
        validador = mock(ValidadorDatosNegocioComercio.class);
        servicio = new DireccionClienteService(direccionRepository, clienteRepository, usuarioRepository, validador,
                Clock.systemDefaultZone());

        Provincia provincia = mock(Provincia.class);
        when(provincia.getNombre()).thenReturn("Tierra del Fuego");
        localidad = mock(Localidad.class);
        when(localidad.getId()).thenReturn("94008010");
        when(localidad.getNombre()).thenReturn("Río Grande");
        when(localidad.getProvincia()).thenReturn(provincia);
        when(usuarioRepository.findByIdConBloqueo(5)).thenReturn(Optional.of(mock(Usuario.class)));
        when(clienteRepository.findById(5)).thenReturn(Optional.of(mock(Cliente.class)));
        when(validador.obtenerLocalidad(any(), any())).thenReturn(localidad);
        when(direccionRepository.saveAndFlush(any(Direccion.class))).thenAnswer(a -> a.getArgument(0));
    }

    private Direccion direccion(int id, boolean principal) {
        Direccion d = mock(Direccion.class, Mockito.withSettings().strictness(org.mockito.quality.Strictness.LENIENT));
        when(d.getId()).thenReturn(id);
        when(d.isPrincipal()).thenReturn(principal);
        when(d.getLocalidad()).thenReturn(localidad);
        return d;
    }

    private DireccionClienteRequestDTO request(boolean principal) {
        DireccionClienteRequestDTO dto = new DireccionClienteRequestDTO();
        dto.setCalle("Mitre");
        dto.setNumero("1");
        dto.setCodigoPostal("9420");
        dto.setLocalidadId("94008010");
        dto.setPrincipal(principal);
        return dto;
    }

    @Test
    void crearBloqueaElUsuarioAntesDeContarLasActivas() {
        when(direccionRepository.countByClienteIdAndEliminadaFalse(5)).thenReturn(1L);
        Direccion actual = direccion(1, true);
        when(direccionRepository.findPrincipalActivaByClienteId(5)).thenReturn(Optional.of(actual));

        servicio.crear(5, request(false));

        InOrder orden = inOrder(usuarioRepository, direccionRepository);
        orden.verify(usuarioRepository).findByIdConBloqueo(5);
        orden.verify(direccionRepository).countByClienteIdAndEliminadaFalse(5);
    }

    @Test
    void crearConElCupoLlenoDaConflictoConSuCodigoYNoEscribe() {
        when(direccionRepository.countByClienteIdAndEliminadaFalse(5)).thenReturn(5L);

        ConflictoComercioException ex = assertThrows(ConflictoComercioException.class, () -> servicio.crear(5, request(false)));

        assertEquals(ConflictoComercioException.DIRECCIONES_CUPO_MAXIMO, ex.getCodigo());
        verify(direccionRepository, never()).saveAndFlush(any());
    }

    @Test
    void crearConPrincipalBajaLaViejaConFlushAntesDeGuardarLaNueva() {
        Direccion vieja = direccion(1, true);
        when(direccionRepository.countByClienteIdAndEliminadaFalse(5)).thenReturn(1L);
        when(direccionRepository.findPrincipalActivaByClienteId(5)).thenReturn(Optional.of(vieja));

        servicio.crear(5, request(true));

        InOrder orden = inOrder(vieja, direccionRepository);
        orden.verify(vieja).setPrincipal(false);
        orden.verify(direccionRepository).saveAndFlush(vieja);
        orden.verify(direccionRepository).saveAndFlush(ArgumentMatchers.argThat((Direccion d) -> d != vieja && d.isPrincipal()));
    }

    @Test
    void laPrimeraDireccionQuedaPredeterminadaAunqueNoSePida() {
        when(direccionRepository.countByClienteIdAndEliminadaFalse(5)).thenReturn(0L);
        when(direccionRepository.findPrincipalActivaByClienteId(5)).thenReturn(Optional.empty());

        assertTrue(servicio.crear(5, request(false)).isPrincipal());
    }

    @Test
    void marcarPredeterminadaBajaLaViejaConFlushAntesDeSubirLaNueva() {
        Direccion vieja = direccion(1, true);
        Direccion nueva = direccion(2, false);
        when(direccionRepository.findByIdAndClienteIdAndEliminadaFalse(2, 5)).thenReturn(Optional.of(nueva));
        when(direccionRepository.findPrincipalActivaByClienteId(5)).thenReturn(Optional.of(vieja));
        when(direccionRepository.findActivasByClienteId(5)).thenReturn(List.of());

        servicio.marcarPredeterminada(5, 2);

        InOrder orden = inOrder(usuarioRepository, vieja, nueva, direccionRepository);
        orden.verify(usuarioRepository).findByIdConBloqueo(5);
        orden.verify(vieja).setPrincipal(false);
        orden.verify(direccionRepository).saveAndFlush(vieja);
        orden.verify(nueva).setPrincipal(true);
        orden.verify(direccionRepository).saveAndFlush(nueva);
    }

    @Test
    void eliminarLaUltimaDaConflictoYNoEscribe() {
        Direccion unica = direccion(1, true);
        when(direccionRepository.findByIdAndClienteIdAndEliminadaFalse(1, 5)).thenReturn(Optional.of(unica));
        when(direccionRepository.countByClienteIdAndEliminadaFalse(5)).thenReturn(1L);

        ConflictoComercioException ex = assertThrows(ConflictoComercioException.class, () -> servicio.eliminar(5, 1));

        assertEquals(ConflictoComercioException.ULTIMA_DIRECCION, ex.getCodigo());
        verify(direccionRepository, never()).saveAndFlush(any());
    }

    @Test
    void eliminarLaPredeterminadaPromueveLaDeMayorIdDeLasQueQuedan() {
        Direccion predeterminada = direccion(1, true);
        Direccion mayor = direccion(9, false);
        Direccion menor = direccion(3, false);
        when(direccionRepository.findByIdAndClienteIdAndEliminadaFalse(1, 5)).thenReturn(Optional.of(predeterminada));
        when(direccionRepository.countByClienteIdAndEliminadaFalse(5)).thenReturn(3L);
        when(direccionRepository.findActivasPorIdDescByClienteId(5)).thenReturn(List.of(mayor, menor));
        when(direccionRepository.findActivasByClienteId(5)).thenReturn(List.of());

        servicio.eliminar(5, 1);

        InOrder orden = inOrder(predeterminada, mayor, direccionRepository);
        orden.verify(predeterminada).setEliminada(true);
        orden.verify(direccionRepository).saveAndFlush(predeterminada);
        orden.verify(mayor).setPrincipal(true);
        orden.verify(direccionRepository).saveAndFlush(mayor);
        verify(menor, never()).setPrincipal(true);
    }

    @Test
    void editarEliminarYMarcarBloqueanElUsuarioPrimeroYUnaAjenaDa404SinEscribir() {
        when(direccionRepository.findByIdAndClienteIdAndEliminadaFalse(anyInt(), anyInt())).thenReturn(Optional.empty());

        assertThrows(RecursoNoEncontradoException.class, () -> servicio.editar(5, 8, request(false)));
        assertThrows(RecursoNoEncontradoException.class, () -> servicio.eliminar(5, 8));
        assertThrows(RecursoNoEncontradoException.class, () -> servicio.marcarPredeterminada(5, 8));

        verify(usuarioRepository, times(3)).findByIdConBloqueo(5);
        verify(direccionRepository, never()).saveAndFlush(any());
    }

    @Test
    void editarValidaLaLocalidadHabilitadaSiempre() {
        Direccion existente = direccion(1, true);
        when(direccionRepository.findByIdAndClienteIdAndEliminadaFalse(1, 5)).thenReturn(Optional.of(existente));

        servicio.editar(5, 1, request(false));

        verify(validador).obtenerLocalidad("94008010", DireccionClienteService.CAMPO_LOCALIDAD);
    }
}
