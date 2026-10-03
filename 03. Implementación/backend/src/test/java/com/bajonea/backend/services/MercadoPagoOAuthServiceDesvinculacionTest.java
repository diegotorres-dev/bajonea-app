package com.bajonea.backend.services;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.bajonea.backend.config.MercadoPagoConfig;
import com.bajonea.backend.config.PedidoTimeoutProperties;
import com.bajonea.backend.dto.response.DesvinculacionPreviaResponseDTO;
import com.bajonea.backend.entities.Comercio;
import com.bajonea.backend.entities.CuentaMercadoPago;
import com.bajonea.backend.entities.Dueno;
import com.bajonea.backend.enums.EstadoPedido;
import com.bajonea.backend.exceptions.CuentaMercadoPagoYaVinculadaException;
import com.bajonea.backend.exceptions.DesvinculacionBloqueadaException;
import com.bajonea.backend.exceptions.RecursoNoEncontradoException;
import com.bajonea.backend.repositories.CodigoVinculacionMPRepository;
import com.bajonea.backend.repositories.ComercioRepository;
import com.bajonea.backend.repositories.DuenoRepository;
import com.bajonea.backend.repositories.PedidoRepository;
import java.time.LocalDateTime;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.InOrder;

/**
 * Iniciar la vinculación, desvincular y la previa de desvinculación (multi-comercio, tramo 5). El orden de
 * bloqueo (cuenta, comercios, pedidos) se verifica con {@link InOrder}; las consultas reales con bloqueo
 * se ejercitan contra la base en {@code MercadoPagoCuentaUnicaIntegrationTest}.
 */
class MercadoPagoOAuthServiceDesvinculacionTest {

    private CuentaMercadoPagoService cuentaService;
    private ComercioService comercioService;
    private ComercioRepository comercioRepository;
    private PedidoRepository pedidoRepository;
    private DuenoRepository duenoRepository;
    private CodigoVinculacionMPRepository codigoRepository;
    private MercadoPagoOAuthService service;
    private CuentaMercadoPago cuenta;

    @BeforeEach
    void preparar() {
        cuentaService = mock(CuentaMercadoPagoService.class);
        comercioService = mock(ComercioService.class);
        comercioRepository = mock(ComercioRepository.class);
        pedidoRepository = mock(PedidoRepository.class);
        duenoRepository = mock(DuenoRepository.class);
        codigoRepository = mock(CodigoVinculacionMPRepository.class);
        PedidoTimeoutProperties timeouts = new PedidoTimeoutProperties();
        timeouts.setPagoMinutos(30);
        service = new MercadoPagoOAuthService(codigoRepository, duenoRepository, cuentaService, comercioService,
                comercioRepository, pedidoRepository, timeouts, mock(MercadoPagoConfig.class));
        cuenta = mock(CuentaMercadoPago.class);
        when(cuentaService.obtenerActivaConBloqueo(7)).thenReturn(cuenta);
    }

    private Comercio comercio(int id, String nombre) {
        Comercio comercio = mock(Comercio.class);
        when(comercio.getId()).thenReturn(id);
        when(comercio.getNombre()).thenReturn(nombre);
        return comercio;
    }

    private List<Comercio> comerciosDe(Comercio... comercios) {
        return List.of(comercios);
    }

    private List<PedidoRepository.PagoPendienteBloqueado> pagosCreadosHace(long... minutos) {
        List<PedidoRepository.PagoPendienteBloqueado> pagos = new java.util.ArrayList<>();
        for (long m : minutos) {
            pagos.add(pedidoCreadoHace(m));
        }
        return pagos;
    }

    private PedidoRepository.PagoPendienteBloqueado pedidoCreadoHace(long minutos) {
        PedidoRepository.PagoPendienteBloqueado pago = mock(PedidoRepository.PagoPendienteBloqueado.class);
        when(pago.getFechaCreacion()).thenReturn(LocalDateTime.now().minusMinutes(minutos));
        return pago;
    }

