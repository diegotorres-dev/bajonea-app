package com.bajonea.backend.services;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;

import com.bajonea.backend.config.security.ComercioActivo;
import com.bajonea.backend.dto.request.LevantamientoSuspensionRequestDTO;
import com.bajonea.backend.dto.request.SuspensionUsuarioRequestDTO;
import com.bajonea.backend.dto.response.SuspensionDuenoResponseDTO;
import com.bajonea.backend.enums.EstadoComercio;
import com.bajonea.backend.enums.RolActorComercio;
import com.bajonea.backend.services.DatosPruebaEmpleado.Cuenta;
import com.bajonea.backend.services.DatosPruebaEmpleado.Dueno;
import com.bajonea.backend.services.MercadoPagoReembolsoClient.ResultadoReembolsoMp;
import java.time.LocalDateTime;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

/**
 * Base de las pruebas de la suspensión de un Dueño (Fase 5, tramo S3): los servicios, los datos de prueba (Dueños con
 * varios comercios, Empleados, pedidos pagados en cada estado) y las lecturas directas a la base. Mercado Pago y el envío
 * de emails están simulados.
 */
abstract class SuspensionDuenoTestBase extends CarritoIntegrationBase {

    static final String MOTIVO = "Incumplimiento reiterado de las condiciones";

    @Autowired
    protected SuspensionDuenoService suspensionDueno;

    @Autowired
    protected SuspensionComercioService suspensionComercio;

    @Autowired
    protected SuspensionUsuarioService suspensionUsuario;

    @Autowired
    protected AdministradorService administradorService;

    @Autowired
    protected PedidoSchedulerService schedulerService;

    @Autowired
    protected AuthService authService;

    @Autowired
    protected TestSupportService testSupportService;

    @MockitoBean
    protected MercadoPagoReembolsoClient reembolsoClient;

    protected int administradorId;

    @BeforeEach
    void prepararSuspensionDueno() {
        administradorId = jdbcTemplate.queryForObject("SELECT id FROM administrador ORDER BY id LIMIT 1", Integer.class);
        when(reembolsoClient.solicitarReembolsoTotal(any(), any(), anyString())).thenReturn(new ResultadoReembolsoMp(true, "refund", null));
        when(emailService.enviarDuenoSuspendido(anyString(), anyString(), anyList())).thenReturn(ResultadoEnvioEmail.enviado("id"));
        when(emailService.enviarDuenoSuspensionLevantada(anyString(), any(), anyList(), anyList())).thenReturn(ResultadoEnvioEmail.enviado("id"));
        when(emailService.enviarCuentaSuspendida(anyString(), anyString())).thenReturn(ResultadoEnvioEmail.enviado("id"));
        when(emailService.enviarSuspensionLevantada(anyString(), any())).thenReturn(ResultadoEnvioEmail.enviado("id"));
        when(emailService.enviarComercioSuspendido(anyString(), anyString(), anyString())).thenReturn(ResultadoEnvioEmail.enviado("id"));
        when(emailService.enviarComercioSuspensionLevantada(anyString(), anyString(), any())).thenReturn(ResultadoEnvioEmail.enviado("id"));
    }

    protected Dueno duenoActivo() {
        Dueno dueno = comercioApto(true);
        datos.cambiarEstadoUsuario(dueno.id(), "ACTIVO");
        return dueno;
    }

    protected int comercioExtra(Dueno dueno, EstadoComercio estado) {
        return testSupportService.clonarComercio(dueno.comercioId(), "Extra " + DatosPruebaEmpleado.sufijo(), estado);
    }

    protected int empleado(int comercioId) {
        Cuenta cuenta = datos.registrarClienteConCredenciales();
        datos.vincularEmpleado(cuenta.id(), comercioId, "ACTIVO", LocalDateTime.now().minusDays(1));
        return cuenta.id();
    }

    protected ComercioActivo comoEmpleado(Dueno dueno, int comercioId, int empleadoId) {
        return new ComercioActivo(comercioId, dueno.id(), empleadoId, RolActorComercio.EMPLEADO, EstadoComercio.SUSPENDIDO);
    }

