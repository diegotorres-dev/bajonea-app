package com.bajonea.backend.services;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

import com.bajonea.backend.config.security.ComercioActivo;
import com.bajonea.backend.dto.request.AceptarInvitacionEmpleadoRequestDTO;
import com.bajonea.backend.dto.request.DatosClienteRequestDTO;
import com.bajonea.backend.dto.request.ValidarInvitacionEmpleadoRequestDTO;
import com.bajonea.backend.dto.response.InvitacionEmpleadoAceptadaResponseDTO;
import com.bajonea.backend.dto.response.InvitacionEmpleadoValidadaResponseDTO;
import com.bajonea.backend.exceptions.CodigoInvitacionInvalidoException;
import com.bajonea.backend.exceptions.ConflictoDeNegocioException;
import com.bajonea.backend.exceptions.InvitacionNoAptaException;
import com.bajonea.backend.exceptions.ValidacionCamposException;
import com.bajonea.backend.repositories.InvitacionInsercionRepository;
import com.bajonea.backend.services.DatosPruebaEmpleado.Dueno;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.persistence.EntityManager;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.function.Consumer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionStatus;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Validar y aceptar invitaciones de empleado contra {@code bajonea_test}, con reloj controlable y el
 * {@code EmailService} reemplazado por un mock. La mayoría de las pruebas corren dentro de una transacción que
 * se revierte. Las que verifican que un error no deja nada escrito (el estado del comercio se comprueba después
 * de tocar la relación, así que el {@code 409} depende del rollback) y las de concurrencia confirman de verdad,
 * con datos únicos que limpian al terminar.
 */
@SpringBootTest
@ActiveProfiles("test")
@Import(ConfiguracionRelojDePrueba.class)
class InvitacionEmpleadoAceptacionIntegrationTest {

    private static final LocalDateTime INICIO = LocalDateTime.of(2026, 10, 6, 12, 0, 0);

    @Autowired
    private InvitacionEmpleadoService invitacionService;

    @Autowired
    private RegistroService registroService;

    @Autowired
    private InvitacionInsercionRepository insercionRepository;

    @Autowired
    private RelojDePrueba reloj;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private PlatformTransactionManager transactionManager;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private EntityManager entityManager;

    @Autowired
    private PasswordEncoder passwordEncoder;

    @MockitoBean
    private EmailService emailService;

    private DatosPruebaEmpleado datos;

    @BeforeEach
    void preparar() {
        datos = new DatosPruebaEmpleado(registroService, objectMapper, jdbcTemplate);
        reloj.fijar(INICIO);
    }

    @AfterEach
    void limpiar() {
        reloj.volverAlReloj();
    }

    private void enTransaccion(Consumer<TransactionStatus> prueba) {
        new TransactionTemplate(transactionManager).executeWithoutResult(status -> {
            prueba.accept(status);
            status.setRollbackOnly();
        });
    }

    private void sincronizar() {
        entityManager.flush();
        entityManager.clear();
    }

    private void volcar() {
        if (TransactionSynchronizationManager.isActualTransactionActive()) {
            entityManager.flush();
        }
    }

    private int filas(String sql, Object... argumentos) {
        volcar();
        return jdbcTemplate.queryForObject(sql, Integer.class, argumentos);
    }

    private String texto(String sql, Object... argumentos) {
        volcar();
        return jdbcTemplate.queryForObject(sql, String.class, argumentos);
    }

    private LocalDateTime momento(String sql, Object... argumentos) {
        volcar();
        return jdbcTemplate.queryForObject(sql, LocalDateTime.class, argumentos);
    }

    private ComercioActivo activo(Dueno dueno) {
        return new ComercioActivo(dueno.comercioId(), dueno.id());
    }

    private static String emailNuevo() {
        return "invitado." + DatosPruebaEmpleado.sufijo() + "@bajonea.test";
    }

    private DatosClienteRequestDTO cuentaNueva() {
        return datos.datosClienteNuevo("nu" + DatosPruebaEmpleado.sufijo(), DatosPruebaEmpleado.dniAleatorio(),
                DatosPruebaEmpleado.claveAleatoria());
    }

    private AceptarInvitacionEmpleadoRequestDTO aceptarRequest(String email, String codigo, Boolean terminos, DatosClienteRequestDTO cuenta) {
        AceptarInvitacionEmpleadoRequestDTO request = new AceptarInvitacionEmpleadoRequestDTO();
        request.setEmail(email);
        request.setCodigo(codigo);
        request.setAceptaTerminos(terminos);
        request.setCuentaNueva(cuenta);
        return request;
    }

    private ValidarInvitacionEmpleadoRequestDTO validarRequest(String email, String codigo) {
        ValidarInvitacionEmpleadoRequestDTO request = new ValidarInvitacionEmpleadoRequestDTO();
        request.setEmail(email);
        request.setCodigo(codigo);
        return request;
    }

    private int invitar(Dueno dueno, String email) {
        return invitacionService.invitar(activo(dueno), email).getId();
    }

    private String codigoDe(int invitacionId) {
        return texto("SELECT codigo FROM invitacion_empleado WHERE id = ?", invitacionId);
    }

    private String estadoDe(int invitacionId) {
        return texto("SELECT estado FROM invitacion_empleado WHERE id = ?", invitacionId);
    }

    private int intentosDe(int invitacionId) {
        return filas("SELECT intentos_fallidos FROM invitacion_empleado WHERE id = ?", invitacionId);
    }

    private static String otroCodigo(String codigo) {
        return "000000".equals(codigo) ? "111111" : "000000";
    }

    private int relaciones(int comercioId, String estado) {
        return filas("SELECT COUNT(*) FROM empleado_comercio WHERE comercio_id = ? AND estado = ?", comercioId, estado);
    }

