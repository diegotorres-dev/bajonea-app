package com.bajonea.backend.services;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.bajonea.backend.config.security.ComercioActivo;
import com.bajonea.backend.dto.request.AceptarInvitacionEmpleadoRequestDTO;
import com.bajonea.backend.dto.response.EquipoComercioResponseDTO;
import com.bajonea.backend.dto.response.InvitacionEmpleadoResponseDTO;
import com.bajonea.backend.enums.EstadoInvitacionEmpleado;
import com.bajonea.backend.exceptions.CodigoInvitacionInvalidoException;
import com.bajonea.backend.exceptions.ConflictoDeNegocioException;
import com.bajonea.backend.services.DatosPruebaEmpleado.Dueno;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.persistence.EntityManager;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.function.Consumer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionStatus;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Vencimiento automático de invitaciones de empleado y cancelación ampliada contra {@code bajonea_test}, con
 * reloj controlable y el {@code EmailService} reemplazado por un mock. En el perfil {@code test} el proceso
 * programado está apagado ({@code invitacion.vencimiento.job-habilitado=false}): cada prueba lo invoca a pedido.
 * Las de concurrencia confirman de verdad, con datos únicos que limpian al terminar.
 */
@SpringBootTest
@ActiveProfiles("test")
@Import(ConfiguracionRelojDePrueba.class)
class InvitacionVencimientoIntegrationTest {

    private static final LocalDateTime INICIO = LocalDateTime.of(2026, 10, 6, 12, 0, 0);

    @Autowired
    private InvitacionEmpleadoService invitacionService;

    @Autowired
    private InvitacionVencimientoJob vencimientoJob;

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

    private String estadoDe(int invitacionId) {
        volcar();
        return jdbcTemplate.queryForObject("SELECT estado FROM invitacion_empleado WHERE id = ?", String.class, invitacionId);
    }

    private LocalDateTime resolucionDe(int invitacionId) {
        volcar();
        return jdbcTemplate.queryForObject("SELECT fecha_resolucion FROM invitacion_empleado WHERE id = ?", LocalDateTime.class, invitacionId);
    }

    private LocalDateTime vencimientoDe(int invitacionId) {
        volcar();
        return jdbcTemplate.queryForObject("SELECT fecha_vencimiento FROM invitacion_empleado WHERE id = ?", LocalDateTime.class, invitacionId);
    }

    private String codigoDe(int invitacionId) {
        volcar();
        return jdbcTemplate.queryForObject("SELECT codigo FROM invitacion_empleado WHERE id = ?", String.class, invitacionId);
    }

    private int historial(int comercioId) {
        return filas("SELECT COUNT(*) FROM historial_empleado_comercio WHERE comercio_id = ?", comercioId);
    }

    private ComercioActivo activo(Dueno dueno) {
        return new ComercioActivo(dueno.comercioId(), dueno.id());
    }

    private static String emailNuevo() {
        return "invitado." + DatosPruebaEmpleado.sufijo() + "@bajonea.test";
    }

    private int invitar(Dueno dueno, String email) {
        return invitacionService.invitar(activo(dueno), email).getId();
    }

    private void fijarVencimiento(int invitacionId, LocalDateTime vencimiento) {
        jdbcTemplate.update("UPDATE invitacion_empleado SET fecha_vencimiento = ? WHERE id = ?", vencimiento, invitacionId);
    }

    private AceptarInvitacionEmpleadoRequestDTO aceptarRequest(String email, String codigo) {
        AceptarInvitacionEmpleadoRequestDTO request = new AceptarInvitacionEmpleadoRequestDTO();
        request.setEmail(email);
        request.setCodigo(codigo);
        return request;
    }

