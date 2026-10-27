package com.bajonea.backend.services;

import com.bajonea.backend.dto.request.DireccionClienteRequestDTO;
import com.bajonea.backend.dto.response.DireccionClienteResponseDTO;
import com.bajonea.backend.entities.Cliente;
import com.bajonea.backend.entities.Direccion;
import com.bajonea.backend.entities.Localidad;
import com.bajonea.backend.exceptions.ConflictoComercioException;
import com.bajonea.backend.exceptions.RecursoNoEncontradoException;
import com.bajonea.backend.repositories.ClienteRepository;
import com.bajonea.backend.repositories.DireccionRepository;
import com.bajonea.backend.repositories.UsuarioRepository;
import com.bajonea.backend.util.TextoUtils;
import java.time.Clock;
import java.time.LocalDateTime;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * "Mis direcciones" del Cliente: hasta {@value #MAXIMO_ACTIVAS} activas, una sola predeterminada y baja lógica (el
 * pedido guarda su propia copia de la dirección de entrega). Toda escritura empieza por tomar la fila {@code usuario}
 * del Cliente {@code FOR UPDATE}: serializa las escrituras de un mismo Cliente entre sí y con la confirmación de un
 * pedido (que toma esa fila con bloqueo compartido), así que los conteos y la elección de predeterminada se leen ya
 * con el bloqueo tomado. Nunca se bloquean filas de {@code direccion} por rango. Al cambiar de predeterminada se baja
 * primero la vieja y se hace {@code flush} antes de subir la nueva, porque el índice único de predeterminada activa
 * se evalúa por sentencia.
 */
@Service
@RequiredArgsConstructor
@Transactional
public class DireccionClienteService {

    static final int MAXIMO_ACTIVAS = 5;
    static final String CAMPO_LOCALIDAD = "localidadId";
    static final String MENSAJE_CUPO = "Ya tenés el máximo de " + MAXIMO_ACTIVAS + " direcciones. Eliminá una para agregar otra.";
    static final String MENSAJE_ULTIMA = "No podés eliminar tu única dirección. Agregá otra primero.";
    static final String MENSAJE_NO_ENCONTRADA = "Dirección no encontrada";

    private final DireccionRepository direccionRepository;
    private final ClienteRepository clienteRepository;
    private final UsuarioRepository usuarioRepository;
    private final ValidadorDatosNegocioComercio validadorDatosNegocio;
    private final Clock clock;

    @Transactional(readOnly = true)
    public List<DireccionClienteResponseDTO> listar(Integer usuarioId) {
        return direccionRepository.findActivasByClienteId(usuarioId).stream().map(DireccionClienteService::aResponseDTO).toList();
    }

    public DireccionClienteResponseDTO crear(Integer usuarioId, DireccionClienteRequestDTO request) {
        Cliente cliente = bloquearCliente(usuarioId);
        Localidad localidad = validadorDatosNegocio.obtenerLocalidad(request.getLocalidadId(), CAMPO_LOCALIDAD);
        if (direccionRepository.countByClienteIdAndEliminadaFalse(usuarioId) >= MAXIMO_ACTIVAS) {
            throw new ConflictoComercioException(ConflictoComercioException.DIRECCIONES_CUPO_MAXIMO, MENSAJE_CUPO);
        }

        Direccion actual = direccionRepository.findPrincipalActivaByClienteId(usuarioId).orElse(null);
        boolean seraPrincipal = actual == null || request.isPrincipal();
        if (seraPrincipal && actual != null) {
            actual.setPrincipal(false);
            actual.setFechaModificacion(ahora());
            direccionRepository.saveAndFlush(actual);
        }

        Direccion direccion = Direccion.builder()
                .cliente(cliente)
                .nombre(limpiar(request.getNombre()))
                .calle(TextoUtils.aTitleCase(request.getCalle()))
                .numero(request.getNumero())
                .pisoDepto(request.getPisoDepto())
                .codigoPostal(TextoUtils.normalizarCodigoPostal(request.getCodigoPostal()))
                .referencia(limpiar(request.getReferencia()))
                .localidad(localidad)
                .principal(seraPrincipal)
                .eliminada(false)
                .fechaCreacion(ahora())
                .build();
        direccionRepository.saveAndFlush(direccion);
        return aResponseDTO(direccion);
    }

