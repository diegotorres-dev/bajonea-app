package com.bajonea.backend.services;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.bajonea.backend.dto.request.ReclamoRequestDTO;
import com.bajonea.backend.dto.response.PedidoResponseDTO;
import com.bajonea.backend.dto.response.ReclamoPedidoResponseDTO;
import com.bajonea.backend.enums.EstadoReclamo;
import com.bajonea.backend.enums.MotivoReclamo;
import com.bajonea.backend.exceptions.ConflictoDeNegocioException;
import com.bajonea.backend.exceptions.CuentaSuspendidaException;
import com.bajonea.backend.exceptions.RecursoNoEncontradoException;
import com.bajonea.backend.exceptions.ValidacionCamposException;
import com.bajonea.backend.services.DatosPruebaEmpleado.Dueno;
import java.time.LocalDateTime;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.junit.jupiter.params.provider.ValueSource;

/**
 * Crear un reclamo (Fase 5, tramo S5): quién puede reclamar qué pedido, el plazo de 7 días desde la entrega, la modalidad,
 * un reclamo por pedido y que crear no cambie el pedido ni avise a nadie.
 */
class ReclamoCrearIntegrationTest extends ReclamoIntegrationBase {

    @Test
    void unPedidoEntregadoSeReclamaYQuedaPendienteSinTocarElPedido() {
        Dueno dueno = duenoConCuenta();
        int cliente = datos.registrarCliente();
        int pedidoId = pedidoEntregado(cliente, dueno);

        ReclamoPedidoResponseDTO bloque = reclamar(cliente, pedidoId);

        assertEquals(EstadoReclamo.PENDIENTE, bloque.estado());
        assertEquals(MotivoReclamo.FALTAN_PRODUCTOS, bloque.motivo());
        assertFalse(bloque.puedeReclamar());
        assertNotNull(bloque.id());
        assertEquals("ENTREGADO", estadoDelPedido(pedidoId));
        assertEquals(DESCRIPCION, jdbcTemplate.queryForObject("SELECT descripcion FROM reclamo WHERE pedido_id = ?", String.class, pedidoId));
        assertEquals(0, notificaciones(adminId(), "NUEVO_RECLAMO"));
        assertEquals(0, notificaciones(cliente, "RECLAMO_APROBADO"));
        assertEquals(0, notasDelPedido(pedidoId).size());
    }

    @ParameterizedTest
    @EnumSource(MotivoReclamo.class)
    void cadaMotivoSeAceptaEnUnPedidoADomicilio(MotivoReclamo motivo) {
        Dueno dueno = duenoConCuenta();
        int cliente = datos.registrarCliente();
        int pedidoId = pedidoEntregado(cliente, dueno);

        ReclamoPedidoResponseDTO bloque = reclamoService.crear(cliente, pedidoId, reclamoDe(motivo));

        assertEquals(motivo, bloque.motivo());
    }

    @Test
    void elSegundoReclamoDelMismoPedidoRecibeElMismoConflicto() {
        Dueno dueno = duenoConCuenta();
        int cliente = datos.registrarCliente();
        int pedidoId = pedidoEntregado(cliente, dueno);
        reclamar(cliente, pedidoId);

        ConflictoDeNegocioException ex = assertThrows(ConflictoDeNegocioException.class, () -> reclamar(cliente, pedidoId));

        assertEquals("Ya hiciste un reclamo por este pedido.", ex.getMessage());
        assertEquals(1, jdbcTemplate.queryForObject("SELECT COUNT(*) FROM reclamo WHERE pedido_id = ?", Integer.class, pedidoId));
    }

