package com.bajonea.backend.services;

import com.bajonea.backend.dto.response.CierreComercioResponseDTO;
import com.bajonea.backend.entities.Comercio;
import com.bajonea.backend.entities.HistorialCierreComercio;
import com.bajonea.backend.entities.Horario;
import com.bajonea.backend.enums.AccionCierre;
import com.bajonea.backend.enums.ActorCierre;
import com.bajonea.backend.exceptions.ConflictoComercioException;
import com.bajonea.backend.exceptions.RecursoNoEncontradoException;
import com.bajonea.backend.repositories.ComercioRepository;
import com.bajonea.backend.repositories.HistorialCierreComercioRepository;
import com.bajonea.backend.repositories.HorarioRepository;
import com.bajonea.backend.repositories.UsuarioRepository;
import com.bajonea.backend.services.DisponibilidadComercioService.Disponibilidad;
import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import jakarta.persistence.PersistenceContext;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Optional;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Cierre y apertura manual de un comercio (bloque "Cierre manual", tramo C1) y su reapertura automática.
 * Cerrar solo frena pedidos nuevos: los pedidos en curso, los productos y todo lo demás siguen igual.
 * <p>
 * Cada operación toma el comercio con {@code SELECT ... FOR UPDATE} ({@code refresh} con bloqueo, porque el
 * comercio ya pudo cargarse al resolver {@code X-Comercio-Id} y una consulta común devolvería esa foto vieja)
 * y escribe la bandera y la fila de historial en la misma transacción. La hora de la operación se toma después del
 * bloqueo, para que {@code fecha_hora} siga el orden de commit. No toma la cuenta de Mercado Pago: el
 * orden de bloqueo general ({@code dueno} → {@code cuenta_mercado_pago} → {@code comercio} → pedidos) se
 * respeta porque este servicio solo llega hasta {@code comercio}.
 * <p>
 * Cerrar y abrir toman antes, con bloqueo compartido, la fila del usuario que actúa: la fila de historial lleva una
 * clave foránea a ese usuario, que de otro modo se pediría después de tener el comercio. El bloqueo de cuenta por
 * intentos fallidos hace al revés (tiene el usuario y pide el comercio), y las dos transacciones quedaban en
 * deadlock. Con este orden la que llega segunda espera a que la primera termine; si el bloqueo ganó, el comercio
 * ya no es operativo y el cierre responde {@code 409}. La reapertura automática no actúa un usuario y no lo toma.
 * <p>
 * Si quien actúa es un Empleado, después de su usuario revalida con bloqueo compartido que su relación con el comercio
 * siga {@code ACTIVO} (si no, el mismo {@code 404} del resolver) y recién entonces bloquea el comercio. Los dos
 * {@code 409} de negocio llevan código estable: {@code COMERCIO_NO_OPERATIVO} y {@code FUERA_DE_HORARIO}.
 */
@Service
@RequiredArgsConstructor
@Transactional
public class CierreComercioService {

    private static final Logger log = LoggerFactory.getLogger(CierreComercioService.class);

    static final String MENSAJE_NO_OPERATIVO = "Este comercio no está operativo";
    static final String MENSAJE_FUERA_DE_HORARIO = "Solo podés abrir o cerrar dentro de tu horario";

    private final ComercioRepository comercioRepository;
    private final HorarioRepository horarioRepository;
    private final HistorialCierreComercioRepository historialCierreComercioRepository;
    private final DisponibilidadComercioService disponibilidadComercioService;
    private final UsuarioRepository usuarioRepository;
    private final ComercioActivoService comercioActivoService;

    @PersistenceContext
    private EntityManager entityManager;

    public CierreComercioResponseDTO cerrar(Integer comercioId, Integer actorUsuarioId, ActorCierre actor) {
        return cambiarCierre(comercioId, actorUsuarioId, actor, true);
    }

    public CierreComercioResponseDTO abrir(Integer comercioId, Integer actorUsuarioId, ActorCierre actor) {
        return cambiarCierre(comercioId, actorUsuarioId, actor, false);
    }

