package com.bajonea.backend.services;

import com.bajonea.backend.dto.request.CategoriaRequestDTO;
import com.bajonea.backend.dto.response.CategoriaResponseDTO;
import com.bajonea.backend.entities.Categoria;
import com.bajonea.backend.exceptions.ConflictoDeNegocioException;
import com.bajonea.backend.exceptions.RecursoNoEncontradoException;
import com.bajonea.backend.repositories.CategoriaRepository;
import java.time.LocalDateTime;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional
public class CategoriaService {

    private final CategoriaRepository categoriaRepository;

    public CategoriaResponseDTO crear(CategoriaRequestDTO request) {
        if (categoriaRepository.existsByNombre(request.getNombre())) {
            throw new ConflictoDeNegocioException("Ya existe una categoría con ese nombre");
        }

        Categoria categoria = Categoria.builder()
                .nombre(request.getNombre())
                .activo(true)
                .fechaCreacion(LocalDateTime.now())
                .build();
        categoriaRepository.save(categoria);

        return aResponseDTO(categoria);
    }

    public CategoriaResponseDTO editar(Integer id, CategoriaRequestDTO request) {
        Categoria categoria = obtenerPorId(id);

        if (!categoria.getNombre().equals(request.getNombre()) && categoriaRepository.existsByNombre(request.getNombre())) {
            throw new ConflictoDeNegocioException("Ya existe una categoría con ese nombre");
        }

        categoria.setNombre(request.getNombre());
        categoria.setFechaModificacion(LocalDateTime.now());
        categoriaRepository.save(categoria);

        return aResponseDTO(categoria);
    }

    public List<CategoriaResponseDTO> listar() {
        return categoriaRepository.findAll().stream()
                .map(this::aResponseDTO)
                .toList();
    }

    public void baja(Integer id) {
        Categoria categoria = obtenerPorId(id);
        categoria.setActivo(false);
        categoria.setFechaBaja(LocalDateTime.now());
        categoriaRepository.save(categoria);
    }

    public CategoriaResponseDTO reactivar(Integer id) {
        Categoria categoria = obtenerPorId(id);
        categoria.setActivo(true);
        categoria.setFechaBaja(null);
        categoriaRepository.save(categoria);
        return aResponseDTO(categoria);
    }

    private Categoria obtenerPorId(Integer id) {
        return categoriaRepository.findById(id)
                .orElseThrow(() -> new RecursoNoEncontradoException("Categoría no encontrada"));
    }

    private CategoriaResponseDTO aResponseDTO(Categoria categoria) {
        return new CategoriaResponseDTO(categoria.getId(), categoria.getNombre(), categoria.isActivo());
    }
}
