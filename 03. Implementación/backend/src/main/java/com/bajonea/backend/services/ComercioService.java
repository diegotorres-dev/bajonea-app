package com.bajonea.backend.services;

import com.bajonea.backend.config.security.ComercioActivo;
import com.bajonea.backend.dto.request.ComercioDatosOperativosRequestDTO;
import com.bajonea.backend.dto.request.ComercioPerfilRequestDTO;
import com.bajonea.backend.dto.request.FotoPerfilComercioRequestDTO;
import com.bajonea.backend.dto.response.ComercioEmpleadoResponseDTO;
import com.bajonea.backend.dto.response.ComercioPublicoResponseDTO;
import com.bajonea.backend.dto.response.ComercioResponseDTO;
import com.bajonea.backend.dto.response.CloudinarySignatureResponseDTO;
import com.bajonea.backend.dto.response.DireccionResponseDTO;
import com.bajonea.backend.dto.response.HorarioResponseDTO;
import com.bajonea.backend.dto.response.RepresentanteResponseDTO;
import com.bajonea.backend.entities.Comercio;
import com.bajonea.backend.entities.Direccion;
import com.bajonea.backend.entities.HistorialEstadoComercio;
import com.bajonea.backend.entities.Horario;
import com.bajonea.backend.entities.PersonaFisica;
import com.bajonea.backend.services.DisponibilidadComercioService.Disponibilidad;
import com.bajonea.backend.enums.AccionEdicion;
import com.bajonea.backend.enums.EstadoComercio;
import com.bajonea.backend.enums.EstadoUsuario;
import com.bajonea.backend.enums.TipoEntidadEdicion;
import com.bajonea.backend.exceptions.ConflictoDeNegocioException;
import com.bajonea.backend.exceptions.RecursoNoEncontradoException;
import com.bajonea.backend.repositories.ComercioRepository;
import com.bajonea.backend.repositories.DireccionRepository;
import com.bajonea.backend.repositories.HistorialEstadoComercioRepository;
import com.bajonea.backend.repositories.HorarioRepository;
import com.bajonea.backend.repositories.UsuarioRepository;
import com.bajonea.backend.util.ComercioValidaciones;
import com.bajonea.backend.util.TextoUtils;
import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import jakarta.persistence.PersistenceContext;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Autoservicio de perfil del propio Comercio, incluida la foto de perfil vía firma de
 * Cloudinary (Fase 11 — flujo separado del de la galería de {@code ProductoService}, sin
 * límite de cantidad). No incluye CRUD de Producto — ver {@code ProductoService}. Las operaciones
 * de autoservicio reciben el {@code comercioId} ya resuelto y validado por
 * {@code ComercioActivoService} (header {@code X-Comercio-Id}), nunca el id del usuario.
 */
@Service
@RequiredArgsConstructor
@Transactional
public class ComercioService {

    static final String MENSAJE_COMERCIO_CERRADO = "Este comercio está cerrado en este momento";

    private final ComercioRepository comercioRepository;
    private final DireccionRepository direccionRepository;
    private final HorarioRepository horarioRepository;
    private final HistorialEstadoComercioRepository historialEstadoComercioRepository;
    private final CloudinaryService cloudinaryService;
    private final DisponibilidadComercioService disponibilidadComercioService;
    private final UsuarioRepository usuarioRepository;
    private final HistorialEdicionComercioService historialEdicionComercioService;
    private final NombreComercioService nombreComercioService;
    private final ComercioActivoService comercioActivoService;

    @PersistenceContext
    private EntityManager entityManager;

    public ComercioResponseDTO verPerfil(Integer comercioId) {
        Comercio comercio = obtenerComercio(comercioId);
        return aResponseDTO(comercio);
    }

    public ComercioEmpleadoResponseDTO verPerfilEmpleado(Integer comercioId) {
        return aEmpleadoResponseDTO(obtenerComercio(comercioId));
    }

