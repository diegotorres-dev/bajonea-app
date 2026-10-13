package com.bajonea.backend.services;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.bajonea.backend.services.DatosPruebaEmpleado.Cuenta;
import com.bajonea.backend.services.DatosPruebaEmpleado.Dueno;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
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
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

/**
 * Bloque A3 de E3 por HTTP real (login con JWT, filtros de seguridad, resolución de {@code X-Comercio-Id}) contra
 * {@code bajonea_test}: la regla de pedido propio (un Empleado no gestiona un pedido del que él mismo es el Cliente,
 * {@code 409 PEDIDO_PROPIO}), la marca {@code esPedidoPropio} que solo existe en el DTO del Empleado, y la
 * trazabilidad de un pedido ({@code GET /api/v1/pedidos/comercio/{id}/trazabilidad}).
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class PedidoPropioYTrazabilidadHttpIntegrationTest {

    private static final String HEADER = "X-Comercio-Id";
    private static final String BASE = "/api/v1/pedidos/comercio/";
    private static final String MENSAJE_PROPIO = "No podés gestionar tus propios pedidos";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private RegistroService registroService;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private ObjectMapper objectMapper;

    @MockitoBean
    private EmailService emailService;

    private DatosPruebaEmpleado datos;

    private record Escenario(Dueno dueno, Cuenta empleado, String tokenEmpleado, Cuenta otroEmpleado, String tokenOtroEmpleado,
            String tokenDueno, Cuenta ajeno, String tokenAjeno) {

        int comercioId() {
            return dueno.comercioId();
        }
    }

    @BeforeEach
    void preparar() {
        datos = new DatosPruebaEmpleado(registroService, objectMapper, jdbcTemplate);
    }

    private String login(String nombreUsuario, String clave) throws Exception {
        String cuerpo = mockMvc.perform(post("/api/v1/auth/login").contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("nombreUsuario", nombreUsuario, "password", clave))))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return objectMapper.readTree(cuerpo).path("data").path("token").asText();
    }

    private Escenario escenario() throws Exception {
        Dueno dueno = datos.registrarDuenoAprobado();
        datos.cambiarEstadoUsuario(dueno.id(), "ACTIVO");
        datos.cambiarEstadoComercio(dueno.comercioId(), "APTO_VENTA");
        Cuenta empleado = datos.registrarClienteConCredenciales();
        datos.vincularEmpleado(empleado.id(), dueno.comercioId(), "ACTIVO", LocalDateTime.now().minusDays(1));
        Cuenta otro = datos.registrarClienteConCredenciales();
        datos.vincularEmpleado(otro.id(), dueno.comercioId(), "ACTIVO", LocalDateTime.now().minusDays(1));
        Cuenta ajeno = datos.registrarClienteConCredenciales();
        return new Escenario(dueno, empleado, login(empleado.nombreUsuario(), empleado.clave()), otro,
                login(otro.nombreUsuario(), otro.clave()), login(dueno.nombreUsuario(), dueno.clave()), ajeno,
                login(ajeno.nombreUsuario(), ajeno.clave()));
    }

    private static MockHttpServletRequestBuilder con(MockHttpServletRequestBuilder request, String token, Integer comercioId) {
        MockHttpServletRequestBuilder conAuth = request.header("Authorization", "Bearer " + token);
        return comercioId == null ? conAuth : conAuth.header(HEADER, comercioId);
    }

    private JsonNode cuerpo(ResultActions resultado) throws Exception {
        return objectMapper.readTree(resultado.andReturn().getResponse().getContentAsString());
    }

    private int pedido(int clienteId, int comercioId, String estado, String modalidad) {
        jdbcTemplate.update("INSERT INTO pedido (cliente_id, comercio_id, modalidad_entrega, estado, pago_estado, subtotal, "
                + "cargo_servicio_cliente, cargo_servicio_comercio, total, fecha_creacion) "
                + "VALUES (?, ?, ?, ?, 'PAGADO', 10000, 200, 100, 10200, ?)",
                clienteId, comercioId, modalidad, estado, LocalDateTime.now().minusHours(2));
        int id = jdbcTemplate.queryForObject("SELECT LAST_INSERT_ID()", Integer.class);
        historial(id, "PENDIENTE_CONFIRMACION_COMERCIO", "SISTEMA", null, null, LocalDateTime.now().minusHours(1));
        return id;
    }

    private void historial(int pedidoId, String estado, String rol, Integer usuarioId, String motivoTimeout, LocalDateTime cuando) {
        jdbcTemplate.update("INSERT INTO historial_estado_pedido (pedido_id, estado, actor_rol, actor_usuario_id, motivo_timeout, fecha_hora) "
                + "VALUES (?, ?, ?, ?, ?, ?)", pedidoId, estado, rol, usuarioId, motivoTimeout, cuando);
    }

    private int cantidadHistorial(int pedidoId) {
        return jdbcTemplate.queryForObject("SELECT COUNT(*) FROM historial_estado_pedido WHERE pedido_id = ?", Integer.class, pedidoId);
    }

    private String estadoDe(int pedidoId) {
        return jdbcTemplate.queryForObject("SELECT estado FROM pedido WHERE id = ?", String.class, pedidoId);
    }

    private ResultActions accion(String accion, int pedidoId, String token, int comercioId) throws Exception {
        MockHttpServletRequestBuilder request = con(put(BASE + pedidoId + "/" + accion), token, comercioId);
        if (accion.equals("rechazar") || accion.equals("anular")) {
            request = request.contentType(MediaType.APPLICATION_JSON).content("{\"motivo\":\"SIN_STOCK\"}");
        }
        return mockMvc.perform(request);
    }

    private ResultActions trazabilidad(int pedidoId, String token, Integer comercioId) throws Exception {
        return mockMvc.perform(con(get(BASE + pedidoId + "/trazabilidad"), token, comercioId));
    }

    private static final List<String[]> ACCIONES_Y_ESTADO = List.of(
            new String[] {"aceptar", "PENDIENTE_CONFIRMACION_COMERCIO", "EN_PREPARACION"},
            new String[] {"rechazar", "PENDIENTE_CONFIRMACION_COMERCIO", "RECHAZADO"},
            new String[] {"despachar", "EN_PREPARACION", "LISTO_PARA_RETIRAR"},
            new String[] {"entregar", "LISTO_PARA_RETIRAR", "ENTREGADO"},
            new String[] {"anular", "EN_PREPARACION", "ANULADO"});

    @Test
    void lasCincoAccionesSobreUnPedidoPropioDan409PedidoPropioYNoCambianNada() throws Exception {
        Escenario e = escenario();

        for (String[] caso : ACCIONES_Y_ESTADO) {
            int pedidoId = pedido(e.empleado().id(), e.comercioId(), caso[1], "RETIRO");
            int historialAntes = cantidadHistorial(pedidoId);

            JsonNode conflicto = cuerpo(accion(caso[0], pedidoId, e.tokenEmpleado(), e.comercioId()).andExpect(status().isConflict()));

            assertEquals("PEDIDO_PROPIO", conflicto.path("data").path("codigo").asText(), caso[0]);
            assertEquals(MENSAJE_PROPIO, conflicto.path("mensaje").asText(), caso[0]);
            assertEquals(caso[1], estadoDe(pedidoId), caso[0]);
            assertEquals(historialAntes, cantidadHistorial(pedidoId), caso[0]);
        }
    }

    @Test
    void elPedidoPropioDa409PedidoPropioAunqueElEstadoNoCorrespondaALaAccion() throws Exception {
        Escenario e = escenario();
        int pedidoId = pedido(e.empleado().id(), e.comercioId(), "ENTREGADO", "RETIRO");

        for (String accion : List.of("aceptar", "rechazar", "despachar", "entregar", "anular")) {
            JsonNode conflicto = cuerpo(accion(accion, pedidoId, e.tokenEmpleado(), e.comercioId()).andExpect(status().isConflict()));
            assertEquals("PEDIDO_PROPIO", conflicto.path("data").path("codigo").asText(), accion);
        }
    }

    @Test
    void elMismoEmpleadoPuedeActuarSobreUnPedidoAjenoEnLasCincoAcciones() throws Exception {
        Escenario e = escenario();

        for (String[] caso : ACCIONES_Y_ESTADO) {
            int pedidoId = pedido(e.ajeno().id(), e.comercioId(), caso[1], "RETIRO");

            JsonNode respuesta = cuerpo(accion(caso[0], pedidoId, e.tokenEmpleado(), e.comercioId()).andExpect(status().isOk()));

            assertEquals(caso[2], respuesta.path("data").path("estado").asText(), caso[0]);
            assertFalse(respuesta.path("data").path("esPedidoPropio").asBoolean(true), caso[0]);
            assertEquals(caso[2], estadoDe(pedidoId), caso[0]);
        }
    }

    @Test
    void elDuenoNoTieneLaReglaYGestionaCualquierPedidoSinRecibirLaMarca() throws Exception {
        Escenario e = escenario();
        int pedidoId = pedido(e.ajeno().id(), e.comercioId(), "PENDIENTE_CONFIRMACION_COMERCIO", "RETIRO");

        JsonNode respuesta = cuerpo(accion("aceptar", pedidoId, e.tokenDueno(), e.comercioId()).andExpect(status().isOk()));

        assertEquals("EN_PREPARACION", respuesta.path("data").path("estado").asText());
        assertFalse(respuesta.path("data").has("esPedidoPropio"));
        assertTrue(respuesta.path("data").has("clienteId"));
    }

    @Test
    void cualquierEmpleadoOElDuenoActuaSobreUnPedidoAceptadoPorOtro() throws Exception {
        Escenario e = escenario();
        int pedidoId = pedido(e.ajeno().id(), e.comercioId(), "PENDIENTE_CONFIRMACION_COMERCIO", "RETIRO");

        accion("aceptar", pedidoId, e.tokenEmpleado(), e.comercioId()).andExpect(status().isOk());
        accion("despachar", pedidoId, e.tokenOtroEmpleado(), e.comercioId()).andExpect(status().isOk());
        accion("entregar", pedidoId, e.tokenDueno(), e.comercioId()).andExpect(status().isOk());

        assertEquals("ENTREGADO", estadoDe(pedidoId));
        List<String> actores = jdbcTemplate.queryForList(
                "SELECT CONCAT(actor_rol, ':', actor_usuario_id) FROM historial_estado_pedido WHERE pedido_id = ? "
                        + "AND actor_usuario_id IS NOT NULL ORDER BY id", String.class, pedidoId);
        assertEquals(List.of("EMPLEADO:" + e.empleado().id(), "EMPLEADO:" + e.otroEmpleado().id(), "DUENO:" + e.dueno().id()), actores);
    }

    @Test
    void laListaDelEmpleadoMarcaSoloSuPedidoYNingunaOtraListaLlevaLaMarca() throws Exception {
        Escenario e = escenario();
        int propio = pedido(e.empleado().id(), e.comercioId(), "PENDIENTE_CONFIRMACION_COMERCIO", "RETIRO");
        pedido(e.ajeno().id(), e.comercioId(), "PENDIENTE_CONFIRMACION_COMERCIO", "RETIRO");

        JsonNode lista = cuerpo(mockMvc.perform(con(get("/api/v1/pedidos/comercio"), e.tokenEmpleado(), e.comercioId()))
                .andExpect(status().isOk())).path("data");
        JsonNode otraPersona = cuerpo(mockMvc.perform(con(get("/api/v1/pedidos/comercio"), e.tokenOtroEmpleado(), e.comercioId()))
                .andExpect(status().isOk())).path("data");
        JsonNode delDueno = cuerpo(mockMvc.perform(con(get("/api/v1/pedidos/comercio"), e.tokenDueno(), e.comercioId()))
                .andExpect(status().isOk())).path("data");

        assertEquals(2, lista.size());
        for (JsonNode pedido : lista) {
            assertEquals(pedido.path("id").asInt() == propio, pedido.path("esPedidoPropio").asBoolean(), "pedido " + pedido.path("id"));
            assertFalse(pedido.has("clienteId"));
            assertFalse(pedido.has("cargoServicioCliente"));
            assertFalse(pedido.has("cargoServicioComercio"));
            assertFalse(pedido.has("pagoEstado"));
        }
        for (JsonNode pedido : otraPersona) {
            assertTrue(pedido.has("esPedidoPropio"));
            assertFalse(pedido.path("esPedidoPropio").asBoolean());
        }
        for (JsonNode pedido : delDueno) {
            assertFalse(pedido.has("esPedidoPropio"));
        }
    }

    @Test
    void elClienteNoRecibeLaMarcaEnSusPedidos() throws Exception {
        Escenario e = escenario();
        pedido(e.ajeno().id(), e.comercioId(), "PENDIENTE_CONFIRMACION_COMERCIO", "RETIRO");

        JsonNode lista = cuerpo(mockMvc.perform(con(get("/api/v1/pedidos/cliente"), e.tokenAjeno(), null)).andExpect(status().isOk())).path("data");

        assertEquals(1, lista.size());
        assertFalse(lista.get(0).has("esPedidoPropio"));
    }

    @Test
    void laTrazabilidadMuestraElRecorridoConActoresMotivosYSinDatosDeMas() throws Exception {
        Escenario e = escenario();
        int pedidoId = pedido(e.ajeno().id(), e.comercioId(), "RECHAZADO", "RETIRO");
        jdbcTemplate.update("UPDATE pedido SET motivo_rechazo = 'OTRO', comentario_rechazo = 'No llegamos' WHERE id = ?", pedidoId);
        LocalDateTime t = LocalDateTime.now().minusMinutes(50).withNano(0);
        jdbcTemplate.update("DELETE FROM historial_estado_pedido WHERE pedido_id = ?", pedidoId);
        historial(pedidoId, "PENDIENTE_PAGO", "CLIENTE", e.ajeno().id(), null, t.minusMinutes(10));
        historial(pedidoId, "PENDIENTE_CONFIRMACION_COMERCIO", "SISTEMA", null, null, t);
        historial(pedidoId, "EN_PREPARACION", "EMPLEADO", e.empleado().id(), null, t.plusMinutes(1));
        historial(pedidoId, "CANCELADO_POR_SISTEMA", "SISTEMA", null, "TIMEOUT_PAGO", t.plusMinutes(2));
        historial(pedidoId, "RECHAZADO", "DUENO", e.dueno().id(), null, t.plusMinutes(3));

        JsonNode respuesta = cuerpo(trazabilidad(pedidoId, e.tokenDueno(), e.comercioId()).andExpect(status().isOk()));
        JsonNode pasos = respuesta.path("data").path("pasos");

        assertEquals(pedidoId, respuesta.path("data").path("pedidoId").asInt());
        assertEquals(List.of("PENDIENTE_CONFIRMACION_COMERCIO", "EN_PREPARACION", "RECHAZADO"),
                List.of(pasos.get(0).path("estado").asText(), pasos.get(1).path("estado").asText(), pasos.get(2).path("estado").asText()));
        assertEquals(3, pasos.size());
        assertEquals("Pedido recibido", pasos.get(0).path("accionTexto").asText());
        assertTrue(pasos.get(0).path("actorNombre").isNull());
        assertEquals("Sistema", pasos.get(0).path("actorRolTexto").asText());
        assertEquals("Aceptó el pedido", pasos.get(1).path("accionTexto").asText());
        assertEquals("Equipo Prueba", pasos.get(1).path("actorNombre").asText());
        assertEquals("Empleado", pasos.get(1).path("actorRolTexto").asText());
        assertEquals("Rechazó el pedido", pasos.get(2).path("accionTexto").asText());
        assertEquals("Representante Prueba", pasos.get(2).path("actorNombre").asText());
        assertEquals("Dueño", pasos.get(2).path("actorRolTexto").asText());
        assertEquals("Otro. No llegamos", pasos.get(2).path("motivo").asText());
        assertTrue(pasos.get(1).path("motivo").isNull());
        for (JsonNode paso : pasos) {
            assertEquals(java.util.Set.of("fechaHora", "estado", "accionTexto", "actorRol", "actorRolTexto", "actorNombre", "motivo"),
                    camposDe(paso));
        }
        assertFalse(respuesta.toString().contains("dni"));
    }

    private java.util.Set<String> camposDe(JsonNode nodo) {
        java.util.Set<String> campos = new java.util.TreeSet<>();
        nodo.fieldNames().forEachRemaining(campos::add);
        return campos;
    }

    @Test
    void laTrazabilidadMuestraElNombreDelClienteYElMotivoDeUnaAnulacion() throws Exception {
        Escenario e = escenario();
        int pedidoId = pedido(e.ajeno().id(), e.comercioId(), "ANULADO", "RETIRO");
        jdbcTemplate.update("UPDATE pedido SET motivo = 'Sin stock. Se acabó la masa' WHERE id = ?", pedidoId);
        LocalDateTime t = LocalDateTime.now().minusMinutes(40).withNano(0);
        historial(pedidoId, "EN_PREPARACION", "DUENO", e.dueno().id(), null, t);
        historial(pedidoId, "ANULADO", "EMPLEADO", e.empleado().id(), null, t.plusMinutes(5));
        int otro = pedido(e.ajeno().id(), e.comercioId(), "CANCELADO", "RETIRO");
        historial(otro, "CANCELADO", "CLIENTE", e.ajeno().id(), null, t);

        JsonNode anulado = cuerpo(trazabilidad(pedidoId, e.tokenEmpleado(), e.comercioId()).andExpect(status().isOk())).path("data").path("pasos");
        JsonNode cancelado = cuerpo(trazabilidad(otro, e.tokenEmpleado(), e.comercioId()).andExpect(status().isOk())).path("data").path("pasos");

        assertEquals("Sin stock. Se acabó la masa", anulado.get(anulado.size() - 1).path("motivo").asText());
        assertEquals("Anuló el pedido", anulado.get(anulado.size() - 1).path("accionTexto").asText());
        JsonNode ultimo = cancelado.get(cancelado.size() - 1);
        assertEquals("Canceló el pedido", ultimo.path("accionTexto").asText());
        assertEquals("Equipo Prueba", ultimo.path("actorNombre").asText());
        assertEquals("Cliente", ultimo.path("actorRolTexto").asText());
        assertFalse(ultimo.has("actorUsuarioId"));
    }

    @Test
    void unEmpleadoQueEsElClienteDelPedidoRecibeElMismo409EnLaTrazabilidad() throws Exception {
        Escenario e = escenario();
        int propio = pedido(e.empleado().id(), e.comercioId(), "EN_PREPARACION", "RETIRO");

        JsonNode conflicto = cuerpo(trazabilidad(propio, e.tokenEmpleado(), e.comercioId()).andExpect(status().isConflict()));

        assertEquals("PEDIDO_PROPIO", conflicto.path("data").path("codigo").asText());
        assertEquals(MENSAJE_PROPIO, conflicto.path("mensaje").asText());
        trazabilidad(propio, e.tokenOtroEmpleado(), e.comercioId()).andExpect(status().isOk());
        trazabilidad(propio, e.tokenDueno(), e.comercioId()).andExpect(status().isOk());
    }

    @Test
    void unClienteSinRelacionRecibe400SinHeaderY404ConHeader() throws Exception {
        Escenario e = escenario();
        int pedidoId = pedido(e.ajeno().id(), e.comercioId(), "EN_PREPARACION", "RETIRO");

        trazabilidad(pedidoId, e.tokenAjeno(), null).andExpect(status().isBadRequest());
        JsonNode sinRelacion = cuerpo(trazabilidad(pedidoId, e.tokenAjeno(), e.comercioId()).andExpect(status().isNotFound()));
        assertEquals("COMERCIO_NO_DISPONIBLE", sinRelacion.path("data").path("codigo").asText());
    }

    @Test
    void unEmpleadoDeOtroComercioOConLaRelacionInactivaRecibeCOMERCIO_NO_DISPONIBLE() throws Exception {
        Escenario e = escenario();
        Escenario otro = escenario();
        int pedidoId = pedido(e.ajeno().id(), e.comercioId(), "EN_PREPARACION", "RETIRO");

        JsonNode deOtroComercio = cuerpo(trazabilidad(pedidoId, otro.tokenEmpleado(), e.comercioId()).andExpect(status().isNotFound()));
        assertEquals("COMERCIO_NO_DISPONIBLE", deOtroComercio.path("data").path("codigo").asText());

        jdbcTemplate.update("UPDATE empleado_comercio SET estado = 'INACTIVO', fecha_baja = NOW() WHERE empleado_id = ?", e.empleado().id());
        JsonNode inactivo = cuerpo(trazabilidad(pedidoId, e.tokenEmpleado(), e.comercioId()).andExpect(status().isNotFound()));
        assertEquals("COMERCIO_NO_DISPONIBLE", inactivo.path("data").path("codigo").asText());
    }

    @Test
    void unPedidoDeOtroComercioOQueNuncaSePagoDa404ParaElDuenoYParaElEmpleado() throws Exception {
        Escenario e = escenario();
        Escenario otro = escenario();
        int deOtroComercio = pedido(e.ajeno().id(), otro.comercioId(), "EN_PREPARACION", "RETIRO");
        int sinPagar = pedido(e.ajeno().id(), e.comercioId(), "PENDIENTE_PAGO", "RETIRO");
        jdbcTemplate.update("DELETE FROM historial_estado_pedido WHERE pedido_id = ?", sinPagar);
        historial(sinPagar, "PENDIENTE_PAGO", "CLIENTE", e.ajeno().id(), null, LocalDateTime.now().minusMinutes(5));

        for (String token : List.of(e.tokenDueno(), e.tokenEmpleado())) {
            trazabilidad(deOtroComercio, token, e.comercioId()).andExpect(status().isNotFound());
            trazabilidad(sinPagar, token, e.comercioId()).andExpect(status().isNotFound());
            trazabilidad(99999999, token, e.comercioId()).andExpect(status().isNotFound());
        }
    }
}
