package com.bajonea.backend.services;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.reset;
import static org.mockito.Mockito.when;

import com.bajonea.backend.config.security.AuthenticatedUser;
import com.bajonea.backend.dto.request.ReclamoRequestDTO;
import com.bajonea.backend.dto.request.ResolverReclamoRequestDTO;
import com.bajonea.backend.dto.response.ReclamoAdminResponseDTO;
import com.bajonea.backend.dto.response.ReclamoPedidoResponseDTO;
import com.bajonea.backend.enums.MotivoReclamo;
import com.bajonea.backend.enums.RolUsuario;
import com.bajonea.backend.enums.TipoResolucionReclamo;
import com.bajonea.backend.services.DatosPruebaEmpleado.Dueno;
import com.bajonea.backend.services.MercadoPagoReembolsoClient.ResultadoReembolsoMp;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

/**
 * Base de las pruebas de Reclamos (Fase 5, tramo S5): datos únicos por prueba, un pedido entregado con el pago aprobado y
 * la cuenta de Mercado Pago del Dueño vinculada. Mercado Pago y el envío de emails están simulados (los reembolsos
 * aprueban salvo que la prueba diga otra cosa); las pruebas que necesitan el cliente HTTP real contra el Mercado Pago
 * simulado por un servidor local son clases aparte.
 */
@AutoConfigureMockMvc
abstract class ReclamoIntegrationBase extends CarritoIntegrationBase {

    protected static final BigDecimal TOTAL = new BigDecimal("1700.00");
    protected static final String DESCRIPCION = "Faltó la bebida del combo que pedí";

    @MockitoBean
    protected MercadoPagoReembolsoClient reembolsoClient;

    @Autowired
    protected ReclamoService reclamoService;

    @Autowired
    protected ReclamoAdminService reclamoAdmin;

    @Autowired
    protected ReembolsoService reembolsoService;

    @BeforeEach
    void prepararMercadoPagoYEmailsDeReclamos() {
        reset(reembolsoClient);
        when(reembolsoClient.solicitarReembolsoTotal(anyString(), anyString(), anyString()))
                .thenReturn(new ResultadoReembolsoMp(true, "refund-total", null));
        when(reembolsoClient.solicitarReembolsoParcial(anyString(), anyString(), anyString(), any()))
                .thenReturn(new ResultadoReembolsoMp(true, "refund-parcial", null));
        when(emailService.enviarReclamoResuelto(anyString(), any(), org.mockito.ArgumentMatchers.anyBoolean(), any(), any()))
                .thenReturn(ResultadoEnvioEmail.enviado("id"));
    }

    protected Dueno duenoConCuenta() {
        return comercioApto(true);
    }

    protected int adminId() {
        return jdbcTemplate.queryForObject("SELECT id FROM administrador ORDER BY id LIMIT 1", Integer.class);
    }

    protected int pedidoEntregado(int clienteId, Dueno dueno) {
        return pedidoEntregado(clienteId, dueno, "DOMICILIO", LocalDateTime.now().minusHours(2));
    }

    protected int pedidoEntregado(int clienteId, Dueno dueno, String modalidad, LocalDateTime fechaEntrega) {
        int pedidoId = pedido(clienteId, dueno, "ENTREGADO", modalidad, fechaEntrega);
        pagoAprobado(pedidoId);
        return pedidoId;
    }

    protected int pedido(int clienteId, Dueno dueno, String estado, String modalidad, LocalDateTime fechaEntrega) {
        jdbcTemplate.update("INSERT INTO pedido (cliente_id, comercio_id, modalidad_entrega, estado, pago_estado, subtotal, "
                + "cargo_servicio_cliente, cargo_servicio_comercio, total, fecha_creacion, fecha_entrega, fuente_entrega) "
                + "VALUES (?, ?, ?, ?, 'PAGADO', 1500, 200, 100, 1700, ?, ?, ?)",
                clienteId, dueno.comercioId(), modalidad, estado, LocalDateTime.now().minusDays(1), fechaEntrega,
                fechaEntrega == null ? null : "CLIENTE");
        return jdbcTemplate.queryForObject("SELECT LAST_INSERT_ID()", Integer.class);
    }

    protected void pagoAprobado(int pedidoId) {
        jdbcTemplate.update("INSERT INTO pago (pedido_id, monto, mp_preferencia_id, mp_estado, id_transaccion_mp, fecha_confirmacion) "
                + "VALUES (?, 1700, ?, 'approved', ?, NOW())", pedidoId, "pref-" + pedidoId, "mp-" + pedidoId);
    }

