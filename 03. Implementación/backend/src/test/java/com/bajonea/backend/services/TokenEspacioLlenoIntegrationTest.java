package com.bajonea.backend.services;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.bajonea.backend.dto.request.ReactivacionCuentaRequestDTO;
import com.bajonea.backend.dto.request.RecuperacionPasswordRequestDTO;
import com.bajonea.backend.dto.request.ReenviarVerificacionRequestDTO;
import com.bajonea.backend.dto.request.RegistroClienteRequestDTO;
import com.bajonea.backend.dto.request.RegistroComercioRequestDTO;
import com.bajonea.backend.dto.response.UsuarioResponseDTO;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.List;
import java.util.concurrent.ThreadLocalRandom;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Con la mitad del espacio de códigos ocupada (todos los códigos de 6 dígitos terminados en cifra
 * par, insertados masivamente en {@code bajonea_test} y borrados al terminar), cada código nuevo
 * choca con probabilidad cercana a 0,5: los flujos reales tienen que seguir funcionando y, como
 * todos los pares están tomados, todo token nuevo debe terminar en cifra impar. Usa el generador
 * real (sin guion) y el valor por defecto de {@code token.generacion.max-intentos}.
 * <p>
 * Las filas masivas se marcan con {@code intentos_fallidos = 987655} y se borran en
 * {@link #limpiar()}; si la JVM muriera a mitad de la prueba, se pueden quitar con
 * {@code DELETE FROM token WHERE intentos_fallidos = 987655}.
 */
@SpringBootTest
@ActiveProfiles("test")
class TokenEspacioLlenoIntegrationTest {

    private static final int MARCA_RELLENO = 987_655;
    private static final String LOCALIDAD_RIO_GRANDE = "94008010";
    private static final int ITERACIONES_CLIENTE = 10;
    private static final int ITERACIONES_COMERCIO = 4;

    private static final String SQL_RELLENO = """
            INSERT IGNORE INTO token (usuario_id, tipo, token, fecha_creacion, fecha_vencimiento, estado, intentos_fallidos)
            SELECT ?, 'VERIFICACION_EMAIL', CONCAT(a.n, b.n, c.n, d.n, e.n, f.n), NOW(), NOW(), 'UTILIZADO', ?
            FROM (SELECT 0 n UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4
                  UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9) a,
                 (SELECT 0 n UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4
                  UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9) b,
                 (SELECT 0 n UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4
                  UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9) c,
                 (SELECT 0 n UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4
                  UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9) d,
                 (SELECT 0 n UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4
                  UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9) e,
                 (SELECT 0 n UNION ALL SELECT 2 UNION ALL SELECT 4 UNION ALL SELECT 6 UNION ALL SELECT 8) f
            """;

    @Autowired
    private RegistroService registroService;

    @Autowired
    private AuthService authService;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private PlatformTransactionManager transactionManager;

    @Autowired
    private ObjectMapper objectMapper;

    @MockitoBean
    private EmailService emailService;

    @BeforeEach
    void llenarLaMitadDelEspacio() {
        Integer usuarioId = jdbcTemplate.queryForObject("SELECT MIN(id) FROM usuario", Integer.class);
        jdbcTemplate.update(SQL_RELLENO, usuarioId, MARCA_RELLENO);
    }

    @AfterEach
    void limpiar() {
        jdbcTemplate.update("DELETE FROM token WHERE intentos_fallidos = ?", MARCA_RELLENO);
    }

    @Test
    void registroYRecuperacionSiguenFuncionandoConLaMitadDelEspacioOcupado() {
        Integer rellenadas = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM token WHERE intentos_fallidos = ?", Integer.class, MARCA_RELLENO);
        assertTrue(rellenadas > 499_000, "el relleno debe cubrir (casi) todos los códigos pares: " + rellenadas);

        for (int i = 0; i < ITERACIONES_CLIENTE; i++) {
            enTransaccionConRollback(() -> {
                UsuarioResponseDTO usuario = registroService.registrarCliente(clienteJson());
                authService.reenviarVerificacion(new ReenviarVerificacionRequestDTO(usuario.getEmail()));
                authService.solicitarRecuperacionPassword(new RecuperacionPasswordRequestDTO(usuario.getEmail()));
                authService.solicitarReactivacionCuenta(new ReactivacionCuentaRequestDTO(usuario.getEmail()));
                assertTokensDelUsuario(usuario.getId(), 4);
            });
        }

        for (int i = 0; i < ITERACIONES_COMERCIO; i++) {
            enTransaccionConRollback(() -> {
                UsuarioResponseDTO usuario = registroService.registrarComercio(comercioJson());
                assertTokensDelUsuario(usuario.getId(), 1);
            });
        }
    }

    private void enTransaccionConRollback(Runnable cuerpo) {
        new TransactionTemplate(transactionManager).executeWithoutResult(status -> {
            cuerpo.run();
            assertFalse(status.isRollbackOnly(), "una colisión de código no debe marcar la transacción como rollback-only");
            status.setRollbackOnly();
        });
    }

    private void assertTokensDelUsuario(Integer usuarioId, int esperados) {
        List<String> codigos = jdbcTemplate.queryForList(
                "SELECT token FROM token WHERE usuario_id = ?", String.class, usuarioId);
        assertEquals(esperados, codigos.size());
        for (String codigo : codigos) {
            int ultimaCifra = Character.getNumericValue(codigo.charAt(codigo.length() - 1));
            assertEquals(1, ultimaCifra % 2, "todos los pares están ocupados, el código " + codigo + " debe terminar en impar");
        }
    }

    private RegistroClienteRequestDTO clienteJson() {
        String json = """
                {"nombre":"Colision","apellido":"Prueba","dni":"%s","fechaNacimiento":"1995-05-20",
                 "telefono":"+5492964123456","nombreUsuario":"%s","email":"%s","password":"Testing123",
                 "fotoPerfilUrl":"https://res.cloudinary.com/demo/image/upload/foto.png",
                 "direccion":{"calle":"Calle Siempre Viva","numero":"123","pisoDepto":null,"codigoPostal":"9420",
                              "localidadId":"%s","principal":true}}
                """.formatted(dniAleatorio(), "col" + sufijo(), emailAleatorio(), LOCALIDAD_RIO_GRANDE);
        return leer(json, RegistroClienteRequestDTO.class);
    }

    private RegistroComercioRequestDTO comercioJson() {
        String json = """
                {"fotoPerfilUrl":"https://res.cloudinary.com/demo/image/upload/foto.png",
                 "razonSocial":"Colision SRL","cuit":"%s","condicionIva":"RESPONSABLE_INSCRIPTO","tipoSociedad":"SRL",
                 "domicilioFiscal":"Av. San Martin 100","fechaInicioActividades":"2020-01-01",
                 "nombre":"Comercio Colision %s","descripcion":"Prueba de espacio de codigos lleno",
                 "telefono":"+5492964123456","emailContacto":"%s","tipoComercio":"RESTAURANTE",
                 "aceptaDelivery":true,"aceptaRetiro":false,"nombreUsuario":"%s","email":"%s","password":"Testing123",
                 "direccion":{"calle":"Av. San Martin","numero":"100","pisoDepto":null,"codigoPostal":"9420",
                              "localidadId":"%s","principal":true},
                 "horarios":[{"diaSemana":"LUNES","horaApertura":"09:00","horaCierre":"18:00"}],
                 "redesSociales":[{"tipo":"INSTAGRAM","url":"https://instagram.com/colision.%s"}],
                 "nombreRepresentante":"Representante","apellidoRepresentante":"Prueba","dniRepresentante":"%s",
                 "telefonoRepresentante":"+5492964123457","fechaNacimientoRepresentante":"1985-03-15"}
                """.formatted(cuitAleatorio(), sufijo(), emailAleatorio(), "com" + sufijo(), emailAleatorio(),
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

    private static String emailAleatorio() {
        return "colision." + sufijo() + "@bajonea.test";
    }
}
