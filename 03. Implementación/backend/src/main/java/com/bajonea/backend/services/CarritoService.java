package com.bajonea.backend.services;

import com.bajonea.backend.dto.request.ItemCarritoRequestDTO;
import com.bajonea.backend.dto.response.CarritoResponseDTO;
import com.bajonea.backend.dto.response.ItemCarritoResponseDTO;
import com.bajonea.backend.entities.Carrito;
import com.bajonea.backend.entities.Cliente;
import com.bajonea.backend.entities.ItemCarrito;
import com.bajonea.backend.entities.Producto;
import com.bajonea.backend.enums.EstadoProducto;
import com.bajonea.backend.exceptions.ConflictoDeNegocioException;
import com.bajonea.backend.exceptions.RecursoNoEncontradoException;
import com.bajonea.backend.repositories.CarritoRepository;
import com.bajonea.backend.repositories.ClienteRepository;
import com.bajonea.backend.repositories.ItemCarritoRepository;
import com.bajonea.backend.repositories.ProductoRepository;
import java.math.BigDecimal;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Carrito simplificado del MVP: 1 registro por cliente, 1 comercio a la vez, sin
 * expiración/timeout (CLAUDE.md §1). El `Carrito` no se crea en el registro — se crea
 * perezosamente (get-or-create) en el primer acceso de cada cliente.
 */
@Service
@RequiredArgsConstructor
@Transactional
public class CarritoService {

    private static final int MAX_CANTIDAD = 20;

    private final CarritoRepository carritoRepository;
    private final ItemCarritoRepository itemCarritoRepository;
    private final ClienteRepository clienteRepository;
    private final ProductoRepository productoRepository;
    private final ComercioService comercioService;

    public CarritoResponseDTO verCarrito(Integer usuarioId) {
        Carrito carrito = obtenerOCrearCarrito(usuarioId);
        return aResponseDTO(carrito);
    }

    public CarritoResponseDTO agregarItem(Integer usuarioId, ItemCarritoRequestDTO request) {
        Carrito carrito = obtenerOCrearCarrito(usuarioId);
        Producto producto = productoRepository.findById(request.getProductoId())
                .orElseThrow(() -> new RecursoNoEncontradoException("Producto no encontrado"));

        if (producto.getEstado() != EstadoProducto.DISPONIBLE) {
            throw new ConflictoDeNegocioException("El producto no está disponible");
        }

        comercioService.validarAceptaPedidos(producto.getComercio());

        if (carrito.getComercio() == null) {
            carrito.setComercio(producto.getComercio());
            carritoRepository.save(carrito);
        } else if (!carrito.getComercio().getId().equals(producto.getComercio().getId())) {
            throw new ConflictoDeNegocioException(
                    "El carrito ya tiene productos de otro comercio. Vaciá el carrito para agregar de un comercio distinto.");
        }

        // Si el producto ya está en el carrito, suma la cantidad al ítem existente en vez
        // de rechazar (vacío real de requisitos-funcionales-cliente.md, completado con este
        // criterio — ver docs/DECISIONES.md). Clampeado a MAX_CANTIDAD, nunca rechaza el
        // request completo. La nota se sobrescribe con la última recibida.
        ItemCarrito itemExistente = itemCarritoRepository.findByCarritoId(carrito.getId()).stream()
                .filter(item -> item.getProducto().getId().equals(request.getProductoId()))
                .findFirst()
                .orElse(null);

        if (itemExistente != null) {
            int cantidadNueva = Math.min(itemExistente.getCantidad() + request.getCantidad(), MAX_CANTIDAD);
            itemExistente.setCantidad(cantidadNueva);
            itemExistente.setNota(request.getNota());
            itemCarritoRepository.save(itemExistente);
        } else {
            ItemCarrito item = ItemCarrito.builder()
                    .carrito(carrito)
                    .producto(producto)
                    .cantidad(request.getCantidad())
                    .nota(request.getNota())
                    .build();
            itemCarritoRepository.save(item);
        }

        return aResponseDTO(carrito);
    }

    public CarritoResponseDTO actualizarCantidad(Integer usuarioId, Integer itemId, Integer cantidad) {
        Carrito carrito = obtenerOCrearCarrito(usuarioId);
        ItemCarrito item = obtenerItemDelCarrito(itemId, carrito);

        item.setCantidad(cantidad);
        itemCarritoRepository.save(item);

        return aResponseDTO(carrito);
    }

    public CarritoResponseDTO eliminarItem(Integer usuarioId, Integer itemId) {
        Carrito carrito = obtenerOCrearCarrito(usuarioId);
        ItemCarrito item = obtenerItemDelCarrito(itemId, carrito);
        itemCarritoRepository.delete(item);

        if (itemCarritoRepository.findByCarritoId(carrito.getId()).isEmpty()) {
            carrito.setComercio(null);
            carritoRepository.save(carrito);
        }

        return aResponseDTO(carrito);
    }

    public void vaciarCarrito(Integer usuarioId) {
        Carrito carrito = obtenerOCrearCarrito(usuarioId);
        itemCarritoRepository.deleteByCarritoId(carrito.getId());
        carrito.setComercio(null);
        carritoRepository.save(carrito);
    }

    private Carrito obtenerOCrearCarrito(Integer usuarioId) {
        return carritoRepository.findByClienteId(usuarioId)
                .orElseGet(() -> crearCarrito(usuarioId));
    }

    private Carrito crearCarrito(Integer usuarioId) {
        Cliente cliente = clienteRepository.findById(usuarioId)
                .orElseThrow(() -> new RecursoNoEncontradoException("Cliente no encontrado"));
        Carrito carrito = Carrito.builder().cliente(cliente).build();
        return carritoRepository.save(carrito);
    }

    private ItemCarrito obtenerItemDelCarrito(Integer itemId, Carrito carrito) {
        ItemCarrito item = itemCarritoRepository.findById(itemId)
                .orElseThrow(() -> new RecursoNoEncontradoException("Ítem no encontrado"));
        if (!item.getCarrito().getId().equals(carrito.getId())) {
            throw new RecursoNoEncontradoException("Ítem no encontrado");
        }
        return item;
    }

    private CarritoResponseDTO aResponseDTO(Carrito carrito) {
        List<ItemCarritoResponseDTO> items = itemCarritoRepository.findByCarritoId(carrito.getId()).stream()
                .map(this::aResponseDTO)
                .toList();

        BigDecimal subtotal = items.stream()
                .map(ItemCarritoResponseDTO::getSubtotal)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        Integer comercioId = carrito.getComercio() != null ? carrito.getComercio().getId() : null;
        String nombreComercio = carrito.getComercio() != null ? carrito.getComercio().getNombre() : null;

        return new CarritoResponseDTO(comercioId, nombreComercio, items, subtotal);
    }

    private ItemCarritoResponseDTO aResponseDTO(ItemCarrito item) {
        BigDecimal subtotal = item.getProducto().getPrecio().multiply(BigDecimal.valueOf(item.getCantidad()));
        return new ItemCarritoResponseDTO(
                item.getId(),
                item.getProducto().getId(),
                item.getProducto().getNombre(),
                item.getProducto().getPrecio(),
                item.getCantidad(),
                subtotal,
                item.getNota());
    }
}
