package com.bajonea.backend.services;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.bajonea.backend.dto.response.ClienteAdminResponseDTO;
import com.bajonea.backend.enums.EstadoUsuario;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.persistence.EntityManagerFactory;
import java.util.ArrayList;
import java.util.List;
import org.hibernate.SessionFactory;
import org.hibernate.stat.Statistics;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

/**
 * El listado de Clientes del Administrador hace una cantidad fija de consultas, sin importar cuántos Clientes hay
 * ni cuántos están suspendidos (antes hacía varias consultas por cada Cliente).
 */
@SpringBootTest
@ActiveProfiles("test")
class AdministradorListadoClientesConsultasIntegrationTest {

    @Autowired
    private AdministradorService administradorService;

    @Autowired
    private RegistroService registroService;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private EntityManagerFactory entityManagerFactory;

    @MockitoBean
    private EmailService emailService;

    private long consultasDelListado() {
        Statistics estadisticas = entityManagerFactory.unwrap(SessionFactory.class).getStatistics();
        estadisticas.setStatisticsEnabled(true);
        estadisticas.clear();
        administradorService.listarClientes();
        return estadisticas.getPrepareStatementCount();
    }

    private int registrarSuspendido(DatosPruebaEmpleado datos, String estadoPrevio) {
        int id = datos.registrarCliente();
        jdbcTemplate.update("UPDATE usuario SET estado = ?, motivo_suspension = 'Suspension de prueba', suspendido_desde = NOW() WHERE id = ?",
                "SUSPENDIDO", id);
        jdbcTemplate.update("INSERT INTO historial_estado_usuario (usuario_id, estado_origen, estado_destino, motivo, fecha_hora) "
                + "VALUES (?, ?, 'SUSPENDIDO', 'Suspension de prueba', NOW())", id, estadoPrevio);
        return id;
    }

    @Test
    void lasConsultasNoCrecenConLaCantidadDeClientes() {
        DatosPruebaEmpleado datos = new DatosPruebaEmpleado(registroService, objectMapper, jdbcTemplate);
        registrarSuspendido(datos, "ACTIVO");
        long conPocos = consultasDelListado();

        List<Integer> suspendidos = new ArrayList<>();
        for (int i = 0; i < 6; i++) {
            datos.registrarCliente();
        }
        suspendidos.add(registrarSuspendido(datos, "BLOQUEADO"));
        suspendidos.add(registrarSuspendido(datos, "INACTIVO"));
        suspendidos.add(registrarSuspendido(datos, "ACTIVO"));
        long conMuchos = consultasDelListado();

        assertEquals(conPocos, conMuchos);
        assertTrue(conMuchos <= 5, "El listado hizo " + conMuchos + " consultas");
    }

    @Test
    void elEstadoPrevioDeLaSuspensionSigueEnLaRespuesta() {
        DatosPruebaEmpleado datos = new DatosPruebaEmpleado(registroService, objectMapper, jdbcTemplate);
        int bloqueado = registrarSuspendido(datos, "BLOQUEADO");
        int activo = datos.registrarCliente();

        List<ClienteAdminResponseDTO> listado = administradorService.listarClientes();

        ClienteAdminResponseDTO suspendido = listado.stream().filter(c -> c.getId() == bloqueado).findFirst().orElseThrow();
        ClienteAdminResponseDTO normal = listado.stream().filter(c -> c.getId() == activo).findFirst().orElseThrow();
        assertEquals(EstadoUsuario.BLOQUEADO, suspendido.getEstadoPrevioSuspension());
        assertNotNull(suspendido.getMotivoSuspension());
        assertEquals(null, normal.getEstadoPrevioSuspension());
        List<Integer> ids = listado.stream().map(ClienteAdminResponseDTO::getId).toList();
        assertEquals(ids.stream().sorted().toList(), ids);
    }
}
