package com.bajonea.backend.services;

import com.bajonea.backend.dto.request.ComercioPerfilRequestDTO;
import com.bajonea.backend.dto.request.FotoPerfilComercioRequestDTO;
import com.bajonea.backend.dto.response.ComercioPublicoResponseDTO;
import com.bajonea.backend.dto.response.ComercioResponseDTO;
import com.bajonea.backend.dto.response.CloudinarySignatureResponseDTO;
import com.bajonea.backend.dto.response.DireccionResponseDTO;
import com.bajonea.backend.dto.response.HorarioResponseDTO;
import com.bajonea.backend.dto.response.RepresentanteResponseDTO;
import com.bajonea.backend.entities.Comercio;
import com.bajonea.backend.entities.Direccion;
import com.bajonea.backend.entities.Horario;
import com.bajonea.backend.entities.PersonaFisica;
import com.bajonea.backend.enums.DiaSemana;
import com.bajonea.backend.enums.EstadoComercio;
import com.bajonea.backend.exceptions.ConflictoDeNegocioException;
import com.bajonea.backend.exceptions.RecursoNoEncontradoException;
import com.bajonea.backend.repositories.ComercioRepository;
import com.bajonea.backend.repositories.DireccionRepository;
import com.bajonea.backend.repositories.HistorialEstadoComercioRepository;
import com.bajonea.backend.repositories.HorarioRepository;
import com.bajonea.backend.util.ComercioValidaciones;
import com.bajonea.backend.util.TextoUtils;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.ZoneOffset;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Autoservicio de perfil del propio Comercio, incluida la foto de perfil vía firma de
 * Cloudinary (Fase 11 — flujo separado del de la galería de {@code ProductoService}, sin
 * límite de cantidad). No incluye CRUD de Producto — ver {@code ProductoService}, misma
 * tanda de resolución {@code usuarioId (JWT) → Comercio} vía
 * {@code ComercioRepository.findByDuenoId}.
 */
@Service
@RequiredArgsConstructor
@Transactional
public class ComercioService {

    private final ComercioRepository comercioRepository;
    private final DireccionRepository direccionRepository;
    private final HorarioRepository horarioRepository;
    private final HistorialEstadoComercioRepository historialEstadoComercioRepository;
    private final CloudinaryService cloudinaryService;

    private static final ZoneOffset ZONA_HORARIA_COMERCIO = ZoneOffset.of("-03:00");

    public ComercioResponseDTO verPerfil(Integer usuarioId) {
        Comercio comercio = obtenerComercioDelUsuario(usuarioId);
        return aResponseDTO(comercio);
    }

    public ComercioResponseDTO editarPerfil(Integer usuarioId, ComercioPerfilRequestDTO request) {
        ComercioValidaciones.validarModalidadesEntrega(request.isAceptaDelivery(), request.isAceptaRetiro());
        Comercio comercio = obtenerComercioDelUsuario(usuarioId);

        comercio.setNombre(TextoUtils.aTitleCase(request.getNombre()));
        comercio.setDescripcion(request.getDescripcion());
        comercio.setTelefono(request.getTelefono());
        comercio.setEmail(request.getEmailContacto());
        comercio.setAceptaDelivery(request.isAceptaDelivery());
        comercio.setAceptaRetiro(request.isAceptaRetiro());
        comercio.setFechaModificacion(LocalDateTime.now());
        comercioRepository.save(comercio);

        return aResponseDTO(comercio);
    }

    public CloudinarySignatureResponseDTO generarFirmaFotoPerfil(Integer usuarioId) {
        Comercio comercio = obtenerComercioDelUsuario(usuarioId);
        return cloudinaryService.generarFirmaFotoPerfilComercio(comercio.getId());
    }

    public ComercioResponseDTO actualizarFotoPerfil(Integer usuarioId, FotoPerfilComercioRequestDTO request) {
        Comercio comercio = obtenerComercioDelUsuario(usuarioId);
        comercio.setFotoPerfilUrl(request.getUrl());
        comercio.setFechaModificacion(LocalDateTime.now());
        comercioRepository.save(comercio);
        return aResponseDTO(comercio);
    }

    public List<ComercioPublicoResponseDTO> listarAprobados() {
        return comercioRepository.findByEstado(EstadoComercio.APROBADO).stream()
                .map(this::aPublicoResponseDTO)
                .toList();
    }

    public void validarAceptaPedidos(Comercio comercio) {
        if (comercio.getEstado() != EstadoComercio.APROBADO) {
            throw new ConflictoDeNegocioException("Este comercio no está aceptando pedidos en este momento");
        }
        List<Horario> horarios = horarioRepository.findByComercioId(comercio.getId());
        if (!estaAbiertoAhora(horarios)) {
            throw new ConflictoDeNegocioException(
                    "Este comercio está cerrado en este momento. Podés hacer tu pedido dentro de su horario de atención.");
        }
    }