    private int avisosAlDueno(Dueno dueno) {
        return filas("SELECT COUNT(*) FROM notificacion WHERE usuario_id = ? AND tipo = 'INVITACION_EMPLEADO' AND canal = 'PUSH'", dueno.id());
    }

    private void assertMismoCodigoInvalido(Runnable llamada) {
        CodigoInvitacionInvalidoException error = assertThrows(CodigoInvitacionInvalidoException.class, llamada::run);
        assertEquals(CodigoInvitacionInvalidoException.MENSAJE, error.getMessage());
        assertNull(error.getData());
    }

    @Test
    void validarDevuelveElComercioLaFotoElVencimientoYSiLaCuentaYaExiste() {
        enTransaccion(status -> {
            Dueno dueno = datos.registrarDuenoAprobado();
            int cuenta = datos.registrarCliente();
            String emailNuevo = emailNuevo();
            sincronizar();
            int invitacionNueva = invitar(dueno, emailNuevo);
            int invitacionExistente = invitar(dueno, datos.emailDe(cuenta));
            sincronizar();

            InvitacionEmpleadoValidadaResponseDTO sinCuenta = invitacionService.validar(validarRequest(emailNuevo, codigoDe(invitacionNueva)));
            InvitacionEmpleadoValidadaResponseDTO conCuenta = invitacionService
                    .validar(validarRequest(datos.emailDe(cuenta), codigoDe(invitacionExistente)));

            assertEquals(dueno.nombreComercio(), sinCuenta.getComercioNombre());
            assertEquals("https://res.cloudinary.com/demo/image/upload/foto.png", sinCuenta.getComercioFotoPerfilUrl());
            assertFalse(sinCuenta.isCuentaExistente());
            assertEquals(INICIO.plusDays(7), sinCuenta.getFechaVencimiento());
            assertTrue(conCuenta.isCuentaExistente());
            assertEquals("PENDIENTE", estadoDe(invitacionNueva), "validar no consume la invitación");
            assertEquals(0, intentosDe(invitacionNueva));
        });
    }

    @Test
    void aceptarConCuentaNuevaCreaTodoEnUnaTransaccionYAvisaAlDueno() {
        enTransaccion(status -> {
            Dueno dueno = datos.registrarDuenoAprobado();
            sincronizar();
            String email = emailNuevo();
            int invitacionId = invitar(dueno, email);
            String codigo = codigoDe(invitacionId);
            DatosClienteRequestDTO cuenta = cuentaNueva();
            reloj.fijar(INICIO.plusHours(5));
            sincronizar();

            InvitacionEmpleadoAceptadaResponseDTO respuesta = invitacionService.aceptar(aceptarRequest(email, codigo, true, cuenta));

            assertEquals(dueno.nombreComercio(), respuesta.getComercioNombre());
            assertTrue(respuesta.isCuentaCreada());
            assertFalse(respuesta.isRelacionReactivada());

            int usuarioId = filas("SELECT id FROM usuario WHERE email = ?", email);
            assertEquals("ACTIVO", texto("SELECT estado FROM usuario WHERE id = ?", usuarioId));
            assertEquals("CLIENTE", texto("SELECT rol FROM usuario WHERE id = ?", usuarioId));
            assertEquals(0, filas("SELECT intentos_fallidos FROM usuario WHERE id = ?", usuarioId));
            assertEquals(cuenta.getNombreUsuario(), texto("SELECT nombre_usuario FROM usuario WHERE id = ?", usuarioId));
            assertEquals(cuenta.getFotoPerfilUrl(), texto("SELECT foto_perfil_url FROM usuario WHERE id = ?", usuarioId));
            assertTrue(passwordEncoder.matches(cuenta.getPassword(), texto("SELECT password_hash FROM usuario WHERE id = ?", usuarioId)));
            assertEquals(1, filas("SELECT COUNT(*) FROM persona WHERE id = ?", usuarioId));
            assertEquals("Nuevo Empleado", texto("SELECT nombre FROM persona_fisica WHERE id = ?", usuarioId));
            assertEquals("Prueba", texto("SELECT apellido FROM persona_fisica WHERE id = ?", usuarioId));
            assertEquals(cuenta.getDni(), texto("SELECT dni FROM persona_fisica WHERE id = ?", usuarioId));
            assertEquals(1, filas("SELECT COUNT(*) FROM cliente WHERE id = ?", usuarioId));
            assertEquals(1, filas("SELECT COUNT(*) FROM direccion WHERE cliente_id = ? AND principal = 1", usuarioId));
            assertEquals(1, filas("SELECT COUNT(*) FROM empleado WHERE id = ?", usuarioId));
            assertEquals(1, relaciones(dueno.comercioId(), "ACTIVO"));
            assertEquals(INICIO.plusHours(5), momento("SELECT fecha_alta FROM empleado_comercio WHERE empleado_id = ? AND comercio_id = ?",
                    usuarioId, dueno.comercioId()));
            assertNull(jdbcTemplate.queryForObject("SELECT fecha_baja FROM empleado_comercio WHERE empleado_id = ?", LocalDateTime.class, usuarioId));

            assertEquals("ACEPTADA", estadoDe(invitacionId));
            assertEquals(usuarioId, filas("SELECT usuario_aceptante_id FROM invitacion_empleado WHERE id = ?", invitacionId));
            assertEquals(INICIO.plusHours(5), momento("SELECT fecha_resolucion FROM invitacion_empleado WHERE id = ?", invitacionId));
            assertEquals(1, filas("SELECT COUNT(*) FROM historial_empleado_comercio WHERE comercio_id = ? AND motivo = 'ACEPTACION' "
                    + "AND invitacion_id = ? AND empleado_comercio_id IS NOT NULL AND estado_origen IS NULL "
                    + "AND estado_destino = 'ACTIVO' AND actor_usuario_id = ?", dueno.comercioId(), invitacionId, usuarioId));
            assertEquals(0, filas("SELECT COUNT(*) FROM historial_empleado_comercio WHERE comercio_id = ? AND motivo = 'REACTIVACION'",
                    dueno.comercioId()));

            assertEquals(1, avisosAlDueno(dueno));
            assertEquals("Nuevo Empleado Prueba aceptó tu invitación y ya es parte del equipo de " + dueno.nombreComercio(),
                    texto("SELECT mensaje FROM notificacion WHERE usuario_id = ? AND tipo = 'INVITACION_EMPLEADO' AND canal = 'PUSH' "
                            + "AND entidad_tipo = 'COMERCIO' AND entidad_id = ?", dueno.id(), dueno.comercioId()));
            assertEquals(0, filas("SELECT COUNT(*) FROM token WHERE usuario_id = ?", usuarioId), "la cuenta nace verificada: sin segundo código");
            verify(emailService, never()).enviarVerificacion(eq(email), anyString());
        });
    }

