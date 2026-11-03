package com.bajonea.backend.services;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.bajonea.backend.config.security.AuthenticatedUser;
import com.bajonea.backend.dto.response.ConsultaSoporteCreadaResponseDTO;
import com.bajonea.backend.enums.RolUsuario;
import com.fasterxml.jackson.databind.JsonNode;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

/**
 * El contrato HTTP de Soporte (Fase 5, tramo S4): códigos de estado, validaciones de los DTO, que los tres casos de
 * acceso incorrecto sean indistinguibles (mismo status y mismo cuerpo), los límites como 429 y quién puede entrar a la
 * bandeja del Administrador.
 */
@AutoConfigureMockMvc
class SoporteHttpIntegrationTest extends SoporteIntegrationBase {

    private static final String PUBLICO = "/api/v1/soporte/publico";
    private static final String ADMIN = "/api/v1/administrador/soporte";

    @Autowired
    private MockMvc mockMvc;

    private MockHttpServletRequestBuilder desde(MockHttpServletRequestBuilder request, String ip) {
        return request.contentType(MediaType.APPLICATION_JSON).with(r -> {
            r.setRemoteAddr(ip);
            return r;
        });
    }

    private MockHttpServletRequestBuilder como(MockHttpServletRequestBuilder request, RolUsuario rol, int usuarioId) {
        return request.with(authentication(new UsernamePasswordAuthenticationToken(new AuthenticatedUser(usuarioId, 1, rol), null,
                List.of(new SimpleGrantedAuthority("ROLE_" + rol.name())))));
    }

    private int administradorId() {
        return jdbcTemplate.queryForObject("SELECT id FROM administrador ORDER BY id LIMIT 1", Integer.class);
    }

    private static String cuerpoDeCrear(String email, String tipo, String mensaje) {
        return "{\"email\":\"" + email + "\",\"tipo\":\"" + tipo + "\",\"mensaje\":\"" + mensaje + "\"}";
    }

    @Test
    void crearSinSesionResponde201ConElCodigoYElEmailNoDistingueMayusculas() throws Exception {
        String email = emailNuevo();
        MockHttpServletResponse respuesta = mockMvc.perform(desde(post(PUBLICO + "/consultas"), ipNueva())
                        .content(cuerpoDeCrear(email.toUpperCase(), "APELACION_COMERCIO", "Mi comercio fue rechazado")))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.mensaje").value("Recibimos tu consulta"))
                .andExpect(jsonPath("$.data.estado").value("ESPERA_SOPORTE"))
                .andReturn().getResponse();

        String codigo = objectMapper.readTree(respuesta.getContentAsString()).path("data").path("codigo").asText();
        assertTrue(codigo.matches("[2-9A-HJKMNP-Z]{8}"));
        assertEquals(1, jdbcTemplate.queryForObject("SELECT COUNT(*) FROM ticket_soporte WHERE email = ?", Integer.class, email));
    }

