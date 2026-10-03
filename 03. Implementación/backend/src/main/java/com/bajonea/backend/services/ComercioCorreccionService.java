package com.bajonea.backend.services;

import com.bajonea.backend.config.ComercioResolicitudesProperties;
import com.bajonea.backend.dto.request.ReSolicitudComercioRequestDTO;
import com.bajonea.backend.dto.response.CloudinarySignatureResponseDTO;
import com.bajonea.backend.dto.response.ComercioResponseDTO;
import com.bajonea.backend.dto.response.CorreccionComercioResponseDTO;
import com.bajonea.backend.dto.response.DatosLegalesCorreccionResponseDTO;
import com.bajonea.backend.dto.response.DireccionCorreccionResponseDTO;
import com.bajonea.backend.dto.response.HorarioResponseDTO;
import com.bajonea.backend.dto.response.RedSocialResponseDTO;
import com.bajonea.backend.dto.response.RepresentanteResponseDTO;
import com.bajonea.backend.entities.Comercio;
import com.bajonea.backend.entities.Direccion;
import com.bajonea.backend.entities.Dueno;
import com.bajonea.backend.entities.HistorialCambioComercio;
import com.bajonea.backend.entities.HistorialEstadoComercio;
import com.bajonea.backend.entities.Localidad;
import com.bajonea.backend.entities.PersonaFisica;
import com.bajonea.backend.entities.PersonaJuridica;
import com.bajonea.backend.enums.EstadoComercio;
import com.bajonea.backend.exceptions.ConflictoDeNegocioException;
import com.bajonea.backend.exceptions.RecursoNoEncontradoException;
import com.bajonea.backend.repositories.ComercioRepository;
import com.bajonea.backend.repositories.DireccionRepository;
import com.bajonea.backend.repositories.DuenoRepository;
import com.bajonea.backend.repositories.HistorialCambioComercioRepository;
import com.bajonea.backend.repositories.HistorialEstadoComercioRepository;
import com.bajonea.backend.repositories.HorarioRepository;
import com.bajonea.backend.repositories.RedSocialRepository;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Corrección de un comercio rechazado por su Dueño y nueva solicitud de aprobación (multi-comercio, tramo 3,
 * entrega A). Se corrige el mismo comercio, identificado por id en la ruta: no depende de
 * {@code X-Comercio-Id} ni del comercio activo por defecto. Solo el Dueño del comercio y solo mientras está
 * {@code RECHAZADO}; cualquier otro caso se responde igual que un comercio inexistente ({@code 404}), sin
 * revelar que existe. La única excepción es reenviar un comercio que ya está {@code PENDIENTE} (otra pestaña
 * ya lo reenvió): {@code 409}.
 * <p>
 * Qué se corrige: todos los datos del negocio y, si el Dueño nunca tuvo un comercio aprobado
 * ({@link AprobacionPreviaDueno}), también los datos fiscales y del representante. Usuario, email de la
 * cuenta y contraseña no se tocan nunca. Hasta {@code comercio.resolicitudes.max} re-solicitudes por
 * comercio. Cada reenvío deja una fila {@code RECHAZADO → PENDIENTE} en el historial de estados (motivo fijo,
 * sin administrador), sube {@code cantidad_resolicitudes}, fija {@code fecha_resolicitud} y guarda en
 * {@code historial_cambio_comercio} un registro por cada campo que realmente cambió; un reenvío sin ningún
 * cambio se rechaza con {@code 409}. No se avisa al Administrador: la re-solicitud aparece en su bandeja.
 * <p>
 * Concurrencia: orden de bloqueos {@code dueno} → {@code cuenta_mercado_pago} → {@code comercio} → tablas
 * hijas. El reenvío bloquea la fila del Dueño como primera sentencia (serializa los reenvíos y las altas del
 * mismo Dueño y respeta el orden de {@link AltaComercioAdicionalService}) y después la del comercio
 * ({@code FOR UPDATE}); no toca {@code cuenta_mercado_pago}. El token de versión (id de la fila del último
 * rechazo) hace que una pestaña vieja no gaste un intento: si cambió desde que se abrió la corrección, {@code 409}.
 * La resolución del Administrador ({@code AdministradorService.resolverAprobacion}) bloquea
 * {@code comercio} con el mismo {@code FOR UPDATE} y revalida el estado: de un reenvío y una resolución
 * concurrentes, el segundo ve lo que dejó el primero.
 */
@Service
@RequiredArgsConstructor
@Transactional
public class ComercioCorreccionService {

