package com.bajonea.backend.services;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import com.bajonea.backend.config.security.ComercioActivo;
import com.bajonea.backend.dto.request.FotoPerfilComercioRequestDTO;
import com.bajonea.backend.dto.request.ImagenProductoRequestDTO;
import com.bajonea.backend.enums.EstadoComercio;
import com.bajonea.backend.exceptions.ValidacionException;
import com.bajonea.backend.services.DatosPruebaEmpleado.Dueno;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

/**
 * Bloque A0.3 de E3 con los servicios reales contra {@code bajonea_test}: la foto del comercio y las imágenes de
 * producto (alta y reemplazo/recorte) solo se aceptan si están en la carpeta que firma el servidor para ese comercio
 * y ese producto; una URL de otro comercio, de otro producto o de otra carpeta se rechaza sin escribir nada.
 */
@SpringBootTest
@ActiveProfiles("test")
class ImagenesPorCarpetaIntegrationTest {

    @Autowired
    private ProductoService productoService;

    @Autowired
    private ComercioService comercioService;

    @Autowired
    private RegistroService registroService;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private ObjectMapper objectMapper;

    @Value("${cloudinary.cloud-name:}")
    private String cloudName;

    @MockitoBean
    private EmailService emailService;

    private String prefijo() {
        return "https://res.cloudinary.com/" + cloudName + "/image/upload/";
    }

    private record Producto(Dueno dueno, int productoId) {
    }

    private static ComercioActivo actor(Dueno dueno) {
        return ComercioActivo.delDueno(dueno.comercioId(), dueno.id(), EstadoComercio.APROBADO);
    }

    private Producto productoNuevo() {
        DatosPruebaEmpleado datos = new DatosPruebaEmpleado(registroService, objectMapper, jdbcTemplate);
        Dueno dueno = datos.registrarDuenoAprobado();
        jdbcTemplate.update("INSERT IGNORE INTO categoria (nombre) VALUES ('Categoria carpetas IT')");
        int categoriaId = jdbcTemplate.queryForObject("SELECT id FROM categoria WHERE nombre = 'Categoria carpetas IT'", Integer.class);
        jdbcTemplate.update("INSERT INTO producto (comercio_id, categoria_id, nombre, precio) VALUES (?, ?, 'Producto carpetas', 1500)",
                dueno.comercioId(), categoriaId);
        int productoId = jdbcTemplate.queryForObject("SELECT LAST_INSERT_ID()", Integer.class);
        return new Producto(dueno, productoId);
    }

    private int imagenes(int productoId) {
        return jdbcTemplate.queryForObject("SELECT COUNT(*) FROM imagen_producto WHERE producto_id = ?", Integer.class, productoId);
    }

    @Test
    void laImagenDeProductoEnSuCarpetaSeAceptaYSePuedeReemplazarPorOtraDeLaMismaCarpeta() {
        Producto p = productoNuevo();
        String carpeta = prefijo() + "v1/productos/" + p.dueno().comercioId() + "/" + p.productoId() + "/";

        var creada = productoService.agregarImagen(actor(p.dueno()), p.productoId(), new ImagenProductoRequestDTO(carpeta + "a.png", 0, true));
        var recortada = productoService.actualizarUrlImagen(actor(p.dueno()), p.productoId(), creada.getId(), carpeta + "a-recortada.png");

        assertEquals(carpeta + "a-recortada.png", recortada.getUrl());
        assertEquals(1, imagenes(p.productoId()));
    }

    @Test
    void laImagenDeOtroComercioOOtroProductoOOtraCarpetaSeRechazaSinEscribirNada() {
        Producto p = productoNuevo();
        Producto ajeno = productoNuevo();
        String propia = prefijo() + "v1/productos/" + p.dueno().comercioId() + "/" + p.productoId() + "/";
        String deOtroComercio = prefijo() + "v1/productos/" + ajeno.dueno().comercioId() + "/" + ajeno.productoId() + "/a.png";
        String deOtroProducto = prefijo() + "v1/productos/" + p.dueno().comercioId() + "/" + ajeno.productoId() + "/a.png";
        String fotoDePerfil = prefijo() + "v1/comercios/" + p.dueno().comercioId() + "/perfil/a.png";

        for (String url : new String[] {deOtroComercio, deOtroProducto, fotoDePerfil}) {
            assertThrows(ValidacionException.class,
                    () -> productoService.agregarImagen(actor(p.dueno()), p.productoId(), new ImagenProductoRequestDTO(url, 0, true)));
        }
        assertEquals(0, imagenes(p.productoId()));

        var creada = productoService.agregarImagen(actor(p.dueno()), p.productoId(), new ImagenProductoRequestDTO(propia + "a.png", 0, true));
        for (String url : new String[] {deOtroComercio, deOtroProducto, fotoDePerfil}) {
            assertThrows(ValidacionException.class,
                    () -> productoService.actualizarUrlImagen(actor(p.dueno()), p.productoId(), creada.getId(), url));
        }
        assertEquals(propia + "a.png", jdbcTemplate.queryForObject("SELECT url FROM imagen_producto WHERE id = ?", String.class, creada.getId()));
    }

    @Test
    void laFotoDelComercioSoloSeAceptaDeSuPropiaCarpetaDePerfil() {
        Producto p = productoNuevo();
        Producto ajeno = productoNuevo();
        int comercioId = p.dueno().comercioId();
        String propia = prefijo() + "v1/comercios/" + comercioId + "/perfil/nueva.png";

        for (String url : new String[] {
            prefijo() + "v1/comercios/" + ajeno.dueno().comercioId() + "/perfil/nueva.png",
            prefijo() + "v1/productos/" + comercioId + "/" + p.productoId() + "/nueva.png",
            prefijo() + "v1/comercios/pre-registro/nueva.png"}) {
            assertThrows(ValidacionException.class, () -> comercioService.actualizarFotoPerfil(actor(p.dueno()), new FotoPerfilComercioRequestDTO(url)));
        }

        comercioService.actualizarFotoPerfil(actor(p.dueno()), new FotoPerfilComercioRequestDTO(propia));
        assertEquals(propia, jdbcTemplate.queryForObject("SELECT foto_perfil_url FROM comercio WHERE id = ?", String.class, comercioId));
    }
}
