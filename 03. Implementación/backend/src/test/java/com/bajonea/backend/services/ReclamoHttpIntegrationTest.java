package com.bajonea.backend.services;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.bajonea.backend.entities.Pedido;
import com.bajonea.backend.enums.RolUsuario;
import com.bajonea.backend.repositories.PedidoRepository;
import com.bajonea.backend.services.DatosPruebaEmpleado.Cuenta;
import com.bajonea.backend.services.DatosPruebaEmpleado.Dueno;
import com.fasterxml.jackson.databind.JsonNode;
import jakarta.persistence.EntityManagerFactory;
import java.time.LocalDateTime;
import java.util.List;
import org.hibernate.SessionFactory;
import org.hibernate.stat.Statistics;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * El contrato HTTP de Reclamos (Fase 5, tramo S5): códigos de estado, validaciones de los DTO, quién entra a cada ruta,
 * el bloque {@code reclamo} por rol (el Empleado no recibe nada), la bandeja, el contador del panel y que la bandeja y la
 * lista de pedidos no hagan una consulta por fila.
 */
class ReclamoHttpIntegrationTest extends ReclamoIntegrationBase {

    private static final String CLIENTE = "/api/v1/pedidos/cliente";
    private static final String ADMIN = "/api/v1/administrador/reclamos";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private EntityManagerFactory entityManagerFactory;

    @Autowired
    private ReclamoVistaService vistaService;

    @Autowired
    private PedidoRepository pedidoRepository;

    private static String cuerpoDeReclamo(String motivo, String descripcion) {
        return "{\"motivo\":" + (motivo == null ? "null" : "\"" + motivo + "\"") + ",\"descripcion\":\"" + descripcion + "\"}";
    }

    private MockHttpServletRequestBuilder json(MockHttpServletRequestBuilder request) {
        return request.contentType(MediaType.APPLICATION_JSON);
    }

    private JsonNode cuerpo(org.springframework.test.web.servlet.ResultActions accion) throws Exception {
        return objectMapper.readTree(accion.andReturn().getResponse().getContentAsString());
    }

    @Test
    void crearUnReclamoResponde201ConElBloque() throws Exception {
        Dueno dueno = duenoConCuenta();
        int cliente = datos.registrarCliente();
        int pedidoId = pedidoEntregado(cliente, dueno);

        mockMvc.perform(json(post(CLIENTE + "/" + pedidoId + "/reclamo").with(como(RolUsuario.CLIENTE, cliente)))
                        .content(cuerpoDeReclamo("FALTAN_PRODUCTOS", "Faltó la bebida del combo")))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.mensaje").value("Recibimos tu reclamo"))
                .andExpect(jsonPath("$.data.estado").value("PENDIENTE"))
                .andExpect(jsonPath("$.data.motivo").value("FALTAN_PRODUCTOS"))
                .andExpect(jsonPath("$.data.puedeReclamar").value(false));

        mockMvc.perform(json(post(CLIENTE + "/" + pedidoId + "/reclamo").with(como(RolUsuario.CLIENTE, cliente)))
                        .content(cuerpoDeReclamo("OTRO", "Otra vez el mismo pedido")))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.mensaje").value("Ya hiciste un reclamo por este pedido."));
    }

    @Test
    void lasValidacionesDelDtoDan400() throws Exception {
        Dueno dueno = duenoConCuenta();
        int cliente = datos.registrarCliente();
        int pedidoId = pedidoEntregado(cliente, dueno);
        String ruta = CLIENTE + "/" + pedidoId + "/reclamo";

        mockMvc.perform(json(post(ruta).with(como(RolUsuario.CLIENTE, cliente))).content(cuerpoDeReclamo(null, "Faltó la bebida del combo")))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.data.motivo").value("Elegí el motivo del reclamo"));
        mockMvc.perform(json(post(ruta).with(como(RolUsuario.CLIENTE, cliente))).content(cuerpoDeReclamo("OTRO", "corto")))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.data.descripcion").exists());
        mockMvc.perform(json(post(ruta).with(como(RolUsuario.CLIENTE, cliente))).content(cuerpoDeReclamo("OTRO", "   ")))
                .andExpect(status().isBadRequest());
        mockMvc.perform(json(post(ruta).with(como(RolUsuario.CLIENTE, cliente))).content(cuerpoDeReclamo("OTRO", "x".repeat(1001))))
                .andExpect(status().isBadRequest());
        mockMvc.perform(json(post(ruta).with(como(RolUsuario.CLIENTE, cliente))).content(cuerpoDeReclamo("NO_EXISTE", "Una descripción larga")))
                .andExpect(status().isBadRequest());
        mockMvc.perform(json(post(ruta).with(como(RolUsuario.CLIENTE, cliente))).content(cuerpoDeReclamo("OTRO", "x".repeat(1000))))
                .andExpect(status().isCreated());
    }

