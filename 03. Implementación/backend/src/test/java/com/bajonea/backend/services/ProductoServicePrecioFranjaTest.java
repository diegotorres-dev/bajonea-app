package com.bajonea.backend.services;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.bajonea.backend.config.PrecioBloqueoProperties;
import com.bajonea.backend.config.security.ComercioActivo;
import com.bajonea.backend.dto.request.ProductoRequestDTO;
import com.bajonea.backend.dto.response.ProductoResponseDTO;
import com.bajonea.backend.entities.Categoria;
import com.bajonea.backend.entities.Comercio;
import com.bajonea.backend.entities.Horario;
import com.bajonea.backend.entities.Producto;
import com.bajonea.backend.enums.AccionEdicion;
import com.bajonea.backend.enums.DiaSemana;
import com.bajonea.backend.enums.EstadoComercio;
import com.bajonea.backend.enums.EstadoProducto;
import com.bajonea.backend.enums.RolActorComercio;
import com.bajonea.backend.exceptions.ConflictoComercioException;
import com.bajonea.backend.exceptions.ConflictoDeNegocioException;
import com.bajonea.backend.exceptions.RecursoNoEncontradoException;
import com.bajonea.backend.repositories.CategoriaRepository;
import com.bajonea.backend.repositories.ComercioRepository;
import com.bajonea.backend.repositories.HistorialCierreComercioRepository;
import com.bajonea.backend.repositories.HorarioRepository;
import com.bajonea.backend.repositories.ImagenProductoRepository;
import com.bajonea.backend.repositories.ProductoRepository;
import com.bajonea.backend.repositories.ProductoTagRepository;
import com.bajonea.backend.repositories.TagRepository;
import java.math.BigDecimal;
import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;

class ProductoServicePrecioFranjaTest {

    private static final LocalDate LUNES = LocalDate.of(2026, 10, 5);
    private static final int COMERCIO_ID = 5;
    private static final int PRODUCTO_ID = 40;

    private ProductoRepository productoRepository;
    private ComercioRepository comercioRepository;
    private CategoriaRepository categoriaRepository;
    private ImagenProductoRepository imagenProductoRepository;
    private ProductoTagRepository productoTagRepository;
    private HistorialEdicionComercioService historial;
    private HorarioRepository horarioRepository;
    private PrecioBloqueoProperties propiedades;
    private LocalDateTime ahora;
    private ProductoService service;
    private Producto producto;
    private Comercio comercio;
    private Categoria categoria;
    private ComercioActivo dueno;
    private ComercioActivo empleado;

    @BeforeEach
    void preparar() {
        productoRepository = mock(ProductoRepository.class);
        comercioRepository = mock(ComercioRepository.class);
        categoriaRepository = mock(CategoriaRepository.class);
        imagenProductoRepository = mock(ImagenProductoRepository.class);
        productoTagRepository = mock(ProductoTagRepository.class);
        historial = mock(HistorialEdicionComercioService.class);
        horarioRepository = mock(HorarioRepository.class);
        propiedades = new PrecioBloqueoProperties();
        ahora = LUNES.atTime(12, 0);
        DisponibilidadComercioService disponibilidad = new DisponibilidadComercioService(horarioRepository,
                mock(HistorialCierreComercioRepository.class), Clock.systemDefaultZone()) {
            @Override
            public LocalDateTime ahora() {
                return ahora;
            }
        };
        service = new ProductoService(productoRepository, comercioRepository, categoriaRepository, mock(TagRepository.class),
                productoTagRepository, imagenProductoRepository, mock(CarritoService.class), mock(CloudinaryService.class), historial,
                disponibilidad, propiedades);

        comercio = Comercio.builder().id(COMERCIO_ID).nombre("Pizzeria").estado(EstadoComercio.APTO_VENTA).build();
        categoria = Categoria.builder().id(1).nombre("Pizzas").build();
        producto = Producto.builder().id(PRODUCTO_ID).comercio(comercio).categoria(categoria).nombre("Muzzarella")
                .descripcion("Clasica").precio(new BigDecimal("1000.00")).estado(EstadoProducto.DISPONIBLE).build();
        dueno = ComercioActivo.delDueno(COMERCIO_ID, 9, EstadoComercio.APTO_VENTA);
        empleado = new ComercioActivo(COMERCIO_ID, 9, 31, RolActorComercio.EMPLEADO, EstadoComercio.APTO_VENTA);

        estadoDelComercio(EstadoComercio.APTO_VENTA);
        when(productoRepository.findByIdConBloqueo(PRODUCTO_ID)).thenReturn(Optional.of(producto));
        when(imagenProductoRepository.countByProductoId(PRODUCTO_ID)).thenReturn(1L);
        when(categoriaRepository.findById(1)).thenReturn(Optional.of(categoria));
        when(productoTagRepository.findByProductoId(anyInt())).thenReturn(List.of());
        when(imagenProductoRepository.findByProductoIdOrderByOrdenAsc(anyInt())).thenReturn(List.of());
        when(comercioRepository.findById(COMERCIO_ID)).thenReturn(Optional.of(comercio));
        when(productoRepository.findByComercioId(COMERCIO_ID)).thenReturn(List.of(producto));
        franjas(franja(DiaSemana.LUNES, 10, 0, 14, 0));
    }

