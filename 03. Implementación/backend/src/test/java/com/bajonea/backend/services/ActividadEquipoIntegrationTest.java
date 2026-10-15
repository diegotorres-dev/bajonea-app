package com.bajonea.backend.services;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.bajonea.backend.dto.response.ActividadComercioItemResponseDTO;
import com.bajonea.backend.dto.response.ActividadComercioResponseDTO;
import com.bajonea.backend.dto.response.EquipoComercioResponseDTO;
import com.bajonea.backend.dto.response.InvitacionEmpleadoResponseDTO;
import com.bajonea.backend.exceptions.RecursoNoEncontradoException;
import com.bajonea.backend.exceptions.ValidacionException;
import com.bajonea.backend.services.DatosPruebaEmpleado.Cuenta;
import com.bajonea.backend.services.DatosPruebaEmpleado.Dueno;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.persistence.EntityManagerFactory;
import java.time.Clock;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ThreadLocalRandom;
import org.hibernate.SessionFactory;
import org.hibernate.stat.Statistics;
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
 * Fuente {@code EQUIPO} de la actividad del comercio y lectura del Administrador (E4, bloque A3) contra
 * {@code bajonea_test}: el orden total entre las cuatro fuentes con empates, el cursor, el filtro, el actor Dueño,
 * Empleado y del sistema, las filas de invitación sin relación, la aceptación de una invitación estando inactivo
 * (una sola línea), las cuatro consultas por página, los endpoints del Administrador (seguridad por rol, comercio
 * en cualquier estado, {@code 404}) y {@code diasRestantes} de las invitaciones.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class ActividadEquipoIntegrationTest {

    private static final String HEADER = "X-Comercio-Id";
    private static final LocalDateTime T0 = LocalDateTime.of(2026, 9, 1, 12, 0, 0);

    @Autowired
    private ActividadComercioService actividadService;

    @Autowired
    private InvitacionEmpleadoService invitacionService;

    @Autowired
    private EquipoComercioAdminService adminService;

    @Autowired
    private RegistroService registroService;

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private EntityManagerFactory entityManagerFactory;

    @Autowired
    private Clock clock;

    @MockitoBean
    private EmailService emailService;

    private DatosPruebaEmpleado datos;
    private Dueno dueno;
    private Dueno duenoAjeno;
    private Cuenta ana;
    private Cuenta beto;
    private int relacionAna;
    private int relacionBeto;
    private int comprador;
    private final List<String> esperados = new ArrayList<>();
    private long iv1;
    private long ac1;
    private long iv2;
    private long ic2;
    private long bj;
    private long re;
    private long rn;
    private long iv3b;
    private long ac3;
    private long rx3;
    private long nulo;

    @BeforeEach
    void preparar() {
        datos = new DatosPruebaEmpleado(registroService, objectMapper, jdbcTemplate);
        dueno = datos.registrarDuenoAprobado();
        duenoAjeno = datos.registrarDuenoAprobado();
        datos.cambiarEstadoUsuario(dueno.id(), "ACTIVO");
        datos.cambiarEstadoUsuario(duenoAjeno.id(), "ACTIVO");
        ana = datos.registrarClienteConCredenciales();
        beto = datos.registrarClienteConCredenciales();
        comprador = datos.registrarCliente();
        relacionAna = datos.vincularEmpleado(ana.id(), dueno.comercioId(), "INACTIVO", T0);
        relacionBeto = datos.vincularEmpleado(beto.id(), dueno.comercioId(), "ACTIVO", T0);
        sembrar();
    }

    private void sembrar() {
        int invAna = invitacion(dueno, "ana.equipo@bajonea.test", "ACEPTADA", T0, T0.plusDays(7));
        int invCora = invitacion(dueno, "cora.equipo@bajonea.test", "CANCELADA", T0.plusMinutes(2), T0.plusDays(7));
        int invDora = invitacion(dueno, "dora.equipo@bajonea.test", "PENDIENTE", T0.plusMinutes(6), T0.plusDays(7));
        int invBeto = invitacion(dueno, "beto.equipo@bajonea.test", "ACEPTADA", T0.plusMinutes(7), T0.plusDays(7));

        iv1 = equipo(dueno, null, invAna, "INVITACION", null, null, dueno.id(), T0);
        ac1 = equipo(dueno, relacionAna, invAna, "ACEPTACION", null, "ACTIVO", ana.id(), T0.plusMinutes(1));
        iv2 = equipo(dueno, null, invCora, "INVITACION", null, null, dueno.id(), T0.plusMinutes(2));
        ic2 = equipo(dueno, null, invCora, "INVITACION_CANCELADA", null, null, dueno.id(), T0.plusMinutes(3));
        bj = equipo(dueno, relacionBeto, null, "BAJA_DUENO", "ACTIVO", "INACTIVO", dueno.id(), T0.plusMinutes(4));
        re = equipo(dueno, relacionBeto, null, "REACTIVACION", "INACTIVO", "ACTIVO", dueno.id(), T0.plusMinutes(5));
        rn = equipo(dueno, relacionAna, null, "RENUNCIA", "ACTIVO", "INACTIVO", ana.id(), T0.plusMinutes(6));
        iv3b = equipo(dueno, null, invDora, "INVITACION", null, null, dueno.id(), T0.plusMinutes(6));
        ac3 = equipo(dueno, relacionBeto, invBeto, "ACEPTACION", null, "ACTIVO", beto.id(), T0.plusMinutes(7));
        rx3 = equipo(dueno, relacionBeto, invBeto, "REACTIVACION", "INACTIVO", "ACTIVO", beto.id(), T0.plusMinutes(7));
        nulo = equipo(dueno, relacionBeto, null, "BAJA_DUENO", "ACTIVO", "INACTIVO", null, T0.plusMinutes(8));

        int pedido = pedido(dueno, "EN_PREPARACION");
        long p4 = pedidoHistorial(pedido, "EN_PREPARACION", "DUENO", dueno.id(), T0.plusMinutes(4));
        long e4 = edicion(dueno, dueno.id(), T0.plusMinutes(4));
        long c4 = cierre(dueno, dueno.id(), T0.plusMinutes(4));

        int invAjena = invitacion(duenoAjeno, "ajena.equipo@bajonea.test", "PENDIENTE", T0, T0.plusDays(7));
        equipo(duenoAjeno, null, invAjena, "INVITACION", null, null, duenoAjeno.id(), T0.plusMinutes(4));

        esperados.addAll(List.of("EQUIPO-" + nulo, "EQUIPO-" + ac3, "EQUIPO-" + iv3b, "EQUIPO-" + rn, "EQUIPO-" + re,
                "PEDIDO-" + p4, "EDICION-" + e4, "CIERRE-" + c4, "EQUIPO-" + bj, "EQUIPO-" + ic2, "EQUIPO-" + iv2,
                "EQUIPO-" + ac1, "EQUIPO-" + iv1));
    }

    private int invitacion(Dueno comercio, String email, String estado, LocalDateTime creacion, LocalDateTime vencimiento) {
        String codigo = String.format("%06d", ThreadLocalRandom.current().nextInt(0, 1_000_000));
        jdbcTemplate.update("INSERT INTO invitacion_empleado (comercio_id, email, codigo, estado, invitado_por_usuario_id, fecha_creacion, "
                + "fecha_vencimiento) VALUES (?, ?, ?, ?, ?, ?, ?)", comercio.comercioId(), email, codigo, estado, comercio.id(), creacion,
                vencimiento);
        return jdbcTemplate.queryForObject("SELECT LAST_INSERT_ID()", Integer.class);
    }

    private long equipo(Dueno comercio, Integer relacionId, Integer invitacionId, String motivo, String origen, String destino,
            Integer actor, LocalDateTime fecha) {
        jdbcTemplate.update("INSERT INTO historial_empleado_comercio (comercio_id, empleado_comercio_id, invitacion_id, estado_origen, "
                + "estado_destino, motivo, actor_usuario_id, fecha_hora) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", comercio.comercioId(), relacionId,
                invitacionId, origen, destino, motivo, actor, fecha);
        return jdbcTemplate.queryForObject("SELECT LAST_INSERT_ID()", Long.class);
    }

    private long edicion(Dueno comercio, int usuarioId, LocalDateTime fecha) {
        jdbcTemplate.update("INSERT INTO historial_edicion_comercio (comercio_id, usuario_id, actor_rol, entidad_tipo, entidad_id, "
                + "entidad_nombre, accion, fecha_hora) VALUES (?, ?, 'DUENO', 'PRODUCTO', 1, 'Producto', 'CREAR', ?)",
                comercio.comercioId(), usuarioId, fecha);
        return jdbcTemplate.queryForObject("SELECT LAST_INSERT_ID()", Long.class);
    }

    private int pedido(Dueno comercio, String estado) {
        jdbcTemplate.update("INSERT INTO pedido (cliente_id, comercio_id, modalidad_entrega, estado, pago_estado, subtotal, "
                + "cargo_servicio_cliente, cargo_servicio_comercio, total, fecha_creacion) "
                + "VALUES (?, ?, 'RETIRO', ?, 'PAGADO', 10000, 200, 100, 10200, ?)", comprador, comercio.comercioId(), estado, T0);
        return jdbcTemplate.queryForObject("SELECT LAST_INSERT_ID()", Integer.class);
    }

    private long pedidoHistorial(int pedidoId, String estado, String rol, Integer usuarioId, LocalDateTime fecha) {
        jdbcTemplate.update("INSERT INTO historial_estado_pedido (pedido_id, estado, actor_rol, actor_usuario_id, fecha_hora) "
                + "VALUES (?, ?, ?, ?, ?)", pedidoId, estado, rol, usuarioId, fecha);
        return jdbcTemplate.queryForObject("SELECT LAST_INSERT_ID()", Long.class);
    }

    private long cierre(Dueno comercio, Integer usuarioId, LocalDateTime fecha) {
        jdbcTemplate.update("INSERT INTO historial_cierre_comercio (comercio_id, accion, actor_usuario_id, actor_rol, fecha_hora) "
                + "VALUES (?, 'CERRADO', ?, 'DUENO', ?)", comercio.comercioId(), usuarioId, fecha);
        return jdbcTemplate.queryForObject("SELECT LAST_INSERT_ID()", Long.class);
    }

    private static List<String> ids(ActividadComercioResponseDTO pagina) {
        return pagina.getItems().stream().map(ActividadComercioItemResponseDTO::getId).toList();
    }

    private String nombreDe(int usuarioId) {
        Map<String, Object> fila = jdbcTemplate.queryForMap("SELECT nombre, apellido FROM persona_fisica WHERE id = ?", usuarioId);
        return fila.get("nombre") + " " + fila.get("apellido");
    }

    private ActividadComercioItemResponseDTO item(long idEquipo) {
        return actividadService.listar(dueno.comercioId(), 100, null).getItems().stream()
                .filter(fila -> fila.getId().equals("EQUIPO-" + idEquipo)).findFirst().orElseThrow();
    }

    private String loginDe(String nombreUsuario, String clave) throws Exception {
        String cuerpo = mockMvc.perform(post("/api/v1/auth/login").contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("nombreUsuario", nombreUsuario, "password", clave))))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return objectMapper.readTree(cuerpo).path("data").path("token").asText();
    }

    private String tokenAdministrador() throws Exception {
        Cuenta administrador = datos.registrarClienteConCredenciales();
        datos.hacerAdministrador(administrador.id());
        jdbcTemplate.update("UPDATE usuario SET rol = 'ADMINISTRADOR' WHERE id = ?", administrador.id());
        return loginDe(administrador.nombreUsuario(), administrador.clave());
    }

    private ResultActions leer(String ruta, String token, Integer headerComercio) throws Exception {
        var request = get(ruta);
        if (token != null) {
            request = request.header("Authorization", "Bearer " + token);
        }
        if (headerComercio != null) {
            request = request.header(HEADER, headerComercio);
        }
        return mockMvc.perform(request);
    }

    @Test
    void mezclaLasCuatroFuentesEnUnSoloOrdenConEmpatesSinLoAjenoNiLaReactivacionDeLaAceptacion() {
        ActividadComercioResponseDTO pagina = actividadService.listar(dueno.comercioId(), 100, null);

        assertEquals(esperados, ids(pagina));
        assertFalse(ids(pagina).contains("EQUIPO-" + rx3));
        assertFalse(pagina.isHayMas());
        assertNull(pagina.getSiguienteCursor());
    }

    @Test
    void laAceptacionEstandoInactivoEsUnaSolaLineaYLaReactivacionDirectaSiAparece() {
        List<String> ids = ids(actividadService.listar(dueno.comercioId(), 100, null));

        assertTrue(ids.contains("EQUIPO-" + ac3));
        assertFalse(ids.contains("EQUIPO-" + rx3));
        assertTrue(ids.contains("EQUIPO-" + re));
        assertEquals(2L, ids.stream().filter(id -> id.equals("EQUIPO-" + ac3) || id.equals("EQUIPO-" + rx3) || id.equals("EQUIPO-" + re))
                .count());
        assertEquals("Aceptó la invitación", item(ac3).getAccionTexto());
        assertEquals("Reactivó a " + nombreDe(beto.id()), item(re).getAccionTexto());
    }

    @Test
    void cadaMotivoTraeActorRolEntidadYTextoLegible() {
        ActividadComercioItemResponseDTO invito = item(iv2);
        assertEquals("INVITACION", invito.getAccion());
        assertEquals("Invitó a cora.equipo@bajonea.test", invito.getAccionTexto());
        assertEquals("INVITACION", invito.getEntidadTipo());
        assertEquals("cora.equipo@bajonea.test", invito.getEntidadNombre());
        assertEquals("DUENO", invito.getActorRol());
        assertEquals("Dueño", invito.getActorRolTexto());
        assertEquals(dueno.id(), invito.getActorUsuarioId());
        assertEquals(nombreDe(dueno.id()), invito.getActorNombre());
        assertEquals("EQUIPO", invito.getFuente().name());
        assertNull(invito.getDetalle());

        ActividadComercioItemResponseDTO cancelo = item(ic2);
        assertEquals("Canceló la invitación a cora.equipo@bajonea.test", cancelo.getAccionTexto());
        assertEquals("INVITACION", cancelo.getEntidadTipo());

        ActividadComercioItemResponseDTO acepto = item(ac1);
        assertEquals("Aceptó la invitación", acepto.getAccionTexto());
        assertEquals("EMPLEADO", acepto.getActorRol());
        assertEquals("Empleado", acepto.getActorRolTexto());
        assertEquals(ana.id(), acepto.getActorUsuarioId());
        assertEquals("EMPLEADO", acepto.getEntidadTipo());
        assertEquals(ana.id(), acepto.getEntidadId());
        assertEquals(nombreDe(ana.id()), acepto.getEntidadNombre());

        ActividadComercioItemResponseDTO baja = item(bj);
        assertEquals("BAJA_DUENO", baja.getAccion());
        assertEquals("Dio de baja a " + nombreDe(beto.id()), baja.getAccionTexto());
        assertEquals("DUENO", baja.getActorRol());
        assertEquals("EMPLEADO", baja.getEntidadTipo());
        assertEquals(beto.id(), baja.getEntidadId());

        ActividadComercioItemResponseDTO renuncia = item(rn);
        assertEquals("RENUNCIA", renuncia.getAccion());
        assertEquals("Dejó de trabajar en el comercio", renuncia.getAccionTexto());
        assertEquals("EMPLEADO", renuncia.getActorRol());
        assertEquals(nombreDe(ana.id()), renuncia.getActorNombre());
        assertEquals(ana.id(), renuncia.getEntidadId());

        ActividadComercioItemResponseDTO reactivo = item(re);
        assertEquals("REACTIVACION", reactivo.getAccion());
        assertEquals("DUENO", reactivo.getActorRol());
    }

    @Test
    void unaFilaSinActorEsDelSistemaSinNombreNiUsuario() {
        ActividadComercioItemResponseDTO fila = item(nulo);

        assertEquals("SISTEMA", fila.getActorRol());
        assertEquals("Sistema", fila.getActorRolTexto());
        assertNull(fila.getActorNombre());
        assertNull(fila.getActorUsuarioId());
        assertEquals("Dio de baja a " + nombreDe(beto.id()), fila.getAccionTexto());
    }

    @Test
    void elFiltroEquipoDevuelveSoloEsaFuenteEnElMismoOrdenYSinFiltroSigueIgual() {
        List<String> equipo = esperados.stream().filter(id -> id.startsWith("EQUIPO-")).toList();

        ActividadComercioResponseDTO pagina = actividadService.listar(dueno.comercioId(), 100, null, "EQUIPO");
        assertEquals(equipo, ids(pagina));
        assertTrue(pagina.getItems().stream().allMatch(fila -> fila.getFuente().name().equals("EQUIPO")));
        for (String fuente : new String[] {"PEDIDO", "EDICION", "CIERRE"}) {
            assertTrue(ids(actividadService.listar(dueno.comercioId(), 100, null, fuente)).stream()
                    .noneMatch(id -> id.startsWith("EQUIPO-")), fuente);
        }
        assertEquals(esperados, ids(actividadService.listar(dueno.comercioId(), 100, null, null)));
    }

    @Test
    void paginarPorCursorEntregaCadaFilaUnaSolaVezAunConEmpatesEntreFuentesYDentroDeLaFuente() {
        for (String fuente : new String[] {null, "EQUIPO"}) {
            List<String> objetivo = fuente == null ? esperados : esperados.stream().filter(id -> id.startsWith("EQUIPO-")).toList();
            for (int limite = 1; limite <= 5; limite++) {
                List<String> recorridas = new ArrayList<>();
                String cursor = null;
                int paginas = 0;
                do {
                    ActividadComercioResponseDTO pagina = actividadService.listar(dueno.comercioId(), limite, cursor, fuente);
                    assertTrue(pagina.getItems().size() <= limite);
                    recorridas.addAll(ids(pagina));
                    assertEquals(pagina.isHayMas(), pagina.getSiguienteCursor() != null);
                    cursor = pagina.getSiguienteCursor();
                    paginas++;
                    assertTrue(paginas <= objetivo.size() + 1, "El recorrido no termina");
                } while (cursor != null);
                assertEquals(objetivo, recorridas, "Fuente " + fuente + " con límite " + limite);
            }
        }
    }

    @Test
    void unCursorConLaFuenteEquipoSeAceptaYUnaFuenteInvalidaDiceLasCuatro() {
        String cursor = actividadService.listar(dueno.comercioId(), 2, null).getSiguienteCursor();
        assertTrue(actividadService.listar(dueno.comercioId(), 100, cursor).getItems().size() > 0);
        assertEquals(esperados.size() - 2, actividadService.listar(dueno.comercioId(), 100, cursor).getItems().size());

        ValidacionException error = assertThrows(ValidacionException.class,
                () -> actividadService.listar(dueno.comercioId(), 10, null, "basura"));
        assertEquals("La fuente tiene que ser PEDIDO, EDICION, CIERRE o EQUIPO", error.getMessage());
    }

    @Test
    void cadaPaginaSinFiltroSonCuatroConsultasYConFiltroUna() {
        Statistics estadisticas = entityManagerFactory.unwrap(SessionFactory.class).getStatistics();
        estadisticas.setStatisticsEnabled(true);
        estadisticas.clear();
        ActividadComercioResponseDTO pagina = actividadService.listar(dueno.comercioId(), 100, null);
        assertEquals(esperados.size(), pagina.getItems().size());
        assertEquals(4, estadisticas.getPrepareStatementCount());

        estadisticas.clear();
        actividadService.listar(dueno.comercioId(), 100, null, "EQUIPO");
        assertEquals(1, estadisticas.getPrepareStatementCount());
    }

    @Test
    void elDuenoVeLaFuenteEquipoPorHttp() throws Exception {
        String token = loginDe(dueno.nombreUsuario(), dueno.clave());
        List<String> equipo = esperados.stream().filter(id -> id.startsWith("EQUIPO-")).toList();

        leer("/api/v1/comercios/equipo/actividad?fuente=EQUIPO&limite=100", token, dueno.comercioId())
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.items.length()").value(equipo.size()))
                .andExpect(jsonPath("$.data.items[0].id").value(equipo.get(0)))
                .andExpect(jsonPath("$.data.items[0].fuente").value("EQUIPO"));
        leer("/api/v1/comercios/equipo/actividad?fuente=basura", token, dueno.comercioId())
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.mensaje").value("La fuente tiene que ser PEDIDO, EDICION, CIERRE o EQUIPO"));
    }

    @Test
    void elAdministradorVeLaActividadYElEquipoDeCualquierComercioEnCualquierEstadoSinElHeader() throws Exception {
        String token = tokenAdministrador();
        List<String> equipo = esperados.stream().filter(id -> id.startsWith("EQUIPO-")).toList();

        for (String estado : new String[] {"APROBADO", "PENDIENTE", "RECHAZADO", "SUSPENDIDO", "INACTIVO"}) {
            datos.cambiarEstadoComercio(dueno.comercioId(), estado);
            leer("/api/v1/administrador/comercios/" + dueno.comercioId() + "/actividad?limite=100", token, null)
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.data.items.length()").value(esperados.size()))
                    .andExpect(jsonPath("$.data.items[0].id").value(esperados.get(0)));
            leer("/api/v1/administrador/comercios/" + dueno.comercioId() + "/equipo", token, null)
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.data.miembros.length()").value(2));
        }
        leer("/api/v1/administrador/comercios/" + dueno.comercioId() + "/actividad?fuente=EQUIPO&limite=100", token,
                duenoAjeno.comercioId())
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.items.length()").value(equipo.size()))
                .andExpect(jsonPath("$.data.items[0].id").value(equipo.get(0)));
    }

    @Test
    void elEquipoDelAdministradorTieneLaMismaFormaQueElDelDueno() throws Exception {
        String tokenAdmin = tokenAdministrador();
        String tokenDueno = loginDe(dueno.nombreUsuario(), dueno.clave());
        jdbcTemplate.update("UPDATE empleado_comercio SET estado = 'INACTIVO', fecha_baja = ? WHERE id = ?", T0.plusMinutes(8), relacionBeto);

        JsonNode admin = objectMapper.readTree(leer("/api/v1/administrador/comercios/" + dueno.comercioId() + "/equipo", tokenAdmin, null)
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString()).path("data");
        JsonNode propio = objectMapper.readTree(leer("/api/v1/comercios/equipo", tokenDueno, dueno.comercioId())
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString()).path("data");

        assertEquals(propio, admin);
        JsonNode inactivoBeto = null;
        JsonNode inactivaAna = null;
        for (JsonNode miembro : admin.path("miembros")) {
            if (miembro.path("empleadoId").asInt() == beto.id()) {
                inactivoBeto = miembro;
            } else if (miembro.path("empleadoId").asInt() == ana.id()) {
                inactivaAna = miembro;
            }
        }
        assertEquals("INACTIVO", inactivoBeto.path("estado").asText());
        assertEquals("BAJA_DUENO", inactivoBeto.path("motivoBaja").asText());
        assertTrue(inactivoBeto.path("puedeReactivar").asBoolean());
        assertEquals("INACTIVO", inactivaAna.path("estado").asText());
        assertEquals("RENUNCIA", inactivaAna.path("motivoBaja").asText());
        assertFalse(inactivaAna.path("puedeReactivar").asBoolean());
        assertEquals(1, admin.path("invitaciones").size());
    }

    @Test
    void unComercioInexistenteEsElMismo404DelServicioYDeHttp() throws Exception {
        assertThrows(RecursoNoEncontradoException.class, () -> adminService.verEquipo(999_999_999));
        assertThrows(RecursoNoEncontradoException.class, () -> adminService.verActividad(999_999_999, 10, null, null));

        String token = tokenAdministrador();
        for (String ruta : new String[] {"/equipo", "/actividad"}) {
            leer("/api/v1/administrador/comercios/999999999" + ruta, token, null)
                    .andExpect(status().isNotFound())
                    .andExpect(jsonPath("$.mensaje").value("Comercio no encontrado"));
        }
    }

    @Test
    void laSeguridadRechazaAlAnonimoAlClienteAlEmpleadoYAlDuenoEnAmbasRutas() throws Exception {
        String tokenDueno = loginDe(dueno.nombreUsuario(), dueno.clave());
        String tokenDuenoAjeno = loginDe(duenoAjeno.nombreUsuario(), duenoAjeno.clave());
        String tokenCliente = loginDe(ana.nombreUsuario(), ana.clave());
        String tokenEmpleado = loginDe(beto.nombreUsuario(), beto.clave());

        for (String ruta : new String[] {"/equipo", "/actividad"}) {
            String url = "/api/v1/administrador/comercios/" + dueno.comercioId() + ruta;
            leer(url, null, null).andExpect(status().isUnauthorized());
            leer(url, tokenCliente, null).andExpect(status().isForbidden());
            leer(url, tokenEmpleado, dueno.comercioId()).andExpect(status().isForbidden());
            leer(url, tokenDueno, dueno.comercioId()).andExpect(status().isForbidden());
            leer(url, tokenDuenoAjeno, null).andExpect(status().isForbidden());
        }
    }

    @Test
    void diasRestantesEsElCeilDeLosDiasConMinimoUnoSoloEnPendienteVigente() {
        LocalDateTime ahora = LocalDateTime.now(clock);
        Dueno comercio = datos.registrarDuenoAprobado();
        String[] emails = {"d8", "d7", "d1", "d2", "dmin", "dvencida", "dinvalidada"};
        long[] minutosHasta = {7 * 24 * 60 + 30, 6 * 24 * 60 + 12 * 60, 23 * 60, 25 * 60, 1, -5, 3 * 24 * 60};
        String[] estados = {"PENDIENTE", "PENDIENTE", "PENDIENTE", "PENDIENTE", "PENDIENTE", "PENDIENTE", "INVALIDADA"};
        for (int i = 0; i < emails.length; i++) {
            invitacion(comercio, emails[i] + "@bajonea.test", estados[i], ahora.minusDays(1), ahora.plusMinutes(minutosHasta[i]));
        }

        EquipoComercioResponseDTO equipo = invitacionService.listarEquipo(comercio.comercioId());
        Map<String, InvitacionEmpleadoResponseDTO> porEmail = new java.util.HashMap<>();
        equipo.getInvitaciones().forEach(inv -> porEmail.put(inv.getEmail().replace("@bajonea.test", ""), inv));

        assertEquals(8, porEmail.get("d8").getDiasRestantes());
        assertEquals(7, porEmail.get("d7").getDiasRestantes());
        assertEquals(1, porEmail.get("d1").getDiasRestantes());
        assertEquals(2, porEmail.get("d2").getDiasRestantes());
        assertEquals(1, porEmail.get("dmin").getDiasRestantes());
        assertEquals("VENCIDA", porEmail.get("dvencida").getEstado().name());
        assertNull(porEmail.get("dvencida").getDiasRestantes());
        assertNull(porEmail.get("dinvalidada").getDiasRestantes());
    }

    @Test
    void invitarDevuelveSieteDiasRestantesYCancelarNingunoPorHttp() throws Exception {
        String token = loginDe(dueno.nombreUsuario(), dueno.clave());

        JsonNode creada = objectMapper.readTree(mockMvc.perform(post("/api/v1/comercios/equipo/invitaciones")
                        .header("Authorization", "Bearer " + token).header(HEADER, dueno.comercioId())
                        .contentType(MediaType.APPLICATION_JSON).content("{\"email\":\"nueva.equipo@bajonea.test\"}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.diasRestantes").value(7))
                .andReturn().getResponse().getContentAsString()).path("data");

        leer("/api/v1/comercios/equipo", token, dueno.comercioId())
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.invitaciones[?(@.email=='nueva.equipo@bajonea.test')].diasRestantes").value(7));

        mockMvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                        .put("/api/v1/comercios/equipo/invitaciones/" + creada.path("id").asInt() + "/cancelar")
                        .header("Authorization", "Bearer " + token).header(HEADER, dueno.comercioId()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.diasRestantes").doesNotExist());
    }
}
