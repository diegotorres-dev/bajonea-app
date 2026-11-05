package com.bajonea.backend.services;

import com.bajonea.backend.config.ReclamoFotosProperties;
import com.bajonea.backend.dto.response.ReclamoAdminResponseDTO;
import com.bajonea.backend.entities.ReclamoFoto;
import com.bajonea.backend.entities.ReclamoFotoArchivo;
import com.bajonea.backend.exceptions.RecursoNoEncontradoException;
import com.bajonea.backend.exceptions.ValidacionFotoReclamoException;
import com.bajonea.backend.repositories.ReclamoFotoArchivoRepository;
import com.bajonea.backend.repositories.ReclamoFotoRepository;
import com.bajonea.backend.util.FirmaArchivo;
import com.bajonea.backend.util.TamanoLegible;
import java.io.IOException;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

/**
 * Las fotos que el Cliente adjunta al crear un reclamo. {@link #validar} revisa cantidad, tamaño y formato (por la firma de
 * bytes, nunca por la extensión ni por el tipo que declara el cliente) y lee los bytes antes de abrir ninguna transacción:
 * una foto inválida rechaza todo el envío sin tocar la base. {@link #guardar} corre dentro de la transacción del reclamo y
 * los inserta como hojas después de {@code reclamo}. Nada se borra nunca. Solo el Administrador las lee.
 */
@Service
@RequiredArgsConstructor
public class ReclamoFotoService {

    private static final String MENSAJE_FORMATO = "Solo se aceptan fotos en formato JPG, PNG o WebP";
    private static final String MENSAJE_HEIC = "Las fotos HEIC de iPhone no se pueden adjuntar. Usá una foto en formato JPG, PNG o WebP";
    private static final long MARGEN_REDONDEO_BYTES = 52_428;
    private static final String MENSAJE_NO_ENCONTRADA = "Foto no encontrada";

    public record FotoValidada(String nombre, String tipoContenido, byte[] contenido) {
    }

    public record FotoDescargable(String nombre, String tipoContenido, byte[] contenido) {
    }

    private final ReclamoFotosProperties properties;
    private final ReclamoFotoRepository fotoRepository;
    private final ReclamoFotoArchivoRepository archivoRepository;

    public List<FotoValidada> validar(List<MultipartFile> recibidas) {
        List<MultipartFile> fotos = new ArrayList<>();
        if (recibidas != null) {
            for (MultipartFile foto : recibidas) {
                boolean parteVacia = foto == null || (foto.isEmpty() && (foto.getOriginalFilename() == null || foto.getOriginalFilename().isBlank()));
                if (!parteVacia) {
                    fotos.add(foto);
                }
            }
        }
        if (fotos.size() > properties.getMaxCantidad()) {
            throw new ValidacionFotoReclamoException(ValidacionFotoReclamoException.CANTIDAD_EXCEDIDA,
                    "Podés adjuntar hasta " + properties.getMaxCantidad() + " fotos");
        }
        List<FotoValidada> validadas = new ArrayList<>();
        for (MultipartFile foto : fotos) {
            validadas.add(validarUna(foto));
        }
        return validadas;
    }

    private FotoValidada validarUna(MultipartFile foto) {
        long tamano = foto.getSize();
        if (tamano <= 0) {
            throw new ValidacionFotoReclamoException(ValidacionFotoReclamoException.FORMATO_NO_PERMITIDO, "Una de las fotos está vacía");
        }
        if (tamano > properties.getMaxBytes()) {
            String pesa = TamanoLegible.formatear(tamano);
            String maximo = TamanoLegible.formatear(properties.getMaxBytes());
            boolean redondeaIgual = tamano - properties.getMaxBytes() < MARGEN_REDONDEO_BYTES;
            throw new ValidacionFotoReclamoException(ValidacionFotoReclamoException.TAMANO_EXCEDIDO,
                    redondeaIgual ? "Una foto supera el máximo de " + maximo : "Una foto pesa " + pesa + " y el máximo es " + maximo);
        }
        byte[] contenido;
        try {
            contenido = foto.getBytes();
        } catch (IOException e) {
            throw new ValidacionFotoReclamoException(ValidacionFotoReclamoException.FORMATO_NO_PERMITIDO,
                    "No pudimos leer una de las fotos. Probá de nuevo");
        }
        String tipo = FirmaArchivo.detectarImagen(contenido).orElseThrow(() -> new ValidacionFotoReclamoException(
                ValidacionFotoReclamoException.FORMATO_NO_PERMITIDO, FirmaArchivo.esHeic(contenido) ? MENSAJE_HEIC : MENSAJE_FORMATO));
        return new FotoValidada(nombreSeguro(foto.getOriginalFilename()), tipo, contenido);
    }

    public void guardar(Integer reclamoId, List<FotoValidada> fotos, LocalDateTime ahora) {
        int orden = 1;
        for (FotoValidada foto : fotos) {
            ReclamoFoto guardada = fotoRepository.saveAndFlush(ReclamoFoto.builder()
                    .reclamoId(reclamoId)
                    .orden(orden++)
                    .nombreOriginal(foto.nombre())
                    .tipoContenido(foto.tipoContenido())
                    .tamanoBytes(foto.contenido().length)
                    .fechaCreacion(ahora)
                    .build());
            archivoRepository.saveAndFlush(ReclamoFotoArchivo.builder().id(guardada.getId()).contenido(foto.contenido()).build());
        }
    }

    public Map<Integer, Integer> contarPorReclamo(List<Integer> reclamoIds) {
        Map<Integer, Integer> cantidades = new HashMap<>();
        if (!reclamoIds.isEmpty()) {
            fotoRepository.contarPorReclamo(reclamoIds).forEach(fila -> cantidades.put(fila.getReclamoId(), fila.getCantidad().intValue()));
        }
        return cantidades;
    }

    public List<ReclamoAdminResponseDTO.Foto> listar(Integer reclamoId) {
        return fotoRepository.findByReclamoIdOrderByOrdenAsc(reclamoId).stream()
                .map(f -> new ReclamoAdminResponseDTO.Foto(f.getId(), f.getOrden(), f.getNombreOriginal(), f.getTipoContenido(), f.getTamanoBytes()))
                .toList();
    }

    public FotoDescargable descargar(Integer reclamoId, Integer fotoId) {
        ReclamoFoto foto = fotoRepository.findByIdAndReclamoId(fotoId, reclamoId)
                .orElseThrow(() -> new RecursoNoEncontradoException(MENSAJE_NO_ENCONTRADA));
        ReclamoFotoArchivo archivo = archivoRepository.findById(foto.getId())
                .orElseThrow(() -> new RecursoNoEncontradoException(MENSAJE_NO_ENCONTRADA));
        return new FotoDescargable(foto.getNombreOriginal(), foto.getTipoContenido(), archivo.getContenido());
    }

    private static String nombreSeguro(String original) {
        if (original == null || original.isBlank()) {
            return "foto";
        }
        String base = original.replace('\\', '/');
        base = base.substring(base.lastIndexOf('/') + 1).replaceAll("[\\p{Cntrl}]", "").trim();
        if (base.isEmpty()) {
            return "foto";
        }
        return base.length() > 255 ? base.substring(base.length() - 255) : base;
    }
}
