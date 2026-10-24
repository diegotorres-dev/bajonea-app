package com.bajonea.backend.repositories;

import com.bajonea.backend.entities.CierreTurno;
import com.bajonea.backend.enums.EstadoComercio;
import com.bajonea.backend.enums.EstadoUsuario;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.Collection;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

public interface CierreTurnoRepository extends JpaRepository<CierreTurno, Integer> {

    interface UltimoCierreDeComercio {
        Integer getComercioId();

        LocalDateTime getFin();
    }

    interface CierrePorEnviar {
        Integer getId();

        Integer getComercioId();

        String getNombreComercio();

        EstadoComercio getEstadoComercio();

        Integer getDuenoId();

        String getEmailDueno();

        String getNombreDueno();

        EstadoUsuario getEstadoDueno();

        LocalDate getTurnoFecha();

        LocalTime getHoraApertura();

        LocalTime getHoraCierre();

        LocalDateTime getFin();

        Integer getCantidadPedidos();

        BigDecimal getVendido();

        BigDecimal getComision();

        BigDecimal getNeto();

        Integer getPendientesAlCierre();

        Integer getEmailIntentos();
    }

    List<CierreTurno> findByComercioIdOrderByIdAsc(Integer comercioId);

    @Query("select c.comercioId as comercioId, max(c.fin) as fin from CierreTurno c "
            + "where c.comercioId in :comercioIds and c.turnoFecha >= :desde group by c.comercioId")
    List<UltimoCierreDeComercio> findUltimoFinDesde(@Param("comercioIds") Collection<Integer> comercioIds,
            @Param("desde") LocalDate desde);

    @Query("select c.id as id, c.comercioId as comercioId, co.nombre as nombreComercio, co.estado as estadoComercio, "
            + "d.id as duenoId, u.email as emailDueno, pf.nombre as nombreDueno, u.estado as estadoDueno, "
            + "c.turnoFecha as turnoFecha, h.horaApertura as horaApertura, h.horaCierre as horaCierre, c.fin as fin, c.cantidadPedidos as cantidadPedidos, "
            + "c.vendido as vendido, c.comision as comision, c.neto as neto, c.pendientesAlCierre as pendientesAlCierre, "
            + "c.emailIntentos as emailIntentos "
            + "from CierreTurno c, Comercio co join co.dueno d join d.personaFisica pf, Usuario u, Horario h "
            + "where co.id = c.comercioId and u.id = d.id and h.id = c.horarioId and c.emailEstado = com.bajonea.backend.enums.EstadoEmailCierreTurno.PENDIENTE "
            + "and (c.emailProximoIntento is null or c.emailProximoIntento <= :ahora) "
            + "order by d.id, c.fin, c.id")
    List<CierrePorEnviar> findPorEnviar(@Param("ahora") LocalDateTime ahora);

    @Query("select c.id from CierreTurno c where c.emailEstado = com.bajonea.backend.enums.EstadoEmailCierreTurno.ENVIANDO "
            + "and c.emailEnvioIniciado < :limite order by c.id")
    List<Integer> findIdsEnviandoDesde(@Param("limite") LocalDateTime limite);

    @Transactional
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("update CierreTurno c set c.emailEstado = com.bajonea.backend.enums.EstadoEmailCierreTurno.PENDIENTE, "
            + "c.emailEnvioIniciado = null "
            + "where c.id = :id and c.emailEstado = com.bajonea.backend.enums.EstadoEmailCierreTurno.ENVIANDO "
            + "and c.emailEnvioIniciado < :limite")
    int recuperarEnviando(@Param("id") Integer id, @Param("limite") LocalDateTime limite);

    @Transactional
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("update CierreTurno c set c.emailEstado = com.bajonea.backend.enums.EstadoEmailCierreTurno.ENVIANDO, "
            + "c.emailEnvioIniciado = :ahora "
            + "where c.id = :id and c.emailEstado = com.bajonea.backend.enums.EstadoEmailCierreTurno.PENDIENTE")
    int reclamar(@Param("id") Integer id, @Param("ahora") LocalDateTime ahora);

    @Transactional
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("update CierreTurno c set c.emailEstado = com.bajonea.backend.enums.EstadoEmailCierreTurno.OMITIDO, "
            + "c.emailUltimoError = :motivo "
            + "where c.id = :id and c.emailEstado = com.bajonea.backend.enums.EstadoEmailCierreTurno.PENDIENTE")
    int omitir(@Param("id") Integer id, @Param("motivo") String motivo);

    @Transactional
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("update CierreTurno c set c.emailEstado = com.bajonea.backend.enums.EstadoEmailCierreTurno.ENVIADO, "
            + "c.emailFechaEnvio = :ahora, c.emailEnvioIniciado = null, c.emailProximoIntento = null "
            + "where c.id = :id and c.emailEstado = com.bajonea.backend.enums.EstadoEmailCierreTurno.ENVIANDO")
    int marcarEnviado(@Param("id") Integer id, @Param("ahora") LocalDateTime ahora);

    @Transactional
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("update CierreTurno c set c.emailEstado = com.bajonea.backend.enums.EstadoEmailCierreTurno.PENDIENTE, "
            + "c.emailIntentos = :intentos, c.emailProximoIntento = :proximo, c.emailEnvioIniciado = null, "
            + "c.emailUltimoError = :error "
            + "where c.id = :id and c.emailEstado = com.bajonea.backend.enums.EstadoEmailCierreTurno.ENVIANDO")
    int registrarFallaConReintento(@Param("id") Integer id, @Param("intentos") Integer intentos,
            @Param("proximo") LocalDateTime proximo, @Param("error") String error);

    @Transactional
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("update CierreTurno c set c.emailEstado = com.bajonea.backend.enums.EstadoEmailCierreTurno.FALLIDO, "
            + "c.emailIntentos = :intentos, c.emailProximoIntento = null, c.emailEnvioIniciado = null, "
            + "c.emailUltimoError = :error "
            + "where c.id = :id and c.emailEstado = com.bajonea.backend.enums.EstadoEmailCierreTurno.ENVIANDO")
    int registrarFallaDefinitiva(@Param("id") Integer id, @Param("intentos") Integer intentos, @Param("error") String error);
}
