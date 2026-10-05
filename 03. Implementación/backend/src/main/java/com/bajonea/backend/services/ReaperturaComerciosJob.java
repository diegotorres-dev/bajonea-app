package com.bajonea.backend.services;

import com.bajonea.backend.repositories.ComercioRepository;
import java.time.LocalDateTime;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Job de reapertura automática del cierre manual: cada 60 segundos apaga el cierre de los comercios cuya
 * próxima franja ya empezó. Corre una transacción por comercio ({@link CierreComercioService#reabrirSiVencido}),
 * así que un comercio con problemas no frena a los demás, y se pone al día solo si el backend estuvo caído:
 * cada comercio se evalúa contra el momento de su propio cierre, no contra la última corrida.
 */
@Component
@RequiredArgsConstructor
public class ReaperturaComerciosJob {

    private static final Logger log = LoggerFactory.getLogger(ReaperturaComerciosJob.class);

    private final ComercioRepository comercioRepository;
    private final CierreComercioService cierreComercioService;
    private final DisponibilidadComercioService disponibilidadComercioService;

    @Scheduled(fixedDelay = 60_000)
    public void reabrirComerciosVencidos() {
        reabrirComerciosVencidos(disponibilidadComercioService.ahora());
    }

    /**
     * Devuelve la cantidad de comercios reabiertos. {@code ahora} es el momento contra el que se evalúa y el que
     * se registra en el historial.
     */
    public int reabrirComerciosVencidos(LocalDateTime ahora) {
        List<Integer> comercioIds = comercioRepository.findIdsCerradosManualmente();
        int reabiertos = 0;
        for (Integer comercioId : comercioIds) {
            try {
                if (cierreComercioService.reabrirSiVencido(comercioId, ahora)) {
                    reabiertos++;
                }
            } catch (RuntimeException e) {
                log.error("No se pudo evaluar la reapertura del comercio {}", comercioId, e);
            }
        }
        return reabiertos;
    }
}
