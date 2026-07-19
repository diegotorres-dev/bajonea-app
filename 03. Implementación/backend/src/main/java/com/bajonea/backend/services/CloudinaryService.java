package com.bajonea.backend.services;

import com.bajonea.backend.dto.response.CloudinarySignatureResponseDTO;
import com.bajonea.backend.exceptions.ConflictoDeNegocioException;
import com.bajonea.backend.repositories.ImagenProductoRepository;
import com.cloudinary.Cloudinary;
import java.util.HashMap;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

/**
 * Genera firmas de subida directa a Cloudinary (el backend nunca recibe el binario). El
 * límite de 5 imágenes por producto se valida acá, antes de firmar, para no dejar que
 * Cloudinary reciba un archivo que después se descarta — ver
 * {@code ProductoService.agregarImagen} para la segunda validación (al persistir), que
 * cubre el caso de que dos firmas se pidan casi en simultáneo.
 */
@Service
@RequiredArgsConstructor
public class CloudinaryService {

    private static final int MAX_IMAGENES_POR_PRODUCTO = 5;

    private final Cloudinary cloudinary;
    private final ImagenProductoRepository imagenProductoRepository;

    @Value("${cloudinary.cloud-name}")
    private String cloudName;

    @Value("${cloudinary.api-key}")
    private String apiKey;

    public CloudinarySignatureResponseDTO generarFirmaImagenProducto(Integer comercioId, Integer productoId) {
        long yaExistentes = imagenProductoRepository.countByProductoId(productoId);
        if (yaExistentes >= MAX_IMAGENES_POR_PRODUCTO) {
            throw new ConflictoDeNegocioException(
                    "El producto ya tiene el máximo de " + MAX_IMAGENES_POR_PRODUCTO + " imágenes");
        }
        return firmar("productos/" + comercioId + "/" + productoId + "/");
    }

    public CloudinarySignatureResponseDTO generarFirmaFotoPerfilComercio(Integer comercioId) {
        return firmar("comercios/" + comercioId + "/perfil/");
    }

    private CloudinarySignatureResponseDTO firmar(String folder) {
        long timestamp = System.currentTimeMillis() / 1000;
        Map<String, Object> paramsToSign = new HashMap<>();
        paramsToSign.put("timestamp", timestamp);
        paramsToSign.put("folder", folder);

        String signature = cloudinary.apiSignRequest(paramsToSign, cloudinary.config.apiSecret, cloudinary.config.signatureVersion);

        return new CloudinarySignatureResponseDTO(signature, timestamp, apiKey, cloudName, folder);
    }
}
