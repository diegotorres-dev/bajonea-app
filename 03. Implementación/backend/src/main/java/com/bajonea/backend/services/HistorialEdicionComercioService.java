package com.bajonea.backend.services;

import com.bajonea.backend.config.security.ComercioActivo;
import com.bajonea.backend.entities.Comercio;
import com.bajonea.backend.entities.HistorialEdicionComercio;
import com.bajonea.backend.enums.AccionEdicion;
import com.bajonea.backend.enums.RolActorComercio;
import com.bajonea.backend.enums.TipoEntidadEdicion;
import com.bajonea.backend.exceptions.RecursoNoEncontradoException;
import com.bajonea.backend.repositories.ComercioRepository;
import com.bajonea.backend.repositories.HistorialEdicionComercioRepository;
import com.bajonea.backend.repositories.UsuarioRepository;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import java.time.temporal.ChronoUnit;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * Registro de quién cambió qué en el catálogo y el perfil del comercio (altas, ediciones, bajas y cambios de
 * estado de productos, imágenes, perfil y redes sociales; horarios y extras cuando existan). Sin valores
 * anteriores: {@code detalle} dice qué campos cambiaron o qué pasó, nunca los datos. No registra pedidos ni
 * cierres, que ya tienen su historial.
 * <p>
 * Todo acá exige una transacción en curso ({@link Propagation#MANDATORY}): el registro se escribe en la
 * <b>misma</b> transacción que el cambio que audita, así que si el cambio falla no queda fila y si la fila no se
 * puede escribir el cambio no se confirma.
 * <p>
 * Orden de bloqueo: la fila de {@code historial_edicion_comercio} tiene claves foráneas a {@code comercio} y a
 * {@code usuario}, y el insert toma un bloqueo compartido sobre las dos. Quien escribe tiene que llamar a
 * {@link #iniciarEscritura(ComercioActivo)} como <b>primera</b> instrucción de su operación: así el usuario que
 * actúa se bloquea antes que el comercio y no se cruza con el bloqueo de cuenta por intentos fallidos (que toma el
 * usuario y después el comercio). Ver {@code docs/CONCURRENCIA-Y-TRANSACCIONES.md}, orden global de bloqueos.
 * <p>
 * Antes de insertar, {@code registrar} vuelca al motor las escrituras pendientes de la transacción
 * ({@code EntityManager.flush()}): Hibernate difiere los {@code UPDATE} hasta el commit, así que sin eso el
 * {@code INSERT} tomaría primero el bloqueo compartido del comercio y recién después el {@code UPDATE} pediría el
 * exclusivo. Dos ediciones del perfil a la vez se quedarían cada una con el compartido esperando que la otra lo
 * suelte (interbloqueo por mejora de bloqueo, reproducido con seis hilos); con el volcado previo la segunda espera
 * el exclusivo sin tener nada tomado.
 */
@Service
@RequiredArgsConstructor
public class HistorialEdicionComercioService {

    static final int MAX_ENTIDAD_NOMBRE = 150;
    static final int MAX_DETALLE = 255;

    private final HistorialEdicionComercioRepository historialEdicionComercioRepository;
    private final ComercioRepository comercioRepository;
    private final UsuarioRepository usuarioRepository;
    private final DisponibilidadComercioService disponibilidadComercioService;
    private final ComercioActivoService comercioActivoService;

    @PersistenceContext
    private EntityManager entityManager;

    /**
     * Primera instrucción de toda escritura del catálogo, el perfil y las redes sociales: toma la fila del usuario
     * que actúa (orden de bloqueo, nivel 1) y, si el actor es un Empleado, revalida con bloqueo compartido que su
     * relación con el comercio siga {@code ACTIVO} (nivel 2). Si dejó de estarlo responde el mismo {@code 404}
     * {@code COMERCIO_NO_DISPONIBLE} que el resolver.
     */
    @Transactional(propagation = Propagation.MANDATORY)
    public void iniciarEscritura(ComercioActivo actor) {
        EstadoUsuarioService.exigirNoSuspendido(usuarioRepository, actor.actorUsuarioId());
        comercioActivoService.exigirRelacionActiva(actor);
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public void registrar(ComercioActivo actor, TipoEntidadEdicion entidadTipo, Integer entidadId, String entidadNombre,
            AccionEdicion accion, String detalle) {
        registrar(actor.comercioId(), actor.actorUsuarioId(), actor.actorRol(), entidadTipo, entidadId, entidadNombre, accion,
                detalle);
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public void registrar(Integer comercioId, Integer usuarioId, RolActorComercio actorRol, TipoEntidadEdicion entidadTipo,
            Integer entidadId, String entidadNombre, AccionEdicion accion, String detalle) {
        entityManager.flush();
        Comercio comercio = comercioRepository.getReferenceById(comercioId);
        HistorialEdicionComercio fila = HistorialEdicionComercio.builder()
                .comercio(comercio)
                .usuarioId(usuarioId)
                .actorRol(actorRol)
                .entidadTipo(entidadTipo)
                .entidadId(entidadId)
                .entidadNombre(recortar(entidadNombre, MAX_ENTIDAD_NOMBRE))
                .accion(accion)
                .detalle(recortar(detalle, MAX_DETALLE))
                .fechaHora(disponibilidadComercioService.ahora().truncatedTo(ChronoUnit.SECONDS))
                .build();
        historialEdicionComercioRepository.save(fila);
    }

    /**
     * Texto del detalle de una edición: {@code "Editó: nombre, precio"}, o {@code null} si no cambió nada (quien
     * llama no registra nada en ese caso).
     */
    static String detalleDeEdicion(List<String> camposCambiados) {
        if (camposCambiados.isEmpty()) {
            return null;
        }
        return "Editó: " + String.join(", ", camposCambiados);
    }

    private static String recortar(String texto, int maximo) {
        if (texto == null || texto.length() <= maximo) {
            return texto;
        }
        return texto.substring(0, maximo - 1) + "…";
    }
}