    @Test
    void quienEntraACadaRutaYLosCodigosDeError() throws Exception {
        Dueno dueno = duenoConCuenta();
        int cliente = datos.registrarCliente();
        int otro = datos.registrarCliente();
        int pedidoId = pedidoEntregado(cliente, dueno);
        String cuerpo = cuerpoDeReclamo("OTRO", "Una descripción suficiente");

        mockMvc.perform(json(post(CLIENTE + "/" + pedidoId + "/reclamo")).content(cuerpo)).andExpect(status().isUnauthorized());
        mockMvc.perform(json(post(CLIENTE + "/" + pedidoId + "/reclamo").with(como(RolUsuario.DUENO, dueno.id()))).content(cuerpo))
                .andExpect(status().isForbidden());
        mockMvc.perform(json(post(CLIENTE + "/" + pedidoId + "/reclamo").with(como(RolUsuario.ADMINISTRADOR, adminId()))).content(cuerpo))
                .andExpect(status().isForbidden());
        mockMvc.perform(json(post(CLIENTE + "/" + pedidoId + "/reclamo").with(como(RolUsuario.CLIENTE, otro))).content(cuerpo))
                .andExpect(status().isNotFound());
        mockMvc.perform(json(post(CLIENTE + "/999999999/reclamo").with(como(RolUsuario.CLIENTE, cliente))).content(cuerpo))
                .andExpect(status().isNotFound());

        mockMvc.perform(get(ADMIN).with(como(RolUsuario.CLIENTE, cliente))).andExpect(status().isForbidden());
        mockMvc.perform(get(ADMIN).with(como(RolUsuario.DUENO, dueno.id()))).andExpect(status().isForbidden());
        mockMvc.perform(get(ADMIN)).andExpect(status().isUnauthorized());
        mockMvc.perform(get(ADMIN + "/999999999").with(como(RolUsuario.ADMINISTRADOR, adminId()))).andExpect(status().isNotFound());
        mockMvc.perform(json(put(ADMIN + "/999999999/resolver").with(como(RolUsuario.ADMINISTRADOR, adminId())))
                .content("{\"tipo\":\"REEMBOLSO_TOTAL\"}")).andExpect(status().isNotFound());
        mockMvc.perform(json(put(ADMIN + "/1/resolver").with(como(RolUsuario.CLIENTE, cliente))).content("{\"tipo\":\"REEMBOLSO_TOTAL\"}"))
                .andExpect(status().isForbidden());
    }

    @Test
    void elReclamoFueraDePlazoDa409() throws Exception {
        Dueno dueno = duenoConCuenta();
        int cliente = datos.registrarCliente();
        int pedidoId = pedidoEntregado(cliente, dueno, "DOMICILIO", LocalDateTime.now().minusDays(8));

        mockMvc.perform(json(post(CLIENTE + "/" + pedidoId + "/reclamo").with(como(RolUsuario.CLIENTE, cliente)))
                        .content(cuerpoDeReclamo("OTRO", "Una descripción suficiente")))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.mensaje").value("Pasaron los 7 días para reclamar este pedido."));
    }

