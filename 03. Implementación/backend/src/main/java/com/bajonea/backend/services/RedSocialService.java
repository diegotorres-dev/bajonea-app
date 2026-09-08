package com.bajonea.backend.services;

import com.bajonea.backend.dto.request.RedSocialRequestDTO;
import com.bajonea.backend.dto.response.RedSocialResponseDTO;
import com.bajonea.backend.entities.Comercio;
import com.bajonea.backend.entities.RedSocial;
import com.bajonea.backend.exceptions.ConflictoDeNegocioException;
import com.bajonea.backend.exceptions.RecursoNoEncontradoException;
import com.bajonea.backend.repositories.ComercioRepository;
import com.bajonea.backend.repositories.RedSocialRepository;
import java.time.LocalDateTime;
import java.util.List;
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

    public List<RedSocialResponseDTO> listarActivas(Integer usuarioId) {
        Comercio comercio = obtenerComercioDelUsuario(usuarioId);
        return redSocialRepository.findByComercioIdAndFechaBajaIsNull(comercio.getId()).stream()
                .map(this::aResponseDTO)
                .toList();
    }

    public RedSocialResponseDTO agregar(Integer usuarioId, RedSocialRequestDTO request) {
        Comercio comercio = obtenerComercioDelUsuario(usuarioId);
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
            return aResponseDTO(nueva);
        }

        existente.setUrl(request.getUrl());
        existente.setFechaBaja(null);
        existente.setFechaModificacion(LocalDateTime.now());
        redSocialRepository.save(existente);
        return aResponseDTO(existente);
    }

    public RedSocialResponseDTO editar(Integer usuarioId, Integer redSocialId, RedSocialRequestDTO request) {
        Comercio comercio = obtenerComercioDelUsuario(usuarioId);
        RedSocial redSocial = obtenerRedSocialDelComercio(redSocialId, comercio);

        redSocial.setUrl(request.getUrl());
        redSocial.setFechaModificacion(LocalDateTime.now());
        redSocialRepository.save(redSocial);
        return aResponseDTO(redSocial);
    }

    public void darDeBaja(Integer usuarioId, Integer redSocialId) {
        Comercio comercio = obtenerComercioDelUsuario(usuarioId);
        RedSocial redSocial = obtenerRedSocialDelComercio(redSocialId, comercio);

        redSocial.setFechaBaja(LocalDateTime.now());
        redSocialRepository.save(redSocial);
    }

    private Comercio obtenerComercioDelUsuario(Integer usuarioId) {
        return comercioRepository.findByDuenoId(usuarioId)
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
