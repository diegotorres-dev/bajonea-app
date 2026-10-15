package com.bajonea.backend.services;

import static org.junit.jupiter.api.Assertions.assertEquals;
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

/**
 * Renuncia del Empleado a un comercio y consulta de su acceso propio (E4, bloque A2) por HTTP real contra
 * {@code bajonea_test}: la escritura de la relación, del historial y de los avisos, la idempotencia, el {@code 404}
 * idéntico sin relación, la seguridad por rol y el endpoint de acceso en todos sus casos.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class RenunciaEmpleadoIntegrationTest {

    private static final String EMPLEADOS = "/api/v1/empleados";
    private static final String EQUIPO = "/api/v1/comercios/equipo";
    private static final String HEADER = "X-Comercio-Id";
    private static final String NO_DISPONIBLE = "Comercio no encontrado";

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

    private record Escena(Dueno dueno, String tokenDueno, Cuenta empleado, String tokenEmpleado, int relacionId) {
    }

    private Escena escena() throws Exception {
        Dueno dueno = datos.registrarDuenoAprobado();
        datos.cambiarEstadoUsuario(dueno.id(), "ACTIVO");
        String tokenDueno = loginDe(dueno.nombreUsuario(), dueno.clave());
        Cuenta empleado = datos.registrarClienteConCredenciales();
        int relacionId = datos.vincularEmpleado(empleado.id(), dueno.comercioId(), "ACTIVO", LocalDateTime.now().minusDays(2));
        return new Escena(dueno, tokenDueno, empleado, loginDe(empleado.nombreUsuario(), empleado.clave()), relacionId);
    }

    private ResultActions renunciar(String token, int comercioId) throws Exception {
        return mockMvc.perform(put(EMPLEADOS + "/comercios/" + comercioId + "/renunciar").header("Authorization", "Bearer " + token));
    }

    private ResultActions acceso(String token, int comercioId) throws Exception {
        return mockMvc.perform(get(EMPLEADOS + "/comercios/" + comercioId + "/acceso").header("Authorization", "Bearer " + token));
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

    private int avisosDelComercio(int usuarioId, int comercioId) {
        return jdbcTemplate.queryForObject("SELECT COUNT(*) FROM notificacion WHERE usuario_id = ? AND comercio_id = ?", Integer.class,
                usuarioId, comercioId);
    }

    private void avisoViejoDelComercio(int usuarioId, int comercioId) {
        jdbcTemplate.update("INSERT INTO notificacion (usuario_id, tipo, mensaje, leida, fecha_creacion, canal, estado, entidad_tipo, entidad_id, comercio_id) "
                + "VALUES (?, 'NUEVO_PEDIDO', 'Aviso viejo', 0, ?, 'PUSH', 'PENDIENTE', 'COMERCIO', ?, ?)",
                usuarioId, LocalDateTime.now().minusHours(3), comercioId, comercioId);
    }

    @Test
    void renunciarPasaLaRelacionAInactivaEscribeLaRenunciaPurgaSusAvisosYAvisaAlDueno() throws Exception {
        Escena e = escena();
        avisoViejoDelComercio(e.empleado().id(), e.dueno().comercioId());
        avisoViejoDelComercio(e.dueno().id(), e.dueno().comercioId());

        renunciar(e.tokenEmpleado(), e.dueno().comercioId())
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.mensaje").value("Dejaste de trabajar en el comercio"))
                .andExpect(jsonPath("$.data").doesNotExist());

        assertEquals("INACTIVO", estadoRelacion(e.relacionId()));
        assertTrue(jdbcTemplate.queryForObject("SELECT fecha_baja IS NOT NULL FROM empleado_comercio WHERE id = ?", Boolean.class, e.relacionId()));
        Map<String, Object> fila = jdbcTemplate.queryForMap("SELECT * FROM historial_empleado_comercio WHERE empleado_comercio_id = ? AND motivo = 'RENUNCIA'",
                e.relacionId());
        assertEquals("ACTIVO", fila.get("estado_origen"));
        assertEquals("INACTIVO", fila.get("estado_destino"));
        assertEquals(e.empleado().id(), fila.get("actor_usuario_id"));
        assertNull(fila.get("invitacion_id"));
        assertEquals(e.dueno().comercioId(), fila.get("comercio_id"));

        assertEquals(0, avisosDelComercio(e.empleado().id(), e.dueno().comercioId()), "los avisos del comercio del Empleado se purgan");
        assertEquals(0, avisos(e.empleado().id(), "EMPLEADO_DESACTIVADO"), "el Empleado no recibe aviso de su propia renuncia");
        Map<String, Object> t34 = jdbcTemplate.queryForMap("SELECT * FROM notificacion WHERE usuario_id = ? AND tipo = 'EMPLEADO_DESACTIVADO'", e.dueno().id());
        assertEquals(e.dueno().comercioId(), t34.get("comercio_id"), "T34 es del comercio: se ve con ese comercio abierto");
        assertEquals("COMERCIO", t34.get("entidad_tipo"));
        assertEquals(e.dueno().comercioId(), t34.get("entidad_id"));
        assertEquals("PUSH", t34.get("canal"));
        assertEquals("Equipo Prueba dejó de trabajar en " + e.dueno().nombreComercio() + ".", t34.get("mensaje"));
        assertEquals(2, avisosDelComercio(e.dueno().id(), e.dueno().comercioId()), "los avisos del Dueño no se purgan: el viejo y T34");
    }

    @Test
    void renunciarDosVecesEsIdempotenteYNoEscribeNada() throws Exception {
        Escena e = escena();
        renunciar(e.tokenEmpleado(), e.dueno().comercioId()).andExpect(status().isOk());
        String bajaOriginal = jdbcTemplate.queryForObject("SELECT CAST(fecha_baja AS CHAR) FROM empleado_comercio WHERE id = ?", String.class, e.relacionId());

        renunciar(e.tokenEmpleado(), e.dueno().comercioId())
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.mensaje").value("Ya habías dejado de trabajar en este comercio"));

        assertEquals(1, filasDeHistorial(e.relacionId(), "RENUNCIA"));
        assertEquals(1, avisos(e.dueno().id(), "EMPLEADO_DESACTIVADO"), "T34 una sola vez");
        assertEquals(bajaOriginal, jdbcTemplate.queryForObject("SELECT CAST(fecha_baja AS CHAR) FROM empleado_comercio WHERE id = ?", String.class, e.relacionId()));
    }

    @Test
    void renunciarSobreUnaRelacionQueElDuenoYaDioDeBajaEsIdempotenteYNoEscribeNada() throws Exception {
        Escena e = escena();
        testSupportService.cambiarEstadoRelacionEmpleado(e.dueno().comercioId(), e.empleado().id(), EstadoEmpleadoComercio.INACTIVO,
                MotivoHistorialEmpleado.BAJA_DUENO);

        renunciar(e.tokenEmpleado(), e.dueno().comercioId())
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.mensaje").value("Ya habías dejado de trabajar en este comercio"));

        assertEquals(0, filasDeHistorial(e.relacionId(), "RENUNCIA"));
        assertEquals(1, filasDeHistorial(e.relacionId(), "BAJA_DUENO"));
        assertEquals(0, avisos(e.dueno().id(), "EMPLEADO_DESACTIVADO"));
    }

    @Test
    void sinRelacionConElComercioOConUnComercioInexistenteEsElMismoNoDisponibleSinPistas() throws Exception {
        Escena e = escena();
        Escena ajena = escena();

        String delComercioAjeno = renunciar(e.tokenEmpleado(), ajena.dueno().comercioId()).andExpect(status().isNotFound())
                .andExpect(jsonPath("$.mensaje").value(NO_DISPONIBLE))
                .andExpect(jsonPath("$.data.codigo").value("COMERCIO_NO_DISPONIBLE"))
                .andReturn().getResponse().getContentAsString();
        String delInexistente = renunciar(e.tokenEmpleado(), 987654321).andExpect(status().isNotFound())
                .andReturn().getResponse().getContentAsString();
        assertEquals(objectMapper.readTree(delComercioAjeno), objectMapper.readTree(delInexistente), "el mismo cuerpo, sin distinguir los casos");
        assertEquals("ACTIVO", estadoRelacion(ajena.relacionId()), "renunciar a un comercio ajeno no toca a nadie");

        Cuenta sinNada = datos.registrarClienteConCredenciales();
        String tokenSinNada = loginDe(sinNada.nombreUsuario(), sinNada.clave());
        renunciar(tokenSinNada, e.dueno().comercioId()).andExpect(status().isNotFound())
                .andExpect(jsonPath("$.data.codigo").value("COMERCIO_NO_DISPONIBLE"));
        assertEquals("ACTIVO", estadoRelacion(e.relacionId()));
        assertEquals(0, filasDeHistorial(e.relacionId(), "RENUNCIA"));
    }

    @Test
    void laSeguridadRechazaAlAnonimoAlDuenoYAlAdministradorSinLlegarAlServicio() throws Exception {
        Escena e = escena();

        mockMvc.perform(put(EMPLEADOS + "/comercios/" + e.dueno().comercioId() + "/renunciar")).andExpect(status().isUnauthorized());
        renunciar(e.tokenDueno(), e.dueno().comercioId()).andExpect(status().isForbidden());

        Cuenta administrador = datos.registrarClienteConCredenciales();
        datos.hacerAdministrador(administrador.id());
        jdbcTemplate.update("UPDATE usuario SET rol = 'ADMINISTRADOR' WHERE id = ?", administrador.id());
        String tokenAdministrador = loginDe(administrador.nombreUsuario(), administrador.clave());
        renunciar(tokenAdministrador, e.dueno().comercioId()).andExpect(status().isForbidden());

        assertEquals("ACTIVO", estadoRelacion(e.relacionId()));
        assertEquals(0, filasDeHistorial(e.relacionId(), "RENUNCIA"));
    }

    @Test
    void elHeaderDelComercioActivoSeIgnora() throws Exception {
        Escena e = escena();
        mockMvc.perform(put(EMPLEADOS + "/comercios/" + e.dueno().comercioId() + "/renunciar").header("Authorization", "Bearer " + e.tokenEmpleado())
                        .header(HEADER, "no-es-un-numero"))
                .andExpect(status().isOk());
        assertEquals("INACTIVO", estadoRelacion(e.relacionId()));
    }

    @Test
    void sePuedeRenunciarConElComercioEnCualquierEstado() throws Exception {
        for (String estadoComercio : List.of("SUSPENDIDO", "CERRADO_TEMPORALMENTE", "INACTIVO", "RECHAZADO", "PENDIENTE", "APTO_VENTA")) {
            Escena e = escena();
            datos.cambiarEstadoComercio(e.dueno().comercioId(), estadoComercio);

            renunciar(e.tokenEmpleado(), e.dueno().comercioId()).andExpect(status().isOk());

            assertEquals("INACTIVO", estadoRelacion(e.relacionId()), "con el comercio " + estadoComercio);
            assertEquals(1, filasDeHistorial(e.relacionId(), "RENUNCIA"), "con el comercio " + estadoComercio);
        }
    }

    @Test
    void despuesDeRenunciarSePierdeElAccesoYElDuenoNoPuedeReactivarDirectamente() throws Exception {
        Escena e = escena();
        mockMvc.perform(get("/api/v1/pedidos/comercio").header("Authorization", "Bearer " + e.tokenEmpleado()).header(HEADER, e.dueno().comercioId()))
                .andExpect(status().isOk());

        renunciar(e.tokenEmpleado(), e.dueno().comercioId()).andExpect(status().isOk());

        mockMvc.perform(get("/api/v1/pedidos/comercio").header("Authorization", "Bearer " + e.tokenEmpleado()).header(HEADER, e.dueno().comercioId()))
                .andExpect(status().isNotFound()).andExpect(jsonPath("$.data.codigo").value("COMERCIO_NO_DISPONIBLE"));
        mockMvc.perform(get(EMPLEADOS + "/mis-comercios").header("Authorization", "Bearer " + e.tokenEmpleado()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.length()").value(0));

        mockMvc.perform(get(EQUIPO).header("Authorization", "Bearer " + e.tokenDueno()).header(HEADER, e.dueno().comercioId()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.miembros[0].estado").value("INACTIVO"))
                .andExpect(jsonPath("$.data.miembros[0].motivoBaja").value("RENUNCIA"))
                .andExpect(jsonPath("$.data.miembros[0].puedeReactivar").value(false));
        mockMvc.perform(put(EQUIPO + "/miembros/" + e.empleado().id() + "/reactivar").header("Authorization", "Bearer " + e.tokenDueno())
                        .header(HEADER, e.dueno().comercioId()))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.data.codigo").value("EMPLEADO_NO_REACTIVABLE"));
    }

    @Test
    void renunciarYVolverASerInvitadoDejaElHistorialCompleto() throws Exception {
        Escena e = escena();
        renunciar(e.tokenEmpleado(), e.dueno().comercioId()).andExpect(status().isOk());
        mockMvc.perform(post(EQUIPO + "/invitaciones").header("Authorization", "Bearer " + e.tokenDueno()).header(HEADER, e.dueno().comercioId())
                        .contentType(MediaType.APPLICATION_JSON).content(objectMapper.writeValueAsString(Map.of("email", e.empleado().email()))))
                .andExpect(status().isCreated());
        String codigo = jdbcTemplate.queryForObject("SELECT codigo FROM invitacion_empleado WHERE comercio_id = ? AND email = ? AND estado = 'PENDIENTE'",
                String.class, e.dueno().comercioId(), e.empleado().email());
        mockMvc.perform(post("/api/v1/auth/invitaciones-empleado/aceptar").contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("email", e.empleado().email(), "codigo", codigo))))
                .andExpect(status().isOk());

        assertEquals("ACTIVO", estadoRelacion(e.relacionId()));
        assertEquals(List.of("RENUNCIA", "ACEPTACION", "REACTIVACION"), jdbcTemplate.queryForList(
                "SELECT motivo FROM historial_empleado_comercio WHERE empleado_comercio_id = ? ORDER BY id", String.class, e.relacionId()));
    }

    @Test
    void elAccesoDeUnaRelacionActivaNoTieneMotivoDeBaja() throws Exception {
        Escena e = escena();

        acceso(e.tokenEmpleado(), e.dueno().comercioId())
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.estado").value("ACTIVO"))
                .andExpect(jsonPath("$.data.motivoBaja").doesNotExist())
                .andExpect(jsonPath("$.data.comercioAccesible").value(true));
    }

    @Test
    void elAccesoInformaSiLaBajaLaDioElDuenoOFueUnaRenuncia() throws Exception {
        Escena baja = escena();
        mockMvc.perform(put(EQUIPO + "/miembros/" + baja.empleado().id() + "/desactivar").header("Authorization", "Bearer " + baja.tokenDueno())
                .header(HEADER, baja.dueno().comercioId())).andExpect(status().isOk());
        acceso(baja.tokenEmpleado(), baja.dueno().comercioId())
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.estado").value("INACTIVO"))
                .andExpect(jsonPath("$.data.motivoBaja").value("BAJA_DUENO"))
                .andExpect(jsonPath("$.data.comercioAccesible").value(true));

        Escena renuncia = escena();
        renunciar(renuncia.tokenEmpleado(), renuncia.dueno().comercioId()).andExpect(status().isOk());
        acceso(renuncia.tokenEmpleado(), renuncia.dueno().comercioId())
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.estado").value("INACTIVO"))
                .andExpect(jsonPath("$.data.motivoBaja").value("RENUNCIA"));
    }

    @Test
    void elAccesoDeUnaRelacionInactivaSinRegistroDeLaBajaNoTieneMotivo() throws Exception {
        Escena e = escena();
        testSupportService.cambiarEstadoRelacionEmpleado(e.dueno().comercioId(), e.empleado().id(), EstadoEmpleadoComercio.INACTIVO);

        acceso(e.tokenEmpleado(), e.dueno().comercioId())
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.estado").value("INACTIVO"))
                .andExpect(jsonPath("$.data.motivoBaja").doesNotExist());
    }

    @Test
    void conVariasBajasElAccesoInformaLaUltima() throws Exception {
        Escena e = escena();
        mockMvc.perform(put(EQUIPO + "/miembros/" + e.empleado().id() + "/desactivar").header("Authorization", "Bearer " + e.tokenDueno())
                .header(HEADER, e.dueno().comercioId())).andExpect(status().isOk());
        mockMvc.perform(put(EQUIPO + "/miembros/" + e.empleado().id() + "/reactivar").header("Authorization", "Bearer " + e.tokenDueno())
                .header(HEADER, e.dueno().comercioId())).andExpect(status().isOk());
        acceso(e.tokenEmpleado(), e.dueno().comercioId()).andExpect(jsonPath("$.data.estado").value("ACTIVO"))
                .andExpect(jsonPath("$.data.motivoBaja").doesNotExist());

        renunciar(e.tokenEmpleado(), e.dueno().comercioId()).andExpect(status().isOk());
        acceso(e.tokenEmpleado(), e.dueno().comercioId()).andExpect(jsonPath("$.data.estado").value("INACTIVO"))
                .andExpect(jsonPath("$.data.motivoBaja").value("RENUNCIA"));
    }

    @Test
    void elAccesoNoRevelaElMotivoDeUnComercioNoAccesibleSoloDiceQueNoLoEs() throws Exception {
        Escena e = escena();
        datos.cambiarEstadoComercio(e.dueno().comercioId(), "SUSPENDIDO");
        acceso(e.tokenEmpleado(), e.dueno().comercioId()).andExpect(jsonPath("$.data.comercioAccesible").value(true));

        for (String estado : List.of("INACTIVO", "RECHAZADO", "PENDIENTE", "RECHAZO_DEFINITIVO")) {
            datos.cambiarEstadoComercio(e.dueno().comercioId(), estado);
            String cuerpo = acceso(e.tokenEmpleado(), e.dueno().comercioId())
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.data.estado").value("ACTIVO"))
                    .andExpect(jsonPath("$.data.comercioAccesible").value(false))
                    .andReturn().getResponse().getContentAsString();
            JsonNode data = objectMapper.readTree(cuerpo).path("data");
            assertEquals(3, data.size(), "solo estado, motivoBaja y comercioAccesible: " + cuerpo);
            assertTrue(!cuerpo.contains(estado), "no menciona el estado del comercio: " + cuerpo);
        }
    }

    @Test
    void elAccesoSinRelacionEsElMismoNoDisponibleYSoloHablaDeLaRelacionPropia() throws Exception {
        Escena e = escena();
        Escena ajena = escena();

        String delComercioAjeno = acceso(e.tokenEmpleado(), ajena.dueno().comercioId()).andExpect(status().isNotFound())
                .andExpect(jsonPath("$.mensaje").value(NO_DISPONIBLE))
                .andExpect(jsonPath("$.data.codigo").value("COMERCIO_NO_DISPONIBLE"))
                .andReturn().getResponse().getContentAsString();
        String delInexistente = acceso(e.tokenEmpleado(), 987654321).andExpect(status().isNotFound()).andReturn().getResponse().getContentAsString();
        assertEquals(objectMapper.readTree(delComercioAjeno), objectMapper.readTree(delInexistente));

        Cuenta sinNada = datos.registrarClienteConCredenciales();
        acceso(loginDe(sinNada.nombreUsuario(), sinNada.clave()), e.dueno().comercioId()).andExpect(status().isNotFound())
                .andExpect(jsonPath("$.data.codigo").value("COMERCIO_NO_DISPONIBLE"));
    }

    @Test
    void elAccesoEsSoloLecturaDelClienteEIgnoraElHeader() throws Exception {
        Escena e = escena();

        mockMvc.perform(get(EMPLEADOS + "/comercios/" + e.dueno().comercioId() + "/acceso")).andExpect(status().isUnauthorized());
        acceso(e.tokenDueno(), e.dueno().comercioId()).andExpect(status().isForbidden());
        mockMvc.perform(get(EMPLEADOS + "/comercios/" + e.dueno().comercioId() + "/acceso").header("Authorization", "Bearer " + e.tokenEmpleado())
                        .header(HEADER, "no-es-un-numero"))
                .andExpect(status().isOk());

        Cuenta administrador = datos.registrarClienteConCredenciales();
        datos.hacerAdministrador(administrador.id());
        jdbcTemplate.update("UPDATE usuario SET rol = 'ADMINISTRADOR' WHERE id = ?", administrador.id());
        acceso(loginDe(administrador.nombreUsuario(), administrador.clave()), e.dueno().comercioId()).andExpect(status().isForbidden());

        assertEquals("ACTIVO", estadoRelacion(e.relacionId()));
        assertEquals(0, jdbcTemplate.queryForObject("SELECT COUNT(*) FROM historial_empleado_comercio WHERE empleado_comercio_id = ?", Integer.class,
                e.relacionId()));
    }
}
