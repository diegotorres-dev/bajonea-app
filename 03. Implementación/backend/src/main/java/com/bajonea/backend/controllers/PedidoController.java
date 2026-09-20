package com.bajonea.backend.controllers;

import com.bajonea.backend.config.security.AuthenticatedUser;
import com.bajonea.backend.dto.request.AnulacionPedidoRequestDTO;
import com.bajonea.backend.dto.request.PedidoRequestDTO;
import com.bajonea.backend.dto.request.RechazoPedidoRequestDTO;
import com.bajonea.backend.dto.response.ApiResponse;
import com.bajonea.backend.dto.response.PagoResponseDTO;
import com.bajonea.backend.dto.response.PedidoResponseDTO;
import com.bajonea.backend.dto.response.ResumenPedidosHoyResponseDTO;
import com.bajonea.backend.services.MercadoPagoPagoService;
import com.bajonea.backend.services.PedidoService;
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
            @AuthenticationPrincipal AuthenticatedUser usuario) {
        PagoResponseDTO response = mercadoPagoPagoService.consultarComoComercio(usuario.userId(), id);
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

    @GetMapping("/comercio")
    public ResponseEntity<ApiResponse<List<PedidoResponseDTO>>> listarPedidosComercio(
            @AuthenticationPrincipal AuthenticatedUser usuario) {
        List<PedidoResponseDTO> pedidos = pedidoService.listarPedidosComercio(usuario.userId());
        return ResponseEntity.status(HttpStatus.OK).body(new ApiResponse<>("Pedidos obtenidos correctamente", pedidos));
    }

    @GetMapping("/comercio/resumen-hoy")
    public ResponseEntity<ApiResponse<ResumenPedidosHoyResponseDTO>> obtenerResumenHoy(
            @AuthenticationPrincipal AuthenticatedUser usuario) {
        ResumenPedidosHoyResponseDTO response = pedidoService.obtenerResumenHoy(usuario.userId());
        return ResponseEntity.status(HttpStatus.OK).body(new ApiResponse<>("Resumen obtenido correctamente", response));
    }

    @PutMapping("/comercio/{id}/aceptar")
    public ResponseEntity<ApiResponse<PedidoResponseDTO>> aceptarPedido(@PathVariable Integer id,
            @AuthenticationPrincipal AuthenticatedUser usuario) {
        PedidoResponseDTO response = pedidoService.aceptarPedido(usuario.userId(), id);
        return ResponseEntity.status(HttpStatus.OK).body(new ApiResponse<>("Pedido aceptado correctamente", response));
    }

    @PutMapping("/comercio/{id}/rechazar")
    public ResponseEntity<ApiResponse<PedidoResponseDTO>> rechazarPedido(@PathVariable Integer id,
            @Valid @RequestBody RechazoPedidoRequestDTO request, @AuthenticationPrincipal AuthenticatedUser usuario) {
        PedidoResponseDTO response = pedidoService.rechazarPedido(usuario.userId(), id, request);
        return ResponseEntity.status(HttpStatus.OK).body(new ApiResponse<>("Pedido rechazado correctamente", response));
    }

    @PutMapping("/comercio/{id}/despachar")
    public ResponseEntity<ApiResponse<PedidoResponseDTO>> avanzarAEntregaEnCurso(@PathVariable Integer id,
            @AuthenticationPrincipal AuthenticatedUser usuario) {
        PedidoResponseDTO response = pedidoService.avanzarAEntregaEnCurso(usuario.userId(), id);
        return ResponseEntity.status(HttpStatus.OK).body(new ApiResponse<>("Pedido despachado correctamente", response));
    }

    @PutMapping("/comercio/{id}/entregar")
    public ResponseEntity<ApiResponse<PedidoResponseDTO>> confirmarEntregaComercio(@PathVariable Integer id,
            @AuthenticationPrincipal AuthenticatedUser usuario) {
        PedidoResponseDTO response = pedidoService.confirmarEntregaComercio(usuario.userId(), id);
        return ResponseEntity.status(HttpStatus.OK).body(new ApiResponse<>("Entrega confirmada correctamente", response));
    }

    @PutMapping("/comercio/{id}/anular")
    public ResponseEntity<ApiResponse<PedidoResponseDTO>> anularPedido(@PathVariable Integer id,
            @Valid @RequestBody AnulacionPedidoRequestDTO request, @AuthenticationPrincipal AuthenticatedUser usuario) {
        PedidoResponseDTO response = pedidoService.anularPedido(usuario.userId(), id, request);
        return ResponseEntity.status(HttpStatus.OK).body(new ApiResponse<>("Pedido anulado correctamente", response));
    }
}
