package com.bajonea.backend.config;

import java.time.Clock;
import java.time.DateTimeException;
import java.time.ZoneId;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Reloj único de la aplicación, en la zona de {@code app.zona-horaria} (por defecto
 * {@code America/Argentina/Ushuaia}, UTC-03:00), sin importar la zona de la JVM ni la del servidor. Toda hora
 * que se guarda y se compara contra otra guardada (historiales, plazos de pedidos, invitaciones, horarios de los
 * comercios) sale de este bean. Una zona inválida impide arrancar.
 */
@Configuration
public class ClockConfig {

    public static final String ZONA_POR_DEFECTO = "America/Argentina/Ushuaia";

    @Bean
    public Clock clock(@Value("${app.zona-horaria:" + ZONA_POR_DEFECTO + "}") String zona) {
        return Clock.system(zonaDe(zona));
    }

    static ZoneId zonaDe(String zona) {
        try {
            return ZoneId.of(zona == null ? "" : zona.trim());
        } catch (DateTimeException e) {
            throw new IllegalStateException("La zona horaria configurada en app.zona-horaria no es válida: '" + zona + "'", e);
        }
    }
}
