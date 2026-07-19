package com.bajonea.backend.services;

import jakarta.mail.internet.MimeMessage;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.stereotype.Service;

/**
 * Envío de emails transaccionales vía SMTP, usando el {@code JavaMailSender} autoconfigurado
 * por {@code spring-boot-starter-mail} a partir de {@code spring.mail.*} en
 * application.properties (Fase 1). El pulido general (HTML, branding) de las 3 plantillas
 * queda para la Fase 10, que sigue pendiente en CLAUDE.md. Hasta que se configuren
 * credenciales SMTP reales, el envío se loguea como advertencia en vez de fallar:
 * {@code RegistroService}/{@code AuthService} no deben perder el {@code Token} ya persistido
 * solo porque el correo no salió — el usuario puede reintentar el envío más adelante sin que
 * eso invalide el token generado.
 */
@Service
@RequiredArgsConstructor
public class EmailService {

    private static final Logger log = LoggerFactory.getLogger(EmailService.class);

    private final JavaMailSender mailSender;

    public void enviarVerificacion(String destinatario, String token) {
        enviarTextoPlano(destinatario, "Verificación de cuenta — Bajoneá",
                "Usá este token para verificar tu cuenta (válido 24 horas): " + token);
    }

    public void enviarRecuperacionPassword(String destinatario, String token) {
        enviarTextoPlano(destinatario, "Recuperación de contraseña — Bajoneá",
                "Usá este token para restablecer tu contraseña (válido 30 minutos): " + token);
    }

    public void enviarReactivacionCuenta(String destinatario, String token) {
        enviarTextoPlano(destinatario, "Reactivación de cuenta — Bajoneá",
                "Usá este token para reactivar tu cuenta (válido 24 horas): " + token);
    }

    private void enviarTextoPlano(String destinatario, String asunto, String cuerpo) {
        try {
            MimeMessage mensaje = mailSender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(mensaje, "UTF-8");
            helper.setTo(destinatario);
            helper.setSubject(asunto);
            helper.setText(cuerpo);
            mailSender.send(mensaje);
        } catch (Exception ex) {
            log.warn("No se pudo enviar el email a {} (SMTP real pendiente de Fase 10): {}", destinatario,
                    ex.getMessage());
        }
    }
}