    private ComercioEmpleadoResponseDTO aEmpleadoResponseDTO(Comercio comercio) {
        LocalDateTime ahora = disponibilidadComercioService.ahora();
        LecturaHorarios lectura = leerHorarios(comercio.getId(), ahora);
        Disponibilidad disponibilidad = disponibilidadComercioService.calcular(comercio, lectura.todos(), ahora);
        return new ComercioEmpleadoResponseDTO(
                comercio.getId(),
                comercio.getNombre(),
                comercio.getDescripcion(),
                comercio.getFotoPerfilUrl(),
                comercio.getTelefono(),
                comercio.getTipoComercio(),
                comercio.isAceptaDelivery(),
                comercio.isAceptaRetiro(),
                aDireccionResponseDTO(comercio),
                lectura.vigentes(),
                lectura.pendientes(),
                lectura.rigeDesde(),
                comercio.getEstado(),
                disponibilidad.cerradoManualmente(),
                disponibilidad.abiertoAhora(),
                disponibilidad.puedeCambiarCierre(),
                disponibilidad.textoReapertura());
    }

    /**
     * Edición de descripción y teléfono, la única que puede hacer un Empleado sobre el perfil (también la puede usar
     * el Dueño). Orden de bloqueo: el usuario que actúa y la relación del Empleado ({@code iniciarEscritura}) y
     * después el comercio con {@code FOR UPDATE} directo, porque esta operación lo escribe: leerlo con bloqueo
     * compartido para validar el estado y mejorarlo a exclusivo al actualizar interbloquea dos ediciones a la vez.
     * El estado se valida sobre la fila ya bloqueada: un Empleado con el comercio {@code SUSPENDIDO} recibe
     * {@code 409} {@code COMERCIO_SUSPENDIDO}. Devuelve el DTO que corresponde al actor (el reducido para el
     * Empleado).
     */
    public Object editarDatosOperativos(ComercioActivo actor, ComercioDatosOperativosRequestDTO request) {
        historialEdicionComercioService.iniciarEscritura(actor);
        Comercio comercio = obtenerComercio(actor.comercioId());
        entityManager.refresh(comercio, LockModeType.PESSIMISTIC_WRITE);
        ComercioActivoService.validarComercioModificable(actor, comercio.getEstado());

        List<String> camposCambiados = new ArrayList<>();
        if (!Objects.equals(comercio.getDescripcion(), request.getDescripcion())) {
            camposCambiados.add("descripción");
        }
        if (!Objects.equals(comercio.getTelefono(), request.getTelefono())) {
            camposCambiados.add("teléfono");
        }

        comercio.setDescripcion(request.getDescripcion());
        comercio.setTelefono(request.getTelefono());
        comercio.setFechaModificacion(LocalDateTime.now());
        comercioRepository.save(comercio);

        if (!camposCambiados.isEmpty()) {
            historialEdicionComercioService.registrar(actor, TipoEntidadEdicion.COMERCIO, comercio.getId(), comercio.getNombre(),
                    AccionEdicion.EDITAR, HistorialEdicionComercioService.detalleDeEdicion(camposCambiados));
        }

        return actor.esEmpleado() ? aEmpleadoResponseDTO(comercio) : aResponseDTO(comercio);
    }

    public ComercioResponseDTO editarPerfil(ComercioActivo actor, ComercioPerfilRequestDTO request) {
        ComercioValidaciones.validarModalidadesEntrega(request.isAceptaDelivery(), request.isAceptaRetiro());
        historialEdicionComercioService.iniciarEscritura(actor);
        Comercio comercio = obtenerComercio(actor.comercioId());
        entityManager.refresh(comercio, LockModeType.PESSIMISTIC_WRITE);
        ComercioActivoService.validarComercioModificable(actor, comercio.getEstado());

        String nombreNuevo = TextoUtils.aTitleCase(request.getNombre());
        List<String> camposCambiados = new ArrayList<>();
        if (!Objects.equals(comercio.getNombre(), nombreNuevo)) {
            nombreComercioService.validar(nombreNuevo, comercio.getId());
            camposCambiados.add("nombre");
        }
        if (!Objects.equals(comercio.getDescripcion(), request.getDescripcion())) {
            camposCambiados.add("descripción");
        }
        if (!Objects.equals(comercio.getTelefono(), request.getTelefono())) {
            camposCambiados.add("teléfono");
        }
        if (comercio.isAceptaDelivery() != request.isAceptaDelivery() || comercio.isAceptaRetiro() != request.isAceptaRetiro()) {
            camposCambiados.add("modalidades de entrega");
        }

        comercio.setNombre(nombreNuevo);
        comercio.setDescripcion(request.getDescripcion());
        comercio.setTelefono(request.getTelefono());
        comercio.setAceptaDelivery(request.isAceptaDelivery());
        comercio.setAceptaRetiro(request.isAceptaRetiro());
        comercio.setFechaModificacion(LocalDateTime.now());
        comercioRepository.saveAndFlush(comercio);

        if (!camposCambiados.isEmpty()) {
            historialEdicionComercioService.registrar(actor, TipoEntidadEdicion.COMERCIO, comercio.getId(), comercio.getNombre(),
                    AccionEdicion.EDITAR, HistorialEdicionComercioService.detalleDeEdicion(camposCambiados));
        }

        return aResponseDTO(comercio);
    }

