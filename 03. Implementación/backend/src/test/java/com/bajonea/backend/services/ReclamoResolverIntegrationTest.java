package com.bajonea.backend.services;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.bajonea.backend.dto.response.PedidoResponseDTO;
import com.bajonea.backend.dto.response.ReclamoAdminResponseDTO;
import com.bajonea.backend.dto.response.ReclamoPedidoResponseDTO;
import com.bajonea.backend.enums.EstadoReclamo;
import com.bajonea.backend.enums.TipoResolucionReclamo;
import com.bajonea.backend.exceptions.ConflictoDeNegocioException;
import com.bajonea.backend.exceptions.RecursoNoEncontradoException;
import com.bajonea.backend.exceptions.ValidacionCamposException;
import com.bajonea.backend.services.DatosPruebaEmpleado.Dueno;
import com.bajonea.backend.services.MercadoPagoReembolsoClient.ResultadoReembolsoMp;
import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

/**
 * Resolver un reclamo (Fase 5, tramo S5): el reembolso total, el parcial con su tope por saldo, el rechazo, la nota de
 * crédito ligada, lo que pasa cuando Mercado Pago falla o la cuenta del Dueño está desvinculada, los avisos y que una
 * resolución sea final.
 */
class ReclamoResolverIntegrationTest extends ReclamoIntegrationBase {

    private int pedidoReclamado(Dueno dueno, int cliente) {
        int pedidoId = pedidoEntregado(cliente, dueno);
        reclamar(cliente, pedidoId);
        return pedidoId;
    }

    @Test
    void elReembolsoTotalCreaUnaNotaPorElTotalYLaLigaAlReclamo() {
        Dueno dueno = duenoConCuenta();
        int cliente = datos.registrarCliente();
        int pedidoId = pedidoReclamado(dueno, cliente);

        ReclamoAdminResponseDTO.Detalle detalle = resolverTotal(pedidoId);

        assertEquals(EstadoReclamo.APROBADO, detalle.estado());
        assertEquals(TipoResolucionReclamo.REEMBOLSO_TOTAL, detalle.tipoResolucion());
        assertEquals(0, TOTAL.compareTo(detalle.montoAprobado()));
        List<Map<String, Object>> notas = notasDelPedido(pedidoId);
        assertEquals(1, notas.size());
        assertEquals("RECLAMO", notas.get(0).get("motivo"));
        assertEquals(reclamoId(pedidoId), notas.get(0).get("reclamo_id"));
        assertEquals(0, TOTAL.compareTo((BigDecimal) notas.get(0).get("monto")));
        assertEquals("PROCESADO", notas.get(0).get("estado"));
        assertEquals(adminId(), jdbcTemplate.queryForObject("SELECT administrador_id FROM reclamo WHERE pedido_id = ?", Integer.class, pedidoId));
        assertNotNull(jdbcTemplate.queryForObject("SELECT fecha_resolucion FROM reclamo WHERE pedido_id = ?", java.sql.Timestamp.class, pedidoId));
        assertEquals("ENTREGADO", estadoDelPedido(pedidoId));
        verify(reembolsoClient).solicitarReembolsoTotal(eq("mp-" + pedidoId), anyString(), eq("nc-" + notas.get(0).get("id") + "-1"));
        verify(reembolsoClient, never()).solicitarReembolsoParcial(anyString(), anyString(), anyString(), any());
        assertFalse(detalle.reembolsoEnProceso());
    }

