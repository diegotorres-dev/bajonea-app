package com.bajonea.backend.services;

import com.bajonea.backend.dto.request.ProductoRequestDTO;
import com.bajonea.backend.dto.response.ImagenProductoResponseDTO;
import com.bajonea.backend.dto.response.ProductoResponseDTO;
import com.bajonea.backend.entities.Categoria;
import com.bajonea.backend.entities.Comercio;
import com.bajonea.backend.entities.ItemCarrito;
import com.bajonea.backend.entities.Producto;
import com.bajonea.backend.entities.ProductoTag;
import com.bajonea.backend.entities.ProductoTagId;
import com.bajonea.backend.entities.Tag;
import com.bajonea.backend.enums.EstadoProducto;
import com.bajonea.backend.exceptions.ConflictoDeNegocioException;
import com.bajonea.backend.exceptions.RecursoNoEncontradoException;
import com.bajonea.backend.repositories.CategoriaRepository;
import com.bajonea.backend.repositories.ComercioRepository;
import com.bajonea.backend.repositories.ImagenProductoRepository;
import com.bajonea.backend.repositories.ItemCarritoRepository;
import com.bajonea.backend.repositories.ProductoRepository;
import com.bajonea.backend.repositories.ProductoTagRepository;
import com.bajonea.backend.repositories.TagRepository;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Set;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * CRUD de Producto para el comercio autenticado + transición de estado. No incluye gestión
 * de galería ({@code ImagenProducto}) — diferida a la Fase 11 (Cloudinary), ver el propio
 * javadoc de {@code ProductoRequestDTO} y docs/DECISIONES.md.
 */
@Service
@RequiredArgsConstructor
@Transactional
public class ProductoService {

    private static final Map<EstadoProducto, Set<EstadoProducto>> TRANSICIONES_VALIDAS = Map.of(
            EstadoProducto.DISPONIBLE, Set.of(EstadoProducto.AGOTADO, EstadoProducto.DESCONTINUADO),
            EstadoProducto.AGOTADO, Set.of(EstadoProducto.DISPONIBLE, EstadoProducto.DESCONTINUADO),
            EstadoProducto.DESCONTINUADO, Set.of());

    private final ProductoRepository productoRepository;
    private final ComercioRepository comercioRepository;
    private final CategoriaRepository categoriaRepository;
    private final TagRepository tagRepository;
    private final ProductoTagRepository productoTagRepository;
    private final ImagenProductoRepository imagenProductoRepository;
    private final ItemCarritoRepository itemCarritoRepository;
    private final NotificacionService notificacionService;

    public ProductoResponseDTO crearProducto(Integer usuarioId, ProductoRequestDTO request) {
        Comercio comercio = obtenerComercioDelUsuario(usuarioId);
        Categoria categoria = obtenerCategoria(request.getCategoriaId());

        Producto producto = Producto.builder()
                .comercio(comercio)
                .categoria(categoria)
                .nombre(request.getNombre())
                .descripcion(request.getDescripcion())
                .precio(request.getPrecio())
                .estado(EstadoProducto.DISPONIBLE)
                .fechaCreacion(LocalDateTime.now())
                .build();
        productoRepository.save(producto);

        asignarTags(producto, request.getTagIds());

        return aResponseDTO(producto);
    }

    public ProductoResponseDTO editarProducto(Integer usuarioId, Integer productoId, ProductoRequestDTO request) {
        Comercio comercio = obtenerComercioDelUsuario(usuarioId);
        Producto producto = obtenerProductoDelComercio(productoId, comercio);

        if (producto.getEstado() == EstadoProducto.DESCONTINUADO) {
            throw new ConflictoDeNegocioException("No se puede editar un producto descontinuado");
        }

        Categoria categoria = obtenerCategoria(request.getCategoriaId());

        producto.setNombre(request.getNombre());
        producto.setDescripcion(request.getDescripcion());
        producto.setPrecio(request.getPrecio());
        producto.setCategoria(categoria);
        producto.setFechaModificacion(LocalDateTime.now());
        productoRepository.save(producto);

        productoTagRepository.deleteByProductoId(productoId);
        asignarTags(producto, request.getTagIds());

        return aResponseDTO(producto);
    }

    public List<ProductoResponseDTO> listarProductosDelComercio(Integer usuarioId) {
        Comercio comercio = obtenerComercioDelUsuario(usuarioId);
        return productoRepository.findByComercioId(comercio.getId()).stream()
                .map(this::aResponseDTO)
                .toList();
    }

