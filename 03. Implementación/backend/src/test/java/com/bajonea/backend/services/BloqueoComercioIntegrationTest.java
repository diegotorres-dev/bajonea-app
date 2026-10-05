package com.bajonea.backend.services;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.bajonea.backend.dto.request.ConfirmarRecuperacionPasswordRequestDTO;
import com.bajonea.backend.dto.request.LoginRequestDTO;
import com.bajonea.backend.dto.request.RegistroComercioRequestDTO;
import com.bajonea.backend.entities.Comercio;
import com.bajonea.backend.entities.Token;
import com.bajonea.backend.entities.Usuario;
import com.bajonea.backend.enums.EstadoComercio;
import com.bajonea.backend.enums.TipoToken;
import com.bajonea.backend.exceptions.CredencialesInvalidasException;
import com.bajonea.backend.repositories.ComercioRepository;
import com.bajonea.backend.repositories.UsuarioRepository;
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
 * Bloqueo de cuenta del Dueño y su restauración contra {@code bajonea_test} (bloque "Cierre manual", tramo C2):
 * solo los {@code APTO_VENTA} pasan a {@code CERRADO_TEMPORALMENTE}, el resto de los estados no se toca, cada
 * transición deja su fila de historial y la restauración depende de la cuenta de Mercado Pago. Todo dentro de una
 * transacción que se revierte. La concurrencia real entre transacciones se ejercita en
 * {@code stress-locks-tramoC2.mjs}.
 */
@SpringBootTest
@ActiveProfiles("test")
class BloqueoComercioIntegrationTest {

    private static final String LOCALIDAD_RIO_GRANDE = "94008010";
    private static final String MOTIVO_BLOQUEO = "Bloqueo de cuenta por intentos fallidos";
    private static final String MOTIVO_RESTAURACION = "Restauración por recuperación de contraseña";

    @Autowired
    private RegistroService registroService;

    @Autowired
    private AuthService authService;

    @Autowired
    private ComercioService comercioService;

    @Autowired
    private TestSupportService testSupportService;

    @Autowired
    private TokenService tokenService;

    @Autowired
    private UsuarioRepository usuarioRepository;

    @Autowired
    private ComercioRepository comercioRepository;

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

    private record Dueno(int id, String nombreUsuario, String email, int comercioId) {
    }

    private record Comercios(int aptoVenta, int aprobado, int suspendido, int inactivo, int pendiente, int rechazado) {
    }

    @Test
    void elBloqueoCierraSoloLosAptoVentaYLaRecuperacionSinCuentaLosDejaEnAprobado() {
        new TransactionTemplate(transactionManager).executeWithoutResult(status -> {
            Dueno dueno = duenoActivo();
            Comercios c = comerciosEnTodosLosEstados(dueno);
            int historialBase = filasDeHistorial(c.aptoVenta());

            bloquearPorIntentosFallidos(dueno);

            assertEquals("BLOQUEADO", estadoUsuario(dueno.id()));
            assertEquals("CERRADO_TEMPORALMENTE", estado(c.aptoVenta()));
            assertEquals("APROBADO", estado(c.aprobado()));
            assertEquals("SUSPENDIDO", estado(c.suspendido()));
            assertEquals("INACTIVO", estado(c.inactivo()));
            assertEquals("PENDIENTE", estado(c.pendiente()));
            assertEquals("RECHAZADO", estado(c.rechazado()));
            assertEquals(historialBase + 1, filasDeHistorial(c.aptoVenta()));
            assertEquals(List.of("APTO_VENTA>CERRADO_TEMPORALMENTE|" + MOTIVO_BLOQUEO + "|sin-admin"), ultimasFilas(c.aptoVenta(), 1));
            assertEquals(0, filasDeHistorial(c.aprobado()));
            assertEquals(0, filasDeHistorial(c.suspendido()));
            assertEquals(0, filasDeHistorial(c.inactivo()));

            recuperarPassword(dueno);

            assertEquals("ACTIVO", estadoUsuario(dueno.id()));
            assertEquals("APROBADO", estado(c.aptoVenta()));
            assertEquals("APROBADO", estado(c.aprobado()));
            assertEquals("SUSPENDIDO", estado(c.suspendido()));
            assertEquals("INACTIVO", estado(c.inactivo()));
            assertEquals("PENDIENTE", estado(c.pendiente()));
            assertEquals(List.of("CERRADO_TEMPORALMENTE>APROBADO|" + MOTIVO_RESTAURACION + "|sin-admin"), ultimasFilas(c.aptoVenta(), 1));
            assertEquals(0, filasDeHistorial(c.aprobado()));

            status.setRollbackOnly();
        });
    }

