package com.bajonea.backend.controllers;

import com.bajonea.backend.config.security.AuthenticatedUser;
import com.bajonea.backend.config.security.ComercioActivo;
import com.bajonea.backend.dto.request.AltaComercioAdicionalRequestDTO;
import com.bajonea.backend.dto.request.ComercioDatosOperativosRequestDTO;
import com.bajonea.backend.dto.request.ComercioPerfilRequestDTO;
import com.bajonea.backend.dto.request.FotoPerfilComercioRequestDTO;
import com.bajonea.backend.dto.request.ReSolicitudComercioRequestDTO;
import com.bajonea.backend.dto.response.ApiResponse;
import com.bajonea.backend.dto.response.CierreComercioResponseDTO;
import com.bajonea.backend.dto.response.CloudinarySignatureResponseDTO;
import com.bajonea.backend.dto.response.ComercioResponseDTO;
import com.bajonea.backend.dto.response.CorreccionComercioResponseDTO;
import com.bajonea.backend.dto.response.DisponibilidadNombreComercioResponseDTO;
import com.bajonea.backend.dto.response.ElegibilidadAltaAdicionalResponseDTO;
import com.bajonea.backend.dto.response.MiComercioResponseDTO;
import com.bajonea.backend.enums.ActorCierre;
import com.bajonea.backend.services.AltaComercioAdicionalService;
import com.bajonea.backend.services.CierreComercioService;
import com.bajonea.backend.services.ComercioCorreccionService;
import com.bajonea.backend.services.ComercioService;
import com.bajonea.backend.services.MisComerciosService;
import com.bajonea.backend.services.NombreComercioService;
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
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/comercios")
@RequiredArgsConstructor
public class ComercioController {

    private final ComercioService comercioService;
    private final AltaComercioAdicionalService altaComercioAdicionalService;
    private final ComercioCorreccionService comercioCorreccionService;
    private final MisComerciosService misComerciosService;
    private final CierreComercioService cierreComercioService;
    private final NombreComercioService nombreComercioService;

    /**
     * Alta de un comercio adicional del Dueño autenticado (multi-comercio, tramo 2A). Igual que
     * {@code /alta-adicional/elegibilidad} y {@code /nuevo/foto/firma}, no declara {@code ComercioActivo}:
     * actúa sobre el Dueño, no sobre un comercio, e ignora {@code X-Comercio-Id}.
     */
    @PostMapping
    public ResponseEntity<ApiResponse<ComercioResponseDTO>> altaAdicional(@AuthenticationPrincipal AuthenticatedUser usuario,
            @Valid @RequestBody AltaComercioAdicionalRequestDTO request) {
        ComercioResponseDTO response = altaComercioAdicionalService.altaAdicional(usuario.userId(), request);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(new ApiResponse<>("Comercio enviado a revisión. Te avisamos cuando lo resuelva el equipo de Bajoneá", response));
    }

    /**
     * Todos los comercios del Dueño autenticado, en cualquier estado, con el contador de notificaciones no
     * leídas por comercio. No declara {@code ComercioActivo}: ignora {@code X-Comercio-Id} por completo.
     */
    @GetMapping("/mis-comercios")
    public ResponseEntity<ApiResponse<List<MiComercioResponseDTO>>> misComercios(
            @AuthenticationPrincipal AuthenticatedUser usuario) {
        List<MiComercioResponseDTO> comercios = misComerciosService.listar(usuario.userId());
        return ResponseEntity.status(HttpStatus.OK).body(new ApiResponse<>("Comercios obtenidos correctamente", comercios));
    }

