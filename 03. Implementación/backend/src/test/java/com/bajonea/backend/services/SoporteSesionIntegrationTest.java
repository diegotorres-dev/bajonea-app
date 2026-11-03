package com.bajonea.backend.services;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.bajonea.backend.dto.request.LoginRequestDTO;
import com.bajonea.backend.dto.request.SuspensionUsuarioRequestDTO;
import com.bajonea.backend.dto.response.ConsultaSoporteCreadaResponseDTO;
import com.bajonea.backend.dto.response.ConsultaSoporteResponseDTO;
import com.bajonea.backend.dto.response.ConsultaSoporteResumenResponseDTO;
import com.bajonea.backend.enums.EstadoTicketSoporte;
import com.bajonea.backend.enums.TipoTicketSoporte;
import com.bajonea.backend.exceptions.ConflictoDeNegocioException;
import com.bajonea.backend.exceptions.RecursoNoEncontradoException;
import com.bajonea.backend.services.DatosPruebaEmpleado.Cuenta;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

/**
 * Soporte con sesión (Fase 5, tramo S4): "Mis consultas", crear y responder sin código, la consulta ajena como 404 y, sobre
 * todo, que un usuario con la cuenta suspendida hace todo eso (el filtro JWT lo deja pasar solo en las rutas de Soporte).
 */
@AutoConfigureMockMvc
class SoporteSesionIntegrationTest extends SoporteIntegrationBase {

    @Autowired
    private SuspensionUsuarioService suspensionUsuario;

    @Autowired
    private AuthService authService;

    @Autowired
    private MockMvc mockMvc;

    private int administradorId;

    @BeforeEach
    void prepararAdministrador() {
        administradorId = jdbcTemplate.queryForObject("SELECT id FROM administrador ORDER BY id LIMIT 1", Integer.class);
        when(emailService.enviarCuentaSuspendida(anyString(), anyString())).thenReturn(ResultadoEnvioEmail.enviado("id"));
        when(emailService.enviarSuspensionLevantada(anyString(), any())).thenReturn(ResultadoEnvioEmail.enviado("id"));
    }

    private String tokenDe(Cuenta cuenta) {
        LoginRequestDTO login = new LoginRequestDTO();
        login.setNombreUsuario(cuenta.nombreUsuario());
        login.setPassword(cuenta.clave());
        return authService.login(login, "127.0.0.1", "test").getToken();
    }

    private MockHttpServletRequestBuilder conToken(MockHttpServletRequestBuilder request, String token, String ip) {
        return request.header("Authorization", "Bearer " + token).with(r -> {
            r.setRemoteAddr(ip);
            return r;
        });
    }

    @Test
    void crearConSesionUsaElEmailDeLaCuentaYGuardaElUsuario() {
        Cuenta cuenta = datos.registrarClienteConCredenciales();

        ConsultaSoporteCreadaResponseDTO creada = soporte.crearConSesion(cuenta.id(),
                pedidoConSesion(TipoTicketSoporte.APELACION_CUENTA, "Me suspendieron por error"), ipNueva());

        assertEquals(cuenta.email().toLowerCase(), jdbcTemplate.queryForObject("SELECT email FROM ticket_soporte WHERE id = ?", String.class, creada.getId()));
        assertEquals(cuenta.id(), jdbcTemplate.queryForObject("SELECT usuario_id FROM ticket_soporte WHERE id = ?", Integer.class, creada.getId()));
    }

    @Test
    void misConsultasIncluyeLasQueEnvioSinSesionConElMismoEmailYNoLasAjenas() {
        Cuenta cuenta = datos.registrarClienteConCredenciales();
        ConsultaSoporteCreadaResponseDTO sinSesion = crear(cuenta.email().toLowerCase(), ipNueva());
        ConsultaSoporteCreadaResponseDTO conSesion = soporte.crearConSesion(cuenta.id(),
                pedidoConSesion(TipoTicketSoporte.OTRA, "Una duda sobre mi cuenta"), ipNueva());
        crear(emailNuevo(), ipNueva());

        List<ConsultaSoporteResumenResponseDTO> mias = soporte.misConsultas(cuenta.id());

        assertEquals(List.of(sinSesion.getId(), conSesion.getId()).stream().sorted().toList(),
                mias.stream().map(ConsultaSoporteResumenResponseDTO::getId).sorted().toList());
    }

