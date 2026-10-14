package com.bajonea.backend.services;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assertions.fail;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

import com.bajonea.backend.config.security.ComercioActivo;
import com.bajonea.backend.enums.EstadoComercio;
import com.bajonea.backend.enums.RolActorComercio;
import com.bajonea.backend.exceptions.ComercioNoDisponibleException;
import com.bajonea.backend.exceptions.ConflictoDeNegocioException;
import com.bajonea.backend.services.DatosPruebaEmpleado.Cuenta;
import com.bajonea.backend.services.DatosPruebaEmpleado.Dueno;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

/**
 * Cierre como {@code NO_RETIRADO} (bloque A4b de E3) contra {@code bajonea_test} con datos confirmados y varios hilos:
 * el Dueño y varios Empleados cerrando el mismo pedido, el cierre contra entregar, contra el proceso automático del
 * comercio suspendido, contra la suspensión y contra la desactivación de un Empleado. En todos los cruces hay una sola
 * transición, una sola fila de historial y un solo aviso T36, y nunca una nota de crédito ni un pedido de reembolso.
 */
@SpringBootTest
@ActiveProfiles("test")
class PedidoNoRetiradoConcurrenciaIntegrationTest {

    @Autowired
    private PedidoService pedidoService;

    @Autowired
    private RegistroService registroService;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private ObjectMapper objectMapper;

    @MockitoBean
    private EmailService emailService;

    @MockitoBean
    private MercadoPagoReembolsoClient reembolsoClient;

    private DatosPruebaEmpleado datos;

    private record Escenario(Dueno dueno, int clienteId, List<Integer> empleados) {

        ComercioActivo comercioDelDueno() {
            return ComercioActivo.delDueno(dueno.comercioId(), dueno.id(), EstadoComercio.APTO_VENTA);
        }

        ComercioActivo comercioDelEmpleado(int indice) {
            return new ComercioActivo(dueno.comercioId(), dueno.id(), empleados.get(indice), RolActorComercio.EMPLEADO,
                    EstadoComercio.APTO_VENTA);
        }
    }

    @BeforeEach
    void preparar() {
        datos = new DatosPruebaEmpleado(registroService, objectMapper, jdbcTemplate);
    }

    private Escenario escenario(int cantidadEmpleados) {
        Dueno dueno = datos.registrarDuenoAprobado();
        datos.cambiarEstadoComercio(dueno.comercioId(), "APTO_VENTA");
        int clienteId = datos.registrarCliente();
        List<Integer> empleados = new ArrayList<>();
        for (int i = 0; i < cantidadEmpleados; i++) {
            Cuenta cuenta = datos.registrarClienteConCredenciales();
            datos.vincularEmpleado(cuenta.id(), dueno.comercioId(), "ACTIVO", LocalDateTime.now().minusDays(1));
            empleados.add(cuenta.id());
        }
        return new Escenario(dueno, clienteId, empleados);
    }

    private int listoParaRetirar(Escenario e, int minutosListo) {
        jdbcTemplate.update("INSERT INTO pedido (cliente_id, comercio_id, modalidad_entrega, estado, pago_estado, subtotal, "
                + "cargo_servicio_cliente, cargo_servicio_comercio, total, fecha_creacion) "
                + "VALUES (?, ?, 'RETIRO', 'LISTO_PARA_RETIRAR', 'PAGADO', 10000, 200, 100, 10200, ?)",
                e.clienteId(), e.dueno().comercioId(), LocalDateTime.now().minusHours(6));
        int id = jdbcTemplate.queryForObject("SELECT LAST_INSERT_ID()", Integer.class);
        historial(id, "PENDIENTE_CONFIRMACION_COMERCIO", "SISTEMA", null, minutosListo + 200);
        historial(id, "EN_PREPARACION", "DUENO", e.dueno().id(), minutosListo + 100);
        historial(id, "LISTO_PARA_RETIRAR", "DUENO", e.dueno().id(), minutosListo);
        jdbcTemplate.update("INSERT INTO pago (pedido_id, monto, mp_estado, id_transaccion_mp, fecha_creacion, fecha_confirmacion) "
                + "VALUES (?, 10200, 'approved', ?, NOW(), NOW())", id, "nr-" + id);
        return id;
    }