    @Test
    void aceptarConCuentaExistenteLaUsaYNoLaModificaAunqueSeMandeCuentaNueva() {
        enTransaccion(status -> {
            Dueno dueno = datos.registrarDuenoAprobado();
            int cuenta = datos.registrarCliente();
            String email = datos.emailDe(cuenta);
            sincronizar();
            int invitacionId = invitar(dueno, email);
            String codigo = codigoDe(invitacionId);
            String hashAntes = texto("SELECT password_hash FROM usuario WHERE id = ?", cuenta);
            String nombreUsuarioAntes = texto("SELECT nombre_usuario FROM usuario WHERE id = ?", cuenta);
            String nombreAntes = texto("SELECT nombre FROM persona_fisica WHERE id = ?", cuenta);
            String dniAntes = texto("SELECT dni FROM persona_fisica WHERE id = ?", cuenta);
            DatosClienteRequestDTO otraCuenta = cuentaNueva();
            sincronizar();

            InvitacionEmpleadoAceptadaResponseDTO respuesta = invitacionService.aceptar(aceptarRequest(email, codigo, false, otraCuenta));

            assertFalse(respuesta.isCuentaCreada());
            assertEquals(1, filas("SELECT COUNT(*) FROM usuario WHERE email = ?", email));
            assertEquals(0, filas("SELECT COUNT(*) FROM usuario WHERE nombre_usuario = ?", otraCuenta.getNombreUsuario()));
            assertEquals(hashAntes, texto("SELECT password_hash FROM usuario WHERE id = ?", cuenta));
            assertEquals(nombreUsuarioAntes, texto("SELECT nombre_usuario FROM usuario WHERE id = ?", cuenta));
            assertEquals(nombreAntes, texto("SELECT nombre FROM persona_fisica WHERE id = ?", cuenta));
            assertEquals(dniAntes, texto("SELECT dni FROM persona_fisica WHERE id = ?", cuenta));
            assertEquals(1, filas("SELECT COUNT(*) FROM empleado WHERE id = ?", cuenta));
            assertEquals(1, relaciones(dueno.comercioId(), "ACTIVO"));
            assertEquals("ACEPTADA", estadoDe(invitacionId));
            assertEquals(cuenta, filas("SELECT usuario_aceptante_id FROM invitacion_empleado WHERE id = ?", invitacionId));
            assertEquals(1, avisosAlDueno(dueno));
        });
    }

    @Test
    void aceptarUnaRelacionInactivaLaReactivaConservandoLaFechaDeAltaYRegistraAceptacionYReactivacion() {
        enTransaccion(status -> {
            Dueno dueno = datos.registrarDuenoAprobado();
            int cuenta = datos.registrarCliente();
            LocalDateTime altaOriginal = INICIO.minusDays(30);
            int relacionId = datos.vincularEmpleado(cuenta, dueno.comercioId(), "INACTIVO", altaOriginal);
            sincronizar();
            int invitacionId = invitar(dueno, datos.emailDe(cuenta));
            String codigo = codigoDe(invitacionId);
            reloj.fijar(INICIO.plusDays(1));
            sincronizar();

            InvitacionEmpleadoAceptadaResponseDTO respuesta = invitacionService.aceptar(aceptarRequest(datos.emailDe(cuenta), codigo, null, null));

            assertTrue(respuesta.isRelacionReactivada());
            assertFalse(respuesta.isCuentaCreada());
            assertEquals(1, filas("SELECT COUNT(*) FROM empleado_comercio WHERE empleado_id = ? AND comercio_id = ?", cuenta, dueno.comercioId()));
            assertEquals(relacionId, filas("SELECT id FROM empleado_comercio WHERE empleado_id = ? AND comercio_id = ?", cuenta, dueno.comercioId()),
                    "se reactiva la misma fila");
            assertEquals("ACTIVO", texto("SELECT estado FROM empleado_comercio WHERE id = ?", relacionId));
            assertNull(jdbcTemplate.queryForObject("SELECT fecha_baja FROM empleado_comercio WHERE id = ?", LocalDateTime.class, relacionId));
            assertEquals(altaOriginal, momento("SELECT fecha_alta FROM empleado_comercio WHERE id = ?", relacionId));
            assertEquals(1, filas("SELECT COUNT(*) FROM historial_empleado_comercio WHERE empleado_comercio_id = ? AND motivo = 'ACEPTACION'", relacionId));
            assertEquals(1, filas("SELECT COUNT(*) FROM historial_empleado_comercio WHERE empleado_comercio_id = ? AND motivo = 'REACTIVACION' "
                    + "AND estado_origen = 'INACTIVO' AND estado_destino = 'ACTIVO' AND actor_usuario_id = ?", relacionId, cuenta));
        });
    }

