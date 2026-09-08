package com.bajonea.backend.services;

import com.bajonea.backend.dto.request.ImagenProductoRequestDTO;
import com.bajonea.backend.dto.request.ProductoRequestDTO;
import com.bajonea.backend.dto.response.CategoriaFiltroResponseDTO;
import com.bajonea.backend.dto.response.CloudinarySignatureResponseDTO;
import com.bajonea.backend.dto.response.FiltrosCatalogoResponseDTO;
import com.bajonea.backend.dto.response.ImagenProductoResponseDTO;
import com.bajonea.backend.dto.response.ProductoResponseDTO;
import com.bajonea.backend.dto.response.ProductosPaginadosResponseDTO;
import com.bajonea.backend.dto.response.TagFiltroResponseDTO;
import com.bajonea.backend.entities.Carrito;
import com.bajonea.backend.entities.Categoria;
import com.bajonea.backend.entities.Comercio;
import com.bajonea.backend.entities.ImagenProducto;
import com.bajonea.backend.entities.ItemCarrito;
import com.bajonea.backend.entities.Producto;
import com.bajonea.backend.entities.ProductoTag;
import com.bajonea.backend.entities.ProductoTagId;
import com.bajonea.backend.entities.Tag;
import com.bajonea.backend.enums.EstadoComercio;
import com.bajonea.backend.enums.EstadoProducto;
import com.bajonea.backend.enums.TipoNotificacion;
import com.bajonea.backend.exceptions.ConflictoDeNegocioException;
import com.bajonea.backend.exceptions.RecursoNoEncontradoException;
import com.bajonea.backend.repositories.CarritoRepository;
import com.bajonea.backend.repositories.CategoriaRepository;
import com.bajonea.backend.repositories.ComercioRepository;
import com.bajonea.backend.repositories.ImagenProductoRepository;
import com.bajonea.backend.repositories.ItemCarritoRepository;
import com.bajonea.backend.repositories.ProductoRepository;
import com.bajonea.backend.repositories.ProductoTagRepository;
import com.bajonea.backend.repositories.TagRepository;
import com.bajonea.backend.util.TextoUtils;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * CRUD de Producto para el comercio autenticado + transición de estado + gestión de la
 * galería ({@code ImagenProducto}, Fase 11): firma de subida vía {@code CloudinaryService},
 * alta/baja/marcado de principal de imágenes individuales.
 */
@Service
@RequiredArgsConstructor
@Transactional
public class ProductoService {

    private static final Map<EstadoProducto, Set<EstadoProducto>> TRANSICIONES_VALIDAS = Map.of(
            EstadoProducto.DISPONIBLE, Set.of(EstadoProducto.AGOTADO, EstadoProducto.DESCONTINUADO),
            EstadoProducto.AGOTADO, Set.of(EstadoProducto.DISPONIBLE, EstadoProducto.DESCONTINUADO),
            EstadoProducto.DESCONTINUADO, Set.of());

    private static final int MAX_IMAGENES_POR_PRODUCTO = 5;
    private static final int TAMANIO_PAGINA_CATALOGO_GLOBAL = 20;

    private final ProductoRepository productoRepository;
    private final ComercioRepository comercioRepository;
    private final CategoriaRepository categoriaRepository;
    private final TagRepository tagRepository;
    private final ProductoTagRepository productoTagRepository;
    private final ImagenProductoRepository imagenProductoRepository;
    private final ItemCarritoRepository itemCarritoRepository;
    private final CarritoRepository carritoRepository;
    private final NotificacionService notificacionService;
    private final CloudinaryService cloudinaryService;

