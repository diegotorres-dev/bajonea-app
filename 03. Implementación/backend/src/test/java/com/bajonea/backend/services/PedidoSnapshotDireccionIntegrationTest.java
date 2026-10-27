package com.bajonea.backend.services;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.bajonea.backend.dto.request.DireccionClienteRequestDTO;
import com.bajonea.backend.dto.request.PedidoRequestDTO;
import com.bajonea.backend.dto.response.DireccionEntregaResponseDTO;
import com.bajonea.backend.dto.response.PedidoEmpleadoResponseDTO;
import com.bajonea.backend.dto.response.PedidoResponseDTO;
import com.bajonea.backend.enums.TipoEntrega;
import com.bajonea.backend.exceptions.ConflictoDeNegocioException;
import com.bajonea.backend.exceptions.RecursoNoEncontradoException;
import com.bajonea.backend.services.DatosPruebaEmpleado.Dueno;
import com.fasterxml.jackson.databind.JsonNode;
import java.lang.reflect.Field;
import java.time.LocalDateTime;
import java.util.Arrays;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

/**
 * La dirección de entrega de un pedido es una copia tomada al confirmarlo (fase 3, direcciones del Cliente), contra
 * {@code bajonea_test} con datos confirmados de verdad: lo que ven el Cliente, el Dueño y el Empleado no cambia si la
 * dirección se edita o se elimina después, el alias privado no viaja y un retiro no tiene copia.
 */
class PedidoSnapshotDireccionIntegrationTest extends CarritoIntegrationBase {

    private static final String LOCALIDAD_RIO_GRANDE = "94008010";

    @Autowired
    private DireccionClienteService direccionClienteService;

    private record Escenario(Dueno dueno, int productoId, int clienteId, int direccionId) {
    }

    private Escenario escenario() {
        Dueno dueno = comercioApto(false);
        jdbcTemplate.update("UPDATE comercio SET acepta_retiro = 1, acepta_delivery = 1 WHERE id = ?", dueno.comercioId());
        int productoId = producto(dueno);
        int clienteId = datos.registrarCliente();
        agregar(clienteId, productoId);
        int direccionId = jdbcTemplate.queryForObject("SELECT id FROM direccion WHERE cliente_id = ? AND principal = 1", Integer.class, clienteId);
        return new Escenario(dueno, productoId, clienteId, direccionId);
    }

    private PedidoRequestDTO domicilio(Integer direccionId) {
        PedidoRequestDTO request = new PedidoRequestDTO();
        request.setTipoEntrega(TipoEntrega.DOMICILIO);
        request.setDireccionId(direccionId);
        return request;
    }

    private PedidoRequestDTO retiro(Integer direccionId) {
        PedidoRequestDTO request = new PedidoRequestDTO();
        request.setTipoEntrega(TipoEntrega.RETIRO);
        request.setDireccionId(direccionId);
        return request;
    }

    private DireccionClienteRequestDTO cuerpo(String calle, String numero, String pisoDepto, String cp, String localidadId,
            String nombre, String referencia) {
        DireccionClienteRequestDTO dto = new DireccionClienteRequestDTO();
        dto.setCalle(calle);
        dto.setNumero(numero);
        dto.setPisoDepto(pisoDepto);
        dto.setCodigoPostal(cp);
        dto.setLocalidadId(localidadId);
        dto.setNombre(nombre);
        dto.setReferencia(referencia);
        return dto;
    }

    private void aPendienteDeConfirmacion(int pedidoId) {
        jdbcTemplate.update("UPDATE pedido SET estado = 'PENDIENTE_CONFIRMACION_COMERCIO', pago_estado = 'PAGADO' WHERE id = ?", pedidoId);
        jdbcTemplate.update("INSERT INTO historial_estado_pedido (pedido_id, estado, actor_rol, actor_usuario_id, fecha_hora) "
                + "VALUES (?, 'PENDIENTE_CONFIRMACION_COMERCIO', 'SISTEMA', NULL, ?)", pedidoId, LocalDateTime.now());
    }

    private void assertCopiaOriginal(DireccionEntregaResponseDTO d, String referencia) {
        assertNotNull(d);
        assertEquals("Calle Siempre Viva", d.getCalle());
        assertEquals("123", d.getNumero());
        assertNull(d.getPisoDepto());
        assertEquals("9420", d.getCodigoPostal());
        assertEquals(LOCALIDAD_RIO_GRANDE, d.getLocalidadId());
        assertEquals("Río Grande", d.getNombreLocalidad());
        assertTrue(d.getNombreProvincia().startsWith("Tierra del Fuego"));
        assertEquals(referencia, d.getReferencia());
    }

