package com.bajonea.backend.services;

import com.bajonea.backend.dto.response.ComercioResponseDTO;
import com.bajonea.backend.dto.response.ProductoResponseDTO;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

/**
 * Catálogo público (Fase 9, sección 9.3). Delegado deliberadamente delgado: la resolución
 * de qué es un comercio "visible" y qué es un producto "visible" ya vive en
 * {@code ComercioService}/{@code ProductoService} respectivamente — este Service no repite
 * queries ni mapeo Entity→DTO, mismo criterio de centralización que {@code NotificacionService}
 * (ver docs/DECISIONES.md).
 */
@Service
@RequiredArgsConstructor
public class CatalogoService {

    private final ComercioService comercioService;
    private final ProductoService productoService;

    public List<ComercioResponseDTO> listarComerciosAprobados() {
        return comercioService.listarAprobados();
    }

    public List<ProductoResponseDTO> listarProductosDelComercio(Integer comercioId, Integer categoriaId, Integer tagId) {
        comercioService.buscarAprobadoPorId(comercioId);
        return productoService.listarCatalogoDelComercio(comercioId, categoriaId, tagId);
    }
}
