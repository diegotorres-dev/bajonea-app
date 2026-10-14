package com.bajonea.backend.services;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import com.bajonea.backend.config.security.ComercioActivo;
import com.bajonea.backend.dto.request.AnulacionPedidoRequestDTO;
import com.bajonea.backend.dto.request.ImagenProductoRequestDTO;
import com.bajonea.backend.dto.request.ProductoRequestDTO;
import com.bajonea.backend.dto.request.RechazoPedidoRequestDTO;
import com.bajonea.backend.enums.EstadoComercio;
import com.bajonea.backend.enums.EstadoProducto;
import com.bajonea.backend.enums.MotivoRechazo;
import com.bajonea.backend.enums.RolActorComercio;
import com.bajonea.backend.exceptions.RecursoNoEncontradoException;
import com.bajonea.backend.services.DatosPruebaEmpleado.Cuenta;
import com.bajonea.backend.services.DatosPruebaEmpleado.Dueno;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Callable;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

/**
 * Pertenencia cruzada de las escrituras delegadas (E3, bloque A5): un Empleado activo de un comercio no puede tocar
 * un producto, una imagen ni un pedido de otro comercio aunque conozca los ids. Cada servicio responde
 * {@code RecursoNoEncontradoException} (404) y no cambia nada. Es la comprobación de servicio de lo que el spec 50
 * de Playwright y la carpeta 66 de Newman comprueban por HTTP.
 */
@SpringBootTest
@ActiveProfiles("test")
class PertenenciaCruzadaDelegablesIntegrationTest {

    @Autowired
    private PedidoService pedidoService;
    @Autowired
    private ProductoService productoService;
    @Autowired
    private RegistroService registroService;
    @Autowired
    private JdbcTemplate jdbcTemplate;
    @Autowired
    private ObjectMapper objectMapper;

    @MockitoBean
    private EmailService emailService;
    @MockitoBean
    private MercadoPagoReembolsoClient reembolsoClient;

    private DatosPruebaEmpleado datos;

    @BeforeEach
    void preparar() {
        datos = new DatosPruebaEmpleado(registroService, objectMapper, jdbcTemplate);
    }

    private record Comercio(Dueno dueno, int clienteId) {
    }

    private Comercio comercio() {
        Dueno dueno = datos.registrarDuenoAprobado();
        datos.cambiarEstadoComercio(dueno.comercioId(), "APTO_VENTA");
        return new Comercio(dueno, datos.registrarCliente());
    }

    private ComercioActivo empleadoDe(Comercio propio, Cuenta empleado) {
        return new ComercioActivo(propio.dueno().comercioId(), propio.dueno().id(), empleado.id(), RolActorComercio.EMPLEADO,
                EstadoComercio.APTO_VENTA);
    }

    private int producto(Comercio c) {
        jdbcTemplate.update("INSERT INTO categoria (nombre) VALUES (?)", "Cat A5 " + DatosPruebaEmpleado.sufijo());
        int categoriaId = jdbcTemplate.queryForObject("SELECT LAST_INSERT_ID()", Integer.class);
        return productoService.crearProducto(ComercioActivo.delDueno(c.dueno().comercioId(), c.dueno().id(), EstadoComercio.APTO_VENTA),
                new ProductoRequestDTO("Producto A5 " + DatosPruebaEmpleado.sufijo(), "desc", new BigDecimal("1500"), categoriaId, List.of())).getId();
    }

    private int imagen(int productoId) {
        jdbcTemplate.update("INSERT INTO imagen_producto (producto_id, url, orden, es_principal) VALUES (?, ?, 0, 1)", productoId,
                "https://res.cloudinary.com/demo/image/upload/v1/x" + DatosPruebaEmpleado.sufijo() + ".png");
        return jdbcTemplate.queryForObject("SELECT LAST_INSERT_ID()", Integer.class);
    }

