package com.bajonea.backend.services;

import com.bajonea.backend.config.TurnoCierreProperties;
import com.bajonea.backend.enums.EstadoUsuario;
import com.bajonea.backend.repositories.CierreTurnoRepository;
import com.bajonea.backend.repositories.CierreTurnoRepository.CierrePorEnviar;
import com.bajonea.backend.services.ResumenTurnoMensajeBuilder.CierreParaMensaje;
import com.bajonea.backend.services.ResumenTurnoMensajeBuilder.Mensaje;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Fase de envío del cierre de turnos. No abre ninguna transacción propia: cada escritura es una sentencia por clave
 * primaria con la condición del estado que espera (la hace el repositorio en su transacción corta), y la llamada a
 * Resend se hace sin ninguna transacción ni bloqueo abiertos. Un Dueño que falla no frena a los demás. El envío es
 * "al menos una vez": si el proceso cae entre el reclamo y el resultado, la fila queda {@code ENVIANDO} y la
 * recuperación la devuelve a {@code PENDIENTE} pasados {@code email-envio-vencido-minutos}.
 */
@Service
public class CierreTurnoEnvioService {

    private static final Logger log = LoggerFactory.getLogger(CierreTurnoEnvioService.class);

    static final String MOTIVO_CUENTA_NO_ACTIVA = "La cuenta del Dueño no está activa";
    private static final int LARGO_MAXIMO_ERROR = 500;

    public record ResultadoEnvio(int mailsEnviados, int cierresEnviados, int cierresOmitidos, int cierresConFalla) {
    }

    private final CierreTurnoRepository cierreTurnoRepository;
    private final EmailService emailService;
    private final TurnoCierreProperties propiedades;
    private final TransactionTemplate transaccion;

    public CierreTurnoEnvioService(CierreTurnoRepository cierreTurnoRepository, EmailService emailService,
            TurnoCierreProperties propiedades, PlatformTransactionManager transactionManager) {
        this.cierreTurnoRepository = cierreTurnoRepository;
        this.emailService = emailService;
        this.propiedades = propiedades;
        this.transaccion = new TransactionTemplate(transactionManager);
    }

    public int recuperarEnviandoVencidos(LocalDateTime ahora) {
        LocalDateTime limite = ahora.minusMinutes(propiedades.getEmailEnvioVencidoMinutos());
        List<Integer> ids = cierreTurnoRepository.findIdsEnviandoDesde(limite);
        int recuperados = ids.isEmpty() ? 0 : transaccion.execute(estado -> {
            int total = 0;
            for (Integer id : ids) {
                total += cierreTurnoRepository.recuperarEnviando(id, limite);
            }
            return total;
        });
        if (recuperados > 0) {
            log.warn("Cierres de turno que estaban ENVIANDO desde hace más de {} minutos y volvieron a PENDIENTE: {}",
                    propiedades.getEmailEnvioVencidoMinutos(), recuperados);
        }
        return recuperados;
    }

    public ResultadoEnvio enviarPendientes(LocalDateTime ahora) {
        Map<Integer, List<CierrePorEnviar>> porDueno = new LinkedHashMap<>();
        for (CierrePorEnviar cierre : cierreTurnoRepository.findPorEnviar(ahora)) {
            porDueno.computeIfAbsent(cierre.getDuenoId(), id -> new ArrayList<>()).add(cierre);
        }
        int mails = 0;
        int enviados = 0;
        int omitidos = 0;
        int conFalla = 0;
        for (Map.Entry<Integer, List<CierrePorEnviar>> entrada : porDueno.entrySet()) {
            try {
                ResultadoEnvio parcial = enviarAlDueno(entrada.getValue(), ahora);
                mails += parcial.mailsEnviados();
                enviados += parcial.cierresEnviados();
                omitidos += parcial.cierresOmitidos();
                conFalla += parcial.cierresConFalla();
            } catch (RuntimeException e) {
                log.error("No se pudo procesar el envío del resumen de turno del Dueño {}", entrada.getKey(), e);
            }
        }
        return new ResultadoEnvio(mails, enviados, omitidos, conFalla);
    }