    @Test
    void unaConsultaAjenaDaNoEncontradoParaVerlaYParaResponderla() {
        Cuenta cuenta = datos.registrarClienteConCredenciales();
        Cuenta otra = datos.registrarClienteConCredenciales();
        ConsultaSoporteCreadaResponseDTO ajena = soporte.crearConSesion(otra.id(),
                pedidoConSesion(TipoTicketSoporte.OTRA, "Una duda sobre mi cuenta"), ipNueva());

        assertThrows(RecursoNoEncontradoException.class, () -> soporte.miConsulta(cuenta.id(), ajena.getId()));
        assertThrows(RecursoNoEncontradoException.class, () -> soporte.responderConSesion(cuenta.id(), ajena.getId(), texto("Hola")));
        assertThrows(RecursoNoEncontradoException.class, () -> soporte.miConsulta(cuenta.id(), Integer.MAX_VALUE));
        assertEquals(1, filasDeMensajes(ajena.getId()));
    }

    @Test
    void sinCodigoSePuedeVerYResponderLaPropiaCuandoLeToca() {
        Cuenta cuenta = datos.registrarClienteConCredenciales();
        ConsultaSoporteCreadaResponseDTO creada = soporte.crearConSesion(cuenta.id(),
                pedidoConSesion(TipoTicketSoporte.NO_PUEDO_ENTRAR, "No me deja ingresar"), ipNueva());

        ConflictoDeNegocioException fueraDeTurno = assertThrows(ConflictoDeNegocioException.class,
                () -> soporte.responderConSesion(cuenta.id(), creada.getId(), texto("Hola")));
        assertEquals(ConversacionSoporte.MENSAJE_TURNO_PERSONA, fueraDeTurno.getMessage());
        assertEquals(0, soporte.contador(cuenta.id()).getEsperandoTuRespuesta());

        soporteAdmin.responder(creada.getId(), texto("Probá limpiar la caché"));
        assertEquals(1, soporte.contador(cuenta.id()).getEsperandoTuRespuesta());
        ConsultaSoporteResponseDTO respondida = soporte.responderConSesion(cuenta.id(), creada.getId(), texto("Funcionó, gracias"));

        assertEquals(EstadoTicketSoporte.ESPERA_SOPORTE, respondida.getEstado());
        assertEquals(3, respondida.getMensajes().size());
        assertEquals(0, soporte.contador(cuenta.id()).getEsperandoTuRespuesta());
        assertTrue(soporte.miConsulta(cuenta.id(), creada.getId()).getMensajes().size() == 3);
    }

    @Test
    void unUsuarioSuspendidoPuedeCrearVerYResponderPorHttpConSuToken() throws Exception {
        Cuenta cuenta = datos.registrarClienteConCredenciales();
        String token = tokenDe(cuenta);
        suspensionUsuario.suspender(cuenta.id(), administradorId, new SuspensionUsuarioRequestDTO("Pedidos falsos reiterados"));
        assertEquals(0, jdbcTemplate.queryForObject("SELECT COUNT(*) FROM sesion WHERE usuario_id = ? AND activa = 1", Integer.class, cuenta.id()));
        String ip = ipNueva();

        mockMvc.perform(get("/api/v1/clientes/perfil").header("Authorization", "Bearer " + token))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.data.codigo").value("CUENTA_SUSPENDIDA"));

        String cuerpo = mockMvc.perform(conToken(post("/api/v1/soporte/consultas"), token, ip)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"tipo\":\"APELACION_CUENTA\",\"mensaje\":\"Mi cuenta fue suspendida y quiero apelar\"}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.codigo").isNotEmpty())
                .andReturn().getResponse().getContentAsString();
        int id = objectMapper.readTree(cuerpo).path("data").path("id").asInt();

        mockMvc.perform(conToken(get("/api/v1/soporte/mis-consultas"), token, ip))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data[0].id").value(id));
        mockMvc.perform(conToken(get("/api/v1/soporte/mis-consultas/" + id), token, ip))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.mensajes[0].texto").value("Mi cuenta fue suspendida y quiero apelar"));
        mockMvc.perform(conToken(get("/api/v1/soporte/mis-consultas/contador"), token, ip))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.esperandoTuRespuesta").value(0));

