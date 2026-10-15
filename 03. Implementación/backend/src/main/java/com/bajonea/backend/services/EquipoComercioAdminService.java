package com.bajonea.backend.services;

import com.bajonea.backend.dto.response.ActividadComercioResponseDTO;
import com.bajonea.backend.dto.response.EquipoComercioResponseDTO;
import com.bajonea.backend.exceptions.RecursoNoEncontradoException;
import com.bajonea.backend.repositories.ComercioRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Lectura del equipo y de la actividad de cualquier comercio por el Administrador. Solo lectura y sin
 * bloqueos: usa las mismas consultas que ve el Dueño ({@link InvitacionEmpleadoService#listarEquipo(Integer)} y
 * {@link ActividadComercioService#listar(Integer, Integer, String, String)}). El comercio puede estar en cualquier
 * estado; si no existe es {@code 404} "Comercio no encontrado".
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class EquipoComercioAdminService {

    private final ComercioRepository comercioRepository;
    private final InvitacionEmpleadoService invitacionEmpleadoService;
    private final ActividadComercioService actividadComercioService;

    public EquipoComercioResponseDTO verEquipo(Integer comercioId) {
        exigirQueExista(comercioId);
        return invitacionEmpleadoService.listarEquipo(comercioId);
    }

    public ActividadComercioResponseDTO verActividad(Integer comercioId, Integer limite, String cursor, String fuente) {
        exigirQueExista(comercioId);
        return actividadComercioService.listar(comercioId, limite, cursor, fuente);
    }

    private void exigirQueExista(Integer comercioId) {
        if (!comercioRepository.existsById(comercioId)) {
            throw new RecursoNoEncontradoException("Comercio no encontrado");
        }
    }
}