    private int pedido(Comercio c, String estado) {
        jdbcTemplate.update("INSERT INTO pedido (cliente_id, comercio_id, modalidad_entrega, estado, pago_estado, subtotal, "
                + "cargo_servicio_cliente, cargo_servicio_comercio, total, fecha_creacion) "
                + "VALUES (?, ?, 'RETIRO', ?, 'PAGADO', 10000, 200, 100, 10200, ?)",
                c.clienteId(), c.dueno().comercioId(), estado, LocalDateTime.now().minusHours(1));
        int id = jdbcTemplate.queryForObject("SELECT LAST_INSERT_ID()", Integer.class);
        historial(id, "PENDIENTE_CONFIRMACION_COMERCIO", "SISTEMA", null, 100);
        if (!estado.equals("PENDIENTE_CONFIRMACION_COMERCIO")) {
            historial(id, "EN_PREPARACION", "DUENO", c.dueno().id(), 50);
        }
        if (estado.equals("LISTO_PARA_RETIRAR")) {
            historial(id, estado, "DUENO", c.dueno().id(), 10);
        }
        jdbcTemplate.update("INSERT INTO pago (pedido_id, monto, mp_estado, id_transaccion_mp, fecha_creacion, fecha_confirmacion) "
                + "VALUES (?, 10200, 'approved', ?, NOW(), NOW())", id, "a5-" + id);
        return id;
    }

    private void historial(int pedidoId, String estado, String actorRol, Integer actorUsuarioId, int minutosAtras) {
        jdbcTemplate.update("INSERT INTO historial_estado_pedido (pedido_id, estado, actor_rol, actor_usuario_id, fecha_hora) VALUES (?, ?, ?, ?, ?)",
                pedidoId, estado, actorRol, actorUsuarioId, LocalDateTime.now().minusMinutes(minutosAtras));
    }

    private String estadoPedido(int pedidoId) {
        return jdbcTemplate.queryForObject("SELECT estado FROM pedido WHERE id = ?", String.class, pedidoId);
    }

    private int filasDeHistorial(int pedidoId) {
        return jdbcTemplate.queryForObject("SELECT COUNT(*) FROM historial_estado_pedido WHERE pedido_id = ?", Integer.class, pedidoId);
    }

    private String nombreDelProducto(int productoId) {
        return jdbcTemplate.queryForObject("SELECT nombre FROM producto WHERE id = ?", String.class, productoId);
    }

    private int imagenesDelProducto(int productoId) {
        return jdbcTemplate.queryForObject("SELECT COUNT(*) FROM imagen_producto WHERE producto_id = ?", Integer.class, productoId);
    }

    private void esperar404(String mensaje, String etiqueta, Callable<?> escritura) {
        RecursoNoEncontradoException ex = assertThrows(RecursoNoEncontradoException.class, escritura::call, etiqueta);
        assertEquals(mensaje, ex.getMessage(), etiqueta);
    }

    @Test
    void lasSeisAccionesDePedidoSobreUnPedidoDeOtroComercioDan404SinCambiarNada() {
        Comercio propio = comercio();
        Comercio ajeno = comercio();
        Cuenta empleado = datos.registrarClienteConCredenciales();
        datos.vincularEmpleado(empleado.id(), propio.dueno().comercioId(), "ACTIVO", LocalDateTime.now().minusDays(1));
        ComercioActivo actor = empleadoDe(propio, empleado);

        int pendiente = pedido(ajeno, "PENDIENTE_CONFIRMACION_COMERCIO");
        int enPreparacion = pedido(ajeno, "EN_PREPARACION");
        int listo = pedido(ajeno, "LISTO_PARA_RETIRAR");
        int filasPendiente = filasDeHistorial(pendiente);
        int filasPreparacion = filasDeHistorial(enPreparacion);
        int filasListo = filasDeHistorial(listo);

        esperar404("Pedido no encontrado", "aceptar", () -> pedidoService.aceptarPedido(actor, pendiente));
        esperar404("Pedido no encontrado", "rechazar",
                () -> pedidoService.rechazarPedido(actor, pendiente, new RechazoPedidoRequestDTO(MotivoRechazo.SIN_STOCK, null)));
        esperar404("Pedido no encontrado", "despachar", () -> pedidoService.avanzarAEntregaEnCurso(actor, enPreparacion));
        esperar404("Pedido no encontrado", "anular",
                () -> pedidoService.anularPedido(actor, enPreparacion, new AnulacionPedidoRequestDTO(MotivoRechazo.SIN_STOCK, null)));
        esperar404("Pedido no encontrado", "entregar", () -> pedidoService.confirmarEntregaComercio(actor, listo));
        esperar404("Pedido no encontrado", "no-retirado", () -> pedidoService.cerrarComoNoRetirado(actor, listo));

        assertEquals("PENDIENTE_CONFIRMACION_COMERCIO", estadoPedido(pendiente));
        assertEquals("EN_PREPARACION", estadoPedido(enPreparacion));
        assertEquals("LISTO_PARA_RETIRAR", estadoPedido(listo));
        assertEquals(filasPendiente, filasDeHistorial(pendiente));
        assertEquals(filasPreparacion, filasDeHistorial(enPreparacion));
        assertEquals(filasListo, filasDeHistorial(listo));
    }