    public CloudinarySignatureResponseDTO generarFirmaFotoPerfil(ComercioActivo actor) {
        historialEdicionComercioService.iniciarEscritura(actor);
        comercioActivoService.exigirComercioModificable(actor);
        Comercio comercio = obtenerComercio(actor.comercioId());
        return cloudinaryService.generarFirmaFotoPerfilComercio(comercio.getId());
    }

    public ComercioResponseDTO actualizarFotoPerfil(ComercioActivo actor, FotoPerfilComercioRequestDTO request) {
        historialEdicionComercioService.iniciarEscritura(actor);
        Comercio comercio = obtenerComercio(actor.comercioId());
        entityManager.refresh(comercio, LockModeType.PESSIMISTIC_WRITE);
        ComercioActivoService.validarComercioModificable(actor, comercio.getEstado());
        cloudinaryService.validarFotoPerfilComercio(comercio.getId(), request.getUrl());
        boolean cambioLaFoto = !Objects.equals(comercio.getFotoPerfilUrl(), request.getUrl());
        comercio.setFotoPerfilUrl(request.getUrl());
        comercio.setFechaModificacion(LocalDateTime.now());
        comercioRepository.save(comercio);
        if (cambioLaFoto) {
            historialEdicionComercioService.registrar(actor, TipoEntidadEdicion.COMERCIO, comercio.getId(), comercio.getNombre(),
                    AccionEdicion.EDITAR, HistorialEdicionComercioService.detalleDeEdicion(List.of("foto de perfil")));
        }
        return aResponseDTO(comercio);
    }

    private static final List<EstadoComercio> ESTADOS_VISIBLES_EN_CATALOGO = List.of(
            EstadoComercio.APTO_VENTA, EstadoComercio.CERRADO_TEMPORALMENTE);

    public List<ComercioPublicoResponseDTO> listarAprobados() {
        List<Comercio> comercios = comercioRepository.findByEstadoIn(ESTADOS_VISIBLES_EN_CATALOGO);
        if (comercios.isEmpty()) {
            return List.of();
        }
        LocalDateTime ahora = disponibilidadComercioService.ahora();
        Map<Integer, List<Horario>> horariosPorComercio = horarioRepository
                .findVigentesDesdeIn(comercios.stream().map(Comercio::getId).toList(),
                        disponibilidadComercioService.fechaDesdeParaLeer(ahora))
                .stream()
                .collect(Collectors.groupingBy(horario -> horario.getComercio().getId()));
        return comercios.stream()
                .map(comercio -> aPublicoResponseDTO(comercio,
                        LecturaHorarios.de(horariosPorComercio.getOrDefault(comercio.getId(), List.of()), ahora), ahora))
                .toList();
    }

    public void validarAceptaPedidos(Comercio comercio) {
        validarAceptaPedidos(comercio, comercio.getEstado(), comercio.isCerradoManualmente());
    }