    @Test
    void lasValidacionesDeLosDtoDan400() throws Exception {
        String ip = ipNueva();
        mockMvc.perform(desde(post(PUBLICO + "/consultas"), ip).content(cuerpoDeCrear("no-es-un-email", "OTRA", "Mensaje suficiente")))
                .andExpect(status().isBadRequest());
        mockMvc.perform(desde(post(PUBLICO + "/consultas"), ip).content(cuerpoDeCrear(emailNuevo(), "OTRA", "corto")))
                .andExpect(status().isBadRequest());
        mockMvc.perform(desde(post(PUBLICO + "/consultas"), ip).content(cuerpoDeCrear(emailNuevo(), "OTRA", "x".repeat(1001))))
                .andExpect(status().isBadRequest());
        mockMvc.perform(desde(post(PUBLICO + "/consultas"), ip).content(cuerpoDeCrear(emailNuevo(), "TIPO_INEXISTENTE", "Mensaje suficiente")))
                .andExpect(status().isBadRequest());
        mockMvc.perform(desde(post(PUBLICO + "/consultas"), ip).content("{\"email\":\"" + emailNuevo() + "\",\"mensaje\":\"Mensaje suficiente\"}"))
                .andExpect(status().isBadRequest());
        mockMvc.perform(desde(post(PUBLICO + "/consultas/ver"), ip).content("{\"email\":\"" + emailNuevo() + "\"}"))
                .andExpect(status().isBadRequest());
        mockMvc.perform(desde(post(PUBLICO + "/consultas/responder"), ip)
                        .content("{\"email\":\"" + emailNuevo() + "\",\"codigo\":\"ABCD2345\",\"texto\":\"" + "x".repeat(1001) + "\"}"))
                .andExpect(status().isBadRequest());
        mockMvc.perform(desde(post(PUBLICO + "/consultas/responder"), ip)
                        .content("{\"email\":\"" + emailNuevo() + "\",\"codigo\":\"ABCD2345\",\"texto\":\"   \"}"))
                .andExpect(status().isBadRequest());
        mockMvc.perform(desde(post(PUBLICO + "/codigos/reenviar"), ip).content("{\"email\":\"\"}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void laMismaRespuestaParaEmailInexistenteCodigoIncorrectoYCombinacionAjena() throws Exception {
        String email = emailNuevo();
        ConsultaSoporteCreadaResponseDTO propia = crear(email, ipNueva());
        ConsultaSoporteCreadaResponseDTO ajena = crear(emailNuevo(), ipNueva());

        String emailInexistente = mockMvc.perform(desde(post(PUBLICO + "/consultas/ver"), ipNueva())
                        .content("{\"email\":\"" + emailNuevo() + "\",\"codigo\":\"" + propia.getCodigo() + "\"}"))
                .andExpect(status().isNotFound()).andReturn().getResponse().getContentAsString();
        String codigoIncorrecto = mockMvc.perform(desde(post(PUBLICO + "/consultas/ver"), ipNueva())
                        .content("{\"email\":\"" + email + "\",\"codigo\":\"ZZZZZZZZ\"}"))
                .andExpect(status().isNotFound()).andReturn().getResponse().getContentAsString();
        String combinacionAjena = mockMvc.perform(desde(post(PUBLICO + "/consultas/ver"), ipNueva())
                        .content("{\"email\":\"" + email + "\",\"codigo\":\"" + ajena.getCodigo() + "\"}"))
                .andExpect(status().isNotFound()).andReturn().getResponse().getContentAsString();
        String respondiendo = mockMvc.perform(desde(post(PUBLICO + "/consultas/responder"), ipNueva())
                        .content("{\"email\":\"" + email + "\",\"codigo\":\"" + ajena.getCodigo() + "\",\"texto\":\"Hola\"}"))
                .andExpect(status().isNotFound()).andReturn().getResponse().getContentAsString();

        assertEquals(emailInexistente, codigoIncorrecto);
        assertEquals(codigoIncorrecto, combinacionAjena);
        assertEquals(combinacionAjena, respondiendo);
        assertEquals("No encontramos una consulta con esos datos. Revisá el email y el código.",
                objectMapper.readTree(emailInexistente).path("mensaje").asText());
        assertTrue(objectMapper.readTree(emailInexistente).path("data").isNull());
    }

    @Test
    void verYResponderConEmailYCodigoFuncionanPorHttp() throws Exception {
        String email = emailNuevo();
        String ip = ipNueva();
        ConsultaSoporteCreadaResponseDTO creada = crear(email, ip);
        soporteAdmin.responder(creada.getId(), texto("Contanos más"));

        mockMvc.perform(desde(post(PUBLICO + "/consultas/ver"), ip)
                        .content("{\"email\":\"" + email + "\",\"codigo\":\"" + creada.getCodigo().toLowerCase() + "\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.puedeResponder").value(true))
                .andExpect(jsonPath("$.data.mensajes.length()").value(2))
                .andExpect(jsonPath("$.data.maxMensajes").value(20));
        mockMvc.perform(desde(post(PUBLICO + "/consultas/responder"), ip)
                        .content("{\"email\":\"" + email + "\",\"codigo\":\"" + creada.getCodigo() + "\",\"texto\":\"ok\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.mensajes.length()").value(3))
                .andExpect(jsonPath("$.data.puedeResponder").value(false));
        mockMvc.perform(desde(post(PUBLICO + "/consultas/responder"), ip)
                        .content("{\"email\":\"" + email + "\",\"codigo\":\"" + creada.getCodigo() + "\",\"texto\":\"otra vez\"}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.mensaje").value("Soporte todavía no respondió. Vas a poder escribir cuando lo haga."));
    }

    @Test
    void losLimitesResponden429ConSusMensajes() throws Exception {
        String email = emailNuevo();
        for (int i = 0; i < 3; i++) {
            crear(email, ipNueva());
        }
        mockMvc.perform(desde(post(PUBLICO + "/consultas"), ipNueva()).content(cuerpoDeCrear(email, "OTRA", "Mensaje suficiente")))
                .andExpect(status().isTooManyRequests())
                .andExpect(jsonPath("$.mensaje").value("Ya enviaste 3 consultas hoy. Probá de nuevo mañana o esperá la respuesta de Soporte."));

        String emailIntentos = emailNuevo();
        for (int i = 0; i < 30; i++) {
            mockMvc.perform(desde(post(PUBLICO + "/consultas/ver"), ipNueva()).content("{\"email\":\"" + emailIntentos + "\",\"codigo\":\"ZZZZZZZZ\"}"))
                    .andExpect(status().isNotFound());
        }
        mockMvc.perform(desde(post(PUBLICO + "/consultas/ver"), ipNueva()).content("{\"email\":\"" + emailIntentos + "\",\"codigo\":\"ZZZZZZZZ\"}"))
                .andExpect(status().isTooManyRequests())
                .andExpect(jsonPath("$.mensaje").value("Hiciste demasiados intentos. Probá de nuevo en una hora."));
    }

    @Test
    void elReenvioDeCodigosRespondeLoMismoConYSinConsultas() throws Exception {
        String conConsultas = emailNuevo();
        crear(conConsultas, ipNueva());

        String uno = mockMvc.perform(desde(post(PUBLICO + "/codigos/reenviar"), ipNueva()).content("{\"email\":\"" + conConsultas + "\"}"))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        String otro = mockMvc.perform(desde(post(PUBLICO + "/codigos/reenviar"), ipNueva()).content("{\"email\":\"" + emailNuevo() + "\"}"))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();

        assertEquals(uno, otro);
        assertEquals("Si hay consultas con ese email, te mandamos los códigos. Revisá tu bandeja de entrada.",
                objectMapper.readTree(uno).path("mensaje").asText());
    }

    @Test
    void laBandejaDelAdministradorSoloLaVeUnAdministrador() throws Exception {
        ConsultaSoporteCreadaResponseDTO creada = crear(emailNuevo(), ipNueva());
        int cliente = datos.registrarCliente();
        int dueno = datos.registrarDuenoAprobado().id();

        for (MockHttpServletRequestBuilder ruta : List.of(get(ADMIN), get(ADMIN + "/" + creada.getId()),
                post(ADMIN + "/" + creada.getId() + "/mensajes").contentType(MediaType.APPLICATION_JSON).content("{\"texto\":\"Hola\"}"),
                put(ADMIN + "/" + creada.getId() + "/cerrar"), post(ADMIN + "/" + creada.getId() + "/reenviar-email"))) {
            mockMvc.perform(ruta).andExpect(status().isUnauthorized());
        }
        mockMvc.perform(como(get(ADMIN), RolUsuario.CLIENTE, cliente)).andExpect(status().isForbidden());
        mockMvc.perform(como(get(ADMIN + "/" + creada.getId()), RolUsuario.DUENO, dueno)).andExpect(status().isForbidden());
        mockMvc.perform(como(put(ADMIN + "/" + creada.getId() + "/cerrar"), RolUsuario.CLIENTE, cliente)).andExpect(status().isForbidden());
        assertEquals("ESPERA_SOPORTE", estadoDeLaConsulta(creada.getId()));
    }

    @Test
    void elAdministradorListaVeResponderCierraYReenviaPorHttp() throws Exception {
        String email = emailNuevo();
        ConsultaSoporteCreadaResponseDTO creada = crear(email, ipNueva());
        jdbcTemplate.update("UPDATE ticket_soporte SET actualizado_en = '1999-01-01 00:00:00' WHERE id = ?", creada.getId());
        int admin = administradorId();

        String lista = mockMvc.perform(como(get(ADMIN).param("estado", "ESPERAN").param("limite", "5"), RolUsuario.ADMINISTRADOR, admin))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        JsonNode primera = objectMapper.readTree(lista).path("data").get(0);
        assertEquals(creada.getId(), primera.path("id").asInt());
        assertEquals(email, primera.path("email").asText());

        mockMvc.perform(como(get(ADMIN).param("estado", "INVENTADO"), RolUsuario.ADMINISTRADOR, admin)).andExpect(status().isBadRequest());
        mockMvc.perform(como(get(ADMIN + "/" + creada.getId()), RolUsuario.ADMINISTRADOR, admin))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.puedeResponder").value(true));
        mockMvc.perform(como(post(ADMIN + "/" + creada.getId() + "/mensajes"), RolUsuario.ADMINISTRADOR, admin)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"texto\":\"\"}"))
                .andExpect(status().isBadRequest());
        mockMvc.perform(como(post(ADMIN + "/" + creada.getId() + "/mensajes"), RolUsuario.ADMINISTRADOR, admin)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"texto\":\"Hola, te escribimos\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.estado").value("ESPERA_PERSONA"));
        mockMvc.perform(como(post(ADMIN + "/" + creada.getId() + "/mensajes"), RolUsuario.ADMINISTRADOR, admin)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"texto\":\"Otra vez\"}"))
                .andExpect(status().isConflict());
        mockMvc.perform(como(post(ADMIN + "/" + creada.getId() + "/reenviar-email"), RolUsuario.ADMINISTRADOR, admin))
                .andExpect(status().isConflict());
        mockMvc.perform(como(put(ADMIN + "/" + creada.getId() + "/cerrar"), RolUsuario.ADMINISTRADOR, admin))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.estado").value("CERRADO"));
        mockMvc.perform(como(put(ADMIN + "/" + creada.getId() + "/cerrar"), RolUsuario.ADMINISTRADOR, admin))
                .andExpect(status().isConflict());
        mockMvc.perform(como(get(ADMIN + "/" + Integer.MAX_VALUE), RolUsuario.ADMINISTRADOR, admin)).andExpect(status().isNotFound());
        mockMvc.perform(como(put(ADMIN + "/" + Integer.MAX_VALUE + "/cerrar"), RolUsuario.ADMINISTRADOR, admin)).andExpect(status().isNotFound());
    }

    @Test
    void lasMetricasDelPanelSumanLasConsultasQueEsperan() throws Exception {
        int admin = administradorId();
        String antes = mockMvc.perform(como(get("/api/v1/administrador/metricas"), RolUsuario.ADMINISTRADOR, admin))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        long previas = objectMapper.readTree(antes).path("data").path("consultasSoporteEsperando").asLong();
        crear(emailNuevo(), ipNueva());

        String despues = mockMvc.perform(como(get("/api/v1/administrador/metricas"), RolUsuario.ADMINISTRADOR, admin))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();

        assertEquals(previas + 1, objectMapper.readTree(despues).path("data").path("consultasSoporteEsperando").asLong());
        assertNotEquals(-1, previas);
    }
}