    private void estadoDelComercio(EstadoComercio estado) {
        ComercioRepository.EstadoYCierreComercio lectura = mock(ComercioRepository.EstadoYCierreComercio.class);
        when(lectura.getEstado()).thenReturn(estado.name());
        when(comercioRepository.leerEstadoConBloqueoCompartido(COMERCIO_ID)).thenReturn(Optional.of(lectura));
    }

    private void franjas(Horario... horarios) {
        when(horarioRepository.findVigentesDesde(eq(COMERCIO_ID), any())).thenReturn(List.of(horarios));
    }

    private static Horario franja(DiaSemana dia, int horaApertura, int minutoApertura, int horaCierre, int minutoCierre) {
        return Horario.builder().diaSemana(dia).horaApertura(LocalTime.of(horaApertura, minutoApertura))
                .horaCierre(LocalTime.of(horaCierre, minutoCierre)).build();
    }

    private static ProductoRequestDTO pedido(String nombre, String precio) {
        return new ProductoRequestDTO(nombre, "Clasica", new BigDecimal(precio), 1, List.of());
    }

    private ConflictoComercioException bloqueada(ComercioActivo actor, String precio) {
        return assertThrows(ConflictoComercioException.class, () -> service.editarProducto(actor, PRODUCTO_ID, pedido("Muzzarella", precio)));
    }

    private void sinEscrituras() {
        verify(productoRepository, never()).save(any());
        verify(historial, never()).registrar(any(), any(), any(), any(), any(), any());
        assertEquals(new BigDecimal("1000.00"), producto.getPrecio());
    }

    @Test
    void unPrecioDistintoDentroDeLaFranjaBloqueaAlDueno() {
        ConflictoComercioException ex = bloqueada(dueno, "1200");

        assertEquals(ConflictoComercioException.PRECIO_BLOQUEADO_EN_FRANJA, ex.getCodigo());
        assertEquals("No podés cambiar precios mientras tu comercio está en horario de atención. Hacelo fuera de ese horario.",
                ex.getMessage());
        assertEquals(ConflictoComercioException.PRECIO_BLOQUEADO_EN_FRANJA, ex.getData().get("codigo"));
        sinEscrituras();
    }

    @Test
    void unPrecioDistintoDentroDeLaFranjaBloqueaAlEmpleado() {
        assertEquals(ConflictoComercioException.PRECIO_BLOQUEADO_EN_FRANJA, bloqueada(empleado, "1200").getCodigo());
        sinEscrituras();
    }

    @Test
    void elMismoPrecioConOtraEscalaNoBloquea() {
        assertDoesNotThrow(() -> service.editarProducto(dueno, PRODUCTO_ID, pedido("Muzzarella", "1000")));
        assertDoesNotThrow(() -> service.editarProducto(dueno, PRODUCTO_ID, pedido("Muzzarella", "1000.0")));
    }

    @Test
    void elMismoPrecioConOtrosCamposDistintosNoBloquea() {
        ProductoResponseDTO respuesta = service.editarProducto(dueno, PRODUCTO_ID,
                new ProductoRequestDTO("Napolitana", "Con ajo", new BigDecimal("1000.00"), 1, List.of()));

        assertEquals("Napolitana", respuesta.getNombre());
        verify(productoRepository).save(producto);
    }

    @Test
    void fueraDeLaFranjaNoBloquea() {
        ahora = LUNES.atTime(14, 0);

        ProductoResponseDTO respuesta = service.editarProducto(dueno, PRODUCTO_ID, pedido("Muzzarella", "1200"));

        assertEquals(new BigDecimal("1200"), respuesta.getPrecio());
        verify(historial).registrar(any(), any(), any(), any(), eq(AccionEdicion.EDITAR), any());
    }

