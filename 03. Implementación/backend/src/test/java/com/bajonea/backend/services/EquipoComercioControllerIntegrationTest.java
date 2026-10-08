package com.bajonea.backend.services;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.timeout;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.bajonea.backend.services.DatosPruebaEmpleado.Cuenta;
import com.bajonea.backend.services.DatosPruebaEmpleado.Dueno;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

/**
 * Las cuatro rutas del equipo del Dueño ({@code /api/v1/comercios/equipo/**}) por HTTP real, con los filtros
 * de seguridad y la resolución de {@code X-Comercio-Id}, contra {@code bajonea_test} y con el
 * {@code EmailService} reemplazado por un mock. Cada prueba confirma sus datos (no hay transacción de prueba
 * que envuelva la request) y los limpia al final. El reloj está fijo en {@link #INICIO} para poder recorrer el
 * tope de envíos por hora.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(ConfiguracionRelojDePrueba.class)
class EquipoComercioControllerIntegrationTest {

    private static final String EQUIPO = "/api/v1/comercios/equipo";
    private static final String INVITACIONES = EQUIPO + "/invitaciones";
    private static final String HEADER = "X-Comercio-Id";
    private static final LocalDateTime INICIO = LocalDateTime.of(2026, 10, 6, 12, 0, 0);
    private static final String TOPE_A_LAS_13 = "Alcanzaste el máximo de 5 invitaciones por hora. Probá de nuevo a las 13:00";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private RegistroService registroService;

    @Autowired
    private TestSupportService testSupportService;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private RelojDePrueba reloj;

    @MockitoBean
    private EmailService emailService;

    private DatosPruebaEmpleado datos;

    @BeforeEach
    void preparar() {
        datos = new DatosPruebaEmpleado(registroService, objectMapper, jdbcTemplate);
        reloj.fijar(INICIO);
    }

    @AfterEach
    void restaurarReloj() {
        reloj.volverAlReloj();
    }

    private String loginDe(String nombreUsuario, String clave) throws Exception {
        String cuerpo = mockMvc.perform(post("/api/v1/auth/login").contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("nombreUsuario", nombreUsuario, "password", clave))))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return objectMapper.readTree(cuerpo).path("data").path("token").asText();
    }

    private String tokenDe(Dueno dueno) throws Exception {
        datos.cambiarEstadoUsuario(dueno.id(), "ACTIVO");
        return loginDe(dueno.nombreUsuario(), dueno.clave());
    }

    private static MockHttpServletRequestBuilder conToken(MockHttpServletRequestBuilder request, String token, Integer comercioId) {
        MockHttpServletRequestBuilder conAuth = request.header("Authorization", "Bearer " + token);
        return comercioId == null ? conAuth : conAuth.header(HEADER, comercioId);
    }

    private ResultActions invitar(String token, int comercioId, String email) throws Exception {
        return mockMvc.perform(conToken(post(INVITACIONES), token, comercioId).contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(Map.of("email", email))));
    }

    private ResultActions reenviar(String token, int comercioId, int invitacionId) throws Exception {
        return mockMvc.perform(conToken(post(INVITACIONES + "/" + invitacionId + "/reenviar"), token, comercioId));
    }

    private ResultActions cancelar(String token, int comercioId, int invitacionId) throws Exception {
        return mockMvc.perform(conToken(put(INVITACIONES + "/" + invitacionId + "/cancelar"), token, comercioId));
    }

    private ResultActions equipo(String token, int comercioId) throws Exception {
        return mockMvc.perform(conToken(get(EQUIPO), token, comercioId));
    }

    private int idDe(ResultActions resultado) throws Exception {
        JsonNode cuerpo = objectMapper.readTree(resultado.andReturn().getResponse().getContentAsString());
        return cuerpo.path("data").path("id").asInt();
    }

    private int invitarOk(String token, int comercioId, String email) throws Exception {
        return idDe(invitar(token, comercioId, email).andExpect(status().isCreated()));
    }

    private static String emailNuevo() {
        return "invitado." + DatosPruebaEmpleado.sufijo() + "@bajonea.test";
    }

    private String estadoDe(int invitacionId) {
        return jdbcTemplate.queryForObject("SELECT estado FROM invitacion_empleado WHERE id = ?", String.class, invitacionId);
    }

    private void ponerEstado(int invitacionId, String estado) {
        jdbcTemplate.update("UPDATE invitacion_empleado SET estado = ? WHERE id = ?", estado, invitacionId);
    }

    private int avisosEmail(int usuarioId) {
        return jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM notificacion WHERE usuario_id = ? AND canal = 'EMAIL' AND tipo = 'INVITACION_EMPLEADO'",
                Integer.class, usuarioId);
    }

    private void borrarRastros(Dueno... duenos) {
        for (Dueno dueno : duenos) {
            List<Integer> comercios = jdbcTemplate.queryForList("SELECT id FROM comercio WHERE dueno_id = ?", Integer.class, dueno.id());
            for (Integer comercioId : comercios) {
                jdbcTemplate.update("DELETE FROM historial_empleado_comercio WHERE comercio_id = ?", comercioId);
                jdbcTemplate.update("DELETE FROM empleado_comercio WHERE comercio_id = ?", comercioId);
                jdbcTemplate.update("DELETE FROM invitacion_empleado WHERE comercio_id = ?", comercioId);
            }
            jdbcTemplate.update("DELETE FROM notificacion WHERE usuario_id = ?", dueno.id());
        }
    }

    private void borrarAvisos(int... usuarios) {
        for (int usuarioId : usuarios) {
            jdbcTemplate.update("DELETE FROM notificacion WHERE usuario_id = ?", usuarioId);
        }
    }

    @Test
    void sinAutenticacionTodasLasRutasDan401() throws Exception {
        mockMvc.perform(get(EQUIPO).header(HEADER, 1)).andExpect(status().isUnauthorized());
        mockMvc.perform(post(INVITACIONES).header(HEADER, 1).contentType(MediaType.APPLICATION_JSON).content("{\"email\":\"a@b.com\"}"))
                .andExpect(status().isUnauthorized());
        mockMvc.perform(post(INVITACIONES + "/1/reenviar").header(HEADER, 1)).andExpect(status().isUnauthorized());
        mockMvc.perform(put(INVITACIONES + "/1/cancelar").header(HEADER, 1)).andExpect(status().isUnauthorized());
    }

    @Test
    void unClienteRecibe403EnTodasLasRutas() throws Exception {
        Dueno dueno = datos.registrarDuenoAprobado();
        Cuenta cliente = datos.registrarClienteConCredenciales();
        try {
            String token = loginDe(cliente.nombreUsuario(), cliente.clave());

            mockMvc.perform(conToken(get(EQUIPO), token, dueno.comercioId())).andExpect(status().isForbidden());
            mockMvc.perform(conToken(post(INVITACIONES), token, dueno.comercioId()).contentType(MediaType.APPLICATION_JSON)
                    .content("{\"email\":\"a@b.com\"}")).andExpect(status().isForbidden());
            mockMvc.perform(conToken(post(INVITACIONES + "/1/reenviar"), token, dueno.comercioId())).andExpect(status().isForbidden());
            mockMvc.perform(conToken(put(INVITACIONES + "/1/cancelar"), token, dueno.comercioId())).andExpect(status().isForbidden());
        } finally {
            borrarRastros(dueno);
        }
    }

    @Test
    void sinHeaderOConHeaderNoNumericoDa400YConUnComercioAjenoOInexistenteDa404() throws Exception {
        Dueno dueno = datos.registrarDuenoAprobado();
        Dueno otro = datos.registrarDuenoAprobado();
        try {
            String token = tokenDe(dueno);

            mockMvc.perform(conToken(get(EQUIPO), token, null)).andExpect(status().isBadRequest());
            mockMvc.perform(conToken(post(INVITACIONES), token, null).contentType(MediaType.APPLICATION_JSON)
                    .content("{\"email\":\"a@b.com\"}")).andExpect(status().isBadRequest());
            mockMvc.perform(conToken(post(INVITACIONES + "/1/reenviar"), token, null)).andExpect(status().isBadRequest());
            mockMvc.perform(conToken(put(INVITACIONES + "/1/cancelar"), token, null)).andExpect(status().isBadRequest());
            mockMvc.perform(get(EQUIPO).header("Authorization", "Bearer " + token).header(HEADER, "abc")).andExpect(status().isBadRequest());
            mockMvc.perform(get(EQUIPO).header("Authorization", "Bearer " + token).header(HEADER, " ")).andExpect(status().isBadRequest());

            String ajeno = mockMvc.perform(conToken(get(EQUIPO), token, otro.comercioId())).andExpect(status().isNotFound())
                    .andReturn().getResponse().getContentAsString();
            String inexistente = mockMvc.perform(conToken(get(EQUIPO), token, 2_000_000_000)).andExpect(status().isNotFound())
                    .andReturn().getResponse().getContentAsString();
            assertEquals(ajeno, inexistente, "un comercio ajeno no se distingue de uno inexistente");
            invitar(token, otro.comercioId(), emailNuevo()).andExpect(status().isNotFound());
        } finally {
            borrarRastros(dueno, otro);
        }
    }

    @Test
    void invitarDa201ConLaInvitacionSinElCodigoYMandaElEmail() throws Exception {
        Dueno dueno = datos.registrarDuenoAprobado();
        String email = emailNuevo();
        try {
            String token = tokenDe(dueno);

            invitar(token, dueno.comercioId(), "  " + email.toUpperCase() + " ")
                    .andExpect(status().isCreated())
                    .andExpect(jsonPath("$.mensaje").value("Invitación enviada a " + email))
                    .andExpect(jsonPath("$.data.id").isNumber())
                    .andExpect(jsonPath("$.data.email").value(email))
                    .andExpect(jsonPath("$.data.estado").value("PENDIENTE"))
                    .andExpect(jsonPath("$.data.fechaCreacion").value("2026-10-06T12:00:00"))
                    .andExpect(jsonPath("$.data.fechaVencimiento").value("2026-10-13T12:00:00"))
                    .andExpect(jsonPath("$.data.codigo").doesNotExist());

            String codigo = jdbcTemplate.queryForObject("SELECT codigo FROM invitacion_empleado WHERE comercio_id = ? AND email = ?",
                    String.class, dueno.comercioId(), email);
            verify(emailService, timeout(2000)).enviarInvitacionEmpleado(eq(email), anyString(), eq(dueno.nombreComercio()), eq(codigo));
        } finally {
            borrarRastros(dueno);
        }
    }

    @Test
    void invitarConUnEmailInvalidoOAusenteDa400() throws Exception {
        Dueno dueno = datos.registrarDuenoAprobado();
        try {
            String token = tokenDe(dueno);

            invitar(token, dueno.comercioId(), "no-es-un-email").andExpect(status().isBadRequest());
            invitar(token, dueno.comercioId(), "   ").andExpect(status().isBadRequest());
            mockMvc.perform(conToken(post(INVITACIONES), token, dueno.comercioId()).contentType(MediaType.APPLICATION_JSON).content("{}"))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.data.email").exists());
            assertEquals(0, jdbcTemplate.queryForObject("SELECT COUNT(*) FROM invitacion_empleado WHERE comercio_id = ?", Integer.class,
                    dueno.comercioId()));
        } finally {
            borrarRastros(dueno);
        }
    }

    @Test
    void invitarDa409ConElTextoDeCadaRegla() throws Exception {
        Dueno dueno = datos.registrarDuenoAprobado();
        Dueno otroDueno = datos.registrarDuenoAprobado();
        Cuenta administrador = datos.registrarClienteConCredenciales();
        Cuenta bloqueada = datos.registrarClienteConCredenciales();
        Cuenta delEquipo = datos.registrarClienteConCredenciales();
        try {
            String token = tokenDe(dueno);
            datos.hacerAdministrador(administrador.id());
            datos.cambiarEstadoUsuario(bloqueada.id(), "BLOQUEADO");
            datos.vincularEmpleado(delEquipo.id(), dueno.comercioId(), "ACTIVO", INICIO.minusDays(2));

            invitar(token, dueno.comercioId(), otroDueno.email()).andExpect(status().isConflict())
                    .andExpect(jsonPath("$.mensaje").value("No se puede invitar a este email"));
            invitar(token, dueno.comercioId(), administrador.email()).andExpect(status().isConflict())
                    .andExpect(jsonPath("$.mensaje").value("No se puede invitar a este email"));
            invitar(token, dueno.comercioId(), bloqueada.email()).andExpect(status().isConflict())
                    .andExpect(jsonPath("$.mensaje").value("No se puede invitar a este email"));
            assertEquals(1, avisosEmail(bloqueada.id()), "la fila de regularización sobrevive al 409");
            assertEquals(0, avisosEmail(otroDueno.id()) + avisosEmail(administrador.id()), "a Dueños y Administradores nunca se les manda nada");
            invitar(token, dueno.comercioId(), delEquipo.email()).andExpect(status().isConflict())
                    .andExpect(jsonPath("$.mensaje").value("Esa persona ya es parte de tu equipo"));

            String email = emailNuevo();
            invitarOk(token, dueno.comercioId(), email);
            invitar(token, dueno.comercioId(), email).andExpect(status().isConflict())
                    .andExpect(jsonPath("$.mensaje").value("Ya hay una invitación pendiente para ese email. Podés reenviarla."));

            datos.cambiarEstadoComercio(dueno.comercioId(), "SUSPENDIDO");
            invitar(token, dueno.comercioId(), emailNuevo()).andExpect(status().isConflict())
                    .andExpect(jsonPath("$.mensaje").value("Este comercio no puede invitar empleados en este momento"));
        } finally {
            borrarRastros(dueno, otroDueno);
            borrarAvisos(bloqueada.id());
        }
    }

    @Test
    void elTopeDeCincoEnviosPorHoraEsPorComercioYSeLiberaPasadaLaHora() throws Exception {
        Dueno dueno = datos.registrarDuenoAprobado();
        try {
            String token = tokenDe(dueno);
            int segundoComercio = testSupportService.clonarComercio(dueno.comercioId(), "Segundo " + DatosPruebaEmpleado.sufijo(), null);
            for (int i = 0; i < 5; i++) {
                invitarOk(token, dueno.comercioId(), emailNuevo());
            }

            invitar(token, dueno.comercioId(), emailNuevo()).andExpect(status().isConflict())
                    .andExpect(jsonPath("$.mensaje").value(TOPE_A_LAS_13));
            invitarOk(token, segundoComercio, emailNuevo());

            reloj.fijar(INICIO.plusMinutes(61));
            invitarOk(token, dueno.comercioId(), emailNuevo());
        } finally {
            borrarRastros(dueno);
        }
    }

    @Test
    void elEquipoListaMiembrosPorFechaDeAltaEInvitacionesVisiblesSinElCodigo() throws Exception {
        Dueno dueno = datos.registrarDuenoAprobado();
        Cuenta primero = datos.registrarClienteConCredenciales();
        Cuenta tercero = datos.registrarClienteConCredenciales();
        Cuenta segundo = datos.registrarClienteConCredenciales();
        try {
            String token = tokenDe(dueno);
            datos.vincularEmpleado(primero.id(), dueno.comercioId(), "ACTIVO", INICIO.minusDays(3));
            datos.vincularEmpleado(tercero.id(), dueno.comercioId(), "INACTIVO", INICIO.minusDays(1));
            datos.vincularEmpleado(segundo.id(), dueno.comercioId(), "ACTIVO", INICIO.minusDays(2));

            int pendiente = invitarOk(token, dueno.comercioId(), emailNuevo());
            int vencida = invitarOk(token, dueno.comercioId(), emailNuevo());
            int bloqueada = invitarOk(token, dueno.comercioId(), emailNuevo());
            reloj.fijar(INICIO.plusMinutes(61));
            int cancelada = invitarOk(token, dueno.comercioId(), emailNuevo());
            int aceptada = invitarOk(token, dueno.comercioId(), emailNuevo());
            int reemplazada = invitarOk(token, dueno.comercioId(), emailNuevo());
            jdbcTemplate.update("UPDATE invitacion_empleado SET fecha_vencimiento = ? WHERE id = ?", INICIO.minusMinutes(1), vencida);
            ponerEstado(bloqueada, "INVALIDADA");
            ponerEstado(cancelada, "CANCELADA");
            ponerEstado(aceptada, "ACEPTADA");
            ponerEstado(reemplazada, "REEMPLAZADA");

            String cuerpo = equipo(token, dueno.comercioId()).andExpect(status().isOk())
                    .andExpect(jsonPath("$.data.miembros.length()").value(3))
                    .andExpect(jsonPath("$.data.miembros[0].empleadoId").value(primero.id()))
                    .andExpect(jsonPath("$.data.miembros[0].estado").value("ACTIVO"))
                    .andExpect(jsonPath("$.data.miembros[0].email").value(primero.email()))
                    .andExpect(jsonPath("$.data.miembros[0].nombre").value("Equipo"))
                    .andExpect(jsonPath("$.data.miembros[0].apellido").value("Prueba"))
                    .andExpect(jsonPath("$.data.miembros[0].fotoPerfilUrl").exists())
                    .andExpect(jsonPath("$.data.miembros[0].fechaAlta").value("2026-10-03T12:00:00"))
                    .andExpect(jsonPath("$.data.miembros[0].fechaBaja").doesNotExist())
                    .andExpect(jsonPath("$.data.miembros[1].empleadoId").value(segundo.id()))
                    .andExpect(jsonPath("$.data.miembros[2].empleadoId").value(tercero.id()))
                    .andExpect(jsonPath("$.data.miembros[2].estado").value("INACTIVO"))
                    .andExpect(jsonPath("$.data.miembros[2].fechaBaja").value("2026-10-06T12:00:00"))
                    .andExpect(jsonPath("$.data.invitaciones.length()").value(3))
                    .andReturn().getResponse().getContentAsString();

            JsonNode invitaciones = objectMapper.readTree(cuerpo).path("data").path("invitaciones");
            Map<Integer, String> estados = new java.util.HashMap<>();
            invitaciones.forEach(nodo -> estados.put(nodo.path("id").asInt(), nodo.path("estado").asText()));
            assertEquals(Map.of(pendiente, "PENDIENTE", vencida, "VENCIDA", bloqueada, "INVALIDADA"), estados);
            assertFalse(cuerpo.contains("codigo"), "el código nunca viaja en el listado");
        } finally {
            borrarRastros(dueno);
        }
    }

    @Test
    void cadaComercioDelMismoDuenoVeSoloSuEquipoYNoPuedeTocarLasInvitacionesDelOtro() throws Exception {
        Dueno dueno = datos.registrarDuenoAprobado();
        try {
            String token = tokenDe(dueno);
            int comercioB = testSupportService.clonarComercio(dueno.comercioId(), "Otro " + DatosPruebaEmpleado.sufijo(), null);
            String email = emailNuevo();
            int enA = invitarOk(token, dueno.comercioId(), email);

            equipo(token, comercioB).andExpect(status().isOk()).andExpect(jsonPath("$.data.invitaciones.length()").value(0));
            equipo(token, dueno.comercioId()).andExpect(status().isOk()).andExpect(jsonPath("$.data.invitaciones.length()").value(1));
            invitar(token, comercioB, email).andExpect(status().isCreated());

            String reenvioAjeno = reenviar(token, comercioB, enA).andExpect(status().isNotFound()).andReturn().getResponse().getContentAsString();
            String cancelAjeno = cancelar(token, comercioB, enA).andExpect(status().isNotFound()).andReturn().getResponse().getContentAsString();
            String inexistente = reenviar(token, comercioB, 2_000_000_000).andExpect(status().isNotFound()).andReturn().getResponse().getContentAsString();
            assertEquals(reenvioAjeno, inexistente);
            assertEquals(cancelAjeno, cancelar(token, comercioB, 2_000_000_000).andReturn().getResponse().getContentAsString());
            assertEquals("PENDIENTE", estadoDe(enA));
        } finally {
            borrarRastros(dueno);
        }
    }

    @Test
    void reenviarCreaUnaFilaNuevaYDejaLaAnteriorReemplazada() throws Exception {
        Dueno dueno = datos.registrarDuenoAprobado();
        String email = emailNuevo();
        try {
            String token = tokenDe(dueno);
            int original = invitarOk(token, dueno.comercioId(), email);

            reloj.fijar(INICIO.plusMinutes(5));
            ResultActions respuesta = reenviar(token, dueno.comercioId(), original).andExpect(status().isOk())
                    .andExpect(jsonPath("$.mensaje").value("Invitación reenviada a " + email))
                    .andExpect(jsonPath("$.data.estado").value("PENDIENTE"))
                    .andExpect(jsonPath("$.data.fechaCreacion").value("2026-10-06T12:05:00"))
                    .andExpect(jsonPath("$.data.fechaVencimiento").value("2026-10-13T12:05:00"))
                    .andExpect(jsonPath("$.data.codigo").doesNotExist());
            int nueva = idDe(respuesta);

            assertNotEquals(original, nueva);
            assertEquals("REEMPLAZADA", estadoDe(original));
            assertEquals("PENDIENTE", estadoDe(nueva));
            String codigoNuevo = jdbcTemplate.queryForObject("SELECT codigo FROM invitacion_empleado WHERE id = ?", String.class, nueva);
            verify(emailService, timeout(2000)).enviarInvitacionEmpleado(eq(email), anyString(), eq(dueno.nombreComercio()), eq(codigoNuevo));
            equipo(token, dueno.comercioId()).andExpect(jsonPath("$.data.invitaciones.length()").value(1))
                    .andExpect(jsonPath("$.data.invitaciones[0].id").value(nueva));
        } finally {
            borrarRastros(dueno);
        }
    }

    @Test
    void sePuedeReenviarUnaInvitacionVencidaOConElCodigoBloqueado() throws Exception {
        Dueno dueno = datos.registrarDuenoAprobado();
        try {
            String token = tokenDe(dueno);
            int vencida = invitarOk(token, dueno.comercioId(), emailNuevo());
            int bloqueada = invitarOk(token, dueno.comercioId(), emailNuevo());
            jdbcTemplate.update("UPDATE invitacion_empleado SET fecha_vencimiento = ? WHERE id = ?", INICIO.minusMinutes(1), vencida);
            ponerEstado(bloqueada, "INVALIDADA");

            int deVencida = idDe(reenviar(token, dueno.comercioId(), vencida).andExpect(status().isOk()));
            int deBloqueada = idDe(reenviar(token, dueno.comercioId(), bloqueada).andExpect(status().isOk()));

            assertEquals("REEMPLAZADA", estadoDe(vencida));
            assertEquals("REEMPLAZADA", estadoDe(bloqueada));
            assertEquals("PENDIENTE", estadoDe(deVencida));
            assertEquals("PENDIENTE", estadoDe(deBloqueada));
        } finally {
            borrarRastros(dueno);
        }
    }

    @Test
    void noSeReenviaNiSeCancelaUnaInvitacionYaResuelta() throws Exception {
        Dueno dueno = datos.registrarDuenoAprobado();
        try {
            String token = tokenDe(dueno);
            for (String estado : List.of("ACEPTADA", "CANCELADA", "REEMPLAZADA")) {
                int invitacion = invitarOk(token, dueno.comercioId(), emailNuevo());
                ponerEstado(invitacion, estado);

                reenviar(token, dueno.comercioId(), invitacion).andExpect(status().isConflict())
                        .andExpect(jsonPath("$.mensaje").value("Esta invitación ya no se puede reenviar"));
                cancelar(token, dueno.comercioId(), invitacion).andExpect(status().isConflict())
                        .andExpect(jsonPath("$.mensaje").value("Esta invitación ya no se puede cancelar"));
                assertEquals(estado, estadoDe(invitacion), "el 409 no toca la fila");
            }
        } finally {
            borrarRastros(dueno);
        }
    }

    @Test
    void reenviarTambienRespetaElTopeDeEnviosPorHora() throws Exception {
        Dueno dueno = datos.registrarDuenoAprobado();
        try {
            String token = tokenDe(dueno);
            int primera = invitarOk(token, dueno.comercioId(), emailNuevo());
            for (int i = 0; i < 4; i++) {
                invitarOk(token, dueno.comercioId(), emailNuevo());
            }

            reenviar(token, dueno.comercioId(), primera).andExpect(status().isConflict())
                    .andExpect(jsonPath("$.mensaje").value(TOPE_A_LAS_13));
            assertEquals("PENDIENTE", estadoDe(primera), "el 409 no reemplaza nada");
        } finally {
            borrarRastros(dueno);
        }
    }

    @Test
    void cancelarDejaLaInvitacionCanceladaLaSacaDelListadoYLiberaElPar() throws Exception {
        Dueno dueno = datos.registrarDuenoAprobado();
        String email = emailNuevo();
        try {
            String token = tokenDe(dueno);
            int invitacion = invitarOk(token, dueno.comercioId(), email);

            cancelar(token, dueno.comercioId(), invitacion).andExpect(status().isOk())
                    .andExpect(jsonPath("$.mensaje").value("Invitación cancelada"));

            assertEquals("CANCELADA", estadoDe(invitacion));
            equipo(token, dueno.comercioId()).andExpect(jsonPath("$.data.invitaciones.length()").value(0));
            cancelar(token, dueno.comercioId(), invitacion).andExpect(status().isConflict())
                    .andExpect(jsonPath("$.mensaje").value("Esta invitación ya no se puede cancelar"));
            invitar(token, dueno.comercioId(), email).andExpect(status().isCreated());
            assertTrue(jdbcTemplate.queryForObject("SELECT COUNT(*) FROM invitacion_empleado WHERE comercio_id = ?", Integer.class,
                    dueno.comercioId()) == 2, "no se borra nada");
        } finally {
            borrarRastros(dueno);
        }
    }

    @Test
    void losAtajosDeTestDevuelvenElCodigoVencenLaInvitacionYCuentanLosEmailsDeRegularizacion() throws Exception {
        Dueno dueno = datos.registrarDuenoAprobado();
        Cuenta bloqueada = datos.registrarClienteConCredenciales();
        String email = emailNuevo();
        try {
            String token = tokenDe(dueno);
            datos.cambiarEstadoUsuario(bloqueada.id(), "BLOQUEADO");
            int primera = invitarOk(token, dueno.comercioId(), email);
            String codigoPrimera = jdbcTemplate.queryForObject("SELECT codigo FROM invitacion_empleado WHERE id = ?", String.class, primera);

            mockMvc.perform(get("/api/v1/test/invitaciones-empleado/codigo").param("email", email.toUpperCase())
                            .param("comercioId", String.valueOf(dueno.comercioId())))
                    .andExpect(status().isOk()).andExpect(jsonPath("$.data").value(codigoPrimera));
            mockMvc.perform(get("/api/v1/test/invitaciones-empleado/codigo").param("email", emailNuevo())
                            .param("comercioId", String.valueOf(dueno.comercioId())))
                    .andExpect(status().isNotFound());

            int segunda = idDe(reenviar(token, dueno.comercioId(), primera).andExpect(status().isOk()));
            String codigoSegunda = jdbcTemplate.queryForObject("SELECT codigo FROM invitacion_empleado WHERE id = ?", String.class, segunda);
            mockMvc.perform(get("/api/v1/test/invitaciones-empleado/codigo").param("email", email)
                            .param("comercioId", String.valueOf(dueno.comercioId())))
                    .andExpect(jsonPath("$.data").value(codigoSegunda));

            mockMvc.perform(put("/api/v1/test/invitaciones-empleado/" + segunda + "/vencer")).andExpect(status().isOk());
            assertEquals("PENDIENTE", estadoDe(segunda));
            assertTrue(jdbcTemplate.queryForObject("SELECT fecha_vencimiento FROM invitacion_empleado WHERE id = ?", LocalDateTime.class,
                    segunda).isBefore(INICIO));
            equipo(token, dueno.comercioId()).andExpect(jsonPath("$.data.invitaciones[0].estado").value("VENCIDA"));
            mockMvc.perform(put("/api/v1/test/invitaciones-empleado/2000000000/vencer")).andExpect(status().isNotFound());

            mockMvc.perform(get("/api/v1/test/emails-regularizacion/cantidad").param("email", bloqueada.email()))
                    .andExpect(jsonPath("$.data").value(0));
            invitar(token, dueno.comercioId(), bloqueada.email()).andExpect(status().isConflict());
            invitar(token, dueno.comercioId(), bloqueada.email().toUpperCase()).andExpect(status().isConflict());
            mockMvc.perform(get("/api/v1/test/emails-regularizacion/cantidad").param("email", bloqueada.email()))
                    .andExpect(status().isOk()).andExpect(jsonPath("$.data").value(2));
            mockMvc.perform(get("/api/v1/test/emails-regularizacion/cantidad").param("email", emailNuevo()))
                    .andExpect(jsonPath("$.data").value(0));
        } finally {
            borrarRastros(dueno);
            borrarAvisos(bloqueada.id());
        }
    }
}
