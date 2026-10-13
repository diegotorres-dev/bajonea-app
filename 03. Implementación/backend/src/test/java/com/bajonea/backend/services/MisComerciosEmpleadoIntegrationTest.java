package com.bajonea.backend.services;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.bajonea.backend.dto.response.ComercioEmpleadoResponseDTO;
import com.bajonea.backend.dto.response.MiComercioEmpleadoResponseDTO;
import com.bajonea.backend.enums.EstadoComercio;
import com.bajonea.backend.enums.TipoComercio;
import com.bajonea.backend.services.DatosPruebaEmpleado.Dueno;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Set;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

/**
 * {@code GET /empleados/mis-comercios} (servicio) y el perfil reducido del Empleado, contra {@code bajonea_test}:
 * solo relaciones activas con comercio en un estado accesible, orden por fecha de alta e id, forma de la fila y
 * lista blanca de campos del perfil.
 */
@SpringBootTest
@ActiveProfiles("test")
class MisComerciosEmpleadoIntegrationTest {

    private static final LocalDateTime BASE = LocalDateTime.of(2026, 10, 1, 9, 0, 0);

    @Autowired
    private MisComerciosEmpleadoService service;

    @Autowired
    private ComercioService comercioService;

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

    @Test
    void unClienteSinRelacionesRecibeListaVacia() {
        assertTrue(service.listar(datos.registrarCliente()).isEmpty());
    }

    @Test
    void devuelveSoloRelacionesActivasConComercioAccesibleOrdenadasPorFechaDeAltaEIdYConLaFormaDeMisComercios() {
        int empleado = datos.registrarCliente();
        Dueno aprobado = datos.registrarDuenoAprobado();
        Dueno aptoVenta = datos.registrarDuenoAprobado();
        Dueno suspendido = datos.registrarDuenoAprobado();
        Dueno cerrado = datos.registrarDuenoAprobado();
        Dueno pendiente = datos.registrarDuenoAprobado();
        Dueno rechazoDefinitivo = datos.registrarDuenoAprobado();
        Dueno conRelacionInactiva = datos.registrarDuenoAprobado();
        datos.cambiarEstadoComercio(aptoVenta.comercioId(), "APTO_VENTA");
        datos.cambiarEstadoComercio(suspendido.comercioId(), "SUSPENDIDO");
        datos.cambiarEstadoComercio(cerrado.comercioId(), "CERRADO_TEMPORALMENTE");
        datos.cambiarEstadoComercio(pendiente.comercioId(), "PENDIENTE");
        datos.cambiarEstadoComercio(rechazoDefinitivo.comercioId(), "RECHAZO_DEFINITIVO");
        datos.vincularEmpleado(empleado, cerrado.comercioId(), "ACTIVO", BASE.plusDays(3));
        datos.vincularEmpleado(empleado, aprobado.comercioId(), "ACTIVO", BASE.plusDays(1));
        datos.vincularEmpleado(empleado, suspendido.comercioId(), "ACTIVO", BASE.plusDays(4));
        datos.vincularEmpleado(empleado, aptoVenta.comercioId(), "ACTIVO", BASE.plusDays(2));
        datos.vincularEmpleado(empleado, pendiente.comercioId(), "ACTIVO", BASE.plusDays(5));
        datos.vincularEmpleado(empleado, rechazoDefinitivo.comercioId(), "ACTIVO", BASE.plusDays(6));
        datos.vincularEmpleado(empleado, conRelacionInactiva.comercioId(), "INACTIVO", BASE.plusDays(7));

        List<MiComercioEmpleadoResponseDTO> filas = service.listar(empleado);

        assertEquals(List.of(aprobado.comercioId(), aptoVenta.comercioId(), cerrado.comercioId(), suspendido.comercioId()),
                filas.stream().map(MiComercioEmpleadoResponseDTO::getId).toList());
        assertEquals(List.of(EstadoComercio.APROBADO, EstadoComercio.APTO_VENTA, EstadoComercio.CERRADO_TEMPORALMENTE,
                EstadoComercio.SUSPENDIDO), filas.stream().map(MiComercioEmpleadoResponseDTO::getEstado).toList());
        assertEquals(List.of(true, true, false, false), filas.stream().map(MiComercioEmpleadoResponseDTO::isOperativo).toList());
        assertEquals(BASE.plusDays(1), filas.get(0).getFechaAlta());
        assertEquals(aprobado.nombreComercio(), filas.get(0).getNombre());
        assertEquals(0L, filas.get(0).getCantidadNotificacionesNoLeidas());
        assertTrue(filas.stream().allMatch(fila -> fila.getFechaRegistro() != null));
    }

    @Test
    void conLaMismaFechaDeAltaDesempataPorIdDeRelacion() {
        int empleado = datos.registrarCliente();
        Dueno primero = datos.registrarDuenoAprobado();
        Dueno segundo = datos.registrarDuenoAprobado();
        datos.vincularEmpleado(empleado, segundo.comercioId(), "ACTIVO", BASE);
        datos.vincularEmpleado(empleado, primero.comercioId(), "ACTIVO", BASE);

        List<MiComercioEmpleadoResponseDTO> filas = service.listar(empleado);

        assertEquals(List.of(segundo.comercioId(), primero.comercioId()), filas.stream().map(MiComercioEmpleadoResponseDTO::getId).toList());
    }

    @Test
    void elPerfilReducidoTieneSoloLosCamposDeLaListaBlanca() throws Exception {
        Dueno dueno = datos.registrarDuenoAprobado();

        ComercioEmpleadoResponseDTO perfil = comercioService.verPerfilEmpleado(dueno.comercioId());

        JsonNode json = objectMapper.valueToTree(perfil);
        Set<String> campos = new java.util.TreeSet<>();
        json.fieldNames().forEachRemaining(campos::add);
        assertEquals(Set.of("id", "nombre", "descripcion", "fotoPerfilUrl", "telefono", "tipoComercio", "aceptaDelivery",
                "aceptaRetiro", "emailContacto", "direccion", "horarios", "estado", "cerradoManualmente", "abiertoAhora", "puedeCambiarCierre",
                "textoReapertura"), campos);
        assertEquals(dueno.nombreComercio(), perfil.getNombre());
        assertEquals(TipoComercio.RESTAURANTE, perfil.getTipoComercio());
        assertTrue(perfil.isAceptaDelivery());
        assertFalse(perfil.isAceptaRetiro());
        assertFalse(perfil.isCerradoManualmente());
        assertFalse(perfil.getHorarios().isEmpty());
        assertEquals("Av. San Martin", perfil.getDireccion().getCalle());
    }
}