    @Test
    void enOtroDiaDeLaSemanaSinFranjaNoBloquea() {
        ahora = LUNES.plusDays(1).atTime(12, 0);

        assertDoesNotThrow(() -> service.editarProducto(dueno, PRODUCTO_ID, pedido("Muzzarella", "1200")));
    }

    @Test
    void unaFranjaQueCruzaLaMedianocheBloqueaAntesYDespuesDeLas00() {
        franjas(franja(DiaSemana.LUNES, 23, 50, 0, 20));

        ahora = LUNES.atTime(23, 55);
        assertEquals(ConflictoComercioException.PRECIO_BLOQUEADO_EN_FRANJA, bloqueada(dueno, "1200").getCodigo());

        ahora = LUNES.plusDays(1).atTime(0, 10);
        assertEquals(ConflictoComercioException.PRECIO_BLOQUEADO_EN_FRANJA, bloqueada(dueno, "1200").getCodigo());

        ahora = LUNES.plusDays(1).atTime(0, 20);
        assertDoesNotThrow(() -> service.editarProducto(dueno, PRODUCTO_ID, pedido("Muzzarella", "1200")));
    }

    @Test
    void elCierreA2359ValeHasta2400() {
        franjas(franja(DiaSemana.LUNES, 0, 0, 23, 59));
        ahora = LUNES.atTime(23, 59, 30);

        assertEquals(ConflictoComercioException.PRECIO_BLOQUEADO_EN_FRANJA, bloqueada(dueno, "1200").getCodigo());
    }

    @Test
    void unComercioSinFranjasNuncaSeBloquea() {
        franjas();

        assertDoesNotThrow(() -> service.editarProducto(dueno, PRODUCTO_ID, pedido("Muzzarella", "1200")));
        assertFalse(service.listarProductosDelComercio(COMERCIO_ID).get(0).getPrecioBloqueado());
    }

    @ParameterizedTest
    @EnumSource(value = EstadoComercio.class, names = {"APTO_VENTA", "APROBADO", "CERRADO_TEMPORALMENTE"})
    void esFranjaPuraYNoMiraElEstadoDelComercioParaElDueno(EstadoComercio estado) {
        estadoDelComercio(estado);

        assertEquals(ConflictoComercioException.PRECIO_BLOQUEADO_EN_FRANJA, bloqueada(dueno, "1200").getCodigo());
    }

    @Test
    void conElComercioSuspendidoElGuardDeLaSuspensionVaAntesQueElDelPrecio() {
        estadoDelComercio(EstadoComercio.SUSPENDIDO);

        assertEquals(ConflictoComercioException.SUSPENDIDO, bloqueada(dueno, "1200").getCodigo());
    }

    @Test
    void elCierreManualNoLevantaElBloqueo() {
        comercio.setCerradoManualmente(true);

        assertEquals(ConflictoComercioException.PRECIO_BLOQUEADO_EN_FRANJA, bloqueada(dueno, "1200").getCodigo());
        verify(comercioRepository, never()).findById(anyInt());
    }

    @Test
    void conLaPropiedadApagadaNoBloqueaNiInformaBloqueo() {
        propiedades.setHabilitado(false);

        ProductoResponseDTO respuesta = service.editarProducto(dueno, PRODUCTO_ID, pedido("Muzzarella", "1200"));

        assertFalse(respuesta.getPrecioBloqueado());
        assertNull(respuesta.getPrecioBloqueadoHasta());
        assertFalse(service.listarProductosDelComercio(COMERCIO_ID).get(0).getPrecioBloqueado());
    }

    @Test
    void elAltaDeUnProductoNuncaSeBloquea() {
        ProductoRequestDTO alta = pedido("Nueva", "900");
        when(productoRepository.save(any(Producto.class))).thenAnswer(invocacion -> invocacion.getArgument(0));

        assertDoesNotThrow(() -> service.crearProducto(dueno, alta));
    }

    @Test
    void elEmpleadoDeUnComercioSuspendidoRecibeElConflictoDeSuspensionAntesQueElDePrecio() {
        estadoDelComercio(EstadoComercio.SUSPENDIDO);

        assertEquals(ConflictoComercioException.SUSPENDIDO, bloqueada(empleado, "1200").getCodigo());
    }

