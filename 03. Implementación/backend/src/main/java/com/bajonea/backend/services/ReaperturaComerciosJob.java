package com.bajonea.backend.services;

import com.bajonea.backend.repositories.ComercioRepository;
import java.time.LocalDateTime;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Job de reapertura automática del cierre manual: cada 60 segundos apaga el cierre de los comercios cuya
 * próxima franja ya empezó. Corre una transacción por comercio ({@link CierreComercioService#reabrirSiVencido}),
 * así que un comercio con problemas no frena a los demás, y se pone al día solo si el backend estuvo caído:
 * cada comercio se evalúa contra el momento de su propio cierre, no contra la última corrida. Con
 * {@code comercio.reapertura.job-habilitado=false} (el perfil {@code test}) la corrida programada no hace nada y la
 * prueba lo dispara a pedido con {@link #reabrirComerciosVencidos(LocalDateTime)}.
 */
@Component
public class ReaperturaComerciosJob {

    private static final Logger log = LoggerFactory.getLogger(ReaperturaComerciosJob.class);

    private final ComercioRepository comercioRepository;
    private final CierreComercioService cierreComercioService;
    private final DisponibilidadComercioService disponibilidadComercioService;
    private final boolean habilitado;

    public ReaperturaComerciosJob(ComercioRepository comercioRepository, CierreComercioService cierreComercioService,
            DisponibilidadComercioService disponibilidadComercioService,
            @Value("${comercio.reapertura.job-habilitado:true}") boolean habilitado) {
        this.comercioRepository = comercioRepository;
        this.cierreComercioService = cierreComercioService;
        this.disponibilidadComercioService = disponibilidadComercioService;
        this.habilitado = habilitado;
    }

    @Scheduled(fixedDelay = 60_000)
    public void reabrirComerciosVencidos() {
        if (!habilitado) {
            return;
        }
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
