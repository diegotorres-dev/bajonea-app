package com.bajonea.backend.services;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.bajonea.backend.services.DatosPruebaEmpleado.Cuenta;
import com.bajonea.backend.services.DatosPruebaEmpleado.Dueno;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
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
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

/**
 * "Mis direcciones" del Cliente por HTTP real (login con JWT, filtros, validación de DTO) contra {@code bajonea_test}:
 * cupo de cinco activas, una sola predeterminada, baja lógica, última dirección, localidades habilitadas y que lo
 * ajeno o borrado responda {@code 404}. Cada prueba crea sus propias cuentas.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class DireccionClienteIntegrationTest {

    private static final String BASE = "/api/v1/clientes/direcciones";
    private static final String RIO_GRANDE = "94008010";
    private static final String USHUAIA = "94015020";

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

    private record Sesion(Cuenta cuenta, String token) {

        int id() {
            return cuenta.id();
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

    private Sesion cliente() throws Exception {
        Cuenta cuenta = datos.registrarClienteConCredenciales();
        return new Sesion(cuenta, login(cuenta.nombreUsuario(), cuenta.clave()));
    }

    private static MockHttpServletRequestBuilder con(MockHttpServletRequestBuilder request, Sesion sesion) {
        return request.header("Authorization", "Bearer " + sesion.token());
    }

    private Map<String, Object> cuerpo(String calle, String localidadId) {
        Map<String, Object> mapa = new LinkedHashMap<>();
        mapa.put("calle", calle);
        mapa.put("numero", "100");
        mapa.put("codigoPostal", "9420");
        mapa.put("localidadId", localidadId);
        return mapa;
    }

    private ResultActions alta(Sesion sesion, Map<String, Object> cuerpo) throws Exception {
        return mockMvc.perform(con(post(BASE), sesion).contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(cuerpo)));
    }

    private ResultActions editar(Sesion sesion, int id, Map<String, Object> cuerpo) throws Exception {
        return mockMvc.perform(con(put(BASE + "/" + id), sesion).contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(cuerpo)));
    }

    private ResultActions predeterminar(Sesion sesion, int id) throws Exception {
        return mockMvc.perform(con(put(BASE + "/" + id + "/principal"), sesion));
    }

    private ResultActions baja(Sesion sesion, int id) throws Exception {
        return mockMvc.perform(con(delete(BASE + "/" + id), sesion));
    }

    private JsonNode json(ResultActions resultado) throws Exception {
        return objectMapper.readTree(resultado.andReturn().getResponse().getContentAsString());
    }

    private int agregar(Sesion sesion, String calle) throws Exception {
        return json(alta(sesion, cuerpo(calle, RIO_GRANDE)).andExpect(status().isCreated())).path("data").path("id").asInt();
    }

    private int activas(int clienteId) {
        return jdbcTemplate.queryForObject("SELECT COUNT(*) FROM direccion WHERE cliente_id = ? AND eliminada = 0", Integer.class, clienteId);
    }

    private int predeterminadasActivas(int clienteId) {
        return jdbcTemplate.queryForObject("SELECT COUNT(*) FROM direccion WHERE cliente_id = ? AND eliminada = 0 AND principal = 1",
                Integer.class, clienteId);
    }

    private Integer predeterminadaId(int clienteId) {
        List<Integer> ids = jdbcTemplate.queryForList("SELECT id FROM direccion WHERE cliente_id = ? AND eliminada = 0 AND principal = 1",
                Integer.class, clienteId);
        return ids.isEmpty() ? null : ids.get(0);
    }

    private int direccionInicial(Sesion sesion) {
        return predeterminadaId(sesion.id());
    }

    private String localidadNoHabilitada() {
        return jdbcTemplate.queryForObject("SELECT id FROM localidad WHERE id NOT IN ('94008010','94015020','94011010') LIMIT 1", String.class);
    }

    @Test
    void elRegistroDejaLaUnicaDireccionComoPredeterminada() throws Exception {
        Sesion s = cliente();

        JsonNode lista = json(mockMvc.perform(con(get(BASE), s)).andExpect(status().isOk())).path("data");

        assertEquals(1, lista.size());
        assertTrue(lista.get(0).path("principal").asBoolean());
        assertEquals(1, predeterminadasActivas(s.id()));
    }

    @Test
    void laListaTraeLaPredeterminadaPrimeroYLasDemasDeLaMasNuevaALaMasVieja() throws Exception {
        Sesion s = cliente();
        int inicial = direccionInicial(s);
        int segunda = agregar(s, "Segunda");
        int tercera = agregar(s, "Tercera");

        JsonNode lista = json(mockMvc.perform(con(get(BASE), s)).andExpect(status().isOk())).path("data");

        assertEquals(inicial, lista.get(0).path("id").asInt());
        assertEquals(tercera, lista.get(1).path("id").asInt());
        assertEquals(segunda, lista.get(2).path("id").asInt());
    }

    @Test
    void laListaDeUnClienteNoIncluyeLasDeOtro() throws Exception {
        Sesion a = cliente();
        Sesion b = cliente();
        agregar(b, "De B");

        JsonNode lista = json(mockMvc.perform(con(get(BASE), a)).andExpect(status().isOk())).path("data");

        assertEquals(1, lista.size());
    }

    @Test
    void unaAltaNuevaNoQuedaPredeterminadaSiNoSePide() throws Exception {
        Sesion s = cliente();
        int inicial = direccionInicial(s);

        JsonNode creada = json(alta(s, cuerpo("Mitre", RIO_GRANDE)).andExpect(status().isCreated())).path("data");

        assertFalse(creada.path("principal").asBoolean());
        assertEquals(inicial, predeterminadaId(s.id()));
        assertEquals(2, activas(s.id()));
    }

    @Test
    void unaAltaConPrincipalLeQuitaLaCondicionALaAnteriorYQuedaUnaSola() throws Exception {
        Sesion s = cliente();
        Map<String, Object> cuerpo = cuerpo("Mitre", USHUAIA);
        cuerpo.put("principal", true);

        JsonNode creada = json(alta(s, cuerpo).andExpect(status().isCreated())).path("data");

        assertTrue(creada.path("principal").asBoolean());
        assertEquals(creada.path("id").asInt(), predeterminadaId(s.id()));
        assertEquals(1, predeterminadasActivas(s.id()));
        assertEquals(2, activas(s.id()));
    }

    @Test
    void laAltaGuardaNombreYReferenciaRecortadosYElNombreSePuedeRepetir() throws Exception {
        Sesion s = cliente();
        Map<String, Object> primera = cuerpo("Mitre", RIO_GRANDE);
        primera.put("nombre", "  Casa  ");
        primera.put("referencia", "  Portón verde  ");
        Map<String, Object> segunda = cuerpo("Belgrano", RIO_GRANDE);
        segunda.put("nombre", "Casa");
        segunda.put("referencia", "   ");

        JsonNode a = json(alta(s, primera).andExpect(status().isCreated())).path("data");
        JsonNode b = json(alta(s, segunda).andExpect(status().isCreated())).path("data");

        assertEquals("Casa", a.path("nombre").asText());
        assertEquals("Portón verde", a.path("referencia").asText());
        assertEquals("Casa", b.path("nombre").asText());
        assertTrue(b.path("referencia").isNull());
    }

    @Test
    void laAltaNormalizaLaCalle() throws Exception {
        Sesion s = cliente();

        JsonNode creada = json(alta(s, cuerpo("avenida san martin", RIO_GRANDE)).andExpect(status().isCreated())).path("data");

        assertEquals("Avenida San Martin", creada.path("calle").asText());
    }

    @Test
    void elCupoEsDeCincoActivasYLaSextaDaConflictoConSuCodigo() throws Exception {
        Sesion s = cliente();
        for (int i = 0; i < 4; i++) {
            agregar(s, "Calle " + i);
        }
        assertEquals(5, activas(s.id()));

        JsonNode error = json(alta(s, cuerpo("Sexta", RIO_GRANDE)).andExpect(status().isConflict()));

        assertEquals("DIRECCIONES_CUPO_MAXIMO", error.path("data").path("codigo").asText());
        assertEquals(5, activas(s.id()));
    }

    @Test
    void elCupoCuentaSoloLasActivasAsiQueTrasUnaBajaSePuedeAgregarOtra() throws Exception {
        Sesion s = cliente();
        int ultima = 0;
        for (int i = 0; i < 4; i++) {
            ultima = agregar(s, "Calle " + i);
        }
        baja(s, ultima).andExpect(status().isOk());

        alta(s, cuerpo("Nueva", RIO_GRANDE)).andExpect(status().isCreated());

        assertEquals(5, activas(s.id()));
        assertEquals(6, jdbcTemplate.queryForObject("SELECT COUNT(*) FROM direccion WHERE cliente_id = ?", Integer.class, s.id()));
    }

    @Test
    void unaLocalidadExistenteNoHabilitadaDa400EnLocalidadIdYUnaInexistenteDa404() throws Exception {
        Sesion s = cliente();

        JsonNode error = json(alta(s, cuerpo("Mitre", localidadNoHabilitada())).andExpect(status().isBadRequest()));
        alta(s, cuerpo("Mitre", "00000000")).andExpect(status().isNotFound());

        assertNotNull(error.path("data").path("localidadId").asText(null));
        assertEquals(1, activas(s.id()));
    }

    @Test
    void lasLocalidadesHabilitadasSeAceptan() throws Exception {
        Sesion s = cliente();

        alta(s, cuerpo("Mitre", USHUAIA)).andExpect(status().isCreated());
        alta(s, cuerpo("Mitre", "94011010")).andExpect(status().isCreated());
    }

    @Test
    void lasValidacionesDelDtoDan400PorCampo() throws Exception {
        Sesion s = cliente();
        Map<String, Object> invalida = cuerpo("", RIO_GRANDE);
        invalida.put("numero", "abc");
        invalida.put("nombre", "x".repeat(41));
        invalida.put("referencia", "y".repeat(151));

        JsonNode data = json(alta(s, invalida).andExpect(status().isBadRequest())).path("data");

        assertTrue(data.has("calle"));
        assertTrue(data.has("numero"));
        assertTrue(data.has("nombre"));
        assertTrue(data.has("referencia"));
        assertEquals(1, activas(s.id()));
    }

    @Test
    void editarCambiaLosCamposYNoTocaLaPredeterminada() throws Exception {
        Sesion s = cliente();
        int inicial = direccionInicial(s);
        Map<String, Object> cuerpo = cuerpo("Nueva Calle", USHUAIA);
        cuerpo.put("nombre", "Trabajo");
        cuerpo.put("referencia", "Timbre 2");

        JsonNode editada = json(editar(s, inicial, cuerpo).andExpect(status().isOk())).path("data");

        assertEquals("Nueva Calle", editada.path("calle").asText());
        assertEquals(USHUAIA, editada.path("localidadId").asText());
        assertEquals("Trabajo", editada.path("nombre").asText());
        assertTrue(editada.path("principal").asBoolean());
        assertEquals(inicial, predeterminadaId(s.id()));
        assertNotNull(jdbcTemplate.queryForObject("SELECT fecha_modificacion FROM direccion WHERE id = ?", java.time.LocalDateTime.class, inicial));
    }

    @Test
    void editarIgnoraPrincipalEnUnaNoPredeterminadaYEnLaPredeterminada() throws Exception {
        Sesion s = cliente();
        int inicial = direccionInicial(s);
        int segunda = agregar(s, "Segunda");

        Map<String, Object> subir = cuerpo("Segunda", RIO_GRANDE);
        subir.put("principal", true);
        JsonNode sinSubir = json(editar(s, segunda, subir).andExpect(status().isOk())).path("data");
        Map<String, Object> bajar = cuerpo("Calle Siempre Viva", RIO_GRANDE);
        bajar.put("principal", false);
        JsonNode sinBajar = json(editar(s, inicial, bajar).andExpect(status().isOk())).path("data");

        assertFalse(sinSubir.path("principal").asBoolean());
        assertTrue(sinBajar.path("principal").asBoolean());
        assertEquals(inicial, predeterminadaId(s.id()));
        assertEquals(1, predeterminadasActivas(s.id()));
    }

    @Test
    void editarExigeUnaLocalidadHabilitadaAunqueSoloSeCambieElAlias() throws Exception {
        Sesion s = cliente();
        int id = direccionInicial(s);
        jdbcTemplate.update("UPDATE direccion SET localidad_id = ? WHERE id = ?", localidadNoHabilitada(), id);

        Map<String, Object> soloAlias = cuerpo("Calle Siempre Viva", localidadNoHabilitada());
        soloAlias.put("nombre", "Casa");
        editar(s, id, soloAlias).andExpect(status().isBadRequest());
        editar(s, id, cuerpo("Calle Siempre Viva", RIO_GRANDE)).andExpect(status().isOk());

        assertEquals(RIO_GRANDE, jdbcTemplate.queryForObject("SELECT localidad_id FROM direccion WHERE id = ?", String.class, id));
    }

    @Test
    void unaDireccionViejaFueraDeLasHabilitadasSeLeeEnLaLista() throws Exception {
        Sesion s = cliente();
        String otra = localidadNoHabilitada();
        jdbcTemplate.update("UPDATE direccion SET localidad_id = ? WHERE id = ?", otra, direccionInicial(s));

        JsonNode lista = json(mockMvc.perform(con(get(BASE), s)).andExpect(status().isOk())).path("data");

        assertEquals(otra, lista.get(0).path("localidadId").asText());
    }

    @Test
    void marcarComoPredeterminadaCambiaLaCondicionYQuedaUnaSola() throws Exception {
        Sesion s = cliente();
        int inicial = direccionInicial(s);
        int segunda = agregar(s, "Segunda");

        JsonNode lista = json(predeterminar(s, segunda).andExpect(status().isOk())).path("data");

        assertEquals(segunda, predeterminadaId(s.id()));
        assertEquals(1, predeterminadasActivas(s.id()));
        assertEquals(segunda, lista.get(0).path("id").asInt());
        assertTrue(lista.get(0).path("principal").asBoolean());
        assertEquals(inicial, lista.get(1).path("id").asInt());
    }

    @Test
    void marcarLaQueYaEsPredeterminadaEsIdempotente() throws Exception {
        Sesion s = cliente();
        int inicial = direccionInicial(s);

        predeterminar(s, inicial).andExpect(status().isOk());
        predeterminar(s, inicial).andExpect(status().isOk());

        assertEquals(inicial, predeterminadaId(s.id()));
        assertEquals(1, predeterminadasActivas(s.id()));
    }

    @Test
    void eliminarUnaNoPredeterminadaLaDaDeBajaLogicaYDejaLaFila() throws Exception {
        Sesion s = cliente();
        int inicial = direccionInicial(s);
        int segunda = agregar(s, "Segunda");

        JsonNode lista = json(baja(s, segunda).andExpect(status().isOk())).path("data");

        assertEquals(1, lista.size());
        assertEquals(inicial, predeterminadaId(s.id()));
        assertEquals(1, jdbcTemplate.queryForObject("SELECT eliminada FROM direccion WHERE id = ?", Integer.class, segunda));
        assertNotNull(jdbcTemplate.queryForObject("SELECT fecha_baja FROM direccion WHERE id = ?", java.time.LocalDateTime.class, segunda));
    }

    @Test
    void eliminarLaPredeterminadaPromueveLaMasReciente() throws Exception {
        Sesion s = cliente();
        int inicial = direccionInicial(s);
        agregar(s, "Segunda");
        int tercera = agregar(s, "Tercera");

        JsonNode lista = json(baja(s, inicial).andExpect(status().isOk())).path("data");

        assertEquals(2, lista.size());
        assertEquals(tercera, predeterminadaId(s.id()));
        assertEquals(1, predeterminadasActivas(s.id()));
        assertEquals(tercera, lista.get(0).path("id").asInt());
        assertEquals(0, jdbcTemplate.queryForObject("SELECT principal FROM direccion WHERE id = ?", Integer.class, inicial));
    }

    @Test
    void laUltimaDireccionActivaNoSePuedeEliminar() throws Exception {
        Sesion s = cliente();
        int inicial = direccionInicial(s);

        JsonNode error = json(baja(s, inicial).andExpect(status().isConflict()));

        assertEquals("ULTIMA_DIRECCION", error.path("data").path("codigo").asText());
        assertEquals(1, activas(s.id()));
        assertEquals(inicial, predeterminadaId(s.id()));
    }

    @Test
    void lasEliminadasNoCuentanParaLaUltimaDireccion() throws Exception {
        Sesion s = cliente();
        int inicial = direccionInicial(s);
        int segunda = agregar(s, "Segunda");
        baja(s, inicial).andExpect(status().isOk());

        baja(s, segunda).andExpect(status().isConflict());

        assertEquals(1, activas(s.id()));
    }

    @Test
    void loAjenoLoInexistenteYLoYaEliminadoDan404EnTodasLasOperaciones() throws Exception {
        Sesion a = cliente();
        Sesion b = cliente();
        int deB = direccionInicial(b);
        int propia = agregar(a, "Propia");
        baja(a, propia).andExpect(status().isOk());
        Map<String, Object> cuerpo = cuerpo("Mitre", RIO_GRANDE);

        for (int id : new int[] { deB, 999999999, propia }) {
            editar(a, id, cuerpo).andExpect(status().isNotFound());
            predeterminar(a, id).andExpect(status().isNotFound());
            baja(a, id).andExpect(status().isNotFound());
        }

        assertEquals(1, activas(b.id()));
        assertEquals("Calle Siempre Viva", jdbcTemplate.queryForObject("SELECT calle FROM direccion WHERE id = ?", String.class, deB));
        assertEquals(1, predeterminadasActivas(b.id()));
    }

    @Test
    void elPerfilDevuelveLaPredeterminadaConDosDirecciones() throws Exception {
        Sesion s = cliente();
        int inicial = direccionInicial(s);
        int segunda = agregar(s, "Segunda");

        JsonNode antes = json(mockMvc.perform(con(get("/api/v1/clientes/perfil"), s)).andExpect(status().isOk())).path("data");
        predeterminar(s, segunda).andExpect(status().isOk());
        JsonNode despues = json(mockMvc.perform(con(get("/api/v1/clientes/perfil"), s)).andExpect(status().isOk())).path("data");
        baja(s, segunda).andExpect(status().isOk());
        JsonNode trasBaja = json(mockMvc.perform(con(get("/api/v1/clientes/perfil"), s)).andExpect(status().isOk())).path("data");

        assertEquals(inicial, antes.path("direccion").path("id").asInt());
        assertEquals(segunda, despues.path("direccion").path("id").asInt());
        assertEquals(inicial, trasBaja.path("direccion").path("id").asInt());
        assertTrue(trasBaja.path("direccion").path("principal").asBoolean());
    }

    @Test
    void sinTokenDa401YUnDuenoDa403() throws Exception {
        Dueno dueno = datos.registrarDuenoAprobado();
        datos.cambiarEstadoUsuario(dueno.id(), "ACTIVO");
        String token = login(dueno.nombreUsuario(), dueno.clave());

        mockMvc.perform(get(BASE)).andExpect(status().isUnauthorized());
        mockMvc.perform(get(BASE).header("Authorization", "Bearer " + token)).andExpect(status().isForbidden());
        mockMvc.perform(post(BASE).header("Authorization", "Bearer " + token).contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isForbidden());
    }

    @Test
    void sinNombreNiReferenciaLosCamposQuedanNulos() throws Exception {
        Sesion s = cliente();

        JsonNode creada = json(alta(s, cuerpo("Mitre", RIO_GRANDE)).andExpect(status().isCreated())).path("data");

        assertTrue(creada.path("nombre").isNull());
        assertNull(jdbcTemplate.queryForObject("SELECT referencia FROM direccion WHERE id = ?", String.class, creada.path("id").asInt()));
    }
}
