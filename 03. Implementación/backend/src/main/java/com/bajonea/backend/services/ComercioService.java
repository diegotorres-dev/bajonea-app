package com.bajonea.backend.services;

import com.bajonea.backend.dto.request.ComercioPerfilRequestDTO;
import com.bajonea.backend.dto.request.FotoPerfilComercioRequestDTO;
import com.bajonea.backend.dto.response.ComercioResponseDTO;
import com.bajonea.backend.dto.response.CloudinarySignatureResponseDTO;
import com.bajonea.backend.dto.response.DireccionResponseDTO;
import com.bajonea.backend.entities.Comercio;
import com.bajonea.backend.entities.Direccion;
import com.bajonea.backend.enums.EstadoComercio;
import com.bajonea.backend.exceptions.RecursoNoEncontradoException;
import com.bajonea.backend.repositories.ComercioRepository;
import com.bajonea.backend.repositories.DireccionRepository;
import java.time.LocalDateTime;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Autoservicio de perfil del propio Comercio, incluida la foto de perfil vía firma de
 * Cloudinary (Fase 11 — flujo separado del de la galería de {@code ProductoService}, sin
 * límite de cantidad). No incluye CRUD de Producto — ver {@code ProductoService}, misma
 * tanda de resolución {@code usuarioId (JWT) → Comercio} vía
 * {@code ComercioRepository.findByPersonaJuridicaId}.
 */
@Service
@RequiredArgsConstructor
@Transactional
public class ComercioService {

    private final ComercioRepository comercioRepository;
    private final DireccionRepository direccionRepository;
    private final CloudinaryService cloudinaryService;

    public ComercioResponseDTO verPerfil(Integer usuarioId) {
        Comercio comercio = obtenerComercioDelUsuario(usuarioId);
        return aResponseDTO(comercio);
    }

    public ComercioResponseDTO editarPerfil(Integer usuarioId, ComercioPerfilRequestDTO request) {
        Comercio comercio = obtenerComercioDelUsuario(usuarioId);

        comercio.setNombre(request.getNombre());
        comercio.setDescripcion(request.getDescripcion());
        comercio.setTelefono(request.getTelefono());
        comercio.setEmail(request.getEmailContacto());
        comercio.setAceptaDelivery(request.isAceptaDelivery());
        comercio.setAceptaRetiro(request.isAceptaRetiro());
        comercio.setFechaModificacion(LocalDateTime.now());
        comercioRepository.save(comercio);

        return aResponseDTO(comercio);
    }

    public CloudinarySignatureResponseDTO generarFirmaFotoPerfil(Integer usuarioId) {
        Comercio comercio = obtenerComercioDelUsuario(usuarioId);
        return cloudinaryService.generarFirmaFotoPerfilComercio(comercio.getId());
    }

    public ComercioResponseDTO actualizarFotoPerfil(Integer usuarioId, FotoPerfilComercioRequestDTO request) {
        Comercio comercio = obtenerComercioDelUsuario(usuarioId);
        comercio.setFotoPerfilUrl(request.getUrl());
        comercio.setFechaModificacion(LocalDateTime.now());
        comercioRepository.save(comercio);
        return aResponseDTO(comercio);
    }

    public List<ComercioResponseDTO> listarAprobados() {
        return comercioRepository.findByEstado(EstadoComercio.APROBADO).stream()
                .map(this::aResponseDTO)
                .toList();
    }

    public ComercioResponseDTO buscarAprobadoPorId(Integer comercioId) {
        Comercio comercio = comercioRepository.findById(comercioId)
                .filter(c -> c.getEstado() == EstadoComercio.APROBADO)
                .orElseThrow(() -> new RecursoNoEncontradoException("Comercio no encontrado"));
        return aResponseDTO(comercio);
    }

    private Comercio obtenerComercioDelUsuario(Integer usuarioId) {
        return comercioRepository.findByPersonaJuridicaId(usuarioId)
                .orElseThrow(() -> new RecursoNoEncontradoException("Comercio no encontrado"));
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