    private boolean estaAbiertoAhora(List<Horario> horarios) {
        if (horarios.isEmpty()) {
            return false;
        }
        LocalDateTime ahora = LocalDateTime.now(ZONA_HORARIA_COMERCIO);
        DiaSemana diaHoy = DiaSemana.values()[ahora.getDayOfWeek().getValue() - 1];
        LocalTime horaActual = ahora.toLocalTime();
        return horarios.stream()
                .filter(horario -> horario.getDiaSemana() == diaHoy)
                .anyMatch(horario -> !horaActual.isBefore(horario.getHoraApertura())
                        && horaActual.isBefore(horario.getHoraCierre()));
    }

    public ComercioPublicoResponseDTO buscarAprobadoPorId(Integer comercioId) {
        Comercio comercio = comercioRepository.findById(comercioId)
                .filter(c -> c.getEstado() == EstadoComercio.APROBADO)
                .orElseThrow(() -> new RecursoNoEncontradoException("Comercio no encontrado"));
        return aPublicoResponseDTO(comercio);
    }

    private Comercio obtenerComercioDelUsuario(Integer usuarioId) {
        return comercioRepository.findByDuenoId(usuarioId)
                .orElseThrow(() -> new RecursoNoEncontradoException("Comercio no encontrado"));
    }

    private ComercioResponseDTO aResponseDTO(Comercio comercio) {
        DireccionResponseDTO direccionDTO = aDireccionResponseDTO(comercio);
        List<HorarioResponseDTO> horarios = aHorariosResponseDTO(comercio);
        RepresentanteResponseDTO representante = aRepresentanteResponseDTO(comercio.getDueno().getPersonaFisica());
        String motivoRechazo = obtenerMotivoRechazo(comercio);

        return new ComercioResponseDTO(
                comercio.getId(),
                comercio.getNombre(),
                comercio.getDescripcion(),
                comercio.getFotoPerfilUrl(),
                comercio.getTelefono(),
                comercio.getEmail(),
                comercio.getTipoComercio(),
                comercio.isAceptaDelivery(),
                comercio.isAceptaRetiro(),
                comercio.getEstado(),
                comercio.getDueno().getPersonaJuridica().getRazonSocial(),
                comercio.getDueno().getPersonaJuridica().getCuit(),
                comercio.getDueno().getPersonaJuridica().getCondicionIva(),
                comercio.getDueno().getPersonaJuridica().getTipoSociedad(),
                comercio.getDueno().getPersonaJuridica().getDomicilioFiscal(),
                comercio.getDueno().getPersonaJuridica().getFechaInicioActividades(),
                direccionDTO,
                horarios,
                representante,
                motivoRechazo);
    }

    private String obtenerMotivoRechazo(Comercio comercio) {
        if (comercio.getEstado() != EstadoComercio.RECHAZADO) {
            return null;
        }
        return historialEstadoComercioRepository.findTopByComercioIdOrderByFechaHoraDesc(comercio.getId())
                .map(historial -> historial.getMotivo() != null && !historial.getMotivo().isBlank() ? historial.getMotivo() : null)
                .orElse(null);
    }

    private ComercioPublicoResponseDTO aPublicoResponseDTO(Comercio comercio) {
        DireccionResponseDTO direccionDTO = aDireccionResponseDTO(comercio);
        List<HorarioResponseDTO> horarios = aHorariosResponseDTO(comercio);

        return new ComercioPublicoResponseDTO(
                comercio.getId(),
                comercio.getNombre(),
                comercio.getDescripcion(),
                comercio.getFotoPerfilUrl(),
                comercio.getTelefono(),
                comercio.getEmail(),
                comercio.getTipoComercio(),
                comercio.isAceptaDelivery(),
                comercio.isAceptaRetiro(),
                comercio.getEstado(),
                comercio.getDueno().getPersonaJuridica().getRazonSocial(),
                comercio.getDueno().getPersonaJuridica().getCuit(),
                direccionDTO,
                horarios);
    }

    private DireccionResponseDTO aDireccionResponseDTO(Comercio comercio) {
        Direccion direccion = direccionRepository.findByComercioId(comercio.getId()).orElse(null);
        return direccion == null ? null : new DireccionResponseDTO(
                direccion.getId(),
                direccion.getCalle(),
                direccion.getNumero(),
                direccion.getPisoDepto(),
                direccion.getCodigoPostal(),
                direccion.getLocalidad().getId(),
                direccion.getLocalidad().getNombre(),
                direccion.getLocalidad().getProvincia().getNombre(),
                direccion.isPrincipal());
    }

    private List<HorarioResponseDTO> aHorariosResponseDTO(Comercio comercio) {
        return horarioRepository.findByComercioId(comercio.getId()).stream()
                .map(this::aResponseDTO)
                .toList();
    }

    private RepresentanteResponseDTO aRepresentanteResponseDTO(PersonaFisica personaFisica) {
        return new RepresentanteResponseDTO(
                personaFisica.getNombre(),
                personaFisica.getApellido(),
                personaFisica.getDni(),
                personaFisica.getTelefono(),
                personaFisica.getFechaNacimiento());
    }

    private HorarioResponseDTO aResponseDTO(Horario horario) {
        return new HorarioResponseDTO(horario.getId(), horario.getDiaSemana(), horario.getHoraApertura(), horario.getHoraCierre());
    }
}