    @Test
    void unaRelacionQueYaEstabaActivaNoSeDuplicaYLaInvitacionQuedaAceptada() {
        enTransaccion(status -> {
            Dueno dueno = datos.registrarDuenoAprobado();
            int cuenta = datos.registrarCliente();
            sincronizar();
            int invitacionId = invitar(dueno, datos.emailDe(cuenta));
            String codigo = codigoDe(invitacionId);
            int relacionId = datos.vincularEmpleado(cuenta, dueno.comercioId(), "ACTIVO", INICIO.minusDays(2));
            sincronizar();

            InvitacionEmpleadoAceptadaResponseDTO respuesta = invitacionService.aceptar(aceptarRequest(datos.emailDe(cuenta), codigo, null, null));

            assertFalse(respuesta.isRelacionReactivada());
            assertEquals(1, filas("SELECT COUNT(*) FROM empleado_comercio WHERE empleado_id = ? AND comercio_id = ?", cuenta, dueno.comercioId()));
            assertEquals("ACTIVO", texto("SELECT estado FROM empleado_comercio WHERE id = ?", relacionId));
            assertEquals("ACEPTADA", estadoDe(invitacionId));
            assertEquals(0, filas("SELECT COUNT(*) FROM historial_empleado_comercio WHERE motivo = 'REACTIVACION' AND comercio_id = ?", dueno.comercioId()));
        });
    }

    @Test
    void todasLasFallasDeResolucionDanElMismoCodigoInvalidoSinDatosDeLaCausa() {
        enTransaccion(status -> {
            Dueno dueno = datos.registrarDuenoAprobado();
            Dueno otro = datos.registrarDuenoAprobado();
            sincronizar();

            assertMismoCodigoInvalido(() -> invitacionService.aceptar(aceptarRequest(emailNuevo(), "123456", true, cuentaNueva())));
            assertMismoCodigoInvalido(() -> invitacionService.validar(validarRequest(emailNuevo(), "123456")));

            String emailIncorrecto = emailNuevo();
            int incorrecta = invitar(dueno, emailIncorrecto);
            String codigoIncorrecto = otroCodigo(codigoDe(incorrecta));
            assertMismoCodigoInvalido(() -> invitacionService.aceptar(aceptarRequest(emailIncorrecto, codigoIncorrecto, true, cuentaNueva())));
            assertMismoCodigoInvalido(() -> invitacionService.validar(validarRequest(emailIncorrecto, codigoIncorrecto)));

            String emailCancelada = emailNuevo();
            int cancelada = invitar(dueno, emailCancelada);
            String codigoCancelada = codigoDe(cancelada);
            invitacionService.cancelar(activo(dueno), cancelada);
            assertMismoCodigoInvalido(() -> invitacionService.aceptar(aceptarRequest(emailCancelada, codigoCancelada, true, cuentaNueva())));
            assertMismoCodigoInvalido(() -> invitacionService.validar(validarRequest(emailCancelada, codigoCancelada)));

            String emailReemplazada = emailNuevo();
            int original = invitar(dueno, emailReemplazada);
            String codigoViejo = codigoDe(original);
            invitacionService.reenviar(activo(dueno), original);
            assertEquals("REEMPLAZADA", estadoDe(original));
            assertMismoCodigoInvalido(() -> invitacionService.aceptar(aceptarRequest(emailReemplazada, codigoViejo, true, cuentaNueva())));
            assertMismoCodigoInvalido(() -> invitacionService.validar(validarRequest(emailReemplazada, codigoViejo)));

            String emailInvalidada = emailNuevo();
            int invalidada = invitar(otro, emailInvalidada);
            String codigoInvalidada = codigoDe(invalidada);
            for (int i = 0; i < 5; i++) {
                assertMismoCodigoInvalido(() -> invitacionService.aceptar(aceptarRequest(emailInvalidada, otroCodigo(codigoInvalidada), true, cuentaNueva())));
            }
            assertEquals("INVALIDADA", estadoDe(invalidada));
            assertMismoCodigoInvalido(() -> invitacionService.aceptar(aceptarRequest(emailInvalidada, codigoInvalidada, true, cuentaNueva())));
            assertMismoCodigoInvalido(() -> invitacionService.validar(validarRequest(emailInvalidada, codigoInvalidada)));

            String emailAceptada = emailNuevo();
            int aceptada = invitar(otro, emailAceptada);
            String codigoAceptada = codigoDe(aceptada);
            invitacionService.aceptar(aceptarRequest(emailAceptada, codigoAceptada, true, cuentaNueva()));
            assertMismoCodigoInvalido(() -> invitacionService.aceptar(aceptarRequest(emailAceptada, codigoAceptada, true, cuentaNueva())));
            assertMismoCodigoInvalido(() -> invitacionService.validar(validarRequest(emailAceptada, codigoAceptada)));

            String emailVencida = emailNuevo();
            int vencida = invitar(otro, emailVencida);
            String codigoVencida = codigoDe(vencida);
            reloj.fijar(INICIO.plusDays(7).plusSeconds(1));
            assertMismoCodigoInvalido(() -> invitacionService.aceptar(aceptarRequest(emailVencida, codigoVencida, true, cuentaNueva())));
            assertMismoCodigoInvalido(() -> invitacionService.validar(validarRequest(emailVencida, codigoVencida)));
            assertEquals("PENDIENTE", estadoDe(vencida), "una vencida no se toca: se muestra como vencida al listar");
            assertEquals(0, intentosDe(vencida));
        });
    }

