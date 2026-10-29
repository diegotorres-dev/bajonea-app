package com.bajonea.backend.services;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.bajonea.backend.config.PedidoTimeoutProperties;
import com.bajonea.backend.config.security.ComercioActivo;
import com.bajonea.backend.entities.Cliente;
import com.bajonea.backend.entities.Comercio;
import com.bajonea.backend.entities.HistorialEstadoPedido;
import com.bajonea.backend.entities.Pedido;
import com.bajonea.backend.enums.EstadoComercio;
import com.bajonea.backend.enums.EstadoPagoPedido;
import com.bajonea.backend.enums.EstadoPedido;
import com.bajonea.backend.repositories.CarritoRepository;
import com.bajonea.backend.repositories.ClienteRepository;
import com.bajonea.backend.repositories.ComercioRepository;
import com.bajonea.backend.repositories.DetallePedidoRepository;
import com.bajonea.backend.repositories.DireccionRepository;
import com.bajonea.backend.repositories.EmpleadoComercioRepository;
import com.bajonea.backend.repositories.HistorialEstadoPedidoRepository;
import com.bajonea.backend.repositories.ItemCarritoRepository;
import com.bajonea.backend.repositories.PedidoRepository;
import com.bajonea.backend.repositories.PedidoRepository.ParticipantesPedido;
import com.bajonea.backend.repositories.UsuarioRepository;
import jakarta.persistence.EntityManager;
import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Answers;
import org.mockito.ArgumentCaptor;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.PlatformTransactionManager;

/**
 * Toda hora que {@code PedidoService} escribe o compara sale del reloj de la aplicación, no de la zona de la JVM:
 * el reloj de estas pruebas está en una zona muy distinta de la de cualquier máquina de desarrollo, así que si el
 * servicio usara {@code LocalDateTime.now()} suelto los valores no coincidirían.
 */
class PedidoServiceRelojTest {

    private static final ZoneId ZONA_LEJANA = ZoneId.of("Pacific/Auckland");
    private static final Clock RELOJ = Clock.fixed(Instant.parse("2026-10-13T20:00:00Z"), ZONA_LEJANA);
    private static final LocalDateTime AHORA = LocalDateTime.of(2026, 10, 14, 9, 0, 0);

    private PedidoRepository pedidoRepository;
    private HistorialEstadoPedidoRepository historialRepository;
    private ComercioRepository comercioRepository;
    private PedidoService pedidoService;
    private Comercio comercio;
    private Cliente cliente;

    @BeforeEach
    void preparar() {
        pedidoRepository = mock(PedidoRepository.class);
        historialRepository = mock(HistorialEstadoPedidoRepository.class);
        comercioRepository = mock(ComercioRepository.class);
        PedidoTimeoutProperties timeouts = new PedidoTimeoutProperties();
        timeouts.setPagoMinutos(30);
        timeouts.setRespuestaComercioMinutos(30);
        timeouts.setAutoconfirmacionEnCaminoMinutos(90);
        timeouts.setAvisoEnCaminoMinutos(75);
        timeouts.setRetiroSuspensionMinutos(90);
        pedidoService = new PedidoService(pedidoRepository, mock(DetallePedidoRepository.class), mock(CarritoRepository.class),
                mock(ItemCarritoRepository.class), mock(ClienteRepository.class), comercioRepository,
                mock(DireccionRepository.class), historialRepository, mock(UsuarioRepository.class), mock(NotificacionService.class),
                mock(CarritoService.class), mock(ComercioService.class), mock(ConfiguracionTarifaService.class), timeouts,
                mock(ReembolsoService.class), mock(NotaCreditoService.class), mock(PlatformTransactionManager.class),
                mock(ComercioActivoService.class), mock(EmpleadoComercioRepository.class), mock(TurnoPedidoService.class), mock(EstadoUsuarioService.class), RELOJ);
        ReflectionTestUtils.setField(pedidoService, "entityManager", mock(EntityManager.class));

        ParticipantesPedido participantes = mock(ParticipantesPedido.class);
        when(participantes.getClienteId()).thenReturn(9);
        when(participantes.getDuenoId()).thenReturn(5);
        when(pedidoRepository.findParticipantesById(anyInt())).thenReturn(Optional.of(participantes));
        cliente = mock(Cliente.class, Answers.RETURNS_DEEP_STUBS);
        when(cliente.getId()).thenReturn(9);
        comercio = mock(Comercio.class, Answers.RETURNS_DEEP_STUBS);
        when(comercio.getId()).thenReturn(40);
    }

    private Pedido pedido(int id, EstadoPedido estado, LocalDateTime fechaCreacion) {
        Pedido pedido = Pedido.builder()
                .id(id)
                .cliente(cliente)
                .comercio(comercio)
                .estado(estado)
                .pagoEstado(EstadoPagoPedido.PAGADO)
                .subtotal(new BigDecimal("10000"))
                .cargoServicioCliente(new BigDecimal("200"))
                .cargoServicioComercio(new BigDecimal("100"))
                .total(new BigDecimal("10200"))
                .fechaCreacion(fechaCreacion)
                .build();
        when(pedidoRepository.findById(id)).thenReturn(Optional.of(pedido));
        when(pedidoRepository.llegoPagado(id)).thenReturn(true);
        return pedido;
    }

