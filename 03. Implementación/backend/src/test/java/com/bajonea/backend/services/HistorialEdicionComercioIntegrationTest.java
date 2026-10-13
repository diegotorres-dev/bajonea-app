package com.bajonea.backend.services;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.bajonea.backend.config.security.ComercioActivo;
import com.bajonea.backend.dto.request.ComercioPerfilRequestDTO;
import com.bajonea.backend.dto.request.FotoPerfilComercioRequestDTO;
import com.bajonea.backend.dto.request.ImagenProductoRequestDTO;
import com.bajonea.backend.dto.request.ProductoRequestDTO;
import com.bajonea.backend.dto.request.RedSocialRequestDTO;
import com.bajonea.backend.enums.AccionEdicion;
import com.bajonea.backend.enums.EstadoComercio;
import com.bajonea.backend.enums.EstadoProducto;
import com.bajonea.backend.enums.RolActorComercio;
import com.bajonea.backend.enums.TipoEntidadEdicion;
import com.bajonea.backend.enums.TipoRedSocial;
import com.bajonea.backend.services.DatosPruebaEmpleado.Dueno;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.transaction.IllegalTransactionStateException;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Bloque A1 de E3 con los servicios reales contra {@code bajonea_test}: cada escritura del catálogo, las imágenes,
 * el perfil y las redes sociales deja su fila en {@code historial_edicion_comercio} en la misma transacción, solo
 * ante un cambio efectivo, sin guardar valores, y con el rol del actor que se le pasó. El registro y la escritura
 * se confirman o se revierten juntos.
 */
@SpringBootTest
@ActiveProfiles("test")
class HistorialEdicionComercioIntegrationTest {

    @Autowired
    private ProductoService productoService;

    @Autowired
    private ComercioService comercioService;

    @Autowired
    private RedSocialService redSocialService;

    @Autowired
    private HistorialEdicionComercioService historialService;

    @Autowired
    private RegistroService registroService;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private PlatformTransactionManager transactionManager;

    @Value("${cloudinary.cloud-name:}")
    private String cloudName;

    @MockitoBean
    private EmailService emailService;

    private DatosPruebaEmpleado datos;
    private int categoriaId;
    private Dueno dueno;
    private ComercioActivo actor;

    @BeforeEach
    void preparar() {
        datos = new DatosPruebaEmpleado(registroService, objectMapper, jdbcTemplate);
        jdbcTemplate.update("INSERT IGNORE INTO categoria (nombre) VALUES ('Categoria historial IT')");
        categoriaId = jdbcTemplate.queryForObject("SELECT id FROM categoria WHERE nombre = 'Categoria historial IT'", Integer.class);
        dueno = datos.registrarDuenoAprobado();
        actor = ComercioActivo.delDueno(dueno.comercioId(), dueno.id(), EstadoComercio.APROBADO);
    }

    private ProductoRequestDTO producto(String nombre, String descripcion, String precio, List<Integer> tagIds) {
        return new ProductoRequestDTO(nombre, descripcion, new BigDecimal(precio), categoriaId, tagIds);
    }

    private int tagNuevo() {
        String nombre = "Tag historial " + DatosPruebaEmpleado.sufijo();
        jdbcTemplate.update("INSERT INTO tag (nombre) VALUES (?)", nombre);
        return jdbcTemplate.queryForObject("SELECT id FROM tag WHERE nombre = ?", Integer.class, nombre);
    }

    private String prefijoProducto(int productoId) {
        return "https://res.cloudinary.com/" + cloudName + "/image/upload/v1/productos/" + dueno.comercioId() + "/" + productoId + "/";
    }

    private int productoConImagen() {
        int id = productoService.crearProducto(actor, producto("producto base", "descripcion base", "1500", null)).getId();
        productoService.agregarImagen(actor, id, new ImagenProductoRequestDTO(prefijoProducto(id) + "base.png", 0, true));
        jdbcTemplate.update("DELETE FROM historial_edicion_comercio WHERE comercio_id = ?", dueno.comercioId());
        return id;
    }

