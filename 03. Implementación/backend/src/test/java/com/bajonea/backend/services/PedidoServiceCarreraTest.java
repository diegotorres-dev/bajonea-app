package com.bajonea.backend.services;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.bajonea.backend.config.PedidoTimeoutProperties;
import com.bajonea.backend.config.security.ComercioActivo;
import com.bajonea.backend.dto.request.AnulacionPedidoRequestDTO;
import com.bajonea.backend.dto.request.RechazoPedidoRequestDTO;
import com.bajonea.backend.entities.Cliente;
import com.bajonea.backend.entities.Comercio;
import com.bajonea.backend.entities.HistorialEstadoPedido;
import com.bajonea.backend.entities.Pedido;
import com.bajonea.backend.enums.EstadoComercio;
import com.bajonea.backend.enums.EstadoPagoPedido;
import com.bajonea.backend.enums.EstadoPedido;
import com.bajonea.backend.enums.MotivoRechazo;
import com.bajonea.backend.exceptions.ConflictoDeNegocioException;
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
import jakarta.persistence.LockModeType;
import java.math.BigDecimal;
import java.time.Clock;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Answers;
import org.mockito.InOrder;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.PlatformTransactionManager;

/**
 * Bloque A0 de E3: toda transición de estado de un pedido toma los usuarios involucrados (id ascendente) y después
 * el pedido con {@code PESSIMISTIC_WRITE}, y valida el estado recién después del bloqueo. Acá la "otra transacción
 * que ganó la carrera" se simula haciendo que el {@code refresh} bloqueante deje el pedido en otro estado.
 */
class PedidoServiceCarreraTest {

    private PedidoRepository pedidoRepository;
    private UsuarioRepository usuarioRepository;
    private HistorialEstadoPedidoRepository historialRepository;
    private NotificacionService notificacionService;
    private ReembolsoService reembolsoService;
    private EntityManager entityManager;
    private ComercioRepository comercioRepository;
    private ComercioActivoService comercioActivoService;
    private PedidoService pedidoService;
    private Comercio comercio;
    private Cliente cliente;

    @BeforeEach
    void preparar() {
        pedidoRepository = mock(PedidoRepository.class);
        usuarioRepository = mock(UsuarioRepository.class);
        historialRepository = mock(HistorialEstadoPedidoRepository.class);
        notificacionService = mock(NotificacionService.class);
        reembolsoService = mock(ReembolsoService.class);
        entityManager = mock(EntityManager.class);
        comercioRepository = mock(ComercioRepository.class);
        comercioActivoService = mock(ComercioActivoService.class);
        PedidoTimeoutProperties timeouts = new PedidoTimeoutProperties();
        timeouts.setPagoMinutos(30);
        timeouts.setRespuestaComercioMinutos(30);
        timeouts.setAutoconfirmacionEnCaminoMinutos(90);
        timeouts.setAvisoEnCaminoMinutos(75);
        timeouts.setRetiroSuspensionMinutos(90);

        pedidoService = new PedidoService(pedidoRepository, mock(DetallePedidoRepository.class), mock(CarritoRepository.class),
                mock(ItemCarritoRepository.class), mock(ClienteRepository.class), comercioRepository,
                mock(DireccionRepository.class), historialRepository, usuarioRepository, notificacionService,
                mock(CarritoService.class), mock(ComercioService.class), mock(ConfiguracionTarifaService.class), timeouts,
                reembolsoService, mock(NotaCreditoService.class), mock(PlatformTransactionManager.class), comercioActivoService,
                mock(EmpleadoComercioRepository.class), mock(TurnoPedidoService.class), mock(EstadoUsuarioService.class),
                Clock.systemDefaultZone());
        ReflectionTestUtils.setField(pedidoService, "entityManager", entityManager);

        ParticipantesPedido participantes = mock(ParticipantesPedido.class);
        when(participantes.getClienteId()).thenReturn(9);
        when(participantes.getDuenoId()).thenReturn(5);
        when(pedidoRepository.findParticipantesById(anyInt())).thenReturn(Optional.of(participantes));

        cliente = mock(Cliente.class, Answers.RETURNS_DEEP_STUBS);
        when(cliente.getId()).thenReturn(9);
        comercio = mock(Comercio.class, Answers.RETURNS_DEEP_STUBS);
        when(comercio.getId()).thenReturn(40);
    }

