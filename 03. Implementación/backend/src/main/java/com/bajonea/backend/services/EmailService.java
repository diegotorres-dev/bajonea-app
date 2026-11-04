package com.bajonea.backend.services;

import com.bajonea.backend.enums.MotivoRegularizacionInvitacion;
import com.bajonea.backend.util.SoporteEnlaces;
import com.resend.Resend;
import com.resend.core.exception.ResendException;
import com.resend.core.net.RequestOptions;
import com.resend.services.emails.model.CreateEmailOptions;
import com.resend.services.emails.model.CreateEmailResponse;
import java.math.BigDecimal;
import java.util.concurrent.atomic.AtomicInteger;
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
 * <p>
 * Con {@code email.envio-habilitado=false} (el perfil {@code test}) no se llama a Resend: se
 * registra en el log el destinatario y el asunto, nunca el cuerpo, que lleva el código o el
 * token. Por defecto el envío está habilitado.
 */
@Service
@RequiredArgsConstructor
public class EmailService {

    private static final Logger log = LoggerFactory.getLogger(EmailService.class);

    private final Resend resend;

    private final AtomicInteger fallasSimuladas = new AtomicInteger();

    private final AtomicInteger fallasSimuladasAvisoCuenta = new AtomicInteger();

    private final AtomicInteger fallasSimuladasSoporte = new AtomicInteger();

    @Value("${mail.from}")
    private String remitente;

    @Value("${email.envio-habilitado:true}")
    private boolean envioHabilitado;

    @Value("${app.frontend-base-url:http://localhost:5501}")
    private String frontendBaseUrl;

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

    /**
     * Invitación a trabajar en un comercio. Lleva el código y un enlace genérico a la pantalla de aceptación
     * (sin el código ni el email en la URL). El asunto incluye el nombre del Dueño y el del comercio, así que
     * con el envío deshabilitado esos dos datos quedan en el log, pero nunca el código (que va solo en el cuerpo).
     */
    public void enviarInvitacionEmpleado(String destinatario, String nombreDueno, String nombreComercio, String codigo) {
        enviarTextoPlano(destinatario, nombreDueno + " te invitó a trabajar en " + nombreComercio,
                "Hola,\n\n"
                        + nombreDueno + " te invitó a sumarte al equipo de " + nombreComercio + " en Bajoneá. "
                        + "Con tu cuenta vas a poder gestionar sus productos y pedidos.\n\n"
                        + "Tu código: " + codigo + "\n"
                        + "Vence en 7 días.\n\n"
                        + "Cómo aceptarla:\n"
                        + "1. Entrá a " + frontendBaseUrl + "/invitacion-empleado.html\n"
                        + "2. Ingresá este email y el código.\n"
                        + "3. Si todavía no tenés cuenta, completá tus datos.\n\n"
                        + "También podés abrir Bajoneá y tocar «Tengo una invitación» en la pantalla de inicio de sesión.\n\n"
                        + "Si no esperabas este mensaje, ignoralo.");
    }

    /**
     * Aviso a una cuenta existente que no se pudo invitar porque no está en condiciones de aceptar. Nombra solo
     * al comercio, nunca a quien lo invitó.
     */
    public void enviarRegularizacionInvitacion(String destinatario, MotivoRegularizacionInvitacion motivo, String nombreComercio) {
        enviarTextoPlano(destinatario, "Un comercio quiso invitarte a trabajar en Bajoneá",
                nombreComercio + " quiso invitarte a su equipo en Bajoneá, pero no pudimos enviarte la invitación "
                        + "porque " + motivo.getMotivo() + ".\n\n"
                        + motivo.getAccion() + "\n\n"
                        + "Después, pedile al comercio que te invite de nuevo.\n\n"
                        + "Si no esperabas este mensaje, ignoralo.");
    }

    /**
     * Resumen del cierre de un turno al Dueño. A diferencia de los demás emails devuelve el resultado, para que el
     * proceso que lo envía pueda reintentar: nunca relanza la excepción de Resend. {@code idempotencyKey} viaja
     * como cabecera {@code Idempotency-Key}. Con el envío deshabilitado (perfil {@code test}) no llama a Resend y
     * responde {@code DESHABILITADO}, salvo que la prueba haya pedido fallas simuladas con
     * {@link #simularFallasDeResumenTurno(int)}. Registra destinatario y asunto, nunca el cuerpo.
     */
    public ResultadoEnvioEmail enviarResumenTurno(String destinatario, String asunto, String cuerpo, String idempotencyKey) {
        if (!envioHabilitado && fallasSimuladas.getAndUpdate(restantes -> restantes > 0 ? restantes - 1 : 0) > 0) {
            log.warn("Falla simulada del envío del resumen de turno a {} (asunto \"{}\")", destinatario, asunto);
            return ResultadoEnvioEmail.fallido(503, "Falla simulada");
        }
        return enviar(destinatario, asunto, cuerpo, idempotencyKey);
    }