    private List<Map<String, Object>> filas() {
        return jdbcTemplate.queryForList("SELECT usuario_id, actor_rol, entidad_tipo, entidad_id, entidad_nombre, accion, detalle, fecha_hora "
                + "FROM historial_edicion_comercio WHERE comercio_id = ? ORDER BY id", dueno.comercioId());
    }

    private Map<String, Object> ultima() {
        List<Map<String, Object>> todas = filas();
        return todas.get(todas.size() - 1);
    }

    private int cantidadDeProductos() {
        return jdbcTemplate.queryForObject("SELECT COUNT(*) FROM producto WHERE comercio_id = ?", Integer.class, dueno.comercioId());
    }

    @Test
    void crearUnProductoDejaUnaFilaDeAltaConElActorYElNombreDelMomento() {
        var creado = productoService.crearProducto(actor, producto("empanadas de carne", "docena", "9000", null));

        assertEquals(1, filas().size());
        Map<String, Object> fila = ultima();
        assertEquals(dueno.id(), fila.get("usuario_id"));
        assertEquals("DUENO", fila.get("actor_rol"));
        assertEquals("PRODUCTO", fila.get("entidad_tipo"));
        assertEquals(creado.getId(), fila.get("entidad_id"));
        assertEquals("Empanadas De Carne", fila.get("entidad_nombre"));
        assertEquals("CREAR", fila.get("accion"));
        assertNull(fila.get("detalle"));
        assertTrue(fila.get("fecha_hora") != null);
    }

    @Test
    void editarUnProductoRegistraSoloLosCamposQueCambiaronSinGuardarValores() {
        int tagA = tagNuevo();
        int tagB = tagNuevo();
        int id = productoService.crearProducto(actor, producto("pizza", "muzzarella", "8000", List.of(tagA))).getId();
        productoService.agregarImagen(actor, id, new ImagenProductoRequestDTO(prefijoProducto(id) + "p.png", 0, true));
        jdbcTemplate.update("DELETE FROM historial_edicion_comercio WHERE comercio_id = ?", dueno.comercioId());

        productoService.editarProducto(actor, id, producto("pizza", "muzzarella", "8000", List.of(tagA)));
        assertEquals(0, filas().size(), "Sin ningún cambio no se registra nada");

        productoService.editarProducto(actor, id, producto("pizza especial", "muzzarella", "9500.00", List.of(tagA)));
        assertEquals("Editó: nombre, precio", ultima().get("detalle"));
        assertEquals("EDITAR", ultima().get("accion"));
        assertEquals("Pizza Especial", ultima().get("entidad_nombre"));

        productoService.editarProducto(actor, id, producto("pizza especial", "con aceitunas", "9500", List.of(tagB, tagA)));
        assertEquals("Editó: descripción, etiquetas", ultima().get("detalle"));

        productoService.editarProducto(actor, id, producto("pizza especial", "con aceitunas", "9500", List.of(tagB, tagA)));
        assertEquals(2, filas().size(), "El orden de las etiquetas no cuenta como cambio");
        String detalles = filas().stream().map(fila -> String.valueOf(fila.get("detalle"))).toList().toString();
        assertTrue(!detalles.contains("9500") && !detalles.contains("aceitunas"), "El detalle nunca guarda valores");
    }

    @Test
    void cambiarElEstadoDeUnProductoRegistraLaTransicion() {
        int id = productoConImagen();

        productoService.cambiarEstado(actor, id, EstadoProducto.AGOTADO);
        assertEquals("CAMBIAR_ESTADO", ultima().get("accion"));
        assertEquals("Pasó a agotado", ultima().get("detalle"));

        productoService.cambiarEstado(actor, id, EstadoProducto.DISPONIBLE);
        assertEquals("Pasó a disponible", ultima().get("detalle"));

        productoService.cambiarEstado(actor, id, EstadoProducto.DESCONTINUADO);
        assertEquals("Pasó a descontinuado", ultima().get("detalle"));
        assertEquals(3, filas().size());
    }

    @Test
    void unaEscrituraRechazadaPorSuReglaDeNegocioNoDejaNingunaFila() {
        int id = productoConImagen();
        productoService.cambiarEstado(actor, id, EstadoProducto.DESCONTINUADO);
        int antes = filas().size();

        assertThrows(RuntimeException.class, () -> productoService.cambiarEstado(actor, id, EstadoProducto.DISPONIBLE));
        assertThrows(RuntimeException.class, () -> productoService.editarProducto(actor, id, producto("otro", "otro", "100", null)));

        assertEquals(antes, filas().size());
    }