    public DireccionClienteResponseDTO editar(Integer usuarioId, Integer direccionId, DireccionClienteRequestDTO request) {
        bloquearCliente(usuarioId);
        Direccion direccion = obtenerActiva(usuarioId, direccionId);
        Localidad localidad = validadorDatosNegocio.obtenerLocalidad(request.getLocalidadId(), CAMPO_LOCALIDAD);

        direccion.setNombre(limpiar(request.getNombre()));
        direccion.setCalle(TextoUtils.aTitleCase(request.getCalle()));
        direccion.setNumero(request.getNumero());
        direccion.setPisoDepto(request.getPisoDepto());
        direccion.setCodigoPostal(TextoUtils.normalizarCodigoPostal(request.getCodigoPostal()));
        direccion.setReferencia(limpiar(request.getReferencia()));
        direccion.setLocalidad(localidad);
        direccion.setFechaModificacion(ahora());
        direccionRepository.saveAndFlush(direccion);
        return aResponseDTO(direccion);
    }

    public List<DireccionClienteResponseDTO> marcarPredeterminada(Integer usuarioId, Integer direccionId) {
        bloquearCliente(usuarioId);
        Direccion direccion = obtenerActiva(usuarioId, direccionId);
        if (!direccion.isPrincipal()) {
            Direccion actual = direccionRepository.findPrincipalActivaByClienteId(usuarioId).orElse(null);
            if (actual != null) {
                actual.setPrincipal(false);
                actual.setFechaModificacion(ahora());
                direccionRepository.saveAndFlush(actual);
            }
            direccion.setPrincipal(true);
            direccion.setFechaModificacion(ahora());
            direccionRepository.saveAndFlush(direccion);
        }
        return listar(usuarioId);
    }

    public List<DireccionClienteResponseDTO> eliminar(Integer usuarioId, Integer direccionId) {
        bloquearCliente(usuarioId);
        Direccion direccion = obtenerActiva(usuarioId, direccionId);
        if (direccionRepository.countByClienteIdAndEliminadaFalse(usuarioId) <= 1) {
            throw new ConflictoComercioException(ConflictoComercioException.ULTIMA_DIRECCION, MENSAJE_ULTIMA);
        }

        boolean eraPredeterminada = direccion.isPrincipal();
        LocalDateTime ahora = ahora();
        direccion.setEliminada(true);
        direccion.setPrincipal(false);
        direccion.setFechaBaja(ahora);
        direccion.setFechaModificacion(ahora);
        direccionRepository.saveAndFlush(direccion);

        if (eraPredeterminada) {
            Direccion nueva = direccionRepository.findActivasPorIdDescByClienteId(usuarioId).get(0);
            nueva.setPrincipal(true);
            nueva.setFechaModificacion(ahora);
            direccionRepository.saveAndFlush(nueva);
        }
        return listar(usuarioId);
    }

    private Cliente bloquearCliente(Integer usuarioId) {
        usuarioRepository.findByIdConBloqueo(usuarioId)
                .orElseThrow(() -> new RecursoNoEncontradoException("Cliente no encontrado"));
        return clienteRepository.findById(usuarioId)
                .orElseThrow(() -> new RecursoNoEncontradoException("Cliente no encontrado"));
    }

    private Direccion obtenerActiva(Integer usuarioId, Integer direccionId) {
        return direccionRepository.findByIdAndClienteIdAndEliminadaFalse(direccionId, usuarioId)
                .orElseThrow(() -> new RecursoNoEncontradoException(MENSAJE_NO_ENCONTRADA));
    }

    private LocalDateTime ahora() {
        return LocalDateTime.now(clock);
    }

    private static String limpiar(String texto) {
        if (texto == null) {
            return null;
        }
        String limpio = texto.trim();
        return limpio.isEmpty() ? null : limpio;
    }

    static DireccionClienteResponseDTO aResponseDTO(Direccion direccion) {
        return new DireccionClienteResponseDTO(
                direccion.getId(),
                direccion.getNombre(),
                direccion.getCalle(),
                direccion.getNumero(),
                direccion.getPisoDepto(),
                direccion.getCodigoPostal(),
                direccion.getLocalidad().getId(),
                direccion.getLocalidad().getNombre(),
                direccion.getLocalidad().getProvincia().getNombre(),
                direccion.getReferencia(),
                direccion.isPrincipal());
    }
}
