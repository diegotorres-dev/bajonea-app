package com.bajonea.backend.services;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.bajonea.backend.config.PedidoTimeoutProperties;
import com.bajonea.backend.config.security.ComercioActivo;
import com.bajonea.backend.entities.Cliente;
import com.bajonea.backend.entities.Comercio;
import com.bajonea.backend.entities.HistorialEstadoPedido;
import com.bajonea.backend.entities.Pedido;
import com.bajonea.backend.enums.ActorPedido;
import com.bajonea.backend.enums.EstadoComercio;
import com.bajonea.backend.enums.EstadoPagoPedido;
import com.bajonea.backend.enums.EstadoPedido;
import com.bajonea.backend.enums.MotivoTimeoutPedido;
import com.bajonea.backend.enums.RolActorComercio;
import com.bajonea.backend.enums.TipoEntidadNotificacion;
import com.bajonea.backend.enums.TipoEntrega;
import com.bajonea.backend.enums.TipoNotificacion;
import com.bajonea.backend.exceptions.ConflictoComercioException;
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
import java.time.ZoneId;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Answers;
import org.mockito.ArgumentCaptor;
import org.mockito.InOrder;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.PlatformTransactionManager;

/**
 * Cierre de un retiro como {@code NO_RETIRADO} (bloque A4b de E3): la espera mínima con el reloj controlado, solo
 * desde {@code LISTO_PARA_RETIRAR} y solo en retiro, sin nota de crédito ni reembolso, el aviso T36 solo al Cliente,
 * el orden de bloqueos, la perdedora de una carrera que no escribe nada y el proceso automático del comercio
 * suspendido, que cierra con el mismo estado y el mismo aviso y sin la espera.
 */
class PedidoNoRetiradoServiceTest {

    private static final ZoneId ZONA = ZoneId.of("America/Argentina/Ushuaia");
    private static final LocalDateTime AHORA = LocalDateTime.of(2026, 10, 14, 15, 0, 0);
    private static final Clock RELOJ = Clock.fixed(AHORA.atZone(ZONA).toInstant(), ZONA);
    private static final String TEXTO_T36 = "Tu pedido #%d no fue retirado y el comercio lo cerró. "
            + "Como ya estaba preparado, no hay devolución del pago.";

    private PedidoRepository pedidoRepository;
    private UsuarioRepository usuarioRepository;
    private HistorialEstadoPedidoRepository historialRepository;
    private NotificacionService notificacionService;
    private ReembolsoService reembolsoService;
    private NotaCreditoService notaCreditoService;
    private EntityManager entityManager;
    private ComercioActivoService comercioActivoService;
    private PedidoTimeoutProperties timeouts;
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
        notaCreditoService = mock(NotaCreditoService.class);
        entityManager = mock(EntityManager.class);
        comercioActivoService = mock(ComercioActivoService.class);
        timeouts = new PedidoTimeoutProperties();
        timeouts.setPagoMinutos(30);
        timeouts.setRespuestaComercioMinutos(30);
        timeouts.setAutoconfirmacionEnCaminoMinutos(90);
        timeouts.setAvisoEnCaminoMinutos(75);
        timeouts.setRetiroSuspensionMinutos(90);

        pedidoService = new PedidoService(pedidoRepository, mock(DetallePedidoRepository.class), mock(CarritoRepository.class),
                mock(ItemCarritoRepository.class), mock(ClienteRepository.class), mock(ComercioRepository.class),
                mock(DireccionRepository.class), historialRepository, usuarioRepository, notificacionService,
                mock(CarritoService.class), mock(ComercioService.class), mock(ConfiguracionTarifaService.class), timeouts,
                reembolsoService, notaCreditoService, mock(PlatformTransactionManager.class), comercioActivoService,
                mock(EmpleadoComercioRepository.class), mock(TurnoPedidoService.class), RELOJ);
        ReflectionTestUtils.setField(pedidoService, "entityManager", entityManager);

