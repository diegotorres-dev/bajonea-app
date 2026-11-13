package com.bajonea.backend.services;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.bajonea.backend.services.DatosPruebaEmpleado.Cuenta;
import com.bajonea.backend.services.DatosPruebaEmpleado.Dueno;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;

/**
 * El login devuelve el nombre de pila de quien inicia sesión (tramo B1): de dónde sale en cada rol, qué pasa cuando no
 * existe, que nunca viaja el de otra persona ni se filtra en una respuesta de error y que el resto de las respuestas que
 * emiten la misma forma de usuario (reactivación por credenciales y foto de perfil) son consistentes.
 */
@AutoConfigureMockMvc
class LoginNombreDePilaHttpIntegrationTest extends InactividadTestBase {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private PasswordEncoder passwordEncoder;

    @Autowired
    private UsuarioService usuarioService;

    private static String cuerpo(String usuario, String clave) {
        return "{\"nombreUsuario\":\"" + usuario + "\",\"password\":\"" + clave + "\"}";
    }

    private JsonNode loguear(String usuario, String clave) throws Exception {
        String json = mockMvc.perform(post("/api/v1/auth/login").contentType(MediaType.APPLICATION_JSON).content(cuerpo(usuario, clave)))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return objectMapper.readTree(json).path("data").path("usuario");
    }

    private void renombrar(int usuarioId, String nombre) {
        jdbcTemplate.update("UPDATE persona_fisica SET nombre = ? WHERE id = ?", nombre, usuarioId);
    }

    @Test
    void unClienteRecibeSuNombreDePilaYNadaMasDeLoQueYaRecibia() throws Exception {
        Cuenta cuenta = cliente();
        renombrar(cuenta.id(), "Marina");

        JsonNode usuario = loguear(cuenta.nombreUsuario(), cuenta.clave());

        assertEquals("Marina", usuario.path("nombre").asText());
        List<String> campos = new ArrayList<>();
        usuario.fieldNames().forEachRemaining(campos::add);
        assertEquals(List.of("email", "estado", "fotoPerfilUrl", "id", "nombre", "rol"), campos.stream().sorted().toList());
        assertFalse(usuario.has("apellido"));
        assertFalse(usuario.has("dni"));
    }

    @Test
    void cadaCuentaRecibeSoloElNombreDeSuPropiaPersona() throws Exception {
        Cuenta primera = cliente();
        Cuenta segunda = cliente();
        renombrar(primera.id(), "Lucía");
        renombrar(segunda.id(), "Tomás");

        assertEquals("Lucía", loguear(primera.nombreUsuario(), primera.clave()).path("nombre").asText());
        assertEquals("Tomás", loguear(segunda.nombreUsuario(), segunda.clave()).path("nombre").asText());
    }

    @Test
    void unDuenoRecibeElNombreDePilaDelRepresentanteDeSuCuenta() throws Exception {
        Dueno dueno = duenoActivo();
        renombrar(dueno.id(), "Carolina");

        JsonNode usuario = loguear(dueno.nombreUsuario(), dueno.clave());

        assertEquals("DUENO", usuario.path("rol").asText());
        assertEquals("Carolina", usuario.path("nombre").asText());
    }

    @Test
    void unEmpleadoRecibeElNombreDePilaDeSuCuentaDeCliente() throws Exception {
        Dueno dueno = duenoActivo();
        Cuenta cuenta = datos.registrarClienteConCredenciales();
        datos.vincularEmpleado(cuenta.id(), dueno.comercioId(), "ACTIVO", java.time.LocalDateTime.now().minusDays(1));
        renombrar(cuenta.id(), "Nicolás");

        JsonNode usuario = loguear(cuenta.nombreUsuario(), cuenta.clave());

        assertEquals("CLIENTE", usuario.path("rol").asText());
        assertEquals("Nicolás", usuario.path("nombre").asText());
    }

