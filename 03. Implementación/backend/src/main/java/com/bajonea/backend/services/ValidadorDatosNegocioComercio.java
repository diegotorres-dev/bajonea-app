package com.bajonea.backend.services;

import com.bajonea.backend.dto.request.DatosNegocioComercioRequestDTO;
import com.bajonea.backend.dto.request.HorarioRequestDTO;
import com.bajonea.backend.dto.request.RedSocialRequestDTO;
import com.bajonea.backend.entities.Localidad;
import com.bajonea.backend.exceptions.RecursoNoEncontradoException;
import com.bajonea.backend.exceptions.ValidacionCamposException;
import com.bajonea.backend.exceptions.ValidacionException;
import com.bajonea.backend.repositories.LocalidadRepository;
import com.bajonea.backend.util.ComercioTextoLegible;
import com.bajonea.backend.util.ComercioValidaciones;
import java.util.List;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

/**
 * Reglas de negocio de los datos del negocio de un comercio que no se pueden expresar como anotación de
 * Bean Validation (dependen de más de un campo o de la base): superposición de horarios, redes sociales
 * repetidas, al menos una modalidad de entrega y localidad existente. Las comparten el registro de un
 * comercio, el alta de un comercio adicional y la corrección de un comercio rechazado, así que el mensaje
 * y el orden de las validaciones son los mismos en los tres.
 */
@Component
@RequiredArgsConstructor
public class ValidadorDatosNegocioComercio {

    static final String CAMPO_LOCALIDAD = "direccion.localidadId";

    static final String MENSAJE_LOCALIDAD_NO_HABILITADA = "Esa localidad todavía no está disponible";

    private final LocalidadRepository localidadRepository;

    private final LocalidadesHabilitadas localidadesHabilitadas;

    /**
     * Valida los datos del negocio y devuelve la {@link Localidad} de la dirección.
     */
    public Localidad validar(DatosNegocioComercioRequestDTO datos) {
        validarHorarios(datos.getHorarios());
        validarRedesSociales(datos.getRedesSociales());
        ComercioValidaciones.validarModalidadesEntrega(datos.isAceptaDelivery(), datos.isAceptaRetiro());
        return obtenerLocalidad(datos.getDireccion().getLocalidadId());
    }

    /**
     * La localidad tiene que existir ({@code 404} si no) y estar entre las habilitadas ({@code 400} con el error
     * por campo si existe pero no lo está): lo usan el registro de Cliente, el alta por invitación, el registro
     * de Comercio, el alta adicional y la corrección de un rechazado.
     */
    public Localidad obtenerLocalidad(String localidadId) {
        Localidad localidad = localidadRepository.findById(localidadId)
                .orElseThrow(() -> new RecursoNoEncontradoException("La localidad indicada no existe"));
        if (!localidadesHabilitadas.contiene(localidad.getId())) {
            throw new ValidacionCamposException(Map.of(CAMPO_LOCALIDAD, MENSAJE_LOCALIDAD_NO_HABILITADA));
        }
        return localidad;
    }

    /** {@code true} si la localidad existe pero no está habilitada; una inexistente la resuelve {@link #obtenerLocalidad}. */
    public boolean esLocalidadExistenteNoHabilitada(String localidadId) {
        return localidadId != null && !localidadesHabilitadas.contiene(localidadId) && localidadRepository.existsById(localidadId);
    }

    private void validarRedesSociales(List<RedSocialRequestDTO> redesSociales) {
        long tiposUnicos = redesSociales.stream().map(RedSocialRequestDTO::getTipo).distinct().count();
        if (tiposUnicos != redesSociales.size()) {
            throw new ValidacionException("No podés cargar dos redes sociales del mismo tipo");
        }
    }

    private void validarHorarios(List<HorarioRequestDTO> horarios) {
        for (HorarioRequestDTO horario : horarios) {
            if (!horario.getHoraCierre().isAfter(horario.getHoraApertura())) {
                throw new ValidacionException("La hora de cierre debe ser posterior a la hora de apertura");
            }
        }
        for (int i = 0; i < horarios.size(); i++) {
            HorarioRequestDTO actual = horarios.get(i);
            for (int j = i + 1; j < horarios.size(); j++) {
                HorarioRequestDTO otro = horarios.get(j);
                if (actual.getDiaSemana() != otro.getDiaSemana()) {
                    continue;
                }
                boolean seSuperponen = actual.getHoraApertura().isBefore(otro.getHoraCierre())
                        && otro.getHoraApertura().isBefore(actual.getHoraCierre());
                if (seSuperponen) {
                    throw new ValidacionException(String.format(
                            "Ya tenés un horario cargado el %s de %s a %s, que se superpone con este",
                            ComercioTextoLegible.etiquetaDia(otro.getDiaSemana()), otro.getHoraApertura(), otro.getHoraCierre()));
                }
            }
        }
    }
}
