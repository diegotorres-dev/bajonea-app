package com.bajonea.backend.services;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.reset;
import static org.mockito.Mockito.when;

import com.bajonea.backend.config.security.AuthenticatedUser;
import com.bajonea.backend.enums.RolUsuario;
import com.bajonea.backend.exceptions.ConflictoDeNegocioException;
import com.bajonea.backend.services.DatosPruebaEmpleado.Cuenta;
import com.bajonea.backend.services.DatosPruebaEmpleado.Dueno;
import com.bajonea.backend.services.MercadoPagoReembolsoClient.ResultadoReembolsoMp;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Clock;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
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
 * Carreras del aviso T30 de autoconfirmación (E3, bloque A6) contra {@code bajonea_test}. El caso determinista pone
 * una desactivación (que toma la relación {@code FOR UPDATE}, como lo hará E4) en medio de la autoconfirmación: el
 * proceso tiene que esperarla y dejar afuera a quien quedó {@code INACTIVO}; si los destinatarios se resolvieran con
 * una lectura simple (sin bloquear la relación), el proceso no esperaría y el desactivado recibiría una copia. Los
 * demás casos corren el proceso varias veces a la vez, contra la confirmación del Cliente, y mezclados con altas y
 * bajas del equipo y lecturas y marcados de avisos: sin errores, sin interbloqueos, un solo juego de copias por
 * pedido autoconfirmado y ninguna por el confirmado a mano.
 */
@SpringBootTest
@ActiveProfiles("test")
class PedidoAutoconfirmadoConcurrenciaIntegrationTest {

    private static final String T30 = "PEDIDO_AUTOCONFIRMADO_COMERCIO";

    @Autowired
    private RegistroService registroService;

    @Autowired
    private PedidoService pedidoService;

    @Autowired
    private NotificacionService notificacionService;

    @Autowired
    private Clock clock;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private PlatformTransactionManager transactionManager;

    @MockitoBean
    private EmailService emailService;

    @MockitoBean
    private MercadoPagoReembolsoClient reembolsoClient;

    private DatosPruebaEmpleado datos;

    @BeforeEach
    void preparar() {
        datos = new DatosPruebaEmpleado(registroService, objectMapper, jdbcTemplate);
        reset(reembolsoClient);
        when(reembolsoClient.solicitarReembolsoTotal(anyString(), anyString(), anyString()))
                .thenReturn(ResultadoReembolsoMp.exito("refund-a6c"));
    }

    private Dueno duenoConComercio() {
        Dueno dueno = datos.registrarDuenoAprobado();
        datos.cambiarEstadoUsuario(dueno.id(), "ACTIVO");
        datos.cambiarEstadoComercio(dueno.comercioId(), "APTO_VENTA");
        return dueno;
    }

    private int pedidoEnCamino(int clienteId, Dueno dueno) {
        jdbcTemplate.update("INSERT INTO pedido (cliente_id, comercio_id, modalidad_entrega, estado, pago_estado, subtotal, "
                + "cargo_servicio_cliente, cargo_servicio_comercio, total, fecha_creacion) "
                + "VALUES (?, ?, 'DOMICILIO', 'EN_CAMINO', 'PAGADO', 10000, 200, 100, 10200, ?)",
                clienteId, dueno.comercioId(), LocalDateTime.now(clock).minusHours(6));
        int id = jdbcTemplate.queryForObject("SELECT LAST_INSERT_ID()", Integer.class);
        historial(id, "PENDIENTE_CONFIRMACION_COMERCIO", "SISTEMA", null, 300);
        historial(id, "EN_PREPARACION", "DUENO", dueno.id(), 200);
        historial(id, "EN_CAMINO", "DUENO", dueno.id(), 120);
        jdbcTemplate.update("INSERT INTO pago (pedido_id, monto, mp_estado, id_transaccion_mp, fecha_creacion, fecha_confirmacion) "
                + "VALUES (?, 10200, 'approved', ?, NOW(), NOW())", id, "a6c-" + id);
        return id;
    }

    private void historial(int pedidoId, String estado, String actorRol, Integer actorUsuarioId, long minutosAtras) {
        jdbcTemplate.update("INSERT INTO historial_estado_pedido (pedido_id, estado, actor_rol, actor_usuario_id, fecha_hora) VALUES (?, ?, ?, ?, ?)",
                pedidoId, estado, actorRol, actorUsuarioId, LocalDateTime.now(clock).minusMinutes(minutosAtras));
    }