    @Test
    void lasImagenesRegistranAltaOrdenReemplazoYBaja() {
        int id = productoService.crearProducto(actor, producto("hamburguesa", "doble", "7000", null)).getId();
        jdbcTemplate.update("DELETE FROM historial_edicion_comercio WHERE comercio_id = ?", dueno.comercioId());
        String carpeta = prefijoProducto(id);

        var imagen = productoService.agregarImagen(actor, id, new ImagenProductoRequestDTO(carpeta + "a.png", 0, true));
        assertEquals("IMAGEN_PRODUCTO", ultima().get("entidad_tipo"));
        assertEquals("CREAR", ultima().get("accion"));
        assertEquals(imagen.getId(), ultima().get("entidad_id"));
        assertEquals("Hamburguesa", ultima().get("entidad_nombre"));

        productoService.reordenarImagen(actor, id, imagen.getId(), 0);
        assertEquals(1, filas().size(), "Reordenar al mismo orden no es un cambio");
        productoService.reordenarImagen(actor, id, imagen.getId(), 3);
        assertEquals("Editó: orden", ultima().get("detalle"));

        productoService.actualizarUrlImagen(actor, id, imagen.getId(), carpeta + "a.png");
        assertEquals(2, filas().size(), "La misma url no es un cambio");
        productoService.actualizarUrlImagen(actor, id, imagen.getId(), carpeta + "a-recortada.png");
        assertEquals("Editó: imagen", ultima().get("detalle"));

        productoService.eliminarImagen(actor, id, imagen.getId());
        assertEquals("ELIMINAR", ultima().get("accion"));
        assertEquals(imagen.getId(), ultima().get("entidad_id"));
        assertEquals(4, filas().size());
    }

    @Test
    void editarElPerfilRegistraLosCamposQueCambiaronYSoloEsos() {
        ComercioPerfilRequestDTO igual = perfil("Comercio Igual", "descripcion", "+5492964111111", "contacto@bajonea.test", false, true);
        comercioService.editarPerfil(actor, igual);
        assertEquals(1, filas().size());
        assertEquals("Editó: nombre, descripción, teléfono, email de contacto, modalidades de entrega", ultima().get("detalle"));
        assertEquals("COMERCIO", ultima().get("entidad_tipo"));
        assertEquals(dueno.comercioId(), ultima().get("entidad_id"));
        assertEquals("Comercio Igual", ultima().get("entidad_nombre"));

        comercioService.editarPerfil(actor, igual);
        assertEquals(1, filas().size(), "Guardar lo mismo no registra nada");

        comercioService.editarPerfil(actor, perfil("comercio igual", "descripcion", "+5492964222222", "contacto@bajonea.test", false, true));
        assertEquals("Editó: teléfono", ultima().get("detalle"));
        assertEquals(2, filas().size());
        assertTrue(!filas().stream().map(fila -> String.valueOf(fila.get("detalle"))).toList().toString().contains("2964222222"),
                "El detalle nunca guarda valores");
    }

    @Test
    void cambiarLaFotoDelComercioRegistraSoloSiLaUrlEsOtra() {
        String url = "https://res.cloudinary.com/" + cloudName + "/image/upload/v1/comercios/" + dueno.comercioId() + "/perfil/nueva.png";

        comercioService.actualizarFotoPerfil(actor, new FotoPerfilComercioRequestDTO(url));
        assertEquals("Editó: foto de perfil", ultima().get("detalle"));
        assertEquals(1, filas().size());

        comercioService.actualizarFotoPerfil(actor, new FotoPerfilComercioRequestDTO(url));
        assertEquals(1, filas().size());
    }