    /**
     * Aviso de que la cuenta fue suspendida, con el motivo que cargó el Administrador. Un solo intento, sin
     * reintento automático: devuelve el resultado para que quien lo envía deje constancia de si salió o falló y un
     * Administrador pueda reenviarlo. La persona suspendida no puede ver la app, así que este mail es su canal.
     */
    public ResultadoEnvioEmail enviarCuentaSuspendida(String destinatario, String motivo) {
        return enviarAvisoDeCuenta(destinatario, "Tu cuenta de Bajoneá fue suspendida",
                "Tu cuenta de Bajoneá fue suspendida.\n\n"
                        + "Motivo: " + motivo + "\n\n"
                        + "Mientras la cuenta esté suspendida no vas a poder iniciar sesión ni hacer pedidos. "
                        + "Los pedidos que ya pagaste siguen su curso normal y los que todavía no pagaste se cancelaron.\n\n"
                        + "Equipo de Bajoneá");
    }

    public ResultadoEnvioEmail enviarSuspensionLevantada(String destinatario, String motivo) {
        String detalle = motivo == null || motivo.isBlank() ? "" : "Mensaje del equipo: " + motivo + "\n\n";
        return enviarAvisoDeCuenta(destinatario, "Tu cuenta de Bajoneá volvió a estar activa",
                "Levantamos la suspensión de tu cuenta de Bajoneá. Ya podés iniciar sesión de nuevo.\n\n"
                        + detalle
                        + "Equipo de Bajoneá");
    }

    public ResultadoEnvioEmail enviarDuenoSuspendido(String destinatario, String motivo, java.util.List<String> comercios) {
        String detalleComercios = comercios.isEmpty()
                ? "Todavía no tenías comercios aprobados, así que no se suspendió ninguno.\n\n"
                : "Se suspendieron tus comercios: " + String.join(", ", comercios) + ".\n\n"
                        + "Mientras estén suspendidos no aparecen en el catálogo ni reciben pedidos nuevos.\n\n";
        return enviarAvisoDeCuenta(destinatario, "Tu cuenta de Bajoneá fue suspendida",
                "Tu cuenta de Bajoneá fue suspendida.\n\n"
                        + "Motivo: " + motivo + "\n\n"
                        + detalleComercios
                        + "Mientras la cuenta esté suspendida no vas a poder iniciar sesión. "
                        + "Los pedidos que ya estaban en preparación los atiende tu equipo, si tenés Empleados; "
                        + "si no, se cancelan y se devuelve el dinero a tus clientes.\n\n"
                        + "Equipo de Bajoneá");
    }

    public ResultadoEnvioEmail enviarDuenoSuspensionLevantada(String destinatario, String motivo,
            java.util.List<String> restaurados, java.util.List<String> siguenSuspendidos) {
        String detalle = motivo == null || motivo.isBlank() ? "" : "Mensaje del equipo: " + motivo + "\n\n";
        String volvieron = restaurados.isEmpty() ? "" : "Volvieron a operar: " + String.join(", ", restaurados) + ".\n\n";
        String siguen = siguenSuspendidos.isEmpty() ? ""
                : "Siguen suspendidos por separado: " + String.join(", ", siguenSuspendidos) + ".\n\n";
        return enviarAvisoDeCuenta(destinatario, "Tu cuenta de Bajoneá volvió a estar activa",
                "Levantamos la suspensión de tu cuenta de Bajoneá. Ya podés iniciar sesión de nuevo.\n\n"
                        + volvieron
                        + siguen
                        + detalle
                        + "Equipo de Bajoneá");
    }

