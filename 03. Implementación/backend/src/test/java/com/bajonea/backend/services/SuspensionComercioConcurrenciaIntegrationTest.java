package com.bajonea.backend.services;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;

import com.bajonea.backend.config.security.ComercioActivo;
import com.bajonea.backend.dto.request.AnulacionPedidoRequestDTO;
import com.bajonea.backend.dto.request.LevantamientoSuspensionRequestDTO;
import com.bajonea.backend.dto.request.PedidoRequestDTO;
import com.bajonea.backend.dto.request.SuspensionComercioRequestDTO;
import com.bajonea.backend.enums.ActorCierre;
import com.bajonea.backend.enums.EstadoComercio;
import com.bajonea.backend.enums.MotivoRechazo;
import com.bajonea.backend.enums.MotivoRecalculo;
import com.bajonea.backend.enums.RolActorComercio;
import com.bajonea.backend.enums.TipoEntrega;
import com.bajonea.backend.exceptions.ConflictoDeNegocioException;
import com.bajonea.backend.services.DatosPruebaEmpleado.Cuenta;
import com.bajonea.backend.services.DatosPruebaEmpleado.Dueno;
import com.bajonea.backend.services.MercadoPagoReembolsoClient.ResultadoReembolsoMp;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Callable;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.RepeatedTest;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * La carrera que importa de la suspensión de un comercio (Fase 5, tramo S2): suspender mientras el comercio opera.
 * Con datos confirmados y varios hilos, el comercio suspendido contra una aceptación, un pago, un despacho y una
 * anulación, un pedido nuevo, el cierre manual, la vinculación de Mercado Pago, la aprobación de documentos, el proceso
 * de 90 minutos y otra suspensión. Nunca hay un error de bloqueo y el resultado es siempre uno de los dos órdenes
 * posibles.
 */
class SuspensionComercioConcurrenciaIntegrationTest extends CarritoIntegrationBase {

    @Autowired
    private SuspensionComercioService suspensionService;

    @Autowired
    private CierreComercioService cierreComercioService;

    @Autowired
    private AptitudVentaComercioService aptitudService;

    @Autowired
    private TestSupportService testSupportService;

    @MockitoBean
    private MercadoPagoReembolsoClient reembolsoClient;

    private int administradorId;

    @BeforeEach
    void prepararAdministrador() {
        administradorId = jdbcTemplate.queryForObject("SELECT id FROM administrador ORDER BY id LIMIT 1", Integer.class);
        when(reembolsoClient.solicitarReembolsoTotal(any(), any(), anyString())).thenReturn(new ResultadoReembolsoMp(true, "refund", null));
        when(emailService.enviarComercioSuspendido(anyString(), anyString(), anyString())).thenReturn(ResultadoEnvioEmail.enviado("id"));
        when(emailService.enviarComercioSuspensionLevantada(anyString(), anyString(), any())).thenReturn(ResultadoEnvioEmail.enviado("id"));
    }

    private void suspender(Dueno dueno) {
        suspensionService.suspender(dueno.comercioId(), administradorId, new SuspensionComercioRequestDTO("Documentacion vencida y quejas"));
    }

    private String estadoComercio(Dueno dueno) {
        return jdbcTemplate.queryForObject("SELECT estado FROM comercio WHERE id = ?", String.class, dueno.comercioId());
    }

    private int pedido(Dueno dueno, int clienteId, String estado, int minutosEnEstado) {
        jdbcTemplate.update("INSERT INTO pedido (cliente_id, comercio_id, modalidad_entrega, estado, pago_estado, subtotal, "
                + "cargo_servicio_cliente, cargo_servicio_comercio, total, fecha_creacion) "
                + "VALUES (?, ?, 'RETIRO', ?, 'PAGADO', 10000, 200, 100, 10200, ?)",
                clienteId, dueno.comercioId(), estado, LocalDateTime.now().minusHours(6));
        int id = jdbcTemplate.queryForObject("SELECT LAST_INSERT_ID()", Integer.class);
        historial(id, "PENDIENTE_CONFIRMACION_COMERCIO", "SISTEMA", null, minutosEnEstado + 200);
        if (!estado.equals("PENDIENTE_CONFIRMACION_COMERCIO")) {
            historial(id, "EN_PREPARACION", "DUENO", dueno.id(), minutosEnEstado + 100);
        }
        jdbcTemplate.update("INSERT INTO pago (pedido_id, monto, mp_estado, id_transaccion_mp, fecha_creacion, fecha_confirmacion) "
                + "VALUES (?, 10200, 'approved', ?, NOW(), NOW())", id, "scc-" + id);
        return id;
    }

