package com.bajonea.backend.services;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import com.bajonea.backend.config.security.AuthenticatedUser;
import com.bajonea.backend.dto.request.RegistroClienteRequestDTO;
import com.bajonea.backend.dto.request.RegistroComercioRequestDTO;
import com.bajonea.backend.dto.response.MiComercioResponseDTO;
import com.bajonea.backend.dto.response.NotificacionResponseDTO;
import com.bajonea.backend.dto.response.UsuarioResponseDTO;
import com.bajonea.backend.enums.EstadoComercio;
import com.bajonea.backend.enums.RolUsuario;
import com.bajonea.backend.enums.TipoEntidadNotificacion;
import com.bajonea.backend.enums.TipoNotificacion;
import com.bajonea.backend.exceptions.RecursoNoEncontradoException;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.persistence.EntityManager;
import java.util.List;
import java.util.concurrent.ThreadLocalRandom;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Las consultas reales de notificaciones por comercio y del listado {@code mis-comercios} contra
 * {@code bajonea_test}: pertenencia de una notificación a un comercio (directa o a través del pedido),
 * aislamiento entre usuarios y entre comercios del mismo Dueño, contador agrupado, y marcado de leídas
 * idempotente. Todo corre dentro de una transacción que se revierte al final; para poder insertar pedidos
 * mínimos sin armar cliente, dirección y detalle se apagan los controles de clave foránea de la conexión
 * mientras dura la inserción (las consultas bajo prueba no leen esas tablas).
 */
@SpringBootTest
@ActiveProfiles("test")
class NotificacionesPorComercioIntegrationTest {

    private static final String LOCALIDAD_RIO_GRANDE = "94008010";

    @Autowired
    private RegistroService registroService;

    @Autowired
    private TestSupportService testSupportService;

    @Autowired
    private MisComerciosService misComerciosService;

    @Autowired
    private NotificacionService notificacionService;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private PlatformTransactionManager transactionManager;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private EntityManager entityManager;

    @MockitoBean
    private EmailService emailService;

    private record Dueno(int id, int comercioId) {
        AuthenticatedUser principal() {
            return new AuthenticatedUser(id, 1, RolUsuario.DUENO);
        }
    }

    @Test
    void notificacionesPorComercioYListadoMisComerciosContraLaBaseReal() {
        new TransactionTemplate(transactionManager).executeWithoutResult(status -> {
            Dueno dueno = registrarDueno();
            Dueno otroDueno = registrarDueno();
            int clienteId = registrarCliente();

            int comercioA = dueno.comercioId();
            jdbcTemplate.update("UPDATE comercio SET estado = 'APROBADO' WHERE id = ?", comercioA);
            sincronizarContextoDePersistencia();
            int comercioB = testSupportService.clonarComercio(comercioA, "Comercio B Notif", EstadoComercio.APTO_VENTA);
            int comercioC = testSupportService.clonarComercio(comercioA, "Comercio C Notif", EstadoComercio.RECHAZADO);
            int comercioD = testSupportService.clonarComercio(comercioA, "Comercio D Notif", EstadoComercio.PENDIENTE);

            int pedidoDeA = insertarPedido(clienteId, comercioA);
            int pedidoDeB = insertarPedido(clienteId, comercioB);

            notificacionService.crear(dueno.id(), "A aprobado", TipoNotificacion.COMERCIO_APROBADO, TipoEntidadNotificacion.COMERCIO, comercioA);
            notificacionService.crear(dueno.id(), "Pedido de A", TipoNotificacion.NUEVO_PEDIDO, TipoEntidadNotificacion.PEDIDO, pedidoDeA);
            notificacionService.crear(dueno.id(), "Pedido de B", TipoNotificacion.NUEVO_PEDIDO, TipoEntidadNotificacion.PEDIDO, pedidoDeB);
            notificacionService.crear(dueno.id(), "C rechazado", TipoNotificacion.COMERCIO_RECHAZADO, TipoEntidadNotificacion.COMERCIO, comercioC);
            notificacionService.crear(dueno.id(), "Sin entidad", TipoNotificacion.COMERCIO_APROBADO);
            notificacionService.crear(dueno.id(), "A ya leida", TipoNotificacion.COMERCIO_APROBADO, TipoEntidadNotificacion.COMERCIO, comercioA);
            jdbcTemplate.update("UPDATE notificacion SET leida = 1 WHERE usuario_id = ? AND mensaje = 'A ya leida'", dueno.id());
            sincronizarContextoDePersistencia();
            notificacionService.crear(otroDueno.id(), "Del otro Dueno sobre el comercio A", TipoNotificacion.COMERCIO_APROBADO,
                    TipoEntidadNotificacion.COMERCIO, comercioA);
            notificacionService.crear(clienteId, "Del cliente sobre el pedido de A", TipoNotificacion.PEDIDO_ACEPTADO,
                    TipoEntidadNotificacion.PEDIDO, pedidoDeA);

            listadoMisComercios(dueno, comercioA, comercioB, comercioC, comercioD);
            filtradoPorComercio(dueno, otroDueno, clienteId, comercioA, comercioB, comercioC);
            marcadoDeLeidas(dueno, otroDueno, comercioA, comercioB, comercioC);

            status.setRollbackOnly();
        });
    }

