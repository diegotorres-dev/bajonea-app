package com.bajonea.backend.services;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.bajonea.backend.config.security.ComercioActivo;
import com.bajonea.backend.dto.request.HorarioRequestDTO;
import com.bajonea.backend.enums.DiaSemana;
import com.bajonea.backend.enums.EstadoComercio;
import com.bajonea.backend.services.DatosPruebaEmpleado.Dueno;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import org.junit.jupiter.api.Test;

/**
 * Pagos simultáneos contra la edición de los horarios y contra el proceso de asignación de turnos a pedidos
 * anteriores, con hilos y datos confirmados de verdad: todos los pedidos quedan estampados con el turno de la fila
 * original, sin errores de bloqueo, y el proceso no pisa un estampado.
 */
class TurnoEstampadoConcurrenciaIntegrationTest extends TurnoIntegrationBase {

    private static final int PAGOS = 12;

    @Test
    void losPagosSimultaneosContraLaEdicionDeHorariosYElBackfillQuedanTodosEstampados() throws Exception {
        Dueno dueno = comercioSinHorarios();
        int turno = horario(dueno.comercioId(), hoy(), "00:00", "23:59");
        List<Integer> pedidos = new ArrayList<>();
        for (int i = 0; i < PAGOS; i++) {
            pedidos.add(pedidoPendiente(dueno));
        }
        ComercioActivo actor = ComercioActivo.delDueno(dueno.comercioId(), dueno.id(), EstadoComercio.APTO_VENTA);
        LocalDate otroDia = hoy().plusDays(3);
        List<HorarioRequestDTO> version = List.of(new HorarioRequestDTO(diaDe(otroDia), LocalTime.of(10, 0), LocalTime.of(18, 0)));
        List<HorarioRequestDTO> lasDeHoy = List.of(new HorarioRequestDTO(diaDe(hoy()), LocalTime.of(0, 0), LocalTime.of(23, 59)));

        ExecutorService pool = Executors.newFixedThreadPool(PAGOS + 2);
        CountDownLatch salida = new CountDownLatch(1);
        AtomicBoolean pagosTerminados = new AtomicBoolean(false);
        List<Future<Throwable>> resultados = new ArrayList<>();
        for (Integer pedidoId : pedidos) {
            resultados.add(pool.submit(() -> {
                salida.await();
                try {
                    pedidoService.confirmarPagoAprobado(pedidoId);
                    return null;
                } catch (Throwable e) {
                    return e;
                }
            }));
        }
        Future<Throwable> edicion = pool.submit(() -> {
            salida.await();
            try {
                int vuelta = 0;
                while (!pagosTerminados.get() && vuelta < 60) {
                    horarioEdicionService.editarHorarios(actor, vuelta % 2 == 0 ? version : lasDeHoy);
                    vuelta++;
                }
                return null;
            } catch (Throwable e) {
                return e;
            }
        });
        Future<Throwable> backfill = pool.submit(() -> {
            salida.await();
            try {
                while (!pagosTerminados.get()) {
                    turnoBackfillService.ejecutar();
                }
                return null;
            } catch (Throwable e) {
                return e;
            }
        });

        salida.countDown();
        for (Future<Throwable> resultado : resultados) {
            Throwable error = resultado.get(120, TimeUnit.SECONDS);
            assertEquals(null, error, () -> "un pago falló: " + error);
        }
        pagosTerminados.set(true);
        assertEquals(null, edicion.get(120, TimeUnit.SECONDS));
        assertEquals(null, backfill.get(120, TimeUnit.SECONDS));
        pool.shutdown();
        assertTrue(pool.awaitTermination(30, TimeUnit.SECONDS));

        for (Integer pedidoId : pedidos) {
            var fila = turnoDelPedido(pedidoId);
            assertEquals("PENDIENTE_CONFIRMACION_COMERCIO", fila.get("estado"));
            assertEquals(hoy(), fechaDe(fila.get("turno_fecha")));
            assertEquals(turno, fila.get("turno_horario_id"));
            LocalDateTime pago = fechaHoraDe(fila.get("fecha_pago_confirmado"));
            assertEquals(pago, fechaDelHistorialDePago(pedidoId));
        }
    }
}