    /**
     * Disponibilidad en vivo del nombre para el alta adicional, la corrección y el perfil. Exclusivo del Dueño
     * (no es delegable al Empleado) e ignora {@code X-Comercio-Id}; {@code comercioId} es el comercio que se
     * edita, que no cuenta contra sí mismo, y se valida contra el Dueño autenticado.
     */
    @GetMapping("/nombre/disponibilidad")
    public ResponseEntity<ApiResponse<DisponibilidadNombreComercioResponseDTO>> consultarDisponibilidadNombre(
            @AuthenticationPrincipal AuthenticatedUser usuario, @RequestParam String nombre,
            @RequestParam(required = false) Integer comercioId) {
        DisponibilidadNombreComercioResponseDTO response = nombreComercioService.consultarDisponibilidad(nombre, usuario.userId(), comercioId);
        return ResponseEntity.status(HttpStatus.OK).body(new ApiResponse<>("Consulta realizada correctamente", response));
    }

    @GetMapping("/alta-adicional/elegibilidad")
    public ResponseEntity<ApiResponse<ElegibilidadAltaAdicionalResponseDTO>> consultarElegibilidad(
            @AuthenticationPrincipal AuthenticatedUser usuario) {
        ElegibilidadAltaAdicionalResponseDTO response = altaComercioAdicionalService.consultarElegibilidad(usuario.userId());
        return ResponseEntity.status(HttpStatus.OK).body(new ApiResponse<>("Elegibilidad consultada correctamente", response));
    }

    @PostMapping("/nuevo/foto/firma")
    public ResponseEntity<ApiResponse<CloudinarySignatureResponseDTO>> generarFirmaFotoNuevoComercio(
            @AuthenticationPrincipal AuthenticatedUser usuario) {
        CloudinarySignatureResponseDTO response = altaComercioAdicionalService.generarFirmaFoto(usuario.userId());
        return ResponseEntity.status(HttpStatus.OK).body(new ApiResponse<>("Firma generada correctamente", response));
    }

    /**
     * Precarga de la corrección de un comercio rechazado del Dueño autenticado (multi-comercio, tramo 3).
     * Como las otras rutas por id de este controlador, no declara {@code ComercioActivo}: el comercio viene
     * en la ruta y se valida contra el Dueño autenticado; si no es suyo, no existe o no está rechazado, es
     * un {@code 404} idéntico en los tres casos.
     */
    @GetMapping("/{comercioId}/correccion")
    public ResponseEntity<ApiResponse<CorreccionComercioResponseDTO>> obtenerCorreccion(
            @AuthenticationPrincipal AuthenticatedUser usuario, @PathVariable Integer comercioId) {
        CorreccionComercioResponseDTO response = comercioCorreccionService.obtenerCorreccion(usuario.userId(), comercioId);
        return ResponseEntity.status(HttpStatus.OK).body(new ApiResponse<>("Corrección obtenida correctamente", response));
    }

    @PutMapping("/{comercioId}/resolicitud")
    public ResponseEntity<ApiResponse<ComercioResponseDTO>> reSolicitar(@AuthenticationPrincipal AuthenticatedUser usuario,
            @PathVariable Integer comercioId, @Valid @RequestBody ReSolicitudComercioRequestDTO request) {
        ComercioResponseDTO response = comercioCorreccionService.reSolicitar(usuario.userId(), comercioId, request);
        return ResponseEntity.status(HttpStatus.OK)
                .body(new ApiResponse<>("Comercio enviado nuevamente a revisión. Te avisamos cuando lo resuelva el equipo de Bajoneá", response));
    }

    @PostMapping("/{comercioId}/correccion/foto/firma")
    public ResponseEntity<ApiResponse<CloudinarySignatureResponseDTO>> generarFirmaFotoCorreccion(
            @AuthenticationPrincipal AuthenticatedUser usuario, @PathVariable Integer comercioId) {
        CloudinarySignatureResponseDTO response = comercioCorreccionService.generarFirmaFoto(usuario.userId(), comercioId);
        return ResponseEntity.status(HttpStatus.OK).body(new ApiResponse<>("Firma generada correctamente", response));
    }