    @Test
    void iniciarConCuentaActivaDa409YNoGeneraNingunIntento() {
        when(duenoRepository.findById(7)).thenReturn(Optional.of(mock(Dueno.class)));
        when(cuentaService.buscarActivaPorDueno(7)).thenReturn(Optional.of(cuenta));

        assertThrows(CuentaMercadoPagoYaVinculadaException.class, () -> service.iniciarVinculacion(7));

        verifyNoInteractions(codigoRepository);
    }

    @Test
    void desvincularSinPagosPendientesLiberaLaCuentaYDevuelveLosComerciosAAprobado() {
        List<Comercio> comercios = comerciosDe(comercio(1, "A"), comercio(2, "B"));
        when(comercioRepository.findByDuenoIdConBloqueo(7)).thenReturn(comercios);
        when(pedidoRepository.findPendientesPagoDeComerciosConBloqueoCompartido(any())).thenReturn(List.of());

        service.desvincular(7);

        InOrder orden = inOrder(cuentaService, comercioRepository, pedidoRepository, comercioService);
        orden.verify(cuentaService).obtenerActivaConBloqueo(7);
        orden.verify(comercioRepository).findByDuenoIdConBloqueo(7);
        orden.verify(pedidoRepository).findPendientesPagoDeComerciosConBloqueoCompartido(List.of(1, 2));
        orden.verify(cuentaService).desvincular(cuenta);
        orden.verify(comercioService).desactivarAptoVenta(7);
    }

    @Test
    void desvincularConPagosPendientesDa409ConLaHoraDelMasRecienteYNoCambiaNada() {
        List<Comercio> comercios = comerciosDe(comercio(1, "A"), comercio(2, "B"));
        when(comercioRepository.findByDuenoIdConBloqueo(7)).thenReturn(comercios);
        List<PedidoRepository.PagoPendienteBloqueado> pagos = pagosCreadosHace(20, 5, 10);
        when(pedidoRepository.findPendientesPagoDeComerciosConBloqueoCompartido(any())).thenReturn(pagos);

        DesvinculacionBloqueadaException ex =
                assertThrows(DesvinculacionBloqueadaException.class, () -> service.desvincular(7));

        assertEquals(3, ex.getCantidadPagosPendientes());
        LocalDateTime esperado = LocalDateTime.now().minusMinutes(5).plusMinutes(30);
        assertTrue(Math.abs(java.time.Duration.between(esperado, ex.getPuedeReintentarDesde()).toSeconds()) < 5);
        assertTrue(ex.getMessage().startsWith("Hay 3 pedidos de clientes que todavía están pagando. Probá de nuevo alrededor de las "));
        assertTrue(ex.getMessage().endsWith("."));
        verify(cuentaService, never()).desvincular(any());
        verify(comercioService, never()).desactivarAptoVenta(any());
    }

    @Test
    void desvincularConUnSoloPagoPendienteUsaElSingular() {
        List<Comercio> comercios = comerciosDe(comercio(1, "A"));
        when(comercioRepository.findByDuenoIdConBloqueo(7)).thenReturn(comercios);
        List<PedidoRepository.PagoPendienteBloqueado> pagos = pagosCreadosHace(1);
        when(pedidoRepository.findPendientesPagoDeComerciosConBloqueoCompartido(any())).thenReturn(pagos);

        DesvinculacionBloqueadaException ex =
                assertThrows(DesvinculacionBloqueadaException.class, () -> service.desvincular(7));

        assertTrue(ex.getMessage().startsWith("Hay 1 pedido de un cliente que todavía está pagando. "));
    }

    @Test
    void desvincularSinCuentaActivaDa404YNoToca() {
        when(cuentaService.obtenerActivaConBloqueo(8))
                .thenThrow(new RecursoNoEncontradoException(CuentaMercadoPagoService.MENSAJE_SIN_CUENTA));

        RecursoNoEncontradoException ex = assertThrows(RecursoNoEncontradoException.class, () -> service.desvincular(8));

        assertEquals("El Dueño no tiene ninguna cuenta de Mercado Pago vinculada", ex.getMessage());
        verifyNoInteractions(comercioRepository, pedidoRepository, comercioService);
    }