    @Test
    void elReembolsoParcialMandaSuMontoAMercadoPago() {
        Dueno dueno = duenoConCuenta();
        int cliente = datos.registrarCliente();
        int pedidoId = pedidoReclamado(dueno, cliente);

        ReclamoAdminResponseDTO.Detalle detalle = resolverParcial(pedidoId, "500.50");

        assertEquals(TipoResolucionReclamo.REEMBOLSO_PARCIAL, detalle.tipoResolucion());
        assertEquals(0, new BigDecimal("500.50").compareTo(detalle.montoAprobado()));
        Map<String, Object> nota = notasDelPedido(pedidoId).get(0);
        assertEquals(0, new BigDecimal("500.50").compareTo((BigDecimal) nota.get("monto")));
        verify(reembolsoClient).solicitarReembolsoParcial(eq("mp-" + pedidoId), anyString(), eq("nc-" + nota.get("id") + "-1"),
                eq(new BigDecimal("500.50")));
        verify(reembolsoClient, never()).solicitarReembolsoTotal(anyString(), anyString(), anyString());
        assertEquals(0, new BigDecimal("1199.50").compareTo(detalle.saldoReembolsable()));
    }

    @Test
    void elRechazoGuardaElMotivoYNoCreaNota() {
        Dueno dueno = duenoConCuenta();
        int cliente = datos.registrarCliente();
        int pedidoId = pedidoReclamado(dueno, cliente);

        ReclamoAdminResponseDTO.Detalle detalle = rechazar(pedidoId, "  El pedido se entregó completo según el repartidor  ");

        assertEquals(EstadoReclamo.RECHAZADO, detalle.estado());
        assertEquals(TipoResolucionReclamo.RECHAZO, detalle.tipoResolucion());
        assertEquals("El pedido se entregó completo según el repartidor", detalle.notaResolucion());
        assertNull(detalle.montoAprobado());
        assertEquals(0, notasDelPedido(pedidoId).size());
        assertEquals(0, notificaciones(dueno.id(), "RECLAMO_REEMBOLSO_DUENO"));
        verify(reembolsoClient, never()).solicitarReembolsoTotal(anyString(), anyString(), anyString());
    }

    @ParameterizedTest
    @ValueSource(strings = {"0", "-5", "0.00"})
    void unParcialCeroONegativoSeRechazaYNoDejaNada(String monto) {
        Dueno dueno = duenoConCuenta();
        int cliente = datos.registrarCliente();
        int pedidoId = pedidoReclamado(dueno, cliente);

        ValidacionCamposException ex = assertThrows(ValidacionCamposException.class, () -> resolverParcial(pedidoId, monto));

        assertEquals("El monto tiene que ser mayor a cero.", ex.getErrores().get("monto"));
        assertSinResolver(pedidoId);
    }

    @Test
    void unParcialIgualAlSaldoPideElReembolsoTotalYNoDejaNada() {
        Dueno dueno = duenoConCuenta();
        int cliente = datos.registrarCliente();
        int pedidoId = pedidoReclamado(dueno, cliente);

        ValidacionCamposException ex = assertThrows(ValidacionCamposException.class, () -> resolverParcial(pedidoId, "1700"));

        assertEquals("Para devolver todo, elegí reembolso total.", ex.getErrores().get("monto"));
        assertSinResolver(pedidoId);
    }

    @Test
    void unParcialMayorAlSaldoSeRechazaYNoDejaNada() {
        Dueno dueno = duenoConCuenta();
        int cliente = datos.registrarCliente();
        int pedidoId = pedidoReclamado(dueno, cliente);

        ValidacionCamposException ex = assertThrows(ValidacionCamposException.class, () -> resolverParcial(pedidoId, "1700.01"));

        assertEquals("El monto supera lo que queda por reembolsar ($1700.00).", ex.getErrores().get("monto"));
        assertSinResolver(pedidoId);
    }