        ParticipantesPedido participantes = mock(ParticipantesPedido.class);
        when(participantes.getClienteId()).thenReturn(9);
        when(participantes.getDuenoId()).thenReturn(5);
        when(pedidoRepository.findParticipantesById(anyInt())).thenReturn(Optional.of(participantes));

        cliente = mock(Cliente.class, Answers.RETURNS_DEEP_STUBS);
        when(cliente.getId()).thenReturn(9);
        when(cliente.getPersonaFisica().getPersona().getUsuario().getId()).thenReturn(9);
        comercio = mock(Comercio.class, Answers.RETURNS_DEEP_STUBS);
        when(comercio.getId()).thenReturn(40);
    }

    private Pedido pedido(int id, EstadoPedido estado, TipoEntrega tipoEntrega, LocalDateTime listoDesde) {
        Pedido pedido = Pedido.builder()
                .id(id)
                .cliente(cliente)
                .comercio(comercio)
                .estado(estado)
                .tipoEntrega(tipoEntrega)
                .pagoEstado(EstadoPagoPedido.PAGADO)
                .subtotal(new BigDecimal("10000"))
                .cargoServicioCliente(new BigDecimal("200"))
                .cargoServicioComercio(new BigDecimal("100"))
                .total(new BigDecimal("10200"))
                .fechaCreacion(AHORA.minusHours(5))
                .build();
        when(pedidoRepository.findById(id)).thenReturn(Optional.of(pedido));
        when(pedidoRepository.llegoPagado(id)).thenReturn(true);
        if (listoDesde != null) {
            when(historialRepository.findTopByPedidoIdAndEstadoOrderByFechaHoraDesc(id, EstadoPedido.LISTO_PARA_RETIRAR))
                    .thenReturn(Optional.of(HistorialEstadoPedido.builder().fechaHora(listoDesde).build()));
        }
        return pedido;
    }

    private Pedido listoParaRetirar(int id, int minutosListo) {
        return pedido(id, EstadoPedido.LISTO_PARA_RETIRAR, TipoEntrega.RETIRO, AHORA.minusMinutes(minutosListo));
    }

    private ComercioActivo dueno() {
        return ComercioActivo.delDueno(40, 5, EstadoComercio.APTO_VENTA);
    }

    private ComercioActivo empleado(int usuarioId) {
        return new ComercioActivo(40, 5, usuarioId, RolActorComercio.EMPLEADO, EstadoComercio.APTO_VENTA);
    }

    private void verificarQueNoSeEscribioNada(Pedido pedido, EstadoPedido estadoEsperado) {
        assertEquals(estadoEsperado, pedido.getEstado());
        verify(pedidoRepository, never()).save(any());
        verify(historialRepository, never()).save(any(HistorialEstadoPedido.class));
        verifyNoInteractions(notificacionService);
        verifyNoInteractions(reembolsoService);
    }

    private HistorialEstadoPedido historialGuardado() {
        ArgumentCaptor<HistorialEstadoPedido> captor = ArgumentCaptor.forClass(HistorialEstadoPedido.class);
        verify(historialRepository).save(captor.capture());
        return captor.getValue();
    }

    @Test
    void antesDeLaEsperaResponde409ConLosMinutosQueFaltanYNoEscribeNada() {
        Pedido pedido = listoParaRetirar(10, 30);

        ConflictoComercioException ex = assertThrows(ConflictoComercioException.class,
                () -> pedidoService.cerrarComoNoRetirado(dueno(), 10));

        assertEquals(ConflictoComercioException.RETIRO_EN_ESPERA, ex.getCodigo());
        assertEquals(30L, ex.getData().get("minutosRestantes"));
        assertEquals(AHORA.plusMinutes(30).toString(), ex.getData().get("disponibleDesde"));
        assertEquals("Todavía no podés cerrar este pedido como no retirado. Esperá 30 minutos más (desde las 15:30).",
                ex.getMessage());
        verificarQueNoSeEscribioNada(pedido, EstadoPedido.LISTO_PARA_RETIRAR);
        assertNull(pedido.getFuenteEntrega());
        assertNull(pedido.getFechaEntrega());
    }

    @Test
    void aUnSegundoDeCumplirLaEsperaFaltaUnMinutoRedondeadoHaciaArriba() {
        Pedido pedido = pedido(11, EstadoPedido.LISTO_PARA_RETIRAR, TipoEntrega.RETIRO, AHORA.minusMinutes(60).plusSeconds(1));

        ConflictoComercioException ex = assertThrows(ConflictoComercioException.class,
                () -> pedidoService.cerrarComoNoRetirado(dueno(), 11));

        assertEquals(1L, ex.getData().get("minutosRestantes"));
        assertEquals("Todavía no podés cerrar este pedido como no retirado. Esperá 1 minuto más (desde las 15:00).",
                ex.getMessage());
        verificarQueNoSeEscribioNada(pedido, EstadoPedido.LISTO_PARA_RETIRAR);
    }

    @Test
    void conExactamenteSesentaMinutosListoSeCierra() {
        Pedido pedido = listoParaRetirar(12, 60);

        pedidoService.cerrarComoNoRetirado(dueno(), 12);

        assertEquals(EstadoPedido.NO_RETIRADO, pedido.getEstado());
    }

    @Test
    void laEsperaSeLeeDeLaPropiedadYNoEstaFijadaEnElCodigo() {
        timeouts.setNoRetiradoEsperaMinutos(10);
        Pedido pedido = listoParaRetirar(13, 11);

        pedidoService.cerrarComoNoRetirado(dueno(), 13);

        assertEquals(EstadoPedido.NO_RETIRADO, pedido.getEstado());
        assertEquals(60, new PedidoTimeoutProperties().getNoRetiradoEsperaMinutos());
    }

    @Test
    void elCierreDelDuenoDejaElEstadoElHistorialSinMotivoDeTimeoutYNoTocaLaEntrega() {
        Pedido pedido = listoParaRetirar(14, 90);

        pedidoService.cerrarComoNoRetirado(dueno(), 14);

        assertEquals(EstadoPedido.NO_RETIRADO, pedido.getEstado());
        assertNull(pedido.getFuenteEntrega());
        assertNull(pedido.getFechaEntrega());
        HistorialEstadoPedido historial = historialGuardado();
        assertEquals(EstadoPedido.NO_RETIRADO, historial.getEstado());
        assertEquals(ActorPedido.DUENO, historial.getActorRol());
        assertNull(historial.getMotivoTimeout());
        assertEquals(AHORA, historial.getFechaHora());
    }

    @Test
    void elCierreDelEmpleadoGuardaAlEmpleadoComoActor() {
        listoParaRetirar(15, 90);

        pedidoService.cerrarComoNoRetirado(empleado(12), 15);

        assertEquals(ActorPedido.EMPLEADO, historialGuardado().getActorRol());
        verify(usuarioRepository).getReferenceById(12);
    }

    @Test
    void noGeneraNotaDeCreditoNiReembolso() {
        listoParaRetirar(16, 90);

        pedidoService.cerrarComoNoRetirado(dueno(), 16);

        verifyNoInteractions(reembolsoService);
        verify(notaCreditoService, never()).crear(any(), any(), any());
        verify(notaCreditoService, never()).crearPendienteRevisionManual(any(), any(), any(), any());
    }

    @Test
    void elAvisoT36VaSoloAlClienteConElTextoAprobadoYNoHayCopiasAlEquipo() {
        listoParaRetirar(17, 90);

        pedidoService.cerrarComoNoRetirado(dueno(), 17);

        verify(notificacionService, times(1)).crearParaCliente(eq(9), eq(String.format(TEXTO_T36, 17)),
                eq(TipoNotificacion.PEDIDO_NO_RETIRADO), eq(TipoEntidadNotificacion.PEDIDO), eq(17));
        verify(notificacionService, never()).crearParaEquipo(any(), any(), any(), any(), any(), any(), any());
        verify(notificacionService, never()).crearParaDueno(any(), any(), any(), any(), any(), any());
    }

    @Test
    void soloSePuedeCerrarDesdeListoParaRetirar() {
        for (EstadoPedido estado : EstadoPedido.values()) {
            if (estado == EstadoPedido.LISTO_PARA_RETIRAR) {
                continue;
            }
            int id = 100 + estado.ordinal();
            Pedido pedido = pedido(id, estado, TipoEntrega.RETIRO, AHORA.minusMinutes(300));

            assertThrows(ConflictoDeNegocioException.class, () -> pedidoService.cerrarComoNoRetirado(dueno(), id), estado.name());

            assertEquals(estado, pedido.getEstado());
        }
        verify(pedidoRepository, never()).save(any());
        verifyNoInteractions(notificacionService);
    }

    @Test
    void soloSePuedeCerrarUnPedidoDeRetiro() {
        Pedido pedido = pedido(18, EstadoPedido.LISTO_PARA_RETIRAR, TipoEntrega.DOMICILIO, AHORA.minusMinutes(300));

        assertThrows(ConflictoDeNegocioException.class, () -> pedidoService.cerrarComoNoRetirado(dueno(), 18));

        verificarQueNoSeEscribioNada(pedido, EstadoPedido.LISTO_PARA_RETIRAR);
    }

    @Test
    void sinFilaListoParaRetirarEnElHistorialResponde409() {
        Pedido pedido = pedido(19, EstadoPedido.LISTO_PARA_RETIRAR, TipoEntrega.RETIRO, null);
        when(historialRepository.findTopByPedidoIdAndEstadoOrderByFechaHoraDesc(19, EstadoPedido.LISTO_PARA_RETIRAR))
                .thenReturn(Optional.empty());

        assertThrows(ConflictoDeNegocioException.class, () -> pedidoService.cerrarComoNoRetirado(dueno(), 19));

        verificarQueNoSeEscribioNada(pedido, EstadoPedido.LISTO_PARA_RETIRAR);
    }

    @Test
    void unEmpleadoNoCierraSuPropioPedido() {
        Pedido pedido = listoParaRetirar(20, 90);

        ConflictoComercioException ex = assertThrows(ConflictoComercioException.class,
                () -> pedidoService.cerrarComoNoRetirado(empleado(9), 20));

        assertEquals(ConflictoComercioException.PEDIDO_PROPIO, ex.getCodigo());
        verificarQueNoSeEscribioNada(pedido, EstadoPedido.LISTO_PARA_RETIRAR);
    }

    @Test
    void tomaLosUsuariosLaRelacionYElPedidoEnEseOrdenYRecienDespuesValidaYCalculaLaEspera() {
        Pedido pedido = listoParaRetirar(21, 90);
        ComercioActivo actor = empleado(12);

        pedidoService.cerrarComoNoRetirado(actor, 21);

        InOrder orden = inOrder(usuarioRepository, comercioActivoService, entityManager, historialRepository);
        orden.verify(usuarioRepository).leerIdConBloqueoCompartido(5);
        orden.verify(usuarioRepository).leerIdConBloqueoCompartido(9);
        orden.verify(usuarioRepository).leerIdConBloqueoCompartido(12);
        orden.verify(comercioActivoService).exigirRelacionActiva(actor);
        orden.verify(entityManager).refresh(pedido, LockModeType.PESSIMISTIC_WRITE);
        orden.verify(historialRepository).findTopByPedidoIdAndEstadoOrderByFechaHoraDesc(21, EstadoPedido.LISTO_PARA_RETIRAR);
    }

    @Test
    void siLaRelacionDelEmpleadoSeDesactivoNoCambiaNada() {
        Pedido pedido = listoParaRetirar(22, 90);
        ComercioActivo actor = empleado(12);
        doAnswer(invocacion -> {
            throw new com.bajonea.backend.exceptions.ComercioNoDisponibleException();
        }).when(comercioActivoService).exigirRelacionActiva(actor);

        assertThrows(com.bajonea.backend.exceptions.ComercioNoDisponibleException.class,
                () -> pedidoService.cerrarComoNoRetirado(actor, 22));

        verificarQueNoSeEscribioNada(pedido, EstadoPedido.LISTO_PARA_RETIRAR);
        verify(entityManager, never()).refresh(any(), any(LockModeType.class));
    }

    @Test
    void contraUnaEntregaGanadoraDaConflictoSinEscribirNada() {
        Pedido pedido = listoParaRetirar(23, 90);
        doAnswer(invocacion -> {
            pedido.setEstado(EstadoPedido.ENTREGADO);
            return null;
        }).when(entityManager).refresh(pedido, LockModeType.PESSIMISTIC_WRITE);

        assertThrows(ConflictoDeNegocioException.class, () -> pedidoService.cerrarComoNoRetirado(dueno(), 23));

        verificarQueNoSeEscribioNada(pedido, EstadoPedido.ENTREGADO);
    }

    @Test
    void entregarContraUnCierreComoNoRetiradoGanadorDaConflictoSinEscribirNada() {
        Pedido pedido = listoParaRetirar(24, 90);
        doAnswer(invocacion -> {
            pedido.setEstado(EstadoPedido.NO_RETIRADO);
            return null;
        }).when(entityManager).refresh(pedido, LockModeType.PESSIMISTIC_WRITE);

        assertThrows(ConflictoDeNegocioException.class, () -> pedidoService.confirmarEntregaComercio(dueno(), 24));

        verificarQueNoSeEscribioNada(pedido, EstadoPedido.NO_RETIRADO);
    }

    @Test
    void elProcesoAutomaticoDelComercioSuspendidoCierraComoNoRetiradoSinEsperaSinReembolsoYAvisaAlCliente() {
        Pedido pedido = listoParaRetirar(25, 1);
        pedido.setSuspensionRetiroExpira(AHORA.minusMinutes(5));
        when(pedidoRepository.findIdsByEstadoAndSuspensionRetiroExpiraLessThan(eq(EstadoPedido.LISTO_PARA_RETIRAR), any()))
                .thenReturn(List.of(25));

        pedidoService.autoconfirmarRetirosPorSuspension(AHORA);

        assertEquals(EstadoPedido.NO_RETIRADO, pedido.getEstado());
        assertNull(pedido.getFuenteEntrega());
        assertNull(pedido.getFechaEntrega());
        HistorialEstadoPedido historial = historialGuardado();
        assertEquals(EstadoPedido.NO_RETIRADO, historial.getEstado());
        assertEquals(ActorPedido.SISTEMA, historial.getActorRol());
        assertEquals(MotivoTimeoutPedido.TIMEOUT_RETIRO_SUSPENSION, historial.getMotivoTimeout());
        verify(notificacionService, times(1)).crearParaCliente(eq(9), eq(String.format(TEXTO_T36, 25)),
                eq(TipoNotificacion.PEDIDO_NO_RETIRADO), eq(TipoEntidadNotificacion.PEDIDO), eq(25));
        verifyNoInteractions(reembolsoService);
        verify(notificacionService, never()).crearParaCliente(any(), any(), eq(TipoNotificacion.PEDIDO_CERRADO_TIMER_SUSPENSION),
                any(), any());
    }

    @Test
    void elProcesoAutomaticoNoTocaUnRetiroQueElComercioYaCerroComoNoRetirado() {
        Pedido pedido = listoParaRetirar(26, 90);
        pedido.setSuspensionRetiroExpira(AHORA.minusMinutes(5));
        when(pedidoRepository.findIdsByEstadoAndSuspensionRetiroExpiraLessThan(eq(EstadoPedido.LISTO_PARA_RETIRAR), any()))
                .thenReturn(List.of(26));
        doAnswer(invocacion -> {
            pedido.setEstado(EstadoPedido.NO_RETIRADO);
            return null;
        }).when(entityManager).refresh(pedido, LockModeType.PESSIMISTIC_WRITE);

        pedidoService.autoconfirmarRetirosPorSuspension(AHORA);

        verificarQueNoSeEscribioNada(pedido, EstadoPedido.NO_RETIRADO);
    }
}