    @Test
    void cadaCodigoIncorrectoSumaUnIntentoATodasLasPendientesDelEmailYAlQuintoQuedanInvalidadas() {
        enTransaccion(status -> {
            Dueno uno = datos.registrarDuenoAprobado();
            Dueno otro = datos.registrarDuenoAprobado();
            String email = emailNuevo();
            sincronizar();
            int invitacionUno = invitar(uno, email);
            int invitacionOtro = invitar(otro, email);
            String codigoUno = codigoDe(invitacionUno);
            String codigoOtro = codigoDe(invitacionOtro);
            String incorrecto = "000000".equals(codigoUno) || "000000".equals(codigoOtro) ? "999999" : "000000";

            assertMismoCodigoInvalido(() -> invitacionService.aceptar(aceptarRequest(email, incorrecto, true, cuentaNueva())));
            assertEquals(1, intentosDe(invitacionUno));
            assertEquals(1, intentosDe(invitacionOtro));

            assertMismoCodigoInvalido(() -> invitacionService.validar(validarRequest(email, incorrecto)));
            assertMismoCodigoInvalido(() -> invitacionService.validar(validarRequest(email, incorrecto)));
            assertEquals(3, intentosDe(invitacionUno), "validar y aceptar cuentan igual");
            assertEquals(3, intentosDe(invitacionOtro));
            assertEquals("PENDIENTE", estadoDe(invitacionUno));

            assertMismoCodigoInvalido(() -> invitacionService.aceptar(aceptarRequest(email, incorrecto, true, cuentaNueva())));
            assertMismoCodigoInvalido(() -> invitacionService.aceptar(aceptarRequest(email, incorrecto, true, cuentaNueva())));
            assertEquals("INVALIDADA", estadoDe(invitacionUno));
            assertEquals("INVALIDADA", estadoDe(invitacionOtro));
            assertEquals(5, intentosDe(invitacionUno));
            assertNotNull(momento("SELECT fecha_resolucion FROM invitacion_empleado WHERE id = ?", invitacionUno));
            assertMismoCodigoInvalido(() -> invitacionService.aceptar(aceptarRequest(email, codigoUno, true, cuentaNueva())));
            assertEquals(0, relaciones(uno.comercioId(), "ACTIVO"));
        });
    }

    @Test
    void conCuatroFallosPreviosElCodigoCorrectoTodaviaAcepta() {
        enTransaccion(status -> {
            Dueno dueno = datos.registrarDuenoAprobado();
            sincronizar();
            String email = emailNuevo();
            int invitacionId = invitar(dueno, email);
            String codigo = codigoDe(invitacionId);
            for (int i = 0; i < 4; i++) {
                assertMismoCodigoInvalido(() -> invitacionService.aceptar(aceptarRequest(email, otroCodigo(codigo), true, cuentaNueva())));
            }
            assertEquals(4, intentosDe(invitacionId));

            assertTrue(invitacionService.aceptar(aceptarRequest(email, codigo, true, cuentaNueva())).isCuentaCreada());
            assertEquals("ACEPTADA", estadoDe(invitacionId));
        });
    }

    @Test
    void unaInvitacionVencidaNoSumaIntentosPeroLasVigentesDelMismoEmailSi() {
        enTransaccion(status -> {
            Dueno uno = datos.registrarDuenoAprobado();
            Dueno otro = datos.registrarDuenoAprobado();
            String email = emailNuevo();
            sincronizar();
            int vencida = invitar(uno, email);
            reloj.fijar(INICIO.plusDays(8));
            int vigente = invitar(otro, email);
            String incorrecto = "000000".equals(codigoDe(vigente)) ? "999999" : "000000";

            assertMismoCodigoInvalido(() -> invitacionService.validar(validarRequest(email, incorrecto)));

            assertEquals(0, intentosDe(vencida));
            assertEquals(1, intentosDe(vigente));
        });
    }

    @ParameterizedTest(name = "cuenta {0}")
    @CsvSource({
            "BLOQUEADO,Cuenta bloqueada. Recuperá tu contraseña para desbloquearla",
            "SUSPENDIDO,Cuenta suspendida",
            "INACTIVO,Cuenta inactiva. Solicitá la reactivación de tu cuenta",
            "PENDIENTE,Verificá tu email antes de iniciar sesión"})
    void unaCuentaExistenteQueYaNoEstaActivaDa409ConElTextoDeSuEstadoYNoSeTocaNada(String estadoCuenta, String mensaje) {
        enTransaccion(status -> {
            Dueno dueno = datos.registrarDuenoAprobado();
            int cuenta = datos.registrarCliente();
            sincronizar();
            int invitacionId = invitar(dueno, datos.emailDe(cuenta));
            String codigo = codigoDe(invitacionId);
            datos.cambiarEstadoUsuario(cuenta, estadoCuenta);
            sincronizar();

            InvitacionNoAptaException error = assertThrows(InvitacionNoAptaException.class,
                    () -> invitacionService.aceptar(aceptarRequest(datos.emailDe(cuenta), codigo, null, null)));

            assertEquals(mensaje, error.getMessage());
            assertEquals("PENDIENTE", estadoDe(invitacionId));
            assertEquals(0, intentosDe(invitacionId));
            assertEquals(0, filas("SELECT COUNT(*) FROM empleado WHERE id = ?", cuenta));
            assertEquals(0, filas("SELECT COUNT(*) FROM empleado_comercio WHERE comercio_id = ?", dueno.comercioId()));
            assertEquals(0, avisosAlDueno(dueno));
        });
    }

