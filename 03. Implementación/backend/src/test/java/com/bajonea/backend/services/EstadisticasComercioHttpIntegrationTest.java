package com.bajonea.backend.services;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.bajonea.backend.services.DatosPruebaEmpleado.Cuenta;
import com.bajonea.backend.services.DatosPruebaEmpleado.Dueno;
import com.fasterxml.jackson.databind.JsonNode;
import java.time.LocalDate;
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
 * {@code GET /api/v1/comercios/estadisticas} por HTTP real (login con JWT, filtros de seguridad, resolución de
 * {@code X-Comercio-Id}) contra {@code bajonea_test}: quién entra, quién no y con qué código, los {@code 400} de los
 * parámetros y la forma de la respuesta.
 */
@AutoConfigureMockMvc
class EstadisticasComercioHttpIntegrationTest extends TurnoIntegrationBase {

    private static final String RUTA = "/api/v1/comercios/estadisticas";

    @Autowired
    private MockMvc mockMvc;

    private record Escena(Dueno dueno, String tokenDueno, Cuenta empleado, String tokenEmpleado, Cuenta cliente,
            String tokenCliente, String tokenAdministrador, Dueno otroDueno, String tokenOtroDueno) {
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
        Dueno otro = comercioSinHorarios();
        datos.cambiarEstadoUsuario(otro.id(), "ACTIVO");
        Cuenta empleado = datos.registrarClienteConCredenciales();
        datos.vincularEmpleado(empleado.id(), dueno.comercioId(), "ACTIVO", LocalDateTime.now().minusDays(1));
        Cuenta cliente = datos.registrarClienteConCredenciales();
        Cuenta administrador = datos.registrarClienteConCredenciales();
        datos.hacerAdministrador(administrador.id());
        jdbcTemplate.update("UPDATE usuario SET rol = 'ADMINISTRADOR' WHERE id = ?", administrador.id());
        return new Escena(dueno, login(dueno.nombreUsuario(), dueno.clave()), empleado,
                login(empleado.nombreUsuario(), empleado.clave()), cliente, login(cliente.nombreUsuario(), cliente.clave()),
                login(administrador.nombreUsuario(), administrador.clave()), otro, login(otro.nombreUsuario(), otro.clave()));
    }

    private static MockHttpServletRequestBuilder con(MockHttpServletRequestBuilder request, String token, Object comercioId) {
        MockHttpServletRequestBuilder conAuth = token == null ? request : request.header("Authorization", "Bearer " + token);
        return comercioId == null ? conAuth : conAuth.header("X-Comercio-Id", comercioId);
    }

    private ResultActions pedir(String token, Object comercioId, String desde, String hasta, String agrupar) throws Exception {
        MockHttpServletRequestBuilder request = get(RUTA);
        if (desde != null) {
            request = request.param("desde", desde);
        }
        if (hasta != null) {
            request = request.param("hasta", hasta);
        }
        if (agrupar != null) {
            request = request.param("agrupar", agrupar);
        }
        return mockMvc.perform(con(request, token, comercioId));
    }

    private JsonNode cuerpo(ResultActions resultado) throws Exception {
        return objectMapper.readTree(resultado.andReturn().getResponse().getContentAsString());
    }

    private String hoyTexto() {
        return hoy().toString();
    }

