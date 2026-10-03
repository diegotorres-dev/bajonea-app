package com.bajonea.backend.services;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.bajonea.backend.config.PedidoTimeoutProperties;
import com.bajonea.backend.config.security.ComercioActivo;
import com.bajonea.backend.dto.request.RechazoPedidoRequestDTO;
import com.bajonea.backend.entities.Cliente;
import com.bajonea.backend.entities.Comercio;
import com.bajonea.backend.entities.HistorialEstadoPedido;
import com.bajonea.backend.entities.NotaCredito;
import com.bajonea.backend.entities.Pedido;
import com.bajonea.backend.enums.EstadoNotaCredito;
import com.bajonea.backend.enums.EstadoPagoPedido;
import com.bajonea.backend.enums.EstadoPedido;
import com.bajonea.backend.enums.MotivoNotaCredito;
import com.bajonea.backend.enums.MotivoRechazo;
import com.bajonea.backend.enums.TipoNotificacion;
import com.bajonea.backend.repositories.CarritoRepository;
import com.bajonea.backend.repositories.ClienteRepository;
import com.bajonea.backend.repositories.ComercioRepository;
import com.bajonea.backend.repositories.DetallePedidoRepository;
import com.bajonea.backend.repositories.DireccionRepository;
import com.bajonea.backend.repositories.HistorialEstadoPedidoRepository;
import com.bajonea.backend.repositories.ItemCarritoRepository;
import com.bajonea.backend.repositories.PedidoRepository;
import com.bajonea.backend.repositories.UsuarioRepository;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Answers;

class PedidoServiceReembolsoTest {

    private PedidoRepository pedidoRepository;
    private ComercioRepository comercioRepository;
    private HistorialEstadoPedidoRepository historialRepository;
    private NotificacionService notificacionService;
    private NotaCreditoService notaCreditoService;
    private ReembolsoService reembolsoService;
    private PedidoTimeoutProperties timeouts;
    private PedidoService pedidoService;

    private Cliente cliente;
    private Comercio comercio;

    @BeforeEach
    void preparar() {
        pedidoRepository = mock(PedidoRepository.class);
        comercioRepository = mock(ComercioRepository.class);
        historialRepository = mock(HistorialEstadoPedidoRepository.class);
        notificacionService = mock(NotificacionService.class);
        notaCreditoService = mock(NotaCreditoService.class);
        reembolsoService = mock(ReembolsoService.class);
        timeouts = new PedidoTimeoutProperties();
        timeouts.setPagoMinutos(30);
        timeouts.setRespuestaComercioMinutos(30);
        timeouts.setRetiroSuspensionMinutos(90);

        pedidoService = new PedidoService(
                pedidoRepository,
                mock(DetallePedidoRepository.class),
                mock(CarritoRepository.class),
                mock(ItemCarritoRepository.class),
                mock(ClienteRepository.class),
                comercioRepository,
                mock(DireccionRepository.class),
                historialRepository,
                mock(UsuarioRepository.class),
                notificacionService,
                mock(CarritoService.class),
                mock(ComercioService.class),
                mock(ConfiguracionTarifaService.class),
                timeouts,
                reembolsoService,
                notaCreditoService);

        cliente = mock(Cliente.class, Answers.RETURNS_DEEP_STUBS);
        comercio = mock(Comercio.class, Answers.RETURNS_DEEP_STUBS);
        when(comercio.getId()).thenReturn(40);
    }

    private Pedido pedido(int id, EstadoPedido estado, EstadoPagoPedido pagoEstado) {
        return Pedido.builder()
                .id(id)
                .cliente(cliente)
                .comercio(comercio)
                .estado(estado)
                .pagoEstado(pagoEstado)
                .subtotal(new BigDecimal("10000"))
                .cargoServicioCliente(new BigDecimal("200"))
                .cargoServicioComercio(new BigDecimal("100"))
                .total(new BigDecimal("10200"))
                .fechaCreacion(LocalDateTime.now().minusHours(2))
                .build();
    }