    @Test
    void elProcesoVenceSoloLasPendientesCumplidas_FechaDeResolucionIgualAlVencimiento_SinHistorialNiAvisos() {
        enTransaccion(status -> {
            Dueno dueno = datos.registrarDuenoAprobado();
            sincronizar();
            int vencida = invitar(dueno, emailNuevo());
            int vigente = invitar(dueno, emailNuevo());
            int cancelada = invitar(dueno, emailNuevo());
            invitacionService.cancelar(activo(dueno), cancelada);
            int bloqueada = invitar(dueno, emailNuevo());
            jdbcTemplate.update("UPDATE invitacion_empleado SET estado = 'INVALIDADA', intentos_fallidos = 5 WHERE id = ?", bloqueada);
            sincronizar();
            fijarVencimiento(vencida, INICIO.plusDays(1));
            fijarVencimiento(cancelada, INICIO.plusDays(1));
            fijarVencimiento(bloqueada, INICIO.plusDays(1));
            int historialAntes = historial(dueno.comercioId());
            int avisosAntes = filas("SELECT COUNT(*) FROM notificacion WHERE usuario_id = ?", dueno.id());
            LocalDateTime resolucionCancelada = resolucionDe(cancelada);

            int pasadas = vencimientoJob.vencerInvitaciones(INICIO.plusDays(2));

            assertTrue(pasadas >= 1);
            assertEquals("VENCIDA", estadoDe(vencida));
            assertEquals(INICIO.plusDays(1), resolucionDe(vencida), "fecha_resolucion = fecha_vencimiento");
            assertEquals("PENDIENTE", estadoDe(vigente), "la vigente no se toca");
            assertEquals("CANCELADA", estadoDe(cancelada));
            assertEquals(resolucionCancelada, resolucionDe(cancelada));
            assertEquals("INVALIDADA", estadoDe(bloqueada), "el código bloqueado conserva su estado");
            assertEquals(historialAntes, historial(dueno.comercioId()), "vencer no escribe historial");
            assertEquals(avisosAntes, filas("SELECT COUNT(*) FROM notificacion WHERE usuario_id = ?", dueno.id()), "ni avisos");
        });
    }

    @Test
    void elBordeEsInclusivo_VenceEnElInstanteExactoYNoUnSegundoAntes() {
        enTransaccion(status -> {
            Dueno dueno = datos.registrarDuenoAprobado();
            sincronizar();
            int exacta = invitar(dueno, emailNuevo());
            int unSegundoDespues = invitar(dueno, emailNuevo());
            LocalDateTime corte = INICIO.plusHours(5);
            fijarVencimiento(exacta, corte);
            fijarVencimiento(unSegundoDespues, corte.plusSeconds(1));

            vencimientoJob.vencerInvitaciones(corte);

            assertEquals("VENCIDA", estadoDe(exacta), "fecha_vencimiento <= ahora es vencida, igual que isAfter en el servicio");
            assertEquals("PENDIENTE", estadoDe(unSegundoDespues));
        });
    }

    @Test
    void elProcesoEsIdempotente_LaSegundaCorridaNoCambiaNada() {
        enTransaccion(status -> {
            Dueno dueno = datos.registrarDuenoAprobado();
            sincronizar();
            int invitacion = invitar(dueno, emailNuevo());
            fijarVencimiento(invitacion, INICIO.plusHours(1));
            LocalDateTime ahora = INICIO.plusHours(2);

            assertTrue(vencimientoJob.vencerInvitaciones(ahora) >= 1);
            LocalDateTime resolucion = resolucionDe(invitacion);
            assertEquals(INICIO.plusHours(1), resolucion);

            assertEquals(0, vencimientoJob.vencerInvitaciones(ahora.plusHours(3)), "ya no queda nada por pasar");
            assertEquals("VENCIDA", estadoDe(invitacion));
            assertEquals(resolucion, resolucionDe(invitacion), "la resolución no se vuelve a escribir");
        });
    }

