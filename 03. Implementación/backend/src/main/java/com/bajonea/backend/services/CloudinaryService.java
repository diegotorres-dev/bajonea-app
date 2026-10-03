package com.bajonea.backend.services;

import com.bajonea.backend.dto.response.CloudinarySignatureResponseDTO;
import com.bajonea.backend.exceptions.ConflictoDeNegocioException;
import com.bajonea.backend.exceptions.ValidacionException;
import com.bajonea.backend.repositories.ImagenProductoRepository;
import com.cloudinary.Cloudinary;
import java.util.HashMap;
import java.util.Map;
import java.util.regex.Pattern;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

/**
 * Genera firmas de subida directa a Cloudinary (el backend nunca recibe el binario). El
 * límite de 5 imágenes por producto se valida acá, antes de firmar, para no dejar que
 * Cloudinary reciba un archivo que después se descarta — ver
 * {@code ProductoService.agregarImagen} para la segunda validación (al persistir), que
 * cubre el caso de que dos firmas se pidan casi en simultáneo.
 * <p>
 * Formato/tamaño de archivo y compresión automática van vía un Upload Preset
 * ({@code bajonea_imagenes_mvp}, creado manualmente en el dashboard de Cloudinary, no por
 * código), no como Bean Validation en un DTO — el backend nunca recibe el binario, así que
 * no hay nada que un {@code @Pattern}/anotación custom pueda inspeccionar del archivo en
 * sí, y {@code max_file_size} no es un parámetro válido de un signed upload directo
 * (verificado empíricamente: Cloudinary lo excluye de su propio cálculo de firma y lo
 * ignora silenciosamente si se manda suelto — solo se puede aplicar vía preset). El preset
 * queda configurado con:
 * <ul>
 *   <li>{@code allowed_formats}: {@code jpg,jpeg,png,webp}</li>
 *   <li>{@code max_file_size}: 5242880 bytes (5MB)</li>
 *   <li>Transformación entrante (no {@code eager}, para que el archivo efectivamente
 *       guardado sea el liviano): ancho máx. 1200px, {@code crop: limit} (nunca agranda),
 *       {@code quality: auto}</li>
 * </ul>
 * Compartido entre los flujos de galería de producto, foto de perfil de comercio ya
 * aprobado, foto de perfil de Usuario (Cliente/Administrador, con vista a Dueño/Empleado a
 * futuro) y foto de perfil en el momento del registro (Comercio o Cliente): mismas
 * restricciones para todos, sin razón de negocio para que difieran — un solo preset, no
 * varios. {@code folder} sigue siendo dinámico por request (no vive en el preset). Ver
 * docs/DECISIONES.md, entrada de esta mejora puntual sobre la Fase 11 ya cerrada.
 * <p>
 * {@code generarFirmaFotoPerfilRegistro}/{@code generarFirmaFotoPerfilRegistroCliente} son
 * las únicas firmas sin {@code comercioId}/{@code productoId}/{@code usuarioId} real detrás
 * (el comercio o el usuario todavía no existen al momento del registro) — firman a una
 * carpeta fija de pre-registro en vez de una carpeta scoped por id. No hace falta mover/
 * renombrar el asset después de crear el registro: la URL ya persistida queda con esa
 * carpeta en el nombre para siempre, sin efecto funcional (es solo organización dentro de
 * Cloudinary). Al ser públicas (sin JWT), van protegidas por
 * {@code RateLimitFotoRegistroFilter} — ver esa clase.
 */
@Service
@RequiredArgsConstructor
public class CloudinaryService {

    private static final int MAX_IMAGENES_POR_PRODUCTO = 5;

    private static final String UPLOAD_PRESET = "bajonea_imagenes_mvp";

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

    public CloudinarySignatureResponseDTO generarFirmaRecorteImagen(Integer comercioId, Integer productoId) {
        return firmar("productos/" + comercioId + "/" + productoId + "/");
    }

    public CloudinarySignatureResponseDTO generarFirmaFotoPerfilComercio(Integer comercioId) {
        return firmar("comercios/" + comercioId + "/perfil/");
    }

    public CloudinarySignatureResponseDTO generarFirmaFotoPerfilRegistro() {
        return firmar("comercios/pre-registro/");
    }

    public CloudinarySignatureResponseDTO generarFirmaFotoPerfilUsuario(Integer usuarioId) {
        return firmar("usuarios/" + usuarioId + "/perfil/");
    }

    public CloudinarySignatureResponseDTO generarFirmaFotoPerfilRegistroCliente() {
        return firmar("usuarios/pre-registro/");
    }

    public CloudinarySignatureResponseDTO generarFirmaFotoNuevoComercio(Integer duenoId) {
        return firmar(carpetaFotoNuevoComercio(duenoId));
    }

    /**
     * La URL tiene que ser una imagen de esta cuenta de Cloudinary
     * ({@code https://res.cloudinary.com/{cloudName}/image/upload/}) y estar dentro de
     * {@code duenos/{duenoId}/comercios-nuevos/} (con o sin el segmento de versión {@code v123/}). Solo
     * estas firmas escriben en esa carpeta, así que evita que un Dueño use una imagen de otro Dueño, del
     * pre-registro o de un producto como foto de su comercio. {@code ValidarUrlCloudinary} en el DTO
     * solo mira el dominio; esto agrega cuenta y carpeta.
     */
    public void validarFotoNuevoComercio(Integer duenoId, String url) {
        validarUrlEnCarpeta(carpetaFotoNuevoComercio(duenoId), url);
    }

    /**
     * Igual que {@link #validarFotoNuevoComercio}, pero para una foto subida con la firma de
     * {@link #generarFirmaFotoPerfilComercio}: tiene que estar dentro de {@code comercios/{comercioId}/perfil/}.
     * Lo usa la corrección de un comercio rechazado, que cambia la foto sin pasar por
     * {@code PUT /comercios/perfil/foto}.
     */
    public void validarFotoPerfilComercio(Integer comercioId, String url) {
        validarUrlEnCarpeta("comercios/" + comercioId + "/perfil/", url);
    }

    private void validarUrlEnCarpeta(String carpetaEsperada, String url) {
        String prefijo = "https://res.cloudinary.com/" + cloudName + "/image/upload/";
        if (url == null || !url.startsWith(prefijo)) {
            throw new ValidacionException("La foto de perfil no es válida. Subila de nuevo desde el formulario.");
        }
        String resto = url.substring(prefijo.length());
        Pattern carpeta = Pattern.compile("^(v\\d+/)?" + Pattern.quote(carpetaEsperada) + "[^/]+$");
        if (!carpeta.matcher(resto).matches()) {
            throw new ValidacionException("La foto de perfil no es válida. Subila de nuevo desde el formulario.");
        }
    }

    private String carpetaFotoNuevoComercio(Integer duenoId) {
        return "duenos/" + duenoId + "/comercios-nuevos/";
    }

    private CloudinarySignatureResponseDTO firmar(String folder) {
        long timestamp = System.currentTimeMillis() / 1000;
        Map<String, Object> paramsToSign = new HashMap<>();
        paramsToSign.put("timestamp", timestamp);
        paramsToSign.put("folder", folder);
        paramsToSign.put("upload_preset", UPLOAD_PRESET);

        String signature = cloudinary.apiSignRequest(paramsToSign, cloudinary.config.apiSecret, cloudinary.config.signatureVersion);

        return new CloudinarySignatureResponseDTO(signature, timestamp, apiKey, cloudName, folder, UPLOAD_PRESET);
    }
}
