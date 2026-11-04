package com.bajonea.backend.services;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.bajonea.backend.dto.request.SuspensionUsuarioRequestDTO;
import com.bajonea.backend.enums.MotivoReclamo;
import com.bajonea.backend.enums.TipoResolucionReclamo;
import com.bajonea.backend.exceptions.ConflictoDeNegocioException;
import com.bajonea.backend.exceptions.CuentaSuspendidaException;
import com.bajonea.backend.services.DatosPruebaEmpleado.Dueno;
import com.bajonea.backend.services.MercadoPagoReembolsoClient.ResultadoReembolsoMp;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Callable;
import org.junit.jupiter.api.RepeatedTest;
import org.springframework.beans.factory.annotation.Autowired;

/**
 * Las carreras de Reclamos (Fase 5, tramo S5), cada una repetida 8 veces con datos nuevos: la creación y la resolución
 * se serializan por el pedido, el perdedor recibe un conflicto de negocio (nunca un 500) y no queda ni una segunda nota,
 * ni un segundo aviso ni una segunda llamada a Mercado Pago. Dos reclamos de pedidos distintos no se bloquean entre sí.
 */
class ReclamoConcurrenciaIntegrationTest extends ReclamoIntegrationBase {

    private static final int REPETICIONES = 8;

    @Autowired
    private SuspensionUsuarioService suspensionUsuarioService;

    @Autowired
    private SuspensionDuenoService suspensionDuenoService;

    private static boolean esConflicto(Object resultado) {
        return resultado instanceof ConflictoDeNegocioException;
    }

    private static boolean esExito(Object resultado) {
        return !(resultado instanceof Throwable);
    }

    private int reclamado(Dueno dueno, int cliente) {
        int pedidoId = pedidoEntregado(cliente, dueno);
        reclamar(cliente, pedidoId);
        return pedidoId;
    }

    @RepeatedTest(REPETICIONES)
    void diezCreacionesDelMismoPedidoDejanUnSoloReclamo() {
        Dueno dueno = duenoConCuenta();
        int cliente = datos.registrarCliente();
        int pedidoId = pedidoEntregado(cliente, dueno);
        List<Callable<Object>> tareas = new ArrayList<>();
        for (int i = 0; i < 10; i++) {
            tareas.add(() -> reclamoService.crear(cliente, pedidoId, reclamoDe(MotivoReclamo.FALTAN_PRODUCTOS)));
        }

        List<Object> resultados = correrAlMismoTiempo(tareas);

        assertEquals(1, resultados.stream().filter(ReclamoConcurrenciaIntegrationTest::esExito).count(), resultados.toString());
        assertEquals(9, resultados.stream().filter(ReclamoConcurrenciaIntegrationTest::esConflicto).count(), resultados.toString());
        resultados.stream().filter(ReclamoConcurrenciaIntegrationTest::esConflicto)
                .forEach(r -> assertEquals("Ya hiciste un reclamo por este pedido.", ((Throwable) r).getMessage()));
        assertEquals(1, jdbcTemplate.queryForObject("SELECT COUNT(*) FROM reclamo WHERE pedido_id = ?", Integer.class, pedidoId));
    }

    @RepeatedTest(REPETICIONES)
    void dosResolucionesDelMismoReclamoDejanUnaSolaNotaYUnSoloReembolso() {
        Dueno dueno = duenoConCuenta();
        int cliente = datos.registrarCliente();
        int pedidoId = reclamado(dueno, cliente);
        int id = reclamoId(pedidoId);
        List<Callable<Object>> tareas = List.of(
                () -> reclamoAdmin.resolver(adminId(), id, resolucion(TipoResolucionReclamo.REEMBOLSO_TOTAL, null, null)),
                () -> reclamoAdmin.resolver(adminId(), id, resolucion(TipoResolucionReclamo.REEMBOLSO_TOTAL, null, null)));

        List<Object> resultados = correrAlMismoTiempo(tareas);

        assertEquals(1, resultados.stream().filter(ReclamoConcurrenciaIntegrationTest::esExito).count(), resultados.toString());
        assertEquals(1, resultados.stream().filter(ReclamoConcurrenciaIntegrationTest::esConflicto).count(), resultados.toString());
        assertEquals("Este reclamo ya fue resuelto.",
                ((Throwable) resultados.stream().filter(ReclamoConcurrenciaIntegrationTest::esConflicto).findFirst().orElseThrow()).getMessage());
        assertEquals(1, notasDelPedido(pedidoId).size());
        assertEquals(1, notificaciones(cliente, "RECLAMO_APROBADO"));
        assertEquals(1, notificaciones(dueno.id(), "RECLAMO_REEMBOLSO_DUENO"));
        verify(reembolsoClient, times(1)).solicitarReembolsoTotal(anyString(), anyString(), anyString());
    }

