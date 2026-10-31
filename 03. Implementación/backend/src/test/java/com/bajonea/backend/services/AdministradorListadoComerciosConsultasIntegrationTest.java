package com.bajonea.backend.services;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.bajonea.backend.dto.response.ComercioAdminResponseDTO;
import com.bajonea.backend.services.DatosPruebaEmpleado.Dueno;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.persistence.EntityManagerFactory;
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
 * El listado general de comercios del Administrador hace una cantidad fija de consultas sin importar cuántos
 * comercios o Dueños hay ni cuántos Dueños están suspendidos: el nombre del Dueño y el estado de su cuenta salen
 * de lo que el listado ya trae.
 */
@SpringBootTest
@ActiveProfiles("test")
class AdministradorListadoComerciosConsultasIntegrationTest {

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
        administradorService.listarComercios();
        return estadisticas.getPrepareStatementCount();
    }

    @Test
    void lasConsultasNoCrecenConLaCantidadDeComerciosNiDeDuenosSuspendidos() {
        DatosPruebaEmpleado datos = new DatosPruebaEmpleado(registroService, objectMapper, jdbcTemplate);
        datos.registrarDuenoAprobado();
        long conPocos = consultasDelListado();

        for (int i = 0; i < 5; i++) {
            Dueno dueno = datos.registrarDuenoAprobado();
            if (i % 2 == 0) {
                datos.cambiarEstadoUsuario(dueno.id(), "SUSPENDIDO");
            }
        }
        long conMuchos = consultasDelListado();

        assertEquals(conPocos, conMuchos);
        assertTrue(conMuchos <= 12, "El listado hizo " + conMuchos + " consultas");
    }

    @Test
    void cadaFilaTraeElNombreDelDuenoYSiSuCuentaEstaSuspendida() {
        DatosPruebaEmpleado datos = new DatosPruebaEmpleado(registroService, objectMapper, jdbcTemplate);
        Dueno suspendido = datos.registrarDuenoAprobado();
        Dueno activo = datos.registrarDuenoAprobado();
        datos.cambiarEstadoUsuario(suspendido.id(), "SUSPENDIDO");
        datos.cambiarEstadoUsuario(activo.id(), "ACTIVO");

        List<ComercioAdminResponseDTO> listado = administradorService.listarComercios();

        ComercioAdminResponseDTO filaSuspendido = listado.stream().filter(c -> c.getId() == suspendido.comercioId()).findFirst().orElseThrow();
        ComercioAdminResponseDTO filaActivo = listado.stream().filter(c -> c.getId() == activo.comercioId()).findFirst().orElseThrow();
        assertTrue(filaSuspendido.isDuenoSuspendido());
        assertFalse(filaActivo.isDuenoSuspendido());
        assertEquals(suspendido.id(), filaSuspendido.getDuenoUsuarioId());
        assertFalse(filaSuspendido.getDuenoNombre().isBlank());
    }
}
