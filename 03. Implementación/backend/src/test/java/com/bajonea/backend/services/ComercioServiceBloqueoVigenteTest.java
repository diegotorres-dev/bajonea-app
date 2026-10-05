package com.bajonea.backend.services;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.bajonea.backend.entities.Comercio;
import com.bajonea.backend.entities.HistorialEstadoComercio;
import com.bajonea.backend.enums.EstadoComercio;
import com.bajonea.backend.enums.EstadoUsuario;
import com.bajonea.backend.repositories.ComercioRepository;
import com.bajonea.backend.repositories.DireccionRepository;
import com.bajonea.backend.repositories.HistorialCierreComercioRepository;
import com.bajonea.backend.repositories.HistorialEstadoComercioRepository;
import com.bajonea.backend.repositories.HorarioRepository;
import com.bajonea.backend.repositories.UsuarioRepository;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.mockito.ArgumentCaptor;

/**
 * Regla del bloqueo vigente: si la cuenta del Dueño está {@code BLOQUEADO}, ningún camino que llevaría un comercio a
 * {@code APTO_VENTA} lo deja ahí (queda {@code CERRADO_TEMPORALMENTE}); un comercio que no llegaría a
 * {@code APTO_VENTA} no cambia. El motor real lo cubre {@code BloqueoVigenteIntegrationTest}.
 */
class ComercioServiceBloqueoVigenteTest {

    private static final String MOTIVO_APROBAR = ComercioService.MOTIVO_BLOQUEO_VIGENTE_AL_APROBAR;
    private static final String MOTIVO_VINCULAR = ComercioService.MOTIVO_BLOQUEO_VIGENTE_AL_VINCULAR;

    private ComercioRepository comercioRepository;
    private HistorialEstadoComercioRepository historialRepository;
    private UsuarioRepository usuarioRepository;
    private ComercioService service;

    @BeforeEach
    void preparar() {
        comercioRepository = mock(ComercioRepository.class);
        historialRepository = mock(HistorialEstadoComercioRepository.class);
        usuarioRepository = mock(UsuarioRepository.class);
        service = new ComercioService(comercioRepository, mock(DireccionRepository.class), mock(HorarioRepository.class),
                historialRepository, mock(CloudinaryService.class),
                new DisponibilidadComercioService(mock(HorarioRepository.class), mock(HistorialCierreComercioRepository.class)),
                usuarioRepository);
        when(historialRepository.save(any(HistorialEstadoComercio.class))).thenAnswer(invocacion -> invocacion.getArgument(0));
    }

    private static Comercio comercio(int id, EstadoComercio estado) {
        return Comercio.builder().id(id).nombre("Comercio " + id).estado(estado).build();
    }

    private List<HistorialEstadoComercio> filasGuardadas(int cantidadEsperada) {
        ArgumentCaptor<HistorialEstadoComercio> captor = ArgumentCaptor.forClass(HistorialEstadoComercio.class);
        verify(historialRepository, times(cantidadEsperada)).save(captor.capture());
        return captor.getAllValues();
    }

    @Test
    void conLaCuentaActivaUnAprobadoPasaAAptoVentaConSuFilaAutomatica() {
        Comercio comercio = comercio(1, EstadoComercio.APROBADO);

        service.activarAptoVenta(comercio, false, MOTIVO_APROBAR);

        assertEquals(EstadoComercio.APTO_VENTA, comercio.getEstado());
        HistorialEstadoComercio fila = filasGuardadas(1).get(0);
        assertEquals(EstadoComercio.APROBADO, fila.getEstadoOrigen());
        assertEquals(EstadoComercio.APTO_VENTA, fila.getEstadoDestino());
        assertEquals("Vinculación automática de cuenta de Mercado Pago", fila.getMotivo());
    }

    @Test
    void conLaCuentaBloqueadaUnAprobadoPasaDirectoACerradoTemporalmenteSinPasarPorAptoVenta() {
        Comercio comercio = comercio(1, EstadoComercio.APROBADO);

        service.activarAptoVenta(comercio, true, MOTIVO_APROBAR);

        assertEquals(EstadoComercio.CERRADO_TEMPORALMENTE, comercio.getEstado());
        HistorialEstadoComercio fila = filasGuardadas(1).get(0);
        assertEquals(EstadoComercio.APROBADO, fila.getEstadoOrigen());
        assertEquals(EstadoComercio.CERRADO_TEMPORALMENTE, fila.getEstadoDestino());
        assertEquals(MOTIVO_APROBAR, fila.getMotivo());
        assertEquals(null, fila.getAdministrador());
    }

    @ParameterizedTest
    @EnumSource(value = EstadoComercio.class, names = "APROBADO", mode = EnumSource.Mode.EXCLUDE)
    void unComercioQueNoEstaAprobadoNoCambiaConNingunValorDelFlag(EstadoComercio estado) {
        Comercio conCuentaActiva = comercio(1, estado);
        Comercio conCuentaBloqueada = comercio(2, estado);

        service.activarAptoVenta(conCuentaActiva, false, MOTIVO_APROBAR);
        service.activarAptoVenta(conCuentaBloqueada, true, MOTIVO_APROBAR);

        assertEquals(estado, conCuentaActiva.getEstado());
        assertEquals(estado, conCuentaBloqueada.getEstado());
        verify(historialRepository, never()).save(any());
    }

    @Test
    void laVinculacionConLaCuentaBloqueadaCierraSoloLosAprobadosDelDueno() {
        Comercio aprobado = comercio(1, EstadoComercio.APROBADO);
        Comercio aptoVenta = comercio(2, EstadoComercio.APTO_VENTA);
        Comercio suspendido = comercio(3, EstadoComercio.SUSPENDIDO);
        Comercio pendiente = comercio(4, EstadoComercio.PENDIENTE);
        Comercio cerrado = comercio(5, EstadoComercio.CERRADO_TEMPORALMENTE);
        when(comercioRepository.findByDuenoIdConBloqueo(7)).thenReturn(List.of(aprobado, aptoVenta, suspendido, pendiente, cerrado));

        service.activarAptoVenta(7, true);

        assertEquals(EstadoComercio.CERRADO_TEMPORALMENTE, aprobado.getEstado());
        assertEquals(EstadoComercio.APTO_VENTA, aptoVenta.getEstado());
        assertEquals(EstadoComercio.SUSPENDIDO, suspendido.getEstado());
        assertEquals(EstadoComercio.PENDIENTE, pendiente.getEstado());
        assertEquals(EstadoComercio.CERRADO_TEMPORALMENTE, cerrado.getEstado());
        HistorialEstadoComercio fila = filasGuardadas(1).get(0);
        assertEquals(EstadoComercio.CERRADO_TEMPORALMENTE, fila.getEstadoDestino());
        assertEquals(MOTIVO_VINCULAR, fila.getMotivo());
    }

    @Test
    void laVinculacionConLaCuentaActivaLlevaLosAprobadosAAptoVenta() {
        Comercio aprobado = comercio(1, EstadoComercio.APROBADO);
        Comercio pendiente = comercio(2, EstadoComercio.PENDIENTE);
        when(comercioRepository.findByDuenoIdConBloqueo(7)).thenReturn(List.of(aprobado, pendiente));

        service.activarAptoVenta(7, false);

        assertEquals(EstadoComercio.APTO_VENTA, aprobado.getEstado());
        assertEquals(EstadoComercio.PENDIENTE, pendiente.getEstado());
        assertEquals(EstadoComercio.APTO_VENTA, filasGuardadas(1).get(0).getEstadoDestino());
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