    @Test
    void lasEscriturasDeProductoEImagenSobreRecursosDeOtroComercioDan404SinCambiarNada() {
        Comercio propio = comercio();
        Comercio ajeno = comercio();
        Cuenta empleado = datos.registrarClienteConCredenciales();
        datos.vincularEmpleado(empleado.id(), propio.dueno().comercioId(), "ACTIVO", LocalDateTime.now().minusDays(1));
        ComercioActivo actor = empleadoDe(propio, empleado);

        int productoAjeno = producto(ajeno);
        int imagenAjena = imagen(productoAjeno);
        int productoPropio = producto(propio);
        int imagenDelPropio = imagen(productoPropio);
        String nombreAntes = nombreDelProducto(productoAjeno);
        int imagenesAntes = imagenesDelProducto(productoAjeno);
        String urlNueva = "https://res.cloudinary.com/demo/image/upload/v1/otra.png";

        List<String> etiquetas = new ArrayList<>();
        List<Callable<?>> producto = List.of(
                () -> productoService.editarProducto(actor, productoAjeno, new ProductoRequestDTO("Cambiado", "d", new BigDecimal("1"), 1, List.of())),
                () -> productoService.cambiarEstado(actor, productoAjeno, EstadoProducto.AGOTADO),
                () -> productoService.generarFirmaImagen(actor, productoAjeno),
                () -> productoService.agregarImagen(actor, productoAjeno, new ImagenProductoRequestDTO(urlNueva, 1, false)),
                () -> {
                    productoService.eliminarImagen(actor, productoAjeno, imagenAjena);
                    return null;
                },
                () -> productoService.reordenarImagen(actor, productoAjeno, imagenAjena, 2),
                () -> productoService.generarFirmaRecorteImagen(actor, productoAjeno, imagenAjena),
                () -> productoService.actualizarUrlImagen(actor, productoAjeno, imagenAjena, urlNueva));
        for (Callable<?> escritura : producto) {
            etiquetas.add("producto ajeno " + etiquetas.size());
            esperar404("Producto no encontrado", etiquetas.get(etiquetas.size() - 1), escritura);
        }

        List<Callable<?>> imagenDeOtroProducto = List.of(
                () -> {
                    productoService.eliminarImagen(actor, productoPropio, imagenAjena);
                    return null;
                },
                () -> productoService.reordenarImagen(actor, productoPropio, imagenAjena, 2),
                () -> productoService.generarFirmaRecorteImagen(actor, productoPropio, imagenAjena),
                () -> productoService.actualizarUrlImagen(actor, productoPropio, imagenAjena, urlNueva));
        int indice = 0;
        for (Callable<?> escritura : imagenDeOtroProducto) {
            esperar404("Imagen no encontrada", "imagen de otro producto " + indice++, escritura);
        }

        assertEquals(nombreAntes, nombreDelProducto(productoAjeno));
        assertEquals(imagenesAntes, imagenesDelProducto(productoAjeno));
        assertEquals(1, imagenesDelProducto(productoPropio));
        assertEquals(imagenDelPropio, jdbcTemplate.queryForObject("SELECT id FROM imagen_producto WHERE producto_id = ?", Integer.class, productoPropio));
    }
}
