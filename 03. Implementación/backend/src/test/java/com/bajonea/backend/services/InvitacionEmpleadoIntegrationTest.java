package com.bajonea.backend.services;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;

import com.bajonea.backend.config.security.AuthenticatedUser;
import com.bajonea.backend.config.security.ComercioActivo;
import com.bajonea.backend.dto.response.EquipoComercioResponseDTO;
import com.bajonea.backend.dto.response.InvitacionEmpleadoResponseDTO;
import com.bajonea.backend.dto.response.NotificacionResponseDTO;
import com.bajonea.backend.enums.EstadoEmpleadoComercio;
import com.bajonea.backend.enums.EstadoInvitacionEmpleado;
import com.bajonea.backend.enums.MotivoRegularizacionInvitacion;
import com.bajonea.backend.enums.RolUsuario;
import com.bajonea.backend.enums.TipoNotificacion;
import com.bajonea.backend.exceptions.ConflictoDeNegocioException;
import com.bajonea.backend.exceptions.InvitacionNoAptaException;
import com.bajonea.backend.exceptions.RecursoNoEncontradoException;
import com.bajonea.backend.repositories.InvitacionInsercionRepository;
import com.bajonea.backend.services.DatosPruebaEmpleado.Dueno;
import com.bajonea.backend.util.EjecucionPostCommit;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.persistence.EntityManager;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Collections;
import java.util.IdentityHashMap;
import java.util.List;
import java.util.Set;
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
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionStatus;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Invitar, reenviar, cancelar y listar el equipo contra {@code bajonea_test}, con reloj controlable y el
 * {@code EmailService} reemplazado por un mock. La mayoría de las pruebas corren dentro de una transacción que
 * se revierte; como el email sale recién al confirmar, las pruebas disparan a mano los {@code afterCommit}
 * registrados por {@link EjecucionPostCommit} (antes de disparar, el mock no recibió nada). Las pruebas de
 * concurrencia y la de "la fila de regularización sobrevive al 409" confirman de verdad, con datos únicos.
 */
@SpringBootTest
@ActiveProfiles("test")
class InvitacionEmpleadoIntegrationTest {

    private static final LocalDateTime INICIO = LocalDateTime.of(2026, 10, 6, 12, 0, 0);
    private static final LocalDate HOY = INICIO.toLocalDate();
    private static final String MENSAJE_NO_SE_PUEDE_INVITAR = "No se puede invitar a este email";

    static class RelojDePrueba extends Clock {

        private volatile Instant fijo;

        void fijar(LocalDateTime momento) {
            fijo = momento.atZone(ZoneId.systemDefault()).toInstant();
        }

        void volverAlReloj() {
            fijo = null;
        }

        @Override
        public ZoneId getZone() {
            return ZoneId.systemDefault();
        }

        @Override
        public Clock withZone(ZoneId zone) {
            return this;
        }

        @Override
        public Instant instant() {
            Instant actual = fijo;
            return actual != null ? actual : Instant.now();
        }
    }

    @TestConfiguration
    static class Configuracion {

        @Bean
        @Primary
        RelojDePrueba relojDePrueba() {
            return new RelojDePrueba();
        }
    }

    @Autowired
    private InvitacionEmpleadoService invitacionService;

    @Autowired
    private ComercioActivoService comercioActivoService;

    @Autowired
    private NotificacionService notificacionService;

    @Autowired
    private InvitacionInsercionRepository insercionRepository;

    @Autowired
    private RegistroService registroService;

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

    @MockitoBean
    private EmailService emailService;

    private DatosPruebaEmpleado datos;
    private final Set<TransactionSynchronization> disparadas = Collections.newSetFromMap(new IdentityHashMap<>());

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

    private void confirmarEmails() {
        for (TransactionSynchronization sincronizacion : TransactionSynchronizationManager.getSynchronizations()) {
            if (sincronizacion.getClass().getEnclosingClass() == EjecucionPostCommit.class && disparadas.add(sincronizacion)) {
                sincronizacion.afterCommit();
            }
        }
    }

    private void sinEmailsDeInvitacion() {
        verify(emailService, never()).enviarInvitacionEmpleado(anyString(), anyString(), anyString(), anyString());
        verify(emailService, never()).enviarRegularizacionInvitacion(anyString(), any(), anyString());
    }

    private ComercioActivo activo(Dueno dueno) {
        return new ComercioActivo(dueno.comercioId(), dueno.id());
    }

