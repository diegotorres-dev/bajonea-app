package com.bajonea.backend.services;

import com.bajonea.backend.dto.request.AprobacionComercioRequestDTO;
import com.bajonea.backend.dto.response.ComercioResponseDTO;
import com.bajonea.backend.dto.response.DireccionResponseDTO;
import com.bajonea.backend.entities.Administrador;
import com.bajonea.backend.entities.Comercio;
import com.bajonea.backend.entities.Direccion;
import com.bajonea.backend.entities.HistorialEstadoComercio;
import com.bajonea.backend.enums.EstadoComercio;
import com.bajonea.backend.exceptions.ConflictoDeNegocioException;
import com.bajonea.backend.exceptions.RecursoNoEncontradoException;
import com.bajonea.backend.exceptions.ValidacionException;
import com.bajonea.backend.repositories.AdministradorRepository;
import com.bajonea.backend.repositories.ComercioRepository;
import com.bajonea.backend.repositories.DireccionRepository;
import com.bajonea.backend.repositories.HistorialEstadoComercioRepository;
import java.time.LocalDateTime;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Aprobación/rechazo de Comercio por el Administrador. No incluye gestión de Categoría/Tag —
 * ver {@code docs/DECISIONES.md}, 2026-07-17 (`CategoriaService`/`TagService` son clases
 * separadas por diseño de `CLAUDE.md` §3, tanda propia).
 */
@Service
@RequiredArgsConstructor
@Transactional
public class AdministradorService {

    private final ComercioRepository comercioRepository;
    private final DireccionRepository direccionRepository;
    private final AdministradorRepository administradorRepository;
    private final HistorialEstadoComercioRepository historialEstadoComercioRepository;
    private final NotificacionService notificacionService;

    public List<ComercioResponseDTO> listarComerciosPendientes() {
        return comercioRepository.findByEstado(EstadoComercio.PENDIENTE).stream()
                .map(this::aResponseDTO)
                .toList();
    }

    public void resolverAprobacion(Integer comercioId, Integer administradorId, AprobacionComercioRequestDTO request) {
        Comercio comercio = comercioRepository.findById(comercioId)
                .orElseThrow(() -> new RecursoNoEncontradoException("Comercio no encontrado"));

        if (comercio.getEstado() != EstadoComercio.PENDIENTE) {
            throw new ConflictoDeNegocioException("El comercio ya fue resuelto, no está en estado PENDIENTE");
        }

        boolean aprobar = Boolean.TRUE.equals(request.getAprobar());
        if (!aprobar && (request.getMotivo() == null || request.getMotivo().isBlank())) {
            throw new ValidacionException("El motivo es obligatorio al rechazar un comercio");
        }

        Administrador administrador = administradorRepository.findById(administradorId)
                .orElseThrow(() -> new RecursoNoEncontradoException("Administrador no encontrado"));

        EstadoComercio estadoOrigen = comercio.getEstado();
        EstadoComercio estadoDestino = aprobar ? EstadoComercio.APROBADO : EstadoComercio.RECHAZADO;
        comercio.setEstado(estadoDestino);
        comercio.setFechaModificacion(LocalDateTime.now());
        comercioRepository.save(comercio);

        HistorialEstadoComercio historial = HistorialEstadoComercio.builder()
                .comercio(comercio)
                .administrador(administrador)
                .estadoOrigen(estadoOrigen)
                .estadoDestino(estadoDestino)
                .motivo(request.getMotivo())
                .fechaHora(LocalDateTime.now())
                .build();
        historialEstadoComercioRepository.save(historial);

        String mensaje = aprobar
                ? "Tu comercio '" + comercio.getNombre() + "' fue aprobado."
                : "Tu comercio '" + comercio.getNombre() + "' fue rechazado. Motivo: " + request.getMotivo();

        notificacionService.crear(comercio.getPersonaJuridica().getPersona().getUsuario().getId(), mensaje);
    }

    private ComercioResponseDTO aResponseDTO(Comercio comercio) {
        Direccion direccion = direccionRepository.findByComercioId(comercio.getId()).orElse(null);
        DireccionResponseDTO direccionDTO = direccion == null ? null : new DireccionResponseDTO(
                direccion.getId(),
                direccion.getCalle(),
                direccion.getNumero(),
                direccion.getPisoDepto(),
                direccion.getCodigoPostal(),
                direccion.getLocalidad().getId(),
                direccion.getLocalidad().getNombre(),
                direccion.getLocalidad().getProvincia().getNombre(),
                direccion.isPrincipal());

        return new ComercioResponseDTO(
                comercio.getId(),
                comercio.getNombre(),
                comercio.getDescripcion(),
                comercio.getFotoPerfilUrl(),
                comercio.getTelefono(),
                comercio.getEmail(),
                comercio.getTipoComercio(),
                comercio.isAceptaDelivery(),
                comercio.isAceptaRetiro(),
                comercio.getEstado(),
                comercio.getPersonaJuridica().getRazonSocial(),
                comercio.getPersonaJuridica().getCuit(),
                direccionDTO);
    }
}