    private ResultadoEnvio enviarAlDueno(List<CierrePorEnviar> cierres, LocalDateTime ahora) {
        CierrePorEnviar primero = cierres.get(0);
        if (primero.getEstadoDueno() != EstadoUsuario.ACTIVO) {
            int omitidos = transaccion.execute(estado -> {
                int total = 0;
                for (CierrePorEnviar cierre : cierres) {
                    total += cierreTurnoRepository.omitir(cierre.getId(), MOTIVO_CUENTA_NO_ACTIVA);
                }
                return total;
            });
            return new ResultadoEnvio(0, 0, omitidos, 0);
        }

        List<CierrePorEnviar> reclamados = transaccion.execute(estado -> {
            List<CierrePorEnviar> propios = new ArrayList<>();
            for (CierrePorEnviar cierre : cierres) {
                if (cierreTurnoRepository.reclamar(cierre.getId(), ahora) == 1) {
                    propios.add(cierre);
                }
            }
            return propios;
        });
        if (reclamados.isEmpty()) {
            return new ResultadoEnvio(0, 0, 0, 0);
        }

        Mensaje mensaje = ResumenTurnoMensajeBuilder.armar(primero.getNombreDueno(), reclamados.stream()
                .map(c -> new CierreParaMensaje(c.getNombreComercio(), c.getTurnoFecha(), c.getHoraApertura(),
                        c.getHoraCierre(), c.getCantidadPedidos(), c.getVendido(), c.getComision(), c.getNeto(),
                        c.getPendientesAlCierre()))
                .toList());
        ResultadoEnvioEmail resultado = emailService.enviarResumenTurno(primero.getEmailDueno(), mensaje.asunto(),
                mensaje.cuerpo(), claveDeIdempotencia(reclamados));

        if (resultado.salio()) {
            int enviados = transaccion.execute(estado -> {
                int total = 0;
                for (CierrePorEnviar cierre : reclamados) {
                    total += cierreTurnoRepository.marcarEnviado(cierre.getId(), ahora);
                }
                return total;
            });
            return new ResultadoEnvio(1, enviados, 0, 0);
        }
        String error = recortar(resultado.error());
        transaccion.executeWithoutResult(estado -> {
            for (CierrePorEnviar cierre : reclamados) {
                int intentos = cierre.getEmailIntentos() + 1;
                if (intentos >= propiedades.getEmailIntentosMaximos()) {
                    cierreTurnoRepository.registrarFallaDefinitiva(cierre.getId(), intentos, error);
                    log.error("El resumen del cierre de turno {} (comercio {}) quedó FALLIDO tras {} intentos: {}", cierre.getId(),
                            cierre.getComercioId(), intentos, error);
                } else {
                    LocalDateTime proximo = ahora.plusMinutes(propiedades.retrocesoParaIntento(intentos));
                    cierreTurnoRepository.registrarFallaConReintento(cierre.getId(), intentos, proximo, error);
                    log.warn("El resumen del cierre de turno {} (comercio {}) falló en el intento {}; se reintenta a las {}: {}",
                            cierre.getId(), cierre.getComercioId(), intentos, proximo, error);
                }
            }
        });
        return new ResultadoEnvio(0, 0, 0, reclamados.size());
    }

    static String claveDeIdempotencia(List<CierrePorEnviar> reclamados) {
        String ids = reclamados.stream().map(CierrePorEnviar::getId).sorted().map(String::valueOf).collect(Collectors.joining("-"));
        int intentos = reclamados.stream().mapToInt(CierrePorEnviar::getEmailIntentos).max().orElse(0);
        return "cierre-turno-" + ids + "-i" + intentos;
    }

    private static String recortar(String error) {
        if (error == null) {
            return null;
        }
        return error.length() <= LARGO_MAXIMO_ERROR ? error : error.substring(0, LARGO_MAXIMO_ERROR);
    }
}