    @Test
    void unaVencidaPorElProcesoSeListaComoVencidaSePuedeReenviarYLiberaElPar() {
        enTransaccion(status -> {
            Dueno dueno = datos.registrarDuenoAprobado();
            sincronizar();
            String email = emailNuevo();
            InvitacionEmpleadoResponseDTO original = invitacionService.invitar(activo(dueno), email);
            fijarVencimiento(original.getId(), INICIO.plusHours(1));
            sincronizar();
            vencimientoJob.vencerInvitaciones(INICIO.plusHours(2));
            reloj.fijar(INICIO.plusHours(2));

            EquipoComercioResponseDTO equipo = invitacionService.listarEquipo(activo(dueno));
            assertEquals(1, equipo.getInvitaciones().size());
            assertEquals(EstadoInvitacionEmpleado.VENCIDA, equipo.getInvitaciones().get(0).getEstado());

            InvitacionEmpleadoResponseDTO reenviada = invitacionService.reenviar(activo(dueno), original.getId());
            assertEquals(EstadoInvitacionEmpleado.PENDIENTE, reenviada.getEstado());
            assertEquals("VENCIDA", estadoDe(original.getId()), "la vencida conserva su estado");
        });
    }

    @Test
    void aceptarSobreUnaInvitacionQueElProcesoYaVencioDaElMismoCodigoInvalido() {
        enTransaccion(status -> {
            Dueno dueno = datos.registrarDuenoAprobado();
            sincronizar();
            String email = emailNuevo();
            int invitacion = invitar(dueno, email);
            String codigo = codigoDe(invitacion);
            fijarVencimiento(invitacion, INICIO.plusHours(1));
            vencimientoJob.vencerInvitaciones(INICIO.plusHours(2));
            reloj.fijar(INICIO.plusHours(2));

            assertThrows(CodigoInvitacionInvalidoException.class, () -> invitacionService.aceptar(aceptarRequest(email, codigo)));
            assertEquals("VENCIDA", estadoDe(invitacion));
        });
    }

    @Test
    void cancelarAceptaPendienteVencidaYConCodigoBloqueadoYDejaCanceladaConHistorial() {
        enTransaccion(status -> {
            Dueno dueno = datos.registrarDuenoAprobado();
            sincronizar();
            int pendiente = invitar(dueno, emailNuevo());
            int vencida = invitar(dueno, emailNuevo());
            int bloqueada = invitar(dueno, emailNuevo());
            int pendientePasadaDeFecha = invitar(dueno, emailNuevo());
            jdbcTemplate.update("UPDATE invitacion_empleado SET estado = 'VENCIDA' WHERE id = ?", vencida);
            jdbcTemplate.update("UPDATE invitacion_empleado SET estado = 'INVALIDADA', intentos_fallidos = 5 WHERE id = ?", bloqueada);
            fijarVencimiento(pendientePasadaDeFecha, INICIO.minusMinutes(1));
            sincronizar();
            reloj.fijar(INICIO.plusMinutes(7));

            for (int id : List.of(pendiente, vencida, bloqueada, pendientePasadaDeFecha)) {
                InvitacionEmpleadoResponseDTO cancelada = invitacionService.cancelar(activo(dueno), id);
                assertEquals(EstadoInvitacionEmpleado.CANCELADA, cancelada.getEstado());
                assertEquals("CANCELADA", estadoDe(id));
                assertEquals(INICIO.plusMinutes(7), resolucionDe(id));
                assertEquals(1, filas("SELECT COUNT(*) FROM historial_empleado_comercio WHERE invitacion_id = ? AND actor_usuario_id = ? "
                        + "AND motivo = 'INVITACION_CANCELADA'", id, dueno.id()));
            }
            assertEquals(0, invitacionService.listarEquipo(activo(dueno)).getInvitaciones().size(), "canceladas no se listan");
        });
    }

    @Test
    void cancelarSigueRechazandoAceptadaCanceladaYReemplazada() {
        enTransaccion(status -> {
            Dueno dueno = datos.registrarDuenoAprobado();
            sincronizar();
            for (String estado : List.of("ACEPTADA", "CANCELADA", "REEMPLAZADA")) {
                int id = invitar(dueno, emailNuevo());
                jdbcTemplate.update("UPDATE invitacion_empleado SET estado = ? WHERE id = ?", estado, id);
                sincronizar();

                ConflictoDeNegocioException error = assertThrows(ConflictoDeNegocioException.class,
                        () -> invitacionService.cancelar(activo(dueno), id));
                assertEquals("Esta invitación ya no se puede cancelar", error.getMessage());
                assertEquals(estado, estadoDe(id));
            }
        });
    }

