package com.bajonea.backend.services;

import com.bajonea.backend.dto.response.AccesoComercioEmpleadoResponseDTO;
import com.bajonea.backend.entities.EmpleadoComercio;
import com.bajonea.backend.enums.EstadoEmpleadoComercio;
import com.bajonea.backend.enums.MotivoHistorialEmpleado;
import com.bajonea.backend.exceptions.ComercioNoDisponibleException;
import com.bajonea.backend.repositories.EmpleadoComercioRepository;
import com.bajonea.backend.repositories.HistorialEmpleadoComercioRepository;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Lectura de la relación propia de un Empleado con un comercio, para que el frontend sepa por qué perdió el acceso
 * sin tocar el {@code 404} idéntico del resolver de comercio activo. Solo responde sobre la relación de quien
 * pregunta: sin relación es el mismo {@code 404 COMERCIO_NO_DISPONIBLE} que un comercio inexistente, así que un
 * tercero no aprende nada. Solo lectura y sin bloqueos.
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class AccesoEmpleadoService {

    private final EmpleadoComercioRepository empleadoComercioRepository;
    private final HistorialEmpleadoComercioRepository historialRepository;

    public AccesoComercioEmpleadoResponseDTO consultar(Integer empleadoId, Integer comercioId) {
        EmpleadoComercio relacion = empleadoComercioRepository.findByEmpleadoIdAndComercioId(empleadoId, comercioId)
                .orElseThrow(ComercioNoDisponibleException::new);
        MotivoHistorialEmpleado motivoBaja = null;
        if (relacion.getEstado() == EstadoEmpleadoComercio.INACTIVO) {
            motivoBaja = historialRepository.findUltimaBaja(List.of(relacion.getId())).stream()
                    .findFirst()
                    .map(HistorialEmpleadoComercioRepository.UltimaBaja::getMotivo)
                    .orElse(null);
        }
        boolean accesible = ComercioActivoService.ESTADOS_ACCESIBLES_EMPLEADO.contains(relacion.getComercio().getEstado());
        return new AccesoComercioEmpleadoResponseDTO(relacion.getEstado(), motivoBaja, accesible);
    }
}