    private HistorialEstadoPedido ultimoHistorialGuardado() {
        ArgumentCaptor<HistorialEstadoPedido> captor = ArgumentCaptor.forClass(HistorialEstadoPedido.class);
        verify(historialRepository).save(captor.capture());
        return captor.getValue();
    }

    @Test
    void elHistorialDeUnaAccionDelComercioSeEscribeConLaHoraDelRelojDeLaAplicacionSinFracciones() {
        pedido(10, EstadoPedido.PENDIENTE_CONFIRMACION_COMERCIO, AHORA.minusMinutes(5));
        ComercioRepository.EstadoYCierreComercio lectura = mock(ComercioRepository.EstadoYCierreComercio.class);
        when(lectura.getEstado()).thenReturn(EstadoComercio.APTO_VENTA.name());
        when(comercioRepository.leerEstadoConBloqueoCompartido(40)).thenReturn(Optional.of(lectura));

        pedidoService.aceptarPedido(ComercioActivo.delDueno(40, 5, EstadoComercio.APTO_VENTA), 10);

        assertEquals(AHORA, ultimoHistorialGuardado().getFechaHora());
    }

    @Test
    void laLlegadaDelPedidoPagadoSeEscribeConLaHoraDelRelojDeLaAplicacion() {
        Pedido pedido = pedido(11, EstadoPedido.PENDIENTE_PAGO, AHORA.minusMinutes(5));

        pedidoService.confirmarPagoAprobado(11);

        assertEquals(EstadoPedido.PENDIENTE_CONFIRMACION_COMERCIO, pedido.getEstado());
        assertEquals(AHORA, ultimoHistorialGuardado().getFechaHora());
    }

    @Test
    void laEntregaGuardaSuFechaConElRelojDeLaAplicacion() {
        Pedido pedido = pedido(12, EstadoPedido.EN_CAMINO, AHORA.minusHours(1));

        pedidoService.confirmarEntregaCliente(9, 12);

        assertEquals(AHORA, pedido.getFechaEntrega());
    }

    @Test
    void elProcesoDeExpiracionDePagoComparaContraElRelojDeLaAplicacion() {
        Pedido vencido = pedido(13, EstadoPedido.PENDIENTE_PAGO, AHORA.minusMinutes(31));
        Pedido vigente = pedido(14, EstadoPedido.PENDIENTE_PAGO, AHORA.minusMinutes(29));
        when(pedidoRepository.findIdsByEstadoAndFechaCreacionBefore(eq(EstadoPedido.PENDIENTE_PAGO), any()))
                .thenReturn(List.of(13, 14));

        pedidoService.expirarPagosVencidos();

        ArgumentCaptor<LocalDateTime> corte = ArgumentCaptor.forClass(LocalDateTime.class);
        verify(pedidoRepository).findIdsByEstadoAndFechaCreacionBefore(eq(EstadoPedido.PENDIENTE_PAGO), corte.capture());
        assertEquals(AHORA.minusMinutes(30), corte.getValue());
        assertEquals(EstadoPedido.CANCELADO_POR_SISTEMA, vencido.getEstado());
        assertEquals(EstadoPedido.PENDIENTE_PAGO, vigente.getEstado());
    }

    @Test
    void elTopeDePreparacionPorSuspensionSeComparaContraElRelojDeLaAplicacion() {
        Pedido vencido = pedido(15, EstadoPedido.EN_PREPARACION, AHORA.minusHours(5));
        ComercioRepository.EstadoYCierreComercio lectura = mock(ComercioRepository.EstadoYCierreComercio.class);
        when(lectura.getEstado()).thenReturn(EstadoComercio.SUSPENDIDO.name());
        when(lectura.getSuspendidoDesde()).thenReturn(AHORA.minusMinutes(91));
        when(comercioRepository.leerEstadoConBloqueoCompartido(any())).thenReturn(Optional.of(lectura));
        when(pedidoRepository.findIdsDeComerciosSuspendidosDesde(eq(EstadoPedido.EN_PREPARACION), any())).thenReturn(List.of(15));

        pedidoService.cancelarPreparacionPorSuspension();

        ArgumentCaptor<LocalDateTime> corte = ArgumentCaptor.forClass(LocalDateTime.class);
        verify(pedidoRepository).findIdsDeComerciosSuspendidosDesde(eq(EstadoPedido.EN_PREPARACION), corte.capture());
        assertEquals(AHORA.minusMinutes(90), corte.getValue());
        assertEquals(EstadoPedido.CANCELADO_POR_SISTEMA, vencido.getEstado());
        assertEquals(AHORA, ultimoHistorialGuardado().getFechaHora());
    }
}
