package com.bajonea.backend.services;

import com.bajonea.backend.dto.response.ComercioPublicoResponseDTO;
import com.bajonea.backend.dto.response.FiltrosCatalogoResponseDTO;
import com.bajonea.backend.dto.response.ProductoResponseDTO;
import com.bajonea.backend.dto.response.ProductosPaginadosResponseDTO;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

/**
 * Catálogo público (Fase 9, sección 9.3). Delegado deliberadamente delgado: la resolución
 * de qué es un comercio "visible" y qué es un producto "visible" ya vive en
 * {@code ComercioService}/{@code ProductoService} respectivamente — este Service no repite
 * queries ni mapeo Entity→DTO, mismo criterio de centralización que {@code NotificacionService}
 * (ver docs/DECISIONES.md). Usa {@code ComercioPublicoResponseDTO}, sin datos del representante
 * del comercio — nunca {@code ComercioResponseDTO} (self-service, con representante).
 */
@Service
@RequiredArgsConstructor
public class CatalogoService {

    private final ComercioService comercioService;
    private final ProductoService productoService;

    public List<ComercioPublicoResponseDTO> listarComerciosAprobados() {
        return comercioService.listarAprobados();
    }

    public List<ProductoResponseDTO> listarProductosDelComercio(Integer comercioId, Integer categoriaId, Integer tagId) {
        comercioService.buscarAprobadoPorId(comercioId);
        return productoService.listarCatalogoDelComercio(comercioId, categoriaId, tagId);
    }

    public ProductosPaginadosResponseDTO listarProductosGlobal(
            Integer categoriaId, List<Integer> tagIds, String busqueda, Integer pagina) {
        return productoService.listarCatalogoGlobal(categoriaId, tagIds, busqueda, pagina);
    }

    public FiltrosCatalogoResponseDTO listarFiltrosDisponibles() {
        return productoService.listarFiltrosDisponibles();
    }
}