    @ParameterizedTest
    @ValueSource(strings = {"PENDIENTE_PAGO", "EN_PREPARACION", "EN_CAMINO", "LISTO_PARA_RETIRAR", "NO_RETIRADO", "RECHAZADO",
            "CANCELADO", "ANULADO", "CANCELADO_POR_SISTEMA", "EXPIRADO", "PENDIENTE_CONFIRMACION_COMERCIO"})
    void unPedidoQueNoEstaEntregadoNoSeReclama(String estado) {
        Dueno dueno = duenoConCuenta();
        int cliente = datos.registrarCliente();
        int pedidoId = pedido(cliente, dueno, estado, "DOMICILIO", null);
        pagoAprobado(pedidoId);

        ConflictoDeNegocioException ex = assertThrows(ConflictoDeNegocioException.class, () -> reclamar(cliente, pedidoId));

        assertEquals("Solo podés reclamar un pedido que ya te entregaron.", ex.getMessage());
        assertEquals(0, jdbcTemplate.queryForObject("SELECT COUNT(*) FROM reclamo WHERE pedido_id = ?", Integer.class, pedidoId));
    }

    @Test
    void sinPagoAprobadoNoSeReclama() {
        Dueno dueno = duenoConCuenta();
        int cliente = datos.registrarCliente();
        int pedidoId = pedido(cliente, dueno, "ENTREGADO", "DOMICILIO", LocalDateTime.now().minusHours(1));

        assertEquals("Este pedido no tiene un pago aprobado, así que no se puede reclamar.",
                assertThrows(ConflictoDeNegocioException.class, () -> reclamar(cliente, pedidoId)).getMessage());

        jdbcTemplate.update("INSERT INTO pago (pedido_id, monto, mp_preferencia_id) VALUES (?, 1700, 'pref')", pedidoId);
        assertEquals("Este pedido no tiene un pago aprobado, así que no se puede reclamar.",
                assertThrows(ConflictoDeNegocioException.class, () -> reclamar(cliente, pedidoId)).getMessage());
    }

    @Test
    void sinFechaDeEntregaNoSeReclama() {
        Dueno dueno = duenoConCuenta();
        int cliente = datos.registrarCliente();
        int pedidoId = pedido(cliente, dueno, "ENTREGADO", "DOMICILIO", null);
        pagoAprobado(pedidoId);

        assertEquals("No pudimos verificar la fecha de entrega de este pedido, así que no se puede reclamar.",
                assertThrows(ConflictoDeNegocioException.class, () -> reclamar(cliente, pedidoId)).getMessage());
    }

    @Test
    void elPlazoSonSieteDiasCorridosDesdeLaEntrega() {
        Dueno dueno = duenoConCuenta();
        int cliente = datos.registrarCliente();
        int dentro = pedidoEntregado(cliente, dueno, "DOMICILIO", LocalDateTime.now().minusDays(7).plusMinutes(5));
        int fuera = pedidoEntregado(cliente, dueno, "DOMICILIO", LocalDateTime.now().minusDays(7).minusMinutes(5));

        assertEquals(EstadoReclamo.PENDIENTE, reclamar(cliente, dentro).estado());
        ConflictoDeNegocioException ex = assertThrows(ConflictoDeNegocioException.class, () -> reclamar(cliente, fuera));
        assertEquals("Pasaron los 7 días para reclamar este pedido.", ex.getMessage());
    }

    @Test
    void noRecibiElPedidoSoloVaEnLosPedidosADomicilio() {
        Dueno dueno = duenoConCuenta();
        int cliente = datos.registrarCliente();
        int retiro = pedidoEntregado(cliente, dueno, "RETIRO", LocalDateTime.now().minusHours(1));

        ValidacionCamposException ex = assertThrows(ValidacionCamposException.class,
                () -> reclamoService.crear(cliente, retiro, reclamoDe(MotivoReclamo.NO_RECIBI_PEDIDO)));

        assertEquals("Este pedido era para retirar en el local. Elegí otro motivo.", ex.getErrores().get("motivo"));
        assertEquals(0, jdbcTemplate.queryForObject("SELECT COUNT(*) FROM reclamo WHERE pedido_id = ?", Integer.class, retiro));
        assertEquals(EstadoReclamo.PENDIENTE, reclamoService.crear(cliente, retiro, reclamoDe(MotivoReclamo.PRODUCTO_EN_MAL_ESTADO)).estado());
    }

