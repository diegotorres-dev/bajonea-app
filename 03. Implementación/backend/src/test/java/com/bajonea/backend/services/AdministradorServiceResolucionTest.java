package com.bajonea.backend.services;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.bajonea.backend.config.ComercioResolicitudesProperties;
import com.bajonea.backend.dto.request.AprobacionComercioRequestDTO;
import com.bajonea.backend.entities.Administrador;
import com.bajonea.backend.entities.Comercio;
import com.bajonea.backend.entities.Dueno;
import com.bajonea.backend.entities.HistorialEstadoComercio;
import com.bajonea.backend.entities.Persona;
import com.bajonea.backend.entities.PersonaJuridica;
import com.bajonea.backend.entities.Usuario;
import com.bajonea.backend.enums.EstadoComercio;
import com.bajonea.backend.enums.TipoEntidadNotificacion;
import com.bajonea.backend.enums.TipoNotificacion;
import com.bajonea.backend.exceptions.ConflictoDeNegocioException;
import com.bajonea.backend.exceptions.RecursoNoEncontradoException;
import com.bajonea.backend.exceptions.ValidacionException;
import com.bajonea.backend.repositories.AdministradorRepository;
import com.bajonea.backend.repositories.CategoriaRepository;
import com.bajonea.backend.repositories.ClienteRepository;
import com.bajonea.backend.repositories.ComercioRepository;
import com.bajonea.backend.repositories.DireccionRepository;
import com.bajonea.backend.repositories.HistorialCambioComercioRepository;
import com.bajonea.backend.repositories.HistorialEstadoComercioRepository;
import com.bajonea.backend.repositories.HorarioRepository;
import com.bajonea.backend.repositories.RedSocialRepository;
import com.bajonea.backend.repositories.TagRepository;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.InOrder;

class AdministradorServiceResolucionTest {

    private static final int COMERCIO_ID = 5;
    private static final int DUENO_ID = 7;
    private static final int ADMIN_ID = 1;

    private ComercioRepository comercioRepository;
    private AdministradorRepository administradorRepository;
    private HistorialEstadoComercioRepository historialRepository;
    private NotificacionService notificacionService;
    private ComercioService comercioService;
    private CuentaMercadoPagoService cuentaMercadoPagoService;
    private AdministradorService service;
    private Comercio comercio;

    @BeforeEach
    void preparar() {
        comercioRepository = mock(ComercioRepository.class);
        administradorRepository = mock(AdministradorRepository.class);
        historialRepository = mock(HistorialEstadoComercioRepository.class);
        notificacionService = mock(NotificacionService.class);
        comercioService = mock(ComercioService.class);
        cuentaMercadoPagoService = mock(CuentaMercadoPagoService.class);
        ComercioResolicitudesProperties propiedades = new ComercioResolicitudesProperties();
        propiedades.setMax(3);

        service = new AdministradorService(comercioRepository, mock(DireccionRepository.class), mock(HorarioRepository.class),
                mock(RedSocialRepository.class), administradorRepository, historialRepository, mock(ClienteRepository.class),
                mock(CategoriaRepository.class), mock(TagRepository.class), notificacionService, mock(PedidoService.class),
                comercioService, cuentaMercadoPagoService, mock(AprobacionPreviaDueno.class),
                mock(HistorialCambioComercioRepository.class), propiedades);

        Usuario usuario = Usuario.builder().id(DUENO_ID).build();
        Dueno dueno = Dueno.builder().id(DUENO_ID)
                .personaJuridica(PersonaJuridica.builder().persona(Persona.builder().usuario(usuario).build()).build()).build();
        comercio = Comercio.builder().id(COMERCIO_ID).dueno(dueno).nombre("Cafe").estado(EstadoComercio.PENDIENTE).build();

        when(comercioRepository.findDuenoIdById(COMERCIO_ID)).thenReturn(Optional.of(DUENO_ID));
        when(comercioRepository.findByIdConBloqueo(COMERCIO_ID)).thenReturn(Optional.of(comercio));
        when(administradorRepository.findById(ADMIN_ID)).thenReturn(Optional.of(Administrador.builder().id(ADMIN_ID).build()));
        when(cuentaMercadoPagoService.existeActivaConBloqueo(DUENO_ID)).thenReturn(false);
    }

