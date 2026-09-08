package com.bajonea.backend.controllers;

import com.bajonea.backend.config.security.AuthenticatedUser;
import com.bajonea.backend.dto.request.CambioPasswordPerfilRequestDTO;
import com.bajonea.backend.dto.request.ConfirmarReactivacionCuentaRequestDTO;
import com.bajonea.backend.dto.request.ConfirmarRecuperacionPasswordRequestDTO;
import com.bajonea.backend.dto.request.LoginRequestDTO;
import com.bajonea.backend.dto.request.ReactivacionCuentaRequestDTO;
import com.bajonea.backend.dto.request.RecuperacionPasswordRequestDTO;
import com.bajonea.backend.dto.request.ReenviarVerificacionRequestDTO;
import com.bajonea.backend.dto.request.RegistroClienteRequestDTO;
import com.bajonea.backend.dto.request.RegistroComercioRequestDTO;
import com.bajonea.backend.dto.request.ValidarCodigoRecuperacionRequestDTO;
import com.bajonea.backend.dto.request.VerificarCodigoRequestDTO;
import com.bajonea.backend.dto.response.ApiResponse;
import com.bajonea.backend.dto.response.CloudinarySignatureResponseDTO;
import com.bajonea.backend.dto.response.LoginResponseDTO;
import com.bajonea.backend.dto.response.UsuarioResponseDTO;
import com.bajonea.backend.services.AuthService;
import com.bajonea.backend.services.CloudinaryService;
import com.bajonea.backend.services.RegistroService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/auth")
@RequiredArgsConstructor
public class AuthController {

    private final AuthService authService;
    private final RegistroService registroService;
    private final CloudinaryService cloudinaryService;

    @PostMapping("/registro/cliente")
    public ResponseEntity<ApiResponse<UsuarioResponseDTO>> registrarCliente(
            @Valid @RequestBody RegistroClienteRequestDTO request) {
        UsuarioResponseDTO response = registroService.registrarCliente(request);
        return ResponseEntity.status(HttpStatus.CREATED).body(new ApiResponse<>("Cliente registrado correctamente, verificá tu email", response));
    }

    @PostMapping("/registro/cliente/foto-firma")
    public ResponseEntity<ApiResponse<CloudinarySignatureResponseDTO>> generarFirmaFotoRegistroCliente() {
        CloudinarySignatureResponseDTO response = cloudinaryService.generarFirmaFotoPerfilRegistroCliente();
        return ResponseEntity.status(HttpStatus.OK).body(new ApiResponse<>("Firma generada correctamente", response));
    }

    @PostMapping("/registro/comercio")
    public ResponseEntity<ApiResponse<UsuarioResponseDTO>> registrarComercio(
            @Valid @RequestBody RegistroComercioRequestDTO request) {
        UsuarioResponseDTO response = registroService.registrarComercio(request);
        return ResponseEntity.status(HttpStatus.CREATED).body(new ApiResponse<>("Comercio registrado correctamente, verificá tu email", response));
    }

    @PostMapping("/registro/comercio/foto-firma")
    public ResponseEntity<ApiResponse<CloudinarySignatureResponseDTO>> generarFirmaFotoRegistroComercio() {
        CloudinarySignatureResponseDTO response = cloudinaryService.generarFirmaFotoPerfilRegistro();
        return ResponseEntity.status(HttpStatus.OK).body(new ApiResponse<>("Firma generada correctamente", response));
    }

    @PostMapping("/login")
    public ResponseEntity<ApiResponse<LoginResponseDTO>> login(@Valid @RequestBody LoginRequestDTO request,
            HttpServletRequest httpRequest) {
        LoginResponseDTO response = authService.login(request, httpRequest.getRemoteAddr(),
                httpRequest.getHeader(HttpHeaders.USER_AGENT));
        return ResponseEntity.status(HttpStatus.OK).body(new ApiResponse<>("Login exitoso", response));
    }