    private void listadoMisComercios(Dueno dueno, int comercioA, int comercioB, int comercioC, int comercioD) {
        List<MiComercioResponseDTO> comercios = misComerciosService.listar(dueno.id());

        assertEquals(List.of(comercioA, comercioB, comercioC, comercioD), comercios.stream().map(MiComercioResponseDTO::getId).toList());
        assertEquals(List.of(EstadoComercio.APROBADO, EstadoComercio.APTO_VENTA, EstadoComercio.RECHAZADO, EstadoComercio.PENDIENTE),
                comercios.stream().map(MiComercioResponseDTO::getEstado).toList());
        assertEquals(List.of(true, true, false, false), comercios.stream().map(MiComercioResponseDTO::isOperativo).toList());
        assertEquals(List.of(2L, 1L, 1L, 0L),
                comercios.stream().map(MiComercioResponseDTO::getCantidadNotificacionesNoLeidas).toList(),
                "A: su alta y el pedido de A (la leída no cuenta); B: su pedido; C: su rechazo; D: ninguna");
        assertEquals(0, misComerciosService.listar(Integer.MAX_VALUE - 1).size());
    }

    private void filtradoPorComercio(Dueno dueno, Dueno otroDueno, int clienteId, int comercioA, int comercioB, int comercioC) {
        assertEquals(List.of("A aprobado", "A ya leida", "Pedido de A"),
                mensajes(notificacionService.listar(dueno.principal(), String.valueOf(comercioA))).stream().sorted().toList(),
                "el comercio A ve las suyas, leídas incluidas, y no las del pedido de B ni las del otro Dueño");
        assertEquals(List.of("Pedido de B"), mensajes(notificacionService.listar(dueno.principal(), String.valueOf(comercioB))));
        assertEquals(List.of("C rechazado"), mensajes(notificacionService.listar(dueno.principal(), String.valueOf(comercioC))));

        assertEquals(2, notificacionService.contarNoLeidas(dueno.principal(), String.valueOf(comercioA)));
        assertEquals(1, notificacionService.contarNoLeidas(dueno.principal(), String.valueOf(comercioB)));

        assertThrows(RecursoNoEncontradoException.class,
                () -> notificacionService.listar(dueno.principal(), String.valueOf(otroDueno.comercioId())));
        assertThrows(RecursoNoEncontradoException.class,
                () -> notificacionService.contarNoLeidas(dueno.principal(), String.valueOf(otroDueno.comercioId())));

        AuthenticatedUser cliente = new AuthenticatedUser(clienteId, 1, RolUsuario.CLIENTE);
        assertEquals(List.of("Del cliente sobre el pedido de A"), mensajes(notificacionService.listar(cliente, "abc")),
                "el Cliente ve todas las suyas e ignora el header, aunque sea inválido o de un comercio");
        assertEquals(1, notificacionService.contarNoLeidas(cliente, String.valueOf(comercioA)));
    }

