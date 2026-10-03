package com.bajonea.backend.services;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.bajonea.backend.dto.request.ReactivacionCuentaRequestDTO;
import com.bajonea.backend.dto.request.RecuperacionPasswordRequestDTO;
import com.bajonea.backend.dto.request.ReenviarVerificacionRequestDTO;
import com.bajonea.backend.dto.request.RegistroClienteRequestDTO;
import com.bajonea.backend.dto.request.RegistroComercioRequestDTO;
import com.bajonea.backend.dto.response.UsuarioResponseDTO;
import com.bajonea.backend.entities.Token;
import com.bajonea.backend.entities.Usuario;
import com.bajonea.backend.enums.TipoToken;
import com.bajonea.backend.repositories.UsuarioRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ThreadLocalRandom;
import javax.sql.DataSource;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Colisión del código de token en los flujos reales contra {@code bajonea_test}: registro de Cliente y
 * de Comercio, reenvío de verificación, recuperación de contraseña y reactivación de cuenta. El
 * generador de códigos está reemplazado por uno guionado para forzar el choque.
 * <p>
 * Cada flujo corre dentro de una transacción que se revierte al final (nada queda en la base); la
 * única excepción es la prueba de commit real, que borra sus propias filas en {@link #limpiar()}.
 * Las dos variantes de choque son: el código ya existe (lo detecta el chequeo previo) y la carrera
 * (otra transacción lo confirma después de que esta tomó su snapshot, de modo que el chequeo previo
 * no lo ve y el INSERT choca de verdad contra el {@code UNIQUE}).
 */
@SpringBootTest
@ActiveProfiles("test")
class TokenColisionIntegrationTest {

    private static final int MARCA_FILA_DE_PRUEBA = 987_654;
    private static final String CODIGO_REPETIDO = "880001";
    private static final String CODIGO_NUEVO = "880002";
    private static final String CODIGO_NUEVO_2 = "880003";
    private static final String LOCALIDAD_RIO_GRANDE = "94008010";

    @Autowired
    private RegistroService registroService;

    @Autowired
    private AuthService authService;

    @Autowired
    private TokenService tokenService;

    @Autowired
    private UsuarioRepository usuarioRepository;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private DataSource dataSource;

    @Autowired
    private PlatformTransactionManager transactionManager;

    @Autowired
    private ObjectMapper objectMapper;

    @MockitoBean
    private CodigoTokenGenerador generador;

    @MockitoBean
    private EmailService emailService;

    @AfterEach
    void limpiar() {
        jdbcTemplate.update("DELETE FROM token WHERE intentos_fallidos = ?", MARCA_FILA_DE_PRUEBA);
    }

    @Test
    void registroDeClienteConCodigoYaExistenteUsaOtroCodigo() {
        enTransaccionConRollback(() -> {
            insertarEnLaTransaccionActual(CODIGO_REPETIDO);
            when(generador.generar()).thenReturn(CODIGO_REPETIDO, CODIGO_NUEVO);

            UsuarioResponseDTO usuario = registroService.registrarCliente(clienteJson());

            assertTokenDelUsuario(usuario.getId(), CODIGO_NUEVO, TipoToken.VERIFICACION_EMAIL);
            verify(emailService).enviarVerificacion(usuario.getEmail(), CODIGO_NUEVO);
        });
    }

    @Test
    void registroDeClienteConCarreraEnElInsertUsaOtroCodigoYLaTransaccionSigueViva() {
        enTransaccionConRollback(() -> {
            simularCarrera(CODIGO_REPETIDO);
            when(generador.generar()).thenReturn(CODIGO_REPETIDO, CODIGO_NUEVO);

            UsuarioResponseDTO usuario = registroService.registrarCliente(clienteJson());

            assertTokenDelUsuario(usuario.getId(), CODIGO_NUEVO, TipoToken.VERIFICACION_EMAIL);
            verify(emailService).enviarVerificacion(usuario.getEmail(), CODIGO_NUEVO);
        });
    }

    @Test
    void registroDeComercioConCodigoYaExistenteUsaOtroCodigo() {
        enTransaccionConRollback(() -> {
            insertarEnLaTransaccionActual(CODIGO_REPETIDO);
            when(generador.generar()).thenReturn(CODIGO_REPETIDO, CODIGO_NUEVO);

            UsuarioResponseDTO usuario = registroService.registrarComercio(comercioJson());

            assertTokenDelUsuario(usuario.getId(), CODIGO_NUEVO, TipoToken.VERIFICACION_EMAIL);
        });
    }

    @Test
    void registroDeComercioConCarreraEnElInsertUsaOtroCodigoYLaTransaccionSigueViva() {
        enTransaccionConRollback(() -> {
            simularCarrera(CODIGO_REPETIDO);
            when(generador.generar()).thenReturn(CODIGO_REPETIDO, CODIGO_NUEVO);

            UsuarioResponseDTO usuario = registroService.registrarComercio(comercioJson());

            assertTokenDelUsuario(usuario.getId(), CODIGO_NUEVO, TipoToken.VERIFICACION_EMAIL);
        });
    }

    @Test
    void reenvioDeVerificacionRecuperacionYReactivacionConCodigoYaExistente() {
        enTransaccionConRollback(() -> {
            when(generador.generar()).thenReturn(CODIGO_NUEVO);
            UsuarioResponseDTO usuario = registroService.registrarCliente(clienteJson());
            insertarEnLaTransaccionActual(CODIGO_REPETIDO);

            when(generador.generar()).thenReturn(CODIGO_REPETIDO, "880010");
            authService.reenviarVerificacion(new ReenviarVerificacionRequestDTO(usuario.getEmail()));
            when(generador.generar()).thenReturn(CODIGO_REPETIDO, "880011");
            authService.solicitarRecuperacionPassword(new RecuperacionPasswordRequestDTO(usuario.getEmail()));
            when(generador.generar()).thenReturn(CODIGO_REPETIDO, "880012");
            authService.solicitarReactivacionCuenta(new ReactivacionCuentaRequestDTO(usuario.getEmail()));

            assertTokenDelUsuario(usuario.getId(), "880010", TipoToken.VERIFICACION_EMAIL);
            assertTokenDelUsuario(usuario.getId(), "880011", TipoToken.RECUPERACION_PASSWORD);
            assertTokenDelUsuario(usuario.getId(), "880012", TipoToken.REACTIVACION_CUENTA);
            verify(emailService).enviarVerificacion(usuario.getEmail(), "880010");
            verify(emailService).enviarRecuperacionPassword(usuario.getEmail(), "880011");
            verify(emailService).enviarReactivacionCuenta(usuario.getEmail(), "880012");
        });
    }

    @Test
    void reenvioDeVerificacionRecuperacionYReactivacionConCarreraEnElInsert() {
        enTransaccionConRollback(() -> {
            when(generador.generar()).thenReturn(CODIGO_NUEVO);
            UsuarioResponseDTO usuario = registroService.registrarCliente(clienteJson());
            simularCarrera(CODIGO_REPETIDO);

            when(generador.generar()).thenReturn(CODIGO_REPETIDO, "880010");
            authService.reenviarVerificacion(new ReenviarVerificacionRequestDTO(usuario.getEmail()));
            when(generador.generar()).thenReturn(CODIGO_REPETIDO, "880011");
            authService.solicitarRecuperacionPassword(new RecuperacionPasswordRequestDTO(usuario.getEmail()));
            when(generador.generar()).thenReturn(CODIGO_REPETIDO, "880012");
            authService.solicitarReactivacionCuenta(new ReactivacionCuentaRequestDTO(usuario.getEmail()));

            assertTokenDelUsuario(usuario.getId(), "880010", TipoToken.VERIFICACION_EMAIL);
            assertTokenDelUsuario(usuario.getId(), "880011", TipoToken.RECUPERACION_PASSWORD);
            assertTokenDelUsuario(usuario.getId(), "880012", TipoToken.REACTIVACION_CUENTA);
        });
    }

    @Test
    void laCarreraEnElInsertNoImpideElCommitDeLaTransaccion() {
        Integer usuarioId = jdbcTemplate.queryForObject("SELECT MIN(id) FROM usuario", Integer.class);
        Usuario usuario = usuarioRepository.getReferenceById(usuarioId);
        when(generador.generar()).thenReturn(CODIGO_REPETIDO, CODIGO_NUEVO_2);

        TransactionTemplate tx = new TransactionTemplate(transactionManager);
        tx.executeWithoutResult(status -> {
            simularCarrera(CODIGO_REPETIDO);
            Token token = tokenService.crear(usuario, TipoToken.RECUPERACION_PASSWORD, LocalDateTime.now().plusMinutes(30));
            assertEquals(CODIGO_NUEVO_2, token.getToken());
            assertFalse(status.isRollbackOnly());
            jdbcTemplate.update("UPDATE token SET intentos_fallidos = ? WHERE id = ?", MARCA_FILA_DE_PRUEBA, token.getId());
        });

        Integer confirmados = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM token WHERE token = ? AND estado = 'PENDIENTE' AND tipo = 'RECUPERACION_PASSWORD'",
                Integer.class, CODIGO_NUEVO_2);
        assertEquals(1, confirmados, "tras el commit el token del reintento quedó persistido");
    }

    private void enTransaccionConRollback(Runnable cuerpo) {
        new TransactionTemplate(transactionManager).executeWithoutResult(status -> {
            cuerpo.run();
            assertFalse(status.isRollbackOnly(), "una colisión de código no debe marcar la transacción como rollback-only");
            status.setRollbackOnly();
        });
    }

    private void insertarEnLaTransaccionActual(String codigo) {
        Integer usuarioId = jdbcTemplate.queryForObject("SELECT MIN(id) FROM usuario", Integer.class);
        jdbcTemplate.update(
                "INSERT INTO token (usuario_id, tipo, token, fecha_creacion, fecha_vencimiento, estado, intentos_fallidos) "
                        + "VALUES (?, 'VERIFICACION_EMAIL', ?, NOW(), NOW() + INTERVAL 1 HOUR, 'UTILIZADO', ?)",
                usuarioId, codigo, MARCA_FILA_DE_PRUEBA);
    }

    /**
     * Toma el snapshot de la transacción actual (REPEATABLE READ) y, desde otra conexión con commit
     * inmediato, confirma el código: a partir de ahí el chequeo previo de {@code TokenService} no lo ve
     * y solo el INSERT contra el {@code UNIQUE} lo detecta.
     */
    private void simularCarrera(String codigo) {
        jdbcTemplate.queryForObject("SELECT COUNT(*) FROM token", Integer.class);
        Integer usuarioId = jdbcTemplate.queryForObject("SELECT MIN(id) FROM usuario", Integer.class);
        try (Connection otra = dataSource.getConnection();
                PreparedStatement ps = otra.prepareStatement(
                        "INSERT INTO token (usuario_id, tipo, token, fecha_creacion, fecha_vencimiento, estado, intentos_fallidos) "
                                + "VALUES (?, 'VERIFICACION_EMAIL', ?, NOW(), NOW() + INTERVAL 1 HOUR, 'UTILIZADO', ?)")) {
            otra.setAutoCommit(true);
            ps.setInt(1, usuarioId);
            ps.setString(2, codigo);
            ps.setInt(3, MARCA_FILA_DE_PRUEBA);
            ps.executeUpdate();
        } catch (java.sql.SQLException e) {
            throw new IllegalStateException(e);
        }
        Integer visibleEnElSnapshot = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM token WHERE token = ?", Integer.class, codigo);
        assertEquals(0, visibleEnElSnapshot, "el chequeo previo no debe ver el código confirmado por la otra transacción");
    }

    private void assertTokenDelUsuario(Integer usuarioId, String codigo, TipoToken tipo) {
        List<Map<String, Object>> filas = jdbcTemplate.queryForList(
                "SELECT tipo, estado, usuario_id FROM token WHERE token = ?", codigo);
        assertEquals(1, filas.size(), "debe existir exactamente un token con el código " + codigo);
        assertEquals(tipo.name(), filas.get(0).get("tipo"));
        assertEquals("PENDIENTE", filas.get(0).get("estado"));
        assertEquals(usuarioId, ((Number) filas.get(0).get("usuario_id")).intValue());
    }

    private RegistroClienteRequestDTO clienteJson() {
        String json = """
                {"nombre":"Colision","apellido":"Prueba","dni":"%s","fechaNacimiento":"1995-05-20",
                 "telefono":"+5492964123456","nombreUsuario":"%s","email":"%s","password":"Testing123",
                 "fotoPerfilUrl":"https://res.cloudinary.com/demo/image/upload/foto.png",
                 "direccion":{"calle":"Calle Siempre Viva","numero":"123","pisoDepto":null,"codigoPostal":"9420",
                              "localidadId":"%s","principal":true}}
                """.formatted(dniAleatorio(), nombreUsuarioAleatorio(), emailAleatorio(), LOCALIDAD_RIO_GRANDE);
        return leer(json, RegistroClienteRequestDTO.class);
    }

    private RegistroComercioRequestDTO comercioJson() {
        String json = """
                {"fotoPerfilUrl":"https://res.cloudinary.com/demo/image/upload/foto.png",
                 "razonSocial":"Colision SRL","cuit":"%s","condicionIva":"RESPONSABLE_INSCRIPTO","tipoSociedad":"SRL",
                 "domicilioFiscal":"Av. San Martin 100","fechaInicioActividades":"2020-01-01",
                 "nombre":"Comercio Colision %s","descripcion":"Prueba de colision de codigo",
                 "telefono":"+5492964123456","emailContacto":"%s","tipoComercio":"RESTAURANTE",
                 "aceptaDelivery":true,"aceptaRetiro":false,"nombreUsuario":"%s","email":"%s","password":"Testing123",
                 "direccion":{"calle":"Av. San Martin","numero":"100","pisoDepto":null,"codigoPostal":"9420",
                              "localidadId":"%s","principal":true},
                 "horarios":[{"diaSemana":"LUNES","horaApertura":"09:00","horaCierre":"18:00"}],
                 "redesSociales":[{"tipo":"INSTAGRAM","url":"https://instagram.com/colision.%s"}],
                 "nombreRepresentante":"Representante","apellidoRepresentante":"Prueba","dniRepresentante":"%s",
                 "telefonoRepresentante":"+5492964123457","fechaNacimientoRepresentante":"1985-03-15"}
                """.formatted(cuitAleatorio(), sufijo(), emailAleatorio(), nombreUsuarioAleatorio(), emailAleatorio(),
                LOCALIDAD_RIO_GRANDE, sufijo(), dniAleatorio());
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

    private static String nombreUsuarioAleatorio() {
        return "col" + sufijo();
    }

    private static String emailAleatorio() {
        return "colision." + sufijo() + "@bajonea.test";
    }
}