    @GetMapping("/verificar/{token}")
    public ResponseEntity<ApiResponse<Void>> verificarEmail(@PathVariable String token) {
        authService.verificarEmail(token);
        return ResponseEntity.status(HttpStatus.OK).body(new ApiResponse<>("Email verificado correctamente", null));
    }

    @PostMapping("/verificar")
    public ResponseEntity<ApiResponse<Void>> verificarEmailConCodigo(
            @Valid @RequestBody VerificarCodigoRequestDTO request) {
        authService.verificarEmailConCodigo(request);
        return ResponseEntity.status(HttpStatus.OK).body(new ApiResponse<>("Email verificado correctamente", null));
    }

    @PostMapping("/reenviar-verificacion")
    public ResponseEntity<ApiResponse<Void>> reenviarVerificacion(
            @Valid @RequestBody ReenviarVerificacionRequestDTO request) {
        authService.reenviarVerificacion(request);
        return ResponseEntity.status(HttpStatus.OK)
                .body(new ApiResponse<>("Si la cuenta existe y está pendiente de verificación, se envió un nuevo código", null));
    }

    @PostMapping("/recuperar-password")
    public ResponseEntity<ApiResponse<Void>> solicitarRecuperacionPassword(
            @Valid @RequestBody RecuperacionPasswordRequestDTO request) {
        authService.solicitarRecuperacionPassword(request);
        return ResponseEntity.status(HttpStatus.OK)
                .body(new ApiResponse<>("Si existe una cuenta asociada a ese email, vas a recibir un código para continuar", null));
    }

    @PostMapping("/recuperar-password/validar-codigo")
    public ResponseEntity<ApiResponse<Void>> validarCodigoRecuperacionPassword(
            @Valid @RequestBody ValidarCodigoRecuperacionRequestDTO request) {
        authService.validarCodigoRecuperacionPassword(request);
        return ResponseEntity.status(HttpStatus.OK).body(new ApiResponse<>("Código válido", null));
    }

    @PostMapping("/recuperar-password/confirmar")
    public ResponseEntity<ApiResponse<Void>> confirmarRecuperacionPassword(
            @Valid @RequestBody ConfirmarRecuperacionPasswordRequestDTO request) {
        authService.confirmarRecuperacionPassword(request);
        return ResponseEntity.status(HttpStatus.OK).body(new ApiResponse<>("Contraseña actualizada correctamente", null));
    }

    @PostMapping("/reactivar-cuenta")
    public ResponseEntity<ApiResponse<Void>> solicitarReactivacionCuenta(
            @Valid @RequestBody ReactivacionCuentaRequestDTO request) {
        authService.solicitarReactivacionCuenta(request);
        return ResponseEntity.status(HttpStatus.OK)
                .body(new ApiResponse<>("Si existe una cuenta asociada a ese email, vas a recibir un código para continuar", null));
    }

    @PostMapping("/reactivar-cuenta/confirmar")
    public ResponseEntity<ApiResponse<Void>> confirmarReactivacionCuenta(
            @Valid @RequestBody ConfirmarReactivacionCuentaRequestDTO request) {
        authService.confirmarReactivacionCuenta(request);
        return ResponseEntity.status(HttpStatus.OK).body(new ApiResponse<>("Cuenta reactivada correctamente", null));
    }

    @PostMapping("/cambiar-password")
    public ResponseEntity<ApiResponse<Void>> cambiarPasswordDesdePerfil(
            @Valid @RequestBody CambioPasswordPerfilRequestDTO request, @AuthenticationPrincipal AuthenticatedUser usuario) {
        authService.cambiarPasswordDesdePerfil(usuario.userId(), request);
        return ResponseEntity.status(HttpStatus.OK).body(new ApiResponse<>("Contraseña cambiada correctamente", null));
    }

    @PostMapping("/logout")
    public ResponseEntity<ApiResponse<Void>> logout(@AuthenticationPrincipal AuthenticatedUser usuario) {
        authService.logout(usuario.sesionId());
        return ResponseEntity.status(HttpStatus.OK).body(new ApiResponse<>("Sesión cerrada correctamente", null));
    }
}
