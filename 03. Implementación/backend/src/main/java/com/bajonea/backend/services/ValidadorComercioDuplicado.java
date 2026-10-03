package com.bajonea.backend.services;

import com.bajonea.backend.dto.request.DireccionRequestDTO;
import com.bajonea.backend.entities.Comercio;
import com.bajonea.backend.entities.Direccion;
import com.bajonea.backend.enums.EstadoComercio;
import com.bajonea.backend.exceptions.ConflictoDeNegocioException;
import com.bajonea.backend.repositories.DireccionRepository;
import com.bajonea.backend.util.TextoUtils;
import java.util.EnumSet;
import java.util.Set;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

/**
 * Un Dueño no puede tener dos comercios con el mismo nombre en la misma dirección (nombre, calle, número,
 * piso/depto y localidad normalizados; el código postal no cuenta). Un comercio {@code RECHAZADO} no cuenta
 * como duplicado ({@link #ESTADOS_EXCLUIDOS_DEL_DUPLICADO}: el Dueño puede dar de alta otro igual en lugar
 * de corregirlo); cualquier otro estado sí, incluido {@code RECHAZO_DEFINITIVO}. La corrección de un comercio
 * rechazado pasa su propio id en {@code excluirComercioId} para no compararse consigo mismo, pero sí
 * se compara con todos los demás comercios del Dueño.
 */
@Component
@RequiredArgsConstructor
public class ValidadorComercioDuplicado {

    static final Set<EstadoComercio> ESTADOS_EXCLUIDOS_DEL_DUPLICADO = EnumSet.of(EstadoComercio.RECHAZADO);

    static final String MENSAJE_DUPLICADO =
            "Ya tenés un comercio con ese nombre en esa dirección. Si es otro local del mismo edificio, agregá el piso o número de local.";

    private final DireccionRepository direccionRepository;

    /**
     * @param excluirComercioId comercio del Dueño que no se compara (el que se está corrigiendo), o
     *                          {@code null} si es un alta
     */
    public void validar(Integer duenoId, String nombreComercio, DireccionRequestDTO nueva, Integer excluirComercioId) {
        String nombre = TextoUtils.normalizarParaComparar(nombreComercio);
        String calle = TextoUtils.normalizarParaComparar(nueva.getCalle());
        String numero = recortar(nueva.getNumero());
        String pisoDepto = TextoUtils.normalizarParaComparar(nueva.getPisoDepto());
        String localidadId = recortar(nueva.getLocalidadId());

        for (Direccion existente : direccionRepository.findByDuenoIdConComercioYLocalidad(duenoId)) {
            Comercio comercio = existente.getComercio();
            if (excluirComercioId != null && excluirComercioId.equals(comercio.getId())) {
                continue;
            }
            if (ESTADOS_EXCLUIDOS_DEL_DUPLICADO.contains(comercio.getEstado())) {
                continue;
            }
            boolean mismoNombre = nombre.equals(TextoUtils.normalizarParaComparar(comercio.getNombre()));
            boolean mismaDireccion = calle.equals(TextoUtils.normalizarParaComparar(existente.getCalle()))
                    && numero.equals(recortar(existente.getNumero()))
                    && pisoDepto.equals(TextoUtils.normalizarParaComparar(existente.getPisoDepto()))
                    && localidadId.equals(existente.getLocalidad().getId());
            if (mismoNombre && mismaDireccion) {
                throw new ConflictoDeNegocioException(MENSAJE_DUPLICADO);
            }
        }
    }

    private static String recortar(String valor) {
        return valor == null ? "" : valor.trim();
    }
}