    @Test
    void unaCuentaConFilaDeAdministradorODeDuenoDa409DeRolIncompatibleAntesQueElEstado() {
        enTransaccion(status -> {
            Dueno dueno = datos.registrarDuenoAprobado();
            Dueno otroDueno = datos.registrarDuenoAprobado();
            int cuenta = datos.registrarCliente();
            sincronizar();
            int aAdministrador = invitar(dueno, datos.emailDe(cuenta));
            String codigoAdministrador = codigoDe(aAdministrador);
            datos.hacerAdministrador(cuenta);
            datos.cambiarEstadoUsuario(cuenta, "BLOQUEADO");
            int aDueno = insercionRepository.insertarPendiente(dueno.comercioId(), datos.emailDe(otroDueno.id()), "123456", dueno.id(),
                    INICIO, INICIO.plusDays(7));
            sincronizar();

            InvitacionNoAptaException comoAdministrador = assertThrows(InvitacionNoAptaException.class,
                    () -> invitacionService.aceptar(aceptarRequest(datos.emailDe(cuenta), codigoAdministrador, null, null)));
            InvitacionNoAptaException comoDueno = assertThrows(InvitacionNoAptaException.class,
                    () -> invitacionService.aceptar(aceptarRequest(datos.emailDe(otroDueno.id()), "123456", null, null)));

            assertEquals("No se puede aceptar esta invitación con esta cuenta", comoAdministrador.getMessage());
            assertEquals("No se puede aceptar esta invitación con esta cuenta", comoDueno.getMessage());
            assertEquals("PENDIENTE", estadoDe(aAdministrador));
            assertEquals("PENDIENTE", estadoDe(aDueno));
            assertEquals(0, filas("SELECT COUNT(*) FROM empleado WHERE id IN (?, ?)", cuenta, otroDueno.id()));
        });
    }

    @ParameterizedTest(name = "comercio {0}")
    @CsvSource({"APROBADO", "APTO_VENTA", "CERRADO_TEMPORALMENTE", "SUSPENDIDO"})
    void sePuedeAceptarConElComercioEnLosEstadosPermitidos(String estadoComercio) {
        enTransaccion(status -> {
            Dueno dueno = datos.registrarDuenoAprobado();
            sincronizar();
            String email = emailNuevo();
            int invitacionId = invitar(dueno, email);
            String codigo = codigoDe(invitacionId);
            datos.cambiarEstadoComercio(dueno.comercioId(), estadoComercio);
            sincronizar();

            assertTrue(invitacionService.aceptar(aceptarRequest(email, codigo, true, cuentaNueva())).isCuentaCreada());

            assertEquals(1, relaciones(dueno.comercioId(), "ACTIVO"));
            assertEquals("ACEPTADA", estadoDe(invitacionId));
        });
    }

    @ParameterizedTest(name = "comercio {0}")
    @CsvSource({"PENDIENTE", "RECHAZADO", "RECHAZO_DEFINITIVO", "INACTIVO"})
    void conElComercioEnUnEstadoNoPermitidoDa409YElRollbackNoDejaNadaConfirmado(String estadoComercio) {
        reloj.volverAlReloj();
        Dueno dueno = datos.registrarDuenoAprobado();
        String email = emailNuevo();
        try {
            int invitacionId = invitar(dueno, email);
            String codigo = codigoDe(invitacionId);
            datos.cambiarEstadoComercio(dueno.comercioId(), estadoComercio);

            InvitacionNoAptaException error = assertThrows(InvitacionNoAptaException.class,
                    () -> invitacionService.aceptar(aceptarRequest(email, codigo, true, cuentaNueva())));

            assertEquals("Esta invitación ya no está disponible", error.getMessage());
            assertEquals(0, filas("SELECT COUNT(*) FROM usuario WHERE email = ?", email), "la cuenta nueva se revirtió");
            assertEquals(0, filas("SELECT COUNT(*) FROM empleado_comercio WHERE comercio_id = ?", dueno.comercioId()));
            assertEquals("PENDIENTE", estadoDe(invitacionId));
            assertEquals(0, intentosDe(invitacionId));
            assertEquals(0, filas("SELECT COUNT(*) FROM historial_empleado_comercio WHERE comercio_id = ? AND motivo = 'ACEPTACION'", dueno.comercioId()));
            assertEquals(0, avisosAlDueno(dueno));
        } finally {
            borrarRastros(dueno);
        }
    }

    @Test
    void sinCuentaExistenteHacenFaltaLosDatosDeCuentaYLosTerminosYElErrorTieneElMismoMapaQueElRegistro() {
        enTransaccion(status -> {
            Dueno dueno = datos.registrarDuenoAprobado();
            sincronizar();
            String email = emailNuevo();
            int invitacionId = invitar(dueno, email);
            String codigo = codigoDe(invitacionId);
            DatosClienteRequestDTO cuenta = cuentaNueva();

            ValidacionCamposException sinTerminos = assertThrows(ValidacionCamposException.class,
                    () -> invitacionService.aceptar(aceptarRequest(email, codigo, null, cuenta)));
            ValidacionCamposException terminosFalsos = assertThrows(ValidacionCamposException.class,
                    () -> invitacionService.aceptar(aceptarRequest(email, codigo, false, cuenta)));
            ValidacionCamposException sinCuenta = assertThrows(ValidacionCamposException.class,
                    () -> invitacionService.aceptar(aceptarRequest(email, codigo, true, null)));
            ValidacionCamposException sinNada = assertThrows(ValidacionCamposException.class,
                    () -> invitacionService.aceptar(aceptarRequest(email, codigo, null, null)));

            assertEquals(Map.of("aceptaTerminos", "Tenés que aceptar los Términos y Condiciones"), sinTerminos.getErrores());
            assertEquals(Map.of("aceptaTerminos", "Tenés que aceptar los Términos y Condiciones"), terminosFalsos.getErrores());
            assertEquals(Map.of("cuentaNueva", "Completá tus datos para crear tu cuenta"), sinCuenta.getErrores());
            assertEquals(2, sinNada.getErrores().size());
            assertEquals("PENDIENTE", estadoDe(invitacionId));
            assertEquals(0, intentosDe(invitacionId), "faltar datos no es un código incorrecto");
            assertEquals(0, filas("SELECT COUNT(*) FROM usuario WHERE email = ?", email));
        });
    }