    protected void llegoPagado(int pedidoId) {
        jdbcTemplate.update("INSERT INTO historial_estado_pedido (pedido_id, estado, actor_rol, actor_usuario_id, fecha_hora) "
                + "VALUES (?, 'PENDIENTE_CONFIRMACION_COMERCIO', 'SISTEMA', NULL, ?)", pedidoId, LocalDateTime.now().minusDays(1));
    }

    protected void detalle(int pedidoId, int productoId) {
        jdbcTemplate.update("INSERT INTO detalle_pedido (pedido_id, producto_id, cantidad, precio_unitario, subtotal) VALUES (?, ?, 1, 1500, 1500)",
                pedidoId, productoId);
    }

    protected ReclamoRequestDTO reclamoDe(MotivoReclamo motivo) {
        ReclamoRequestDTO request = new ReclamoRequestDTO();
        request.setMotivo(motivo);
        request.setDescripcion(DESCRIPCION);
        return request;
    }

    protected ReclamoPedidoResponseDTO reclamar(int clienteId, int pedidoId) {
        return reclamoService.crear(clienteId, pedidoId, reclamoDe(MotivoReclamo.FALTAN_PRODUCTOS));
    }

    protected int reclamoId(int pedidoId) {
        return jdbcTemplate.queryForObject("SELECT id FROM reclamo WHERE pedido_id = ?", Integer.class, pedidoId);
    }

    protected ResolverReclamoRequestDTO resolucion(TipoResolucionReclamo tipo, String monto, String motivo) {
        ResolverReclamoRequestDTO request = new ResolverReclamoRequestDTO();
        request.setTipo(tipo);
        request.setMonto(monto == null ? null : new BigDecimal(monto));
        request.setMotivo(motivo);
        return request;
    }

    protected ReclamoAdminResponseDTO.Detalle resolverTotal(int pedidoId) {
        return reclamoAdmin.resolver(adminId(), reclamoId(pedidoId), resolucion(TipoResolucionReclamo.REEMBOLSO_TOTAL, null, null));
    }

    protected ReclamoAdminResponseDTO.Detalle resolverParcial(int pedidoId, String monto) {
        return reclamoAdmin.resolver(adminId(), reclamoId(pedidoId), resolucion(TipoResolucionReclamo.REEMBOLSO_PARCIAL, monto, null));
    }

    protected ReclamoAdminResponseDTO.Detalle rechazar(int pedidoId, String motivo) {
        return reclamoAdmin.resolver(adminId(), reclamoId(pedidoId), resolucion(TipoResolucionReclamo.RECHAZO, null, motivo));
    }

    protected List<Map<String, Object>> notasDelPedido(int pedidoId) {
        return jdbcTemplate.queryForList("SELECT nc.* FROM nota_credito nc JOIN pago pg ON pg.id = nc.pago_id WHERE pg.pedido_id = ? ORDER BY nc.id",
                pedidoId);
    }

    protected int notificaciones(int usuarioId, String tipo) {
        return jdbcTemplate.queryForObject("SELECT COUNT(*) FROM notificacion WHERE usuario_id = ? AND tipo = ? AND canal = 'PUSH'",
                Integer.class, usuarioId, tipo);
    }

    protected String mensajeDeLaNotificacion(int usuarioId, String tipo) {
        return jdbcTemplate.queryForObject("SELECT mensaje FROM notificacion WHERE usuario_id = ? AND tipo = ? AND canal = 'PUSH' ORDER BY id DESC LIMIT 1",
                String.class, usuarioId, tipo);
    }

    protected void suspenderCuenta(int usuarioId) {
        jdbcTemplate.update("UPDATE usuario SET estado = 'SUSPENDIDO', motivo_suspension = 'prueba', suspendido_desde = NOW() WHERE id = ?", usuarioId);
    }

    protected void desvincularCuentaMp(int duenoId) {
        jdbcTemplate.update("UPDATE cuenta_mercado_pago SET activa = 0 WHERE dueno_id = ?", duenoId);
    }

    protected RequestPostProcessor como(RolUsuario rol, int usuarioId) {
        return org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication(
                new UsernamePasswordAuthenticationToken(new AuthenticatedUser(usuarioId, 1, rol), null,
                        List.of(new SimpleGrantedAuthority("ROLE_" + rol.name()))));
    }

    protected static void exigirOk(List<Object> resultados) {
        for (Object resultado : resultados) {
            if (resultado instanceof Throwable t) {
                throw new AssertionError("Una de las tareas falló: " + t, t);
            }
        }
    }
}
