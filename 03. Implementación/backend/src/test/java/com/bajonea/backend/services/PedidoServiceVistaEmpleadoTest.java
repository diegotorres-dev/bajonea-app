package com.bajonea.backend.services;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.bajonea.backend.config.PedidoTimeoutProperties;
import com.bajonea.backend.dto.response.PedidoEmpleadoResponseDTO;
import com.bajonea.backend.dto.response.PedidoResponseDTO;
import com.bajonea.backend.dto.response.ResumenPedidosHoyEmpleadoResponseDTO;
import com.bajonea.backend.dto.response.ResumenPedidosHoyResponseDTO;
import com.bajonea.backend.entities.Cliente;
import com.bajonea.backend.entities.Comercio;
import com.bajonea.backend.entities.NotaCredito;
import com.bajonea.backend.entities.Pago;
import com.bajonea.backend.entities.Pedido;
import com.bajonea.backend.enums.CanceladoPor;
import com.bajonea.backend.enums.EstadoNotaCredito;
import com.bajonea.backend.enums.EstadoPagoPedido;
import com.bajonea.backend.enums.EstadoPedido;
import com.bajonea.backend.enums.EstadoReembolsoEmpleado;
import com.bajonea.backend.enums.MotivoRechazo;
import com.bajonea.backend.enums.TipoEntrega;
import com.bajonea.backend.repositories.CarritoRepository;
import com.bajonea.backend.repositories.ClienteRepository;
import com.bajonea.backend.repositories.ComercioRepository;
import com.bajonea.backend.repositories.DetallePedidoRepository;
import com.bajonea.backend.repositories.DireccionRepository;
import com.bajonea.backend.repositories.HistorialEstadoPedidoRepository;
import com.bajonea.backend.repositories.ItemCarritoRepository;
import com.bajonea.backend.repositories.PedidoRepository;
import com.bajonea.backend.repositories.UsuarioRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.TreeSet;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Answers;
import org.springframework.transaction.PlatformTransactionManager;

/**
 * Vista del Empleado de los pedidos del comercio: lista blanca de campos, reembolso en términos simples y
 * resumen del día con el facturado bruto. Con repositorios simulados: no toca la base.
 */
class PedidoServiceVistaEmpleadoTest {

    private static final Set<String> CAMPOS_EMPLEADO = Set.of("id", "nombreCliente", "comercioId", "estado", "tipoEntrega",
            "direccion", "motivoRechazo", "comentarioRechazo", "canceladoPor", "fuenteEntrega", "motivoAnulacion", "fechaCreacion",
            "fechaPagoAprobado", "fechaEntrega", "detalles", "subtotal", "total", "reembolsoEstado", "reembolsoMonto");
    private static final Set<String> CAMPOS_EXCLUIDOS = Set.of("clienteId", "pagoEstado", "cargoServicioCliente",
            "cargoServicioComercio");