    private void marcadoDeLeidas(Dueno dueno, Dueno otroDueno, int comercioA, int comercioB, int comercioC) {
        assertEquals(2, notificacionService.marcarLeidasDelComercio(dueno.id(), comercioA));
        assertEquals(0, notificacionService.marcarLeidasDelComercio(dueno.id(), comercioA), "idempotente");
        assertEquals(0, notificacionService.contarNoLeidas(dueno.principal(), String.valueOf(comercioA)));
        assertEquals(1, notificacionService.contarNoLeidas(dueno.principal(), String.valueOf(comercioB)), "B no se toca");
        assertEquals(1, notificacionService.contarNoLeidas(dueno.principal(), String.valueOf(comercioC)), "C no se toca");
        assertEquals(1, noLeidasDe(otroDueno.id()), "las del otro Dueño sobre el mismo comercio no se tocan");
        assertEquals(1, jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM notificacion WHERE usuario_id = ? AND leida = 0 AND entidad_tipo IS NULL", Integer.class, dueno.id()),
                "las notificaciones sin entidad no pertenecen a ningún comercio y no se tocan");

        assertEquals(1, notificacionService.marcarLeidasDelComercio(dueno.id(), comercioC),
                "un comercio no operativo (RECHAZADO) también se puede marcar");

        assertThrows(RecursoNoEncontradoException.class, () -> notificacionService.marcarLeidasDelComercio(dueno.id(), otroDueno.comercioId()));
        assertThrows(RecursoNoEncontradoException.class, () -> notificacionService.marcarLeidasDelComercio(otroDueno.id(), comercioA));
        assertEquals(1, noLeidasDe(otroDueno.id()), "un intento sobre un comercio ajeno no cambia nada");
    }

    /**
     * Las actualizaciones por JDBC no pasan por Hibernate: sin esto la transacción seguiría viendo las
     * entidades como estaban cuando las cargó.
     */
    private void sincronizarContextoDePersistencia() {
        entityManager.flush();
        entityManager.clear();
    }

    private List<String> mensajes(List<NotificacionResponseDTO> notificaciones) {
        return notificaciones.stream().map(NotificacionResponseDTO::getMensaje).toList();
    }

    private int noLeidasDe(int usuarioId) {
        return jdbcTemplate.queryForObject("SELECT COUNT(*) FROM notificacion WHERE usuario_id = ? AND leida = 0", Integer.class, usuarioId);
    }

    private int insertarPedido(int clienteId, int comercioId) {
        jdbcTemplate.execute("SET FOREIGN_KEY_CHECKS = 0");
        try {
            jdbcTemplate.update(
                    "INSERT INTO pedido (cliente_id, comercio_id, modalidad_entrega, subtotal, cargo_servicio_cliente, "
                            + "cargo_servicio_comercio, total) VALUES (?, ?, 'RETIRO', 0, 0, 0, 0)", clienteId, comercioId);
            return jdbcTemplate.queryForObject("SELECT LAST_INSERT_ID()", Integer.class);
        } finally {
            jdbcTemplate.execute("SET FOREIGN_KEY_CHECKS = 1");
        }
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
        return String.valueOf(ThreadLocalRandom.current().nextLong(1_000_000_000L, 9_999_999_999L));
    }

    private static String dniAleatorio() {
        return String.valueOf(ThreadLocalRandom.current().nextInt(30_000_000, 99_999_999));
    }

    private static String cuitAleatorio() {
        return "20" + ThreadLocalRandom.current().nextLong(100_000_000L, 999_999_999L);
    }
}
