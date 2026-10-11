package com.bajonea.backend.services;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.bajonea.backend.config.security.ComercioActivo;
import com.bajonea.backend.enums.EstadoComercio;
import com.bajonea.backend.enums.RolActorComercio;
import com.bajonea.backend.enums.RolUsuario;
import com.bajonea.backend.exceptions.ComercioNoDisponibleException;
import com.bajonea.backend.exceptions.ValidacionException;
import com.bajonea.backend.services.DatosPruebaEmpleado.Dueno;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

/**
 * El resolver de comercio activo con actor, contra {@code bajonea_test}: el Dueño como siempre, el Empleado con
 * relación {@code ACTIVO} y comercio en un estado accesible, y el mismo {@code 404} (clase, mensaje y código) en
 * todos los casos de rechazo.
 */
@SpringBootTest
@ActiveProfiles("test")
class ComercioActivoServiceResolverEmpleadoIntegrationTest {

    private static final Set<EstadoComercio> ACCESIBLES = Set.of(EstadoComercio.APROBADO, EstadoComercio.APTO_VENTA,
            EstadoComercio.SUSPENDIDO, EstadoComercio.CERRADO_TEMPORALMENTE);

    @Autowired
    private ComercioActivoService service;

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

    private static String id(int comercioId) {
        return String.valueOf(comercioId);
    }

    private ComercioNoDisponibleException rechazo(int usuarioId, RolUsuario rol, String header) {
        return assertThrows(ComercioNoDisponibleException.class, () -> service.resolver(usuarioId, rol, header));
    }

    @Test
    void elDuenoResuelveSuComercioConActorDuenoEnCualquierEstado() {
        Dueno dueno = datos.registrarDuenoAprobado();
        for (EstadoComercio estado : EstadoComercio.values()) {
            datos.cambiarEstadoComercio(dueno.comercioId(), estado.name());

            ComercioActivo activo = service.resolver(dueno.id(), RolUsuario.DUENO, id(dueno.comercioId()));

            assertEquals(new ComercioActivo(dueno.comercioId(), dueno.id(), dueno.id(), RolActorComercio.DUENO, estado), activo);
        }
    }

    @Test
    void elDuenoNoResuelveElComercioDeOtroDueno() {
        Dueno uno = datos.registrarDuenoAprobado();
        Dueno otro = datos.registrarDuenoAprobado();

        rechazo(uno.id(), RolUsuario.DUENO, id(otro.comercioId()));
    }

    @Test
    void elEmpleadoActivoResuelveElComercioConActorEmpleadoYElDuenoRealDelComercio() {
        Dueno dueno = datos.registrarDuenoAprobado();
        int empleado = datos.registrarCliente();
        datos.vincularEmpleado(empleado, dueno.comercioId(), "ACTIVO", LocalDateTime.now());

        ComercioActivo activo = service.resolver(empleado, RolUsuario.CLIENTE, id(dueno.comercioId()));

        assertEquals(new ComercioActivo(dueno.comercioId(), dueno.id(), empleado, RolActorComercio.EMPLEADO, EstadoComercio.APROBADO), activo);
        assertTrue(activo.esEmpleado());
    }

    @ParameterizedTest
    @EnumSource(EstadoComercio.class)
    void elEmpleadoActivoSoloAccedeALosCuatroEstadosAccesibles(EstadoComercio estado) {
        Dueno dueno = datos.registrarDuenoAprobado();
        int empleado = datos.registrarCliente();
        datos.vincularEmpleado(empleado, dueno.comercioId(), "ACTIVO", LocalDateTime.now());
        datos.cambiarEstadoComercio(dueno.comercioId(), estado.name());

        if (ACCESIBLES.contains(estado)) {
            ComercioActivo activo = service.resolver(empleado, RolUsuario.CLIENTE, id(dueno.comercioId()));
            assertEquals(estado, activo.estadoComercio());
            assertEquals(RolActorComercio.EMPLEADO, activo.actorRol());
        } else {
            rechazo(empleado, RolUsuario.CLIENTE, id(dueno.comercioId()));
        }
    }

    @Test
    void elEmpleadoInactivoNoResuelveElComercio() {
        Dueno dueno = datos.registrarDuenoAprobado();
        int empleado = datos.registrarCliente();
        datos.vincularEmpleado(empleado, dueno.comercioId(), "INACTIVO", LocalDateTime.now());

        rechazo(empleado, RolUsuario.CLIENTE, id(dueno.comercioId()));
    }