    @Test
    void confirmarUnPedidoADomicilioGuardaLaCopiaDeLaDireccionEnLaFilaDelPedido() {
        Escenario e = escenario();
        direccionClienteService.editar(e.clienteId(), e.direccionId(),
                cuerpo("Calle Siempre Viva", "123", "2B", "9420", LOCALIDAD_RIO_GRANDE, "Casa", "Portón verde"));

        PedidoResponseDTO creado = pedidoService.confirmarPedido(e.clienteId(), domicilio(e.direccionId()));

        var fila = jdbcTemplate.queryForMap("SELECT direccion_id, entrega_calle, entrega_numero, entrega_piso_depto, "
                + "entrega_codigo_postal, entrega_localidad_id, entrega_referencia FROM pedido WHERE id = ?", creado.getId());
        assertEquals(e.direccionId(), fila.get("direccion_id"));
        assertEquals("Calle Siempre Viva", fila.get("entrega_calle"));
        assertEquals("123", fila.get("entrega_numero"));
        assertEquals("2B", fila.get("entrega_piso_depto"));
        assertEquals("9420", fila.get("entrega_codigo_postal"));
        assertEquals(LOCALIDAD_RIO_GRANDE, fila.get("entrega_localidad_id"));
        assertEquals("Portón verde", fila.get("entrega_referencia"));
        DireccionEntregaResponseDTO dto = creado.getDireccion();
        assertEquals("2B", dto.getPisoDepto());
        assertEquals("Portón verde", dto.getReferencia());
        assertEquals("Río Grande", dto.getNombreLocalidad());
    }

    @Test
    void elAliasPrivadoNoViajaNiEnLaRespuestaNiEnLaFilaDelPedido() throws Exception {
        Escenario e = escenario();
        direccionClienteService.editar(e.clienteId(), e.direccionId(),
                cuerpo("Calle Siempre Viva", "123", null, "9420", LOCALIDAD_RIO_GRANDE, "Casa de mamá", "Portón verde"));

        PedidoResponseDTO creado = pedidoService.confirmarPedido(e.clienteId(), domicilio(e.direccionId()));

        JsonNode direccion = objectMapper.readTree(objectMapper.writeValueAsString(creado)).path("direccion");
        assertFalse(direccion.has("nombre"));
        assertFalse(direccion.has("id"));
        assertFalse(direccion.has("principal"));
        assertFalse(objectMapper.writeValueAsString(creado).contains("Casa de mamá"));
        assertTrue(Arrays.stream(DireccionEntregaResponseDTO.class.getDeclaredFields()).map(Field::getName).noneMatch("nombre"::equals));
        Integer columnasConNombre = jdbcTemplate.queryForObject("SELECT COUNT(*) FROM information_schema.columns "
                + "WHERE table_schema = DATABASE() AND table_name = 'pedido' AND column_name LIKE 'entrega%nombre%'", Integer.class);
        assertEquals(0, columnasConNombre);
    }

    @Test
    void editarLaDireccionDespuesNoCambiaLoQueVenElClienteElDuenoYElEmpleado() {
        Escenario e = escenario();
        direccionClienteService.editar(e.clienteId(), e.direccionId(),
                cuerpo("Calle Siempre Viva", "123", null, "9420", LOCALIDAD_RIO_GRANDE, null, "Portón verde"));
        PedidoResponseDTO creado = pedidoService.confirmarPedido(e.clienteId(), domicilio(e.direccionId()));
        aPendienteDeConfirmacion(creado.getId());

        direccionClienteService.editar(e.clienteId(), e.direccionId(),
                cuerpo("Otra Calle", "999", "5C", "9410", "94015020", "Nuevo", "Timbre roto"));

        assertCopiaOriginal(pedidoService.listarPedidosCliente(e.clienteId()).get(0).getDireccion(), "Portón verde");
        assertCopiaOriginal(pedidoService.listarPedidosComercio(e.dueno().comercioId()).get(0).getDireccion(), "Portón verde");
        List<PedidoEmpleadoResponseDTO> empleado = pedidoService.listarPedidosComercioEmpleado(e.dueno().comercioId(), e.dueno().id());
        assertCopiaOriginal(empleado.get(0).getDireccion(), "Portón verde");
        assertEquals("Otra Calle", jdbcTemplate.queryForObject("SELECT calle FROM direccion WHERE id = ?", String.class, e.direccionId()));
    }

    @Test
    void eliminarLaDireccionDespuesTampocoCambiaLaCopia() {
        Escenario e = escenario();
        direccionClienteService.crear(e.clienteId(), cuerpo("Segunda", "55", null, "9420", LOCALIDAD_RIO_GRANDE, null, null));
        PedidoResponseDTO creado = pedidoService.confirmarPedido(e.clienteId(), domicilio(e.direccionId()));
        aPendienteDeConfirmacion(creado.getId());

        direccionClienteService.eliminar(e.clienteId(), e.direccionId());

        assertEquals(1, jdbcTemplate.queryForObject("SELECT eliminada FROM direccion WHERE id = ?", Integer.class, e.direccionId()));
        assertCopiaOriginal(pedidoService.listarPedidosCliente(e.clienteId()).get(0).getDireccion(), null);
        assertCopiaOriginal(pedidoService.listarPedidosComercio(e.dueno().comercioId()).get(0).getDireccion(), null);
    }