    @Test
    void unAdministradorRecibeSuNombreCuandoTienePersonaFisica() throws Exception {
        Cuenta cuenta = cliente();
        renombrar(cuenta.id(), "Valeria");
        jdbcTemplate.update("UPDATE usuario SET rol = 'ADMINISTRADOR' WHERE id = ?", cuenta.id());
        datos.hacerAdministrador(cuenta.id());

        JsonNode usuario = loguear(cuenta.nombreUsuario(), cuenta.clave());

        assertEquals("ADMINISTRADOR", usuario.path("rol").asText());
        assertEquals("Valeria", usuario.path("nombre").asText());
    }

    @Test
    void sinNombreEnLaBaseElCampoNoViajaYElLoginSigueFuncionando() throws Exception {
        String sufijo = DatosPruebaEmpleado.sufijo();
        String nombreUsuario = "sinnom" + sufijo;
        String clave = DatosPruebaEmpleado.claveAleatoria();
        jdbcTemplate.update("INSERT INTO usuario (nombre_usuario, email, password_hash, rol, estado, intentos_fallidos, fecha_registro) "
                + "VALUES (?, ?, ?, 'ADMINISTRADOR', 'ACTIVO', 0, NOW())",
                nombreUsuario, "sinnombre." + sufijo + "@bajonea.test", passwordEncoder.encode(clave));

        JsonNode usuario = loguear(nombreUsuario, clave);

        assertEquals("ADMINISTRADOR", usuario.path("rol").asText());
        assertFalse(usuario.has("nombre"));
    }

    @Test
    void lasRespuestasDeErrorNoLlevanElNombre() throws Exception {
        Cuenta cuenta = cliente();
        renombrar(cuenta.id(), "Reservado");

        String incorrecta = mockMvc.perform(post("/api/v1/auth/login").contentType(MediaType.APPLICATION_JSON).content(cuerpo(cuenta.nombreUsuario(), "Incorrecta1")))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.data.usuario").doesNotExist())
                .andReturn().getResponse().getContentAsString();
        assertFalse(incorrecta.contains("Reservado"));

        datos.cambiarEstadoUsuario(cuenta.id(), "SUSPENDIDO");
        String suspendida = mockMvc.perform(post("/api/v1/auth/login").contentType(MediaType.APPLICATION_JSON).content(cuerpo(cuenta.nombreUsuario(), cuenta.clave())))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.data.usuario").doesNotExist())
                .andReturn().getResponse().getContentAsString();
        assertFalse(suspendida.contains("Reservado"));

        mockMvc.perform(post("/api/v1/auth/login").contentType(MediaType.APPLICATION_JSON).content(cuerpo("noexiste" + DatosPruebaEmpleado.sufijo(), "Incorrecta1")))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.data.usuario").doesNotExist());
    }

    @Test
    void reactivarConCredencialesDevuelveLaMismaFormaConElNombre() throws Exception {
        Cuenta cuenta = cliente();
        renombrar(cuenta.id(), "Florencia");
        vencida(cuenta.id());
        correr();

        mockMvc.perform(post("/api/v1/auth/reactivar-cuenta/con-credenciales").contentType(MediaType.APPLICATION_JSON)
                        .content(cuerpo(cuenta.nombreUsuario(), cuenta.clave())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.usuario.estado").value("ACTIVO"))
                .andExpect(jsonPath("$.data.usuario.nombre").value("Florencia"));
    }

    @Test
    void laRespuestaDeLaFotoDePerfilTraeElMismoNombreQueElLogin() {
        Cuenta cuenta = cliente();
        renombrar(cuenta.id(), "Agustina");

        assertEquals("Agustina", usuarioService.eliminarFotoPerfil(cuenta.id(), cuenta.id()).getNombre());
        assertTrue(usuarioService.eliminarFotoPerfil(cuenta.id(), cuenta.id()).getFotoPerfilUrl() == null);
    }
}