        soporteAdmin.responder(id, texto("Estamos revisando tu caso"));

        mockMvc.perform(conToken(post("/api/v1/soporte/mis-consultas/" + id + "/mensajes"), token, ip)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"texto\":\"Gracias, quedo atento\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.mensajes.length()").value(3));
    }

    @Test
    void laSuspensionNoAbreOtrasRutasConElMismoToken() throws Exception {
        Cuenta cuenta = datos.registrarClienteConCredenciales();
        String token = tokenDe(cuenta);
        suspensionUsuario.suspender(cuenta.id(), administradorId, new SuspensionUsuarioRequestDTO("Pedidos falsos reiterados"));

        for (String ruta : List.of("/api/v1/clientes/perfil", "/api/v1/notificaciones", "/api/v1/carrito", "/api/v1/pedidos/cliente")) {
            mockMvc.perform(get(ruta).header("Authorization", "Bearer " + token))
                    .andExpect(status().isUnauthorized())
                    .andExpect(jsonPath("$.data.codigo").value("CUENTA_SUSPENDIDA"));
        }
    }

    @Test
    void unaSesionCerradaPorLogoutNoAbreSoporteAunqueLaCuentaEstePorSerSuspendida() throws Exception {
        Cuenta cuenta = datos.registrarClienteConCredenciales();
        String token = tokenDe(cuenta);
        jdbcTemplate.update("UPDATE sesion SET activa = 0, tipo_cierre = 'MANUAL' WHERE usuario_id = ?", cuenta.id());
        jdbcTemplate.update("UPDATE usuario SET estado = 'SUSPENDIDO', motivo_suspension = 'Motivo cargado a mano', suspendido_desde = NOW() WHERE id = ?",
                cuenta.id());

        mockMvc.perform(conToken(get("/api/v1/soporte/mis-consultas"), token, ipNueva())).andExpect(status().isUnauthorized());
    }

    @Test
    void unaSesionActivaDeUnaCuentaSuspendidaTambienPasaPorSoporte() throws Exception {
        Cuenta cuenta = datos.registrarClienteConCredenciales();
        String token = tokenDe(cuenta);
        jdbcTemplate.update("UPDATE usuario SET estado = 'SUSPENDIDO', motivo_suspension = 'Motivo cargado a mano', suspendido_desde = NOW() WHERE id = ?",
                cuenta.id());
        assertEquals(1, jdbcTemplate.queryForObject("SELECT COUNT(*) FROM sesion WHERE usuario_id = ? AND activa = 1", Integer.class, cuenta.id()));

        mockMvc.perform(conToken(get("/api/v1/soporte/mis-consultas"), token, ipNueva())).andExpect(status().isOk());
    }

    @Test
    void sinTokenLasRutasConSesionDan401YLasPublicasNoPidenNada() throws Exception {
        mockMvc.perform(get("/api/v1/soporte/mis-consultas")).andExpect(status().isUnauthorized());
        mockMvc.perform(post("/api/v1/soporte/consultas").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"tipo\":\"OTRA\",\"mensaje\":\"Mensaje sin sesión\"}"))
                .andExpect(status().isUnauthorized());
        mockMvc.perform(post("/api/v1/soporte/publico/consultas/ver").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"nadie@bajonea.test\",\"codigo\":\"ZZZZZZZZ\"}").with(r -> {
                            r.setRemoteAddr(ipNueva());
                            return r;
                        }))
                .andExpect(status().isNotFound());
    }

    @Test
    void unaCuentaSuspendidaQueEscribioSinSesionTambienVeLaConsultaConSuSesion() {
        Cuenta cuenta = datos.registrarClienteConCredenciales();
        ConsultaSoporteCreadaResponseDTO sinSesion = crear(cuenta.email().toLowerCase(), ipNueva());
        suspensionUsuario.suspender(cuenta.id(), administradorId, new SuspensionUsuarioRequestDTO("Pedidos falsos reiterados"));

        ConsultaSoporteResponseDTO vista = soporte.miConsulta(cuenta.id(), sinSesion.getId());

        assertNotNull(vista);
        assertFalse(vista.isPuedeResponder());
    }
}
