package com.bajonea.backend.services;

import com.bajonea.backend.dto.response.LocalidadResponseDTO;
import com.bajonea.backend.dto.response.ProvinciaResponseDTO;
import com.bajonea.backend.entities.Localidad;
import com.bajonea.backend.entities.Provincia;
import com.bajonea.backend.repositories.LocalidadRepository;
import com.bajonea.backend.repositories.ProvinciaRepository;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

/**
 * Catálogo de solo lectura precargado por el ETL de Georef (Fase 2bis) — sin lógica de
 * negocio, solo mapeo Entity→DTO para los selectores dependientes de Provincia/Localidad.
 */
@Service
@RequiredArgsConstructor
public class GeografiaService {

    private final ProvinciaRepository provinciaRepository;
    private final LocalidadRepository localidadRepository;

    public List<ProvinciaResponseDTO> listarProvincias() {
        return provinciaRepository.findAll().stream()
                .map(this::aResponseDTO)
                .toList();
    }

    public List<LocalidadResponseDTO> listarLocalidadesPorProvincia(String provinciaId) {
        return localidadRepository.findByProvinciaId(provinciaId).stream()
                .map(localidad -> aResponseDTO(localidad, provinciaId))
                .toList();
    }

    private ProvinciaResponseDTO aResponseDTO(Provincia provincia) {
        return new ProvinciaResponseDTO(provincia.getId(), provincia.getNombre());
    }

    private LocalidadResponseDTO aResponseDTO(Localidad localidad, String provinciaId) {
        // provinciaId ya viene del parámetro del filtro — evita navegar la relación LAZY
        // localidad.getProvincia() fuera de una transacción activa.
        return new LocalidadResponseDTO(localidad.getId(), localidad.getNombre(), provinciaId);
    }
}