    private Pedido pedido(int id, EstadoPedido estado) {
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
                .fechaCreacion(LocalDateTime.now().minusHours(2))
                .build();
        when(pedidoRepository.findById(id)).thenReturn(Optional.of(pedido));
        when(pedidoRepository.llegoPagado(id)).thenReturn(true);
        return pedido;
    }

    private void otraTransaccionGanoLaCarrera(Pedido pedido, EstadoPedido estadoFinal) {
        doAnswer(invocacion -> {
            pedido.setEstado(estadoFinal);
            return null;
        }).when(entityManager).refresh(pedido, LockModeType.PESSIMISTIC_WRITE);
    }

    private void estadoDelComercio(int comercioId, EstadoComercio estado) {
        com.bajonea.backend.repositories.ComercioRepository.EstadoYCierreComercio lectura = mock(com.bajonea.backend.repositories.ComercioRepository.EstadoYCierreComercio.class);
        when(lectura.getEstado()).thenReturn(estado.name());
        when(comercioRepository.leerEstadoConBloqueoCompartido(comercioId)).thenReturn(Optional.of(lectura));
    }

    private ComercioActivo dueno() {
        return ComercioActivo.delDueno(40, 5, EstadoComercio.APTO_VENTA);
    }

    private void verificarQueLaPerdedoraNoEscribioNada(Pedido pedido, EstadoPedido estadoDeLaGanadora) {
        assertEquals(estadoDeLaGanadora, pedido.getEstado());
        verify(pedidoRepository, never()).save(any());
        verify(historialRepository, never()).save(any(HistorialEstadoPedido.class));
        verifyNoInteractions(notificacionService);
        verifyNoInteractions(reembolsoService);
    }

    @Test
    void tomaLosUsuariosEnIdAscendenteYDespuesElPedidoYRecienDespuesValidaElEstado() {
        Pedido pedido = pedido(10, EstadoPedido.PENDIENTE_CONFIRMACION_COMERCIO);
        ComercioActivo actor = new ComercioActivo(40, 5, 12, com.bajonea.backend.enums.RolActorComercio.EMPLEADO,
                EstadoComercio.APTO_VENTA);
        estadoDelComercio(40, EstadoComercio.APTO_VENTA);

        pedidoService.aceptarPedido(actor, 10);

        InOrder orden = inOrder(usuarioRepository, comercioActivoService, comercioRepository, entityManager);
        orden.verify(usuarioRepository).leerEstadoCuentaConBloqueoCompartido(5);
        orden.verify(usuarioRepository).leerEstadoCuentaConBloqueoCompartido(9);
        orden.verify(usuarioRepository).leerEstadoCuentaConBloqueoCompartido(12);
        orden.verify(comercioActivoService).exigirRelacionActiva(actor);
        orden.verify(comercioRepository).leerEstadoConBloqueoCompartido(40);
        orden.verify(entityManager).refresh(pedido, LockModeType.PESSIMISTIC_WRITE);
        assertEquals(EstadoPedido.EN_PREPARACION, pedido.getEstado());
    }

    @Test
    void aceptarContraUnRechazoGanadorDaConflictoSinHistorialNiAviso() {
        Pedido pedido = pedido(11, EstadoPedido.PENDIENTE_CONFIRMACION_COMERCIO);
        otraTransaccionGanoLaCarrera(pedido, EstadoPedido.RECHAZADO);

        assertThrows(ConflictoDeNegocioException.class, () -> pedidoService.aceptarPedido(dueno(), 11));

        verificarQueLaPerdedoraNoEscribioNada(pedido, EstadoPedido.RECHAZADO);
    }

