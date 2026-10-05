package com.bajonea.backend.services;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import com.bajonea.backend.dto.request.AprobacionComercioRequestDTO;
import com.bajonea.backend.dto.request.ConfirmarReactivacionCuentaRequestDTO;
import com.bajonea.backend.dto.request.ConfirmarRecuperacionPasswordRequestDTO;
import com.bajonea.backend.dto.request.RegistroComercioRequestDTO;
import com.bajonea.backend.entities.Token;
import com.bajonea.backend.entities.Usuario;
import com.bajonea.backend.enums.EstadoComercio;
import com.bajonea.backend.enums.TipoToken;
import com.bajonea.backend.exceptions.CredencialesInvalidasException;
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
 * Regla del bloqueo vigente contra {@code bajonea_test} (bloque "Cierre manual", tramo C3): con la cuenta del Dueño
 * {@code BLOQUEADO}, ni la aprobación del Administrador, ni la vinculación de Mercado Pago, ni el atajo de test
 * dejan un comercio en {@code APTO_VENTA}; al desbloquear, la restauración de siempre lo lleva a {@code APTO_VENTA}
 * o {@code APROBADO} según la cuenta de cobro. También la confirmación de la reactivación de cuenta (una sola
 * restauración). Todo dentro de una transacción que se revierte; la concurrencia real vive en
 * {@code stress-locks-tramoC3.mjs}.
 */
@SpringBootTest
@ActiveProfiles("test")
class BloqueoVigenteIntegrationTest {

    private static final String LOCALIDAD_RIO_GRANDE = "94008010";
    private static final String MOTIVO_APROBAR = "Bloqueo de cuenta vigente al aprobar";
    private static final String MOTIVO_VINCULAR = "Bloqueo de cuenta vigente al vincular Mercado Pago";
    private static final String MOTIVO_RESTAURACION = "Restauración por recuperación de contraseña";
    private static final String MOTIVO_REACTIVACION = "Restauración por reactivación de cuenta";

    @Autowired
    private RegistroService registroService;

    @Autowired
    private AuthService authService;

    @Autowired
    private AdministradorService administradorService;

    @Autowired
    private TestSupportService testSupportService;

    @Autowired
    private TokenService tokenService;

    @Autowired
    private UsuarioRepository usuarioRepository;

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

    private record Dueno(int id, String email, int comercioId) {
    }

    @Test
    void aprobarConLaCuentaBloqueadaYMercadoPagoActivoDejaElComercioCerradoTemporalmenteYAlDesbloquearVuelveAVender() {
        enTransaccion(() -> {
            Dueno dueno = duenoActivo();
            testSupportService.vincularCuentaMercadoPagoSimulada(dueno.id(), null);
            int pendiente = clonar(dueno, EstadoComercio.PENDIENTE);
            bloquear(dueno);

            aprobar(pendiente);

            assertEquals("CERRADO_TEMPORALMENTE", estado(pendiente));
            assertEquals(List.of("PENDIENTE>APROBADO||con-admin", "APROBADO>CERRADO_TEMPORALMENTE|" + MOTIVO_APROBAR + "|sin-admin"),
                    filas(pendiente));

            recuperarPassword(dueno);

            assertEquals("APTO_VENTA", estado(pendiente));
            assertEquals("CERRADO_TEMPORALMENTE>APTO_VENTA|" + MOTIVO_RESTAURACION + "|sin-admin", filas(pendiente).get(2));
            assertEquals(3, filas(pendiente).size());
        });
    }

    @Test
    void aprobarConElDuenoActivoYMercadoPagoActivoSigueDejandoElComercioAptoVenta() {
        enTransaccion(() -> {
            Dueno dueno = duenoActivo();
            testSupportService.vincularCuentaMercadoPagoSimulada(dueno.id(), null);
            int pendiente = clonar(dueno, EstadoComercio.PENDIENTE);

            aprobar(pendiente);

            assertEquals("APTO_VENTA", estado(pendiente));
            assertEquals(List.of("PENDIENTE>APROBADO||con-admin",
                    "APROBADO>APTO_VENTA|Vinculación automática de cuenta de Mercado Pago|sin-admin"), filas(pendiente));
        });
    }