    @RepeatedTest(REPETICIONES)
    void unTotalContraUnParcialSimultaneosDejanUnaSolaResolucion() {
        Dueno dueno = duenoConCuenta();
        int cliente = datos.registrarCliente();
        int pedidoId = reclamado(dueno, cliente);
        int id = reclamoId(pedidoId);
        List<Callable<Object>> tareas = List.of(
                () -> reclamoAdmin.resolver(adminId(), id, resolucion(TipoResolucionReclamo.REEMBOLSO_TOTAL, null, null)),
                () -> reclamoAdmin.resolver(adminId(), id, resolucion(TipoResolucionReclamo.REEMBOLSO_PARCIAL, "600", null)),
                () -> reclamoAdmin.resolver(adminId(), id, resolucion(TipoResolucionReclamo.RECHAZO, null, "Un motivo suficiente")));

        List<Object> resultados = correrAlMismoTiempo(tareas);

        assertEquals(1, resultados.stream().filter(ReclamoConcurrenciaIntegrationTest::esExito).count(), resultados.toString());
        assertEquals(2, resultados.stream().filter(ReclamoConcurrenciaIntegrationTest::esConflicto).count(), resultados.toString());
        String tipo = jdbcTemplate.queryForObject("SELECT tipo_resolucion FROM reclamo WHERE pedido_id = ?", String.class, pedidoId);
        assertEquals("RECHAZO".equals(tipo) ? 0 : 1, notasDelPedido(pedidoId).size());
        assertEquals(1, notificaciones(cliente, "RECLAMO_APROBADO") + notificaciones(cliente, "RECLAMO_RECHAZADO"));
    }

    @RepeatedTest(REPETICIONES)
    void laResolucionContraElReintentoDeSuNotaNoDuplicaNada() {
        Dueno dueno = duenoConCuenta();
        int cliente = datos.registrarCliente();
        int pedidoId = reclamado(dueno, cliente);
        int id = reclamoId(pedidoId);
        when(reembolsoClient.solicitarReembolsoParcial(anyString(), anyString(), anyString(), any()))
                .thenReturn(ResultadoReembolsoMp.fallido("Mercado Pago respondió 500: x"));
        resolverParcial(pedidoId, "400");
        int notaId = ((Number) notasDelPedido(pedidoId).get(0).get("id")).intValue();
        when(reembolsoClient.solicitarReembolsoParcial(anyString(), anyString(), anyString(), any()))
                .thenReturn(new ResultadoReembolsoMp(true, "refund-ok", null));
        List<Callable<Object>> tareas = List.of(
                () -> reclamoAdmin.resolver(adminId(), id, resolucion(TipoResolucionReclamo.REEMBOLSO_TOTAL, null, null)),
                () -> {
                    reembolsoService.reintentarNotaCredito(notaId);
                    return "reintento";
                },
                () -> {
                    reembolsoService.reintentarNotaCredito(notaId);
                    return "reintento";
                });

        List<Object> resultados = correrAlMismoTiempo(tareas);

        assertEquals(0, resultados.stream().filter(ReclamoConcurrenciaIntegrationTest::esExito).filter(r -> !"reintento".equals(r)).count(), resultados.toString());
        assertEquals(1, resultados.stream().filter(r -> "reintento".equals(r)).count(), resultados.toString());
        assertTrue(resultados.stream().noneMatch(r -> r instanceof Throwable && !esConflicto(r)), resultados.toString());
        assertEquals(1, notasDelPedido(pedidoId).size());
        assertEquals("PROCESADO", notasDelPedido(pedidoId).get(0).get("estado"));
        verify(reembolsoClient, times(2)).solicitarReembolsoParcial(anyString(), anyString(), anyString(), any());
    }

    @RepeatedTest(REPETICIONES)
    void laResolucionContraLaSuspensionDelClienteTerminaBienLasDos() {
        Dueno dueno = duenoConCuenta();
        int cliente = datos.registrarCliente();
        int pedidoId = reclamado(dueno, cliente);
        int id = reclamoId(pedidoId);
        List<Callable<Object>> tareas = List.of(
                () -> reclamoAdmin.resolver(adminId(), id, resolucion(TipoResolucionReclamo.REEMBOLSO_TOTAL, null, null)),
                () -> suspensionUsuarioService.suspender(cliente, adminId(), new SuspensionUsuarioRequestDTO("Pedidos falsos reiterados")));

        List<Object> resultados = correrAlMismoTiempo(tareas);

        sinErrores(resultados);
        assertEquals("APROBADO", jdbcTemplate.queryForObject("SELECT estado FROM reclamo WHERE pedido_id = ?", String.class, pedidoId));
        assertEquals("SUSPENDIDO", jdbcTemplate.queryForObject("SELECT estado FROM usuario WHERE id = ?", String.class, cliente));
        assertEquals(1, notasDelPedido(pedidoId).size());
        assertEquals("ENTREGADO", estadoDelPedido(pedidoId));
    }

