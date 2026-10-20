package com.bajonea.backend.services;

import com.bajonea.backend.config.security.ComercioActivo;
import com.bajonea.backend.dto.request.HorarioRequestDTO;
import com.bajonea.backend.dto.response.HorarioResponseDTO;
import com.bajonea.backend.dto.response.HorariosComercioResponseDTO;
import com.bajonea.backend.entities.Comercio;
import com.bajonea.backend.entities.Horario;
import com.bajonea.backend.enums.AccionEdicion;
import com.bajonea.backend.enums.TipoEntidadEdicion;
import com.bajonea.backend.exceptions.RecursoNoEncontradoException;
import com.bajonea.backend.exceptions.ValidacionException;
import com.bajonea.backend.repositories.ComercioRepository;
import com.bajonea.backend.repositories.HorarioRepository;
import com.bajonea.backend.util.ComercioTextoLegible;
import com.bajonea.backend.util.ComercioTextoLegible.FranjaOrdenable;
import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import jakarta.persistence.PersistenceContext;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.Comparator;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Edición de los horarios de un comercio ya cargado, por el Dueño o por un Empleado. Los cambios rigen desde
 * mañana: lo vigente se cierra con {@code vigente_hasta = hoy} y la versión nueva se inserta con
 * {@code vigente_desde = mañana}, así que en ningún momento el comercio queda sin franjas. Una segunda edición
 * el mismo día reemplaza a la primera y una edición igual a lo vigente cancela el cambio programado. Un turno
 * de hoy que cruza la medianoche sigue vigente bajo la versión vieja hasta su cierre de mañana: la edición se
 * rechaza si esa cola se superpone con una franja de mañana de la versión nueva.
 * <p>
 * Orden de bloqueo: el usuario que actúa y la relación del Empleado ({@code iniciarEscritura}) y después el
 * comercio con {@code FOR UPDATE} desde la primera lectura (leerlo compartido y mejorarlo a exclusivo
 * interbloquea dos ediciones a la vez); {@code horario} es hoja debajo de {@code comercio}. Las filas de
 * {@code horario} también se leen con bloqueo: una lectura común usaría la foto que fijó la primera consulta de la
 * transacción (antes de esperar el bloqueo del comercio) y no vería la edición que acaba de confirmarse.
 */
@Service
@RequiredArgsConstructor
@Transactional
public class HorarioEdicionService {

    private static final DateTimeFormatter FORMATO_FECHA = DateTimeFormatter.ofPattern("dd/MM/yyyy");

    private final ComercioRepository comercioRepository;
    private final HorarioRepository horarioRepository;
    private final HistorialEdicionComercioService historialEdicionComercioService;
    private final DisponibilidadComercioService disponibilidadComercioService;

    @PersistenceContext
    private EntityManager entityManager;

    public HorariosComercioResponseDTO editarHorarios(ComercioActivo actor, List<HorarioRequestDTO> nuevos) {
        historialEdicionComercioService.iniciarEscritura(actor);
        Comercio comercio = comercioRepository.findById(actor.comercioId())
                .orElseThrow(() -> new RecursoNoEncontradoException("Comercio no encontrado"));
        entityManager.refresh(comercio, LockModeType.PESSIMISTIC_WRITE);
        ComercioActivoService.validarComercioModificable(actor, comercio.getEstado());
        ValidadorHorarios.validar(nuevos);

        LocalDate hoy = disponibilidadComercioService.ahora().toLocalDate();
        List<Horario> filas = horarioRepository.findVigentesDesdeConBloqueo(comercio.getId(), hoy);

        List<Horario> pendientes = filas.stream().filter(fila -> fila.getVigenteDesde().isAfter(hoy)).toList();
        boolean habiaCambioProgramado = !pendientes.isEmpty();
        if (habiaCambioProgramado) {
            horarioRepository.deleteAll(pendientes);
        }
        for (Horario fila : filas) {
            if (hoy.equals(fila.getVigenteHasta())) {
                fila.setVigenteHasta(null);
            }
        }
        List<Horario> base = filas.stream().filter(fila -> !fila.getVigenteDesde().isAfter(hoy)).toList();

        boolean iguales = franjas(base).equals(franjasNuevas(nuevos));
        String detalle = null;
        LocalDate rigeDesde = null;
        if (!iguales) {
            validarColaDelTurnoDeHoy(base, nuevos, hoy);
            rigeDesde = hoy.plusDays(1);
            for (Horario fila : base) {
                fila.setVigenteHasta(hoy);
            }
            for (HorarioRequestDTO franja : nuevos) {
                horarioRepository.save(Horario.builder()
                        .comercio(comercio)
                        .diaSemana(franja.getDiaSemana())
                        .horaApertura(franja.getHoraApertura())
                        .horaCierre(franja.getHoraCierre())
                        .vigenteDesde(rigeDesde)
                        .build());
            }
            detalle = "Editó: horarios (rigen desde " + FORMATO_FECHA.format(rigeDesde) + ")";
        } else if (habiaCambioProgramado) {
            detalle = "Canceló el cambio de horarios programado";
        }
        horarioRepository.flush();

        if (detalle != null) {
            historialEdicionComercioService.registrar(actor, TipoEntidadEdicion.HORARIO, null, comercio.getNombre(),
                    AccionEdicion.EDITAR, detalle);
        }
        return respuesta(comercio.getId(), hoy);
    }