    private HistorialEstadoPedido entradaHaceMinutos(long minutos) {
        return HistorialEstadoPedido.builder().fechaHora(LocalDateTime.now().minusMinutes(minutos)).build();
    }

    @Test
    void rechazarPedidoPagadoDisparaReembolsoPorRechazoDelComercio() {
        Pedido pedido = pedido(10, EstadoPedido.PENDIENTE_CONFIRMACION_COMERCIO, EstadoPagoPedido.PAGADO);
        when(pedidoRepository.findById(10)).thenReturn(Optional.of(pedido));
        when(pedidoRepository.llegoPagado(10)).thenReturn(true);

        pedidoService.rechazarPedido(new ComercioActivo(comercio.getId(), 5), 10, new RechazoPedidoRequestDTO(MotivoRechazo.SIN_STOCK, null));

        assertEquals(EstadoPedido.RECHAZADO, pedido.getEstado());
        verify(reembolsoService).procesarReembolsoTotal(pedido, MotivoNotaCredito.RECHAZO_COMERCIO);
    }

    @Test
    void expirarPedidoSinRespuestaDisparaReembolsoYAvisaConElPlazoRealDe30Minutos() {
        Pedido vencido = pedido(20, EstadoPedido.PENDIENTE_CONFIRMACION_COMERCIO, EstadoPagoPedido.PAGADO);
        when(pedidoRepository.findByEstado(EstadoPedido.PENDIENTE_CONFIRMACION_COMERCIO)).thenReturn(List.of(vencido));
        when(historialRepository.findTopByPedidoIdAndEstadoOrderByFechaHoraDesc(20, EstadoPedido.PENDIENTE_CONFIRMACION_COMERCIO))
                .thenReturn(Optional.of(entradaHaceMinutos(31)));

        pedidoService.expirarPedidosSinRespuestaComercio();

        assertEquals(EstadoPedido.EXPIRADO, vencido.getEstado());
        verify(reembolsoService).procesarReembolsoTotal(vencido, MotivoNotaCredito.EXPIRACION_SIN_RESPUESTA);
        verify(notificacionService).crear(anyInt(),
                org.mockito.ArgumentMatchers.argThat(mensaje -> mensaje.contains("30 minutos") && !mensaje.contains("1 hora")
                        && !mensaje.contains("reembolso está en proceso")),
                eq(TipoNotificacion.PEDIDO_EXPIRADO_CLIENTE), any(), eq(20));
    }

    @Test
    void pedidoDentroDelPlazoDeRespuestaNoExpiraNiReembolsa() {
        Pedido reciente = pedido(21, EstadoPedido.PENDIENTE_CONFIRMACION_COMERCIO, EstadoPagoPedido.PAGADO);
        when(pedidoRepository.findByEstado(EstadoPedido.PENDIENTE_CONFIRMACION_COMERCIO)).thenReturn(List.of(reciente));
        when(historialRepository.findTopByPedidoIdAndEstadoOrderByFechaHoraDesc(21, EstadoPedido.PENDIENTE_CONFIRMACION_COMERCIO))
                .thenReturn(Optional.of(entradaHaceMinutos(29)));

        pedidoService.expirarPedidosSinRespuestaComercio();

        assertEquals(EstadoPedido.PENDIENTE_CONFIRMACION_COMERCIO, reciente.getEstado());
        verifyNoInteractions(reembolsoService);
    }

    @Test
    void suspensionDeComercioReembolsaLosPedidosPagadosQueCancelaElSistema() {
        Pedido enPreparacion = pedido(30, EstadoPedido.EN_PREPARACION, EstadoPagoPedido.PAGADO);
        when(pedidoRepository.findByComercioIdAndEstadoIn(eq(40), any())).thenReturn(List.of(enPreparacion));

        pedidoService.cancelarPedidosPorSuspensionComercio(40);

        assertEquals(EstadoPedido.CANCELADO_POR_SISTEMA, enPreparacion.getEstado());
        verify(reembolsoService).procesarReembolsoTotal(enPreparacion, MotivoNotaCredito.SUSPENSION_COMERCIO);
    }

