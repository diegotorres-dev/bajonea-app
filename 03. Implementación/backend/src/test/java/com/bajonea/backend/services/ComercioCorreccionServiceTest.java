package com.bajonea.backend.services;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.bajonea.backend.config.ComercioResolicitudesProperties;
import com.bajonea.backend.dto.request.DatosLegalesComercioRequestDTO;
import com.bajonea.backend.dto.request.DireccionRequestDTO;
import com.bajonea.backend.dto.request.ReSolicitudComercioRequestDTO;
import com.bajonea.backend.entities.Comercio;
import com.bajonea.backend.entities.Dueno;
import com.bajonea.backend.entities.HistorialCambioComercio;
import com.bajonea.backend.entities.HistorialEstadoComercio;
import com.bajonea.backend.entities.Localidad;
import com.bajonea.backend.enums.CampoCambioComercio;
import com.bajonea.backend.enums.EstadoComercio;
import com.bajonea.backend.exceptions.ConflictoDeNegocioException;
import com.bajonea.backend.exceptions.RecursoNoEncontradoException;
import com.bajonea.backend.repositories.ComercioRepository;
import com.bajonea.backend.repositories.DireccionRepository;
import com.bajonea.backend.repositories.DuenoRepository;
import com.bajonea.backend.repositories.HistorialCambioComercioRepository;
import com.bajonea.backend.repositories.HistorialEstadoComercioRepository;
import com.bajonea.backend.repositories.HorarioRepository;
import com.bajonea.backend.repositories.RedSocialRepository;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.InOrder;

class ComercioCorreccionServiceTest {

    private static final int DUENO_ID = 7;
    private static final int COMERCIO_ID = 5;
    private static final int ID_FILA_RECHAZO = 40;

    private DuenoRepository duenoRepository;
    private ComercioRepository comercioRepository;
    private HistorialEstadoComercioRepository historialEstadoRepository;
    private HistorialCambioComercioRepository historialCambioRepository;
    private ValidadorDatosNegocioComercio validadorDatosNegocio;
    private ValidadorComercioDuplicado validadorDuplicado;
    private ComercioEdicionService edicion;
    private ComercioService comercioService;
    private AprobacionPreviaDueno aprobacionPrevia;
    private ComercioCorreccionService service;

    private Dueno dueno;
    private Comercio comercio;
    private HistorialEstadoComercio filaRechazo;
    private Localidad localidad;

    @BeforeEach
    void preparar() {
        duenoRepository = mock(DuenoRepository.class);
        comercioRepository = mock(ComercioRepository.class);
        historialEstadoRepository = mock(HistorialEstadoComercioRepository.class);
        historialCambioRepository = mock(HistorialCambioComercioRepository.class);
        validadorDatosNegocio = mock(ValidadorDatosNegocioComercio.class);
        validadorDuplicado = mock(ValidadorComercioDuplicado.class);
        edicion = mock(ComercioEdicionService.class);
        comercioService = mock(ComercioService.class);
        aprobacionPrevia = mock(AprobacionPreviaDueno.class);
        ComercioResolicitudesProperties propiedades = new ComercioResolicitudesProperties();
        propiedades.setMax(3);

        service = new ComercioCorreccionService(duenoRepository, comercioRepository, mock(DireccionRepository.class),
                mock(HorarioRepository.class), mock(RedSocialRepository.class), historialEstadoRepository, historialCambioRepository,
                validadorDatosNegocio, validadorDuplicado, edicion, comercioService, aprobacionPrevia, mock(CloudinaryService.class),
                propiedades);

        dueno = Dueno.builder().id(DUENO_ID).build();
        comercio = Comercio.builder().id(COMERCIO_ID).dueno(dueno).nombre("Cafe").estado(EstadoComercio.RECHAZADO).build();
        filaRechazo = HistorialEstadoComercio.builder().id(ID_FILA_RECHAZO).estadoDestino(EstadoComercio.RECHAZADO).motivo("Falta foto").build();
        localidad = Localidad.builder().id("L1").build();

        when(duenoRepository.findByIdConBloqueo(DUENO_ID)).thenReturn(Optional.of(dueno));
        when(comercioRepository.findByIdAndDuenoIdConBloqueo(COMERCIO_ID, DUENO_ID)).thenReturn(Optional.of(comercio));
        when(historialEstadoRepository.findTopByComercioIdAndEstadoDestinoOrderByIdDesc(COMERCIO_ID, EstadoComercio.RECHAZADO))
                .thenReturn(Optional.of(filaRechazo));
        when(aprobacionPrevia.duenoTuvoComercioAprobado(DUENO_ID, COMERCIO_ID)).thenReturn(false);
        when(validadorDatosNegocio.validar(any())).thenReturn(localidad);
        when(edicion.actualizarDatosBasicos(any(), any(), any(), any(), any())).thenReturn(List.of());
        when(edicion.actualizarTipo(any(), any())).thenReturn(List.of());
        when(edicion.actualizarModalidades(any(), org.mockito.ArgumentMatchers.anyBoolean(), org.mockito.ArgumentMatchers.anyBoolean()))
                .thenReturn(List.of());
        when(edicion.actualizarFoto(any(), any())).thenReturn(List.of());
        when(edicion.actualizarDireccion(any(), any(), any())).thenReturn(List.of());
        when(edicion.reemplazarHorarios(any(), anyList())).thenReturn(List.of());
        when(edicion.sincronizarRedes(any(), anyList())).thenReturn(List.of());
        when(comercioService.registrarTransicionAutomatica(any(), any(), any(), anyString()))
                .thenReturn(HistorialEstadoComercio.builder().id(50).build());
    }