    @Test
    void rechazarContraUnaAceptacionGanadoraNoDisparaReembolsoNiAviso() {
        Pedido pedido = pedido(12, EstadoPedido.PENDIENTE_CONFIRMACION_COMERCIO);
        otraTransaccionGanoLaCarrera(pedido, EstadoPedido.EN_PREPARACION);

        assertThrows(ConflictoDeNegocioException.class,
                () -> pedidoService.rechazarPedido(dueno(), 12, new RechazoPedidoRequestDTO(MotivoRechazo.SIN_STOCK, null)));

        verificarQueLaPerdedoraNoEscribioNada(pedido, EstadoPedido.EN_PREPARACION);
    }

    @Test
    void anularContraUnDespachoGanadorNoCreaNotaNiAviso() {
        Pedido pedido = pedido(13, EstadoPedido.EN_PREPARACION);
        otraTransaccionGanoLaCarrera(pedido, EstadoPedido.EN_CAMINO);

        assertThrows(ConflictoDeNegocioException.class,
                () -> pedidoService.anularPedido(dueno(), 13, new AnulacionPedidoRequestDTO(com.bajonea.backend.enums.MotivoRechazo.OTRO, "x")));

        verificarQueLaPerdedoraNoEscribioNada(pedido, EstadoPedido.EN_CAMINO);
    }

    @Test
    void despacharContraUnaAnulacionGanadoraDaConflicto() {
        Pedido pedido = pedido(14, EstadoPedido.EN_PREPARACION);
        otraTransaccionGanoLaCarrera(pedido, EstadoPedido.ANULADO);

        assertThrows(ConflictoDeNegocioException.class, () -> pedidoService.avanzarAEntregaEnCurso(dueno(), 14));

        verificarQueLaPerdedoraNoEscribioNada(pedido, EstadoPedido.ANULADO);
    }

    @Test
    void entregarContraUnaEntregaGanadoraDaConflicto() {
        Pedido pedido = pedido(15, EstadoPedido.LISTO_PARA_RETIRAR);
        otraTransaccionGanoLaCarrera(pedido, EstadoPedido.ENTREGADO);

        assertThrows(ConflictoDeNegocioException.class, () -> pedidoService.confirmarEntregaComercio(dueno(), 15));

        verificarQueLaPerdedoraNoEscribioNada(pedido, EstadoPedido.ENTREGADO);
    }

    @Test
    void cancelarDelClienteContraUnaAceptacionYaResueltaDaConflictoSiElPedidoSalioDeLosEstadosCancelables() {
        Pedido pedido = pedido(16, EstadoPedido.EN_PREPARACION);
        otraTransaccionGanoLaCarrera(pedido, EstadoPedido.EN_CAMINO);

        assertThrows(ConflictoDeNegocioException.class, () -> pedidoService.cancelarPedido(9, 16));

        verificarQueLaPerdedoraNoEscribioNada(pedido, EstadoPedido.EN_CAMINO);
    }

    @Test
    void confirmarEntregaDelClienteContraLaAutoconfirmacionGanadoraDaConflicto() {
        Pedido pedido = pedido(17, EstadoPedido.EN_CAMINO);
        otraTransaccionGanoLaCarrera(pedido, EstadoPedido.ENTREGADO);

        assertThrows(ConflictoDeNegocioException.class, () -> pedidoService.confirmarEntregaCliente(9, 17));

        verificarQueLaPerdedoraNoEscribioNada(pedido, EstadoPedido.ENTREGADO);
    }

    @Test
    void elProcesoDeExpiracionNoExpiraUnPedidoQueElComercioYaAcepto() {
        Pedido pedido = pedido(18, EstadoPedido.PENDIENTE_CONFIRMACION_COMERCIO);
        when(pedidoRepository.findIdsByEstado(EstadoPedido.PENDIENTE_CONFIRMACION_COMERCIO)).thenReturn(List.of(18));
        otraTransaccionGanoLaCarrera(pedido, EstadoPedido.EN_PREPARACION);

        pedidoService.expirarPedidosSinRespuestaComercio(LocalDateTime.now().plusHours(5));

        verificarQueLaPerdedoraNoEscribioNada(pedido, EstadoPedido.EN_PREPARACION);
    }

