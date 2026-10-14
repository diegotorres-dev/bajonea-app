package com.bajonea.backend.services;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.reset;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.bajonea.backend.config.PedidoTimeoutProperties;
import com.bajonea.backend.services.DatosPruebaEmpleado.Cuenta;
import com.bajonea.backend.services.DatosPruebaEmpleado.Dueno;
import com.bajonea.backend.services.MercadoPagoReembolsoClient.ResultadoReembolsoMp;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Clock;
import java.time.LocalDateTime;
import java.util.ArrayList;
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
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

/**
 * Aviso T30 al equipo cuando el sistema autoconfirma la entrega de un pedido a domicilio (E3, bloque A6) por HTTP
 * real —login con JWT, filtros, resolución de {@code X-Comercio-Id}— y por los servicios, contra {@code bajonea_test}
 * con datos confirmados de verdad. Cubre una copia por destinatario con el texto tomado de la configuración, el
 * Dueño y los Empleados activos, que no llegue a un desactivado, a quien se suma después ni al Cliente del pedido si
 * es Empleado, la separación por comercio, la lectura individual y los casos en que no se emite (antes de los
 * minutos configurados, confirmación manual del Cliente, retiro cerrado por la suspensión del comercio). Las
 * carreras están en {@link PedidoAutoconfirmadoConcurrenciaIntegrationTest}.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class PedidoAutoconfirmadoEquipoIntegrationTest {

    private static final String HEADER = "X-Comercio-Id";
    private static final String NOTIFICACIONES = "/api/v1/notificaciones";
    private static final String T30 = "PEDIDO_AUTOCONFIRMADO_COMERCIO";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private RegistroService registroService;

    @Autowired
    private PedidoService pedidoService;

    @Autowired
    private PedidoTimeoutProperties timeoutProperties;

    @Autowired
    private Clock clock;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private ObjectMapper objectMapper;

    @MockitoBean
    private EmailService emailService;

    @MockitoBean
    private MercadoPagoReembolsoClient reembolsoClient;

    private DatosPruebaEmpleado datos;

    private record Equipo(Dueno dueno, Cuenta a, Cuenta b, int compradorId, String tokenDueno, String tokenA, String tokenB) {
        int comercioId() {
            return dueno.comercioId();
        }
    }

    @BeforeEach
    void preparar() {
        datos = new DatosPruebaEmpleado(registroService, objectMapper, jdbcTemplate);
        reset(reembolsoClient);
        when(reembolsoClient.solicitarReembolsoTotal(anyString(), anyString(), anyString()))
                .thenReturn(ResultadoReembolsoMp.exito("refund-a6"));
    }

    private String login(Cuenta cuenta) throws Exception {
        return login(cuenta.nombreUsuario(), cuenta.clave());
    }

    private String login(String nombreUsuario, String clave) throws Exception {
        String cuerpo = mockMvc.perform(post("/api/v1/auth/login").contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("nombreUsuario", nombreUsuario, "password", clave))))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return objectMapper.readTree(cuerpo).path("data").path("token").asText();
    }

    private Equipo equipo() throws Exception {
        Dueno dueno = datos.registrarDuenoAprobado();
        datos.cambiarEstadoUsuario(dueno.id(), "ACTIVO");
        datos.cambiarEstadoComercio(dueno.comercioId(), "APTO_VENTA");
        Cuenta a = datos.registrarClienteConCredenciales();
        Cuenta b = datos.registrarClienteConCredenciales();
        datos.vincularEmpleado(a.id(), dueno.comercioId(), "ACTIVO", LocalDateTime.now(clock).minusDays(2));
        datos.vincularEmpleado(b.id(), dueno.comercioId(), "ACTIVO", LocalDateTime.now(clock).minusDays(1));
        int comprador = datos.registrarCliente();
        return new Equipo(dueno, a, b, comprador, login(dueno.nombreUsuario(), dueno.clave()), login(a), login(b));
    }

    private static MockHttpServletRequestBuilder con(MockHttpServletRequestBuilder request, String token, Integer comercioId) {
        MockHttpServletRequestBuilder conAuth = request.header("Authorization", "Bearer " + token);
        return comercioId == null ? conAuth : conAuth.header(HEADER, comercioId);
    }

    private JsonNode data(MockHttpServletRequestBuilder request) throws Exception {
        String cuerpo = mockMvc.perform(request).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        return objectMapper.readTree(cuerpo).path("data");
    }

    private List<JsonNode> avisos(String token, Integer comercioId) throws Exception {
        List<JsonNode> avisos = new ArrayList<>();
        for (JsonNode item : data(con(get(NOTIFICACIONES), token, comercioId))) {
            avisos.add(item);
        }
        return avisos;
    }

    private long contador(String token, Integer comercioId) throws Exception {
        return data(con(get(NOTIFICACIONES + "/no-leidas/contador"), token, comercioId)).asLong();
    }

    private int pedidoEnCamino(int clienteId, Dueno dueno, long minutosEnCamino) {
        jdbcTemplate.update("INSERT INTO pedido (cliente_id, comercio_id, modalidad_entrega, estado, pago_estado, subtotal, "
                + "cargo_servicio_cliente, cargo_servicio_comercio, total, fecha_creacion) "
                + "VALUES (?, ?, 'DOMICILIO', 'EN_CAMINO', 'PAGADO', 10000, 200, 100, 10200, ?)",
                clienteId, dueno.comercioId(), LocalDateTime.now(clock).minusHours(6));
        int id = jdbcTemplate.queryForObject("SELECT LAST_INSERT_ID()", Integer.class);
        historial(id, "PENDIENTE_CONFIRMACION_COMERCIO", "SISTEMA", null, minutosEnCamino + 200);
        historial(id, "EN_PREPARACION", "DUENO", dueno.id(), minutosEnCamino + 100);
        historial(id, "EN_CAMINO", "DUENO", dueno.id(), minutosEnCamino);
        jdbcTemplate.update("INSERT INTO pago (pedido_id, monto, mp_estado, id_transaccion_mp, fecha_creacion, fecha_confirmacion) "
                + "VALUES (?, 10200, 'approved', ?, NOW(), NOW())", id, "a6-" + id);
        return id;
    }

    private void historial(int pedidoId, String estado, String actorRol, Integer actorUsuarioId, long minutosAtras) {
        jdbcTemplate.update("INSERT INTO historial_estado_pedido (pedido_id, estado, actor_rol, actor_usuario_id, fecha_hora) VALUES (?, ?, ?, ?, ?)",
                pedidoId, estado, actorRol, actorUsuarioId, LocalDateTime.now(clock).minusMinutes(minutosAtras));
    }

    private int copias(int usuarioId, String tipo, int pedidoId) {
        return jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM notificacion WHERE usuario_id = ? AND tipo = ? AND entidad_tipo = 'PEDIDO' AND entidad_id = ?",
                Integer.class, usuarioId, tipo, pedidoId);
    }

    private int copiasDelTipo(String tipo, int pedidoId) {
        return jdbcTemplate.queryForObject("SELECT COUNT(*) FROM notificacion WHERE tipo = ? AND entidad_tipo = 'PEDIDO' AND entidad_id = ?",
                Integer.class, tipo, pedidoId);
    }

    private String estado(int pedidoId) {
        return jdbcTemplate.queryForObject("SELECT estado FROM pedido WHERE id = ?", String.class, pedidoId);
    }

    private void correrProceso() {
        pedidoService.avisar75MinYAutoconfirmar(LocalDateTime.now(clock));
    }

    private String textoEsperado(int pedidoId) {
        return "El pedido #" + pedidoId + " se confirmó automáticamente como entregado porque el cliente no respondió en "
                + timeoutProperties.getAutoconfirmacionEnCaminoMinutos() + " minutos.";
    }

    @Test
    void laAutoconfirmacionGeneraUnaCopiaPorDuenoYEmpleadoActivoConElTextoDeLaConfiguracion() throws Exception {
        Equipo e = equipo();
        Cuenta desactivado = datos.registrarClienteConCredenciales();
        datos.vincularEmpleado(desactivado.id(), e.comercioId(), "INACTIVO", LocalDateTime.now(clock).minusDays(3));
        int pedidoId = pedidoEnCamino(e.compradorId(), e.dueno(), timeoutProperties.getAutoconfirmacionEnCaminoMinutos() + 10);

        correrProceso();

        assertEquals("ENTREGADO", estado(pedidoId));
        for (int usuario : new int[] {e.dueno().id(), e.a().id(), e.b().id()}) {
            assertEquals(1, copias(usuario, T30, pedidoId), "una copia para " + usuario);
        }
        assertEquals(3, copiasDelTipo(T30, pedidoId), "solo Dueño y Empleados activos");
        assertEquals(0, copias(desactivado.id(), T30, pedidoId), "el desactivado no recibe copia");
        assertEquals(0, copias(e.compradorId(), T30, pedidoId), "el comprador no recibe el aviso del equipo");
        assertEquals(1, copias(e.compradorId(), "PEDIDO_AUTOCONFIRMADO", pedidoId), "el aviso del Cliente (T8) no cambia");
        assertEquals(3, jdbcTemplate.queryForObject("SELECT COUNT(*) FROM notificacion WHERE entidad_tipo = 'PEDIDO' AND entidad_id = ? "
                + "AND tipo = ? AND comercio_id = ? AND canal = 'PUSH' AND leida = 0 AND mensaje = ?", Integer.class,
                pedidoId, T30, e.comercioId(), textoEsperado(pedidoId)));
        assertEquals(1, jdbcTemplate.queryForObject("SELECT COUNT(*) FROM notificacion WHERE tipo = 'PEDIDO_AUTOCONFIRMADO' AND entidad_id = ? "
                + "AND comercio_id IS NULL", Integer.class, pedidoId), "T8 sigue siendo personal, sin comercio");

        for (String token : new String[] {e.tokenDueno(), e.tokenA(), e.tokenB()}) {
            List<JsonNode> lista = avisos(token, e.comercioId());
            assertEquals(1, lista.size());
            assertEquals(textoEsperado(pedidoId), lista.get(0).path("mensaje").asText());
            assertEquals("PEDIDO", lista.get(0).path("entidadTipo").asText());
            assertEquals(pedidoId, lista.get(0).path("entidadId").asInt());
            assertEquals(1, contador(token, e.comercioId()));
        }

        int deA = avisos(e.tokenA(), e.comercioId()).get(0).path("id").asInt();
        int deB = avisos(e.tokenB(), e.comercioId()).get(0).path("id").asInt();
        assertTrue(deA != deB, "cada destinatario tiene su propia fila");
        data(con(put(NOTIFICACIONES + "/" + deA + "/leida"), e.tokenA(), null));
        assertEquals(0, contador(e.tokenA(), e.comercioId()));
        assertEquals(1, contador(e.tokenB(), e.comercioId()), "que A lo lea no cambia el de B");
        assertEquals(1, contador(e.tokenDueno(), e.comercioId()), "ni el del Dueño");
        mockMvc.perform(con(put(NOTIFICACIONES + "/" + deA + "/leida"), e.tokenB(), null)).andExpect(status().isNotFound());
        assertEquals(1, data(con(put(NOTIFICACIONES + "/leidas"), e.tokenB(), e.comercioId())).asInt());
        assertEquals(1, contador(e.tokenDueno(), e.comercioId()), "marcar todas de B no toca al Dueño");
    }

    @Test
    void repetirElProcesoNoDuplicaLosAvisos() throws Exception {
        Equipo e = equipo();
        int pedidoId = pedidoEnCamino(e.compradorId(), e.dueno(), 120);

        correrProceso();
        correrProceso();
        correrProceso();

        assertEquals(3, copiasDelTipo(T30, pedidoId));
        assertEquals(1, copiasDelTipo("PEDIDO_AUTOCONFIRMADO", pedidoId));
        assertEquals(1, jdbcTemplate.queryForObject("SELECT COUNT(*) FROM historial_estado_pedido WHERE pedido_id = ? AND estado = 'ENTREGADO'",
                Integer.class, pedidoId));
    }

    @Test
    void elClienteDelPedidoQueEsEmpleadoNoRecibeElAvisoDelEquipoPeroSiElDeComprador() throws Exception {
        Equipo e = equipo();
        int propio = pedidoEnCamino(e.a().id(), e.dueno(), 120);
        int ajeno = pedidoEnCamino(e.compradorId(), e.dueno(), 120);

        correrProceso();

        assertEquals(0, copias(e.a().id(), T30, propio));
        assertEquals(1, copias(e.a().id(), "PEDIDO_AUTOCONFIRMADO", propio), "como comprador sí recibe el suyo");
        assertEquals(1, copias(e.b().id(), T30, propio));
        assertEquals(1, copias(e.dueno().id(), T30, propio));
        assertEquals(1, copias(e.a().id(), T30, ajeno), "en el pedido de otro sí lo recibe");

        List<JsonNode> conComercio = avisos(e.tokenA(), e.comercioId());
        assertEquals(1, conComercio.size(), "con el comercio abierto: solo el del pedido ajeno");
        assertEquals(ajeno, conComercio.get(0).path("entidadId").asInt());
        List<JsonNode> personales = avisos(e.tokenA(), null);
        assertEquals(1, personales.size(), "sin header: solo el de comprador");
        assertEquals(propio, personales.get(0).path("entidadId").asInt());
        assertFalse(personales.get(0).path("mensaje").asText().contains("confirmó automáticamente"));
    }

    @Test
    void unEmpleadoQueSeSumaDespuesNoRecibeElAvisoAnterior() throws Exception {
        Equipo e = equipo();
        int pedidoId = pedidoEnCamino(e.compradorId(), e.dueno(), 120);

        correrProceso();

        Cuenta nuevo = datos.registrarClienteConCredenciales();
        datos.vincularEmpleado(nuevo.id(), e.comercioId(), "ACTIVO", LocalDateTime.now(clock));
        String tokenNuevo = login(nuevo);
        assertEquals(0, copias(nuevo.id(), T30, pedidoId));
        assertEquals(0, avisos(tokenNuevo, e.comercioId()).size());
        assertEquals(0, contador(tokenNuevo, e.comercioId()));
    }

    @Test
    void unEmpleadoDesactivadoNoRecibeElAvisoYRecibeElMismo404() throws Exception {
        Equipo e = equipo();
        jdbcTemplate.update("UPDATE empleado_comercio SET estado = 'INACTIVO', fecha_baja = NOW() WHERE empleado_id = ? AND comercio_id = ?",
                e.a().id(), e.comercioId());
        int pedidoId = pedidoEnCamino(e.compradorId(), e.dueno(), 120);

        correrProceso();

        assertEquals(0, copias(e.a().id(), T30, pedidoId));
        assertEquals(1, copias(e.b().id(), T30, pedidoId));
        mockMvc.perform(con(get(NOTIFICACIONES), e.tokenA(), e.comercioId())).andExpect(status().isNotFound());
    }

    @Test
    void cadaContextoVeSoloLosAvisosDeSuComercio() throws Exception {
        Equipo uno = equipo();
        Dueno otroDueno = datos.registrarDuenoAprobado();
        datos.cambiarEstadoUsuario(otroDueno.id(), "ACTIVO");
        datos.cambiarEstadoComercio(otroDueno.comercioId(), "APTO_VENTA");
        datos.vincularEmpleado(uno.a().id(), otroDueno.comercioId(), "ACTIVO", LocalDateTime.now(clock).minusDays(1));
        String tokenOtroDueno = login(otroDueno.nombreUsuario(), otroDueno.clave());
        int enUno = pedidoEnCamino(uno.compradorId(), uno.dueno(), 120);
        int enOtro = pedidoEnCamino(uno.compradorId(), otroDueno, 120);

        correrProceso();

        List<JsonNode> deUno = avisos(uno.tokenA(), uno.comercioId());
        List<JsonNode> deOtro = avisos(uno.tokenA(), otroDueno.comercioId());
        assertEquals(1, deUno.size());
        assertEquals(enUno, deUno.get(0).path("entidadId").asInt());
        assertEquals(1, deOtro.size());
        assertEquals(enOtro, deOtro.get(0).path("entidadId").asInt());
        assertEquals(0, avisos(uno.tokenA(), null).size(), "sin header: ninguno de los dos");
        assertEquals(1, avisos(tokenOtroDueno, otroDueno.comercioId()).size());
        assertEquals(1, avisos(uno.tokenDueno(), uno.comercioId()).size());
        mockMvc.perform(con(get(NOTIFICACIONES), uno.tokenB(), otroDueno.comercioId())).andExpect(status().isNotFound());
        assertEquals(0, copias(otroDueno.id(), T30, enUno));
        assertEquals(0, copias(uno.dueno().id(), T30, enOtro));
    }

    @Test
    void conElComercioSuspendidoElAvisoSeEmiteIgualYElEmpleadoLoVe() throws Exception {
        Equipo e = equipo();
        datos.cambiarEstadoComercio(e.comercioId(), "SUSPENDIDO");
        int pedidoId = pedidoEnCamino(e.compradorId(), e.dueno(), 120);

        correrProceso();

        assertEquals("ENTREGADO", estado(pedidoId));
        assertEquals(3, copiasDelTipo(T30, pedidoId));
        assertEquals(1, avisos(e.tokenA(), e.comercioId()).size());
    }

    @Test
    void elTextoTomaLosMinutosDeLaConfiguracionYNoUnNumeroFijo() throws Exception {
        Equipo e = equipo();
        long original = timeoutProperties.getAutoconfirmacionEnCaminoMinutos();
        timeoutProperties.setAutoconfirmacionEnCaminoMinutos(45);
        try {
            int pedidoId = pedidoEnCamino(e.compradorId(), e.dueno(), 50);

            correrProceso();

            assertEquals("ENTREGADO", estado(pedidoId));
            String texto = avisos(e.tokenDueno(), e.comercioId()).get(0).path("mensaje").asText();
            assertEquals("El pedido #" + pedidoId + " se confirmó automáticamente como entregado porque el cliente no respondió en 45 minutos.",
                    texto);
        } finally {
            timeoutProperties.setAutoconfirmacionEnCaminoMinutos(original);
        }
    }

    @Test
    void noSeEmiteAntesDeLosMinutosConfigurados() throws Exception {
        Equipo e = equipo();
        long antes = timeoutProperties.getAutoconfirmacionEnCaminoMinutos() - 5;
        int pedidoId = pedidoEnCamino(e.compradorId(), e.dueno(), antes);

        correrProceso();

        assertEquals("EN_CAMINO", estado(pedidoId));
        assertEquals(0, copiasDelTipo(T30, pedidoId));
        assertEquals(0, copiasDelTipo("PEDIDO_AUTOCONFIRMADO", pedidoId));
        assertEquals(1, copiasDelTipo("AVISO_75MIN_SIN_CONFIRMACION", pedidoId), "el aviso previo al Cliente sigue saliendo y no es T30");
    }

    @Test
    void laConfirmacionManualDelClienteNoEmiteElAvisoDelEquipo() throws Exception {
        Equipo e = equipo();
        int pedidoId = pedidoEnCamino(e.compradorId(), e.dueno(), 120);

        pedidoService.confirmarEntregaCliente(e.compradorId(), pedidoId);
        correrProceso();

        assertEquals("ENTREGADO", estado(pedidoId));
        assertEquals("CLIENTE", jdbcTemplate.queryForObject("SELECT fuente_entrega FROM pedido WHERE id = ?", String.class, pedidoId));
        assertEquals(0, copiasDelTipo(T30, pedidoId));
        assertEquals(0, copiasDelTipo("PEDIDO_AUTOCONFIRMADO", pedidoId));
    }

    @Test
    void elRetiroCerradoPorLaSuspensionDelComercioNoEmiteElAvisoDelEquipo() throws Exception {
        Equipo e = equipo();
        jdbcTemplate.update("INSERT INTO pedido (cliente_id, comercio_id, modalidad_entrega, estado, pago_estado, subtotal, "
                + "cargo_servicio_cliente, cargo_servicio_comercio, total, fecha_creacion, suspension_retiro_expira) "
                + "VALUES (?, ?, 'RETIRO', 'LISTO_PARA_RETIRAR', 'PAGADO', 10000, 200, 100, 10200, ?, ?)",
                e.compradorId(), e.comercioId(), LocalDateTime.now(clock).minusHours(6), LocalDateTime.now(clock).minusMinutes(5));
        int pedidoId = jdbcTemplate.queryForObject("SELECT LAST_INSERT_ID()", Integer.class);
        historial(pedidoId, "LISTO_PARA_RETIRAR", "DUENO", e.dueno().id(), 200);

        pedidoService.autoconfirmarRetirosPorSuspension(LocalDateTime.now(clock));

        assertEquals("NO_RETIRADO", estado(pedidoId));
        assertEquals(1, copiasDelTipo("PEDIDO_NO_RETIRADO", pedidoId));
        assertEquals(0, copiasDelTipo(T30, pedidoId));
    }
}