    private static AprobacionComercioRequestDTO rechazo(String motivo, Boolean definitivo) {
        AprobacionComercioRequestDTO request = new AprobacionComercioRequestDTO(false, motivo);
        request.setDefinitivo(definitivo);
        return request;
    }

    private HistorialEstadoComercio historialGuardado() {
        ArgumentCaptor<HistorialEstadoComercio> captor = ArgumentCaptor.forClass(HistorialEstadoComercio.class);
        verify(historialRepository).save(captor.capture());
        return captor.getValue();
    }

    @Test
    void elOrdenDeBloqueoEsDuenoEscalarLuegoUsuarioLuegoCuentaDeMercadoPagoLuegoComercio() {
        service.resolverAprobacion(COMERCIO_ID, ADMIN_ID, new AprobacionComercioRequestDTO(true, null));

        InOrder orden = inOrder(comercioRepository, comercioService, cuentaMercadoPagoService);
        orden.verify(comercioRepository).findDuenoIdById(COMERCIO_ID);
        orden.verify(comercioService).duenoBloqueadoConBloqueo(DUENO_ID);
        orden.verify(cuentaMercadoPagoService).existeActivaConBloqueo(DUENO_ID);
        orden.verify(comercioRepository).findByIdConBloqueo(COMERCIO_ID);
        verify(comercioRepository, never()).findById(anyInt());
    }

    @Test
    void siElComercioYaNoEstaPendienteDentroDelBloqueoDa409SinEscribirNada() {
        comercio.setEstado(EstadoComercio.APROBADO);

        ConflictoDeNegocioException error = assertThrows(ConflictoDeNegocioException.class,
                () -> service.resolverAprobacion(COMERCIO_ID, ADMIN_ID, rechazo("Falta algo", false)));

        assertEquals("El comercio ya fue resuelto, no está en estado PENDIENTE", error.getMessage());
        verify(historialRepository, never()).save(any());
        verify(notificacionService, never()).crear(anyInt(), anyString(), any(), any(), any());
    }

    @Test
    void unComercioInexistenteDa404() {
        when(comercioRepository.findDuenoIdById(COMERCIO_ID)).thenReturn(Optional.empty());

        assertThrows(RecursoNoEncontradoException.class,
                () -> service.resolverAprobacion(COMERCIO_ID, ADMIN_ID, rechazo("Falta algo", false)));
    }

    @Test
    void rechazarUnaSolicitudNuevaLaDejaRechazadaConElTextoSinComillas() {
        service.resolverAprobacion(COMERCIO_ID, ADMIN_ID, rechazo("Falta la foto", null));

        assertEquals(EstadoComercio.RECHAZADO, comercio.getEstado());
        HistorialEstadoComercio fila = historialGuardado();
        assertEquals(EstadoComercio.PENDIENTE, fila.getEstadoOrigen());
        assertEquals(EstadoComercio.RECHAZADO, fila.getEstadoDestino());
        assertEquals("Falta la foto", fila.getMotivo());
        verify(notificacionService).crear(DUENO_ID, "Tu comercio Cafe fue rechazado. Motivo: Falta la foto",
                TipoNotificacion.COMERCIO_RECHAZADO, TipoEntidadNotificacion.COMERCIO, COMERCIO_ID);
    }

    @Test
    void elFlagDefinitivoVaDirectoARechazoDefinitivoAunEnElAltaOriginal() {
        service.resolverAprobacion(COMERCIO_ID, ADMIN_ID, rechazo("Fraude", true));

        assertEquals(EstadoComercio.RECHAZO_DEFINITIVO, comercio.getEstado());
        assertEquals(EstadoComercio.RECHAZO_DEFINITIVO, historialGuardado().getEstadoDestino());
        verify(notificacionService).crear(DUENO_ID, "Tu comercio Cafe fue rechazado de forma definitiva. Motivo: Fraude",
                TipoNotificacion.COMERCIO_RECHAZADO, TipoEntidadNotificacion.COMERCIO, COMERCIO_ID);
    }

