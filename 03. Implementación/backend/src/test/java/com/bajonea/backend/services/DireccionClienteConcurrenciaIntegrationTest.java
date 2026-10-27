package com.bajonea.backend.services;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.bajonea.backend.dto.request.DireccionClienteRequestDTO;
import com.bajonea.backend.dto.request.PedidoRequestDTO;
import com.bajonea.backend.dto.response.PedidoResponseDTO;
import com.bajonea.backend.enums.TipoEntrega;
import com.bajonea.backend.exceptions.ConflictoComercioException;
import com.bajonea.backend.exceptions.RecursoNoEncontradoException;
import com.bajonea.backend.services.DatosPruebaEmpleado.Dueno;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Callable;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

/**
 * Las escrituras de direcciones del Cliente y la confirmación de un pedido, de verdad al mismo tiempo y contra
 * {@code bajonea_test}: el cupo nunca pasa de cinco, siempre queda exactamente una predeterminada, nunca quedan cero
 * direcciones activas y la copia de la dirección en el pedido es toda la vieja o toda la nueva, nunca mezclada.
 */
class DireccionClienteConcurrenciaIntegrationTest extends CarritoIntegrationBase {

    private static final String RIO_GRANDE = "94008010";
    private static final int RONDAS = 8;

    @Autowired
    private DireccionClienteService direccionClienteService;

    private DireccionClienteRequestDTO cuerpo(String calle, String numero, String cp, String localidadId, String referencia) {
        DireccionClienteRequestDTO dto = new DireccionClienteRequestDTO();
        dto.setCalle(calle);
        dto.setNumero(numero);
        dto.setCodigoPostal(cp);
        dto.setLocalidadId(localidadId);
        dto.setReferencia(referencia);
        return dto;
    }

    private int agregar(int clienteId, String calle) {
        return direccionClienteService.crear(clienteId, cuerpo(calle, "1", "9420", RIO_GRANDE, null)).getId();
    }

    private int activas(int clienteId) {
        return jdbcTemplate.queryForObject("SELECT COUNT(*) FROM direccion WHERE cliente_id = ? AND eliminada = 0", Integer.class, clienteId);
    }

    private int predeterminadas(int clienteId) {
        return jdbcTemplate.queryForObject("SELECT COUNT(*) FROM direccion WHERE cliente_id = ? AND eliminada = 0 AND principal = 1",
                Integer.class, clienteId);
    }

    private int direccionInicial(int clienteId) {
        return jdbcTemplate.queryForObject("SELECT id FROM direccion WHERE cliente_id = ? AND principal = 1", Integer.class, clienteId);
    }

    private static boolean esConflicto(Object resultado, String codigo) {
        return resultado instanceof ConflictoComercioException c && codigo.equals(c.getCodigo());
    }

    @Test
    void seisAltasAlMismoTiempoConCuatroActivasDejanExactamenteCinco() {
        for (int ronda = 0; ronda < RONDAS; ronda++) {
            int clienteId = datos.registrarCliente();
            for (int i = 0; i < 3; i++) {
                agregar(clienteId, "Previa " + i);
            }
            assertEquals(4, activas(clienteId));
            List<Callable<Object>> altas = new ArrayList<>();
            for (int i = 0; i < 6; i++) {
                int n = i;
                altas.add(() -> direccionClienteService.crear(clienteId, cuerpo("Nueva " + n, "1", "9420", RIO_GRANDE, null)));
            }

            List<Object> resultados = correrAlMismoTiempo(altas);

            assertEquals(1, resultados.stream().filter(r -> !(r instanceof Exception)).count());
            assertEquals(5, resultados.stream().filter(r -> esConflicto(r, "DIRECCIONES_CUPO_MAXIMO")).count());
            assertEquals(5, activas(clienteId));
            assertEquals(1, predeterminadas(clienteId));
        }
    }