    @Test
    void laRelacionSeComprueba_contraLaBaseEnCadaLlamada() {
        Dueno dueno = datos.registrarDuenoAprobado();
        int empleado = datos.registrarCliente();
        int relacion = datos.vincularEmpleado(empleado, dueno.comercioId(), "ACTIVO", LocalDateTime.now());
        assertEquals(RolActorComercio.EMPLEADO, service.resolver(empleado, RolUsuario.CLIENTE, id(dueno.comercioId())).actorRol());

        jdbcTemplate.update("UPDATE empleado_comercio SET estado = 'INACTIVO', fecha_baja = NOW() WHERE id = ?", relacion);
        rechazo(empleado, RolUsuario.CLIENTE, id(dueno.comercioId()));

        jdbcTemplate.update("UPDATE empleado_comercio SET estado = 'ACTIVO', fecha_baja = NULL WHERE id = ?", relacion);
        assertEquals(RolActorComercio.EMPLEADO, service.resolver(empleado, RolUsuario.CLIENTE, id(dueno.comercioId())).actorRol());
    }

    @Test
    void elEmpleadoNoResuelveUnComercioConElQueNoTieneRelacion() {
        Dueno dueno = datos.registrarDuenoAprobado();
        Dueno otroDueno = datos.registrarDuenoAprobado();
        int empleado = datos.registrarCliente();
        datos.vincularEmpleado(empleado, dueno.comercioId(), "ACTIVO", LocalDateTime.now());

        rechazo(empleado, RolUsuario.CLIENTE, id(otroDueno.comercioId()));
    }

    @Test
    void unClienteSinRelacionAlgunaNoResuelveNingunComercio() {
        Dueno dueno = datos.registrarDuenoAprobado();
        int cliente = datos.registrarCliente();

        rechazo(cliente, RolUsuario.CLIENTE, id(dueno.comercioId()));
    }

    @Test
    void elAdministradorNuncaResuelveUnComercio() {
        Dueno dueno = datos.registrarDuenoAprobado();

        rechazo(dueno.id(), RolUsuario.ADMINISTRADOR, id(dueno.comercioId()));
        rechazo(dueno.id(), RolUsuario.ADMINISTRADOR, null);
    }

    @Test
    void todosLosRechazosSonElMismoMensajeYElMismoCodigo() {
        Dueno dueno = datos.registrarDuenoAprobado();
        Dueno ajeno = datos.registrarDuenoAprobado();
        Dueno pendiente = datos.registrarDuenoAprobado();
        datos.cambiarEstadoComercio(pendiente.comercioId(), "PENDIENTE");
        int empleadoActivo = datos.registrarCliente();
        int empleadoInactivo = datos.registrarCliente();
        int clienteSinRelacion = datos.registrarCliente();
        int empleadoDeComercioPendiente = datos.registrarCliente();
        datos.vincularEmpleado(empleadoActivo, dueno.comercioId(), "ACTIVO", LocalDateTime.now());
        datos.vincularEmpleado(empleadoInactivo, dueno.comercioId(), "INACTIVO", LocalDateTime.now());
        datos.vincularEmpleado(empleadoDeComercioPendiente, pendiente.comercioId(), "ACTIVO", LocalDateTime.now());

        List<ComercioNoDisponibleException> rechazos = new ArrayList<>();
        rechazos.add(rechazo(dueno.id(), RolUsuario.DUENO, id(ajeno.comercioId())));
        rechazos.add(rechazo(dueno.id(), RolUsuario.DUENO, "2000000000"));
        rechazos.add(rechazo(empleadoActivo, RolUsuario.CLIENTE, id(ajeno.comercioId())));
        rechazos.add(rechazo(empleadoActivo, RolUsuario.CLIENTE, "2000000000"));
        rechazos.add(rechazo(empleadoInactivo, RolUsuario.CLIENTE, id(dueno.comercioId())));
        rechazos.add(rechazo(clienteSinRelacion, RolUsuario.CLIENTE, id(dueno.comercioId())));
        rechazos.add(rechazo(empleadoDeComercioPendiente, RolUsuario.CLIENTE, id(pendiente.comercioId())));
        rechazos.add(rechazo(dueno.id(), RolUsuario.ADMINISTRADOR, id(dueno.comercioId())));

        assertEquals(1, rechazos.stream().map(ComercioNoDisponibleException::getMessage).distinct().count());
        assertEquals(ComercioNoDisponibleException.MENSAJE, rechazos.get(0).getMessage());
        assertEquals("COMERCIO_NO_DISPONIBLE", ComercioNoDisponibleException.CODIGO);
    }

    @ParameterizedTest
    @EnumSource(value = RolUsuario.class, names = {"DUENO", "CLIENTE"})
    void elHeaderAusenteVacioONoNumericoEs400ConTextoNeutro(RolUsuario rol) {
        for (String header : new String[] {null, "", "   ", "abc", "1.5", "12x"}) {
            ValidacionException ex = assertThrows(ValidacionException.class, () -> service.resolver(1, rol, header));
            assertFalse(ex.getMessage().contains("Dueño"), "el texto del 400 no debe nombrar al Dueño: " + ex.getMessage());
        }
    }
}
