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
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

/**
 * Escrituras delegadas al Empleado (E3, bloque A2) por HTTP real: login con JWT, filtros de seguridad, resolución de
 * {@code X-Comercio-Id} y manejo de errores, contra {@code bajonea_test}. La lógica de bloqueo y de carreras está en
 * {@link EscriturasEmpleadoIntegrationTest}; acá se comprueban los códigos, los cuerpos y los DTO que ve el cliente.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class EscriturasEmpleadoHttpIntegrationTest {

    private static final String HEADER = "X-Comercio-Id";
    private static final String DATOS = "/api/v1/comercios/perfil/datos-operativos";

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

    private record Escenario(Dueno dueno, Cuenta empleado, String tokenEmpleado, String tokenDueno, Cuenta ajeno, String tokenAjeno) {
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

    private Escenario escenario(String estadoComercio) throws Exception {
        Dueno dueno = datos.registrarDuenoAprobado();
        datos.cambiarEstadoUsuario(dueno.id(), "ACTIVO");
        datos.cambiarEstadoComercio(dueno.comercioId(), estadoComercio);
        Cuenta empleado = datos.registrarClienteConCredenciales();
        datos.vincularEmpleado(empleado.id(), dueno.comercioId(), "ACTIVO", LocalDateTime.now().minusDays(1));
        Cuenta ajeno = datos.registrarClienteConCredenciales();
        return new Escenario(dueno, empleado, login(empleado.nombreUsuario(), empleado.clave()), login(dueno.nombreUsuario(), dueno.clave()),
                ajeno, login(ajeno.nombreUsuario(), ajeno.clave()));
    }

    private static MockHttpServletRequestBuilder con(MockHttpServletRequestBuilder request, String token, Integer comercioId) {
        MockHttpServletRequestBuilder conAuth = request.header("Authorization", "Bearer " + token);
        return comercioId == null ? conAuth : conAuth.header(HEADER, comercioId);
    }

    private JsonNode cuerpo(org.springframework.test.web.servlet.ResultActions resultado) throws Exception {
        return objectMapper.readTree(resultado.andReturn().getResponse().getContentAsString());
    }

    private org.springframework.test.web.servlet.ResultActions datosOperativos(String token, Integer comercioId, String json) throws Exception {
        return mockMvc.perform(con(put(DATOS), token, comercioId).contentType(MediaType.APPLICATION_JSON).content(json));
    }

    private static final String DATOS_OK = "{\"descripcion\":\"Descripcion HTTP\",\"telefono\":\"+5492964111222\"}";

    private int pedidoPendiente(Escenario e) {
        int clienteId = datos.registrarCliente();
        jdbcTemplate.update("INSERT INTO pedido (cliente_id, comercio_id, modalidad_entrega, estado, pago_estado, subtotal, "
                + "cargo_servicio_cliente, cargo_servicio_comercio, total, fecha_creacion) "
                + "VALUES (?, ?, 'RETIRO', 'PENDIENTE_CONFIRMACION_COMERCIO', 'PAGADO', 10000, 200, 100, 10200, ?)",
                clienteId, e.dueno().comercioId(), LocalDateTime.now().minusHours(1));
        int id = jdbcTemplate.queryForObject("SELECT LAST_INSERT_ID()", Integer.class);
        jdbcTemplate.update("INSERT INTO historial_estado_pedido (pedido_id, estado, actor_rol, actor_usuario_id, fecha_hora) VALUES (?, ?, 'SISTEMA', NULL, ?)",
                id, "PENDIENTE_CONFIRMACION_COMERCIO", LocalDateTime.now().minusMinutes(30));
        return id;
    }

    @Test
    void elEmpleadoEditaDescripcionYTelefonoYRecibeElPerfilReducidoSinElEmailDeContacto() throws Exception {
        Escenario e = escenario("APTO_VENTA");

        JsonNode respuesta = cuerpo(datosOperativos(e.tokenEmpleado(), e.dueno().comercioId(), DATOS_OK).andExpect(status().isOk()));

        assertEquals("Descripcion HTTP", respuesta.path("data").path("descripcion").asText());
        assertFalse(respuesta.path("data").has("emailContacto"));
        assertFalse(respuesta.path("data").has("cuit"));
        assertFalse(respuesta.path("data").has("representante"));
        assertEquals("EMPLEADO", jdbcTemplate.queryForObject(
                "SELECT actor_rol FROM historial_edicion_comercio WHERE comercio_id = ? ORDER BY id DESC LIMIT 1", String.class, e.dueno().comercioId()));
    }

    @Test
    void cualquierCampoDelDuenoEnElCuerpoDa400YNoCambiaNada() throws Exception {
        Escenario e = escenario("APTO_VENTA");
        String nombreAntes = jdbcTemplate.queryForObject("SELECT nombre FROM comercio WHERE id = ?", String.class, e.dueno().comercioId());

        for (String intruso : new String[] {"\"nombre\":\"Hackeado\"", "\"emailContacto\":\"otro@bajonea.test\"", "\"aceptaDelivery\":false"}) {
            datosOperativos(e.tokenEmpleado(), e.dueno().comercioId(),
                    "{\"descripcion\":\"x\",\"telefono\":\"+5492964111222\"," + intruso + "}").andExpect(status().isBadRequest());
        }

        assertEquals(nombreAntes, jdbcTemplate.queryForObject("SELECT nombre FROM comercio WHERE id = ?", String.class, e.dueno().comercioId()));
    }

    @Test
    void laEdicionCompletaDelPerfilLaFotoYSuFirmaSiguenSiendoExclusivasDelDueno() throws Exception {
        Escenario e = escenario("APTO_VENTA");
        int comercioId = e.dueno().comercioId();

        mockMvc.perform(con(put("/api/v1/comercios/perfil"), e.tokenEmpleado(), comercioId).contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isForbidden());
        mockMvc.perform(con(put("/api/v1/comercios/perfil/foto"), e.tokenEmpleado(), comercioId).contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isForbidden());
        mockMvc.perform(con(post("/api/v1/comercios/perfil/foto/firma"), e.tokenEmpleado(), comercioId)).andExpect(status().isForbidden());
    }

    @Test
    void conLaRelacionInactivaLaEscrituraRespondeElMismo404AunConUnCuerpoInvalido() throws Exception {
        Escenario e = escenario("APTO_VENTA");
        jdbcTemplate.update("UPDATE empleado_comercio SET estado = 'INACTIVO', fecha_baja = NOW() WHERE empleado_id = ?", e.empleado().id());

        JsonNode valido = cuerpo(datosOperativos(e.tokenEmpleado(), e.dueno().comercioId(), DATOS_OK).andExpect(status().isNotFound()));
        JsonNode invalido = cuerpo(datosOperativos(e.tokenEmpleado(), e.dueno().comercioId(), "{\"telefono\":\"\"}").andExpect(status().isNotFound()));

        assertEquals("COMERCIO_NO_DISPONIBLE", valido.path("data").path("codigo").asText());
        assertEquals(valido, invalido);
    }

    @Test
    void unClienteSinRelacionRecibe404ConElHeaderY400SinElYElMismo404EnLasNotificaciones() throws Exception {
        Escenario e = escenario("APTO_VENTA");

        datosOperativos(e.tokenAjeno(), e.dueno().comercioId(), DATOS_OK).andExpect(status().isNotFound());
        datosOperativos(e.tokenAjeno(), null, DATOS_OK).andExpect(status().isBadRequest());
        mockMvc.perform(con(get("/api/v1/notificaciones"), e.tokenAjeno(), e.dueno().comercioId())).andExpect(status().isNotFound());
        mockMvc.perform(con(get("/api/v1/notificaciones/no-leidas/contador"), e.tokenAjeno(), e.dueno().comercioId())).andExpect(status().isNotFound());
        mockMvc.perform(con(get("/api/v1/notificaciones"), e.tokenAjeno(), null)).andExpect(status().isOk());
        mockMvc.perform(con(get("/api/v1/notificaciones"), e.tokenEmpleado(), e.dueno().comercioId())).andExpect(status().isOk());
    }

    @Test
    void conElComercioSuspendidoElEmpleadoYElDuenoRecibenElMismo409ConSuCodigo() throws Exception {
        Escenario e = escenario("SUSPENDIDO");

        JsonNode conflicto = cuerpo(datosOperativos(e.tokenEmpleado(), e.dueno().comercioId(), DATOS_OK).andExpect(status().isConflict()));
        assertEquals("COMERCIO_SUSPENDIDO", conflicto.path("data").path("codigo").asText());
        assertEquals("El comercio está suspendido: por ahora no se puede modificar.", conflicto.path("mensaje").asText());
        mockMvc.perform(con(post("/api/v1/productos"), e.tokenEmpleado(), e.dueno().comercioId()).contentType(MediaType.APPLICATION_JSON)
                .content("{\"nombre\":\"X\",\"precio\":10,\"categoriaId\":1}")).andExpect(status().isConflict());

        JsonNode delDueno = cuerpo(datosOperativos(e.tokenDueno(), e.dueno().comercioId(), DATOS_OK).andExpect(status().isConflict()));
        assertEquals("COMERCIO_SUSPENDIDO", delDueno.path("data").path("codigo").asText());
    }

    @Test
    void cerrarYAbrirConElComercioNoOperativoDan409ConSuCodigoParaElEmpleadoYElDueno() throws Exception {
        Escenario e = escenario("CERRADO_TEMPORALMENTE");

        for (String token : new String[] {e.tokenEmpleado(), e.tokenDueno()}) {
            for (String ruta : new String[] {"/api/v1/comercios/cerrar", "/api/v1/comercios/abrir"}) {
                JsonNode conflicto = cuerpo(mockMvc.perform(con(put(ruta), token, e.dueno().comercioId())).andExpect(status().isConflict()));
                assertEquals("COMERCIO_NO_OPERATIVO", conflicto.path("data").path("codigo").asText());
                assertEquals("Este comercio no está operativo", conflicto.path("mensaje").asText());
            }
        }
    }

    @Test
    void aceptarConElComercioCerradoTemporalmenteDa409SinOperacionYRechazarSiFunciona() throws Exception {
        Escenario e = escenario("CERRADO_TEMPORALMENTE");
        int pedidoId = pedidoPendiente(e);

        JsonNode conflicto = cuerpo(mockMvc.perform(con(put("/api/v1/pedidos/comercio/" + pedidoId + "/aceptar"), e.tokenEmpleado(), e.dueno().comercioId()))
                .andExpect(status().isConflict()));
        assertEquals("COMERCIO_SIN_OPERACION", conflicto.path("data").path("codigo").asText());
        assertEquals("El comercio no está operativo: no podés aceptar pedidos nuevos. Sí podés rechazarlos.", conflicto.path("mensaje").asText());
        assertEquals("PENDIENTE_CONFIRMACION_COMERCIO", jdbcTemplate.queryForObject("SELECT estado FROM pedido WHERE id = ?", String.class, pedidoId));

        JsonNode rechazado = cuerpo(mockMvc.perform(con(put("/api/v1/pedidos/comercio/" + pedidoId + "/rechazar"), e.tokenEmpleado(), e.dueno().comercioId())
                .contentType(MediaType.APPLICATION_JSON).content("{\"motivo\":\"SIN_STOCK\"}")).andExpect(status().isOk()));
        assertEquals("RECHAZADO", rechazado.path("data").path("estado").asText());
        assertFalse(rechazado.path("data").has("clienteId"));
        assertFalse(rechazado.path("data").has("pagoEstado"));
    }

    @Test
    void elEmpleadoAceptaConCierreManualYLaRespuestaEsLaReducidaMientrasQueLaDelDuenoEsLaCompleta() throws Exception {
        Escenario e = escenario("APTO_VENTA");
        jdbcTemplate.update("UPDATE comercio SET cerrado_manualmente = 1 WHERE id = ?", e.dueno().comercioId());
        int delEmpleado = pedidoPendiente(e);
        int delDueno = pedidoPendiente(e);

        JsonNode reducida = cuerpo(mockMvc.perform(con(put("/api/v1/pedidos/comercio/" + delEmpleado + "/aceptar"), e.tokenEmpleado(), e.dueno().comercioId()))
                .andExpect(status().isOk()));
        JsonNode completa = cuerpo(mockMvc.perform(con(put("/api/v1/pedidos/comercio/" + delDueno + "/aceptar"), e.tokenDueno(), e.dueno().comercioId()))
                .andExpect(status().isOk()));

        assertFalse(reducida.path("data").has("clienteId"));
        assertFalse(reducida.path("data").has("cargoServicioComercio"));
        assertTrue(completa.path("data").has("clienteId"));
        assertTrue(completa.path("data").has("cargoServicioComercio"));
        assertEquals("EMPLEADO:" + e.empleado().id(), jdbcTemplate.queryForObject(
                "SELECT CONCAT(actor_rol, ':', actor_usuario_id) FROM historial_estado_pedido WHERE pedido_id = ? ORDER BY id DESC LIMIT 1", String.class, delEmpleado));
        assertEquals("DUENO:" + e.dueno().id(), jdbcTemplate.queryForObject(
                "SELECT CONCAT(actor_rol, ':', actor_usuario_id) FROM historial_estado_pedido WHERE pedido_id = ? ORDER BY id DESC LIMIT 1", String.class, delDueno));
    }
}