    @Test
    void elSaldoDescuentaLasNotasVivasDeOtrosMotivosYNoLasFallidas() {
        Dueno dueno = duenoConCuenta();
        int cliente = datos.registrarCliente();
        int pedidoId = pedidoReclamado(dueno, cliente);
        int pagoId = jdbcTemplate.queryForObject("SELECT id FROM pago WHERE pedido_id = ?", Integer.class, pedidoId);
        jdbcTemplate.update("INSERT INTO nota_credito (pago_id, monto, motivo, estado, intentos) VALUES (?, 500, 'CANCELACION_CLIENTE', 'PROCESADO', 1)", pagoId);
        jdbcTemplate.update("INSERT INTO nota_credito (pago_id, monto, motivo, estado, intentos) VALUES (?, 300, 'ANULACION_COMERCIO', 'FALLIDO', 1)", pagoId);

        ValidacionCamposException ex = assertThrows(ValidacionCamposException.class, () -> resolverParcial(pedidoId, "1200"));
        assertEquals("Para devolver todo, elegí reembolso total.", ex.getErrores().get("monto"));
        ReclamoAdminResponseDTO.Detalle total = resolverTotal(pedidoId);

        assertEquals(0, new BigDecimal("1200.00").compareTo(total.montoAprobado()));
        Map<String, Object> nota = notasDelPedido(pedidoId).stream().filter(n -> "RECLAMO".equals(n.get("motivo"))).findFirst().orElseThrow();
        assertEquals(0, new BigDecimal("1200.00").compareTo((BigDecimal) nota.get("monto")));
        verify(reembolsoClient).solicitarReembolsoParcial(eq("mp-" + pedidoId), anyString(), anyString(), eq(new BigDecimal("1200.00")));
    }

    @Test
    void unTotalSinNadaParaReembolsarSeRechaza() {
        Dueno dueno = duenoConCuenta();
        int cliente = datos.registrarCliente();
        int pedidoId = pedidoReclamado(dueno, cliente);
        int pagoId = jdbcTemplate.queryForObject("SELECT id FROM pago WHERE pedido_id = ?", Integer.class, pedidoId);
        jdbcTemplate.update("INSERT INTO nota_credito (pago_id, monto, motivo, estado, intentos) VALUES (?, 1700, 'CANCELACION_CLIENTE', 'PROCESADO', 1)", pagoId);

        assertThrows(ConflictoDeNegocioException.class, () -> resolverTotal(pedidoId));

        assertEquals(1, notasDelPedido(pedidoId).size());
        assertEquals("PENDIENTE", jdbcTemplate.queryForObject("SELECT estado FROM reclamo WHERE pedido_id = ?", String.class, pedidoId));
    }

    @Test
    void unaResolucionEsFinal() {
        Dueno dueno = duenoConCuenta();
        int cliente = datos.registrarCliente();
        int pedidoId = pedidoReclamado(dueno, cliente);
        resolverParcial(pedidoId, "100");

        assertEquals("Este reclamo ya fue resuelto.", assertThrows(ConflictoDeNegocioException.class, () -> resolverTotal(pedidoId)).getMessage());
        assertEquals("Este reclamo ya fue resuelto.",
                assertThrows(ConflictoDeNegocioException.class, () -> rechazar(pedidoId, "Un motivo cualquiera largo")).getMessage());
        assertEquals("Este reclamo ya fue resuelto.", assertThrows(ConflictoDeNegocioException.class, () -> resolverParcial(pedidoId, "50")).getMessage());

        assertEquals(1, notasDelPedido(pedidoId).size());
        assertEquals("APROBADO", jdbcTemplate.queryForObject("SELECT estado FROM reclamo WHERE pedido_id = ?", String.class, pedidoId));
    }

    @Test
    void unReclamoInexistenteEsNoEncontrado() {
        assertThrows(RecursoNoEncontradoException.class,
                () -> reclamoAdmin.resolver(adminId(), 999_999_999, resolucion(TipoResolucionReclamo.REEMBOLSO_TOTAL, null, null)));
        assertThrows(RecursoNoEncontradoException.class, () -> reclamoAdmin.detalle(999_999_999));
    }