    private void historial(int pedidoId, String estado, String actorRol, Integer actorUsuarioId, int minutosAtras) {
        jdbcTemplate.update("INSERT INTO historial_estado_pedido (pedido_id, estado, actor_rol, actor_usuario_id, fecha_hora) VALUES (?, ?, ?, ?, ?)",
                pedidoId, estado, actorRol, actorUsuarioId, LocalDateTime.now().minusMinutes(minutosAtras));
    }

    private String estado(int pedidoId) {
        return jdbcTemplate.queryForObject("SELECT estado FROM pedido WHERE id = ?", String.class, pedidoId);
    }

    private int filasDeHistorial(int pedidoId, String estado) {
        return jdbcTemplate.queryForObject("SELECT COUNT(*) FROM historial_estado_pedido WHERE pedido_id = ? AND estado = ?",
                Integer.class, pedidoId, estado);
    }

    private String ultimoDelHistorial(int pedidoId) {
        return jdbcTemplate.queryForObject("SELECT estado FROM historial_estado_pedido WHERE pedido_id = ? ORDER BY id DESC LIMIT 1",
                String.class, pedidoId);
    }

    private int avisosDelPedido(int pedidoId, String tipo) {
        return jdbcTemplate.queryForObject("SELECT COUNT(*) FROM notificacion WHERE entidad_tipo = 'PEDIDO' AND entidad_id = ? AND tipo = ?",
                Integer.class, pedidoId, tipo);
    }

    private int totalDeAvisos(int pedidoId) {
        return jdbcTemplate.queryForObject("SELECT COUNT(*) FROM notificacion WHERE entidad_tipo = 'PEDIDO' AND entidad_id = ?",
                Integer.class, pedidoId);
    }

    private int notas(int pedidoId) {
        return jdbcTemplate.queryForObject("SELECT COUNT(*) FROM nota_credito n JOIN pago p ON p.id = n.pago_id WHERE p.pedido_id = ?",
                Integer.class, pedidoId);
    }

