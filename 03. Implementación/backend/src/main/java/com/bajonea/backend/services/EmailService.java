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
        enviarTextoPlano(destinatario, "Tu código de verificación — Bajoneá",
                "¡Gracias por registrarte en Bajoneá!\n\n"
                        + "Tu código de verificación es: " + token + "\n\n"
                        + "Ingresá este código en la pantalla de verificación de la app para activar tu cuenta. "
                        + "El código vence en 24 horas y podés usarlo hasta 5 veces antes de que se invalide "
                        + "— si eso pasa, o si el código venció, podés pedir uno nuevo desde la misma pantalla.\n\n"
                        + "Si vos no solicitaste esta cuenta, podés ignorar este email: nadie va a poder "
                        + "activarla sin acceso a esta casilla.\n\n"
                        + "Equipo de Bajoneá");
    }

    public void enviarRecuperacionPassword(String destinatario, String token) {
        enviarTextoPlano(destinatario, "Tu código de recuperación de contraseña — Bajoneá",
                "Recibimos una solicitud para restablecer tu contraseña en Bajoneá.\n\n"
                        + "Tu código de recuperación es: " + token + "\n\n"
                        + "Ingresá este código en la pantalla de recuperación de contraseña de la app junto con "
                        + "tu nueva contraseña. El código vence en 30 minutos.\n\n"
                        + "Si vos no solicitaste este cambio, podés ignorar este email: tu contraseña actual "
                        + "sigue siendo válida.\n\n"
                        + "Equipo de Bajoneá");
    }

    public void enviarReactivacionCuenta(String destinatario, String token) {
        enviarTextoPlano(destinatario, "Tu código de reactivación de cuenta — Bajoneá",
                "Recibimos una solicitud para reactivar tu cuenta en Bajoneá.\n\n"
                        + "Tu código de reactivación es: " + token + "\n\n"
                        + "Ingresá este código en la pantalla de reactivación de cuenta de la app para volver a "
                        + "activarla. El código vence en 24 horas.\n\n"
                        + "Si vos no solicitaste esta reactivación, podés ignorar este email.\n\n"
                        + "Equipo de Bajoneá");
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