    @Test
    void laFormaDeLaResolucionSeValida() {
        Dueno dueno = duenoConCuenta();
        int cliente = datos.registrarCliente();
        int pedidoId = pedidoReclamado(dueno, cliente);
        int id = reclamoId(pedidoId);

        assertEquals("Escribí el motivo del rechazo en entre 10 y 500 caracteres", assertThrows(ValidacionCamposException.class,
                () -> reclamoAdmin.resolver(adminId(), id, resolucion(TipoResolucionReclamo.RECHAZO, null, "corto"))).getErrores().get("motivo"));
        assertEquals("Escribí el motivo del rechazo en entre 10 y 500 caracteres", assertThrows(ValidacionCamposException.class,
                () -> reclamoAdmin.resolver(adminId(), id, resolucion(TipoResolucionReclamo.RECHAZO, null, "   corto   "))).getErrores().get("motivo"));
        assertEquals("Escribí el motivo del rechazo en entre 10 y 500 caracteres", assertThrows(ValidacionCamposException.class,
                () -> reclamoAdmin.resolver(adminId(), id, resolucion(TipoResolucionReclamo.RECHAZO, null, "x".repeat(501)))).getErrores().get("motivo"));
        assertEquals("Un rechazo no lleva monto", assertThrows(ValidacionCamposException.class,
                () -> reclamoAdmin.resolver(adminId(), id, resolucion(TipoResolucionReclamo.RECHAZO, "10", "Un motivo suficiente"))).getErrores().get("monto"));
        assertEquals("Indicá cuánto devolver", assertThrows(ValidacionCamposException.class,
                () -> reclamoAdmin.resolver(adminId(), id, resolucion(TipoResolucionReclamo.REEMBOLSO_PARCIAL, null, null))).getErrores().get("monto"));
        assertEquals("El reembolso total no lleva monto", assertThrows(ValidacionCamposException.class,
                () -> reclamoAdmin.resolver(adminId(), id, resolucion(TipoResolucionReclamo.REEMBOLSO_TOTAL, "10", null))).getErrores().get("monto"));
        assertEquals(EstadoReclamo.RECHAZADO,
                reclamoAdmin.resolver(adminId(), id, resolucion(TipoResolucionReclamo.RECHAZO, null, "x".repeat(500))).estado());
    }

    @Test
    void siMercadoPagoFallaElReclamoQuedaAprobadoConLaNotaFallidaYElMotivo() {
        Dueno dueno = duenoConCuenta();
        int cliente = datos.registrarCliente();
        int pedidoId = pedidoReclamado(dueno, cliente);
        when(reembolsoClient.solicitarReembolsoParcial(anyString(), anyString(), anyString(), any())).thenReturn(ResultadoReembolsoMp
                .fallido("El comercio no tiene saldo suficiente en Mercado Pago para este reembolso. Mercado Pago respondió 400: insufficient funds"));

        ReclamoAdminResponseDTO.Detalle detalle = resolverParcial(pedidoId, "400");

        assertEquals(EstadoReclamo.APROBADO, detalle.estado());
        assertEquals("FALLIDO", notasDelPedido(pedidoId).get(0).get("estado"));
        ReclamoAdminResponseDTO.Detalle actualizado = reclamoAdmin.detalle(detalle.id());
        assertTrue(actualizado.reembolsoEnProceso());
        assertEquals("FALLIDO", actualizado.reembolso().estado().name());
        assertTrue(actualizado.reembolso().ultimoError().startsWith("El comercio no tiene saldo suficiente"));
        List<PedidoResponseDTO> delCliente = pedidoService.listarPedidosCliente(cliente);
        ReclamoPedidoResponseDTO bloque = ReclamoCrearIntegrationTest.bloqueDe(delCliente, pedidoId);
        assertTrue(bloque.reembolsoEnProceso());
        assertEquals(EstadoReclamo.APROBADO, bloque.estado());
        assertEquals(1, notificaciones(cliente, "RECLAMO_APROBADO"));
    }

