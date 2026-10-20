package com.bajonea.backend.services;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.bajonea.backend.config.security.ComercioActivo;
import com.bajonea.backend.dto.request.HorarioRequestDTO;
import com.bajonea.backend.dto.response.HorariosComercioResponseDTO;
import com.bajonea.backend.enums.DiaSemana;
import com.bajonea.backend.enums.EstadoComercio;
import com.bajonea.backend.enums.RolActorComercio;
import com.bajonea.backend.exceptions.ConflictoComercioException;
import com.bajonea.backend.exceptions.ValidacionException;
import com.bajonea.backend.services.DatosPruebaEmpleado.Cuenta;
import com.bajonea.backend.services.DatosPruebaEmpleado.Dueno;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
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
 * Edición versionada de los horarios (Fase 2, T1) contra {@code bajonea_test}: vigencia por fecha, cambio
 * programado, cancelación, cola de un turno que cruza, guards del Empleado y las lecturas por HTTP.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class HorarioEdicionIntegrationTest {

    private static final String HORARIOS = "/api/v1/comercios/perfil/horarios";
    private static final String PERFIL = "/api/v1/comercios/perfil";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private RegistroService registroService;

    @Autowired
    private HorarioEdicionService horarioEdicionService;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private Clock clock;

    @MockitoBean
    private EmailService emailService;

    private DatosPruebaEmpleado datos;
    private LocalDate hoy;

    private record Escena(Dueno dueno, Cuenta empleado, ComercioActivo comoDueno, ComercioActivo comoEmpleado) {
    }

    @BeforeEach
    void preparar() {
        datos = new DatosPruebaEmpleado(registroService, objectMapper, jdbcTemplate);
        hoy = LocalDate.now(clock);
    }

    private Escena escena() {
        Dueno dueno = datos.registrarDuenoAprobado();
        datos.cambiarEstadoUsuario(dueno.id(), "ACTIVO");
        Cuenta empleado = datos.registrarClienteConCredenciales();
        datos.vincularEmpleado(empleado.id(), dueno.comercioId(), "ACTIVO", LocalDateTime.now().minusDays(1));
        return new Escena(dueno, empleado,
                ComercioActivo.delDueno(dueno.comercioId(), dueno.id(), EstadoComercio.APROBADO),
                new ComercioActivo(dueno.comercioId(), dueno.id(), empleado.id(), RolActorComercio.EMPLEADO, EstadoComercio.APROBADO));
    }

    private static HorarioRequestDTO franja(DiaSemana dia, String apertura, String cierre) {
        return new HorarioRequestDTO(dia, LocalTime.parse(apertura), LocalTime.parse(cierre));
    }

    private static DiaSemana dia(LocalDate fecha) {
        return DiaSemana.values()[fecha.getDayOfWeek().getValue() - 1];
    }

    private List<Map<String, Object>> filas(int comercioId) {
        return jdbcTemplate.queryForList("SELECT dia_semana, hora_apertura, hora_cierre, vigente_desde, vigente_hasta "
                + "FROM horario WHERE comercio_id = ? ORDER BY id", comercioId);
    }

    private int cantidadFilas(int comercioId) {
        return jdbcTemplate.queryForObject("SELECT COUNT(*) FROM horario WHERE comercio_id = ?", Integer.class, comercioId);
    }

    private int filasSinCierre(int comercioId) {
        return jdbcTemplate.queryForObject("SELECT COUNT(*) FROM horario WHERE comercio_id = ? AND vigente_hasta IS NULL AND vigente_desde <= ?",
                Integer.class, comercioId, hoy);
    }

    private int historial(int comercioId) {
        return jdbcTemplate.queryForObject("SELECT COUNT(*) FROM historial_edicion_comercio WHERE comercio_id = ? AND entidad_tipo = 'HORARIO'",
                Integer.class, comercioId);
    }

    private static List<HorarioRequestDTO> nuevaVersion() {
        return List.of(franja(DiaSemana.MARTES, "10:00", "20:00"), franja(DiaSemana.MIERCOLES, "10:00", "20:00"));
    }

    @Test
    void unaEdicionDistintaCierraLoVigenteConHoyEInsertaLaVersionNuevaDesdeManiana() {
        Escena e = escena();

        HorariosComercioResponseDTO respuesta = horarioEdicionService.editarHorarios(e.comoDueno(), nuevaVersion());

        assertEquals(hoy.plusDays(1), respuesta.getRigeDesde());
        assertEquals(1, respuesta.getVigentes().size());
        assertEquals(DiaSemana.LUNES, respuesta.getVigentes().get(0).getDiaSemana());
        assertEquals(2, respuesta.getPendientes().size());
        List<Map<String, Object>> filas = filas(e.dueno().comercioId());
        assertEquals(3, filas.size());
        assertEquals(java.sql.Date.valueOf(hoy), filas.get(0).get("vigente_hasta"));
        assertEquals(java.sql.Date.valueOf(hoy.plusDays(1)), filas.get(1).get("vigente_desde"));
        assertNull(filas.get(1).get("vigente_hasta"));
        assertEquals(1, historial(e.dueno().comercioId()));
    }

    @Test
    void laSegundaEdicionDelMismoDiaReemplazaAlCambioProgramadoYSoloQuedaUnaGeneracion() {
        Escena e = escena();
        horarioEdicionService.editarHorarios(e.comoDueno(), nuevaVersion());

        HorariosComercioResponseDTO respuesta = horarioEdicionService.editarHorarios(e.comoDueno(),
                List.of(franja(DiaSemana.JUEVES, "08:00", "12:00")));

        assertEquals(1, respuesta.getPendientes().size());
        assertEquals(DiaSemana.JUEVES, respuesta.getPendientes().get(0).getDiaSemana());
        assertEquals(1, respuesta.getVigentes().size());
        assertEquals(2, cantidadFilas(e.dueno().comercioId()));
        assertEquals(2, historial(e.dueno().comercioId()));
    }

    @Test
    void unaEdicionIgualALoVigenteCancelaElCambioProgramadoYReabreLoCerradoHoy() {
        Escena e = escena();
        horarioEdicionService.editarHorarios(e.comoDueno(), nuevaVersion());

        HorariosComercioResponseDTO respuesta = horarioEdicionService.editarHorarios(e.comoDueno(),
                List.of(franja(DiaSemana.LUNES, "09:00", "18:00")));

        assertTrue(respuesta.getPendientes().isEmpty());
        assertNull(respuesta.getRigeDesde());
        assertEquals(1, cantidadFilas(e.dueno().comercioId()));
        assertEquals(1, filasSinCierre(e.dueno().comercioId()));
        assertEquals(2, historial(e.dueno().comercioId()));
        String detalle = jdbcTemplate.queryForObject("SELECT detalle FROM historial_edicion_comercio WHERE comercio_id = ? "
                + "AND entidad_tipo = 'HORARIO' ORDER BY id DESC LIMIT 1", String.class, e.dueno().comercioId());
        assertTrue(detalle.startsWith("Canceló"));
    }

    @Test
    void unaEdicionIgualALoVigenteSinCambioProgramadoNoEscribeNada() {
        Escena e = escena();

        horarioEdicionService.editarHorarios(e.comoDueno(), List.of(franja(DiaSemana.LUNES, "09:00", "18:00")));

        assertEquals(1, cantidadFilas(e.dueno().comercioId()));
        assertEquals(0, historial(e.dueno().comercioId()));
    }

    @Test
    void elOrdenDeLasFranjasNoImportaParaDecidirSiHuboCambio() {
        Escena e = escena();
        horarioEdicionService.editarHorarios(e.comoDueno(), List.of(franja(DiaSemana.LUNES, "09:00", "13:00"), franja(DiaSemana.LUNES, "15:00", "18:00")));

        horarioEdicionService.editarHorarios(e.comoDueno(), List.of(franja(DiaSemana.LUNES, "15:00", "18:00"), franja(DiaSemana.LUNES, "09:00", "13:00")));

        assertEquals(2, historial(e.dueno().comercioId()));
    }

    @Test
    void laColaDeUnTurnoDeHoyQueCruzaRechazaUnaFranjaDeManianaQueSeSuperpone() {
        Escena e = escena();
        jdbcTemplate.update("DELETE FROM horario WHERE comercio_id = ?", e.dueno().comercioId());
        jdbcTemplate.update("INSERT INTO horario (comercio_id, dia_semana, hora_apertura, hora_cierre) VALUES (?, ?, '20:00', '02:00')",
                e.dueno().comercioId(), dia(hoy).name());

        ValidacionException error = assertThrows(ValidacionException.class, () -> horarioEdicionService.editarHorarios(e.comoDueno(),
                List.of(franja(dia(hoy.plusDays(1)), "01:00", "05:00"))));

        assertTrue(error.getMessage().startsWith("Tu turno de hoy ("), error.getMessage());
        assertTrue(error.getMessage().contains("termina el " + ValidadorHorarios.nombreDia(dia(hoy.plusDays(1))) + " a las 02:00"), error.getMessage());
        assertEquals(1, cantidadFilas(e.dueno().comercioId()));
        assertEquals(0, historial(e.dueno().comercioId()));
    }

    @Test
    void laColaNoRechazaUnaFranjaDeManianaQueEmpiezaDespuesDeSuCierre() {
        Escena e = escena();
        jdbcTemplate.update("DELETE FROM horario WHERE comercio_id = ?", e.dueno().comercioId());
        jdbcTemplate.update("INSERT INTO horario (comercio_id, dia_semana, hora_apertura, hora_cierre) VALUES (?, ?, '20:00', '02:00')",
                e.dueno().comercioId(), dia(hoy).name());

        HorariosComercioResponseDTO respuesta = horarioEdicionService.editarHorarios(e.comoDueno(),
                List.of(franja(dia(hoy.plusDays(1)), "02:00", "05:00")));

        assertEquals(1, respuesta.getPendientes().size());
    }

    @Test
    void unaFranjaInvalidaNoDejaFilasAMedias() {
        Escena e = escena();

        assertThrows(ValidacionException.class, () -> horarioEdicionService.editarHorarios(e.comoDueno(),
                List.of(franja(DiaSemana.MARTES, "10:00", "10:00"))));

        assertEquals(1, cantidadFilas(e.dueno().comercioId()));
        assertEquals(1, filasSinCierre(e.dueno().comercioId()));
    }

    @Test
    void elEmpleadoEditaYLaFilaDelHistorialLlevaSuRolYSuUsuario() {
        Escena e = escena();

        horarioEdicionService.editarHorarios(e.comoEmpleado(), nuevaVersion());

        Map<String, Object> fila = jdbcTemplate.queryForMap("SELECT actor_rol, usuario_id, entidad_tipo, accion FROM historial_edicion_comercio "
                + "WHERE comercio_id = ? AND entidad_tipo = 'HORARIO'", e.dueno().comercioId());
        assertEquals("EMPLEADO", fila.get("actor_rol"));
        assertEquals(e.empleado().id(), fila.get("usuario_id"));
        assertEquals("EDITAR", fila.get("accion"));
    }

    @Test
    void elEmpleadoConElComercioSuspendidoRecibe409YNoSeCambiaNada() {
        Escena e = escena();
        datos.cambiarEstadoComercio(e.dueno().comercioId(), "SUSPENDIDO");
        ComercioActivo suspendido = new ComercioActivo(e.dueno().comercioId(), e.dueno().id(), e.empleado().id(), RolActorComercio.EMPLEADO,
                EstadoComercio.SUSPENDIDO);

        ConflictoComercioException error = assertThrows(ConflictoComercioException.class,
                () -> horarioEdicionService.editarHorarios(suspendido, nuevaVersion()));

        assertEquals(ConflictoComercioException.SUSPENDIDO, error.getCodigo());
        assertEquals(1, cantidadFilas(e.dueno().comercioId()));
    }

    @Test
    void elEmpleadoConElComercioCerradoTemporalmentePuedeEditar() {
        Escena e = escena();
        datos.cambiarEstadoComercio(e.dueno().comercioId(), "CERRADO_TEMPORALMENTE");
        ComercioActivo cerrado = new ComercioActivo(e.dueno().comercioId(), e.dueno().id(), e.empleado().id(), RolActorComercio.EMPLEADO,
                EstadoComercio.CERRADO_TEMPORALMENTE);

        HorariosComercioResponseDTO respuesta = horarioEdicionService.editarHorarios(cerrado, nuevaVersion());

        assertEquals(2, respuesta.getPendientes().size());
    }

    @Test
    void elDuenoConElComercioSuspendidoPuedeEditar() {
        Escena e = escena();
        datos.cambiarEstadoComercio(e.dueno().comercioId(), "SUSPENDIDO");

        HorariosComercioResponseDTO respuesta = horarioEdicionService.editarHorarios(
                ComercioActivo.delDueno(e.dueno().comercioId(), e.dueno().id(), EstadoComercio.SUSPENDIDO), nuevaVersion());

        assertFalse(respuesta.getPendientes().isEmpty());
    }

    private String login(String nombreUsuario, String clave) throws Exception {
        String cuerpo = mockMvc.perform(post("/api/v1/auth/login").contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("nombreUsuario", nombreUsuario, "password", clave))))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return objectMapper.readTree(cuerpo).path("data").path("token").asText();
    }

    private ResultActions editarPorHttp(String token, Integer comercioId, String json) throws Exception {
        var request = put(HORARIOS).header("Authorization", "Bearer " + token).contentType(MediaType.APPLICATION_JSON).content(json);
        return mockMvc.perform(comercioId == null ? request : request.header("X-Comercio-Id", comercioId));
    }

    private JsonNode cuerpo(ResultActions resultado) throws Exception {
        return objectMapper.readTree(resultado.andReturn().getResponse().getContentAsString());
    }

    private static final String CUERPO_OK = "{\"horarios\":[{\"diaSemana\":\"VIERNES\",\"horaApertura\":\"20:00\",\"horaCierre\":\"02:00\"}]}";

    @Test
    void elDuenoYElEmpleadoEditanPorHttpYLaRespuestaTraeVigentesPendientesYRigeDesde() throws Exception {
        Escena e = escena();
        String tokenDueno = login(e.dueno().nombreUsuario(), e.dueno().clave());
        String tokenEmpleado = login(e.empleado().nombreUsuario(), e.empleado().clave());

        JsonNode delDueno = cuerpo(editarPorHttp(tokenDueno, e.dueno().comercioId(), CUERPO_OK).andExpect(status().isOk())).path("data");
        assertEquals(hoy.plusDays(1).toString(), delDueno.path("rigeDesde").asText());
        assertEquals(1, delDueno.path("pendientes").size());
        assertTrue(delDueno.path("pendientes").get(0).path("cruzaMedianoche").asBoolean());
        assertFalse(delDueno.path("vigentes").get(0).path("cruzaMedianoche").asBoolean());

        JsonNode delEmpleado = cuerpo(editarPorHttp(tokenEmpleado, e.dueno().comercioId(),
                "{\"horarios\":[{\"diaSemana\":\"LUNES\",\"horaApertura\":\"09:00\",\"horaCierre\":\"18:00\"}]}").andExpect(status().isOk())).path("data");
        assertEquals(0, delEmpleado.path("pendientes").size());
    }

    @Test
    void laListaVaciaOLaFranjaConCierreIgualAAperturaDan400() throws Exception {
        Escena e = escena();
        String token = login(e.dueno().nombreUsuario(), e.dueno().clave());

        editarPorHttp(token, e.dueno().comercioId(), "{\"horarios\":[]}").andExpect(status().isBadRequest());
        editarPorHttp(token, e.dueno().comercioId(),
                "{\"horarios\":[{\"diaSemana\":\"LUNES\",\"horaApertura\":\"09:00\",\"horaCierre\":\"09:00\"}]}").andExpect(status().isBadRequest());
        assertEquals(1, cantidadFilas(e.dueno().comercioId()));
    }

    @Test
    void unEmpleadoInactivoRecibe404AunqueElCuerpoSeaInvalidoYUnClienteSinRelacionTambien() throws Exception {
        Escena e = escena();
        jdbcTemplate.update("UPDATE empleado_comercio SET estado = 'INACTIVO', fecha_baja = NOW() WHERE empleado_id = ? AND comercio_id = ?", e.empleado().id(), e.dueno().comercioId());
        String tokenEmpleado = login(e.empleado().nombreUsuario(), e.empleado().clave());
        Cuenta ajeno = datos.registrarClienteConCredenciales();
        String tokenAjeno = login(ajeno.nombreUsuario(), ajeno.clave());

        editarPorHttp(tokenEmpleado, e.dueno().comercioId(), "{\"horarios\":[]}").andExpect(status().isNotFound());
        editarPorHttp(tokenAjeno, e.dueno().comercioId(), CUERPO_OK).andExpect(status().isNotFound());
        editarPorHttp(tokenAjeno, null, CUERPO_OK).andExpect(status().isBadRequest());
    }

    @Test
    void unEmpleadoConElComercioSuspendidoRecibe409ConElCodigoEstable() throws Exception {
        Escena e = escena();
        datos.cambiarEstadoComercio(e.dueno().comercioId(), "SUSPENDIDO");
        String token = login(e.empleado().nombreUsuario(), e.empleado().clave());

        JsonNode respuesta = cuerpo(editarPorHttp(token, e.dueno().comercioId(), CUERPO_OK).andExpect(status().isConflict()));

        assertEquals(ConflictoComercioException.SUSPENDIDO, respuesta.path("data").path("codigo").asText());
    }

    @Test
    void elPerfilMuestraSoloLosHorariosVigentesDeHoyYElCambioProgramadoAparteParaElDuenoYElEmpleado() throws Exception {
        Escena e = escena();
        horarioEdicionService.editarHorarios(e.comoDueno(), nuevaVersion());
        String tokenDueno = login(e.dueno().nombreUsuario(), e.dueno().clave());
        String tokenEmpleado = login(e.empleado().nombreUsuario(), e.empleado().clave());

        for (String token : List.of(tokenDueno, tokenEmpleado)) {
            JsonNode perfil = cuerpo(mockMvc.perform(get(PERFIL).header("Authorization", "Bearer " + token)
                    .header("X-Comercio-Id", e.dueno().comercioId())).andExpect(status().isOk())).path("data");
            assertEquals(1, perfil.path("horarios").size());
            assertEquals("LUNES", perfil.path("horarios").get(0).path("diaSemana").asText());
            assertEquals(2, perfil.path("horariosPendientes").size());
            assertEquals(hoy.plusDays(1).toString(), perfil.path("horariosRigenDesde").asText());
        }
    }

    @Test
    void elCatalogoPublicoNuncaMuestraPendientesNiVersionesVencidas() throws Exception {
        Escena e = escena();
        datos.cambiarEstadoComercio(e.dueno().comercioId(), "APTO_VENTA");
        horarioEdicionService.editarHorarios(e.comoDueno(), nuevaVersion());

        JsonNode listado = cuerpo(mockMvc.perform(get("/api/v1/catalogo/comercios")).andExpect(status().isOk())).path("data");
        JsonNode catalogo = null;
        for (JsonNode comercio : listado) {
            if (comercio.path("id").asInt() == e.dueno().comercioId()) {
                catalogo = comercio;
            }
        }

        assertTrue(catalogo != null);
        assertEquals(1, catalogo.path("horarios").size());
        assertEquals("LUNES", catalogo.path("horarios").get(0).path("diaSemana").asText());
    }
}