    /**
     * Catálogo público (Fase 9, {@code CatalogoService}) — excluye {@code DESCONTINUADO}
     * pero no {@code AGOTADO}: un producto agotado se muestra igual, marcado por su propio
     * campo {@code estado} en el DTO, para que el frontend lo deshabilite en vez de ocultarlo
     * (decisión confirmada explícitamente, no estaba resuelta en la guía — ver docs/DECISIONES.md).
     */
    public List<ProductoResponseDTO> listarCatalogoDelComercio(Integer comercioId, Integer categoriaId, Integer tagId) {
        List<Producto> productos = productoRepository.findByComercioIdAndEstadoNot(comercioId, EstadoProducto.DESCONTINUADO);

        if (categoriaId != null) {
            productos = productos.stream()
                    .filter(producto -> producto.getCategoria().getId().equals(categoriaId))
                    .toList();
        }

        if (tagId != null) {
            List<Integer> productoIdsConTag = productoTagRepository.findByTagId(tagId).stream()
                    .map(productoTag -> productoTag.getProducto().getId())
                    .toList();
            productos = productos.stream()
                    .filter(producto -> productoIdsConTag.contains(producto.getId()))
                    .toList();
        }

        return productos.stream().map(this::aResponseDTO).toList();
    }

    public ProductoResponseDTO cambiarEstado(Integer usuarioId, Integer productoId, EstadoProducto nuevoEstado) {
        Comercio comercio = obtenerComercioDelUsuario(usuarioId);
        Producto producto = obtenerProductoDelComercio(productoId, comercio);

        EstadoProducto estadoActual = producto.getEstado();
        if (!TRANSICIONES_VALIDAS.getOrDefault(estadoActual, Set.of()).contains(nuevoEstado)) {
            throw new ConflictoDeNegocioException(
                    "No se puede pasar de " + estadoActual + " a " + nuevoEstado);
        }

        producto.setEstado(nuevoEstado);
        producto.setFechaModificacion(LocalDateTime.now());
        if (nuevoEstado == EstadoProducto.DESCONTINUADO) {
            producto.setFechaBaja(LocalDateTime.now());
        }
        productoRepository.save(producto);

        if (nuevoEstado == EstadoProducto.AGOTADO || nuevoEstado == EstadoProducto.DESCONTINUADO) {
            limpiarCarritosActivos(producto);
        }

        return aResponseDTO(producto);
    }

    private void limpiarCarritosActivos(Producto producto) {
        List<ItemCarrito> items = itemCarritoRepository.findByProductoId(producto.getId());
        for (ItemCarrito item : items) {
            notificacionService.crear(item.getCarrito().getCliente().getId(),
                    "El producto '" + producto.getNombre() + "' ya no está disponible y fue eliminado de tu carrito.");
        }
        itemCarritoRepository.deleteAll(items);
    }

    private void asignarTags(Producto producto, List<Integer> tagIds) {
        if (tagIds == null || tagIds.isEmpty()) {
            return;
        }
        for (Integer tagId : tagIds) {
            Tag tag = tagRepository.findById(tagId)
                    .orElseThrow(() -> new RecursoNoEncontradoException("Tag no encontrado: " + tagId));
            ProductoTagId id = new ProductoTagId(producto.getId(), tagId);
            ProductoTag productoTag = ProductoTag.builder().id(id).producto(producto).tag(tag).build();
            productoTagRepository.save(productoTag);
        }
    }

    private Comercio obtenerComercioDelUsuario(Integer usuarioId) {
        return comercioRepository.findByPersonaJuridicaId(usuarioId)
                .orElseThrow(() -> new RecursoNoEncontradoException("Comercio no encontrado"));
    }

    private Categoria obtenerCategoria(Integer categoriaId) {
        return categoriaRepository.findById(categoriaId)
                .orElseThrow(() -> new RecursoNoEncontradoException("Categoría no encontrada"));
    }

    private Producto obtenerProductoDelComercio(Integer productoId, Comercio comercio) {
        Producto producto = productoRepository.findById(productoId)
                .orElseThrow(() -> new RecursoNoEncontradoException("Producto no encontrado"));
        if (!producto.getComercio().getId().equals(comercio.getId())) {
            throw new RecursoNoEncontradoException("Producto no encontrado");
        }
        return producto;
    }

    private ProductoResponseDTO aResponseDTO(Producto producto) {
        List<ImagenProductoResponseDTO> imagenes = imagenProductoRepository.findByProductoIdOrderByOrdenAsc(producto.getId())
                .stream()
                .map(img -> new ImagenProductoResponseDTO(img.getId(), img.getUrl(), img.getOrden(), img.isEsPrincipal()))
                .toList();

        List<String> tags = productoTagRepository.findByProductoId(producto.getId()).stream()
                .map(pt -> pt.getTag().getNombre())
                .toList();

        return new ProductoResponseDTO(
                producto.getId(),
                producto.getNombre(),
                producto.getDescripcion(),
                producto.getPrecio(),
                producto.getCategoria().getId(),
                producto.getCategoria().getNombre(),
                producto.getComercio().getId(),
                producto.getComercio().getNombre(),
                producto.getEstado(),
                imagenes,
                tags);
    }
}
