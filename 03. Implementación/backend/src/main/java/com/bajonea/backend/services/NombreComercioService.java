package com.bajonea.backend.services;

import com.bajonea.backend.dto.response.DisponibilidadNombreComercioResponseDTO;
import com.bajonea.backend.exceptions.ConflictoDeNegocioException;
import com.bajonea.backend.exceptions.RecursoNoEncontradoException;
import com.bajonea.backend.exceptions.ValidacionException;
import com.bajonea.backend.repositories.ComercioNombreRepository;
import com.bajonea.backend.repositories.ComercioRepository;
import java.util.regex.Pattern;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * El nombre de un comercio es único en toda la plataforma: se compara sin mayúsculas, acentos ni espacios de más
 * (la ñ cuenta como n) y cuentan todos los estados salvo {@code RECHAZO_DEFINITIVO}, que libera el nombre; un
 * {@code RECHAZADO} lo retiene. La regla vive en la base (columna generada {@code nombre_unico} y su {@code UNIQUE},
 * V37): este servicio la consulta con la misma expresión para dar el aviso amable antes de escribir, y la
 * violación del índice, si otra transacción gana la carrera, se traduce al mismo {@code 409} en el handler.
 * La corrección y la edición del perfil pasan su propio id en {@code excluirComercioId}.
 */
@Service
@RequiredArgsConstructor
public class NombreComercioService {

    public static final String MENSAJE_NOMBRE_EN_USO = "Ya existe un comercio con ese nombre. Elegí otro.";

    static final int LARGO_MAXIMO = 150;

    private static final Pattern CON_LETRA_O_NUMERO = Pattern.compile(".*[\\p{L}0-9].*", Pattern.DOTALL);

    private final ComercioNombreRepository comercioNombreRepository;
    private final ComercioRepository comercioRepository;

    public boolean estaDisponible(String nombre, Integer excluirComercioId) {
        return !comercioNombreRepository.existe(nombre, excluirComercioId);
    }

    /**
     * Disponibilidad en vivo del nombre, con un único booleano en la respuesta. {@code duenoId} y
     * {@code comercioId} solo se pasan desde el endpoint del Dueño: si el comercio no es suyo es el mismo
     * {@code 404} del resto, para que nadie descubra el nombre de un comercio ajeno por la exclusión.
     */
    @Transactional(readOnly = true)
    public DisponibilidadNombreComercioResponseDTO consultarDisponibilidad(String nombre, Integer duenoId, Integer comercioId) {
        if (comercioId != null && (duenoId == null || comercioRepository.findByIdAndDuenoId(comercioId, duenoId).isEmpty())) {
            throw new RecursoNoEncontradoException("Comercio no encontrado");
        }
        String limpio = nombre == null ? "" : nombre.trim();
        if (limpio.isEmpty()) {
            throw new ValidacionException("El nombre del comercio es obligatorio");
        }
        if (limpio.length() > LARGO_MAXIMO) {
            throw new ValidacionException("El nombre no puede superar los 150 caracteres");
        }
        if (!CON_LETRA_O_NUMERO.matcher(limpio).matches()) {
            throw new ValidacionException("Ingresá un nombre de comercio válido");
        }
        return new DisponibilidadNombreComercioResponseDTO(estaDisponible(limpio, comercioId));
    }

    public void validar(String nombre, Integer excluirComercioId) {
        if (!estaDisponible(nombre, excluirComercioId)) {
            throw new ConflictoDeNegocioException(MENSAJE_NOMBRE_EN_USO);
        }
    }
}