    @Test
    void desvincularNoComparaNadaConLoQueViaElUsuario() {
        List<Comercio> comercios = comerciosDe(comercio(1, "A"));
        when(comercioRepository.findByDuenoIdConBloqueo(7)).thenReturn(comercios);
        when(pedidoRepository.findPendientesPagoDeComerciosConBloqueoCompartido(any())).thenReturn(List.of());

        service.desvincular(7);

        verify(pedidoRepository, never()).contarPorComercioYEstadoDeDueno(any(), any());
    }

    @Test
    @SuppressWarnings("unchecked")
    void previaListaTodosLosComerciosConSusPedidosEnCursoYLosPagosPendientes() {
        List<Comercio> comercios = comerciosDe(comercio(1, "A"), comercio(2, "B"), comercio(3, "C"));
        when(comercioRepository.findByDuenoIdOrderByFechaRegistroAscIdAsc(7)).thenReturn(comercios);
        LocalDateTime hace5 = LocalDateTime.now().minusMinutes(5);
        LocalDateTime hace20 = LocalDateTime.now().minusMinutes(20);
        List<Object[]> filas = List.of(
                new Object[] { 1, EstadoPedido.EN_PREPARACION, 2L, hace5 },
                new Object[] { 1, EstadoPedido.PENDIENTE_PAGO, 1L, hace5 },
                new Object[] { 2, EstadoPedido.PENDIENTE_PAGO, 2L, hace20 },
                new Object[] { 2, EstadoPedido.LISTO_PARA_RETIRAR, 4L, hace20 });
        when(pedidoRepository.contarPorComercioYEstadoDeDueno(any(), any(Collection.class))).thenReturn(filas);

        DesvinculacionPreviaResponseDTO previa = service.previaDesvinculacion(7);

        assertFalse(previa.isPuedeDesvincular());
        assertEquals(3, previa.getComercios().size());
        assertEquals(List.of(1, 2, 3), previa.getComercios().stream().map(DesvinculacionPreviaResponseDTO.ComercioPrevia::getId).toList());
        DesvinculacionPreviaResponseDTO.ComercioPrevia a = previa.getComercios().get(0);
        assertEquals(List.of("PENDIENTE_CONFIRMACION_COMERCIO", "EN_PREPARACION", "EN_CAMINO", "LISTO_PARA_RETIRAR"),
                a.getPedidosEnCurso().stream().map(DesvinculacionPreviaResponseDTO.PedidosEnCurso::getEstado).toList());
        assertEquals(List.of(0L, 2L, 0L, 0L),
                a.getPedidosEnCurso().stream().map(DesvinculacionPreviaResponseDTO.PedidosEnCurso::getCantidad).toList());
        assertEquals(1, a.getCantidadPagosPendientes());
        assertEquals(2, previa.getComercios().get(1).getCantidadPagosPendientes());
        assertEquals(0, previa.getComercios().get(2).getCantidadPagosPendientes());
        assertEquals(3, previa.getPagosPendientes().getCantidadTotal());
        assertEquals(hace5.plusMinutes(30), previa.getPagosPendientes().getPuedeReintentarDesde());
    }

    @Test
    @SuppressWarnings("unchecked")
    void previaSinPagosPendientesPermiteDesvincularYNoDaHoraDeReintento() {
        List<Comercio> comercios = comerciosDe(comercio(1, "A"));
        when(comercioRepository.findByDuenoIdOrderByFechaRegistroAscIdAsc(7)).thenReturn(comercios);
        when(pedidoRepository.contarPorComercioYEstadoDeDueno(any(), any(Collection.class))).thenReturn(List.of());

        DesvinculacionPreviaResponseDTO previa = service.previaDesvinculacion(7);

        assertTrue(previa.isPuedeDesvincular());
        assertEquals(0, previa.getPagosPendientes().getCantidadTotal());
        assertNull(previa.getPagosPendientes().getPuedeReintentarDesde());
    }

    @Test
    void previaSinCuentaActivaDa404() {
        when(cuentaService.obtenerActivaPorDueno(9))
                .thenThrow(new RecursoNoEncontradoException(CuentaMercadoPagoService.MENSAJE_SIN_CUENTA));

        assertThrows(RecursoNoEncontradoException.class, () -> service.previaDesvinculacion(9));

        verifyNoInteractions(pedidoRepository);
    }
}