    private CierreComercioResponseDTO cambiarCierre(Integer comercioId, Integer actorUsuarioId, ActorCierre actor,
            boolean cerrar) {
        if (actor != ActorCierre.SISTEMA && actorUsuarioId != null) {
            usuarioRepository.leerIdConBloqueoCompartido(actorUsuarioId);
        }
        if (actor == ActorCierre.EMPLEADO) {
            comercioActivoService.exigirRelacionActiva(actorUsuarioId, comercioId);
        }
        Comercio comercio = bloquearComercio(comercioId);
        LocalDateTime ahora = disponibilidadComercioService.ahora().truncatedTo(ChronoUnit.SECONDS);
        if (!ComercioActivoService.esOperativo(comercio.getEstado())) {
            throw new ConflictoComercioException(ConflictoComercioException.NO_OPERATIVO, MENSAJE_NO_OPERATIVO);
        }
        List<Horario> horarios = horarioRepository.findVigentesDesde(comercio.getId(),
                disponibilidadComercioService.fechaDesdeParaLeer(ahora));
        if (!disponibilidadComercioService.dentroDeFranja(horarios, ahora)) {
            throw new ConflictoComercioException(ConflictoComercioException.FUERA_DE_HORARIO, MENSAJE_FUERA_DE_HORARIO);
        }
        if (comercio.isCerradoManualmente() != cerrar) {
            comercio.setCerradoManualmente(cerrar);
            comercioRepository.save(comercio);
            registrar(comercio, cerrar ? AccionCierre.CERRADO : AccionCierre.REABIERTO, actorUsuarioId, actor, ahora);
        }
        return aRespuesta(comercio, horarios, ahora);
    }

    /**
     * Reapertura automática: apaga el cierre manual si ya empezó la primera franja posterior al momento del
     * cierre. Una transacción por comercio. Devuelve {@code true} si reabrió.
     */
    public boolean reabrirSiVencido(Integer comercioId, LocalDateTime ahora) {
        Comercio comercio = bloquearComercio(comercioId);
        if (!comercio.isCerradoManualmente()) {
            return false;
        }
        Optional<HistorialCierreComercio> ultimoCierre = historialCierreComercioRepository
                .findTopByComercioIdAndAccionOrderByFechaHoraDescIdDesc(comercioId, AccionCierre.CERRADO);
        if (ultimoCierre.isEmpty()) {
            log.warn("El comercio {} tiene el cierre manual prendido y ninguna fila CERRADO en el historial: se reabre",
                    comercioId);
        } else {
            LocalDateTime momentoDelCierre = ultimoCierre.get().getFechaHora();
            List<Horario> horarios = horarioRepository.findVigentesDesde(comercioId, momentoDelCierre.toLocalDate());
            Optional<LocalDateTime> inicio = disponibilidadComercioService
                    .proximoInicioDeFranja(horarios, momentoDelCierre);
            if (inicio.isEmpty()) {
                log.warn("El comercio {} tiene el cierre manual prendido y ninguna franja vigente: se reabre", comercioId);
            } else if (ahora.isBefore(inicio.get())) {
                return false;
            }
        }
        comercio.setCerradoManualmente(false);
        comercioRepository.save(comercio);
        registrar(comercio, AccionCierre.REABIERTO, null, ActorCierre.SISTEMA, ahora.truncatedTo(ChronoUnit.SECONDS));
        return true;
    }

    private Comercio bloquearComercio(Integer comercioId) {
        Comercio comercio = comercioRepository.findById(comercioId)
                .orElseThrow(() -> new RecursoNoEncontradoException("Comercio no encontrado"));
        entityManager.refresh(comercio, LockModeType.PESSIMISTIC_WRITE);
        return comercio;
    }

    private void registrar(Comercio comercio, AccionCierre accion, Integer actorUsuarioId, ActorCierre actor,
            LocalDateTime fechaHora) {
        historialCierreComercioRepository.save(HistorialCierreComercio.builder()
                .comercio(comercio)
                .accion(accion)
                .actorUsuarioId(actor == ActorCierre.SISTEMA ? null : actorUsuarioId)
                .actorRol(actor)
                .fechaHora(fechaHora)
                .build());
    }

    private CierreComercioResponseDTO aRespuesta(Comercio comercio, List<Horario> horarios, LocalDateTime ahora) {
        Disponibilidad disponibilidad = disponibilidadComercioService.calcular(comercio, horarios, ahora);
        return new CierreComercioResponseDTO(disponibilidad.cerradoManualmente(), disponibilidad.abiertoAhora(),
                disponibilidad.puedeCambiarCierre(), disponibilidad.textoReapertura());
    }
}
