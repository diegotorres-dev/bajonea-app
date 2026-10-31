package com.bajonea.backend.services;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;

import com.bajonea.backend.dto.request.RechazoPedidoRequestDTO;
import com.bajonea.backend.dto.request.SuspensionComercioRequestDTO;
import com.bajonea.backend.dto.request.SuspensionUsuarioRequestDTO;
import com.bajonea.backend.enums.MotivoRechazo;
import com.bajonea.backend.services.DatosPruebaEmpleado.Dueno;
import java.time.LocalDateTime;
import java.util.List;
import java.util.concurrent.Callable;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.RepeatedTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

/**
 * Carreras del webhook de Mercado Pago contra todo lo que puede pasarle al mismo pedido a la vez (Fase 5, tramo S3.2):
 * otro webhook idéntico, la sincronización del Cliente, la cancelación del Cliente, la suspensión del comercio, del
 * Dueño o del Cliente, el vencimiento del pago, el rechazo del comercio con su reembolso y el "Ir a pagar". En cada una
 * la plata termina bien: o el pedido queda confirmado sin nota de crédito, o queda cancelado o rechazado con
 * <b>exactamente una</b> nota por el pago completo y <b>un solo</b> pedido de reembolso a Mercado Pago; nunca dos notas,
 * nunca un pedido confirmado con el comercio suspendido sin devolución, nunca un pago perdido. Mercado Pago es un
 * servidor local con una demora corta que ensancha las ventanas.
 */
class WebhookConcurrenciaIntegrationTest extends SuspensionDuenoTestBase {

    private static final MercadoPagoSimulado MERCADO_PAGO = new MercadoPagoSimulado();
    private static final String IP = "127.0.0.1";

    @Autowired
    private MercadoPagoPagoService mercadoPagoPagoService;

    @DynamicPropertySource
    static void apuntarAlServidorLocal(DynamicPropertyRegistry registry) {
        registry.add("MERCADOPAGO_API_BASE_URL", MERCADO_PAGO::urlBase);
    }

    @AfterAll
    static void detenerServidor() {
        MERCADO_PAGO.detener();
    }

    @BeforeEach
    void ensancharVentanas() {
        MERCADO_PAGO.demora(40);
    }

    private Callable<Object> webhook(int pedidoId) {
        return () -> {
            mercadoPagoPagoService.procesarNotificacion(pedidoId, MercadoPagoSimulado.idDePago(pedidoId), IP);
            return null;
        };
    }

    private Callable<Object> sincronizacion(int clienteId, int pedidoId) {
        return () -> mercadoPagoPagoService.sincronizarPago(clienteId, pedidoId, null, IP);
    }

    private int pedidoConPago(Dueno dueno, int clienteId) {
        int pedido = pedidoPendientePago(clienteId, dueno);
        filaDePago(pedido);
        return pedido;
    }