    @RepeatedTest(REPETICIONES)
    void laResolucionContraLaSuspensionDelDuenoTerminaBienLasDos() {
        Dueno dueno = duenoConCuenta();
        int cliente = datos.registrarCliente();
        int pedidoId = reclamado(dueno, cliente);
        int id = reclamoId(pedidoId);
        List<Callable<Object>> tareas = List.of(
                () -> reclamoAdmin.resolver(adminId(), id, resolucion(TipoResolucionReclamo.REEMBOLSO_PARCIAL, "300", null)),
                () -> suspensionDuenoService.suspender(dueno.id(), adminId(), new SuspensionUsuarioRequestDTO("Incumplimientos reiterados")));

        List<Object> resultados = correrAlMismoTiempo(tareas);

        sinErrores(resultados);
        assertEquals("APROBADO", jdbcTemplate.queryForObject("SELECT estado FROM reclamo WHERE pedido_id = ?", String.class, pedidoId));
        assertEquals("SUSPENDIDO", jdbcTemplate.queryForObject("SELECT estado FROM usuario WHERE id = ?", String.class, dueno.id()));
        assertEquals(1, notasDelPedido(pedidoId).size());
    }

    @RepeatedTest(REPETICIONES)
    void laCreacionContraLaSuspensionDelClienteEsConsistente() {
        Dueno dueno = duenoConCuenta();
        int cliente = datos.registrarCliente();
        int pedidoId = pedidoEntregado(cliente, dueno);
        List<Callable<Object>> tareas = List.of(
                () -> reclamar(cliente, pedidoId),
                () -> suspensionUsuarioService.suspender(cliente, adminId(), new SuspensionUsuarioRequestDTO("Pedidos falsos reiterados")));

        List<Object> resultados = correrAlMismoTiempo(tareas);

        assertTrue(resultados.stream().noneMatch(r -> r instanceof Throwable && !(r instanceof CuentaSuspendidaException)), resultados.toString());
        int reclamos = jdbcTemplate.queryForObject("SELECT COUNT(*) FROM reclamo WHERE pedido_id = ?", Integer.class, pedidoId);
        boolean creoElReclamo = esExito(resultados.get(0));
        assertEquals(creoElReclamo ? 1 : 0, reclamos);
        assertEquals("SUSPENDIDO", jdbcTemplate.queryForObject("SELECT estado FROM usuario WHERE id = ?", String.class, cliente));
    }

    @RepeatedTest(REPETICIONES)
    void reclamosDePedidosDistintosSeResuelvenAlMismoTiempoSinBloquearseNiInterbloquearse() {
        Dueno dueno = duenoConCuenta();
        List<Callable<Object>> tareas = new ArrayList<>();
        List<Integer> pedidos = new ArrayList<>();
        for (int i = 0; i < 6; i++) {
            int cliente = datos.registrarCliente();
            int pedidoId = reclamado(dueno, cliente);
            pedidos.add(pedidoId);
            int id = reclamoId(pedidoId);
            TipoResolucionReclamo tipo = i % 3 == 0 ? TipoResolucionReclamo.REEMBOLSO_TOTAL
                    : i % 3 == 1 ? TipoResolucionReclamo.REEMBOLSO_PARCIAL : TipoResolucionReclamo.RECHAZO;
            tareas.add(() -> reclamoAdmin.resolver(adminId(), id, resolucion(tipo, tipo == TipoResolucionReclamo.REEMBOLSO_PARCIAL ? "200" : null,
                    tipo == TipoResolucionReclamo.RECHAZO ? "Un motivo suficiente" : null)));
        }

        List<Object> resultados = correrAlMismoTiempo(tareas);

        sinErrores(resultados);
        for (int pedidoId : pedidos) {
            assertTrue(!"PENDIENTE".equals(jdbcTemplate.queryForObject("SELECT estado FROM reclamo WHERE pedido_id = ?", String.class, pedidoId)));
        }
        assertEquals(4, pedidos.stream().mapToInt(p -> notasDelPedido(p).size()).sum());
    }

    @RepeatedTest(REPETICIONES)
    void creacionesDePedidosDistintosAlMismoTiempoSeCreanTodas() {
        Dueno dueno = duenoConCuenta();
        List<Callable<Object>> tareas = new ArrayList<>();
        List<Integer> pedidos = new ArrayList<>();
        for (int i = 0; i < 8; i++) {
            int cliente = datos.registrarCliente();
            int pedidoId = pedidoEntregado(cliente, dueno);
            pedidos.add(pedidoId);
            tareas.add(() -> reclamar(cliente, pedidoId));
        }

        List<Object> resultados = correrAlMismoTiempo(tareas);

        sinErrores(resultados);
        for (int pedidoId : pedidos) {
            assertEquals(1, jdbcTemplate.queryForObject("SELECT COUNT(*) FROM reclamo WHERE pedido_id = ?", Integer.class, pedidoId));
        }
    }
}