    public ResultadoEnvioEmail enviarComercioSuspendido(String destinatario, String nombreComercio, String motivo) {
        return enviarAvisoDeCuenta(destinatario, "Tu comercio " + nombreComercio + " fue suspendido",
                "Tu comercio " + nombreComercio + " fue suspendido en Bajoneá.\n\n"
                        + "Motivo: " + motivo + "\n\n"
                        + "Mientras esté suspendido no aparece en el catálogo ni recibe pedidos nuevos, y no podés cambiar "
                        + "sus productos ni sus datos. Podés seguir viendo tus pedidos, tus estadísticas y tus documentos.\n\n"
                        + "Equipo de Bajoneá");
    }

    public ResultadoEnvioEmail enviarComercioSuspensionLevantada(String destinatario, String nombreComercio, String motivo) {
        String detalle = motivo == null || motivo.isBlank() ? "" : "Mensaje del equipo: " + motivo + "\n\n";
        return enviarAvisoDeCuenta(destinatario, "Levantamos la suspensión de tu comercio " + nombreComercio,
                "Levantamos la suspensión de tu comercio " + nombreComercio + " en Bajoneá.\n\n"
                        + detalle
                        + "Equipo de Bajoneá");
    }

    /**
     * Email al Cliente cuando se resuelve su reclamo (un solo intento, sin reintento automático): si se aprobó dice el
     * monto que se le devuelve y que puede tardar unos días en acreditarse; si se rechazó, el motivo.
     */
    public ResultadoEnvioEmail enviarReclamoResuelto(String destinatario, Integer pedidoId, boolean aprobado, BigDecimal monto,
            String motivoRechazo) {
        if (aprobado) {
            return enviar(destinatario, "Aprobamos tu reclamo del pedido #" + pedidoId + " — Bajoneá",
                    "Revisamos tu reclamo del pedido #" + pedidoId + " y lo aprobamos.\n\n"
                            + "Te vamos a devolver " + ResumenTurnoMensajeBuilder.monto(monto) + ". "
                            + "El reembolso puede tardar unos días en acreditarse, según tu medio de pago.\n\n"
                            + "Equipo de Bajoneá", null);
        }
        return enviar(destinatario, "Resolvimos tu reclamo del pedido #" + pedidoId + " — Bajoneá",
                "Revisamos tu reclamo del pedido #" + pedidoId + " y no pudimos aprobarlo.\n\n"
                        + "Motivo: " + motivoRechazo + "\n\n"
                        + "Equipo de Bajoneá", null);
    }

    /**
     * Emails del módulo de Soporte. A diferencia de los demás no registran el destinatario ni el asunto en el log (el
     * destinatario es el email de quien consulta y los códigos van en el cuerpo): solo queda constancia de si salió o falló.
     * Devuelven el resultado para que quien los envía pueda dejar marcado si el email salió. Cada uno es un solo intento,
     * sin reintento automático. El enlace "Ver mi consulta" lleva el código y el email en el fragmento de la URL.
     */
    public ResultadoEnvioEmail enviarSoporteConsultaRecibida(String destinatario, String codigo) {
        return enviarSoporte(destinatario, "Recibimos tu consulta — Bajoneá",
                "Recibimos tu consulta y vamos a responderte lo antes posible.\n\n"
                        + "El código de tu consulta es: " + codigo + "\n\n"
                        + "Ver mi consulta: " + SoporteEnlaces.enlaceConsulta(frontendBaseUrl, codigo, destinatario) + "\n\n"
                        + "Guardá el código: con tu email y ese código podés ver la respuesta y seguir la conversación "
                        + "aunque no puedas iniciar sesión.\n\n"
                        + "Equipo de Bajoneá");
    }

    public ResultadoEnvioEmail enviarSoporteRespuesta(String destinatario, String codigo) {
        return enviarSoporte(destinatario, "Soporte respondió tu consulta — Bajoneá",
                "Soporte respondió tu consulta " + codigo + ".\n\n"
                        + "Ver mi consulta: " + SoporteEnlaces.enlaceConsulta(frontendBaseUrl, codigo, destinatario) + "\n\n"
                        + "Equipo de Bajoneá");
    }

    public ResultadoEnvioEmail enviarSoporteCodigos(String destinatario, java.util.List<String> codigos) {
        StringBuilder lista = new StringBuilder();
        for (String codigo : codigos) {
            lista.append(codigo).append(": ").append(SoporteEnlaces.enlaceConsulta(frontendBaseUrl, codigo, destinatario)).append("\n");
        }
        return enviarSoporte(destinatario, "Tus códigos de consulta — Bajoneá",
                "Estos son los códigos de tus consultas abiertas en Bajoneá:\n\n"
                        + lista + "\n"
                        + "Con tu email y el código podés ver la respuesta y seguir la conversación.\n\n"
                        + "Si no pediste este email, podés ignorarlo.\n\n"
                        + "Equipo de Bajoneá");
    }

