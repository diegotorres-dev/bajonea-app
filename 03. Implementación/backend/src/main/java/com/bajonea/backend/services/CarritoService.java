package com.bajonea.backend.services;

import com.bajonea.backend.dto.request.ItemCarritoRequestDTO;
import com.bajonea.backend.dto.response.CarritoResponseDTO;
import com.bajonea.backend.dto.response.ItemCarritoResponseDTO;
import com.bajonea.backend.entities.Carrito;
import com.bajonea.backend.entities.ConfiguracionTarifa;
import com.bajonea.backend.entities.ItemCarrito;
import com.bajonea.backend.entities.Producto;
import com.bajonea.backend.enums.EstadoProducto;
import com.bajonea.backend.enums.TipoNotificacion;
import com.bajonea.backend.exceptions.ConflictoDeNegocioException;
import com.bajonea.backend.exceptions.RecursoNoEncontradoException;
import com.bajonea.backend.repositories.CarritoInsercionRepository;
import com.bajonea.backend.repositories.CarritoRepository;
import com.bajonea.backend.repositories.ItemCarritoRepository;
import com.bajonea.backend.repositories.ItemCarritoRepository.CarritoAfectado;
import com.bajonea.backend.repositories.ProductoRepository;
import com.bajonea.backend.repositories.UsuarioRepository;
import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import jakarta.persistence.PersistenceContext;
import java.math.BigDecimal;
import java.util.List;
import java.util.TreeSet;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Carrito simplificado del MVP: 1 registro por cliente, 1 comercio a la vez, sin
 * expiración/timeout (CLAUDE.md §1). El `Carrito` no se crea en el registro — se crea
 * perezosamente (get-or-create) en el primer acceso de cada cliente.
 * <p>
 * <b>Concurrencia.</b> Toda operación que modifica el carrito (agregar, cambiar cantidad, quitar un ítem, vaciar, el
 * vaciado por pago aprobado y la baja de un producto del Dueño) toma primero la fila {@code carrito} con
 * {@code FOR UPDATE}: así se serializan entre sí, y lo que deciden (por ejemplo, de qué comercio es el carrito) lo
 * deciden sobre lo último confirmado y no sobre la foto de la transacción. El carrito es la <b>última hoja</b> del orden
 * global de bloqueos (docs/CONCURRENCIA-Y-TRANSACCIONES.md): una vez tomado no se pide ningún bloqueo de usuario,
 * comercio, producto ni pedido, solo filas de {@code item_carrito} del propio carrito. Por eso agregar un ítem lee el
 * producto con {@code LOCK IN SHARE MODE} <b>antes</b> de bloquear el carrito. Las bajas y el cambio de cantidad son
 * sentencias en bloque (lecturas actuales, que no fallan con 0 filas); con el carrito bloqueado, la primera lectura
 * común de cada operación se hace después del bloqueo, así que su foto ya incluye lo último confirmado.
 */
@Service
@RequiredArgsConstructor
@Transactional
public class CarritoService {

    private static final int MAX_CANTIDAD = 20;

    private final CarritoRepository carritoRepository;
    private final CarritoInsercionRepository carritoInsercionRepository;
    private final ItemCarritoRepository itemCarritoRepository;
    private final ProductoRepository productoRepository;
    private final UsuarioRepository usuarioRepository;
    private final ComercioService comercioService;
    private final ConfiguracionTarifaService configuracionTarifaService;
    private final NotificacionService notificacionService;

    @PersistenceContext
    private EntityManager entityManager;

    public CarritoResponseDTO verCarrito(Integer usuarioId) {
        Carrito carrito = carritoRepository.findByClienteId(usuarioId).orElse(null);
        if (carrito == null) {
            carrito = obtenerOCrearBloqueado(usuarioId);
        }
        return aResponseDTO(carrito);
    }

    public CarritoResponseDTO agregarItem(Integer usuarioId, ItemCarritoRequestDTO request) {
        ProductoRepository.EstadoYComercioProducto lectura = productoRepository
                .leerEstadoConBloqueoCompartido(request.getProductoId())
                .orElseThrow(() -> new RecursoNoEncontradoException("Producto no encontrado"));
        if (!EstadoProducto.DISPONIBLE.name().equals(lectura.getEstado())) {
            throw new ConflictoDeNegocioException("El producto no está disponible");
        }

        Carrito carrito = obtenerOCrearBloqueado(usuarioId);
        Producto producto = productoRepository.findById(request.getProductoId())
                .orElseThrow(() -> new RecursoNoEncontradoException("Producto no encontrado"));

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
        Carrito carrito = obtenerOCrearBloqueado(usuarioId);

        if (itemCarritoRepository.actualizarCantidad(itemId, carrito.getId(), cantidad) == 0) {
            throw new RecursoNoEncontradoException("Ítem no encontrado");
        }

        return aResponseDTO(carrito);
    }

    public CarritoResponseDTO eliminarItem(Integer usuarioId, Integer itemId) {
        Carrito carrito = obtenerOCrearBloqueado(usuarioId);

        if (itemCarritoRepository.borrarDelCarrito(itemId, carrito.getId()) == 0) {
            throw new RecursoNoEncontradoException("Ítem no encontrado");
        }
        if (itemCarritoRepository.leerAlgunItemConBloqueo(carrito.getId()).isEmpty()) {
            carrito.setComercio(null);
            carritoRepository.save(carrito);
        }

        return aResponseDTO(carrito);
    }