    private ReSolicitudComercioRequestDTO pedido(int tokenVersion) {
        ReSolicitudComercioRequestDTO request = new ReSolicitudComercioRequestDTO();
        request.setNombre("Cafe");
        request.setDireccion(new DireccionRequestDTO("Belgrano", "250", null, "9420", "L1", false));
        request.setHorarios(List.of());
        request.setRedesSociales(List.of());
        request.setTokenVersion(tokenVersion);
        return request;
    }

    private void unCambio() {
        when(edicion.actualizarDatosBasicos(any(), any(), any(), any(), any()))
                .thenReturn(List.of(new CambioComercio(CampoCambioComercio.NOMBRE, "Cafe", "Cafe Nuevo")));
    }

    @Test
    void bloqueaPrimeroElDuenoDespuesElComercioYNuncaLaCuentaDeMercadoPago() {
        unCambio();

        service.reSolicitar(DUENO_ID, COMERCIO_ID, pedido(ID_FILA_RECHAZO));

        InOrder orden = inOrder(duenoRepository, comercioRepository, validadorDatosNegocio, comercioService);
        orden.verify(duenoRepository).findByIdConBloqueo(DUENO_ID);
        orden.verify(comercioRepository).findByIdAndDuenoIdConBloqueo(COMERCIO_ID, DUENO_ID);
        orden.verify(validadorDatosNegocio).validar(any());
        orden.verify(comercioService).registrarTransicionAutomatica(any(), any(), any(), anyString());
    }

    @Test
    void unReenvioConCambiosPasaAPendienteSubeElContadorFijaLaFechaYGuardaLosCambios() {
        unCambio();
        when(edicion.reemplazarHorarios(any(), anyList()))
                .thenReturn(List.of(new CambioComercio(CampoCambioComercio.HORARIOS, "Lunes 09:00-13:00", "Lunes 10:00-14:00")));

        service.reSolicitar(DUENO_ID, COMERCIO_ID, pedido(ID_FILA_RECHAZO));

        assertEquals(1, comercio.getCantidadResolicitudes());
        org.junit.jupiter.api.Assertions.assertNotNull(comercio.getFechaResolicitud());
        verify(comercioService).registrarTransicionAutomatica(comercio, EstadoComercio.RECHAZADO, EstadoComercio.PENDIENTE,
                "Nueva solicitud del Dueño");
        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<HistorialCambioComercio>> captor = ArgumentCaptor.forClass(List.class);
        verify(historialCambioRepository).saveAll(captor.capture());
        assertEquals(2, captor.getValue().size());
        assertEquals(50, captor.getValue().get(0).getHistorialEstadoComercio().getId());
        assertEquals(CampoCambioComercio.NOMBRE, captor.getValue().get(0).getCampo());
        assertEquals("Cafe Nuevo", captor.getValue().get(0).getValorNuevo());
    }

    @Test
    void sinNingunCambioDa409YNoTocaElEstadoNiElContador() {
        ConflictoDeNegocioException error = assertThrows(ConflictoDeNegocioException.class,
                () -> service.reSolicitar(DUENO_ID, COMERCIO_ID, pedido(ID_FILA_RECHAZO)));

        assertEquals("Modificá al menos un dato antes de volver a solicitar", error.getMessage());
        assertEquals(0, comercio.getCantidadResolicitudes());
        verify(comercioService, never()).registrarTransicionAutomatica(any(), any(), any(), anyString());
        verify(historialCambioRepository, never()).saveAll(anyList());
    }

