package com.bajonea.backend.services;

import com.bajonea.backend.entities.Comercio;
import com.bajonea.backend.entities.Sesion;
import com.bajonea.backend.entities.Usuario;
import com.bajonea.backend.enums.EstadoUsuario;
import com.bajonea.backend.enums.RolUsuario;
import com.bajonea.backend.enums.TipoCierreSesion;
import com.bajonea.backend.repositories.ComercioRepository;
import com.bajonea.backend.repositories.InactividadCuentaRepository;
import com.bajonea.backend.repositories.InactividadCuentaRepository.Candidato;
import com.bajonea.backend.repositories.SesionRepository;
import com.bajonea.backend.repositories.UsuarioRepository;
import com.bajonea.backend.services.AvisoCuentaService.ComercioAvisado;
import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import jakarta.persistence.PersistenceContext;
import java.time.Clock;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Inactivación automática de las cuentas que pasaron {@code inactividad.meses} (3) sin actividad. Cada cuenta se
 * procesa en su propia transacción: un fallo no frena a las demás ni deja nada a medias.
 *
 * <p>Orden de bloqueo (ver {@code docs/CONCURRENCIA-Y-TRANSACCIONES.md}): la fila del {@code usuario} {@code FOR UPDATE}
 * es la primera sentencia de la transacción; si es un Dueño, después sus comercios inactivables por clave primaria y en
 * id ascendente (también {@code FOR UPDATE}, sin ninguna lectura común antes); recién con todo tomado se revalida la
 * elegibilidad con una lectura común, que por eso ve lo último confirmado (un login o un pedido que se confirmaron
 * mientras esta transacción esperaba el bloqueo). Un pedido nuevo de un comercio toma ese comercio con bloqueo
 * compartido y uno del Cliente toma su fila de usuario: cualquiera de los dos o termina antes de que esta
 * transacción obtenga el bloqueo, o espera a que termine.
 *
 * <p>El email sale después del commit ({@link AvisoCuentaService}, un solo intento, sin reintentos automáticos), nunca
 * dentro de la transacción.
 */
@Service
public class InactivacionCuentaService {

    private static final Logger log = LoggerFactory.getLogger(InactivacionCuentaService.class);

    static final String MOTIVO_HISTORIAL_USUARIO = "Inactividad";
    static final String MOTIVO_HISTORIAL_COMERCIO = "Inactivación automática de la cuenta del Dueño por falta de uso";

    public record ResultadoCorrida(int candidatos, int inactivadas, int omitidas, int conFalla) {
    }

    private enum Resultado { INACTIVADA, OMITIDA }

    private final InactividadCuentaRepository inactividadRepository;
    private final UsuarioRepository usuarioRepository;
    private final ComercioRepository comercioRepository;
    private final SesionRepository sesionRepository;
    private final EstadoUsuarioService estadoUsuarioService;
    private final AptitudVentaComercioService aptitudVentaComercioService;
    private final AvisoCuentaService avisoCuentaService;
    private final Clock clock;
    private final TransactionTemplate transaccion;
    private final int meses;
    private final int tope;

    @PersistenceContext
    private EntityManager entityManager;

    public InactivacionCuentaService(InactividadCuentaRepository inactividadRepository, UsuarioRepository usuarioRepository,
            ComercioRepository comercioRepository, SesionRepository sesionRepository,
            EstadoUsuarioService estadoUsuarioService, AptitudVentaComercioService aptitudVentaComercioService,
            AvisoCuentaService avisoCuentaService, Clock clock, PlatformTransactionManager transactionManager,
            @Value("${inactividad.meses:3}") int meses, @Value("${inactividad.tope-por-corrida:200}") int tope) {
        this.inactividadRepository = inactividadRepository;
        this.usuarioRepository = usuarioRepository;
        this.comercioRepository = comercioRepository;
        this.sesionRepository = sesionRepository;
        this.estadoUsuarioService = estadoUsuarioService;
        this.aptitudVentaComercioService = aptitudVentaComercioService;
        this.avisoCuentaService = avisoCuentaService;
        this.clock = clock;
        this.transaccion = new TransactionTemplate(transactionManager);
        this.meses = meses;
        this.tope = tope;
    }

