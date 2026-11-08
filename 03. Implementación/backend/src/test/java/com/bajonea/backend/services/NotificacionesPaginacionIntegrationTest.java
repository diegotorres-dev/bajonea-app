package com.bajonea.backend.services;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.bajonea.backend.config.security.AuthenticatedUser;
import com.bajonea.backend.dto.request.RegistroClienteRequestDTO;
import com.bajonea.backend.dto.request.RegistroComercioRequestDTO;
import com.bajonea.backend.dto.response.NotificacionResponseDTO;
import com.bajonea.backend.dto.response.UsuarioResponseDTO;
import com.bajonea.backend.enums.RolUsuario;
import com.bajonea.backend.enums.TipoEntidadNotificacion;
import com.bajonea.backend.enums.TipoNotificacion;
import com.bajonea.backend.exceptions.ValidacionException;
import com.bajonea.backend.services.NotificacionService.PaginaNotificaciones;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Paginación por cursor de la campana y "Marcar todas" de los avisos personales, contra {@code bajonea_test}. Todo
 * corre dentro de una transacción que se revierte al final.
 */
@SpringBootTest
@ActiveProfiles("test")
class NotificacionesPaginacionIntegrationTest {

    private static final String LOCALIDAD_RIO_GRANDE = "94008010";

    @Autowired
    private RegistroService registroService;

    @Autowired
    private NotificacionService notificacionService;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private PlatformTransactionManager transactionManager;

    @Autowired
    private ObjectMapper objectMapper;

    @MockitoBean
    private EmailService emailService;

    private record Dueno(int id, int comercioId) {
        AuthenticatedUser principal() {
            return new AuthenticatedUser(id, 1, RolUsuario.DUENO);
        }
    }

    private static AuthenticatedUser cliente(int id) {
        return new AuthenticatedUser(id, 1, RolUsuario.CLIENTE);
    }

    private void personales(int usuarioId, int cantidad) {
        for (int i = 1; i <= cantidad; i++) {
            notificacionService.crearParaCliente(usuarioId, "Personal " + i, TipoNotificacion.PRODUCTO_REMOVIDO_CARRITO);
        }
    }

    private List<Integer> ids(PaginaNotificaciones pagina) {
        return pagina.items().stream().map(NotificacionResponseDTO::getId).toList();
    }

    @Test
    void laListaSeEntregaDeAPaginasConCursorSinRepetirNiSaltearYRespetaElLimite() {
        new TransactionTemplate(transactionManager).executeWithoutResult(status -> {
            int clienteId = registrarCliente();
            personales(clienteId, 45);
            AuthenticatedUser usuario = cliente(clienteId);

            PaginaNotificaciones primera = notificacionService.listar(usuario, null, null, null);
            assertEquals(20, primera.items().size(), "por defecto son 20");
            assertNotNull(primera.siguienteCursor());

            List<Integer> todos = new ArrayList<>(ids(primera));
            PaginaNotificaciones segunda = notificacionService.listar(usuario, null, null, primera.siguienteCursor());
            assertEquals(20, segunda.items().size());
            todos.addAll(ids(segunda));
            PaginaNotificaciones tercera = notificacionService.listar(usuario, null, null, segunda.siguienteCursor());
            assertEquals(5, tercera.items().size());
            assertNull(tercera.siguienteCursor(), "la última página no trae cursor");
            todos.addAll(ids(tercera));

            assertEquals(45, todos.stream().distinct().count(), "ninguna fila se repite");
            assertEquals(todos.stream().sorted(java.util.Comparator.reverseOrder()).toList(), todos, "de la más nueva a la más vieja");

            assertEquals(10, notificacionService.listar(usuario, null, 10, null).items().size());
            assertEquals(45, notificacionService.listar(usuario, null, 500, null).items().size(), "el tope es 50 y hay 45");
            assertThrows(ValidacionException.class, () -> notificacionService.listar(usuario, null, 0, null));
            assertThrows(ValidacionException.class, () -> notificacionService.listar(usuario, null, null, "basura"));
            assertThrows(ValidacionException.class, () -> notificacionService.listar(usuario, null, null, "2026-01-01T00:00:00_x"));

            status.setRollbackOnly();
        });
    }

    @Test
    void elTopeDePaginaEsCincuenta() {
        new TransactionTemplate(transactionManager).executeWithoutResult(status -> {
            int clienteId = registrarCliente();
            personales(clienteId, 60);

            PaginaNotificaciones pagina = notificacionService.listar(cliente(clienteId), null, 500, null);

            assertEquals(50, pagina.items().size());
            assertNotNull(pagina.siguienteCursor());
            status.setRollbackOnly();
        });
    }

    @Test
    void unAvisoNuevoNoCorreLasPaginasYUnaPaginaExactaNoDejaCursor() {
        new TransactionTemplate(transactionManager).executeWithoutResult(status -> {
            int clienteId = registrarCliente();
            personales(clienteId, 20);
            AuthenticatedUser usuario = cliente(clienteId);

            PaginaNotificaciones exacta = notificacionService.listar(usuario, null, 20, null);
            assertEquals(20, exacta.items().size());
            assertNull(exacta.siguienteCursor(), "con exactamente 20 filas no hay otra página");

            PaginaNotificaciones primera = notificacionService.listar(usuario, null, 10, null);
            personales(clienteId, 3);
            PaginaNotificaciones segunda = notificacionService.listar(usuario, null, 10, primera.siguienteCursor());
            List<Integer> vistos = new ArrayList<>(ids(primera));
            vistos.addAll(ids(segunda));
            assertEquals(20, vistos.stream().distinct().count(), "los tres nuevos no desplazan ni repiten las filas ya vistas");
            assertTrue(segunda.items().stream().noneMatch(n -> ids(primera).contains(n.getId())));

            status.setRollbackOnly();
        });
    }

