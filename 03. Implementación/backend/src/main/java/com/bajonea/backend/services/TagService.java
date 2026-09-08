package com.bajonea.backend.services;

import com.bajonea.backend.dto.request.TagRequestDTO;
import com.bajonea.backend.dto.response.TagResponseDTO;
import com.bajonea.backend.entities.Tag;
import com.bajonea.backend.exceptions.ConflictoDeNegocioException;
import com.bajonea.backend.exceptions.RecursoNoEncontradoException;
import com.bajonea.backend.repositories.ProductoTagRepository;
import com.bajonea.backend.repositories.TagRepository;
import java.time.LocalDateTime;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional
public class TagService {

    private final TagRepository tagRepository;
    private final ProductoTagRepository productoTagRepository;

    public TagResponseDTO crear(TagRequestDTO request) {
        if (tagRepository.existsByNombre(request.getNombre())) {
            throw new ConflictoDeNegocioException("Ya existe un tag con ese nombre");
        }

        Tag tag = Tag.builder()
                .nombre(request.getNombre())
                .activo(true)
                .fechaCreacion(LocalDateTime.now())
                .build();
        tagRepository.save(tag);

        return aResponseDTO(tag);
    }

    public TagResponseDTO editar(Integer id, TagRequestDTO request) {
        Tag tag = obtenerPorId(id);

        if (!tag.getNombre().equals(request.getNombre()) && tagRepository.existsByNombre(request.getNombre())) {
            throw new ConflictoDeNegocioException("Ya existe un tag con ese nombre");
        }

        tag.setNombre(request.getNombre());
        tag.setFechaModificacion(LocalDateTime.now());
        tagRepository.save(tag);

        return aResponseDTO(tag);
    }

    public List<TagResponseDTO> listar() {
        return tagRepository.findAll().stream()
                .map(this::aResponseDTO)
                .toList();
    }

    public void baja(Integer id) {
        Tag tag = obtenerPorId(id);
        tag.setActivo(false);
        tag.setFechaBaja(LocalDateTime.now());
        tagRepository.save(tag);
    }

    public TagResponseDTO reactivar(Integer id) {
        Tag tag = obtenerPorId(id);
        tag.setActivo(true);
        tag.setFechaBaja(null);
        tagRepository.save(tag);
        return aResponseDTO(tag);
    }

    private Tag obtenerPorId(Integer id) {
        return tagRepository.findById(id)
                .orElseThrow(() -> new RecursoNoEncontradoException("Tag no encontrado"));
    }

    private TagResponseDTO aResponseDTO(Tag tag) {
        long cantidadProductos = productoTagRepository.countByTagId(tag.getId());
        return new TagResponseDTO(tag.getId(), tag.getNombre(), tag.isActivo(), cantidadProductos);
    }
}
