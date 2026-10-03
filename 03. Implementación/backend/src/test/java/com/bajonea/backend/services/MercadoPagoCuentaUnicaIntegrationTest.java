package com.bajonea.backend.services;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.bajonea.backend.dto.request.RegistroClienteRequestDTO;
import com.bajonea.backend.dto.request.RegistroComercioRequestDTO;
import com.bajonea.backend.dto.response.DesvinculacionPreviaResponseDTO;
import com.bajonea.backend.exceptions.CuentaMercadoPagoEnUsoException;
import com.bajonea.backend.exceptions.CuentaMercadoPagoYaVinculadaException;
import com.bajonea.backend.exceptions.DesvinculacionBloqueadaException;
import com.bajonea.backend.exceptions.RecursoNoEncontradoException;
import com.bajonea.backend.repositories.PedidoRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.persistence.EntityManager;
import java.time.LocalDateTime;
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
 * Unicidad de la cuenta de Mercado Pago, desvinculación con pagos pendientes y previa, contra
 * {@code bajonea_test} (multi-comercio, tramo 5): el índice único de la columna generada, las consultas con
 * {@code FOR SHARE} sobre pedidos y la consulta agrupada de la previa corren en el motor real. Todo dentro de
 * una transacción que se revierte; los pedidos mínimos se insertan con los controles de clave foránea de la
 * conexión apagados mientras dura la inserción.
 */
@SpringBootTest
@ActiveProfiles("test")
class MercadoPagoCuentaUnicaIntegrationTest {

    private static final String LOCALIDAD_RIO_GRANDE = "94008010";

    @Autowired
    private RegistroService registroService;

    @Autowired
    private CuentaMercadoPagoService cuentaService;

    @Autowired
    private MercadoPagoOAuthService oauthService;