    @Test
    void elDuenoVeLaRespuestaConLaFormaDelContrato() throws Exception {
        Escena e = escena();
        LocalDate fecha = hoy().minusDays(1);
        int h = horario(e.dueno().comercioId(), fecha, "12:00", "15:00");
        int pedido = pedidoPendiente(e.dueno());
        pedidoService.confirmarPagoAprobado(pedido, fecha.atTime(13, 0));
        jdbcTemplate.update("UPDATE pedido SET estado = 'ENTREGADO' WHERE id = ?", pedido);

        JsonNode respuesta = cuerpo(pedir(e.tokenDueno(), e.dueno().comercioId(), fecha.toString(), hoyTexto(), "TURNO")
                .andExpect(status().isOk()));

        assertEquals("Estadísticas obtenidas correctamente", respuesta.path("mensaje").asText());
        JsonNode data = respuesta.path("data");
        assertEquals(fecha.toString(), data.path("desde").asText());
        assertEquals(hoyTexto(), data.path("hasta").asText());
        assertEquals("TURNO", data.path("agrupar").asText());
        JsonNode totales = data.path("totales");
        assertEquals(1, totales.path("pedidos").asInt());
        assertEquals(1, totales.path("facturados").asInt());
        assertEquals(1500.0, totales.path("vendido").asDouble());
        assertEquals(100.0, totales.path("comision").asDouble());
        assertEquals(1400.0, totales.path("neto").asDouble());
        assertEquals(1500.0, totales.path("ticketPromedio").asDouble());
        for (String categoria : new String[] {"ENTREGADO", "NO_RETIRADO", "RECHAZADO", "CANCELADO", "ANULADO", "EXPIRADO", "EN_CURSO"}) {
            assertTrue(totales.path("resultados").has(categoria), categoria);
        }
        assertEquals(1, totales.path("resultados").path("ENTREGADO").asInt());
        JsonNode periodo = data.path("periodos").get(0);
        assertEquals(fecha.toString(), periodo.path("fecha").asText());
        assertEquals(h, periodo.path("turno").path("horarioId").asInt());
        assertEquals(false, periodo.path("turno").path("cruzaMedianoche").asBoolean());
        assertEquals(1, periodo.path("pedidos").asInt());
    }

    @Test
    void sinAgruparSeAgrupaPorDiaYElPeriodoNoTrae() throws Exception {
        Escena e = escena();

        JsonNode data = cuerpo(pedir(e.tokenDueno(), e.dueno().comercioId(), hoy().minusDays(2).toString(), hoyTexto(), null)
                .andExpect(status().isOk())).path("data");

        assertEquals("DIA", data.path("agrupar").asText());
        assertEquals(3, data.path("periodos").size());
        assertTrue(data.path("periodos").get(0).path("turno").isNull());
    }

    @Test
    void elEmpleadoDeEseComercioRecibe403ConYSinHeader() throws Exception {
        Escena e = escena();

        pedir(e.tokenEmpleado(), e.dueno().comercioId(), hoyTexto(), hoyTexto(), "DIA").andExpect(status().isForbidden());
        pedir(e.tokenEmpleado(), null, hoyTexto(), hoyTexto(), "DIA").andExpect(status().isForbidden());
    }

    @Test
    void unClienteSinRelacionYElAdministradorReciben403() throws Exception {
        Escena e = escena();

        pedir(e.tokenCliente(), e.dueno().comercioId(), hoyTexto(), hoyTexto(), "DIA").andExpect(status().isForbidden());
        pedir(e.tokenAdministrador(), e.dueno().comercioId(), hoyTexto(), hoyTexto(), "DIA").andExpect(status().isForbidden());
        pedir(e.tokenAdministrador(), null, hoyTexto(), hoyTexto(), "DIA").andExpect(status().isForbidden());
    }

    @Test
    void sinTokenRecibe401() throws Exception {
        Escena e = escena();

        pedir(null, e.dueno().comercioId(), hoyTexto(), hoyTexto(), "DIA").andExpect(status().isUnauthorized());
        pedir("token-que-no-sirve", e.dueno().comercioId(), hoyTexto(), hoyTexto(), "DIA").andExpect(status().isUnauthorized());
    }

    @Test
    void elDuenoSinHeaderOConHeaderNoNumericoRecibe400() throws Exception {
        Escena e = escena();

        pedir(e.tokenDueno(), null, hoyTexto(), hoyTexto(), "DIA").andExpect(status().isBadRequest());
        pedir(e.tokenDueno(), "abc", hoyTexto(), hoyTexto(), "DIA").andExpect(status().isBadRequest());
    }

