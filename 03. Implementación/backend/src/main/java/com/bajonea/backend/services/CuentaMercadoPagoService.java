package com.bajonea.backend.services;

import com.bajonea.backend.entities.CuentaMercadoPago;
import com.bajonea.backend.entities.Dueno;
import com.bajonea.backend.exceptions.RecursoNoEncontradoException;
import com.bajonea.backend.repositories.CuentaMercadoPagoRepository;
import com.bajonea.backend.repositories.DuenoRepository;
import java.time.LocalDateTime;
import java.util.Optional;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Persistencia de la vinculación OAuth de un Dueño con su cuenta de MercadoPago. El intercambio
 * real del flujo {@code authorization_code} + PKCE contra la API de MercadoPago (obtención de
 * {@code access_token}/{@code refresh_token}) es responsabilidad de una sesión futura — este
 * Service solo guarda y lee lo que esa capa ya resolvió externamente.
 *
 * <p>{@code cuenta_mercado_pago} tiene {@code UNIQUE KEY} sobre {@code dueno_id}: un Dueño tiene
 * a lo sumo una fila en toda su vida, nunca una por vinculación. {@link #vincular} actualiza la
 * fila existente en vez de crear una nueva si el Dueño ya había vinculado (y eventualmente
 * desvinculado) una cuenta antes.
 */
@Service
@RequiredArgsConstructor
@Transactional
public class CuentaMercadoPagoService {

    private final CuentaMercadoPagoRepository cuentaMercadoPagoRepository;
    private final DuenoRepository duenoRepository;

    public CuentaMercadoPago obtenerActivaPorDueno(Integer duenoId) {
        return cuentaMercadoPagoRepository.findByDuenoIdAndActivaTrue(duenoId)
                .orElseThrow(() -> new RecursoNoEncontradoException(
                        "El comercio no tiene ninguna cuenta de MercadoPago vinculada"));
    }

    public Optional<CuentaMercadoPago> buscarActivaPorDueno(Integer duenoId) {
        return cuentaMercadoPagoRepository.findByDuenoIdAndActivaTrue(duenoId);
    }

    public CuentaMercadoPago vincular(Integer duenoId, String mpUserId, String accessToken, String refreshToken,
            String publicKey, boolean esCuentaPrueba, LocalDateTime tokenExpira) {
        Dueno dueno = duenoRepository.findById(duenoId)
                .orElseThrow(() -> new RecursoNoEncontradoException("Dueño no encontrado"));

        CuentaMercadoPago cuenta = cuentaMercadoPagoRepository.findByDuenoId(duenoId).orElse(null);
        if (cuenta == null) {
            cuenta = CuentaMercadoPago.builder()
                    .dueno(dueno)
                    .fechaVinculacion(LocalDateTime.now())
                    .build();
        } else {
            cuenta.setFechaVinculacion(LocalDateTime.now());
            cuenta.setFechaDesvinculacion(null);
        }

        cuenta.setMpUserId(mpUserId);
        cuenta.setAccessToken(accessToken);
        cuenta.setRefreshToken(refreshToken);
        cuenta.setPublicKey(publicKey);
        cuenta.setEsCuentaPrueba(esCuentaPrueba);
        cuenta.setActiva(true);
        cuenta.setTokenExpira(tokenExpira);

        return cuentaMercadoPagoRepository.save(cuenta);
    }

    public void desvincular(Integer duenoId) {
        CuentaMercadoPago cuenta = obtenerActivaPorDueno(duenoId);
        cuenta.setActiva(false);
        cuenta.setFechaDesvinculacion(LocalDateTime.now());
        cuentaMercadoPagoRepository.save(cuenta);
    }
}
