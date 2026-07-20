package com.bajonea.backend.services;

import com.resend.Resend;
import com.resend.core.exception.ResendException;
import com.resend.services.emails.model.CreateEmailOptions;
import com.resend.services.emails.model.CreateEmailResponse;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

/**
 * Envío de emails transaccionales vía la API REST de Resend (Fase 10 — reemplaza a
 * Brevo/SMTP, ver docs/DECISIONES.md). El pulido general (HTML, branding) de las 3
 * plantillas queda fuera del alcance del MVP. El envío nunca relanza la excepción de
 * Resend: se loguea como advertencia en vez de fallar, porque
 * {@code RegistroService}/{@code AuthService} no deben perder el {@code Token} ya
 * persistido solo porque el correo no salió — el usuario puede reintentar el envío más
 * adelante sin que eso invalide el token generado.
 */
@Service
@RequiredArgsConstructor
public class EmailService {

    private static final Logger log = LoggerFactory.getLogger(EmailService.class);

    private final Resend resend;

    @Value("${mail.from}")
    private String remitente;

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
        CreateEmailOptions params = CreateEmailOptions.builder()
                .from(remitente)
                .to(destinatario)
                .subject(asunto)
                .text(cuerpo)
                .build();

        try {
            CreateEmailResponse respuesta = resend.emails().send(params);
            log.info("Email enviado a {} (Resend id: {})", destinatario, respuesta.getId());
        } catch (ResendException | RuntimeException ex) {
            log.warn("No se pudo enviar el email a {}: {}", destinatario, ex.getMessage());
        }
    }
}