    /**
     * Ruta delegable (ver {@code DelegacionEmpleado}): el Dueño recibe el perfil completo y el Empleado el DTO
     * reducido, sin datos fiscales ni del titular.
     */
    @GetMapping("/perfil")
    public ResponseEntity<ApiResponse<?>> verPerfil(ComercioActivo comercio) {
        Object response = comercio.esEmpleado()
                ? comercioService.verPerfilEmpleado(comercio.comercioId())
                : comercioService.verPerfil(comercio.comercioId());
        return ResponseEntity.status(HttpStatus.OK).body(new ApiResponse<>("Perfil obtenido correctamente", response));
    }

    @PutMapping("/perfil")
    public ResponseEntity<ApiResponse<ComercioResponseDTO>> editarPerfil(ComercioActivo comercio,
            @Valid @RequestBody ComercioPerfilRequestDTO request) {
        ComercioResponseDTO response = comercioService.editarPerfil(comercio, request);
        return ResponseEntity.status(HttpStatus.OK).body(new ApiResponse<>("Perfil actualizado correctamente", response));
    }

    @PostMapping("/perfil/foto/firma")
    public ResponseEntity<ApiResponse<CloudinarySignatureResponseDTO>> generarFirmaFotoPerfil(
            ComercioActivo comercio) {
        CloudinarySignatureResponseDTO response = comercioService.generarFirmaFotoPerfil(comercio.comercioId());
        return ResponseEntity.status(HttpStatus.OK).body(new ApiResponse<>("Firma generada correctamente", response));
    }

    @PutMapping("/perfil/foto")
    public ResponseEntity<ApiResponse<ComercioResponseDTO>> actualizarFotoPerfil(
            ComercioActivo comercio, @Valid @RequestBody FotoPerfilComercioRequestDTO request) {
        ComercioResponseDTO response = comercioService.actualizarFotoPerfil(comercio, request);
        return ResponseEntity.status(HttpStatus.OK).body(new ApiResponse<>("Foto de perfil actualizada correctamente", response));
    }

    /**
     * Edición de descripción y teléfono, delegable al Empleado (ver {@code DelegacionEmpleado}). El Dueño sigue
     * editando el perfil completo con {@code PUT /perfil}, exclusivo suyo. La respuesta es el perfil reducido para el
     * Empleado y el completo para el Dueño.
     */
    @PutMapping("/perfil/datos-operativos")
    public ResponseEntity<ApiResponse<?>> editarDatosOperativos(ComercioActivo comercio,
            @Valid @RequestBody ComercioDatosOperativosRequestDTO request) {
        Object response = comercioService.editarDatosOperativos(comercio, request);
        return ResponseEntity.status(HttpStatus.OK).body(new ApiResponse<>("Perfil actualizado correctamente", response));
    }

    /**
     * Cierre manual del comercio activo: frena pedidos nuevos, no corta los que están en curso. Solo dentro de
     * una franja horaria. Idempotente: cerrar un comercio ya cerrado responde {@code 200} con el estado actual.
     * Delegable al Empleado: el actor y su usuario se toman del comercio activo.
     */
    @PutMapping("/cerrar")
    public ResponseEntity<ApiResponse<CierreComercioResponseDTO>> cerrar(ComercioActivo comercio) {
        CierreComercioResponseDTO response = cierreComercioService.cerrar(comercio.comercioId(), comercio.actorUsuarioId(),
                actorDeCierre(comercio));
        return ResponseEntity.status(HttpStatus.OK).body(new ApiResponse<>("Estado de apertura actualizado correctamente", response));
    }

    @PutMapping("/abrir")
    public ResponseEntity<ApiResponse<CierreComercioResponseDTO>> abrir(ComercioActivo comercio) {
        CierreComercioResponseDTO response = cierreComercioService.abrir(comercio.comercioId(), comercio.actorUsuarioId(),
                actorDeCierre(comercio));
        return ResponseEntity.status(HttpStatus.OK).body(new ApiResponse<>("Estado de apertura actualizado correctamente", response));
    }

    private static ActorCierre actorDeCierre(ComercioActivo comercio) {
        return comercio.esEmpleado() ? ActorCierre.EMPLEADO : ActorCierre.DUENO;
    }
}