    @Autowired
    private PedidoRepository pedidoRepository;

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
    }

    @Test
    void unaCuentaActivaEnUnDuenoNoSePuedeVincularEnOtroYSeLiberaAlDesvincular() {
        new TransactionTemplate(transactionManager).executeWithoutResult(status -> {
            Dueno a = registrarDueno();
            Dueno b = registrarDueno();
            String cuentaMp = "MP-IT-" + sufijo();
            ponerEstado(a, "APTO_VENTA");
            ponerEstado(b, "APROBADO");

            cuentaService.vincular(a.id(), cuentaMp, "t", "r", "p", true, LocalDateTime.now().plusDays(1));
            cuentaService.vincular(a.id(), cuentaMp, "t2", "r2", "p", true, LocalDateTime.now().plusDays(1));
            assertThrows(CuentaMercadoPagoYaVinculadaException.class,
                    () -> cuentaService.vincular(a.id(), cuentaMp + "-otra", "t", "r", "p", true, LocalDateTime.now().plusDays(1)));
            assertThrows(CuentaMercadoPagoEnUsoException.class,
                    () -> cuentaService.vincular(b.id(), cuentaMp, "t", "r", "p", true, LocalDateTime.now().plusDays(1)));

            oauthService.desvincular(a.id());
            entityManager.flush();
            assertEquals("APROBADO", estadoComercio(a.comercioId()));
            assertEquals(1, jdbcTemplate.queryForObject("SELECT COUNT(*) FROM historial_estado_comercio WHERE comercio_id = ? AND estado_origen = 'APTO_VENTA' AND estado_destino = 'APROBADO'", Integer.class, a.comercioId()));

            cuentaService.vincular(b.id(), cuentaMp, "t", "r", "p", true, LocalDateTime.now().plusDays(1));
            assertEquals(1, jdbcTemplate.queryForObject(
                    "SELECT COUNT(*) FROM cuenta_mercado_pago WHERE mp_user_id = ? AND activa = 1", Integer.class, cuentaMp));

            status.setRollbackOnly();
        });
    }

    @Test
    void elIndiceUnicoRechazaDosFilasActivasConLaMismaCuentaPeroNoUnaInactiva() {
        new TransactionTemplate(transactionManager).executeWithoutResult(status -> {
            Dueno a = registrarDueno();
            Dueno b = registrarDueno();
            String cuentaMp = "MP-UQ-" + sufijo();
            jdbcTemplate.update("INSERT INTO cuenta_mercado_pago (dueno_id, mp_user_id, access_token, refresh_token, activa) "
                    + "VALUES (?, ?, 'a', 'r', 1)", a.id(), cuentaMp);

            jdbcTemplate.update("INSERT INTO cuenta_mercado_pago (dueno_id, mp_user_id, access_token, refresh_token, activa) "
                    + "VALUES (?, ?, 'a', 'r', 0)", b.id(), cuentaMp);
            assertEquals(2, jdbcTemplate.queryForObject(
                    "SELECT COUNT(*) FROM cuenta_mercado_pago WHERE mp_user_id = ?", Integer.class, cuentaMp));
            assertThrows(org.springframework.dao.DuplicateKeyException.class,
                    () -> jdbcTemplate.update("UPDATE cuenta_mercado_pago SET activa = 1 WHERE dueno_id = ?", b.id()));

            status.setRollbackOnly();
        });
    }

    @Test
    void desvincularConPedidoPendientePagoEstaBloqueadaYSinPendientesLaLibera() {
        new TransactionTemplate(transactionManager).executeWithoutResult(status -> {
            Dueno dueno = registrarDueno();
            int clienteId = registrarCliente();
            cuentaService.vincular(dueno.id(), "MP-PP-" + sufijo(), "t", "r", "p", true, LocalDateTime.now().plusDays(1));
            ponerEstado(dueno, "APTO_VENTA");

            LocalDateTime creado = LocalDateTime.now().minusMinutes(3).withNano(0);
            int pendiente = insertarPedido(clienteId, dueno.comercioId(), "PENDIENTE_PAGO", creado);
            insertarPedido(clienteId, dueno.comercioId(), "EN_PREPARACION", LocalDateTime.now().minusMinutes(50));
            insertarPedido(clienteId, dueno.comercioId(), "EN_PREPARACION", LocalDateTime.now().minusMinutes(60));

            DesvinculacionPreviaResponseDTO previa = oauthService.previaDesvinculacion(dueno.id());
            assertFalse(previa.isPuedeDesvincular());
            assertEquals(1, previa.getPagosPendientes().getCantidadTotal());
            assertEquals(creado.plusMinutes(30), previa.getPagosPendientes().getPuedeReintentarDesde());
            assertEquals(1, previa.getComercios().size());
            assertEquals(2L, previa.getComercios().get(0).getPedidosEnCurso().stream()
                    .filter(p -> p.getEstado().equals("EN_PREPARACION")).findFirst().orElseThrow().getCantidad());

            assertEquals(1, pedidoRepository.findPendientesPagoDeComerciosConBloqueoCompartido(List.of(dueno.comercioId())).size());
            DesvinculacionBloqueadaException bloqueada =
                    assertThrows(DesvinculacionBloqueadaException.class, () -> oauthService.desvincular(dueno.id()));
            assertEquals(1, bloqueada.getCantidadPagosPendientes());
            assertEquals(creado.plusMinutes(30), bloqueada.getPuedeReintentarDesde());

            jdbcTemplate.update("UPDATE pedido SET estado = 'EXPIRADO' WHERE id = ?", pendiente);
            assertTrue(oauthService.previaDesvinculacion(dueno.id()).isPuedeDesvincular());
            oauthService.desvincular(dueno.id());

            entityManager.flush();
            assertEquals("APROBADO", estadoComercio(dueno.comercioId()));
            assertEquals(2, jdbcTemplate.queryForObject(
                    "SELECT COUNT(*) FROM pedido WHERE comercio_id = ? AND estado = 'EN_PREPARACION'", Integer.class, dueno.comercioId()));
            assertThrows(RecursoNoEncontradoException.class, () -> oauthService.desvincular(dueno.id()));

            status.setRollbackOnly();
        });
    }

    private void ponerEstado(Dueno dueno, String estado) {
        entityManager.flush();
        jdbcTemplate.update("UPDATE comercio SET estado = ? WHERE id = ?", estado, dueno.comercioId());
        entityManager.clear();
    }

    private String estadoComercio(int comercioId) {
        return jdbcTemplate.queryForObject("SELECT estado FROM comercio WHERE id = ?", String.class, comercioId);
    }

    private int insertarPedido(int clienteId, int comercioId, String estado, LocalDateTime creado) {
        jdbcTemplate.execute("SET FOREIGN_KEY_CHECKS = 0");
        try {
            jdbcTemplate.update("INSERT INTO pedido (cliente_id, comercio_id, modalidad_entrega, estado, subtotal, "
                    + "cargo_servicio_cliente, cargo_servicio_comercio, total, fecha_creacion) "
                    + "VALUES (?, ?, 'RETIRO', ?, 0, 0, 0, 0, ?)", clienteId, comercioId, estado, creado);
            return jdbcTemplate.queryForObject("SELECT LAST_INSERT_ID()", Integer.class);
        } finally {
            jdbcTemplate.execute("SET FOREIGN_KEY_CHECKS = 1");
        }
    }

    private Dueno registrarDueno() {
        int usuarioId = registroService.registrarComercio(comercioJson()).getId();
        int comercioId = jdbcTemplate.queryForObject("SELECT id FROM comercio WHERE dueno_id = ?", Integer.class, usuarioId);
        return new Dueno(usuarioId, comercioId);
    }

    private int registrarCliente() {
        return registroService.registrarCliente(clienteJson()).getId();
    }

    private RegistroClienteRequestDTO clienteJson() {
        String json = """
                {"nombre":"Cuenta","apellido":"Prueba","dni":"%s","fechaNacimiento":"1995-05-20",
                 "telefono":"+5492964123456","nombreUsuario":"%s","email":"%s","password":"Testing123",
                 "fotoPerfilUrl":"https://res.cloudinary.com/demo/image/upload/foto.png",
                 "direccion":{"calle":"Calle Siempre Viva","numero":"123","pisoDepto":null,"codigoPostal":"9420",
                              "localidadId":"%s","principal":true}}
                """.formatted(dniAleatorio(), "cmp" + sufijo(), "cuenta." + sufijo() + "@bajonea.test", LOCALIDAD_RIO_GRANDE);
        return leer(json, RegistroClienteRequestDTO.class);
    }

    private RegistroComercioRequestDTO comercioJson() {
        String json = """
                {"fotoPerfilUrl":"https://res.cloudinary.com/demo/image/upload/foto.png",
                 "razonSocial":"Cuenta SRL","cuit":"%s","condicionIva":"RESPONSABLE_INSCRIPTO","tipoSociedad":"SRL",
                 "domicilioFiscal":"Av. San Martin 100","fechaInicioActividades":"2020-01-01",
                 "nombre":"Comercio Cuenta %s","descripcion":"Prueba de cuenta unica de Mercado Pago",
                 "telefono":"+5492964123456","emailContacto":"%s","tipoComercio":"RESTAURANTE",
                 "aceptaDelivery":true,"aceptaRetiro":false,"nombreUsuario":"%s","email":"%s","password":"Testing123",
                 "direccion":{"calle":"Av. San Martin","numero":"100","pisoDepto":null,"codigoPostal":"9420",
                              "localidadId":"%s","principal":true},
                 "horarios":[{"diaSemana":"LUNES","horaApertura":"09:00","horaCierre":"18:00"}],
                 "redesSociales":[{"tipo":"INSTAGRAM","url":"https://instagram.com/cuenta.%s"}],
                 "nombreRepresentante":"Representante","apellidoRepresentante":"Prueba","dniRepresentante":"%s",
                 "telefonoRepresentante":"+5492964123457","fechaNacimientoRepresentante":"1985-03-15"}
                """.formatted(cuitAleatorio(), sufijo(), "cuenta." + sufijo() + "@bajonea.test", "cmp" + sufijo(),
                "cuenta." + sufijo() + "@bajonea.test", LOCALIDAD_RIO_GRANDE, sufijo(), dniAleatorio());
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