    @Test
    void laResolucionPorHttpValidaYResuelve() throws Exception {
        Dueno dueno = duenoConCuenta();
        int cliente = datos.registrarCliente();
        int pedidoId = pedidoEntregado(cliente, dueno);
        reclamar(cliente, pedidoId);
        String ruta = ADMIN + "/" + reclamoId(pedidoId) + "/resolver";

        mockMvc.perform(json(put(ruta).with(como(RolUsuario.ADMINISTRADOR, adminId()))).content("{}"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.data.tipo").exists());
        mockMvc.perform(json(put(ruta).with(como(RolUsuario.ADMINISTRADOR, adminId()))).content("{\"tipo\":\"REEMBOLSO_PARCIAL\",\"monto\":10.123}"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.data.monto").exists());
        mockMvc.perform(json(put(ruta).with(como(RolUsuario.ADMINISTRADOR, adminId()))).content("{\"tipo\":\"REEMBOLSO_PARCIAL\",\"monto\":1700}"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.data.monto").value("Para devolver todo, elegí reembolso total."));
        mockMvc.perform(json(put(ruta).with(como(RolUsuario.ADMINISTRADOR, adminId()))).content("{\"tipo\":\"RECHAZO\",\"motivo\":\"corto\"}"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.data.motivo").exists());
        mockMvc.perform(json(put(ruta).with(como(RolUsuario.ADMINISTRADOR, adminId()))).content("{\"tipo\":\"REEMBOLSO_PARCIAL\",\"monto\":700.5}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.mensaje").value("Reclamo resuelto"))
                .andExpect(jsonPath("$.data.estado").value("APROBADO"))
                .andExpect(jsonPath("$.data.montoAprobado").value(700.5))
                .andExpect(jsonPath("$.data.reembolso.estado").value("PROCESADO"));
        mockMvc.perform(json(put(ruta).with(como(RolUsuario.ADMINISTRADOR, adminId()))).content("{\"tipo\":\"REEMBOLSO_TOTAL\"}"))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.mensaje").value("Este reclamo ya fue resuelto."));
    }

    @Test
    void cadaRolVeSuBloqueYElEmpleadoNoVeNada() throws Exception {
        Dueno dueno = duenoConCuenta();
        int cliente = datos.registrarCliente();
        Cuenta empleado = datos.registrarClienteConCredenciales();
        datos.vincularEmpleado(empleado.id(), dueno.comercioId(), "ACTIVO", LocalDateTime.now().minusDays(1));
        int pedidoId = pedidoEntregado(cliente, dueno);
        llegoPagado(pedidoId);
        reclamar(cliente, pedidoId);
        resolverParcial(pedidoId, "100");
        String comercio = String.valueOf(dueno.comercioId());

        JsonNode delCliente = cuerpo(mockMvc.perform(get(CLIENTE).with(como(RolUsuario.CLIENTE, cliente))).andExpect(status().isOk()))
                .path("data").get(0).path("reclamo");
        assertEquals("APROBADO", delCliente.path("estado").asText());
        assertEquals("FALTAN_PRODUCTOS", delCliente.path("motivo").asText());
        assertEquals("REEMBOLSO_PARCIAL", delCliente.path("tipoResolucion").asText());
        assertEquals(100.0, delCliente.path("montoAprobado").asDouble());
        assertFalse(delCliente.path("puedeReclamar").asBoolean(true));
        assertFalse(delCliente.path("reembolsoEnProceso").asBoolean(true));
        assertTrue(delCliente.has("fechaLimiteReclamo"));

        JsonNode pedidoDueno = cuerpo(mockMvc.perform(get("/api/v1/pedidos/comercio").header("X-Comercio-Id", comercio)
                .with(como(RolUsuario.DUENO, dueno.id()))).andExpect(status().isOk())).path("data").get(0);
        JsonNode delDueno = pedidoDueno.path("reclamo");
        assertEquals("APROBADO", delDueno.path("estado").asText());
        assertEquals("REEMBOLSO_PARCIAL", delDueno.path("tipoResolucion").asText());
        assertEquals(100.0, delDueno.path("montoAprobado").asDouble());
        assertFalse(delDueno.has("descripcion"));
        assertFalse(delDueno.has("puedeReclamar"));
        assertFalse(delDueno.has("motivoRechazo"));
        assertFalse(pedidoDueno.has("reembolsoEstado") && !pedidoDueno.path("reembolsoEstado").isNull());

        JsonNode pedidoEmpleado = cuerpo(mockMvc.perform(get("/api/v1/pedidos/comercio").header("X-Comercio-Id", comercio)
                .with(como(RolUsuario.CLIENTE, empleado.id()))).andExpect(status().isOk())).path("data").get(0);
        assertFalse(pedidoEmpleado.has("reclamo"));
        assertEquals("SIN_REEMBOLSO", pedidoEmpleado.path("reembolsoEstado").asText());
        assertTrue(pedidoEmpleado.path("reembolsoMonto").isNull() || !pedidoEmpleado.has("reembolsoMonto"));
        assertFalse(pedidoEmpleado.toString().contains("RECLAMO"));
        assertFalse(pedidoEmpleado.toString().contains("REEMBOLSO_PARCIAL"));
    }

    @Test
    void laBandejaFiltraOrdenaYCuenta() throws Exception {
        Dueno dueno = duenoConCuenta();
        int cliente = datos.registrarCliente();
        int viejo = pedidoEntregado(cliente, dueno);
        int nuevo = pedidoEntregado(cliente, dueno);
        int aprobadoProcesado = pedidoEntregado(cliente, dueno);
        int aprobadoEnProceso = pedidoEntregado(cliente, dueno);
        int rechazado = pedidoEntregado(cliente, dueno);
        for (int pedido : new int[] {viejo, nuevo, aprobadoProcesado, aprobadoEnProceso, rechazado}) {
            reclamar(cliente, pedido);
        }
        jdbcTemplate.update("UPDATE reclamo SET fecha_creacion = fecha_creacion - INTERVAL 3 DAY WHERE pedido_id = ?", viejo);
        resolverTotal(aprobadoProcesado);
        org.mockito.Mockito.when(reembolsoClient.solicitarReembolsoParcial(org.mockito.ArgumentMatchers.anyString(),
                org.mockito.ArgumentMatchers.anyString(), org.mockito.ArgumentMatchers.anyString(), org.mockito.ArgumentMatchers.any()))
                .thenReturn(MercadoPagoReembolsoClient.ResultadoReembolsoMp.fallido("Mercado Pago respondió 500: x"));
        resolverParcial(aprobadoEnProceso, "100");
        rechazar(rechazado, "Un motivo bien claro y largo");

        JsonNode pendientes = bandeja("PENDIENTES", 0);
        java.util.Map<Integer, JsonNode> filaPorPedido = new java.util.HashMap<>();
        java.util.Map<Integer, Integer> posicionPorPedido = new java.util.HashMap<>();
        int posicion = 0;
        for (int pagina = 0; pagina < 100; pagina++) {
            JsonNode filas = bandeja("PENDIENTES", pagina).path("reclamos");
            if (filas.isEmpty()) {
                break;
            }
            for (JsonNode fila : filas) {
                assertEquals("PENDIENTE", fila.path("estado").asText());
                filaPorPedido.put(fila.path("pedidoId").asInt(), fila);
                posicionPorPedido.put(fila.path("pedidoId").asInt(), posicion++);
            }
        }
        assertTrue(posicionPorPedido.containsKey(viejo) && posicionPorPedido.containsKey(nuevo));
        assertTrue(posicionPorPedido.get(viejo) < posicionPorPedido.get(nuevo), "los más viejos van arriba");
        assertFalse(filaPorPedido.containsKey(aprobadoProcesado) || filaPorPedido.containsKey(rechazado));
        JsonNode primera = filaPorPedido.get(nuevo);
        assertEquals("FALTAN_PRODUCTOS", primera.path("motivo").asText());
        assertEquals(dueno.comercioId(), primera.path("comercioId").asInt());
        assertEquals(1700.0, primera.path("total").asDouble());
        assertTrue(primera.has("fechaCreacion"));
        assertTrue(pendientes.path("contadores").path("pendientes").asInt() >= 2);
        assertTrue(pendientes.path("contadores").path("reembolsoEnProceso").asInt() >= 1);
        assertTrue(pendientes.path("contadores").path("resueltos").asInt() >= 2);

        assertTrue(estaEnLaBandeja("REEMBOLSO_EN_PROCESO", aprobadoEnProceso));
        assertFalse(estaEnLaBandeja("REEMBOLSO_EN_PROCESO", aprobadoProcesado));
        assertTrue(estaEnLaBandeja("RESUELTOS", aprobadoProcesado));
        assertTrue(estaEnLaBandeja("RESUELTOS", rechazado));
        assertFalse(estaEnLaBandeja("RESUELTOS", aprobadoEnProceso));

        mockMvc.perform(get(ADMIN).param("filtro", "OTRO").with(como(RolUsuario.ADMINISTRADOR, adminId()))).andExpect(status().isBadRequest());
        mockMvc.perform(get(ADMIN).param("limite", "1").with(como(RolUsuario.ADMINISTRADOR, adminId())))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.reclamos.length()").value(1));
    }

    private JsonNode bandeja(String filtro, int pagina) throws Exception {
        return cuerpo(mockMvc.perform(get(ADMIN).param("filtro", filtro).param("limite", "200").param("pagina", String.valueOf(pagina))
                .with(como(RolUsuario.ADMINISTRADOR, adminId()))).andExpect(status().isOk())).path("data");
    }

    private boolean estaEnLaBandeja(String filtro, int pedidoId) throws Exception {
        for (int pagina = 0; pagina < 100; pagina++) {
            JsonNode filas = bandeja(filtro, pagina).path("reclamos");
            if (filas.isEmpty()) {
                return false;
            }
            for (JsonNode fila : filas) {
                if (fila.path("pedidoId").asInt() == pedidoId) {
                    return true;
                }
            }
        }
        return false;
    }

    @Test
    void elContadorDelPanelSumaLosPendientes() throws Exception {
        Dueno dueno = duenoConCuenta();
        int cliente = datos.registrarCliente();
        int pedidoId = pedidoEntregado(cliente, dueno);
        long antes = jdbcTemplate.queryForObject("SELECT COUNT(*) FROM reclamo WHERE estado = 'PENDIENTE'", Long.class);

        mockMvc.perform(get("/api/v1/administrador/metricas").with(como(RolUsuario.ADMINISTRADOR, adminId())))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.reclamosPendientes").value(antes));
        reclamar(cliente, pedidoId);
        mockMvc.perform(get("/api/v1/administrador/metricas").with(como(RolUsuario.ADMINISTRADOR, adminId())))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.reclamosPendientes").value(antes + 1));
        resolverTotal(pedidoId);
        mockMvc.perform(get("/api/v1/administrador/metricas").with(como(RolUsuario.ADMINISTRADOR, adminId())))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.reclamosPendientes").value(antes));
    }

    @Test
    void laBandejaYLasVistasPorRolNoHacenUnaConsultaPorFila() {
        Dueno dueno = duenoConCuenta();
        int cliente = datos.registrarCliente();
        Statistics estadisticas = entityManagerFactory.unwrap(SessionFactory.class).getStatistics();
        estadisticas.setStatisticsEnabled(true);

        reclamosNuevos(dueno, cliente, 2);
        long consultasConDos = consultasDeLasDosListas(cliente);
        reclamosNuevos(dueno, cliente, 12);
        long consultasConCatorce = consultasDeLasDosListas(cliente);

        assertEquals(consultasConDos, consultasConCatorce, "las consultas no dependen de la cantidad de reclamos");
    }

    private void reclamosNuevos(Dueno dueno, int cliente, int cantidad) {
        for (int i = 0; i < cantidad; i++) {
            int pedidoId = pedidoEntregado(cliente, dueno);
            detalle(pedidoId, producto(dueno));
            reclamar(cliente, pedidoId);
        }
    }

    private long consultasDeLasDosListas(int cliente) {
        Statistics estadisticas = entityManagerFactory.unwrap(SessionFactory.class).getStatistics();
        TransactionTemplate lectura = new TransactionTemplate(transactionManager);
        lectura.setReadOnly(true);
        List<Pedido> pedidos = lectura.execute(estado -> pedidoRepository.findByClienteId(cliente));
        estadisticas.clear();
        reclamoAdmin.listar(ReclamoAdminService.FiltroBandeja.PENDIENTES, 200, 0);
        lectura.execute(estado -> {
            vistaService.paraCliente(pedidos);
            vistaService.paraDueno(pedidos);
            return null;
        });
        return estadisticas.getPrepareStatementCount();
    }
}
