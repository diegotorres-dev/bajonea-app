package com.bajonea.backend.services;

import com.bajonea.backend.services.CierreTurnoService.CandidatoCierre;
import com.bajonea.backend.services.CierreTurnoService.ResultadoCierre;
import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Cierre de turnos y envío del resumen al Dueño, cada 60 segundos. Cada corrida tiene dos fases independientes: cerrar
 * los turnos terminados ({@link CierreTurnoService}, un comercio y un turno por transacción) y enviar los mails en
 * cola ({@link CierreTurnoEnvioService}, sin transacciones abiertas). Una falla en una fase o en un comercio se
 * registra y no frena a lo demás. Con {@code turno.cierre.job-habilitado=false} (el perfil {@code test}) la corrida
 * programada no hace nada y la prueba la dispara a pedido con {@link #abrirYCerrarTurnos(LocalDateTime)}.
 */
@Component
public class CierreTurnoJob {

    private static final Logger log = LoggerFactory.getLogger(CierreTurnoJob.class);

    public record ResultadoCorrida(int cierresCreados, int cierresDiferidos, int cierresRecuperados, int mailsEnviados,
            int cierresEnviados, int cierresOmitidos, int cierresConFalla) {
    }

    private final CierreTurnoService cierreTurnoService;
    private final CierreTurnoEnvioService envioService;
    private final DisponibilidadComercioService disponibilidadComercioService;
    private final boolean habilitado;

    public CierreTurnoJob(CierreTurnoService cierreTurnoService, CierreTurnoEnvioService envioService,
            DisponibilidadComercioService disponibilidadComercioService,
            @Value("${turno.cierre.job-habilitado:true}") boolean habilitado) {
        this.cierreTurnoService = cierreTurnoService;
        this.envioService = envioService;
        this.disponibilidadComercioService = disponibilidadComercioService;
        this.habilitado = habilitado;
    }

    @Scheduled(fixedDelay = 60_000)
    public void abrirYCerrarTurnos() {
        if (!habilitado) {
            return;
        }
        try {
            abrirYCerrarTurnos(disponibilidadComercioService.ahora());
        } catch (RuntimeException e) {
            log.error("No se pudo completar la corrida de cierre de turnos", e);
        }
    }

    public ResultadoCorrida abrirYCerrarTurnos(LocalDateTime ahora) {
        long inicio = System.nanoTime();
        int creados = 0;
        int diferidos = 0;
        try {
            Map<Integer, List<CandidatoCierre>> porComercio = new LinkedHashMap<>();
            for (CandidatoCierre candidato : cierreTurnoService.candidatos(ahora)) {
                porComercio.computeIfAbsent(candidato.comercioId(), id -> new java.util.ArrayList<>()).add(candidato);
            }
            for (Map.Entry<Integer, List<CandidatoCierre>> entrada : porComercio.entrySet()) {
                for (CandidatoCierre candidato : entrada.getValue()) {
                    try {
                        ResultadoCierre resultado = cierreTurnoService.cerrar(candidato, ahora);
                        if (resultado == ResultadoCierre.DIFERIDO) {
                            diferidos++;
                            break;
                        }
                        if (resultado == ResultadoCierre.CERRADO) {
                            creados++;
                        }
                    } catch (RuntimeException e) {
                        log.error("No se pudo cerrar el turno {} del comercio {}", candidato.turno().inicio(), candidato.comercioId(), e);
                        break;
                    }
                }
            }
        } catch (RuntimeException e) {
            log.error("No se pudieron calcular los turnos a cerrar", e);
        }

        long finDeCierres = System.nanoTime();
        int recuperados = 0;
        CierreTurnoEnvioService.ResultadoEnvio envio = new CierreTurnoEnvioService.ResultadoEnvio(0, 0, 0, 0);
        try {
            recuperados = envioService.recuperarEnviandoVencidos(ahora);
            envio = envioService.enviarPendientes(ahora);
        } catch (RuntimeException e) {
            log.error("No se pudo completar el envío de los resúmenes de turno", e);
        }

        ResultadoCorrida resultado = new ResultadoCorrida(creados, diferidos, recuperados, envio.mailsEnviados(),
                envio.cierresEnviados(), envio.cierresOmitidos(), envio.cierresConFalla());
        if (creados > 0 || envio.mailsEnviados() > 0 || envio.cierresConFalla() > 0) {
            log.info("Cierre de turnos: {} (cierres {} ms, envíos {} ms)", resultado, (finDeCierres - inicio) / 1_000_000,
                    (System.nanoTime() - finDeCierres) / 1_000_000);
        }
        return resultado;
    }
}