    static final String MOTIVO_RESOLICITUD = "Nueva solicitud del Dueño";
    static final String MENSAJE_SIN_CAMBIOS = "Modificá al menos un dato antes de volver a solicitar";
    static final String MENSAJE_YA_ENVIADO = "Este comercio ya fue enviado nuevamente a revisión";
    static final String MENSAJE_VERSION_VENCIDA =
            "La solicitud cambió desde que abriste la corrección. Volvé a abrirla para continuar";
    static final String MENSAJE_SIN_INTENTOS = "Ya usaste todas las re-solicitudes disponibles para este comercio";
    static final String MENSAJE_LEGALES_NO_PERMITIDOS = "No podés modificar los datos fiscales ni del representante";
    private static final String NO_ENCONTRADO = "Comercio no encontrado";

    private final DuenoRepository duenoRepository;
    private final ComercioRepository comercioRepository;
    private final DireccionRepository direccionRepository;
    private final HorarioRepository horarioRepository;
    private final RedSocialRepository redSocialRepository;
    private final HistorialEstadoComercioRepository historialEstadoComercioRepository;
    private final HistorialCambioComercioRepository historialCambioComercioRepository;
    private final ValidadorDatosNegocioComercio validadorDatosNegocio;
    private final ValidadorComercioDuplicado validadorComercioDuplicado;
    private final ComercioEdicionService comercioEdicionService;
    private final ComercioService comercioService;
    private final AprobacionPreviaDueno aprobacionPreviaDueno;
    private final CloudinaryService cloudinaryService;
    private final ComercioResolicitudesProperties resolicitudesProperties;

    @Transactional(readOnly = true)
    public CorreccionComercioResponseDTO obtenerCorreccion(Integer duenoId, Integer comercioId) {
        Comercio comercio = obtenerRechazadoDelDueno(duenoId, comercioId);

        Direccion direccion = direccionRepository.findByComercioId(comercioId)
                .orElseThrow(() -> new RecursoNoEncontradoException(NO_ENCONTRADO));
        Localidad localidad = direccion.getLocalidad();
        DireccionCorreccionResponseDTO direccionDTO = new DireccionCorreccionResponseDTO(direccion.getId(), direccion.getCalle(),
                direccion.getNumero(), direccion.getPisoDepto(), direccion.getCodigoPostal(), localidad.getProvincia().getId(),
                localidad.getProvincia().getNombre(), localidad.getId(), localidad.getNombre());

        List<HorarioResponseDTO> horarios = horarioRepository.findByComercioId(comercioId).stream()
                .map(h -> new HorarioResponseDTO(h.getId(), h.getDiaSemana(), h.getHoraApertura(), h.getHoraCierre()))
                .toList();
        List<RedSocialResponseDTO> redes = redSocialRepository.findByComercioIdAndFechaBajaIsNull(comercioId).stream()
                .map(r -> new RedSocialResponseDTO(r.getId(), r.getTipo(), r.getUrl(), r.getFechaCreacion(), r.getFechaModificacion()))
                .toList();

        HistorialEstadoComercio ultimoRechazo = ultimoRechazo(comercioId);
        String motivo = ultimoRechazo == null || ultimoRechazo.getMotivo() == null || ultimoRechazo.getMotivo().isBlank()
                ? null : ultimoRechazo.getMotivo();

        int maximo = resolicitudesProperties.getMax();
        int usadas = comercio.getCantidadResolicitudes();
        boolean puedeLegales = !aprobacionPreviaDueno.duenoTuvoComercioAprobado(duenoId, comercioId);
        DatosLegalesCorreccionResponseDTO legales = puedeLegales ? aLegalesDTO(comercio.getDueno()) : null;

        return new CorreccionComercioResponseDTO(comercio.getId(), comercio.getNombre(), comercio.getDescripcion(),
                comercio.getTelefono(), comercio.getEmail(), comercio.getTipoComercio(), comercio.isAceptaDelivery(),
                comercio.isAceptaRetiro(), comercio.getFotoPerfilUrl(), direccionDTO, horarios, redes, motivo, usadas + 1,
                maximo, Math.max(0, maximo - usadas), puedeLegales, legales, ultimoRechazo == null ? 0 : ultimoRechazo.getId());
    }

    @Transactional(readOnly = true)
    public CloudinarySignatureResponseDTO generarFirmaFoto(Integer duenoId, Integer comercioId) {
        obtenerRechazadoDelDueno(duenoId, comercioId);
        return cloudinaryService.generarFirmaFotoPerfilComercio(comercioId);
    }

