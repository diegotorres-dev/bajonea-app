package com.bajonea.backend.services;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

import com.bajonea.backend.enums.MotivoReclamo;
import com.bajonea.backend.enums.TipoResolucionReclamo;
import com.bajonea.backend.services.DatosPruebaEmpleado.Dueno;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import javax.sql.DataSource;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

/**
 * La creación y la resolución de un reclamo esperan el bloqueo del pedido y, cuando lo obtienen, deciden con lo último
 * confirmado y no con la foto que su transacción fijó antes de esperar (Fase 5, tramo S5). Sin carreras de azar: una
 * conexión aparte sostiene el pedido {@code FOR UPDATE}, la operación se lanza en otro hilo, se comprueba que sigue
 * esperando y recién entonces la conexión aparte escribe lo que "otra pestaña" habría confirmado y suelta el bloqueo.
 */
class ReclamoFotoDeLaTransaccionIntegrationTest extends ReclamoIntegrationBase {

    @Autowired
    private DataSource dataSource;

    private void tenerElPedidoYEscribir(int pedidoId, String sentenciaDelOtro, Object[] parametros, CountDownLatch bloqueado,
            CountDownLatch soltar) throws Exception {
        tenerBloqueadaYEscribir("SELECT id FROM pedido WHERE id = ? FOR UPDATE", pedidoId, sentenciaDelOtro, parametros, bloqueado, soltar);
    }

    private void tenerBloqueadaYEscribir(String sentenciaDeBloqueo, int id, String sentenciaDelOtro, Object[] parametros,
            CountDownLatch bloqueado, CountDownLatch soltar) throws Exception {
        try (Connection conexion = dataSource.getConnection()) {
            conexion.setAutoCommit(false);
            try (PreparedStatement bloqueo = conexion.prepareStatement(sentenciaDeBloqueo)) {
                bloqueo.setInt(1, id);
                bloqueo.executeQuery().close();
            }
            bloqueado.countDown();
            esperar(soltar);
            try (PreparedStatement escritura = conexion.prepareStatement(sentenciaDelOtro)) {
                for (int i = 0; i < parametros.length; i++) {
                    escritura.setObject(i + 1, parametros[i]);
                }
                escritura.executeUpdate();
            }
            conexion.commit();
        }
    }

    @Test
    void laResolucionEsperaElPedidoYDespuesNoDuplicaLoQueOtraPestaniaYaResolvio() throws Exception {
        Dueno dueno = duenoConCuenta();
        int cliente = datos.registrarCliente();
        int pedidoId = pedidoEntregado(cliente, dueno);
        reclamar(cliente, pedidoId);
        int id = reclamoId(pedidoId);
        int administrador = adminId();
        CountDownLatch bloqueado = new CountDownLatch(1);
        CountDownLatch soltar = new CountDownLatch(1);
        ExecutorService pool = Executors.newFixedThreadPool(2);
        try {
            Future<?> otraPestania = pool.submit(() -> {
                tenerElPedidoYEscribir(pedidoId,
                        "UPDATE reclamo SET estado = 'RECHAZADO', tipo_resolucion = 'RECHAZO', nota_resolucion = 'Resuelto por otra pestaña', "
                                + "administrador_id = ?, fecha_resolucion = NOW() WHERE id = ?",
                        new Object[] {administrador, id}, bloqueado, soltar);
                return null;
            });
            esperar(bloqueado);
            Future<Object> resolucion = pool.submit(() -> {
                try {
                    return reclamoAdmin.resolver(administrador, id, resolucion(TipoResolucionReclamo.REEMBOLSO_TOTAL, null, null));
                } catch (Exception e) {
                    return e;
                }
            });

            Thread.sleep(1500);
            assertFalse(resolucion.isDone(), "la resolución tiene que esperar el bloqueo del pedido");
            soltar.countDown();
            otraPestania.get(30, TimeUnit.SECONDS);
            Object resultado = resolucion.get(30, TimeUnit.SECONDS);

            assertInstanceOf(com.bajonea.backend.exceptions.ConflictoDeNegocioException.class, resultado);
            assertEquals("Este reclamo ya fue resuelto.", ((Exception) resultado).getMessage());
            assertEquals(0, notasDelPedido(pedidoId).size());
            assertEquals("RECHAZADO", jdbcTemplate.queryForObject("SELECT estado FROM reclamo WHERE id = ?", String.class, id));
            verify(reembolsoClient, never()).solicitarReembolsoTotal(anyString(), anyString(), anyString());
            verify(reembolsoClient, never()).solicitarReembolsoParcial(anyString(), anyString(), anyString(), any());
        } finally {
            soltar.countDown();
            pool.shutdownNow();
        }
    }

