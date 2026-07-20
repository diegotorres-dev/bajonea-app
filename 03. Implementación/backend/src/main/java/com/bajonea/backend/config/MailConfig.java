package com.bajonea.backend.config;

import com.resend.Resend;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Bean del cliente de Resend con la API key, mismo patrón que {@code CloudinaryConfig}.
 * Reemplaza a Brevo/SMTP (Fase 10, ver docs/DECISIONES.md) — {@code EmailService} ya no
 * depende de {@code JavaMailSender}.
 */
@Configuration
public class MailConfig {

    @Bean
    public Resend resend(@Value("${resend.api-key}") String apiKey) {
        return new Resend(apiKey);
    }
}