    private int transicionesAConfirmacion(int pedidoId) {
        return jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM historial_estado_pedido WHERE pedido_id = ? AND estado = 'PENDIENTE_CONFIRMACION_COMERCIO'",
                Integer.class, pedidoId);
    }

    private int avisosDeNuevoPedido(int duenoId, int pedidoId) {
        return jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM notificacion WHERE usuario_id = ? AND tipo = 'NUEVO_PEDIDO' AND entidad_id = ?",
                Integer.class, duenoId, pedidoId);
    }

    private String estadoMp(int pedidoId) {
        return jdbcTemplate.queryForObject("SELECT mp_estado FROM pago WHERE pedido_id = ?", String.class, pedidoId);
    }

    private void exigirConfirmadoSinNota(int pedidoId, int duenoId) {
        assertEquals("PENDIENTE_CONFIRMACION_COMERCIO", estadoDelPedido(pedidoId));
        assertEquals(0, notas(pedidoId), "un pedido confirmado no tiene nota de crédito");
        assertEquals(1, transicionesAConfirmacion(pedidoId), "una sola transición a confirmación");
        assertEquals(1, avisosDeNuevoPedido(duenoId, pedidoId), "un solo aviso de pedido nuevo");
    }

    private void exigirDevueltoUnaSolaVez(int pedidoId, String... estadosPosibles) {
        String estado = estadoDelPedido(pedidoId);
        assertTrue(List.of(estadosPosibles).contains(estado), "estado final inesperado: " + estado);
        assertEquals(1, notas(pedidoId), "exactamente una nota de crédito");
        assertEquals("approved", estadoMp(pedidoId));
        assertEquals(1, jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM nota_credito nc JOIN pago pg ON pg.id = nc.pago_id WHERE pg.pedido_id = ? AND nc.monto = pg.monto",
                Integer.class, pedidoId), "la nota cubre el pago completo");
    }

    @RepeatedTest(8)
    void dosWebhooksIdenticosDelMismoPagoConfirmanUnaSolaVez() {
        Dueno dueno = comercioApto(true);
        int pedido = pedidoConPago(dueno, datos.registrarCliente());

        sinErrores(correrAlMismoTiempo(List.of(webhook(pedido), webhook(pedido), webhook(pedido))));

        exigirConfirmadoSinNota(pedido, dueno.id());
        assertEquals("approved", estadoMp(pedido));
    }

    @RepeatedTest(8)
    void elWebhookYLaSincronizacionDelMismoPagoConfirmanUnaSolaVez() {
        Dueno dueno = comercioApto(true);
        int cliente = datos.registrarCliente();
        int pedido = pedidoConPago(dueno, cliente);

        sinErrores(correrAlMismoTiempo(List.of(webhook(pedido), sincronizacion(cliente, pedido), webhook(pedido))));

        exigirConfirmadoSinNota(pedido, dueno.id());
    }

    @RepeatedTest(8)
    void elWebhookContraLaCancelacionDelClienteDevuelveElPagoUnaSolaVez() {
        Dueno dueno = comercioApto(true);
        int cliente = datos.registrarCliente();
        int pedido = pedidoConPago(dueno, cliente);

        sinErrores(correrAlMismoTiempo(List.of(webhook(pedido), () -> pedidoService.cancelarPedido(cliente, pedido))));

        exigirDevueltoUnaSolaVez(pedido, "CANCELADO");
        verify(reembolsoClient, times(1)).solicitarReembolsoTotal(any(), any(), anyString());
    }

    @RepeatedTest(8)
    void elWebhookContraLaSuspensionDelComercioNuncaDejaUnPedidoConfirmadoSinDevolucion() {
        Dueno dueno = comercioApto(true);
        int pedido = pedidoConPago(dueno, datos.registrarCliente());

        sinErrores(correrAlMismoTiempo(List.of(webhook(pedido), () -> suspensionComercio.suspender(dueno.comercioId(), administradorId,
                new SuspensionComercioRequestDTO("Documentacion vencida y quejas")))));

        exigirDevueltoUnaSolaVez(pedido, "CANCELADO_POR_SISTEMA", "RECHAZADO");
        verify(reembolsoClient, times(1)).solicitarReembolsoTotal(any(), any(), anyString());
    }

    @RepeatedTest(8)
    void elWebhookContraLaSuspensionDelDuenoNuncaDejaUnPedidoConfirmadoSinDevolucion() {
        Dueno dueno = duenoActivo();
        int pedido = pedidoConPago(dueno, datos.registrarCliente());

        sinErrores(correrAlMismoTiempo(List.of(webhook(pedido), () -> suspender(dueno))));

        exigirDevueltoUnaSolaVez(pedido, "CANCELADO_POR_SISTEMA", "RECHAZADO");
        verify(reembolsoClient, times(1)).solicitarReembolsoTotal(any(), any(), anyString());
    }

    @RepeatedTest(8)
    void elWebhookContraLaSuspensionDelClienteConfirmaOLoDevuelveEntero() {
        Dueno dueno = comercioApto(true);
        int cliente = datos.registrarCliente();
        int pedido = pedidoConPago(dueno, cliente);

        sinErrores(correrAlMismoTiempo(List.of(webhook(pedido),
                () -> suspensionUsuario.suspender(cliente, administradorId, new SuspensionUsuarioRequestDTO("Pedidos falsos reiterados")))));

        String estado = estadoDelPedido(pedido);
        if ("CANCELADO_POR_SISTEMA".equals(estado)) {
            exigirDevueltoUnaSolaVez(pedido, "CANCELADO_POR_SISTEMA");
            verify(reembolsoClient, times(1)).solicitarReembolsoTotal(any(), any(), anyString());
        } else {
            exigirConfirmadoSinNota(pedido, dueno.id());
        }
    }

    @RepeatedTest(8)
    void elWebhookContraElVencimientoDelPagoConfirmaOLoDevuelveEntero() {
        Dueno dueno = comercioApto(true);
        int pedido = pedidoConPago(dueno, datos.registrarCliente());
        jdbcTemplate.update("UPDATE pedido SET fecha_creacion = ? WHERE id = ?", LocalDateTime.now().minusMinutes(90), pedido);

        sinErrores(correrAlMismoTiempo(List.of(webhook(pedido), () -> {
            pedidoService.expirarPagosVencidos(LocalDateTime.now());
            return null;
        })));

        String estado = estadoDelPedido(pedido);
        if ("PENDIENTE_CONFIRMACION_COMERCIO".equals(estado)) {
            exigirConfirmadoSinNota(pedido, dueno.id());
        } else {
            exigirDevueltoUnaSolaVez(pedido, "CANCELADO_POR_SISTEMA");
            verify(reembolsoClient, times(1)).solicitarReembolsoTotal(any(), any(), anyString());
        }
    }

    @RepeatedTest(8)
    void unWebhookRepetidoContraElRechazoDelComercioNoDuplicaElReembolso() {
        Dueno dueno = comercioApto(true);
        int cliente = datos.registrarCliente();
        int pedido = pedido(dueno.comercioId(), dueno.id(), cliente, "PENDIENTE_CONFIRMACION_COMERCIO");
        jdbcTemplate.update("UPDATE pago SET id_transaccion_mp = ? WHERE pedido_id = ?", MercadoPagoSimulado.idDePago(pedido), pedido);

        sinErrores(correrAlMismoTiempo(List.of(webhook(pedido), webhook(pedido), () -> pedidoService.rechazarPedido(actor(dueno), pedido,
                new RechazoPedidoRequestDTO(MotivoRechazo.OTRO, "Sin stock")))));

        assertEquals("RECHAZADO", estadoDelPedido(pedido));
        assertEquals(1, notas(pedido));
        verify(reembolsoClient, times(1)).solicitarReembolsoTotal(any(), any(), anyString());
    }

    @RepeatedTest(8)
    void dosIrAPagarSimultaneosDelMismoPedidoGuardanUnaSolaPreferencia() {
        Dueno dueno = comercioApto(true);
        int cliente = datos.registrarCliente();
        int pedido = pedidoPendientePago(cliente, dueno);

        sinErrores(correrAlMismoTiempo(List.of(() -> mercadoPagoPagoService.iniciarOReusarPago(cliente, pedido),
                () -> mercadoPagoPagoService.iniciarOReusarPago(cliente, pedido))));

        assertEquals(1, jdbcTemplate.queryForObject("SELECT COUNT(*) FROM pago WHERE pedido_id = ?", Integer.class, pedido));
        assertEquals("PENDIENTE_PAGO", estadoDelPedido(pedido));
    }

    @Test
    void unResultadoViejoDespuesDeUnoNuevoNoRetrocedeElEstadoNiDuplicaNada() {
        Dueno dueno = comercioApto(true);
        int cliente = datos.registrarCliente();
        int pedido = pedidoConPago(dueno, cliente);

        MERCADO_PAGO.estadoDelPago(pedido, "rejected");
        mercadoPagoPagoService.procesarNotificacion(pedido, MercadoPagoSimulado.idDePago(pedido), IP);
        assertEquals("PENDIENTE_PAGO", estadoDelPedido(pedido), "un rechazo no cancela el pedido");
        assertEquals("RECHAZADO", jdbcTemplate.queryForObject("SELECT pago_estado FROM pedido WHERE id = ?", String.class, pedido));

        MERCADO_PAGO.estadoDelPago(pedido, "approved");
        mercadoPagoPagoService.procesarNotificacion(pedido, MercadoPagoSimulado.idDePago(pedido), IP);
        exigirConfirmadoSinNota(pedido, dueno.id());

        MERCADO_PAGO.estadoDelPago(pedido, "rejected");
        mercadoPagoPagoService.procesarNotificacion(pedido, MercadoPagoSimulado.idDePago(pedido), IP);
        MERCADO_PAGO.estadoDelPago(pedido, "pending");
        mercadoPagoPagoService.procesarNotificacion(pedido, MercadoPagoSimulado.idDePago(pedido), IP);
        mercadoPagoPagoService.procesarNotificacion(pedido, MercadoPagoSimulado.idDePago(pedido), IP);

        exigirConfirmadoSinNota(pedido, dueno.id());
        assertEquals("approved", estadoMp(pedido), "el pago aprobado no se pisa");
        assertEquals("PAGADO", jdbcTemplate.queryForObject("SELECT pago_estado FROM pedido WHERE id = ?", String.class, pedido));
        MERCADO_PAGO.estadoDelPago(pedido, "approved");
    }

    @Test
    void unPagoAprobadoConOtroIdSobreUnPedidoYaPagadoNoConfirmaNiDevuelveNada() {
        Dueno dueno = comercioApto(true);
        int cliente = datos.registrarCliente();
        int pedido = pedidoConPago(dueno, cliente);
        mercadoPagoPagoService.procesarNotificacion(pedido, MercadoPagoSimulado.idDePago(pedido), IP);

        jdbcTemplate.update("UPDATE pago SET id_transaccion_mp = 'otro-pago' WHERE pedido_id = ?", pedido);
        mercadoPagoPagoService.procesarNotificacion(pedido, MercadoPagoSimulado.idDePago(pedido), IP);

        exigirConfirmadoSinNota(pedido, dueno.id());
        assertEquals(1, jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM alerta_webhook_mp WHERE pedido_id = ? AND motivo = 'PAGO_APROBADO_DUPLICADO'", Integer.class, pedido));
    }

    @Test
    void laSincronizacionSobreUnPedidoYaConfirmadoNoLlamaAMercadoPago() {
        Dueno dueno = comercioApto(true);
        int cliente = datos.registrarCliente();
        int pedido = pedidoConPago(dueno, cliente);
        mercadoPagoPagoService.procesarNotificacion(pedido, MercadoPagoSimulado.idDePago(pedido), IP);
        int consultas = MERCADO_PAGO.consultasDePagos();

        mercadoPagoPagoService.sincronizarPago(cliente, pedido, null, IP);

        assertEquals(consultas, MERCADO_PAGO.consultasDePagos());
    }
}