    public LocalDateTime ahora() {
        return LocalDateTime.now(clock).truncatedTo(ChronoUnit.SECONDS);
    }

    public ResultadoCorrida inactivarVencidas(LocalDateTime ahora) {
        LocalDateTime corte = ahora.minusMonths(meses);
        List<Candidato> candidatos = inactividadRepository.candidatos(corte, tope);
        int inactivadas = 0;
        int omitidas = 0;
        int conFalla = 0;
        for (Candidato candidato : candidatos) {
            try {
                List<Integer> comercioIds = candidato.rol() == RolUsuario.DUENO
                        ? comercioRepository.findIdsByDuenoIdAndEstadoIn(candidato.usuarioId(),
                                AptitudVentaComercioService.ESTADOS_INACTIVABLES)
                        : List.of();
                Resultado resultado = transaccion.execute(status -> inactivar(candidato, comercioIds, corte));
                if (resultado == Resultado.INACTIVADA) {
                    inactivadas++;
                } else {
                    omitidas++;
                }
            } catch (RuntimeException e) {
                conFalla++;
                log.error("No se pudo inactivar la cuenta usuarioId={}", candidato.usuarioId(), e);
            }
        }
        return new ResultadoCorrida(candidatos.size(), inactivadas, omitidas, conFalla);
    }

    private Resultado inactivar(Candidato candidato, List<Integer> comercioIds, LocalDateTime corte) {
        Integer usuarioId = candidato.usuarioId();
        Usuario usuario = usuarioRepository.findByIdConBloqueo(usuarioId).orElse(null);
        if (usuario == null || usuario.getEstado() != EstadoUsuario.ACTIVO) {
            return Resultado.OMITIDA;
        }
        List<Comercio> comercios = new ArrayList<>();
        for (Integer comercioId : comercioIds) {
            Comercio comercio = entityManager.find(Comercio.class, comercioId, LockModeType.PESSIMISTIC_WRITE);
            if (comercio != null) {
                comercios.add(comercio);
            }
        }
        if (!inactividadRepository.sigueElegible(usuarioId, corte)) {
            return Resultado.OMITIDA;
        }
        if (usuario.getRol() == RolUsuario.DUENO && aparecieronComerciosSinBloquear(usuarioId, comercios)) {
            log.warn("La cuenta usuarioId={} tiene un comercio nuevo inactivable que cambió durante la corrida; queda para la próxima", usuarioId);
            return Resultado.OMITIDA;
        }

        estadoUsuarioService.cambiar(usuario, EstadoUsuario.INACTIVO, MOTIVO_HISTORIAL_USUARIO, null);
        cerrarSesiones(usuarioId);
        List<ComercioAvisado> inactivados = new ArrayList<>();
        for (Comercio comercio : comercios) {
            String nombre = comercio.getNombre();
            if (aptitudVentaComercioService.inactivarPorInactividad(comercio, MOTIVO_HISTORIAL_COMERCIO)) {
                inactivados.add(new ComercioAvisado(comercio.getId(), nombre));
            }
        }
        avisoCuentaService.avisarInactivacion(usuarioId, usuario.getEmail(), inactivados);
        return Resultado.INACTIVADA;
    }

    private boolean aparecieronComerciosSinBloquear(Integer duenoId, List<Comercio> bloqueados) {
        Set<Integer> idsBloqueados = new java.util.HashSet<>();
        for (Comercio comercio : bloqueados) {
            idsBloqueados.add(comercio.getId());
        }
        for (Integer id : comercioRepository.findIdsByDuenoIdAndEstadoIn(duenoId, AptitudVentaComercioService.ESTADOS_INACTIVABLES)) {
            if (!idsBloqueados.contains(id)) {
                return true;
            }
        }
        return false;
    }

    private void cerrarSesiones(Integer usuarioId) {
        LocalDateTime ahora = ahora();
        for (Sesion sesion : sesionRepository.findActivasDelUsuario(usuarioId)) {
            sesion.setActiva(false);
            sesion.setTipoCierre(TipoCierreSesion.INACTIVIDAD);
            sesion.setFechaCierre(ahora);
            sesionRepository.save(sesion);
        }
    }
}
