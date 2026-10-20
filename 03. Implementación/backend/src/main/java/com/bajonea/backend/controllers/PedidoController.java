package com.bajonea.backend.controllers;

import com.bajonea.backend.config.security.AuthenticatedUser;
import com.bajonea.backend.config.security.ComercioActivo;
import com.bajonea.backend.dto.request.AnulacionPedidoRequestDTO;
import com.bajonea.backend.dto.request.PedidoRequestDTO;
import com.bajonea.backend.dto.request.RechazoPedidoRequestDTO;
import com.bajonea.backend.dto.response.ApiResponse;
import com.bajonea.backend.dto.response.PagoResponseDTO;
import com.bajonea.backend.dto.response.PedidoEmpleadoResponseDTO;
import com.bajonea.backend.dto.response.PedidoResponseDTO;
import com.bajonea.backend.services.MercadoPagoPagoService;
import com.bajonea.backend.services.PedidoService;
import com.bajonea.backend.services.ResumenTurnoService;
import com.bajonea.backend.services.TrazabilidadPedidoService;
import com.bajonea.backend.dto.response.TrazabilidadPedidoResponseDTO;
import com.bajonea.backend.dto.request.SincronizarPagoRequestDTO;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/pedidos")
@RequiredArgsConstructor
public class PedidoController {

    private final PedidoService pedidoService;
    private final MercadoPagoPagoService mercadoPagoPagoService;
    private final TrazabilidadPedidoService trazabilidadPedidoService;
    private final ResumenTurnoService resumenTurnoService;

    @PostMapping("/cliente")
    public ResponseEntity<ApiResponse<PedidoResponseDTO>> confirmarPedido(@Valid @RequestBody PedidoRequestDTO request,
            @AuthenticationPrincipal AuthenticatedUser usuario) {
        PedidoResponseDTO response = pedidoService.confirmarPedido(usuario.userId(), request);
        return ResponseEntity.status(HttpStatus.CREATED).body(new ApiResponse<>("Pedido confirmado correctamente", response));
    }

    @GetMapping("/cliente")
    public ResponseEntity<ApiResponse<List<PedidoResponseDTO>>> listarPedidosCliente(
            @AuthenticationPrincipal AuthenticatedUser usuario) {
        List<PedidoResponseDTO> pedidos = pedidoService.listarPedidosCliente(usuario.userId());
        return ResponseEntity.status(HttpStatus.OK).body(new ApiResponse<>("Pedidos obtenidos correctamente", pedidos));
    }

    @PostMapping("/cliente/{id}/pago")
    public ResponseEntity<ApiResponse<PagoResponseDTO>> iniciarPago(@PathVariable Integer id,
            @AuthenticationPrincipal AuthenticatedUser usuario) {
        PagoResponseDTO response = mercadoPagoPagoService.iniciarOReusarPago(usuario.userId(), id);
        return ResponseEntity.status(HttpStatus.OK).body(new ApiResponse<>("Link de pago generado correctamente", response));
    }

    @PostMapping("/cliente/{id}/pago/sincronizar")
    public ResponseEntity<ApiResponse<PedidoResponseDTO>> sincronizarPago(@PathVariable Integer id,
            @Valid @RequestBody(required = false) SincronizarPagoRequestDTO request,
            @AuthenticationPrincipal AuthenticatedUser usuario, HttpServletRequest httpRequest) {
        String paymentId = request == null ? null : request.getPaymentId();
        PedidoResponseDTO response = mercadoPagoPagoService.sincronizarPago(usuario.userId(), id, paymentId, httpRequest.getRemoteAddr());
        return ResponseEntity.status(HttpStatus.OK).body(new ApiResponse<>("Pago sincronizado correctamente", response));
    }

    @GetMapping("/cliente/{id}/pago")
    public ResponseEntity<ApiResponse<PagoResponseDTO>> consultarPagoCliente(@PathVariable Integer id,
            @AuthenticationPrincipal AuthenticatedUser usuario) {
        PagoResponseDTO response = mercadoPagoPagoService.consultarComoCliente(usuario.userId(), id);
        return ResponseEntity.status(HttpStatus.OK).body(new ApiResponse<>("Pago obtenido correctamente", response));
    }

    @GetMapping("/comercio/{id}/pago")
    public ResponseEntity<ApiResponse<PagoResponseDTO>> consultarPagoComercio(@PathVariable Integer id,
            ComercioActivo comercio) {
        PagoResponseDTO response = mercadoPagoPagoService.consultarComoComercio(comercio.comercioId(), id);
        return ResponseEntity.status(HttpStatus.OK).body(new ApiResponse<>("Pago obtenido correctamente", response));
    }

    @PutMapping("/cliente/{id}/entregar")
    public ResponseEntity<ApiResponse<PedidoResponseDTO>> confirmarEntregaCliente(@PathVariable Integer id,
            @AuthenticationPrincipal AuthenticatedUser usuario) {
        PedidoResponseDTO response = pedidoService.confirmarEntregaCliente(usuario.userId(), id);
        return ResponseEntity.status(HttpStatus.OK).body(new ApiResponse<>("Entrega confirmada correctamente", response));
    }

    @PutMapping("/cliente/{id}/cancelar")
    public ResponseEntity<ApiResponse<PedidoResponseDTO>> cancelarPedido(@PathVariable Integer id,
            @AuthenticationPrincipal AuthenticatedUser usuario) {
        PedidoResponseDTO response = pedidoService.cancelarPedido(usuario.userId(), id);
        return ResponseEntity.status(HttpStatus.OK).body(new ApiResponse<>("Pedido cancelado correctamente", response));
    }