    @Test
    void aprobarConLaCuentaBloqueadaPeroSinMercadoPagoDejaElComercioAprobadoSinFilaExtra() {
        enTransaccion(() -> {
            Dueno dueno = duenoActivo();
            int pendiente = clonar(dueno, EstadoComercio.PENDIENTE);
            bloquear(dueno);

            aprobar(pendiente);

            assertEquals("APROBADO", estado(pendiente));
            assertEquals(List.of("PENDIENTE>APROBADO||con-admin"), filas(pendiente));

            recuperarPassword(dueno);

            assertEquals("APROBADO", estado(pendiente));
        });
    }

    @Test
    void vincularMercadoPagoConLaCuentaBloqueadaCierraLosAprobadosYDejaIntactoElResto() {
        enTransaccion(() -> {
            Dueno dueno = duenoActivo();
            int aprobado = clonar(dueno, EstadoComercio.APROBADO);
            int suspendido = clonar(dueno, EstadoComercio.SUSPENDIDO);
            int pendiente = clonar(dueno, EstadoComercio.PENDIENTE);
            jdbcTemplate.update("UPDATE comercio SET estado = 'APROBADO' WHERE id = ?", dueno.comercioId());
            bloquear(dueno);

            testSupportService.vincularCuentaMercadoPagoSimulada(dueno.id(), null);

            assertEquals("CERRADO_TEMPORALMENTE", estado(dueno.comercioId()));
            assertEquals("CERRADO_TEMPORALMENTE", estado(aprobado));
            assertEquals("SUSPENDIDO", estado(suspendido));
            assertEquals("PENDIENTE", estado(pendiente));
            assertEquals(List.of("APROBADO>CERRADO_TEMPORALMENTE|" + MOTIVO_VINCULAR + "|sin-admin"), filas(aprobado));
            assertEquals(0, filas(suspendido).size());

            recuperarPassword(dueno);

            assertEquals("APTO_VENTA", estado(dueno.comercioId()));
            assertEquals("APTO_VENTA", estado(aprobado));
            assertEquals("SUSPENDIDO", estado(suspendido));
            assertEquals("PENDIENTE", estado(pendiente));
        });
    }

    @Test
    void vincularMercadoPagoConElDuenoActivoSigueLlevandoLosAprobadosAAptoVenta() {
        enTransaccion(() -> {
            Dueno dueno = duenoActivo();
            int aprobado = clonar(dueno, EstadoComercio.APROBADO);

            testSupportService.vincularCuentaMercadoPagoSimulada(dueno.id(), null);

            assertEquals("APTO_VENTA", estado(aprobado));
            assertEquals(List.of("APROBADO>APTO_VENTA|Vinculación automática de cuenta de Mercado Pago|sin-admin"), filas(aprobado));
        });
    }

    @Test
    void elAtajoDeTestMarcarAptoVentaTambienRespetaElBloqueo() {
        enTransaccion(() -> {
            Dueno dueno = duenoActivo();
            int aprobado = clonar(dueno, EstadoComercio.APROBADO);
            int otro = clonar(dueno, EstadoComercio.APROBADO);
            bloquear(dueno);

            testSupportService.marcarAptoVenta(aprobado);

            assertEquals("CERRADO_TEMPORALMENTE", estado(aprobado));
            assertEquals("APROBADO", estado(otro));
            assertEquals(List.of("APROBADO>CERRADO_TEMPORALMENTE|" + MOTIVO_VINCULAR + "|sin-admin"), filas(aprobado));
        });
    }

    @Test
    void laReactivacionDeCuentaRestauraUnaSolaVezYUnaSegundaConfirmacionDelMismoCodigoDa401() {
        enTransaccion(() -> {
            Dueno dueno = duenoActivo();
            testSupportService.vincularCuentaMercadoPagoSimulada(dueno.id(), null);
            int inactivo = clonar(dueno, EstadoComercio.INACTIVO);
            jdbcTemplate.update("UPDATE usuario SET estado = 'INACTIVO' WHERE id = ?", dueno.id());
            entityManager.clear();
            Usuario usuario = usuarioRepository.findById(dueno.id()).orElseThrow();
            Token token = tokenService.crear(usuario, TipoToken.REACTIVACION_CUENTA, LocalDateTime.now().plusHours(24));
            ConfirmarReactivacionCuentaRequestDTO request = new ConfirmarReactivacionCuentaRequestDTO(dueno.email(), token.getToken());

            authService.confirmarReactivacionCuenta(request);
            entityManager.flush();

            assertEquals("ACTIVO", jdbcTemplate.queryForObject("SELECT estado FROM usuario WHERE id = ?", String.class, dueno.id()));
            assertEquals("APTO_VENTA", estado(inactivo));
            assertEquals(List.of("INACTIVO>APTO_VENTA|" + MOTIVO_REACTIVACION + "|sin-admin"), filas(inactivo));

            assertThrows(CredencialesInvalidasException.class, () -> authService.confirmarReactivacionCuenta(request));

            assertEquals(1, filas(inactivo).size());
        });
    }

