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
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.bajonea.backend.dto.request.ItemCarritoRequestDTO;
import com.bajonea.backend.entities.Carrito;
import com.bajonea.backend.entities.Comercio;
import com.bajonea.backend.entities.Producto;
import com.bajonea.backend.enums.TipoNotificacion;
import com.bajonea.backend.exceptions.ConflictoDeNegocioException;
import com.bajonea.backend.exceptions.RecursoNoEncontradoException;
import com.bajonea.backend.repositories.CarritoInsercionRepository;
import com.bajonea.backend.repositories.CarritoRepository;
import com.bajonea.backend.repositories.CarritoRepository.CarritoBloqueado;
import com.bajonea.backend.repositories.ItemCarritoRepository;
import com.bajonea.backend.repositories.ItemCarritoRepository.CarritoAfectado;
import com.bajonea.backend.repositories.ProductoRepository;
import com.bajonea.backend.repositories.ProductoRepository.EstadoYComercioProducto;
import com.bajonea.backend.repositories.UsuarioRepository;
import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.InOrder;
import org.springframework.test.util.ReflectionTestUtils;

/**
 * El orden de los bloqueos del carrito, con repositorios simulados: el producto se lee con bloqueo compartido antes
 * de tocar el carrito, el carrito se bloquea antes de leer ítems, los usuarios de una baja de producto van antes que
 * los carritos y en id ascendente, y el vaciado por pago decide solo sobre la fila bloqueada. El orden global
 * está en docs/CONCURRENCIA-Y-TRANSACCIONES.md.
 */
class CarritoServiceBloqueoTest {

    private CarritoRepository carritoRepository;
    private CarritoInsercionRepository carritoInsercionRepository;
    private ItemCarritoRepository itemCarritoRepository;
    private ProductoRepository productoRepository;
    private UsuarioRepository usuarioRepository;
    private ComercioService comercioService;
    private NotificacionService notificacionService;
    private EntityManager entityManager;
    private CarritoService servicio;

    @BeforeEach
    void preparar() {
        carritoRepository = mock(CarritoRepository.class);
        carritoInsercionRepository = mock(CarritoInsercionRepository.class);
        itemCarritoRepository = mock(ItemCarritoRepository.class);
        productoRepository = mock(ProductoRepository.class);
        usuarioRepository = mock(UsuarioRepository.class);
        comercioService = mock(ComercioService.class);
        notificacionService = mock(NotificacionService.class);
        entityManager = mock(EntityManager.class);
        servicio = new CarritoService(carritoRepository, carritoInsercionRepository, itemCarritoRepository, productoRepository,
                usuarioRepository, comercioService, mock(ConfiguracionTarifaService.class), notificacionService);
        ReflectionTestUtils.setField(servicio, "entityManager", entityManager);
        when(itemCarritoRepository.findByCarritoId(anyInt())).thenReturn(List.of());
    }

    private static EstadoYComercioProducto producto(String estado) {
        EstadoYComercioProducto lectura = mock(EstadoYComercioProducto.class);
        when(lectura.getEstado()).thenReturn(estado);
        when(lectura.getComercioId()).thenReturn(7);
        return lectura;
    }

    private static CarritoBloqueado carritoBloqueado(int id, Integer comercioId) {
        CarritoBloqueado carrito = mock(CarritoBloqueado.class);
        when(carrito.getId()).thenReturn(id);
        when(carrito.getComercioId()).thenReturn(comercioId);
        return carrito;
    }

    private static CarritoAfectado afectado(int carritoId, int clienteId) {
        CarritoAfectado afectado = mock(CarritoAfectado.class);
        when(afectado.getCarritoId()).thenReturn(carritoId);
        when(afectado.getClienteId()).thenReturn(clienteId);
        return afectado;
    }

    @Test
    void agregarItemLeeElProductoConBloqueoCompartidoAntesDeBloquearElCarritoYAntesDeCualquierLecturaComun() {
        Comercio comercio = mock(Comercio.class);
        when(comercio.getId()).thenReturn(7);
        Producto producto = mock(Producto.class);
        when(producto.getComercio()).thenReturn(comercio);
        Carrito carrito = Carrito.builder().id(3).build();
        EstadoYComercioProducto lectura = producto("DISPONIBLE");
        when(productoRepository.leerEstadoConBloqueoCompartido(10)).thenReturn(Optional.of(lectura));
        when(carritoRepository.findByClienteIdConBloqueo(5)).thenReturn(Optional.of(carrito));
        when(productoRepository.findById(10)).thenReturn(Optional.of(producto));

        servicio.agregarItem(5, new ItemCarritoRequestDTO(10, 1, null));

        InOrder orden = inOrder(productoRepository, carritoInsercionRepository, carritoRepository, entityManager,
                itemCarritoRepository);
        orden.verify(productoRepository).leerEstadoConBloqueoCompartido(10);
        orden.verify(carritoInsercionRepository).crearSiNoExiste(5);
        orden.verify(carritoRepository).findByClienteIdConBloqueo(5);
        orden.verify(entityManager).refresh(carrito, LockModeType.PESSIMISTIC_WRITE);
        orden.verify(productoRepository).findById(10);
        orden.verify(itemCarritoRepository).findByCarritoId(3);
        verify(carritoRepository, never()).findByClienteId(anyInt());
    }

    @Test
    void agregarUnProductoNoDisponibleSeRechazaSinTocarElCarrito() {
        EstadoYComercioProducto lectura = producto("AGOTADO");
        when(productoRepository.leerEstadoConBloqueoCompartido(10)).thenReturn(Optional.of(lectura));

        assertThrows(ConflictoDeNegocioException.class, () -> servicio.agregarItem(5, new ItemCarritoRequestDTO(10, 1, null)));

        verifyNoInteractions(carritoInsercionRepository, carritoRepository, itemCarritoRepository);
    }

