package com.bajonea.backend.services;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.bajonea.backend.services.DatosPruebaEmpleado.Cuenta;
import com.bajonea.backend.services.DatosPruebaEmpleado.Dueno;
import com.fasterxml.jackson.databind.JsonNode;
import java.time.LocalDateTime;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

/**
 * {@code GET /api/v1/pedidos/comercio/resumen-turno} por HTTP real (login con JWT, filtros de seguridad, resolución de
 * {@code X-Comercio-Id}) contra {@code bajonea_test}: lo que ve el Dueño, lo que ve el Empleado, los pendientes de otro
 * turno, quién no puede entrar y que {@code resumen-hoy} ya no existe.
 */
@AutoConfigureMockMvc
class ResumenTurnoHttpIntegrationTest extends TurnoIntegrationBase {

    private static final String RESUMEN = "/api/v1/pedidos/comercio/resumen-turno";

    @Autowired
    private MockMvc mockMvc;

    private record Escena(Dueno dueno, String tokenDueno, Cuenta empleado, String tokenEmpleado, Cuenta cliente,
            String tokenCliente) {
    }

    private String login(String nombreUsuario, String clave) throws Exception {
        String cuerpo = mockMvc.perform(post("/api/v1/auth/login").contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("nombreUsuario", nombreUsuario, "password", clave))))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return objectMapper.readTree(cuerpo).path("data").path("token").asText();
    }

    private Escena escena() throws Exception {
        Dueno dueno = comercioSinHorarios();
        datos.cambiarEstadoUsuario(dueno.id(), "ACTIVO");
        Cuenta empleado = datos.registrarClienteConCredenciales();
        datos.vincularEmpleado(empleado.id(), dueno.comercioId(), "ACTIVO", LocalDateTime.now().minusDays(1));
        Cuenta cliente = datos.registrarClienteConCredenciales();
        return new Escena(dueno, login(dueno.nombreUsuario(), dueno.clave()), empleado,
                login(empleado.nombreUsuario(), empleado.clave()), cliente, login(cliente.nombreUsuario(), cliente.clave()));
    }

    private static MockHttpServletRequestBuilder con(MockHttpServletRequestBuilder request, String token, Integer comercioId) {
        MockHttpServletRequestBuilder conAuth = request.header("Authorization", "Bearer " + token);
        return comercioId == null ? conAuth : conAuth.header("X-Comercio-Id", comercioId);
    }

    private JsonNode cuerpo(ResultActions resultado) throws Exception {
        return objectMapper.readTree(resultado.andReturn().getResponse().getContentAsString());
    }

    private JsonNode resumen(String token, int comercioId) throws Exception {
        return cuerpo(mockMvc.perform(con(get(RESUMEN), token, comercioId)).andExpect(status().isOk())).path("data");
    }

    private int pagado(Dueno dueno, String estadoFinal, LocalDateTime instante) {
        int pedidoId = pedidoPendiente(dueno);
        if (instante == null) {
            pedidoService.confirmarPagoAprobado(pedidoId);
        } else {
            pedidoService.confirmarPagoAprobado(pedidoId, instante);
        }
        if (!"PENDIENTE_CONFIRMACION_COMERCIO".equals(estadoFinal)) {
            jdbcTemplate.update("UPDATE pedido SET estado = ? WHERE id = ?", estadoFinal, pedidoId);
        }
        return pedidoId;
    }

    @Test
    void elDuenoVeVendidoBrutoComisionYNetoDelTurnoEnCursoYTodosSusPendientes() throws Exception {
        Escena e = escena();
        horariosTodosLosDias(e.dueno().comercioId(), "00:00", "23:59");
        pagado(e.dueno(), "EN_PREPARACION", null);
        pagado(e.dueno(), "ENTREGADO", null);
        pagado(e.dueno(), "RECHAZADO", null);
        pagado(e.dueno(), "PENDIENTE_CONFIRMACION_COMERCIO", null);
        pagado(e.dueno(), "PENDIENTE_CONFIRMACION_COMERCIO", hoy().minusDays(1).atTime(20, 0));

        JsonNode data = resumen(e.tokenDueno(), e.dueno().comercioId());

        assertEquals("EN_CURSO", data.path("estado").asText());
        assertEquals(hoy().toString(), data.path("turno").path("fecha").asText());
        assertEquals(3000.0, data.path("vendido").asDouble());
        assertEquals(200.0, data.path("comision").asDouble());
        assertEquals(2800.0, data.path("neto").asDouble());
        assertEquals(4, data.path("cantidadPedidos").asInt());
        assertEquals(2, data.path("cantidadPendientes").asInt());
    }

    @Test
    void elEmpleadoVeElMismoVendidoYNuncaLaComisionNiElNeto() throws Exception {
        Escena e = escena();
        horariosTodosLosDias(e.dueno().comercioId(), "00:00", "23:59");
        pagado(e.dueno(), "EN_PREPARACION", null);
        pagado(e.dueno(), "ENTREGADO", null);

        JsonNode dueno = resumen(e.tokenDueno(), e.dueno().comercioId());
        JsonNode empleado = resumen(e.tokenEmpleado(), e.dueno().comercioId());

        assertEquals(dueno.path("vendido").asDouble(), empleado.path("vendido").asDouble());
        assertEquals(dueno.path("cantidadPedidos").asInt(), empleado.path("cantidadPedidos").asInt());
        assertEquals(dueno.path("cantidadPendientes").asInt(), empleado.path("cantidadPendientes").asInt());
        assertFalse(empleado.has("comision"));
        assertFalse(empleado.has("neto"));
        assertTrue(empleado.has("turno"));
    }

    @Test
    void sinHorariosElResumenEsSinTurnoConLosPendientes() throws Exception {
        Escena e = escena();
        pagado(e.dueno(), "PENDIENTE_CONFIRMACION_COMERCIO", null);

        JsonNode data = resumen(e.tokenDueno(), e.dueno().comercioId());

        assertEquals("SIN_TURNO", data.path("estado").asText());
        assertTrue(data.path("turno").isNull());
        assertEquals(0.0, data.path("vendido").asDouble());
        assertEquals(1, data.path("cantidadPendientes").asInt());
    }

    @Test
    void unClienteSinRelacionRecibe400SinHeaderY404ConHeader() throws Exception {
        Escena e = escena();

        mockMvc.perform(con(get(RESUMEN), e.tokenCliente(), null)).andExpect(status().isBadRequest());
        mockMvc.perform(con(get(RESUMEN), e.tokenCliente(), e.dueno().comercioId())).andExpect(status().isNotFound());
    }

    @Test
    void sinHeaderElDuenoRecibe400() throws Exception {
        Escena e = escena();

        mockMvc.perform(con(get(RESUMEN), e.tokenDueno(), null)).andExpect(status().isBadRequest());
    }

    @Test
    void laRutaViejaResumenHoyYaNoExiste() throws Exception {
        Escena e = escena();

        mockMvc.perform(con(get("/api/v1/pedidos/comercio/resumen-hoy"), e.tokenDueno(), e.dueno().comercioId()))
                .andExpect(status().is4xxClientError());
    }
}
