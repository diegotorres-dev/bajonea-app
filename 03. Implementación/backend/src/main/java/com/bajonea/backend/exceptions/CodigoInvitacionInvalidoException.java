package com.bajonea.backend.exceptions;

/**
 * Código de invitación de empleado incorrecto, vencido, reemplazado, cancelado o invalidado, o email sin
 * invitación pendiente. Mapea a {@code 401} (hereda de {@link CredencialesInvalidasException}) con un mensaje
 * único para todos esos casos, para no revelar si existe una invitación para ese email. Existe como subclase
 * propia para poder declararla en {@code noRollbackFor} de los servicios que cuentan el intento fallido sin
 * ampliar la regla a todas las credenciales inválidas.
 */
public class CodigoInvitacionInvalidoException extends CredencialesInvalidasException {

    public static final String MENSAJE =
            "El código es incorrecto o la invitación ya no está vigente. Pedí que te reenvíen la invitación.";

    public CodigoInvitacionInvalidoException() {
        super(MENSAJE);
    }
}
