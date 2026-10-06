package com.bajonea.backend.config;

import java.time.Clock;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Reloj del sistema como bean, para que los servicios que lo inyectan (invitaciones de empleado) se puedan
 * probar con una hora controlable. Misma zona que {@code LocalDateTime.now()}, la de la JVM.
 */
@Configuration
public class ClockConfig {

    @Bean
    public Clock clock() {
        return Clock.systemDefaultZone();
    }
}