    public ComercioResponseDTO reSolicitar(Integer duenoId, Integer comercioId, ReSolicitudComercioRequestDTO request) {
        Dueno dueno = duenoRepository.findByIdConBloqueo(duenoId)
                .orElseThrow(() -> new RecursoNoEncontradoException(NO_ENCONTRADO));
        Comercio comercio = comercioRepository.findByIdAndDuenoIdConBloqueo(comercioId, duenoId)
                .orElseThrow(() -> new RecursoNoEncontradoException(NO_ENCONTRADO));

        if (comercio.getEstado() == EstadoComercio.PENDIENTE) {
            throw new ConflictoDeNegocioException(MENSAJE_YA_ENVIADO);
        }
        if (comercio.getEstado() != EstadoComercio.RECHAZADO) {
            throw new RecursoNoEncontradoException(NO_ENCONTRADO);
        }
        if (comercio.getCantidadResolicitudes() >= resolicitudesProperties.getMax()) {
            throw new ConflictoDeNegocioException(MENSAJE_SIN_INTENTOS);
        }
        HistorialEstadoComercio ultimoRechazo = ultimoRechazo(comercioId);
        int versionActual = ultimoRechazo == null ? 0 : ultimoRechazo.getId();
        if (request.getTokenVersion() != versionActual) {
            throw new ConflictoDeNegocioException(MENSAJE_VERSION_VENCIDA);
        }
        if (request.getLegales() != null && aprobacionPreviaDueno.duenoTuvoComercioAprobado(duenoId, comercioId)) {
            throw new ConflictoDeNegocioException(MENSAJE_LEGALES_NO_PERMITIDOS);
        }

        Localidad localidad = validadorDatosNegocio.validar(request);
        validadorComercioDuplicado.validar(duenoId, request.getNombre(), request.getDireccion(), comercioId);

        List<CambioComercio> cambios = new ArrayList<>();
        cambios.addAll(comercioEdicionService.actualizarDatosBasicos(comercio, request.getNombre(), request.getDescripcion(),
                request.getTelefono(), request.getEmailContacto()));
        cambios.addAll(comercioEdicionService.actualizarTipo(comercio, request.getTipoComercio()));
        cambios.addAll(comercioEdicionService.actualizarModalidades(comercio, request.isAceptaDelivery(), request.isAceptaRetiro()));
        cambios.addAll(comercioEdicionService.actualizarFoto(comercio, request.getFotoPerfilUrl()));
        cambios.addAll(comercioEdicionService.actualizarDireccion(comercio, request.getDireccion(), localidad));
        cambios.addAll(comercioEdicionService.reemplazarHorarios(comercio, request.getHorarios()));
        cambios.addAll(comercioEdicionService.sincronizarRedes(comercio, request.getRedesSociales()));
        if (request.getLegales() != null) {
            cambios.addAll(comercioEdicionService.actualizarDatosLegales(dueno, request.getLegales()));
        }
        if (cambios.isEmpty()) {
            throw new ConflictoDeNegocioException(MENSAJE_SIN_CAMBIOS);
        }

        comercio.setCantidadResolicitudes(comercio.getCantidadResolicitudes() + 1);
        comercio.setFechaResolicitud(LocalDateTime.now());
        HistorialEstadoComercio fila = comercioService.registrarTransicionAutomatica(comercio, EstadoComercio.RECHAZADO,
                EstadoComercio.PENDIENTE, MOTIVO_RESOLICITUD);
        historialCambioComercioRepository.saveAll(cambios.stream()
                .map(c -> HistorialCambioComercio.builder()
                        .historialEstadoComercio(fila)
                        .campo(c.campo())
                        .valorAnterior(c.anterior())
                        .valorNuevo(c.nuevo())
                        .build())
                .toList());

        return comercioService.verPerfil(comercioId);
    }

    private Comercio obtenerRechazadoDelDueno(Integer duenoId, Integer comercioId) {
        return comercioRepository.findByIdAndDuenoId(comercioId, duenoId)
                .filter(comercio -> comercio.getEstado() == EstadoComercio.RECHAZADO)
                .orElseThrow(() -> new RecursoNoEncontradoException(NO_ENCONTRADO));
    }

    private HistorialEstadoComercio ultimoRechazo(Integer comercioId) {
        return historialEstadoComercioRepository
                .findTopByComercioIdAndEstadoDestinoOrderByIdDesc(comercioId, EstadoComercio.RECHAZADO)
                .orElse(null);
    }

    private DatosLegalesCorreccionResponseDTO aLegalesDTO(Dueno dueno) {
        PersonaJuridica pj = dueno.getPersonaJuridica();
        PersonaFisica pf = dueno.getPersonaFisica();
        return new DatosLegalesCorreccionResponseDTO(pj.getRazonSocial(), pj.getCuit(), pj.getCondicionIva(), pj.getTipoSociedad(),
                pj.getDomicilioFiscal(), pj.getFechaInicioActividades(),
                new RepresentanteResponseDTO(pf.getNombre(), pf.getApellido(), pf.getDni(), pf.getTelefono(), pf.getFechaNacimiento()));
    }
}
