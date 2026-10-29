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

import com.bajonea.backend.dto.request.SuspensionComercioRequestDTO;
import com.bajonea.backend.services.DatosPruebaEmpleado.Cuenta;
import com.bajonea.backend.services.DatosPruebaEmpleado.Dueno;
import com.bajonea.backend.services.MercadoPagoReembolsoClient.ResultadoReembolsoMp;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
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
 * Avisos del comercio con fan-out al equipo (E3, bloque A4) por HTTP real —login con JWT, filtros, resolución de
 * {@code X-Comercio-Id}— y por los servicios, contra {@code bajonea_test} con datos confirmados de verdad. Cubre una
 * copia por destinatario, lectura individual, que quien se suma ve solo lo posterior, que un desactivado deja de
 * recibir y de ver, que los avisos de administración no llegan a los Empleados, la separación por comercio de un
 * Dueño de varios y el 404 de un Cliente ajeno. Las carreras están en
 * {@link NotificacionesEquipoConcurrenciaIntegrationTest}.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class NotificacionesEquipoIntegrationTest {

    private static final String HEADER = "X-Comercio-Id";
    private static final String NOTIFICACIONES = "/api/v1/notificaciones";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private RegistroService registroService;

    @Autowired
    private PedidoService pedidoService;

    @Autowired
    private SuspensionComercioService suspensionComercioService;

    @Autowired
    private TestSupportService testSupportService;

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
                .thenReturn(ResultadoReembolsoMp.exito("refund-a4"));
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
        datos.vincularEmpleado(a.id(), dueno.comercioId(), "ACTIVO", LocalDateTime.now().minusDays(2));
        datos.vincularEmpleado(b.id(), dueno.comercioId(), "ACTIVO", LocalDateTime.now().minusDays(1));
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

    private List<Integer> ids(String token, Integer comercioId) throws Exception {
        List<Integer> ids = new ArrayList<>();
        for (JsonNode item : data(con(get(NOTIFICACIONES), token, comercioId))) {
            ids.add(item.path("id").asInt());
        }
        return ids;
    }

    private List<String> mensajes(String token, Integer comercioId) throws Exception {
        List<String> mensajes = new ArrayList<>();
        for (JsonNode item : data(con(get(NOTIFICACIONES), token, comercioId))) {
            mensajes.add(item.path("mensaje").asText());
        }
        return mensajes;
    }

    private long contador(String token, Integer comercioId) throws Exception {
        return data(con(get(NOTIFICACIONES + "/no-leidas/contador"), token, comercioId)).asLong();
    }

    private int pedidoPorPagar(int clienteId, int comercioId) {
        jdbcTemplate.update("INSERT INTO pedido (cliente_id, comercio_id, modalidad_entrega, estado, pago_estado, subtotal, "
                + "cargo_servicio_cliente, cargo_servicio_comercio, total, fecha_creacion) "
                + "VALUES (?, ?, 'RETIRO', 'PENDIENTE_PAGO', 'PENDIENTE', 10000, 200, 100, 10200, ?)",
                clienteId, comercioId, LocalDateTime.now().minusMinutes(2));
        int id = jdbcTemplate.queryForObject("SELECT LAST_INSERT_ID()", Integer.class);
        historial(id, "PENDIENTE_PAGO", "CLIENTE", clienteId, 2);
        return id;
    }

    private int pedidoPagadoSinResponder(int clienteId, int comercioId, int minutosEsperando) {
        jdbcTemplate.update("INSERT INTO pedido (cliente_id, comercio_id, modalidad_entrega, estado, pago_estado, subtotal, "
                + "cargo_servicio_cliente, cargo_servicio_comercio, total, fecha_creacion) "
                + "VALUES (?, ?, 'RETIRO', 'PENDIENTE_CONFIRMACION_COMERCIO', 'PAGADO', 10000, 200, 100, 10200, ?)",
                clienteId, comercioId, LocalDateTime.now().minusMinutes(minutosEsperando + 5));
        int id = jdbcTemplate.queryForObject("SELECT LAST_INSERT_ID()", Integer.class);
        historial(id, "PENDIENTE_CONFIRMACION_COMERCIO", "SISTEMA", null, minutosEsperando);
        jdbcTemplate.update("INSERT INTO pago (pedido_id, monto, mp_estado, id_transaccion_mp, fecha_creacion, fecha_confirmacion) "
                + "VALUES (?, 10200, 'approved', ?, NOW(), NOW())", id, "a4-" + id);
        return id;
    }

    private int pedidoPagado(int clienteId, int comercioId) {
        int pedidoId = pedidoPorPagar(clienteId, comercioId);
        pedidoService.confirmarPagoAprobado(pedidoId);
        return pedidoId;
    }

    private void historial(int pedidoId, String estado, String actorRol, Integer actorUsuarioId, int minutosAtras) {
        jdbcTemplate.update("INSERT INTO historial_estado_pedido (pedido_id, estado, actor_rol, actor_usuario_id, fecha_hora) VALUES (?, ?, ?, ?, ?)",
                pedidoId, estado, actorRol, actorUsuarioId, LocalDateTime.now().minusMinutes(minutosAtras));
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

    private void desactivar(int empleadoId, int comercioId) {
        jdbcTemplate.update("UPDATE empleado_comercio SET estado = 'INACTIVO', fecha_baja = NOW() WHERE empleado_id = ? AND comercio_id = ?",
                empleadoId, comercioId);
    }

    @Test
    void unPedidoPagadoGeneraUnaCopiaPorDuenoYEmpleadoConSuComercioYLaLecturaEsIndividual() throws Exception {
        Equipo e = equipo();

        int pedidoId = pedidoPagado(e.compradorId(), e.comercioId());

        for (int usuario : new int[] {e.dueno().id(), e.a().id(), e.b().id()}) {
            assertEquals(1, copias(usuario, "NUEVO_PEDIDO", pedidoId), "una copia para " + usuario);
        }
        assertEquals(3, copiasDelTipo("NUEVO_PEDIDO", pedidoId));
        assertEquals(0, copias(e.compradorId(), "NUEVO_PEDIDO", pedidoId), "el comprador no recibe el aviso del equipo");
        assertEquals(3, jdbcTemplate.queryForObject("SELECT COUNT(*) FROM notificacion WHERE entidad_tipo = 'PEDIDO' AND entidad_id = ? "
                + "AND tipo = 'NUEVO_PEDIDO' AND comercio_id = ? AND canal = 'PUSH' AND leida = 0", Integer.class, pedidoId, e.comercioId()));

        assertEquals(1, ids(e.tokenA(), e.comercioId()).size());
        assertEquals(1, contador(e.tokenA(), e.comercioId()));
        assertEquals(1, contador(e.tokenB(), e.comercioId()));
        assertEquals(1, contador(e.tokenDueno(), e.comercioId()));

        int deA = ids(e.tokenA(), e.comercioId()).get(0);
        int deB = ids(e.tokenB(), e.comercioId()).get(0);
        assertTrue(deA != deB, "cada destinatario tiene su propia fila");
        data(con(put(NOTIFICACIONES + "/" + deA + "/leida"), e.tokenA(), null));

        assertEquals(0, contador(e.tokenA(), e.comercioId()));
        assertEquals(1, contador(e.tokenB(), e.comercioId()), "que A lo lea no cambia el de B");
        assertEquals(1, contador(e.tokenDueno(), e.comercioId()), "ni el del Dueño");
        mockMvc.perform(con(put(NOTIFICACIONES + "/" + deA + "/leida"), e.tokenB(), null)).andExpect(status().isNotFound());

        assertEquals(1, data(con(put(NOTIFICACIONES + "/leidas"), e.tokenB(), e.comercioId())).asInt());
        assertEquals(0, data(con(put(NOTIFICACIONES + "/leidas"), e.tokenB(), e.comercioId())).asInt(), "idempotente");
        assertEquals(1, contador(e.tokenDueno(), e.comercioId()), "marcar todas de B no toca al Dueño");
        assertEquals(1, ids(e.tokenB(), e.comercioId()).size(), "las leídas siguen en la lista");
        assertEquals(deB, ids(e.tokenB(), e.comercioId()).get(0));
    }

    @Test
    void elClienteDelPedidoQueEsEmpleadoNoRecibeElAvisoDelEquipoSoloLosDeComprador() throws Exception {
        Equipo e = equipo();

        int propio = pedidoPagado(e.a().id(), e.comercioId());

        assertEquals(0, copias(e.a().id(), "NUEVO_PEDIDO", propio));
        assertEquals(1, copias(e.b().id(), "NUEVO_PEDIDO", propio));
        assertEquals(1, copias(e.dueno().id(), "NUEVO_PEDIDO", propio));
        assertEquals(0, contador(e.tokenA(), e.comercioId()));

        int ajeno = pedidoPagado(e.compradorId(), e.comercioId());
        assertEquals(1, copias(e.a().id(), "NUEVO_PEDIDO", ajeno));
        assertEquals(1, contador(e.tokenA(), e.comercioId()));
    }

    @Test
    void losAvisosDeCompradorDelEmpleadoNoSeMezclanConLosDelComercioNiAlReves() throws Exception {
        Equipo e = equipo();
        int propio = pedidoPagadoSinResponder(e.a().id(), e.comercioId(), 5);
        pedidoService.cancelarPedido(e.a().id(), propio);
        int comoCompradorExpirado = pedidoPagadoSinResponder(e.a().id(), e.comercioId(), 31);
        pedidoService.expirarPedidosSinRespuestaComercio(LocalDateTime.now());
        int deLosDemas = pedidoPagado(e.compradorId(), e.comercioId());

        assertEquals(1, copias(e.a().id(), "PEDIDO_EXPIRADO_CLIENTE", comoCompradorExpirado), "como comprador recibe el suyo");
        assertEquals(0, copias(e.a().id(), "PEDIDO_EXPIRADO_COMERCIO", comoCompradorExpirado), "y no el del equipo de su propio pedido");
        assertEquals(1, copias(e.b().id(), "PEDIDO_EXPIRADO_COMERCIO", comoCompradorExpirado));

        List<String> conComercio = mensajes(e.tokenA(), e.comercioId());
        assertEquals(1, conComercio.size(), "con el comercio abierto: solo el aviso del equipo del pedido ajeno: " + conComercio);
        assertTrue(conComercio.get(0).contains("Nuevo pedido recibido"));
        assertEquals(1, copias(e.a().id(), "NUEVO_PEDIDO", deLosDemas));

        List<String> personales = mensajes(e.tokenA(), null);
        assertEquals(1, personales.size(), "sin header: solo el de comprador (la cancelación propia no emite aviso al comprador): " + personales);
        assertTrue(personales.get(0).contains("no respondió"), personales.get(0));
        assertFalse(personales.get(0).contains("Nuevo pedido recibido"));
        assertEquals(1, contador(e.tokenA(), null));
        assertEquals(1, contador(e.tokenA(), e.comercioId()));
    }

    @Test
    void unEmpleadoQueSeSumaVeSoloLosAvisosPosterioresAsuAlta() throws Exception {
        Equipo e = equipo();
        int anterior = pedidoPagado(e.compradorId(), e.comercioId());

        Cuenta c = datos.registrarClienteConCredenciales();
        datos.vincularEmpleado(c.id(), e.comercioId(), "ACTIVO", LocalDateTime.now());
        String tokenC = login(c);
        assertEquals(0, ids(tokenC, e.comercioId()).size());
        assertEquals(0, copias(c.id(), "NUEVO_PEDIDO", anterior));

        int posterior = pedidoPagado(e.compradorId(), e.comercioId());

        assertEquals(1, copias(c.id(), "NUEVO_PEDIDO", posterior));
        assertEquals(1, ids(tokenC, e.comercioId()).size());
        assertEquals(1, contador(tokenC, e.comercioId()));
        assertEquals(2, ids(e.tokenA(), e.comercioId()).size());
    }

    @Test
    void unEmpleadoDesactivadoDejaDeRecibirYDeVerYRecibeElMismo404() throws Exception {
        Equipo e = equipo();
        int primero = pedidoPagado(e.compradorId(), e.comercioId());
        int viejoDeA = ids(e.tokenA(), e.comercioId()).get(0);

        desactivar(e.a().id(), e.comercioId());
        int segundo = pedidoPagado(e.compradorId(), e.comercioId());

        assertEquals(0, copias(e.a().id(), "NUEVO_PEDIDO", segundo), "desactivado: no recibe avisos nuevos");
        assertEquals(1, copias(e.b().id(), "NUEVO_PEDIDO", segundo));
        mockMvc.perform(con(get(NOTIFICACIONES), e.tokenA(), e.comercioId())).andExpect(status().isNotFound());
        mockMvc.perform(con(get(NOTIFICACIONES + "/no-leidas/contador"), e.tokenA(), e.comercioId())).andExpect(status().isNotFound());
        mockMvc.perform(con(put(NOTIFICACIONES + "/leidas"), e.tokenA(), e.comercioId())).andExpect(status().isNotFound());
        mockMvc.perform(con(put(NOTIFICACIONES + "/" + viejoDeA + "/leida"), e.tokenA(), null)).andExpect(status().isNotFound());
        assertEquals(0, jdbcTemplate.queryForObject("SELECT leida FROM notificacion WHERE id = ?", Integer.class, viejoDeA),
                "el 404 no marcó nada");
        assertEquals(1, copias(e.a().id(), "NUEVO_PEDIDO", primero), "lo anterior sigue guardado hasta el purgado de la reactivación");
    }

    @Test
    void laSuspensionDelComercioLlegaAlDuenoConMotivoYALosEmpleadosSinMotivo() throws Exception {
        Equipo e = equipo();
        Cuenta administrador = datos.registrarClienteConCredenciales();
        datos.hacerAdministrador(administrador.id());

        suspensionComercioService.suspender(e.comercioId(), administrador.id(),
                new SuspensionComercioRequestDTO("Prueba de suspension A4 con el motivo"));

        assertEquals(1, jdbcTemplate.queryForObject("SELECT COUNT(*) FROM notificacion WHERE usuario_id = ? AND tipo = 'COMERCIO_SUSPENDIDO' "
                + "AND comercio_id = ? AND entidad_tipo = 'COMERCIO' AND entidad_id = ?", Integer.class, e.dueno().id(), e.comercioId(), e.comercioId()));
        for (int empleado : new int[] {e.a().id(), e.b().id()}) {
            assertEquals(0, jdbcTemplate.queryForObject("SELECT COUNT(*) FROM notificacion WHERE usuario_id = ? AND tipo = 'COMERCIO_SUSPENDIDO'",
                    Integer.class, empleado), "el Empleado no recibe el aviso del Dueño");
            assertEquals(1, jdbcTemplate.queryForObject("SELECT COUNT(*) FROM notificacion WHERE usuario_id = ? "
                    + "AND tipo = 'COMERCIO_SUSPENDIDO_EQUIPO' AND comercio_id = ? AND canal = 'PUSH'", Integer.class, empleado, e.comercioId()));
            assertEquals(0, jdbcTemplate.queryForObject("SELECT COUNT(*) FROM notificacion WHERE usuario_id = ? AND canal = 'EMAIL'",
                    Integer.class, empleado), "los Empleados no reciben email");
        }
        List<String> delEmpleado = mensajes(e.tokenA(), e.comercioId());
        assertEquals(1, delEmpleado.size());
        assertTrue(!delEmpleado.get(0).contains("Prueba de suspension A4"), "el Empleado nunca ve el motivo");
        assertEquals(1, ids(e.tokenDueno(), e.comercioId()).size());
        assertTrue(mensajes(e.tokenDueno(), e.comercioId()).get(0).contains("Prueba de suspension A4 con el motivo"));
    }

    @Test
    void unDuenoDeVariosComerciosVeSoloLosAvisosDelComercioAbiertoYElEmpleadoDeAmbosTambien() throws Exception {
        Equipo e = equipo();
        int segundoComercio = testSupportService.clonarComercio(e.comercioId(), "Segundo comercio A4 " + DatosPruebaEmpleado.sufijo(), com.bajonea.backend.enums.EstadoComercio.APTO_VENTA);
        datos.vincularEmpleado(e.a().id(), segundoComercio, "ACTIVO", LocalDateTime.now().minusDays(1));

        int enPrimero = pedidoPagado(e.compradorId(), e.comercioId());
        int enSegundo = pedidoPagado(e.compradorId(), segundoComercio);

        assertEquals(1, ids(e.tokenDueno(), e.comercioId()).size());
        assertEquals(1, ids(e.tokenDueno(), segundoComercio).size());
        assertEquals(1, contador(e.tokenDueno(), e.comercioId()));
        assertEquals(1, contador(e.tokenDueno(), segundoComercio));
        assertEquals(1, copias(e.dueno().id(), "NUEVO_PEDIDO", enPrimero));
        assertEquals(1, copias(e.dueno().id(), "NUEVO_PEDIDO", enSegundo));
        assertEquals(1, ids(e.tokenA(), e.comercioId()).size(), "A ve en cada comercio el aviso de ese comercio");
        assertEquals(1, ids(e.tokenA(), segundoComercio).size());
        assertEquals(1, ids(e.tokenB(), e.comercioId()).size());
        mockMvc.perform(con(get(NOTIFICACIONES), e.tokenB(), segundoComercio)).andExpect(status().isNotFound());

        assertEquals(1, data(con(put(NOTIFICACIONES + "/leidas"), e.tokenDueno(), segundoComercio)).asInt());
        assertEquals(1, contador(e.tokenDueno(), e.comercioId()), "marcar el segundo no toca el primero");
        assertEquals(1, contador(e.tokenA(), segundoComercio));
    }

    @Test
    void unClienteConElHeaderDeUnComercioAjenoRecibe404YSinHeaderMarcarTodasDa400() throws Exception {
        Equipo e = equipo();
        Cuenta ajeno = datos.registrarClienteConCredenciales();
        String tokenAjeno = login(ajeno);
        pedidoPagado(e.compradorId(), e.comercioId());

        mockMvc.perform(con(get(NOTIFICACIONES), tokenAjeno, e.comercioId())).andExpect(status().isNotFound());
        mockMvc.perform(con(get(NOTIFICACIONES + "/no-leidas/contador"), tokenAjeno, e.comercioId())).andExpect(status().isNotFound());
        mockMvc.perform(con(put(NOTIFICACIONES + "/leidas"), tokenAjeno, e.comercioId())).andExpect(status().isNotFound());
        mockMvc.perform(con(put(NOTIFICACIONES + "/leidas"), tokenAjeno, null)).andExpect(status().isBadRequest());
        mockMvc.perform(con(put(NOTIFICACIONES + "/leidas"), e.tokenA(), null)).andExpect(status().isBadRequest());
        mockMvc.perform(con(put(NOTIFICACIONES + "/leidas"), e.tokenA(), 99999999)).andExpect(status().isNotFound());
        assertEquals(List.of(), mensajes(tokenAjeno, null));
        assertEquals(0, contador(tokenAjeno, null));
    }

    @Test
    void laCancelacionDelClienteYLaExpiracionAvisanAlEquipoYElClienteRecibeElSuyoSinComercio() throws Exception {
        Equipo e = equipo();
        int aCancelar = pedidoPagadoSinResponder(e.compradorId(), e.comercioId(), 5);
        int aExpirar = pedidoPagadoSinResponder(e.compradorId(), e.comercioId(), 31);

        pedidoService.cancelarPedido(e.compradorId(), aCancelar);
        pedidoService.expirarPedidosSinRespuestaComercio(LocalDateTime.now());

        for (int usuario : new int[] {e.dueno().id(), e.a().id(), e.b().id()}) {
            assertEquals(1, copias(usuario, "PEDIDO_CANCELADO_CLIENTE", aCancelar));
            assertEquals(1, copias(usuario, "PEDIDO_EXPIRADO_COMERCIO", aExpirar));
        }
        assertEquals(0, copias(e.compradorId(), "PEDIDO_CANCELADO_CLIENTE", aCancelar));
        assertEquals(1, copias(e.compradorId(), "PEDIDO_EXPIRADO_CLIENTE", aExpirar));
        assertEquals(1, jdbcTemplate.queryForObject("SELECT COUNT(*) FROM notificacion WHERE usuario_id = ? AND tipo = 'PEDIDO_EXPIRADO_CLIENTE' "
                + "AND comercio_id IS NULL", Integer.class, e.compradorId()));
        assertEquals(2, ids(e.tokenB(), e.comercioId()).size());
    }

    @Test
    void elMismoEventoRepetidoNoDuplicaCopias() throws Exception {
        Equipo e = equipo();
        int pedidoId = pedidoPorPagar(e.compradorId(), e.comercioId());

        pedidoService.confirmarPagoAprobado(pedidoId);
        pedidoService.confirmarPagoAprobado(pedidoId);
        pedidoService.confirmarPagoAprobado(pedidoId);

        assertEquals(3, copiasDelTipo("NUEVO_PEDIDO", pedidoId));
        int aCancelar = pedidoPagadoSinResponder(e.compradorId(), e.comercioId(), 5);
        pedidoService.cancelarPedido(e.compradorId(), aCancelar);
        org.junit.jupiter.api.Assertions.assertThrows(com.bajonea.backend.exceptions.ConflictoDeNegocioException.class,
                () -> pedidoService.cancelarPedido(e.compradorId(), aCancelar));
        assertEquals(3, copiasDelTipo("PEDIDO_CANCELADO_CLIENTE", aCancelar));
    }

    @Test
    void elListadoMisComerciosDelEmpleadoTraeSuContadorRealDeNoLeidas() throws Exception {
        Equipo e = equipo();
        pedidoPagado(e.compradorId(), e.comercioId());
        pedidoPagado(e.compradorId(), e.comercioId());

        JsonNode comercios = data(con(get("/api/v1/empleados/mis-comercios"), e.tokenA(), null));
        assertEquals(1, comercios.size());
        assertEquals(2, comercios.get(0).path("cantidadNotificacionesNoLeidas").asInt());

        data(con(put(NOTIFICACIONES + "/leidas"), e.tokenA(), e.comercioId()));
        comercios = data(con(get("/api/v1/empleados/mis-comercios"), e.tokenA(), null));
        assertEquals(0, comercios.get(0).path("cantidadNotificacionesNoLeidas").asInt());
        comercios = data(con(get("/api/v1/comercios/mis-comercios"), e.tokenDueno(), null));
        assertEquals(2, comercios.get(0).path("cantidadNotificacionesNoLeidas").asInt());
    }
}