    protected SuspensionDuenoResponseDTO suspender(Dueno dueno) {
        return suspensionDueno.suspender(dueno.id(), administradorId, new SuspensionUsuarioRequestDTO(MOTIVO));
    }

    protected SuspensionDuenoResponseDTO levantar(Dueno dueno, String mensaje) {
        return suspensionDueno.levantar(dueno.id(), administradorId, mensaje == null ? null : new LevantamientoSuspensionRequestDTO(mensaje));
    }

    protected int pedido(int comercioId, int duenoId, int clienteId, String estado) {
        jdbcTemplate.update("INSERT INTO pedido (cliente_id, comercio_id, modalidad_entrega, estado, pago_estado, subtotal, "
                + "cargo_servicio_cliente, cargo_servicio_comercio, total, fecha_creacion) "
                + "VALUES (?, ?, 'RETIRO', ?, 'PAGADO', 10000, 200, 100, 10200, ?)",
                clienteId, comercioId, estado, LocalDateTime.now().minusHours(6));
        int id = jdbcTemplate.queryForObject("SELECT LAST_INSERT_ID()", Integer.class);
        if (!estado.equals("PENDIENTE_PAGO")) {
            historial(id, "PENDIENTE_CONFIRMACION_COMERCIO", "SISTEMA", null, 300);
            if (!estado.equals("PENDIENTE_CONFIRMACION_COMERCIO")) {
                historial(id, "EN_PREPARACION", "DUENO", duenoId, 200);
            }
            if (estado.equals("LISTO_PARA_RETIRAR")) {
                historial(id, estado, "DUENO", duenoId, 5);
            }
            jdbcTemplate.update("INSERT INTO pago (pedido_id, monto, mp_estado, id_transaccion_mp, fecha_creacion, fecha_confirmacion) "
                    + "VALUES (?, 10200, 'approved', ?, NOW(), NOW())", id, "sd-" + id);
        }
        return id;
    }

    protected void historial(int pedidoId, String estado, String actorRol, Integer actorUsuarioId, int minutosAtras) {
        jdbcTemplate.update("INSERT INTO historial_estado_pedido (pedido_id, estado, actor_rol, actor_usuario_id, fecha_hora) VALUES (?, ?, ?, ?, ?)",
                pedidoId, estado, actorRol, actorUsuarioId, LocalDateTime.now().minusMinutes(minutosAtras));
    }

    protected int notas(int pedidoId) {
        return jdbcTemplate.queryForObject("SELECT COUNT(*) FROM nota_credito nc JOIN pago pg ON pg.id = nc.pago_id WHERE pg.pedido_id = ?",
                Integer.class, pedidoId);
    }

    protected int filasDeHistorialDePedido(int pedidoId, String estado) {
        return jdbcTemplate.queryForObject("SELECT COUNT(*) FROM historial_estado_pedido WHERE pedido_id = ? AND estado = ?",
                Integer.class, pedidoId, estado);
    }

    protected String estadoComercio(int comercioId) {
        return jdbcTemplate.queryForObject("SELECT estado FROM comercio WHERE id = ?", String.class, comercioId);
    }

    protected String origenSuspension(int comercioId) {
        return jdbcTemplate.queryForObject("SELECT suspension_origen FROM comercio WHERE id = ?", String.class, comercioId);
    }

    protected String estadoUsuario(int usuarioId) {
        return jdbcTemplate.queryForObject("SELECT estado FROM usuario WHERE id = ?", String.class, usuarioId);
    }

    protected int avisos(int usuarioId, String tipo) {
        return jdbcTemplate.queryForObject("SELECT COUNT(*) FROM notificacion WHERE usuario_id = ? AND tipo = ?", Integer.class, usuarioId, tipo);
    }

    protected int sesionesActivas(int usuarioId) {
        return jdbcTemplate.queryForObject("SELECT COUNT(*) FROM sesion WHERE usuario_id = ? AND activa = 1", Integer.class, usuarioId);
    }
}
