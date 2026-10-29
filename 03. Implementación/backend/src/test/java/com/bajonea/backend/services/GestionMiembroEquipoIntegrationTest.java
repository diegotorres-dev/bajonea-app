package com.bajonea.backend.services;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.bajonea.backend.enums.EstadoEmpleadoComercio;
import com.bajonea.backend.enums.MotivoHistorialEmpleado;
import com.bajonea.backend.services.DatosPruebaEmpleado.Cuenta;
import com.bajonea.backend.services.DatosPruebaEmpleado.Dueno;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.LocalDate;
import java.time.LocalDateTime;
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
 * Desactivar y reactivar a un miembro del equipo (E4, bloque A1) por HTTP real contra {@code bajonea_test}: la
 * escritura de la relación, del historial y de los avisos, la idempotencia, las reglas de reactivación (quién dio
 * de baja, invitación pendiente, aptitud de la cuenta, estado del comercio) y la seguridad por rol y por comercio.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class GestionMiembroEquipoIntegrationTest {

    private static final String EQUIPO = "/api/v1/comercios/equipo";
    private static final String HEADER = "X-Comercio-Id";

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

    @MockitoBean
    private EmailService emailService;

    private DatosPruebaEmpleado datos;

    @BeforeEach
    void preparar() {
        datos = new DatosPruebaEmpleado(registroService, objectMapper, jdbcTemplate);
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

    private ResultActions desactivar(String token, int comercioId, int empleadoId) throws Exception {
        return mockMvc.perform(conToken(put(EQUIPO + "/miembros/" + empleadoId + "/desactivar"), token, comercioId));
    }

    private ResultActions reactivar(String token, int comercioId, int empleadoId) throws Exception {
        return mockMvc.perform(conToken(put(EQUIPO + "/miembros/" + empleadoId + "/reactivar"), token, comercioId));
    }

    private JsonNode equipo(String token, int comercioId) throws Exception {
        String cuerpo = mockMvc.perform(conToken(get(EQUIPO), token, comercioId)).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return objectMapper.readTree(cuerpo).path("data");
    }

    private JsonNode miembro(String token, int comercioId, int empleadoId) throws Exception {
        for (JsonNode miembro : equipo(token, comercioId).path("miembros")) {
            if (miembro.path("empleadoId").asInt() == empleadoId) {
                return miembro;
            }
        }
        throw new AssertionError("El miembro " + empleadoId + " no está en el equipo");
    }

    private record Escena(Dueno dueno, String token, Cuenta empleado, int relacionId) {
    }

    private Escena escena() throws Exception {
        Dueno dueno = datos.registrarDuenoAprobado();
        String token = tokenDe(dueno);
        Cuenta empleado = datos.registrarClienteConCredenciales();
        int relacionId = datos.vincularEmpleado(empleado.id(), dueno.comercioId(), "ACTIVO", LocalDateTime.now().minusDays(2));
        return new Escena(dueno, token, empleado, relacionId);
    }

    private String estadoRelacion(int relacionId) {
        return jdbcTemplate.queryForObject("SELECT estado FROM empleado_comercio WHERE id = ?", String.class, relacionId);
    }

    private int filasDeHistorial(int relacionId, String motivo) {
        return jdbcTemplate.queryForObject("SELECT COUNT(*) FROM historial_empleado_comercio WHERE empleado_comercio_id = ? AND motivo = ?",
                Integer.class, relacionId, motivo);
    }

    private int avisos(int usuarioId, String tipo) {
        return jdbcTemplate.queryForObject("SELECT COUNT(*) FROM notificacion WHERE usuario_id = ? AND tipo = ?", Integer.class, usuarioId, tipo);
    }

    private void avisoViejoDelComercio(int usuarioId, int comercioId) {
        jdbcTemplate.update("INSERT INTO notificacion (usuario_id, tipo, mensaje, leida, fecha_creacion, canal, estado, entidad_tipo, entidad_id, comercio_id) "
                + "VALUES (?, 'NUEVO_PEDIDO', 'Aviso viejo', 0, ?, 'PUSH', 'PENDIENTE', 'COMERCIO', ?, ?)",
                usuarioId, LocalDateTime.now().minusHours(3), comercioId, comercioId);
    }

    private int avisosDelComercio(int usuarioId, int comercioId) {
        return jdbcTemplate.queryForObject("SELECT COUNT(*) FROM notificacion WHERE usuario_id = ? AND comercio_id = ?", Integer.class,
                usuarioId, comercioId);
    }

    @Test
    void desactivarPasaLaRelacionAInactivaEscribeLaBajaYAvisaAlEmpleado() throws Exception {
        Escena e = escena();
        avisoViejoDelComercio(e.empleado().id(), e.dueno().comercioId());

        desactivar(e.token(), e.dueno().comercioId(), e.empleado().id())
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.mensaje").value("Miembro dado de baja"))
                .andExpect(jsonPath("$.data.empleadoId").value(e.empleado().id()))
                .andExpect(jsonPath("$.data.estado").value("INACTIVO"))
                .andExpect(jsonPath("$.data.motivoBaja").value("BAJA_DUENO"))
                .andExpect(jsonPath("$.data.puedeReactivar").value(true));

        assertEquals("INACTIVO", estadoRelacion(e.relacionId()));
        assertTrue(jdbcTemplate.queryForObject("SELECT fecha_baja IS NOT NULL FROM empleado_comercio WHERE id = ?", Boolean.class, e.relacionId()));
        Map<String, Object> fila = jdbcTemplate.queryForMap("SELECT * FROM historial_empleado_comercio WHERE empleado_comercio_id = ? AND motivo = 'BAJA_DUENO'",
                e.relacionId());
        assertEquals("ACTIVO", fila.get("estado_origen"));
        assertEquals("INACTIVO", fila.get("estado_destino"));
        assertEquals(e.dueno().id(), fila.get("actor_usuario_id"));
        assertNull(fila.get("invitacion_id"));
        assertEquals(e.dueno().comercioId(), fila.get("comercio_id"));

        assertEquals(0, avisosDelComercio(e.empleado().id(), e.dueno().comercioId()), "los avisos del comercio se purgan");
        Map<String, Object> t32 = jdbcTemplate.queryForMap("SELECT * FROM notificacion WHERE usuario_id = ? AND tipo = 'EMPLEADO_DESACTIVADO'", e.empleado().id());
        assertNull(t32.get("comercio_id"), "T32 es un aviso personal: sin comercio_id");
        assertEquals("COMERCIO", t32.get("entidad_tipo"));
        assertEquals(e.dueno().comercioId(), t32.get("entidad_id"));
        assertEquals("PUSH", t32.get("canal"));
        assertEquals(e.dueno().nombreComercio() + " te dio de baja del equipo. Ya no tenés acceso a ese comercio.", t32.get("mensaje"));
    }

    @Test
    void desactivarDosVecesEsIdempotenteYNoEscribeNada() throws Exception {
        Escena e = escena();
        desactivar(e.token(), e.dueno().comercioId(), e.empleado().id()).andExpect(status().isOk());
        String bajaOriginal = jdbcTemplate.queryForObject("SELECT CAST(fecha_baja AS CHAR) FROM empleado_comercio WHERE id = ?", String.class, e.relacionId());

        desactivar(e.token(), e.dueno().comercioId(), e.empleado().id())
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.mensaje").value("El miembro ya estaba inactivo"))
                .andExpect(jsonPath("$.data.estado").value("INACTIVO"))
                .andExpect(jsonPath("$.data.motivoBaja").value("BAJA_DUENO"))
                .andExpect(jsonPath("$.data.puedeReactivar").value(true));

        assertEquals(1, filasDeHistorial(e.relacionId(), "BAJA_DUENO"));
        assertEquals(1, avisos(e.empleado().id(), "EMPLEADO_DESACTIVADO"));
        assertEquals(bajaOriginal, jdbcTemplate.queryForObject("SELECT CAST(fecha_baja AS CHAR) FROM empleado_comercio WHERE id = ?", String.class, e.relacionId()));
    }

    @Test
    void reactivarVuelveALaRelacionActivaEscribeLaReactivacionYAvisaAlEmpleado() throws Exception {
        Escena e = escena();
        desactivar(e.token(), e.dueno().comercioId(), e.empleado().id()).andExpect(status().isOk());
        avisoViejoDelComercio(e.empleado().id(), e.dueno().comercioId());

        reactivar(e.token(), e.dueno().comercioId(), e.empleado().id())
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.mensaje").value("Miembro reactivado"))
                .andExpect(jsonPath("$.data.estado").value("ACTIVO"))
                .andExpect(jsonPath("$.data.motivoBaja").doesNotExist())
                .andExpect(jsonPath("$.data.puedeReactivar").value(false))
                .andExpect(jsonPath("$.data.fechaBaja").doesNotExist());

        assertEquals("ACTIVO", estadoRelacion(e.relacionId()));
        assertNull(jdbcTemplate.queryForObject("SELECT fecha_baja FROM empleado_comercio WHERE id = ?", Object.class, e.relacionId()));
        Map<String, Object> fila = jdbcTemplate.queryForMap("SELECT * FROM historial_empleado_comercio WHERE empleado_comercio_id = ? AND motivo = 'REACTIVACION'",
                e.relacionId());
        assertEquals("INACTIVO", fila.get("estado_origen"));
        assertEquals("ACTIVO", fila.get("estado_destino"));
        assertEquals(e.dueno().id(), fila.get("actor_usuario_id"));
        assertNull(fila.get("invitacion_id"));

        assertEquals(0, avisosDelComercio(e.empleado().id(), e.dueno().comercioId()), "los avisos del comercio se purgan al reactivar");
        Map<String, Object> t37 = jdbcTemplate.queryForMap("SELECT * FROM notificacion WHERE usuario_id = ? AND tipo = 'EMPLEADO_REACTIVADO'", e.empleado().id());
        assertNull(t37.get("comercio_id"));
        assertEquals("COMERCIO", t37.get("entidad_tipo"));
        assertEquals(e.dueno().comercioId(), t37.get("entidad_id"));
        assertEquals(e.dueno().nombreComercio() + " te reactivó en el equipo. Ya podés volver a trabajar ahí.", t37.get("mensaje"));
        assertEquals(1, avisos(e.empleado().id(), "EMPLEADO_DESACTIVADO"), "T32 no se purga: queda en la campana personal");
    }

    @Test
    void reactivarUnMiembroYaActivoEsIdempotenteYNoEscribeNada() throws Exception {
        Escena e = escena();

        reactivar(e.token(), e.dueno().comercioId(), e.empleado().id())
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.mensaje").value("El miembro ya estaba activo"))
                .andExpect(jsonPath("$.data.estado").value("ACTIVO"));

        assertEquals(0, filasDeHistorial(e.relacionId(), "REACTIVACION"));
        assertEquals(0, avisos(e.empleado().id(), "EMPLEADO_REACTIVADO"));
    }

    @Test
    void noSeReactivaDirectamenteAQuienRenunciaOQuedoSinRegistroDeLaBaja() throws Exception {
        Escena renuncio = escena();
        testSupportService.cambiarEstadoRelacionEmpleado(renuncio.dueno().comercioId(), renuncio.empleado().id(),
                EstadoEmpleadoComercio.INACTIVO, MotivoHistorialEmpleado.RENUNCIA);
        reactivar(renuncio.token(), renuncio.dueno().comercioId(), renuncio.empleado().id())
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.data.codigo").value("EMPLEADO_NO_REACTIVABLE"))
                .andExpect(jsonPath("$.mensaje").value("Esta persona dejó el equipo por su cuenta. Para que vuelva, invitala de nuevo."));
        assertEquals("INACTIVO", estadoRelacion(renuncio.relacionId()));
        assertEquals(0, filasDeHistorial(renuncio.relacionId(), "REACTIVACION"));

        Escena sinRegistro = escena();
        testSupportService.cambiarEstadoRelacionEmpleado(sinRegistro.dueno().comercioId(), sinRegistro.empleado().id(), EstadoEmpleadoComercio.INACTIVO);
        reactivar(sinRegistro.token(), sinRegistro.dueno().comercioId(), sinRegistro.empleado().id())
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.data.codigo").value("EMPLEADO_NO_REACTIVABLE"));
        assertEquals("INACTIVO", estadoRelacion(sinRegistro.relacionId()));
    }

    @Test
    void noSeReactivaDirectamenteConUnaInvitacionPendienteVigenteDeLaMismaPersona() throws Exception {
        Escena e = escena();
        desactivar(e.token(), e.dueno().comercioId(), e.empleado().id()).andExpect(status().isOk());
        String invitacion = mockMvc.perform(conToken(post(EQUIPO + "/invitaciones"), e.token(), e.dueno().comercioId())
                        .contentType(MediaType.APPLICATION_JSON).content(objectMapper.writeValueAsString(Map.of("email", e.empleado().email()))))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        int invitacionId = objectMapper.readTree(invitacion).path("data").path("id").asInt();

        reactivar(e.token(), e.dueno().comercioId(), e.empleado().id())
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.data.codigo").value("INVITACION_PENDIENTE"))
                .andExpect(jsonPath("$.mensaje").value("Hay una invitación pendiente para esta persona. Cancelala primero."));
        assertEquals("INACTIVO", estadoRelacion(e.relacionId()));

        mockMvc.perform(conToken(put(EQUIPO + "/invitaciones/" + invitacionId + "/cancelar"), e.token(), e.dueno().comercioId())).andExpect(status().isOk());
        reactivar(e.token(), e.dueno().comercioId(), e.empleado().id()).andExpect(status().isOk());
        assertEquals("ACTIVO", estadoRelacion(e.relacionId()));
    }

    @Test
    void unaInvitacionPendienteYaVencidaNoImpideLaReactivacion() throws Exception {
        Escena e = escena();
        desactivar(e.token(), e.dueno().comercioId(), e.empleado().id()).andExpect(status().isOk());
        mockMvc.perform(conToken(post(EQUIPO + "/invitaciones"), e.token(), e.dueno().comercioId())
                        .contentType(MediaType.APPLICATION_JSON).content(objectMapper.writeValueAsString(Map.of("email", e.empleado().email()))))
                .andExpect(status().isCreated());
        jdbcTemplate.update("UPDATE invitacion_empleado SET fecha_vencimiento = ? WHERE comercio_id = ? AND email = ?",
                LocalDateTime.now().minusMinutes(5), e.dueno().comercioId(), e.empleado().email());

        reactivar(e.token(), e.dueno().comercioId(), e.empleado().id()).andExpect(status().isOk());
    }

    @Test
    void unaCuentaNoAptaDaUnConflictoGenericoQueNoRevelaElEstado() throws Exception {
        Escena bloqueada = escena();
        desactivar(bloqueada.token(), bloqueada.dueno().comercioId(), bloqueada.empleado().id()).andExpect(status().isOk());
        datos.cambiarEstadoUsuario(bloqueada.empleado().id(), "BLOQUEADO");
        String cuerpo = reactivar(bloqueada.token(), bloqueada.dueno().comercioId(), bloqueada.empleado().id())
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.mensaje").value("No se puede reactivar a esta persona"))
                .andExpect(jsonPath("$.data.codigo").doesNotExist())
                .andReturn().getResponse().getContentAsString();
        assertFalse(cuerpo.toLowerCase().contains("bloquead"), cuerpo);
        assertEquals("INACTIVO", estadoRelacion(bloqueada.relacionId()));
        assertEquals(0, filasDeHistorial(bloqueada.relacionId(), "REACTIVACION"));
        assertEquals(0, avisos(bloqueada.empleado().id(), "EMPLEADO_REACTIVADO"));
        assertEquals(0, jdbcTemplate.queryForObject("SELECT COUNT(*) FROM notificacion WHERE usuario_id = ? AND canal = 'EMAIL'", Integer.class,
                bloqueada.empleado().id()), "no se manda email de regularización al reactivar");

        Escena menor = escena();
        desactivar(menor.token(), menor.dueno().comercioId(), menor.empleado().id()).andExpect(status().isOk());
        datos.cambiarFechaNacimiento(menor.empleado().id(), LocalDate.now().minusYears(17));
        reactivar(menor.token(), menor.dueno().comercioId(), menor.empleado().id())
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.mensaje").value("No se puede reactivar a esta persona"));

        Escena otroRol = escena();
        desactivar(otroRol.token(), otroRol.dueno().comercioId(), otroRol.empleado().id()).andExpect(status().isOk());
        datos.hacerAdministrador(otroRol.empleado().id());
        reactivar(otroRol.token(), otroRol.dueno().comercioId(), otroRol.empleado().id())
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.mensaje").value("No se puede reactivar a esta persona"));
    }

    @Test
    void reactivarExigeElComercioOperativoYDesactivarTambienEstaBloqueadoConElComercioSuspendido() throws Exception {
        Escena e = escena();
        desactivar(e.token(), e.dueno().comercioId(), e.empleado().id()).andExpect(status().isOk());
        datos.cambiarEstadoComercio(e.dueno().comercioId(), "SUSPENDIDO");

        reactivar(e.token(), e.dueno().comercioId(), e.empleado().id())
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.data.codigo").value("COMERCIO_NO_OPERATIVO"));
        assertEquals("INACTIVO", estadoRelacion(e.relacionId()));

        Escena otra = escena();
        datos.cambiarEstadoComercio(otra.dueno().comercioId(), "SUSPENDIDO");
        desactivar(otra.token(), otra.dueno().comercioId(), otra.empleado().id())
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.data.codigo").value("COMERCIO_SUSPENDIDO"));
        assertEquals("ACTIVO", estadoRelacion(otra.relacionId()));

        Escena cerrada = escena();
        datos.cambiarEstadoComercio(cerrada.dueno().comercioId(), "CERRADO_TEMPORALMENTE");
        desactivar(cerrada.token(), cerrada.dueno().comercioId(), cerrada.empleado().id()).andExpect(status().isOk());
        assertEquals("INACTIVO", estadoRelacion(cerrada.relacionId()));
    }

    @Test
    void ladoSeguridadElMiembroAjenoNoExisteYSoloElDuenoPuedeGestionar() throws Exception {
        Escena e = escena();
        Escena ajena = escena();

        desactivar(e.token(), e.dueno().comercioId(), ajena.empleado().id()).andExpect(status().isNotFound())
                .andExpect(jsonPath("$.mensaje").value("Miembro no encontrado"));
        desactivar(e.token(), e.dueno().comercioId(), 987654321).andExpect(status().isNotFound());
        reactivar(e.token(), e.dueno().comercioId(), ajena.empleado().id()).andExpect(status().isNotFound());
        desactivar(e.token(), e.dueno().comercioId(), e.dueno().id()).andExpect(status().isNotFound());
        assertEquals("ACTIVO", estadoRelacion(ajena.relacionId()));

        desactivar(e.token(), ajena.dueno().comercioId(), ajena.empleado().id()).andExpect(status().isNotFound());
        assertEquals("ACTIVO", estadoRelacion(ajena.relacionId()), "un Dueño no gestiona los miembros de otro comercio");

        mockMvc.perform(put(EQUIPO + "/miembros/" + e.empleado().id() + "/desactivar").header(HEADER, e.dueno().comercioId()))
                .andExpect(status().isUnauthorized());
        mockMvc.perform(conToken(put(EQUIPO + "/miembros/" + e.empleado().id() + "/desactivar"), e.token(), null)).andExpect(status().isBadRequest());

        String tokenEmpleado = loginDe(e.empleado().nombreUsuario(), e.empleado().clave());
        mockMvc.perform(conToken(put(EQUIPO + "/miembros/" + e.empleado().id() + "/desactivar"), tokenEmpleado, e.dueno().comercioId()))
                .andExpect(status().isForbidden());
        mockMvc.perform(conToken(put(EQUIPO + "/miembros/" + e.empleado().id() + "/reactivar"), tokenEmpleado, e.dueno().comercioId()))
                .andExpect(status().isForbidden());
        assertEquals("ACTIVO", estadoRelacion(e.relacionId()));
    }

    @Test
    void elEmpleadoDadoDeBajaPierdeElAccesoEnLaSiguienteRequest() throws Exception {
        Escena e = escena();
        String tokenEmpleado = loginDe(e.empleado().nombreUsuario(), e.empleado().clave());
        mockMvc.perform(conToken(get("/api/v1/pedidos/comercio"), tokenEmpleado, e.dueno().comercioId())).andExpect(status().isOk());

        desactivar(e.token(), e.dueno().comercioId(), e.empleado().id()).andExpect(status().isOk());

        mockMvc.perform(conToken(get("/api/v1/pedidos/comercio"), tokenEmpleado, e.dueno().comercioId())).andExpect(status().isNotFound())
                .andExpect(jsonPath("$.data.codigo").value("COMERCIO_NO_DISPONIBLE"));
        mockMvc.perform(get("/api/v1/empleados/mis-comercios").header("Authorization", "Bearer " + tokenEmpleado))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.length()").value(0));
    }

    @Test
    void elListadoDelEquipoInformaElMotivoDeBajaYSiSePuedeReactivarConUnaSolaConsulta() throws Exception {
        Dueno dueno = datos.registrarDuenoAprobado();
        String token = tokenDe(dueno);
        Cuenta activo = datos.registrarClienteConCredenciales();
        Cuenta dadoDeBaja = datos.registrarClienteConCredenciales();
        Cuenta renuncio = datos.registrarClienteConCredenciales();
        Cuenta sinRegistro = datos.registrarClienteConCredenciales();
        LocalDateTime alta = LocalDateTime.now().minusDays(3);
        datos.vincularEmpleado(activo.id(), dueno.comercioId(), "ACTIVO", alta);
        datos.vincularEmpleado(dadoDeBaja.id(), dueno.comercioId(), "ACTIVO", alta);
        datos.vincularEmpleado(renuncio.id(), dueno.comercioId(), "ACTIVO", alta);
        datos.vincularEmpleado(sinRegistro.id(), dueno.comercioId(), "INACTIVO", alta);
        desactivar(token, dueno.comercioId(), dadoDeBaja.id()).andExpect(status().isOk());
        testSupportService.cambiarEstadoRelacionEmpleado(dueno.comercioId(), renuncio.id(), EstadoEmpleadoComercio.INACTIVO, MotivoHistorialEmpleado.RENUNCIA);

        JsonNode a = miembro(token, dueno.comercioId(), activo.id());
        assertEquals("ACTIVO", a.path("estado").asText());
        assertTrue(a.path("motivoBaja").isNull());
        assertFalse(a.path("puedeReactivar").asBoolean());
        JsonNode b = miembro(token, dueno.comercioId(), dadoDeBaja.id());
        assertEquals("BAJA_DUENO", b.path("motivoBaja").asText());
        assertTrue(b.path("puedeReactivar").asBoolean());
        JsonNode r = miembro(token, dueno.comercioId(), renuncio.id());
        assertEquals("RENUNCIA", r.path("motivoBaja").asText());
        assertFalse(r.path("puedeReactivar").asBoolean());
        JsonNode s = miembro(token, dueno.comercioId(), sinRegistro.id());
        assertTrue(s.path("motivoBaja").isNull());
        assertFalse(s.path("puedeReactivar").asBoolean());

        reactivar(token, dueno.comercioId(), dadoDeBaja.id()).andExpect(status().isOk());
        desactivar(token, dueno.comercioId(), dadoDeBaja.id()).andExpect(status().isOk());
        assertEquals("BAJA_DUENO", miembro(token, dueno.comercioId(), dadoDeBaja.id()).path("motivoBaja").asText(),
                "con varias bajas cuenta la última");
    }

    @Test
    void bajaYReactivacionVuelvenAEscribirSusFilasEnCadaCiclo() throws Exception {
        Escena e = escena();
        for (int ciclo = 0; ciclo < 3; ciclo++) {
            desactivar(e.token(), e.dueno().comercioId(), e.empleado().id()).andExpect(status().isOk());
            reactivar(e.token(), e.dueno().comercioId(), e.empleado().id()).andExpect(status().isOk());
        }
        List<String> motivos = jdbcTemplate.queryForList("SELECT motivo FROM historial_empleado_comercio WHERE empleado_comercio_id = ? ORDER BY id",
                String.class, e.relacionId());
        assertEquals(List.of("BAJA_DUENO", "REACTIVACION", "BAJA_DUENO", "REACTIVACION", "BAJA_DUENO", "REACTIVACION"), motivos);
        assertEquals(3, avisos(e.empleado().id(), "EMPLEADO_DESACTIVADO"));
        assertEquals(3, avisos(e.empleado().id(), "EMPLEADO_REACTIVADO"));
    }
}