    public ProductoResponseDTO crearProducto(Integer usuarioId, ProductoRequestDTO request) {
        Comercio comercio = obtenerComercioDelUsuario(usuarioId);
        Categoria categoria = obtenerCategoria(request.getCategoriaId());

        Producto producto = Producto.builder()
                .comercio(comercio)
                .categoria(categoria)
                .nombre(TextoUtils.aTitleCase(request.getNombre()))
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

        if (imagenProductoRepository.countByProductoId(productoId) == 0) {
            throw new ConflictoDeNegocioException("Agregá al menos una foto del producto antes de guardar los cambios");
        }

        Categoria categoria = obtenerCategoria(request.getCategoriaId());

        producto.setNombre(TextoUtils.aTitleCase(request.getNombre()));
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

    /**
     * Catálogo público global (Tramo 16.15, punto 14, {@code explorar.html}) — productos de
     * todos los comercios {@code APROBADO}, orden aleatorio recalculado en cada request
     * (sin {@code ORDER BY RAND()} en SQL: el catálogo del MVP es chico, se trae completo,
     * se filtra/mezcla/pagina en memoria — mismo criterio ya usado en
     * {@link #listarCatalogoDelComercio}, que tampoco delega el filtro a SQL).
     * <p>
     * {@code tagIds} combina con AND (Tramo 16.16, punto 9): un producto solo pasa el filtro
     * si tiene todos los tags pedidos, no alcanza con uno solo — a diferencia de
     * {@code categoriaId}, que sigue siendo un único valor porque un producto tiene una sola
     * categoría.
     */
    public ProductosPaginadosResponseDTO listarCatalogoGlobal(
            Integer categoriaId, List<Integer> tagIds, String busqueda, Integer pagina) {
        List<Producto> productos = productoRepository
                .findByComercio_EstadoAndEstadoNot(EstadoComercio.APROBADO, EstadoProducto.DESCONTINUADO);

        if (categoriaId != null) {
            productos = productos.stream()
                    .filter(producto -> producto.getCategoria().getId().equals(categoriaId))
                    .toList();
        }

        if (tagIds != null && !tagIds.isEmpty()) {
            for (Integer tagId : tagIds) {
                List<Integer> productoIdsConTag = productoTagRepository.findByTagId(tagId).stream()
                        .map(productoTag -> productoTag.getProducto().getId())
                        .toList();
                productos = productos.stream()
                        .filter(producto -> productoIdsConTag.contains(producto.getId()))
                        .toList();
            }
        }

        if (busqueda != null && !busqueda.isBlank()) {
            String textoBuscado = busqueda.trim().toLowerCase();
            productos = productos.stream()
                    .filter(producto -> producto.getNombre().toLowerCase().contains(textoBuscado))
                    .toList();
        }

        List<Producto> mezclados = new ArrayList<>(productos);
        Collections.shuffle(mezclados);

        long totalProductos = mezclados.size();
        int totalPaginas = (int) Math.ceil(totalProductos / (double) TAMANIO_PAGINA_CATALOGO_GLOBAL);
        int paginaActual = pagina == null || pagina < 1 ? 1 : pagina;
        int desde = (paginaActual - 1) * TAMANIO_PAGINA_CATALOGO_GLOBAL;

        List<ProductoResponseDTO> productosDePagina = desde >= mezclados.size()
                ? List.of()
                : mezclados.subList(desde, Math.min(desde + TAMANIO_PAGINA_CATALOGO_GLOBAL, mezclados.size()))
                        .stream().map(this::aResponseDTO).toList();

        return new ProductosPaginadosResponseDTO(productosDePagina, paginaActual, totalPaginas, totalProductos);
    }

    /**
     * Categorías y tags realmente en uso por el catálogo público global (Tramo 16.15, punto
     * 14) — independiente de la paginación de {@link #listarCatalogoGlobal}, para que los
     * chips de filtro del frontend no dependan de qué haya en la página actual.
     */
    public FiltrosCatalogoResponseDTO listarFiltrosDisponibles() {
        List<Producto> productos = productoRepository
                .findByComercio_EstadoAndEstadoNot(EstadoComercio.APROBADO, EstadoProducto.DESCONTINUADO);

        List<CategoriaFiltroResponseDTO> categorias = productos.stream()
                .map(Producto::getCategoria)
                .distinct()
                .sorted(Comparator.comparing(Categoria::getNombre))
                .map(categoria -> new CategoriaFiltroResponseDTO(categoria.getId(), categoria.getNombre()))
                .toList();

        List<TagFiltroResponseDTO> tags = productos.stream()
                .flatMap(producto -> productoTagRepository.findByProductoId(producto.getId()).stream())
                .map(ProductoTag::getTag)
                .distinct()
                .sorted(Comparator.comparing(Tag::getNombre))
                .map(tag -> new TagFiltroResponseDTO(tag.getId(), tag.getNombre()))
                .toList();

        return new FiltrosCatalogoResponseDTO(categorias, tags);
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

    public CloudinarySignatureResponseDTO generarFirmaImagen(Integer usuarioId, Integer productoId) {
        Comercio comercio = obtenerComercioDelUsuario(usuarioId);
        Producto producto = obtenerProductoDelComercio(productoId, comercio);
        return cloudinaryService.generarFirmaImagenProducto(comercio.getId(), producto.getId());
    }

    public CloudinarySignatureResponseDTO generarFirmaRecorteImagen(Integer usuarioId, Integer productoId, Integer imagenId) {
        Comercio comercio = obtenerComercioDelUsuario(usuarioId);
        Producto producto = obtenerProductoDelComercio(productoId, comercio);
        obtenerImagenDelProducto(imagenId, producto);
        return cloudinaryService.generarFirmaRecorteImagen(comercio.getId(), producto.getId());
    }

    public ImagenProductoResponseDTO agregarImagen(Integer usuarioId, Integer productoId, ImagenProductoRequestDTO request) {
        Comercio comercio = obtenerComercioDelUsuario(usuarioId);
        Producto producto = obtenerProductoDelComercio(productoId, comercio);

        long existentes = imagenProductoRepository.countByProductoId(productoId);
        if (existentes >= MAX_IMAGENES_POR_PRODUCTO) {
            throw new ConflictoDeNegocioException(
                    "El producto ya tiene el máximo de " + MAX_IMAGENES_POR_PRODUCTO + " imágenes");
        }

        boolean esPrincipal = request.isEsPrincipal() || existentes == 0;
        if (esPrincipal) {
            desmarcarPrincipalActual(productoId);
        }

        ImagenProducto imagen = ImagenProducto.builder()
                .producto(producto)
                .url(request.getUrl())
                .orden(request.getOrden())
                .esPrincipal(esPrincipal)
                .build();
        imagenProductoRepository.save(imagen);

        return new ImagenProductoResponseDTO(imagen.getId(), imagen.getUrl(), imagen.getOrden(), imagen.isEsPrincipal());
    }

    public void eliminarImagen(Integer usuarioId, Integer productoId, Integer imagenId) {
        Comercio comercio = obtenerComercioDelUsuario(usuarioId);
        Producto producto = obtenerProductoDelComercio(productoId, comercio);
        ImagenProducto imagen = obtenerImagenDelProducto(imagenId, producto);
        imagenProductoRepository.delete(imagen);
        recalcularImagenPrincipal(productoId);
    }

    public ImagenProductoResponseDTO reordenarImagen(Integer usuarioId, Integer productoId, Integer imagenId, Integer nuevoOrden) {
        Comercio comercio = obtenerComercioDelUsuario(usuarioId);
        Producto producto = obtenerProductoDelComercio(productoId, comercio);
        ImagenProducto imagen = obtenerImagenDelProducto(imagenId, producto);

        imagen.setOrden(nuevoOrden);
        imagenProductoRepository.save(imagen);
        recalcularImagenPrincipal(productoId);

        ImagenProducto actualizada = obtenerImagenDelProducto(imagenId, producto);
        return new ImagenProductoResponseDTO(actualizada.getId(), actualizada.getUrl(), actualizada.getOrden(), actualizada.isEsPrincipal());
    }

    public ImagenProductoResponseDTO actualizarUrlImagen(Integer usuarioId, Integer productoId, Integer imagenId, String nuevaUrl) {
        Comercio comercio = obtenerComercioDelUsuario(usuarioId);
        Producto producto = obtenerProductoDelComercio(productoId, comercio);
        ImagenProducto imagen = obtenerImagenDelProducto(imagenId, producto);

        imagen.setUrl(nuevaUrl);
        imagenProductoRepository.save(imagen);

        return new ImagenProductoResponseDTO(imagen.getId(), imagen.getUrl(), imagen.getOrden(), imagen.isEsPrincipal());
    }

    private void desmarcarPrincipalActual(Integer productoId) {
        imagenProductoRepository.findByProductoIdOrderByOrdenAsc(productoId).stream()
                .filter(ImagenProducto::isEsPrincipal)
                .forEach(imagen -> {
                    imagen.setEsPrincipal(false);
                    imagenProductoRepository.save(imagen);
                });
    }

    private void recalcularImagenPrincipal(Integer productoId) {
        List<ImagenProducto> imagenes = imagenProductoRepository.findByProductoIdOrderByOrdenAsc(productoId);
        for (int i = 0; i < imagenes.size(); i++) {
            ImagenProducto imagen = imagenes.get(i);
            boolean debeSerPrincipal = i == 0;
            if (imagen.isEsPrincipal() != debeSerPrincipal) {
                imagen.setEsPrincipal(debeSerPrincipal);
                imagenProductoRepository.save(imagen);
            }
        }
    }

    private ImagenProducto obtenerImagenDelProducto(Integer imagenId, Producto producto) {
        ImagenProducto imagen = imagenProductoRepository.findById(imagenId)
                .orElseThrow(() -> new RecursoNoEncontradoException("Imagen no encontrada"));
        if (!imagen.getProducto().getId().equals(producto.getId())) {
            throw new RecursoNoEncontradoException("Imagen no encontrada");
        }
        return imagen;
    }

    private void limpiarCarritosActivos(Producto producto) {
        List<ItemCarrito> items = itemCarritoRepository.findByProductoId(producto.getId());
        Set<Carrito> carritosAfectados = new HashSet<>();
        for (ItemCarrito item : items) {
            notificacionService.crear(item.getCarrito().getCliente().getId(),
                    "El producto '" + producto.getNombre() + "' ya no está disponible y fue eliminado de tu carrito.",
                    TipoNotificacion.PRODUCTO_REMOVIDO_CARRITO);
            carritosAfectados.add(item.getCarrito());
        }
        itemCarritoRepository.deleteAll(items);

        for (Carrito carrito : carritosAfectados) {
            if (itemCarritoRepository.findByCarritoId(carrito.getId()).isEmpty()) {
                carrito.setComercio(null);
                carritoRepository.save(carrito);
            }
        }
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
        return comercioRepository.findByDuenoId(usuarioId)
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