    @Test
    void altasAlMismoTiempoConPrincipalDejanSiempreUnaSolaPredeterminada() {
        for (int ronda = 0; ronda < RONDAS; ronda++) {
            int clienteId = datos.registrarCliente();
            List<Callable<Object>> altas = new ArrayList<>();
            for (int i = 0; i < 4; i++) {
                int n = i;
                altas.add(() -> {
                    DireccionClienteRequestDTO dto = cuerpo("Principal " + n, "1", "9420", RIO_GRANDE, null);
                    dto.setPrincipal(true);
                    return direccionClienteService.crear(clienteId, dto);
                });
            }

            sinErrores(correrAlMismoTiempo(altas));

            assertEquals(5, activas(clienteId));
            assertEquals(1, predeterminadas(clienteId));
        }
    }

    @Test
    void dosCambiosDePredeterminadaAlMismoTiempoDejanExactamenteUna() {
        for (int ronda = 0; ronda < RONDAS; ronda++) {
            int clienteId = datos.registrarCliente();
            int b = agregar(clienteId, "B");
            int c = agregar(clienteId, "C");

            sinErrores(correrAlMismoTiempo(List.of(
                    () -> direccionClienteService.marcarPredeterminada(clienteId, b),
                    () -> direccionClienteService.marcarPredeterminada(clienteId, c))));

            assertEquals(1, predeterminadas(clienteId));
            assertEquals(3, activas(clienteId));
        }
    }

    @Test
    void bajaDeLaPredeterminadaContraCambioDePredeterminadaDejaUnaSolaYNingunaEliminadaConLaCondicion() {
        for (int ronda = 0; ronda < RONDAS; ronda++) {
            int clienteId = datos.registrarCliente();
            int a = direccionInicial(clienteId);
            int b = agregar(clienteId, "B");
            agregar(clienteId, "C");

            sinErrores(correrAlMismoTiempo(List.of(
                    () -> direccionClienteService.eliminar(clienteId, a),
                    () -> direccionClienteService.marcarPredeterminada(clienteId, b))));

            assertEquals(2, activas(clienteId));
            assertEquals(1, predeterminadas(clienteId));
            assertEquals(0, jdbcTemplate.queryForObject("SELECT COUNT(*) FROM direccion WHERE id = ? AND principal = 1", Integer.class, a));
        }
    }

    @Test
    void dosBajasAlMismoTiempoConDosDireccionesNuncaDejanCero() {
        for (int ronda = 0; ronda < RONDAS; ronda++) {
            int clienteId = datos.registrarCliente();
            int a = direccionInicial(clienteId);
            int b = agregar(clienteId, "B");

            List<Object> resultados = correrAlMismoTiempo(List.of(
                    () -> direccionClienteService.eliminar(clienteId, a),
                    () -> direccionClienteService.eliminar(clienteId, b)));

            assertEquals(1, resultados.stream().filter(r -> !(r instanceof Exception)).count());
            assertEquals(1, resultados.stream().filter(r -> esConflicto(r, "ULTIMA_DIRECCION")).count());
            assertEquals(1, activas(clienteId));
            assertEquals(1, predeterminadas(clienteId));
        }
    }

    private record Escenario(Dueno dueno, int clienteId, int direccionId) {
    }

    private Escenario escenarioDePedido() {
        Dueno dueno = comercioApto(false);
        jdbcTemplate.update("UPDATE comercio SET acepta_retiro = 1, acepta_delivery = 1 WHERE id = ?", dueno.comercioId());
        int clienteId = datos.registrarCliente();
        agregar(clienteId, "Segunda");
        super.agregar(clienteId, producto(dueno));
        int direccionId = direccionInicial(clienteId);
        return new Escenario(dueno, clienteId, direccionId);
    }

    private PedidoRequestDTO domicilio(int direccionId) {
        PedidoRequestDTO request = new PedidoRequestDTO();
        request.setTipoEntrega(TipoEntrega.DOMICILIO);
        request.setDireccionId(direccionId);
        return request;
    }