    @Test
    void unDniOUnNombreDeUsuarioYaUsadosDan409ConElMensajeDelRegistroYNoCreanNada() {
        enTransaccion(status -> {
            Dueno dueno = datos.registrarDuenoAprobado();
            int existente = datos.registrarCliente();
            sincronizar();
            String email = emailNuevo();
            int invitacionId = invitar(dueno, email);
            String codigo = codigoDe(invitacionId);
            String dniUsado = texto("SELECT dni FROM persona_fisica WHERE id = ?", existente);
            String nombreUsuarioUsado = texto("SELECT nombre_usuario FROM usuario WHERE id = ?", existente);
            DatosClienteRequestDTO conDniUsado = datos.datosClienteNuevo("nu" + DatosPruebaEmpleado.sufijo(), dniUsado, "Pw1234567890");
            DatosClienteRequestDTO conNombreUsado = datos.datosClienteNuevo(nombreUsuarioUsado, DatosPruebaEmpleado.dniAleatorio(), "Pw1234567890");

            ConflictoDeNegocioException porDni = assertThrows(ConflictoDeNegocioException.class,
                    () -> invitacionService.aceptar(aceptarRequest(email, codigo, true, conDniUsado)));
            ConflictoDeNegocioException porNombre = assertThrows(ConflictoDeNegocioException.class,
                    () -> invitacionService.aceptar(aceptarRequest(email, codigo, true, conNombreUsado)));

            assertEquals("Ya existe una cuenta registrada con ese DNI", porDni.getMessage());
            assertEquals("Ese nombre de usuario ya está en uso", porNombre.getMessage());
            assertEquals("PENDIENTE", estadoDe(invitacionId));
            assertEquals(0, filas("SELECT COUNT(*) FROM usuario WHERE email = ?", email));
            assertEquals(0, relaciones(dueno.comercioId(), "ACTIVO"));
        });
    }

    @Test
    void aceptarUnaInvitacionNoTocaLasDemasPendientesDelMismoEmailEnOtrosComercios() {
        enTransaccion(status -> {
            Dueno uno = datos.registrarDuenoAprobado();
            Dueno otro = datos.registrarDuenoAprobado();
            String email = emailNuevo();
            sincronizar();
            int invitacionUno = invitar(uno, email);
            int invitacionOtro = invitar(otro, email);
            String codigoUno = codigoDe(invitacionUno);
            sincronizar();

            invitacionService.aceptar(aceptarRequest(email, codigoUno, true, cuentaNueva()));

            assertEquals("ACEPTADA", estadoDe(invitacionUno));
            assertEquals("PENDIENTE", estadoDe(invitacionOtro));
            assertEquals(0, intentosDe(invitacionOtro));
            assertEquals(1, relaciones(uno.comercioId(), "ACTIVO"));
            assertEquals(0, relaciones(otro.comercioId(), "ACTIVO"));
            assertEquals(0, avisosAlDueno(otro));
        });
    }

    @Test
    void dosAceptacionesSimultaneasDelMismoCodigoConCuentaNuevaDejanUnSoloAlta() throws Exception {
        reloj.volverAlReloj();
        Dueno dueno = datos.registrarDuenoAprobado();
        String email = emailNuevo();
        try {
            int invitacionId = invitar(dueno, email);
            String codigo = codigoDe(invitacionId);
            DatosClienteRequestDTO cuentaA = cuentaNueva();
            DatosClienteRequestDTO cuentaB = cuentaNueva();

            List<Object> resultados = enParalelo(List.of(
                    () -> invitacionService.aceptar(aceptarRequest(email, codigo, true, cuentaA)),
                    () -> invitacionService.aceptar(aceptarRequest(email, codigo, true, cuentaB))));

            assertEquals(1, resultados.stream().filter(r -> r instanceof InvitacionEmpleadoAceptadaResponseDTO).count(), resultados.toString());
            assertEquals(1, resultados.stream().filter(r -> r instanceof CodigoInvitacionInvalidoException).count(), resultados.toString());
            int usuarioId = filas("SELECT id FROM usuario WHERE email = ?", email);
            assertEquals(1, filas("SELECT COUNT(*) FROM usuario WHERE email = ?", email));
            assertEquals(1, filas("SELECT COUNT(*) FROM empleado WHERE id = ?", usuarioId));
            assertEquals(1, filas("SELECT COUNT(*) FROM empleado_comercio WHERE comercio_id = ?", dueno.comercioId()));
            assertEquals(1, avisosAlDueno(dueno));
            assertEquals("ACEPTADA", estadoDe(invitacionId));
            assertEquals(1, filas("SELECT COUNT(*) FROM historial_empleado_comercio WHERE comercio_id = ? AND motivo = 'ACEPTACION'", dueno.comercioId()));
        } finally {
            borrarRastros(dueno);
        }
    }

    @Test
    void dosAceptacionesSimultaneasDeComerciosDistintosConUnaCuentaExistenteDejanUnaFilaDeEmpleadoYDosRelaciones() throws Exception {
        reloj.volverAlReloj();
        Dueno uno = datos.registrarDuenoAprobado();
        Dueno otro = datos.registrarDuenoAprobado();
        int cuenta = datos.registrarCliente();
        String email = datos.emailDe(cuenta);
        try {
            String codigoUno = codigoDe(invitar(uno, email));
            String codigoOtro = codigoDe(invitar(otro, email));

            List<Object> resultados = enParalelo(List.of(
                    () -> invitacionService.aceptar(aceptarRequest(email, codigoUno, null, null)),
                    () -> invitacionService.aceptar(aceptarRequest(email, codigoOtro, null, null))));

            assertEquals(2, resultados.stream().filter(r -> r instanceof InvitacionEmpleadoAceptadaResponseDTO).count(), resultados.toString());
            assertEquals(1, filas("SELECT COUNT(*) FROM empleado WHERE id = ?", cuenta));
            assertEquals(1, relaciones(uno.comercioId(), "ACTIVO"));
            assertEquals(1, relaciones(otro.comercioId(), "ACTIVO"));
            assertEquals(2, filas("SELECT COUNT(*) FROM empleado_comercio WHERE empleado_id = ?", cuenta));
            assertEquals(1, avisosAlDueno(uno));
            assertEquals(1, avisosAlDueno(otro));
        } finally {
            borrarRastros(uno);
            borrarRastros(otro);
        }
    }

