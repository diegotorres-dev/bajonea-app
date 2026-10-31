package com.bajonea.backend.services;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.bajonea.backend.enums.EstadoComercio;
import com.bajonea.backend.services.DatosPruebaEmpleado.Cuenta;
import com.bajonea.backend.services.DatosPruebaEmpleado.Dueno;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.ArrayList;
import java.util.LinkedHashMap;
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

/**
 * El listado general del Administrador ({@code GET /api/v1/administrador/comercios}) devuelve todos los comercios
 * en cualquier estado, con su estado, por id ascendente y sin datos de Dueño ni de otros comercios, contra
 * {@code bajonea_test}. Las pantallas de solicitudes ({@code /comercios/pendientes} y {@code /resolicitudes}) no
 * cambian.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class AdministradorListadoComerciosIntegrationTest {

    @Autowired
    private RegistroService registroService;

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private ObjectMapper objectMapper;

    @MockitoBean
    private EmailService emailService;

    private DatosPruebaEmpleado datos;
    private final Map<EstadoComercio, Dueno> duenoPorEstado = new LinkedHashMap<>();

    @BeforeEach
    void preparar() {
        datos = new DatosPruebaEmpleado(registroService, objectMapper, jdbcTemplate);
        duenoPorEstado.clear();
        for (EstadoComercio estado : EstadoComercio.values()) {
            Dueno dueno = datos.registrarDuenoAprobado();
            datos.cambiarEstadoUsuario(dueno.id(), "ACTIVO");
            datos.cambiarEstadoComercio(dueno.comercioId(), estado.name());
            duenoPorEstado.put(estado, dueno);
        }
    }

    private String loginDe(String nombreUsuario, String clave) throws Exception {
        String cuerpo = mockMvc.perform(post("/api/v1/auth/login").contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("nombreUsuario", nombreUsuario, "password", clave))))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return objectMapper.readTree(cuerpo).path("data").path("token").asText();
    }

    private String tokenAdministrador() throws Exception {
        Cuenta administrador = datos.registrarClienteConCredenciales();
        datos.hacerAdministrador(administrador.id());
        jdbcTemplate.update("UPDATE usuario SET rol = 'ADMINISTRADOR' WHERE id = ?", administrador.id());
        return loginDe(administrador.nombreUsuario(), administrador.clave());
    }

    private ResultActions listar(String token) throws Exception {
        var request = get("/api/v1/administrador/comercios");
        if (token != null) {
            request = request.header("Authorization", "Bearer " + token);
        }
        return mockMvc.perform(request);
    }

    private JsonNode listado(String token) throws Exception {
        String cuerpo = listar(token).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        return objectMapper.readTree(cuerpo).path("data");
    }

    private JsonNode fila(JsonNode listado, int comercioId) {
        for (JsonNode comercio : listado) {
            if (comercio.path("id").asInt() == comercioId) {
                return comercio;
            }
        }
        return null;
    }

    @Test
    void elListadoTraeUnComercioPorCadaEstadoPosibleConSuEstado() throws Exception {
        JsonNode comercios = listado(tokenAdministrador());

        assertEquals(8, EstadoComercio.values().length, "si se agrega un estado, el listado y la pantalla tienen que contemplarlo");
        for (Map.Entry<EstadoComercio, Dueno> entrada : duenoPorEstado.entrySet()) {
            JsonNode fila = fila(comercios, entrada.getValue().comercioId());
            assertTrue(fila != null, "falta el comercio en estado " + entrada.getKey());
            assertEquals(entrada.getKey().name(), fila.path("estado").asText());
            assertEquals(entrada.getValue().nombreComercio(), fila.path("nombre").asText());
        }
    }

    @Test
    void elListadoTraeTantosComerciosComoHayEnLaBaseSinImportarElEstado() throws Exception {
        JsonNode comercios = listado(tokenAdministrador());

        Integer enLaBase = jdbcTemplate.queryForObject("SELECT COUNT(*) FROM comercio", Integer.class);
        assertEquals(enLaBase, comercios.size());
    }

    @Test
    void unComercioConCierreManualOCerradoTemporalmenteAparece() throws Exception {
        Dueno manual = duenoPorEstado.get(EstadoComercio.APTO_VENTA);
        jdbcTemplate.update("UPDATE comercio SET cerrado_manualmente = 1 WHERE id = ?", manual.comercioId());
        Dueno temporal = duenoPorEstado.get(EstadoComercio.CERRADO_TEMPORALMENTE);

        JsonNode comercios = listado(tokenAdministrador());

        assertEquals("APTO_VENTA", fila(comercios, manual.comercioId()).path("estado").asText());
        assertEquals("CERRADO_TEMPORALMENTE", fila(comercios, temporal.comercioId()).path("estado").asText());
    }

    @Test
    void elListadoVieneOrdenadoPorIdAscendenteYSinDatosDeDuenoNiDeOtrosComercios() throws Exception {
        JsonNode comercios = listado(tokenAdministrador());

        List<Integer> ids = new ArrayList<>();
        for (JsonNode comercio : comercios) {
            ids.add(comercio.path("id").asInt());
        }
        List<Integer> ordenados = new ArrayList<>(ids);
        ordenados.sort(Integer::compare);
        assertEquals(ordenados, ids);

        for (Dueno dueno : duenoPorEstado.values()) {
            JsonNode fila = fila(comercios, dueno.comercioId());
            assertTrue(fila.path("duenoId").isNull());
            assertEquals(false, fila.path("esAdicional").asBoolean());
            assertEquals(0, fila.path("otrosComercios").size());
        }
    }

    @Test
    void cadaFilaInformaElDuenoYSiSuCuentaEstaSuspendida() throws Exception {
        Dueno suspendido = duenoPorEstado.get(EstadoComercio.APROBADO);
        Dueno activo = duenoPorEstado.get(EstadoComercio.APTO_VENTA);
        datos.cambiarEstadoUsuario(suspendido.id(), "SUSPENDIDO");

        JsonNode comercios = listado(tokenAdministrador());

        JsonNode filaSuspendido = fila(comercios, suspendido.comercioId());
        assertEquals(true, filaSuspendido.path("duenoSuspendido").asBoolean());
        assertEquals(suspendido.id(), filaSuspendido.path("duenoUsuarioId").asInt());
        assertTrue(!filaSuspendido.path("duenoNombre").asText().isBlank());
        JsonNode filaActivo = fila(comercios, activo.comercioId());
        assertEquals(false, filaActivo.path("duenoSuspendido").asBoolean());
        assertEquals(activo.id(), filaActivo.path("duenoUsuarioId").asInt());
        for (Dueno dueno : duenoPorEstado.values()) {
            assertTrue(fila(comercios, dueno.comercioId()).path("duenoId").isNull());
        }
    }

    @Test
    void lasPantallasDeSolicitudesSiguenMostrandoSoloLosPendientes() throws Exception {
        String token = tokenAdministrador();
        Dueno pendiente = duenoPorEstado.get(EstadoComercio.PENDIENTE);

        String cuerpo = mockMvc.perform(get("/api/v1/administrador/comercios/pendientes").header("Authorization", "Bearer " + token))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        JsonNode pendientes = objectMapper.readTree(cuerpo).path("data");

        assertTrue(fila(pendientes, pendiente.comercioId()) != null);
        for (JsonNode comercio : pendientes) {
            assertEquals("PENDIENTE", comercio.path("estado").asText());
        }
        for (EstadoComercio estado : EstadoComercio.values()) {
            if (estado != EstadoComercio.PENDIENTE) {
                assertEquals(null, fila(pendientes, duenoPorEstado.get(estado).comercioId()));
            }
        }
    }

    @Test
    void soloElAdministradorLoVe() throws Exception {
        Dueno dueno = duenoPorEstado.get(EstadoComercio.APROBADO);
        Cuenta cliente = datos.registrarClienteConCredenciales();

        listar(null).andExpect(status().isUnauthorized());
        listar(loginDe(cliente.nombreUsuario(), cliente.clave())).andExpect(status().isForbidden());
        listar(loginDe(dueno.nombreUsuario(), dueno.clave())).andExpect(status().isForbidden());
    }
}