    @Test
    void confirmarUnPedidoContraEditarLaDireccionGuardaUnaCopiaTodaViejaOTodaNueva() {
        int vieja = 0;
        int nueva = 0;
        for (int ronda = 0; ronda < RONDAS; ronda++) {
            Escenario e = escenarioDePedido();

            List<Object> resultados = correrAlMismoTiempo(List.of(
                    () -> pedidoService.confirmarPedido(e.clienteId(), domicilio(e.direccionId())),
                    () -> direccionClienteService.editar(e.clienteId(), e.direccionId(),
                            cuerpo("Nueva Calle", "999", "9410", "94015020", "Timbre roto"))));

            sinErrores(resultados);
            Map<String, Object> copia = jdbcTemplate.queryForMap("SELECT entrega_calle, entrega_numero, entrega_codigo_postal, "
                    + "entrega_localidad_id, entrega_referencia FROM pedido WHERE cliente_id = ?", e.clienteId());
            boolean esVieja = "Calle Siempre Viva".equals(copia.get("entrega_calle")) && "123".equals(copia.get("entrega_numero"))
                    && "9420".equals(copia.get("entrega_codigo_postal")) && RIO_GRANDE.equals(copia.get("entrega_localidad_id"))
                    && copia.get("entrega_referencia") == null;
            boolean esNueva = "Nueva Calle".equals(copia.get("entrega_calle")) && "999".equals(copia.get("entrega_numero"))
                    && "9410".equals(copia.get("entrega_codigo_postal")) && "94015020".equals(copia.get("entrega_localidad_id"))
                    && "Timbre roto".equals(copia.get("entrega_referencia"));
            assertTrue(esVieja ^ esNueva, "La copia salió mezclada: " + copia);
            PedidoResponseDTO dto = (PedidoResponseDTO) resultados.get(0);
            assertEquals(copia.get("entrega_calle"), dto.getDireccion().getCalle());
            vieja += esVieja ? 1 : 0;
            nueva += esNueva ? 1 : 0;
        }
        assertEquals(RONDAS, vieja + nueva);
    }

    @Test
    void confirmarUnPedidoContraEliminarLaDireccionOCreaLaCopiaCompletaOResponde404() {
        for (int ronda = 0; ronda < RONDAS; ronda++) {
            Escenario e = escenarioDePedido();

            List<Object> resultados = correrAlMismoTiempo(List.of(
                    () -> pedidoService.confirmarPedido(e.clienteId(), domicilio(e.direccionId())),
                    () -> direccionClienteService.eliminar(e.clienteId(), e.direccionId())));

            assertTrue(!(resultados.get(1) instanceof Exception), "La baja falló: " + resultados.get(1));
            int pedidos = jdbcTemplate.queryForObject("SELECT COUNT(*) FROM pedido WHERE cliente_id = ?", Integer.class, e.clienteId());
            if (resultados.get(0) instanceof PedidoResponseDTO) {
                assertEquals(1, pedidos);
                Map<String, Object> copia = jdbcTemplate.queryForMap("SELECT entrega_calle, entrega_numero, entrega_codigo_postal, "
                        + "entrega_localidad_id FROM pedido WHERE cliente_id = ?", e.clienteId());
                assertEquals("Calle Siempre Viva", copia.get("entrega_calle"));
                assertEquals("123", copia.get("entrega_numero"));
                assertEquals("9420", copia.get("entrega_codigo_postal"));
                assertEquals(RIO_GRANDE, copia.get("entrega_localidad_id"));
            } else {
                assertTrue(resultados.get(0) instanceof RecursoNoEncontradoException, "Respuesta inesperada: " + resultados.get(0));
                assertEquals(0, pedidos);
            }
            assertEquals(1, predeterminadas(e.clienteId()));
        }
    }
}