    @Test
    void veinteCodigosErroneosEnParaleloConElCorrectoMezcladoInvalidanSinInterbloqueos() throws Exception {
        reloj.volverAlReloj();
        for (int ronda = 1; ronda <= 6; ronda++) {
            Dueno dueno = datos.registrarDuenoAprobado();
            String email = emailNuevo();
            try {
                int invitacionId = invitar(dueno, email);
                String codigo = codigoDe(invitacionId);
                String incorrecto = otroCodigo(codigo);
                int posicionDelCorrecto = ronda * 3;
                List<Callable<Object>> tareas = new ArrayList<>();
                for (int i = 0; i < 21; i++) {
                    if (i == posicionDelCorrecto) {
                        tareas.add(() -> invitacionService.validar(validarRequest(email, codigo)));
                    } else if (i % 2 == 0) {
                        tareas.add(() -> invitacionService.validar(validarRequest(email, incorrecto)));
                    } else {
                        tareas.add(() -> invitacionService.aceptar(aceptarRequest(email, incorrecto, null, null)));
                    }
                }

                List<Object> resultados = enParalelo(tareas);

                long inesperados = resultados.stream()
                        .filter(r -> !(r instanceof CodigoInvitacionInvalidoException) && !(r instanceof InvitacionEmpleadoValidadaResponseDTO))
                        .count();
                assertEquals(0, inesperados, "ronda " + ronda + ": " + resultados);
                assertTrue(resultados.stream().filter(r -> r instanceof InvitacionEmpleadoValidadaResponseDTO).count() <= 1, "ronda " + ronda);
                assertEquals("INVALIDADA", estadoDe(invitacionId), "ronda " + ronda);
                assertEquals(5, intentosDe(invitacionId), "ronda " + ronda);
            } finally {
                borrarRastros(dueno);
            }
        }
    }

    @Test
    void codigosErroneosQueInvalidanContraReenviarEInvitarDelDuenoNoSeInterbloquean() throws Exception {
        reloj.volverAlReloj();
        for (int ronda = 1; ronda <= 6; ronda++) {
            Dueno dueno = datos.registrarDuenoAprobado();
            String email = emailNuevo();
            try {
                int invitacionId = invitar(dueno, email);
                String incorrecto = otroCodigo(codigoDe(invitacionId));
                List<Callable<Object>> tareas = new ArrayList<>();
                for (int i = 0; i < 6; i++) {
                    tareas.add(i % 2 == 0
                            ? () -> invitacionService.validar(validarRequest(email, incorrecto))
                            : () -> invitacionService.aceptar(aceptarRequest(email, incorrecto, null, null)));
                }
                tareas.add(() -> invitacionService.reenviar(activo(dueno), invitacionId));
                tareas.add(() -> invitacionService.invitar(activo(dueno), email));

                List<Object> resultados = enParalelo(tareas);

                long inesperados = resultados.subList(0, 6).stream().filter(r -> !(r instanceof CodigoInvitacionInvalidoException)).count();
                assertEquals(0, inesperados, "ronda " + ronda + ": " + resultados);
                Object reenvio = resultados.get(6);
                Object invitacionNueva = resultados.get(7);
                boolean reenvioExitoso = !(reenvio instanceof Exception);
                boolean invitacionExitosa = !(invitacionNueva instanceof Exception);
                assertTrue(reenvioExitoso || invitacionExitosa, "ronda " + ronda + ": " + reenvio + " / " + invitacionNueva);
                if (!reenvioExitoso) {
                    assertTrue(reenvio instanceof ConflictoDeNegocioException, "ronda " + ronda + ": " + reenvio);
                }
                if (!invitacionExitosa) {
                    assertTrue(invitacionNueva instanceof ConflictoDeNegocioException, "ronda " + ronda + ": " + invitacionNueva);
                }
                assertTrue(filas("SELECT COUNT(*) FROM invitacion_empleado WHERE comercio_id = ? AND email = ? AND estado = 'PENDIENTE'",
                        dueno.comercioId(), email) <= 1, "ronda " + ronda);
            } finally {
                borrarRastros(dueno);
            }
        }
    }

    private List<Object> enParalelo(List<Callable<Object>> tareas) throws Exception {
        ExecutorService pool = Executors.newFixedThreadPool(tareas.size());
        CountDownLatch salida = new CountDownLatch(1);
        try {
            List<Future<Object>> futuros = new ArrayList<>();
            for (Callable<Object> tarea : tareas) {
                futuros.add(pool.submit(() -> {
                    salida.await();
                    try {
                        return tarea.call();
                    } catch (Exception e) {
                        return e;
                    }
                }));
            }
            salida.countDown();
            List<Object> resultados = new ArrayList<>();
            for (Future<Object> futuro : futuros) {
                resultados.add(futuro.get());
            }
            return resultados;
        } finally {
            pool.shutdownNow();
        }
    }

    private void borrarRastros(Dueno dueno) {
        jdbcTemplate.update("DELETE FROM historial_empleado_comercio WHERE comercio_id = ?", dueno.comercioId());
        jdbcTemplate.update("DELETE FROM empleado_comercio WHERE comercio_id = ?", dueno.comercioId());
        jdbcTemplate.update("DELETE FROM invitacion_empleado WHERE comercio_id = ?", dueno.comercioId());
        jdbcTemplate.update("DELETE FROM notificacion WHERE usuario_id = ?", dueno.id());
    }
}
