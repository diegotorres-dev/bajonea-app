package com.bajonea.backend.services;

import com.bajonea.backend.config.security.ComercioActivo;
import com.bajonea.backend.dto.request.ImagenProductoRequestDTO;
import com.bajonea.backend.dto.request.ProductoRequestDTO;
import com.bajonea.backend.dto.response.CategoriaFiltroResponseDTO;
import com.bajonea.backend.dto.response.CloudinarySignatureResponseDTO;
import com.bajonea.backend.dto.response.FiltrosCatalogoResponseDTO;
import com.bajonea.backend.dto.response.ImagenProductoResponseDTO;
import com.bajonea.backend.dto.response.ProductoResponseDTO;
import com.bajonea.backend.dto.response.ProductosPaginadosResponseDTO;
import com.bajonea.backend.dto.response.TagFiltroResponseDTO;
import com.bajonea.backend.entities.Categoria;
import com.bajonea.backend.entities.Comercio;
import com.bajonea.backend.entities.ImagenProducto;
import com.bajonea.backend.entities.Producto;
import com.bajonea.backend.entities.ProductoTag;
import com.bajonea.backend.entities.ProductoTagId;
import com.bajonea.backend.entities.Tag;
import com.bajonea.backend.enums.AccionEdicion;
import com.bajonea.backend.enums.EstadoComercio;
import com.bajonea.backend.enums.EstadoProducto;
import com.bajonea.backend.enums.TipoEntidadEdicion;
import com.bajonea.backend.exceptions.ComercioNoDisponibleException;
import com.bajonea.backend.exceptions.ConflictoDeNegocioException;
import com.bajonea.backend.exceptions.RecursoNoEncontradoException;
import com.bajonea.backend.repositories.CategoriaRepository;
import com.bajonea.backend.repositories.ComercioRepository;
import com.bajonea.backend.repositories.ItemCarritoRepository.CarritoAfectado;
import com.bajonea.backend.repositories.ImagenProductoRepository;
import com.bajonea.backend.repositories.ProductoRepository;
import com.bajonea.backend.repositories.ProductoTagRepository;
import com.bajonea.backend.repositories.TagRepository;
import com.bajonea.backend.util.TextoUtils;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Objects;
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
    private final CarritoService carritoService;
    private final CloudinaryService cloudinaryService;
    private final HistorialEdicionComercioService historialEdicionComercioService;

    public ProductoResponseDTO crearProducto(ComercioActivo actor, ProductoRequestDTO request) {
        Comercio comercio = iniciarEscrituraDeCatalogo(actor);
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
        historialEdicionComercioService.registrar(actor, TipoEntidadEdicion.PRODUCTO, producto.getId(), producto.getNombre(),
                AccionEdicion.CREAR, null);

        return aResponseDTO(producto);
    }

    public ProductoResponseDTO editarProducto(ComercioActivo actor, Integer productoId, ProductoRequestDTO request) {
        Comercio comercio = iniciarEscrituraDeCatalogo(actor);
        Producto producto = obtenerProductoDelComercio(productoId, comercio);

        if (producto.getEstado() == EstadoProducto.DESCONTINUADO) {
            throw new ConflictoDeNegocioException("No se puede editar un producto descontinuado");
        }

        if (imagenProductoRepository.countByProductoId(productoId) == 0) {
            throw new ConflictoDeNegocioException("Agregá al menos una foto del producto antes de guardar los cambios");
        }

        Categoria categoria = obtenerCategoria(request.getCategoriaId());

        String nombreNuevo = TextoUtils.aTitleCase(request.getNombre());
        List<Integer> tagsAntes = productoTagRepository.findByProductoId(productoId).stream()
                .map(productoTag -> productoTag.getTag().getId()).sorted().toList();
        List<Integer> tagsDespues = request.getTagIds() == null ? List.of()
                : request.getTagIds().stream().distinct().sorted().toList();
        List<String> camposCambiados = new ArrayList<>();
        if (!Objects.equals(producto.getNombre(), nombreNuevo)) {
            camposCambiados.add("nombre");
        }
        if (!Objects.equals(producto.getDescripcion(), request.getDescripcion())) {
            camposCambiados.add("descripción");
        }
        if (producto.getPrecio().compareTo(request.getPrecio()) != 0) {
            camposCambiados.add("precio");
        }
        if (!producto.getCategoria().getId().equals(categoria.getId())) {
            camposCambiados.add("categoría");
        }
        if (!tagsAntes.equals(tagsDespues)) {
            camposCambiados.add("etiquetas");
        }

        producto.setNombre(nombreNuevo);
        producto.setDescripcion(request.getDescripcion());
        producto.setPrecio(request.getPrecio());
        producto.setCategoria(categoria);
        producto.setFechaModificacion(LocalDateTime.now());
        productoRepository.save(producto);

        productoTagRepository.deleteByProductoId(productoId);
        asignarTags(producto, request.getTagIds());

        if (!camposCambiados.isEmpty()) {
            historialEdicionComercioService.registrar(actor, TipoEntidadEdicion.PRODUCTO, producto.getId(), producto.getNombre(),
                    AccionEdicion.EDITAR, HistorialEdicionComercioService.detalleDeEdicion(camposCambiados));
        }

        return aResponseDTO(producto);
    }

    public List<ProductoResponseDTO> listarProductosDelComercio(Integer comercioId) {
        Comercio comercio = obtenerComercio(comercioId);
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
                .findByComercio_EstadoAndEstadoNot(EstadoComercio.APTO_VENTA, EstadoProducto.DESCONTINUADO);

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
                .findByComercio_EstadoAndEstadoNot(EstadoComercio.APTO_VENTA, EstadoProducto.DESCONTINUADO);

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

    /**
     * Cambio de estado del producto. Orden de bloqueo: el usuario que actúa (y su relación si es Empleado), el
     * producto {@code FOR UPDATE} como primera lectura de la transacción, los usuarios de los Clientes cuyos carritos
     * lo contienen, el historial de la edición y, al final, esos carritos (última hoja del orden global). Con el
     * producto bloqueado nadie puede agregarlo a un carrito, así que los carritos que lo contienen solo pueden perder
     * ítems; no se hace ninguna lectura común antes del bloqueo para que la foto de la transacción incluya todo lo que
     * se confirmó antes de él. Ver {@link CarritoService}.
     */
    public ProductoResponseDTO cambiarEstado(ComercioActivo actor, Integer productoId, EstadoProducto nuevoEstado) {
        iniciarEscrituraDeCatalogoSinLeerComercio(actor);
        Producto producto = productoRepository.findByIdConBloqueo(productoId)
                .orElseThrow(() -> new RecursoNoEncontradoException("Producto no encontrado"));
        if (!producto.getComercio().getId().equals(actor.comercioId())) {
            throw new RecursoNoEncontradoException("Producto no encontrado");
        }

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

        boolean quitaDeCarritos = nuevoEstado == EstadoProducto.AGOTADO || nuevoEstado == EstadoProducto.DESCONTINUADO;
        List<CarritoAfectado> afectados = quitaDeCarritos ? carritoService.prepararQuitarProducto(producto.getId()) : List.of();
        historialEdicionComercioService.registrar(actor, TipoEntidadEdicion.PRODUCTO, producto.getId(), producto.getNombre(),
                AccionEdicion.CAMBIAR_ESTADO, "Pasó a " + textoDeEstado(nuevoEstado));
        if (quitaDeCarritos) {
            carritoService.quitarProductoDeLosCarritos(producto.getId(), producto.getNombre(), afectados);
        }

        return aResponseDTO(producto);
    }

    public CloudinarySignatureResponseDTO generarFirmaImagen(ComercioActivo actor, Integer productoId) {
        ComercioActivoService.validarComercioModificable(actor, actor.estadoComercio());
        Comercio comercio = obtenerComercio(actor.comercioId());
        Producto producto = obtenerProductoDelComercio(productoId, comercio);
        return cloudinaryService.generarFirmaImagenProducto(comercio.getId(), producto.getId());
    }

    public CloudinarySignatureResponseDTO generarFirmaRecorteImagen(ComercioActivo actor, Integer productoId, Integer imagenId) {
        ComercioActivoService.validarComercioModificable(actor, actor.estadoComercio());
        Comercio comercio = obtenerComercio(actor.comercioId());
        Producto producto = obtenerProductoDelComercio(productoId, comercio);
        obtenerImagenDelProducto(imagenId, producto);
        return cloudinaryService.generarFirmaRecorteImagen(comercio.getId(), producto.getId());
    }

    public ImagenProductoResponseDTO agregarImagen(ComercioActivo actor, Integer productoId, ImagenProductoRequestDTO request) {
        Comercio comercio = iniciarEscrituraDeCatalogo(actor);
        Producto producto = obtenerProductoDelComercio(productoId, comercio);

        cloudinaryService.validarImagenProducto(comercio.getId(), producto.getId(), request.getUrl());

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
        historialEdicionComercioService.registrar(actor, TipoEntidadEdicion.IMAGEN_PRODUCTO, imagen.getId(), producto.getNombre(),
                AccionEdicion.CREAR, null);

        return new ImagenProductoResponseDTO(imagen.getId(), imagen.getUrl(), imagen.getOrden(), imagen.isEsPrincipal());
    }

    public void eliminarImagen(ComercioActivo actor, Integer productoId, Integer imagenId) {
        Comercio comercio = iniciarEscrituraDeCatalogo(actor);
        Producto producto = obtenerProductoDelComercio(productoId, comercio);
        ImagenProducto imagen = obtenerImagenDelProducto(imagenId, producto);
        imagenProductoRepository.delete(imagen);
        recalcularImagenPrincipal(productoId);
        historialEdicionComercioService.registrar(actor, TipoEntidadEdicion.IMAGEN_PRODUCTO, imagenId, producto.getNombre(),
                AccionEdicion.ELIMINAR, null);
    }

    public ImagenProductoResponseDTO reordenarImagen(ComercioActivo actor, Integer productoId, Integer imagenId, Integer nuevoOrden) {
        Comercio comercio = iniciarEscrituraDeCatalogo(actor);
        Producto producto = obtenerProductoDelComercio(productoId, comercio);
        ImagenProducto imagen = obtenerImagenDelProducto(imagenId, producto);

        boolean cambioElOrden = !Objects.equals(imagen.getOrden(), nuevoOrden);
        imagen.setOrden(nuevoOrden);
        imagenProductoRepository.save(imagen);
        recalcularImagenPrincipal(productoId);
        if (cambioElOrden) {
            historialEdicionComercioService.registrar(actor, TipoEntidadEdicion.IMAGEN_PRODUCTO, imagenId, producto.getNombre(),
                    AccionEdicion.EDITAR, "Editó: orden");
        }

        ImagenProducto actualizada = obtenerImagenDelProducto(imagenId, producto);
        return new ImagenProductoResponseDTO(actualizada.getId(), actualizada.getUrl(), actualizada.getOrden(), actualizada.isEsPrincipal());
    }

    public ImagenProductoResponseDTO actualizarUrlImagen(ComercioActivo actor, Integer productoId, Integer imagenId, String nuevaUrl) {
        Comercio comercio = iniciarEscrituraDeCatalogo(actor);
        Producto producto = obtenerProductoDelComercio(productoId, comercio);
        ImagenProducto imagen = obtenerImagenDelProducto(imagenId, producto);

        cloudinaryService.validarImagenProducto(comercio.getId(), producto.getId(), nuevaUrl);
        boolean cambioLaUrl = !Objects.equals(imagen.getUrl(), nuevaUrl);
        imagen.setUrl(nuevaUrl);
        imagenProductoRepository.save(imagen);
        if (cambioLaUrl) {
            historialEdicionComercioService.registrar(actor, TipoEntidadEdicion.IMAGEN_PRODUCTO, imagenId, producto.getNombre(),
                    AccionEdicion.EDITAR, "Editó: imagen");
        }

        return new ImagenProductoResponseDTO(imagen.getId(), imagen.getUrl(), imagen.getOrden(), imagen.isEsPrincipal());
    }

    private static String textoDeEstado(EstadoProducto estado) {
        return switch (estado) {
            case DISPONIBLE -> "disponible";
            case AGOTADO -> "agotado";
            case DESCONTINUADO -> "descontinuado";
        };
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

    private Comercio obtenerComercio(Integer comercioId) {
        return comercioRepository.findById(comercioId)
                .orElseThrow(() -> new RecursoNoEncontradoException("Comercio no encontrado"));
    }

    /**
     * Arranque común de las escrituras del catálogo: el usuario que actúa y, si es Empleado, su relación (ver
     * {@link HistorialEdicionComercioService#iniciarEscritura}); después, solo para el Empleado, el estado del
     * comercio leído con bloqueo compartido para aplicar el guard de suspensión. No escribe el comercio, así que el
     * bloqueo compartido no se mejora a exclusivo más adelante.
     */
    private Comercio iniciarEscrituraDeCatalogo(ComercioActivo actor) {
        iniciarEscrituraDeCatalogoSinLeerComercio(actor);
        return obtenerComercio(actor.comercioId());
    }

    /**
     * Las mismas lecturas con bloqueo de {@link #iniciarEscrituraDeCatalogo}, sin la lectura común del comercio: las
     * operaciones que necesitan que su foto de la transacción se fije después de un bloqueo propio (el cambio de
     * estado, que bloquea el producto) no pueden hacer ninguna lectura común antes.
     */
    private void iniciarEscrituraDeCatalogoSinLeerComercio(ComercioActivo actor) {
        historialEdicionComercioService.iniciarEscritura(actor);
        if (actor.esEmpleado()) {
            EstadoComercio estado = comercioRepository.leerEstadoConBloqueoCompartido(actor.comercioId())
                    .map(lectura -> EstadoComercio.valueOf(lectura.getEstado()))
                    .orElseThrow(ComercioNoDisponibleException::new);
            ComercioActivoService.validarComercioModificable(actor, estado);
        }
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