    private void historial(int pedidoId, String estado, String actorRol, Integer actorUsuarioId, int minutosAtras) {
        jdbcTemplate.update("INSERT INTO historial_estado_pedido (pedido_id, estado, actor_rol, actor_usuario_id, fecha_hora) VALUES (?, ?, ?, ?, ?)",
                pedidoId, estado, actorRol, actorUsuarioId, LocalDateTime.now().minusMinutes(minutosAtras));
    }

    private int notas(int pedidoId) {
        return jdbcTemplate.queryForObject("SELECT COUNT(*) FROM nota_credito nc JOIN pago pg ON pg.id = nc.pago_id WHERE pg.pedido_id = ?",
                Integer.class, pedidoId);
    }

    private int filas(int pedidoId, String estado) {
        return jdbcTemplate.queryForObject("SELECT COUNT(*) FROM historial_estado_pedido WHERE pedido_id = ? AND estado = ?", Integer.class, pedidoId, estado);
    }

    private static boolean esperado(Object resultado) {
        return !(resultado instanceof Exception) || resultado instanceof ConflictoDeNegocioException;
    }

    private static void sinFallosInesperados(List<Object> resultados) {
        for (Object resultado : resultados) {
            assertTrue(esperado(resultado), "Fallo inesperado: " + resultado);
        }
    }

    @RepeatedTest(8)
    void suspenderContraAceptarDejaElPedidoAceptadoOSinAceptarNuncaAmbas() {
        Dueno dueno = comercioApto(true);
        Cuenta empleado = datos.registrarClienteConCredenciales();
        datos.vincularEmpleado(empleado.id(), dueno.comercioId(), "ACTIVO", LocalDateTime.now().minusDays(1));
        int cliente = datos.registrarCliente();
        int delDueno = pedido(dueno, cliente, "PENDIENTE_CONFIRMACION_COMERCIO", 5);
        int delEmpleado = pedido(dueno, cliente, "PENDIENTE_CONFIRMACION_COMERCIO", 5);
        ComercioActivo comoDueno = ComercioActivo.delDueno(dueno.comercioId(), dueno.id(), EstadoComercio.APTO_VENTA);
        ComercioActivo comoEmpleado = new ComercioActivo(dueno.comercioId(), dueno.id(), empleado.id(), RolActorComercio.EMPLEADO,
                EstadoComercio.APTO_VENTA);

        List<Callable<Object>> tareas = new ArrayList<>();
        tareas.add(() -> {
            suspender(dueno);
            return null;
        });
        tareas.add(() -> pedidoService.aceptarPedido(comoDueno, delDueno));
        tareas.add(() -> pedidoService.aceptarPedido(comoEmpleado, delEmpleado));
        sinFallosInesperados(correrAlMismoTiempo(tareas));

        assertEquals("SUSPENDIDO", estadoComercio(dueno));
        for (int id : List.of(delDueno, delEmpleado)) {
            String estado = estadoDelPedido(id);
            assertTrue(estado.equals("EN_PREPARACION") || estado.equals("PENDIENTE_CONFIRMACION_COMERCIO"), estado);
            assertEquals(estado.equals("EN_PREPARACION") ? 1 : 0, filas(id, "EN_PREPARACION"));
        }
    }