    private static String emailNuevo() {
        return "invitado." + DatosPruebaEmpleado.sufijo() + "@bajonea.test";
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

    private int invitaciones(int comercioId) {
        return filas("SELECT COUNT(*) FROM invitacion_empleado WHERE comercio_id = ?", comercioId);
    }

    private int pendientes(int comercioId, String email) {
        return filas("SELECT COUNT(*) FROM invitacion_empleado WHERE comercio_id = ? AND email = ? AND estado = 'PENDIENTE'", comercioId, email);
    }

    private String estadoDe(int invitacionId) {
        volcar();
        return jdbcTemplate.queryForObject("SELECT estado FROM invitacion_empleado WHERE id = ?", String.class, invitacionId);
    }

    private String codigoDe(int invitacionId) {
        volcar();
        return jdbcTemplate.queryForObject("SELECT codigo FROM invitacion_empleado WHERE id = ?", String.class, invitacionId);
    }

    private int emailsDeRegularizacion(int usuarioId) {
        return filas("SELECT COUNT(*) FROM notificacion WHERE usuario_id = ? AND canal = 'EMAIL' AND tipo = 'INVITACION_EMPLEADO'", usuarioId);
    }

    private int historial(int comercioId, String motivo) {
        return filas("SELECT COUNT(*) FROM historial_empleado_comercio WHERE comercio_id = ? AND motivo = ?", comercioId, motivo);
    }

    @Test
    void invitarCreaLaInvitacionConCodigoHistorialYEmailRecienAlConfirmar() {
        enTransaccion(status -> {
            Dueno dueno = datos.registrarDuenoAprobado();
            sincronizar();

            InvitacionEmpleadoResponseDTO respuesta = invitacionService.invitar(activo(dueno), "  Nuevo." + DatosPruebaEmpleado.sufijo() + "@Bajonea.TEST ");

            assertEquals(EstadoInvitacionEmpleado.PENDIENTE, respuesta.getEstado());
            assertEquals(INICIO, respuesta.getFechaCreacion());
            assertEquals(INICIO.plusDays(7), respuesta.getFechaVencimiento());
            assertEquals(respuesta.getEmail(), respuesta.getEmail().toLowerCase(), "el email se normaliza a minúsculas y sin espacios");
            assertFalse(respuesta.getEmail().contains(" "));

            String codigo = codigoDe(respuesta.getId());
            assertTrue(codigo.matches("\\d{6}"));
            assertEquals(dueno.id(), filas("SELECT invitado_por_usuario_id FROM invitacion_empleado WHERE id = ?", respuesta.getId()));
            assertEquals(0, filas("SELECT intentos_fallidos FROM invitacion_empleado WHERE id = ?", respuesta.getId()));
            assertEquals(1, historial(dueno.comercioId(), "INVITACION"));
            assertEquals(1, filas("SELECT COUNT(*) FROM historial_empleado_comercio WHERE invitacion_id = ? AND actor_usuario_id = ? "
                    + "AND estado_origen IS NULL AND estado_destino IS NULL AND empleado_comercio_id IS NULL",
                    respuesta.getId(), dueno.id()));

            sinEmailsDeInvitacion();
            confirmarEmails();
            verify(emailService).enviarInvitacionEmpleado(respuesta.getEmail(), "Representante Prueba", dueno.nombreComercio(), codigo);
            verify(emailService, never()).enviarRegularizacionInvitacion(anyString(), any(), anyString());
        });
    }

    @Test
    void sinConfirmarLaTransaccionNoSaleNingunEmail() {
        enTransaccion(status -> {
            Dueno dueno = datos.registrarDuenoAprobado();
            sincronizar();

            invitacionService.invitar(activo(dueno), emailNuevo());

            sinEmailsDeInvitacion();
        });
        verify(emailService, never()).enviarInvitacionEmpleado(anyString(), anyString(), anyString(), anyString());
    }

    @ParameterizedTest(name = "comercio {0}")
    @CsvSource({"PENDIENTE", "RECHAZADO", "RECHAZO_DEFINITIVO", "SUSPENDIDO", "INACTIVO", "CERRADO_TEMPORALMENTE"})
    void soloSePuedeInvitarConElComercioOperativo(String estadoComercio) {
        enTransaccion(status -> {
            Dueno dueno = datos.registrarDuenoAprobado();
            datos.cambiarEstadoComercio(dueno.comercioId(), estadoComercio);
            sincronizar();

            ConflictoDeNegocioException error = assertThrows(ConflictoDeNegocioException.class,
                    () -> invitacionService.invitar(activo(dueno), emailNuevo()));

            assertEquals("Este comercio no puede invitar empleados en este momento", error.getMessage());
            assertEquals(0, invitaciones(dueno.comercioId()));
            sinEmailsDeInvitacion();
        });
    }

    @Test
    void conElComercioAptoParaVentaSePuedeInvitar() {
        enTransaccion(status -> {
            Dueno dueno = datos.registrarDuenoAprobado();
            datos.cambiarEstadoComercio(dueno.comercioId(), "APTO_VENTA");
            sincronizar();

            assertEquals(EstadoInvitacionEmpleado.PENDIENTE, invitacionService.invitar(activo(dueno), emailNuevo()).getEstado());
        });
    }

    @Test
    void unComercioAjenoDaElMismoNoEncontradoQueUnoInexistenteYNoSeTocaLaInvitacionDeOtro() {
        enTransaccion(status -> {
            Dueno dueno = datos.registrarDuenoAprobado();
            Dueno otro = datos.registrarDuenoAprobado();
            sincronizar();
            InvitacionEmpleadoResponseDTO invitacion = invitacionService.invitar(activo(dueno), emailNuevo());

            RecursoNoEncontradoException ajeno = assertThrows(RecursoNoEncontradoException.class,
                    () -> comercioActivoService.resolver(otro.id(), String.valueOf(dueno.comercioId())));
            RecursoNoEncontradoException inexistente = assertThrows(RecursoNoEncontradoException.class,
                    () -> comercioActivoService.resolver(otro.id(), String.valueOf(Integer.MAX_VALUE - 1)));
            assertEquals(inexistente.getMessage(), ajeno.getMessage());

            assertThrows(RecursoNoEncontradoException.class, () -> invitacionService.cancelar(activo(otro), invitacion.getId()));
            assertThrows(RecursoNoEncontradoException.class, () -> invitacionService.reenviar(activo(otro), invitacion.getId()));
            assertThrows(RecursoNoEncontradoException.class, () -> invitacionService.cancelar(activo(dueno), Integer.MAX_VALUE - 1));
            assertEquals("PENDIENTE", estadoDe(invitacion.getId()));
            assertEquals(1, invitaciones(dueno.comercioId()));
            assertEquals(0, invitaciones(otro.comercioId()));
        });
    }

    @Test
    void unEmpleadoActivoDelComercioDaConflictoYUnoInactivoSePuedeVolverAInvitar() {
        enTransaccion(status -> {
            Dueno dueno = datos.registrarDuenoAprobado();
            int activo = datos.registrarCliente();
            int inactivo = datos.registrarCliente();
            datos.vincularEmpleado(activo, dueno.comercioId(), "ACTIVO", INICIO.minusDays(5));
            datos.vincularEmpleado(inactivo, dueno.comercioId(), "INACTIVO", INICIO.minusDays(9));
            sincronizar();

            ConflictoDeNegocioException error = assertThrows(ConflictoDeNegocioException.class,
                    () -> invitacionService.invitar(activo(dueno), datos.emailDe(activo)));
            assertEquals("Esa persona ya es parte de tu equipo", error.getMessage());
            assertEquals(0, invitaciones(dueno.comercioId()));

            InvitacionEmpleadoResponseDTO nueva = invitacionService.invitar(activo(dueno), datos.emailDe(inactivo));

            assertEquals(EstadoInvitacionEmpleado.PENDIENTE, nueva.getEstado());
            assertEquals(1, invitaciones(dueno.comercioId()));
            assertEquals(0, filas("SELECT COUNT(*) FROM empleado_comercio WHERE empleado_id = ? AND estado = 'ACTIVO'", inactivo),
                    "invitar no reactiva la relación: eso pasa al aceptar");
        });
    }

    @Test
    void conUnaPendienteVigenteDaConflictoYVencidaYaNoBloqueaYQuedaMaterializadaComoVencida() {
        enTransaccion(status -> {
            Dueno dueno = datos.registrarDuenoAprobado();
            sincronizar();
            String email = emailNuevo();
            InvitacionEmpleadoResponseDTO primera = invitacionService.invitar(activo(dueno), email);

            ConflictoDeNegocioException error = assertThrows(ConflictoDeNegocioException.class,
                    () -> invitacionService.invitar(activo(dueno), email));
            assertEquals("Ya hay una invitación pendiente para ese email. Podés reenviarla.", error.getMessage());
            assertTrue(status.isRollbackOnly(), "un conflicto común sí revierte la transacción");

            reloj.fijar(INICIO.plusDays(8));
            InvitacionEmpleadoResponseDTO segunda = invitacionService.invitar(activo(dueno), email);

            assertNotEquals(primera.getId(), segunda.getId());
            assertEquals("VENCIDA", estadoDe(primera.getId()));
            assertEquals("PENDIENTE", estadoDe(segunda.getId()));
            assertEquals(1, pendientes(dueno.comercioId(), email));
        });
    }

    @ParameterizedTest(name = "cuenta {0}")
    @CsvSource({"BLOQUEADO,BLOQUEADA", "SUSPENDIDO,SUSPENDIDA", "INACTIVO,INACTIVA", "PENDIENTE,SIN_VERIFICAR"})
    void unaCuentaQueNoEstaActivaNoSeInvitaYRecibeElAvisoDeRegularizacion(String estadoCuenta, String motivo) {
        enTransaccion(status -> {
            Dueno dueno = datos.registrarDuenoAprobado();
            int cuenta = datos.registrarCliente();
            datos.cambiarEstadoUsuario(cuenta, estadoCuenta);
            sincronizar();

            InvitacionNoAptaException error = assertThrows(InvitacionNoAptaException.class,
                    () -> invitacionService.invitar(activo(dueno), datos.emailDe(cuenta)));

            assertEquals(MENSAJE_NO_SE_PUEDE_INVITAR, error.getMessage());
            assertFalse(status.isRollbackOnly(), "la excepción específica no revierte: la fila de regularización tiene que quedar");
            assertEquals(0, invitaciones(dueno.comercioId()));
            assertEquals(1, emailsDeRegularizacion(cuenta));
            assertEquals(1, filas("SELECT COUNT(*) FROM notificacion WHERE usuario_id = ? AND canal = 'EMAIL' AND estado = 'ENVIADO' "
                    + "AND tipo = 'INVITACION_EMPLEADO' AND leida = 0", cuenta));

            confirmarEmails();
            verify(emailService).enviarRegularizacionInvitacion(datos.emailDe(cuenta), MotivoRegularizacionInvitacion.valueOf(motivo),
                    dueno.nombreComercio());
            verify(emailService, never()).enviarInvitacionEmpleado(anyString(), anyString(), anyString(), anyString());
        });
    }

    @Test
    void unDuenoOUnAdministradorNoSeInvitanNiRecibenAvisoYElDuenoVeElMismoMensaje() {
        enTransaccion(status -> {
            Dueno dueno = datos.registrarDuenoAprobado();
            Dueno otroDueno = datos.registrarDuenoAprobado();
            int administrador = datos.registrarCliente();
            datos.hacerAdministrador(administrador);
            datos.cambiarEstadoUsuario(otroDueno.id(), "BLOQUEADO");
            sincronizar();

            for (String email : List.of(otroDueno.email(), datos.emailDe(administrador), dueno.email())) {
                InvitacionNoAptaException error = assertThrows(InvitacionNoAptaException.class,
                        () -> invitacionService.invitar(activo(dueno), email));
                assertEquals(MENSAJE_NO_SE_PUEDE_INVITAR, error.getMessage());
            }

            assertEquals(0, invitaciones(dueno.comercioId()));
            assertEquals(0, emailsDeRegularizacion(otroDueno.id()), "ni siquiera a un Dueño bloqueado");
            assertEquals(0, emailsDeRegularizacion(administrador));
            confirmarEmails();
            sinEmailsDeInvitacion();
        });
    }

    @Test
    void unaCuentaExistenteActivaConMenosDeDieciochoAniosNoSeInvitaNiRecibeAvisoYElDuenoVeElMismoMensaje() {
        enTransaccion(status -> {
            Dueno dueno = datos.registrarDuenoAprobado();
            int menor = datos.registrarCliente();
            datos.cambiarFechaNacimiento(menor, HOY.minusYears(16));
            int casiMayor = datos.registrarCliente();
            datos.cambiarFechaNacimiento(casiMayor, HOY.minusYears(18).plusDays(1));
            sincronizar();

            for (int cuenta : List.of(menor, casiMayor)) {
                InvitacionNoAptaException error = assertThrows(InvitacionNoAptaException.class,
                        () -> invitacionService.invitar(activo(dueno), datos.emailDe(cuenta)));
                assertEquals(MENSAJE_NO_SE_PUEDE_INVITAR, error.getMessage());
                assertEquals(0, emailsDeRegularizacion(cuenta));
            }

            assertEquals(0, invitaciones(dueno.comercioId()));
            assertEquals(0, historial(dueno.comercioId(), "INVITACION"));
            confirmarEmails();
            sinEmailsDeInvitacion();
        });
    }

    @Test
    void unaCuentaExistenteQueCumpleDieciochoHoySePuedeInvitar() {
        enTransaccion(status -> {
            Dueno dueno = datos.registrarDuenoAprobado();
            int cuenta = datos.registrarCliente();
            datos.cambiarFechaNacimiento(cuenta, HOY.minusYears(18));
            sincronizar();

            InvitacionEmpleadoResponseDTO invitacion = invitacionService.invitar(activo(dueno), datos.emailDe(cuenta));

            assertEquals("PENDIENTE", estadoDe(invitacion.getId()));
            assertEquals(1, invitaciones(dueno.comercioId()));
        });
    }

    @Test
    void laEdadSeEvaluaDespuesDelEstadoUnMenorBloqueadoRecibeElAvisoDeRegularizacion() {
        enTransaccion(status -> {
            Dueno dueno = datos.registrarDuenoAprobado();
            int cuenta = datos.registrarCliente();
            datos.cambiarFechaNacimiento(cuenta, HOY.minusYears(16));
            datos.cambiarEstadoUsuario(cuenta, "BLOQUEADO");
            sincronizar();

            InvitacionNoAptaException error = assertThrows(InvitacionNoAptaException.class,
                    () -> invitacionService.invitar(activo(dueno), datos.emailDe(cuenta)));

            assertEquals(MENSAJE_NO_SE_PUEDE_INVITAR, error.getMessage());
            assertEquals(1, emailsDeRegularizacion(cuenta));
            assertEquals(0, invitaciones(dueno.comercioId()));
        });
    }

    @Test
    void reenviarRevalidaLaEdadYSiLaCuentaDeclaraMenosDeDieciochoNoCreaNadaNiAvisa() {
        enTransaccion(status -> {
            Dueno dueno = datos.registrarDuenoAprobado();
            int cuenta = datos.registrarCliente();
            sincronizar();
            String email = datos.emailDe(cuenta);
            InvitacionEmpleadoResponseDTO primera = invitacionService.invitar(activo(dueno), email);
            datos.cambiarFechaNacimiento(cuenta, HOY.minusYears(17));
            sincronizar();

            InvitacionNoAptaException error = assertThrows(InvitacionNoAptaException.class,
                    () -> invitacionService.reenviar(activo(dueno), primera.getId()));

            assertEquals(MENSAJE_NO_SE_PUEDE_INVITAR, error.getMessage());
            assertEquals("PENDIENTE", estadoDe(primera.getId()), "la invitación vigente queda como estaba");
            assertEquals(1, invitaciones(dueno.comercioId()));
            assertEquals(0, emailsDeRegularizacion(cuenta));
        });
    }

    @Test
    void elAvisoDeRegularizacionTieneUnTopeDeTresEnVeinticuatroHorasCorridas() {
        enTransaccion(status -> {
            Dueno dueno = datos.registrarDuenoAprobado();
            int cuenta = datos.registrarCliente();
            datos.cambiarEstadoUsuario(cuenta, "BLOQUEADO");
            sincronizar();
            String email = datos.emailDe(cuenta);

            for (int intento = 1; intento <= 4; intento++) {
                reloj.fijar(INICIO.plusHours(intento));
                assertThrows(InvitacionNoAptaException.class, () -> invitacionService.invitar(activo(dueno), email));
            }

            assertEquals(3, emailsDeRegularizacion(cuenta), "el cuarto intento ya no suma otra fila");
            confirmarEmails();
            verify(emailService, times(3)).enviarRegularizacionInvitacion(eq(email), eq(MotivoRegularizacionInvitacion.BLOQUEADA), anyString());

            reloj.fijar(INICIO.plusHours(25));
            assertThrows(InvitacionNoAptaException.class, () -> invitacionService.invitar(activo(dueno), email));
            assertEquals(4, emailsDeRegularizacion(cuenta));
            confirmarEmails();
            verify(emailService, times(4)).enviarRegularizacionInvitacion(eq(email), eq(MotivoRegularizacionInvitacion.BLOQUEADA), anyString());
        });
    }

    @Test
    void elTopeDeCincoPorHoraSeCuentaPorComercioIncluyeLosReenviosYInformaLaHoraDeReintento() {
        enTransaccion(status -> {
            Dueno dueno = datos.registrarDuenoAprobado();
            Dueno otroDueno = datos.registrarDuenoAprobado();
            sincronizar();
            List<InvitacionEmpleadoResponseDTO> hechas = new ArrayList<>();
            for (int i = 0; i < 4; i++) {
                reloj.fijar(INICIO.plusMinutes(5L * i));
                hechas.add(invitacionService.invitar(activo(dueno), emailNuevo()));
            }
            reloj.fijar(INICIO.plusMinutes(20));
            invitacionService.reenviar(activo(dueno), hechas.get(0).getId());

            reloj.fijar(INICIO.plusMinutes(25));
            ConflictoDeNegocioException error = assertThrows(ConflictoDeNegocioException.class,
                    () -> invitacionService.invitar(activo(dueno), emailNuevo()));

            assertEquals("Alcanzaste el máximo de 5 invitaciones por hora. Probá de nuevo a las 13:00", error.getMessage());
            assertEquals(5, invitaciones(dueno.comercioId()));
            assertEquals(EstadoInvitacionEmpleado.PENDIENTE, invitacionService.invitar(activo(otroDueno), emailNuevo()).getEstado(),
                    "el tope es por comercio");

            reloj.fijar(INICIO.plusHours(1));
            assertEquals(EstadoInvitacionEmpleado.PENDIENTE, invitacionService.invitar(activo(dueno), emailNuevo()).getEstado(),
                    "a las 13:00 la más antigua sale de la ventana");
        });
    }

    @Test
    void reenviarCreaUnaFilaNuevaDejaLaAnteriorReemplazadaYMandaElCodigoNuevo() {
        enTransaccion(status -> {
            Dueno dueno = datos.registrarDuenoAprobado();
            sincronizar();
            String email = emailNuevo();
            InvitacionEmpleadoResponseDTO primera = invitacionService.invitar(activo(dueno), email);

            reloj.fijar(INICIO.plusMinutes(1));
            InvitacionEmpleadoResponseDTO nueva = invitacionService.reenviar(activo(dueno), primera.getId());

            assertNotEquals(primera.getId(), nueva.getId());
            assertEquals(EstadoInvitacionEmpleado.PENDIENTE, nueva.getEstado());
            assertEquals(INICIO.plusMinutes(1).plusDays(7), nueva.getFechaVencimiento());
            assertEquals("REEMPLAZADA", estadoDe(primera.getId()));
            assertEquals(INICIO.plusMinutes(1), jdbcTemplate.queryForObject(
                    "SELECT fecha_resolucion FROM invitacion_empleado WHERE id = ?", LocalDateTime.class, primera.getId()));
            assertEquals(1, pendientes(dueno.comercioId(), email));
            assertEquals(2, historial(dueno.comercioId(), "INVITACION"));

            confirmarEmails();
            ArgumentCaptor<String> codigos = ArgumentCaptor.forClass(String.class);
            verify(emailService, times(2)).enviarInvitacionEmpleado(eq(email), anyString(), eq(dueno.nombreComercio()), codigos.capture());
            assertEquals(codigoDe(nueva.getId()), codigos.getAllValues().get(1));
        });
    }

    @Test
    void reenviarFuncionaConUnaVencidaYConUnaConCodigoBloqueadoSinPisarSuEstadoPeroNoConLasCerradas() {
        enTransaccion(status -> {
            Dueno dueno = datos.registrarDuenoAprobado();
            sincronizar();
            String emailVencida = emailNuevo();
            String emailBloqueada = emailNuevo();
            InvitacionEmpleadoResponseDTO vencida = invitacionService.invitar(activo(dueno), emailVencida);
            InvitacionEmpleadoResponseDTO bloqueada = invitacionService.invitar(activo(dueno), emailBloqueada);
            InvitacionEmpleadoResponseDTO aCancelar = invitacionService.invitar(activo(dueno), emailNuevo());
            invitacionService.cancelar(activo(dueno), aCancelar.getId());
            jdbcTemplate.update("UPDATE invitacion_empleado SET estado = 'INVALIDADA', intentos_fallidos = 5 WHERE id = ?", bloqueada.getId());
            sincronizar();

            reloj.fijar(INICIO.plusDays(8));
            InvitacionEmpleadoResponseDTO reenviadaVencida = invitacionService.reenviar(activo(dueno), vencida.getId());
            InvitacionEmpleadoResponseDTO reenviadaBloqueada = invitacionService.reenviar(activo(dueno), bloqueada.getId());

            assertEquals("VENCIDA", estadoDe(vencida.getId()), "una pendiente pasada de fecha se materializa a VENCIDA, no a REEMPLAZADA");
            assertEquals("INVALIDADA", estadoDe(bloqueada.getId()), "REEMPLAZADA no pisa la causa original del código bloqueado");
            assertEquals(EstadoInvitacionEmpleado.PENDIENTE, reenviadaVencida.getEstado());
            assertEquals(EstadoInvitacionEmpleado.PENDIENTE, reenviadaBloqueada.getEstado());

            ConflictoDeNegocioException cerrada = assertThrows(ConflictoDeNegocioException.class,
                    () -> invitacionService.reenviar(activo(dueno), aCancelar.getId()));
            assertEquals("Esta invitación ya no se puede reenviar", cerrada.getMessage());
            for (Integer id : List.of(vencida.getId(), bloqueada.getId())) {
                ConflictoDeNegocioException yaReenviada = assertThrows(ConflictoDeNegocioException.class,
                        () -> invitacionService.reenviar(activo(dueno), id));
                assertEquals("Ya hay una invitación pendiente para ese email. Podés reenviarla.", yaReenviada.getMessage());
            }
        });
    }

    @Test
    void reenviarUnaInvalidadaConOtraPendienteVigenteDelMismoParDaConflicto() {
        enTransaccion(status -> {
            Dueno dueno = datos.registrarDuenoAprobado();
            sincronizar();
            String email = emailNuevo();
            InvitacionEmpleadoResponseDTO primera = invitacionService.invitar(activo(dueno), email);
            jdbcTemplate.update("UPDATE invitacion_empleado SET estado = 'INVALIDADA', intentos_fallidos = 5 WHERE id = ?", primera.getId());
            sincronizar();
            InvitacionEmpleadoResponseDTO vigente = invitacionService.invitar(activo(dueno), email);

            ConflictoDeNegocioException error = assertThrows(ConflictoDeNegocioException.class,
                    () -> invitacionService.reenviar(activo(dueno), primera.getId()));

            assertEquals("Ya hay una invitación pendiente para ese email. Podés reenviarla.", error.getMessage());
            assertEquals("INVALIDADA", estadoDe(primera.getId()));
            assertEquals("PENDIENTE", estadoDe(vigente.getId()));
        });
    }

    @Test
    void reenviarRevalidaLaCuentaYSiYaNoEstaActivaNoCreaNadaYAvisa() {
        enTransaccion(status -> {
            Dueno dueno = datos.registrarDuenoAprobado();
            int cuenta = datos.registrarCliente();
            sincronizar();
            String email = datos.emailDe(cuenta);
            InvitacionEmpleadoResponseDTO primera = invitacionService.invitar(activo(dueno), email);
            datos.cambiarEstadoUsuario(cuenta, "BLOQUEADO");
            sincronizar();

            InvitacionNoAptaException error = assertThrows(InvitacionNoAptaException.class,
                    () -> invitacionService.reenviar(activo(dueno), primera.getId()));

            assertEquals(MENSAJE_NO_SE_PUEDE_INVITAR, error.getMessage());
            assertEquals("PENDIENTE", estadoDe(primera.getId()), "la invitación vigente queda como estaba");
            assertEquals(1, invitaciones(dueno.comercioId()));
            assertEquals(1, emailsDeRegularizacion(cuenta));
        });
    }

    @Test
    void cancelarDejaLaInvitacionCancelada_RegistraHistorialYNoSePuedeRepetir() {
        enTransaccion(status -> {
            Dueno dueno = datos.registrarDuenoAprobado();
            sincronizar();
            String email = emailNuevo();
            InvitacionEmpleadoResponseDTO invitacion = invitacionService.invitar(activo(dueno), email);

            reloj.fijar(INICIO.plusMinutes(3));
            invitacionService.cancelar(activo(dueno), invitacion.getId());

            assertEquals("CANCELADA", estadoDe(invitacion.getId()));
            assertEquals(1, invitaciones(dueno.comercioId()), "no se borra nada");
            assertEquals(INICIO.plusMinutes(3), jdbcTemplate.queryForObject(
                    "SELECT fecha_resolucion FROM invitacion_empleado WHERE id = ?", LocalDateTime.class, invitacion.getId()));
            assertEquals(1, historial(dueno.comercioId(), "INVITACION_CANCELADA"));
            assertEquals(1, filas("SELECT COUNT(*) FROM historial_empleado_comercio WHERE invitacion_id = ? AND actor_usuario_id = ? "
                    + "AND motivo = 'INVITACION_CANCELADA'", invitacion.getId(), dueno.id()));

            ConflictoDeNegocioException error = assertThrows(ConflictoDeNegocioException.class,
                    () -> invitacionService.cancelar(activo(dueno), invitacion.getId()));
            assertEquals("Esta invitación ya no se puede cancelar", error.getMessage());

            assertEquals(EstadoInvitacionEmpleado.PENDIENTE, invitacionService.invitar(activo(dueno), email).getEstado(),
                    "cancelada libera el único pendiente del par");
        });
    }

    @Test
    void listarEquipoMuestraMiembrosPorFechaDeAltaEInvitacionesPendientesVencidasYConCodigoBloqueado() {
        enTransaccion(status -> {
            Dueno dueno = datos.registrarDuenoAprobado();
            Dueno otro = datos.registrarDuenoAprobado();
            int reciente = datos.registrarCliente();
            int antiguo = datos.registrarCliente();
            int ajeno = datos.registrarCliente();
            datos.vincularEmpleado(reciente, dueno.comercioId(), "ACTIVO", INICIO.minusDays(1));
            datos.vincularEmpleado(antiguo, dueno.comercioId(), "INACTIVO", INICIO.minusDays(30));
            datos.vincularEmpleado(ajeno, otro.comercioId(), "ACTIVO", INICIO.minusDays(2));
            sincronizar();

            InvitacionEmpleadoResponseDTO vencida = invitacionService.invitar(activo(dueno), emailNuevo());
            reloj.fijar(INICIO.plusMinutes(30));
            InvitacionEmpleadoResponseDTO bloqueada = invitacionService.invitar(activo(dueno), emailNuevo());
            reloj.fijar(INICIO.plusMinutes(60));
            InvitacionEmpleadoResponseDTO cancelada = invitacionService.invitar(activo(dueno), emailNuevo());
            reloj.fijar(INICIO.plusMinutes(90));
            InvitacionEmpleadoResponseDTO aceptada = invitacionService.invitar(activo(dueno), emailNuevo());
            reloj.fijar(INICIO.plusMinutes(120));
            InvitacionEmpleadoResponseDTO aReemplazar = invitacionService.invitar(activo(dueno), emailNuevo());
            invitacionService.cancelar(activo(dueno), cancelada.getId());
            reloj.fijar(INICIO.plusMinutes(150));
            InvitacionEmpleadoResponseDTO reemplazo = invitacionService.reenviar(activo(dueno), aReemplazar.getId());
            jdbcTemplate.update("UPDATE invitacion_empleado SET estado = 'INVALIDADA', intentos_fallidos = 5 WHERE id = ?", bloqueada.getId());
            jdbcTemplate.update("UPDATE invitacion_empleado SET estado = 'ACEPTADA' WHERE id = ?", aceptada.getId());
            sincronizar();
            reloj.fijar(INICIO.plusDays(3));
            InvitacionEmpleadoResponseDTO vigente = invitacionService.invitar(activo(dueno), emailNuevo());
            entityManager.flush();
            jdbcTemplate.update("UPDATE invitacion_empleado SET fecha_vencimiento = ? WHERE id = ?", INICIO.plusDays(3).minusMinutes(1), vencida.getId());
            sincronizar();

            EquipoComercioResponseDTO equipo = invitacionService.listarEquipo(activo(dueno));

            assertEquals(List.of(antiguo, reciente), equipo.getMiembros().stream().map(m -> m.getEmpleadoId()).toList(), "por fecha de alta");
            assertEquals(List.of(EstadoEmpleadoComercio.INACTIVO, EstadoEmpleadoComercio.ACTIVO),
                    equipo.getMiembros().stream().map(m -> m.getEstado()).toList());
            assertEquals(datos.emailDe(antiguo), equipo.getMiembros().get(0).getEmail());
            assertEquals("Equipo", equipo.getMiembros().get(0).getNombre());
            assertEquals("Prueba", equipo.getMiembros().get(0).getApellido());
            assertEquals(INICIO.minusDays(29), equipo.getMiembros().get(0).getFechaBaja());

            List<InvitacionEmpleadoResponseDTO> invitaciones = equipo.getInvitaciones();
            assertEquals(List.of(vigente.getId(), bloqueada.getId(), vencida.getId(), reemplazo.getId()).stream().sorted().toList(),
                    invitaciones.stream().map(InvitacionEmpleadoResponseDTO::getId).sorted().toList(),
                    "no aparecen las canceladas, reemplazadas ni aceptadas");
            assertEquals(EstadoInvitacionEmpleado.PENDIENTE, visible(invitaciones, vigente.getId()));
            assertEquals(EstadoInvitacionEmpleado.PENDIENTE, visible(invitaciones, reemplazo.getId()));
            assertEquals(EstadoInvitacionEmpleado.VENCIDA, visible(invitaciones, vencida.getId()));
            assertEquals(EstadoInvitacionEmpleado.INVALIDADA, visible(invitaciones, bloqueada.getId()));
            assertEquals(invitaciones.stream().map(InvitacionEmpleadoResponseDTO::getFechaCreacion).sorted(java.util.Comparator.reverseOrder()).toList(),
                    invitaciones.stream().map(InvitacionEmpleadoResponseDTO::getFechaCreacion).toList(), "las más nuevas primero");
        });
    }

    @Test
    void listarEquipoMuestraUnaSolaLineaPorEmailConSuInvitacionMasReciente() {
        enTransaccion(status -> {
            Dueno dueno = datos.registrarDuenoAprobado();
            sincronizar();
            String emailReinvitado = emailNuevo();
            String emailVencidaPorFecha = emailNuevo();
            String emailVencidaMaterializada = emailNuevo();
            String emailReenviado = emailNuevo();
            String emailCancelado = emailNuevo();
            InvitacionEmpleadoResponseDTO viejaReinvitada = invitacionService.invitar(activo(dueno), emailReinvitado);
            InvitacionEmpleadoResponseDTO vencidaPorFecha = invitacionService.invitar(activo(dueno), emailVencidaPorFecha);
            InvitacionEmpleadoResponseDTO vencidaMaterializada = invitacionService.invitar(activo(dueno), emailVencidaMaterializada);
            InvitacionEmpleadoResponseDTO bloqueadaOriginal = invitacionService.invitar(activo(dueno), emailReenviado);
            InvitacionEmpleadoResponseDTO cancelada = invitacionService.invitar(activo(dueno), emailCancelado);
            invitacionService.cancelar(activo(dueno), cancelada.getId());
            jdbcTemplate.update("UPDATE invitacion_empleado SET estado = 'INVALIDADA', intentos_fallidos = 5 WHERE id = ?", bloqueadaOriginal.getId());
            jdbcTemplate.update("UPDATE invitacion_empleado SET estado = 'VENCIDA', fecha_vencimiento = ? WHERE id = ?",
                    INICIO.minusMinutes(1), vencidaMaterializada.getId());
            jdbcTemplate.update("UPDATE invitacion_empleado SET fecha_vencimiento = ? WHERE id IN (?, ?)",
                    INICIO.minusMinutes(1), viejaReinvitada.getId(), vencidaPorFecha.getId());
            sincronizar();
            reloj.fijar(INICIO.plusMinutes(61));
            InvitacionEmpleadoResponseDTO nuevaReinvitada = invitacionService.invitar(activo(dueno), emailReinvitado);
            InvitacionEmpleadoResponseDTO nuevaReenviada = invitacionService.reenviar(activo(dueno), bloqueadaOriginal.getId());
            sincronizar();

            List<InvitacionEmpleadoResponseDTO> invitaciones = invitacionService.listarEquipo(activo(dueno)).getInvitaciones();

            assertEquals("VENCIDA", estadoDe(viejaReinvitada.getId()), "invitar de nuevo materializa la vencida");
            assertEquals("INVALIDADA", estadoDe(bloqueadaOriginal.getId()), "reenviar no pisa el código bloqueado");
            assertEquals(List.of(nuevaReenviada.getId(), nuevaReinvitada.getId(), vencidaMaterializada.getId(), vencidaPorFecha.getId()).stream().sorted().toList(),
                    invitaciones.stream().map(InvitacionEmpleadoResponseDTO::getId).sorted().toList(),
                    "una línea por email, y ninguna del email cancelado");
            assertEquals(EstadoInvitacionEmpleado.PENDIENTE, visible(invitaciones, nuevaReinvitada.getId()));
            assertEquals(EstadoInvitacionEmpleado.PENDIENTE, visible(invitaciones, nuevaReenviada.getId()));
            assertEquals(EstadoInvitacionEmpleado.VENCIDA, visible(invitaciones, vencidaMaterializada.getId()));
            assertEquals(EstadoInvitacionEmpleado.VENCIDA, visible(invitaciones, vencidaPorFecha.getId()),
                    "pendiente en la base con la fecha pasada: se ve como vencida");
            assertEquals("PENDIENTE", estadoDe(vencidaPorFecha.getId()), "listar no materializa nada");
        });
    }

    @Test
    void reenviarUnaVencidaYaMaterializadaNoCambiaSuEstado() {
        enTransaccion(status -> {
            Dueno dueno = datos.registrarDuenoAprobado();
            sincronizar();
            InvitacionEmpleadoResponseDTO vencida = invitacionService.invitar(activo(dueno), emailNuevo());
            jdbcTemplate.update("UPDATE invitacion_empleado SET estado = 'VENCIDA', fecha_vencimiento = ? WHERE id = ?",
                    INICIO.minusMinutes(1), vencida.getId());
            sincronizar();

            InvitacionEmpleadoResponseDTO nueva = invitacionService.reenviar(activo(dueno), vencida.getId());

            assertEquals("VENCIDA", estadoDe(vencida.getId()));
            assertEquals("PENDIENTE", estadoDe(nueva.getId()));
            assertEquals(1, pendientes(dueno.comercioId(), vencida.getEmail()));
        });
    }

    private static EstadoInvitacionEmpleado visible(List<InvitacionEmpleadoResponseDTO> invitaciones, int id) {
        return invitaciones.stream().filter(i -> i.getId() == id).findFirst().orElseThrow().getEstado();
    }

    @Test
    void lasFilasDeEmailNoApareceEnLaListaNiEnElContadorDeNotificacionesDelCliente() {
        enTransaccion(status -> {
            int cliente = datos.registrarCliente();
            sincronizar();
            AuthenticatedUser principal = new AuthenticatedUser(cliente, 1, RolUsuario.CLIENTE);
            notificacionService.crear(cliente, "Campana visible", TipoNotificacion.PEDIDO_ACEPTADO);
            notificacionService.registrarEmailEnviado(cliente, "Aviso por email", TipoNotificacion.INVITACION_EMPLEADO, INICIO);
            notificacionService.registrarEmailEnviado(cliente, "Otro aviso por email", TipoNotificacion.INVITACION_EMPLEADO, INICIO);
            sincronizar();

            List<NotificacionResponseDTO> lista = notificacionService.listar(principal, null);

            assertEquals(List.of("Campana visible"), lista.stream().map(NotificacionResponseDTO::getMensaje).toList());
            assertEquals(1, notificacionService.contarNoLeidas(principal, null));
            assertEquals(3, filas("SELECT COUNT(*) FROM notificacion WHERE usuario_id = ?", cliente), "las filas EMAIL existen, solo no se muestran");
        });
    }

    @Test
    void unaInsercionDuplicadaPorJdbcNoMarcaLaTransaccionComoSoloRollback() {
        enTransaccion(status -> {
            Dueno dueno = datos.registrarDuenoAprobado();
            Dueno otro = datos.registrarDuenoAprobado();
            String email = emailNuevo();
            insercionRepository.insertarPendiente(dueno.comercioId(), email, "111111", dueno.id(), INICIO, INICIO.plusDays(7));

            assertTrue(insercionRepository.existeCodigoPendiente(email, "111111"));
            assertFalse(insercionRepository.existeCodigoPendiente(email, "222222"));
            DuplicateKeyException porPar = assertThrows(DuplicateKeyException.class,
                    () -> insercionRepository.insertarPendiente(dueno.comercioId(), email, "222222", dueno.id(), INICIO, INICIO.plusDays(7)));
            assertTrue(porPar.getMessage().contains(InvitacionInsercionRepository.INDICE_PENDIENTE_POR_COMERCIO_Y_EMAIL));
            DuplicateKeyException porCodigo = assertThrows(DuplicateKeyException.class,
                    () -> insercionRepository.insertarPendiente(otro.comercioId(), email, "111111", otro.id(), INICIO, INICIO.plusDays(7)),
                    "el mismo email y código entre pendientes choca aunque sea otro comercio");
            assertTrue(porCodigo.getMessage().contains("uq_inv_pendiente_email_codigo"));

            assertFalse(status.isRollbackOnly());
            assertEquals(1, invitaciones(dueno.comercioId()), "la transacción sigue utilizable");
        });
    }

    @Test
    void dosInvitacionesSimultaneasAlMismoEmailDejanUnaSolaPendiente() throws Exception {
        reloj.volverAlReloj();
        Dueno dueno = datos.registrarDuenoAprobado();
        String email = emailNuevo();
        try {
            List<Object> resultados = enParalelo(List.of(
                    () -> invitacionService.invitar(activo(dueno), email),
                    () -> invitacionService.invitar(activo(dueno), email)));

            long exitos = resultados.stream().filter(r -> r instanceof InvitacionEmpleadoResponseDTO).count();
            long conflictos = resultados.stream().filter(r -> r instanceof ConflictoDeNegocioException).count();
            assertEquals(1, exitos, resultados.toString());
            assertEquals(1, conflictos, resultados.toString());
            assertEquals(1, pendientes(dueno.comercioId(), email));
            assertEquals(1, invitaciones(dueno.comercioId()));
            verify(emailService, times(1)).enviarInvitacionEmpleado(eq(email), anyString(), eq(dueno.nombreComercio()), anyString());
        } finally {
            borrarRastros(dueno);
        }
    }

    @Test
    void seisInvitacionesSimultaneasDelMismoDuenoAEmailsDistintosDejanExactamenteCinco() throws Exception {
        reloj.volverAlReloj();
        Dueno dueno = datos.registrarDuenoAprobado();
        try {
            List<Callable<Object>> tareas = new ArrayList<>();
            for (int i = 0; i < 6; i++) {
                String email = emailNuevo();
                tareas.add(() -> invitacionService.invitar(activo(dueno), email));
            }

            List<Object> resultados = enParalelo(tareas);

            assertEquals(5, resultados.stream().filter(r -> r instanceof InvitacionEmpleadoResponseDTO).count(), resultados.toString());
            assertEquals(1, resultados.stream().filter(r -> r instanceof ConflictoDeNegocioException).count(), resultados.toString());
            assertEquals(5, invitaciones(dueno.comercioId()));
        } finally {
            borrarRastros(dueno);
        }
    }

    @Test
    void laFilaDeRegularizacionSobrevivePorUnCommitRealAlConflictoYElEmailSaleDespuesDelCommit() {
        reloj.volverAlReloj();
        Dueno dueno = datos.registrarDuenoAprobado();
        int cuenta = datos.registrarCliente();
        datos.cambiarEstadoUsuario(cuenta, "BLOQUEADO");
        try {
            assertThrows(InvitacionNoAptaException.class, () -> invitacionService.invitar(activo(dueno), datos.emailDe(cuenta)));

            assertEquals(1, emailsDeRegularizacion(cuenta), "confirmada de verdad pese al 409");
            assertEquals(0, invitaciones(dueno.comercioId()));
            verify(emailService).enviarRegularizacionInvitacion(datos.emailDe(cuenta), MotivoRegularizacionInvitacion.BLOQUEADA, dueno.nombreComercio());
        } finally {
            borrarRastros(dueno);
            jdbcTemplate.update("DELETE FROM notificacion WHERE usuario_id = ?", cuenta);
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
        jdbcTemplate.update("DELETE FROM invitacion_empleado WHERE comercio_id = ?", dueno.comercioId());
        jdbcTemplate.update("DELETE FROM notificacion WHERE usuario_id = ?", dueno.id());
    }
}