    @Test
    void elReintentoDeUnParcialMandaElMontoDeLaNotaYNoElDelPago() {
        Dueno dueno = duenoConCuenta();
        int cliente = datos.registrarCliente();
        int pedidoId = pedidoReclamado(dueno, cliente);
        when(reembolsoClient.solicitarReembolsoParcial(anyString(), anyString(), anyString(), any()))
                .thenReturn(ResultadoReembolsoMp.fallido("Mercado Pago respondió 500: error"));
        resolverParcial(pedidoId, "400");
        int notaId = ((Number) notasDelPedido(pedidoId).get(0).get("id")).intValue();
        when(reembolsoClient.solicitarReembolsoParcial(anyString(), anyString(), anyString(), any()))
                .thenReturn(new ResultadoReembolsoMp(true, "refund-2", null));

        reembolsoService.reintentarNotaCredito(notaId);

        verify(reembolsoClient, times(2)).solicitarReembolsoParcial(eq("mp-" + pedidoId), anyString(), anyString(), eq(new BigDecimal("400.00")));
        verify(reembolsoClient).solicitarReembolsoParcial(anyString(), anyString(), eq("nc-" + notaId + "-2"), any());
        verify(reembolsoClient, never()).solicitarReembolsoTotal(anyString(), anyString(), anyString());
        assertEquals("PROCESADO", notasDelPedido(pedidoId).get(0).get("estado"));
        assertFalse(reclamoAdmin.detalle(reclamoId(pedidoId)).reembolsoEnProceso());
    }

    @Test
    void elReintentoDeUnTotalDeReclamoSigueSiendoUnReembolsoTotal() {
        Dueno dueno = duenoConCuenta();
        int cliente = datos.registrarCliente();
        int pedidoId = pedidoReclamado(dueno, cliente);
        when(reembolsoClient.solicitarReembolsoTotal(anyString(), anyString(), anyString()))
                .thenReturn(ResultadoReembolsoMp.fallido("Mercado Pago respondió 500: error"));
        resolverTotal(pedidoId);
        int notaId = ((Number) notasDelPedido(pedidoId).get(0).get("id")).intValue();
        when(reembolsoClient.solicitarReembolsoTotal(anyString(), anyString(), anyString()))
                .thenReturn(new ResultadoReembolsoMp(true, "refund-2", null));

        reembolsoService.reintentarNotaCredito(notaId);

        verify(reembolsoClient, times(2)).solicitarReembolsoTotal(eq("mp-" + pedidoId), anyString(), anyString());
        verify(reembolsoClient, never()).solicitarReembolsoParcial(anyString(), anyString(), anyString(), any());
        assertEquals("PROCESADO", notasDelPedido(pedidoId).get(0).get("estado"));
    }

    @Test
    void conLaCuentaDelDuenoDesvinculadaLaNotaQuedaEnRevisionManualYElReclamoAprobado() {
        Dueno dueno = duenoConCuenta();
        int cliente = datos.registrarCliente();
        int pedidoId = pedidoReclamado(dueno, cliente);
        desvincularCuentaMp(dueno.id());

        ReclamoAdminResponseDTO.Detalle detalle = resolverParcial(pedidoId, "300");

        assertEquals(EstadoReclamo.APROBADO, detalle.estado());
        Map<String, Object> nota = notasDelPedido(pedidoId).get(0);
        assertEquals("PENDIENTE_REVISION_MANUAL", nota.get("estado"));
        assertEquals(0, new BigDecimal("300.00").compareTo((BigDecimal) nota.get("monto")));
        verify(reembolsoClient, never()).solicitarReembolsoParcial(anyString(), anyString(), anyString(), any());
        assertTrue(reclamoAdmin.detalle(detalle.id()).reembolsoEnProceso());
    }