    private int copias(int usuarioId, int pedidoId) {
        return jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM notificacion WHERE usuario_id = ? AND tipo = ? AND entidad_tipo = 'PEDIDO' AND entidad_id = ?",
                Integer.class, usuarioId, T30, pedidoId);
    }

    private int copiasDelPedido(int pedidoId) {
        return jdbcTemplate.queryForObject("SELECT COUNT(*) FROM notificacion WHERE tipo = ? AND entidad_tipo = 'PEDIDO' AND entidad_id = ?",
                Integer.class, T30, pedidoId);
    }

    private int avisosDeCliente(int pedidoId) {
        return jdbcTemplate.queryForObject("SELECT COUNT(*) FROM notificacion WHERE tipo = 'PEDIDO_AUTOCONFIRMADO' AND entidad_id = ?",
                Integer.class, pedidoId);
    }

    private String fuente(int pedidoId) {
        return jdbcTemplate.queryForObject("SELECT fuente_entrega FROM pedido WHERE id = ?", String.class, pedidoId);
    }

    private void correrProceso() {
        pedidoService.avisar75MinYAutoconfirmar(LocalDateTime.now(clock));
    }

    private static void esperar(CountDownLatch latch) {
        try {
            latch.await(15, TimeUnit.SECONDS);
        } catch (InterruptedException ex) {
            Thread.currentThread().interrupt();
        }
    }

    private static void pausa(long milisegundos) {
        try {
            Thread.sleep(milisegundos);
        } catch (InterruptedException ex) {
            Thread.currentThread().interrupt();
        }
    }

    private static Throwable atrapar(ThrowingRunnable tarea) {
        try {
            tarea.run();
            return null;
        } catch (Throwable ex) {
            return ex;
        }
    }

    @FunctionalInterface
    private interface ThrowingRunnable {
        void run() throws Exception;
    }

    @Test
    void siLaDesactivacionTomaLaRelacionAntesLaAutoconfirmacionLaEsperaYDejaAfueraAlDesactivado() throws Exception {
        for (int ronda = 0; ronda < 3; ronda++) {
            Dueno dueno = duenoConComercio();
            Cuenta desactivado = datos.registrarClienteConCredenciales();
            Cuenta quedaActivo = datos.registrarClienteConCredenciales();
            datos.vincularEmpleado(desactivado.id(), dueno.comercioId(), "ACTIVO", LocalDateTime.now(clock).minusDays(1));
            datos.vincularEmpleado(quedaActivo.id(), dueno.comercioId(), "ACTIVO", LocalDateTime.now(clock).minusDays(1));
            int comprador = datos.registrarCliente();
            int pedidoId = pedidoEnCamino(comprador, dueno);
            ExecutorService hilos = Executors.newFixedThreadPool(2);
            CountDownLatch relacionTomada = new CountDownLatch(1);
            CountDownLatch procesoLanzado = new CountDownLatch(1);
            try {
                Future<?> desactivacion = hilos.submit(() -> new TransactionTemplate(transactionManager).executeWithoutResult(status -> {
                    Integer relacionId = jdbcTemplate.queryForObject(
                            "SELECT id FROM empleado_comercio WHERE empleado_id = ? AND comercio_id = ? FOR UPDATE", Integer.class,
                            desactivado.id(), dueno.comercioId());
                    relacionTomada.countDown();
                    esperar(procesoLanzado);
                    pausa(900);
                    jdbcTemplate.update("UPDATE empleado_comercio SET estado = 'INACTIVO', fecha_baja = NOW() WHERE id = ?", relacionId);
                }));
                assertTrue(relacionTomada.await(15, TimeUnit.SECONDS));

                Future<?> proceso = hilos.submit(() -> {
                    procesoLanzado.countDown();
                    correrProceso();
                });

                desactivacion.get(60, TimeUnit.SECONDS);
                proceso.get(60, TimeUnit.SECONDS);
            } finally {
                hilos.shutdownNow();
            }

            assertEquals("SISTEMA", fuente(pedidoId), "ronda " + ronda);
            assertEquals(0, copias(desactivado.id(), pedidoId), "ronda " + ronda + ": quien quedó INACTIVO antes del hecho no recibe copia");
            assertEquals(1, copias(quedaActivo.id(), pedidoId), "ronda " + ronda);
            assertEquals(1, copias(dueno.id(), pedidoId), "ronda " + ronda);
            assertEquals(2, copiasDelPedido(pedidoId), "ronda " + ronda);
        }
    }

    @Test
    void elMismoProcesoDisparadoPorVariosHilosEmiteUnSoloJuegoDeCopias() throws Exception {
        Dueno dueno = duenoConComercio();
        List<Cuenta> equipo = new ArrayList<>();
        for (int i = 0; i < 3; i++) {
            Cuenta cuenta = datos.registrarClienteConCredenciales();
            datos.vincularEmpleado(cuenta.id(), dueno.comercioId(), "ACTIVO", LocalDateTime.now(clock).minusDays(1));
            equipo.add(cuenta);
        }
        int comprador = datos.registrarCliente();
        int pedidoId = pedidoEnCamino(comprador, dueno);
        int hilos = 6;
        ExecutorService pool = Executors.newFixedThreadPool(hilos);
        CyclicBarrier largada = new CyclicBarrier(hilos);
        List<Future<Throwable>> tareas = new ArrayList<>();
        for (int i = 0; i < hilos; i++) {
            tareas.add(pool.submit(() -> atrapar(() -> {
                largada.await(10, TimeUnit.SECONDS);
                correrProceso();
            })));
        }
        List<Throwable> fallos = new ArrayList<>();
        for (Future<Throwable> tarea : tareas) {
            Throwable resultado = tarea.get(120, TimeUnit.SECONDS);
            if (resultado != null) {
                fallos.add(resultado);
            }
        }
        pool.shutdownNow();

        assertTrue(fallos.isEmpty(), fallos.toString());
        assertEquals("SISTEMA", fuente(pedidoId));
        assertEquals(1, copias(dueno.id(), pedidoId));
        for (Cuenta cuenta : equipo) {
            assertEquals(1, copias(cuenta.id(), pedidoId));
        }
        assertEquals(4, copiasDelPedido(pedidoId));
        assertEquals(1, avisosDeCliente(pedidoId));
        assertEquals(1, jdbcTemplate.queryForObject("SELECT COUNT(*) FROM historial_estado_pedido WHERE pedido_id = ? AND estado = 'ENTREGADO'",
                Integer.class, pedidoId));
    }

    @Test
    void laAutoconfirmacionContraLaConfirmacionDelClienteEmiteElAvisoSoloSiGanaElSistema() throws Exception {
        int ganoElSistema = 0;
        int ganoElCliente = 0;
        for (int ronda = 0; ronda < 8; ronda++) {
            Dueno dueno = duenoConComercio();
            Cuenta empleado = datos.registrarClienteConCredenciales();
            datos.vincularEmpleado(empleado.id(), dueno.comercioId(), "ACTIVO", LocalDateTime.now(clock).minusDays(1));
            int comprador = datos.registrarCliente();
            int pedidoId = pedidoEnCamino(comprador, dueno);
            ExecutorService pool = Executors.newFixedThreadPool(2);
            CyclicBarrier largada = new CyclicBarrier(2);
            Future<Throwable> proceso = pool.submit(() -> atrapar(() -> {
                largada.await(10, TimeUnit.SECONDS);
                correrProceso();
            }));
            Future<Throwable> cliente = pool.submit(() -> atrapar(() -> {
                largada.await(10, TimeUnit.SECONDS);
                pedidoService.confirmarEntregaCliente(comprador, pedidoId);
            }));
            Throwable deProceso = proceso.get(60, TimeUnit.SECONDS);
            Throwable deCliente = cliente.get(60, TimeUnit.SECONDS);
            pool.shutdownNow();

            assertEquals(null, deProceso, "ronda " + ronda);
            if (fuente(pedidoId).equals("SISTEMA")) {
                ganoElSistema++;
                assertTrue(deCliente instanceof ConflictoDeNegocioException, "ronda " + ronda + ": " + deCliente);
                assertEquals(1, copias(dueno.id(), pedidoId), "ronda " + ronda);
                assertEquals(1, copias(empleado.id(), pedidoId), "ronda " + ronda);
                assertEquals(1, avisosDeCliente(pedidoId), "ronda " + ronda);
            } else {
                ganoElCliente++;
                assertEquals("CLIENTE", fuente(pedidoId), "ronda " + ronda);
                assertEquals(null, deCliente, "ronda " + ronda);
                assertEquals(0, copiasDelPedido(pedidoId), "ronda " + ronda + ": confirmó el Cliente, no hay aviso del equipo");
                assertEquals(0, avisosDeCliente(pedidoId), "ronda " + ronda);
            }
            assertEquals(1, jdbcTemplate.queryForObject("SELECT COUNT(*) FROM historial_estado_pedido WHERE pedido_id = ? AND estado = 'ENTREGADO'",
                    Integer.class, pedidoId), "ronda " + ronda);
        }
        assertEquals(8, ganoElSistema + ganoElCliente);
    }

    @Test
    void autoconfirmacionesAltasYBajasDelEquipoYLecturasConcurrentesNoDanErroresNiCopiasDuplicadas() throws Exception {
        for (int ronda = 0; ronda < 2; ronda++) {
            Dueno dueno = duenoConComercio();
            Cuenta fijo = datos.registrarClienteConCredenciales();
            Cuenta intermitente = datos.registrarClienteConCredenciales();
            datos.vincularEmpleado(fijo.id(), dueno.comercioId(), "ACTIVO", LocalDateTime.now(clock).minusDays(1));
            datos.vincularEmpleado(intermitente.id(), dueno.comercioId(), "ACTIVO", LocalDateTime.now(clock).minusDays(1));
            int comprador = datos.registrarCliente();
            List<Integer> pedidos = new ArrayList<>();
            for (int i = 0; i < 10; i++) {
                pedidos.add(pedidoEnCamino(comprador, dueno));
            }
            AuthenticatedUser comoFijo = new AuthenticatedUser(fijo.id(), 1, RolUsuario.CLIENTE);
            AuthenticatedUser comoDueno = new AuthenticatedUser(dueno.id(), 1, RolUsuario.DUENO);
            ExecutorService pool = Executors.newFixedThreadPool(10);
            AtomicBoolean seguir = new AtomicBoolean(true);
            List<Future<Throwable>> procesos = new ArrayList<>();
            List<Future<Throwable>> auxiliares = new ArrayList<>();
            CyclicBarrier largada = new CyclicBarrier(2 + 4);
            for (int i = 0; i < 2; i++) {
                procesos.add(pool.submit(() -> atrapar(() -> {
                    largada.await(10, TimeUnit.SECONDS);
                    correrProceso();
                })));
            }
            auxiliares.add(pool.submit(() -> atrapar(() -> {
                largada.await(10, TimeUnit.SECONDS);
                boolean activo = true;
                while (seguir.get()) {
                    String nuevo = activo ? "INACTIVO" : "ACTIVO";
                    new TransactionTemplate(transactionManager).executeWithoutResult(status -> {
                        Integer relacionId = jdbcTemplate.queryForObject(
                                "SELECT id FROM empleado_comercio WHERE empleado_id = ? AND comercio_id = ? FOR UPDATE", Integer.class,
                                intermitente.id(), dueno.comercioId());
                        jdbcTemplate.update("UPDATE empleado_comercio SET estado = ?, fecha_baja = NULL WHERE id = ?", nuevo, relacionId);
                    });
                    activo = !activo;
                    pausa(15);
                }
            })));
            for (AuthenticatedUser lector : new AuthenticatedUser[] {comoFijo, comoDueno}) {
                auxiliares.add(pool.submit(() -> atrapar(() -> {
                    largada.await(10, TimeUnit.SECONDS);
                    while (seguir.get()) {
                        notificacionService.listar(lector, String.valueOf(dueno.comercioId()));
                        notificacionService.contarNoLeidas(lector, String.valueOf(dueno.comercioId()));
                        notificacionService.marcarLeidasDelComercioActivo(lector, String.valueOf(dueno.comercioId()));
                        pausa(5);
                    }
                })));
            }
            auxiliares.add(pool.submit(() -> atrapar(() -> {
                largada.await(10, TimeUnit.SECONDS);
                while (seguir.get()) {
                    notificacionService.listar(comoFijo, null);
                    pausa(5);
                }
            })));

            List<Throwable> fallos = new ArrayList<>();
            for (Future<Throwable> tarea : procesos) {
                Throwable resultado = tarea.get(180, TimeUnit.SECONDS);
                if (resultado != null) {
                    fallos.add(resultado);
                }
            }
            seguir.set(false);
            for (Future<Throwable> tarea : auxiliares) {
                Throwable resultado = tarea.get(60, TimeUnit.SECONDS);
                if (resultado != null) {
                    fallos.add(resultado);
                }
            }
            pool.shutdownNow();

            assertTrue(fallos.isEmpty(), "ronda " + ronda + ": " + fallos);
            for (int pedidoId : pedidos) {
                assertEquals("SISTEMA", fuente(pedidoId), "ronda " + ronda + ", pedido " + pedidoId);
                assertEquals(1, copias(dueno.id(), pedidoId), "ronda " + ronda + " Dueño, pedido " + pedidoId);
                assertEquals(1, copias(fijo.id(), pedidoId), "ronda " + ronda + " fijo, pedido " + pedidoId);
                assertTrue(copias(intermitente.id(), pedidoId) <= 1, "ronda " + ronda + " intermitente, pedido " + pedidoId);
                assertEquals(0, copias(comprador, pedidoId));
                assertEquals(1, avisosDeCliente(pedidoId));
            }
        }
    }
}