    private final ObjectMapper objectMapper = new ObjectMapper().registerModule(new JavaTimeModule())
            .disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);

    private PedidoRepository pedidoRepository;
    private HistorialEstadoPedidoRepository historialRepository;
    private NotaCreditoService notaCreditoService;
    private PedidoService pedidoService;
    private Cliente cliente;
    private Comercio comercio;

    @BeforeEach
    void preparar() {
        pedidoRepository = mock(PedidoRepository.class);
        historialRepository = mock(HistorialEstadoPedidoRepository.class);
        notaCreditoService = mock(NotaCreditoService.class);
        PedidoTimeoutProperties timeouts = new PedidoTimeoutProperties();
        timeouts.setPagoMinutos(30);
        timeouts.setRespuestaComercioMinutos(30);
        timeouts.setRetiroSuspensionMinutos(90);
        pedidoService = new PedidoService(
                pedidoRepository,
                mock(DetallePedidoRepository.class),
                mock(CarritoRepository.class),
                mock(ItemCarritoRepository.class),
                mock(ClienteRepository.class),
                mock(ComercioRepository.class),
                mock(DireccionRepository.class),
                historialRepository,
                mock(UsuarioRepository.class),
                mock(NotificacionService.class),
                mock(CarritoService.class),
                mock(ComercioService.class),
                mock(ConfiguracionTarifaService.class),
                timeouts,
                mock(ReembolsoService.class),
                notaCreditoService,
                mock(PlatformTransactionManager.class), mock(ComercioActivoService.class));

        cliente = mock(Cliente.class, Answers.RETURNS_DEEP_STUBS);
        when(cliente.getId()).thenReturn(77);
        when(cliente.getPersonaFisica().getNombre()).thenReturn("Ana");
        when(cliente.getPersonaFisica().getApellido()).thenReturn("Gómez");
        comercio = mock(Comercio.class, Answers.RETURNS_DEEP_STUBS);
        when(comercio.getId()).thenReturn(40);
    }

    private Pedido pedido(int id, EstadoPedido estado, String subtotal, String cargoComercio) {
        BigDecimal sub = new BigDecimal(subtotal);
        return Pedido.builder()
                .id(id)
                .cliente(cliente)
                .comercio(comercio)
                .estado(estado)
                .pagoEstado(EstadoPagoPedido.PAGADO)
                .tipoEntrega(TipoEntrega.RETIRO)
                .subtotal(sub)
                .cargoServicioCliente(new BigDecimal("200"))
                .cargoServicioComercio(new BigDecimal(cargoComercio))
                .total(sub.add(new BigDecimal("200")))
                .fechaCreacion(LocalDateTime.now().minusHours(1))
                .build();
    }

    private void pagadosHoy(Pedido... pedidos) {
        when(pedidoRepository.findLlegadosPagadosByComercioId(40)).thenReturn(List.of(pedidos));
        List<Object[]> filas = new ArrayList<>();
        for (Pedido pedido : pedidos) {
            filas.add(new Object[] {pedido.getId(), LocalDateTime.now().minusMinutes(5)});
        }
        when(historialRepository.findPrimeraEntradaAEstadoPorPedido(anyList(), eq(EstadoPedido.PENDIENTE_CONFIRMACION_COMERCIO)))
                .thenReturn(filas);
    }

    private NotaCredito nota(int pedidoId, EstadoNotaCredito estado, String monto) {
        Pedido pedido = Pedido.builder().id(pedidoId).build();
        Pago pago = Pago.builder().id(pedidoId).pedido(pedido).build();
        return NotaCredito.builder().id(pedidoId * 10).pago(pago).estado(estado).monto(new BigDecimal(monto)).build();
    }

    private Set<String> camposDe(Object dto) {
        JsonNode json = objectMapper.valueToTree(dto);
        Set<String> campos = new TreeSet<>();
        json.fieldNames().forEachRemaining(campos::add);
        return campos;
    }

    @Test
    void laListaDelEmpleadoTieneExactamenteLosCamposDeLaListaBlancaYNingunoDeLosExcluidos() {
        Pedido rechazado = pedido(1, EstadoPedido.RECHAZADO, "10000", "100");
        rechazado.setMotivoRechazo(MotivoRechazo.SIN_STOCK);
        rechazado.setCanceladoPor(CanceladoPor.COMERCIO);
        pagadosHoy(rechazado);

        List<PedidoEmpleadoResponseDTO> lista = pedidoService.listarPedidosComercioEmpleado(40);

        assertEquals(1, lista.size());
        Set<String> campos = camposDe(lista.get(0));
        assertEquals(CAMPOS_EMPLEADO, campos);
        for (String excluido : CAMPOS_EXCLUIDOS) {
            assertFalse(campos.contains(excluido), excluido);
        }
        PedidoEmpleadoResponseDTO dto = lista.get(0);
        assertEquals(1, dto.getId());
        assertEquals("Ana Gómez", dto.getNombreCliente());
        assertEquals(40, dto.getComercioId());
        assertEquals(EstadoPedido.RECHAZADO, dto.getEstado());
        assertEquals(MotivoRechazo.SIN_STOCK, dto.getMotivoRechazo());
        assertEquals(CanceladoPor.COMERCIO, dto.getCanceladoPor());
        assertEquals(new BigDecimal("10000"), dto.getSubtotal());
        assertEquals(new BigDecimal("10200"), dto.getTotal());
    }

    @Test
    void elDuenoSigueRecibiendoElDtoCompletoConLosCargosYElEstadoDelPago() {
        pagadosHoy(pedido(2, EstadoPedido.EN_PREPARACION, "10000", "100"));

        List<PedidoResponseDTO> lista = pedidoService.listarPedidosComercio(40);

        Set<String> campos = camposDe(lista.get(0));
        assertTrue(campos.containsAll(CAMPOS_EXCLUIDOS), campos.toString());
        assertEquals(new BigDecimal("100"), lista.get(0).getCargoServicioComercio());
        assertEquals(77, lista.get(0).getClienteId());
        assertEquals(EstadoPagoPedido.PAGADO, lista.get(0).getPagoEstado());
        assertEquals(23, campos.size());
    }

    @Test
    void elReembolsoSeTraduceATerminosSimplesConElMonto() {
        Pedido sin = pedido(10, EstadoPedido.RECHAZADO, "1000", "10");
        Pedido enProceso = pedido(11, EstadoPedido.RECHAZADO, "2000", "20");
        Pedido reintento = pedido(12, EstadoPedido.EXPIRADO, "3000", "30");
        Pedido reembolsado = pedido(13, EstadoPedido.RECHAZADO, "4000", "40");
        Pedido fallido = pedido(14, EstadoPedido.RECHAZADO, "5000", "50");
        Pedido revision = pedido(15, EstadoPedido.RECHAZADO, "6000", "60");
        pagadosHoy(sin, enProceso, reintento, reembolsado, fallido, revision);
        when(notaCreditoService.listarPorPedidos(anyCollection())).thenReturn(List.of(
                nota(11, EstadoNotaCredito.PENDIENTE, "2200"),
                nota(12, EstadoNotaCredito.PENDIENTE_REINTENTO, "3200"),
                nota(13, EstadoNotaCredito.PROCESADO, "4200"),
                nota(14, EstadoNotaCredito.FALLIDO, "5200"),
                nota(15, EstadoNotaCredito.PENDIENTE_REVISION_MANUAL, "6200")));

        List<PedidoEmpleadoResponseDTO> lista = pedidoService.listarPedidosComercioEmpleado(40);

        assertEquals(List.of(EstadoReembolsoEmpleado.SIN_REEMBOLSO, EstadoReembolsoEmpleado.EN_PROCESO, EstadoReembolsoEmpleado.EN_PROCESO,
                EstadoReembolsoEmpleado.REEMBOLSADO, EstadoReembolsoEmpleado.EN_REVISION, EstadoReembolsoEmpleado.EN_REVISION),
                lista.stream().map(PedidoEmpleadoResponseDTO::getReembolsoEstado).toList());
        assertNull(lista.get(0).getReembolsoMonto());
        assertEquals(new BigDecimal("4200"), lista.get(3).getReembolsoMonto());
        assertEquals(new BigDecimal("6200"), lista.get(5).getReembolsoMonto());
        assertFalse(objectMapper.valueToTree(lista).toString().contains("PENDIENTE_REVISION_MANUAL"));
        assertFalse(objectMapper.valueToTree(lista).toString().contains("FALLIDO"));
    }

    @Test
    void cadaEstadoDeNotaDeCreditoTieneUnaTraduccion() {
        for (EstadoNotaCredito estado : EstadoNotaCredito.values()) {
            assertTrue(EstadoReembolsoEmpleado.desde(estado) != EstadoReembolsoEmpleado.SIN_REEMBOLSO, estado.name());
        }
        assertEquals(EstadoReembolsoEmpleado.SIN_REEMBOLSO, EstadoReembolsoEmpleado.desde(null));
    }

    @Test
    void elResumenDelEmpleadoSumaElSubtotalBrutoYElDelDuenoElNeto() {
        pagadosHoy(
                pedido(20, EstadoPedido.EN_PREPARACION, "10000", "100"),
                pedido(21, EstadoPedido.ENTREGADO, "5000", "50"),
                pedido(22, EstadoPedido.PENDIENTE_CONFIRMACION_COMERCIO, "7000", "70"),
                pedido(23, EstadoPedido.RECHAZADO, "9000", "90"));

        ResumenPedidosHoyResponseDTO dueno = pedidoService.obtenerResumenHoy(40);
        ResumenPedidosHoyEmpleadoResponseDTO empleado = pedidoService.obtenerResumenHoyEmpleado(40);

        assertEquals(new BigDecimal("14850"), dueno.getTotalFacturadoHoy());
        assertEquals(new BigDecimal("15000"), empleado.getTotalFacturadoHoy());
        assertEquals(4, dueno.getCantidadPedidosHoy());
        assertEquals(4, empleado.getCantidadPedidosHoy());
        assertEquals(1, dueno.getCantidadPendientes());
        assertEquals(1, empleado.getCantidadPendientes());
        assertEquals(Set.of("totalFacturadoHoy", "cantidadPedidosHoy", "cantidadPendientes"), camposDe(empleado));
    }

    @Test
    void elResumenDelEmpleadoSinPedidosEsCero() {
        when(pedidoRepository.findLlegadosPagadosByComercioId(40)).thenReturn(List.of());

        ResumenPedidosHoyEmpleadoResponseDTO empleado = pedidoService.obtenerResumenHoyEmpleado(40);

        assertEquals(BigDecimal.ZERO, empleado.getTotalFacturadoHoy());
        assertEquals(0, empleado.getCantidadPedidosHoy());
        assertEquals(0, empleado.getCantidadPendientes());
    }
}
