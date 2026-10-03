package com.bajonea.backend.services;

import com.bajonea.backend.entities.CuentaMercadoPago;
import com.bajonea.backend.entities.Dueno;
import com.bajonea.backend.exceptions.CuentaMercadoPagoEnUsoException;
import com.bajonea.backend.exceptions.CuentaMercadoPagoYaVinculadaException;
import com.bajonea.backend.exceptions.RecursoNoEncontradoException;
import com.bajonea.backend.repositories.CuentaMercadoPagoRepository;
import com.bajonea.backend.repositories.DuenoRepository;
import java.time.LocalDateTime;
import java.util.Optional;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DataIntegrityViolationException;
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

    public static final String MENSAJE_SIN_CUENTA = "El Dueño no tiene ninguna cuenta de Mercado Pago vinculada";
    private static final String INDICE_UNICO_CUENTA_ACTIVA = "uq_cuenta_mp_user_id_activo";

    private final CuentaMercadoPagoRepository cuentaMercadoPagoRepository;
    private final DuenoRepository duenoRepository;

    public CuentaMercadoPago obtenerActivaPorDueno(Integer duenoId) {
        return cuentaMercadoPagoRepository.findByDuenoIdAndActivaTrue(duenoId)
                .orElseThrow(() -> new RecursoNoEncontradoException(MENSAJE_SIN_CUENTA));
    }

    public Optional<CuentaMercadoPago> buscarActivaPorDueno(Integer duenoId) {
        return cuentaMercadoPagoRepository.findByDuenoIdAndActivaTrue(duenoId);
    }

    /**
     * La cuenta activa del Dueño leída con {@code SELECT ... FOR UPDATE}: primer paso del orden de bloqueo de
     * la desvinculación (cuenta, después comercios, después pedidos). Con el mismo {@code 404} que
     * {@link #obtenerActivaPorDueno} si no hay cuenta o está inactiva.
     */
    public CuentaMercadoPago obtenerActivaConBloqueo(Integer duenoId) {
        return cuentaMercadoPagoRepository.findByDuenoIdConBloqueo(duenoId)
                .filter(CuentaMercadoPago::isActiva)
                .orElseThrow(() -> new RecursoNoEncontradoException(MENSAJE_SIN_CUENTA));
    }

    /**
     * Si el Dueño tiene una cuenta activa, leyéndola con {@code SELECT ... FOR UPDATE}: hasta que la
     * transacción del llamador termine, una vinculación o desvinculación concurrente del mismo Dueño
     * espera (con la fila existente, o con el hueco del índice único si todavía no hay fila). Para
     * decisiones que dependen de ese dato y se escriben en la misma transacción — hoy, la aprobación de
     * un comercio ({@code APROBADO} vs {@code APTO_VENTA}). Tiene que llamarse antes de escribir
     * cualquier fila de {@code comercio}: el orden de bloqueo es siempre cuenta, después comercio.
     */
    public boolean existeActivaConBloqueo(Integer duenoId) {
        return cuentaMercadoPagoRepository.findByDuenoIdConBloqueo(duenoId)
                .map(CuentaMercadoPago::isActiva)
                .orElse(false);
    }

    /**
     * Vincula (o refresca) la cuenta de Mercado Pago del Dueño. Reglas, validadas antes de escribir: un Dueño
     * tiene una sola cuenta activa (volver a vincular la misma es idempotente y refresca los datos; otra
     * distinta exige desvincular antes) y una misma cuenta no puede estar activa en dos Dueños a la vez (la
     * libera la desvinculación). Si una carrera se cuela entre la validación y el guardado, el índice único
     * de {@code mp_user_id_activo} la rechaza y se traduce a la misma excepción de cuenta en uso.
     */
    public CuentaMercadoPago vincular(Integer duenoId, String mpUserId, String accessToken, String refreshToken,
            String publicKey, boolean esCuentaPrueba, LocalDateTime tokenExpira) {
        Dueno dueno = duenoRepository.findById(duenoId)
                .orElseThrow(() -> new RecursoNoEncontradoException("Dueño no encontrado"));

        CuentaMercadoPago cuenta = cuentaMercadoPagoRepository.findByDuenoId(duenoId).orElse(null);
        if (cuenta != null && cuenta.isActiva() && !mpUserId.equals(cuenta.getMpUserId())) {
            throw new CuentaMercadoPagoYaVinculadaException();
        }
        cuentaMercadoPagoRepository.findByMpUserIdAndActivaTrue(mpUserId)
                .filter(otra -> !otra.getDueno().getId().equals(duenoId))
                .ifPresent(otra -> {
                    throw new CuentaMercadoPagoEnUsoException();
                });

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

        // saveAndFlush, no save: el INSERT/UPDATE de la cuenta tiene que ejecutarse ya, antes de que
        // el llamador bloquee los comercios del Dueño (ComercioService.activarAptoVenta). Con save() un
        // UPDATE sobre una cuenta ya existente se difiere hasta el commit, o sea después del bloqueo de
        // comercios, y eso invierte el orden cuenta -> comercio que respeta la aprobación de un comercio
        // (deadlock real, reproducido con el estrés de docs/APRENDIZAJES-TECNICOS.md).
        try {
            return cuentaMercadoPagoRepository.saveAndFlush(cuenta);
        } catch (DataIntegrityViolationException ex) {
            if (String.valueOf(ex.getMostSpecificCause().getMessage()).contains(INDICE_UNICO_CUENTA_ACTIVA)) {
                throw new CuentaMercadoPagoEnUsoException();
            }
            throw ex;
        }
    }

    /**
     * Marca la cuenta como inactiva y libera su {@code mp_user_id} para otro Dueño. Los tokens quedan guardados
     * (no se borran). {@code saveAndFlush} por la misma razón que en {@link #vincular}.
     */
    public void desvincular(CuentaMercadoPago cuenta) {
        cuenta.setActiva(false);
        cuenta.setFechaDesvinculacion(LocalDateTime.now());
        cuentaMercadoPagoRepository.saveAndFlush(cuenta);
    }
}