    @Test
    void marcarTodasLasPersonalesNoTocaLosDelComercioNiLosAjenosYEsIdempotente() {
        new TransactionTemplate(transactionManager).executeWithoutResult(status -> {
            Dueno dueno = registrarDueno();
            int clienteId = registrarCliente();
            int otroClienteId = registrarCliente();
            personales(dueno.id(), 3);
            notificacionService.crearParaDueno(dueno.id(), dueno.comercioId(), "Del comercio", TipoNotificacion.COMERCIO_APROBADO,
                    TipoEntidadNotificacion.COMERCIO, dueno.comercioId());
            personales(clienteId, 4);
            personales(otroClienteId, 2);

            assertEquals(4, notificacionService.marcarLeidasPersonales(clienteId));
            assertEquals(0, notificacionService.contarNoLeidas(cliente(clienteId), null));
            assertEquals(2, notificacionService.contarNoLeidas(cliente(otroClienteId), null), "otro usuario no se ve afectado");
            assertEquals(0, notificacionService.marcarLeidasPersonales(clienteId), "la segunda vez no marca nada");

            assertEquals(3, notificacionService.marcarLeidasPersonales(dueno.id()));
            assertEquals(1, notificacionService.contarNoLeidas(dueno.principal(), String.valueOf(dueno.comercioId())),
                    "el aviso del comercio sigue sin leer");

            status.setRollbackOnly();
        });
    }

    private Dueno registrarDueno() {
        UsuarioResponseDTO usuario = registroService.registrarComercio(comercioJson());
        int comercioId = jdbcTemplate.queryForObject("SELECT id FROM comercio WHERE dueno_id = ?", Integer.class, usuario.getId());
        return new Dueno(usuario.getId(), comercioId);
    }

    private int registrarCliente() {
        return registroService.registrarCliente(clienteJson()).getId();
    }

    private RegistroClienteRequestDTO clienteJson() {
        String json = """
                {"nombre":"Notif","apellido":"Prueba","dni":"%s","fechaNacimiento":"1995-05-20",
                 "telefono":"+5492964123456","nombreUsuario":"%s","email":"%s","password":"Testing123",
                 "fotoPerfilUrl":"https://res.cloudinary.com/demo/image/upload/foto.png",
                 "direccion":{"calle":"Calle Siempre Viva","numero":"123","pisoDepto":null,"codigoPostal":"9420",
                              "localidadId":"%s","principal":true}}
                """.formatted(dniAleatorio(), "ntf" + sufijo(), "notif." + sufijo() + "@bajonea.test", LOCALIDAD_RIO_GRANDE);
        return leer(json, RegistroClienteRequestDTO.class);
    }

    private RegistroComercioRequestDTO comercioJson() {
        String json = """
                {"fotoPerfilUrl":"https://res.cloudinary.com/demo/image/upload/foto.png",
                 "razonSocial":"Notif SRL","cuit":"%s","condicionIva":"RESPONSABLE_INSCRIPTO","tipoSociedad":"SRL",
                 "domicilioFiscal":"Av. San Martin 100","fechaInicioActividades":"2020-01-01",
                 "nombre":"Comercio Notif %s","descripcion":"Prueba de notificaciones por comercio",
                 "telefono":"+5492964123456","emailContacto":"%s","tipoComercio":"RESTAURANTE",
                 "aceptaDelivery":true,"aceptaRetiro":false,"nombreUsuario":"%s","email":"%s","password":"Testing123",
                 "direccion":{"calle":"Av. San Martin","numero":"100","pisoDepto":null,"codigoPostal":"9420",
                              "localidadId":"%s","principal":true},
                 "horarios":[{"diaSemana":"LUNES","horaApertura":"09:00","horaCierre":"18:00"}],
                 "redesSociales":[{"tipo":"INSTAGRAM","url":"https://instagram.com/notif.%s"}],
                 "nombreRepresentante":"Representante","apellidoRepresentante":"Prueba","dniRepresentante":"%s",
                 "telefonoRepresentante":"+5492964123457","fechaNacimientoRepresentante":"1985-03-15"}
                """.formatted(cuitAleatorio(), sufijo(), "notif." + sufijo() + "@bajonea.test", "ntf" + sufijo(),
                "notif." + sufijo() + "@bajonea.test", LOCALIDAD_RIO_GRANDE, sufijo(), dniAleatorio());
        return leer(json, RegistroComercioRequestDTO.class);
    }

    private <T> T leer(String json, Class<T> tipo) {
        try {
            return objectMapper.readValue(json, tipo);
        } catch (Exception e) {
            throw new IllegalStateException("JSON de prueba inválido para " + tipo.getSimpleName(), e);
        }
    }

    private static String sufijo() {
        return String.valueOf(DatosUnicos.siguienteSufijo());
    }

    private static String dniAleatorio() {
        return String.valueOf(DatosUnicos.siguienteDni());
    }

    private static String cuitAleatorio() {
        return "20" + DatosUnicos.siguienteCuit();
    }
}