    public void vaciarCarrito(Integer usuarioId) {
        Carrito carrito = obtenerOCrearBloqueado(usuarioId);
        itemCarritoRepository.borrarPorCarritoId(carrito.getId());
        carrito.setComercio(null);
        carritoRepository.save(carrito);
    }

    /**
     * Vaciado por pago aprobado: vacía el carrito del Cliente solo si, con el carrito ya bloqueado, sigue siendo del
     * comercio del pedido pagado. Quien llama tiene el pedido bloqueado y tiene que llamar a este método al final de su
     * trabajo (el carrito es la última hoja del orden de bloqueos). No carga la entidad {@link Carrito}: decide con
     * lo último confirmado y no deja una entidad vieja en el contexto de persistencia.
     */
    public void vaciarSiEsDelComercio(Integer clienteId, Integer comercioId) {
        carritoRepository.bloquearPorClienteId(clienteId)
                .filter(carrito -> comercioId.equals(carrito.getComercioId()))
                .ifPresent(carrito -> {
                    itemCarritoRepository.borrarPorCarritoId(carrito.getId());
                    carritoRepository.quitarComercio(carrito.getId());
                });
    }

    /**
     * Primera mitad de la baja de un producto de los carritos (el Dueño lo pasó a {@code AGOTADO} o
     * {@code DESCONTINUADO}): busca los carritos que lo contienen y toma, en id ascendente, los usuarios de sus
     * Clientes con {@code LOCK IN SHARE MODE} (los avisos tienen clave foránea a esos usuarios, que van antes que el
     * carrito en el orden global). Quien llama ya tiene el producto bloqueado {@code FOR UPDATE}, y desde entonces
     * nadie puede agregarlo a un carrito: lo que se encuentra solo puede desaparecer. Esta tiene que ser la primera
     * lectura común de la transacción, para que su foto se fije después del bloqueo del producto.
     */
    public List<CarritoAfectado> prepararQuitarProducto(Integer productoId) {
        List<CarritoAfectado> afectados = itemCarritoRepository.findCarritosConProducto(productoId);
        new TreeSet<>(afectados.stream().map(CarritoAfectado::getClienteId).toList())
                .forEach(clienteId -> usuarioRepository.leerIdConBloqueoCompartido(clienteId));
        return afectados;
    }

    /**
     * Segunda mitad: bloquea los carritos afectados en id ascendente y, con ellos bloqueados, borra los ítems del
     * producto, avisa a cada Cliente al que realmente se le quitó un ítem y deja sin comercio al carrito que quedó
     * vacío (la vacuidad se decide con una lectura actual). Es lo último que hace la transacción del Dueño: después
     * del carrito solo se escriben filas del propio carrito y avisos, cuyas claves foráneas ya están tomadas.
     */
    public void quitarProductoDeLosCarritos(Integer productoId, String productoNombre, List<CarritoAfectado> afectados) {
        if (afectados.isEmpty()) {
            return;
        }
        carritoRepository.bloquearPorIds(afectados.stream().map(CarritoAfectado::getCarritoId).toList());
        for (CarritoAfectado afectado : afectados) {
            int borrados = itemCarritoRepository.borrarPorCarritoIdYProductoId(afectado.getCarritoId(), productoId);
            if (borrados > 0) {
                notificacionService.crearParaCliente(afectado.getClienteId(),
                        "El producto '" + productoNombre + "' ya no está disponible y fue eliminado de tu carrito.",
                        TipoNotificacion.PRODUCTO_REMOVIDO_CARRITO);
            }
            if (itemCarritoRepository.leerAlgunItemConBloqueo(afectado.getCarritoId()).isEmpty()) {
                carritoRepository.quitarComercio(afectado.getCarritoId());
            }
        }
    }

    private Carrito obtenerOCrearBloqueado(Integer usuarioId) {
        crearSiNoExiste(usuarioId);
        Carrito carrito = carritoRepository.findByClienteIdConBloqueo(usuarioId)
                .orElseThrow(() -> new RecursoNoEncontradoException("Cliente no encontrado"));
        entityManager.refresh(carrito, LockModeType.PESSIMISTIC_WRITE);
        return carrito;
    }

    private void crearSiNoExiste(Integer usuarioId) {
        try {
            carritoInsercionRepository.crearSiNoExiste(usuarioId);
        } catch (DataIntegrityViolationException ex) {
            throw new RecursoNoEncontradoException("Cliente no encontrado");
        }
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

        BigDecimal cargoServicioCliente = BigDecimal.ZERO;
        if (subtotal.compareTo(BigDecimal.ZERO) > 0) {
            ConfiguracionTarifa tarifaVigente = configuracionTarifaService.obtenerVigente();
            cargoServicioCliente = configuracionTarifaService.calcularCargoCliente(subtotal, tarifaVigente);
        }

        return new CarritoResponseDTO(comercioId, nombreComercio, items, subtotal, cargoServicioCliente);
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