    @Test
    void laCreacionEsperaElPedidoYUnReclamoQueOtroConfirmoMientrasTantoDaElMismoConflicto() throws Exception {
        Dueno dueno = duenoConCuenta();
        int cliente = datos.registrarCliente();
        int pedidoId = pedidoEntregado(cliente, dueno);
        CountDownLatch bloqueado = new CountDownLatch(1);
        CountDownLatch soltar = new CountDownLatch(1);
        ExecutorService pool = Executors.newFixedThreadPool(2);
        try {
            Future<?> otraPestania = pool.submit(() -> {
                tenerElPedidoYEscribir(pedidoId,
                        "INSERT INTO reclamo (pedido_id, motivo, descripcion, fecha_creacion, estado) VALUES (?, 'OTRO', 'Creado por otra pestaña', NOW(), 'PENDIENTE')",
                        new Object[] {pedidoId}, bloqueado, soltar);
                return null;
            });
            esperar(bloqueado);
            Future<Object> creacion = pool.submit(() -> {
                try {
                    return reclamoService.crear(cliente, pedidoId, reclamoDe(MotivoReclamo.FALTAN_PRODUCTOS));
                } catch (Exception e) {
                    return e;
                }
            });

            Thread.sleep(1500);
            assertFalse(creacion.isDone(), "la creación tiene que esperar el bloqueo del pedido");
            soltar.countDown();
            otraPestania.get(30, TimeUnit.SECONDS);
            Object resultado = creacion.get(30, TimeUnit.SECONDS);

            assertInstanceOf(com.bajonea.backend.exceptions.ConflictoDeNegocioException.class, resultado);
            assertEquals("Ya hiciste un reclamo por este pedido.", ((Exception) resultado).getMessage());
            assertEquals(1, jdbcTemplate.queryForObject("SELECT COUNT(*) FROM reclamo WHERE pedido_id = ?", Integer.class, pedidoId));
        } finally {
            soltar.countDown();
            pool.shutdownNow();
        }
    }

    @Test
    void laCreacionDecideConLaEntregaQueOtraTransaccionConfirmoMientrasEsperaba() throws Exception {
        Dueno dueno = duenoConCuenta();
        int cliente = datos.registrarCliente();
        int pedidoId = pedidoEntregado(cliente, dueno);
        CountDownLatch bloqueado = new CountDownLatch(1);
        CountDownLatch soltar = new CountDownLatch(1);
        ExecutorService pool = Executors.newFixedThreadPool(2);
        try {
            Future<?> otraTransaccion = pool.submit(() -> {
                tenerElPedidoYEscribir(pedidoId, "UPDATE pedido SET fecha_entrega = DATE_SUB(NOW(), INTERVAL 9 DAY) WHERE id = ?",
                        new Object[] {pedidoId}, bloqueado, soltar);
                return null;
            });
            esperar(bloqueado);
            Future<Object> creacion = pool.submit(() -> {
                try {
                    return reclamoService.crear(cliente, pedidoId, reclamoDe(MotivoReclamo.FALTAN_PRODUCTOS));
                } catch (Exception e) {
                    return e;
                }
            });

            Thread.sleep(1500);
            assertFalse(creacion.isDone(), "la creación tiene que esperar el bloqueo del pedido");
            soltar.countDown();
            otraTransaccion.get(30, TimeUnit.SECONDS);
            Object resultado = creacion.get(30, TimeUnit.SECONDS);

            assertInstanceOf(com.bajonea.backend.exceptions.ConflictoDeNegocioException.class, resultado);
            assertEquals("Pasaron los 7 días para reclamar este pedido.", ((Exception) resultado).getMessage());
            assertEquals(0, jdbcTemplate.queryForObject("SELECT COUNT(*) FROM reclamo WHERE pedido_id = ?", Integer.class, pedidoId));
        } finally {
            soltar.countDown();
            pool.shutdownNow();
        }
    }

    @Test
    void laResolucionEsperaElPagoYDecideConLoUltimoConfirmado() throws Exception {
        Dueno dueno = duenoConCuenta();
        int cliente = datos.registrarCliente();
        int pedidoId = pedidoEntregado(cliente, dueno);
        reclamar(cliente, pedidoId);
        int id = reclamoId(pedidoId);
        int administrador = adminId();
        CountDownLatch bloqueado = new CountDownLatch(1);
        CountDownLatch soltar = new CountDownLatch(1);
        ExecutorService pool = Executors.newFixedThreadPool(2);
        try {
            Future<?> otraTransaccion = pool.submit(() -> {
                tenerBloqueadaYEscribir("SELECT id FROM pago WHERE pedido_id = ? FOR UPDATE", pedidoId,
                        "UPDATE pago SET mp_estado = 'cancelled' WHERE pedido_id = ?", new Object[] {pedidoId}, bloqueado, soltar);
                return null;
            });
            esperar(bloqueado);
            Future<Object> resolucion = pool.submit(() -> {
                try {
                    return reclamoAdmin.resolver(administrador, id, resolucion(TipoResolucionReclamo.REEMBOLSO_TOTAL, null, null));
                } catch (Exception e) {
                    return e;
                }
            });

            Thread.sleep(1500);
            assertFalse(resolucion.isDone(), "la resolución tiene que esperar el bloqueo del pago");
            soltar.countDown();
            otraTransaccion.get(30, TimeUnit.SECONDS);
            Object resultado = resolucion.get(30, TimeUnit.SECONDS);

            assertInstanceOf(com.bajonea.backend.exceptions.ConflictoDeNegocioException.class, resultado);
            assertEquals("El pago del pedido no está aprobado en Mercado Pago: no hay nada que reembolsar", ((Exception) resultado).getMessage());
            assertEquals(0, notasDelPedido(pedidoId).size());
            assertEquals("PENDIENTE", jdbcTemplate.queryForObject("SELECT estado FROM reclamo WHERE id = ?", String.class, id));
        } finally {
            soltar.countDown();
            pool.shutdownNow();
        }
    }
}
