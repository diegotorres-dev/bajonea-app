package com.bajonea.backend.services;

import com.bajonea.backend.config.SoporteProperties;
import com.bajonea.backend.repositories.SoporteLimiteRepository;
import com.bajonea.backend.repositories.SoporteLimiteRepository.Contador;
import java.time.Duration;
import java.time.LocalDateTime;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * Límites del módulo de Soporte. Todo contador es una fila de {@code soporte_limite} que se bloquea con
 * {@code SELECT ... FOR UPDATE} antes de contar o decidir, siempre la del email y después la de la IP (nunca al revés), así
 * que dos pedidos del mismo email o de la misma IP corren de a uno y ninguno ve un conteo viejo: es el reemplazo del
 * índice único parcial que MariaDB 10.4 no tiene. Posición en el orden global de bloqueos: usuario, ..., y después estas
 * filas, antes de la fila de la consulta ({@code ticket_soporte}); ningún flujo toma una fila de contador estando con una
 * consulta bloqueada.
 *
 * <p>Los métodos son {@code MANDATORY}: los llama el servicio de Soporte dentro de su transacción, y las filas quedan
 * bloqueadas hasta que esa transacción termina. Ningún método lanza una excepción por un límite superado: devuelven el
 * resultado y el servicio decide después del commit, para que la transacción nunca se revierta con filas de contador
 * recién insertadas (tres transacciones esperando la misma clave nueva se interbloquean si la primera se revierte).
 */
@Service
@RequiredArgsConstructor
public class SoporteLimiteService {

    private final SoporteLimiteRepository repositorio;
    private final SoporteProperties propiedades;

    /** Contadores bloqueados de los intentos fallidos de acceso de un email y de una IP. */
    public record AccesoIntentos(boolean bloqueado, String claveEmail, Contador email, String claveIp, Contador ip) {
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public void bloquearCreacion(String email, String ip, LocalDateTime ahora) {
        repositorio.bloquear("CREAR_EMAIL|" + email, ahora);
        repositorio.bloquear("CREAR_IP|" + ip, ahora);
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public AccesoIntentos bloquearIntentos(String email, String ip, LocalDateTime ahora) {
        String claveEmail = "INTENTO_EMAIL|" + email;
        String claveIp = "INTENTO_IP|" + ip;
        Contador contadorEmail = repositorio.bloquear(claveEmail, ahora);
        Contador contadorIp = repositorio.bloquear(claveIp, ahora);
        Duration ventana = Duration.ofMinutes(propiedades.getVentanaIntentosMinutos());
        boolean bloqueado = superado(contadorEmail, propiedades.getIntentosFallidosPorHoraEmail(), ventana, ahora)
                || superado(contadorIp, propiedades.getIntentosFallidosPorHoraIp(), ventana, ahora);
        return new AccesoIntentos(bloqueado, claveEmail, contadorEmail, claveIp, contadorIp);
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public void registrarFallo(AccesoIntentos acceso, LocalDateTime ahora) {
        Duration ventana = Duration.ofMinutes(propiedades.getVentanaIntentosMinutos());
        sumar(acceso.claveEmail(), acceso.email(), ventana, ahora);
        sumar(acceso.claveIp(), acceso.ip(), ventana, ahora);
    }

    /**
     * Cuenta un pedido de reenvío de códigos contra el email y contra la IP. Cuenta todos, haya o no consultas con ese
     * email, para que superar el límite no revele nada. Devuelve {@code false} si alguno de los dos ya llegó al máximo.
     */
    @Transactional(propagation = Propagation.MANDATORY)
    public boolean intentarReenvio(String email, String ip, LocalDateTime ahora) {
        String claveEmail = "REENVIO_EMAIL|" + email;
        String claveIp = "REENVIO_IP|" + ip;
        Contador contadorEmail = repositorio.bloquear(claveEmail, ahora);
        Contador contadorIp = repositorio.bloquear(claveIp, ahora);
        Duration ventana = Duration.ofMinutes(propiedades.getVentanaIntentosMinutos());
        if (superado(contadorEmail, propiedades.getReenviosPorHoraEmail(), ventana, ahora)
                || superado(contadorIp, propiedades.getReenviosPorHoraIp(), ventana, ahora)) {
            return false;
        }
        sumar(claveEmail, contadorEmail, ventana, ahora);
        sumar(claveIp, contadorIp, ventana, ahora);
        return true;
    }

    private static boolean superado(Contador contador, int maximo, Duration ventana, LocalDateTime ahora) {
        return vigente(contador, ventana, ahora) && contador.cantidad() >= maximo;
    }

    private static boolean vigente(Contador contador, Duration ventana, LocalDateTime ahora) {
        return ahora.isBefore(contador.ventanaInicio().plus(ventana));
    }

    private void sumar(String clave, Contador contador, Duration ventana, LocalDateTime ahora) {
        if (vigente(contador, ventana, ahora) && contador.cantidad() > 0) {
            repositorio.actualizar(clave, contador.cantidad() + 1, contador.ventanaInicio());
        } else {
            repositorio.actualizar(clave, 1, ahora);
        }
    }
}
