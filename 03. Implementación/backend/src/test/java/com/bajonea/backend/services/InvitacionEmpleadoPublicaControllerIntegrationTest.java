package com.bajonea.backend.services;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.bajonea.backend.config.security.ComercioActivo;
import com.bajonea.backend.dto.request.DatosClienteRequestDTO;
import com.bajonea.backend.exceptions.CodigoInvitacionInvalidoException;
import com.bajonea.backend.services.DatosPruebaEmpleado.Dueno;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;
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

/**
 * Los dos endpoints públicos de invitaciones de empleado por HTTP real (filtros de seguridad incluidos), con
 * datos confirmados en {@code bajonea_test} y el {@code EmailService} reemplazado por un mock: sin token,
 * el mismo cuerpo {@code 401} para todas las fallas de resolución, intentos que sobreviven al {@code 401},
 * errores de validación con su mapa {@code {campo: mensaje}}, conflictos con los textos del registro y que
 * ninguna otra ruta del mismo prefijo sea pública.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(ConfiguracionRelojDePrueba.class)
class InvitacionEmpleadoPublicaControllerIntegrationTest {

    private static final String VALIDAR = "/api/v1/auth/invitaciones-empleado/validar";
    private static final String ACEPTAR = "/api/v1/auth/invitaciones-empleado/aceptar";
    private static final String REGISTRO_CLIENTE = "/api/v1/auth/registro/cliente";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private InvitacionEmpleadoService invitacionService;

    @Autowired
    private RegistroService registroService;

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

    private ResultActions postJson(String ruta, Object cuerpo) throws Exception {
        return mockMvc.perform(post(ruta).contentType(MediaType.APPLICATION_JSON).content(objectMapper.writeValueAsString(cuerpo)));
    }

    private static Map<String, Object> cuerpo(String email, String codigo, Object... resto) {
        Map<String, Object> cuerpo = new LinkedHashMap<>();
        cuerpo.put("email", email);
        cuerpo.put("codigo", codigo);
        for (int i = 0; i < resto.length; i += 2) {
            cuerpo.put((String) resto[i], resto[i + 1]);
        }
        return cuerpo;
    }

    private static String emailNuevo() {
        return "invitado." + DatosPruebaEmpleado.sufijo() + "@bajonea.test";
    }

    private DatosClienteRequestDTO cuentaNueva() {
        return datos.datosClienteNuevo("nu" + DatosPruebaEmpleado.sufijo(), DatosPruebaEmpleado.dniAleatorio(), "Pw1234567890");
    }

    private int invitar(Dueno dueno, String email) {
        return invitacionService.invitar(new ComercioActivo(dueno.comercioId(), dueno.id()), email).getId();
    }

    private String codigoDe(int invitacionId) {
        return jdbcTemplate.queryForObject("SELECT codigo FROM invitacion_empleado WHERE id = ?", String.class, invitacionId);
    }

    private static String otroCodigo(String codigo) {
        return "000000".equals(codigo) ? "111111" : "000000";
    }

    private String estadoDe(int invitacionId) {
        return jdbcTemplate.queryForObject("SELECT estado FROM invitacion_empleado WHERE id = ?", String.class, invitacionId);
    }

    private int intentosDe(int invitacionId) {
        return jdbcTemplate.queryForObject("SELECT intentos_fallidos FROM invitacion_empleado WHERE id = ?", Integer.class, invitacionId);
    }

    private String cuerpoDe(ResultActions resultado) throws Exception {
        return resultado.andReturn().getResponse().getContentAsString();
    }

    private void borrarRastros(Dueno... duenos) {
        for (Dueno dueno : duenos) {
            jdbcTemplate.update("DELETE FROM historial_empleado_comercio WHERE comercio_id = ?", dueno.comercioId());
            jdbcTemplate.update("DELETE FROM empleado_comercio WHERE comercio_id = ?", dueno.comercioId());
            jdbcTemplate.update("DELETE FROM invitacion_empleado WHERE comercio_id = ?", dueno.comercioId());
            jdbcTemplate.update("DELETE FROM notificacion WHERE usuario_id = ?", dueno.id());
        }
    }

    @Test
    void validarYAceptarSeLlamanSinTokenYLaCuentaNuevaPuedeIniciarSesionDespues() throws Exception {
        Dueno dueno = datos.registrarDuenoAprobado();
        String email = emailNuevo();
        try {
            String codigo = codigoDe(invitar(dueno, email));
            DatosClienteRequestDTO cuenta = cuentaNueva();

            postJson(VALIDAR, cuerpo(email, codigo))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.data.comercioNombre").value(dueno.nombreComercio()))
                    .andExpect(jsonPath("$.data.cuentaExistente").value(false))
                    .andExpect(jsonPath("$.data.fechaVencimiento").exists());

            postJson(ACEPTAR, cuerpo(email.toUpperCase(), codigo, "aceptaTerminos", true, "cuentaNueva", cuenta))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.mensaje").value("Ya sos parte del equipo de " + dueno.nombreComercio()))
                    .andExpect(jsonPath("$.data.comercioNombre").value(dueno.nombreComercio()))
                    .andExpect(jsonPath("$.data.cuentaCreada").value(true))
                    .andExpect(jsonPath("$.data.relacionReactivada").value(false));

            postJson("/api/v1/auth/login", Map.of("nombreUsuario", cuenta.getNombreUsuario(), "password", cuenta.getPassword()))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.data.token").isNotEmpty());
        } finally {
            borrarRastros(dueno);
        }
    }

    @Test
    void conUnaCuentaExistenteSoloHaceFaltaEmailYCodigoYValidarLoInforma() throws Exception {
        Dueno dueno = datos.registrarDuenoAprobado();
        int cuenta = datos.registrarCliente();
        String email = datos.emailDe(cuenta);
        try {
            String codigo = codigoDe(invitar(dueno, email));

            postJson(VALIDAR, cuerpo(email, codigo))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.data.cuentaExistente").value(true));
            postJson(ACEPTAR, cuerpo(email, codigo))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.data.cuentaCreada").value(false));

            assertEquals(1, jdbcTemplate.queryForObject("SELECT COUNT(*) FROM empleado_comercio WHERE empleado_id = ? AND estado = 'ACTIVO'",
                    Integer.class, cuenta));
        } finally {
            borrarRastros(dueno);
        }
    }

    @Test
    void todasLasFallasDeResolucionDanElMismoStatusYElMismoCuerpoSinDatosDeLaCausa() throws Exception {
        Dueno dueno = datos.registrarDuenoAprobado();
        Dueno otro = datos.registrarDuenoAprobado();
        try {
            Set<String> cuerpos = new HashSet<>();

            cuerpos.add(cuerpoDe(postJson(ACEPTAR, cuerpo(emailNuevo(), "123456", "aceptaTerminos", true, "cuentaNueva", cuentaNueva()))
                    .andExpect(status().isUnauthorized())));
            cuerpos.add(cuerpoDe(postJson(VALIDAR, cuerpo(emailNuevo(), "123456")).andExpect(status().isUnauthorized())));

            String emailIncorrecto = emailNuevo();
            String codigoIncorrecto = otroCodigo(codigoDe(invitar(dueno, emailIncorrecto)));
            cuerpos.add(cuerpoDe(postJson(ACEPTAR, cuerpo(emailIncorrecto, codigoIncorrecto, "aceptaTerminos", true, "cuentaNueva", cuentaNueva()))
                    .andExpect(status().isUnauthorized())));
            cuerpos.add(cuerpoDe(postJson(VALIDAR, cuerpo(emailIncorrecto, codigoIncorrecto)).andExpect(status().isUnauthorized())));

            String emailCancelada = emailNuevo();
            int cancelada = invitar(dueno, emailCancelada);
            String codigoCancelada = codigoDe(cancelada);
            invitacionService.cancelar(new ComercioActivo(dueno.comercioId(), dueno.id()), cancelada);
            cuerpos.add(cuerpoDe(postJson(ACEPTAR, cuerpo(emailCancelada, codigoCancelada, "aceptaTerminos", true, "cuentaNueva", cuentaNueva()))
                    .andExpect(status().isUnauthorized())));
            cuerpos.add(cuerpoDe(postJson(VALIDAR, cuerpo(emailCancelada, codigoCancelada)).andExpect(status().isUnauthorized())));

            String emailReemplazada = emailNuevo();
            int original = invitar(otro, emailReemplazada);
            String codigoViejo = codigoDe(original);
            invitacionService.reenviar(new ComercioActivo(otro.comercioId(), otro.id()), original);
            cuerpos.add(cuerpoDe(postJson(ACEPTAR, cuerpo(emailReemplazada, codigoViejo, "aceptaTerminos", true, "cuentaNueva", cuentaNueva()))
                    .andExpect(status().isUnauthorized())));
            cuerpos.add(cuerpoDe(postJson(VALIDAR, cuerpo(emailReemplazada, codigoViejo)).andExpect(status().isUnauthorized())));

            String emailVencida = emailNuevo();
            int vencida = invitar(otro, emailVencida);
            String codigoVencida = codigoDe(vencida);
            jdbcTemplate.update("UPDATE invitacion_empleado SET fecha_vencimiento = ? WHERE id = ?", LocalDateTime.now().minusMinutes(1), vencida);
            cuerpos.add(cuerpoDe(postJson(ACEPTAR, cuerpo(emailVencida, codigoVencida, "aceptaTerminos", true, "cuentaNueva", cuentaNueva()))
                    .andExpect(status().isUnauthorized())));
            cuerpos.add(cuerpoDe(postJson(VALIDAR, cuerpo(emailVencida, codigoVencida)).andExpect(status().isUnauthorized())));

            String emailInvalidada = emailNuevo();
            int invalidada = invitar(otro, emailInvalidada);
            String codigoInvalidada = codigoDe(invalidada);
            for (int i = 0; i < 5; i++) {
                postJson(VALIDAR, cuerpo(emailInvalidada, otroCodigo(codigoInvalidada))).andExpect(status().isUnauthorized());
            }
            assertEquals("INVALIDADA", estadoDe(invalidada));
            cuerpos.add(cuerpoDe(postJson(ACEPTAR, cuerpo(emailInvalidada, codigoInvalidada, "aceptaTerminos", true, "cuentaNueva", cuentaNueva()))
                    .andExpect(status().isUnauthorized())));

            String emailAceptada = emailNuevo();
            String codigoAceptada = codigoDe(invitar(otro, emailAceptada));
            postJson(ACEPTAR, cuerpo(emailAceptada, codigoAceptada, "aceptaTerminos", true, "cuentaNueva", cuentaNueva())).andExpect(status().isOk());
            cuerpos.add(cuerpoDe(postJson(ACEPTAR, cuerpo(emailAceptada, codigoAceptada, "aceptaTerminos", true, "cuentaNueva", cuentaNueva()))
                    .andExpect(status().isUnauthorized())));

            assertEquals(1, cuerpos.size(), "todas las fallas deben tener el mismo cuerpo: " + cuerpos);
            String unico = cuerpos.iterator().next();
            assertTrue(unico.contains(CodigoInvitacionInvalidoException.MENSAJE), unico);
            assertTrue(unico.contains("\"data\":null"), unico);
        } finally {
            borrarRastros(dueno, otro);
        }
    }

    @Test
    void losIntentosFallidosQuedanGuardadosPeseAlUnauthorizedYAlQuintoLaInvitacionSeInvalida() throws Exception {
        Dueno dueno = datos.registrarDuenoAprobado();
        String email = emailNuevo();
        try {
            int invitacionId = invitar(dueno, email);
            String codigo = codigoDe(invitacionId);
            String incorrecto = otroCodigo(codigo);

            postJson(VALIDAR, cuerpo(email, incorrecto)).andExpect(status().isUnauthorized());
            postJson(ACEPTAR, cuerpo(email, incorrecto, "aceptaTerminos", true, "cuentaNueva", cuentaNueva())).andExpect(status().isUnauthorized());
            postJson(VALIDAR, cuerpo(email, incorrecto)).andExpect(status().isUnauthorized());
            assertEquals(3, intentosDe(invitacionId));
            assertEquals("PENDIENTE", estadoDe(invitacionId));

            postJson(VALIDAR, cuerpo(email, incorrecto)).andExpect(status().isUnauthorized());
            postJson(VALIDAR, cuerpo(email, incorrecto)).andExpect(status().isUnauthorized());
            assertEquals(5, intentosDe(invitacionId));
            assertEquals("INVALIDADA", estadoDe(invitacionId));

            postJson(VALIDAR, cuerpo(email, codigo)).andExpect(status().isUnauthorized());
        } finally {
            borrarRastros(dueno);
        }
    }

    @Test
    void unFormatoInvalidoDa400ConElMapaPorCampoSinContarIntentos() throws Exception {
        Dueno dueno = datos.registrarDuenoAprobado();
        String email = emailNuevo();
        try {
            int invitacionId = invitar(dueno, email);

            postJson(VALIDAR, cuerpo("esto-no-es-un-email", "123456"))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.data.email").exists());
            postJson(VALIDAR, cuerpo(email, "12345"))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.data.codigo").value("El código debe tener 6 dígitos numéricos"));
            postJson(ACEPTAR, Map.of())
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.data.email").exists())
                    .andExpect(jsonPath("$.data.codigo").exists());

            assertEquals(0, intentosDe(invitacionId));
        } finally {
            borrarRastros(dueno);
        }
    }

    @Test
    void sinCuentaFaltarLosDatosOLosTerminosDa400ConElMismoFormatoQueElRegistroYLosDatosInvalidosSeMarcanPorCampo() throws Exception {
        Dueno dueno = datos.registrarDuenoAprobado();
        String email = emailNuevo();
        try {
            int invitacionId = invitar(dueno, email);
            String codigo = codigoDe(invitacionId);

            postJson(ACEPTAR, cuerpo(email, codigo, "aceptaTerminos", true))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.data.cuentaNueva").value("Completá tus datos para crear tu cuenta"));
            postJson(ACEPTAR, cuerpo(email, codigo, "cuentaNueva", cuentaNueva()))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.data.aceptaTerminos").value("Tenés que aceptar los Términos y Condiciones"));
            postJson(ACEPTAR, cuerpo(email, codigo, "aceptaTerminos", false, "cuentaNueva", cuentaNueva()))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.data.aceptaTerminos").exists());

            Map<String, Object> cuentaInvalida = objectMapper.convertValue(cuentaNueva(), new com.fasterxml.jackson.core.type.TypeReference<>() {
            });
            cuentaInvalida.put("dni", "abc");
            cuentaInvalida.put("nombre", "");
            postJson(ACEPTAR, cuerpo(email, codigo, "aceptaTerminos", true, "cuentaNueva", cuentaInvalida))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.data['cuentaNueva.dni']").exists())
                    .andExpect(jsonPath("$.data['cuentaNueva.nombre']").exists());

            assertEquals("PENDIENTE", estadoDe(invitacionId));
            assertEquals(0, intentosDe(invitacionId));
            assertEquals(0, jdbcTemplate.queryForObject("SELECT COUNT(*) FROM usuario WHERE email = ?", Integer.class, email));
        } finally {
            borrarRastros(dueno);
        }
    }

    @Test
    void losConflictosDeCuentaYDeAltaDan409ConLosTextosDelLoginYDelRegistro() throws Exception {
        Dueno dueno = datos.registrarDuenoAprobado();
        int existente = datos.registrarCliente();
        int bloqueada = datos.registrarCliente();
        try {
            String emailNuevo = emailNuevo();
            String codigoNuevo = codigoDe(invitar(dueno, emailNuevo));
            String dniUsado = jdbcTemplate.queryForObject("SELECT dni FROM persona_fisica WHERE id = ?", String.class, existente);
            String nombreUsuarioUsado = jdbcTemplate.queryForObject("SELECT nombre_usuario FROM usuario WHERE id = ?", String.class, existente);

            postJson(ACEPTAR, cuerpo(emailNuevo, codigoNuevo, "aceptaTerminos", true, "cuentaNueva",
                    datos.datosClienteNuevo("nu" + DatosPruebaEmpleado.sufijo(), dniUsado, "Pw1234567890")))
                    .andExpect(status().isConflict())
                    .andExpect(jsonPath("$.mensaje").value("Ya existe una cuenta registrada con ese DNI"));
            postJson(ACEPTAR, cuerpo(emailNuevo, codigoNuevo, "aceptaTerminos", true, "cuentaNueva",
                    datos.datosClienteNuevo(nombreUsuarioUsado, DatosPruebaEmpleado.dniAleatorio(), "Pw1234567890")))
                    .andExpect(status().isConflict())
                    .andExpect(jsonPath("$.mensaje").value("Ese nombre de usuario ya está en uso"));

            String emailBloqueada = datos.emailDe(bloqueada);
            String codigoBloqueada = codigoDe(invitar(dueno, emailBloqueada));
            datos.cambiarEstadoUsuario(bloqueada, "BLOQUEADO");
            postJson(ACEPTAR, cuerpo(emailBloqueada, codigoBloqueada))
                    .andExpect(status().isConflict())
                    .andExpect(jsonPath("$.mensaje").value("Cuenta bloqueada. Recuperá tu contraseña para desbloquearla"));

            assertEquals(0, jdbcTemplate.queryForObject("SELECT COUNT(*) FROM empleado_comercio WHERE comercio_id = ?", Integer.class, dueno.comercioId()));
        } finally {
            borrarRastros(dueno);
        }
    }

    @Test
    void elRegistroDeClienteExigeCatorceAniosCumplidosHoy() throws Exception {
        LocalDate hoy = LocalDate.now();
        Map<String, Object> trece = cuentaComoRegistro(hoy.minusYears(14).plusDays(1));
        postJson(REGISTRO_CLIENTE, trece)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.data.fechaNacimiento").value("Tenés que tener al menos 14 años para registrarte"));
        assertEquals(0, jdbcTemplate.queryForObject("SELECT COUNT(*) FROM usuario WHERE email = ?", Integer.class, trece.get("email")));

        Map<String, Object> catorce = cuentaComoRegistro(hoy.minusYears(14));
        postJson(REGISTRO_CLIENTE, catorce).andExpect(status().isCreated());
        assertEquals(1, jdbcTemplate.queryForObject("SELECT COUNT(*) FROM usuario WHERE email = ?", Integer.class, catorce.get("email")));
    }

    @Test
    void laCuentaNuevaPorInvitacionExigeCatorceEnElDtoYDieciochoEnElServicioConElMapaPrefijado() throws Exception {
        Dueno dueno = datos.registrarDuenoAprobado();
        String email = emailNuevo();
        try {
            int invitacionId = invitar(dueno, email);
            String codigo = codigoDe(invitacionId);
            LocalDate hoy = LocalDate.now();

            DatosClienteRequestDTO deTrece = datos.datosClienteNuevo("nu" + DatosPruebaEmpleado.sufijo(), DatosPruebaEmpleado.dniAleatorio(),
                    "Pw1234567890", hoy.minusYears(14).plusDays(1));
            postJson(ACEPTAR, cuerpo(email, codigo, "aceptaTerminos", true, "cuentaNueva", deTrece))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.data['cuentaNueva.fechaNacimiento']").value("Tenés que tener al menos 14 años para registrarte"));

            DatosClienteRequestDTO deQuince = datos.datosClienteNuevo("nu" + DatosPruebaEmpleado.sufijo(), DatosPruebaEmpleado.dniAleatorio(),
                    "Pw1234567890", hoy.minusYears(15));
            postJson(ACEPTAR, cuerpo(email, codigo, "aceptaTerminos", true, "cuentaNueva", deQuince))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.data['cuentaNueva.fechaNacimiento']").value("Tenés que tener 18 años o más para trabajar en un comercio"));

            assertEquals("PENDIENTE", estadoDe(invitacionId));
            assertEquals(0, intentosDe(invitacionId), "un dato inválido no es un código incorrecto");
            assertEquals(0, jdbcTemplate.queryForObject("SELECT COUNT(*) FROM usuario WHERE email = ?", Integer.class, email));

            DatosClienteRequestDTO deDieciocho = datos.datosClienteNuevo("nu" + DatosPruebaEmpleado.sufijo(), DatosPruebaEmpleado.dniAleatorio(),
                    "Pw1234567890", hoy.minusYears(18));
            postJson(ACEPTAR, cuerpo(email, codigo, "aceptaTerminos", true, "cuentaNueva", deDieciocho))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.data.cuentaCreada").value(true));
            assertEquals("ACEPTADA", estadoDe(invitacionId));
        } finally {
            borrarRastros(dueno);
        }
    }

    @Test
    void unaCuentaExistenteMenorDeDieciochoDa409EnValidarYAceptarConElTextoDeEquipo() throws Exception {
        Dueno dueno = datos.registrarDuenoAprobado();
        int cuenta = datos.registrarCliente();
        String email = datos.emailDe(cuenta);
        try {
            int invitacionId = invitar(dueno, email);
            String codigo = codigoDe(invitacionId);
            datos.cambiarFechaNacimiento(cuenta, LocalDate.now().minusYears(16));

            postJson(VALIDAR, cuerpo(email, codigo)).andExpect(status().isConflict())
                    .andExpect(jsonPath("$.mensaje").value("Tenés que tener 18 años o más para sumarte a un equipo"));
            postJson(ACEPTAR, cuerpo(email, codigo)).andExpect(status().isConflict())
                    .andExpect(jsonPath("$.mensaje").value("Tenés que tener 18 años o más para sumarte a un equipo"));

            assertEquals("PENDIENTE", estadoDe(invitacionId));
            assertEquals(0, intentosDe(invitacionId));
            assertEquals(0, jdbcTemplate.queryForObject("SELECT COUNT(*) FROM empleado_comercio WHERE empleado_id = ?", Integer.class, cuenta));
        } finally {
            borrarRastros(dueno);
        }
    }

    private Map<String, Object> cuentaComoRegistro(LocalDate fechaNacimiento) {
        Map<String, Object> cuerpo = objectMapper.convertValue(
                datos.datosClienteNuevo("nu" + DatosPruebaEmpleado.sufijo(), DatosPruebaEmpleado.dniAleatorio(), "Pw1234567890", fechaNacimiento),
                new com.fasterxml.jackson.core.type.TypeReference<LinkedHashMap<String, Object>>() {
                });
        cuerpo.put("email", emailNuevo());
        cuerpo.put("aceptaTerminos", true);
        return cuerpo;
    }

    @Test
    void ningunaOtraRutaDelPrefijoNiDelEquipoEsPublica() throws Exception {
        mockMvc.perform(post("/api/v1/auth/invitaciones-empleado/cancelar").contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isUnauthorized());
        mockMvc.perform(post("/api/v1/auth/invitaciones-empleado/validar/otra").contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isUnauthorized());
        mockMvc.perform(get("/api/v1/comercios/equipo")).andExpect(status().isUnauthorized());
        mockMvc.perform(post("/api/v1/comercios/equipo/invitaciones").contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void validarDa409ConElTextoDeSuEstadoSoloTrasUnCodigoValidoYNoTocaNada() throws Exception {
        Dueno dueno = datos.registrarDuenoAprobado();
        try {
            for (String[] caso : new String[][] {
                    {"BLOQUEADO", "Cuenta bloqueada. Recuperá tu contraseña para desbloquearla"},
                    {"SUSPENDIDO", "Cuenta suspendida"},
                    {"INACTIVO", "Cuenta inactiva. Solicitá la reactivación de tu cuenta"},
                    {"PENDIENTE", "Verificá tu email antes de iniciar sesión"}}) {
                int cuenta = datos.registrarCliente();
                String email = datos.emailDe(cuenta);
                int invitacion = invitar(dueno, email);
                String codigo = codigoDe(invitacion);
                datos.cambiarEstadoUsuario(cuenta, caso[0]);

                postJson(VALIDAR, cuerpo(email, codigo)).andExpect(status().isConflict())
                        .andExpect(jsonPath("$.mensaje").value(caso[1]));
                assertEquals("PENDIENTE", estadoDe(invitacion), "validar no consume la invitación");
                assertEquals(0, intentosDe(invitacion));

                String cuerpoDelCodigoIncorrecto = cuerpoDe(postJson(VALIDAR, cuerpo(email, otroCodigo(codigo)))
                        .andExpect(status().isUnauthorized()));
                assertTrue(cuerpoDelCodigoIncorrecto.contains("El código es incorrecto o la invitación ya no está vigente"),
                        "con el código incorrecto sigue el 401 único, sin revelar el estado de la cuenta");
                assertFalse(cuerpoDelCodigoIncorrecto.contains(caso[1]));
                assertEquals(1, intentosDe(invitacion), "el código incorrecto sí suma un intento");
            }
        } finally {
            borrarRastros(dueno);
        }
    }

    @Test
    void validarDa409DeRolIncompatibleConUnaCuentaDeAdministradorODeDueno() throws Exception {
        Dueno dueno = datos.registrarDuenoAprobado();
        Dueno otroDueno = datos.registrarDuenoAprobado();
        try {
            int cuentaAdministrador = datos.registrarCliente();
            String emailAdministrador = datos.emailDe(cuentaAdministrador);
            int aAdministrador = invitar(dueno, emailAdministrador);
            String codigoAdministrador = codigoDe(aAdministrador);
            datos.hacerAdministrador(cuentaAdministrador);

            jdbcTemplate.update("INSERT INTO invitacion_empleado (comercio_id, email, codigo, estado, invitado_por_usuario_id, fecha_creacion, "
                    + "fecha_vencimiento) VALUES (?, ?, ?, ?, ?, ?, ?)", dueno.comercioId(), otroDueno.email(), "123456", "PENDIENTE",
                    dueno.id(), LocalDateTime.now(), LocalDateTime.now().plusDays(7));

            postJson(VALIDAR, cuerpo(emailAdministrador, codigoAdministrador)).andExpect(status().isConflict())
                    .andExpect(jsonPath("$.mensaje").value("No se puede aceptar esta invitación con esta cuenta"));
            postJson(VALIDAR, cuerpo(otroDueno.email(), "123456")).andExpect(status().isConflict())
                    .andExpect(jsonPath("$.mensaje").value("No se puede aceptar esta invitación con esta cuenta"));
            assertEquals(0, intentosDe(aAdministrador));
        } finally {
            borrarRastros(dueno);
        }
    }

    @Test
    void validarDa409ConElComercioNoAceptableYSigueRespondiendo200ConElComercioSuspendido() throws Exception {
        Dueno dueno = datos.registrarDuenoAprobado();
        try {
            String email = emailNuevo();
            int invitacion = invitar(dueno, email);
            String codigo = codigoDe(invitacion);

            for (String estado : new String[] {"PENDIENTE", "RECHAZADO", "RECHAZO_DEFINITIVO", "INACTIVO"}) {
                datos.cambiarEstadoComercio(dueno.comercioId(), estado);
                postJson(VALIDAR, cuerpo(email, codigo)).andExpect(status().isConflict())
                        .andExpect(jsonPath("$.mensaje").value("Esta invitación ya no está disponible"));
            }
            assertEquals("PENDIENTE", estadoDe(invitacion));
            assertEquals(0, intentosDe(invitacion));

            for (String estado : new String[] {"APROBADO", "APTO_VENTA", "CERRADO_TEMPORALMENTE", "SUSPENDIDO"}) {
                datos.cambiarEstadoComercio(dueno.comercioId(), estado);
                postJson(VALIDAR, cuerpo(email, codigo)).andExpect(status().isOk())
                        .andExpect(jsonPath("$.data.comercioNombre").value(dueno.nombreComercio()));
            }
        } finally {
            borrarRastros(dueno);
        }
    }
}