    @Test
    void lasRedesSocialesRegistranAltaEdicionYBaja() {
        var tiktok = redSocialService.agregar(actor, new RedSocialRequestDTO(TipoRedSocial.TIKTOK, "tiktok.com/uno"));
        assertEquals("RED_SOCIAL", ultima().get("entidad_tipo"));
        assertEquals("CREAR", ultima().get("accion"));
        assertEquals("TikTok", ultima().get("entidad_nombre"));
        assertEquals(tiktok.getId(), ultima().get("entidad_id"));

        redSocialService.editar(actor, tiktok.getId(), new RedSocialRequestDTO(TipoRedSocial.TIKTOK, "tiktok.com/uno"));
        assertEquals(1, filas().size());
        redSocialService.editar(actor, tiktok.getId(), new RedSocialRequestDTO(TipoRedSocial.TIKTOK, "tiktok.com/dos"));
        assertEquals("Editó: enlace", ultima().get("detalle"));

        redSocialService.darDeBaja(actor, tiktok.getId());
        assertEquals("ELIMINAR", ultima().get("accion"));
        assertEquals(3, filas().size());
    }

    @Test
    void elRolDelActorQueSePasaEsElQueSeGuarda() {
        int clienteId = datos.registrarCliente();
        ComercioActivo empleado = new ComercioActivo(dueno.comercioId(), dueno.id(), clienteId, RolActorComercio.EMPLEADO,
                EstadoComercio.APROBADO);

        new TransactionTemplate(transactionManager).executeWithoutResult(status -> {
            historialService.iniciarEscritura(empleado);
            historialService.registrar(empleado, TipoEntidadEdicion.PRODUCTO, 77, "Producto de prueba", AccionEdicion.EDITAR, "Editó: precio");
        });

        assertEquals("EMPLEADO", ultima().get("actor_rol"));
        assertEquals(clienteId, ultima().get("usuario_id"));
    }

    @Test
    void siLaTransaccionSeRevierteDespuesDeEscribirNoQuedaNiLaEscrituraNiElRegistro() {
        int productosAntes = cantidadDeProductos();

        assertThrows(IllegalStateException.class, () -> new TransactionTemplate(transactionManager).executeWithoutResult(status -> {
            productoService.crearProducto(actor, producto("producto revertido", "x", "100", null));
            throw new IllegalStateException("falla posterior");
        }));

        assertEquals(productosAntes, cantidadDeProductos());
        assertEquals(0, filas().size());
    }

    @Test
    void siElRegistroNoSePuedeEscribirLaEscrituraTampocoSeConfirma() {
        int productosAntes = cantidadDeProductos();

        assertThrows(RuntimeException.class, () -> new TransactionTemplate(transactionManager).executeWithoutResult(status -> {
            productoService.crearProducto(actor, producto("producto sin registro", "x", "100", null));
            historialService.registrar(999_999_999, dueno.id(), RolActorComercio.DUENO, TipoEntidadEdicion.PRODUCTO, 1, "X",
                    AccionEdicion.CREAR, null);
        }));

        assertEquals(productosAntes, cantidadDeProductos());
        assertEquals(0, filas().size());
    }

    @Test
    void registrarSinTransaccionEnCursoEsUnError() {
        assertThrows(IllegalTransactionStateException.class,
                () -> historialService.registrar(actor, TipoEntidadEdicion.PRODUCTO, 1, "X", AccionEdicion.CREAR, null));
        assertThrows(IllegalTransactionStateException.class, () -> historialService.iniciarEscritura(actor));
        assertEquals(0, filas().size());
    }

    @Test
    void elNombreYElDetalleSeRecortanAlLargoDeLaColumna() {
        String largo = "n".repeat(300);

        new TransactionTemplate(transactionManager).executeWithoutResult(status -> historialService.registrar(actor,
                TipoEntidadEdicion.PRODUCTO, 1, largo, AccionEdicion.EDITAR, "d".repeat(400)));

        assertEquals(150, ultima().get("entidad_nombre").toString().length());
        assertEquals(255, ultima().get("detalle").toString().length());
        assertTrue(ultima().get("detalle").toString().endsWith("…"));
    }

    private static ComercioPerfilRequestDTO perfil(String nombre, String descripcion, String telefono, String email, boolean delivery,
            boolean retiro) {
        return new ComercioPerfilRequestDTO(nombre, descripcion, telefono, email, delivery, retiro);
    }
}