    @Test
    void unComercioDeOtroDuenoRecibe404YCadaDuenoVeLoSuyo() throws Exception {
        Escena e = escena();
        LocalDate fecha = hoy().minusDays(1);
        int h = horario(e.dueno().comercioId(), fecha, "12:00", "15:00");
        jdbcTemplate.update("INSERT INTO pedido (cliente_id, comercio_id, modalidad_entrega, estado, pago_estado, subtotal, "
                + "cargo_servicio_cliente, cargo_servicio_comercio, total, fecha_creacion, fecha_pago_confirmado, turno_fecha, "
                + "turno_horario_id) VALUES (?, ?, 'RETIRO', 'ENTREGADO', 'PAGADO', 1500, 200, 100, 1700, ?, ?, ?, ?)",
                datos.registrarCliente(), e.dueno().comercioId(), fecha.atTime(13, 0), fecha.atTime(13, 0), fecha, h);

        pedir(e.tokenOtroDueno(), e.dueno().comercioId(), fecha.toString(), fecha.toString(), "DIA").andExpect(status().isNotFound());
        JsonNode propio = cuerpo(pedir(e.tokenDueno(), e.dueno().comercioId(), fecha.toString(), fecha.toString(), "DIA")
                .andExpect(status().isOk())).path("data");
        JsonNode ajeno = cuerpo(pedir(e.tokenOtroDueno(), e.otroDueno().comercioId(), fecha.toString(), fecha.toString(), "DIA")
                .andExpect(status().isOk())).path("data");

        assertEquals(1, propio.path("totales").path("pedidos").asInt());
        assertEquals(0, ajeno.path("totales").path("pedidos").asInt());
    }

    @Test
    void losParametrosInvalidosDan400ConSuMensaje() throws Exception {
        Escena e = escena();
        int c = e.dueno().comercioId();
        String t = e.tokenDueno();
        LocalDate desde = hoy().minusDays(100);

        assertEquals("Indicá las fechas desde y hasta", cuerpo(pedir(t, c, null, hoyTexto(), "DIA")
                .andExpect(status().isBadRequest())).path("mensaje").asText());
        assertEquals("Indicá las fechas desde y hasta", cuerpo(pedir(t, c, hoyTexto(), null, "DIA")
                .andExpect(status().isBadRequest())).path("mensaje").asText());
        assertEquals("La fecha desde tiene que tener el formato AAAA-MM-DD", cuerpo(pedir(t, c, "05-10-2026", hoyTexto(), "DIA")
                .andExpect(status().isBadRequest())).path("mensaje").asText());
        assertEquals("La fecha desde no puede ser posterior a la fecha hasta", cuerpo(pedir(t, c, hoyTexto(), hoy().minusDays(1).toString(), "DIA")
                .andExpect(status().isBadRequest())).path("mensaje").asText());
        assertEquals("El rango no puede superar los 92 días", cuerpo(pedir(t, c, desde.toString(), hoy().minusDays(8).toString(), "DIA")
                .andExpect(status().isBadRequest())).path("mensaje").asText());
        assertEquals("La agrupación tiene que ser DIA o TURNO", cuerpo(pedir(t, c, hoyTexto(), hoyTexto(), "MES")
                .andExpect(status().isBadRequest())).path("mensaje").asText());
    }

    @Test
    void elRangoDe92DiasPasaYElDe93NoPorHttp() throws Exception {
        Escena e = escena();
        LocalDate hasta = hoy();

        pedir(e.tokenDueno(), e.dueno().comercioId(), hasta.minusDays(91).toString(), hasta.toString(), "DIA")
                .andExpect(status().isOk());
        pedir(e.tokenDueno(), e.dueno().comercioId(), hasta.minusDays(92).toString(), hasta.toString(), "DIA")
                .andExpect(status().isBadRequest());
    }
}