    private List<Object> correrAlMismoTiempo(List<Callable<Object>> tareas) {
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
                resultados.add(futuro.get(60, TimeUnit.SECONDS));
            }
            return resultados;
        } catch (Exception e) {
            throw new IllegalStateException(e);
        } finally {
            pool.shutdownNow();
        }
    }

    private static boolean esConflicto(Object resultado) {
        return resultado instanceof ConflictoDeNegocioException;
    }

    private static void sinErroresInesperados(List<Object> resultados) {
        for (Object resultado : resultados) {
            if (resultado instanceof Exception && !esConflicto(resultado) && !(resultado instanceof ComercioNoDisponibleException)) {
                fail("Error inesperado (no es un 409 ni un 404): " + resultado);
            }
        }
    }

    private static long exitos(List<Object> resultados) {
        return resultados.stream().filter(r -> !(r instanceof Exception)).count();
    }

    private void unaSolaTransicionSinReembolso(int pedidoId, String estadoFinal) {
        assertEquals(estadoFinal, estado(pedidoId));
        assertEquals(estadoFinal, ultimoDelHistorial(pedidoId));
        assertEquals(1, filasDeHistorial(pedidoId, estadoFinal));
        assertEquals(0, notas(pedidoId));
    }

    @Test
    void elDuenoYTresEmpleadosCerrandoElMismoPedidoDejanUnSoloGanadorUnSoloHistorialYUnSoloAviso() {
        for (int ronda = 0; ronda < 6; ronda++) {
            Escenario e = escenario(3);
            int pedidoId = listoParaRetirar(e, 90);

            List<Object> resultados = correrAlMismoTiempo(List.of(
                    () -> pedidoService.cerrarComoNoRetirado(e.comercioDelDueno(), pedidoId),
                    () -> pedidoService.cerrarComoNoRetirado(e.comercioDelEmpleado(0), pedidoId),
                    () -> pedidoService.cerrarComoNoRetirado(e.comercioDelEmpleado(1), pedidoId),
                    () -> pedidoService.cerrarComoNoRetirado(e.comercioDelEmpleado(2), pedidoId)));

            sinErroresInesperados(resultados);
            assertEquals(1, exitos(resultados), "un solo ganador, ronda " + ronda);
            assertEquals(3, resultados.stream().filter(PedidoNoRetiradoConcurrenciaIntegrationTest::esConflicto).count());
            unaSolaTransicionSinReembolso(pedidoId, "NO_RETIRADO");
            assertEquals(1, avisosDelPedido(pedidoId, "PEDIDO_NO_RETIRADO"));
            assertEquals(1, totalDeAvisos(pedidoId), "solo el aviso al Cliente, sin copias al equipo");
        }
    }

    @Test
    void cerrarContraEntregarDejaUnSoloGanadorYElAvisoSoloSiGanoElCierre() {
        for (int ronda = 0; ronda < 8; ronda++) {
            Escenario e = escenario(2);
            int pedidoId = listoParaRetirar(e, 90);

            List<Object> resultados = correrAlMismoTiempo(List.of(
                    () -> pedidoService.cerrarComoNoRetirado(e.comercioDelDueno(), pedidoId),
                    () -> pedidoService.confirmarEntregaComercio(e.comercioDelEmpleado(0), pedidoId),
                    () -> pedidoService.cerrarComoNoRetirado(e.comercioDelEmpleado(1), pedidoId),
                    () -> pedidoService.confirmarEntregaComercio(e.comercioDelDueno(), pedidoId)));

            sinErroresInesperados(resultados);
            assertEquals(1, exitos(resultados), "un solo ganador, ronda " + ronda);
            String estadoFinal = estado(pedidoId);
            assertTrue(estadoFinal.equals("NO_RETIRADO") || estadoFinal.equals("ENTREGADO"), estadoFinal);
            unaSolaTransicionSinReembolso(pedidoId, estadoFinal);
            int esperados = estadoFinal.equals("NO_RETIRADO") ? 1 : 0;
            assertEquals(esperados, avisosDelPedido(pedidoId, "PEDIDO_NO_RETIRADO"));
            assertEquals(esperados, totalDeAvisos(pedidoId));
        }
    }

    @Test
    void cerrarContraElProcesoAutomaticoDelComercioSuspendidoDejaUnaSolaTransicionYUnSoloAviso() {
        for (int ronda = 0; ronda < 8; ronda++) {
            Escenario e = escenario(1);
            int pedidoId = listoParaRetirar(e, 90);
            jdbcTemplate.update("UPDATE pedido SET suspension_retiro_expira = ? WHERE id = ?", LocalDateTime.now().minusMinutes(5), pedidoId);

            List<Object> resultados = correrAlMismoTiempo(List.of(
                    () -> {
                        pedidoService.autoconfirmarRetirosPorSuspension(LocalDateTime.now());
                        return "job";
                    },
                    () -> pedidoService.cerrarComoNoRetirado(e.comercioDelEmpleado(0), pedidoId),
                    () -> pedidoService.cerrarComoNoRetirado(e.comercioDelDueno(), pedidoId)));

            sinErroresInesperados(resultados);
            unaSolaTransicionSinReembolso(pedidoId, "NO_RETIRADO");
            assertEquals(1, avisosDelPedido(pedidoId, "PEDIDO_NO_RETIRADO"));
            assertEquals(1, totalDeAvisos(pedidoId));
            assertEquals(0, avisosDelPedido(pedidoId, "PEDIDO_CERRADO_TIMER_SUSPENSION"));
            String actor = jdbcTemplate.queryForObject(
                    "SELECT actor_rol FROM historial_estado_pedido WHERE pedido_id = ? AND estado = 'NO_RETIRADO'", String.class, pedidoId);
            String motivo = jdbcTemplate.queryForObject(
                    "SELECT motivo_timeout FROM historial_estado_pedido WHERE pedido_id = ? AND estado = 'NO_RETIRADO'", String.class, pedidoId);
            assertEquals(actor.equals("SISTEMA"), "TIMEOUT_RETIRO_SUSPENSION".equals(motivo));
        }
    }

    @Test
    void cerrarContraLaSuspensionDelComercioNoDejaMasDeUnaTransicion() {
        for (int ronda = 0; ronda < 8; ronda++) {
            Escenario e = escenario(1);
            int pedidoId = listoParaRetirar(e, 90);

            List<Object> resultados = correrAlMismoTiempo(List.of(
                    () -> pedidoService.cerrarComoNoRetirado(e.comercioDelEmpleado(0), pedidoId),
                    () -> {
                        pedidoService.cancelarPedidosPorSuspensionComercio(e.dueno().comercioId());
                        return "suspension";
                    }));

            sinErroresInesperados(resultados);
            String estadoFinal = estado(pedidoId);
            if (!(resultados.get(0) instanceof Exception)) {
                unaSolaTransicionSinReembolso(pedidoId, "NO_RETIRADO");
                assertEquals(1, avisosDelPedido(pedidoId, "PEDIDO_NO_RETIRADO"));
            } else {
                assertEquals("LISTO_PARA_RETIRAR", estadoFinal);
                assertEquals(0, filasDeHistorial(pedidoId, "NO_RETIRADO"));
                assertEquals(0, totalDeAvisos(pedidoId));
            }
            assertEquals(0, notas(pedidoId));
        }
    }

    @Test
    void cerrarContraLaDesactivacionDelEmpleadoOCierraYDejaTodoCoherenteOResponde404SinCambiarNada() {
        for (int ronda = 0; ronda < 10; ronda++) {
            Escenario e = escenario(1);
            int pedidoId = listoParaRetirar(e, 90);
            int empleado = e.empleados().get(0);

            List<Object> resultados = correrAlMismoTiempo(List.of(
                    () -> pedidoService.cerrarComoNoRetirado(e.comercioDelEmpleado(0), pedidoId),
                    () -> {
                        jdbcTemplate.update("UPDATE empleado_comercio SET estado = 'INACTIVO', fecha_baja = NOW() "
                                + "WHERE empleado_id = ? AND comercio_id = ?", empleado, e.dueno().comercioId());
                        return "desactivado";
                    }));

            sinErroresInesperados(resultados);
            if (resultados.get(0) instanceof Exception) {
                assertTrue(resultados.get(0) instanceof ComercioNoDisponibleException, resultados.get(0).toString());
                assertEquals("LISTO_PARA_RETIRAR", estado(pedidoId));
                assertEquals(0, filasDeHistorial(pedidoId, "NO_RETIRADO"));
                assertEquals(0, totalDeAvisos(pedidoId));
            } else {
                unaSolaTransicionSinReembolso(pedidoId, "NO_RETIRADO");
                assertEquals(1, avisosDelPedido(pedidoId, "PEDIDO_NO_RETIRADO"));
            }
        }
    }

    @Test
    void elCierreNuncaLlamaAMercadoPago() {
        Escenario e = escenario(0);
        int pedidoId = listoParaRetirar(e, 90);

        pedidoService.cerrarComoNoRetirado(e.comercioDelDueno(), pedidoId);

        verify(reembolsoClient, never()).solicitarReembolsoTotal(org.mockito.ArgumentMatchers.anyString(),
                org.mockito.ArgumentMatchers.anyString(), org.mockito.ArgumentMatchers.anyString());
        assertEquals(0, notas(pedidoId));
        assertEquals("NO_RETIRADO", estado(pedidoId));
    }
}
