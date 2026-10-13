package com.bajonea.backend.services;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.bajonea.backend.config.security.ComercioActivo;
import com.bajonea.backend.dto.response.ActividadComercioItemResponseDTO;
import com.bajonea.backend.dto.response.ActividadComercioResponseDTO;
import com.bajonea.backend.enums.EstadoComercio;
import com.bajonea.backend.enums.RolActorComercio;
import com.bajonea.backend.exceptions.ComercioNoDisponibleException;
import com.bajonea.backend.exceptions.ValidacionException;
import com.bajonea.backend.services.DatosPruebaEmpleado.Cuenta;
import com.bajonea.backend.services.DatosPruebaEmpleado.Dueno;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.persistence.EntityManagerFactory;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.hibernate.SessionFactory;
import org.hibernate.stat.Statistics;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

/**
 * Actividad del comercio (bloque A1 de E3) contra {@code bajonea_test}: la mezcla de las tres fuentes en un solo
 * orden total (fecha descendente, y en un empate pedidos, ediciones y cierres, cada uno por id descendente), la
 * paginación por cursor sin repetir ni saltear filas aun con filas de la misma fecha en el límite de una página, el
 * nombre del actor resuelto en las mismas consultas (tres por página, sin consultas por fila), lo que no
 * aparece (otro comercio, el nacimiento del pedido y su vencimiento por falta de pago) y la autorización del
 * endpoint. Las acciones del Cliente y del sistema sobre los pedidos sí aparecen (bloque A2b).
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class ActividadComercioIntegrationTest {

    private static final String ACTIVIDAD = "/api/v1/comercios/equipo/actividad";
    private static final String HEADER = "X-Comercio-Id";
    private static final LocalDateTime T0 = LocalDateTime.of(2026, 9, 1, 12, 0, 0);

    @Autowired
    private ActividadComercioService actividadService;

    @Autowired
    private RegistroService registroService;

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private EntityManagerFactory entityManagerFactory;

    @MockitoBean
    private EmailService emailService;

    private DatosPruebaEmpleado datos;
    private Dueno dueno;
    private Dueno duenoAjeno;
    private Cuenta empleado;
    private int comprador;
    private final List<String> esperados = new ArrayList<>();

    @BeforeEach
    void preparar() {
        datos = new DatosPruebaEmpleado(registroService, objectMapper, jdbcTemplate);
        dueno = datos.registrarDuenoAprobado();
        duenoAjeno = datos.registrarDuenoAprobado();
        datos.cambiarEstadoUsuario(dueno.id(), "ACTIVO");
        datos.cambiarEstadoUsuario(duenoAjeno.id(), "ACTIVO");
        empleado = datos.registrarClienteConCredenciales();
        comprador = datos.registrarCliente();
        sembrar();
    }

    private void sembrar() {
        long e1 = edicion(dueno, dueno.id(), "DUENO", T0, "CREAR", "Producto uno", null);
        long e2 = edicion(dueno, empleado.id(), "EMPLEADO", T0.plusMinutes(1), "EDITAR", "Producto uno", "Editó: precio");
        long e3 = edicion(dueno, dueno.id(), "DUENO", T0.plusMinutes(2), "CAMBIAR_ESTADO", "Producto dos", "Pasó a agotado");
        long e4 = edicion(dueno, empleado.id(), "EMPLEADO", T0.plusMinutes(2), "ELIMINAR", "Producto tres", null);
        int pedido1 = pedido(dueno, "EN_PREPARACION");
        int pedido2 = pedido(dueno, "ENTREGADO");
        long p1 = pedidoHistorial(pedido1, "EN_PREPARACION", "DUENO", dueno.id(), T0.plusMinutes(2));
        long p5 = pedidoHistorial(pedido2, "EN_CAMINO", "DUENO", dueno.id(), T0.plusMinutes(2));
        long p2 = pedidoHistorial(pedido2, "ENTREGADO", "EMPLEADO", empleado.id(), T0.plusMinutes(3));
        long recibido = pedidoHistorial(pedido1, "PENDIENTE_CONFIRMACION_COMERCIO", "SISTEMA", null, T0.plusMinutes(4));
        long expirado = pedidoHistorial(pedido1, "EXPIRADO", "SISTEMA", null, T0.plusMinutes(5), "TIMEOUT_RESPUESTA_COMERCIO");
        long c1 = cierre(dueno, "CERRADO", "DUENO", dueno.id(), T0.plusMinutes(2));
        long c2 = cierre(dueno, "REABIERTO", "SISTEMA", null, T0.plusMinutes(6));

        int pedido3 = pedido(dueno, "CANCELADO");
        long cancelo = pedidoHistorial(pedido3, "CANCELADO", "CLIENTE", comprador, T0.minusMinutes(1));
        long recepcion = pedidoHistorial(pedido2, "ENTREGADO", "CLIENTE", comprador, T0.minusMinutes(2));
        long autoconfirmada = pedidoHistorial(pedido2, "ENTREGADO", "SISTEMA", null, T0.minusMinutes(3), "TIMEOUT_ENTREGA");
        long retiroCerrado = pedidoHistorial(pedido2, "ENTREGADO", "SISTEMA", null, T0.minusMinutes(4), "TIMEOUT_RETIRO_SUSPENSION");
        long suspendido = pedidoHistorial(pedido3, "CANCELADO_POR_SISTEMA", "SISTEMA", null, T0.minusMinutes(5));
        int sinPagar = pedido(dueno, "CANCELADO_POR_SISTEMA");
        pedidoHistorial(sinPagar, "PENDIENTE_PAGO", "CLIENTE", comprador, T0.minusMinutes(6));
        pedidoHistorial(sinPagar, "CANCELADO_POR_SISTEMA", "SISTEMA", null, T0.minusMinutes(7), "TIMEOUT_PAGO");
        pedidoHistorial(sinPagar, "PENDIENTE", "CLIENTE", comprador, T0.minusMinutes(8));

        edicion(duenoAjeno, duenoAjeno.id(), "DUENO", T0.plusMinutes(2), "CREAR", "Producto ajeno", null);
        pedidoHistorial(pedido(duenoAjeno, "PENDIENTE_CONFIRMACION_COMERCIO"), "PENDIENTE_CONFIRMACION_COMERCIO", "SISTEMA", null,
                T0.plusMinutes(3));
        cierre(duenoAjeno, "CERRADO", "DUENO", duenoAjeno.id(), T0.plusMinutes(3));

        esperados.addAll(List.of("CIERRE-" + c2, "PEDIDO-" + expirado, "PEDIDO-" + recibido, "PEDIDO-" + p2, "PEDIDO-" + p5,
                "PEDIDO-" + p1, "EDICION-" + e4, "EDICION-" + e3, "CIERRE-" + c1, "EDICION-" + e2, "EDICION-" + e1,
                "PEDIDO-" + cancelo, "PEDIDO-" + recepcion, "PEDIDO-" + autoconfirmada, "PEDIDO-" + retiroCerrado,
                "PEDIDO-" + suspendido));
    }

    private long edicion(Dueno comercio, int usuarioId, String rol, LocalDateTime fecha, String accion, String nombre, String detalle) {
        jdbcTemplate.update("INSERT INTO historial_edicion_comercio (comercio_id, usuario_id, actor_rol, entidad_tipo, entidad_id, "
                + "entidad_nombre, accion, detalle, fecha_hora) VALUES (?, ?, ?, 'PRODUCTO', 1, ?, ?, ?, ?)",
                comercio.comercioId(), usuarioId, rol, nombre, accion, detalle, fecha);
        return jdbcTemplate.queryForObject("SELECT LAST_INSERT_ID()", Long.class);
    }

    private int pedido(Dueno comercio, String estado) {
        jdbcTemplate.update("INSERT INTO pedido (cliente_id, comercio_id, modalidad_entrega, estado, pago_estado, subtotal, "
                + "cargo_servicio_cliente, cargo_servicio_comercio, total, fecha_creacion) "
                + "VALUES (?, ?, 'RETIRO', ?, 'PAGADO', 10000, 200, 100, 10200, ?)", comprador, comercio.comercioId(), estado, T0);
        return jdbcTemplate.queryForObject("SELECT LAST_INSERT_ID()", Integer.class);
    }

    private long pedidoHistorial(int pedidoId, String estado, String rol, Integer usuarioId, LocalDateTime fecha) {
        return pedidoHistorial(pedidoId, estado, rol, usuarioId, fecha, null);
    }

    private long pedidoHistorial(int pedidoId, String estado, String rol, Integer usuarioId, LocalDateTime fecha, String motivoTimeout) {
        jdbcTemplate.update("INSERT INTO historial_estado_pedido (pedido_id, estado, actor_rol, actor_usuario_id, motivo_timeout, "
                + "fecha_hora) VALUES (?, ?, ?, ?, ?, ?)", pedidoId, estado, rol, usuarioId, motivoTimeout, fecha);
        return jdbcTemplate.queryForObject("SELECT LAST_INSERT_ID()", Long.class);
    }

    private long cierre(Dueno comercio, String accion, String rol, Integer usuarioId, LocalDateTime fecha) {
        jdbcTemplate.update("INSERT INTO historial_cierre_comercio (comercio_id, accion, actor_usuario_id, actor_rol, fecha_hora) "
                + "VALUES (?, ?, ?, ?, ?)", comercio.comercioId(), accion, usuarioId, rol, fecha);
        return jdbcTemplate.queryForObject("SELECT LAST_INSERT_ID()", Long.class);
    }

    private static List<String> ids(ActividadComercioResponseDTO pagina) {
        return pagina.getItems().stream().map(ActividadComercioItemResponseDTO::getId).toList();
    }

    private String nombreDe(int usuarioId) {
        Map<String, Object> fila = jdbcTemplate.queryForMap("SELECT nombre, apellido FROM persona_fisica WHERE id = ?", usuarioId);
        return fila.get("nombre") + " " + fila.get("apellido");
    }

    private String tokenDe(String nombreUsuario, String clave) throws Exception {
        String cuerpo = mockMvc.perform(post("/api/v1/auth/login").contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("nombreUsuario", nombreUsuario, "password", clave))))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return objectMapper.readTree(cuerpo).path("data").path("token").asText();
    }

    private ResultActions actividad(String token, Integer comercioId, String consulta) throws Exception {
        var request = get(ACTIVIDAD + (consulta == null ? "" : "?" + consulta));
        if (token != null) {
            request = request.header("Authorization", "Bearer " + token);
        }
        if (comercioId != null) {
            request = request.header(HEADER, comercioId);
        }
        return mockMvc.perform(request);
    }

    @Test
    void mezclaLasTresFuentesEnUnSoloOrdenConElDesempateDeterministaYSinLoAjenoNiLoQueNoEsDelComercio() {
        ActividadComercioResponseDTO pagina = actividadService.listar(dueno.comercioId(), 100, null);

        assertEquals(esperados, ids(pagina));
        assertFalse(pagina.isHayMas());
        assertNull(pagina.getSiguienteCursor());
    }

    @Test
    void cadaLineaTraeElNombreYElRolDeQuienActuoYUnTextoLegible() {
        List<ActividadComercioItemResponseDTO> items = actividadService.listar(dueno.comercioId(), 100, null).getItems();

        ActividadComercioItemResponseDTO reapertura = items.get(0);
        assertNull(reapertura.getActorNombre());
        assertEquals("SISTEMA", reapertura.getActorRol());
        assertEquals("Sistema", reapertura.getActorRolTexto());
        assertNull(reapertura.getActorUsuarioId());
        assertEquals("Reabrió el comercio", reapertura.getAccionTexto());

        ActividadComercioItemResponseDTO entrega = items.get(3);
        assertEquals(nombreDe(empleado.id()), entrega.getActorNombre());
        assertEquals("EMPLEADO", entrega.getActorRol());
        assertEquals("Empleado", entrega.getActorRolTexto());
        assertEquals("Marcó un pedido como entregado", entrega.getAccionTexto());
        assertEquals("PEDIDO", entrega.getEntidadTipo());
        assertTrue(entrega.getEntidadNombre().startsWith("Pedido #"));

        ActividadComercioItemResponseDTO cierreDelDueno = items.get(8);
        assertEquals(nombreDe(dueno.id()), cierreDelDueno.getActorNombre());
        assertEquals("Dueño", cierreDelDueno.getActorRolTexto());
        assertEquals("Cerró el comercio", cierreDelDueno.getAccionTexto());

        ActividadComercioItemResponseDTO edicion = items.get(7);
        assertEquals("Cambió la disponibilidad de un producto", edicion.getAccionTexto());
        assertEquals("Producto dos", edicion.getEntidadNombre());
        assertEquals("Pasó a agotado", edicion.getDetalle());
    }

    @Test
    void paginarPorCursorEntregaCadaFilaUnaSolaVezAunConEmpatesEnElLimiteDeLaPagina() {
        for (int limite = 1; limite <= 4; limite++) {
            List<String> recorridas = new ArrayList<>();
            String cursor = null;
            int paginas = 0;
            do {
                ActividadComercioResponseDTO pagina = actividadService.listar(dueno.comercioId(), limite, cursor);
                assertTrue(pagina.getItems().size() <= limite);
                recorridas.addAll(ids(pagina));
                assertEquals(pagina.isHayMas(), pagina.getSiguienteCursor() != null);
                cursor = pagina.getSiguienteCursor();
                paginas++;
                assertTrue(paginas <= esperados.size() + 1, "El recorrido no termina");
            } while (cursor != null);

            assertEquals(esperados, recorridas, "Recorrido con límite " + limite);
        }
    }

    @Test
    void elClienteYElSistemaApareceEnLosPedidosConSuTextoYSinNombreElSistema() {
        List<ActividadComercioItemResponseDTO> items = actividadService.listar(dueno.comercioId(), 100, null).getItems();

        ActividadComercioItemResponseDTO recibido = items.get(2);
        assertEquals("PENDIENTE_CONFIRMACION_COMERCIO", recibido.getAccion());
        assertEquals("Pedido recibido", recibido.getAccionTexto());
        assertEquals("SISTEMA", recibido.getActorRol());
        assertNull(recibido.getActorNombre());
        assertNull(recibido.getActorUsuarioId());

        ActividadComercioItemResponseDTO cancelo = items.get(11);
        assertEquals("Canceló un pedido", cancelo.getAccionTexto());
        assertEquals("CLIENTE", cancelo.getActorRol());
        assertEquals("Cliente", cancelo.getActorRolTexto());
        assertEquals(nombreDe(comprador), cancelo.getActorNombre());
        assertEquals(comprador, cancelo.getActorUsuarioId());

        assertEquals("Confirmó la recepción de un pedido", items.get(12).getAccionTexto());
        assertEquals("Confirmó automáticamente la entrega de un pedido", items.get(13).getAccionTexto());
        assertEquals("Cerró automáticamente un pedido listo para retirar (comercio suspendido)", items.get(14).getAccionTexto());
        assertEquals("Canceló un pedido por la suspensión del comercio", items.get(15).getAccionTexto());
        assertEquals("Venció un pedido sin respuesta del comercio", items.get(1).getAccionTexto());
        for (int sistema : new int[] {1, 2, 13, 14, 15}) {
            assertNull(items.get(sistema).getActorNombre(), "Fila " + sistema);
            assertNull(items.get(sistema).getActorUsuarioId(), "Fila " + sistema);
        }
    }

    @Test
    void cadaPaginaEsTresConsultasSinConsultasPorFila() {
        Statistics estadisticas = entityManagerFactory.unwrap(SessionFactory.class).getStatistics();
        estadisticas.setStatisticsEnabled(true);
        estadisticas.clear();

        ActividadComercioResponseDTO pagina = actividadService.listar(dueno.comercioId(), 100, null);

        assertEquals(esperados.size(), pagina.getItems().size());
        assertEquals(3, estadisticas.getPrepareStatementCount());
    }

    @Test
    void elLimiteTieneUnDefectoUnTopeYNoAceptaMenosDeUno() {
        Dueno grande = datos.registrarDuenoAprobado();
        List<Object[]> filas = new ArrayList<>();
        for (int i = 0; i < 120; i++) {
            filas.add(new Object[] {grande.comercioId(), grande.id(), "Producto " + i, T0.plusSeconds(i)});
        }
        jdbcTemplate.batchUpdate("INSERT INTO historial_edicion_comercio (comercio_id, usuario_id, actor_rol, entidad_tipo, entidad_id, "
                + "entidad_nombre, accion, fecha_hora) VALUES (?, ?, 'DUENO', 'PRODUCTO', 1, ?, 'CREAR', ?)", filas);

        assertEquals(30, actividadService.listar(grande.comercioId(), null, null).getItems().size());
        ActividadComercioResponseDTO conTope = actividadService.listar(grande.comercioId(), 1000, null);
        assertEquals(100, conTope.getItems().size());
        assertTrue(conTope.isHayMas());
        assertThrows(ValidacionException.class, () -> actividadService.listar(grande.comercioId(), 0, null));
        assertThrows(ValidacionException.class, () -> actividadService.listar(grande.comercioId(), -5, null));
    }

    @Test
    void unCursorQueNoSeEntiendeEsUnErrorDeValidacion() {
        for (String cursor : new String[] {"basura", "x_1_2", "2026-09-01T12:00:00_1", "2026-09-01T12:00:00_9_1", "2026-09-01T12:00:00_1_x",
            "no-es-fecha_1_1"}) {
            assertThrows(ValidacionException.class, () -> actividadService.listar(dueno.comercioId(), 10, cursor), cursor);
        }
        assertEquals(esperados.size(), actividadService.listar(dueno.comercioId(), 100, "  ").getItems().size());
    }

    @Test
    void unEmpleadoNoVeLaActividadAunqueLlegueAlServicio() {
        ComercioActivo comoEmpleado = new ComercioActivo(dueno.comercioId(), dueno.id(), empleado.id(), RolActorComercio.EMPLEADO,
                EstadoComercio.APROBADO);

        assertThrows(ComercioNoDisponibleException.class, () -> actividadService.listar(comoEmpleado, 10, null));
    }

    @Test
    void elDuenoLaVePorHttpConSusPropiosDatosYElSiguienteCursorPaginaDeVerdad() throws Exception {
        String token = tokenDe(dueno.nombreUsuario(), dueno.clave());

        actividad(token, dueno.comercioId(), null)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.items.length()").value(esperados.size()))
                .andExpect(jsonPath("$.data.items[0].id").value(esperados.get(0)))
                .andExpect(jsonPath("$.data.hayMas").value(false));

        JsonNode primera = objectMapper.readTree(actividad(token, dueno.comercioId(), "limite=4")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.items.length()").value(4))
                .andExpect(jsonPath("$.data.hayMas").value(true))
                .andReturn().getResponse().getContentAsString());
        String cursor = primera.path("data").path("siguienteCursor").asText();
        assertNotNull(cursor);

        JsonNode segunda = objectMapper.readTree(actividad(token, dueno.comercioId(), "limite=100&cursor=" + cursor)
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString());
        List<String> recorridas = new ArrayList<>();
        primera.path("data").path("items").forEach(item -> recorridas.add(item.path("id").asText()));
        segunda.path("data").path("items").forEach(item -> recorridas.add(item.path("id").asText()));
        assertEquals(esperados, recorridas);
    }

    @Test
    void sinTokenEs401SinHeaderEs400YUnDuenoAjenoVeElMismo404DeSiempre() throws Exception {
        String tokenAjeno = tokenDe(duenoAjeno.nombreUsuario(), duenoAjeno.clave());
        String tokenPropio = tokenDe(dueno.nombreUsuario(), dueno.clave());

        actividad(null, dueno.comercioId(), null).andExpect(status().isUnauthorized());
        actividad(tokenPropio, null, null).andExpect(status().isBadRequest());
        actividad(tokenAjeno, dueno.comercioId(), null)
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.mensaje").value("Comercio no encontrado"))
                .andExpect(jsonPath("$.data.codigo").value("COMERCIO_NO_DISPONIBLE"));
        actividad(tokenPropio, 999_999_999, null)
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.data.codigo").value("COMERCIO_NO_DISPONIBLE"));
    }

    @Test
    void unClienteNoLaVeNiSiEsEmpleadoDelComercio() throws Exception {
        datos.vincularEmpleado(empleado.id(), dueno.comercioId(), "ACTIVO", T0);
        String tokenCliente = tokenDe(empleado.nombreUsuario(), empleado.clave());

        actividad(tokenCliente, dueno.comercioId(), null).andExpect(status().isForbidden());
        actividad(tokenCliente, null, null).andExpect(status().isForbidden());
    }

    @Test
    void unLimiteOUnCursorInvalidosSon400() throws Exception {
        String token = tokenDe(dueno.nombreUsuario(), dueno.clave());

        actividad(token, dueno.comercioId(), "limite=0").andExpect(status().isBadRequest());
        actividad(token, dueno.comercioId(), "limite=abc").andExpect(status().isBadRequest());
        actividad(token, dueno.comercioId(), "cursor=basura").andExpect(status().isBadRequest());
    }
}