    @Test
    void conCuentaDeMercadoPagoLosComerciosVuelvenAVenderTrasLaRecuperacionYElCierreManualPrevioSigueVigente() {
        new TransactionTemplate(transactionManager).executeWithoutResult(status -> {
            Dueno dueno = duenoActivo();
            Comercios c = comerciosEnTodosLosEstados(dueno);
            testSupportService.vincularCuentaMercadoPagoSimulada(dueno.id(), null);
            entityManager.flush();
            entityManager.clear();
            assertEquals("APTO_VENTA", estado(c.aptoVenta()));
            assertEquals("APTO_VENTA", estado(c.aprobado()));
            jdbcTemplate.update("UPDATE comercio SET cerrado_manualmente = 1 WHERE id = ?", c.aprobado());

            bloquearPorIntentosFallidos(dueno);

            assertEquals("CERRADO_TEMPORALMENTE", estado(c.aptoVenta()));
            assertEquals("CERRADO_TEMPORALMENTE", estado(c.aprobado()));
            assertEquals("SUSPENDIDO", estado(c.suspendido()));
            assertEquals("INACTIVO", estado(c.inactivo()));
            assertEquals(1, bandera(c.aprobado()));

            recuperarPassword(dueno);

            assertEquals("APTO_VENTA", estado(c.aptoVenta()));
            assertEquals("APTO_VENTA", estado(c.aprobado()));
            assertEquals("SUSPENDIDO", estado(c.suspendido()));
            assertEquals("INACTIVO", estado(c.inactivo()));
            assertEquals(1, bandera(c.aprobado()));
            assertEquals(0, bandera(c.aptoVenta()));

            status.setRollbackOnly();
        });
    }

    @Test
    void sinUnSoloAptoVentaElBloqueoNoEscribeNingunaFilaDeHistorial() {
        new TransactionTemplate(transactionManager).executeWithoutResult(status -> {
            Dueno dueno = duenoActivo();
            jdbcTemplate.update("UPDATE comercio SET estado = 'APROBADO' WHERE id = ?", dueno.comercioId());
            entityManager.clear();

            bloquearPorIntentosFallidos(dueno);

            assertEquals("BLOQUEADO", estadoUsuario(dueno.id()));
            assertEquals("APROBADO", estado(dueno.comercioId()));
            assertEquals(0, filasDeHistorial(dueno.comercioId()));

            status.setRollbackOnly();
        });
    }

    @Test
    void elBloqueoDecideConElEstadoRealYNoConLaFotoCargadaEnLaTransaccion() {
        new TransactionTemplate(transactionManager).executeWithoutResult(status -> {
            Dueno dueno = duenoActivo();
            Comercio enMemoria = comercioRepository.findById(dueno.comercioId()).orElseThrow();
            assertEquals(EstadoComercio.APTO_VENTA, enMemoria.getEstado());
            jdbcTemplate.update("UPDATE comercio SET estado = 'APROBADO' WHERE id = ?", dueno.comercioId());

            boolean cerro = comercioService.cerrarTemporalmentePorBloqueoDeCuenta(enMemoria, MOTIVO_BLOQUEO);
            entityManager.flush();

            assertFalse(cerro);
            assertEquals("APROBADO", estado(dueno.comercioId()));
            assertEquals(0, filasDeHistorial(dueno.comercioId()));

            jdbcTemplate.update("UPDATE comercio SET estado = 'APTO_VENTA' WHERE id = ?", dueno.comercioId());
            boolean cerroAhora = comercioService.cerrarTemporalmentePorBloqueoDeCuenta(enMemoria, MOTIVO_BLOQUEO);
            entityManager.flush();

            assertTrue(cerroAhora);
            assertEquals("CERRADO_TEMPORALMENTE", estado(dueno.comercioId()));
            assertEquals(1, filasDeHistorial(dueno.comercioId()));

            status.setRollbackOnly();
        });
    }

    private void bloquearPorIntentosFallidos(Dueno dueno) {
        LoginRequestDTO login = new LoginRequestDTO();
        login.setNombreUsuario(dueno.nombreUsuario());
        login.setPassword("ClaveIncorrecta1");
        for (int intento = 1; intento <= 3; intento++) {
            assertThrows(CredencialesInvalidasException.class, () -> authService.login(login, "127.0.0.1", "test"));
        }
        entityManager.flush();
    }

    private void recuperarPassword(Dueno dueno) {
        Usuario usuario = usuarioRepository.findById(dueno.id()).orElseThrow();
        Token token = tokenService.crear(usuario, TipoToken.RECUPERACION_PASSWORD, LocalDateTime.now().plusMinutes(30));
        authService.confirmarRecuperacionPassword(
                new ConfirmarRecuperacionPasswordRequestDTO(dueno.email(), token.getToken(), "Testing456"));
        entityManager.flush();
    }