    @Test
    void canceladoPorSistemaSinPagoConfirmadoNuncaLlamaAlReembolso() {
        Pedido sinPagar = pedido(31, EstadoPedido.PENDIENTE_CONFIRMACION_COMERCIO, EstadoPagoPedido.PENDIENTE);
        when(pedidoRepository.findByComercioIdAndEstadoIn(eq(40), any())).thenReturn(List.of(sinPagar));

        pedidoService.cancelarPedidosPorSuspensionComercio(40);

        assertEquals(EstadoPedido.CANCELADO_POR_SISTEMA, sinPagar.getEstado());
        verifyNoInteractions(reembolsoService);
    }

    @Test
    void timeoutDePagoNoConfirmadoCancelaSinReembolso() {
        Pedido sinPagar = pedido(32, EstadoPedido.PENDIENTE_PAGO, EstadoPagoPedido.PENDIENTE);
        when(pedidoRepository.findByEstadoAndFechaCreacionBefore(eq(EstadoPedido.PENDIENTE_PAGO), any())).thenReturn(List.of(sinPagar));

        pedidoService.expirarPagosVencidos();

        assertEquals(EstadoPedido.CANCELADO_POR_SISTEMA, sinPagar.getEstado());
        verifyNoInteractions(reembolsoService);
    }

    @Test
    void cancelarYAnularSiguenSinReembolsoHastaLaTarea2() {
        Pedido pedido = pedido(40, EstadoPedido.EN_PREPARACION, EstadoPagoPedido.PAGADO);
        when(pedidoRepository.findById(40)).thenReturn(Optional.of(pedido));
        when(cliente.getId()).thenReturn(9);

        pedidoService.cancelarPedido(9, 40);

        assertEquals(EstadoPedido.CANCELADO, pedido.getEstado());
        verify(reembolsoService, never()).procesarReembolsoTotal(any(), any());
    }

    @Test
    void elDetalleDelPedidoExponeElEstadoRealDeLaNotaDeCredito() {
        Pedido pedido = pedido(50, EstadoPedido.EXPIRADO, EstadoPagoPedido.PAGADO);
        when(cliente.getId()).thenReturn(9);
        when(pedidoRepository.findByClienteId(9)).thenReturn(List.of(pedido));
        var pago = com.bajonea.backend.entities.Pago.builder().id(1).pedido(pedido).build();
        NotaCredito nota = NotaCredito.builder().id(3).pago(pago).monto(new BigDecimal("10200.00"))
                .estado(EstadoNotaCredito.PROCESADO).intentos(1).build();
        when(notaCreditoService.listarPorPedidos(List.of(50))).thenReturn(List.of(nota));

        var dto = pedidoService.listarPedidosCliente(9).get(0);

        assertEquals(EstadoNotaCredito.PROCESADO, dto.getReembolsoEstado());
        assertEquals(0, new BigDecimal("10200.00").compareTo(dto.getReembolsoMonto()));
    }

    @Test
    void pedidoSinNotaDeCreditoNoExponeReembolso() {
        Pedido pedido = pedido(51, EstadoPedido.EXPIRADO, EstadoPagoPedido.PAGADO);
        when(cliente.getId()).thenReturn(9);
        when(pedidoRepository.findByClienteId(9)).thenReturn(List.of(pedido));
        when(notaCreditoService.listarPorPedidos(anyList())).thenReturn(List.of());

        var dto = pedidoService.listarPedidosCliente(9).get(0);

        assertEquals(null, dto.getReembolsoEstado());
        assertEquals(null, dto.getReembolsoMonto());
    }

    private static <T> List<T> anyList() {
        return org.mockito.ArgumentMatchers.anyList();
    }
}