    @RepeatedTest(8)
    void suspenderContraDespacharYAnularNoPierdeNingunaAccion() {
        Dueno dueno = comercioApto(true);
        int cliente = datos.registrarCliente();
        int aDespachar = pedido(dueno, cliente, "EN_PREPARACION", 5);
        int aAnular = pedido(dueno, cliente, "EN_PREPARACION", 5);
        ComercioActivo actor = ComercioActivo.delDueno(dueno.comercioId(), dueno.id(), EstadoComercio.APTO_VENTA);

        List<Callable<Object>> tareas = new ArrayList<>();
        tareas.add(() -> {
            suspender(dueno);
            return null;
        });
        tareas.add(() -> pedidoService.avanzarAEntregaEnCurso(actor, aDespachar));
        tareas.add(() -> pedidoService.anularPedido(actor, aAnular, new AnulacionPedidoRequestDTO(MotivoRechazo.SIN_STOCK, null)));
        sinErroresDeConflictoTampoco(correrAlMismoTiempo(tareas));

        assertEquals("SUSPENDIDO", estadoComercio(dueno));
        assertEquals("LISTO_PARA_RETIRAR", estadoDelPedido(aDespachar));
        assertEquals("ANULADO", estadoDelPedido(aAnular));
        assertEquals(1, notas(aAnular));
    }

    private static void sinErroresDeConflictoTampoco(List<Object> resultados) {
        sinErrores(resultados);
    }

    @RepeatedTest(8)
    void suspenderContraCrearPedidosNoDejaPedidosNacidosDespuesDeLaSuspension() {
        Dueno dueno = comercioApto(true);
        int cliente = datos.registrarCliente();
        agregar(cliente, producto(dueno));
        PedidoRequestDTO pedido = new PedidoRequestDTO();
        pedido.setTipoEntrega(TipoEntrega.RETIRO);

        List<Callable<Object>> tareas = new ArrayList<>();
        tareas.add(() -> {
            suspender(dueno);
            return null;
        });
        for (int i = 0; i < 3; i++) {
            tareas.add(() -> pedidoService.confirmarPedido(cliente, pedido));
        }
        sinFallosInesperados(correrAlMismoTiempo(tareas));

        assertEquals("SUSPENDIDO", estadoComercio(dueno));
        LocalDateTime suspendidoDesde = jdbcTemplate.queryForObject("SELECT suspendido_desde FROM comercio WHERE id = ?", LocalDateTime.class,
                dueno.comercioId());
        Integer nacidosDespues = jdbcTemplate.queryForObject("SELECT COUNT(*) FROM pedido WHERE comercio_id = ? AND fecha_creacion > ?",
                Integer.class, dueno.comercioId(), suspendidoDesde.plusSeconds(1));
        assertEquals(0, nacidosDespues);
    }

    @RepeatedTest(8)
    void suspenderContraCerrarYAbrirNoSeInterbloquea() {
        Dueno dueno = comercioApto(true);

        List<Callable<Object>> tareas = new ArrayList<>();
        tareas.add(() -> {
            suspender(dueno);
            return null;
        });
        tareas.add(() -> cierreComercioService.cerrar(dueno.comercioId(), dueno.id(), ActorCierre.DUENO));
        tareas.add(() -> cierreComercioService.abrir(dueno.comercioId(), dueno.id(), ActorCierre.DUENO));
        sinFallosInesperados(correrAlMismoTiempo(tareas));

        assertEquals("SUSPENDIDO", estadoComercio(dueno));
    }

    @RepeatedTest(8)
    void suspenderContraVincularMercadoPagoYAprobarDocumentosDejaSiempreElComercioSuspendido() {
        Dueno dueno = comercioApto(false);

        List<Callable<Object>> tareas = new ArrayList<>();
        tareas.add(() -> {
            suspender(dueno);
            return null;
        });
        tareas.add(() -> {
            new TransactionTemplate(transactionManager).executeWithoutResult(status -> {
                cuentaService.vincular(dueno.id(), "MP-SCC-" + DatosPruebaEmpleado.sufijo(), "token", "refresh", "pub", true,
                        LocalDateTime.now().plusDays(1));
                AptitudVentaComercioService.EntradasDueno entradas = aptitudService.leerDueno(dueno.id());
                aptitudService.recalcularComerciosDelDueno(dueno.id(), entradas, MotivoRecalculo.MP_VINCULADO);
            });
            return null;
        });
        tareas.add(() -> {
            testSupportService.aprobarDocumentacion(dueno.comercioId());
            return null;
        });
        sinFallosInesperados(correrAlMismoTiempo(tareas));

        assertEquals("SUSPENDIDO", estadoComercio(dueno));
    }