    /**
     * Misma validación con el estado y el cierre manual ya leídos por quien llama (por ejemplo bajo bloqueo
     * compartido, en la creación de un pedido) en vez de los que tenga cargados la entidad. Orden: cierre por
     * bloqueo del Dueño ({@code CERRADO_TEMPORALMENTE}, con el mismo texto de rechazo que el cierre manual), resto
     * de los estados, cierre manual y horario.
     */
    public void validarAceptaPedidos(Comercio comercio, EstadoComercio estadoActual, boolean cerradoManualmente) {
        if (estadoActual == EstadoComercio.CERRADO_TEMPORALMENTE) {
            throw new ConflictoDeNegocioException(MENSAJE_COMERCIO_CERRADO);
        }
        if (estadoActual != EstadoComercio.APTO_VENTA) {
            throw new ConflictoDeNegocioException("Este comercio no está aceptando pedidos en este momento");
        }
        if (cerradoManualmente) {
            throw new ConflictoDeNegocioException(MENSAJE_COMERCIO_CERRADO);
        }
        LocalDateTime ahora = disponibilidadComercioService.ahora();
        List<Horario> horarios = disponibilidadComercioService.horariosParaLeer(comercio.getId(), ahora);
        if (!disponibilidadComercioService.dentroDeFranja(horarios, ahora)) {
            throw new ConflictoDeNegocioException(
                    "Este comercio está cerrado en este momento. Podés hacer tu pedido dentro de su horario de atención.");
        }
    }

    public ComercioPublicoResponseDTO buscarAprobadoPorId(Integer comercioId) {
        Comercio comercio = comercioRepository.findById(comercioId)
                .filter(c -> ESTADOS_VISIBLES_EN_CATALOGO.contains(c.getEstado()))
                .orElseThrow(() -> new RecursoNoEncontradoException("Comercio no encontrado"));
        return aPublicoResponseDTO(comercio);
    }

    /**
     * Si la cuenta del Dueño está {@code BLOQUEADO}, leída con bloqueo compartido (devuelve lo último confirmado y
     * deja el estado fijo hasta el final de la transacción, así un bloqueo de cuenta que se confirme en el medio
     * espera). Tiene que llamarse <b>antes</b> de tocar la cuenta de Mercado Pago y los comercios del Dueño: el
     * orden de bloqueo es usuario, cuenta, comercio (ver docs/APRENDIZAJES-TECNICOS.md). El resultado es lo que
     * recibe {@code AptitudVentaComercioService} en sus entradas.
     */
    public boolean duenoBloqueadoConBloqueo(Integer duenoId) {
        return usuarioRepository.leerEstadoConBloqueoCompartido(duenoId)
                .map(estado -> EstadoUsuario.valueOf(estado) == EstadoUsuario.BLOQUEADO)
                .orElse(false);
    }

    /**
     * Cambia el estado del comercio, actualiza {@code fechaModificacion} y deja una fila en
     * {@code historial_estado_comercio} con {@code administrador = null} (la transición la dispara el
     * sistema, no una persona) y el motivo indicado. Compartida por las transiciones de Mercado Pago, por
     * el bloqueo/restauración de cuenta ({@code AuthService}) y por la aprobación que nace
     * {@code APTO_VENTA} ({@code AdministradorService}). Todo sale de datos ya en memoria: no hace
     * ninguna consulta que pueda fallar, así que es segura dentro de las transacciones con
     * {@code noRollbackFor} de {@code AuthService}. Devuelve la fila de historial que dejó, para que quien
     * necesite colgarle algo (la corrección de un comercio rechazado, sus cambios) no tenga que buscarla.
     */
    public HistorialEstadoComercio registrarTransicionAutomatica(Comercio comercio, EstadoComercio estadoOrigen,
            EstadoComercio estadoDestino, String motivo) {
        comercio.setEstado(estadoDestino);
        comercio.setFechaModificacion(LocalDateTime.now());
        comercioRepository.save(comercio);

        HistorialEstadoComercio historial = HistorialEstadoComercio.builder()
                .comercio(comercio)
                .administrador(null)
                .estadoOrigen(estadoOrigen)
                .estadoDestino(estadoDestino)
                .motivo(motivo)
                .fechaHora(LocalDateTime.now())
                .build();
        return historialEstadoComercioRepository.save(historial);
    }

    private Comercio obtenerComercio(Integer comercioId) {
        return comercioRepository.findById(comercioId)
                .orElseThrow(() -> new RecursoNoEncontradoException("Comercio no encontrado"));
    }