    @Test
    void elClienteRecibeElAvisoYElEmailYElDuenoSoloSiHuboReembolso() {
        Dueno dueno = duenoConCuenta();
        int cliente = datos.registrarCliente();
        int aprobado = pedidoReclamado(dueno, cliente);
        int rechazado = pedidoReclamado(dueno, cliente);

        resolverParcial(aprobado, "250");
        rechazar(rechazado, "El comercio demostró que entregó todo");

        assertEquals(1, notificaciones(cliente, "RECLAMO_APROBADO"));
        assertEquals("Aprobamos tu reclamo del pedido #" + aprobado + " y te vamos a devolver $250. El reembolso puede tardar unos días en acreditarse.",
                mensajeDeLaNotificacion(cliente, "RECLAMO_APROBADO"));
        assertEquals(1, notificaciones(cliente, "RECLAMO_RECHAZADO"));
        assertEquals("Revisamos tu reclamo del pedido #" + rechazado + " y no pudimos aprobarlo. Motivo: El comercio demostró que entregó todo",
                mensajeDeLaNotificacion(cliente, "RECLAMO_RECHAZADO"));
        assertEquals(1, notificaciones(dueno.id(), "RECLAMO_REEMBOLSO_DUENO"));
        assertEquals("Reembolsamos $250 al Cliente por un reclamo del pedido #" + aprobado
                + ". Mercado Pago lo descuenta de tu cuenta en la parte que te corresponde.",
                mensajeDeLaNotificacion(dueno.id(), "RECLAMO_REEMBOLSO_DUENO"));
        assertEquals(dueno.comercioId(), jdbcTemplate.queryForObject(
                "SELECT comercio_id FROM notificacion WHERE usuario_id = ? AND tipo = 'RECLAMO_REEMBOLSO_DUENO'", Integer.class, dueno.id()));
        verify(emailService).enviarReclamoResuelto(anyString(), eq(aprobado), eq(true), eq(new BigDecimal("250.00")), eq(null));
        verify(emailService).enviarReclamoResuelto(anyString(), eq(rechazado), eq(false), eq(null), eq("El comercio demostró que entregó todo"));
        assertEquals(2, jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM notificacion WHERE usuario_id = ? AND canal = 'EMAIL' AND estado = 'ENVIADO'", Integer.class, cliente));
    }

    @Test
    void siElEmailFallaQuedaElRastroFallidoYLaResolucionSigueVigente() {
        Dueno dueno = duenoConCuenta();
        int cliente = datos.registrarCliente();
        int pedidoId = pedidoReclamado(dueno, cliente);
        when(emailService.enviarReclamoResuelto(anyString(), any(), anyBoolean(), any(), any())).thenReturn(ResultadoEnvioEmail.fallido(503, "caído"));

        resolverTotal(pedidoId);

        assertEquals(1, jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM notificacion WHERE usuario_id = ? AND canal = 'EMAIL' AND estado = 'FALLIDO' AND tipo = 'RECLAMO_APROBADO'",
                Integer.class, cliente));
        assertEquals("APROBADO", jdbcTemplate.queryForObject("SELECT estado FROM reclamo WHERE pedido_id = ?", String.class, pedidoId));
    }

    @Test
    void unaResolucionQueSeRevierteNoEnviaEmailNiPideElReembolsoNiDejaAvisos() {
        Dueno dueno = duenoConCuenta();
        int cliente = datos.registrarCliente();
        int pedidoId = pedidoReclamado(dueno, cliente);

        assertThrows(ValidacionCamposException.class, () -> resolverParcial(pedidoId, "1700"));

        verify(emailService, never()).enviarReclamoResuelto(anyString(), any(), anyBoolean(), any(), any());
        verify(reembolsoClient, never()).solicitarReembolsoParcial(anyString(), anyString(), anyString(), any());
        verify(reembolsoClient, never()).solicitarReembolsoTotal(anyString(), anyString(), anyString());
        assertEquals(0, notificaciones(cliente, "RECLAMO_APROBADO"));
        assertEquals(0, notificaciones(dueno.id(), "RECLAMO_REEMBOLSO_DUENO"));
    }