    @Test
    void unProductoAjenoDaNotFoundAntesQueElBloqueo() {
        comercio = Comercio.builder().id(77).build();
        producto = Producto.builder().id(PRODUCTO_ID).comercio(comercio).categoria(categoria).precio(new BigDecimal("1000.00"))
                .estado(EstadoProducto.DISPONIBLE).build();
        when(productoRepository.findByIdConBloqueo(PRODUCTO_ID)).thenReturn(Optional.of(producto));

        assertThrows(RecursoNoEncontradoException.class, () -> service.editarProducto(dueno, PRODUCTO_ID, pedido("Muzzarella", "1200")));
    }

    @Test
    void unProductoDescontinuadoDaSuConflictoAntesQueElBloqueo() {
        producto.setEstado(EstadoProducto.DESCONTINUADO);

        ConflictoDeNegocioException ex = assertThrows(ConflictoDeNegocioException.class,
                () -> service.editarProducto(dueno, PRODUCTO_ID, pedido("Muzzarella", "1200")));

        assertFalse(ex instanceof ConflictoComercioException);
        assertEquals("No se puede editar un producto descontinuado", ex.getMessage());
    }

    @Test
    void unProductoSinImagenesDaSuConflictoAntesQueElBloqueo() {
        when(imagenProductoRepository.countByProductoId(PRODUCTO_ID)).thenReturn(0L);

        ConflictoDeNegocioException ex = assertThrows(ConflictoDeNegocioException.class,
                () -> service.editarProducto(dueno, PRODUCTO_ID, pedido("Muzzarella", "1200")));

        assertFalse(ex instanceof ConflictoComercioException);
    }

    @Test
    void unaCategoriaInexistenteDaNotFoundAntesQueElBloqueo() {
        when(categoriaRepository.findById(1)).thenReturn(Optional.empty());

        assertThrows(RecursoNoEncontradoException.class, () -> service.editarProducto(dueno, PRODUCTO_ID, pedido("Muzzarella", "1200")));
    }

    @Test
    void laListaDelComercioInformaElBloqueoYLaHoraEnQueTermina() {
        ProductoResponseDTO fila = service.listarProductosDelComercio(COMERCIO_ID).get(0);

        assertTrue(fila.getPrecioBloqueado());
        assertEquals(LUNES.atTime(14, 0), fila.getPrecioBloqueadoHasta());
    }

    @Test
    void laListaDelComercioFueraDeFranjaInformaQueNoEstaBloqueado() {
        ahora = LUNES.atTime(15, 0);

        ProductoResponseDTO fila = service.listarProductosDelComercio(COMERCIO_ID).get(0);

        assertFalse(fila.getPrecioBloqueado());
        assertNull(fila.getPrecioBloqueadoHasta());
    }

    @Test
    void laRespuestaDeLaEdicionInformaElBloqueoConLaMismaLecturaDelGuard() {
        ProductoResponseDTO respuesta = service.editarProducto(dueno, PRODUCTO_ID, pedido("Otro nombre", "1000"));

        assertTrue(respuesta.getPrecioBloqueado());
        assertEquals(LUNES.atTime(14, 0), respuesta.getPrecioBloqueadoHasta());
    }

    @Test
    void elBloqueoTerminaCuandoTerminaLaCadenaDeFranjasContinuas() {
        franjas(franja(DiaSemana.LUNES, 0, 0, 23, 59), franja(DiaSemana.MARTES, 0, 0, 8, 0));
        ahora = LUNES.atTime(18, 0);

        ProductoResponseDTO fila = service.listarProductosDelComercio(COMERCIO_ID).get(0);

        assertTrue(fila.getPrecioBloqueado());
        assertEquals(LUNES.plusDays(1).atTime(8, 0), fila.getPrecioBloqueadoHasta());
    }

    @Test
    void conTodaLaSemanaAbiertaNoHayHoraDeLiberacion() {
        Horario[] semana = java.util.Arrays.stream(DiaSemana.values()).map(dia -> franja(dia, 0, 0, 23, 59)).toArray(Horario[]::new);
        franjas(semana);

        ProductoResponseDTO fila = service.listarProductosDelComercio(COMERCIO_ID).get(0);

        assertTrue(fila.getPrecioBloqueado());
        assertNull(fila.getPrecioBloqueadoHasta());
    }

    @Test
    void elCatalogoPublicoNoLlevaLosCamposDeBloqueo() {
        when(productoRepository.findByComercioIdAndEstadoNot(COMERCIO_ID, EstadoProducto.DESCONTINUADO)).thenReturn(List.of(producto));

        ProductoResponseDTO fila = service.listarCatalogoDelComercio(COMERCIO_ID, null, null).get(0);

        assertNull(fila.getPrecioBloqueado());
        assertNull(fila.getPrecioBloqueadoHasta());
    }
}