    private ComercioResponseDTO aResponseDTO(Comercio comercio) {
        DireccionResponseDTO direccionDTO = aDireccionResponseDTO(comercio);
        LocalDateTime ahora = disponibilidadComercioService.ahora();
        LecturaHorarios lectura = leerHorarios(comercio.getId(), ahora);
        Disponibilidad disponibilidad = disponibilidadComercioService.calcular(comercio, lectura.todos(), ahora);
        RepresentanteResponseDTO representante = aRepresentanteResponseDTO(comercio.getDueno().getPersonaFisica());
        String motivoRechazo = obtenerMotivoRechazo(comercio);

        return new ComercioResponseDTO(
                comercio.getId(),
                comercio.getNombre(),
                comercio.getDescripcion(),
                comercio.getFotoPerfilUrl(),
                comercio.getTelefono(),
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
                lectura.vigentes(),
                lectura.pendientes(),
                lectura.rigeDesde(),
                representante,
                motivoRechazo,
                disponibilidad.cerradoManualmente(),
                disponibilidad.abiertoAhora(),
                disponibilidad.puedeCambiarCierre(),
                disponibilidad.textoReapertura(),
                comercio.getSuspendidoDesde(),
                comercio.getMotivoSuspension());
    }

    private String obtenerMotivoRechazo(Comercio comercio) {
        if (comercio.getEstado() != EstadoComercio.RECHAZADO && comercio.getEstado() != EstadoComercio.RECHAZO_DEFINITIVO) {
            return null;
        }
        return historialEstadoComercioRepository.findTopByComercioIdOrderByFechaHoraDescIdDesc(comercio.getId())
                .map(historial -> historial.getMotivo() != null && !historial.getMotivo().isBlank() ? historial.getMotivo() : null)
                .orElse(null);
    }

    private ComercioPublicoResponseDTO aPublicoResponseDTO(Comercio comercio) {
        LocalDateTime ahora = disponibilidadComercioService.ahora();
        return aPublicoResponseDTO(comercio, leerHorarios(comercio.getId(), ahora), ahora);
    }

    private ComercioPublicoResponseDTO aPublicoResponseDTO(Comercio comercio, LecturaHorarios lectura,
            LocalDateTime ahora) {
        DireccionResponseDTO direccionDTO = aDireccionResponseDTO(comercio);
        Disponibilidad disponibilidad = disponibilidadComercioService.calcular(comercio, lectura.todos(), ahora);

        return new ComercioPublicoResponseDTO(
                comercio.getId(),
                comercio.getNombre(),
                comercio.getDescripcion(),
                comercio.getFotoPerfilUrl(),
                comercio.getTelefono(),
                comercio.getTipoComercio(),
                comercio.isAceptaDelivery(),
                comercio.isAceptaRetiro(),
                // Siempre APTO_VENTA, también para un CERRADO_TEMPORALMENTE: lo que ve el público de un cierre es
                // estadoApertura, que distingue el bloqueo de la cuenta (CERRADO_TEMPORALMENTE) del cierre manual
                // (CERRADO_MANUAL).
                EstadoComercio.APTO_VENTA,
                direccionDTO,
                lectura.vigentes(),
                disponibilidad.estadoApertura(),
                disponibilidad.textoReapertura());
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

    private RepresentanteResponseDTO aRepresentanteResponseDTO(PersonaFisica personaFisica) {
        return new RepresentanteResponseDTO(
                personaFisica.getNombre(),
                personaFisica.getApellido(),
                personaFisica.getDni(),
                personaFisica.getTelefono(),
                personaFisica.getFechaNacimiento());
    }

    private LecturaHorarios leerHorarios(Integer comercioId, LocalDateTime ahora) {
        return LecturaHorarios.de(disponibilidadComercioService.horariosParaLeer(comercioId, ahora), ahora);
    }

    private record LecturaHorarios(List<Horario> todos, List<HorarioResponseDTO> vigentes,
            List<HorarioResponseDTO> pendientes, LocalDate rigeDesde) {

        static LecturaHorarios de(List<Horario> todos, LocalDateTime ahora) {
            LocalDate hoy = ahora.toLocalDate();
            List<HorarioResponseDTO> vigentes = DisponibilidadComercioService.vigentesEn(todos, hoy).stream()
                    .map(HorarioResponseDTO::de).toList();
            List<Horario> filasPendientes = todos.stream().filter(horario -> horario.getVigenteDesde().isAfter(hoy)).toList();
            LocalDate rigeDesde = filasPendientes.stream().map(Horario::getVigenteDesde).min(Comparator.naturalOrder())
                    .orElse(null);
            return new LecturaHorarios(todos, vigentes, filasPendientes.stream().map(HorarioResponseDTO::de).toList(),
                    rigeDesde);
        }
    }
}
