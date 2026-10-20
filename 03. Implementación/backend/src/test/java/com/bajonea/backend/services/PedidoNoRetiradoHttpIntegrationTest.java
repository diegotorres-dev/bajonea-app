package com.bajonea.backend.services;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
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
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

/**
 * Cierre como {@code NO_RETIRADO} (bloque A4b de E3) por HTTP real (login con JWT, filtros de seguridad, resolución de
 * {@code X-Comercio-Id}) contra {@code bajonea_test}: la espera mínima, el Dueño y el Empleado, el comercio
 * suspendido o cerrado temporalmente, el pedido propio, quién puede y quién no, lo que ve el Cliente, la
 * trazabilidad, la actividad y "facturado hoy".
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class PedidoNoRetiradoHttpIntegrationTest {

    private static final String HEADER = "X-Comercio-Id";
    private static final String BASE = "/api/v1/pedidos/comercio/";
    private static final String TEXTO_T36 = "Tu pedido #%d no fue retirado y el comercio lo cerró. "
            + "Como ya estaba preparado, no hay devolución del pago.";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private RegistroService registroService;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private java.time.Clock clock;

    @MockitoBean
    private EmailService emailService;

    private DatosPruebaEmpleado datos;

    private record Escenario(Dueno dueno, String tokenDueno, Cuenta empleado, String tokenEmpleado, Cuenta cliente,
            String tokenCliente) {

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
        Cuenta cliente = datos.registrarClienteConCredenciales();
        return new Escenario(dueno, login(dueno.nombreUsuario(), dueno.clave()), empleado,
                login(empleado.nombreUsuario(), empleado.clave()), cliente, login(cliente.nombreUsuario(), cliente.clave()));
    }

    private static MockHttpServletRequestBuilder con(MockHttpServletRequestBuilder request, String token, Integer comercioId) {
        MockHttpServletRequestBuilder conAuth = request.header("Authorization", "Bearer " + token);
        return comercioId == null ? conAuth : conAuth.header(HEADER, comercioId);
    }

    private JsonNode cuerpo(ResultActions resultado) throws Exception {
        return objectMapper.readTree(resultado.andReturn().getResponse().getContentAsString());
    }

    private int listo(int clienteId, int comercioId, String modalidad, int minutosListo) {
        jdbcTemplate.update("INSERT INTO pedido (cliente_id, comercio_id, modalidad_entrega, estado, pago_estado, subtotal, "
                + "cargo_servicio_cliente, cargo_servicio_comercio, total, fecha_creacion) "
                + "VALUES (?, ?, ?, 'LISTO_PARA_RETIRAR', 'PAGADO', 10000, 200, 100, 10200, ?)",
                clienteId, comercioId, modalidad, LocalDateTime.now().minusHours(2));
        int id = jdbcTemplate.queryForObject("SELECT LAST_INSERT_ID()", Integer.class);
        historial(id, "PENDIENTE_CONFIRMACION_COMERCIO", "SISTEMA", null, LocalDateTime.now().minusMinutes(minutosListo + 30));
        historial(id, "EN_PREPARACION", "DUENO", null, LocalDateTime.now().minusMinutes(minutosListo + 10));
        historial(id, "LISTO_PARA_RETIRAR", "DUENO", null, LocalDateTime.now().minusMinutes(minutosListo));
        return id;
    }

    private void historial(int pedidoId, String estado, String rol, Integer usuarioId, LocalDateTime cuando) {
        jdbcTemplate.update("INSERT INTO historial_estado_pedido (pedido_id, estado, actor_rol, actor_usuario_id, fecha_hora) VALUES (?, ?, ?, ?, ?)",
                pedidoId, estado, rol, usuarioId, cuando);
    }

    private String estadoDe(int pedidoId) {
        return jdbcTemplate.queryForObject("SELECT estado FROM pedido WHERE id = ?", String.class, pedidoId);
    }

    private int cantidadHistorial(int pedidoId) {
        return jdbcTemplate.queryForObject("SELECT COUNT(*) FROM historial_estado_pedido WHERE pedido_id = ?", Integer.class, pedidoId);
    }

    private ResultActions cerrar(int pedidoId, String token, Integer comercioId) throws Exception {
        return mockMvc.perform(con(put(BASE + pedidoId + "/no-retirado"), token, comercioId));
    }

    @Test
    void antesDeLosSesentaMinutosElDuenoRecibe409ConLosMinutosYNadaCambia() throws Exception {
        Escenario e = escenario();
        int pedidoId = listo(e.cliente().id(), e.comercioId(), "RETIRO", 45);
        int historialAntes = cantidadHistorial(pedidoId);

        JsonNode conflicto = cuerpo(cerrar(pedidoId, e.tokenDueno(), e.comercioId()).andExpect(status().isConflict()));

        assertEquals("RETIRO_EN_ESPERA", conflicto.path("data").path("codigo").asText());
        long minutos = conflicto.path("data").path("minutosRestantes").asLong();
        assertTrue(minutos >= 14 && minutos <= 15, "minutosRestantes = " + minutos);
        assertNotNull(conflicto.path("data").path("disponibleDesde").asText(null));
        assertTrue(conflicto.path("mensaje").asText().startsWith("Todavía no podés cerrar este pedido como no retirado. Esperá "));
        assertEquals("LISTO_PARA_RETIRAR", estadoDe(pedidoId));
        assertEquals(historialAntes, cantidadHistorial(pedidoId));
        assertEquals(0, jdbcTemplate.queryForObject("SELECT COUNT(*) FROM notificacion WHERE entidad_id = ? AND tipo = 'PEDIDO_NO_RETIRADO'",
                Integer.class, pedidoId));
    }

    @Test
    void despuesDeLaEsperaElDuenoCierraYRecibeElPedidoCompletoSinFuenteDeEntrega() throws Exception {
        Escenario e = escenario();
        int pedidoId = listo(e.cliente().id(), e.comercioId(), "RETIRO", 61);

        JsonNode respuesta = cuerpo(cerrar(pedidoId, e.tokenDueno(), e.comercioId()).andExpect(status().isOk()));
        JsonNode data = respuesta.path("data");

        assertEquals("Pedido cerrado como no retirado", respuesta.path("mensaje").asText());
        assertEquals("NO_RETIRADO", data.path("estado").asText());
        assertTrue(data.path("fuenteEntrega").isNull() || data.path("fuenteEntrega").isMissingNode());
        assertTrue(data.path("fechaEntrega").isNull() || data.path("fechaEntrega").isMissingNode());
        assertTrue(data.has("cargoServicioComercio"));
        assertFalse(data.has("esPedidoPropio"));
        assertTrue(data.path("reembolsoEstado").isNull() || data.path("reembolsoEstado").isMissingNode());
        assertEquals("NO_RETIRADO", estadoDe(pedidoId));
        assertEquals(0, jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM nota_credito n JOIN pago p ON p.id = n.pago_id WHERE p.pedido_id = ?", Integer.class, pedidoId));
    }

    @Test
    void elEmpleadoCierraRecibeElDtoReducidoYQuedaComoActorEnElHistorial() throws Exception {
        Escenario e = escenario();
        int pedidoId = listo(e.cliente().id(), e.comercioId(), "RETIRO", 90);

        JsonNode data = cuerpo(cerrar(pedidoId, e.tokenEmpleado(), e.comercioId()).andExpect(status().isOk())).path("data");

        assertEquals("NO_RETIRADO", data.path("estado").asText());
        assertFalse(data.path("esPedidoPropio").asBoolean(true));
        assertFalse(data.has("cargoServicioComercio"));
        assertTrue(data.has("cargoServicioCliente"));
        assertFalse(data.has("clienteId"));
        assertFalse(data.has("pagoEstado"));
        String actor = jdbcTemplate.queryForObject("SELECT CONCAT(actor_rol, ':', actor_usuario_id) FROM historial_estado_pedido "
                + "WHERE pedido_id = ? AND estado = 'NO_RETIRADO'", String.class, pedidoId);
        assertEquals("EMPLEADO:" + e.empleado().id(), actor);
    }

    @Test
    void funcionaConElComercioSuspendidoOCerradoTemporalmente() throws Exception {
        Escenario e = escenario();
        for (String estadoComercio : new String[] {"SUSPENDIDO", "CERRADO_TEMPORALMENTE"}) {
            datos.cambiarEstadoComercio(e.comercioId(), estadoComercio);
            int delEmpleado = listo(e.cliente().id(), e.comercioId(), "RETIRO", 90);
            int delDueno = listo(e.cliente().id(), e.comercioId(), "RETIRO", 90);

            cerrar(delEmpleado, e.tokenEmpleado(), e.comercioId()).andExpect(status().isOk());
            cerrar(delDueno, e.tokenDueno(), e.comercioId()).andExpect(status().isOk());

            assertEquals("NO_RETIRADO", estadoDe(delEmpleado), estadoComercio);
            assertEquals("NO_RETIRADO", estadoDe(delDueno), estadoComercio);
        }
    }

    @Test
    void soloDesdeListoParaRetirarYSoloEnRetiro() throws Exception {
        Escenario e = escenario();
        int entregado = listo(e.cliente().id(), e.comercioId(), "RETIRO", 90);
        jdbcTemplate.update("UPDATE pedido SET estado = 'ENTREGADO' WHERE id = ?", entregado);
        int enPreparacion = listo(e.cliente().id(), e.comercioId(), "RETIRO", 90);
        jdbcTemplate.update("UPDATE pedido SET estado = 'EN_PREPARACION' WHERE id = ?", enPreparacion);
        int domicilio = listo(e.cliente().id(), e.comercioId(), "DOMICILIO", 90);

        for (int pedidoId : new int[] {entregado, enPreparacion, domicilio}) {
            String antes = estadoDe(pedidoId);
            int historialAntes = cantidadHistorial(pedidoId);
            cerrar(pedidoId, e.tokenDueno(), e.comercioId()).andExpect(status().isConflict());
            assertEquals(antes, estadoDe(pedidoId));
            assertEquals(historialAntes, cantidadHistorial(pedidoId));
        }
    }

    @Test
    void elPedidoPropioDelEmpleadoDa409PedidoPropio() throws Exception {
        Escenario e = escenario();
        int pedidoId = listo(e.empleado().id(), e.comercioId(), "RETIRO", 90);

        JsonNode conflicto = cuerpo(cerrar(pedidoId, e.tokenEmpleado(), e.comercioId()).andExpect(status().isConflict()));

        assertEquals("PEDIDO_PROPIO", conflicto.path("data").path("codigo").asText());
        assertEquals("LISTO_PARA_RETIRAR", estadoDe(pedidoId));
        cerrar(pedidoId, e.tokenDueno(), e.comercioId()).andExpect(status().isOk());
    }

    @Test
    void quienNoEsDelComercioNoPuedeCerrar() throws Exception {
        Escenario e = escenario();
        int pedidoId = listo(e.cliente().id(), e.comercioId(), "RETIRO", 90);
        Dueno otroDueno = datos.registrarDuenoAprobado();
        datos.cambiarEstadoUsuario(otroDueno.id(), "ACTIVO");
        String tokenOtroDueno = login(otroDueno.nombreUsuario(), otroDueno.clave());
        String tokenAdmin = loginAdministrador();

        cerrar(pedidoId, e.tokenCliente(), e.comercioId()).andExpect(status().isNotFound());
        cerrar(pedidoId, e.tokenCliente(), null).andExpect(status().isBadRequest());
        cerrar(pedidoId, tokenOtroDueno, otroDueno.comercioId()).andExpect(status().isNotFound());
        cerrar(pedidoId, tokenOtroDueno, e.comercioId()).andExpect(status().isNotFound());
        cerrar(pedidoId, tokenAdmin, null).andExpect(status().isForbidden());
        mockMvc.perform(put(BASE + pedidoId + "/no-retirado")).andExpect(status().isUnauthorized());

        assertEquals("LISTO_PARA_RETIRAR", estadoDe(pedidoId));
    }

    private String loginAdministrador() throws Exception {
        Cuenta cuenta = datos.registrarClienteConCredenciales();
        jdbcTemplate.update("UPDATE usuario SET rol = 'ADMINISTRADOR' WHERE id = ?", cuenta.id());
        datos.hacerAdministrador(cuenta.id());
        return login(cuenta.nombreUsuario(), cuenta.clave());
    }

    @Test
    void unEmpleadoDesactivadoRecibeElMismo404ConElCodigoEstable() throws Exception {
        Escenario e = escenario();
        int pedidoId = listo(e.cliente().id(), e.comercioId(), "RETIRO", 90);
        jdbcTemplate.update("UPDATE empleado_comercio SET estado = 'INACTIVO', fecha_baja = NOW() WHERE empleado_id = ?", e.empleado().id());

        JsonNode respuesta = cuerpo(cerrar(pedidoId, e.tokenEmpleado(), e.comercioId()).andExpect(status().isNotFound()));

        assertEquals("COMERCIO_NO_DISPONIBLE", respuesta.path("data").path("codigo").asText());
        assertEquals("LISTO_PARA_RETIRAR", estadoDe(pedidoId));
    }

    @Test
    void elClienteVeElPedidoNoRetiradoYRecibeElAvisoT36SinSaberQuienLoCerro() throws Exception {
        Escenario e = escenario();
        int pedidoId = listo(e.cliente().id(), e.comercioId(), "RETIRO", 90);
        cerrar(pedidoId, e.tokenEmpleado(), e.comercioId()).andExpect(status().isOk());

        JsonNode pedidos = cuerpo(mockMvc.perform(con(get("/api/v1/pedidos/cliente"), e.tokenCliente(), null))
                .andExpect(status().isOk())).path("data");
        JsonNode avisos = cuerpo(mockMvc.perform(con(get("/api/v1/notificaciones"), e.tokenCliente(), null))
                .andExpect(status().isOk())).path("data");

        assertEquals(1, pedidos.size());
        assertEquals("NO_RETIRADO", pedidos.get(0).path("estado").asText());
        assertTrue(pedidos.get(0).path("reembolsoEstado").isNull() || pedidos.get(0).path("reembolsoEstado").isMissingNode());
        assertEquals(1, avisos.size());
        assertEquals(String.format(TEXTO_T36, pedidoId), avisos.get(0).path("mensaje").asText());
        assertEquals(pedidoId, avisos.get(0).path("entidadId").asInt());
        assertFalse(avisos.toString().contains(e.empleado().nombreUsuario()));
        assertEquals(1, jdbcTemplate.queryForObject("SELECT COUNT(*) FROM notificacion WHERE entidad_id = ? AND entidad_tipo = 'PEDIDO'",
                Integer.class, pedidoId));
        JsonNode avisosDelDueno = cuerpo(mockMvc.perform(con(get("/api/v1/notificaciones"), e.tokenDueno(), e.comercioId()))
                .andExpect(status().isOk())).path("data");
        assertFalse(avisosDelDueno.toString().contains("no fue retirado"));
    }

    @Test
    void laTrazabilidadYLaActividadDelComercioMuestranElCierreConSuTexto() throws Exception {
        Escenario e = escenario();
        int pedidoId = listo(e.cliente().id(), e.comercioId(), "RETIRO", 90);
        cerrar(pedidoId, e.tokenEmpleado(), e.comercioId()).andExpect(status().isOk());

        JsonNode pasos = cuerpo(mockMvc.perform(con(get(BASE + pedidoId + "/trazabilidad"), e.tokenDueno(), e.comercioId()))
                .andExpect(status().isOk())).path("data").path("pasos");
        JsonNode ultimo = pasos.get(pasos.size() - 1);
        JsonNode actividad = cuerpo(mockMvc.perform(con(get("/api/v1/comercios/equipo/actividad"), e.tokenDueno(), e.comercioId()))
                .andExpect(status().isOk())).path("data").path("items");

        assertEquals("NO_RETIRADO", ultimo.path("estado").asText());
        assertEquals("Cerró el pedido como no retirado", ultimo.path("accionTexto").asText());
        assertEquals("Empleado", ultimo.path("actorRolTexto").asText());
        assertEquals("Cerró un pedido como no retirado", actividad.get(0).path("accionTexto").asText());
    }

    private void asignarTurnoDeHoy(int comercioId, int pedidoId) {
        java.time.LocalDate hoy = java.time.LocalDate.now(clock);
        String dia = com.bajonea.backend.enums.DiaSemana.values()[hoy.getDayOfWeek().getValue() - 1].name();
        jdbcTemplate.update("DELETE FROM horario WHERE comercio_id = ?", comercioId);
        jdbcTemplate.update("INSERT INTO horario (comercio_id, dia_semana, hora_apertura, hora_cierre) VALUES (?, ?, '00:00:00', '23:59:00')",
                comercioId, dia);
        int horarioId = jdbcTemplate.queryForObject("SELECT LAST_INSERT_ID()", Integer.class);
        jdbcTemplate.update("UPDATE pedido SET turno_fecha = ?, turno_horario_id = ?, fecha_pago_confirmado = ? WHERE id = ?",
                hoy, horarioId, hoy.atStartOfDay().plusSeconds(1), pedidoId);
    }

    private JsonNode resumenDelTurno(String token, int comercioId) throws Exception {
        return cuerpo(mockMvc.perform(con(get(BASE + "resumen-turno"), token, comercioId)).andExpect(status().isOk())).path("data");
    }

    @Test
    void elVendidoDelTurnoCuentaElPedidoNoRetiradoIgualParaElDuenoYElEmpleadoYElNetoSoloParaElDueno() throws Exception {
        Escenario e = escenario();
        int pedidoId = listo(e.cliente().id(), e.comercioId(), "RETIRO", 90);
        asignarTurnoDeHoy(e.comercioId(), pedidoId);
        JsonNode duenoAntes = resumenDelTurno(e.tokenDueno(), e.comercioId());
        JsonNode empleadoAntes = resumenDelTurno(e.tokenEmpleado(), e.comercioId());

        cerrar(pedidoId, e.tokenDueno(), e.comercioId()).andExpect(status().isOk());

        JsonNode duenoDespues = resumenDelTurno(e.tokenDueno(), e.comercioId());
        JsonNode empleadoDespues = resumenDelTurno(e.tokenEmpleado(), e.comercioId());
        assertEquals("EN_CURSO", duenoAntes.path("estado").asText());
        assertEquals(10000.0, duenoAntes.path("vendido").asDouble());
        assertEquals(100.0, duenoAntes.path("comision").asDouble());
        assertEquals(9900.0, duenoAntes.path("neto").asDouble());
        assertEquals(10000.0, empleadoAntes.path("vendido").asDouble());
        assertFalse(empleadoAntes.has("comision"));
        assertFalse(empleadoAntes.has("neto"));
        assertEquals(duenoAntes, duenoDespues);
        assertEquals(empleadoAntes, empleadoDespues);
    }

    @Test
    void sinHeaderElDuenoRecibe400() throws Exception {
        Escenario e = escenario();
        int pedidoId = listo(e.cliente().id(), e.comercioId(), "RETIRO", 90);

        cerrar(pedidoId, e.tokenDueno(), null).andExpect(status().isBadRequest());

        assertEquals("LISTO_PARA_RETIRAR", estadoDe(pedidoId));
    }

    private static boolean esNulo(JsonNode nodo) {
        return nodo.isNull() || nodo.isMissingNode();
    }

    private JsonNode pedidoDeLaLista(JsonNode lista, int pedidoId) {
        for (JsonNode pedido : lista) {
            if (pedido.path("id").asInt() == pedidoId) {
                return pedido;
            }
        }
        throw new AssertionError("El pedido " + pedidoId + " no está en la lista");
    }

    @Test
    void laListaDelComercioInformaCuandoSeHabilitaElCierreDeUnRetiroListo() throws Exception {
        Escenario e = escenario();
        int enEspera = listo(e.cliente().id(), e.comercioId(), "RETIRO", 45);
        int cumplido = listo(e.cliente().id(), e.comercioId(), "RETIRO", 61);
        int domicilio = listo(e.cliente().id(), e.comercioId(), "DOMICILIO", 45);
        int entregado = listo(e.cliente().id(), e.comercioId(), "RETIRO", 45);
        jdbcTemplate.update("UPDATE pedido SET estado = 'ENTREGADO' WHERE id = ?", entregado);

        for (String token : new String[] {e.tokenDueno(), e.tokenEmpleado()}) {
            JsonNode lista = cuerpo(mockMvc.perform(con(get(BASE.substring(0, BASE.length() - 1)), token, e.comercioId()))
                    .andExpect(status().isOk())).path("data");

            JsonNode espera = pedidoDeLaLista(lista, enEspera);
            long minutos = espera.path("noRetiradoMinutosRestantes").asLong(-1);
            assertTrue(minutos >= 14 && minutos <= 15, "noRetiradoMinutosRestantes = " + minutos);
            assertNotNull(espera.path("noRetiradoDisponibleDesde").asText(null));
            LocalDateTime disponibleDesde = LocalDateTime.parse(espera.path("noRetiradoDisponibleDesde").asText());
            assertTrue(Math.abs(java.time.Duration.between(LocalDateTime.now().plusMinutes(15), disponibleDesde).toSeconds()) < 90);

            JsonNode habilitado = pedidoDeLaLista(lista, cumplido);
            assertEquals(0, habilitado.path("noRetiradoMinutosRestantes").asLong(-1));
            assertNotNull(habilitado.path("noRetiradoDisponibleDesde").asText(null));

            for (int sinEspera : new int[] {domicilio, entregado}) {
                JsonNode otro = pedidoDeLaLista(lista, sinEspera);
                assertTrue(esNulo(otro.path("noRetiradoMinutosRestantes")));
                assertTrue(esNulo(otro.path("noRetiradoDisponibleDesde")));
            }
        }
    }

    @Test
    void despacharUnRetiroDevuelveLaEsperaCompletaYElClienteNuncaLaRecibe() throws Exception {
        Escenario e = escenario();
        int pedidoId = listo(e.cliente().id(), e.comercioId(), "RETIRO", 5);
        jdbcTemplate.update("UPDATE pedido SET estado = 'EN_PREPARACION' WHERE id = ?", pedidoId);
        jdbcTemplate.update("DELETE FROM historial_estado_pedido WHERE pedido_id = ? AND estado = 'LISTO_PARA_RETIRAR'", pedidoId);

        JsonNode porEmpleado = cuerpo(mockMvc.perform(con(put(BASE + pedidoId + "/despachar"), e.tokenEmpleado(), e.comercioId()))
                .andExpect(status().isOk())).path("data");

        assertEquals("LISTO_PARA_RETIRAR", porEmpleado.path("estado").asText());
        assertEquals(60, porEmpleado.path("noRetiradoMinutosRestantes").asLong(-1));
        assertNotNull(porEmpleado.path("noRetiradoDisponibleDesde").asText(null));

        JsonNode pedidosCliente = cuerpo(mockMvc.perform(con(get("/api/v1/pedidos/cliente"), e.tokenCliente(), null))
                .andExpect(status().isOk())).path("data");
        JsonNode delCliente = pedidoDeLaLista(pedidosCliente, pedidoId);
        assertEquals("LISTO_PARA_RETIRAR", delCliente.path("estado").asText());
        assertTrue(esNulo(delCliente.path("noRetiradoMinutosRestantes")));
        assertTrue(esNulo(delCliente.path("noRetiradoDisponibleDesde")));
    }

    @Test
    void elMinutoRestanteSeRedondeaHaciaArribaYLlegaACeroAlCumplirse() throws Exception {
        Escenario e = escenario();
        int pedidoId = listo(e.cliente().id(), e.comercioId(), "RETIRO", 59);
        jdbcTemplate.update("UPDATE historial_estado_pedido SET fecha_hora = ? WHERE pedido_id = ? AND estado = 'LISTO_PARA_RETIRAR'",
                LocalDateTime.now().minusSeconds(59 * 60 + 20), pedidoId);

        JsonNode antes = pedidoDeLaLista(cuerpo(mockMvc.perform(con(get(BASE.substring(0, BASE.length() - 1)), e.tokenDueno(), e.comercioId()))
                .andExpect(status().isOk())).path("data"), pedidoId);
        assertEquals(1, antes.path("noRetiradoMinutosRestantes").asLong(-1));

        jdbcTemplate.update("UPDATE historial_estado_pedido SET fecha_hora = ? WHERE pedido_id = ? AND estado = 'LISTO_PARA_RETIRAR'",
                LocalDateTime.now().minusMinutes(61), pedidoId);
        JsonNode despues = pedidoDeLaLista(cuerpo(mockMvc.perform(con(get(BASE.substring(0, BASE.length() - 1)), e.tokenDueno(), e.comercioId()))
                .andExpect(status().isOk())).path("data"), pedidoId);
        assertEquals(0, despues.path("noRetiradoMinutosRestantes").asLong(-1));
    }
}
