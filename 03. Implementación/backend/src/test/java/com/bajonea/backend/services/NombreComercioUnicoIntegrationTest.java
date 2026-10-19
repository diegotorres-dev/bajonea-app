package com.bajonea.backend.services;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.bajonea.backend.config.security.ComercioActivo;
import com.bajonea.backend.dto.request.ComercioPerfilRequestDTO;
import com.bajonea.backend.enums.EstadoComercio;
import com.bajonea.backend.exceptions.ConflictoDeNegocioException;
import com.bajonea.backend.exceptions.RecursoNoEncontradoException;
import com.bajonea.backend.exceptions.ValidacionException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

/**
 * Nombre único de comercio (Tramo 2, V37) contra {@code bajonea_test}: el chequeo previo de los puntos de entrada, el
 * índice como red de seguridad, la edición del perfil, el servicio de disponibilidad y los dos endpoints por HTTP.
 * Cada prueba crea sus propios nombres (con sufijo aleatorio), así que no depende de datos previos.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class NombreComercioUnicoIntegrationTest {

    private static final String MENSAJE = "Ya existe un comercio con ese nombre. Elegí otro.";
    private static final String PREFIJO = "Cafetería Ñandú ";

    @Autowired
    private RegistroService registroService;

    @Autowired
    private ComercioService comercioService;

    @Autowired
    private NombreComercioService nombreComercioService;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private EmailService emailService;

    private DatosPruebaEmpleado datos;

    @BeforeEach
    void preparar() {
        datos = new DatosPruebaEmpleado(registroService, objectMapper, jdbcTemplate);
    }

    private int usuarios() {
        return jdbcTemplate.queryForObject("SELECT COUNT(*) FROM usuario", Integer.class);
    }

    private static String base() {
        return PREFIJO + DatosPruebaEmpleado.sufijo();
    }

    @Test
    void elRegistroConUnNombreTomadoDa409ConElMensajeYNoDejaNadaEscrito() {
        String nombre = base();
        datos.registrarDuenoAprobado(nombre);
        String sufijo = nombre.substring(PREFIJO.length());
        List<String> variantes = List.of(nombre, nombre.toUpperCase(), "Cafeteria Nandu " + sufijo,
                "  cafetería   ñandú  " + sufijo + " ", "CAFETERIA\\tNANDU " + sufijo,
                "Cafeteria" + (char) 0x00A0 + "Nandu " + sufijo);

        for (String variante : variantes) {
            int antes = usuarios();
            ConflictoDeNegocioException error = assertThrows(ConflictoDeNegocioException.class,
                    () -> datos.registrarDuenoAprobado(variante), variante);
            assertEquals(MENSAJE, error.getMessage());
            assertEquals(antes, usuarios(), "el registro rechazado no deja un usuario huérfano: " + variante);
        }
    }

    @Test
    void unNombreDistintoNoChocaYUnoSinLaEneSiChocaConLaEne() {
        String sufijo = DatosPruebaEmpleado.sufijo();
        datos.registrarDuenoAprobado("Peña " + sufijo);
        datos.registrarDuenoAprobado("Pena Otra " + sufijo);
        assertThrows(ConflictoDeNegocioException.class, () -> datos.registrarDuenoAprobado("PENA " + sufijo));
    }

    @Test
    void unRechazadoRetieneElNombreYUnRechazoDefinitivoLoLibera() {
        String nombre = base();
        DatosPruebaEmpleado.Dueno primero = datos.registrarDuenoAprobado(nombre);

        datos.cambiarEstadoComercio(primero.comercioId(), "RECHAZADO");
        assertThrows(ConflictoDeNegocioException.class, () -> datos.registrarDuenoAprobado(nombre));
        assertFalse(nombreComercioService.estaDisponible(nombre, null));

        datos.cambiarEstadoComercio(primero.comercioId(), "RECHAZO_DEFINITIVO");
        assertTrue(nombreComercioService.estaDisponible(nombre, null));
        DatosPruebaEmpleado.Dueno segundo = datos.registrarDuenoAprobado(nombre);
        assertEquals(nombre, segundo.nombreComercio());
        assertFalse(nombreComercioService.estaDisponible(nombre, null));
    }

    @Test
    void elIndiceUnicoEsLaRedDeSeguridadAunqueSeSalteeElServicio() {
        String nombre = base();
        DatosPruebaEmpleado.Dueno dueno = datos.registrarDuenoAprobado(nombre);

        DuplicateKeyException error = assertThrows(DuplicateKeyException.class, () -> jdbcTemplate.update(
                "INSERT INTO comercio (dueno_id, nombre, foto_perfil_url, telefono, tipo_comercio, estado) VALUES (?, ?, 'x', '1', 'OTRO', 'PENDIENTE')",
                dueno.id(), nombre.toLowerCase().replace("ñ", "n")));
        assertTrue(error.getMostSpecificCause().getMessage().contains("uq_comercio_nombre_unico"));
    }

    @Test
    void editarElPerfilValidaElNombreExcluyendoAlPropioComercio() {
        String sufijo = DatosPruebaEmpleado.sufijo();
        DatosPruebaEmpleado.Dueno a = datos.registrarDuenoAprobado("Local Uno " + sufijo);
        DatosPruebaEmpleado.Dueno b = datos.registrarDuenoAprobado("Local Dos " + sufijo);
        ComercioActivo actorB = ComercioActivo.delDueno(b.comercioId(), b.id(), EstadoComercio.APROBADO);

        ConflictoDeNegocioException error = assertThrows(ConflictoDeNegocioException.class,
                () -> comercioService.editarPerfil(actorB, perfil("local uno " + sufijo)));
        assertEquals(MENSAJE, error.getMessage());
        assertEquals("Local Dos " + sufijo, nombreEnBase(b.comercioId()));

        comercioService.editarPerfil(actorB, perfil("LOCAL DOS " + sufijo));
        assertEquals("Local Dos " + sufijo, nombreEnBase(b.comercioId()));

        comercioService.editarPerfil(actorB, perfil("Local Tres " + sufijo));
        assertEquals("Local Tres " + sufijo, nombreEnBase(b.comercioId()));
        assertTrue(nombreComercioService.estaDisponible("Local Dos " + sufijo, null));
        assertFalse(nombreComercioService.estaDisponible("Local Uno " + sufijo, null));
        assertEquals("Local Uno " + sufijo, nombreEnBase(a.comercioId()));
    }

    @Test
    void alEditarElPerfilElComercioNoSeCuentaASiMismoAunqueElNombreGuardadoDifieraEnElFormato() {
        String sufijo = DatosPruebaEmpleado.sufijo();
        DatosPruebaEmpleado.Dueno dueno = datos.registrarDuenoAprobado("Local Formato " + sufijo);
        jdbcTemplate.update("UPDATE comercio SET nombre = ? WHERE id = ?", "local   formato " + sufijo, dueno.comercioId());
        ComercioActivo actor = ComercioActivo.delDueno(dueno.comercioId(), dueno.id(), EstadoComercio.APROBADO);

        comercioService.editarPerfil(actor, perfil("Local Formato " + sufijo));

        assertEquals("Local Formato " + sufijo, nombreEnBase(dueno.comercioId()));
    }

    @Test
    void laDisponibilidadExcluyeAlPropioComercioYValidaElFormatoYLaPropiedad() {
        String sufijo = DatosPruebaEmpleado.sufijo();
        DatosPruebaEmpleado.Dueno a = datos.registrarDuenoAprobado("Disp Uno " + sufijo);
        DatosPruebaEmpleado.Dueno b = datos.registrarDuenoAprobado("Disp Dos " + sufijo);

        assertFalse(nombreComercioService.consultarDisponibilidad("disp uno " + sufijo, null, null).isDisponible());
        assertTrue(nombreComercioService.consultarDisponibilidad("Disp Libre " + sufijo, null, null).isDisponible());
        assertTrue(nombreComercioService.consultarDisponibilidad("DISP UNO " + sufijo, a.id(), a.comercioId()).isDisponible());
        assertFalse(nombreComercioService.consultarDisponibilidad("Disp Uno " + sufijo, b.id(), b.comercioId()).isDisponible());

        assertThrows(RecursoNoEncontradoException.class,
                () -> nombreComercioService.consultarDisponibilidad("Cualquiera", b.id(), a.comercioId()));
        assertThrows(RecursoNoEncontradoException.class,
                () -> nombreComercioService.consultarDisponibilidad("Cualquiera", b.id(), 99_999_999));
        assertThrows(ValidacionException.class, () -> nombreComercioService.consultarDisponibilidad("   ", null, null));
        assertThrows(ValidacionException.class, () -> nombreComercioService.consultarDisponibilidad("@@@ ---", null, null));
        assertThrows(ValidacionException.class,
                () -> nombreComercioService.consultarDisponibilidad("x".repeat(151), null, null));
    }

    @Test
    void elEndpointPublicoRespondeSinTokenSoloConElBooleanoYElDelDuenoExigeSuRol() throws Exception {
        String sufijo = DatosPruebaEmpleado.sufijo();
        DatosPruebaEmpleado.Dueno dueno = datos.registrarDuenoAprobado("Http Local " + sufijo);
        datos.cambiarEstadoUsuario(dueno.id(), "ACTIVO");
        DatosPruebaEmpleado.Cuenta cliente = datos.registrarClienteConCredenciales();
        String tokenDueno = login(dueno.nombreUsuario(), dueno.clave());
        String tokenCliente = login(cliente.nombreUsuario(), cliente.clave());

        JsonNode ocupado = json(mockMvc.perform(get("/api/v1/auth/comercio-nombre/disponibilidad").param("nombre", "HTTP LOCAL " + sufijo)));
        assertFalse(ocupado.path("data").path("disponible").asBoolean(true));
        assertEquals(List.of("disponible"), campos(ocupado.path("data")));

        JsonNode libre = json(mockMvc.perform(get("/api/v1/auth/comercio-nombre/disponibilidad").param("nombre", "Http Libre " + sufijo)));
        assertTrue(libre.path("data").path("disponible").asBoolean(false));

        mockMvc.perform(get("/api/v1/auth/comercio-nombre/disponibilidad").param("nombre", "  ")).andExpect(status().isBadRequest());
        mockMvc.perform(get("/api/v1/auth/comercio-nombre/disponibilidad")).andExpect(status().isBadRequest());

        mockMvc.perform(get("/api/v1/comercios/nombre/disponibilidad").param("nombre", "Http Local " + sufijo))
                .andExpect(status().isUnauthorized());
        mockMvc.perform(get("/api/v1/comercios/nombre/disponibilidad").param("nombre", "Http Local " + sufijo)
                        .header("Authorization", "Bearer " + tokenCliente))
                .andExpect(status().isForbidden());
        mockMvc.perform(get("/api/v1/comercios/nombre/disponibilidad").param("nombre", "Http Local " + sufijo)
                        .header("Authorization", "Bearer " + tokenCliente).header("X-Comercio-Id", dueno.comercioId()))
                .andExpect(status().isForbidden());

        JsonNode propio = json(mockMvc.perform(get("/api/v1/comercios/nombre/disponibilidad").param("nombre", "http local " + sufijo)
                .param("comercioId", String.valueOf(dueno.comercioId())).header("Authorization", "Bearer " + tokenDueno)));
        assertTrue(propio.path("data").path("disponible").asBoolean(false));
        assertEquals(List.of("disponible"), campos(propio.path("data")));

        JsonNode sinExcluir = json(mockMvc.perform(get("/api/v1/comercios/nombre/disponibilidad").param("nombre", "http local " + sufijo)
                .header("Authorization", "Bearer " + tokenDueno)));
        assertFalse(sinExcluir.path("data").path("disponible").asBoolean(true));

        mockMvc.perform(get("/api/v1/comercios/nombre/disponibilidad").param("nombre", "Cualquiera")
                        .param("comercioId", "99999999").header("Authorization", "Bearer " + tokenDueno))
                .andExpect(status().isNotFound());
    }

    private String nombreEnBase(int comercioId) {
        return jdbcTemplate.queryForObject("SELECT nombre FROM comercio WHERE id = ?", String.class, comercioId);
    }

    private static ComercioPerfilRequestDTO perfil(String nombre) {
        ComercioPerfilRequestDTO request = new ComercioPerfilRequestDTO();
        request.setNombre(nombre);
        request.setDescripcion("Descripcion");
        request.setTelefono("+5492964123456");
        request.setAceptaDelivery(true);
        request.setAceptaRetiro(false);
        return request;
    }

    private String login(String nombreUsuario, String clave) throws Exception {
        String cuerpo = mockMvc.perform(post("/api/v1/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("nombreUsuario", nombreUsuario, "password", clave))))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return objectMapper.readTree(cuerpo).path("data").path("token").asText();
    }

    private JsonNode json(ResultActions resultado) throws Exception {
        return objectMapper.readTree(resultado.andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
    }

    private static List<String> campos(JsonNode nodo) {
        List<String> nombres = new ArrayList<>();
        nodo.fieldNames().forEachRemaining(nombres::add);
        return nombres;
    }
}