    private ResultadoEnvioEmail enviarSoporte(String destinatario, String asunto, String cuerpo) {
        if (!envioHabilitado && fallasSimuladasSoporte.getAndUpdate(restantes -> restantes > 0 ? restantes - 1 : 0) > 0) {
            log.warn("Falla simulada del envío de un email de Soporte");
            return ResultadoEnvioEmail.fallido(503, "Falla simulada");
        }
        return enviar(destinatario, asunto, cuerpo, null, false);
    }

    public void simularFallasDeSoporte(int cantidad) {
        fallasSimuladasSoporte.set(Math.max(cantidad, 0));
    }

    private ResultadoEnvioEmail enviarAvisoDeCuenta(String destinatario, String asunto, String cuerpo) {
        if (!envioHabilitado && fallasSimuladasAvisoCuenta.getAndUpdate(restantes -> restantes > 0 ? restantes - 1 : 0) > 0) {
            log.warn("Falla simulada del envío del aviso de cuenta a {} (asunto \"{}\")", destinatario, asunto);
            return ResultadoEnvioEmail.fallido(503, "Falla simulada");
        }
        return enviar(destinatario, asunto, cuerpo, null);
    }

    public void simularFallasDeAvisoCuenta(int cantidad) {
        fallasSimuladasAvisoCuenta.set(Math.max(cantidad, 0));
    }

    public void simularFallasDeResumenTurno(int cantidad) {
        fallasSimuladas.set(Math.max(cantidad, 0));
    }

    public int fallasSimuladasRestantes() {
        return fallasSimuladas.get();
    }

    private void enviarTextoPlano(String destinatario, String asunto, String cuerpo) {
        enviar(destinatario, asunto, cuerpo, null);
    }

    private ResultadoEnvioEmail enviar(String destinatario, String asunto, String cuerpo, String idempotencyKey) {
        return enviar(destinatario, asunto, cuerpo, idempotencyKey, true);
    }

    private ResultadoEnvioEmail enviar(String destinatario, String asunto, String cuerpo, String idempotencyKey,
            boolean registrarDestinatario) {
        if (!envioHabilitado) {
            if (registrarDestinatario) {
                log.info("Envío de email deshabilitado (email.envio-habilitado=false): no se envía a {} el asunto \"{}\"",
                        destinatario, asunto);
            } else {
                log.info("Envío de email deshabilitado (email.envio-habilitado=false): no se envía un email de Soporte");
            }
            return ResultadoEnvioEmail.deshabilitado();
        }

        CreateEmailOptions params = CreateEmailOptions.builder()
                .from(remitente)
                .to(destinatario)
                .subject(asunto)
                .text(cuerpo)
                .build();

        try {
            CreateEmailResponse respuesta = idempotencyKey == null
                    ? resend.emails().send(params)
                    : resend.emails().send(params, RequestOptions.builder().setIdempotencyKey(idempotencyKey).build());
            if (registrarDestinatario) {
                log.info("Email enviado a {} (Resend id: {})", destinatario, respuesta.getId());
            } else {
                log.info("Email de Soporte enviado (Resend id: {})", respuesta.getId());
            }
            return ResultadoEnvioEmail.enviado(respuesta.getId());
        } catch (ResendException ex) {
            if (registrarDestinatario) {
                log.warn("No se pudo enviar el email a {}: {}", destinatario, ex.getMessage());
            } else {
                log.warn("No se pudo enviar un email de Soporte: {}", descripcion(ex));
            }
            return ResultadoEnvioEmail.fallido(ex.getStatusCode(), descripcion(ex));
        } catch (RuntimeException ex) {
            if (registrarDestinatario) {
                log.warn("No se pudo enviar el email a {}: {}", destinatario, ex.getMessage());
            } else {
                log.warn("No se pudo enviar un email de Soporte: {}", ex.getClass().getSimpleName());
            }
            return ResultadoEnvioEmail.fallido(null, ex.getClass().getSimpleName());
        }
    }

    private static String descripcion(ResendException ex) {
        String nombre = ex.getErrorName() != null ? ex.getErrorName() : "ResendException";
        return ex.getStatusCode() == null ? nombre : ex.getStatusCode() + " " + nombre;
    }
}