    @Test
    void rechazarUnaReSolicitudConElUltimoIntentoUsadoLaPasaADefinitivoSinQueLoPidaElAdministrador() {
        comercio.setCantidadResolicitudes(3);

        service.resolverAprobacion(COMERCIO_ID, ADMIN_ID, rechazo("Sigue sin cumplir", false));

        assertEquals(EstadoComercio.RECHAZO_DEFINITIVO, comercio.getEstado());
    }

    @Test
    void rechazarUnaReSolicitudAntesDelUltimoIntentoLaDejaCorregible() {
        comercio.setCantidadResolicitudes(2);

        service.resolverAprobacion(COMERCIO_ID, ADMIN_ID, rechazo("Falta algo", false));

        assertEquals(EstadoComercio.RECHAZADO, comercio.getEstado());
    }

    @Test
    void aprobarNoPuedeLlevarElFlagDefinitivo() {
        AprobacionComercioRequestDTO request = new AprobacionComercioRequestDTO(true, null);
        request.setDefinitivo(true);

        assertThrows(ValidacionException.class, () -> service.resolverAprobacion(COMERCIO_ID, ADMIN_ID, request));
        verify(comercioRepository, never()).findDuenoIdById(anyInt());
    }

    @Test
    void rechazarSinMotivoDa400() {
        assertThrows(ValidacionException.class, () -> service.resolverAprobacion(COMERCIO_ID, ADMIN_ID, rechazo("  ", false)));
    }

    @Test
    void aprobarUnaReSolicitudSigueLasReglasDeSiempre() {
        comercio.setCantidadResolicitudes(2);
        when(cuentaMercadoPagoService.existeActivaConBloqueo(DUENO_ID)).thenReturn(true);

        service.resolverAprobacion(COMERCIO_ID, ADMIN_ID, new AprobacionComercioRequestDTO(true, null));

        assertEquals(EstadoComercio.APROBADO, comercio.getEstado());
        verify(comercioService).activarAptoVenta(comercio, false, "Bloqueo de cuenta vigente al aprobar");
        verify(notificacionService).crear(eq(DUENO_ID), eq("Tu comercio Cafe fue aprobado y ya podés vender"),
                eq(TipoNotificacion.COMERCIO_APROBADO), eq(TipoEntidadNotificacion.COMERCIO), eq(COMERCIO_ID));
    }

    @Test
    void aprobarConLaCuentaDelDuenoBloqueadaPasaElFlagYNoLoDejaALaVenta() {
        when(cuentaMercadoPagoService.existeActivaConBloqueo(DUENO_ID)).thenReturn(true);
        when(comercioService.duenoBloqueadoConBloqueo(DUENO_ID)).thenReturn(true);

        service.resolverAprobacion(COMERCIO_ID, ADMIN_ID, new AprobacionComercioRequestDTO(true, null));

        assertEquals(EstadoComercio.APROBADO, comercio.getEstado());
        verify(comercioService).activarAptoVenta(comercio, true, "Bloqueo de cuenta vigente al aprobar");
        verify(comercioService, never()).activarAptoVenta(comercio, false, "Bloqueo de cuenta vigente al aprobar");
    }

    @Test
    void rechazarNoLeeElEstadoDeLaCuentaDelDueno() {
        service.resolverAprobacion(COMERCIO_ID, ADMIN_ID, rechazo("Falta algo", false));

        verify(comercioService, never()).duenoBloqueadoConBloqueo(anyInt());
    }

    @Test
    void aprobarSinCuentaDeMercadoPagoNoActivaLaVentaAunqueElDuenoEsteBloqueado() {
        when(comercioService.duenoBloqueadoConBloqueo(DUENO_ID)).thenReturn(true);

        service.resolverAprobacion(COMERCIO_ID, ADMIN_ID, new AprobacionComercioRequestDTO(true, null));

        assertEquals(EstadoComercio.APROBADO, comercio.getEstado());
        verify(comercioService, never()).activarAptoVenta(any(Comercio.class), anyBoolean(), anyString());
    }
}