    @Test
    void quitarUnItemQueYaNoEstaEsUnNoEncontradoYNoToqueElComercio() {
        Carrito carrito = Carrito.builder().id(3).build();
        when(carritoRepository.findByClienteIdConBloqueo(5)).thenReturn(Optional.of(carrito));
        when(itemCarritoRepository.borrarDelCarrito(99, 3)).thenReturn(0);

        assertThrows(RecursoNoEncontradoException.class, () -> servicio.eliminarItem(5, 99));

        verify(itemCarritoRepository, never()).leerAlgunItemConBloqueo(anyInt());
        verify(carritoRepository, never()).save(any());
    }

    @Test
    void elPagoVaciaSoloSiElCarritoBloqueadoEsDelComercioDelPedido() {
        CarritoBloqueado bloqueado = carritoBloqueado(3, 7);
        when(carritoRepository.bloquearPorClienteId(5)).thenReturn(Optional.of(bloqueado));

        servicio.vaciarSiEsDelComercio(5, 7);

        InOrder orden = inOrder(carritoRepository, itemCarritoRepository);
        orden.verify(carritoRepository).bloquearPorClienteId(5);
        orden.verify(itemCarritoRepository).borrarPorCarritoId(3);
        orden.verify(carritoRepository).quitarComercio(3);
        verify(carritoRepository, never()).findByClienteId(anyInt());
    }

    @Test
    void elPagoNoVaciaUnCarritoDeOtroComercioSinComercioOInexistente() {
        CarritoBloqueado deOtroComercio = carritoBloqueado(3, 8);
        CarritoBloqueado sinComercio = carritoBloqueado(4, null);
        when(carritoRepository.bloquearPorClienteId(5)).thenReturn(Optional.of(deOtroComercio));
        servicio.vaciarSiEsDelComercio(5, 7);

        when(carritoRepository.bloquearPorClienteId(6)).thenReturn(Optional.of(sinComercio));
        servicio.vaciarSiEsDelComercio(6, 7);

        when(carritoRepository.bloquearPorClienteId(7)).thenReturn(Optional.empty());
        servicio.vaciarSiEsDelComercio(7, 7);

        verify(itemCarritoRepository, never()).borrarPorCarritoId(anyInt());
        verify(carritoRepository, never()).quitarComercio(anyInt());
    }

    @Test
    void laBajaDeUnProductoBloqueaPrimeroLosUsuariosEnIdAscendenteYDespuesLosCarritos() {
        CarritoAfectado a1 = afectado(30, 9);
        CarritoAfectado a2 = afectado(31, 4);
        CarritoAfectado a3 = afectado(32, 9);
        List<CarritoAfectado> afectados = List.of(a1, a2, a3);
        when(itemCarritoRepository.findCarritosConProducto(10)).thenReturn(afectados);
        when(itemCarritoRepository.borrarPorCarritoIdYProductoId(anyInt(), eq(10))).thenReturn(1);
        when(itemCarritoRepository.leerAlgunItemConBloqueo(anyInt())).thenReturn(Optional.empty());

        List<CarritoAfectado> preparados = servicio.prepararQuitarProducto(10);
        servicio.quitarProductoDeLosCarritos(10, "Pizza", preparados);

        InOrder orden = inOrder(itemCarritoRepository, usuarioRepository, carritoRepository);
        orden.verify(itemCarritoRepository).findCarritosConProducto(10);
        orden.verify(usuarioRepository).leerIdConBloqueoCompartido(4);
        orden.verify(usuarioRepository).leerIdConBloqueoCompartido(9);
        orden.verify(carritoRepository).bloquearPorIds(List.of(30, 31, 32));
        orden.verify(itemCarritoRepository).borrarPorCarritoIdYProductoId(30, 10);
        verify(usuarioRepository, never()).leerIdConBloqueoCompartido(30);
    }

    @Test
    void laBajaAvisaSoloAlQueSeLeQuitoUnItemYDejaSinComercioSoloAlCarritoQueQuedoVacio() {
        CarritoAfectado a1 = afectado(30, 9);
        CarritoAfectado a2 = afectado(31, 4);
        List<CarritoAfectado> afectados = List.of(a1, a2);
        when(itemCarritoRepository.borrarPorCarritoIdYProductoId(30, 10)).thenReturn(1);
        when(itemCarritoRepository.borrarPorCarritoIdYProductoId(31, 10)).thenReturn(0);
        when(itemCarritoRepository.leerAlgunItemConBloqueo(30)).thenReturn(Optional.of(500));
        when(itemCarritoRepository.leerAlgunItemConBloqueo(31)).thenReturn(Optional.empty());

        servicio.quitarProductoDeLosCarritos(10, "Pizza", afectados);

        verify(notificacionService).crearParaCliente(eq(9), anyString(), eq(TipoNotificacion.PRODUCTO_REMOVIDO_CARRITO));
        verify(notificacionService, never()).crearParaCliente(eq(4), anyString(), any(TipoNotificacion.class));
        verify(carritoRepository, never()).quitarComercio(30);
        verify(carritoRepository).quitarComercio(31);
    }

    @Test
    void sinCarritosAfectadosNoSeBloqueaNada() {
        servicio.quitarProductoDeLosCarritos(10, "Pizza", List.of());

        verify(carritoRepository, never()).bloquearPorIds(anyList());
        assertEquals(List.of(), servicio.prepararQuitarProducto(10));
        verifyNoInteractions(usuarioRepository);
    }
}