    /**
     * Ruta delegable (ver {@code DelegacionEmpleado}): el Dueño recibe los pedidos completos y el Empleado el DTO
     * reducido, sin cargos de servicio ni datos de Mercado Pago.
     */
    @GetMapping("/comercio")
    public ResponseEntity<ApiResponse<List<?>>> listarPedidosComercio(
            ComercioActivo comercio) {
        List<?> pedidos = comercio.esEmpleado()
                ? pedidoService.listarPedidosComercioEmpleado(comercio.comercioId(), comercio.actorUsuarioId())
                : pedidoService.listarPedidosComercio(comercio.comercioId());
        return ResponseEntity.status(HttpStatus.OK).body(new ApiResponse<>("Pedidos obtenidos correctamente", pedidos));
    }

    /**
     * Recorrido del pedido ("atendido por"): lo ven el Dueño y los Empleados activos del comercio (ruta delegable).
     * El Cliente no tiene acceso: sin relación con el comercio recibe {@code 400} (sin header) o {@code 404}.
     */
    @GetMapping("/comercio/{id}/trazabilidad")
    public ResponseEntity<ApiResponse<TrazabilidadPedidoResponseDTO>> obtenerTrazabilidad(ComercioActivo comercio,
            @PathVariable Integer id) {
        TrazabilidadPedidoResponseDTO response = trazabilidadPedidoService.obtener(comercio, id);
        return ResponseEntity.status(HttpStatus.OK).body(new ApiResponse<>("Trazabilidad obtenida correctamente", response));
    }

    @GetMapping("/comercio/resumen-turno")
    public ResponseEntity<ApiResponse<?>> obtenerResumenTurno(
            ComercioActivo comercio) {
        Object response = comercio.esEmpleado()
                ? resumenTurnoService.obtenerParaEmpleado(comercio.comercioId())
                : resumenTurnoService.obtener(comercio.comercioId());
        return ResponseEntity.status(HttpStatus.OK).body(new ApiResponse<>("Resumen obtenido correctamente", response));
    }

    /**
     * Las cinco acciones del comercio sobre un pedido son delegables al Empleado (ver {@code DelegacionEmpleado}):
     * el Dueño recibe el pedido completo y el Empleado el reducido, sin cargos de servicio ni datos de Mercado Pago.
     * {@code ComercioActivo} va primero para que el resolver corra antes de leer y validar el cuerpo.
     */
    @PutMapping("/comercio/{id}/aceptar")
    public ResponseEntity<ApiResponse<?>> aceptarPedido(ComercioActivo comercio, @PathVariable Integer id) {
        PedidoResponseDTO response = pedidoService.aceptarPedido(comercio, id);
        return ResponseEntity.status(HttpStatus.OK).body(new ApiResponse<>("Pedido aceptado correctamente", paraActor(comercio, response)));
    }

    @PutMapping("/comercio/{id}/rechazar")
    public ResponseEntity<ApiResponse<?>> rechazarPedido(ComercioActivo comercio, @PathVariable Integer id,
            @Valid @RequestBody RechazoPedidoRequestDTO request) {
        PedidoResponseDTO response = pedidoService.rechazarPedido(comercio, id, request);
        return ResponseEntity.status(HttpStatus.OK).body(new ApiResponse<>("Pedido rechazado correctamente", paraActor(comercio, response)));
    }

    @PutMapping("/comercio/{id}/despachar")
    public ResponseEntity<ApiResponse<?>> avanzarAEntregaEnCurso(ComercioActivo comercio, @PathVariable Integer id) {
        PedidoResponseDTO response = pedidoService.avanzarAEntregaEnCurso(comercio, id);
        return ResponseEntity.status(HttpStatus.OK).body(new ApiResponse<>("Pedido despachado correctamente", paraActor(comercio, response)));
    }

    @PutMapping("/comercio/{id}/entregar")
    public ResponseEntity<ApiResponse<?>> confirmarEntregaComercio(ComercioActivo comercio, @PathVariable Integer id) {
        PedidoResponseDTO response = pedidoService.confirmarEntregaComercio(comercio, id);
        return ResponseEntity.status(HttpStatus.OK).body(new ApiResponse<>("Entrega confirmada correctamente", paraActor(comercio, response)));
    }

    @PutMapping("/comercio/{id}/no-retirado")
    public ResponseEntity<ApiResponse<?>> cerrarComoNoRetirado(ComercioActivo comercio, @PathVariable Integer id) {
        PedidoResponseDTO response = pedidoService.cerrarComoNoRetirado(comercio, id);
        return ResponseEntity.status(HttpStatus.OK).body(new ApiResponse<>("Pedido cerrado como no retirado", paraActor(comercio, response)));
    }

    @PutMapping("/comercio/{id}/anular")
    public ResponseEntity<ApiResponse<?>> anularPedido(ComercioActivo comercio, @PathVariable Integer id,
            @Valid @RequestBody AnulacionPedidoRequestDTO request) {
        PedidoResponseDTO response = pedidoService.anularPedido(comercio, id, request);
        return ResponseEntity.status(HttpStatus.OK).body(new ApiResponse<>("Pedido anulado correctamente", paraActor(comercio, response)));
    }

    private static Object paraActor(ComercioActivo comercio, PedidoResponseDTO pedido) {
        return comercio.esEmpleado() ? PedidoEmpleadoResponseDTO.desde(pedido, comercio.actorUsuarioId()) : pedido;
    }
}