    public HorariosComercioResponseDTO respuesta(Integer comercioId, LocalDate hoy) {
        List<Horario> filas = horarioRepository.findVigentesDesde(comercioId, hoy);
        List<HorarioResponseDTO> vigentes = DisponibilidadComercioService.vigentesEn(filas, hoy).stream()
                .map(HorarioResponseDTO::de).toList();
        List<Horario> pendientes = filas.stream().filter(fila -> fila.getVigenteDesde().isAfter(hoy)).toList();
        LocalDate rigeDesde = pendientes.stream().map(Horario::getVigenteDesde).min(Comparator.naturalOrder()).orElse(null);
        return new HorariosComercioResponseDTO(vigentes, pendientes.stream().map(HorarioResponseDTO::de).toList(), rigeDesde);
    }

    private static void validarColaDelTurnoDeHoy(List<Horario> base, List<HorarioRequestDTO> nuevos, LocalDate hoy) {
        var diaDeHoy = com.bajonea.backend.enums.DiaSemana.values()[hoy.getDayOfWeek().getValue() - 1];
        var diaDeManiana = com.bajonea.backend.enums.DiaSemana.values()[hoy.plusDays(1).getDayOfWeek().getValue() - 1];
        for (Horario turno : base) {
            if (turno.getDiaSemana() != diaDeHoy || !DisponibilidadComercioService.cruzaMedianoche(turno)
                    || turno.getHoraCierre().toSecondOfDay() == 0) {
                continue;
            }
            for (HorarioRequestDTO franja : nuevos) {
                if (franja.getDiaSemana() == diaDeManiana
                        && franja.getHoraApertura().isBefore(turno.getHoraCierre())) {
                    throw new ValidacionException(String.format(
                            "Tu turno de hoy (%s de %s a %s) termina %s a las %s y se superpone con la franja del %s "
                                    + "de %s a %s. Movela para que empiece después de las %s.",
                            ValidadorHorarios.nombreDia(diaDeHoy), ValidadorHorarios.hora(turno.getHoraApertura()),
                            ValidadorHorarios.hora(turno.getHoraCierre()), conArticulo(diaDeManiana),
                            ValidadorHorarios.hora(turno.getHoraCierre()), ValidadorHorarios.nombreDia(diaDeManiana),
                            ValidadorHorarios.hora(franja.getHoraApertura()), ValidadorHorarios.hora(franja.getHoraCierre()),
                            ValidadorHorarios.hora(turno.getHoraCierre())));
                }
            }
        }
    }

    private static String conArticulo(com.bajonea.backend.enums.DiaSemana dia) {
        return "el " + ValidadorHorarios.nombreDia(dia);
    }

    private static List<FranjaOrdenable> franjas(List<Horario> filas) {
        return filas.stream()
                .map(fila -> new FranjaOrdenable(fila.getDiaSemana(), ComercioTextoLegible.aMinutos(fila.getHoraApertura()),
                        ComercioTextoLegible.aMinutos(fila.getHoraCierre())))
                .sorted(FranjaOrdenable.ORDEN)
                .toList();
    }

    private static List<FranjaOrdenable> franjasNuevas(List<HorarioRequestDTO> nuevos) {
        return nuevos.stream()
                .map(franja -> new FranjaOrdenable(franja.getDiaSemana(),
                        ComercioTextoLegible.aMinutos(franja.getHoraApertura()),
                        ComercioTextoLegible.aMinutos(franja.getHoraCierre())))
                .sorted(FranjaOrdenable.ORDEN)
                .toList();
    }
}