    @RepeatedTest(6)
    void levantarContraElProcesoDeLos90MinutosDejaElPedidoCanceladoConUnaNotaOIntacto() {
        Dueno dueno = comercioApto(true);
        int cliente = datos.registrarCliente();
        int pedido = pedido(dueno, cliente, "EN_PREPARACION", 5);
        suspender(dueno);
        jdbcTemplate.update("UPDATE comercio SET suspendido_desde = DATE_SUB(suspendido_desde, INTERVAL 200 MINUTE) WHERE id = ?", dueno.comercioId());

        List<Callable<Object>> tareas = new ArrayList<>();
        tareas.add(() -> suspensionService.levantar(dueno.comercioId(), administradorId, new LevantamientoSuspensionRequestDTO(null)));
        tareas.add(() -> {
            pedidoService.cancelarPreparacionPorSuspension(LocalDateTime.now());
            return null;
        });
        sinFallosInesperados(correrAlMismoTiempo(tareas));

        assertEquals("APTO_VENTA", estadoComercio(dueno));
        String estado = estadoDelPedido(pedido);
        assertTrue(estado.equals("EN_PREPARACION") || estado.equals("CANCELADO_POR_SISTEMA"), estado);
        assertEquals(estado.equals("CANCELADO_POR_SISTEMA") ? 1 : 0, notas(pedido));
        assertEquals(estado.equals("CANCELADO_POR_SISTEMA") ? 1 : 0, filas(pedido, "CANCELADO_POR_SISTEMA"));
    }

    @RepeatedTest(6)
    void variasSuspensionesSimultaneasDejanUnaSolaYLasDemasDan409() {
        Dueno dueno = comercioApto(true);

        List<Callable<Object>> tareas = new ArrayList<>();
        for (int i = 0; i < 4; i++) {
            tareas.add(() -> {
                suspender(dueno);
                return "ok";
            });
        }
        List<Object> resultados = correrAlMismoTiempo(tareas);

        sinFallosInesperados(resultados);
        assertEquals(1, resultados.stream().filter("ok"::equals).count());
        assertEquals(1, jdbcTemplate.queryForObject("SELECT COUNT(*) FROM historial_estado_comercio WHERE comercio_id = ? AND estado_destino = 'SUSPENDIDO'",
                Integer.class, dueno.comercioId()));
        assertEquals(1, jdbcTemplate.queryForObject("SELECT COUNT(*) FROM notificacion WHERE usuario_id = ? AND tipo = 'COMERCIO_SUSPENDIDO' AND canal = 'PUSH'",
                Integer.class, dueno.id()));
    }

    @RepeatedTest(6)
    void suspenderContraLevantarDejaUnEstadoCoherenteSinErroresDeBloqueo() {
        Dueno dueno = comercioApto(true);
        suspender(dueno);

        List<Callable<Object>> tareas = new ArrayList<>();
        tareas.add(() -> suspensionService.levantar(dueno.comercioId(), administradorId, new LevantamientoSuspensionRequestDTO(null)));
        tareas.add(() -> {
            suspensionService.suspender(dueno.comercioId(), administradorId, new SuspensionComercioRequestDTO("Otra vez suspendido por reincidencia"));
            return null;
        });
        sinFallosInesperados(correrAlMismoTiempo(tareas));

        String estado = estadoComercio(dueno);
        assertTrue(estado.equals("SUSPENDIDO") || estado.equals("APTO_VENTA"), estado);
        Integer origen = jdbcTemplate.queryForObject("SELECT COUNT(*) FROM comercio WHERE id = ? AND suspension_origen IS NOT NULL", Integer.class,
                dueno.comercioId());
        assertEquals(estado.equals("SUSPENDIDO") ? 1 : 0, origen);
    }
}