    @Test
    void elDuenoVeElReclamoSinElMensajeYElDetalleDelAdministradorLoTrae() {
        Dueno dueno = duenoConCuenta();
        int cliente = datos.registrarCliente();
        int pedidoId = pedidoReclamado(dueno, cliente);
        detalle(pedidoId, producto(dueno));
        llegoPagado(pedidoId);

        ReclamoAdminResponseDTO.Detalle antes = reclamoAdmin.detalle(reclamoId(pedidoId));
        assertEquals(DESCRIPCION, antes.descripcion());
        assertEquals(1, antes.pedido().detalles().size());
        assertEquals(dueno.comercioId(), antes.pedido().comercioId());
        assertEquals(cliente, antes.pedido().clienteUsuarioId());
        assertEquals(0, TOTAL.compareTo(antes.saldoReembolsable()));
        assertNull(antes.reembolso());
        assertNotNull(antes.fechaLimiteReclamo());

        resolverParcial(pedidoId, "100");

        PedidoResponseDTO delDueno = pedidoService.listarPedidosComercio(dueno.comercioId()).stream()
                .filter(p -> p.getId() == pedidoId).findFirst().orElseThrow();
        ReclamoPedidoResponseDTO bloque = delDueno.getReclamo();
        assertEquals(EstadoReclamo.APROBADO, bloque.estado());
        assertEquals(TipoResolucionReclamo.REEMBOLSO_PARCIAL, bloque.tipoResolucion());
        assertEquals(0, new BigDecimal("100.00").compareTo(bloque.montoAprobado()));
        assertNull(bloque.puedeReclamar());
        assertNull(bloque.fechaLimiteReclamo());
        assertNull(bloque.motivoRechazo());
        assertNull(delDueno.getReembolsoEstado());
        assertNull(delDueno.getReembolsoMonto());
        assertNull(delDueno.getReembolsoMotivo());
    }

    @Test
    void laNotaDeUnReclamoNoSeMezclaConLosCamposDeReembolsoDelPedido() {
        Dueno dueno = duenoConCuenta();
        int cliente = datos.registrarCliente();
        int pedidoId = pedidoReclamado(dueno, cliente);
        resolverTotal(pedidoId);

        PedidoResponseDTO delCliente = pedidoService.listarPedidosCliente(cliente).stream()
                .filter(p -> p.getId() == pedidoId).findFirst().orElseThrow();

        assertNull(delCliente.getReembolsoEstado());
        assertNull(delCliente.getReembolsoMonto());
        assertNull(delCliente.getReembolsoMotivo());
        assertEquals(EstadoReclamo.APROBADO, delCliente.getReclamo().estado());
    }

    @Test
    void elUnicoDeReclamoIdPermiteUnaSolaNotaPorReclamoYVariasNotasSinReclamo() {
        Dueno dueno = duenoConCuenta();
        int cliente = datos.registrarCliente();
        int pedidoId = pedidoReclamado(dueno, cliente);
        int pagoId = jdbcTemplate.queryForObject("SELECT id FROM pago WHERE pedido_id = ?", Integer.class, pedidoId);
        int reclamo = reclamoId(pedidoId);

        jdbcTemplate.update("INSERT INTO nota_credito (pago_id, reclamo_id, monto, motivo, estado, intentos) VALUES (?, ?, 100, 'RECLAMO', 'PENDIENTE', 0)", pagoId, reclamo);
        assertThrows(org.springframework.dao.DuplicateKeyException.class, () -> jdbcTemplate.update(
                "INSERT INTO nota_credito (pago_id, reclamo_id, monto, motivo, estado, intentos) VALUES (?, ?, 100, 'RECLAMO', 'PENDIENTE', 0)", pagoId, reclamo));
        jdbcTemplate.update("INSERT INTO nota_credito (pago_id, monto, motivo, estado, intentos) VALUES (?, 10, 'CANCELACION_CLIENTE', 'PENDIENTE', 0)", pagoId);
        jdbcTemplate.update("INSERT INTO nota_credito (pago_id, monto, motivo, estado, intentos) VALUES (?, 10, 'CANCELACION_CLIENTE', 'PENDIENTE', 0)", pagoId);

        assertEquals(3, notasDelPedido(pedidoId).size());
    }

    private void assertSinResolver(int pedidoId) {
        assertEquals("PENDIENTE", jdbcTemplate.queryForObject("SELECT estado FROM reclamo WHERE pedido_id = ?", String.class, pedidoId));
        assertEquals(0, notasDelPedido(pedidoId).size());
        verify(reembolsoClient, never()).solicitarReembolsoParcial(anyString(), anyString(), anyString(), any());
        verify(reembolsoClient, never()).solicitarReembolsoTotal(anyString(), anyString(), anyString());
    }
}