    @Test
    void unTokenDeVersionViejoDa409SinGastarUnIntentoNiEditarNada() {
        unCambio();

        ConflictoDeNegocioException error = assertThrows(ConflictoDeNegocioException.class,
                () -> service.reSolicitar(DUENO_ID, COMERCIO_ID, pedido(ID_FILA_RECHAZO - 1)));

        assertEquals("La solicitud cambió desde que abriste la corrección. Volvé a abrirla para continuar", error.getMessage());
        assertEquals(0, comercio.getCantidadResolicitudes());
        verify(edicion, never()).actualizarDatosBasicos(any(), any(), any(), any(), any());
    }

    @Test
    void sinFilaDeRechazoLaVersionEsCero() {
        unCambio();
        when(historialEstadoRepository.findTopByComercioIdAndEstadoDestinoOrderByIdDesc(COMERCIO_ID, EstadoComercio.RECHAZADO))
                .thenReturn(Optional.empty());

        service.reSolicitar(DUENO_ID, COMERCIO_ID, pedido(0));

        assertEquals(1, comercio.getCantidadResolicitudes());
    }

    @Test
    void unComercioDeOtroDuenoOInexistenteDa404() {
        when(comercioRepository.findByIdAndDuenoIdConBloqueo(COMERCIO_ID, DUENO_ID)).thenReturn(Optional.empty());

        assertThrows(RecursoNoEncontradoException.class, () -> service.reSolicitar(DUENO_ID, COMERCIO_ID, pedido(ID_FILA_RECHAZO)));
    }

    @Test
    void unComercioQueNoEstaRechazadoDa404ExceptoPendienteQueDa409() {
        for (EstadoComercio estado : new EstadoComercio[] { EstadoComercio.APROBADO, EstadoComercio.APTO_VENTA, EstadoComercio.SUSPENDIDO,
                EstadoComercio.INACTIVO, EstadoComercio.CERRADO_TEMPORALMENTE, EstadoComercio.RECHAZO_DEFINITIVO }) {
            comercio.setEstado(estado);
            assertThrows(RecursoNoEncontradoException.class,
                    () -> service.reSolicitar(DUENO_ID, COMERCIO_ID, pedido(ID_FILA_RECHAZO)), estado.name());
        }
        comercio.setEstado(EstadoComercio.PENDIENTE);
        ConflictoDeNegocioException error = assertThrows(ConflictoDeNegocioException.class,
                () -> service.reSolicitar(DUENO_ID, COMERCIO_ID, pedido(ID_FILA_RECHAZO)));
        assertEquals("Este comercio ya fue enviado nuevamente a revisión", error.getMessage());
    }

    @Test
    void conTodosLosIntentosUsadosDa409() {
        comercio.setCantidadResolicitudes(3);

        ConflictoDeNegocioException error = assertThrows(ConflictoDeNegocioException.class,
                () -> service.reSolicitar(DUENO_ID, COMERCIO_ID, pedido(ID_FILA_RECHAZO)));

        assertEquals("Ya usaste todas las re-solicitudes disponibles para este comercio", error.getMessage());
    }

    @Test
    void losDatosLegalesSoloSeAceptanSiElDuenoNuncaTuvoUnComercioAprobado() {
        unCambio();
        ReSolicitudComercioRequestDTO request = pedido(ID_FILA_RECHAZO);
        request.setLegales(new DatosLegalesComercioRequestDTO());
        when(aprobacionPrevia.duenoTuvoComercioAprobado(DUENO_ID, COMERCIO_ID)).thenReturn(true);

        ConflictoDeNegocioException error = assertThrows(ConflictoDeNegocioException.class,
                () -> service.reSolicitar(DUENO_ID, COMERCIO_ID, request));

        assertEquals("No podés modificar los datos fiscales ni del representante", error.getMessage());
        verify(edicion, never()).actualizarDatosLegales(any(), any());

        when(aprobacionPrevia.duenoTuvoComercioAprobado(DUENO_ID, COMERCIO_ID)).thenReturn(false);
        when(edicion.actualizarDatosLegales(eq(dueno), any()))
                .thenReturn(List.of(new CambioComercio(CampoCambioComercio.CUIT, "1", "2")));
        service.reSolicitar(DUENO_ID, COMERCIO_ID, request);
        verify(edicion).actualizarDatosLegales(eq(dueno), any());
    }

    @Test
    void elChequeoDeDuplicadoExcluyeAlPropioComercio() {
        unCambio();

        service.reSolicitar(DUENO_ID, COMERCIO_ID, pedido(ID_FILA_RECHAZO));

        verify(validadorDuplicado).validar(eq(DUENO_ID), eq("Cafe"), any(), eq(COMERCIO_ID));
        verify(validadorDuplicado, never()).validar(anyInt(), anyString(), any(), eq(null));
    }
}
