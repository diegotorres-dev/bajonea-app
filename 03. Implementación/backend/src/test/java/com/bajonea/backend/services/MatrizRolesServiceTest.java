package com.bajonea.backend.services;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.bajonea.backend.repositories.AdministradorRepository;
import com.bajonea.backend.repositories.ClienteRepository;
import com.bajonea.backend.repositories.DuenoRepository;
import com.bajonea.backend.repositories.EmpleadoRepository;
import com.bajonea.backend.services.MatrizRolesService.Capacidades;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

class MatrizRolesServiceTest {

    private static final int USUARIO_ID = 42;

    private AdministradorRepository administradorRepository;
    private DuenoRepository duenoRepository;
    private ClienteRepository clienteRepository;
    private EmpleadoRepository empleadoRepository;
    private MatrizRolesService service;

    @BeforeEach
    void preparar() {
        administradorRepository = mock(AdministradorRepository.class);
        duenoRepository = mock(DuenoRepository.class);
        clienteRepository = mock(ClienteRepository.class);
        empleadoRepository = mock(EmpleadoRepository.class);
        service = new MatrizRolesService(administradorRepository, duenoRepository, clienteRepository, empleadoRepository);
    }

    private void filas(boolean administrador, boolean dueno, boolean cliente, boolean empleado) {
        when(administradorRepository.existsById(USUARIO_ID)).thenReturn(administrador);
        when(duenoRepository.existsById(USUARIO_ID)).thenReturn(dueno);
        when(clienteRepository.existsById(USUARIO_ID)).thenReturn(cliente);
        when(empleadoRepository.existsById(USUARIO_ID)).thenReturn(empleado);
    }

    @Test
    void capacidadesSeLeenConUnExistsByIdPorTablaSinJoins() {
        filas(false, true, false, false);

        Capacidades capacidades = service.capacidadesDe(USUARIO_ID);

        assertEquals(new Capacidades(false, true, false, false), capacidades);
        verify(administradorRepository).existsById(USUARIO_ID);
        verify(duenoRepository).existsById(USUARIO_ID);
        verify(clienteRepository).existsById(USUARIO_ID);
        verify(empleadoRepository).existsById(USUARIO_ID);
    }

    @ParameterizedTest(name = "administrador={0} dueno={1} cliente={2} empleado={3} -> combinacionValida={4}, puedeSerEmpleado={5}")
    @CsvSource({
            "false, false, false, false, true,  true",
            "false, false, true,  false, true,  true",
            "false, false, false, true,  true,  true",
            "false, false, true,  true,  true,  true",
            "true,  false, false, false, true,  false",
            "true,  false, true,  false, true,  false",
            "false, true,  false, false, true,  false",
            "false, true,  true,  false, true,  false",
            "true,  true,  false, false, false, false",
            "true,  true,  true,  false, false, false",
            "true,  false, false, true,  false, false",
            "true,  false, true,  true,  false, false",
            "false, true,  false, true,  false, false",
            "false, true,  true,  true,  false, false",
            "true,  true,  false, true,  false, false",
            "true,  true,  true,  true,  false, false"
    })
    void todasLasCombinacionesDeLasCuatroCapacidades(boolean administrador, boolean dueno, boolean cliente, boolean empleado,
            boolean combinacionValida, boolean puedeSerEmpleado) {
        filas(administrador, dueno, cliente, empleado);

        Capacidades capacidades = service.capacidadesDe(USUARIO_ID);

        assertEquals(combinacionValida, capacidades.esCombinacionValida());
        assertEquals(puedeSerEmpleado, capacidades.puedeSerEmpleado());
        assertEquals(puedeSerEmpleado, service.puedeSerEmpleado(USUARIO_ID));
    }
}