    @Test
    void elProcesoDeAutoconfirmacionNoTocaUnPedidoQueElClienteYaConfirmo() {
        Pedido pedido = pedido(19, EstadoPedido.EN_CAMINO);
        when(pedidoRepository.findIdsByEstado(EstadoPedido.EN_CAMINO)).thenReturn(List.of(19));
        when(historialRepository.findTopByPedidoIdAndEstadoOrderByFechaHoraDesc(19, EstadoPedido.EN_CAMINO))
                .thenReturn(Optional.of(HistorialEstadoPedido.builder().fechaHora(LocalDateTime.now().minusHours(3)).build()));
        otraTransaccionGanoLaCarrera(pedido, EstadoPedido.ENTREGADO);

        pedidoService.avisar75MinYAutoconfirmar(LocalDateTime.now());

        verificarQueLaPerdedoraNoEscribioNada(pedido, EstadoPedido.ENTREGADO);
    }

    @Test
    void elProcesoDeVencimientoDePagoNoCancelaUnPedidoQueElWebhookYaPago() {
        Pedido pedido = pedido(20, EstadoPedido.PENDIENTE_PAGO);
        when(pedidoRepository.findIdsByEstadoAndFechaCreacionBefore(eq(EstadoPedido.PENDIENTE_PAGO), any())).thenReturn(List.of(20));
        otraTransaccionGanoLaCarrera(pedido, EstadoPedido.PENDIENTE_CONFIRMACION_COMERCIO);

        pedidoService.expirarPagosVencidos(LocalDateTime.now());

        verificarQueLaPerdedoraNoEscribioNada(pedido, EstadoPedido.PENDIENTE_CONFIRMACION_COMERCIO);
    }

    @Test
    void elProcesoDeRetiroPorSuspensionNoTocaUnRetiroQueElComercioYaEntrego() {
        Pedido pedido = pedido(21, EstadoPedido.LISTO_PARA_RETIRAR);
        pedido.setSuspensionRetiroExpira(LocalDateTime.now().minusMinutes(5));
        when(pedidoRepository.findIdsByEstadoAndSuspensionRetiroExpiraLessThan(eq(EstadoPedido.LISTO_PARA_RETIRAR), any()))
                .thenReturn(List.of(21));
        otraTransaccionGanoLaCarrera(pedido, EstadoPedido.ENTREGADO);

        pedidoService.autoconfirmarRetirosPorSuspension(LocalDateTime.now());

        verificarQueLaPerdedoraNoEscribioNada(pedido, EstadoPedido.ENTREGADO);
    }

    @Test
    void laSuspensionDelComercioSaltaLosPedidosQueYaSeResolvieron() {
        Pedido pedido = pedido(22, EstadoPedido.EN_PREPARACION);
        when(pedidoRepository.findIdsByComercioIdAndEstadoIn(eq(40),
                eq(List.of(EstadoPedido.PENDIENTE_CONFIRMACION_COMERCIO, EstadoPedido.EN_PREPARACION)))).thenReturn(List.of(22));
        otraTransaccionGanoLaCarrera(pedido, EstadoPedido.ANULADO);

        pedidoService.cancelarPedidosPorSuspensionComercio(40);

        verificarQueLaPerdedoraNoEscribioNada(pedido, EstadoPedido.ANULADO);
    }

    @Test
    void elWebhookQueLlegaConElPedidoYaPagadoNoRepiteNiHistorialNiAviso() {
        Pedido pedido = pedido(23, EstadoPedido.PENDIENTE_PAGO);
        otraTransaccionGanoLaCarrera(pedido, EstadoPedido.PENDIENTE_CONFIRMACION_COMERCIO);

        pedidoService.confirmarPagoAprobado(23);

        verificarQueLaPerdedoraNoEscribioNada(pedido, EstadoPedido.PENDIENTE_CONFIRMACION_COMERCIO);
    }
}