    private Dueno duenoActivo() {
        String sufijo = sufijo();
        String email = "bloqueo." + sufijo + "@bajonea.test";
        String nombreUsuario = "bq" + sufijo;
        int usuarioId = registroService.registrarComercio(comercioJson(sufijo, email, nombreUsuario)).getId();
        int comercioId = jdbcTemplate.queryForObject("SELECT id FROM comercio WHERE dueno_id = ?", Integer.class, usuarioId);
        entityManager.flush();
        jdbcTemplate.update("UPDATE usuario SET estado = 'ACTIVO' WHERE id = ?", usuarioId);
        jdbcTemplate.update("UPDATE comercio SET estado = 'APTO_VENTA' WHERE id = ?", comercioId);
        entityManager.clear();
        return new Dueno(usuarioId, nombreUsuario, email, comercioId);
    }

    private Comercios comerciosEnTodosLosEstados(Dueno dueno) {
        int aprobado = testSupportService.clonarComercio(dueno.comercioId(), "Aprobado " + sufijo(), EstadoComercio.APROBADO);
        int suspendido = testSupportService.clonarComercio(dueno.comercioId(), "Suspendido " + sufijo(), EstadoComercio.SUSPENDIDO);
        int inactivo = testSupportService.clonarComercio(dueno.comercioId(), "Inactivo " + sufijo(), EstadoComercio.INACTIVO);
        int pendiente = testSupportService.clonarComercio(dueno.comercioId(), "Pendiente " + sufijo(), EstadoComercio.PENDIENTE);
        int rechazado = testSupportService.clonarComercio(dueno.comercioId(), "Rechazado " + sufijo(), EstadoComercio.RECHAZADO);
        entityManager.flush();
        entityManager.clear();
        return new Comercios(dueno.comercioId(), aprobado, suspendido, inactivo, pendiente, rechazado);
    }

    private String estado(int comercioId) {
        entityManager.flush();
        return jdbcTemplate.queryForObject("SELECT estado FROM comercio WHERE id = ?", String.class, comercioId);
    }

    private String estadoUsuario(int usuarioId) {
        entityManager.flush();
        return jdbcTemplate.queryForObject("SELECT estado FROM usuario WHERE id = ?", String.class, usuarioId);
    }

    private int bandera(int comercioId) {
        entityManager.flush();
        return jdbcTemplate.queryForObject("SELECT cerrado_manualmente FROM comercio WHERE id = ?", Integer.class, comercioId);
    }

    private int filasDeHistorial(int comercioId) {
        entityManager.flush();
        return jdbcTemplate.queryForObject("SELECT COUNT(*) FROM historial_estado_comercio WHERE comercio_id = ?", Integer.class,
                comercioId);
    }

    private List<String> ultimasFilas(int comercioId, int cantidad) {
        entityManager.flush();
        List<String> filas = jdbcTemplate.query(
                "SELECT CONCAT(estado_origen, '>', estado_destino, '|', COALESCE(motivo, ''), '|', "
                        + "IF(administrador_id IS NULL, 'sin-admin', 'con-admin')) FROM historial_estado_comercio "
                        + "WHERE comercio_id = ? ORDER BY id DESC LIMIT ?",
                (rs, n) -> rs.getString(1), comercioId, cantidad);
        return filas.reversed();
    }

    private RegistroComercioRequestDTO comercioJson(String sufijo, String email, String nombreUsuario) {
        String json = """
                {"fotoPerfilUrl":"https://res.cloudinary.com/demo/image/upload/foto.png",
                 "razonSocial":"Bloqueo SRL","cuit":"%s","condicionIva":"RESPONSABLE_INSCRIPTO","tipoSociedad":"SRL",
                 "domicilioFiscal":"Av. San Martin 100","fechaInicioActividades":"2020-01-01",
                 "nombre":"Comercio Bloqueo %s","descripcion":"Prueba de bloqueo de cuenta",
                 "telefono":"+5492964123456","emailContacto":"%s","tipoComercio":"RESTAURANTE",
                 "aceptaDelivery":true,"aceptaRetiro":false,"nombreUsuario":"%s","email":"%s","password":"Testing123",
                 "direccion":{"calle":"Av. San Martin","numero":"100","pisoDepto":null,"codigoPostal":"9420",
                              "localidadId":"%s","principal":true},
                 "horarios":[{"diaSemana":"LUNES","horaApertura":"09:00","horaCierre":"18:00"}],
                 "redesSociales":[{"tipo":"INSTAGRAM","url":"https://instagram.com/bloqueo.%s"}],
                 "nombreRepresentante":"Representante","apellidoRepresentante":"Prueba","dniRepresentante":"%s",
                 "telefonoRepresentante":"+5492964123457","fechaNacimientoRepresentante":"1985-03-15"}
                """.formatted(cuitAleatorio(), sufijo, email, nombreUsuario, email, LOCALIDAD_RIO_GRANDE, sufijo, dniAleatorio());
        try {
            return objectMapper.readValue(json, RegistroComercioRequestDTO.class);
        } catch (Exception e) {
            throw new IllegalStateException("JSON de prueba inválido", e);
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