    @Test
    void unPedidoAjenoOInexistenteEsNoEncontrado() {
        Dueno dueno = duenoConCuenta();
        int cliente = datos.registrarCliente();
        int otro = datos.registrarCliente();
        int pedidoId = pedidoEntregado(cliente, dueno);

        assertThrows(RecursoNoEncontradoException.class, () -> reclamar(otro, pedidoId));
        assertThrows(RecursoNoEncontradoException.class, () -> reclamar(cliente, 999_999_999));
        assertEquals(0, jdbcTemplate.queryForObject("SELECT COUNT(*) FROM reclamo WHERE pedido_id = ?", Integer.class, pedidoId));
    }

    @Test
    void unClienteSuspendidoNoPuedeCrearReclamos() {
        Dueno dueno = duenoConCuenta();
        int cliente = datos.registrarCliente();
        int pedidoId = pedidoEntregado(cliente, dueno);
        suspenderCuenta(cliente);

        assertThrows(CuentaSuspendidaException.class, () -> reclamar(cliente, pedidoId));
        assertEquals(0, jdbcTemplate.queryForObject("SELECT COUNT(*) FROM reclamo WHERE pedido_id = ?", Integer.class, pedidoId));
    }

    @Test
    void laElegibilidadDelPedidoLaCalculaElServidor() {
        Dueno dueno = duenoConCuenta();
        int cliente = datos.registrarCliente();
        int domicilio = pedidoEntregado(cliente, dueno, "DOMICILIO", LocalDateTime.now().minusDays(2));
        int retiro = pedidoEntregado(cliente, dueno, "RETIRO", LocalDateTime.now().minusDays(8));
        int enCamino = pedido(cliente, dueno, "EN_CAMINO", "DOMICILIO", null);

        List<PedidoResponseDTO> pedidos = pedidoService.listarPedidosCliente(cliente);

        ReclamoPedidoResponseDTO deDomicilio = bloqueDe(pedidos, domicilio);
        assertTrue(deDomicilio.puedeReclamar());
        assertTrue(deDomicilio.motivosDisponibles().contains(MotivoReclamo.NO_RECIBI_PEDIDO));
        assertEquals(6, deDomicilio.motivosDisponibles().size());
        assertNotNull(deDomicilio.fechaLimiteReclamo());
        ReclamoPedidoResponseDTO deRetiroVencido = bloqueDe(pedidos, retiro);
        assertFalse(deRetiroVencido.puedeReclamar());
        assertNull(deRetiroVencido.motivosDisponibles());
        assertNull(bloqueDe(pedidos, enCamino));

        int retiroNuevo = pedidoEntregado(cliente, dueno, "RETIRO", LocalDateTime.now().minusDays(1));
        ReclamoPedidoResponseDTO deRetiro = bloqueDe(pedidoService.listarPedidosCliente(cliente), retiroNuevo);
        assertEquals(5, deRetiro.motivosDisponibles().size());
        assertFalse(deRetiro.motivosDisponibles().contains(MotivoReclamo.NO_RECIBI_PEDIDO));
    }

    @Test
    void unDescripcionQueSeGuardaTalCualNoSeRecorta() {
        Dueno dueno = duenoConCuenta();
        int cliente = datos.registrarCliente();
        int pedidoId = pedidoEntregado(cliente, dueno);
        ReclamoRequestDTO request = reclamoDe(MotivoReclamo.OTRO);
        request.setDescripcion("  <b>Faltó</b> todo  ");

        reclamoService.crear(cliente, pedidoId, request);

        assertEquals("  <b>Faltó</b> todo  ",
                jdbcTemplate.queryForObject("SELECT descripcion FROM reclamo WHERE pedido_id = ?", String.class, pedidoId));
    }

    static ReclamoPedidoResponseDTO bloqueDe(List<PedidoResponseDTO> pedidos, int pedidoId) {
        return pedidos.stream().filter(p -> p.getId() == pedidoId).findFirst().orElseThrow().getReclamo();
    }
}
