package com.bajonea.backend.services;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;

import com.bajonea.backend.entities.Pedido;
import com.bajonea.backend.enums.MotivoNotaCredito;
import com.bajonea.backend.repositories.PedidoRepository;
import com.bajonea.backend.services.DatosPruebaEmpleado.Dueno;
import com.bajonea.backend.services.MercadoPagoReembolsoClient.ResultadoReembolsoMp;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * La idempotencia de la nota de crédito no puede depender de la foto que la transacción fijó al empezar. Una
 * transacción que espera el bloqueo del pago mientras otra crea y confirma la nota lee, con una consulta común, la foto
 * vieja (REPEATABLE READ): no vería la nota y crearía una segunda. Dos webhooks de Mercado Pago del mismo pago sobre un
 * pedido cancelado por la suspensión del Cliente producían exactamente esa doble nota (SuspensionClientePagoIntegrationTest
 * lo mostraba solo bajo carga). Acá la foto vieja se fija a propósito, sin depender del azar.
 */
class ReembolsoFotoDeLaTransaccionIntegrationTest extends CarritoIntegrationBase {

    @Autowired
    private ReembolsoService reembolsoService;

    @Autowired
    private PedidoRepository pedidoRepository;

    @MockitoBean
    private MercadoPagoReembolsoClient reembolsoClient;

    private int notasDelPedido(int pedidoId) {
        return jdbcTemplate.queryForObject("SELECT COUNT(*) FROM nota_credito nc JOIN pago pg ON pg.id = nc.pago_id WHERE pg.pedido_id = ?",
                Integer.class, pedidoId);
    }

    @Test
    void unaTransaccionConLaFotoFijadaAntesDeLaNotaDeOtraNoCreaUnaSegunda() {
        when(reembolsoClient.solicitarReembolsoTotal(any(), any(), anyString())).thenReturn(new ResultadoReembolsoMp(true, "refund", null));
        Dueno dueno = comercioApto(true);
        int cliente = datos.registrarCliente();
        int pedidoId = pedidoPendientePago(cliente, dueno);
        filaDePago(pedidoId);
        jdbcTemplate.update("UPDATE pago SET mp_estado = 'approved', fecha_confirmacion = NOW(), id_transaccion_mp = ? WHERE pedido_id = ?",
                "mp-foto-" + pedidoId, pedidoId);

        TransactionTemplate conFotoVieja = new TransactionTemplate(transactionManager);
        TransactionTemplate otraTransaccion = new TransactionTemplate(transactionManager);
        otraTransaccion.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);

        conFotoVieja.executeWithoutResult(estado -> {
            assertEquals(0, notasDelPedido(pedidoId));
            otraTransaccion.executeWithoutResult(otra -> {
                Pedido pedido = pedidoRepository.findById(pedidoId).orElseThrow();
                reembolsoService.generarNotaYReembolsarTotal(pedido, MotivoNotaCredito.SUSPENSION_CLIENTE);
            });
            Pedido pedido = pedidoRepository.findById(pedidoId).orElseThrow();
            reembolsoService.generarNotaYReembolsarTotal(pedido, MotivoNotaCredito.PAGO_TARDIO);
        });

        assertEquals(1, notasDelPedido(pedidoId));
    }
}
