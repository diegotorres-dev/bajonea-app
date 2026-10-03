package com.bajonea.backend.services;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.bajonea.backend.config.PedidoTimeoutProperties;
import com.bajonea.backend.dto.request.PedidoRequestDTO;
import com.bajonea.backend.entities.Carrito;
import com.bajonea.backend.entities.Cliente;
import com.bajonea.backend.entities.Comercio;
import com.bajonea.backend.entities.ItemCarrito;
import com.bajonea.backend.enums.EstadoComercio;
import com.bajonea.backend.enums.TipoEntrega;
import com.bajonea.backend.exceptions.ConflictoDeNegocioException;
import com.bajonea.backend.repositories.CarritoRepository;
import com.bajonea.backend.repositories.ClienteRepository;
import com.bajonea.backend.repositories.ComercioRepository;
import com.bajonea.backend.repositories.DetallePedidoRepository;
import com.bajonea.backend.repositories.DireccionRepository;
import com.bajonea.backend.repositories.HistorialEstadoPedidoRepository;
import com.bajonea.backend.repositories.ItemCarritoRepository;
import com.bajonea.backend.repositories.PedidoRepository;
import com.bajonea.backend.repositories.UsuarioRepository;
import jakarta.persistence.EntityManager;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.InOrder;
import org.springframework.test.util.ReflectionTestUtils;

/**
 * Crear un pedido lee el estado del comercio con bloqueo compartido y revalida {@code APTO_VENTA} dentro de la
 * transacción (multi-comercio, tramo 5): cierra la carrera con la desvinculación de la cuenta de Mercado
 * Pago. El bloqueo real contra la base se ejercita en {@code MercadoPagoCuentaUnicaIntegrationTest} y en el
 * estrés {@code stress-locks-tramo5a.mjs}.
 */
class PedidoServiceConfirmarPedidoLockTest {

    private ComercioRepository comercioRepository;
    private ComercioService comercioService;
    private EntityManager entityManager;
    private PedidoRepository pedidoRepository;
    private PedidoService pedidoService;
    private Comercio comercioDelCarrito;

    @BeforeEach
    void preparar() {
        comercioRepository = mock(ComercioRepository.class);
        comercioService = mock(ComercioService.class);
        entityManager = mock(EntityManager.class);
        pedidoRepository = mock(PedidoRepository.class);
        ClienteRepository clienteRepository = mock(ClienteRepository.class);
        CarritoRepository carritoRepository = mock(CarritoRepository.class);
        ItemCarritoRepository itemCarritoRepository = mock(ItemCarritoRepository.class);

        PedidoTimeoutProperties timeouts = new PedidoTimeoutProperties();
        timeouts.setPagoMinutos(30);
        pedidoService = new PedidoService(pedidoRepository, mock(DetallePedidoRepository.class), carritoRepository,
                itemCarritoRepository, clienteRepository, comercioRepository, mock(DireccionRepository.class),
                mock(HistorialEstadoPedidoRepository.class), mock(UsuarioRepository.class),
                mock(NotificacionService.class), mock(CarritoService.class), comercioService,
                mock(ConfiguracionTarifaService.class), timeouts, mock(ReembolsoService.class),
                mock(NotaCreditoService.class));
        ReflectionTestUtils.setField(pedidoService, "entityManager", entityManager);

        comercioDelCarrito = mock(Comercio.class);
        when(comercioDelCarrito.getId()).thenReturn(40);

        Carrito carrito = mock(Carrito.class);
        when(carrito.getId()).thenReturn(3);
        when(carrito.getComercio()).thenReturn(comercioDelCarrito);
        when(clienteRepository.findById(5)).thenReturn(Optional.of(mock(Cliente.class)));
        when(carritoRepository.findByClienteId(5)).thenReturn(Optional.of(carrito));
        when(itemCarritoRepository.findByCarritoId(3)).thenReturn(List.of(mock(ItemCarrito.class)));
        when(comercioRepository.leerEstadoConBloqueoCompartido(40)).thenReturn(Optional.of("APROBADO"));
    }

    private PedidoRequestDTO request() {
        PedidoRequestDTO request = mock(PedidoRequestDTO.class);
        when(request.getTipoEntrega()).thenReturn(TipoEntrega.RETIRO);
        return request;
    }

    @Test
    void siElEstadoLeidoBajoBloqueoYaNoEsAptoVentaRechazaAunqueElCarritoLoVeaApto() {
        when(comercioDelCarrito.getEstado()).thenReturn(EstadoComercio.APTO_VENTA);
        org.mockito.Mockito.doCallRealMethod().when(comercioService).validarAceptaPedidos(any(Comercio.class), any(EstadoComercio.class));

        ConflictoDeNegocioException ex = assertThrows(ConflictoDeNegocioException.class,
                () -> pedidoService.confirmarPedido(5, request()));

        assertEquals("Este comercio no está aceptando pedidos en este momento", ex.getMessage());
        InOrder orden = inOrder(comercioRepository, comercioService);
        orden.verify(comercioRepository).leerEstadoConBloqueoCompartido(40);
        orden.verify(comercioService).validarAceptaPedidos(comercioDelCarrito, EstadoComercio.APROBADO);
        verify(pedidoRepository, never()).save(any());
    }

    @Test
    void validaConElEstadoLeidoBajoBloqueoYNoConElDeLaEntidad() {
        when(comercioRepository.leerEstadoConBloqueoCompartido(40)).thenReturn(Optional.of("APTO_VENTA"));
        when(comercioDelCarrito.getEstado()).thenReturn(EstadoComercio.APROBADO);
        org.mockito.Mockito.doThrow(new ConflictoDeNegocioException("corta aca"))
                .when(comercioService).validarAceptaPedidos(any(Comercio.class), any(EstadoComercio.class));

        assertThrows(ConflictoDeNegocioException.class, () -> pedidoService.confirmarPedido(5, request()));

        verify(comercioService).validarAceptaPedidos(comercioDelCarrito, EstadoComercio.APTO_VENTA);
        verify(comercioService, never()).validarAceptaPedidos(comercioDelCarrito);
    }
}
