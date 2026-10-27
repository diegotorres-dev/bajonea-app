package com.bajonea.backend.services;

import com.bajonea.backend.config.DocumentacionComercioProperties;
import com.bajonea.backend.entities.Comercio;
import com.bajonea.backend.enums.EstadoComercio;
import com.bajonea.backend.enums.EstadoDocumentoComercio;
import com.bajonea.backend.enums.MotivoRecalculo;
import com.bajonea.backend.enums.TipoEntidadNotificacion;
import com.bajonea.backend.enums.TipoNotificacion;
import com.bajonea.backend.exceptions.RecursoNoEncontradoException;
import com.bajonea.backend.repositories.ComercioRepository;
import com.bajonea.backend.repositories.DocumentoComercioRepository;
import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import jakarta.persistence.PersistenceContext;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * Única fuente de la regla que lleva un comercio a {@code APTO_VENTA}, lo saca de ahí o lo cierra por el bloqueo
 * de la cuenta del Dueño. Ningún otro servicio decide el destino de esas transiciones.
 * <p>
 * Estados que participan: {@code APROBADO}, {@code APTO_VENTA} y {@code CERRADO_TEMPORALMENTE} (más
 * {@code INACTIVO} al restaurar). Cualquier otro estado no se toca.
 * <ul>
 * <li>Entrar a {@code APTO_VENTA}: cuenta de Mercado Pago activa, al menos un documento {@code APROBADO} y ningún
 * documento {@code PENDIENTE}.</li>
 * <li>Seguir en {@code APTO_VENTA}: cuenta de Mercado Pago activa y al menos un documento {@code APROBADO}. Un
 * documento nuevo en revisión, o uno extra rechazado, no corta las ventas.</li>
 * <li>Con {@code comercio.documentacion.requerida=false} los documentos se ignoran y solo cuenta Mercado Pago.</li>
 * <li>Con la cuenta del Dueño {@code BLOQUEADO} ningún camino deja el comercio en {@code APTO_VENTA}: el que
 * cumple pasa a {@code CERRADO_TEMPORALMENTE}. Mientras dura el bloqueo ningún otro evento lo mueve; al
 * restaurar la cuenta se evalúa la regla de seguir vendiendo.</li>
 * </ul>
 * Orden de bloqueo (ver docs/CONCURRENCIA-Y-TRANSACCIONES.md): usuario del Dueño, cuenta de Mercado Pago, comercio,
 * documentos. Este servicio no toma por su cuenta lo que ya tiene que tener quien lo llama: {@link #leerDueno}
 * toma las dos primeras, el llamador bloquea el comercio ({@link #bloquearComercio}) y recién después se
 * recalcula, que lee los documentos con bloqueo compartido.
 * <p>
 * {@link MotivoRecalculo#SUSPENSION_LEVANTADA} queda previsto para el tramo de la suspensión: levantar una
 * suspensión tendrá que decidir el destino llamando a este servicio y no con un estado escrito a mano.
 */
@Service
@RequiredArgsConstructor
public class AptitudVentaComercioService {

    static final String DETALLE_BLOQUEO_VIGENTE_AL_APROBAR = "Bloqueo de cuenta vigente al aprobar";
    static final String DETALLE_BLOQUEO_VIGENTE_AL_VINCULAR = "Bloqueo de cuenta vigente al vincular Mercado Pago";
    static final String DETALLE_BLOQUEO_VIGENTE_AL_REVISAR = "Bloqueo de cuenta vigente al revisar la documentación";

    public record EntradasDueno(boolean bloqueado, boolean cuentaMercadoPagoActiva) {
    }

    public record Conteo(long aprobados, long pendientes, long total) {
    }

    private final ComercioRepository comercioRepository;
    private final ComercioService comercioService;
    private final CuentaMercadoPagoService cuentaMercadoPagoService;
    private final DocumentoComercioRepository documentoComercioRepository;
    private final NotificacionService notificacionService;
    private final DocumentacionComercioProperties documentacionProperties;

    @PersistenceContext
    private EntityManager entityManager;

    /**
     * Destino de un comercio dado lo que se sabe del Dueño y de sus documentos. Pura: no lee ni escribe nada.
     */
    public static EstadoComercio decidir(EstadoComercio actual, boolean duenoBloqueado, boolean cuentaMercadoPagoActiva,
            long aprobados, long pendientes, boolean documentacionRequerida, MotivoRecalculo motivo) {
        boolean puedeEntrar = cuentaMercadoPagoActiva && (!documentacionRequerida || (aprobados >= 1 && pendientes == 0));
        boolean puedeSeguir = cuentaMercadoPagoActiva && (!documentacionRequerida || aprobados >= 1);
        switch (actual) {
            case APROBADO:
                if (!puedeEntrar) {
                    return EstadoComercio.APROBADO;
                }
                return duenoBloqueado ? EstadoComercio.CERRADO_TEMPORALMENTE : EstadoComercio.APTO_VENTA;
            case APTO_VENTA:
                if (!puedeSeguir) {
                    return EstadoComercio.APROBADO;
                }
                return duenoBloqueado ? EstadoComercio.CERRADO_TEMPORALMENTE : EstadoComercio.APTO_VENTA;
            case CERRADO_TEMPORALMENTE:
            case INACTIVO:
                if (motivo != MotivoRecalculo.DUENO_RESTAURADO || duenoBloqueado) {
                    return actual;
                }
                return puedeSeguir ? EstadoComercio.APTO_VENTA : EstadoComercio.APROBADO;
            default:
                return actual;
        }
    }

    /**
     * Estado de la cuenta del Dueño (bloqueo compartido) y de su cuenta de Mercado Pago ({@code FOR UPDATE}): los
     * dos primeros pasos del orden de bloqueo. Hay que llamarlo antes de bloquear cualquier comercio del Dueño.
     */
    @Transactional(propagation = Propagation.MANDATORY)
    public EntradasDueno leerDueno(Integer duenoId) {
        boolean bloqueado = comercioService.duenoBloqueadoConBloqueo(duenoId);
        boolean cuenta = cuentaMercadoPagoService.existeActivaConBloqueo(duenoId);
        return new EntradasDueno(bloqueado, cuenta);
    }

    /**
     * Para restaurar una cuenta: el llamador ya tiene la fila del usuario bloqueada y la está pasando a
     * {@code ACTIVO}, así que el bloqueo no se vuelve a leer; solo se toma la cuenta de Mercado Pago.
     */
    @Transactional(propagation = Propagation.MANDATORY)
    public EntradasDueno leerDuenoRestaurado(Integer duenoId) {
        return new EntradasDueno(false, cuentaMercadoPagoService.existeActivaConBloqueo(duenoId));
    }

    /** El comercio con {@code FOR UPDATE} y su estado real (no la foto que ya tuviera cargada la transacción). */
    @Transactional(propagation = Propagation.MANDATORY)
    public Comercio bloquearComercio(Integer comercioId) {
        Comercio comercio = comercioRepository.findByIdConBloqueo(comercioId)
                .orElseThrow(() -> new RecursoNoEncontradoException("Comercio no encontrado"));
        entityManager.refresh(comercio, LockModeType.PESSIMISTIC_WRITE);
        return comercio;
    }

    /** Recuento de documentos del comercio con bloqueo compartido; el comercio tiene que estar bloqueado. */
    @Transactional(propagation = Propagation.MANDATORY)
    public Conteo contarDocumentos(Integer comercioId) {
        List<String> estados = documentoComercioRepository.estadosDelComercioConBloqueoCompartido(comercioId);
        long aprobados = estados.stream().filter(EstadoDocumentoComercio.APROBADO.name()::equals).count();
        long pendientes = estados.stream().filter(EstadoDocumentoComercio.PENDIENTE.name()::equals).count();
        return new Conteo(aprobados, pendientes, estados.size());
    }

    /**
     * Recalcula un comercio ya bloqueado y escribe la transición si el destino cambia. Devuelve el estado final.
     * {@code detalle} reemplaza el texto por defecto del historial cuando el llamador necesita uno propio.
     */
    @Transactional(propagation = Propagation.MANDATORY)
    public EstadoComercio recalcular(Comercio comercio, EntradasDueno dueno, MotivoRecalculo motivo, String detalle) {
        return recalcular(comercio, dueno, motivo, detalle, true);
    }

    /** Igual, con {@code avisar=false} para quien ya le da al Dueño su propio aviso (la aprobación del comercio). */
    @Transactional(propagation = Propagation.MANDATORY)
    public EstadoComercio recalcular(Comercio comercio, EntradasDueno dueno, MotivoRecalculo motivo, String detalle,
            boolean avisar) {
        EstadoComercio actual = comercio.getEstado();
        if (!participa(actual)) {
            return actual;
        }
        Conteo conteo = contarDocumentos(comercio.getId());
        EstadoComercio destino = decidir(actual, dueno.bloqueado(), dueno.cuentaMercadoPagoActiva(), conteo.aprobados(),
                conteo.pendientes(), documentacionProperties.isRequerida(), motivo);
        if (destino == actual) {
            return actual;
        }
        comercioService.registrarTransicionAutomatica(comercio, actual, destino, texto(destino, motivo, detalle));
        if (avisar) {
            avisarCambio(comercio, actual, destino, dueno, conteo);
        }
        return destino;
    }

    /**
     * Recalcula todos los comercios del Dueño (vincular o desvincular Mercado Pago). Cada uno se vuelve a leer con
     * {@code PESSIMISTIC_WRITE}: una lectura común (la de {@code refresh} a secas) usaría la foto de la transacción y no
     * vería un comercio que se confirmó después de que ella empezara, aunque la consulta bloqueante sí lo devolvió
     * ({@code EntityNotFoundException}).
     */
    @Transactional(propagation = Propagation.MANDATORY)
    public void recalcularComerciosDelDueno(Integer duenoId, EntradasDueno dueno, MotivoRecalculo motivo) {
        for (Comercio comercio : comercioRepository.findByDuenoIdConBloqueo(duenoId)) {
            entityManager.refresh(comercio, LockModeType.PESSIMISTIC_WRITE);
            recalcular(comercio, dueno, motivo, null);
        }
    }

    /**
     * Bloqueo de cuenta del Dueño: lleva a {@code CERRADO_TEMPORALMENTE} el comercio que está vendiendo. Toma la
     * fila por clave primaria con {@code refresh} y {@code PESSIMISTIC_WRITE} (nunca todos los comercios del
     * Dueño a la vez: se interbloquearía con la aprobación de un comercio pendiente) y decide sobre el estado
     * real. Devuelve {@code true} si hizo la transición. No avisa: el aviso es el del bloqueo de la cuenta.
     */
    @Transactional(propagation = Propagation.MANDATORY)
    public boolean cerrarPorBloqueo(Comercio comercio, String detalle) {
        entityManager.refresh(comercio, LockModeType.PESSIMISTIC_WRITE);
        if (comercio.getEstado() != EstadoComercio.APTO_VENTA) {
            return false;
        }
        comercioService.registrarTransicionAutomatica(comercio, EstadoComercio.APTO_VENTA,
                EstadoComercio.CERRADO_TEMPORALMENTE, detalle);
        return true;
    }

    /**
     * Restauración al desbloquear o reactivar la cuenta: cada comercio que estaba en {@code estadoOrigen} vuelve a
     * {@code APTO_VENTA} si sigue cumpliendo la regla de seguir vendiendo y a {@code APROBADO} si no. Lee la
     * cuenta de Mercado Pago con bloqueo (antes se leía sin él) y cada comercio por clave primaria.
     */
    @Transactional(propagation = Propagation.MANDATORY)
    public void restaurar(Integer duenoId, EstadoComercio estadoOrigen, String detalle) {
        EntradasDueno dueno = leerDuenoRestaurado(duenoId);
        for (Comercio candidato : comercioRepository.findByDuenoIdOrderByFechaRegistroAscIdAsc(duenoId)) {
            if (candidato.getEstado() != estadoOrigen) {
                continue;
            }
            entityManager.refresh(candidato, LockModeType.PESSIMISTIC_WRITE);
            if (candidato.getEstado() == estadoOrigen) {
                recalcular(candidato, dueno, MotivoRecalculo.DUENO_RESTAURADO, detalle);
            }
        }
    }

    private static boolean participa(EstadoComercio estado) {
        return estado == EstadoComercio.APROBADO || estado == EstadoComercio.APTO_VENTA
                || estado == EstadoComercio.CERRADO_TEMPORALMENTE || estado == EstadoComercio.INACTIVO;
    }

    private static String texto(EstadoComercio destino, MotivoRecalculo motivo, String detalle) {
        if (detalle != null) {
            return detalle;
        }
        if (destino == EstadoComercio.CERRADO_TEMPORALMENTE) {
            return switch (motivo) {
                case MP_VINCULADO -> DETALLE_BLOQUEO_VIGENTE_AL_VINCULAR;
                case COMERCIO_APROBADO -> DETALLE_BLOQUEO_VIGENTE_AL_APROBAR;
                default -> DETALLE_BLOQUEO_VIGENTE_AL_REVISAR;
            };
        }
        return switch (motivo) {
            case MP_VINCULADO, COMERCIO_APROBADO -> "Vinculación automática de cuenta de Mercado Pago";
            case MP_DESVINCULADO -> "Desvinculación de cuenta de Mercado Pago";
            case DOCUMENTO_APROBADO -> "Documento aprobado por el Administrador";
            case DOCUMENTO_RECHAZADO -> "Documento rechazado por el Administrador";
            case DOCUMENTO_REVOCADO -> "Documento revocado por el Administrador";
            case DOCUMENTO_SUBIDO -> "Documento subido para revisión";
            case DOCUMENTO_ELIMINADO -> "Documento pendiente eliminado";
            case DUENO_BLOQUEADO -> "Bloqueo de cuenta";
            case DUENO_RESTAURADO -> "Restauración de cuenta";
            case SUSPENSION_LEVANTADA -> "Suspensión levantada";
        };
    }

    private void avisarCambio(Comercio comercio, EstadoComercio origen, EstadoComercio destino, EntradasDueno dueno,
            Conteo conteo) {
        if (destino == EstadoComercio.APTO_VENTA && origen == EstadoComercio.APROBADO) {
            avisar(comercio, "Tu comercio " + comercio.getNombre() + " ya puede recibir pedidos.",
                    TipoNotificacion.COMERCIO_APTO_VENTA);
        } else if (destino == EstadoComercio.APROBADO) {
            avisar(comercio, "Tu comercio " + comercio.getNombre() + " dejó de recibir pedidos: " + faltante(dueno, conteo) + ".",
                    TipoNotificacion.COMERCIO_SIN_APTITUD);
        }
    }

    private String faltante(EntradasDueno dueno, Conteo conteo) {
        boolean faltaMp = !dueno.cuentaMercadoPagoActiva();
        boolean faltaDocumento = documentacionProperties.isRequerida() && conteo.aprobados() == 0;
        if (faltaMp && faltaDocumento) {
            return "falta vincular Mercado Pago y tener un documento aprobado";
        }
        if (faltaMp) {
            return "falta vincular Mercado Pago";
        }
        if (faltaDocumento) {
            return "falta tener un documento aprobado";
        }
        return "no cumple los requisitos para vender";
    }

    private void avisar(Comercio comercio, String mensaje, TipoNotificacion tipo) {
        notificacionService.crearParaDueno(comercio.getDueno().getId(), comercio.getId(), mensaje, tipo,
                TipoEntidadNotificacion.COMERCIO, comercio.getId());
    }
}
