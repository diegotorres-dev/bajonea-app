package com.bajonea.backend.services;

import com.bajonea.backend.dto.request.AltaComercioAdicionalRequestDTO;
import com.bajonea.backend.dto.response.CloudinarySignatureResponseDTO;
import com.bajonea.backend.dto.response.ComercioResponseDTO;
import com.bajonea.backend.dto.response.ElegibilidadAltaAdicionalResponseDTO;
import com.bajonea.backend.entities.Comercio;
import com.bajonea.backend.entities.Dueno;
import com.bajonea.backend.enums.EstadoComercio;
import com.bajonea.backend.exceptions.ConflictoDeNegocioException;
import com.bajonea.backend.exceptions.RecursoNoEncontradoException;
import com.bajonea.backend.repositories.ComercioRepository;
import com.bajonea.backend.repositories.DuenoRepository;
import java.util.EnumSet;
import java.util.Set;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Alta de un comercio adicional por un Dueño ya registrado (multi-comercio, tramo 2A). El comercio nace
 * {@code PENDIENTE} y lo resuelve el Administrador como cualquier otro; no se piden datos fiscales, del
 * representante, email ni contraseña (se reutilizan los del Dueño).
 * <p>
 * Reglas: el Dueño es elegible ({@link #esElegible}) si tiene al menos un comercio {@code APROBADO} o
 * {@code APTO_VENTA} ({@link #ESTADOS_QUE_HABILITAN}), o si tiene al menos un comercio y todos están en
 * {@code RECHAZO_DEFINITIVO} (el rechazo definitivo no lo deja sin poder volver a empezar con otro comercio);
 * con cualquier otra combinación (pendientes, rechazados que todavía puede corregir, suspendidos, etc.) no
 * lo es. El nombre tiene que ser único en toda la plataforma ({@link NombreComercioService}). El teléfono
 * puede repetirse, y no hay tope de altas pendientes.
 * <p>
 * Concurrencia: la fila del Dueño se bloquea ({@code SELECT ... FOR UPDATE}) como primera sentencia de
 * la transacción, así dos altas simultáneas del mismo Dueño se ejecutan una detrás de la otra y la
 * segunda ve al comercio que insertó la primera (la carrera entre Dueños distintos la resuelve el índice
 * único del nombre, V37). No se toma ningún otro bloqueo, y la fila de {@code dueno} solo la esperan
 * otras altas del mismo Dueño y las inserciones que la referencian como padre (ver
 * docs/APRENDIZAJES-TECNICOS.md).
 */
@Service
@RequiredArgsConstructor
@Transactional
public class AltaComercioAdicionalService {

    static final Set<EstadoComercio> ESTADOS_QUE_HABILITAN = EnumSet.of(EstadoComercio.APROBADO, EstadoComercio.APTO_VENTA);

    static final String MENSAJE_NO_ELEGIBLE = "Para agregar un nuevo comercio, necesitás tener al menos uno aprobado previamente";

    private final DuenoRepository duenoRepository;
    private final ComercioRepository comercioRepository;
    private final RegistroService registroService;
    private final ComercioService comercioService;
    private final CloudinaryService cloudinaryService;

    @Transactional(readOnly = true)
    public ElegibilidadAltaAdicionalResponseDTO consultarElegibilidad(Integer duenoId) {
        return new ElegibilidadAltaAdicionalResponseDTO(esElegible(duenoId));
    }

    public CloudinarySignatureResponseDTO generarFirmaFoto(Integer duenoId) {
        return cloudinaryService.generarFirmaFotoNuevoComercio(duenoId);
    }

    public ComercioResponseDTO altaAdicional(Integer duenoId, AltaComercioAdicionalRequestDTO request) {
        Dueno dueno = duenoRepository.findByIdConBloqueo(duenoId)
                .orElseThrow(() -> new RecursoNoEncontradoException("Dueño no encontrado"));

        if (!esElegible(duenoId)) {
            throw new ConflictoDeNegocioException(MENSAJE_NO_ELEGIBLE);
        }

        cloudinaryService.validarFotoNuevoComercio(duenoId, request.getFotoPerfilUrl());

        Comercio comercio = registroService.crearComercio(dueno, request);
        return comercioService.verPerfil(comercio.getId());
    }

    private boolean esElegible(Integer duenoId) {
        if (comercioRepository.existsByDuenoIdAndEstadoIn(duenoId, ESTADOS_QUE_HABILITAN)) {
            return true;
        }
        return comercioRepository.countByDuenoId(duenoId) > 0
                && comercioRepository.countByDuenoIdAndEstadoNot(duenoId, EstadoComercio.RECHAZO_DEFINITIVO) == 0;
    }
}
