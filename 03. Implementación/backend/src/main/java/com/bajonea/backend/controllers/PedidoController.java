package com.bajonea.backend.controllers;

import com.bajonea.backend.config.security.AuthenticatedUser;
import com.bajonea.backend.dto.request.PedidoRequestDTO;
import com.bajonea.backend.dto.request.RechazoPedidoRequestDTO;
import com.bajonea.backend.dto.response.ApiResponse;
import com.bajonea.backend.dto.response.PedidoResponseDTO;
import com.bajonea.backend.services.PedidoService;
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

    @GetMapping("/comercio")
    public ResponseEntity<ApiResponse<List<PedidoResponseDTO>>> listarPedidosComercio(
            @AuthenticationPrincipal AuthenticatedUser usuario) {
        List<PedidoResponseDTO> pedidos = pedidoService.listarPedidosComercio(usuario.userId());
        return ResponseEntity.status(HttpStatus.OK).body(new ApiResponse<>("Pedidos obtenidos correctamente", pedidos));
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
}
