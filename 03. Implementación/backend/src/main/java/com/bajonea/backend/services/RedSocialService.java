package com.bajonea.backend.services;

import com.bajonea.backend.config.security.ComercioActivo;
import com.bajonea.backend.dto.request.RedSocialRequestDTO;
import com.bajonea.backend.dto.response.RedSocialResponseDTO;
import com.bajonea.backend.entities.Comercio;
import com.bajonea.backend.entities.RedSocial;
import com.bajonea.backend.enums.AccionEdicion;
import com.bajonea.backend.enums.TipoEntidadEdicion;
import com.bajonea.backend.enums.TipoRedSocial;
import com.bajonea.backend.exceptions.ConflictoDeNegocioException;
import com.bajonea.backend.exceptions.RecursoNoEncontradoException;
import com.bajonea.backend.repositories.ComercioRepository;
import com.bajonea.backend.repositories.RedSocialRepository;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Objects;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional
public class RedSocialService {

    private static final int MAX_REDES_SOCIALES_ACTIVAS = 5;

    private final RedSocialRepository redSocialRepository;
    private final ComercioRepository comercioRepository;
    private final HistorialEdicionComercioService historialEdicionComercioService;

    public List<RedSocialResponseDTO> listarActivas(Integer comercioId) {
        Comercio comercio = obtenerComercio(comercioId);
        return redSocialRepository.findByComercioIdAndFechaBajaIsNull(comercio.getId()).stream()
                .map(this::aResponseDTO)
                .toList();
    }

    public RedSocialResponseDTO agregar(ComercioActivo actor, RedSocialRequestDTO request) {
        historialEdicionComercioService.iniciarEscritura(actor);
        Comercio comercio = obtenerComercio(actor.comercioId());
        RedSocial existente = redSocialRepository.findByComercioIdAndTipo(comercio.getId(), request.getTipo())
                .orElse(null);

        if (existente != null && existente.getFechaBaja() == null) {
            throw new ConflictoDeNegocioException(
                    "El comercio ya tiene una red social activa de tipo " + request.getTipo());
        }

        long activas = redSocialRepository.countByComercioIdAndFechaBajaIsNull(comercio.getId());
        if (activas >= MAX_REDES_SOCIALES_ACTIVAS) {
            throw new ConflictoDeNegocioException(
                    "El comercio ya tiene el máximo de " + MAX_REDES_SOCIALES_ACTIVAS + " redes sociales activas");
        }

        if (existente == null) {
            RedSocial nueva = RedSocial.builder()
                    .comercio(comercio)
                    .tipo(request.getTipo())
                    .url(request.getUrl())
                    .fechaCreacion(LocalDateTime.now())
                    .build();
            redSocialRepository.save(nueva);
            historialEdicionComercioService.registrar(actor, TipoEntidadEdicion.RED_SOCIAL, nueva.getId(), nombreDe(nueva.getTipo()),
                    AccionEdicion.CREAR, null);
            return aResponseDTO(nueva);
        }

        existente.setUrl(request.getUrl());
        existente.setFechaBaja(null);
        existente.setFechaModificacion(LocalDateTime.now());
        redSocialRepository.save(existente);
        historialEdicionComercioService.registrar(actor, TipoEntidadEdicion.RED_SOCIAL, existente.getId(), nombreDe(existente.getTipo()),
                AccionEdicion.CREAR, null);
        return aResponseDTO(existente);
    }

    public RedSocialResponseDTO editar(ComercioActivo actor, Integer redSocialId, RedSocialRequestDTO request) {
        historialEdicionComercioService.iniciarEscritura(actor);
        Comercio comercio = obtenerComercio(actor.comercioId());
        RedSocial redSocial = obtenerRedSocialDelComercio(redSocialId, comercio);

        boolean cambioElEnlace = !Objects.equals(redSocial.getUrl(), request.getUrl());
        redSocial.setUrl(request.getUrl());
        redSocial.setFechaModificacion(LocalDateTime.now());
        redSocialRepository.save(redSocial);
        if (cambioElEnlace) {
            historialEdicionComercioService.registrar(actor, TipoEntidadEdicion.RED_SOCIAL, redSocial.getId(),
                    nombreDe(redSocial.getTipo()), AccionEdicion.EDITAR, HistorialEdicionComercioService.detalleDeEdicion(List.of("enlace")));
        }
        return aResponseDTO(redSocial);
    }

    public void darDeBaja(ComercioActivo actor, Integer redSocialId) {
        historialEdicionComercioService.iniciarEscritura(actor);
        Comercio comercio = obtenerComercio(actor.comercioId());
        RedSocial redSocial = obtenerRedSocialDelComercio(redSocialId, comercio);

        redSocial.setFechaBaja(LocalDateTime.now());
        redSocialRepository.save(redSocial);
        historialEdicionComercioService.registrar(actor, TipoEntidadEdicion.RED_SOCIAL, redSocial.getId(), nombreDe(redSocial.getTipo()),
                AccionEdicion.ELIMINAR, null);
    }

    private static String nombreDe(TipoRedSocial tipo) {
        return switch (tipo) {
            case INSTAGRAM -> "Instagram";
            case FACEBOOK -> "Facebook";
            case TIKTOK -> "TikTok";
            case WHATSAPP -> "WhatsApp";
            case X -> "X";
            case SITIO_WEB -> "Sitio web";
            case OTRO -> "Otra red social";
        };
    }

    private Comercio obtenerComercio(Integer comercioId) {
        return comercioRepository.findById(comercioId)
                .orElseThrow(() -> new RecursoNoEncontradoException("Comercio no encontrado"));
    }

    private RedSocial obtenerRedSocialDelComercio(Integer redSocialId, Comercio comercio) {
        RedSocial redSocial = redSocialRepository.findById(redSocialId)
                .orElseThrow(() -> new RecursoNoEncontradoException("Red social no encontrada"));
        if (!redSocial.getComercio().getId().equals(comercio.getId())) {
            throw new RecursoNoEncontradoException("Red social no encontrada");
        }
        return redSocial;
    }

    private RedSocialResponseDTO aResponseDTO(RedSocial redSocial) {
        return new RedSocialResponseDTO(redSocial.getId(), redSocial.getTipo(), redSocial.getUrl(),
                redSocial.getFechaCreacion(), redSocial.getFechaModificacion());
    }
}