    private void enTransaccion(Runnable cuerpo) {
        new TransactionTemplate(transactionManager).executeWithoutResult(status -> {
            cuerpo.run();
            status.setRollbackOnly();
        });
    }

    private void aprobar(int comercioId) {
        entityManager.flush();
        entityManager.clear();
        int administradorId = jdbcTemplate.queryForObject("SELECT id FROM administrador ORDER BY id LIMIT 1", Integer.class);
        administradorService.resolverAprobacion(comercioId, administradorId, new AprobacionComercioRequestDTO(true, null));
        entityManager.flush();
    }

    private void bloquear(Dueno dueno) {
        jdbcTemplate.update("UPDATE usuario SET estado = 'BLOQUEADO' WHERE id = ?", dueno.id());
        entityManager.clear();
    }

    private void recuperarPassword(Dueno dueno) {
        entityManager.flush();
        Usuario usuario = usuarioRepository.findById(dueno.id()).orElseThrow();
        Token token = tokenService.crear(usuario, TipoToken.RECUPERACION_PASSWORD, LocalDateTime.now().plusMinutes(30));
        authService.confirmarRecuperacionPassword(
                new ConfirmarRecuperacionPasswordRequestDTO(dueno.email(), token.getToken(), "Testing456"));
        entityManager.flush();
    }

    private Dueno duenoActivo() {
        String sufijo = sufijo();
        String email = "vigente." + sufijo + "@bajonea.test";
        int usuarioId = registroService.registrarComercio(comercioJson(sufijo, email, "bv" + sufijo)).getId();
        int comercioId = jdbcTemplate.queryForObject("SELECT id FROM comercio WHERE dueno_id = ?", Integer.class, usuarioId);
        entityManager.flush();
        jdbcTemplate.update("UPDATE usuario SET estado = 'ACTIVO' WHERE id = ?", usuarioId);
        jdbcTemplate.update("UPDATE comercio SET estado = 'APTO_VENTA' WHERE id = ?", comercioId);
        entityManager.clear();
        return new Dueno(usuarioId, email, comercioId);
    }

    private int clonar(Dueno dueno, EstadoComercio estado) {
        int id = testSupportService.clonarComercio(dueno.comercioId(), estado.name() + " " + sufijo(), estado);
        entityManager.flush();
        entityManager.clear();
        return id;
    }

    private String estado(int comercioId) {
        entityManager.flush();
        return jdbcTemplate.queryForObject("SELECT estado FROM comercio WHERE id = ?", String.class, comercioId);
    }

    private List<String> filas(int comercioId) {
        entityManager.flush();
        return jdbcTemplate.query(
                "SELECT CONCAT(estado_origen, '>', estado_destino, '|', COALESCE(motivo, ''), '|', "
                        + "IF(administrador_id IS NULL, 'sin-admin', 'con-admin')) FROM historial_estado_comercio "
                        + "WHERE comercio_id = ? ORDER BY id",
                (rs, n) -> rs.getString(1), comercioId);
    }

    private RegistroComercioRequestDTO comercioJson(String sufijo, String email, String nombreUsuario) {
        String json = """
                {"fotoPerfilUrl":"https://res.cloudinary.com/demo/image/upload/foto.png",
                 "razonSocial":"Vigente SRL","cuit":"%s","condicionIva":"RESPONSABLE_INSCRIPTO","tipoSociedad":"SRL",
                 "domicilioFiscal":"Av. San Martin 100","fechaInicioActividades":"2020-01-01",
                 "nombre":"Comercio Vigente %s","descripcion":"Prueba del bloqueo vigente",
                 "telefono":"+5492964123456","emailContacto":"%s","tipoComercio":"RESTAURANTE",
                 "aceptaDelivery":true,"aceptaRetiro":false,"nombreUsuario":"%s","email":"%s","password":"Testing123",
                 "direccion":{"calle":"Av. San Martin","numero":"100","pisoDepto":null,"codigoPostal":"9420",
                              "localidadId":"%s","principal":true},
                 "horarios":[{"diaSemana":"LUNES","horaApertura":"09:00","horaCierre":"18:00"}],
                 "redesSociales":[{"tipo":"INSTAGRAM","url":"https://instagram.com/vigente.%s"}],
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