    @Test
    void elProcesoYAceptarEnElBordeDeLaVigenciaDejanSiempreUnEstadoCoherente() throws Exception {
        reloj.fijar(INICIO);
        for (int ronda = 1; ronda <= 12; ronda++) {
            Dueno dueno = datos.registrarDuenoAprobado();
            int cuenta = datos.registrarCliente();
            String email = datos.emailDe(cuenta);
            try {
                int invitacion = invitar(dueno, email);
                String codigo = codigoDe(invitacion);
                fijarVencimiento(invitacion, INICIO.plusMinutes(30));

                List<Object> resultados = enParalelo(List.of(
                        () -> invitacionService.aceptar(aceptarRequest(email, codigo)),
                        () -> vencimientoJob.vencerInvitaciones(INICIO.plusHours(1))));

                Object aceptar = resultados.get(0);
                Object job = resultados.get(1);
                assertTrue(job instanceof Integer, "ronda " + ronda + ": el proceso no puede fallar: " + job);
                String estado = estadoDe(invitacion);
                int relaciones = filas("SELECT COUNT(*) FROM empleado_comercio WHERE comercio_id = ?", dueno.comercioId());
                if ("ACEPTADA".equals(estado)) {
                    assertTrue(!(aceptar instanceof Exception), "ronda " + ronda + ": " + aceptar);
                    assertEquals(1, relaciones, "ronda " + ronda);
                } else {
                    assertEquals("VENCIDA", estado, "ronda " + ronda);
                    assertTrue(aceptar instanceof CodigoInvitacionInvalidoException, "ronda " + ronda + ": " + aceptar);
                    assertEquals(0, relaciones, "ronda " + ronda);
                }
            } finally {
                borrarRastros(dueno);
            }
        }
    }

    @Test
    void elProcesoCorreAlMismoTiempoQueInvitarReenviarYCancelarSinInterbloqueos() throws Exception {
        reloj.fijar(INICIO);
        for (int ronda = 1; ronda <= 8; ronda++) {
            Dueno dueno = datos.registrarDuenoAprobado();
            String emailReenviar = emailNuevo();
            String emailCancelar = emailNuevo();
            try {
                int paraReenviar = invitar(dueno, emailReenviar);
                int paraCancelar = invitar(dueno, emailCancelar);
                fijarVencimiento(paraReenviar, INICIO.plusMinutes(30));
                fijarVencimiento(paraCancelar, INICIO.plusMinutes(30));
                String emailNuevo = emailNuevo();

                List<Callable<Object>> tareas = new ArrayList<>();
                tareas.add(() -> vencimientoJob.vencerInvitaciones(INICIO.plusHours(1)));
                tareas.add(() -> vencimientoJob.vencerInvitaciones(INICIO.plusHours(1)));
                tareas.add(() -> invitacionService.reenviar(activo(dueno), paraReenviar));
                tareas.add(() -> invitacionService.cancelar(activo(dueno), paraCancelar));
                tareas.add(() -> invitacionService.invitar(activo(dueno), emailNuevo));
                List<Object> resultados = enParalelo(tareas);

                assertTrue(resultados.get(0) instanceof Integer, "ronda " + ronda + ": " + resultados.get(0));
                assertTrue(resultados.get(1) instanceof Integer, "ronda " + ronda + ": " + resultados.get(1));
                for (int i = 2; i < resultados.size(); i++) {
                    Object resultado = resultados.get(i);
                    assertTrue(resultado instanceof InvitacionEmpleadoResponseDTO || resultado instanceof ConflictoDeNegocioException,
                            "ronda " + ronda + ": " + resultado);
                }
                assertEquals("CANCELADA", estadoDe(paraCancelar), "ronda " + ronda + ": cancelar siempre gana o ve la vencida");
                assertTrue(filas("SELECT COUNT(*) FROM invitacion_empleado WHERE comercio_id = ? AND email = ? AND estado = 'PENDIENTE'",
                        dueno.comercioId(), emailReenviar) <= 1, "ronda " + ronda);
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
