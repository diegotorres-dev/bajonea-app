package com.bajonea.backend.config.security;

import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.util.Base64;
import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * Cifra/descifra {@code CuentaMercadoPago.accessToken}/{@code refreshToken} a nivel de columna
 * (AES-256-GCM, IV aleatorio de 12 bytes por valor, prefijado al texto cifrado antes de
 * Base64). {@code autoApply = false} a propósito — este converter es exclusivo de esos dos
 * campos vía {@code @Convert} explícito, nunca global (no debe tocar ningún otro String del
 * proyecto). La clave sale de {@code mercadopago.token-encryption-key}
 * ({@code MERCADOPAGO_TOKEN_ENCRYPTION_KEY}), sin default en el perfil de producción (falla al
 * arrancar si falta, mismo criterio que {@code MYSQLUSER}/{@code MYSQLPASSWORD}); en dev/test
 * queda con default vacío (arranca igual, mismo criterio que Cloudinary/Resend) pero cualquier
 * intento real de cifrar/descifrar sin la clave configurada revienta con
 * {@link IllegalStateException} explícito — nunca hay un fallback silencioso. Ver
 * docs/DECISIONES.md.
 */
@Converter(autoApply = false)
@Component
public class MercadoPagoTokenConverter implements AttributeConverter<String, String> {

    private static final String TRANSFORMACION_AES = "AES/GCM/NoPadding";
    private static final int TAMANIO_IV_BYTES = 12;
    private static final int TAMANIO_TAG_BITS = 128;

    private final SecretKeySpec claveAes;

    public MercadoPagoTokenConverter(@Value("${mercadopago.token-encryption-key:}") String claveConfigurada) {
        this.claveAes = claveConfigurada.isBlank() ? null : derivarClaveAes256(claveConfigurada);
    }

    @Override
    public String convertToDatabaseColumn(String valorPlano) {
        if (valorPlano == null) {
            return null;
        }
        requerirClaveConfigurada();
        try {
            byte[] iv = new byte[TAMANIO_IV_BYTES];
            new SecureRandom().nextBytes(iv);

            Cipher cipher = Cipher.getInstance(TRANSFORMACION_AES);
            cipher.init(Cipher.ENCRYPT_MODE, claveAes, new GCMParameterSpec(TAMANIO_TAG_BITS, iv));
            byte[] textoCifrado = cipher.doFinal(valorPlano.getBytes(StandardCharsets.UTF_8));

            byte[] ivMasTextoCifrado = new byte[iv.length + textoCifrado.length];
            System.arraycopy(iv, 0, ivMasTextoCifrado, 0, iv.length);
            System.arraycopy(textoCifrado, 0, ivMasTextoCifrado, iv.length, textoCifrado.length);

            return Base64.getEncoder().encodeToString(ivMasTextoCifrado);
        } catch (Exception e) {
            throw new IllegalStateException("No se pudo cifrar el valor antes de persistirlo", e);
        }
    }

    @Override
    public String convertToEntityAttribute(String valorCifradoBase64) {
        if (valorCifradoBase64 == null) {
            return null;
        }
        requerirClaveConfigurada();
        try {
            byte[] ivMasTextoCifrado = Base64.getDecoder().decode(valorCifradoBase64);

            byte[] iv = new byte[TAMANIO_IV_BYTES];
            byte[] textoCifrado = new byte[ivMasTextoCifrado.length - TAMANIO_IV_BYTES];
            System.arraycopy(ivMasTextoCifrado, 0, iv, 0, TAMANIO_IV_BYTES);
            System.arraycopy(ivMasTextoCifrado, TAMANIO_IV_BYTES, textoCifrado, 0, textoCifrado.length);

            Cipher cipher = Cipher.getInstance(TRANSFORMACION_AES);
            cipher.init(Cipher.DECRYPT_MODE, claveAes, new GCMParameterSpec(TAMANIO_TAG_BITS, iv));
            byte[] textoPlano = cipher.doFinal(textoCifrado);

            return new String(textoPlano, StandardCharsets.UTF_8);
        } catch (Exception e) {
            throw new IllegalStateException("No se pudo descifrar el valor leído de la base", e);
        }
    }

    private void requerirClaveConfigurada() {
        if (claveAes == null) {
            throw new IllegalStateException(
                    "MERCADOPAGO_TOKEN_ENCRYPTION_KEY no está configurada — no se puede cifrar ni descifrar "
                            + "access_token/refresh_token de CuentaMercadoPago. Configurar la variable de entorno "
                            + "antes de vincular o leer una cuenta de MercadoPago.");
        }
    }

    private static SecretKeySpec derivarClaveAes256(String claveConfigurada) {
        try {
            MessageDigest sha256 = MessageDigest.getInstance("SHA-256");
            byte[] claveDerivada = sha256.digest(claveConfigurada.getBytes(StandardCharsets.UTF_8));
            return new SecretKeySpec(claveDerivada, "AES");
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 no disponible en este JDK", e);
        }
    }
}