    @Test
    void cambiarLaPredeterminadaNoTocaLaCopiaDeLosPedidosYaHechos() {
        Escenario e = escenario();
        PedidoResponseDTO creado = pedidoService.confirmarPedido(e.clienteId(), domicilio(e.direccionId()));
        var segunda = direccionClienteService.crear(e.clienteId(), cuerpo("Segunda", "55", null, "9420", LOCALIDAD_RIO_GRANDE, null, null));

        direccionClienteService.marcarPredeterminada(e.clienteId(), segunda.getId());

        assertCopiaOriginal(pedidoService.listarPedidosCliente(e.clienteId()).get(0).getDireccion(), null);
        assertEquals("Calle Siempre Viva", jdbcTemplate.queryForObject("SELECT entrega_calle FROM pedido WHERE id = ?", String.class, creado.getId()));
    }

    @Test
    void elegirOtraDireccionEnUnPedidoGuardaLaCopiaDeEsaYNoCambiaLaPredeterminada() {
        Escenario e = escenario();
        var segunda = direccionClienteService.crear(e.clienteId(), cuerpo("Mitre", "55", null, "9420", "94015020", null, "Fondo"));

        PedidoResponseDTO creado = pedidoService.confirmarPedido(e.clienteId(), domicilio(segunda.getId()));

        assertEquals("Mitre", creado.getDireccion().getCalle());
        assertEquals("Ushuaia", creado.getDireccion().getNombreLocalidad());
        assertEquals("Fondo", creado.getDireccion().getReferencia());
        assertEquals(segunda.getId(), jdbcTemplate.queryForObject("SELECT direccion_id FROM pedido WHERE id = ?", Integer.class, creado.getId()));
        assertEquals(e.direccionId(), jdbcTemplate.queryForObject(
                "SELECT id FROM direccion WHERE cliente_id = ? AND eliminada = 0 AND principal = 1", Integer.class, e.clienteId()));
    }

    @Test
    void unPedidoDeRetiroNoTieneCopiaNiDireccionAunqueSeMandeUnDireccionId() {
        Escenario e = escenario();

        PedidoResponseDTO creado = pedidoService.confirmarPedido(e.clienteId(), retiro(e.direccionId()));

        assertNull(creado.getDireccion());
        var fila = jdbcTemplate.queryForMap("SELECT direccion_id, entrega_calle, entrega_numero, entrega_piso_depto, "
                + "entrega_codigo_postal, entrega_localidad_id, entrega_referencia FROM pedido WHERE id = ?", creado.getId());
        fila.values().forEach(valor -> assertNull(valor));
        aPendienteDeConfirmacion(creado.getId());
        assertNull(pedidoService.listarPedidosCliente(e.clienteId()).get(0).getDireccion());
        assertNull(pedidoService.listarPedidosComercio(e.dueno().comercioId()).get(0).getDireccion());
        assertNull(pedidoService.listarPedidosComercioEmpleado(e.dueno().comercioId(), e.dueno().id()).get(0).getDireccion());
    }

    @Test
    void sinDireccionIdUnPedidoADomicilioDaConflictoYNoCreaNada() {
        Escenario e = escenario();

        assertThrows(ConflictoDeNegocioException.class, () -> pedidoService.confirmarPedido(e.clienteId(), domicilio(null)));

        assertEquals(0, jdbcTemplate.queryForObject("SELECT COUNT(*) FROM pedido WHERE cliente_id = ?", Integer.class, e.clienteId()));
    }

    @Test
    void unaDireccionAjenaInexistenteOEliminadaDa404YNoCreaNada() {
        Escenario e = escenario();
        Escenario otro = escenario();
        var segunda = direccionClienteService.crear(e.clienteId(), cuerpo("Segunda", "55", null, "9420", LOCALIDAD_RIO_GRANDE, null, null));
        direccionClienteService.eliminar(e.clienteId(), segunda.getId());

        for (int id : new int[] { otro.direccionId(), 999999999, segunda.getId() }) {
            assertThrows(RecursoNoEncontradoException.class, () -> pedidoService.confirmarPedido(e.clienteId(), domicilio(id)));
        }

        assertEquals(0, jdbcTemplate.queryForObject("SELECT COUNT(*) FROM pedido WHERE cliente_id = ?", Integer.class, e.clienteId()));
    }

    @Test
    void unaDireccionViejaFueraDeLasHabilitadasSigueSirviendoParaPedir() {
        Escenario e = escenario();
        String otra = jdbcTemplate.queryForObject("SELECT id FROM localidad WHERE id NOT IN ('94008010','94015020','94011010') LIMIT 1", String.class);
        jdbcTemplate.update("UPDATE direccion SET localidad_id = ? WHERE id = ?", otra, e.direccionId());

        PedidoResponseDTO creado = pedidoService.confirmarPedido(e.clienteId(), domicilio(e.direccionId()));

        assertEquals(otra, creado.getDireccion().getLocalidadId());
        assertNotNull(creado.getDireccion().getNombreLocalidad());
        assertEquals(otra, jdbcTemplate.queryForObject("SELECT entrega_localidad_id FROM pedido WHERE id = ?", String.class, creado.getId()));
    }
}
